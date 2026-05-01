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

                    // Skip purely software/tunnel adapters that can never carry real traffic.
                    // NOTE: We intentionally do NOT filter "virtual" or "hyper-v" here because
                    // on Windows Server with Hyper-V, the vEthernet (External) adapter IS the
                    // real connected interface — blocking it causes false "Not connected" results.
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

                    // Use presence of a valid default gateway as ground truth for "actually connected".
                    // This works for standard NICs AND Hyper-V vEthernet adapters on Windows Server.
                    bool hasGateway = ni.GetIPProperties()
                                       .GatewayAddresses
                                       .Any(g => g.Address.ToString() != "0.0.0.0");

                    if (!hasGateway) continue;

                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        wifiConnected = true;
                        if (string.IsNullOrEmpty(wifiName)) wifiName = ni.Name;
                    }
                    else
                    {
                        // Treat everything else with a gateway as Ethernet —
                        // covers Ethernet, GigabitEthernet, FastEthernetT/FX, Unknown,
                        // and Hyper-V vEthernet adapters on Windows Server.
                        ethernetConnected = true;
                        if (string.IsNullOrEmpty(ethName)) ethName = ni.Name;
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

            // Test internet — always attempt, even if adapter-type detection was inconclusive.
            // Try HTTP first, then ICMP ping as fallback because Windows Server firewall /
            // IE Enhanced Security Configuration can block outbound HTTP to unknown hosts.
            LoadingText.Text = "Testing internet connectivity...";
            internetReachable = await TestInternetAsync();

            // If internet is reachable but no typed adapter was found (exotic NIC),
            // backfill ethernet so the UI doesn't show contradictory states.
            if (internetReachable && !wifiConnected && !ethernetConnected)
            {
                ethernetConnected = true;
                ethName = "Network Adapter";
                EthernetStatusText.Text = $"Connected ({ethName})";
                EthernetStatusText.Foreground = new SolidColorBrush(
                    (Color)ColorConverter.ConvertFromString("#15803d"));
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

    /// <summary>
    /// Tests internet reachability using multiple methods.
    /// Tries HTTP first; falls back to ICMP ping because Windows Server
    /// firewall / IE Enhanced Security can block outbound HTTP.
    /// </summary>
    private static async Task<bool> TestInternetAsync()
    {
        // Attempt 1: HTTP via Microsoft's connectivity test endpoint
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            var response = await http.GetAsync("http://www.msftconnecttest.com/connecttest.txt");
            if (response.IsSuccessStatusCode) return true;
        }
        catch { /* fall through to ping */ }

        // Attempt 2: ICMP ping to Google DNS — works even when HTTP is blocked by Server firewall
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
