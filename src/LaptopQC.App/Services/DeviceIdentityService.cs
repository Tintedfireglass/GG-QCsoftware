using System.Management;
using System.Net.NetworkInformation;
using LaptopQC.Core.Services;

namespace LaptopQC.App.Services;

public static class DeviceIdentityService
{
    public static string GetMachineSerialNumber()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString()?.Trim();
                if (MachineIdentityService.IsUsableHardwareSerial(serial))
                {
                    return serial!;
                }
            }
        }
        catch { /* Ignore WMI errors */ }

        try
        {
            var networkMac = GetMacAddress();
            var fallback = MachineIdentityService.BuildFallbackSerial(networkMac, Environment.MachineName);
            if (!string.IsNullOrWhiteSpace(fallback))
            {
                return fallback;
            }
        }
        catch { /* Ignore adapter access failures */ }

        return MachineIdentityService.BuildFallbackSerial(string.Empty, Environment.MachineName);
    }

    public static string? GetMacAddress()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                            n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Select(n => n.GetPhysicalAddress()?.ToString())
                .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));
        }
        catch
        {
            return null;
        }
    }

    public static string GetComputerName() => Environment.MachineName;
}
