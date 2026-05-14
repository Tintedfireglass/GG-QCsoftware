using System.Configuration;
using System.Data;
using System.IO;
using System.Linq;
using System.Windows;
using Application = System.Windows.Application;
using LaptopQC.App.Services;
using LaptopQC.Core.Services;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Core.Abstractions;
using LaptopQC.App.Views;
using Microsoft.Extensions.DependencyInjection;
using LaptopQC.Hardware.Providers;

namespace LaptopQC.App;

/// <summary>
/// Interaction logic for App.xaml
/// </summary>
public partial class App : Application
{
    /// <summary>
    /// Gets the current App instance in use
    /// </summary>
    public new static App Current => (App)Application.Current;

    /// <summary>
    /// Gets the IServiceProvider to resolve dependencies.
    /// </summary>
    public IServiceProvider Services { get; }

    public App()
    {
        Services = ConfigureServices();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        
        // Register hardware providers (Windows-specific implementations for now)
        services.AddSingleton<IWmiProvider, WmiProvider>();
        services.AddSingleton<ISensorProvider, SensorProvider>();
        services.AddSingleton<ISmartctlProvider, SmartctlProvider>();
        
        // Register core diagnostics needed by QCWorkflowService
        services.AddTransient<ISystemDiagnostic, SystemDiagnostic>();
        services.AddTransient<ICpuDiagnostic, CpuDiagnostic>();
        services.AddTransient<IRamDiagnostic, RamDiagnostic>();
        services.AddTransient<IStorageDiagnostic, StorageDiagnostic>();
        services.AddTransient<IBatteryDiagnostic, BatteryDiagnostic>();
        services.AddTransient<IDeviceDiagnostic, DeviceDiagnostic>();
        services.AddTransient<ISmartTestService, SmartTestService>();
        
        services.AddTransient<QCWorkflowService>();
        
        // As we move to Avalonia, we will register ViewModels and Core Services here and resolve them
        
        return services.BuildServiceProvider();
    }

    /// <summary>
    /// Shared AuthService instance for the entire application.
    /// This is used to track logged-in technician across windows.
    /// </summary>
    public static AuthService AuthService { get; } = new AuthService();

    /// <summary>
    /// Shared TrialService instance — manages the 7-day free trial lifecycle.
    /// </summary>
    public static TrialService TrialService { get; } = new TrialService();
    
    /// <summary>
    /// Convenience property to get the current technician ID (null if not logged in)
    /// </summary>
    public static int? TechnicianId => AuthService.GetTechnicianId();
    
    /// <summary>
    /// Display name for the current user (or "Offline" if not logged in)
    /// </summary>
    public static string UserDisplayName => AuthService.CurrentUser?.DisplayText ?? "Offline";
    
    /// <summary>
    /// Check if a user is logged in
    /// </summary>
    public static bool IsLoggedIn => AuthService.IsLoggedIn;
    
    /// <summary>
    /// Server-allocated Machine ID (null if not activated via license)
    /// </summary>
    public static int? MachineId => AuthService.MachineId;

    /// <summary>
    /// When true, the app is locked until an online compliance check succeeds.
    /// </summary>
    public static bool IsComplianceLocked { get; private set; }

    public static void SetComplianceLocked(bool locked)
    {
        IsComplianceLocked = locked;
    }

