#if WINDOWS
using LaptopQC.Core.Abstractions;
using LaptopQC.Hardware.Providers;
using System.Management;
using System.IO;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Provides storage device detection and SMART health diagnostics
/// </summary>
public class StorageDiagnostic : IStorageDiagnostic
{
    private readonly IWmiProvider _wmi;
    private readonly ISensorProvider? _sensors;

    public StorageDiagnostic(IWmiProvider? wmiProvider = null, ISensorProvider? sensors = null)
    {
        _wmi = wmiProvider ?? new WmiProvider();
        _sensors = sensors;
    }

    /// <summary>
    /// Gets information about all storage devices
    /// </summary>
    public StorageInfo GetInfo()
    {
        var info = new StorageInfo();
        
        // Get physical disks
        foreach (var obj in _wmi.Query("Win32_DiskDrive"))
        {
            var device = new StorageDevice
            {
                Model = _wmi.GetValue<string>(obj, "Model", "Unknown") ?? "Unknown",
                SerialNumber = _wmi.GetValue<string>(obj, "SerialNumber", "")?.Trim() ?? "",
                InterfaceType = _wmi.GetValue<string>(obj, "InterfaceType", "Unknown") ?? "Unknown",
                MediaType = _wmi.GetValue<string>(obj, "MediaType", "")?.Trim() ?? "",
                SizeBytes = _wmi.GetValue<ulong>(obj, "Size", 0),
                DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? ""
            };

            // Determine if SSD or HDD
            device.IsSsd = DetectSsd(device);
            device.SizeGB = device.SizeBytes / (1024.0 * 1024 * 1024);

            info.Devices.Add(device);
        }

        // Get logical drive usage (used / free)
        try
        {
            foreach (var drive in DriveInfo.GetDrives())
            {
                if (!drive.IsReady) continue;
                if (drive.DriveType != DriveType.Fixed) continue;

                var total = drive.TotalSize;
                var free = drive.TotalFreeSpace;
                var used = total - free;
                var usedPercent = total > 0 ? (used / (double)total) * 100.0 : 0;

                info.Volumes.Add(new StorageVolume
                {
                    Name = drive.Name.TrimEnd('\\'),
                    Label = drive.VolumeLabel ?? "",
                    FileSystem = drive.DriveFormat ?? "",
                    TotalBytes = total,
                    FreeBytes = free,
                    UsedBytes = used,
                    UsedPercent = usedPercent
                });
            }
        }
        catch { /* Best-effort only */ }

        // Get SMART data from LibreHardwareMonitor
        try
        {
            if (_sensors != null)
            {
                EnrichWithSmartData(info, _sensors);
            }
            else
            {
                using var sensors = new SensorProvider();
                sensors.Initialize();
                EnrichWithSmartData(info, sensors);
            }
        }
        catch { /* Ignore SMART failures */ }

        EvaluateTamperState(info);

        return info;
    }

    private bool DetectSsd(StorageDevice device)
    {
        var model = device.Model.ToLower();
        var mediaType = device.MediaType.ToLower();
        
        // SSD indicators
        if (mediaType.Contains("ssd") || mediaType.Contains("solid"))
            return true;
        if (model.Contains("ssd") || model.Contains("nvme") || model.Contains("m.2"))
            return true;
        if (device.InterfaceType.Equals("NVMe", StringComparison.OrdinalIgnoreCase))
            return true;
            
        // HDD indicators
        if (mediaType.Contains("hdd") || mediaType.Contains("hard"))
            return false;
            
        // Default: assume SSD for modern systems
        return true;
    }

    private void EnrichWithSmartData(StorageInfo info, ISensorProvider sensors)
    {
        // LibreHardwareMonitor populates storage SMART data
        // We access it through the sensor interface
        foreach (var device in info.Devices)
        {
            var smartData = sensors.GetStorageHealth(device.Model);
            if (smartData != null)
            {
                device.HealthPercent = smartData.HealthPercent;
                device.Temperature = smartData.Temperature;
                device.PowerOnHours = smartData.PowerOnHours;
                device.TotalBytesWritten = smartData.TotalBytesWritten;
            }
        }
    }

