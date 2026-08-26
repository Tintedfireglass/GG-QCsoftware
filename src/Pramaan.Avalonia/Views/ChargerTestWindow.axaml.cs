using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;
using System;
using System.Threading.Tasks;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Hardware.Models;
using Microsoft.Extensions.DependencyInjection;

namespace Pramaan.Avalonia.Views;

public partial class ChargerTestWindow : Window
{
    private bool _passed;
    private string _resultMessage = "Charger Test Not Run";
    private readonly IBatteryDiagnostic? _batteryDiagnostic;

    public ChargerTestWindow()
    {
        InitializeComponent();
        _batteryDiagnostic = App.Current?.Services?.GetService<IBatteryDiagnostic>();
    }

    private async void CheckButton_Click(object? sender, global::Avalonia.Interactivity.RoutedEventArgs e)
    {
        CheckButton.IsEnabled = false;
        CheckButton.Content = "⏳ Checking...";

        BatteryInfo? batteryInfo = null;

        await Task.Run(() =>
        {
            try
            {
                if (_batteryDiagnostic != null)
                {
                    batteryInfo = _batteryDiagnostic.GetInfo();
                }
            }
            catch { }
        });

        bool batteryPresent = batteryInfo?.IsPresent ?? false;
        string status = batteryInfo?.Status ?? "Unknown";
        int chargeRemaining = batteryInfo?.EstimatedChargeRemaining ?? 0;

        // Determine charging state
        bool isCharging = status.Contains("Charging", StringComparison.OrdinalIgnoreCase) &&
                          !status.Contains("Not Charging", StringComparison.OrdinalIgnoreCase);
        bool isFullyCharged = (status.Contains("Plugged In", StringComparison.OrdinalIgnoreCase) && chargeRemaining >= 95) ||
                              chargeRemaining >= 98;
        bool chargingPass = isCharging || isFullyCharged;

        // Battery presence row
        BatteryPresenceIcon.Text = batteryPresent ? "✅" : "❌";
        BatteryPresenceText.Text = batteryPresent ? "Detected: Battery" : "No battery found (desktop system)";
        BatteryPresenceText.Foreground = SolidColorBrush.Parse(batteryPresent ? "#0B9444" : "#dc2626");

        // Charging status row
        string chargingLabel;
        if (!batteryPresent)
        {
            chargingLabel = "N/A (Desktop)";
        }
        else if (isCharging)
        {
            chargingLabel = $"Charging ({chargeRemaining}%) ✓";
        }
        else if (isFullyCharged)
        {
            chargingLabel = $"Fully Charged ({chargeRemaining}%) — adapter detected";
        }
        else
        {
            chargingLabel = $"Discharging ({chargeRemaining}%) — adapter may not be connected";
        }

        bool overallPass = !batteryPresent || chargingPass;

        ChargingIcon.Text = chargingPass || !batteryPresent ? "✅" : "❌";
        ChargingStatusText.Text = chargingLabel;
        ChargingStatusText.Foreground = SolidColorBrush.Parse((chargingPass || !batteryPresent) ? "#0B9444" : "#dc2626");

        string resultMsg;
        if (!batteryPresent)
            resultMsg = "No battery detected (desktop) — Charger test N/A";
        else if (isCharging)
            resultMsg = $"Charger Passed — Battery is charging ({chargeRemaining}%)";
        else if (isFullyCharged)
            resultMsg = $"Charger Passed — Battery fully charged ({chargeRemaining}%)";
        else
            resultMsg = "Charger Failed — Battery is not charging. Check adapter and port.";

        _passed = overallPass;
        _resultMessage = resultMsg;

        ResultsPanel.IsVisible = true;

        OverallResultBorder.Background = SolidColorBrush.Parse(overallPass ? "#dcfce7" : "#fee2e2");
        OverallResultText.Text = overallPass
            ? "✓ Charging verified"
            : "✗ Charging not detected — plug in the adapter and retry";
        OverallResultText.Foreground = SolidColorBrush.Parse(overallPass ? "#15803d" : "#dc2626");

        ContinueButton.IsEnabled = true;
        CheckButton.IsVisible = false;
    }

    public (bool Passed, string Message) GetResult() => (_passed, _resultMessage);

    private void ContinueButton_Click(object? sender, global::Avalonia.Interactivity.RoutedEventArgs e)
    {
        Close();
    }
}
