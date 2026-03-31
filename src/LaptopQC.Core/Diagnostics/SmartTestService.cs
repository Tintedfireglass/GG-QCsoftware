#if WINDOWS
using LaptopQC.Core.Abstractions;
using LaptopQC.Hardware.Providers;
using System.Management;
using System.Runtime.Versioning;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Service for running SMART self-tests on storage devices
/// </summary>
[SupportedOSPlatform("windows")]
public class SmartTestService : ISmartTestService
{
    private readonly ISmartctlProvider _smartctl;
    
    public SmartTestService(ISmartctlProvider? smartctl = null)
    {
        _smartctl = smartctl ?? new SmartctlProvider();
    }
    
    /// <summary>
    /// Checks if smartctl is available for SMART testing
    /// </summary>
    public bool IsAvailable => _smartctl.IsAvailable;
    
    /// <summary>
    /// Gets all drives that can be tested
    /// </summary>
    public List<SmartDriveInfo> GetTestableDevices()
    {
        var devices = new List<SmartDriveInfo>();
        var drives = _smartctl.ScanDrives();
        var usbRemovable = GetUsbRemovableInfo();
        
        foreach (var drive in drives)
        {
            if (usbRemovable.DeviceIds.Contains(NormalizeDevicePath(drive.DevicePath)))
                continue;

            var smartData = _smartctl.GetSmartData(drive.DevicePath, drive.Type);
            if (smartData != null)
            {
                var key = BuildModelSerialKey(smartData.Model, smartData.SerialNumber);
                if (usbRemovable.ModelSerials.Contains(key))
                    continue;
            }

            var model = smartData?.Model;
            if (string.IsNullOrWhiteSpace(model))
                model = drive.DevicePath;
            if (string.IsNullOrWhiteSpace(model))
                model = "Unknown";

            devices.Add(new SmartDriveInfo
            {
                DevicePath = drive.DevicePath,
                DeviceType = drive.Type ?? "",
                Model = model,
                SerialNumber = smartData?.SerialNumber ?? "",
                HealthScore = smartData?.CalculateHealthScore() ?? 0,
                HealthPassed = smartData?.HealthPassed ?? false,
                Temperature = smartData?.Temperature,
                PowerOnHours = smartData?.PowerOnHours,
                Warnings = smartData?.GetWarnings() ?? new List<string>(),
                SmartData = smartData
            });
        }
        
        return devices;
    }
    
    /// <summary>
    /// Gets SMART data for a specific device
    /// </summary>
    public SmartDriveInfo? GetDeviceInfo(string devicePath)
    {
        var smartData = _smartctl.GetSmartData(devicePath);
        if (smartData == null) return null;
        
        return new SmartDriveInfo
        {
            DevicePath = devicePath,
            Model = smartData.Model,
            SerialNumber = smartData.SerialNumber,
            HealthScore = smartData.CalculateHealthScore(),
            HealthPassed = smartData.HealthPassed,
            Temperature = smartData.Temperature,
            PowerOnHours = smartData.PowerOnHours,
            Warnings = smartData.GetWarnings(),
            SmartData = smartData
        };
    }
    
    /// <summary>
    /// Runs a short SMART self-test on the device (~2 minutes)
    /// </summary>
    public async Task<SmartTestResultInfo> RunShortTestAsync(string devicePath, IProgress<SmartTestProgress>? progress = null, string? deviceType = null)
    {
        var result = new SmartTestResultInfo
        {
            DevicePath = devicePath,
            TestType = "Short",
            StartTime = DateTime.Now
        };

        var usbRemovable = GetUsbRemovableInfo();
        if (usbRemovable.DeviceIds.Contains(NormalizeDevicePath(devicePath)))
        {
            result.Success = false;
            result.Message = "Skipped: USB removable drive";
            result.EndTime = DateTime.Now;
            return result;
        }
        
        // Start the test
        var startResult = _smartctl.StartShortTest(devicePath, deviceType);
        if (!startResult.Success)
        {
            result.Success = false;
            result.Message = startResult.Message;
            result.EndTime = DateTime.Now;
            return result;
        }
        
        progress?.Report(new SmartTestProgress
        {
            DevicePath = devicePath,
            Status = "Test started",
            PercentComplete = 0,
            IsRunning = true
        });
        
        // Poll for completion (short test typically takes ~2 minutes)
        int maxPolls = 120; // 10 minutes max
        for (int i = 0; i < maxPolls; i++)
        {
            await Task.Delay(5000); // Poll every 5 seconds
            
            var status = _smartctl.GetTestStatus(devicePath, deviceType);
            
            int percentComplete = 100 - status.PercentRemaining;
            progress?.Report(new SmartTestProgress
            {
                DevicePath = devicePath,
                Status = status.Message,
                PercentComplete = percentComplete,
                IsRunning = status.IsRunning
            });
            
            if (!status.IsRunning)
            {
                // Test completed - check result
                var testLog = _smartctl.GetTestLog(devicePath, deviceType);
                var lastTest = testLog.FirstOrDefault();
                
                result.Success = lastTest?.Passed ?? false;
                result.Message = lastTest?.Status ?? "Test completed";
                result.EndTime = DateTime.Now;
                
                // Refresh SMART data after test
                result.PostTestData = _smartctl.GetSmartData(devicePath, deviceType);
                
                return result;
            }
        }
        
        // Timeout
        result.Success = false;
        result.Message = "Test timed out";
        result.EndTime = DateTime.Now;
        return result;
    }
    
