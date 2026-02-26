namespace LaptopQC.Hardware.Providers;

public interface ISensorProvider : IDisposable
{
    void Initialize();
    void Update();
    double? GetCpuTemperature();
    double? GetCpuClockSpeed();
    bool HasDiscreteGpu();
    string? GetDiscreteGpuName();
    double? GetGpuTemperature();
    double? GetGpuLoad();
    double? GetGpuClockSpeed();
    StorageSmartData? GetStorageHealth(string modelName);
    BatteryData? GetBatteryData();
}
