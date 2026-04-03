using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using LaptopQC.App.ViewModels;
using LaptopQC.App.Views;

using System.Management;
using System.Net.NetworkInformation;
using LaptopQC.Core.Services;
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
        Loaded += async (_, _) => await UpdateService.CheckForUpdatesAsync(this);
    }

    private async void UserStatus_Click(object sender, MouseButtonEventArgs e)
    {
        if (App.IsLoggedIn)
        {
            // If already activated but missing the Device ID (legacy session), fetch it now
            if (App.MachineId == null && !string.IsNullOrEmpty(App.AuthService.LicenseKey))
            {
                UserStatusText.Text = "Fetching ID...";
                UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6b7280"));
                
                try
                {
                    string machineSerial = GetMachineSerialNumber();
                    string? macAddress = GetMacAddress();
                    string computerName = Environment.MachineName;

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

    private string GetMachineSerialNumber()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT SerialNumber FROM Win32_BIOS");
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                var serial = obj["SerialNumber"]?.ToString()?.Trim();
                if (MachineIdentityService.IsUsableHardwareSerial(serial))
                {
                    return serial!;
                }
            }
        }
        catch { /* Ignore WMI errors */ }

        try
        {
            var networkMac = GetMacAddress();
            var fallback = MachineIdentityService.BuildFallbackSerial(networkMac, Environment.MachineName);
            if (!string.IsNullOrWhiteSpace(fallback))
            {
                return fallback;
            }
        }
        catch { /* Ignore adapter access failures */ }

        return MachineIdentityService.BuildFallbackSerial(string.Empty, Environment.MachineName);
    }

    private string? GetMacAddress()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                            n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Select(n => n.GetPhysicalAddress()?.ToString())
                .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));
        }
        catch { return null; }
    }
}
