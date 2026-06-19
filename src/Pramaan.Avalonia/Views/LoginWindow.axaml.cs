using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Services;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Linq;
using System.Net.NetworkInformation;
using System.Threading.Tasks;

namespace Pramaan.Avalonia.Views;

public partial class LoginWindow : Window
{
    private readonly AuthService _authService;

    public bool IsLoggedIn => _authService.IsLoggedIn;
    public UserInfo? LoggedInUser => _authService.CurrentUser;
    public int? TechnicianId => _authService.GetTechnicianId();

    // Required by Avalonia XAML loader / designer — do NOT call from application code.
    public LoginWindow()
    {
        InitializeComponent();
        if (!Design.IsDesignMode)
            throw new InvalidOperationException("Use LoginWindow(AuthService authService) instead of the parameterless constructor.");
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
            // Gather machine fingerprint — MUST match what QCWorkflowService uses
            // so the server recognises the same machine at submission time.
            var (machineSerial, macAddress) = GetHardwareFingerprint();
            var computerName = Environment.MachineName;

            var result = await _authService.LoginWithLicenseAsync(
                licenseKey,
                machineSerial,
                macAddress:    macAddress,
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
            var (machineSerial, macAddress) = GetHardwareFingerprint();
            var computerName   = Environment.MachineName;

            var result = await trialService.StartOrRefreshTrialAsync(
                email,
                machineSerial,
                macAddress:   macAddress,
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

    /// <summary>
    /// Returns the hardware serial and MAC address using the same ISystemDiagnostic
    /// that QCWorkflowService uses, so activation and report submission identify
    /// the same machine to the server.
    /// Falls back to MachineName / network MAC if the diagnostic fails.
    /// </summary>
    private static (string serial, string macAddress) GetHardwareFingerprint()
    {
        string serial = string.Empty;
        string mac    = string.Empty;

        try
        {
            var diag = App.Current?.Services?.GetService<ISystemDiagnostic>();
            if (diag != null)
            {
                var info = diag.GetInfo();
                serial = info.SerialNumber ?? string.Empty;
                mac    = info.MacAddress   ?? string.Empty;
            }
        }
        catch { /* best-effort */ }

        // Fallback: use network MAC via NetworkInterface
        if (string.IsNullOrWhiteSpace(mac))
            mac = GetMacAddress() ?? "UNKNOWN";

        // Fallback: use hostname if no usable hardware serial
        if (string.IsNullOrWhiteSpace(serial) ||
            serial.Equals("UNKNOWN", StringComparison.OrdinalIgnoreCase))
        {
            serial = MachineIdentityService.BuildFallbackSerial(mac, Environment.MachineName);
        }

        return (serial, mac);
    }

    private static string? GetMacAddress()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up &&
                            n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .Select(n => n.GetPhysicalAddress()?.ToString())
                .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m));
        }
        catch
        {
            return null;
        }
    }

    private void ShowError(string message)
    {
        ErrorMessage.Text      = message;
        ErrorMessage.IsVisible = true;
    }
}
