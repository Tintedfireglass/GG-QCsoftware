using System.Configuration;
using System.Data;
using System.Windows;
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

    protected override void OnStartup(StartupEventArgs e)
    {
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
        
        // Register QC reminder scheduled task (if not already registered)
        Task.Run(() => ReminderTaskService.EnsureRegistered());
    }
}
