using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LaptopQC.Hardware.Providers;

/// <summary>
/// Wrapper for smartctl.exe (smartmontools) to read SMART data and run self-tests
/// </summary>
public class SmartctlProvider : ISmartctlProvider
{
    private string? _smartctlPath;
    
    /// <summary>
    /// Checks if smartctl.exe is available
    /// </summary>
    public bool IsAvailable => FindSmartctlPath() != null;
    
    /// <summary>
    /// Finds the path to smartctl.exe
    /// </summary>
    public string? FindSmartctlPath()
    {
        if (_smartctlPath != null) return _smartctlPath;
        
        var candidates = new[]
        {
            // 1. Bundled with app (tools folder)
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools", "smartctl.exe"),
            // 2. Same folder as app
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smartctl.exe"),
            // 3. Common install locations
            @"C:\Program Files\smartmontools\bin\smartctl.exe",
            @"C:\Program Files (x86)\smartmontools\bin\smartctl.exe",
        };
        
        foreach (var path in candidates)
        {
            if (File.Exists(path))
            {
                _smartctlPath = path;
                return _smartctlPath;
            }
        }
        
        // 4. Try PATH
        try
        {
            var result = RunCommand("where", "smartctl.exe");
            if (result.ExitCode == 0 && !string.IsNullOrWhiteSpace(result.Output))
            {
                _smartctlPath = result.Output.Split('\n')[0].Trim();
                if (File.Exists(_smartctlPath))
                    return _smartctlPath;
            }
        }
        catch { }
        
        return null;
    }
    
    /// <summary>
    /// Scans for all drives that smartctl can access
    /// </summary>
    public List<SmartctlDrive> ScanDrives()
    {
        var drives = new List<SmartctlDrive>();
        var path = FindSmartctlPath();
        if (path == null) return drives;
        
        var result = RunCommand(path, "--scan --json");
        if (result.ExitCode != 0) return drives;
        
        try
        {
            var json = JsonDocument.Parse(result.Output);
            if (json.RootElement.TryGetProperty("devices", out var devices))
            {
                foreach (var device in devices.EnumerateArray())
                {
                    drives.Add(new SmartctlDrive
                    {
                        DevicePath = device.GetProperty("name").GetString() ?? "",
                        Type = device.TryGetProperty("type", out var t) ? t.GetString() ?? "unknown" : "unknown",
                        Protocol = device.TryGetProperty("protocol", out var p) ? p.GetString() ?? "" : ""
                    });
                }
            }
        }
        catch { }
        
        return drives;
    }
    
