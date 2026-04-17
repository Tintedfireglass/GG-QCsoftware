using System.Net.Http;
using System.Net.NetworkInformation;
using System.Windows;
using System.Windows.Media;

namespace LaptopQC.App.Views;

public partial class WifiTestWindow : Window
{
    private bool _internetReachable;

    public WifiTestWindow()
    {
        InitializeComponent();
        Loaded += async (s, e) => await RunNetworkTestAsync();
    }

    private async Task RunNetworkTestAsync()
    {
        bool wifiConnected = false;
        bool ethernetConnected = false;
        bool internetReachable = false;
        string wifiName = "";
        string ethName = "";

        LoadingText.Text = "Scanning network adapters...";

        try
        {
            await Task.Run(() =>
            {
                var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(n => n.OperationalStatus == OperationalStatus.Up
                             && n.NetworkInterfaceType != NetworkInterfaceType.Loopback);

                foreach (var ni in interfaces)
                {
                    var desc = (ni.Description ?? "").ToLowerInvariant();
                    var adapterName = (ni.Name ?? "").ToLowerInvariant();

                    bool isVirtual = desc.Contains("virtual") ||
                                     desc.Contains("hyper-v") ||
                                     desc.Contains("vmware") ||
                                     desc.Contains("virtualbox") ||
                                     desc.Contains("docker") ||
                                     desc.Contains("vpn") ||
                                     desc.Contains("tap-") ||
                                     desc.Contains("tunnel") ||
                                     adapterName.Contains("vethernet") ||
                                     adapterName.Contains("wsl") ||
                                     adapterName.Contains("docker") ||
                                     adapterName.Contains("vmware");

                    if (isVirtual) continue;

                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        wifiConnected = true;
                        wifiName = ni.Name;
                    }
                    else if (ni.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                             ni.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet)
                    {
                        ethernetConnected = true;
                        ethName = ni.Name;
                    }
                }
            });

            // Update WiFi/Ethernet status
            WifiStatusText.Text = wifiConnected ? $"Connected ({wifiName})" : "Not connected";
            WifiStatusText.Foreground = new SolidColorBrush(wifiConnected
                ? (Color)ColorConverter.ConvertFromString("#15803d")
                : (Color)ColorConverter.ConvertFromString("#dc2626"));

            EthernetStatusText.Text = ethernetConnected ? $"Connected ({ethName})" : "Not connected";
            EthernetStatusText.Foreground = new SolidColorBrush(ethernetConnected
                ? (Color)ColorConverter.ConvertFromString("#15803d")
                : (Color)ColorConverter.ConvertFromString("#dc2626"));

            // Test internet
            if (wifiConnected || ethernetConnected)
            {
                LoadingText.Text = "Testing internet connectivity...";
                try
                {
                    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                    var response = await http.GetAsync("http://www.msftconnecttest.com/connecttest.txt");
                    internetReachable = response.IsSuccessStatusCode;
                }
                catch
                {
                    internetReachable = false;
                }
            }

            InternetStatusText.Text = internetReachable ? "Reachable" : "Not reachable";
            InternetStatusText.Foreground = new SolidColorBrush(internetReachable
                ? (Color)ColorConverter.ConvertFromString("#15803d")
                : (Color)ColorConverter.ConvertFromString("#dc2626"));
        }
        catch (Exception ex)
        {
            InternetStatusText.Text = $"Error: {ex.Message}";
        }

        // Show results, hide loading
        LoadingPanel.Visibility = Visibility.Collapsed;
        ResultsPanel.Visibility = Visibility.Visible;

        _internetReachable = (wifiConnected || ethernetConnected) && internetReachable;

        OverallResultBorder.Background = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(_internetReachable ? "#dcfce7" : "#fef2f2"));
        OverallResultText.Text = _internetReachable
            ? "✓ Network connectivity verified"
            : "✗ Internet not connected — connect to WiFi or Ethernet and retry";
        OverallResultText.Foreground = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(_internetReachable ? "#15803d" : "#dc2626"));

        ContinueButton.IsEnabled = true;
        ContinueButton.Content = _internetReachable ? "Continue" : "Retry";
    }

    private async void ContinueButton_Click(object sender, RoutedEventArgs e)
    {
        if (_internetReachable)
        {
            DialogResult = true;
            Close();
        }
        else
        {
            // Re-run the test
            LoadingPanel.Visibility = Visibility.Visible;
            ResultsPanel.Visibility = Visibility.Collapsed;
            ContinueButton.IsEnabled = false;
            ContinueButton.Content = "Continue";
            await RunNetworkTestAsync();
        }
    }
}
