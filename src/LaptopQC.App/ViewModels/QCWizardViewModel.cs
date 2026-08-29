using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Services;
using LaptopQC.App.Views;
using System.Diagnostics;
using System.IO;
using System.Net.NetworkInformation;
using System.Windows;
using System.Windows.Threading;
using System.Windows.Media.Imaging;
using Microsoft.Extensions.DependencyInjection;
using QRCoder;

namespace LaptopQC.App.ViewModels;

public partial class QCWizardViewModel : ObservableObject
{
    private readonly QCWorkflowService _workflowService;
    private readonly ReportGenerator _reportGenerator;
    private DispatcherTimer? _networkPollTimer;

    [ObservableProperty]
    private bool _isPrepStep = true;

    [ObservableProperty]
    private bool _isAutomatedStep;

    [ObservableProperty]
    private bool _isInteractiveStep;

    [ObservableProperty]
    private bool _isReportStep;

    [ObservableProperty]
    private string _refurbId = "";

    [ObservableProperty]
    private string _technicianId = "";

    [ObservableProperty]
    private string _physicalCondition = "B"; // Default: Good

    [ObservableProperty]
    private string _scratchesAndDents = "Minor"; // Default: Minor

    [ObservableProperty]
    private int _automatedProgress;

    [ObservableProperty]
    private string _automatedStatus = "Waiting to start...";

    [ObservableProperty]
    private string _interactiveInstruction = "Next: Keyboard Test";

    [ObservableProperty]
    private bool _isKeyboardNext = true;

    [ObservableProperty]
    private bool _isTrackpadNext;

    [ObservableProperty]
    private bool _isUsbNext;

    [ObservableProperty]
    private bool _isAvNext;

    [ObservableProperty]
    private bool _isWifiNext;

    [ObservableProperty]
    private bool _isBluetoothNext;

    [ObservableProperty]
    private bool _isChargerNext;

    [ObservableProperty]
    private string _wifiStatus = "";

    [ObservableProperty]
    private string _wifiLiveStatusText = "";

    [ObservableProperty]
    private bool _isWifiLiveConnected;

    [ObservableProperty]
    private string _ethernetLiveStatusText = "";

    [ObservableProperty]
    private bool _isEthernetLiveConnected;

    [ObservableProperty]
    private bool _isCheckingNetwork;

    [ObservableProperty]
    private bool _networkCheckDone;

    [ObservableProperty]
    private string _completionMessage = "";

    [ObservableProperty]
    private string _overallGrade = "";
    
    [ObservableProperty]
    private int _overallScore;

    [ObservableProperty]
    private string _reportPath = "";

    [ObservableProperty]
    private string _submissionStatus = "";

