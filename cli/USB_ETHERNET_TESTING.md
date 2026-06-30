# USB and Ethernet Testing - Linux CLI

This document describes the USB port and Ethernet connectivity testing features added to the Pramaan Linux CLI.

## Overview

The Linux CLI now includes comprehensive testing for:
- **USB Ports**: Interactive testing of USB 2.0, USB 3.x, and USB-C ports
- **Ethernet**: Connectivity, link speed, and cable detection for Ethernet interfaces

## USB Port Testing

### Features

- **Auto-detection** of all USB ports (USB 2.0, USB 3.x, USB-C)
- **Interactive testing**: Guides technician through testing each port individually
- **Device detection**: Waits for USB device insertion (15-second timeout per port)
- **Real-time monitoring**: Detects newly connected USB devices using kernel events

### Usage

#### Command Line
```bash
# Run USB port test standalone
pramaan --test-usb
```

#### Interactive Menu
1. Launch `pramaan` 
2. Select **4. Test USB Ports**

#### In Full QC Workflow
USB port validation is automatically included when running Full QC:
```bash
pramaan --full-qc
```

### How It Works

1. **Detection Phase**: Scans system using `lsusb` and `/sys/bus/usb/devices/` to identify:
   - Total number of USB ports
   - USB 3.x ports (5000M, 10000M speeds)
   - USB 2.0 ports (480M speed)
   - USB-C ports (via `/sys/class/typec`)

2. **Testing Phase**: For each detected port:
   - Prompts technician to insert a USB device
   - Monitors USB subsystem for new device connection
   - Reports device name if detected within timeout
   - Marks port as PASS/FAIL

3. **Results**: Displays table showing:
   - Port name/number
   - Port type (USB 2.0, USB 3.x, USB-C)
   - Test result (PASS/FAIL)
   - Device detected (or timeout message)

### Quick Validation

The system also performs a quick validation check:
- Verifies USB subsystem is responding
- Confirms USB ports are detected
- Counts currently connected USB devices

## Ethernet Testing

### Features

- **Auto-detection** of all Ethernet interfaces
- **Cable detection**: Checks physical cable connection status
- **Link speed detection**: Reports 10/100/1000 Mbps speeds
- **Duplex mode**: Full/half duplex detection
- **IP configuration**: Shows assigned IP addresses
- **Connectivity test**: Optional ping test to verify internet connectivity
- **Throughput test**: Basic download speed measurement

### Usage

#### Command Line
```bash
# Run Ethernet test standalone
pramaan --test-ethernet
```

#### Interactive Menu
1. Launch `pramaan`
2. Select **5. Test Ethernet**
3. Choose test type:
   - **Quick Scan**: Fast detection and status check
   - **Full Interactive Test**: Includes connectivity and throughput tests

#### In Full QC Workflow
Ethernet validation is automatically included when running Full QC:
```bash
pramaan --full-qc
```

### How It Works

1. **Detection Phase**: Scans system using:
   - `ip link show` to find Ethernet interfaces
   - `/sys/class/net/` for device enumeration
   - Filters out loopback, WiFi, Docker, and virtual interfaces

2. **Port Info Gathering**: For each Ethernet interface:
   - Reads MAC address from `/sys/class/net/{iface}/address`
   - Checks cable connection via `/sys/class/net/{iface}/carrier`
   - Gets link speed and duplex using `ethtool`
   - Retrieves IP address using `ip addr`

3. **Connectivity Testing** (Full Interactive mode):
   - Pings reliable external host (8.8.8.8)
   - Reports latency in milliseconds

4. **Throughput Testing** (Full Interactive mode):
   - Downloads test file from public server
   - Calculates download speed in Mbps

### Test Results

Results table displays:
- Interface name (eth0, enp0s3, etc.)
- MAC address
- Link speed (1000Mb/s, 100Mb/s, etc.)
- Cable status (Connected/Disconnected)
- Interface status (UP/DOWN)
- IP address

## Implementation Details

### New Files

- **`cli/Diagnostics/LinuxUsbPortDiagnostic.cs`**: USB port detection and testing
- **`cli/Diagnostics/LinuxEthernetDiagnostic.cs`**: Ethernet interface testing

### Dependencies

Both diagnostics use:
- `LinuxCommandRunner`: Helper for executing Linux commands
- Standard Linux utilities:
  - `lsusb`: USB device enumeration
  - `ip`: Network interface management
  - `ethtool`: Ethernet link speed/duplex detection
  - `/sys` filesystem: Direct hardware status reading

