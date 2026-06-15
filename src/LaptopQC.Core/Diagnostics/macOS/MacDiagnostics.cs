using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Hardware.Models;

namespace LaptopQC.Core.Diagnostics.macOS;

// ──────────────────────────────────────────────────────────────
// macOS Diagnostic Implementations
//
// Each class uses macOS CLI tools (system_profiler, sysctl, 
// ioreg, diskutil, etc.) to gather hardware information and 
// populate the same platform-neutral models used on Windows.
// ──────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════
// SYSTEM DIAGNOSTIC
// ═══════════════════════════════════════════════════════════════

public class MacSystemDiagnostic : ISystemDiagnostic
{
    public SystemInfo GetInfo()
    {
        var info = new SystemInfo();

        try
        {
            var json = CommandRunner.TryRun("system_profiler", "SPHardwareDataType -json");
            if (!string.IsNullOrEmpty(json))
            {
                using var doc = JsonDocument.Parse(json);
                var hw = doc.RootElement
                    .GetProperty("SPHardwareDataType")[0];

                info.ComputerName = Environment.MachineName;
                info.Manufacturer = "Apple";
                info.Model = TryGetString(hw, "machine_model") 
                          ?? TryGetString(hw, "machine_name") ?? "Unknown";
                info.SerialNumber = TryGetString(hw, "serial_number") ?? "";
                info.BiosVersion = TryGetString(hw, "boot_rom_version") ?? "";
                info.OsVersion = $"macOS {Environment.OSVersion.Version}";
            }

            // Get MAC address from primary interface
            var ifconfig = CommandRunner.TryRun("ifconfig", "en0");
            var macMatch = Regex.Match(ifconfig, @"ether\s+([0-9a-f:]{17})", RegexOptions.IgnoreCase);
            if (macMatch.Success)
                info.MacAddress = macMatch.Groups[1].Value.ToUpper();
        }
        catch (Exception ex)
        {
            info.ComputerName = Environment.MachineName;
            info.OsVersion = $"macOS (error: {ex.Message})";
        }

        return info;
    }

    private static string? TryGetString(JsonElement el, string prop)
    {
        return el.TryGetProperty(prop, out var val) ? val.GetString() : null;
    }
}

// ═══════════════════════════════════════════════════════════════
// CPU DIAGNOSTIC
// ═══════════════════════════════════════════════════════════════

public class MacCpuDiagnostic : ICpuDiagnostic
{
    public CpuInfo GetInfo()
    {
        var info = new CpuInfo();

        try
        {
            // CPU brand string (e.g. "Apple M1 Pro" or "Intel(R) Core(TM) i5-5257U CPU @ 2.70GHz")
            info.Name = CommandRunner.RunSingleLine("sysctl", "-n machdep.cpu.brand_string");
            if (string.IsNullOrEmpty(info.Name))
                info.Name = CommandRunner.RunSingleLine("sysctl", "-n hw.model");

            info.Manufacturer = info.Name.Contains("Apple", StringComparison.OrdinalIgnoreCase) ? "Apple" : "Intel";

            // Physical cores
            var physCores = CommandRunner.RunSingleLine("sysctl", "-n hw.physicalcpu");
            if (int.TryParse(physCores, out int cores))
                info.Cores = cores;

            // Logical cores (threads)
            var logCores = CommandRunner.RunSingleLine("sysctl", "-n hw.logicalcpu");
            if (int.TryParse(logCores, out int threads))
                info.Threads = threads;

            // Clock speed — Apple Silicon doesn't expose this via sysctl;
            // Intel Macs report hw.cpufrequency (Hz)
            var freqStr = CommandRunner.RunSingleLine("sysctl", "-n hw.cpufrequency");
            if (long.TryParse(freqStr, out long freqHz) && freqHz > 0)
            {
                info.MaxClockSpeedMHz = (int)(freqHz / 1_000_000);
            }
            else
            {
                // Apple Silicon: try parsing from brand string (e.g. system_profiler may have chip speed)
                // or use a reasonable default
                var spJson = CommandRunner.TryRun("system_profiler", "SPHardwareDataType -json");
                if (!string.IsNullOrEmpty(spJson))
                {
                    using var doc = JsonDocument.Parse(spJson);
                    var hw = doc.RootElement.GetProperty("SPHardwareDataType")[0];
                    if (hw.TryGetProperty("current_processor_speed", out var speed))
                    {
                        var speedStr = speed.GetString() ?? "";
                        // Parse "3.49 GHz" or "Apple M1 Pro"
                        var ghzMatch = Regex.Match(speedStr, @"([\d.]+)\s*GHz", RegexOptions.IgnoreCase);
                        if (ghzMatch.Success && double.TryParse(ghzMatch.Groups[1].Value, out double ghz))
                            info.MaxClockSpeedMHz = (int)(ghz * 1000);
                    }
                }
            }
        }
        catch { /* Return whatever we got */ }

        return info;
    }