    /// <summary>
    /// Gets full SMART data for a device
    /// </summary>
    public SmartData? GetSmartData(string devicePath)
    {
        var path = FindSmartctlPath();
        if (path == null) return null;
        
        var result = RunCommand(path, $"--all --json \"{devicePath}\"");
        if (string.IsNullOrWhiteSpace(result.Output)) return null;
        
        try
        {
            return ParseSmartData(result.Output);
        }
        catch (Exception ex)
        {
            // Log parsing errors
            File.WriteAllText(
                Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "smartctl_parse_error.log"),
                $"{DateTime.Now}: {ex.Message}\n\nOutput:\n{result.Output}");
            return null;
        }
    }
    
    /// <summary>
    /// Starts a short self-test (~2 minutes)
    /// </summary>
    public SmartTestResult StartShortTest(string devicePath)
    {
        var path = FindSmartctlPath();
        if (path == null)
            return new SmartTestResult { Success = false, Message = "smartctl.exe not found" };
        
        var result = RunCommand(path, $"-t short \"{devicePath}\"");
        
        return new SmartTestResult
        {
            Success = result.ExitCode == 0,
            Message = result.ExitCode == 0 
                ? "Short self-test started. Estimated completion: ~2 minutes."
                : $"Failed to start test: {result.Output}"
        };
    }
    
    /// <summary>
    /// Gets the status of any running or completed self-tests
    /// </summary>
    public SmartTestStatus GetTestStatus(string devicePath)
    {
        var path = FindSmartctlPath();
        if (path == null)
            return new SmartTestStatus { IsRunning = false, Message = "smartctl.exe not found" };
        
        var result = RunCommand(path, $"-c --json \"{devicePath}\"");
        if (string.IsNullOrWhiteSpace(result.Output))
            return new SmartTestStatus { IsRunning = false, Message = "Failed to get status" };
        
        try
        {
            var json = JsonDocument.Parse(result.Output);
            var status = new SmartTestStatus();
            
            if (json.RootElement.TryGetProperty("ata_smart_data", out var ataData))
            {
                if (ataData.TryGetProperty("self_test", out var selfTest))
                {
                    if (selfTest.TryGetProperty("status", out var testStatus))
                    {
                        status.IsRunning = testStatus.TryGetProperty("value", out var val) && val.GetInt32() != 0;
                        status.PercentRemaining = testStatus.TryGetProperty("remaining_percent", out var pct) 
                            ? pct.GetInt32() : 0;
                        status.Message = testStatus.TryGetProperty("string", out var str)
                            ? str.GetString() ?? "" : "";
                    }
                }
            }
            
            return status;
        }
        catch
        {
            return new SmartTestStatus { IsRunning = false, Message = "Failed to parse status" };
        }
    }
    
    /// <summary>
    /// Gets the self-test log (history of tests)
    /// </summary>
    public List<SmartTestLogEntry> GetTestLog(string devicePath)
    {
        var log = new List<SmartTestLogEntry>();
        var path = FindSmartctlPath();
        if (path == null) return log;
        
        var result = RunCommand(path, $"-l selftest --json \"{devicePath}\"");
        if (string.IsNullOrWhiteSpace(result.Output)) return log;
        
        try
        {
            var json = JsonDocument.Parse(result.Output);
            
            // Try ATA format first
            if (json.RootElement.TryGetProperty("ata_smart_self_test_log", out var ataTestLog))
            {
                if (ataTestLog.TryGetProperty("standard", out var standard))
                {
                    if (standard.TryGetProperty("table", out var table))
                    {
                        foreach (var entry in table.EnumerateArray())
                        {
                            log.Add(new SmartTestLogEntry
                            {
                                Type = entry.TryGetProperty("type", out var t) 
                                    ? t.TryGetProperty("string", out var ts) ? ts.GetString() ?? "" : "" : "",
                                Status = entry.TryGetProperty("status", out var s)
                                    ? s.TryGetProperty("string", out var ss) ? ss.GetString() ?? "" : "" : "",
                                LifetimeHours = entry.TryGetProperty("lifetime_hours", out var h) ? h.GetInt32() : 0,
                                Passed = entry.TryGetProperty("status", out var st)
                                    && st.TryGetProperty("passed", out var p) && p.GetBoolean()
                            });
                        }
                    }
                }
            }
            
            // Try NVMe format
            if (json.RootElement.TryGetProperty("nvme_self_test_log", out var nvmeTestLog))
            {
                if (nvmeTestLog.TryGetProperty("table", out var table))
                {
                    foreach (var entry in table.EnumerateArray())
                    {
                        var statusStr = entry.TryGetProperty("self_test_result", out var res)
                            ? res.TryGetProperty("string", out var s) ? s.GetString() ?? "" : "" : "";
                        
                        // NVMe uses "Completed without error" for passed tests
                        bool passed = statusStr.Contains("without error", StringComparison.OrdinalIgnoreCase) ||
                                      statusStr.Contains("success", StringComparison.OrdinalIgnoreCase);
                        
                        log.Add(new SmartTestLogEntry
                        {
                            Type = entry.TryGetProperty("self_test_code", out var code)
                                ? code.TryGetProperty("string", out var cs) ? cs.GetString() ?? "Short" : "Short" : "Short",
                            Status = statusStr,
                            LifetimeHours = entry.TryGetProperty("power_on_hours", out var h) ? h.GetInt32() : 0,
                            Passed = passed
                        });
                    }
                }
            }
        }
        catch { }
        
        return log;
    }
    
    private SmartData ParseSmartData(string jsonOutput)
    {
        var data = new SmartData();
        var json = JsonDocument.Parse(jsonOutput);
        var root = json.RootElement;
        
        // Device info
        if (root.TryGetProperty("model_name", out var model))
            data.Model = model.GetString() ?? "";
        if (root.TryGetProperty("serial_number", out var serial))
            data.SerialNumber = serial.GetString() ?? "";
        if (root.TryGetProperty("firmware_version", out var fw))
            data.FirmwareVersion = fw.GetString() ?? "";
        
        // Overall health
        if (root.TryGetProperty("smart_status", out var status))
        {
            if (status.TryGetProperty("passed", out var passed))
                data.HealthPassed = passed.GetBoolean();
        }
        
        // Temperature
        if (root.TryGetProperty("temperature", out var temp))
        {
            if (temp.TryGetProperty("current", out var current))
                data.Temperature = current.GetInt32();
        }
        
        // Power-on hours
        if (root.TryGetProperty("power_on_time", out var pot))
        {
            if (pot.TryGetProperty("hours", out var hours))
                data.PowerOnHours = hours.GetInt32();
        }
        
        // Power cycle count
        if (root.TryGetProperty("power_cycle_count", out var pcc))
            data.PowerCycleCount = pcc.GetInt32();
        
        // SMART attributes (ATA drives)
        if (root.TryGetProperty("ata_smart_attributes", out var attrs))
        {
            if (attrs.TryGetProperty("table", out var table))
            {
                foreach (var attr in table.EnumerateArray())
                {
                    var smartAttr = new SmartAttribute
                    {
                        Id = attr.TryGetProperty("id", out var id) ? id.GetInt32() : 0,
                        Name = attr.TryGetProperty("name", out var name) ? name.GetString() ?? "" : "",
                        Value = attr.TryGetProperty("value", out var val) ? val.GetInt32() : 0,
                        Worst = attr.TryGetProperty("worst", out var worst) ? worst.GetInt32() : 0,
                        Threshold = attr.TryGetProperty("thresh", out var thresh) ? thresh.GetInt32() : 0,
                    };
                    
                    if (attr.TryGetProperty("raw", out var raw))
                    {
                        if (raw.TryGetProperty("value", out var rawVal))
                            smartAttr.RawValue = rawVal.GetInt64();
                    }
                    
                    // Flag critical attributes
                    smartAttr.IsCritical = IsCriticalAttribute(smartAttr.Id);
                    smartAttr.IsFailing = smartAttr.Value <= smartAttr.Threshold && smartAttr.Threshold > 0;
                    
                    data.Attributes.Add(smartAttr);
                }
            }
        }
        
        // NVMe specific data
        if (root.TryGetProperty("nvme_smart_health_information_log", out var nvme))
        {
            if (nvme.TryGetProperty("percentage_used", out var used))
                data.NvmePercentageUsed = used.GetInt32();
            if (nvme.TryGetProperty("available_spare", out var spare))
                data.NvmeAvailableSpare = spare.GetInt32();
            if (nvme.TryGetProperty("media_errors", out var errors))
                data.NvmeMediaErrors = errors.GetInt64();
        }
        
        return data;
    }
    
    private bool IsCriticalAttribute(int id)
    {
        // Critical SMART attribute IDs that indicate potential drive failure
        return id switch
        {
            5 => true,    // Reallocated Sectors Count
            10 => true,   // Spin Retry Count
            187 => true,  // Reported Uncorrectable Errors
            188 => true,  // Command Timeout
            196 => true,  // Reallocation Event Count
            197 => true,  // Current Pending Sector Count
            198 => true,  // Offline Uncorrectable Sector Count
            201 => true,  // Soft Read Error Rate
            _ => false
        };
    }
    
    private (int ExitCode, string Output) RunCommand(string exe, string args)
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = exe,
                Arguments = args,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            
            using var process = Process.Start(psi);
            if (process == null)
                return (-1, "Failed to start process");
            
            var output = process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();
            process.WaitForExit(30000); // 30 second timeout
            
            return (process.ExitCode, string.IsNullOrWhiteSpace(output) ? error : output);
        }
        catch (Exception ex)
        {
            return (-1, ex.Message);
        }
    }
}

