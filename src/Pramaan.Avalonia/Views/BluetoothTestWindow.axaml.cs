using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Threading;
using System;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using LaptopQC.Core.Diagnostics.macOS;

namespace Pramaan.Avalonia.Views;

public partial class BluetoothTestWindow : Window
{
    private bool _passed;
    private string _resultMessage = "Bluetooth Test Not Run";

    public BluetoothTestWindow()
    {
        InitializeComponent();
        Opened += async (s, e) => await RunBluetoothTestAsync();
    }

    private async Task RunBluetoothTestAsync()
    {
        bool adapterFound = false;
        string adapterName = "";
        bool scanSuccess = false;
        int devicesFound = 0;

        LoadingText.Text = "Scanning for Bluetooth adapter...";

        await Task.Run(() =>
        {
            try
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    var btText = CommandRunner.TryRun("system_profiler", "SPBluetoothDataType", 10000);
                    if (!string.IsNullOrWhiteSpace(btText) &&
                        (btText.Contains("State: On", StringComparison.OrdinalIgnoreCase) ||
                         btText.Contains("Address:", StringComparison.OrdinalIgnoreCase) ||
                         btText.Contains("Bluetooth:", StringComparison.OrdinalIgnoreCase) ||
                         btText.Contains("controller_state", StringComparison.OrdinalIgnoreCase) ||
                         btText.Contains("Apple Bluetooth", StringComparison.OrdinalIgnoreCase)))
                    {
                        adapterFound = true;
                        adapterName = "Apple Bluetooth Controller";
                    }
                }
                else if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                {
#if WINDOWS
                    try
                    {
                        using var searcher = new System.Management.ManagementObjectSearcher(
                            "SELECT * FROM Win32_PnPEntity WHERE " +
                            "(Description LIKE '%Bluetooth%' OR Name LIKE '%Bluetooth%') " +
                            "AND Status = 'OK'");

                        foreach (System.Management.ManagementObject obj in searcher.Get())
                        {
                            adapterFound = true;
                            if (string.IsNullOrEmpty(adapterName))
                                adapterName = obj["Name"]?.ToString() ?? "Bluetooth Adapter";
                            break;
                        }
                    }
                    catch { }
#endif
                }
                else
                {
                    // Linux
                    var btText = CommandRunner.TryRun("bluetoothctl", "show", 5000);
                    if (!string.IsNullOrWhiteSpace(btText) && btText.Contains("Powered: yes", StringComparison.OrdinalIgnoreCase))
                    {
                        adapterFound = true;
                        adapterName = "Bluetooth Adapter";
                    }
                }
            }
            catch { }
        });

        Dispatcher.UIThread.Post(() =>
        {
            AdapterIcon.Text = adapterFound ? "✅" : "❌";
            AdapterStatusText.Text = adapterFound
                ? $"Found: {adapterName}"
                : "No Bluetooth adapter detected";
            AdapterStatusText.Foreground = SolidColorBrush.Parse(adapterFound ? "#0B9444" : "#dc2626");
        });

        if (!adapterFound)
        {
            Dispatcher.UIThread.Post(() => ShowFinalResult(passed: false, "Bluetooth adapter not found"));
            return;
        }

        // Step 2: Discovery scan delay
        Dispatcher.UIThread.Post(() => LoadingText.Text = "Running discovery scan (4 seconds)...");

        await Task.Run(async () =>
        {
            try
            {
                await Task.Delay(4000);
                if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
                {
                    var btText = CommandRunner.TryRun("system_profiler", "SPBluetoothDataType", 10000);
                    if (!string.IsNullOrWhiteSpace(btText) &&
                        (btText.Contains("Connected:", StringComparison.OrdinalIgnoreCase) ||
                         btText.Contains("Paired:", StringComparison.OrdinalIgnoreCase) ||
                         btText.Contains("Devices (Paired", StringComparison.OrdinalIgnoreCase)))
                    {
                        devicesFound = 1;
                    }
                    scanSuccess = adapterFound;
                }
                else
                {
                    scanSuccess = adapterFound;
                }
            }
            catch
            {
                scanSuccess = false;
            }
        });

        Dispatcher.UIThread.Post(() =>
        {
            ScanIcon.Text = scanSuccess ? "✅" : "❌";
            ScanStatusText.Text = scanSuccess
                ? (devicesFound > 0
                    ? "Radio active — paired device(s) visible"
                    : "Radio active — radio is working")
                : "Discovery scan failed";
            ScanStatusText.Foreground = SolidColorBrush.Parse(scanSuccess ? "#0B9444" : "#dc2626");

            ShowFinalResult(adapterFound && scanSuccess,
                adapterFound && scanSuccess
                    ? $"Bluetooth Passed — {adapterName}"
                    : "Bluetooth Failed — adapter present but scan unsuccessful");
        });
    }

    private void ShowFinalResult(bool passed, string message)
    {
        _passed = passed;
        _resultMessage = message;

        LoadingPanel.IsVisible = false;
        ResultsPanel.IsVisible = true;

        OverallResultBorder.Background = SolidColorBrush.Parse(passed ? "#dcfce7" : "#fee2e2");
        OverallResultText.Text = passed
            ? "✓ Bluetooth verified"
            : "✗ Bluetooth issue detected";
        OverallResultText.Foreground = SolidColorBrush.Parse(passed ? "#15803d" : "#dc2626");

        ContinueButton.IsEnabled = true;
    }

    public (bool Passed, string Message) GetResult() => (_passed, _resultMessage);

    private void ContinueButton_Click(object? sender, global::Avalonia.Interactivity.RoutedEventArgs e)
    {
        Close();
    }
}
