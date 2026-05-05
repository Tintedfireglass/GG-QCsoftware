using System.Text.RegularExpressions;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;

namespace Pramaan.CLI.Diagnostics;

/// <summary>
/// Linux implementation of ISmartTestService using the smartctl CLI tool.
/// Mirrors SmartTestService.cs (Windows) in behaviour:
///   - QuickHealthCheck(): scans all drives, reads SMART health + temperature
///   - RunShortTestAsync(): starts a short self-test and polls for completion
/// </summary>
public class LinuxSmartTestService : ISmartTestService
{
    private readonly string _smartctlPath;

    public LinuxSmartTestService()
    {
        // Check for bundled smartctl first, then fallback to system paths
        string localPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smartctl-linux-x64");
        string localPathGeneric = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smartctl");

        _smartctlPath = File.Exists(localPath) ? localPath
                      : File.Exists(localPathGeneric) ? localPathGeneric
                      : File.Exists("/usr/bin/smartctl") ? "/usr/bin/smartctl"
                      : File.Exists("/usr/local/bin/smartctl") ? "/usr/local/bin/smartctl"
                      : "smartctl";
    }

    // ── ISmartTestService ────────────────────────────────────────

    public bool IsAvailable
    {
        get
        {
            try
            {
                var out_ = LinuxCommandRunner.TryRun(_smartctlPath, "--version", 5000);
                return out_.Contains("smartctl");
            }
            catch { return false; }
        }
    }

    /// <summary>
    /// Returns all drives that smartctl can see (excludes loop/ram devices).
    /// </summary>
    public List<SmartDriveInfo> GetTestableDevices()
    {
        var devices = new List<SmartDriveInfo>();

        try
        {
            var scanOut = LinuxCommandRunner.TryRun(_smartctlPath, "--scan");
            foreach (var line in scanOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                // Format:  /dev/sda -d scsi # /dev/sda, SCSI device
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 0) continue;

                var devPath = parts[0].Trim();
                if (string.IsNullOrWhiteSpace(devPath)) continue;
                // Skip loop and ram devices
                if (devPath.Contains("/loop") || devPath.Contains("/ram")) continue;

                var info = BuildDriveInfo(devPath);
                if (info != null)
                    devices.Add(info);
            }
        }
        catch { /* Return whatever we got */ }