#region Models

public class SmartctlDrive
{
    public string DevicePath { get; set; } = "";
    public string Type { get; set; } = "";
    public string Protocol { get; set; } = "";
}

public class SmartData
{
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string FirmwareVersion { get; set; } = "";
    public bool HealthPassed { get; set; } = true;
    public int? Temperature { get; set; }
    public int? PowerOnHours { get; set; }
    public int? PowerCycleCount { get; set; }
    
    // NVMe specific
    public int? NvmePercentageUsed { get; set; }
    public int? NvmeAvailableSpare { get; set; }
    public long? NvmeMediaErrors { get; set; }
    
    public List<SmartAttribute> Attributes { get; set; } = new();
    
    /// <summary>
    /// Calculate overall health score (0-100)
    /// </summary>
    public int CalculateHealthScore()
    {
        if (!HealthPassed) return 0;
        
        int score = 100;
        
        // Check critical attributes
        foreach (var attr in Attributes.Where(a => a.IsCritical))
        {
            if (attr.IsFailing)
                return 0; // Immediate fail
            
            // Deduct points for non-zero critical raw values
            if (attr.RawValue > 0)
            {
                score -= attr.Id switch
                {
                    5 => Math.Min(50, (int)attr.RawValue * 5),    // Reallocated sectors
                    197 => Math.Min(40, (int)attr.RawValue * 10), // Pending sectors
                    198 => Math.Min(40, (int)attr.RawValue * 10), // Offline uncorrectable
                    _ => Math.Min(20, (int)attr.RawValue)
                };
            }
        }
        
        // NVMe: percentage used reduces score
        if (NvmePercentageUsed.HasValue)
            score = Math.Max(0, score - NvmePercentageUsed.Value);
        
        return Math.Max(0, Math.Min(100, score));
    }
    
