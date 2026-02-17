using System.Text.Json;

namespace LaptopQC.Core.Services;

public class DeviceIdService
{
    private static readonly object _lock = new();
    private const string RegistryFileName = "device_registry.json";
    private const int StartId = 30000001;

    private Dictionary<string, int> _registry;

    public DeviceIdService()
    {
        _registry = LoadRegistry();
    }

    public int GetOrGenerateDeviceId(string serialNumber)
    {
        if (string.IsNullOrWhiteSpace(serialNumber))
            return 0;

        lock (_lock)
        {
            // Reload in case another instance changed it (though unlikely in this app)
            // For now, in-memory cache is fine as we are likely the only process.
            
            if (_registry.TryGetValue(serialNumber, out int id))
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

            _registry[serialNumber] = nextId;
            SaveRegistry();
            
            return nextId;
        }
    }

    private Dictionary<string, int> LoadRegistry()
    {
        try
        {
            var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, RegistryFileName);
            if (File.Exists(path))
            {
                var json = File.ReadAllText(path);
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
            var path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, RegistryFileName);
            var json = JsonSerializer.Serialize(_registry, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
        }
        catch (Exception)
        {
            // Log error
        }
    }
}
