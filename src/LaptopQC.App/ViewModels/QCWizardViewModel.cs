using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Services;
using LaptopQC.App.Views;
using System.Diagnostics;
using System.IO;
using System.Windows;

namespace LaptopQC.App.ViewModels;

public partial class QCWizardViewModel : ObservableObject
{
    private readonly QCWorkflowService _workflowService;
    private readonly ReportGenerator _reportGenerator;

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
    private string _completionMessage = "";

    [ObservableProperty]
    private bool _overallPassed;

    [ObservableProperty]
    private string _reportPath = "";

    [ObservableProperty]
    private string _submissionStatus = "";

    private readonly QCSubmissionService _submissionService;

    public QCWizardViewModel()
    {
        _workflowService = new QCWorkflowService();
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
            
            IsAvNext = false;
            FinishAndGenerateReport();
        }
    }

    private async void FinishAndGenerateReport()
    {
        IsInteractiveStep = false;
        IsReportStep = true;

        var report = _workflowService.Report;
        ReportPath = _reportGenerator.SaveReport(report);
        
        OverallPassed = report.OverallPass;
        CompletionMessage = OverallPassed ? "QC PASSED" : "QC FAILED";

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
        }
        else
        {
            SubmissionStatus = "✗ Failed to Submit (Saved Locally)";
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
