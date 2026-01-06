using LibreHardwareMonitor.Hardware;

namespace LaptopQC.Hardware.Providers;

public class SensorProvider : IDisposable
{
    private readonly Computer _computer;
    private bool _isInitialized;

    public SensorProvider()
    {
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsMemoryEnabled = true, // For RAM usage if needed
            IsMotherboardEnabled = true, // Sometimes temps are here
            IsStorageEnabled = true,
            IsGpuEnabled = true,
            IsBatteryEnabled = true
        };
    }

    public void Initialize()
    {
        if (!_isInitialized)
        {
            try 
            {
                _computer.Open();
                _isInitialized = true;
                
                // Debug Log
                var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "sensor_init.log");
                using var w = new StreamWriter(logPath, append: false);
                w.WriteLine($"Initialized at {DateTime.Now}");
                foreach(var h in _computer.Hardware)
                {
                    w.WriteLine($"Hardware: {h.Name} Type: {h.HardwareType}");
                    foreach(var s in h.Sensors)
                        w.WriteLine($"  Sensor: {s.Name} Type: {s.SensorType} Value: {s.Value}");
                }
            }
            catch (Exception ex)
            {
                File.WriteAllText("sensor_error.txt", ex.ToString());
            }
        }
    }

    public void Update()
    {
        if (!_isInitialized) Initialize();
        
        foreach (var hardware in _computer.Hardware)
        {
            hardware.Update();
        }
    }

    public double? GetCpuTemperature()
    {
        // Try to find CPU
        var cpu = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
        if (cpu == null) return null;

        // Debug: Log sensors if we haven't successfully found temp
        var debugLog = false;

        // 1. AMD Ryzen "Tctl/Tdie"
        var tctl = cpu.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Temperature && s.Name.Contains("Tctl"));
        if (tctl != null) return tctl.Value;

        // 2. Intel "Package"
        var package = cpu.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Temperature && s.Name.Contains("Package"));
        if (package != null) return package.Value;

        // 3. Fallback
        var anyTemp = cpu.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Temperature);
        if (anyTemp != null) return anyTemp.Value;

        // If we get here, we found NO temperature sensors. Log why.
        if (!File.Exists("temp_debug.log"))
        {
            var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "temp_debug.log");
            using var w = new StreamWriter(logPath);
            w.WriteLine($"Failed to find temp on CPU: {cpu.Name}");
            w.WriteLine($"Sensor Count: {cpu.Sensors.Length}");
            foreach(var s in cpu.Sensors)
            {
                w.WriteLine($"  S: {s.Name} [{s.SensorType}] Val: {s.Value}");
            }
        }

        return null;
    }

    public double? GetCpuClockSpeed()
    {
        var cpu = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
        if (cpu == null) return null;

        // Average of all cores
        var clockSensors = cpu.Sensors.Where(s => s.SensorType == SensorType.Clock && s.Name.Contains("Core"));
        if (!clockSensors.Any()) return null;

        return clockSensors.Average(s => s.Value);
    }

    public void Dispose()
    {
        _computer.Close();
    }
}