    [ObservableProperty]
    private System.Windows.Media.SolidColorBrush _submissionStatusColor = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(21, 128, 61));

    [ObservableProperty]
    private BitmapImage? _qrCodeImage;

    [ObservableProperty]
    private bool _hasQrCode;

    private readonly QCSubmissionService _submissionService;

    public QCWizardViewModel()
    {
        _workflowService = App.Current.Services.GetRequiredService<QCWorkflowService>();
        _reportGenerator = new ReportGenerator(LaptopQC.App.Branding.BrandInfo.ApiBaseUrl, LaptopQC.App.Branding.BrandInfo.AppDisplayName);
        _submissionService = new QCSubmissionService(new LaptopQC.Core.Models.ApiConfiguration { ApiUrl = $"{LaptopQC.App.Branding.BrandInfo.ApiBaseUrl}/api" });

        // These events fire from background threads (inside Task.Run in QCWorkflowService).
        // Marshal back to the UI thread to avoid cross-thread WPF exceptions.
        _workflowService.OnStatusUpdate += (status) =>
            Application.Current.Dispatcher.Invoke(() => AutomatedStatus = status);
        _workflowService.OnProgressUpdate += (progress) =>
            Application.Current.Dispatcher.Invoke(() => AutomatedProgress = progress);
    }

    [RelayCommand]
    private async Task StartTestsAsync()
    {
        if (string.IsNullOrWhiteSpace(RefurbId))
        {
            MessageBox.Show("Please enter a Refurbish ID.", "Validation Error");
            return;
        }

        _workflowService.StartNewSession(RefurbId, TechnicianId, PhysicalCondition, ScratchesAndDents);
        
        IsPrepStep = false;
        IsAutomatedStep = true;

        try
        {
            // Stress tests are mandatory in Full QC
            await _workflowService.RunAutomatedChecksAsync(skipStressTests: false);
            
            // Move to interactive
            IsAutomatedStep = false;
            IsInteractiveStep = true;
            UpdateInteractiveState();
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Automated check error: {ex.Message}", "Error");
            AutomatedStatus = "Failed";
        }
    }

    private void UpdateInteractiveState()
    {
        if (IsKeyboardNext) InteractiveInstruction = "Next: Keyboard Test";
        else if (IsTrackpadNext) InteractiveInstruction = "Next: Trackpad Test";
        else if (IsUsbNext) InteractiveInstruction = "Next: USB Port Test";
        else if (IsAvNext) InteractiveInstruction = "Next: Audio / Video Test";
        else if (IsWifiNext) InteractiveInstruction = "Next: Network Connectivity Test";
        else if (IsBluetoothNext) InteractiveInstruction = "Next: Bluetooth Test";
        else if (IsChargerNext) InteractiveInstruction = "Next: Charger / Charging Test";
    }

    [RelayCommand]
    private void RunKeyboardTest()
    {
        var win = new KeyboardTestWindow { Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.IsActive) };
        var result = win.ShowDialog();
        
        // Proceed if test completed (Passed or Failed)
        if (result.HasValue)
        {
            var (passed, msg) = win.GetResult();
            
            // If user Cancelled via button (msg is null/empty or specific cancel status), maybe stay? 
            // But usually "Cancel" button in test window sets Passed=false, IsComplete=true.
            // Let's assume any return means we recorded a result.
            
            _workflowService.RecordKeyboardResult(passed, msg);
            
            IsKeyboardNext = false;
            IsTrackpadNext = true;
            UpdateInteractiveState();
        }
    }

    [RelayCommand]
    private void RunTrackpadTest()
    {
        var win = new TrackpadTestWindow { Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.IsActive) };
        var result = win.ShowDialog();
        
        if (result.HasValue)
        {
            var (passed, msg) = win.GetResult();
            _workflowService.RecordTrackpadResult(passed, msg);
            
            IsTrackpadNext = false;
            IsUsbNext = true;
            UpdateInteractiveState();
        }
    }

    [RelayCommand]
    private void RunUsbTest()
    {
        var win = new UsbPortTestWindow { Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.IsActive) };
        var result = win.ShowDialog();
        
        if (result.HasValue)
        {
            var (passed, msg) = win.GetResult();
            _workflowService.RecordUsbResult(passed, msg);
            
            IsUsbNext = false;
            IsAvNext = true;
            UpdateInteractiveState();
        }
    }

    [RelayCommand]
    private void RunAvTest()
    {
        var win = new AudioVideoTestWindow { Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.IsActive) };
        win.ShowDialog();
        
        // AV window uses viewmodel result
        if (win.DataContext is AudioVideoTestViewModel vm && vm.IsComplete)
        {
            _workflowService.RecordAudioVideoResult(vm.Passed, vm.ResultMessage);
            
            // Record jack test result separately
            if (vm.JackTested)
            {
                _workflowService.RecordAudioJackResult(vm.JackPassed, 
                    vm.JackPassed ? "3.5mm Jack Test Passed" : "3.5mm Jack Test Failed");
            }

            // Record DisplayPort / HDMI result
            if (vm.DisplayPortTested)
            {
                _workflowService.RecordDisplayPortResult(vm.DisplayPortPassed,
                    vm.DisplayPortPassed ? "Display Port / HDMI Test Passed" : "Display Port / HDMI Test Failed");
            }
            
            IsAvNext = false;
            IsWifiNext = true;
            UpdateInteractiveState();
            StartNetworkPolling();
        }
    }

    private void StartNetworkPolling()
    {
        PollNetworkStatus(); // Check immediately
        _networkPollTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _networkPollTimer.Tick += (s, e) => PollNetworkStatus();
        _networkPollTimer.Start();
    }

    private void PollNetworkStatus()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up
                         && n.NetworkInterfaceType != NetworkInterfaceType.Loopback);

            bool wifi = false, ethernet = false;
            string wifiName = "", ethName = "";

            foreach (var ni in interfaces)
            {
                var desc = (ni.Description ?? "").ToLowerInvariant();
                var adapterName = (ni.Name ?? "").ToLowerInvariant();
                bool isVirtual = desc.Contains("virtual") || desc.Contains("hyper-v") ||
                                 desc.Contains("vmware") || desc.Contains("virtualbox") ||
                                 desc.Contains("docker") || desc.Contains("vpn") ||
                                 desc.Contains("tap-") || desc.Contains("tunnel") ||
                                 adapterName.Contains("vethernet") || adapterName.Contains("wsl") ||
                                 adapterName.Contains("docker") || adapterName.Contains("vmware");
                if (isVirtual) continue;

                if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    { wifi = true; wifiName = ni.Name; }
                else if (ni.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                         ni.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet)
                    { ethernet = true; ethName = ni.Name; }
            }

            IsWifiLiveConnected = wifi;
            WifiLiveStatusText = wifi ? $"WiFi: {wifiName}" : "WiFi: Not connected";

            IsEthernetLiveConnected = ethernet;
            EthernetLiveStatusText = ethernet ? $"Ethernet: {ethName}" : "Ethernet: Not connected";
        }
        catch
        {
            IsWifiLiveConnected = false;
            WifiLiveStatusText = "WiFi: Error reading adapter";
            IsEthernetLiveConnected = false;
            EthernetLiveStatusText = "Ethernet: Error reading adapter";
        }
    }

    private void StopNetworkPolling()
    {
        _networkPollTimer?.Stop();
        _networkPollTimer = null;
    }

    [RelayCommand]
    private async Task RunWifiTestAsync()
    {
        StopNetworkPolling();
        IsWifiNext = false;
        InteractiveInstruction = "Testing Network Connectivity...";
        IsCheckingNetwork = true;
        WifiStatus = "🔍 Checking network adapters...";

        bool wifiConnected = false;
        bool ethernetConnected = false;
        bool internetReachable = false;
        var details = new List<string>();

        try
        {
            await Task.Run(() =>
            {
                var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up
                             && n.NetworkInterfaceType != NetworkInterfaceType.Loopback);

                foreach (var ni in interfaces)
                {
                    // Skip virtual adapters (Hyper-V, WSL, Docker, VMware, VPN, etc.)
                    var desc = (ni.Description ?? "").ToLowerInvariant();
                    var adapterName = (ni.Name ?? "").ToLowerInvariant();
                    
                    bool isVirtual = desc.Contains("virtual") ||
                                     desc.Contains("hyper-v") ||
                                     desc.Contains("vmware") ||
                                     desc.Contains("virtualbox") ||
                                     desc.Contains("docker") ||
                                     desc.Contains("vpn") ||
                                     desc.Contains("tap-") ||
                                     desc.Contains("tunnel") ||
                                     adapterName.Contains("vethernet") ||
                                     adapterName.Contains("wsl") ||
                                     adapterName.Contains("docker") ||
                                     adapterName.Contains("vmware");
                    
                    if (isVirtual)
                        continue;

                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        wifiConnected = true;
                        details.Add($"WiFi: Connected ({ni.Name})");
                    }
                    else if (ni.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                             ni.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet)
                    {
                        ethernetConnected = true;
                        details.Add($"Ethernet: Connected ({ni.Name})");
                    }
                }
            });

            // Test actual internet connectivity
            if (wifiConnected || ethernetConnected)
            {
                WifiStatus = "🌐 Testing internet connectivity...";
                try
                {
                    using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                    var response = await http.GetAsync("http://www.msftconnecttest.com/connecttest.txt");
                    internetReachable = response.IsSuccessStatusCode;
                }
                catch
                {
                    internetReachable = false;
                }

                details.Add(internetReachable ? "Internet: Reachable" : "Internet: Not Reachable");
            }
        }
        catch (Exception ex)
        {
            details.Add($"Error: {ex.Message}");
        }

        IsCheckingNetwork = false;
        NetworkCheckDone = true;

        bool passed = (wifiConnected || ethernetConnected) && internetReachable;

        string statusParts = "";
        if (wifiConnected && ethernetConnected) statusParts = "WiFi ✓ + Ethernet ✓";
        else if (wifiConnected) statusParts = "WiFi ✓";
        else if (ethernetConnected) statusParts = "Ethernet ✓";
        else statusParts = "No connection detected";

        string internetStatus = internetReachable ? " — Internet ✓" : " — No Internet ✗";
        string message = passed
            ? $"Connected: {statusParts}{internetStatus}"
            : $"Failed: {statusParts}{internetStatus}";

        WifiStatus = passed
            ? $"✓ {statusParts}{internetStatus}"
            : $"✗ {statusParts}{internetStatus}";

        _workflowService.RecordNetworkResult(passed, message, details);

        // Short delay so tester can see result before moving on
        await Task.Delay(1500);
        NetworkCheckDone = false;
        IsBluetoothNext = true;
        UpdateInteractiveState();
    }

    [RelayCommand]
    private void RunBluetoothTest()
    {
        var win = new BluetoothTestWindow { Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.IsActive) };
        var result = win.ShowDialog();

        if (result.HasValue)
        {
            var (passed, msg) = win.GetResult();
            _workflowService.RecordBluetoothResult(passed, msg);

            IsBluetoothNext = false;
            IsChargerNext = true;
            UpdateInteractiveState();
        }
    }

    [RelayCommand]
    private void RunChargerTest()
    {
        var win = new ChargerTestWindow { Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.IsActive) };
        var result = win.ShowDialog();

        if (result.HasValue)
        {
            var (passed, msg) = win.GetResult();
            _workflowService.RecordChargerResult(passed, msg);

            IsChargerNext = false;
            FinishAndGenerateReport();
        }
    }

    private async void FinishAndGenerateReport()
    {
        IsInteractiveStep = false;
        IsReportStep = true;

        var report = _workflowService.Report;
        
        // Compute all scores and grades
        _workflowService.FinalizeGrades();
        _ = Task.Run(() => AutoBasicQcTaskService.EnsureRegistered());
        
        ReportPath = _reportGenerator.SaveReport(report);
        
        OverallGrade = report.PramaanResult?.GradeBand ?? "N/A";
        OverallScore = report.PramaanResult?.OverallHealthScore ?? 0;
        var label = report.PramaanResult?.GradeBand != null ? LaptopQC.Core.Services.GradingService.GradeLabel(report.PramaanResult.GradeBand) : "Unknown";
        var brandName = LaptopQC.App.Branding.BrandInfo.AppDisplayName.ToUpperInvariant();
        CompletionMessage = $"{brandName} Score: {OverallGrade} — {label} ({OverallScore}/100)";

        // Check if logged in - prompt login for cloud submission
        if (!App.IsLoggedIn)
        {
            SubmissionStatus = "Login required to submit to cloud...";
            SubmissionStatusColor = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(245, 158, 11));
            
            // Show login dialog
            var loginWindow = new Views.LoginWindow(App.AuthService)
            {
                Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.DataContext == this)
            };
            var loginResult = loginWindow.ShowDialog();
            
            // If still not logged in after dialog, ask if user wants to skip
            if (!App.IsLoggedIn)
            {
                var skipResult = MessageBox.Show(
                    "Login is required to submit results to the cloud.\n\n" +
                    "The report has been saved locally.\n\n" +
                    "Would you like to try logging in again?",
                    "Cloud Submission",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Question);
                
                if (skipResult == MessageBoxResult.Yes)
                {
                    // Retry login
                    var retryWindow = new Views.LoginWindow(App.AuthService)
                    {
                        Owner = Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.DataContext == this)
                    };
                    retryWindow.ShowDialog();
                }
                
                if (!App.IsLoggedIn)
                {
                    SubmissionStatus = "⚠ Skipped cloud submission (saved locally only)";
                    SubmissionStatusColor = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(245, 158, 11));
                    return;
                }
            }
        }

        // Now logged in - submit to API
        var technicianId = App.TechnicianId;
        SubmissionStatus = $"Submitting to Central Server (by {App.UserDisplayName})...";
        SubmissionStatusColor = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(245, 158, 11));

        // Refresh server-allocated Machine ID for this hardware (if license-based)
        await RefreshMachineIdAsync(report);

        // Set the server-allocated Machine ID on the report before submission
        if (App.MachineId.HasValue)
        {
            report.DeviceId = App.MachineId.Value;
            // Regenerate report so local certificate reflects the server-allocated Machine ID.
            ReportPath = _reportGenerator.SaveReport(report);
        }

        var submitResult = await _submissionService.SubmitReportAsync(report, technicianId, App.AuthService.Token);
        
        if (submitResult.Success)
        {
            SubmissionStatus = $"✓ Submitted (by {App.UserDisplayName})";
            SubmissionStatusColor = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(11, 148, 68));
            GenerateQrCode(report.HealthId);

            if (submitResult.DemoExhausted)
            {
                App.AuthService.Logout();
                MessageBox.Show(
                    "Demo completed. Activation required to continue.",
                    "Demo Completed",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
        }
        else
        {
            SubmissionStatus = submitResult.IsAuthError
                ? $"✗ Activation required to submit ({submitResult.ErrorMessage})"
                : $"✗ Failed to Submit: {submitResult.ErrorMessage}";
            SubmissionStatusColor = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(255, 0, 0));
        }
    }

    private void GenerateQrCode(string healthId)
    {
        try
        {
            // Use the brand-specific verification URL (set per brand in Branding/*.props)
            string verificationUrl = LaptopQC.App.Branding.BrandInfo.VerifyUrl(healthId);
            
            using var qrGenerator = new QRCodeGenerator();
            using var qrCodeData = qrGenerator.CreateQrCode(verificationUrl, QRCodeGenerator.ECCLevel.M);
            using var qrCode = new PngByteQRCode(qrCodeData);
            
            byte[] qrBytes = qrCode.GetGraphic(20);

            using var stream = new MemoryStream(qrBytes);
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.StreamSource = stream;
            bitmap.EndInit();
            bitmap.Freeze(); // Needed since it's created on a background/worker thread potentially

            App.Current.Dispatcher.Invoke(() =>
            {
                QrCodeImage = bitmap;
                HasQrCode = true;
            });
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Failed to generate QR Code: {ex.Message}");
        }
    }

    private async Task RefreshMachineIdAsync(LaptopQC.Core.Models.QCReport report)
    {
        try
        {
            var licenseKey = App.AuthService.LicenseKey;
            if (string.IsNullOrWhiteSpace(licenseKey))
                return;

            var serial = report.SystemInfo?.SerialNumber ?? "";
            if (!MachineIdentityService.IsUsableHardwareSerial(serial))
            {
                serial = MachineIdentityService.BuildFallbackSerial(
                    report.SystemInfo?.MacAddress ?? report.MacAddress,
                    report.SystemInfo?.ComputerName);
            }

            if (string.IsNullOrWhiteSpace(serial))
                serial = MachineIdentityService.BuildFallbackSerial(string.Empty, Environment.MachineName);

            var mac = report.SystemInfo?.MacAddress ?? report.MacAddress;
            var computerName = report.SystemInfo?.ComputerName ?? Environment.MachineName;

            await App.AuthService.LoginWithLicenseAsync(licenseKey, serial, mac, computerName);
        }
        catch
        {
            // Best-effort refresh; keep existing MachineId if refresh fails.
        }
    }

    [RelayCommand]
    private void OpenReport()
    {
        if (File.Exists(ReportPath))
        {
            Process.Start(new ProcessStartInfo(ReportPath) { UseShellExecute = true });
        }
    }

    [RelayCommand]
    private void CloseWizard()
    {
        Application.Current.Windows.OfType<Window>().SingleOrDefault(x => x.DataContext == this)?.Close();
    }
}
