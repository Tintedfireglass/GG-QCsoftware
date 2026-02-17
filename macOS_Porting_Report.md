# macOS Porting Report — PRAMANA™ QC Tool

> **Prepared:** February 2026  
> **Current Platform:** Windows (.NET 8 / WPF)  
> **Target Platform:** macOS (Apple Silicon + Intel)

---

## Executive Summary

The PRAMANA™ QC tool is a Windows desktop application built with **C# / .NET 8 / WPF**. Porting to macOS requires replacing the **UI framework** (WPF is Windows-only), swapping several **Windows-specific hardware APIs** (WMI, DirectX, winmm.dll, etc.), and adjusting the **build, packaging, and privilege escalation** pipeline. The core business logic and most service-layer code can be reused with minimal changes.

> [!IMPORTANT]
> The two highest-effort items are the **UI rewrite** (WPF → cross-platform framework) and the **hardware provider replacements** (WMI → macOS system commands / IOKit).

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────┐
│  LaptopQC.App  (WPF UI — Windows Only ❌)        │
│  ├── Views/         (XAML windows)                │
│  ├── ViewModels/    (MVVM — mostly portable ✅)   │
│  └── Converters/    (WPF converters — ❌)         │
├──────────────────────────────────────────────────┤
│  LaptopQC.Core  (Business Logic — Partially ✅)  │
│  ├── Diagnostics/   (mixed portability)           │
│  ├── Services/      (mostly portable ✅)          │
│  └── Models/        (fully portable ✅)           │
├──────────────────────────────────────────────────┤
│  LaptopQC.Hardware  (Hardware Layer — ❌)         │
│  ├── SensorProvider (LibreHardwareMonitor)        │
│  ├── WmiProvider    (Windows WMI)                 │
│  └── SmartctlProvider (smartctl.exe wrapper)      │
└──────────────────────────────────────────────────┘
```

---

## 2. Windows-Only Dependencies & macOS Replacements

### 2.1 UI Framework — WPF → Cross-Platform

| Current | macOS Replacement | Notes |
|---|---|---|
| **WPF** (`net8.0-windows`, UseWPF) | **.NET MAUI** or **Avalonia UI** | Avalonia is recommended — it's the most mature cross-platform .NET UI with native macOS support, XAML-based (easier migration from WPF), and already listed in the project README. MAUI has weaker macOS support (Catalyst). |

**What changes:**
- All `.xaml` files (6 windows + MainWindow) must be converted to Avalonia XAML (syntax is similar but uses `xmlns:x` differently, different control names)
- Code-behind files (`.xaml.cs`) need minor adjustments
- WPF-specific converters in `Converters/` need Avalonia equivalents
- `CommunityToolkit.Mvvm` **works as-is** on Avalonia ✅

**Migration effort:** 🔴 **High** — 6 windows × XAML + code-behind rewrites

---

### 2.2 Hardware Detection — WMI → macOS System Commands

| Current (Windows) | macOS Replacement | Effort |
|---|---|---|
| `System.Management` (WMI) — `WmiProvider.cs` | `system_profiler`, `ioreg`, `sysctl` CLI commands | 🔴 High |
| `Win32_Battery` | `system_profiler SPPowerDataType` | 🟡 Medium |
| `Win32_Processor` | `sysctl -n hw.ncpu`, `system_profiler SPHardwareDataType` | 🟡 Medium |
| `Win32_VideoController` | `system_profiler SPDisplaysDataType` | 🟡 Medium |
| `Win32_DiskDrive` | `diskutil list`, `system_profiler SPStorageDataType` | 🟡 Medium |
| `Win32_Keyboard` / `Win32_PointingDevice` | `system_profiler SPUSBDataType`, `ioreg` | 🟡 Medium |
| `Win32_NetworkAdapter` | `system_profiler SPNetworkDataType`, `networksetup` | 🟢 Low |
| `Win32_PnPEntity` (USB devices) | `system_profiler SPUSBDataType`, `ioreg` | 🟡 Medium |
| `Win32_DesktopMonitor` | `system_profiler SPDisplaysDataType` | 🟢 Low |
| `Win32_SoundDevice` | `system_profiler SPAudioDataType` | 🟢 Low |

**Recommended approach:** Create a new `MacSystemInfoProvider.cs` that parses the JSON output of `system_profiler -json` (macOS supports `-json` flag), replacing all WMI queries with one unified data source.

```bash
# Example: Get all hardware info from macOS in JSON
system_profiler -json SPHardwareDataType SPPowerDataType SPStorageDataType \
  SPDisplaysDataType SPNetworkDataType SPAudioDataType SPUSBDataType
