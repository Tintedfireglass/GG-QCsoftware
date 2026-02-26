using LaptopQC.Hardware.Providers;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Service for running SMART self-tests on storage devices
/// </summary>
public class SmartTestService
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
        
        foreach (var drive in drives)
        {
            var smartData = _smartctl.GetSmartData(drive.DevicePath);
            devices.Add(new SmartDriveInfo
            {
                DevicePath = drive.DevicePath,
                Model = smartData?.Model ?? "Unknown",
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
    public async Task<SmartTestResultInfo> RunShortTestAsync(string devicePath, IProgress<SmartTestProgress>? progress = null)
    {
        var result = new SmartTestResultInfo
        {
            DevicePath = devicePath,
            TestType = "Short",
            StartTime = DateTime.Now
        };
        
        // Start the test
        var startResult = _smartctl.StartShortTest(devicePath);
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
        int maxPolls = 60; // 5 minutes max
        for (int i = 0; i < maxPolls; i++)
        {
            await Task.Delay(5000); // Poll every 5 seconds
            
            var status = _smartctl.GetTestStatus(devicePath);
            
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
                var testLog = _smartctl.GetTestLog(devicePath);
                var lastTest = testLog.FirstOrDefault();
                
                result.Success = lastTest?.Passed ?? false;
                result.Message = lastTest?.Status ?? "Test completed";
                result.EndTime = DateTime.Now;
                
                // Refresh SMART data after test
                result.PostTestData = _smartctl.GetSmartData(devicePath);
                
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
}

#region Models

public class SmartDriveInfo
{
    public string DevicePath { get; set; } = "";
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public int HealthScore { get; set; }
    public bool HealthPassed { get; set; }
    public int? Temperature { get; set; }
    public int? PowerOnHours { get; set; }
    public List<string> Warnings { get; set; } = new();
    public SmartData? SmartData { get; set; }
    
    public string HealthStatus => HealthScore switch
    {
        >= 90 => "Excellent",
        >= 70 => "Good",
        >= 50 => "Fair",
        >= 25 => "Poor",
        _ => "Critical"
    };
}

public class SmartTestProgress
{
    public string DevicePath { get; set; } = "";
    public string Status { get; set; } = "";
    public int PercentComplete { get; set; }
    public bool IsRunning { get; set; }
}

public class SmartTestResultInfo
{
    public string DevicePath { get; set; } = "";
    public string TestType { get; set; } = "";
    public bool Success { get; set; }
    public string Message { get; set; } = "";
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public TimeSpan Duration => EndTime - StartTime;
    public SmartData? PostTestData { get; set; }
}

public class SmartHealthCheckResult
{
    public DateTime CheckTime { get; set; }
    public bool SmartctlAvailable { get; set; }
    public bool OverallHealthy { get; set; }
    public string Message { get; set; } = "";
    public List<SmartDriveInfo> Devices { get; set; } = new();
}

#endregion