    public (bool IsHealthy, string Message) ValidateCpu(CpuInfo cpuInfo)
    {
        if (string.IsNullOrWhiteSpace(cpuInfo.Name))
            return (false, "CPU name could not be determined");
        if (cpuInfo.Cores == 0)
            return (false, "CPU core count could not be determined");
        return (true, "CPU is functioning normally");
    }
}

// ═══════════════════════════════════════════════════════════════
// RAM DIAGNOSTIC
// ═══════════════════════════════════════════════════════════════

public class MacRamDiagnostic : IRamDiagnostic
{
    public RamInfo GetInfo()
    {
        var info = new RamInfo();

        try
        {
            var json = CommandRunner.TryRun("system_profiler", "SPMemoryDataType -json");
            if (!string.IsNullOrEmpty(json))
            {
                using var doc = JsonDocument.Parse(json);
                var memData = doc.RootElement.GetProperty("SPMemoryDataType")[0];

                // Total memory from sysctl (more reliable)
                var memStr = CommandRunner.RunSingleLine("sysctl", "-n hw.memsize");
                if (long.TryParse(memStr, out long memBytes))
                    info.TotalCapacityGB = memBytes / (1024L * 1024 * 1024);

                // Parse individual modules (DIMMs) — may not exist on Apple Silicon (unified memory)
                if (memData.TryGetProperty("_items", out var items))
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        var module = new RamModule();

                        if (item.TryGetProperty("dimm_size", out var sizeEl))
                        {
                            var sizeStr = sizeEl.GetString() ?? "";
                            var sizeMatch = Regex.Match(sizeStr, @"(\d+)\s*(GB|MB)", RegexOptions.IgnoreCase);
                            if (sizeMatch.Success)
                            {
                                long size = long.Parse(sizeMatch.Groups[1].Value);
                                module.CapacityGB = sizeMatch.Groups[2].Value.Equals("MB", StringComparison.OrdinalIgnoreCase) 
                                    ? size / 1024 : size;
                            }
                        }

                        if (item.TryGetProperty("dimm_speed", out var speedEl))
                        {
                            var speedStr = speedEl.GetString() ?? "";
                            var speedMatch = Regex.Match(speedStr, @"(\d+)");
                            if (speedMatch.Success)
                                module.SpeedMHz = int.Parse(speedMatch.Groups[1].Value);
                        }

                        if (item.TryGetProperty("dimm_type", out var typeEl))
                            module.MemoryType = typeEl.GetString() ?? "";

                        if (item.TryGetProperty("dimm_manufacturer", out var mfgEl))
                            module.Manufacturer = mfgEl.GetString() ?? "";

                        info.Modules.Add(module);
                    }
                }

                // Apple Silicon with unified memory: create a single virtual module
                if (info.Modules.Count == 0 && info.TotalCapacityGB > 0)
                {
                    var memType = "Unified Memory";
                    if (memData.TryGetProperty("SPMemoryDataType", out var typeEl2))
                        memType = typeEl2.GetString() ?? memType;

                    info.Modules.Add(new RamModule
                    {
                        CapacityGB = (long)info.TotalCapacityGB,
                        MemoryType = memType,
                        Manufacturer = "Apple",
                        FormFactor = "Unified"
                    });
                }
            }
        }
        catch { /* Return whatever we got */ }

        return info;
    }

    public (bool IsHealthy, string Message) ValidateRam(RamInfo ramInfo)
    {
        if (ramInfo.TotalCapacityGB == 0) return (false, "No RAM detected");
        return (true, $"RAM: {ramInfo.TotalCapacityGB}GB detected");
    }
}

// ═══════════════════════════════════════════════════════════════
// STORAGE DIAGNOSTIC
// ═══════════════════════════════════════════════════════════════

