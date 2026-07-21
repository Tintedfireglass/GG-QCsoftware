using System.Management;
using System.Windows;
using System.Windows.Media;

namespace LaptopQC.App.Views;

public partial class ChargerTestWindow : Window
{
    private bool _passed;
    private string _resultMessage = "Charger Test Not Run";

    private static Color GetBrandColor(string key, string fallbackHex)
    {
        if (Application.Current.Resources[key] is Color c) return c;
        if (Application.Current.Resources[key] is SolidColorBrush b) return b.Color;
        return (Color)ColorConverter.ConvertFromString(fallbackHex);
    }

    public ChargerTestWindow()
    {
        InitializeComponent();
    }

    private async void CheckButton_Click(object sender, RoutedEventArgs e)
    {
        CheckButton.IsEnabled = false;
        CheckButton.Content = "⏳ Checking...";

        bool batteryPresent = false;
        string batteryName = "";
        // BatteryStatus WMI codes:
        // 1 = Discharging, 2 = Charging, 3 = Fully Charged
        // 6 = Charging (High), 7 = Charging (Low), 8 = Charging (Critical)
        int batteryStatusCode = 0;

        await Task.Run(() =>
        {
            try
            {
                using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_Battery");
                foreach (ManagementObject obj in searcher.Get())
                {
                    batteryPresent = true;
                    batteryName = obj["Name"]?.ToString() ?? "Battery";
                    batteryStatusCode = Convert.ToInt32(obj["BatteryStatus"] ?? 0);
                    break;
                }
            }
            catch { /* WMI unavailable */ }
        });

        // Battery presence row
        BatteryPresenceIcon.Text = batteryPresent ? "✅" : "❌";
        BatteryPresenceText.Text = batteryPresent ? $"Detected: {batteryName}" : "No battery found (desktop system)";
        BatteryPresenceText.Foreground = new SolidColorBrush(
            batteryPresent
                ? GetBrandColor("SuccessYesColor", "#0B9444")
                : GetBrandColor("DangerNoColor", "#FF0000"));

        // Charging status row
        // Codes 2, 6, 7, 8 = actively charging; 3 = fully charged (pass with note)
        bool isCharging = batteryStatusCode is 2 or 6 or 7 or 8;
        bool isFullyCharged = batteryStatusCode == 3;
        bool chargingPass = isCharging || isFullyCharged;

        string chargingLabel = batteryStatusCode switch
        {
            1 => "Discharging — adapter may not be connected",
            2 => "Charging ✓",
            3 => "Fully Charged — adapter detected (no active charging needed)",
            6 => "Charging (High) ✓",
            7 => "Charging (Low) ✓",
            8 => "Charging (Critical) ✓",
            9 => "Undefined",
            _ => batteryPresent ? "Status unknown" : "N/A"
        };

        ChargingIcon.Text = chargingPass ? "✅" : "❌";
        ChargingStatusText.Text = chargingLabel;
        ChargingStatusText.Foreground = new SolidColorBrush(
            chargingPass
                ? GetBrandColor("SuccessYesColor", "#0B9444")
                : GetBrandColor("DangerNoColor", "#FF0000"));

        // Overall determination
        // If no battery: desktop — treat as pass (no charger needed)
        bool overallPass = !batteryPresent || chargingPass;
        string resultMsg;

        if (!batteryPresent)
            resultMsg = "No battery detected (desktop) — Charger test N/A";
        else if (isCharging)
            resultMsg = $"Charger Passed — Battery is charging ({batteryName})";
        else if (isFullyCharged)
            resultMsg = $"Charger Passed — Battery fully charged ({batteryName})";
        else
            resultMsg = $"Charger Failed — Battery is not charging. Check the adapter and port.";

        _passed = overallPass;
        _resultMessage = resultMsg;

        // Show result
        ResultsPanel.Visibility = Visibility.Visible;

        OverallResultBorder.Background = new SolidColorBrush(
            (Color)ColorConverter.ConvertFromString(overallPass ? "#dcfce7" : "#fef2f2"));
        OverallResultText.Text = overallPass
            ? "✓ Charging verified"
            : "✗ Charging not detected — plug in the adapter and retry";
        OverallResultText.Foreground = new SolidColorBrush(
            overallPass
                ? GetBrandColor("SuccessYesColor", "#0B9444")
                : GetBrandColor("DangerNoColor", "#FF0000"));

        ContinueButton.IsEnabled = true;
        CheckButton.Visibility = Visibility.Collapsed;
    }

    public (bool Passed, string Message) GetResult() => (_passed, _resultMessage);

    private void ContinueButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }
}
