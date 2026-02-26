using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Hardware.Models;

namespace LaptopQC.Core.Diagnostics.macOS;

// ──────────────────────────────────────────────────────────────
// macOS Stub Implementations
//
// These are placeholder implementations for macOS.
// Each class throws PlatformNotSupportedException with a helpful
// message indicating what macOS API/tool should be used.
//
// To implement:
//   1. Replace the throw with actual macOS logic
//   2. Register in App.axaml.cs under the OSPlatform.OSX block
// ──────────────────────────────────────────────────────────────

public class MacSystemDiagnostic : ISystemDiagnostic
{
    public SystemInfo GetInfo()
    {
        // TODO: Use `system_profiler SPHardwareDataType` to get system info
        throw new PlatformNotSupportedException("MacSystemDiagnostic not yet implemented. Use system_profiler.");
    }
}

public class MacCpuDiagnostic : ICpuDiagnostic
{
    public CpuInfo GetInfo()
    {
        // TODO: Use `sysctl -n machdep.cpu.*` to get CPU info
        throw new PlatformNotSupportedException("MacCpuDiagnostic not yet implemented. Use sysctl.");
    }

    public (bool IsHealthy, string Message) ValidateCpu(CpuInfo cpuInfo)
    {
        if (cpuInfo.Cores == 0)
            return (false, "CPU core count could not be determined");
        if (cpuInfo.MaxClockSpeedMHz == 0)
            return (false, "CPU clock speed could not be determined");
        return (true, "CPU is functioning normally");
    }
}

public class MacRamDiagnostic : IRamDiagnostic
{
    public RamInfo GetInfo()
    {
        // TODO: Use `system_profiler SPMemoryDataType` to get RAM info
        throw new PlatformNotSupportedException("MacRamDiagnostic not yet implemented. Use system_profiler SPMemoryDataType.");
    }

    public (bool IsHealthy, string Message) ValidateRam(RamInfo ramInfo)
    {
        if (ramInfo.TotalCapacityGB == 0) return (false, "No RAM detected");
        if (ramInfo.Modules.Count == 0) return (false, "No RAM modules found");
        return (true, $"RAM: {ramInfo.TotalCapacityGB}GB across {ramInfo.Modules.Count} module(s)");
    }
}

public class MacStorageDiagnostic : IStorageDiagnostic
{
    public StorageInfo GetInfo()
    {
        // TODO: Use `system_profiler SPStorageDataType` and `diskutil list`
        throw new PlatformNotSupportedException("MacStorageDiagnostic not yet implemented. Use diskutil / system_profiler.");
    }

    public (bool IsHealthy, string Message) ValidateStorage(StorageInfo info)
    {
        if (info.Devices.Count == 0) return (false, "No storage devices detected");
        return (true, $"{info.Devices.Count} drive(s) detected");
    }
}

public class MacBatteryDiagnostic : IBatteryDiagnostic
{
    public BatteryInfo GetInfo()
    {
        // TODO: Use `pmset -g batt` and `system_profiler SPPowerDataType`
        throw new PlatformNotSupportedException("MacBatteryDiagnostic not yet implemented. Use pmset / system_profiler.");
    }

    public (bool IsHealthy, string Message) ValidateBattery(BatteryInfo info)
    {
        if (!info.IsPresent) return (true, "No battery (desktop system)");
        if (info.WearLevelPercent > 40) return (false, $"Battery wear critical: {info.WearLevelPercent}%");
        return (true, "Battery present");
    }
}

public class MacDeviceDiagnostic : IDeviceDiagnostic
{
    public DevicesInfo GetInfo()
    {
        // TODO: Use `system_profiler SPUSBDataType`, `SPDisplaysDataType`, `SPAudioDataType`, etc.
        throw new PlatformNotSupportedException("MacDeviceDiagnostic not yet implemented. Use system_profiler.");
    }

    public (bool IsHealthy, string Message) ValidateDevices(DevicesInfo info)
    {
        return (true, "Device validation not yet implemented on macOS");
    }
}

public class MacSmartTestService : ISmartTestService
{
    public bool IsAvailable => false;

    public List<SmartDriveInfo> GetTestableDevices() => new();
    public SmartDriveInfo? GetDeviceInfo(string devicePath) => null;

    public Task<SmartTestResultInfo> RunShortTestAsync(string devicePath, IProgress<SmartTestProgress>? progress = null)
    {
        // TODO: Install smartctl via Homebrew and use /usr/local/bin/smartctl
        return Task.FromResult(new SmartTestResultInfo
        {
            Success = false,
            Message = "SMART testing not yet implemented on macOS"
        });
    }

    public SmartHealthCheckResult QuickHealthCheck()
    {
        return new SmartHealthCheckResult
        {
            OverallHealthy = false,
            Message = "SMART testing not yet implemented on macOS"
        };
    }
}

public class MacAudioVideoTestService : IAudioVideoTestService
{
    // TODO: Use AVFoundation for mic/camera, `say` command for speakers
    public void TestSpeaker(bool isLeft) =>
        throw new PlatformNotSupportedException("Speaker test not yet implemented on macOS. Use 'say' command.");

    public void StartOneShotMicTest() =>
        throw new PlatformNotSupportedException("Mic test not yet implemented on macOS.");

    public void StopMicTest() { }
    public void PlaybackMicRecording() { }

    public (bool IsConnected, string DeviceName) GetHeadphoneStatus() =>
        (false, "Headphone detection not yet implemented on macOS");

    public bool PlayTestSoundToHeadphones() => false;
    public void StopJackPlayback() { }
    public void LaunchCameraApp() { }
    public void Dispose() { }
}
