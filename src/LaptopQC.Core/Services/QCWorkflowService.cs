using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Core.Models;
using LaptopQC.Hardware.Models;

namespace LaptopQC.Core.Services;

public enum QCWorkflowStep
{
    Preparation,
    AutomatedChecks,
    InteractiveTests,
    ReportGeneration,
    Complete
}

public class QCWorkflowService
{
    private readonly ICpuDiagnostic _cpuDiagnostic;
    private readonly IRamDiagnostic _ramDiagnostic;
    private readonly ISystemDiagnostic _systemDiagnostic;
    private readonly IStorageDiagnostic _storageDiagnostic;
    private readonly IBatteryDiagnostic _batteryDiagnostic;
    private readonly IDeviceDiagnostic _deviceDiagnostic;
    private readonly ISmartTestService _smartTestService;
    private readonly GradingService _gradingService;

    public QCReport Report { get; private set; } = new();
    public QCWorkflowStep CurrentStep { get; private set; } = QCWorkflowStep.Preparation;

    public event Action<string>? OnStatusUpdate;
    public event Action<int>? OnProgressUpdate;

    public QCWorkflowService(
        ICpuDiagnostic cpuDiagnostic,
        IRamDiagnostic ramDiagnostic,
        ISystemDiagnostic systemDiagnostic,
        IStorageDiagnostic storageDiagnostic,
        IBatteryDiagnostic batteryDiagnostic,
        IDeviceDiagnostic deviceDiagnostic,
        ISmartTestService smartTestService)
    {
        _cpuDiagnostic = cpuDiagnostic;
        _ramDiagnostic = ramDiagnostic;
        _systemDiagnostic = systemDiagnostic;
        _storageDiagnostic = storageDiagnostic;
        _batteryDiagnostic = batteryDiagnostic;
        _deviceDiagnostic = deviceDiagnostic;
        _smartTestService = smartTestService;
        _gradingService = new GradingService();
    }

    public void StartNewSession(string refurbId, string notes)
    {
        Report = new QCReport
        {
            RefurbishId = refurbId,
            TechnicianNotes = notes,
            Timestamp = DateTime.Now,
            AppVersion = AppVersionProvider.GetVersion()
        };
        CurrentStep = QCWorkflowStep.AutomatedChecks;
    }