```

---

### 2.3 Sensor Monitoring — LibreHardwareMonitor → macOS Alternatives

| Current | macOS Replacement | Notes |
|---|---|---|
| `LibreHardwareMonitorLib` (CPU temp, GPU temp, load, clocks, battery) | **macOS SMC** via `sudo powermetrics` or open-source `osx-cpu-temp` / `smckit` | LibreHardwareMonitor is Windows-only |
| `System.Diagnostics.PerformanceCounter` | `top`, `ps`, `vm_stat`, `sysctl` | Windows-only counter API |

**macOS commands for sensor data:**
```bash
# CPU temperature (requires sudo)
sudo powermetrics --samplers smc -i 1000 -n 1

# CPU usage
top -l 1 -n 0 | grep "CPU usage"

# Memory pressure  
vm_stat

# GPU info (for discrete GPUs)
system_profiler SPDisplaysDataType

# Battery
pmset -g batt
ioreg -l -w0 | grep -E '"(MaxCapacity|DesignCapacity|CycleCount|Temperature)"'
```

**Migration effort:** 🔴 **High** — Requires a full rewrite of `SensorProvider.cs`

---

### 2.4 GPU Stress Test — DirectX → Metal

| Current | macOS Replacement | Notes |
|---|---|---|
| **SharpDX** (DirectX 11) — 4 NuGet packages | **Metal via MetalKit** (native macOS GPU API) or **Veldrid** (cross-platform GPU abstraction for .NET) | SharpDX/DirectX is Windows-only |

**Options:**
1. **Veldrid** (recommended) — Cross-platform .NET graphics library that supports Metal on macOS, Vulkan on Linux, and D3D11 on Windows. Can write GPU stress code once.
2. **Native Metal** — Use Xamarin.Mac / .NET MAUI Mac Catalyst bindings to call Metal APIs directly. More complex.
3. **OpenCL compute** — Use OpenCL via P/Invoke for GPU stress workloads without rendering.

**Migration effort:** 🔴 **High** — `GpuStressTest.cs` (465 lines) needs full rewrite

---

### 2.5 Audio/Video Testing

| Current | macOS Replacement | Notes |
|---|---|---|
| `System.Speech.Synthesis` (TTS) | `NSSpeechSynthesizer` via .NET binding or `say` CLI command | macOS's `say` command is simpler |
| `winmm.dll` P/Invoke (MCI audio recording) | `AVAudioRecorder` via binding or `sox` / `ffmpeg` CLI | Complete rewrite needed |
| `explorer.exe microsoft.windows.camera:` (camera launch) | `open -a "Photo Booth"` or `open -a FaceTime` | Simple string swap |

**macOS TTS example:**
```bash
say "Testing Left Speaker"
```

**macOS mic recording example:**
```bash
# Using sox (installable via brew)
sox -d recording.wav trim 0 5   # Record 5 seconds

# Using ffmpeg
ffmpeg -f avfoundation -i ":0" -t 5 recording.wav
```

**Migration effort:** 🟡 **Medium** — `AudioVideoTestService.cs` rewrite

---

### 2.6 SMART Diagnostics — smartctl

| Current | macOS Replacement | Notes |
|---|---|---|
| `smartctl.exe` (Windows binary) | `smartctl` (macOS binary from Homebrew) | Same tool, different binary |

`smartctl` is cross-platform. The `SmartctlProvider.cs` wrapper needs minor changes:

```diff
- Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools", "smartctl.exe")
+ Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tools", "smartctl")

- @"C:\Program Files\smartmontools\bin\smartctl.exe"
+ "/usr/local/bin/smartctl"        // Intel Mac Homebrew
+ "/opt/homebrew/bin/smartctl"     // Apple Silicon Homebrew

- RunCommand("where", "smartctl.exe")
+ RunCommand("which", "smartctl")
```

**Migration effort:** 🟢 **Low** — Path changes only. Bundle the macOS `smartctl` binary instead.

---

### 2.7 Privilege Escalation

| Current | macOS Replacement | Notes |
|---|---|---|
| `app.manifest` → `requireAdministrator` | `osascript -e 'do shell script "..." with administrator privileges'` or `sudo` prompting | macOS has no UAC manifest equivalent |

On macOS, apps that need root access (for sensor reading, SMART, etc.) typically:
1. Use `AuthorizationServices` framework to prompt for admin credentials
2. Install a **privileged helper tool** via `SMJobBless` (Apple-recommended)
3. Or simply run individual commands with `sudo` (simpler but less polished)

**Migration effort:** 🟡 **Medium**

---

### 2.8 Build & Packaging

| Current | macOS Replacement |
|---|---|
| `publish.bat` (batch script) | `publish.sh` (shell script) |
| `dotnet publish -r win-x64` | `dotnet publish -r osx-arm64` (Apple Silicon) or `osx-x64` (Intel) |
| Inno Setup installer (`.exe`) | **DMG** bundle or **PKG** installer |
| Single-file `.exe` | `.app` bundle (standard macOS application format) |

**macOS publish command:**
```bash
dotnet publish -c Release -r osx-arm64 --self-contained true \
  -p:PublishSingleFile=true -o ./publish