    /// <summary>
    /// Clears both the trial session file and the auth session, then fires LoggedOut.
    /// Call this instead of AuthService.Logout() when revoking a trial.
    /// </summary>
    public static void PerformTrialLogout()
    {
        AuthService.Logout();
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        bool isAutoBasicQc = e.Args.Any(arg => arg.Equals("--auto-basic-qc", StringComparison.OrdinalIgnoreCase));
        bool isHeartbeat   = e.Args.Any(arg => arg.Equals("--heartbeat",      StringComparison.OrdinalIgnoreCase));
        bool isBackground  = e.Args.Any(arg => arg.Equals("--background",     StringComparison.OrdinalIgnoreCase));

        if (isAutoBasicQc)
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            StartupUri = null;
            _ = RunAutoBasicQcAsync().ContinueWith(_ => Dispatcher.Invoke(Shutdown));
            return;
        }
        if (isHeartbeat)
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            StartupUri = null;
            _ = RunHeartbeatAsync().ContinueWith(_ => Dispatcher.Invoke(Shutdown));
            return;
        }
        if (isBackground)
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            StartupUri = null;
            RunBackgroundMode();
            return;
        }

        base.OnStartup(e);
        
        // First-run: show T&C / Privacy Policy acceptance
        if (!TermsWindow.HasAccepted())
        {
            // Prevent WPF from shutting down when the dialog closes
            // (MainWindow hasn't been created yet by StartupUri)
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            
            var termsWin = new TermsWindow();
            termsWin.ShowDialog();
            
            if (!termsWin.Accepted)
            {
                Shutdown();
                return;
            }
            
            TermsWindow.RecordAcceptance();
            
            // Restore normal shutdown behavior
            ShutdownMode = ShutdownMode.OnLastWindowClose;
        }
        
        // Register all background scheduled tasks (safe to call every startup — each checks first)
        Task.Run(() => ReminderTaskService.EnsureRegistered());
        Task.Run(() => AutoBasicQcTaskService.EnsureRegistered());
        Task.Run(() => HeartbeatTaskService.EnsureRegistered());
        Task.Run(() => AutostartTaskService.EnsureRegistered());

        // Restore trial session if no license session is active
        if (!IsLoggedIn)
        {
            if (TrialService.IsTrialExpired)
            {
                // Expired trial — wipe the local file so the UI shows "Click to Activate"
                TrialService.ClearTrial();
            }
            else if (TrialService.IsTrialActive)
            {
                var trial = TrialService.CurrentTrial!;
                AuthService.StartTrialSession(
                    trial.Email, trial.Token, trial.MachineId, trial.TrialEndsAtUtc);
            }
        }
    }

    /// <summary>
    /// Public entry point to kick off an auto basic QC run in the background.
    /// Called immediately after a fresh trial activation so the server gets
    /// an initial health report right away.
    /// </summary>
    public Task RunAutoBasicQcInBackgroundAsync() => RunAutoBasicQcAsync();

    private async Task RunAutoBasicQcAsync()
    {
        try
        {
            // Allow license-activated users and free trial users; block unactivated installs.
            if (string.IsNullOrWhiteSpace(AuthService.LicenseKey) && !AuthService.IsTrialSession)
                return;

            var serial = DeviceIdentityService.GetMachineSerialNumber();
            var mac = DeviceIdentityService.GetMacAddress();
            var computerName = DeviceIdentityService.GetComputerName();

            // License-activated: re-validate the key and refresh the token.
            // Trial users already have a valid token from StartTrialSession — skip re-auth.
            if (!string.IsNullOrWhiteSpace(AuthService.LicenseKey))
            {
                var loginResult = await AuthService.LoginWithLicenseAsync(AuthService.LicenseKey, serial, mac, computerName);
                if (!loginResult.Success)
                {
                    AuthService.Logout();
                    return;
                }
            }

            var workflow = Services.GetRequiredService<QCWorkflowService>();
            workflow.StartNewSession("AUTO_BASIC_QC", "Automated weekly component check");

            if (MachineId.HasValue)
                workflow.Report.DeviceId = MachineId.Value;

            await workflow.RunAutomatedChecksAsync(skipStressTests: true);

            var grading = new GradingService();
            var components = new[] { "CPU", "RAM", "Storage", "Battery", "SMART" };
            var componentGrades = grading.GradeComponentTestsOnly(workflow.Report, components);

            if (componentGrades.Count == 0)
                return;

            var submission = new MachineHistorySubmissionService();
            var submitResult = await submission.SubmitComponentGradesAsync(
                workflow.Report,
                componentGrades,
                "auto_basic_qc",
                AuthService.Token);

            if (!submitResult.Success && submitResult.IsAuthError)
                AuthService.Logout();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Auto basic QC failed: {ex.Message}");
        }
    }

    private async Task RunHeartbeatAsync()
    {
        try
        {
            // Allow license-activated users and free trial users; block unactivated installs.
            if (string.IsNullOrWhiteSpace(AuthService.LicenseKey) && !AuthService.IsTrialSession)
                return;

            var serial = DeviceIdentityService.GetMachineSerialNumber();
            var mac = DeviceIdentityService.GetMacAddress();
            var computerName = DeviceIdentityService.GetComputerName();

            if (!string.IsNullOrWhiteSpace(AuthService.LicenseKey))
            {
                // License-activated: re-auth with license key (refreshes last_seen on server)
                await AuthService.LoginWithLicenseAsync(AuthService.LicenseKey, serial, mac, computerName);
            }
            else if (AuthService.IsTrialSession)
            {
                // Trial: just ping the server to refresh last_seen using the existing token
                await AuthService.SendTrialHeartbeatAsync(serial, mac, computerName);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Heartbeat failed: {ex.Message}");
        }
    }

    /// <summary>
    /// Runs the app silently in the background with a system tray icon.
    /// Triggered by the --background flag from the PramaanAutostart scheduled task (ONLOGON).
    /// - Shows a system tray icon (right-click: Open / Exit).
    /// - Runs a heartbeat immediately and then every 4 hours.
    /// - Runs auto QC if the last full QC was 7+ days ago.
    /// - Re-registers all scheduled tasks so updates are applied automatically.
    /// </summary>
    private void RunBackgroundMode()
    {
        // Re-register all background tasks so any update to exe path/settings is applied.
        Task.Run(() => AutoBasicQcTaskService.EnsureRegistered());
        Task.Run(() => HeartbeatTaskService.EnsureRegistered());
        Task.Run(() => ReminderTaskService.EnsureRegistered());
        // Note: AutostartTaskService re-registers itself from normal startup mode.

        // Set up tray icon
        var tray = new TrayIconService(this);
        Exit += (_, _) => tray.Dispose();

        // Run heartbeat immediately on login, then every 4 hours
        _ = RunHeartbeatAsync();
        var heartbeatTimer = new System.Threading.Timer(
            _ => _ = RunHeartbeatAsync(),
            state: null,
            dueTime: TimeSpan.FromHours(4),
            period: TimeSpan.FromHours(4));
        Exit += (_, _) => heartbeatTimer.Dispose();

        // Check if auto QC is overdue and run it if so
        _ = RunAutoQcIfDueAsync();
    }

    /// <summary>
    /// Checks the last_qc_test.txt timestamp. If no QC has been run in 7+ days
    /// (or ever), runs the automated basic QC and submits results to the server.
    /// </summary>
    private async Task RunAutoQcIfDueAsync()
    {
        const int AutoQcIntervalDays = 7;

        var timestampFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Pramaan", "last_qc_test.txt");

        bool isDue = true;
        try
        {
            if (File.Exists(timestampFile))
            {
                var text = File.ReadAllText(timestampFile).Trim();
                if (DateTime.TryParse(text, null,
                    System.Globalization.DateTimeStyles.RoundtripKind, out var lastTest))
                {
                    isDue = (DateTime.UtcNow - lastTest).TotalDays >= AutoQcIntervalDays;
                }
            }
        }
        catch { /* Treat unreadable timestamp as overdue */ }

        if (isDue)
            await RunAutoBasicQcAsync();
    }
}
