using System.Windows;
using System.Windows.Input;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using LaptopQC.Core.Services;
using LaptopQC.App.Services;

namespace LaptopQC.App.Views;

public partial class LoginWindow : Window
{
    private readonly AuthService _authService;

    public bool IsLoggedIn   => _authService.IsLoggedIn;
    public UserInfo? LoggedInUser => _authService.CurrentUser;
    public int? TechnicianId => _authService.GetTechnicianId();
    public int? MachineId    => _authService.MachineId;

    public LoginWindow(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
        LicenseBox.Focus();

        // Hide "Start Free Trial" if we already had a trial (active or expired)
        if (App.TrialService.CurrentTrial != null)
        {
            OrDivider.Visibility = Visibility.Collapsed;
            StartTrialButton.Visibility = Visibility.Collapsed;
        }
    }

    // ─── License Activation ───────────────────────────────────────────────────

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
        => await DoLogin();

    private async void LicenseBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
            await DoLogin();
    }

    private async Task DoLogin()
    {
        var license = LicenseBox.Text.Trim();
        if (string.IsNullOrEmpty(license))
        {
            ShowError("Please enter your 16-digit license key");
            return;
        }

        SetLoading(true, "Activating...");

        try
        {
            string machineSerial = DeviceIdentityService.GetMachineSerialNumber();
            if (string.IsNullOrEmpty(machineSerial))
            {
                ShowError("Error: Could not retrieve machine serial number. Required for node-locking.");
                return;
            }

            string? macAddress  = DeviceIdentityService.GetMacAddress();
            string computerName = DeviceIdentityService.GetComputerName();

            LoginResult result = await _authService.LoginWithLicenseAsync(
                license, machineSerial, macAddress, computerName);

            if (result.Success)
            {
                // If the user had a trial, clear it when they activate a proper license
                App.TrialService.ClearTrial();
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
            SetLoading(false);
        }
    }

    // ─── Trial Mode Toggle ────────────────────────────────────────────────────

    private void StartTrialButton_Click(object sender, RoutedEventArgs e)
    {
        LicenseLoginPanel.Visibility  = Visibility.Collapsed;
        TrialEmailPanel.Visibility    = Visibility.Visible;
        LoginButton.Visibility        = Visibility.Collapsed;
        TrialConfirmButton.Visibility = Visibility.Visible;
        OrDivider.Visibility          = Visibility.Collapsed;
        StartTrialButton.Visibility   = Visibility.Collapsed;
        ErrorMessage.Visibility       = Visibility.Collapsed;
        EmailBox.Focus();
    }

    private void BackToLicense_Click(object sender, RoutedEventArgs e)
    {
        LicenseLoginPanel.Visibility  = Visibility.Visible;
        TrialEmailPanel.Visibility    = Visibility.Collapsed;
        LoginButton.Visibility        = Visibility.Visible;
        TrialConfirmButton.Visibility = Visibility.Collapsed;
        OrDivider.Visibility          = Visibility.Visible;
        StartTrialButton.Visibility   = Visibility.Visible;
        ErrorMessage.Visibility       = Visibility.Collapsed;
        LicenseBox.Focus();
    }

    // ─── Trial Activation ─────────────────────────────────────────────────────

    private async void TrialConfirmButton_Click(object sender, RoutedEventArgs e)
        => await DoTrialLogin();

    private async void EmailBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
            await DoTrialLogin();
    }

    private async Task DoTrialLogin()
    {
        var email = EmailBox.Text.Trim();
        if (string.IsNullOrEmpty(email))
        {
            ShowError("Please enter your email address");
            return;
        }

        SetLoading(true, "Starting your free trial...");

        try
        {
            string machineSerial = DeviceIdentityService.GetMachineSerialNumber();
            string? macAddress   = DeviceIdentityService.GetMacAddress();
            string computerName  = DeviceIdentityService.GetComputerName();

            TrialResult result = await App.TrialService.StartOrRefreshTrialAsync(
                email, machineSerial, macAddress, computerName);

            if (result.Success && result.Token != null)
            {
                _authService.StartTrialSession(
                    email, result.Token, result.MachineId, result.TrialEndsAt);
                DialogResult = true;
                Close();
            }
            else
            {
                ShowError(result.ErrorMessage ?? "Trial activation failed. Please try again.");
            }
        }
        catch (Exception ex)
        {
            ShowError($"Trial error: {ex.Message}");
        }
        finally
        {
            SetLoading(false);
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private void ShowError(string message)
    {
        ErrorMessage.Text       = message;
        ErrorMessage.Visibility = Visibility.Visible;
    }

    private void SetLoading(bool loading, string? text = null)
    {
        LoginButton.IsEnabled        = !loading;
        TrialConfirmButton.IsEnabled = !loading;
        LoadingText.Text             = text ?? "Loading...";
        LoadingText.Visibility       = loading ? Visibility.Visible : Visibility.Collapsed;
        if (loading)
            ErrorMessage.Visibility  = Visibility.Collapsed;
    }

    private void SkipButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
