using System.Management;

namespace LaptopQC.Hardware.Providers;

/// <summary>
/// Provides WMI query functionality for hardware detection
/// </summary>
public class WmiProvider
{
    /// <summary>
    /// Executes a WMI query and returns results
    /// </summary>
    public IEnumerable<ManagementObject> Query(string wmiClass, string[]? properties = null)
    {
        var query = properties == null || properties.Length == 0
            ? $"SELECT * FROM {wmiClass}"
            : $"SELECT {string.Join(", ", properties)} FROM {wmiClass}";

        using var searcher = new ManagementObjectSearcher(query);
        foreach (ManagementObject obj in searcher.Get())
        {
            yield return obj;
        }
    }

    /// <summary>
    /// Gets a single property value from WMI
    /// </summary>
    public T? GetValue<T>(ManagementObject obj, string propertyName, T? defaultValue = default)
    {
        try
        {
            var value = obj[propertyName];
            if (value == null) return defaultValue;

            if (typeof(T) == typeof(string))
            {
                return (T)(object)value.ToString()!.Trim();
            }

            return (T)Convert.ChangeType(value, typeof(T));
        }
        catch
        {
            return defaultValue;
        }
    }
}