```

**Creating a .app bundle:**
- Use `dotnet-msbuild` with `CFBundleName`, `CFBundleIdentifier` in an `Info.plist`
- Or use a tool like **create-dmg** to package into a `.dmg`

**Migration effort:** 🟡 **Medium**

---

## 3. File-by-File Portability Assessment

### Fully Portable ✅ (No changes needed)
| File | Layer |
|---|---|
| `Models/QCReport.cs` | Core |
| `Models/ApiConfiguration.cs` | Core |
| `Models/ApiDtos.cs` | Core |
| `Services/AuthService.cs` | Core |
| `Services/DeviceIdService.cs` | Core |
| `Services/QCSubmissionService.cs` | Core |
| `Services/ReportGenerator.cs` | Core |
| `Hardware/Models/*.cs` (all 4 files) | Hardware |

### Partially Portable 🟡 (Minor changes)
| File | Changes Needed |
|---|---|
| `SmartctlProvider.cs` | Change file paths and `where` → `which` |
| `Services/QCWorkflowService.cs` | May reference WPF dispatcher or Windows paths |
| `Diagnostics/SmartTestService.cs` | Uses SmartctlProvider (inherits its changes) |
| `Diagnostics/StorageDiagnostic.cs` | WMI queries → `diskutil` |
| `Diagnostics/RamDiagnostic.cs` | WMI queries → `sysctl hw.memsize` |
| `Diagnostics/CpuDiagnostic.cs` | WMI queries → `sysctl` |
| `Diagnostics/SystemDiagnostic.cs` | WMI queries → `system_profiler` |

### Requires Full Rewrite 🔴 (Windows-only APIs)
| File | Reason |
|---|---|
| `WmiProvider.cs` | WMI is Windows-only |
| `SensorProvider.cs` | LibreHardwareMonitor is Windows-only |
| `GpuStressTest.cs` | SharpDX / DirectX is Windows-only |
| `AudioVideoTestService.cs` | System.Speech + winmm.dll P/Invoke |
| `DeviceDiagnostic.cs` | Deeply coupled to WMI queries |
| `CpuStressTest.cs` | WMI clock speed query (stress logic itself is portable) |
| `InputTestService.cs` | Uses Windows virtual key codes |
| `BatteryDiagnostic.cs` | WMI battery queries |
| `ThermalThrottleDetector.cs` | PerformanceCounter + SensorProvider |
| All `.xaml` / `.xaml.cs` files | WPF is Windows-only |

---

## 4. Recommended Porting Strategy

### Option A — Cross-Platform Rewrite with Avalonia UI (Recommended)

```mermaid
graph LR
    A["Current: WPF + WMI + DirectX"] --> B["Phase 1: Shared Core"]
    B --> C["Phase 2: Avalonia UI"]
    C --> D["Phase 3: macOS Providers"]
    D --> E["Phase 4: Package & Distribute"]
```

**Phase 1 — Abstract Hardware Layer (1–2 weeks)**
- Define `IHardwareProvider`, `ISensorProvider`, `ISystemInfoProvider` interfaces
- Move current Windows implementations behind these interfaces
- Use dependency injection to swap implementations per platform

**Phase 2 — Migrate UI to Avalonia (2–3 weeks)**
- Replace `LaptopQC.App` WPF project with Avalonia project
- Convert all 6 XAML windows + MainWindow to Avalonia XAML
- ViewModels stay almost the same (CommunityToolkit.Mvvm works on Avalonia)

**Phase 3 — Implement macOS Providers (2–3 weeks)**
- Create `MacSystemInfoProvider` (replaces WMI with `system_profiler -json`)
- Create `MacSensorProvider` (uses `powermetrics`, `ioreg`, `sysctl`)
- Create `MacAudioTestService` (uses `say` + `sox` or `ffmpeg`)
- Port GPU stress test to Veldrid (or skip GPU stress on macOS if not needed)
- Adjust smartctl paths

**Phase 4 — macOS Packaging (1 week)**
- Create `.app` bundle with `Info.plist`
- Bundle macOS smartctl binary
- Create `.dmg` installer
- Handle code signing + notarization for macOS Gatekeeper

**Total estimate: 6–9 weeks** for one developer

---

### Option B — Separate macOS App (Simpler but more maintenance)

Build a standalone macOS app in **Swift/SwiftUI** that replicates the QC workflow but uses native Apple frameworks (IOKit, Metal, AVFoundation). Share only the backend API communication and report format.

**Pros:** Fully native macOS experience, easier Apple Silicon optimization  
**Cons:** Two codebases to maintain, no shared logic

**Total estimate: 8–12 weeks**

---

## 5. macOS-Specific Considerations

### Apple Silicon vs Intel
- Must publish for both `osx-arm64` (M1/M2/M3) and `osx-x64` (Intel)
- Or create a **universal binary** using `lipo` to combine both architectures
- All external tools (smartctl, sox, etc.) also need ARM64 versions

### Code Signing & Notarization
- macOS **Gatekeeper** blocks unsigned apps — you MUST sign the app
- Requires an **Apple Developer account** ($99/year)
- Process: `codesign` → `notarytool` → `stapler`
- Without this, users get "cannot be opened because the developer cannot be verified"

### macOS Privacy Permissions (TCC)
- **Camera access** — requires `NSCameraUsageDescription` in `Info.plist`
- **Microphone access** — requires `NSMicrophoneUsageDescription`
- **Disk access** — may need "Full Disk Access" for SMART data on some drives
- **Input monitoring** — keyboard/trackpad testing may need "Input Monitoring" permission

### Sandbox Restrictions
- macOS App Store apps are sandboxed — limits hardware access
- For full QC functionality, distribute **outside the App Store** (direct download)

---

## 6. Third-Party Tool Availability on macOS

| Tool | macOS Availability | Install Method |
|---|---|---|
| `smartctl` (smartmontools) | ✅ Available | `brew install smartmontools` |
| `sox` (audio recording) | ✅ Available | `brew install sox` |
| `ffmpeg` (audio/video) | ✅ Available | `brew install ffmpeg` |
| LibreHardwareMonitor | ❌ Windows-only | Use `powermetrics` / `ioreg` |
| SharpDX | ❌ Windows-only | Use Veldrid (Metal backend) |
| Inno Setup | ❌ Windows-only | Use `create-dmg` or `productbuild` |

---

## 7. Quick Start Checklist

- [ ] Set up macOS development machine (or VM — note: macOS VMs on non-Apple hardware violate Apple's EULA)
- [ ] Install .NET 8 SDK for macOS (`dotnet-install.sh`)
- [ ] Install Homebrew + smartmontools + sox
- [ ] Define hardware provider interfaces (`IWmiProvider`, `ISensorProvider`)
- [ ] Implement `MacSystemInfoProvider` using `system_profiler -json`
- [ ] Implement `MacSensorProvider` using `powermetrics` / `ioreg`
- [ ] Set up Avalonia UI project and migrate XAML views
- [ ] Replace audio test with `say` + `sox`
- [ ] Port or skip GPU stress test (Metal / Veldrid)
- [ ] Update smartctl paths for macOS
- [ ] Implement macOS privilege escalation (AuthorizationServices or sudo)
- [ ] Create `.app` bundle with `Info.plist`
- [ ] Package as `.dmg`
- [ ] Apple Developer Program enrollment
- [ ] Code sign + notarize the app
- [ ] Test on both Intel Mac and Apple Silicon Mac

---

## 8. Risk Summary

| Risk | Impact | Mitigation |
|---|---|---|
| LibreHardwareMonitor has no macOS equivalent | 🔴 High | Use `powermetrics` + `ioreg` (less data granularity) |
| GPU stress test using Metal is complex | 🟡 Medium | Use Veldrid or skip GPU stress for v1 macOS release |
| Apple code signing costs $99/yr | 🟢 Low | Required — budget for it |
| macOS privacy permissions block tests | 🟡 Medium | Add all required `Info.plist` keys and instruct users to grant permissions |
| Hardware access needs root on macOS | 🟡 Medium | Use privileged helper tool (`SMJobBless`) for production quality |
| Some WMI data has no direct macOS equivalent | 🟡 Medium | May lose some granularity (e.g., USB controller details) |

---

> [!TIP]
> **Recommended first step:** Start with **Phase 1** — abstracting the hardware layer behind interfaces. This makes the codebase cross-platform ready without breaking the existing Windows app, and lets you work on the macOS providers in parallel.