    /// <summary>
    /// Performs a quick SMART health check without running self-test
    /// </summary>
    public SmartHealthCheckResult QuickHealthCheck()
    {
        var result = new SmartHealthCheckResult
        {
            CheckTime = DateTime.Now,
            SmartctlAvailable = _smartctl.IsAvailable
        };
        
        if (!_smartctl.IsAvailable)
        {
            result.OverallHealthy = false;
            result.Message = "smartctl.exe not found. Please install smartmontools or place smartctl.exe in the tools folder.";
            return result;
        }
        
        var devices = GetTestableDevices();
        result.Devices = devices;

        if (devices.Count == 0)
        {
            result.OverallHealthy = false;
            result.Message = "No SMART-capable drives found";
            return result;
        }
        
        bool allHealthy = devices.All(d => d.HealthPassed && d.Warnings.Count == 0);
        bool anyFailing = devices.Any(d => !d.HealthPassed || d.HealthScore < 50);
        
        result.OverallHealthy = allHealthy;
        
        if (anyFailing)
            result.Message = "One or more drives have critical issues!";
        else if (!allHealthy)
            result.Message = "Some drives have warnings - review recommended";
        else
            result.Message = $"All {devices.Count} drive(s) healthy";
        
        return result;
    }

    private const long UsbFlashMaxBytes = 64L * 1024 * 1024 * 1024; // 64 GB

    [SupportedOSPlatform("windows")]
    private static UsbRemovableInfo GetUsbRemovableInfo()
    {
        var info = new UsbRemovableInfo();

        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT DeviceID, Model, SerialNumber, MediaType, InterfaceType, RemovableMedia, Size FROM Win32_DiskDrive");

            foreach (ManagementObject obj in searcher.Get())
            {
                var interfaceType = obj["InterfaceType"]?.ToString() ?? "";
                if (!interfaceType.Equals("USB", StringComparison.OrdinalIgnoreCase))
                    continue;

                var removableMedia = obj["RemovableMedia"] as bool?;
                var mediaType = obj["MediaType"]?.ToString() ?? "";
                var isRemovable = (removableMedia == true) ||
                                  mediaType.Contains("Removable", StringComparison.OrdinalIgnoreCase);

                long sizeBytes = 0;
                try
                {
                    if (obj["Size"] != null)
                        sizeBytes = Convert.ToInt64(obj["Size"]);
                }
                catch { }

                var isSmallUsb = sizeBytes > 0 && sizeBytes <= UsbFlashMaxBytes;

                if (!isRemovable && !isSmallUsb)
                    continue;

                var deviceId = obj["DeviceID"]?.ToString() ?? "";
                if (!string.IsNullOrWhiteSpace(deviceId))
                    info.DeviceIds.Add(NormalizeDevicePath(deviceId));

                var model = obj["Model"]?.ToString() ?? "";
                var serial = obj["SerialNumber"]?.ToString() ?? "";
                if (!string.IsNullOrWhiteSpace(model) && !string.IsNullOrWhiteSpace(serial))
                    info.ModelSerials.Add(BuildModelSerialKey(model, serial));
            }
        }
        catch
        {
            // Best-effort only. If WMI fails, we won't skip by removable info.
        }

        return info;
    }

    private static string NormalizeDevicePath(string? path)
    {
        return (path ?? "").Trim().ToUpperInvariant();
    }

    private static string BuildModelSerialKey(string? model, string? serial)
    {
        var m = (model ?? "").Trim().ToUpperInvariant();
        var s = (serial ?? "").Trim().ToUpperInvariant();
        return $"{m}|{s}";
    }

    private sealed class UsbRemovableInfo
    {
        public HashSet<string> DeviceIds { get; } = new();
        public HashSet<string> ModelSerials { get; } = new();
    }
}
#endif