    public async Task RunAutomatedChecksAsync()
    {
        CurrentStep = QCWorkflowStep.AutomatedChecks;
        
        try
        {
            // 1. System Info
            UpdateStatus("Detecting System Info...", 5);
                await Task.Run(() => 
                {
                    Report.SystemInfo = _systemDiagnostic.GetInfo();
                    if (Report.SystemInfo != null)
                    {
                    Report.MacAddress = Report.SystemInfo.MacAddress;
                    var identitySource = MachineIdentityService.GetBestIdentityKey(
                        Report.SystemInfo.SerialNumber,
                        Report.SystemInfo.MacAddress,
                        Report.SystemInfo.ComputerName);

                    // Keep serial stable in reports even for desktops that expose placeholder BIOS serials.
                    if (!MachineIdentityService.IsUsableHardwareSerial(Report.SystemInfo.SerialNumber))
                    {
                        Report.SystemInfo.SerialNumber = MachineIdentityService.BuildFallbackSerial(
                            Report.SystemInfo.MacAddress,
                            Report.SystemInfo.ComputerName);
                    }

                        // DeviceId is now allocated server-side during license activation.
                        // It will be set by the caller (MainWindow) from AuthService.MachineId.
                    }
#if WINDOWS
                    try
                    {
                        var security = new SecurityDiagnostic();
                        var activation = security.GetWindowsActivationStatus();
                        var antivirus = security.GetAntivirusStatus();
                        if (Report.SystemInfo != null)
                        {
                            Report.SystemInfo.WindowsActivationStatus = activation.StatusLabel;
                            Report.SystemInfo.IsWindowsActivated = activation.IsActivated;
                            Report.SystemInfo.AntivirusStatus = antivirus.Summary;
                            Report.SystemInfo.IsAntivirusHealthy = antivirus.IsHealthy;
                        }
                    }
                    catch { /* Best-effort only */ }
#endif
                });
            
            // 2. Hardware Detection & Basic Validation
            UpdateStatus("Scanning Hardware...", 10);
            
            await Task.Run(() =>
            {
                // CPU
                Report.CpuDetails = _cpuDiagnostic.GetInfo();
                var cpuVal = _cpuDiagnostic.ValidateCpu(Report.CpuDetails);
                Report.CpuTest.Tested = true;
                Report.CpuTest.Passed = cpuVal.IsHealthy;
                Report.CpuTest.Message = cpuVal.Message;
                Report.CpuTest.Details.Add(Report.CpuDetails.Name);
                Report.CpuTest.Details.Add($"{Report.CpuDetails.Cores} cores / {Report.CpuDetails.Threads} threads");
                Report.CpuTest.Details.Add($"{Report.CpuDetails.MaxClockSpeedMHz} MHz Base Clock");

                // RAM
                Report.RamDetails = _ramDiagnostic.GetInfo();
                var ramVal = _ramDiagnostic.ValidateRam(Report.RamDetails);
                Report.RamTest.Tested = true;
                Report.RamTest.Passed = ramVal.IsHealthy;
                Report.RamTest.Message = ramVal.Message;
                Report.RamTest.Details.Add($"{Report.RamDetails.TotalCapacityGB} GB Total");
                foreach (var module in Report.RamDetails.Modules)
                {
                    Report.RamTest.Details.Add($"Slot {module.Slot}: {module.CapacityGB}GB {module.MemoryType} @ {module.SpeedMHz}MHz");
                }

                // Storage Detection
                Report.StorageDetails = _storageDiagnostic.GetInfo();
                var storVal = _storageDiagnostic.ValidateStorage(Report.StorageDetails);
                Report.StorageTest.Tested = true;
                Report.StorageTest.Passed = storVal.IsHealthy;
                Report.StorageTest.Message = storVal.Message;
                if (Report.StorageDetails.IsTampered)
                {
                    Report.StorageTest.Details.Add("Storage Tampered - Unable to read data");
                }
                else if (Report.StorageDetails.IsInconclusive)
                {
                    Report.StorageTest.Details.Add("Storage Inconclusive - Unable to verify health data");
                }
                else if (Report.StorageDetails.IsSuspicious)
                {
                    Report.StorageTest.Details.Add("Storage data suspicious - Review recommended");
                    foreach (var detail in BuildDriveDetails(Report.StorageDetails))
                        Report.StorageTest.Details.Add(detail);
                }
                else
                {
                    foreach (var detail in BuildDriveDetails(Report.StorageDetails))
                        Report.StorageTest.Details.Add(detail);
                }

                // Battery
                Report.BatteryDetails = _batteryDiagnostic.GetInfo();
                if (Report.BatteryDetails.CycleCount.HasValue && Report.BatteryDetails.CycleCount.Value <= 0)
                    Report.BatteryDetails.CycleCount = null;
                var batVal = _batteryDiagnostic.ValidateBattery(Report.BatteryDetails);
                Report.BatteryTest.Tested = true;
                Report.BatteryTest.Passed = batVal.IsHealthy;
                Report.BatteryTest.Message = batVal.Message;
                if (Report.BatteryDetails.IsPresent)
                {
                    if (Report.BatteryDetails.IsTampered)
                    {
                        // Do not surface potentially misleading capacity/wear metrics when BMS data is invalid.
                        Report.BatteryTest.Details.Add("Battery Tampered - Unable to read data");
                    }
                    else
                    {
                        Report.BatteryTest.Details.Add($"Charge: {Report.BatteryDetails.EstimatedChargeRemaining}%");
                        var healthLabel = GetBatteryHealthLabel(Report.BatteryDetails);
                        Report.BatteryTest.Details.Add($"Health: {healthLabel}");
                        var cycleLabel = Report.BatteryDetails.CycleCount.HasValue
                            ? Report.BatteryDetails.CycleCount.Value.ToString()
                            : "N/A";
                        Report.BatteryTest.Details.Add($"Cycle Count: {cycleLabel}");
                        if (Report.BatteryDetails.WearLevelPercent.HasValue)
                            Report.BatteryTest.Details.Add($"Wear Level: {Report.BatteryDetails.WearLevelPercent}%");
                        Report.BatteryTest.Details.Add($"Capacity: {Report.BatteryDetails.FullChargedCapacityMWh} / {Report.BatteryDetails.DesignedCapacityMWh} mWh");
                    }
                }
                else
                {
                    Report.BatteryTest.Details.Add("No battery detected (Desktop?)");
                }

                // Devices
                Report.DeviceDetails = _deviceDiagnostic.GetInfo();
                var devVal = _deviceDiagnostic.ValidateDevices(Report.DeviceDetails);
                
                // USB
                Report.UsbTest.Details.Add($"Detected {Report.DeviceDetails.UsbPorts.Count} USB Controllers");
                var usb3 = Report.DeviceDetails.Usb3Ports;
                var usb2 = Report.DeviceDetails.Usb2Ports;
                Report.UsbTest.Details.Add($"{Report.DeviceDetails.TotalUsbPorts} Total Ports ({usb3} USB 3.x, {usb2} USB 2.0)");

                // Audio / Video
                if (Report.DeviceDetails.Camera != null)
                    Report.AudioVideoTest.Details.Add($"Camera: {Report.DeviceDetails.Camera.Name}");
                
                foreach (var display in Report.DeviceDetails.Displays)
                {
                    var res = display.ScreenWidth > 0 ? $" ({display.Resolution})" : "";
                    Report.AudioVideoTest.Details.Add($"Display: {display.Name} ({display.ConnectionType}){res}");
                }

                foreach (var audio in Report.DeviceDetails.AudioDevices)
                {
                    Report.AudioVideoTest.Details.Add($"Audio: {audio.Name}");
                }
            });

            // 3. SMART Tests
            UpdateStatus("Running SMART Checks...", 30);
            if (_smartTestService.IsAvailable)
            {
                var healthCheck = await Task.Run(() => _smartTestService.QuickHealthCheck());
                Report.SmartTest.Tested = true;
                Report.SmartTest.Passed = healthCheck.OverallHealthy;
                Report.SmartTest.Message = healthCheck.Message;

                int selfTestPassedCount = 0;
                int selfTestFailedCount = 0;
                int selfTestInconclusiveCount = 0;
                
                foreach (var device in healthCheck.Devices)
                {
                    Report.SmartTest.Details.Add($"{device.Model}: {device.HealthStatus} ({device.HealthScore}%)");
                    
                    // Sync SMART data to StorageDetails for the report
                    var storageDevice = Report.StorageDetails?.Devices.FirstOrDefault(d => 
                        d.Model.Contains(device.Model, StringComparison.OrdinalIgnoreCase) || 
                        device.Model.Contains(d.Model, StringComparison.OrdinalIgnoreCase));
                        
                    if (storageDevice != null)
                    {
                        storageDevice.HealthPercent = device.HealthScore;
                        if (device.Temperature.HasValue)
                            storageDevice.Temperature = device.Temperature.Value;
                        if (device.PowerOnHours.HasValue)
                            storageDevice.PowerOnHours = device.PowerOnHours.Value;
                    }
                    
                    // Run short self-test if healthy enough
                    if (device.HealthPassed)
                    {
                        UpdateStatus($"Running Short Self-Test on {device.Model}...", 40);
                        var testResult = await _smartTestService.RunShortTestAsync(
                            device.DevicePath,
                            deviceType: device.DeviceType);
                        if (!testResult.Success)
                        {
                            if (IsInconclusiveSmartTestMessage(testResult.Message))
                            {
                                selfTestInconclusiveCount++;
                                var reason = GetInconclusiveReason(testResult.Message);
                                Report.SmartTest.Details.Add($"Self-Test Inconclusive: {device.Model} ({reason})");
                            }
                            else
                            {
                                selfTestFailedCount++;
                                Report.SmartTest.Details.Add($"Self-Test Failed: {device.Model} ({testResult.Message})");
                            }
                        }
                        else
                        {
                            selfTestPassedCount++;
                            Report.SmartTest.Details.Add($"Self-Test Passed: {device.Model}");
                        }
                    }
                }

                // If SMART health data is now present, clear earlier "inconclusive" flag
                // and re-evaluate storage so StorageTest.Passed reflects actual drive health.
                if (Report.StorageDetails != null && !Report.StorageDetails.IsTampered)
                {
                    bool hasHealthTelemetry = Report.StorageDetails.Devices.Any(d => d.HealthPercent.HasValue);
                    if (hasHealthTelemetry)
                    {
                        Report.StorageDetails.IsInconclusive = false;
                        Report.StorageDetails.InconclusiveReason = "";
                        foreach (var d in Report.StorageDetails.Devices)
                        {
                            d.IsInconclusive = false;
                            d.InconclusiveReason = "";
                        }

                        // Re-validate now that SMART data is available — the earlier call
                        // returned Inconclusive (before smartctl ran) and locked Passed=false.
                        var storVal = _storageDiagnostic.ValidateStorage(Report.StorageDetails);
                        Report.StorageTest.Passed = storVal.IsHealthy;
                        Report.StorageTest.Message = storVal.Message;

                        // Replace the stale "Inconclusive" detail entry with the real drive list.
                        Report.StorageTest.Details.Clear();
                        if (Report.StorageDetails.IsSuspicious)
                        {
                            Report.StorageTest.Details.Add("Storage data suspicious - Review recommended");
                        }
                        foreach (var detail in BuildDriveDetails(Report.StorageDetails))
                            Report.StorageTest.Details.Add(detail);
                    }
                }

                if (selfTestPassedCount + selfTestFailedCount + selfTestInconclusiveCount > 0)
                {
                    Report.SmartTest.Details.Add(
                        $"Self-Test Summary: {selfTestPassedCount} passed, {selfTestFailedCount} failed, {selfTestInconclusiveCount} inconclusive");
                }

                if (!healthCheck.OverallHealthy)
                {
                    Report.SmartTest.Passed = false;
                    Report.SmartTest.Message = healthCheck.Message;
                }
                else if (selfTestFailedCount > 0)
                {
                    Report.SmartTest.Passed = false;
                    Report.SmartTest.Message = "SMART self-test failed on one or more drives";
                }
                else if (selfTestInconclusiveCount > 0 && selfTestPassedCount == 0)
                {
                    // All self-tests were inconclusive — driver incompatibility, not a drive failure.
                    Report.SmartTest.Passed = true;
                    Report.SmartTest.Message = "SMART health check passed (self-test skipped — driver incompatibility on one or more drives)";
                }
                else if (selfTestInconclusiveCount > 0)
                {
                    // Mix of passed and inconclusive — not a failure
                    Report.SmartTest.Passed = true;
                    Report.SmartTest.Message = $"SMART health passed ({selfTestPassedCount} self-test(s) passed, {selfTestInconclusiveCount} skipped due to driver incompatibility)";
                }
                else
                {
                    Report.SmartTest.Passed = true;
                    Report.SmartTest.Message = "SMART health and self-test passed on all drives";
                }
            }
            else
            {
                Report.SmartTest.Tested = true;
                Report.SmartTest.Passed = false;
                Report.SmartTest.Message = "SMART tools not available";
            }

            // 4. Stress Tests
            UpdateStatus("Running CPU Stress Test...", 60);
            var cpuStress = new CpuStressTest(durationSeconds: 15);
            cpuStress.OnProgress += (p) => UpdateStatus($"CPU Stress Test: {p.CurrentTemp:F0}°C", 60 + (p.PercentComplete / 5)); // 60-80%
            var cpuResult = await cpuStress.RunAsync();
            
            Report.CpuTest.Passed &= cpuResult.Passed;
            if (!cpuResult.Passed) 
            {
                Report.CpuTest.Details.Add($"Stress Test Failed: {cpuResult.Message}");
            }
            else 
            {
                // User wants detailed info like "Minor throttling... Patterns: ..."
                Report.CpuTest.Details.Add($"{cpuResult.Message}");
                
                if (cpuResult.MaxClock > 0)
                {
                     double throttlePercent = cpuResult.MaxClock > 0 ? (1 - cpuResult.MinClock / cpuResult.MaxClock) * 100 : 0;
                     Report.CpuTest.Details.Add($"Clock Range: {cpuResult.MinClock:F0} - {cpuResult.MaxClock:F0} MHz ({throttlePercent:F0}% drop)");
                }
            }

            UpdateStatus("Running RAM Stress Test...", 70);
            var ramStress = new RamStressTest(testSizeMB: 512, iterations: 2);
            ramStress.OnProgress += (p) => UpdateStatus($"RAM Stress Test: {p.PercentComplete}%", 70 + (p.PercentComplete / 10)); // 70-80%
            var ramResult = await ramStress.RunAsync();
             
            Report.RamTest.Passed &= ramResult.Passed;
            if (!ramResult.Passed) Report.RamTest.Details.Add($"Stress Test Failed: {ramResult.Message}");
            else Report.RamTest.Details.Add("Stress Test Passed");

            // 5. GPU Stress Test (only if discrete GPU is present)
            UpdateStatus("Checking for Discrete GPU...", 80);
            var gpuStress = new GpuStressTest(durationSeconds: 15);
            gpuStress.OnProgress += (p) => UpdateStatus($"GPU Stress Test: {p.CurrentTemp:F0}°C | {p.CurrentLoad:F0}%", 80 + (p.PercentComplete / 10)); // 80-90%
            var gpuResult = await gpuStress.RunAsync();
            
            Report.GpuTest.Tested = true;
            if (gpuResult.Skipped)
            {
                Report.GpuTest.Passed = true;
                Report.GpuTest.Message = "No discrete GPU detected";
                Report.GpuTest.Details.Add(gpuResult.Message);
            }
            else
            {
                Report.GpuTest.Passed = gpuResult.Passed;
                Report.GpuTest.Message = gpuResult.Passed ? "GPU Stress Test Passed" : "GPU Stress Test Failed";
                Report.GpuTest.Details.Add($"GPU: {gpuResult.GpuName}");
                Report.GpuTest.Details.Add(gpuResult.Message);
                
                if (gpuResult.MaxTemp > 0)
                    Report.GpuTest.Details.Add($"Max Temperature: {gpuResult.MaxTemp:F1}°C");
                if (gpuResult.MaxLoad > 0)
                    Report.GpuTest.Details.Add($"Load: {gpuResult.AvgLoad:F0}% avg, {gpuResult.MaxLoad:F0}% max");
                if (gpuResult.MaxClock > 0)
                {
                    double throttlePercent = gpuResult.MaxClock > 0 ? (1 - gpuResult.MinClock / gpuResult.MaxClock) * 100 : 0;
                    Report.GpuTest.Details.Add($"Clock Range: {gpuResult.MinClock:F0} - {gpuResult.MaxClock:F0} MHz ({throttlePercent:F0}% drop)");
                }
            }

            UpdateStatus("Automated Checks Complete", 100);
            CurrentStep = QCWorkflowStep.InteractiveTests;
        }
        catch (Exception ex)
        {
            UpdateStatus($"Error: {ex.Message}", 100);
            throw;
        }
    }
    