### Integration Points

1. **Program.cs**: Menu handlers for standalone tests
2. **QCWizard.cs**: Automated integration into Full QC workflow
3. **DashboardState.cs**: Updated menu with new test options

## Requirements

### System Requirements
- Linux kernel 2.6+ (for `/sys` filesystem)
- Root or sudo access for some operations (optional, graceful degradation)

### Required Utilities
- `lsusb` (usually from `usbutils` package)
- `ip` (usually from `iproute2` package)
- `ethtool` (optional, for detailed Ethernet info)

### Installation
```bash
# Debian/Ubuntu
sudo apt install usbutils iproute2 ethtool

# RHEL/CentOS/Fedora
sudo dnf install usbutils iproute ethtool

# Arch Linux
sudo pacman -S usbutils iproute2 ethtool
```

## Error Handling

Both diagnostics include robust error handling:
- Graceful degradation if utilities are missing
- Timeout handling for device detection
- Non-fatal failures for permission issues
- Fallback methods for detection

## Examples

### Example: USB Test Output
```
═══ USB Port Testing ═══

Quick Check: ✓ USB OK: 4 ports detected (8 devices connected)

Run interactive USB port test? Yes

Prepare a USB flash drive or device for testing.

Testing USB 3.x Port 1/2...
Insert a USB device into USB 3.x Port #1... (15s timeout)
✓ Device detected: SanDisk Ultra USB 3.0

Testing USB 3.x Port 2/2...
Insert a USB device into USB 3.x Port #2... (15s timeout)
✓ Device detected: Kingston DataTraveler

═══ Test Results ═══

┌──────────────────┬──────────┬─────────┬──────────────────────────┐
│ Port             │ Type     │ Status  │ Device Detected          │
├──────────────────┼──────────┼─────────┼──────────────────────────┤
│ USB 3.x Port #1  │ USB 3.x  │ ✓ PASS  │ SanDisk Ultra USB 3.0    │
│ USB 3.x Port #2  │ USB 3.x  │ ✓ PASS  │ Kingston DataTraveler    │
└──────────────────┴──────────┴─────────┴──────────────────────────┘

Summary: 2/2 ports working
Overall: All ports working
```

### Example: Ethernet Test Output
```
═══ Ethernet Testing ═══

Quick Check: ✓ Ethernet OK: enp0s3 @ 1000Mb/s

Select test type:
> Quick Scan
  Full Interactive Test
  Cancel

Testing enp0s3:
  MAC: 08:00:27:12:34:56
  Link Speed: 1000Mb/s
  Duplex: full
  Cable: Connected
  Status: UP
  IP: 192.168.1.100

═══ Test Results ═══

┌───────────┬───────────────────┬────────────┬───────────┬────────┬───────────────┐
│ Interface │ MAC Address       │ Link Speed │ Cable     │ Status │ IP Address    │
├───────────┼───────────────────┼────────────┼───────────┼────────┼───────────────┤
│ enp0s3    │ 08:00:27:12:34:56 │ 1000Mb/s   │ Connected │ UP     │ 192.168.1.100 │
└───────────┴───────────────────┴────────────┴───────────┴────────┴───────────────┘

Summary: 1/1 Ethernet ports connected
Overall: Ethernet functional
```

## Troubleshooting

### USB Tests

**Problem**: No USB ports detected
- **Solution**: Check if `lsusb` is installed and USB subsystem is enabled in kernel

**Problem**: Device detection timeout
- **Solution**: 
  - Ensure USB device is working
  - Try a different USB device
  - Check dmesg for kernel errors: `dmesg | grep usb`

### Ethernet Tests

**Problem**: No Ethernet interfaces detected
- **Solution**: 
  - Check if network drivers are loaded: `lsmod | grep eth`
  - Verify physical Ethernet port exists

**Problem**: Link speed shows "Unknown"
- **Solution**: 
  - Install `ethtool`: `sudo apt install ethtool`
  - Run with sudo: `sudo pramaan --test-ethernet`

**Problem**: Cable detected but no IP address
- **Solution**: 
  - Check DHCP client is running
  - Manually configure IP if needed
  - Verify network cable is properly seated

## Future Enhancements

Potential improvements:
- [ ] USB speed test (read/write benchmarks)
- [ ] Advanced Ethernet diagnostics (packet loss, jitter)
- [ ] Support for multiple Ethernet adapters
- [ ] Automated USB device selection for testing
- [ ] Network security scanning
- [ ] Wake-on-LAN testing
