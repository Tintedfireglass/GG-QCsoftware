using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using LaptopQC.App.Views;

namespace LaptopQC.App;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        UpdateUserStatusDisplay();
    }

    private void UserStatus_Click(object sender, MouseButtonEventArgs e)
    {
        if (App.IsLoggedIn)
        {
            // Already logged in - offer to logout
            var result = MessageBox.Show(
                $"Activated by: {App.UserDisplayName}\n({App.AuthService.CurrentUser?.RoleDisplay})\n\nDo you want to deactivate?",
                "License Session",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            
            if (result == MessageBoxResult.Yes)
            {
                App.AuthService.Logout();
                UpdateUserStatusDisplay();
            }
        }
        else
        {
            // Show activation dialog
            var loginWindow = new LoginWindow(App.AuthService)
            {
                Owner = this
            };
            
            var result = loginWindow.ShowDialog();
            UpdateUserStatusDisplay();
        }
    }

    private void UpdateUserStatusDisplay()
    {
        if (App.IsLoggedIn)
        {
            UserStatusIcon.Text = "✓";
            UserStatusText.Text = "Activated";
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#00d9ff"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e3a5f"));
        }
        else
        {
            UserStatusIcon.Text = "🔑";
            UserStatusText.Text = "Click to Activate";
            UserStatusText.Foreground = Brushes.White;
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#22c55e"));
        }
    }
}