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
        UsernameBox.Focus();
    }

    private async void LoginButton_Click(object? sender, RoutedEventArgs e)
    {
        await DoLogin();
    }

    private async void PasswordBox_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            await DoLogin();
        }
    }

    private async Task DoLogin()
    {
        var username = UsernameBox.Text?.Trim() ?? string.Empty;
        var password = PasswordBox.Text ?? string.Empty;

        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
        {
            ShowError("Please enter username and password");
            return;
        }

        // Show loading state
        LoginButton.IsEnabled = false;
        LoadingText.IsVisible = true;
        ErrorMessage.IsVisible = false;

        try
        {
            var result = await _authService.LoginAsync(username, password);

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
            ShowError($"Login error: {ex.Message}");
        }
        finally
        {
            LoginButton.IsEnabled = true;
            LoadingText.IsVisible = false;
        }
    }

    private void ShowError(string message)
    {
        ErrorMessage.Text = message;
        ErrorMessage.IsVisible = true;
    }

    private void SkipButton_Click(object? sender, RoutedEventArgs e)
    {
        // Close without logging in - app works offline
        Close(false);
    }
}
