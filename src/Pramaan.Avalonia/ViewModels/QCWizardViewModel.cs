using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Services;
using Microsoft.Extensions.DependencyInjection;
using Pramaan.Avalonia.Views;
using System.Diagnostics;
using System.IO;
using System.Net.NetworkInformation;
using Avalonia;
using Avalonia.Threading;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using System.Linq;

namespace Pramaan.Avalonia.ViewModels;

public partial class QCWizardViewModel : ObservableObject
{
    private Window? GetActiveWindow()
    {
        if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            return desktop.Windows.FirstOrDefault(x => x.IsActive) ?? desktop.MainWindow;
        }
        return null;
    }

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

    private readonly QCSubmissionService _submissionService;

    public QCWizardViewModel()
    {
        _workflowService = App.Current?.Services?.GetRequiredService<QCWorkflowService>()
            ?? throw new InvalidOperationException("DI container not initialized");
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
            // Show validation message
            var msgWindow = new Window
            {
                Title = "Validation",
                Width = 360,
                Height = 160,
                WindowStartupLocation = global::Avalonia.Controls.WindowStartupLocation.CenterOwner,
                CanResize = false,
                Content = new StackPanel
                {
                    Margin = new global::Avalonia.Thickness(24),
                    VerticalAlignment = global::Avalonia.Layout.VerticalAlignment.Center,
                    Children =
                    {
                        new TextBlock
                        {
                            Text = "Please enter a Refurbish ID before starting tests.",
                            TextWrapping = global::Avalonia.Media.TextWrapping.Wrap,
                            FontSize = 14,
                            Margin = new global::Avalonia.Thickness(0, 0, 0, 16)
                        },
                        new Button
                        {
                            Content = "OK",
                            HorizontalAlignment = global::Avalonia.Layout.HorizontalAlignment.Center,
                            Width = 80,
                            HorizontalContentAlignment = global::Avalonia.Layout.HorizontalAlignment.Center
                        }
                    }
                }
            };
            // Wire up the OK button to close
            var panel = (StackPanel)msgWindow.Content;
            var okBtn = (Button)panel.Children[1];
            okBtn.Click += (s, e) => msgWindow.Close();
            await msgWindow.ShowDialog(GetActiveWindow()!);
            return;
        }

        _workflowService.StartNewSession(RefurbId, TechnicianNotes);
        
        IsPrepStep = false;
        IsAutomatedStep = true;

        try
        {
            await _workflowService.RunAutomatedChecksAsync();
            IsAutomatedStep = false;
            IsInteractiveStep = true;
            UpdateInteractiveState();
        }
        catch (Exception ex)
        {
            AutomatedStatus = "Failed: " + ex.Message;
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
    private async Task RunKeyboardTestAsync()
    {
        var win = new KeyboardTestWindow();
        await win.ShowDialog(GetActiveWindow()!);
        
        var (passed, msg) = win.GetResult();
        _workflowService.RecordKeyboardResult(passed, msg);
        
        IsKeyboardNext = false;
        IsTrackpadNext = true;
        UpdateInteractiveState();
    }

    [RelayCommand]
    private async Task RunTrackpadTestAsync()
    {
        var win = new TrackpadTestWindow();
        await win.ShowDialog(GetActiveWindow()!);
        
        var (passed, msg) = win.GetResult();
        _workflowService.RecordTrackpadResult(passed, msg);
        
        IsTrackpadNext = false;
        IsUsbNext = true;
        UpdateInteractiveState();
    }

    [RelayCommand]
    private async Task RunUsbTestAsync()
    {
        var win = new UsbPortTestWindow();
        await win.ShowDialog(GetActiveWindow()!);
        
        var (passed, msg) = win.GetResult();
        _workflowService.RecordUsbResult(passed, msg);
        
        IsUsbNext = false;
        IsAvNext = true;
        UpdateInteractiveState();
    }

    [RelayCommand]
    private async Task RunAvTestAsync()
    {
        var win = new AudioVideoTestWindow();
        await win.ShowDialog(GetActiveWindow()!);
        
        if (win.DataContext is AudioVideoTestViewModel vm)
        {
            _workflowService.RecordAudioVideoResult(vm.Passed, vm.ResultMessage);
            
            if (vm.JackTested)
            {
                _workflowService.RecordAudioJackResult(vm.JackPassed, 
                    vm.JackPassed ? "3.5mm Jack Test Passed" : "3.5mm Jack Test Failed");
            }
        }
        
        IsAvNext = false;
        IsWifiNext = true;
        UpdateInteractiveState();
        StartNetworkPolling();
    }

    private void StartNetworkPolling()
    {
        PollNetworkStatus();
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
            parts.Add(wifi ? $"WiFi: {wifiName}" : "WiFi: Not connected");
            parts.Add(ethernet ? $"Ethernet: {ethName}" : "Ethernet: Not connected");
            NetworkLiveStatus = string.Join("   |   ", parts);
        }
        catch
        {
            NetworkLiveStatus = "Could not read adapters";
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
        WifiStatus = "Checking network adapters...";

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
                    
                    if (isVirtual) continue;

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
                WifiStatus = "Testing internet connectivity...";
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
        if (wifiConnected && ethernetConnected) statusParts = "WiFi + Ethernet";
        else if (wifiConnected) statusParts = "WiFi";
        else if (ethernetConnected) statusParts = "Ethernet";
        else statusParts = "No connection detected";

        string internetStatus = internetReachable ? " — Internet OK" : " — No Internet";
        string message = passed
            ? $"Connected: {statusParts}{internetStatus}"
            : $"Failed: {statusParts}{internetStatus}";

        WifiStatus = passed
            ? $"PASS: {statusParts}{internetStatus}"
            : $"FAIL: {statusParts}{internetStatus}";

        _workflowService.RecordNetworkResult(passed, message, details);

        await Task.Delay(1500);
        await FinishAndGenerateReportAsync();
    }

    private async Task FinishAndGenerateReportAsync()
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
            var loginWindow = new LoginWindow(App.AuthService);
            await loginWindow.ShowDialog(GetActiveWindow()!);
            
            // If still not logged in after dialog, offer retry
            if (!App.IsLoggedIn)
            {
                // In Avalonia we can't use MessageBox.Show easily, so show a second login attempt
                SubmissionStatus = "Login skipped. Trying once more...";
                var retryWindow = new LoginWindow(App.AuthService);
                await retryWindow.ShowDialog(GetActiveWindow()!);
                
                if (!App.IsLoggedIn)
                {
                    SubmissionStatus = "Skipped cloud submission (saved locally only)";
                    return;
                }
            }
        }

        // Now logged in - submit to API
        var technicianId = App.TechnicianId;
        SubmissionStatus = $"Submitting to Central Server (by {App.UserDisplayName})...";
        
        try
        {
            var submitResult = await _submissionService.SubmitReportAsync(report, technicianId, App.AuthService.Token);
            
            if (submitResult.Success)
            {
                SubmissionStatus = $"Submitted (by {App.UserDisplayName})";
            }
            else
            {
                SubmissionStatus = submitResult.IsAuthError
                    ? "Activation required to submit"
                    : "Failed to Submit (Saved Locally)";
            }
        }
        catch (Exception ex)
        {
            SubmissionStatus = $"Submission error: {ex.Message}";
        }
    }

    [RelayCommand]
    private void OpenReport()
    {
        if (File.Exists(ReportPath))
            Process.Start(new ProcessStartInfo(ReportPath) { UseShellExecute = true });
    }

    [RelayCommand]
    private void CloseWizard()
    {
        GetActiveWindow()?.Close();
    }
}
