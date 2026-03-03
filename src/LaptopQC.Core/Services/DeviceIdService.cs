using System.Text.Json;

namespace LaptopQC.Core.Services;

public class DeviceIdService
{
    private static readonly object _lock = new();
    private const int StartId = 3000001;
    private static readonly string RegistryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Pramaan",
        "device_registry.json"
    );

    private Dictionary<string, int> _registry;

    public DeviceIdService()
    {
        _registry = LoadRegistry();
    }

    public int GetOrGenerateDeviceId(string serialNumber)
    {
        if (string.IsNullOrWhiteSpace(serialNumber))
            return 0;
        
        var identityKey = serialNumber.Trim().ToUpperInvariant();

        lock (_lock)
        {
            if (_registry.TryGetValue(identityKey, out int id))
            {
                return id;
            }

            // Generate new ID
            int nextId = StartId;
            if (_registry.Values.Count > 0)
            {
                nextId = _registry.Values.Max() + 1;
                // Ensure we don't go below StartId if registry was manually edited or empty
                if (nextId < StartId) nextId = StartId;
            }

            _registry[identityKey] = nextId;
            SaveRegistry();
            
            return nextId;
        }
    }

    private Dictionary<string, int> LoadRegistry()
    {
        try
        {
            if (File.Exists(RegistryPath))
            {
                var json = File.ReadAllText(RegistryPath);
                return JsonSerializer.Deserialize<Dictionary<string, int>>(json) ?? new Dictionary<string, int>();
            }
        }
        catch (Exception)
        {
            // Log error or ignore
        }
        return new Dictionary<string, int>();
    }

    private void SaveRegistry()
    {
        try
        {
            var directory = Path.GetDirectoryName(RegistryPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(_registry, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(RegistryPath, json);
        }
        catch (Exception)
        {
            // Log error
        }
    }
}