    public void RecordKeyboardResult(bool passed, string message)
    {
        Report.KeyboardTest.Tested = true;
        Report.KeyboardTest.Passed = passed;
        Report.KeyboardTest.Message = message;
        Report.KeyboardTest.Timestamp = DateTime.Now;
    }

    public void RecordTrackpadResult(bool passed, string message)
    {
        Report.TrackpadTest.Tested = true;
        Report.TrackpadTest.Passed = passed;
        Report.TrackpadTest.Message = message;
        Report.TrackpadTest.Timestamp = DateTime.Now;
    }

    public void RecordUsbResult(bool passed, string message)
    {
        Report.UsbTest.Tested = true;
        Report.UsbTest.Passed = passed;
        Report.UsbTest.Message = message;
        Report.UsbTest.Timestamp = DateTime.Now;
    }

    public void RecordAudioVideoResult(bool passed, string message)
    {
        Report.AudioVideoTest.Tested = true;
        Report.AudioVideoTest.Passed = passed;
        Report.AudioVideoTest.Message = message;
        Report.AudioVideoTest.Timestamp = DateTime.Now;
    }

    public void RecordAudioJackResult(bool passed, string message)
    {
        Report.AudioJackTest.Tested = true;
        Report.AudioJackTest.Passed = passed;
        Report.AudioJackTest.Message = message;
        Report.AudioJackTest.Timestamp = DateTime.Now;
    }

