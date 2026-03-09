using System.Windows;
using System.Windows.Input;
using System.Management;
using LaptopQC.Core.Services;
using System.Net.NetworkInformation;

namespace LaptopQC.App.Views;

public partial class LoginWindow : Window
{
    private readonly AuthService _authService;
    
    public bool IsLoggedIn => _authService.IsLoggedIn;
    public UserInfo? LoggedInUser => _authService.CurrentUser;
    public int? TechnicianId => _authService.GetTechnicianId();
    public int? MachineId => _authService.MachineId;

    public LoginWindow(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
        LicenseBox.Focus();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        await DoLogin();
    }

    private async void LicenseBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await DoLogin();
        }
    }

    private async Task DoLogin()
    {
        var license = LicenseBox.Text.Trim();
        if (string.IsNullOrEmpty(license))
        {
            ShowError("Please enter your 16-digit license key");
            return;
        }

        // Show loading state
        LoginButton.IsEnabled = false;
        LoadingText.Visibility = Visibility.Visible;
        ErrorMessage.Visibility = Visibility.Collapsed;

        try
        {
            string machineSerial = GetMachineSerialNumber();
            if (string.IsNullOrEmpty(machineSerial))
            {
                ShowError("Error: Could not retrieve machine serial number. Required for node-locking.");
                return;
            }

            // Collect MAC address and computer name for server-side Machine ID allocation
            string? macAddress = null;
            try
            {
                macAddress = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                                n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                    .Select(n => n.GetPhysicalAddress()?.ToString())
                    .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));
            }
            catch { /* Ignore MAC retrieval failures */ }

            string computerName = Environment.MachineName;

            LoginResult result = await _authService.LoginWithLicenseAsync(license, machineSerial, macAddress, computerName);

            if (result.Success)
            {
                DialogResult = true;
                Close();
            }
            else
            {
                ShowError(result.Message);
            }
        }
        catch (Exception ex)
        {
            ShowError($"Login error: {ex.Message}");
        }
        finally
        {
            LoginButton.IsEnabled = true;
            LoadingText.Visibility = Visibility.Collapsed;
        }
    }

    private void ShowError(string message)
    {
        ErrorMessage.Text = message;
        ErrorMessage.Visibility = Visibility.Visible;
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
            var networkMac = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                            n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Select(n => n.GetPhysicalAddress()?.ToString())
                .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));

            var fallback = MachineIdentityService.BuildFallbackSerial(networkMac, Environment.MachineName);
            if (!string.IsNullOrWhiteSpace(fallback))
            {
                return fallback;
            }
        }
        catch { /* Ignore adapter access failures */ }

        return MachineIdentityService.BuildFallbackSerial(string.Empty, Environment.MachineName);
    }

    private void SkipButton_Click(object sender, RoutedEventArgs e)
    {
        // Close without logging in - app works offline
        DialogResult = false;
        Close();
    }
}
