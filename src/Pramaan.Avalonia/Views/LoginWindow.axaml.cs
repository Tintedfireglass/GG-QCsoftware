using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using LaptopQC.Core.Services;
using System;
using System.Threading.Tasks;

namespace Pramaan.Avalonia.Views;

public partial class LoginWindow : Window
{
    private readonly AuthService _authService;

    public bool IsLoggedIn => _authService.IsLoggedIn;
    public UserInfo? LoggedInUser => _authService.CurrentUser;
    public int? TechnicianId => _authService.GetTechnicianId();

    // Required by Avalonia runtime loader
    public LoginWindow()
    {
        InitializeComponent();
        _authService = null!;
    }

    public LoginWindow(AuthService authService)
    {
        InitializeComponent();
        _authService = authService;
        LicenseBox.Focus();
    }

    // ─── License activation flow ────────────────────────────────────────────────

    private async void LoginButton_Click(object? sender, RoutedEventArgs e)
    {
        await DoLicenseActivate();
    }

    private async void LicenseBox_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await DoLicenseActivate();
        }
    }

    private async Task DoLicenseActivate()
    {
        var licenseKey = LicenseBox.Text?.Trim() ?? string.Empty;

        if (string.IsNullOrEmpty(licenseKey))
        {
            ShowError("Please enter your 16-digit license key.");
            return;
        }

        // Show loading state
        LoginButton.IsEnabled = false;
        LoadingText.IsVisible = true;
        ErrorMessage.IsVisible = false;

        try
        {
            // Gather basic machine fingerprint (best-effort)
            var machineSerial = Environment.MachineName;
            var computerName  = Environment.MachineName;

            var result = await _authService.LoginWithLicenseAsync(
                licenseKey,
                machineSerial,
                macAddress:    null,
                computerName:  computerName);

            if (result.Success)
            {
                Close(true);
            }
            else
            {
                ShowError(result.Message);
            }
        }
        catch (Exception ex)
        {
            ShowError($"Activation error: {ex.Message}");
        }
        finally
        {
            LoginButton.IsEnabled = true;
            LoadingText.IsVisible = false;
        }
    }

    // ─── Trial flow ─────────────────────────────────────────────────────────────

    private void StartTrialButton_Click(object? sender, RoutedEventArgs e)
    {
        // Switch to trial email panel
        LicenseLoginPanel.IsVisible = false;
        TrialEmailPanel.IsVisible   = true;

        // Swap action buttons
        LoginButton.IsVisible        = false;
        TrialConfirmButton.IsVisible = true;

        // Hide the OR divider and the outlined trial button while in trial mode
        OrDivider.IsVisible        = false;
        StartTrialButton.IsVisible = false;

        ErrorMessage.IsVisible = false;
        EmailBox.Focus();
    }

    private void BackToLicense_Click(object? sender, RoutedEventArgs e)
    {
        // Switch back to license panel
        TrialEmailPanel.IsVisible   = false;
        LicenseLoginPanel.IsVisible = true;

        // Swap action buttons back
        TrialConfirmButton.IsVisible = false;
        LoginButton.IsVisible        = true;

        // Restore the OR divider and trial button
        OrDivider.IsVisible        = true;
        StartTrialButton.IsVisible = true;

        ErrorMessage.IsVisible = false;
        LicenseBox.Focus();
    }

    private async void TrialConfirmButton_Click(object? sender, RoutedEventArgs e)
    {
        await DoTrialActivate();
    }

    private async void EmailBox_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await DoTrialActivate();
        }
    }

    private async Task DoTrialActivate()
    {
        var email = EmailBox.Text?.Trim() ?? string.Empty;

        if (string.IsNullOrEmpty(email))
        {
            ShowError("Please enter your email address.");
            return;
        }

        TrialConfirmButton.IsEnabled = false;
        LoadingText.IsVisible        = true;
        ErrorMessage.IsVisible       = false;

        try
        {
            var trialService   = new TrialService();
            var machineSerial  = Environment.MachineName;
            var computerName   = Environment.MachineName;

            var result = await trialService.StartOrRefreshTrialAsync(
                email,
                machineSerial,
                macAddress:   null,
                computerName: computerName);

            if (result.Success && result.Token != null)
            {
                _authService.StartTrialSession(
                    email,
                    result.Token,
                    result.MachineId,
                    result.TrialEndsAt.ToUniversalTime());

                Close(true);
            }
            else
            {
                ShowError(result.ErrorMessage ?? "Trial activation failed.");
            }
        }
        catch (Exception ex)
        {
            ShowError($"Trial activation error: {ex.Message}");
        }
        finally
        {
            TrialConfirmButton.IsEnabled = true;
            LoadingText.IsVisible        = false;
        }
    }

    // ─── Skip / offline ─────────────────────────────────────────────────────────

    private void SkipButton_Click(object? sender, RoutedEventArgs e)
    {
        // Close without activating — app works offline
        Close(false);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private void ShowError(string message)
    {
        ErrorMessage.Text      = message;
        ErrorMessage.IsVisible = true;
    }
}