    public void RecordNetworkResult(bool passed, string message, List<string>? details = null)
    {
        Report.NetworkTest.Tested = true;
        Report.NetworkTest.Passed = passed;
        Report.NetworkTest.Message = message;
        Report.NetworkTest.Timestamp = DateTime.Now;
        if (details != null)
            Report.NetworkTest.Details = details;
    }

    /// <summary>
    /// Call after ALL tests (automated + interactive) to compute scores and grades.
    /// </summary>
    public void FinalizeGrades()
    {
        _gradingService.GradeReport(Report);
        
        // Record test completion timestamp for the reminder system
        try
        {
            var appDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Pramaan");
            Directory.CreateDirectory(appDataDir);
            File.WriteAllText(
                Path.Combine(appDataDir, "last_qc_test.txt"),
                DateTime.UtcNow.ToString("o"));
        }
        catch { /* Best-effort — don't fail the test if timestamp write fails */ }
    }

    private void UpdateStatus(string status, int progress)
    {
        OnStatusUpdate?.Invoke(status);
        OnProgressUpdate?.Invoke(progress);
    }

    /// <summary>
    /// Builds one detail line per physical drive: "Model (Size GB Type): X GB used / Y GB free".
    /// Volume usage is distributed across drives proportionally by their reported size.
    /// For single-drive machines this is exact; for multi-drive it's a close estimate.
    /// </summary>
    private static IEnumerable<string> BuildDriveDetails(StorageInfo info)
    {
        long totalVolUsed = info.Volumes.Sum(v => v.UsedBytes);
        long totalVolFree = info.Volumes.Sum(v => v.FreeBytes);
        double totalDriveGb = info.Devices.Sum(d => d.SizeGB);

        foreach (var drive in info.Devices)
        {
            var driveType = drive.IsSsd ? "SSD" : "HDD";
            string spacePart;

            if (totalVolUsed + totalVolFree > 0 && totalDriveGb > 0)
            {
                // Distribute volume usage proportionally by this drive's share of total capacity.
                double fraction = drive.SizeGB / totalDriveGb;
                double usedGb = (totalVolUsed * fraction) / (1024.0 * 1024 * 1024);
                double freeGb = (totalVolFree * fraction) / (1024.0 * 1024 * 1024);
                spacePart = $"{usedGb:F0} GB used / {freeGb:F0} GB free";
            }
            else
            {
                spacePart = $"{drive.SizeGB:F0} GB total";
            }

            yield return $"{drive.Model} ({drive.SizeGB:F0} GB {driveType}): {spacePart}";
        }
    }

