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
    private string _technicianNotes = "";

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
    private string _wifiStatus = "";

    [ObservableProperty]
    private string _networkLiveStatus = "";

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
    private BitmapImage? _qrCodeImage;

    [ObservableProperty]
    private bool _hasQrCode;

    private readonly QCSubmissionService _submissionService;

    public QCWizardViewModel()
    {
        _workflowService = App.Current.Services.GetRequiredService<QCWorkflowService>();
        _reportGenerator = new ReportGenerator();
        _submissionService = new QCSubmissionService();

        _workflowService.OnStatusUpdate += (status) => AutomatedStatus = status;
        _workflowService.OnProgressUpdate += (progress) => AutomatedProgress = progress;
    }

    [RelayCommand]
    private async Task StartTestsAsync()
    {
        if (string.IsNullOrWhiteSpace(RefurbId))
        {
            MessageBox.Show("Please enter a Refurbish ID.", "Validation Error");
            return;
        }

        _workflowService.StartNewSession(RefurbId, TechnicianNotes);
        
        IsPrepStep = false;
        IsAutomatedStep = true;

        try
        {
            await _workflowService.RunAutomatedChecksAsync();
            
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

            var parts = new List<string>();
            parts.Add(wifi ? $"✓ WiFi: {wifiName}" : "✗ WiFi: Not connected");
            parts.Add(ethernet ? $"✓ Ethernet: {ethName}" : "✗ Ethernet: Not connected");
            NetworkLiveStatus = string.Join("   |   ", parts);
        }
        catch
        {
            NetworkLiveStatus = "⚠ Could not read adapters";
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
                    var response = await http.GetAsync("https://www.google.com");
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
        FinishAndGenerateReport();
    }

    private async void FinishAndGenerateReport()
    {
        IsInteractiveStep = false;
        IsReportStep = true;

        var report = _workflowService.Report;
        
        // Compute all scores and grades
        _workflowService.FinalizeGrades();
        
        ReportPath = _reportGenerator.SaveReport(report);
        
        OverallGrade = report.OverallGrade;
        OverallScore = report.OverallScore;
        var label = LaptopQC.Core.Services.GradingService.GradeLabel(report.OverallGrade);
        CompletionMessage = $"Grade: {report.OverallGrade} — {label} ({report.OverallScore}/100)";

        // Check if logged in - prompt login for cloud submission
        if (!App.IsLoggedIn)
        {
            SubmissionStatus = "Login required to submit to cloud...";
            
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
                    return;
                }
            }
        }

        // Now logged in - submit to API
        var technicianId = App.TechnicianId;
        SubmissionStatus = $"Submitting to Central Server (by {App.UserDisplayName})...";
        
        var success = await _submissionService.SubmitReportAsync(report, technicianId);
        
        if (success)
        {
            SubmissionStatus = $"✓ Submitted (by {App.UserDisplayName})";
            GenerateQrCode(report.HealthId);
        }
        else
        {
            SubmissionStatus = "✗ Failed to Submit (Saved Locally)";
        }
    }

    private void GenerateQrCode(string healthId)
    {
        try
        {
            // Use the dev URL
            string verificationUrl = $"https://gg-qcsoftware.vercel.app/verify/{healthId}";
            
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
