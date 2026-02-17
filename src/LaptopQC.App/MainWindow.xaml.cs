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
                $"Logged in as: {App.UserDisplayName}\n({App.AuthService.CurrentUser?.RoleDisplay})\n\nDo you want to logout?",
                "User Session",
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
            // Show login dialog
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
            UserStatusText.Text = App.UserDisplayName;
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#00d9ff"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1e3a5f"));
        }
        else
        {
            UserStatusIcon.Text = "👤";
            UserStatusText.Text = "Click to Login";
            UserStatusText.Foreground = Brushes.White;
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#22c55e"));
        }
    }
}