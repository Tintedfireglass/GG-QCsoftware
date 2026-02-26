using LaptopQC.Core.Abstractions;
using LaptopQC.Hardware.Models;
using LaptopQC.Hardware.Providers;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Provides system information detection
/// </summary>
public class SystemDiagnostic : ISystemDiagnostic
{
    private readonly IWmiProvider _wmi;

    public SystemDiagnostic(IWmiProvider? wmiProvider = null)
    {
        _wmi = wmiProvider ?? new WmiProvider();
    }

    /// <summary>
    /// Gets basic system information
    /// </summary>
    public SystemInfo GetInfo()
    {
        var systemInfo = new SystemInfo
        {
            ComputerName = Environment.MachineName,
            OsVersion = Environment.OSVersion.ToString(),
            ScanTimestamp = DateTime.UtcNow
        };

        // Get computer system info
        foreach (var obj in _wmi.Query("Win32_ComputerSystem"))
        {
            systemInfo.Manufacturer = _wmi.GetValue<string>(obj, "Manufacturer", "Unknown") ?? "Unknown";
            systemInfo.Model = _wmi.GetValue<string>(obj, "Model", "Unknown") ?? "Unknown";
            break;
        }

        // Get BIOS info
        foreach (var obj in _wmi.Query("Win32_BIOS"))
        {
            systemInfo.BiosVersion = _wmi.GetValue<string>(obj, "SMBIOSBIOSVersion", "") ?? "";
            systemInfo.SerialNumber = _wmi.GetValue<string>(obj, "SerialNumber", "") ?? "";
            break;
        }

        // Get MAC address from primary network adapter
        foreach (var obj in _wmi.Query("Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE"))
        {
            var mac = _wmi.GetValue<string>(obj, "MACAddress", "");
            if (!string.IsNullOrEmpty(mac))
            {
                systemInfo.MacAddress = mac;
                break; // Get first active adapter's MAC
            }
        }

        return systemInfo;
    }
}
