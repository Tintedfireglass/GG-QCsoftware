using System.Net.Http;
using System.Net.NetworkInformation;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Media;

namespace Pramaan.Avalonia.Views;

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

                    // Skip purely software/tunnel adapters
                    bool isSoftwareOnly = desc.Contains("wsl") ||
                                         desc.Contains("docker") ||
                                         desc.Contains("vmware") ||
                                         desc.Contains("virtualbox") ||
                                         desc.Contains("tap-windows") ||
                                         desc.Contains("6to4") ||
                                         desc.Contains("teredo") ||
                                         desc.Contains("isatap") ||
                                         adapterName.Contains("wsl") ||
                                         adapterName.Contains("docker") ||
                                         adapterName.Contains("vmware") ||
                                         ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel;

                    if (isSoftwareOnly) continue;

                    // Use gateway as ground truth for "actually connected"
                    bool hasGateway = ni.GetIPProperties()
                                       .GatewayAddresses
                                       .Any(g => g.Address.ToString() != "0.0.0.0");

                    if (!hasGateway) continue;

                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        wifiConnected = true;
                        if (string.IsNullOrEmpty(wifiName)) wifiName = ni.Name ?? "Unknown";
                    }
                    else
                    {
                        ethernetConnected = true;
                        if (string.IsNullOrEmpty(ethName)) ethName = ni.Name ?? "Unknown";
                    }
                }
            });

            // Update WiFi/Ethernet status
            WifiStatusText.Text = wifiConnected ? $"Connected ({wifiName})" : "Not connected";
            WifiIcon.Text = wifiConnected ? "✅" : "❌";
            WifiStatusText.Foreground = new SolidColorBrush(wifiConnected
                ? Color.FromRgb(11, 148, 68)
                : Color.FromRgb(220, 38, 38));

            EthernetStatusText.Text = ethernetConnected ? $"Connected ({ethName})" : "Not connected";
            EthernetIcon.Text = ethernetConnected ? "✅" : "❌";
            EthernetStatusText.Foreground = new SolidColorBrush(ethernetConnected
                ? Color.FromRgb(11, 148, 68)
                : Color.FromRgb(220, 38, 38));

            // Test internet connectivity
            LoadingText.Text = "Testing internet connectivity...";
            internetReachable = await TestInternetAsync();

            // If internet is reachable but no typed adapter was found, backfill ethernet
            if (internetReachable && !wifiConnected && !ethernetConnected)
            {
                ethernetConnected = true;
                ethName = "Network Adapter";
                EthernetStatusText.Text = $"Connected ({ethName})";
                EthernetIcon.Text = "✅";
                EthernetStatusText.Foreground = new SolidColorBrush(Color.FromRgb(11, 148, 68));
            }

            InternetStatusText.Text = internetReachable ? "Reachable" : "Not reachable";
            InternetIcon.Text = internetReachable ? "✅" : "❌";
            InternetStatusText.Foreground = new SolidColorBrush(internetReachable
                ? Color.FromRgb(11, 148, 68)
                : Color.FromRgb(220, 38, 38));
        }
        catch (Exception ex)
        {
            InternetStatusText.Text = $"Error: {ex.Message}";
        }

        // Show results, hide loading
        LoadingPanel.IsVisible = false;
        ResultsPanel.IsVisible = true;

        _internetReachable = (wifiConnected || ethernetConnected) && internetReachable;

        OverallResultBorder.Background = new SolidColorBrush(_internetReachable
            ? Color.FromArgb(255, 220, 252, 231)
            : Color.FromArgb(255, 254, 242, 242));
        OverallResultText.Text = _internetReachable
            ? "✓ Network connectivity verified"
            : "✗ Internet not connected — connect to WiFi or Ethernet and retry";
        OverallResultText.Foreground = new SolidColorBrush(_internetReachable
            ? Color.FromRgb(21, 128, 61)
            : Color.FromRgb(185, 28, 28));

        ContinueButton.IsEnabled = true;
        ContinueButton.Content = _internetReachable ? "Continue" : "Retry";
    }

    /// <summary>
    /// Tests internet reachability using multiple methods.
    /// Tries HTTP first; falls back to ICMP ping.
    /// </summary>
    private static async Task<bool> TestInternetAsync()
    {
        // Attempt 1: HTTP via connectivity test endpoint
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            var response = await http.GetAsync("http://www.msftconnecttest.com/connecttest.txt");
            if (response.IsSuccessStatusCode) return true;
        }
        catch { /* fall through to ping */ }

        // Attempt 2: ICMP ping to Google DNS
        try
        {
            using var ping = new Ping();
            var result = await ping.SendPingAsync("8.8.8.8", 5000);
            if (result.Status == IPStatus.Success) return true;
        }
        catch { /* fall through */ }

        // Attempt 3: ICMP ping to Cloudflare DNS as final fallback
        try
        {
            using var ping = new Ping();
            var result = await ping.SendPingAsync("1.1.1.1", 5000);
            return result.Status == IPStatus.Success;
        }
        catch { return false; }
    }

    private async void ContinueButton_Click(object? sender, RoutedEventArgs e)
    {
        if (_internetReachable)
        {
            Close(true);
        }
        else
        {
            // Re-run the test
            LoadingPanel.IsVisible = true;
            ResultsPanel.IsVisible = false;
            ContinueButton.IsEnabled = false;
            ContinueButton.Content = "Continue";
            await RunNetworkTestAsync();
        }
    }

    /// <summary>
    /// Returns true if the network test passed (internet reachable).
    /// Call after the window is closed.
    /// </summary>
    public bool NetworkPassed => _internetReachable;
}