        return devices;
    }

    public SmartDriveInfo? GetDeviceInfo(string devicePath)
        => BuildDriveInfo(devicePath);

    /// <summary>
    /// Performs a quick SMART health check — no self-test, just attribute read.
    /// </summary>
    public SmartHealthCheckResult QuickHealthCheck()
    {
        var result = new SmartHealthCheckResult
        {
            CheckTime = DateTime.Now,
            SmartctlAvailable = IsAvailable
        };

        if (!result.SmartctlAvailable)
        {
            result.OverallHealthy = false;
            result.Message = "smartctl not found. Install smartmontools (sudo apt install smartmontools).";
            return result;
        }

        var devices = GetTestableDevices();
        result.Devices = devices;

        if (devices.Count == 0)
        {
            result.OverallHealthy = true;
            result.Message = "No SMART-capable drives found";
            return result;
        }

        bool allHealthy = devices.All(d => d.HealthPassed);
        bool anyFailing = devices.Any(d => !d.HealthPassed || d.HealthScore < 50);

        result.OverallHealthy = allHealthy;
        if (anyFailing)
            result.Message = "One or more drives have critical SMART issues!";
        else if (!allHealthy)
            result.Message = "Some drives have SMART warnings — review recommended";
        else
            result.Message = $"All {devices.Count} drive(s) healthy";

        return result;
    }

    /// <summary>
    /// Starts a SMART short self-test and polls until complete or timeout.
    /// Short test typically completes in 1–2 minutes.
    /// </summary>
    public async Task<SmartTestResultInfo> RunShortTestAsync(
        string devicePath,
        IProgress<SmartTestProgress>? progress = null,
        string? deviceType = null)
    {
        var result = new SmartTestResultInfo
        {
            DevicePath = devicePath,
            TestType   = "Short",
            StartTime  = DateTime.Now
        };

        // Start the test (requires sudo)
        var startOut = LinuxCommandRunner.TryRun(_smartctlPath, $"-t short {devicePath}");
        if (startOut.Contains("error", StringComparison.OrdinalIgnoreCase) ||
            startOut.Contains("Unable to", StringComparison.OrdinalIgnoreCase) ||
            startOut.Contains("failed to", StringComparison.OrdinalIgnoreCase))
        {
            // Distinguish inconclusive vs hard failure
            result.Success = false;
            result.Message = ExtractSmartError(startOut);
            result.EndTime = DateTime.Now;
            return result;
        }

        if (string.IsNullOrWhiteSpace(startOut))
        {
            result.Success = false;
            result.Message = "Failed to start self-test (no output — run with sudo?)";
            result.EndTime = DateTime.Now;
            return result;
        }

        progress?.Report(new SmartTestProgress
        {
            DevicePath      = devicePath,
            Status          = "Self-test started",
            PercentComplete = 0,
            IsRunning       = true
        });

        // Poll every 5 seconds for up to 10 minutes
        const int maxPolls = 120;
        for (int i = 0; i < maxPolls; i++)
        {
            await Task.Delay(5000);

            var logOut = LinuxCommandRunner.TryRun(_smartctlPath, $"-l selftest {devicePath}");

            // Parse first data row in self-test log
            // Format: "# 1  Short offline  Completed without error  00%  12345  -"
            var logMatch = Regex.Match(logOut,
                @"#\s*1\s+\S+\s+\S+\s+(\S.*?)\s{2,}(\d+)%",
                RegexOptions.Multiline);

            int pct = 0;
            string status = "Testing...";

            if (logMatch.Success)
            {
                status = logMatch.Groups[1].Value.Trim();
                int.TryParse(logMatch.Groups[2].Value, out pct);
            }

            bool running = pct > 0 || status.Contains("In progress", StringComparison.OrdinalIgnoreCase);

            progress?.Report(new SmartTestProgress
            {
                DevicePath      = devicePath,
                Status          = status,
                PercentComplete = 100 - pct, // smartctl shows "percent remaining"
                IsRunning       = running
            });

            if (!running || status.Contains("Completed", StringComparison.OrdinalIgnoreCase) ||
                status.Contains("Failed", StringComparison.OrdinalIgnoreCase))
            {
                bool passed = status.Contains("without error", StringComparison.OrdinalIgnoreCase);
                result.Success  = true;
                result.Passed   = passed;
                result.Message  = passed ? "Self-Test Passed" : $"Self-Test Failed: {status}";
                result.EndTime  = DateTime.Now;
                return result;
            }
        }

        result.Success = false;
        result.Message = "Self-test timed out";
        result.EndTime = DateTime.Now;
        return result;
    }

    // ── Helpers ─────────────────────────────────────────────────

    private SmartDriveInfo? BuildDriveInfo(string devicePath)
    {
        try
        {
            // -a gives everything: identity + SMART attributes
            var raw = LinuxCommandRunner.TryRun(_smartctlPath, $"-a {devicePath}");
            if (string.IsNullOrWhiteSpace(raw)) return null;

            var model = ParseField(raw, "Device Model")
                     ?? ParseField(raw, "Model Number")
                     ?? ParseField(raw, "Model Family")
                     ?? devicePath;

            var serial = ParseField(raw, "Serial Number") ?? "";

            // Health: SMART overall-health self-assessment
            bool healthPassed = raw.Contains("SMART overall-health self-assessment test result: PASSED",
                                    StringComparison.OrdinalIgnoreCase)
                             || raw.Contains(": PASSED", StringComparison.OrdinalIgnoreCase);

            // Health score from Reallocated_Sector_Ct and other key attributes
            int healthScore = CalculateHealthScore(raw, healthPassed);

            // Temperature — attribute 190 or 194
            int? temperature = ParseSmartAttribute(raw, "190")
                            ?? ParseSmartAttribute(raw, "194")
                            ?? ParseSmartAttribute(raw, "Temperature_Celsius");

            // Power-on hours — attribute 9
            int? powerOnHours = ParseSmartAttribute(raw, "9")
                             ?? ParseSmartAttribute(raw, "Power_On_Hours");

            var warnings = new List<string>();
            if (!healthPassed) warnings.Add("SMART health check failed");
            if (temperature > 60) warnings.Add($"High temperature: {temperature}°C");

            return new SmartDriveInfo
            {
                DevicePath    = devicePath,
                Model         = model,
                SerialNumber  = serial,
                HealthScore   = healthScore,
                HealthPassed  = healthPassed,
                Temperature   = temperature,
                PowerOnHours  = powerOnHours,
                Warnings      = warnings
            };
        }
        catch { return null; }
    }

    /// <summary>
    /// Derives a 0-100 health score from reallocated sectors, pending sectors,
    /// and uncorrectable errors — the three main SMART failure predictors.
    /// </summary>
    private static int CalculateHealthScore(string raw, bool healthPassed)
    {
        if (!healthPassed) return 15;

        int score = 100;

        // Reallocated Sector Count (attr 5)
        var reallocated = ParseSmartAttributeFromOutput(raw, "5", "Reallocated_Sector_Ct");
        if (reallocated.HasValue && reallocated.Value > 0)
            score -= Math.Min(40, reallocated.Value * 4);

        // Current Pending Sector (attr 197)
        var pending = ParseSmartAttributeFromOutput(raw, "197", "Current_Pending_Sector");
        if (pending.HasValue && pending.Value > 0)
            score -= Math.Min(30, pending.Value * 3);

        // Offline Uncorrectable (attr 198)
        var uncorrectable = ParseSmartAttributeFromOutput(raw, "198", "Offline_Uncorrectable");
        if (uncorrectable.HasValue && uncorrectable.Value > 0)
            score -= Math.Min(25, uncorrectable.Value * 5);

        return Math.Clamp(score, 0, 100);
    }

    /// <summary>
    /// Parses a SMART attribute RAW_VALUE by attribute ID or name.
    /// smartctl -a output format (ATA):
    ///   ID# ATTRIBUTE_NAME          FLAG     VALUE WORST THRESH TYPE      UPDATED  WHEN_FAILED RAW_VALUE
    ///     5 Reallocated_Sector_Ct   0x0033   100   100   036    Pre-fail  Always       -       0
    /// </summary>
    private static int? ParseSmartAttributeFromOutput(string raw, string attrId, string attrName)
    {
        // Match by ID
        var byId = Regex.Match(raw, $@"^\s*{attrId}\s+\S+\s+\S+\s+\d+\s+\d+\s+\d+\s+\S+\s+\S+\s+\S+\s+(\d+)",
            RegexOptions.Multiline);
        if (byId.Success && int.TryParse(byId.Groups[1].Value, out int v1)) return v1;

        // Match by name
        var byName = Regex.Match(raw, $@"{attrName}\s+\S+\s+\d+\s+\d+\s+\d+\s+\S+\s+\S+\s+\S+\s+(\d+)",
            RegexOptions.Multiline);
        if (byName.Success && int.TryParse(byName.Groups[1].Value, out int v2)) return v2;

        return null;
    }

    /// <summary>Parses a SMART attribute normalized VALUE (column 4) by ID or name.</summary>
    private static int? ParseSmartAttribute(string raw, string attrIdOrName)
    {
        // Try numeric ID match (temperature attributes store value in RAW_VALUE col)
        var m = Regex.Match(raw, $@"^\s*{Regex.Escape(attrIdOrName)}\s+\S+\s+\S+\s+(\d+)",
            RegexOptions.Multiline);
        if (m.Success && int.TryParse(m.Groups[1].Value, out int v)) return v;

        // NVMe format: "Temperature:  XX Celsius"
        var nvme = Regex.Match(raw, @"Temperature:\s+(\d+)\s+Celsius", RegexOptions.IgnoreCase);
        if (nvme.Success && int.TryParse(nvme.Groups[1].Value, out int t)) return t;

        return null;
    }

    private static string? ParseField(string raw, string field)
    {
        var m = Regex.Match(raw, $@"^{Regex.Escape(field)}:\s*(.+)$", RegexOptions.Multiline);
        return m.Success ? m.Groups[1].Value.Trim() : null;
    }

    private static string ExtractSmartError(string output)
    {
        if (output.Contains("Permission denied", StringComparison.OrdinalIgnoreCase)
            || output.Contains("requires admin", StringComparison.OrdinalIgnoreCase))
            return "Self-test requires sudo/root";

        if (output.Contains("not supported", StringComparison.OrdinalIgnoreCase))
            return "Self-test not supported by this drive";

        if (output.Contains("Unknown USB", StringComparison.OrdinalIgnoreCase))
            return "USB bridge — self-test not available";

        var firstLine = output.Split('\n').FirstOrDefault(l => !string.IsNullOrWhiteSpace(l))?.Trim();
        return firstLine ?? "Failed to start self-test";
    }
}
