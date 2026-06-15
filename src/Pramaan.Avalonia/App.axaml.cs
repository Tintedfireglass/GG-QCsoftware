using System;
using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Core.Services;
using LaptopQC.Hardware.Providers;
using System.Threading.Tasks;
using MacOSDiag = LaptopQC.Core.Diagnostics.macOS;

namespace Pramaan.Avalonia;

public partial class App : Application
{
    public new static App? Current => Application.Current as App;
    public IServiceProvider? Services { get; private set; }

    public static AuthService AuthService { get; } = new AuthService();
    public static int? TechnicianId => AuthService.GetTechnicianId();
    public static string UserDisplayName => AuthService.CurrentUser?.DisplayText ?? "Offline";
    public static bool IsLoggedIn => AuthService.IsLoggedIn;

    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        Services = ConfigureServices();

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            if (!Views.TermsWindow.HasAccepted())
            {
                // Bug fix: When TermsWindow (the current MainWindow) closes, Avalonia's
                // default ShutdownMode=OnMainWindowClose fires before our Closed handler
                // can set a new MainWindow \u2014 causing the app to exit on macOS.
                // Switch to explicit shutdown for the duration of the swap.
                desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;

                var termsWin = new Views.TermsWindow();
                desktop.MainWindow = termsWin;
                
                // Swap to MainWindow upon acceptance
                termsWin.Closed += (s, e) =>
                {
                    if (termsWin.Accepted)
                    {
                        Views.TermsWindow.RecordAcceptance();
                        var mainWin = new MainWindow();
                        desktop.MainWindow = mainWin;
                        mainWin.Show();
                        // Restore normal shutdown behaviour now that MainWindow is live.
                        desktop.ShutdownMode = ShutdownMode.OnMainWindowClose;
                    }
                    else
                    {
                        desktop.Shutdown();
                    }
                };
            }
            else
            {
                desktop.MainWindow = new MainWindow();
            }

            // Register QC reminder scheduled task (if not already registered)
            Task.Run(() => ReminderTaskService.EnsureRegistered());
        }

        base.OnFrameworkInitializationCompleted();
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        
#if WINDOWS
        // ── Windows implementations ──
        services.AddSingleton<IWmiProvider, WmiProvider>();
        services.AddSingleton<ISensorProvider, SensorProvider>();
        services.AddSingleton<ISmartctlProvider, SmartctlProvider>();
        
        services.AddTransient<ISystemDiagnostic, SystemDiagnostic>();
        services.AddTransient<ICpuDiagnostic, CpuDiagnostic>();
        services.AddTransient<IRamDiagnostic, RamDiagnostic>();
        services.AddTransient<IStorageDiagnostic, StorageDiagnostic>();
        services.AddTransient<IBatteryDiagnostic, BatteryDiagnostic>();
        services.AddTransient<IDeviceDiagnostic, DeviceDiagnostic>();
        services.AddTransient<ISmartTestService, SmartTestService>();
        services.AddTransient<IAudioVideoTestService, AudioVideoTestService>();
#else
        // ── macOS implementations ──
        services.AddTransient<ISystemDiagnostic, MacOSDiag.MacSystemDiagnostic>();
        services.AddTransient<ICpuDiagnostic, MacOSDiag.MacCpuDiagnostic>();
        services.AddTransient<IRamDiagnostic, MacOSDiag.MacRamDiagnostic>();
        services.AddTransient<IStorageDiagnostic, MacOSDiag.MacStorageDiagnostic>();
        services.AddTransient<IBatteryDiagnostic, MacOSDiag.MacBatteryDiagnostic>();
        services.AddTransient<IDeviceDiagnostic, MacOSDiag.MacDeviceDiagnostic>();
        services.AddTransient<ISmartTestService, MacOSDiag.MacSmartTestService>();
        services.AddTransient<IAudioVideoTestService, MacOSDiag.MacAudioVideoTestService>();
#endif
        
        // ── Platform-neutral services ──
        services.AddTransient<QCWorkflowService>();
        
        return services.BuildServiceProvider();
    }
}
