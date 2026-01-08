using LaptopQC.Hardware.Models;
using LaptopQC.Hardware.Providers;
using System.Text.RegularExpressions;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Provides detection of all connected devices and ports
/// </summary>
public class DeviceDiagnostic
{
    private readonly WmiProvider _wmi;

    public DeviceDiagnostic()
    {
        _wmi = new WmiProvider();
    }

    /// <summary>
    /// Gets information about all devices and ports
    /// </summary>
    public DevicesInfo GetInfo()
    {
        var info = new DevicesInfo();

        // Detect all device types
        DetectInputDevices(info);
        DetectUsbPorts(info);
        DetectConnectedUsbDevices(info);
        DetectDisplays(info);
        DetectAudioDevices(info);
        DetectNetworkDevices(info);
        DetectCamera(info);

        return info;
    }

    /// <summary>
    /// Detects keyboard, trackpad, and mouse devices
    /// </summary>
    private void DetectInputDevices(DevicesInfo info)
    {
        // Detect Keyboards
        foreach (var obj in _wmi.Query("Win32_Keyboard"))
        {
            var device = new InputDevice
            {
                Name = _wmi.GetValue<string>(obj, "Name", "Unknown Keyboard") ?? "Unknown Keyboard",
                DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "",
                Description = _wmi.GetValue<string>(obj, "Description", "") ?? "",
                Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown",
                Type = InputDeviceType.Keyboard
            };
            info.InputDevices.Add(device);
        }

        // Detect Pointing Devices (Mouse, Trackpad)
        foreach (var obj in _wmi.Query("Win32_PointingDevice"))
        {
            var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
            var pointingType = _wmi.GetValue<ushort>(obj, "PointingType", 0);
            var deviceInterface = _wmi.GetValue<ushort>(obj, "DeviceInterface", 0);
            
            var device = new InputDevice
            {
                Name = name,
                DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "",
                Description = _wmi.GetValue<string>(obj, "Description", "") ?? "",
                Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown",
                Type = DeterminePointingDeviceType(name, pointingType)
            };
            
            info.InputDevices.Add(device);
        }
    }

    /// <summary>
    /// Determines if a pointing device is a trackpad, mouse, or other
    /// </summary>
    private InputDeviceType DeterminePointingDeviceType(string name, ushort pointingType)
    {
        var nameLower = name.ToLower();
        
        // Check for trackpad/touchpad indicators
        if (pointingType == 5 || // PointingType 5 = Touch Pad
            nameLower.Contains("touchpad") ||
            nameLower.Contains("trackpad") ||
            nameLower.Contains("clickpad") ||
            nameLower.Contains("precision") ||
            nameLower.Contains("synaptics") ||
            nameLower.Contains("elan") ||
            nameLower.Contains("i2c hid"))
        {
            return InputDeviceType.Trackpad;
        }
        
        // Check for touchscreen
        if (nameLower.Contains("touch screen") || nameLower.Contains("touchscreen"))
        {
            return InputDeviceType.Touchscreen;
        }
        
        // Default to mouse
        return InputDeviceType.Mouse;
    }

    /// <summary>
    /// Detects USB controllers to estimate available ports
    /// </summary>
    private void DetectUsbPorts(DevicesInfo info)
    {
        // Query USB Controllers
        foreach (var obj in _wmi.Query("Win32_USBController"))
        {
            var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
            var deviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "";
            
            var port = new UsbPortInfo
            {
                ControllerName = name,
                DeviceId = deviceId,
                Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown",
                UsbVersion = DetermineUsbVersion(name, deviceId),
                PortCount = EstimatePortCount(name)
            };
            
            info.UsbPorts.Add(port);
        }

        // Also check USB Hubs for more accurate port counting
        foreach (var obj in _wmi.Query("Win32_USBHub"))
        {
            var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
            var deviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "";
            
            // Root hubs indicate additional ports
            if (name.Contains("Root Hub", StringComparison.OrdinalIgnoreCase))
            {
                var existingPort = info.UsbPorts.FirstOrDefault(p => 
                    deviceId.Contains(p.DeviceId.Split('\\').LastOrDefault() ?? "NOMATCH"));
                
                if (existingPort != null)
                {
                    // Each root hub typically exposes multiple ports
                    existingPort.PortCount = Math.Max(existingPort.PortCount, 2);
                }
            }
        }
    }

    /// <summary>
    /// Determines USB version from controller name
    /// </summary>
    private string DetermineUsbVersion(string controllerName, string deviceId)
    {
        var name = controllerName.ToLower();
        
        if (name.Contains("3.2") || name.Contains("usb 3.2"))
            return "3.2";
        if (name.Contains("3.1") || name.Contains("usb 3.1"))
            return "3.1";
        if (name.Contains("3.0") || name.Contains("xhci") || name.Contains("usb 3"))
            return "3.0";
        if (name.Contains("2.0") || name.Contains("ehci") || name.Contains("enhanced"))
            return "2.0";
        if (name.Contains("1.1") || name.Contains("uhci") || name.Contains("ohci"))
            return "1.1";
            
        return "2.0"; // Default assumption
    }

