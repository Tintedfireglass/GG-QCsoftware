using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using LaptopQC.App.ViewModels;
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
        RefreshActivationUi();
    }

    private void UserStatus_Click(object sender, MouseButtonEventArgs e)
    {
        if (App.IsLoggedIn)
        {
            // Already activated - do nothing. App stays activated.
            return;
        }
        else
        {
            // Show WiFi test popup first
            var wifiTest = new WifiTestWindow
            {
                Owner = this
            };
            var wifiResult = wifiTest.ShowDialog();

            // If internet not connected, don't proceed to activation
            if (wifiResult != true)
                return;

            // Then show activation dialog
            var loginWindow = new LoginWindow(App.AuthService)
            {
                Owner = this
            };

            var result = loginWindow.ShowDialog();
            RefreshActivationUi();
        }
    }

    public void RefreshActivationUi()
    {
        UpdateUserStatusDisplay();

        if (DataContext is MainViewModel vm)
        {
            vm.RefreshLoginState();
        }
    }

    private void UpdateUserStatusDisplay()
    {
        if (App.IsLoggedIn)
        {
            UserStatusIcon.Text = "✓";
            UserStatusText.Text = "Activated";
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#15803d"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#dcfce7"));
            UserStatusBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#bbf7d0"));
        }
        else
        {
            UserStatusIcon.Text = "🔑";
            UserStatusText.Text = "Click to Activate";
            UserStatusText.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#6b7280"));
            UserStatusBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#f3f4f6"));
            UserStatusBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#e5e7eb"));
        }
    }
}
