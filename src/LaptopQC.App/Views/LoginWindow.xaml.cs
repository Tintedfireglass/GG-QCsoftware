using System.Windows;
using System.Windows.Input;
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

    private async Task DoLogin()
    {
        var username = UsernameBox.Text.Trim();
        var password = PasswordBox.Password;

        if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
        {
            ShowError("Please enter username and password");
            return;
        }

        // Show loading state
        LoginButton.IsEnabled = false;
        LoadingText.Visibility = Visibility.Visible;
        ErrorMessage.Visibility = Visibility.Collapsed;

        try
        {
            var result = await _authService.LoginAsync(username, password);

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