    /// <summary>
    /// Estimates port count based on controller type
    /// </summary>
    private int EstimatePortCount(string controllerName)
    {
        // xHCI controllers (USB 3.0+) typically handle multiple ports
        if (controllerName.ToLower().Contains("xhci"))
            return 2;
        return 1;
    }

    /// <summary>
    /// Detects currently connected USB devices
    /// </summary>
    private void DetectConnectedUsbDevices(DevicesInfo info)
    {
        // Query PnP entities with USB in DeviceID
        var query = "SELECT * FROM Win32_PnPEntity WHERE DeviceID LIKE 'USB%'";
        
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(query);
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
                var deviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "";
                
                // Skip root hubs and controllers (they're already counted in UsbPorts)
                if (name.Contains("Hub", StringComparison.OrdinalIgnoreCase) ||
                    name.Contains("Controller", StringComparison.OrdinalIgnoreCase))
                    continue;
                
                // Skip if empty name
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var usbDevice = new UsbDevice
                {
                    Name = name,
                    DeviceId = deviceId,
                    Manufacturer = _wmi.GetValue<string>(obj, "Manufacturer", "") ?? "",
                    Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown"
                };
                
                info.ConnectedUsbDevices.Add(usbDevice);
            }
        }
        catch { /* Ignore query failures */ }
    }

    /// <summary>
    /// Detects connected displays/monitors
    /// </summary>
    private void DetectDisplays(DevicesInfo info)
    {
        foreach (var obj in _wmi.Query("Win32_DesktopMonitor"))
        {
            var display = new DisplayDevice
            {
                Name = _wmi.GetValue<string>(obj, "Name", "Unknown Display") ?? "Unknown Display",
                DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "",
                ScreenWidth = (int)_wmi.GetValue<uint>(obj, "ScreenWidth", 0),
                ScreenHeight = (int)_wmi.GetValue<uint>(obj, "ScreenHeight", 0),
                IsActive = _wmi.GetValue<ushort>(obj, "Availability", 0) == 3 // 3 = Running/Full Power
            };
            
            // Determine connection type from device ID
            display.ConnectionType = DetermineDisplayConnection(display.DeviceId, display.Name);
            
            info.Displays.Add(display);
        }

        // Also check video controllers for port capability
        foreach (var obj in _wmi.Query("Win32_VideoController"))
        {
            var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
            // This gives us info about the GPU, useful for port detection
        }
    }

    /// <summary>
    /// Determines display connection type
    /// </summary>
    private string DetermineDisplayConnection(string deviceId, string name)
    {
        var combined = (deviceId + name).ToLower();
        
        if (combined.Contains("internal") || combined.Contains("lvds") || combined.Contains("edp"))
            return "Internal";
        if (combined.Contains("hdmi"))
            return "HDMI";
        if (combined.Contains("displayport") || combined.Contains("dp"))
            return "DisplayPort";
        if (combined.Contains("vga") || combined.Contains("dsub"))
            return "VGA";
        if (combined.Contains("dvi"))
            return "DVI";
        if (combined.Contains("thunderbolt") || combined.Contains("usb-c"))
            return "USB-C/Thunderbolt";
            
        return "External";
    }

    /// <summary>
    /// Detects audio devices (speakers, microphones)
    /// </summary>
    private void DetectAudioDevices(DevicesInfo info)
    {
        foreach (var obj in _wmi.Query("Win32_SoundDevice"))
        {
            var name = _wmi.GetValue<string>(obj, "Name", "Unknown Audio Device") ?? "Unknown Audio Device";
            
            var audio = new AudioDevice
            {
                Name = name,
                DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "",
                Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown",
                IsOutput = true,  // Most sound devices are output
                IsInput = name.ToLower().Contains("microphone") || name.ToLower().Contains("input")
            };
            
            info.AudioDevices.Add(audio);
        }
    }

    /// <summary>
    /// Detects network adapters (Ethernet, WiFi, Bluetooth)
    /// </summary>
    private void DetectNetworkDevices(DevicesInfo info)
    {
        foreach (var obj in _wmi.Query("Win32_NetworkAdapter", 
            new[] { "Name", "AdapterType", "MACAddress", "NetConnectionStatus", "Speed" }))
        {
            var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
            var adapterType = _wmi.GetValue<string>(obj, "AdapterType", "") ?? "";
            
            // Skip virtual and internal adapters
            if (string.IsNullOrWhiteSpace(name) || 
                name.Contains("Virtual", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Loopback", StringComparison.OrdinalIgnoreCase))
                continue;

            var network = new NetworkDevice
            {
                Name = name,
                AdapterType = DetermineNetworkType(name, adapterType),
                MacAddress = _wmi.GetValue<string>(obj, "MACAddress", "") ?? "",
                IsConnected = _wmi.GetValue<ushort>(obj, "NetConnectionStatus", 0) == 2, // 2 = Connected
                Speed = FormatSpeed(_wmi.GetValue<ulong>(obj, "Speed", 0))
            };
            
            // Only add physical adapters
            if (!string.IsNullOrEmpty(network.MacAddress))
            {
                info.NetworkDevices.Add(network);
            }
        }
    }

    /// <summary>
    /// Determines network adapter type
    /// </summary>
    private string DetermineNetworkType(string name, string adapterType)
    {
        var nameLower = name.ToLower();
        
        if (nameLower.Contains("bluetooth"))
            return "Bluetooth";
        if (nameLower.Contains("wi-fi") || nameLower.Contains("wifi") || 
            nameLower.Contains("wireless") || nameLower.Contains("802.11"))
            return "WiFi";
        if (nameLower.Contains("ethernet") || nameLower.Contains("gigabit") || 
            nameLower.Contains("realtek") || adapterType.Contains("Ethernet"))
            return "Ethernet";
            
        return adapterType;
    }

    /// <summary>
    /// Formats network speed
    /// </summary>
    private string FormatSpeed(ulong speedBps)
    {
        if (speedBps == 0) return "";
        if (speedBps >= 1_000_000_000) return $"{speedBps / 1_000_000_000} Gbps";
        if (speedBps >= 1_000_000) return $"{speedBps / 1_000_000} Mbps";
        return $"{speedBps / 1_000} Kbps";
    }

    /// <summary>
    /// Detects webcam/camera
    /// </summary>
    private void DetectCamera(DevicesInfo info)
    {
        // Query for video capture devices
        var query = "SELECT * FROM Win32_PnPEntity WHERE Service='usbvideo'";
        
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(query);
            foreach (System.Management.ManagementObject obj in searcher.Get())
            {
                info.Camera = new CameraDevice
                {
                    Name = _wmi.GetValue<string>(obj, "Name", "Unknown Camera") ?? "Unknown Camera",
                    DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "",
                    Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown",
                    IsDetected = true
                };
                break; // Usually one camera
            }
        }
        catch { /* Ignore failures */ }

        // If no camera found via usbvideo, try alternate detection
        if (info.Camera == null)
        {
            var imageQuery = "SELECT * FROM Win32_PnPEntity WHERE Name LIKE '%Camera%' OR Name LIKE '%Webcam%'";
            try
            {
                using var searcher = new System.Management.ManagementObjectSearcher(imageQuery);
                foreach (System.Management.ManagementObject obj in searcher.Get())
                {
                    var name = _wmi.GetValue<string>(obj, "Name", "") ?? "";
                    if (!name.Contains("Virtual", StringComparison.OrdinalIgnoreCase))
                    {
                        info.Camera = new CameraDevice
                        {
                            Name = name,
                            DeviceId = _wmi.GetValue<string>(obj, "DeviceID", "") ?? "",
                            Status = _wmi.GetValue<string>(obj, "Status", "Unknown") ?? "Unknown",
                            IsDetected = true
                        };
                        break;
                    }
                }
            }
            catch { /* Ignore failures */ }
        }
    }

    /// <summary>
    /// Validates all devices are functioning
    /// </summary>
    public (bool IsHealthy, string Message) ValidateDevices(DevicesInfo info)
    {
        var issues = new List<string>();

        // Check for keyboard
        if (!info.HasKeyboard)
            issues.Add("No keyboard detected");
        else if (info.InputDevices.Where(d => d.Type == InputDeviceType.Keyboard).Any(d => !d.IsWorking))
            issues.Add("Keyboard not working properly");

        // Check for trackpad (laptops) or mouse
        if (!info.HasTrackpad && !info.HasMouse)
            issues.Add("No pointing device (trackpad/mouse) detected");

        // Check USB ports
        if (info.TotalUsbPorts == 0)
            issues.Add("No USB ports detected");
        else if (info.UsbPorts.Any(p => !p.IsWorking))
            issues.Add("Some USB ports not working");

        // Check camera
        if (info.Camera == null || !info.HasWebcam)
            issues.Add("No webcam detected");
        else if (!info.Camera.IsWorking)
            issues.Add("Webcam not working properly");

        // Check audio
        if (info.AudioDevices.Count == 0)
            issues.Add("No audio devices detected");
        else if (info.AudioDevices.Any(a => !a.IsWorking))
            issues.Add("Some audio devices not working");

        if (issues.Count > 0)
            return (false, string.Join("; ", issues));

        return (true, $"All devices OK - {info.InputDevices.Count} input, {info.TotalUsbPorts} USB ports, {info.Displays.Count} display(s)");
    }
}
