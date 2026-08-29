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
using LaptopQC.App.Branding;

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

        // ── Global crash logger ───────────────────────────────────────────────
        // Writes every unhandled exception to Desktop\pramaan_crash.log
        var logPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
            "pramaan_crash.log");

        DispatcherUnhandledException += (_, e) =>
        {
            File.AppendAllText(logPath,
                $"[{DateTime.Now:u}] DispatcherUnhandledException:\n{e.Exception}\n\n");
            e.Handled = false;
        };

        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            File.AppendAllText(logPath,
                $"[{DateTime.Now:u}] UnhandledException (IsTerminating={e.IsTerminating}):\n{e.ExceptionObject}\n\n");
        };

        System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            File.AppendAllText(logPath,
                $"[{DateTime.Now:u}] UnobservedTaskException:\n{e.Exception}\n\n");
            e.SetObserved();
        };
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
    public static AuthService AuthService { get; } = new AuthService($"{Branding.BrandInfo.ApiBaseUrl}/api");

    /// <summary>
    /// Shared TrialService instance — manages the 7-day free trial lifecycle.
    /// </summary>
    public static TrialService TrialService { get; } = new TrialService($"{Branding.BrandInfo.ApiBaseUrl}/api");
    
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
    private static readonly System.Threading.Mutex AutoQcMutex =
        new(false, @"Local\Pramaan_AutoBasicQc_Run");

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
        BrandingManager.LoadBrandResources(this);
        LaptopQC.Core.Models.AppPaths.AppDataFolderName = BrandInfo.AppDataFolderName;

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

        bool isAutoBasicQc = e.Args.Any(arg => arg.Equals("--auto-basic-qc", StringComparison.OrdinalIgnoreCase));
        bool isHeartbeat   = e.Args.Any(arg => arg.Equals("--heartbeat",      StringComparison.OrdinalIgnoreCase));
        bool isBackground  = e.Args.Any(arg => arg.Equals("--background",     StringComparison.OrdinalIgnoreCase));

        if (isAutoBasicQc)
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            _ = RunAutoBasicQcAsync().ContinueWith(t => 
            {
                Dispatcher.Invoke(Shutdown);
            });
            return;
        }
        if (isHeartbeat)
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            _ = RunHeartbeatAsync().ContinueWith(_ => Dispatcher.Invoke(Shutdown));
            return;
        }
        if (isBackground)
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            RunBackgroundMode();
            return;
        }

        // First-run: show T&C / Privacy Policy acceptance
        if (!TermsWindow.HasAccepted())
        {
            // Prevent WPF from shutting down when the dialog closes
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            
            var termsWin = new TermsWindow();
            termsWin.ShowDialog();
            
            if (!termsWin.Accepted)
            {
                Shutdown();
                return;
            }
            
            TermsWindow.RecordAcceptance();
        }
        
        // Restore normal shutdown behavior
        ShutdownMode = ShutdownMode.OnLastWindowClose;
        
        // Open main UI since StartupUri is no longer set in App.xaml
        var mainWindow = new MainWindow();
        mainWindow.Show();
        
        // Register all background scheduled tasks (safe to call every startup — each checks first)
        _ = Task.Run(() => ReminderTaskService.EnsureRegistered());
        _ = Task.Run(() => AutoBasicQcTaskService.EnsureRegistered());
        _ = Task.Run(() => HeartbeatTaskService.EnsureRegistered());
        _ = Task.Run(() => AutostartTaskService.EnsureRegistered());

        // Run auto QC immediately if the app was just updated to a new version
        _ = Task.Run(() => RunAutoQcIfUpdatedAsync());
        _ = Task.Run(() => RunAutoQcIfDueAsync());
    }

    /// <summary>
    /// Compares the current app version with the last recorded version.
    /// If the version changed (i.e. the app was updated), runs an immediate auto QC
    /// so the server gets a fresh health report reflecting the new build.
    /// </summary>
    private async Task RunAutoQcIfUpdatedAsync()
    {
        try
        {
            var versionFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                BrandInfo.AppDataFolderName, "last_known_version.txt");

            var currentVersion = AppVersionProvider.GetVersion().Split('+')[0].Trim();
            var lastVersion = File.Exists(versionFile) ? File.ReadAllText(versionFile).Trim() : null;

            // Always update the stored version
            Directory.CreateDirectory(Path.GetDirectoryName(versionFile)!);
            File.WriteAllText(versionFile, currentVersion);

            if (lastVersion != null && lastVersion != currentVersion)
            {
                // Version changed — run auto QC immediately
                await RunAutoBasicQcAsync();
            }
        }
        catch { /* best-effort */ }
    }

    /// <summary>
    /// Public entry point to kick off an auto basic QC run in the background.
    /// Called immediately after a fresh trial activation so the server gets
    /// an initial health report right away.
    /// </summary>
    public Task RunAutoBasicQcInBackgroundAsync() => RunAutoBasicQcAsync();

    private async Task RunAutoBasicQcAsync()
    {
        var logFile = Path.Combine(Path.GetTempPath(), $"{BrandInfo.BrandXamlKey}_auto_basic_qc.log");
        var lockTaken = false;
        try
        {
            try
            {
                lockTaken = AutoQcMutex.WaitOne(0);
            }
            catch (System.Threading.AbandonedMutexException)
            {
                lockTaken = true;
            }

            if (!lockTaken)
            {
                File.AppendAllText(logFile, $"[{DateTime.Now:u}] Auto QC already running. Skipping.\n");
                return;
            }

            if (string.IsNullOrWhiteSpace(AuthService.LicenseKey) && !AuthService.IsTrialSession)
            {
                File.AppendAllText(logFile, $"[{DateTime.Now:u}] Auto QC skipped because no license or trial session is active.\n");
                return;
            }

            var serial = DeviceIdentityService.GetMachineSerialNumber();
            var mac = DeviceIdentityService.GetMacAddress();
            var computerName = DeviceIdentityService.GetComputerName();
            File.AppendAllText(logFile, $"[{DateTime.Now:u}] Starting auto basic QC. Serial: {serial}\n");

            // License-activated: re-validate the key and refresh the token.
            // Trial users already have a valid token from StartTrialSession — skip re-auth.
            if (!string.IsNullOrWhiteSpace(AuthService.LicenseKey))
            {
                var loginResult = await AuthService.LoginWithLicenseAsync(AuthService.LicenseKey, serial, mac, computerName);
                if (!loginResult.Success)
                {
                    File.AppendAllText(logFile, $"[{DateTime.Now:u}] Re-auth failed (IsAuthError={loginResult.IsAuthError}): {loginResult.Message}\n");
                    // Only logout if the server explicitly rejected the key (not a network/timeout failure)
                    if (loginResult.IsAuthError)
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
            var components = new[] { "CPU", "RAM", "Storage", "Battery" };
            var componentGrades = grading.GradeComponentTestsOnly(workflow.Report, components);

            if (componentGrades.Count == 0)
            {
                File.AppendAllText(logFile, $"[{DateTime.Now:u}] No component grades produced. Returning.\n");
                return;
            }

            File.AppendAllText(logFile, $"[{DateTime.Now:u}] Submitting {componentGrades.Count} grades...\n");
            var submission = new MachineHistorySubmissionService();
            var submitResult = await submission.SubmitComponentGradesAsync(
                workflow.Report,
                componentGrades,
                "auto_basic_qc",
                AuthService.Token);

            File.AppendAllText(logFile, $"[{DateTime.Now:u}] Submission result: Success={submitResult.Success}, Error={submitResult.ErrorMessage}\n");

            if (submitResult.Success)
            {
                AutoBasicQcTaskService.MarkAutoQcRunCompleted();
                // Update the timestamp so the 7-day timer resets correctly
                try
                {
                    var timestampFile = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                        BrandInfo.AppDataFolderName, "last_qc_test.txt");
                    Directory.CreateDirectory(Path.GetDirectoryName(timestampFile)!);
                    File.WriteAllText(timestampFile, DateTime.UtcNow.ToString("O"));
                }
                catch { /* best-effort */ }
            }
            else if (submitResult.IsAuthError)
            {
                AuthService.Logout();
            }
        }
        catch (Exception ex)
        {
            File.AppendAllText(logFile, $"[{DateTime.Now:u}] Exception: {ex.Message}\n{ex.StackTrace}\n");
            System.Diagnostics.Debug.WriteLine($"Auto basic QC failed: {ex.Message}");
        }
        finally
        {
            if (lockTaken)
                AutoQcMutex.ReleaseMutex();
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
    /// - Runs auto QC if the activation-based weekly interval has elapsed.
    /// - Re-registers all scheduled tasks so updates are applied automatically.
    /// </summary>
    private void RunBackgroundMode()
    {
        // Re-register all background tasks so any update to exe path/settings is applied.
        _ = Task.Run(() => AutostartTaskService.EnsureRegistered());
        _ = Task.Run(() => AutoBasicQcTaskService.EnsureRegistered());
        _ = Task.Run(() => HeartbeatTaskService.EnsureRegistered());
        _ = Task.Run(() => ReminderTaskService.EnsureRegistered());

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
    /// Checks whether the activation-based weekly AutoQC interval has elapsed.
    /// </summary>
    private async Task RunAutoQcIfDueAsync()
    {
        const int AutoQcIntervalDays = 7;
        try
        {
            if (AutoBasicQcTaskService.IsAutoQcDue(TimeSpan.FromDays(AutoQcIntervalDays)))
                await RunAutoBasicQcAsync();
        }
        catch { /* Treat unreadable activation state as not due */ }
    }
}
