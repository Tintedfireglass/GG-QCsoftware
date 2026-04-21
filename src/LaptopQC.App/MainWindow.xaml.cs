using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using LaptopQC.App.ViewModels;
using LaptopQC.App.Views;

using LaptopQC.App.Services;

namespace LaptopQC.App;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        RefreshActivationUi();
        App.AuthService.LoggedOut += () =>
        {
            Dispatcher.Invoke(RefreshActivationUi);
        };
        Loaded += async (_, _) =>
        {
            await UpdateService.CheckForUpdatesAsync(this);
            await ComplianceService.EnsureOnlineComplianceAsync(this);
            RefreshActivationUi();
        };
    }

    private async void UserStatus_Click(object sender, MouseButtonEventArgs e)
    {
        if (App.IsComplianceLocked)
        {
            await ComplianceService.EnsureOnlineComplianceAsync(this, force: true);
            RefreshActivationUi();
            return;
        }

        if (App.IsLoggedIn)
        {
            // If already activated but missing the Device ID (legacy session), fetch it now
            if (App.MachineId == null && !string.IsNullOrEmpty(App.AuthService.LicenseKey))
            {
                UserStatusText.Text = "Fetching ID...";
                UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6b7280"));
                
                try
                {
                    string machineSerial = DeviceIdentityService.GetMachineSerialNumber();
                    string? macAddress = DeviceIdentityService.GetMacAddress();
                    string computerName = DeviceIdentityService.GetComputerName();

                    await App.AuthService.LoginWithLicenseAsync(App.AuthService.LicenseKey, machineSerial, macAddress, computerName);
                }
                catch { /* Ignore fetch errors */ }
                
                RefreshActivationUi();
            }
            return;
        }
        else
        {
            // Show WiFi test popup first
            var wifiTest = new WifiTestWindow
            {
                Owner = this
            };
            var wifiResult = wifiTest.ShowDialog();

            // If internet not connected, don't proceed to activation
            if (wifiResult != true)
                return;

            // Then show activation dialog
            var loginWindow = new LoginWindow(App.AuthService)
            {
                Owner = this
            };

            var result = loginWindow.ShowDialog();
            RefreshActivationUi();
        }
    }

    public void RefreshActivationUi()
    {
        UpdateUserStatusDisplay();

        if (DataContext is MainViewModel vm)
        {
            vm.RefreshLoginState();
        }
    }

    private void UpdateUserStatusDisplay()
    {
        if (App.IsComplianceLocked)
        {
            UserStatusIcon.Text = "⚠";
            UserStatusText.Text = "Internet required";
            UserStatusText.FontWeight = FontWeights.SemiBold;
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#b45309"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#fef3c7"));
            UserStatusBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#fcd34d"));
            return;
        }

        if (App.IsLoggedIn && App.AuthService.IsTrialSession)
        {
            var days = App.TrialService.DaysRemaining;
            var dayLabel = days == 1 ? "day" : "days";
            UserStatusIcon.Text = "⏱";
            UserStatusText.Text = $"Trial – {days} {dayLabel} left";
            UserStatusText.FontWeight = FontWeights.SemiBold;
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#b45309"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#fef3c7"));
            UserStatusBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#fcd34d"));
            return;
        }

        if (App.IsLoggedIn)
        {
            UserStatusIcon.Text = "✓";
            UserStatusText.Text = $"Device ID: {App.MachineId}";
            UserStatusText.FontWeight = FontWeights.Bold;
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8B3D88"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f4e7f3"));
            UserStatusBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#d8b4d6"));
        }
        else
        {
            UserStatusIcon.Text = "🔑";
            UserStatusText.Text = "Click to Activate";
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6b7280"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f3f4f6"));
            UserStatusBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e5e7eb"));
        }
    }
}