    /// <summary>
    /// Get list of warnings/issues
    /// </summary>
    public List<string> GetWarnings()
    {
        var warnings = new List<string>();
        
        if (!HealthPassed)
            warnings.Add("SMART overall health check: FAILED");
        
        foreach (var attr in Attributes.Where(a => a.IsCritical && a.RawValue > 0))
        {
            warnings.Add($"{attr.Name}: {attr.RawValue} (critical attribute with non-zero value)");
        }
        
        if (Temperature > 55)
            warnings.Add($"High temperature: {Temperature}°C");
        
        if (NvmeMediaErrors > 0)
            warnings.Add($"NVMe media errors: {NvmeMediaErrors}");
        
        if (NvmePercentageUsed > 90)
            warnings.Add($"NVMe life used: {NvmePercentageUsed}% (low remaining life)");
        
        return warnings;
    }
}

public class SmartAttribute
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int Value { get; set; }
    public int Worst { get; set; }
    public int Threshold { get; set; }
    public long RawValue { get; set; }
    public bool IsCritical { get; set; }
    public bool IsFailing { get; set; }
}

public class SmartTestResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
}

public class SmartTestStatus
{
    public bool IsRunning { get; set; }
    public int PercentRemaining { get; set; }
    public string Message { get; set; } = "";
}

public class SmartTestLogEntry
{
    public string Type { get; set; } = "";
    public string Status { get; set; } = "";
    public int LifetimeHours { get; set; }
    public bool Passed { get; set; }
}

#endregion
