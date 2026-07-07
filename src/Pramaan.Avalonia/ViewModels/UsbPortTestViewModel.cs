using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;
using System.Collections.ObjectModel;
#if WINDOWS
using System.Management;
#endif
#if !WINDOWS
using LaptopQC.Core.Diagnostics.macOS;
#endif

namespace Pramaan.Avalonia.ViewModels;

/// <summary>
/// ViewModel for USB port testing via device insertion detection.
/// </summary>
public partial class UsbPortTestViewModel : ObservableObject, IDisposable
{
    private readonly InputTestService.UsbTestState _testState;
#if WINDOWS
    private ManagementEventWatcher? _insertWatcher;
    private ManagementEventWatcher? _removeWatcher;
#else
    private MacUsbWatcher? _macWatcher;
#endif

    private DateTime _lastPortCountTime = DateTime.MinValue;
    private readonly TimeSpan _globalDebounce = TimeSpan.FromSeconds(2);
    private readonly HashSet<string> _testedPortLocations = new();

    [ObservableProperty]
    private int _expectedPortCount = 2;

    [ObservableProperty]
    private double _progressPercent;

    [ObservableProperty]
    private string _progressText = "0 ports tested";

    [ObservableProperty]
    private string _instructions = "Plug one USB device into each port - physical port locations are tracked.";

    [ObservableProperty]
    private bool _isComplete;

    [ObservableProperty]
    private bool _passed;

    [ObservableProperty]
    private string _resultMessage = "";

    [ObservableProperty]
    private bool _isWatching;

    public ObservableCollection<UsbInsertionEvent> InsertionEvents { get; } = new();

    public UsbPortTestViewModel()
    {
        _testState = new InputTestService.UsbTestState(ExpectedPortCount);
    }

    [RelayCommand]
    private void IncrementPortCount()
    {
        if (ExpectedPortCount < 10)
            ExpectedPortCount++;
    }

    [RelayCommand]
    private void DecrementPortCount()
    {
        if (ExpectedPortCount > 1)
            ExpectedPortCount--;
    }

    partial void OnExpectedPortCountChanged(int value)
    {
        _testState.ExpectedPortCount = value;
        UpdateProgress();
    }

    [RelayCommand]
    private void StartWatching()
    {
        if (IsWatching)
            return;

        try
        {
#if WINDOWS
            var insertQuery = new WqlEventQuery(
                "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_USBHub'");
            _insertWatcher = new ManagementEventWatcher(insertQuery);
            _insertWatcher.EventArrived += OnDeviceInserted;
            _insertWatcher.Start();

            var pnpQuery = new WqlEventQuery(
                "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PnPEntity'");
            _removeWatcher = new ManagementEventWatcher(pnpQuery);
            _removeWatcher.EventArrived += OnPnPDeviceInserted;
            _removeWatcher.Start();

            IsWatching = true;
            Instructions = "Listening for USB insertions... Plug devices into each port.";
#else
            // macOS: poll system_profiler SPUSBDataType to detect insertions
            _macWatcher = new MacUsbWatcher();
            _macWatcher.DeviceInserted += (deviceId, name, usbVersion) =>
            {
                global::Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    RegisterInsertion(deviceId, name, usbVersion));
            };
            _macWatcher.Start();

            IsWatching = true;
            Instructions = "Listening for USB insertions... Plug devices into each port.";
#endif
        }
        catch (Exception ex)
        {
            Instructions = $"Error starting USB watch: {ex.Message}";
        }
    }

    [RelayCommand]
    private void StopWatching()
    {
#if WINDOWS
        _insertWatcher?.Stop();
        _insertWatcher?.Dispose();
        _insertWatcher = null;

        _removeWatcher?.Stop();
        _removeWatcher?.Dispose();
        _removeWatcher = null;
#else
        _macWatcher?.Stop();
        _macWatcher?.Dispose();
        _macWatcher = null;
#endif

        IsWatching = false;
        Instructions = "USB watching stopped. Click Start to resume.";
    }