public class MacStorageDiagnostic : IStorageDiagnostic
{
    public StorageInfo GetInfo()
    {
        var info = new StorageInfo();

        try
        {
            var json = CommandRunner.TryRun("system_profiler", "SPStorageDataType -json");
            if (!string.IsNullOrEmpty(json))
            {
                using var doc = JsonDocument.Parse(json);
                var volumes = doc.RootElement.GetProperty("SPStorageDataType");

                // Bug fix: On macOS with APFS, SPStorageDataType returns one entry per
                // *logical volume* (Macintosh HD, Preboot, Recovery, VM, etc.) that all
                // share one physical NVMe. We must deduplicate by physical device name so
                // the report doesn't show 4 "drives" totalling 2TB on a 512GB machine.
                //
                // Strategy:
                //   1. Only add volumes that have a physical_drive section (those are real
                //      physical disks or at least containers mapped to a physical disk).
                //   2. Deduplicate by the physical device name.
                //   3. For the size, take the *largest* size_in_bytes seen for that device
                //      (the container volume is always the largest; sub-volumes are smaller).

                // Phase 1: collect all volumes that have physical_drive info.
                var physicalMap = new Dictionary<string, StorageDevice>(StringComparer.OrdinalIgnoreCase);

                foreach (var vol in volumes.EnumerateArray())
                {
                    // Only process volumes that map to a physical drive.
                    if (!vol.TryGetProperty("physical_drive", out var phys))
                        continue;

                    if (!phys.TryGetProperty("device_name", out var devNameEl))
                        continue;

                    var physicalName = devNameEl.GetString();
                    if (string.IsNullOrWhiteSpace(physicalName))
                        continue;

                    double sizeGb = 0;
                    if (vol.TryGetProperty("size_in_bytes", out var sizeEl) && sizeEl.TryGetInt64(out long sizeBytes))
                        sizeGb = sizeBytes / (1024.0 * 1024 * 1024);

                    if (!physicalMap.TryGetValue(physicalName, out var existing))
                    {
                        var device = new StorageDevice { Model = physicalName };

                        if (phys.TryGetProperty("medium_type", out var medium))
                        {
                            var medStr = medium.GetString() ?? "";
                            device.IsSsd = medStr.Contains("SSD", StringComparison.OrdinalIgnoreCase)
                                        || medStr.Contains("Solid", StringComparison.OrdinalIgnoreCase)
                                        || medStr.Contains("Flash", StringComparison.OrdinalIgnoreCase);
                        }
                        else
                        {
                            // Apple NVMe SSDs don't always report medium_type — default to SSD
                            device.IsSsd = physicalName.Contains("SSD", StringComparison.OrdinalIgnoreCase)
                                        || physicalName.Contains("APPLE", StringComparison.OrdinalIgnoreCase);
                        }

                        device.SizeGB = sizeGb;
                        physicalMap[physicalName] = device;
                    }
                    else
                    {
                        // Keep the largest size seen (the container volume is largest)
                        if (sizeGb > existing.SizeGB)
                            existing.SizeGB = sizeGb;
                    }
                }

                foreach (var dev in physicalMap.Values)
                    info.Devices.Add(dev);

                // Fallback: if no physical_drive info at all (edge case), fall back to
                // the old volume-based listing with name-based deduplication.
                if (info.Devices.Count == 0)
                {
                    foreach (var vol in volumes.EnumerateArray())
                    {
                        var device = new StorageDevice();
                        if (vol.TryGetProperty("_name", out var nameEl))
                            device.Model = nameEl.GetString() ?? "Unknown";
                        if (vol.TryGetProperty("size_in_bytes", out var sizeEl) && sizeEl.TryGetInt64(out long sizeBytes))
                            device.SizeGB = sizeBytes / (1024.0 * 1024 * 1024);
                        if (!info.Devices.Any(d => d.Model == device.Model))
                            info.Devices.Add(device);
                    }
                }
            }
        }
        catch { /* Return whatever we got */ }

        EvaluateTamperState(info);

        return info;
    }

    public (bool IsHealthy, string Message) ValidateStorage(StorageInfo info)
    {
        if (info.Devices.Count == 0) return (false, "No storage devices detected");
        if (info.IsTampered) return (false, string.IsNullOrWhiteSpace(info.TamperReason) ? "Storage Tampered - Unable to read data" : info.TamperReason);
        if (info.IsInconclusive) return (false, string.IsNullOrWhiteSpace(info.InconclusiveReason) ? "Storage Inconclusive - Unable to verify health data" : info.InconclusiveReason);
        if (info.IsSuspicious) return (true, string.IsNullOrWhiteSpace(info.SuspiciousReason) ? "Storage data suspicious - Review recommended" : info.SuspiciousReason);
        return (true, $"{info.Devices.Count} drive(s) detected");
    }

