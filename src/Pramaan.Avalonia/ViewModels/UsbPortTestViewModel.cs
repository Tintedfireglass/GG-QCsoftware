using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;
using System.Collections.ObjectModel;
#if WINDOWS
using System.Management;
#endif
using System.Text.RegularExpressions;

namespace Pramaan.Avalonia.ViewModels;

/// <summary>
/// ViewModel for USB port testing via device insertion detection
/// </summary>
public partial class UsbPortTestViewModel : ObservableObject, IDisposable
{
    private readonly InputTestService.UsbTestState _testState;
#if WINDOWS
    private ManagementEventWatcher? _insertWatcher;
    private ManagementEventWatcher? _removeWatcher;
#endif
    
    // Global debounce - only count one port insertion every N seconds
    private DateTime _lastPortCountTime = DateTime.MinValue;
    private readonly TimeSpan _globalDebounce = TimeSpan.FromSeconds(2);
    
    // Track unique physical port locations (Port_#X.Hub_#Y format)
    private readonly HashSet<string> _testedPortLocations = new();

    [ObservableProperty]
    private int _expectedPortCount = 2;

    [ObservableProperty]
    private double _progressPercent;

    [ObservableProperty]
    private string _progressText = "0 ports tested";

    [ObservableProperty]
    private string _instructions = "ðŸ”Œ Plug one USB device into each port - physical port locations are tracked!";

    [ObservableProperty]
    private bool _isComplete;

    [ObservableProperty]
    private bool _passed;

    [ObservableProperty]
    private string _resultMessage = "";

    [ObservableProperty]
    private bool _isWatching;

    /// <summary>
    /// List of detected USB insertions for display
    /// </summary>
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

    /// <summary>
    /// Start watching for USB device insertions
    /// </summary>
    [RelayCommand]
    private void StartWatching()
    {
        if (IsWatching) return;

        try
        {
#if WINDOWS
            // Watch for USB device insertion
            var insertQuery = new WqlEventQuery(
                "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_USBHub'");
            _insertWatcher = new ManagementEventWatcher(insertQuery);
            _insertWatcher.EventArrived += OnDeviceInserted;
            _insertWatcher.Start();

            // Also watch Win32_PnPEntity for more device types
            var pnpQuery = new WqlEventQuery(
                "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PnPEntity'");
            _removeWatcher = new ManagementEventWatcher(pnpQuery);
            _removeWatcher.EventArrived += OnPnPDeviceInserted;
            _removeWatcher.Start();

            IsWatching = true;
            Instructions = "🔌 Listening for USB insertions... Plug devices into each port.";
#else
            IsWatching = true;
            Instructions = "🔌 Automated USB insertion testing is a Windows-only feature. Please click Complete if ports are functional.";
#endif
        }
        catch (Exception ex)
        {
            Instructions = $"Error starting USB watch: {ex.Message}";
        }
    }

    /// <summary>
    /// Stop watching for USB devices
    /// </summary>
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
#endif

        IsWatching = false;
        Instructions = "USB watching stopped. Click Start to resume.";
    }

