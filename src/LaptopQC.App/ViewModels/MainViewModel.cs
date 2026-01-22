using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Hardware.Models;
using System.Collections.ObjectModel;

namespace LaptopQC.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly CpuDiagnostic _cpuDiagnostic;
    private readonly RamDiagnostic _ramDiagnostic;
    private readonly SystemDiagnostic _systemDiagnostic;
    private readonly StorageDiagnostic _storageDiagnostic;
    private readonly BatteryDiagnostic _batteryDiagnostic;
    private readonly DeviceDiagnostic _deviceDiagnostic;
    private readonly SmartTestService _smartTestService;

    [ObservableProperty]
    private SystemInfo? _systemInfo;

    [ObservableProperty]
    private CpuInfo? _cpuInfo;

    [ObservableProperty]
    private RamInfo? _ramInfo;

    [ObservableProperty]
    private StorageInfo? _storageInfo;

    [ObservableProperty]
    private BatteryInfo? _batteryInfo;

    [ObservableProperty]
    private DevicesInfo? _devicesInfo;

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private string _statusMessage = "Ready to scan";

    [ObservableProperty]
    private string _cpuStatus = "";

    [ObservableProperty]
    private string _ramStatus = "";

    [ObservableProperty]
    private string _storageStatus = "";

    [ObservableProperty]
    private string _batteryStatus = "";

    [ObservableProperty]
    private string _devicesStatus = "";

    [ObservableProperty]
    private bool _isSmartTestRunning;

    [ObservableProperty]
    private string _smartTestStatus = "";

    [ObservableProperty]
    private int _smartTestProgress;

    [ObservableProperty]
    private bool _smartctlAvailable;

    public ObservableCollection<DiagnosticResult> Results { get; } = new();

    public MainViewModel()
    {
        _cpuDiagnostic = new CpuDiagnostic();
        _ramDiagnostic = new RamDiagnostic();
        _systemDiagnostic = new SystemDiagnostic();
        _storageDiagnostic = new StorageDiagnostic();
        _batteryDiagnostic = new BatteryDiagnostic();
        _deviceDiagnostic = new DeviceDiagnostic();
        _smartTestService = new SmartTestService();
        
        // Check if smartctl is available
        SmartctlAvailable = _smartTestService.IsAvailable;
    }

    [RelayCommand]
    private void OpenKeyboardTest()
    {
        var keyboardWindow = new Views.KeyboardTestWindow
        {
            Owner = App.Current.MainWindow
        };

        StatusMessage = "Testing keyboard... Press all keys.";
        
        var result = keyboardWindow.ShowDialog();
        
        if (result.HasValue)
        {
            var (passed, message) = keyboardWindow.GetResult();
            AddResult("Keyboard", "Key Test", passed, message);
            DevicesStatus = passed ? "✓ Keyboard test passed" : $"✗ Keyboard: {message}";
            StatusMessage = passed ? "Keyboard test passed!" : "Keyboard test failed";
        }
        else
        {
            StatusMessage = "Keyboard test cancelled";
        }
    }

    [RelayCommand]
    private void OpenAudioVideoTest()
    {
        var avWindow = new Views.AudioVideoTestWindow
        {
            Owner = App.Current.MainWindow
        };

        StatusMessage = "Testing Audio/Video... Follow on-screen instructions.";

        var result = avWindow.ShowDialog();

        if (avWindow.DataContext is AudioVideoTestViewModel vm)
        {
            if (vm.IsComplete) 
            {
                AddResult("Devices", "A/V Test", vm.Passed, vm.ResultMessage);
                StatusMessage = vm.Passed ? "A/V test passed!" : "A/V test failed";
            }
            else
            {
                StatusMessage = "A/V test cancelled";
            }
        }
    }

    [RelayCommand]
    private void OpenTrackpadTest()
    {
        var trackpadWindow = new Views.TrackpadTestWindow
        {
            Owner = App.Current.MainWindow
        };

        StatusMessage = "Testing trackpad... Move, click, and scroll.";
        
        var result = trackpadWindow.ShowDialog();
        
        if (result.HasValue)
        {
            var (passed, message) = trackpadWindow.GetResult();
            AddResult("Trackpad", "Input Test", passed, message);
            DevicesStatus = passed ? "✓ Trackpad test passed" : $"✗ Trackpad: {message}";
            StatusMessage = passed ? "Trackpad test passed!" : "Trackpad test failed";
        }
        else
        {
            StatusMessage = "Trackpad test cancelled";
        }
    }

    [RelayCommand]
    private void OpenUsbPortTest()
    {
        var usbWindow = new Views.UsbPortTestWindow
        {
            Owner = App.Current.MainWindow
        };

        StatusMessage = "Testing USB ports... Plug devices into each port.";
        
        var result = usbWindow.ShowDialog();
        
        if (result.HasValue)
        {
            var (passed, message) = usbWindow.GetResult();
            AddResult("Devices", "USB Port Test", passed, message);
            DevicesStatus = passed ? "✓ USB port test passed" : $"✗ USB: {message}";
            StatusMessage = passed ? "USB port test passed!" : "USB port test failed";
        }
        else
        {
            StatusMessage = "USB port test cancelled";
        }
    }

    [RelayCommand]
    private async Task RunDiagnosticsAsync()
    {
        IsScanning = true;
        StatusMessage = "Scanning hardware...";

        try
        {
            await Task.Run(() =>
            {
                // System Info
                SystemInfo = _systemDiagnostic.GetInfo();
                AddResult("System", "Detection", true, $"{SystemInfo.Manufacturer} {SystemInfo.Model}");

                // CPU
                CpuInfo = _cpuDiagnostic.GetInfo();
                var cpuValidation = _cpuDiagnostic.ValidateCpu(CpuInfo);
                CpuStatus = cpuValidation.Message;
                AddResult("CPU", "Detection", cpuValidation.IsHealthy, CpuInfo.Name);
                AddResult("CPU", "Cores/Threads", true, $"{CpuInfo.Cores} cores / {CpuInfo.Threads} threads");
                AddResult("CPU", "Clock Speed", true, $"{CpuInfo.MaxClockSpeedMHz} MHz");

                // RAM
                RamInfo = _ramDiagnostic.GetInfo();
                var ramValidation = _ramDiagnostic.ValidateRam(RamInfo);
                RamStatus = ramValidation.Message;
                AddResult("RAM", "Detection", ramValidation.IsHealthy, $"{RamInfo.TotalCapacityGB} GB Total");
                
                foreach (var module in RamInfo.Modules)
                {
                    AddResult("RAM", $"Slot {module.Slot}", true, 
                        $"{module.CapacityGB}GB {module.MemoryType} @ {module.SpeedMHz}MHz");
                }

                // Storage
                StorageInfo = _storageDiagnostic.GetInfo();
                var storageValidation = _storageDiagnostic.ValidateStorage(StorageInfo);
                StorageStatus = storageValidation.Message;
                
                foreach (var device in StorageInfo.Devices)
                {
                    var deviceType = device.IsSsd ? "SSD" : "HDD";
                    var health = device.HealthPercent.HasValue ? $" ({device.HealthPercent}% health)" : "";
                    AddResult("Storage", deviceType, true, $"{device.Model} - {device.SizeGB:F0}GB{health}");
                }
                AddResult("Storage", "Total", storageValidation.IsHealthy, $"{StorageInfo.TotalCapacityGB:F0} GB");

                // Battery
                BatteryInfo = _batteryDiagnostic.GetInfo();
                var batteryValidation = _batteryDiagnostic.ValidateBattery(BatteryInfo);
                BatteryStatus = batteryValidation.Message;
                
                if (BatteryInfo.IsPresent)
                {
                    AddResult("Battery", "Status", true, BatteryInfo.BatteryStatus);
                    AddResult("Battery", "Charge", true, $"{BatteryInfo.EstimatedChargeRemaining}%");
                    
                    if (BatteryInfo.HealthPercent.HasValue)
                        AddResult("Battery", "Health", BatteryInfo.HealthPercent >= 60, $"{BatteryInfo.HealthPercent}%");
                    
                    if (BatteryInfo.WearLevelPercent.HasValue)
                        AddResult("Battery", "Wear Level", BatteryInfo.WearLevelPercent <= 30, $"{BatteryInfo.WearLevelPercent}% worn");
                    
                    if (BatteryInfo.CycleCount > 0)
                        AddResult("Battery", "Cycle Count", BatteryInfo.CycleCount < 500, $"{BatteryInfo.CycleCount} cycles");
                }
                else
                {
                    AddResult("Battery", "Status", true, "No battery (Desktop)");
                }

                // Devices (Keyboard, Trackpad, USB, Webcam, etc.)
                DevicesInfo = _deviceDiagnostic.GetInfo();
                var deviceValidation = _deviceDiagnostic.ValidateDevices(DevicesInfo);
                DevicesStatus = deviceValidation.Message;
                
                // Input Devices
                foreach (var input in DevicesInfo.InputDevices)
                {
                    var typeLabel = input.Type switch
                    {
                        InputDeviceType.Keyboard => "Keyboard",
                        InputDeviceType.Trackpad => "Trackpad",
                        InputDeviceType.Mouse => "Mouse",
                        InputDeviceType.Touchscreen => "Touchscreen",
                        _ => "Input"
                    };
                    AddResult("Devices", typeLabel, input.IsWorking, input.Name);
                }

                // USB Ports
                var usb3Count = DevicesInfo.Usb3Ports;
                var usb2Count = DevicesInfo.Usb2Ports;
                AddResult("Devices", "USB Ports", DevicesInfo.TotalUsbPorts > 0, 
                    $"{DevicesInfo.TotalUsbPorts} total ({usb3Count} USB 3.x, {usb2Count} USB 2.0)");

                // Connected USB devices
                foreach (var usb in DevicesInfo.ConnectedUsbDevices.Take(5))
                {
                    AddResult("Devices", "USB Device", usb.IsConnected, usb.Name);
                }

                // Webcam
                if (DevicesInfo.Camera != null)
                {
                    AddResult("Devices", "Webcam", DevicesInfo.Camera.IsWorking, DevicesInfo.Camera.Name);
                }
                else
                {
                    AddResult("Devices", "Webcam", false, "Not detected");
                }

                // Displays
                foreach (var display in DevicesInfo.Displays)
                {
                    var resolution = display.ScreenWidth > 0 ? $" ({display.Resolution})" : "";
                    AddResult("Devices", $"Display ({display.ConnectionType})", display.IsActive, $"{display.Name}{resolution}");
                }

                // Audio
                foreach (var audio in DevicesInfo.AudioDevices)
                {
                    AddResult("Devices", "Audio", audio.IsWorking, audio.Name);
                }

                // Network
                foreach (var net in DevicesInfo.NetworkDevices)
                {
                    var status = net.IsConnected ? "Connected" : "Disconnected";
                    AddResult("Devices", net.AdapterType, net.IsConnected, $"{net.Name} - {status}");
                }
            });

            StatusMessage = "Scan complete!";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
            AddResult("Error", "Scan Failed", false, ex.Message);
        }
        finally
        {
            IsScanning = false;
        }
    }

    [RelayCommand]
    private async Task RunStressTestsAsync()
    {
        IsScanning = true;
        StatusMessage = "Running stress tests... (This may take a minute)";
        
        try
        {
            // CPU Stress Test
            StatusMessage = "Stress testing CPU... (Initializing)";
            var cpuStress = new CpuStressTest(durationSeconds: 15);
            cpuStress.OnProgress += (p) => 
            {
                var temp = p.CurrentTemp > 0 ? $"{p.CurrentTemp:F0}°C" : "N/A";
                var speed = p.CurrentClock > 0 ? $" @ {p.CurrentClock:F0}MHz" : "";
                StatusMessage = $"Stress testing CPU: {p.PercentComplete}% | Temp: {temp}{speed}";
            };
            
            var cpuResult = await cpuStress.RunAsync();
            AddResult("CPU", "Stress Test", cpuResult.Passed, cpuResult.Message);
            
            // Add detailed metrics
            if (cpuResult.MaxTemp > 0)
                AddResult("CPU", "Max Temperature", cpuResult.MaxTemp <= 90, $"{cpuResult.MaxTemp:F1}°C");
            if (cpuResult.MaxClock > 0)
            {
                double throttlePercent = cpuResult.MaxClock > 0 ? (1 - cpuResult.MinClock / cpuResult.MaxClock) * 100 : 0;
                AddResult("CPU", "Clock Range", throttlePercent < 25, $"{cpuResult.MinClock:F0} - {cpuResult.MaxClock:F0} MHz ({throttlePercent:F0}% drop)");
            }
            
            CpuStatus = cpuResult.Passed ? "✓ Passed Stress Test" : "✗ Failed Stress Test";

            // RAM Stress Test
            StatusMessage = "Stress testing RAM...";
            var ramStress = new RamStressTest(testSizeMB: 512, iterations: 2);
            ramStress.OnProgress += (p) => 
            {
                StatusMessage = $"Stress testing RAM: {p.PercentComplete}%";
            };

            var ramResult = await ramStress.RunAsync();
            AddResult("RAM", "Stress Test", ramResult.Passed, ramResult.Message);
            RamStatus = ramResult.Passed ? "✓ Passed Stress Test" : "✗ Failed Stress Test";

            StatusMessage = "Stress tests complete!";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
            AddResult("Error", "Stress Test Failed", false, ex.Message);
        }
        finally
        {
            IsScanning = false;
        }
    }

    private void AddResult(string component, string test, bool passed, string details)
    {
        App.Current.Dispatcher.Invoke(() =>
        {
            Results.Add(new DiagnosticResult
            {
                Component = component,
                Test = test,
                Passed = passed,
                Details = details
            });
        });
    }

    [RelayCommand]
    private async Task RunSmartTestAsync()
    {
        if (!SmartctlAvailable)
        {
            StatusMessage = "smartctl.exe not found. Please install smartmontools.";
            AddResult("Storage", "SMART Test", false, "smartctl.exe not found");
            return;
        }

        IsSmartTestRunning = true;
        SmartTestProgress = 0;
        SmartTestStatus = "Starting SMART tests...";
        StatusMessage = "Running SMART self-tests on all drives...";

        try
        {
            // First, do a quick health check
            var healthCheck = await Task.Run(() => _smartTestService.QuickHealthCheck());
            
            foreach (var device in healthCheck.Devices)
            {
                AddResult("Storage", "SMART Health", 
                    device.HealthPassed, 
                    $"{device.Model}: {device.HealthScore}% - {device.HealthStatus}");
                
                if (device.Temperature.HasValue)
                    AddResult("Storage", "Temperature", 
                        device.Temperature < 55, 
                        $"{device.Model}: {device.Temperature}°C");
                
                if (device.PowerOnHours.HasValue)
                    AddResult("Storage", "Power-On Hours", 
                        true, 
                        $"{device.Model}: {device.PowerOnHours:N0} hours");
                
                foreach (var warning in device.Warnings)
                {
                    AddResult("Storage", "⚠ Warning", false, warning);
                }
            }

            // Run short self-test on each drive
            foreach (var device in healthCheck.Devices)
            {
                SmartTestStatus = $"Running short self-test on {device.Model}...";
                
                var progress = new Progress<SmartTestProgress>(p =>
                {
                    SmartTestProgress = p.PercentComplete;
                    SmartTestStatus = $"{device.Model}: {p.Status} ({p.PercentComplete}%)";
                });

                var result = await _smartTestService.RunShortTestAsync(device.DevicePath, progress);
                
                AddResult("Storage", "SMART Self-Test",
                    result.Success,
                    $"{device.Model}: {result.Message} ({result.Duration.TotalSeconds:F0}s)");
            }

            StorageStatus = healthCheck.OverallHealthy ? "✓ All Drives Healthy" : "⚠ Issues Detected";
            StatusMessage = "SMART tests complete!";
            SmartTestStatus = healthCheck.Message;
        }
        catch (Exception ex)
        {
            StatusMessage = $"SMART test error: {ex.Message}";
            SmartTestStatus = "Error occurred";
            AddResult("Storage", "SMART Test Error", false, ex.Message);
        }
        finally
        {
            IsSmartTestRunning = false;
            SmartTestProgress = 100;
        }
    }

    [RelayCommand]
    private async Task QuickSmartCheckAsync()
    {
        if (!SmartctlAvailable)
        {
            StatusMessage = "smartctl.exe not found. Please install smartmontools.";
            return;
        }

        IsSmartTestRunning = true;
        SmartTestStatus = "Checking drive health...";
        StatusMessage = "Reading SMART data...";

        try
        {
            var healthCheck = await Task.Run(() => _smartTestService.QuickHealthCheck());
            
            foreach (var device in healthCheck.Devices)
            {
                AddResult("Storage", $"SMART: {device.Model}", 
                    device.HealthPassed, 
                    $"Health: {device.HealthScore}% | Temp: {device.Temperature ?? 0}°C | {device.PowerOnHours ?? 0}h");
            }

            StorageStatus = healthCheck.Message;
            StatusMessage = healthCheck.Message;
            SmartTestStatus = healthCheck.OverallHealthy ? "All drives healthy" : "Issues detected";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
            SmartTestStatus = "Error";
        }
        finally
        {
            IsSmartTestRunning = false;
        }
    }
}

public class DiagnosticResult
{
    public string Component { get; set; } = "";
    public string Test { get; set; } = "";
    public bool Passed { get; set; }
    public string Details { get; set; } = "";
    public string Status => Passed ? "✓ PASS" : "✗ FAIL";
}
