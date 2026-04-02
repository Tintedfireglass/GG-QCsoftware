using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.App;
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
    private readonly SecurityDiagnostic _securityDiagnostic;

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

    [ObservableProperty]
    private string _windowsActivationStatus = "Not scanned";

    [ObservableProperty]
    private string _antivirusStatus = "Not scanned";

    [ObservableProperty]
    private bool _isSecurityChecking;

    public bool IsLoggedIn => App.IsLoggedIn;

    public void RefreshLoginState()
    {
        OnPropertyChanged(nameof(IsLoggedIn));
    }

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
        _securityDiagnostic = new SecurityDiagnostic();
        
        // Check if smartctl is available
        SmartctlAvailable = _smartTestService.IsAvailable;
    }

    [RelayCommand]
    private void StartFullQc()
    {
        if (!App.IsLoggedIn)
        {
            // Show WiFi test popup first
            var wifiTest = new Views.WifiTestWindow
            {
                Owner = App.Current.MainWindow
            };
            var wifiResult = wifiTest.ShowDialog();

            // If internet not connected, don't proceed to activation
            if (wifiResult != true)
                return;

            // Then show activation popup
            var loginWindow = new Views.LoginWindow(App.AuthService)
            {
                Owner = App.Current.MainWindow
            };
            loginWindow.ShowDialog();

            // Refresh activation UI on the main window
            if (App.Current.MainWindow is MainWindow mainWin)
            {
                mainWin.RefreshActivationUi();
            }

            // If still not activated after login attempt, don't open QC wizard
            if (!App.IsLoggedIn)
                return;
        }

        var wizard = new Views.QCWizardWindow
        {
            Owner = App.Current.MainWindow
        };
        wizard.ShowDialog();
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
        // UI Thread: Start scan state
        IsScanning = true;
        StatusMessage = "Scanning hardware...";

        try
        {
            await Task.Run(() =>
            {
                // Fetch all data on background thread
                var sysInfo = _systemDiagnostic.GetInfo();
                var cpuInfo = _cpuDiagnostic.GetInfo();
                var ramInfo = _ramDiagnostic.GetInfo();
                var storageInfo = _storageDiagnostic.GetInfo();
                var batteryInfo = _batteryDiagnostic.GetInfo();
                var devicesInfo = _deviceDiagnostic.GetInfo();
                var activationStatus = _securityDiagnostic.GetWindowsActivationStatus();
                var antivirusStatus = _securityDiagnostic.GetAntivirusStatus();

                // Update UI on main thread
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    // Update System Info
                    SystemInfo = sysInfo;
                    AddResult("System", "Detection", true, $"{sysInfo.Manufacturer} {sysInfo.Model}");

                    // Update CPU
                    CpuInfo = cpuInfo;
                    var cpuValidation = _cpuDiagnostic.ValidateCpu(cpuInfo);
                    CpuStatus = cpuValidation.Message;
                    AddResult("CPU", "Detection", cpuValidation.IsHealthy, cpuInfo.Name);
                    AddResult("CPU", "Cores/Threads", true, $"{cpuInfo.Cores} cores / {cpuInfo.Threads} threads");
                    AddResult("CPU", "Clock Speed", true, $"{cpuInfo.MaxClockSpeedMHz} MHz");

                    // Update RAM
                    RamInfo = ramInfo;
                    var ramValidation = _ramDiagnostic.ValidateRam(ramInfo);
                    RamStatus = ramValidation.Message;
                    AddResult("RAM", "Detection", ramValidation.IsHealthy, $"{ramInfo.TotalCapacityGB} GB Total");
                    
                    foreach (var module in ramInfo.Modules)
                    {
                        AddResult("RAM", $"Slot {module.Slot}", true, 
                            $"{module.CapacityGB}GB {module.MemoryType} @ {module.SpeedMHz}MHz");
                    }

                    // Update Storage
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

                    // Update Battery
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

                        if (!string.IsNullOrWhiteSpace(batteryInfo.PartNumber))
                            AddResult("Battery", "Part Number", true, batteryInfo.PartNumber);
                    }
                    else
                    {
                        AddResult("Battery", "Status", true, "No battery (Desktop)");
                    }

                    // Update Devices
                    DevicesInfo = devicesInfo;
                    
                    // Set primary GPU info
                    if (devicesInfo.Gpus.Any())
                    {
                        // Prefer discrete GPU if available, otherwise first one
                        GpuInfo = devicesInfo.Gpus.FirstOrDefault(g => g.Name.Contains("NVIDIA") || g.Name.Contains("Radeon") || g.Name.Contains("Arc")) 
                                  ?? devicesInfo.Gpus.First();
                    }

                    var deviceValidation = _deviceDiagnostic.ValidateDevices(devicesInfo);
                    DevicesStatus = deviceValidation.Message;
                    
                    // Input Devices
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

                    // USB Ports
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
                        var hasVendor = !string.IsNullOrWhiteSpace(display.ManufacturerCode);
                        var hasProduct = !string.IsNullOrWhiteSpace(display.ProductCode);
                        var hasSerial = !string.IsNullOrWhiteSpace(display.SerialNumber);
                        var edidDetails = (hasVendor || hasProduct || hasSerial)
                            ? $" | EDID: Vendor={display.ManufacturerCode} | Product={display.ProductCode} | Serial={display.SerialNumber}"
                            : "";

                        AddResult("Devices", $"Display ({display.ConnectionType})", display.IsActive, $"{display.Name}{resolution}{edidDetails}");
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

                    // Security Status
                    AddResult("Security", "Windows Activation", activationStatus.IsActivated, activationStatus.Summary);
                    AddResult("Security", "Antivirus", antivirusStatus.IsHealthy, antivirusStatus.Summary);
                    foreach (var product in antivirusStatus.Products)
                    {
                        var details = string.IsNullOrWhiteSpace(product.ProductStateHex)
                            ? product.Name
                            : $"{product.Name} ({product.ProductStateHex})";
                        AddResult("Security", "AV Product", antivirusStatus.IsHealthy, details);
                    }

                    WindowsActivationStatus = activationStatus.Summary;
                    AntivirusStatus = antivirusStatus.Summary;
                    
                    StatusMessage = "Scan complete!";
                });
            });
        }
        catch (Exception ex)
        {
            App.Current?.Dispatcher?.Invoke(() =>
            {
                StatusMessage = $"Error: {ex.Message}";
                AddResult("Error", "Scan Failed", false, ex.Message);
            });
        }
        finally
        {
            App.Current?.Dispatcher?.Invoke(() =>
            {
                IsScanning = false;
            });
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

            // GPU Stress Test (only if discrete GPU is detected)
            StatusMessage = "Checking for discrete GPU...";
            var gpuStress = new GpuStressTest(durationSeconds: 15);
            gpuStress.OnProgress += (p) =>
            {
                var temp = p.CurrentTemp > 0 ? $"{p.CurrentTemp:F0}°C" : "N/A";
                var load = p.CurrentLoad > 0 ? $" | Load: {p.CurrentLoad:F0}%" : "";
                var speed = p.CurrentClock > 0 ? $" @ {p.CurrentClock:F0}MHz" : "";
                StatusMessage = $"Stress testing GPU ({p.GpuName}): {p.PercentComplete}% | Temp: {temp}{load}{speed}";
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

    [RelayCommand]
    private void OpenCleanup()
    {
        var win = new Views.CleanupWindow
        {
            Owner = App.Current.MainWindow
        };
        win.ShowDialog();
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
                var activationStatus = _securityDiagnostic.GetWindowsActivationStatus();
                var antivirusStatus = _securityDiagnostic.GetAntivirusStatus();

                App.Current?.Dispatcher?.Invoke(() =>
                {
                    AddResult("Security", "Windows Activation", activationStatus.IsActivated, activationStatus.Summary);
                    AddResult("Security", "Antivirus", antivirusStatus.IsHealthy, antivirusStatus.Summary);
                    foreach (var product in antivirusStatus.Products)
                    {
                        var details = string.IsNullOrWhiteSpace(product.ProductStateHex)
                            ? product.Name
                            : $"{product.Name} ({product.ProductStateHex})";
                        AddResult("Security", "AV Product", antivirusStatus.IsHealthy, details);
                    }

                    WindowsActivationStatus = activationStatus.Summary;
                    AntivirusStatus = antivirusStatus.Summary;
                });
            });

            StatusMessage = "Security check complete!";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Security check error: {ex.Message}";
            AddResult("Security", "Security Check", false, ex.Message);
        }
        finally
        {
            IsSecurityChecking = false;
        }
    }

    private void AddResult(string component, string test, bool passed, string details)
    {
        try
        {
            if (App.Current?.Dispatcher == null)
            {
                // Fallback if dispatcher is not available
                Results.Add(new DiagnosticResult
                {
                    Component = component ?? "",
                    Test = test ?? "",
                    Passed = passed,
                    Details = details ?? ""
                });
                return;
            }

            App.Current.Dispatcher.Invoke(() =>
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
        catch (Exception ex)
        {
            // Log error but don't crash
            System.Diagnostics.Debug.WriteLine($"Error adding result: {ex.Message}");
        }
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