    /// <summary>
    /// Validates storage health
    /// </summary>
    public (bool IsHealthy, string Message) ValidateStorage(StorageInfo info)
    {
        if (info.Devices.Count == 0)
            return (false, "No storage devices detected");

        if (info.IsTampered)
            return (false, string.IsNullOrWhiteSpace(info.TamperReason) ? "Storage Tampered - Unable to read data" : info.TamperReason);

        if (info.IsInconclusive)
            return (false, string.IsNullOrWhiteSpace(info.InconclusiveReason) ? "Storage Inconclusive - Unable to verify health data" : info.InconclusiveReason);

        foreach (var device in info.Devices)
        {
            if (device.HealthPercent.HasValue && device.HealthPercent < 50)
                return (false, $"Drive health critical: {device.Model} at {device.HealthPercent}%");
                
            if (device.Temperature.HasValue && device.Temperature > 60)
                return (false, $"Drive temperature high: {device.Model} at {device.Temperature}°C");
        }

        if (info.IsSuspicious)
            return (true, string.IsNullOrWhiteSpace(info.SuspiciousReason) ? "Storage data suspicious - Review recommended" : info.SuspiciousReason);

        return (true, $"{info.Devices.Count} drive(s) healthy");
    }

    private static void EvaluateTamperState(StorageInfo info)
    {
        bool allMissingSmartTelemetry = info.Devices.Count > 0;
        foreach (var device in info.Devices)
        {
            bool hasSmartTelemetry = device.HealthPercent.HasValue || device.Temperature.HasValue || device.PowerOnHours.HasValue || device.TotalBytesWritten.HasValue;
            allMissingSmartTelemetry &= !hasSmartTelemetry;

            bool invalidHealth = device.HealthPercent.HasValue && (device.HealthPercent.Value < 0 || device.HealthPercent.Value > 100);
            bool invalidTemp = device.Temperature.HasValue && (device.Temperature.Value < -10 || device.Temperature.Value > 120);
            bool invalidPowerHours = device.PowerOnHours.HasValue && device.PowerOnHours.Value < 0;
            bool invalidSize = device.SizeGB <= 0;

            if (invalidHealth || invalidTemp || invalidPowerHours || invalidSize)
            {
                device.IsTampered = true;
                device.TamperReason = "Storage Tampered - Unable to read data";
                info.IsTampered = true;
                info.TamperReason = "Storage Tampered - Unable to read data";
            }

            bool suspiciousPlaceholderTemp =
                device.Temperature.HasValue &&
                device.Temperature.Value == 0 &&
                device.PowerOnHours.HasValue &&
                device.PowerOnHours.Value > 1000;
            bool suspiciousPerfectHealth =
                device.HealthPercent.HasValue &&
                device.HealthPercent.Value == 100 &&
                device.PowerOnHours.HasValue &&
                device.PowerOnHours.Value > 20000;

            if (!info.IsTampered && (suspiciousPlaceholderTemp || suspiciousPerfectHealth))
            {
                device.IsSuspicious = true;
                device.SuspiciousReason = "Storage data suspicious - Review recommended";
                info.IsSuspicious = true;
                if (string.IsNullOrWhiteSpace(info.SuspiciousReason))
                    info.SuspiciousReason = "Storage data suspicious - Review recommended";
            }
        }

        if (!info.IsTampered && allMissingSmartTelemetry)
        {
            info.IsInconclusive = true;
            info.InconclusiveReason = "Storage Inconclusive - Unable to verify health data";
            foreach (var device in info.Devices)
            {
                device.IsInconclusive = true;
                device.InconclusiveReason = info.InconclusiveReason;
            }
        }
    }
}
#endif