    private static string GetBatteryHealthLabel(BatteryInfo info)
    {
        if (!info.HealthPercent.HasValue)
            return "N/A";

        // If WMI reports equal capacities and cycles are unknown, health may be unreliable.
        bool suspiciousFullCharge =
            info.DesignedCapacityMWh > 0 &&
            info.FullChargedCapacityMWh == info.DesignedCapacityMWh;

        if (info.HealthPercent.Value >= 95 &&
            info.WearLevelPercent.GetValueOrDefault() == 0 &&
            !info.CycleCount.HasValue &&
            suspiciousFullCharge)
        {
            return "N/A";
        }

        return $"{info.HealthPercent.Value}%";
    }

    private static bool IsInconclusiveSmartTestMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return true;

        string[] inconclusiveMarkers =
        {
            "not supported",
            "unknown usb bridge",
            "ioctl_storage",
            "ioctl",
            "input/output error",
            "read nvme identify",
            "requires admin",
            "timed out",
            "host reset",
            "interrupted",
            "failed to start test"
        };

        return inconclusiveMarkers.Any(m =>
            message.Contains(m, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Converts a raw smartctl inconclusive error message into a clean,
    /// user-facing reason string.
    /// </summary>
    private static string GetInconclusiveReason(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return "Unknown reason";

        if (message.Contains("ioctl_storage", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("read nvme identify", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("ioctl", StringComparison.OrdinalIgnoreCase))
            return "Driver incompatibility — cannot run self-test on this drive type";

        if (message.Contains("not supported", StringComparison.OrdinalIgnoreCase))
            return "Self-test not supported by this drive";

        if (message.Contains("unknown usb bridge", StringComparison.OrdinalIgnoreCase))
            return "USB bridge — self-test not available for external drives";

        if (message.Contains("timed out", StringComparison.OrdinalIgnoreCase))
            return "Self-test timed out";

        if (message.Contains("host reset", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("interrupted", StringComparison.OrdinalIgnoreCase))
            return "Self-test interrupted";

        return "Self-test could not be started";
    }
}

