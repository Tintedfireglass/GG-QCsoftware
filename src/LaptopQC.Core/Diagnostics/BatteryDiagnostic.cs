using LaptopQC.Core.Abstractions;
using LaptopQC.Hardware.Providers;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Provides battery detection and health diagnostics
/// </summary>
public class BatteryDiagnostic : IBatteryDiagnostic
{
    private readonly IWmiProvider _wmi;
    private readonly ISensorProvider? _sensors;

    public BatteryDiagnostic(IWmiProvider? wmiProvider = null, ISensorProvider? sensors = null)
    {
        _wmi = wmiProvider ?? new WmiProvider();
        _sensors = sensors;
    }

    /// <summary>
    /// Gets battery information and health
    /// </summary>
    public BatteryInfo GetInfo()
    {
        var info = new BatteryInfo();

        // Check if this is a laptop with battery
        foreach (var obj in _wmi.Query("Win32_Battery"))
        {
            info.IsPresent = true;
            info.Name = _wmi.GetValue<string>(obj, "Name", "Battery") ?? "Battery";
            info.Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown";
            info.EstimatedChargeRemaining = _wmi.GetValue<int>(obj, "EstimatedChargeRemaining", 0);
            info.BatteryStatus = MapBatteryStatus(_wmi.GetValue<int>(obj, "BatteryStatus", 0));
            break;
        }

        if (!info.IsPresent)
            return info;

        // Get detailed capacity info from BatteryFullChargedCapacity
        try
        {
            foreach (var obj in _wmi.Query("BatteryFullChargedCapacity", "root\\WMI"))
            {
                info.FullChargedCapacityMWh = _wmi.GetValue<uint>(obj, "FullChargedCapacity", 0);
                break;
            }

            foreach (var obj in _wmi.Query("BatteryStaticData", "root\\WMI"))
            {
                info.DesignedCapacityMWh = _wmi.GetValue<uint>(obj, "DesignedCapacity", 0);
                info.ManufactureName = _wmi.GetValue<string>(obj, "ManufactureName", "") ?? "";
                info.SerialNumber = _wmi.GetValue<string>(obj, "SerialNumber", "") ?? "";
                info.Chemistry = _wmi.GetValue<string>(obj, "Chemistry", "") ?? "";
                break;
            }

            // Get cycle count if available
            foreach (var obj in _wmi.Query("BatteryCycleCount", "root\\WMI"))
            {
                info.CycleCount = _wmi.GetValue<uint>(obj, "CycleCount", 0);
                break;
            }
        }
        catch
        {
            // WMI battery queries can fail on some systems
        }

        // Try LibreHardwareMonitor for additional data
        try
        {
            BatteryData? batteryData = null;
            if (_sensors != null)
            {
                batteryData = _sensors.GetBatteryData();
            }
            else
            {
                using var sensors = new SensorProvider();
                sensors.Initialize();
                batteryData = sensors.GetBatteryData();
            }
            if (batteryData != null)
            {
                if (info.DesignedCapacityMWh == 0)
                    info.DesignedCapacityMWh = batteryData.DesignedCapacity;
                if (info.FullChargedCapacityMWh == 0)
                    info.FullChargedCapacityMWh = batteryData.FullChargedCapacity;
            }
        }
        catch { }

        // Calculate wear level
        if (info.DesignedCapacityMWh > 0 && info.FullChargedCapacityMWh > 0)
        {
            info.WearLevelPercent = (int)Math.Round(
                (1 - ((double)info.FullChargedCapacityMWh / info.DesignedCapacityMWh)) * 100);
            info.HealthPercent = 100 - info.WearLevelPercent;
        }

        return info;
    }

    private string MapBatteryStatus(int status)
    {
        return status switch
        {
            1 => "Discharging",
            2 => "Charging",
            3 => "Fully Charged",
            4 => "Low",
            5 => "Critical",
            6 => "Charging (High)",
            7 => "Charging (Low)",
            8 => "Charging (Critical)",
            9 => "Undefined",
            10 => "Partially Charged",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Validates battery health
    /// </summary>
    public (bool IsHealthy, string Message) ValidateBattery(BatteryInfo info)
    {
        if (!info.IsPresent)
            return (true, "No battery (desktop system)");

        if (info.WearLevelPercent > 40)
            return (false, $"Battery wear level critical: {info.WearLevelPercent}% worn");

        if (info.WearLevelPercent > 20)
            return (true, $"Battery wear level high: {info.WearLevelPercent}% worn");

        if (info.HealthPercent.HasValue)
            return (true, $"Battery health: {info.HealthPercent}%");

        return (true, "Battery present");
    }
}

public class BatteryInfo
{
    public bool IsPresent { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "";
    public string BatteryStatus { get; set; } = "";
    public int EstimatedChargeRemaining { get; set; }
    
    // Capacity info (in mWh)
    public uint DesignedCapacityMWh { get; set; }
    public uint FullChargedCapacityMWh { get; set; }
    
    // Manufacturer info
    public string ManufactureName { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string Chemistry { get; set; } = "";
    
    // Health metrics
    public int? WearLevelPercent { get; set; }
    public int? HealthPercent { get; set; }
    public uint CycleCount { get; set; }
}
