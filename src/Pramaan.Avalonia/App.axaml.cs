using System;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using LaptopQC.Core.Services;
using LaptopQC.Hardware.Providers;
using System.Threading.Tasks;

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
        
        // Register hardware providers
        services.AddSingleton<IWmiProvider, WmiProvider>();
        services.AddSingleton<ISensorProvider, SensorProvider>();
        services.AddSingleton<ISmartctlProvider, SmartctlProvider>();
        
        return services.BuildServiceProvider();
    }
}