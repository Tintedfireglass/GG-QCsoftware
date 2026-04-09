using System.Windows;
using System.Windows.Input;
using LaptopQC.Core.Services;
using LaptopQC.App.Services;

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
            string machineSerial = DeviceIdentityService.GetMachineSerialNumber();
            if (string.IsNullOrEmpty(machineSerial))
            {
                ShowError("Error: Could not retrieve machine serial number. Required for node-locking.");
                return;
            }

            // Collect MAC address and computer name for server-side Machine ID allocation
            string? macAddress = DeviceIdentityService.GetMacAddress();
            string computerName = DeviceIdentityService.GetComputerName();

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

    private void SkipButton_Click(object sender, RoutedEventArgs e)
    {
        // Close without logging in - app works offline
        DialogResult = false;
        Close();
    }
}
