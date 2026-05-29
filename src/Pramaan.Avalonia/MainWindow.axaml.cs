using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Threading;

namespace Pramaan.Avalonia;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        UpdateUserStatusDisplay();
    }

    private async void UserStatus_Click(object? sender, PointerPressedEventArgs e)
    {
        if (App.IsLoggedIn)
        {
            // Show confirmation dialog before logout
            bool confirmed = false;
            var confirmWindow = new Window
            {
                Title = "Confirm Logout",
                Width = 380,
                Height = 170,
                WindowStartupLocation = WindowStartupLocation.CenterOwner,
                CanResize = false,
                Content = new StackPanel
                {
                    Margin = new global::Avalonia.Thickness(24),
                    VerticalAlignment = global::Avalonia.Layout.VerticalAlignment.Center,
                    Children =
                    {
                        new TextBlock
                        {
                            Text = $"Logged in as {App.UserDisplayName}.\nDo you want to log out?",
                            TextWrapping = global::Avalonia.Media.TextWrapping.Wrap,
                            FontSize = 14,
                            Margin = new global::Avalonia.Thickness(0, 0, 0, 16)
                        },
                        new StackPanel
                        {
                            Orientation = global::Avalonia.Layout.Orientation.Horizontal,
                            HorizontalAlignment = global::Avalonia.Layout.HorizontalAlignment.Center,
                            Spacing = 12,
                            Children =
                            {
                                new Button { Content = "Yes", Width = 80, HorizontalContentAlignment = global::Avalonia.Layout.HorizontalAlignment.Center },
                                new Button { Content = "No", Width = 80, HorizontalContentAlignment = global::Avalonia.Layout.HorizontalAlignment.Center }
                            }
                        }
                    }
                }
            };
            var panel = (StackPanel)confirmWindow.Content;
            var btnPanel = (StackPanel)panel.Children[1];
            var yesBtn = (Button)btnPanel.Children[0];
            var noBtn = (Button)btnPanel.Children[1];
            yesBtn.Click += (s2, e2) => { confirmed = true; confirmWindow.Close(); };
            noBtn.Click += (s2, e2) => { confirmWindow.Close(); };
            
            await confirmWindow.ShowDialog(this);
            
            if (confirmed)
            {
                App.AuthService.Logout();
                UpdateUserStatusDisplay();
            }
        }
        else
        {
            var loginWindow = new Views.LoginWindow(App.AuthService);
            _ = loginWindow.ShowDialog(this).ContinueWith(_ => 
            {
                Dispatcher.UIThread.Post(UpdateUserStatusDisplay);
            });
        }
    }

    private void UpdateUserStatusDisplay()
    {
        if (App.IsLoggedIn)
        {
            UserStatusIcon.Text = "✓";
            UserStatusText.Text = App.UserDisplayName;
            UserStatusText.Foreground = SolidColorBrush.Parse("#00d9ff");
            UserStatusBorder.Background = SolidColorBrush.Parse("#1e3a5f");
        }
        else
        {
            UserStatusIcon.Text = "👤";
            UserStatusText.Text = "Click to Login";
            UserStatusText.Foreground = Brushes.Gray;
            UserStatusBorder.Background = SolidColorBrush.Parse("#f3f4f6");
        }
    }
}