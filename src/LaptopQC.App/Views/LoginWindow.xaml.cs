using System.Windows;
using System.Windows.Input;
using System.Management;
using LaptopQC.Core.Services;

namespace LaptopQC.App.Views;

public partial class LoginWindow : Window
{
    private readonly AuthService _authService;
    
    public bool IsLoggedIn => _authService.IsLoggedIn;
    public UserInfo? LoggedInUser => _authService.CurrentUser;
    public int? TechnicianId => _authService.GetTechnicianId();

    public LoginWindow(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
        UsernameBox.Focus();
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        await DoLogin();
    }

    private async void PasswordBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await DoLogin();
        }
    }

    private async void LicenseBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await DoLogin();
        }
    }

    private void LoginType_Changed(object sender, RoutedEventArgs e)
    {
        if (UserLoginPanel == null || LicenseLoginPanel == null) return;

        if (RadioLoginUser.IsChecked == true)
        {
            UserLoginPanel.Visibility = Visibility.Visible;
            LicenseLoginPanel.Visibility = Visibility.Collapsed;
            UsernameBox.Focus();
        }
        else
        {
            UserLoginPanel.Visibility = Visibility.Collapsed;
            LicenseLoginPanel.Visibility = Visibility.Visible;
            LicenseBox.Focus();
        }
    }

    private async Task DoLogin()
    {
        // Check which login type is selected
        bool isLicenseLogin = RadioLoginLicense.IsChecked == true;

        if (!isLicenseLogin)
        {
            var username = UsernameBox.Text.Trim();
            var password = PasswordBox.Password;

            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
            {
                ShowError("Please enter username and password");
                return;
            }
        }
        else
        {
            var license = LicenseBox.Text.Trim();
            if (string.IsNullOrEmpty(license))
            {
                ShowError("Please enter your 16-digit license key");
                return;
            }
        }

        // Show loading state
        LoginButton.IsEnabled = false;
        LoadingText.Visibility = Visibility.Visible;
        ErrorMessage.Visibility = Visibility.Collapsed;

        try
        {
            LoginResult result;
            if (!isLicenseLogin)
            {
                result = await _authService.LoginAsync(UsernameBox.Text.Trim(), PasswordBox.Password);
            }
            else
            {
                string machineSerial = GetMachineSerialNumber();
                if (string.IsNullOrEmpty(machineSerial))
                {
                    ShowError("Error: Could not retrieve machine serial number. Required for node-locking.");
                    return;
                }
                result = await _authService.LoginWithLicenseAsync(LicenseBox.Text.Trim(), machineSerial);
            }

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
                if (!string.IsNullOrEmpty(serial) && serial != "Default string")
                {
                    return serial;
                }
            }
        }
        catch { /* Ignore WMI errors */ }
        
        return "UNKNOWN_SERIAL_" + Environment.MachineName;
    }

    private void SkipButton_Click(object sender, RoutedEventArgs e)
    {
        // Close without logging in - app works offline
        DialogResult = false;
        Close();
    }
}
