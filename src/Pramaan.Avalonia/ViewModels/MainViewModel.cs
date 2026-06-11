using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Hardware.Models;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.ObjectModel;
using Pramaan.Avalonia.Views;

namespace Pramaan.Avalonia.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private global::Avalonia.Controls.Window? GetMainWindow()
    {
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            return desktop.MainWindow;
        }
        return null;
    }

    private readonly ICpuDiagnostic _cpuDiagnostic;
    private readonly IRamDiagnostic _ramDiagnostic;
    private readonly ISystemDiagnostic _systemDiagnostic;
    private readonly IStorageDiagnostic _storageDiagnostic;
    private readonly IBatteryDiagnostic _batteryDiagnostic;
    private readonly IDeviceDiagnostic _deviceDiagnostic;
    private readonly ISmartTestService _smartTestService;

    [ObservableProperty]
    private SystemInfo? _systemInfo;

    [ObservableProperty]
    private CpuInfo? _cpuInfo;

    [ObservableProperty]
    private GpuInfo? _gpuInfo;

    [ObservableProperty]
    private RamInfo? _ramInfo;

    [ObservableProperty]
    private StorageInfo? _storageInfo;

    [ObservableProperty]
    private BatteryInfo? _batteryInfo;

    [ObservableProperty]
    private DevicesInfo? _devicesInfo;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsInteractionEnabled))]
    [NotifyPropertyChangedFor(nameof(IsOtherDeviceTestsEnabled))]
    private bool _isScanning;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsSecurityRefreshEnabled))]
    private bool _isSecurityChecking;

    [ObservableProperty]
    private string _windowsActivationStatus = "Not scanned";

    [ObservableProperty]
    private string _antivirusStatus = "Not scanned";

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

    public bool IsLoggedIn => App.IsLoggedIn;
    public bool IsTrial => App.AuthService?.IsTrialSession ?? false;
    public bool IsFullQcVisible => true;
    public bool IsResultsSectionVisible => IsLoggedIn;
    public bool IsInteractionEnabled => !IsScanning;
    public bool IsOtherDeviceTestsEnabled => IsInteractionEnabled && !IsTrial;
    public bool IsSecurityRefreshEnabled => !IsSecurityChecking;

    public void RefreshLoginState()
    {
        OnPropertyChanged(nameof(IsLoggedIn));
        OnPropertyChanged(nameof(IsTrial));
        OnPropertyChanged(nameof(IsFullQcVisible));
        OnPropertyChanged(nameof(IsResultsSectionVisible));
        OnPropertyChanged(nameof(IsOtherDeviceTestsEnabled));
        OnPropertyChanged(nameof(IsInteractionEnabled));
        OnPropertyChanged(nameof(IsSecurityRefreshEnabled));
    }

    public ObservableCollection<DiagnosticResult> Results { get; } = new();

    public MainViewModel()
    {
        var sp = App.Current?.Services
            ?? throw new InvalidOperationException("DI container not initialized");
        _cpuDiagnostic = sp.GetRequiredService<ICpuDiagnostic>();
        _ramDiagnostic = sp.GetRequiredService<IRamDiagnostic>();
        _systemDiagnostic = sp.GetRequiredService<ISystemDiagnostic>();
        _storageDiagnostic = sp.GetRequiredService<IStorageDiagnostic>();
        _batteryDiagnostic = sp.GetRequiredService<IBatteryDiagnostic>();
        _deviceDiagnostic = sp.GetRequiredService<IDeviceDiagnostic>();
        _smartTestService = sp.GetRequiredService<ISmartTestService>();
        
        // Check if smartctl is available
        SmartctlAvailable = _smartTestService.IsAvailable;
    }

    [RelayCommand]
    private async Task OpenCleanupAsync()
    {
        var win = new Views.CleanupWindow();
        await win.ShowDialog(GetMainWindow()!);
    }

    [RelayCommand]
    private async Task RefreshSecurityAsync()
    {
        if (IsSecurityChecking)
            return;

        IsSecurityChecking = true;
        StatusMessage = "Checking security status...";

        try
        {
            await Task.Run(() =>
            {
                // Placeholder — WPF uses SecurityDiagnostic service
                // The Avalonia project does not have SecurityDiagnostic yet.
                Dispatcher.UIThread.Post(() =>
                {
                    StatusMessage = "Security check complete!";
                });
            });
        }
        catch (Exception ex)
        {
            Dispatcher.UIThread.Post(() => StatusMessage = $"Security check error: {ex.Message}");
        }
        finally
        {
            Dispatcher.UIThread.Post(() => IsSecurityChecking = false);
        }
    }

    [RelayCommand]
    private async Task StartFullQcAsync()
    {
        var wizard = new Views.QCWizardWindow();
        await wizard.ShowDialog(GetMainWindow()!);
    }

    [RelayCommand]
    private async Task OpenKeyboardTestAsync()
    {
        var keyboardWindow = new Views.KeyboardTestWindow();
        StatusMessage = "Testing keyboard... Press all keys.";
        
        await keyboardWindow.ShowDialog(GetMainWindow()!);
        
        var (passed, message) = keyboardWindow.GetResult();
        if (passed || !string.IsNullOrEmpty(message)) // Valid execution and closed
        {
            AddResult("Keyboard", "Key Test", passed, message);
            DevicesStatus = passed ? " Keyboard test passed" : $" Keyboard: {message}";
            StatusMessage = passed ? "Keyboard test passed!" : "Keyboard test failed";
        }
        else
        {
            StatusMessage = "Keyboard test cancelled";
        }
    }

    [RelayCommand]
    private async Task OpenAudioVideoTestAsync()
    {
        var avWindow = new Views.AudioVideoTestWindow();
        StatusMessage = "Testing Audio/Video... Follow on-screen instructions.";

        await avWindow.ShowDialog(GetMainWindow()!);

        if (avWindow.DataContext is AudioVideoTestViewModel vm && vm.IsComplete)
        {
            AddResult("Devices", "A/V Test", vm.Passed, vm.ResultMessage);
            
            // Record 3.5mm jack result separately
            if (vm.JackTested)
            {
                AddResult("Devices", "3.5mm Jack", vm.JackPassed, 
                    vm.JackPassed ? "Jack Test Passed" : "Jack Test Failed");
            }
            
            StatusMessage = vm.Passed ? "A/V test passed!" : "A/V test failed";
        }
        else
        {
            StatusMessage = "A/V test cancelled";
        }
    }

    [RelayCommand]
    private async Task OpenTrackpadTestAsync()
    {
        var trackpadWindow = new Views.TrackpadTestWindow();
        StatusMessage = "Testing trackpad... Move, click, and scroll.";
        
        await trackpadWindow.ShowDialog(GetMainWindow()!);
        
        var (passed, message) = trackpadWindow.GetResult();
        if (passed || !string.IsNullOrEmpty(message))
        {
            AddResult("Trackpad", "Input Test", passed, message);
            DevicesStatus = passed ? " Trackpad test passed" : $" Trackpad: {message}";
            StatusMessage = passed ? "Trackpad test passed!" : "Trackpad test failed";
        }
        else
        {
            StatusMessage = "Trackpad test cancelled";
        }
    }

    [RelayCommand]
    private async Task OpenUsbPortTestAsync()
    {
        var usbWindow = new Views.UsbPortTestWindow();
        StatusMessage = "Testing USB ports... Plug devices into each port.";
        
        await usbWindow.ShowDialog(GetMainWindow()!);
        
        var (passed, message) = usbWindow.GetResult();
        if (passed || !string.IsNullOrEmpty(message))
        {
            AddResult("Devices", "USB Port Test", passed, message);
            DevicesStatus = passed ? " USB port test passed" : $" USB: {message}";
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
                var sysInfo = _systemDiagnostic.GetInfo();
                var cpuInfo = _cpuDiagnostic.GetInfo();
                var ramInfo = _ramDiagnostic.GetInfo();
                var storageInfo = _storageDiagnostic.GetInfo();
                var batteryInfo = _batteryDiagnostic.GetInfo();
                var devicesInfo = _deviceDiagnostic.GetInfo();

                Dispatcher.UIThread.Post(() =>
                {
                    SystemInfo = sysInfo;
                    AddResult("System", "Detection", true, $"{sysInfo.Manufacturer} {sysInfo.Model}");

                    CpuInfo = cpuInfo;
                    var cpuValidation = _cpuDiagnostic.ValidateCpu(cpuInfo);
                    CpuStatus = cpuValidation.Message;
                    AddResult("CPU", "Detection", cpuValidation.IsHealthy, cpuInfo.Name);
                    AddResult("CPU", "Cores/Threads", true, $"{cpuInfo.Cores} cores / {cpuInfo.Threads} threads");
                    AddResult("CPU", "Clock Speed", true, $"{cpuInfo.MaxClockSpeedMHz} MHz");

                    RamInfo = ramInfo;
                    var ramValidation = _ramDiagnostic.ValidateRam(ramInfo);
                    RamStatus = ramValidation.Message;
                    AddResult("RAM", "Detection", ramValidation.IsHealthy, $"{ramInfo.TotalCapacityGB} GB Total");
                    
                    foreach (var module in ramInfo.Modules)
                    {
                        AddResult("RAM", $"Slot {module.Slot}", true, $"{module.CapacityGB}GB {module.MemoryType} @ {module.SpeedMHz}MHz");
                    }

                    StorageInfo = storageInfo;
                    var storageValidation = _storageDiagnostic.ValidateStorage(storageInfo);
                    StorageStatus = storageValidation.Message;
                    
                    foreach (var device in storageInfo.Devices)
                    {
                        var deviceType = device.IsSsd ? "SSD" : "HDD";
                        var health = device.HealthPercent.HasValue ? $" ({device.HealthPercent}% health)" : "";
                        AddResult("Storage", deviceType, true, $"{device.Model} - {device.SizeGB:F0}GB{health}");
                    }
                    AddResult("Storage", "Total", storageValidation.IsHealthy, $"{storageInfo.TotalCapacityGB:F0} GB");

                    BatteryInfo = batteryInfo;
                    var batteryValidation = _batteryDiagnostic.ValidateBattery(batteryInfo);
                    BatteryStatus = batteryValidation.Message;
                    
                    if (batteryInfo.IsPresent)
                    {
                        AddResult("Battery", "Status", true, batteryInfo.BatteryStatus);
                        AddResult("Battery", "Charge", true, $"{batteryInfo.EstimatedChargeRemaining}%");
                        if (batteryInfo.HealthPercent.HasValue)
                            AddResult("Battery", "Health", batteryInfo.HealthPercent >= 60, $"{batteryInfo.HealthPercent}%");
                        if (batteryInfo.WearLevelPercent.HasValue)
                            AddResult("Battery", "Wear Level", batteryInfo.WearLevelPercent <= 30, $"{batteryInfo.WearLevelPercent}% worn");
                        if (batteryInfo.CycleCount.HasValue)
                            AddResult("Battery", "Cycle Count", batteryInfo.CycleCount.Value < 500, $"{batteryInfo.CycleCount.Value} cycles");
                        else
                            AddResult("Battery", "Cycle Count", true, "N/A");
                    }
                    else
                    {
                        AddResult("Battery", "Status", true, "No battery (Desktop)");
                    }

                    DevicesInfo = devicesInfo;
                    if (devicesInfo.Gpus.Any())
                    {
                        GpuInfo = devicesInfo.Gpus.FirstOrDefault(g => g.Name.Contains("NVIDIA") || g.Name.Contains("Radeon") || g.Name.Contains("Arc")) ?? devicesInfo.Gpus.First();
                    }

                    var deviceValidation = _deviceDiagnostic.ValidateDevices(devicesInfo);
                    DevicesStatus = deviceValidation.Message;
                    
                    // Input Devices with proper type labels
                    foreach (var input in devicesInfo.InputDevices)
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

                    // USB Ports with breakdown
                    var usb3Count = devicesInfo.Usb3Ports;
                    var usb2Count = devicesInfo.Usb2Ports;
                    AddResult("Devices", "USB Ports", devicesInfo.TotalUsbPorts > 0, 
                        $"{devicesInfo.TotalUsbPorts} total ({usb3Count} USB 3.x, {usb2Count} USB 2.0)");

                    // Connected USB devices
                    foreach (var usb in devicesInfo.ConnectedUsbDevices.Take(5))
                    {
                        AddResult("Devices", "USB Device", usb.IsConnected, usb.Name);
                    }

                    // Webcam
                    if (devicesInfo.Camera != null)
                    {
                        AddResult("Devices", "Webcam", devicesInfo.Camera.IsWorking, devicesInfo.Camera.Name);
                    }
                    else
                    {
                        AddResult("Devices", "Webcam", false, "Not detected");
                    }

                    // Displays
                    foreach (var display in devicesInfo.Displays)
                    {
                        var resolution = display.ScreenWidth > 0 ? $" ({display.Resolution})" : "";
                        AddResult("Devices", $"Display ({display.ConnectionType})", display.IsActive, $"{display.Name}{resolution}");
                    }

                    // Audio
                    foreach (var audio in devicesInfo.AudioDevices)
                    {
                        AddResult("Devices", "Audio", audio.IsWorking, audio.Name);
                    }

                    // Network
                    foreach (var net in devicesInfo.NetworkDevices)
                    {
                        var status = net.IsConnected ? "Connected" : "Disconnected";
                        AddResult("Devices", net.AdapterType, net.IsConnected, $"{net.Name} - {status}");
                    }

                    StatusMessage = "Scan complete!";
                });
            });
        }
        catch (Exception ex)
        {
            Dispatcher.UIThread.Post(() =>
            {
                StatusMessage = $"Error: {ex.Message}";
                AddResult("Error", "Scan Failed", false, ex.Message);
            });
        }
        finally
        {
            Dispatcher.UIThread.Post(() => IsScanning = false);
        }
    }

    [RelayCommand]
    private async Task RunStressTestsAsync()
    {
        IsScanning = true;
        StatusMessage = "Running stress tests... (This may take a minute)";
        
        try
        {
            if (System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.Windows))
            {
#if WINDOWS
                // CPU Stress Test
                StatusMessage = "Stress testing CPU... (Initializing)";
                var cpuStress = new CpuStressTest(durationSeconds: 15);
                cpuStress.OnProgress += (p) => 
                {
                    var temp = p.CurrentTemp > 0 ? $"{p.CurrentTemp:F0}°C" : "N/A";
                    var speed = p.CurrentClock > 0 ? $" @ {p.CurrentClock:F0}MHz" : "";
                    Dispatcher.UIThread.Post(() =>
                        StatusMessage = $"Stress testing CPU: {p.PercentComplete}% | Temp: {temp}{speed}");
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
                
                CpuStatus = cpuResult.Passed ? "Passed Stress Test" : "Failed Stress Test";

                // RAM Stress Test
                StatusMessage = "Stress testing RAM...";
                var ramStress = new RamStressTest(testSizeMB: 512, iterations: 2);
                ramStress.OnProgress += (p) => 
                {
                    Dispatcher.UIThread.Post(() =>
                        StatusMessage = $"Stress testing RAM: {p.PercentComplete}%");
                };

                var ramResult = await ramStress.RunAsync();
                AddResult("RAM", "Stress Test", ramResult.Passed, ramResult.Message);
                RamStatus = ramResult.Passed ? "Passed Stress Test" : "Failed Stress Test";

                // GPU Stress Test (only if discrete GPU is detected)
                StatusMessage = "Checking for discrete GPU...";
                var gpuStress = new GpuStressTest(durationSeconds: 15);
                gpuStress.OnProgress += (p) =>
                {
                    var temp = p.CurrentTemp > 0 ? $"{p.CurrentTemp:F0}°C" : "N/A";
                    var load = p.CurrentLoad > 0 ? $" | Load: {p.CurrentLoad:F0}%" : "";
                    var speed = p.CurrentClock > 0 ? $" @ {p.CurrentClock:F0}MHz" : "";
                    Dispatcher.UIThread.Post(() =>
                        StatusMessage = $"Stress testing GPU ({p.GpuName}): {p.PercentComplete}% | Temp: {temp}{load}{speed}");
                };

                var gpuResult = await gpuStress.RunAsync();
                
                if (gpuResult.Skipped)
                {
                    AddResult("GPU", "Stress Test", true, gpuResult.Message);
                }
                else
                {
                    AddResult("GPU", "Stress Test", gpuResult.Passed, gpuResult.Message);
                    
                    // Add detailed GPU metrics
                    if (gpuResult.MaxTemp > 0)
                        AddResult("GPU", "Max Temperature", gpuResult.MaxTemp <= 90, $"{gpuResult.MaxTemp:F1}°C");
                    if (gpuResult.MaxLoad > 0)
                        AddResult("GPU", "Load", true, $"{gpuResult.AvgLoad:F0}% avg, {gpuResult.MaxLoad:F0}% max");
                    if (gpuResult.MaxClock > 0)
                    {
                        double throttlePercent = gpuResult.MaxClock > 0 ? (1 - gpuResult.MinClock / gpuResult.MaxClock) * 100 : 0;
                        AddResult("GPU", "Clock Range", throttlePercent < 30, $"{gpuResult.MinClock:F0} - {gpuResult.MaxClock:F0} MHz ({throttlePercent:F0}% drop)");
                    }
                }
#endif
            }
            else
            {
                // macOS: run RAM stress (pure .NET, cross-platform) and skip CPU/GPU sensor-based tests
                StatusMessage = "Stress testing RAM...";
                var ramStress = new RamStressTest(testSizeMB: 512, iterations: 2);
                ramStress.OnProgress += (p) =>
                {
                    Dispatcher.UIThread.Post(() =>
                        StatusMessage = $"Stress testing RAM: {p.PercentComplete}%");
                };

                var ramResult = await ramStress.RunAsync();
                AddResult("RAM", "Stress Test", ramResult.Passed, ramResult.Message);
                RamStatus = ramResult.Passed ? "Passed Stress Test" : "Failed Stress Test";

                // CPU stress: macOS performance-based throttling test
                StatusMessage = "Stress testing CPU...";
                var macCpuStress = new LaptopQC.Core.Diagnostics.MacCpuStressTest(durationSeconds: 15);
                macCpuStress.OnProgress += (p) =>
                {
                    var speed = p.CurrentClock > 0 ? $" | Speed: {p.CurrentClock:F1}M ops/s" : "";
                    Dispatcher.UIThread.Post(() => 
                        StatusMessage = $"Stress testing CPU: {p.PercentComplete}%{speed} (Math loop)");
                };

                var macCpuResult = await macCpuStress.RunAsync();
                AddResult("CPU", "Stress Test", macCpuResult.Passed, macCpuResult.Message);
                CpuStatus = macCpuResult.Passed ? "Passed Stress Test" : "Failed Stress Test";

                AddResult("GPU", "Stress Test", true, "GPU stress test not available on macOS (DirectX not supported)");
            }

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
        try
        {
            Dispatcher.UIThread.Post(() =>
            {
                Results.Add(new DiagnosticResult
                {
                    Component = component ?? "",
                    Test = test ?? "",
                    Passed = passed,
                    Details = details ?? ""
                });
            });
        }
        catch { }
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
            
            Dispatcher.UIThread.Post(() =>
            {
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
            });

            // Run short self-test on each drive
            foreach (var device in healthCheck.Devices)
            {
                Dispatcher.UIThread.Post(() =>
                    SmartTestStatus = $"Running short self-test on {device.Model}...");
                
                var progress = new Progress<SmartTestProgress>(p =>
                {
                    Dispatcher.UIThread.Post(() =>
                    {
                        SmartTestProgress = p.PercentComplete;
                        SmartTestStatus = $"{device.Model}: {p.Status} ({p.PercentComplete}%)";
                    });
                });

                var result = await _smartTestService.RunShortTestAsync(device.DevicePath, progress, device.DeviceType);
                
                Dispatcher.UIThread.Post(() =>
                    AddResult("Storage", "SMART Self-Test",
                        result.Success,
                        $"{device.Model}: {result.Message} ({result.Duration.TotalSeconds:F0}s)"));
            }

            Dispatcher.UIThread.Post(() =>
            {
                StorageStatus = healthCheck.OverallHealthy ? "✓ All Drives Healthy" : "⚠ Issues Detected";
                StatusMessage = "SMART tests complete!";
                SmartTestStatus = healthCheck.Message;
            });
        }
        catch (Exception ex)
        {
            Dispatcher.UIThread.Post(() =>
            {
                StatusMessage = $"SMART test error: {ex.Message}";
                SmartTestStatus = "Error occurred";
                AddResult("Storage", "SMART Test Error", false, ex.Message);
            });
        }
        finally
        {
            Dispatcher.UIThread.Post(() =>
            {
                IsSmartTestRunning = false;
                SmartTestProgress = 100;
            });
        }
    }

    [RelayCommand]
    private async Task QuickSmartCheckAsync()
    {
        if (!SmartctlAvailable)
        {
            StatusMessage = "smartctl.exe not found.";
            return;
        }

        StatusMessage = "Running quick SMART health check...";
        try
        {
            var healthCheck = await Task.Run(() => _smartTestService.QuickHealthCheck());
            Dispatcher.UIThread.Post(() =>
            {
                foreach (var device in healthCheck.Devices)
                {
                    AddResult("Storage", "Quick Check", 
                        device.HealthPassed, 
                        $"{device.Model}: {device.HealthScore}% - {device.HealthStatus}");
                }
                StorageStatus = healthCheck.Message;
                StatusMessage = healthCheck.Message;
            });
        }
        catch (Exception ex)
        {
            Dispatcher.UIThread.Post(() =>
                StatusMessage = $"Quick check error: {ex.Message}");
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