    private static void EvaluateTamperState(StorageInfo info)
    {
        foreach (var device in info.Devices)
        {
            bool invalidSize = device.SizeGB <= 0;
            bool invalidHealth = device.HealthPercent.HasValue && (device.HealthPercent.Value < 0 || device.HealthPercent.Value > 100);
            bool invalidTemp = device.Temperature.HasValue && (device.Temperature.Value < -10 || device.Temperature.Value > 120);

            if (invalidSize || invalidHealth || invalidTemp)
            {
                device.IsTampered = true;
                device.TamperReason = "Storage Tampered - Unable to read data";
                info.IsTampered = true;
                info.TamperReason = "Storage Tampered - Unable to read data";
            }

            bool suspiciousPerfectHealth =
                device.HealthPercent.HasValue &&
                device.HealthPercent.Value == 100 &&
                device.PowerOnHours.HasValue &&
                device.PowerOnHours.Value > 20000;

            if (!info.IsTampered && suspiciousPerfectHealth)
            {
                device.IsSuspicious = true;
                device.SuspiciousReason = "Storage data suspicious - Review recommended";
                info.IsSuspicious = true;
                if (string.IsNullOrWhiteSpace(info.SuspiciousReason))
                    info.SuspiciousReason = "Storage data suspicious - Review recommended";
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// BATTERY DIAGNOSTIC
// ═══════════════════════════════════════════════════════════════

public class MacBatteryDiagnostic : IBatteryDiagnostic
{
    public BatteryInfo GetInfo()
    {
        var info = new BatteryInfo();

        try
        {
            // Use ioreg to get battery data — most reliable on macOS
            var ioreg = CommandRunner.TryRun("ioreg", "-r -c AppleSmartBattery -w0");

            if (string.IsNullOrEmpty(ioreg) || !ioreg.Contains("AppleSmartBattery"))
            {
                info.IsPresent = false;
                return info;
            }

            info.IsPresent = true;

            // Parse key values from ioreg output
            // Format: "KeyName" = Value
            var cycles = ParseIoregInt(ioreg, "CycleCount");
            info.CycleCount = cycles.HasValue && cycles.Value > 0 ? cycles.Value : null;

            var designCap = ParseIoregInt(ioreg, "DesignCapacity") ?? 0;
            var maxCap = ParseIoregInt(ioreg, "MaxCapacity") ?? 0;
            var currentCap = ParseIoregInt(ioreg, "CurrentCapacity") ?? 0;

            info.DesignedCapacityMWh = (uint)designCap;
            info.FullChargedCapacityMWh = (uint)maxCap;

            if (maxCap > 0 && currentCap > 0)
                info.EstimatedChargeRemaining = (int)((double)currentCap / maxCap * 100);

            // Calculate wear level
            if (designCap > 0 && maxCap > 0)
            {
                double wearFraction = 1.0 - ((double)maxCap / designCap);
                info.WearLevelPercent = Math.Max(0, (int)(wearFraction * 100));
            }

            // Charging status
            var isCharging = ParseIoregBool(ioreg, "IsCharging");
            var externalConnected = ParseIoregBool(ioreg, "ExternalConnected");
            info.Status = isCharging == true ? "Charging" 
                       : externalConnected == true ? "Plugged In (Not Charging)" 
                       : "On Battery";

            // Tamper/unreadable detection: impossible or missing capacity values.
            // If tampered/unreadable, clear derived metrics to avoid misleading scoring.
            if (designCap <= 0 || maxCap <= 0 || maxCap > designCap * 1.10)
            {
                info.IsTampered = true;
                info.TamperReason = "Battery Tampered - Unable to read data";
                info.WearLevelPercent = null;
                info.HealthPercent = null;
            }
        }
        catch
        {
            info.IsPresent = false;
        }

        return info;
    }

    public (bool IsHealthy, string Message) ValidateBattery(BatteryInfo info)
    {
        if (!info.IsPresent) return (true, "No battery (desktop system)");
        if (info.IsTampered) return (false, string.IsNullOrWhiteSpace(info.TamperReason) ? "Battery Tampered - Unable to read data" : info.TamperReason);
        if (info.WearLevelPercent > 40) return (false, $"Battery wear critical: {info.WearLevelPercent}%");
        if (info.WearLevelPercent > 20) return (true, $"Battery wear moderate: {info.WearLevelPercent}%");
        var cycleLabel = info.CycleCount.HasValue ? info.CycleCount.Value.ToString() : "N/A";
        return (true, $"Battery healthy (wear: {info.WearLevelPercent}%, cycles: {cycleLabel})");
    }

    private static int? ParseIoregInt(string output, string key)
    {
        var match = Regex.Match(output, $"\"{key}\"\\s*=\\s*(\\d+)");
        return match.Success && int.TryParse(match.Groups[1].Value, out int val) ? val : null;
    }

    private static bool? ParseIoregBool(string output, string key)
    {
        // macOS ioreg outputs booleans as "Yes"/"No" on older macOS,
        // and as "true"/"false" on macOS 13 Ventura and later.
        var match = Regex.Match(output, $"\"{key}\"\\s*=\\s*(Yes|No|true|false)", RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        var val = match.Groups[1].Value.ToLowerInvariant();
        return val == "yes" || val == "true";
    }
}

// ═══════════════════════════════════════════════════════════════
// DEVICE DIAGNOSTIC
// ═══════════════════════════════════════════════════════════════

public class MacDeviceDiagnostic : IDeviceDiagnostic
{
    public DevicesInfo GetInfo()
    {
        var info = new DevicesInfo();

        try
        {
            // USB Devices
            var usbJson = CommandRunner.TryRun("system_profiler", "SPUSBDataType -json");
            if (!string.IsNullOrEmpty(usbJson))
            {
                using var doc = JsonDocument.Parse(usbJson);
                if (doc.RootElement.TryGetProperty("SPUSBDataType", out var usbData))
                    ParseUsbDevices(usbData, info);
            }

            // Displays
            var displayJson = CommandRunner.TryRun("system_profiler", "SPDisplaysDataType -json");
            if (!string.IsNullOrEmpty(displayJson))
            {
                using var doc = JsonDocument.Parse(displayJson);
                if (doc.RootElement.TryGetProperty("SPDisplaysDataType", out var displays))
                {
                    foreach (var gpu in displays.EnumerateArray())
                    {
                        // GPU info
                        var gpuInfo = new GpuInfo
                        {
                            Name = gpu.TryGetProperty("sppci_model", out var gn) ? gn.GetString() ?? "" : "",
                            DriverVersion = gpu.TryGetProperty("spdisplays_vram", out var vr) ? vr.GetString() ?? "" : ""
                        };
                        info.Gpus.Add(gpuInfo);

                        // Connected displays
                        if (gpu.TryGetProperty("spdisplays_ndrvs", out var drvs))
                        {
                            foreach (var disp in drvs.EnumerateArray())
                            {
                                info.Displays.Add(new DisplayDevice
                                {
                                    Name = disp.TryGetProperty("_name", out var dn) ? dn.GetString() ?? "" : "",
                                    IsActive = true
                                });
                            }
                        }
                    }
                }
            }

            // Audio devices
            var audioJson = CommandRunner.TryRun("system_profiler", "SPAudioDataType -json");
            if (!string.IsNullOrEmpty(audioJson))
            {
                using var doc = JsonDocument.Parse(audioJson);
                if (doc.RootElement.TryGetProperty("SPAudioDataType", out var audioData))
                {
                    foreach (var dev in audioData.EnumerateArray())
                    {
                        info.AudioDevices.Add(new AudioDevice
                        {
                            Name = dev.TryGetProperty("_name", out var an) ? an.GetString() ?? "" : "Unknown"
                        });
                    }
                }
            }

            // Network devices
            var netJson = CommandRunner.TryRun("system_profiler", "SPNetworkDataType -json");
            if (!string.IsNullOrEmpty(netJson))
            {
                using var doc = JsonDocument.Parse(netJson);
                if (doc.RootElement.TryGetProperty("SPNetworkDataType", out var netData))
                {
                    foreach (var dev in netData.EnumerateArray())
                    {
                        var name = dev.TryGetProperty("_name", out var nn) ? nn.GetString() ?? "" : "";
                        var type = dev.TryGetProperty("type", out var nt) ? nt.GetString() ?? "" : "";
                        info.NetworkDevices.Add(new NetworkDevice
                        {
                            Name = name,
                            AdapterType = type
                        });
                    }
                }
            }

            // Camera
            var camJson = CommandRunner.TryRun("system_profiler", "SPCameraDataType -json");
            if (!string.IsNullOrEmpty(camJson))
            {
                using var doc = JsonDocument.Parse(camJson);
                if (doc.RootElement.TryGetProperty("SPCameraDataType", out var camData))
                {
                    var firstCam = camData.EnumerateArray().FirstOrDefault();
                    if (firstCam.ValueKind != JsonValueKind.Undefined)
                    {
                        info.Camera = new CameraDevice
                        {
                            Name = firstCam.TryGetProperty("_name", out var cn) ? cn.GetString() ?? "Camera" : "Camera",
                            IsDetected = true
                        };
                    }
                }
            }
        }
        catch { /* Return whatever we got */ }

        return info;
    }

    private static void ParseUsbDevices(JsonElement usbArray, DevicesInfo info)
    {
        foreach (var bus in usbArray.EnumerateArray())
        {
            if (bus.TryGetProperty("_items", out var items))
            {
                foreach (var device in items.EnumerateArray())
                {
                    var name = device.TryGetProperty("_name", out var n) ? n.GetString() ?? "" : "";
                    var vendor = device.TryGetProperty("manufacturer", out var v) ? v.GetString() ?? "" : "";

                    info.ConnectedUsbDevices.Add(new UsbDevice
                    {
                        Name = name,
                        Manufacturer = vendor
                    });

                    // Recurse into nested hubs
                    if (device.TryGetProperty("_items", out var nested))
                        ParseUsbDevices(nested, info);
                }
            }
        }
    }

    public (bool IsHealthy, string Message) ValidateDevices(DevicesInfo info)
    {
        var issues = new List<string>();
        if (info.Displays.Count == 0) issues.Add("No displays detected");
        if (info.AudioDevices.Count == 0) issues.Add("No audio devices detected");

        if (issues.Count > 0) return (false, string.Join("; ", issues));
        return (true, $"Devices OK: {info.Displays.Count} display(s), {info.AudioDevices.Count} audio, {(info.Camera != null ? 1 : 0)} camera(s)");
    }
}

// ═══════════════════════════════════════════════════════════════
// SMART TEST SERVICE
// ═══════════════════════════════════════════════════════════════

public class MacSmartTestService : ISmartTestService
{
    private readonly string _smartctlPath;

    public MacSmartTestService()
    {
        // Try common Homebrew install paths
        _smartctlPath = File.Exists("/opt/homebrew/bin/smartctl") ? "/opt/homebrew/bin/smartctl"
                      : File.Exists("/usr/local/bin/smartctl") ? "/usr/local/bin/smartctl"
                      : "smartctl";
    }

    public bool IsAvailable
    {
        get
        {
            try
            {
                var output = CommandRunner.TryRun(_smartctlPath, "--version");
                return output.Contains("smartctl");
            }
            catch { return false; }
        }
    }

    public List<SmartDriveInfo> GetTestableDevices()
    {
        var devices = new List<SmartDriveInfo>();
        try
        {
            var output = CommandRunner.TryRun(_smartctlPath, "--scan");
            foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length > 0)
                {
                    var deviceInfo = GetDeviceInfo(parts[0]);
                    if (deviceInfo != null)
                    {
                        if (deviceInfo.Model?.Contains("usb", StringComparison.OrdinalIgnoreCase) == true)
                            continue;
                        devices.Add(deviceInfo);
                    }
                }
            }
        }
        catch { }
        return devices;
    }

    public SmartDriveInfo? GetDeviceInfo(string devicePath)
    {
        try
        {
            var output = CommandRunner.TryRun(_smartctlPath, $"-i {devicePath}");
            if (string.IsNullOrEmpty(output)) return null;

            return new SmartDriveInfo
            {
                DevicePath = devicePath,
                Model = ParseSmartctlField(output, "Device Model") ?? ParseSmartctlField(output, "Model Number") ?? "Unknown",
                Serial = ParseSmartctlField(output, "Serial Number") ?? ""
            };
        }
        catch { return null; }
    }

    public async Task<SmartTestResultInfo> RunShortTestAsync(string devicePath, IProgress<SmartTestProgress>? progress = null, string? deviceType = null)
    {
        try
        {
            var startOutput = CommandRunner.TryRun(_smartctlPath, $"-t short {devicePath}");

            // Check for known failure/unsupported conditions before polling.
            // We look for a positive "started" marker rather than trying to enumerate all
            // error strings (fragile). Common macOS NVMe drives report "Operation not
            // supported by device" which doesn't contain "error" or "failed".
            bool testStarted = startOutput.Contains("has begun", StringComparison.OrdinalIgnoreCase)
                            || startOutput.Contains("Initiating", StringComparison.OrdinalIgnoreCase)
                            || startOutput.Contains("start", StringComparison.OrdinalIgnoreCase);

            bool knownUnsupported = startOutput.Contains("not supported", StringComparison.OrdinalIgnoreCase)
                                 || startOutput.Contains("Operation not supported", StringComparison.OrdinalIgnoreCase)
                                 || startOutput.Contains("Permission denied", StringComparison.OrdinalIgnoreCase)
                                 || startOutput.Contains("requires root", StringComparison.OrdinalIgnoreCase);

            if (knownUnsupported)
                return new SmartTestResultInfo { Success = false, Message = "SMART self-test not supported on this drive" };

            if (!testStarted)
                return new SmartTestResultInfo { Success = false, Message = "Failed to start SMART test" };

            // Short test typically takes ~2 minutes
            for (int i = 0; i < 24; i++)
            {
                await Task.Delay(5000);
                progress?.Report(new SmartTestProgress { PercentComplete = Math.Min(95, i * 4), Status = "Testing..." });

                var status = CommandRunner.TryRun(_smartctlPath, $"-l selftest {devicePath}");
                if (status.Contains("Completed"))
                    break;
            }

            var result = CommandRunner.TryRun(_smartctlPath, $"-H {devicePath}");
            bool passed = result.Contains("PASSED");

            return new SmartTestResultInfo
            {
                Success = true,
                Passed = passed,
                Message = passed ? "SMART test PASSED" : "SMART test indicates issues"
            };
        }
        catch (Exception ex)
        {
            return new SmartTestResultInfo { Success = false, Message = $"SMART test error: {ex.Message}" };
        }
    }

    public SmartHealthCheckResult QuickHealthCheck()
    {
        var result = new SmartHealthCheckResult();
        try
        {
            var devices = GetTestableDevices();
            if (devices.Count == 0)
            {
                result.OverallHealthy = true;
                result.Message = "No SMART-capable drives found";
                return result;
            }

            var allHealthy = true;
            var messages = new List<string>();

            foreach (var dev in devices)
            {
                var output = CommandRunner.TryRun(_smartctlPath, $"-H {dev.DevicePath}");
                bool healthy = output.Contains("PASSED");
                if (!healthy) allHealthy = false;
                messages.Add($"{dev.Model}: {(healthy ? "PASSED" : "FAILED")}");
            }

            result.OverallHealthy = allHealthy;
            result.Message = string.Join("; ", messages);
        }
        catch (Exception ex)
        {
            result.OverallHealthy = false;
            result.Message = $"Error: {ex.Message}";
        }

        return result;
    }

    private static string? ParseSmartctlField(string output, string field)
    {
        var match = Regex.Match(output, $"{field}:\\s*(.+)$", RegexOptions.Multiline);
        return match.Success ? match.Groups[1].Value.Trim() : null;
    }
}

// ═══════════════════════════════════════════════════════════════
// AUDIO/VIDEO TEST SERVICE
// ═══════════════════════════════════════════════════════════════

public class MacAudioVideoTestService : IAudioVideoTestService
{
    private string? _recordingPath;
    private Process? _recordProcess;

    public void TestSpeaker(bool isLeft)
    {
        // Bug fix: macOS 'say' plays through BOTH speakers — it has no stereo-pan option.
        // Instead, generate a stereo WAV in-process (left or right channel only) and play
        // it with afplay, which is built into macOS and respects stereo channels.
        try
        {
            var wavPath = GenerateStereoTestTone(isLeft);
            // Run afplay in the background so it doesn't block the UI thread.
            Process.Start(new ProcessStartInfo
            {
                FileName = "afplay",
                Arguments = $"\"{wavPath}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            });
        }
        catch { }
    }

    /// <summary>
    /// Generates a short stereo WAV file with a 440 Hz sine tone on the requested
    /// channel only (the other channel is silent). Uses only System.IO — no external deps.
    /// </summary>
    private static string GenerateStereoTestTone(bool isLeft, int durationMs = 1800)
    {
        string path = Path.Combine(Path.GetTempPath(), isLeft ? "pramaan_left.wav" : "pramaan_right.wav");
        const int sampleRate = 44100;
        const double frequency = 440.0;            // A4 — audible on all speakers
        const double amplitude = 0.75;              // 75% volume to avoid clipping
        int numSamples = sampleRate * durationMs / 1000;
        int dataBytes = numSamples * 4;            // 2 channels × 2 bytes (16-bit PCM)

        using var fs = new FileStream(path, FileMode.Create, FileAccess.Write);
        using var bw = new BinaryWriter(fs);

        // RIFF header
        bw.Write(new[] { (byte)'R', (byte)'I', (byte)'F', (byte)'F' });
        bw.Write(36 + dataBytes);                   // overall chunk size
        bw.Write(new[] { (byte)'W', (byte)'A', (byte)'V', (byte)'E' });

        // fmt sub-chunk (PCM, 16-bit, stereo, 44100 Hz)
        bw.Write(new[] { (byte)'f', (byte)'m', (byte)'t', (byte)' ' });
        bw.Write(16);                               // sub-chunk size
        bw.Write((short)1);                         // PCM
        bw.Write((short)2);                         // 2 channels
        bw.Write(sampleRate);
        bw.Write(sampleRate * 4);                   // byte rate
        bw.Write((short)4);                         // block align
        bw.Write((short)16);                        // bits per sample

        // data sub-chunk
        bw.Write(new[] { (byte)'d', (byte)'a', (byte)'t', (byte)'a' });
        bw.Write(dataBytes);

        for (int i = 0; i < numSamples; i++)
        {
            double t = (double)i / sampleRate;
            short sample = (short)(short.MaxValue * amplitude * Math.Sin(2 * Math.PI * frequency * t));
            short leftSample  = isLeft  ? sample : (short)0;
            short rightSample = !isLeft ? sample : (short)0;
            bw.Write(leftSample);
            bw.Write(rightSample);
        }

        return path;
    }

    public void StartOneShotMicTest()
    {
        try
        {
            // Bug fix: 'afrecord' does not exist on modern macOS.
            // Try 'sox' (installable via Homebrew) first, then 'ffmpeg' as a fallback.
            // Both produce a valid WAV file that PlaybackMicRecording() can replay.
            _recordingPath = Path.Combine(Path.GetTempPath(), "pramaan_mic_test.wav");

            // Check for sox first (preferred — no codec negotiation needed)
            bool hasSox = File.Exists("/opt/homebrew/bin/sox") || File.Exists("/usr/local/bin/sox");
            bool hasFfmpeg = File.Exists("/opt/homebrew/bin/ffmpeg") || File.Exists("/usr/local/bin/ffmpeg");

            ProcessStartInfo? psi = null;

            if (hasSox)
            {
                string soxPath = File.Exists("/opt/homebrew/bin/sox") ? "/opt/homebrew/bin/sox" : "/usr/local/bin/sox";
                psi = new ProcessStartInfo
                {
                    FileName = soxPath,
                    // -d = default audio device, -r = sample rate, -c = channels,
                    // -e = encoding, -b = bit depth, trim 0 5 = record 5 seconds
                    Arguments = $"-d -r 44100 -c 1 -e signed-integer -b 16 \"{_recordingPath}\" trim 0 5",
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
            }
            else if (hasFfmpeg)
            {
                string ffPath = File.Exists("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "/usr/local/bin/ffmpeg";
                psi = new ProcessStartInfo
                {
                    FileName = ffPath,
                    Arguments = $"-f avfoundation -i \":0\" -t 5 -ar 44100 -ac 1 \"{_recordingPath}\" -y",
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
            }
            // If neither sox nor ffmpeg is available, _recordProcess stays null.
            // PlaybackMicRecording() checks File.Exists so it will silently skip.

            if (psi != null)
                _recordProcess = Process.Start(psi);
        }
        catch { }
    }

    public void StopMicTest()
    {
        try
        {
            _recordProcess?.Kill();
            _recordProcess?.Dispose();
            _recordProcess = null;
        }
        catch { }
    }

    public void PlaybackMicRecording()
    {
        if (_recordingPath != null && File.Exists(_recordingPath))
        {
            try
            {
                CommandRunner.TryRun("afplay", $"\"{_recordingPath}\"");
            }
            catch { }
        }
    }

    public (bool IsConnected, string DeviceName) GetHeadphoneStatus()
    {
        try
        {
            // Check audio routing — system_profiler SPAudioDataType shows connected devices
            var audioInfo = CommandRunner.TryRun("system_profiler", "SPAudioDataType");
            var hasHeadphones = audioInfo.Contains("Headphones", StringComparison.OrdinalIgnoreCase)
                             || audioInfo.Contains("External", StringComparison.OrdinalIgnoreCase);
            return (hasHeadphones, hasHeadphones ? "Headphones" : "");
        }
        catch { return (false, ""); }
    }

    public bool PlayTestSoundToHeadphones()
    {
        try
        {
            // Play a system sound to test headphone output
            CommandRunner.TryRun("afplay", "/System/Library/Sounds/Glass.aiff");
            return true;
        }
        catch { return false; }
    }

    public void StopJackPlayback()
    {
        // No persistent playback to stop in macOS implementation
    }

    public void LaunchCameraApp()
    {
        try
        {
            // Open Photo Booth (built-in camera app)
            Process.Start(new ProcessStartInfo
            {
                FileName = "open",
                Arguments = "-a \"Photo Booth\"",
                UseShellExecute = false
            });
        }
        catch { }
    }

    public void Dispose()
    {
        StopMicTest();
        if (_recordingPath != null && File.Exists(_recordingPath))
        {
            try { File.Delete(_recordingPath); } catch { }
        }
    }
}