#if WINDOWS
    private void OnDeviceInserted(object sender, EventArrivedEventArgs e)
    {
        try
        {
            var instance = (ManagementBaseObject)e.NewEvent["TargetInstance"];
            var deviceId = instance["DeviceID"]?.ToString() ?? "";
            var name = instance["Name"]?.ToString() ?? "Unknown USB Device";

            // Filter out root hubs
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
            
            // Only process USB devices
            if (!deviceId.StartsWith("USB", StringComparison.OrdinalIgnoreCase))
                return;

            var name = instance["Name"]?.ToString() ?? "Unknown Device";
            
            // Filter out hubs and controllers
            if (name.Contains("Hub", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Controller", StringComparison.OrdinalIgnoreCase))
                return;

            RegisterInsertion(deviceId, name);
        }
        catch { }
    }

    private void RegisterInsertion(string deviceId, string name)
    {
        // Filter out hubs and controllers - these are internal, not user-plugged devices
        if (name.Contains("Hub", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Controller", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("Root", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }
        
        // Use dispatcher to update UI from background thread
        global::Avalonia.Threading.Dispatcher.UIThread.Post(() =>
        {
            var now = DateTime.Now;
            
            // Global debounce - prevent counting multiple interfaces from same insertion
            if ((now - _lastPortCountTime) < _globalDebounce)
            {
                // Too soon since last count - this is likely a multi-interface device
                return;
            }
            
            // Query WMI for LocationInformation of this device
            var portLocation = GetDeviceLocationInfo(deviceId);
            
            if (string.IsNullOrEmpty(portLocation))
            {
                // No location info - use deviceId fallback
                portLocation = deviceId;
            }
            
            // Check if this port location has already been tested
            if (_testedPortLocations.Contains(portLocation))
            {
                InsertionEvents.Insert(0, new UsbInsertionEvent
                {
                    Time = now.ToString("HH:mm:ss"),
                    DeviceName = $"ðŸ”„ {name} ({portLocation}) - already tested",
                    PortNumber = 0,
                    IsSkipped = true
                });
                return;
            }
            
            // New physical port location!
            _lastPortCountTime = now;
            _testedPortLocations.Add(portLocation);
            _testState.RegisterDeviceInsertion(deviceId, name);
            
            // Detect USB version
            var usbVersion = GetUsbVersion(deviceId);

            InsertionEvents.Insert(0, new UsbInsertionEvent
            {
                Time = now.ToString("HH:mm:ss"),
                DeviceName = $"âœ“ Port {_testState.PortsTested}: {name} ({portLocation})",
                PortNumber = _testState.PortsTested,
                IsSkipped = false,
                UsbVersion = usbVersion
            });

            UpdateProgress();
        });
    }

    /// <summary>
    /// Query WMI for device's LocationInformation property
    /// Returns strings like "Port_#0003.Hub_#0006" which identify physical ports
    /// </summary>
    private string GetDeviceLocationInfo(string deviceId)
    {
        try
        {
            // Escape backslashes for WMI query
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
        
        // Fallback: extract port path from device ID instance portion
        return ExtractPortPath(deviceId);
    }
    
    /// <summary>
    /// Detect USB version (2.0, 3.0, 3.1, etc.) by examining the device's connection path
    /// </summary>
    private string GetUsbVersion(string deviceId)
    {
        try
        {
            // Method 1: Check device ID for root hub type
            // USB 3.0 devices go through ROOT_HUB30, USB 2.0 through ROOT_HUB20 or ROOT_HUB
            var deviceIdUpper = deviceId.ToUpperInvariant();
            
            if (deviceIdUpper.Contains("ROOT_HUB30") || deviceIdUpper.Contains("ROOT_HUB3"))
            {
                return "USB 3.x";
            }
            if (deviceIdUpper.Contains("ROOT_HUB20") || deviceIdUpper.Contains("ROOT_HUB2"))
            {
                return "USB 2.0";
            }
            
            // Method 2: Query the device's parent to find the root hub
            var escapedId = deviceId.Replace("\\", "\\\\");
            var query = $"SELECT * FROM Win32_PnPEntity WHERE DeviceID='{escapedId}'";
            
            using var searcher = new ManagementObjectSearcher(query);
            foreach (ManagementObject device in searcher.Get())
            {
                // Check CompatibleID for USB speed class
                var compatibleIds = device["CompatibleID"] as string[];
                if (compatibleIds != null)
                {
                    foreach (var compatId in compatibleIds)
                    {
                        var compatUpper = compatId.ToUpperInvariant();
                        // USB\Class_09&SubClass_00&Prot_03 = USB 3.0 hub protocol
                        // USB\DevClass_00&SubClass_00&Prot_00 = Generic
                        if (compatUpper.Contains("SUPERSPEED") || compatUpper.Contains("USB30"))
                        {
                            return "USB 3.x";
                        }
                    }
                }
                
                // Check HardwareID for speed indicators
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
            
            // Method 3: Check the parent hub chain
            // Query for parent device info through USB hub tree
            var hubQuery = "SELECT DeviceID, Name FROM Win32_USBHub";
            using var hubSearcher = new ManagementObjectSearcher(hubQuery);
            
            foreach (ManagementObject hub in hubSearcher.Get())
            {
                var hubId = hub["DeviceID"]?.ToString() ?? "";
                var hubName = hub["Name"]?.ToString() ?? "";
                
                // Check if this hub is a parent of our device (rough match on instance ID)
                if (!string.IsNullOrEmpty(hubId) && 
                    deviceId.StartsWith("USB\\", StringComparison.OrdinalIgnoreCase))
                {
                    // USB 3.0 root hubs are named with "USB 3.0"
                    if (hubName.Contains("USB 3.0", StringComparison.OrdinalIgnoreCase) ||
                        hubName.Contains("USB3", StringComparison.OrdinalIgnoreCase) ||
                        hubName.Contains("SuperSpeed", StringComparison.OrdinalIgnoreCase))
                    {
                        return "USB 3.x";
                    }
                }
            }
            
            // Method 4: Default based on common patterns in device ID
            // Modern USB devices on xHCI might not have clear indicators
            // Check if VID/PID combination suggests USB 3.0
            if (deviceId.Contains("VID_", StringComparison.OrdinalIgnoreCase))
            {
                // Most devices that don't explicitly show USB 3.0 indicators
                // are likely USB 2.0 devices (mice, keyboards, etc.)
                return "USB 2.0";
            }
        }
        catch { }
        
        return "USB 2.0"; // Default to USB 2.0 for unknown devices (most common)
    }
    
    /// <summary>
    /// Check if a device is connected under a specific USB controller
    /// </summary>
    private bool IsDeviceUnderController(string deviceId, string controllerId)
    {
        try
        {
            // Simple heuristic: check if device shares root hub with controller
            // This isn't perfect but works for most cases
            var deviceParts = deviceId.Split('\\');
            var controllerParts = controllerId.Split('\\');
            
            if (deviceParts.Length > 1 && controllerParts.Length > 1)
            {
                // Check if they share a common PCI root
                return deviceParts[0].Equals(controllerParts[0], StringComparison.OrdinalIgnoreCase);
            }
        }
        catch { }
        
        return false;
    }
#endif

    /// <summary>
    /// Fallback: Extracts the port path (instance ID) from a full device ID
    /// </summary>
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
        {
            Instructions = "âœ“ All USB ports tested! Click Complete to finish.";
        }
        else
        {
            var remaining = ExpectedPortCount - _testState.PortsTested;
            Instructions = $"ðŸ”Œ {remaining} more port(s) to test. Plug device into another port.";
        }
    }

    /// <summary>
    /// Complete the test
    /// </summary>
    [RelayCommand]
    private void CompleteTest()
    {
        StopWatching();
        var result = _testState.GetResult();
        Passed = result.Passed;
        ResultMessage = result.Message;
        IsComplete = true;
    }

    /// <summary>
    /// Cancel the test
    /// </summary>
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
/// Represents a USB insertion event for display
/// </summary>
public class UsbInsertionEvent
{
    public string Time { get; set; } = "";
    public string DeviceName { get; set; } = "";
    public int PortNumber { get; set; }
    public bool IsSkipped { get; set; }
    public string UsbVersion { get; set; } = "USB";
}


