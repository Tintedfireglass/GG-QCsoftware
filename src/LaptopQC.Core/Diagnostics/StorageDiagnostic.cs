using LaptopQC.Hardware.Providers;
using System.Management;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Provides storage device detection and SMART health diagnostics
/// </summary>
public class StorageDiagnostic
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

        foreach (var device in info.Devices)
        {
            if (device.HealthPercent.HasValue && device.HealthPercent < 50)
                return (false, $"Drive health critical: {device.Model} at {device.HealthPercent}%");
                
            if (device.Temperature.HasValue && device.Temperature > 60)
                return (false, $"Drive temperature high: {device.Model} at {device.Temperature}°C");
        }

        return (true, $"{info.Devices.Count} drive(s) healthy");
    }
}

public class StorageInfo
{
    public List<StorageDevice> Devices { get; set; } = new();
    public double TotalCapacityGB => Devices.Sum(d => d.SizeGB);
}

public class StorageDevice
{
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string InterfaceType { get; set; } = "";
    public string MediaType { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public ulong SizeBytes { get; set; }
    public double SizeGB { get; set; }
    public bool IsSsd { get; set; }
    
    // SMART data
    public int? HealthPercent { get; set; }
    public int? Temperature { get; set; }
    public int? PowerOnHours { get; set; }
    public long? TotalBytesWritten { get; set; }
}