#if !WINDOWS
    /// <summary>
    /// Called on the UI thread when the macOS USB watcher detects a new
    /// insertion. <paramref name="portKey"/> is the physical port address
    /// (location_id, e.g. "0x14100000"), so plugging the same USB stick
    /// into a different port produces a new event — matching Windows behaviour.
    /// </summary>
    private void RegisterInsertion(string portKey, string name, string usbVersion)
    {
        if (name.Contains("Hub", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Controller", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Root", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var now = DateTime.Now;

        if ((now - _lastPortCountTime) < _globalDebounce)
            return;

        // portKey is the physical port address — re-plugging into the same
        // port shows up with the same key and is filtered as a repeat.
        if (_testedPortLocations.Contains(portKey))
        {
            InsertionEvents.Insert(0, new UsbInsertionEvent
            {
                Time = now.ToString("HH:mm:ss"),
                DeviceName = $"Same port tested again: {name} ({portKey})",
                PortNumber = 0,
                IsSkipped = true
            });
            return;
        }

        _lastPortCountTime = now;
        _testedPortLocations.Add(portKey);
        _testState.RegisterDeviceInsertion(portKey, name);

        InsertionEvents.Insert(0, new UsbInsertionEvent
        {
            Time = now.ToString("HH:mm:ss"),
            DeviceName = $"Port {_testState.PortsTested}: {name} ({portKey})",
            PortNumber = _testState.PortsTested,
            IsSkipped = false,
            UsbVersion = usbVersion
        });

        UpdateProgress();
    }
#endif

#if WINDOWS
    private void OnDeviceInserted(object sender, EventArrivedEventArgs e)
    {
        try
        {
            var instance = (ManagementBaseObject)e.NewEvent["TargetInstance"];
            var deviceId = instance["DeviceID"]?.ToString() ?? "";
            var name = instance["Name"]?.ToString() ?? "Unknown USB Device";

            if (name.Contains("Root Hub", StringComparison.OrdinalIgnoreCase))
                return;

            RegisterInsertion(deviceId, name);
        }
        catch { }
    }

    private void OnPnPDeviceInserted(object sender, EventArrivedEventArgs e)
    {
        try
        {
            var instance = (ManagementBaseObject)e.NewEvent["TargetInstance"];
            var deviceId = instance["DeviceID"]?.ToString() ?? "";

            if (!deviceId.StartsWith("USB", StringComparison.OrdinalIgnoreCase))
                return;

            var name = instance["Name"]?.ToString() ?? "Unknown Device";

            if (name.Contains("Hub", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Controller", StringComparison.OrdinalIgnoreCase))
                return;

            RegisterInsertion(deviceId, name);
        }
        catch { }
    }

    private void RegisterInsertion(string deviceId, string name)
    {
        if (name.Contains("Hub", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Controller", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Root", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        global::Avalonia.Threading.Dispatcher.UIThread.Post(() =>
        {
            var now = DateTime.Now;

            if ((now - _lastPortCountTime) < _globalDebounce)
                return;

            var portLocation = GetDeviceLocationInfo(deviceId);
            if (string.IsNullOrEmpty(portLocation))
                portLocation = deviceId;

            if (_testedPortLocations.Contains(portLocation))
            {
                InsertionEvents.Insert(0, new UsbInsertionEvent
                {
                    Time = now.ToString("HH:mm:ss"),
                    DeviceName = $"Repeated device: {name} ({portLocation})",
                    PortNumber = 0,
                    IsSkipped = true
                });
                return;
            }

            _lastPortCountTime = now;
            _testedPortLocations.Add(portLocation);
            _testState.RegisterDeviceInsertion(deviceId, name);

            var usbVersion = GetUsbVersion(deviceId);

            InsertionEvents.Insert(0, new UsbInsertionEvent
            {
                Time = now.ToString("HH:mm:ss"),
                DeviceName = $"Port {_testState.PortsTested}: {name} ({portLocation})",
                PortNumber = _testState.PortsTested,
                IsSkipped = false,
                UsbVersion = usbVersion
            });

            UpdateProgress();
        });
    }

    private string GetDeviceLocationInfo(string deviceId)
    {
        try
        {
            var escapedId = deviceId.Replace("\\", "\\\\");
            var query = $"SELECT LocationInformation FROM Win32_PnPEntity WHERE DeviceID='{escapedId}'";

            using var searcher = new ManagementObjectSearcher(query);
            foreach (ManagementObject obj in searcher.Get())
            {
                var location = obj["LocationInformation"]?.ToString();
                if (!string.IsNullOrEmpty(location))
                    return location;
            }
        }
        catch { }

        return ExtractPortPath(deviceId);
    }

    private string GetUsbVersion(string deviceId)
    {
        try
        {
            var deviceIdUpper = deviceId.ToUpperInvariant();

            if (deviceIdUpper.Contains("ROOT_HUB30") || deviceIdUpper.Contains("ROOT_HUB3"))
                return "USB 3.x";

            if (deviceIdUpper.Contains("ROOT_HUB20") || deviceIdUpper.Contains("ROOT_HUB2"))
                return "USB 2.0";

            var escapedId = deviceId.Replace("\\", "\\\\");
            var query = $"SELECT * FROM Win32_PnPEntity WHERE DeviceID='{escapedId}'";

            using var searcher = new ManagementObjectSearcher(query);
            foreach (ManagementObject device in searcher.Get())
            {
                var compatibleIds = device["CompatibleID"] as string[];
                if (compatibleIds != null)
                {
                    foreach (var compatId in compatibleIds)
                    {
                        var compatUpper = compatId.ToUpperInvariant();
                        if (compatUpper.Contains("SUPERSPEED") || compatUpper.Contains("USB30"))
                            return "USB 3.x";
                    }
                }

                var hwIds = device["HardwareID"] as string[];
                if (hwIds != null)
                {
                    foreach (var hwId in hwIds)
                    {
                        if (hwId.Contains("USB30", StringComparison.OrdinalIgnoreCase) ||
                            hwId.Contains("SUPERSPEED", StringComparison.OrdinalIgnoreCase))
                        {
                            return "USB 3.x";
                        }
                    }
                }
            }

            var hubQuery = "SELECT DeviceID, Name FROM Win32_USBHub";
            using var hubSearcher = new ManagementObjectSearcher(hubQuery);
            foreach (ManagementObject hub in hubSearcher.Get())
            {
                var hubName = hub["Name"]?.ToString() ?? "";
                if (hubName.Contains("USB 3.0", StringComparison.OrdinalIgnoreCase) ||
                    hubName.Contains("USB3", StringComparison.OrdinalIgnoreCase) ||
                    hubName.Contains("SuperSpeed", StringComparison.OrdinalIgnoreCase))
                {
                    return "USB 3.x";
                }
            }

            if (deviceId.Contains("VID_", StringComparison.OrdinalIgnoreCase))
                return "USB 2.0";
        }
        catch { }

        return "USB 2.0";
    }
#endif

    private string ExtractPortPath(string deviceId)
    {
        var lastSlash = deviceId.LastIndexOf('\\');
        if (lastSlash > 0 && lastSlash < deviceId.Length - 1)
        {
            var instanceId = deviceId.Substring(lastSlash + 1);
            if (instanceId.Contains('&'))
                return instanceId.ToUpperInvariant();
        }

        return deviceId.ToUpperInvariant();
    }

    private void UpdateProgress()
    {
        ProgressPercent = _testState.PercentComplete;
        ProgressText = $"{_testState.PortsTested}/{ExpectedPortCount} ports tested";

        if (_testState.PortsTested >= ExpectedPortCount)
            Instructions = "All USB ports tested! Click Complete to finish.";
        else
        {
            var remaining = ExpectedPortCount - _testState.PortsTested;
            Instructions = $"{remaining} more port(s) to test. Plug a device into another port.";
        }
    }

    [RelayCommand]
    private void CompleteTest()
    {
        StopWatching();
        var result = _testState.GetResult();
        Passed = result.Passed;
        ResultMessage = result.Message;
        IsComplete = true;
    }

    [RelayCommand]
    private void CancelTest()
    {
        StopWatching();
        Passed = false;
        ResultMessage = "Test cancelled";
        IsComplete = true;
    }

    public void Dispose()
    {
        StopWatching();
    }
}

/// <summary>
/// Represents a USB insertion event for display.
/// </summary>
public class UsbInsertionEvent
{
    public string Time { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public int PortNumber { get; set; }
    public bool IsSkipped { get; set; }
    public string UsbVersion { get; set; } = "USB";
}
