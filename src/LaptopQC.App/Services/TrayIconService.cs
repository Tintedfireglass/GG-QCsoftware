using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using LaptopQC.App.Branding;

namespace LaptopQC.App.Services;

/// <summary>
/// Manages a Windows system tray icon for background/silent mode.
/// Implemented via Shell_NotifyIcon Win32 P/Invoke — no WinForms dependency needed,
/// which avoids namespace collisions with WPF types.
/// Provides a right-click context menu with "Open Pramaan" and "Exit" actions.
/// </summary>
public sealed class TrayIconService : IDisposable
{
    // ── Win32 P/Invoke ────────────────────────────────────────────────────────

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern bool Shell_NotifyIcon(uint dwMessage, ref NOTIFYICONDATA lpdata);

    [DllImport("user32.dll")]
    private static extern IntPtr CreatePopupMenu();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool AppendMenu(IntPtr hMenu, uint uFlags, IntPtr uIDNewItem, string? lpNewItem);

    [DllImport("user32.dll")]
    private static extern bool DestroyMenu(IntPtr hMenu);

    [DllImport("user32.dll")]
    private static extern int TrackPopupMenuEx(IntPtr hmenu, uint fuFlags, int x, int y, IntPtr hwnd, IntPtr lptpm);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr LoadImage(IntPtr hInst, string name, uint type, int cx, int cy, uint fuLoad);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct NOTIFYICONDATA
    {
        public uint cbSize;
        public IntPtr hWnd;
        public uint uID;
        public uint uFlags;
        public uint uCallbackMessage;
        public IntPtr hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szTip;
        public uint dwState;
        public uint dwStateMask;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szInfo;
        public uint uTimeoutOrVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string szInfoTitle;
        public uint dwInfoFlags;
        public Guid guidItem;
        public IntPtr hBalloonIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    private const uint NIM_ADD    = 0x00000000;
    private const uint NIM_MODIFY = 0x00000001;
    private const uint NIM_DELETE = 0x00000002;
    private const uint NIF_MESSAGE = 0x00000001;
    private const uint NIF_ICON   = 0x00000002;
    private const uint NIF_TIP    = 0x00000004;
    private const uint WM_APP_TRAY = 0x8001;
    private const uint WM_RBUTTONUP = 0x0205;
    private const uint WM_LBUTTONDBLCLK = 0x0203;
    private const uint IMAGE_ICON = 1;
    private const uint LR_LOADFROMFILE = 0x00000010;
    private const uint MF_STRING = 0x00000000;
    private const uint MF_SEPARATOR = 0x00000800;
    private const uint TPM_RETURNCMD = 0x0100;
    private const uint TPM_RIGHTALIGN = 0x0008;
    private const int  CMD_OPEN = 1;
    private const int  CMD_EXIT = 2;

    // ── State ─────────────────────────────────────────────────────────────────

    private readonly System.Windows.Application _wpfApp;
    private readonly HwndSource _hwndSource;
    private readonly IntPtr _hwnd;
    private IntPtr _hIcon;
    private bool _disposed;

    public TrayIconService(System.Windows.Application wpfApp)
    {
        _wpfApp = wpfApp;

        // Create an invisible WPF window to get a message-loop HWND
        var helperWindow = new Window
        {
            Width = 0, Height = 0,
            WindowStyle = WindowStyle.None,
            ShowInTaskbar = false,
            Visibility = Visibility.Hidden,
            ResizeMode = ResizeMode.NoResize
        };
        helperWindow.Show();
        helperWindow.Hide();

        _hwndSource = HwndSource.FromVisual(helperWindow) as HwndSource
                      ?? throw new InvalidOperationException("Could not obtain HWND for tray helper window.");
        _hwnd = _hwndSource.Handle;
        _hwndSource.AddHook(WndProc);

        // Load icon
        var iconPath = Path.Combine(AppContext.BaseDirectory, BrandInfo.TrayIconRelativePath);
        if (File.Exists(iconPath))
            _hIcon = LoadImage(IntPtr.Zero, iconPath, IMAGE_ICON, 16, 16, LR_LOADFROMFILE);

        // Register the tray icon
        var data = BuildNotifyIconData($"{BrandInfo.AppDisplayName} \u2014 Running in Background");
        Shell_NotifyIcon(NIM_ADD, ref data);
    }

    private NOTIFYICONDATA BuildNotifyIconData(string tip)
    {
        return new NOTIFYICONDATA
        {
            cbSize = (uint)Marshal.SizeOf(typeof(NOTIFYICONDATA)),
            hWnd = _hwnd,
            uID = 1,
            uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP,
            uCallbackMessage = WM_APP_TRAY,
            hIcon = _hIcon,
            szTip = tip,
            szInfo = "",
            szInfoTitle = "",
            guidItem = Guid.Empty,
        };
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == (int)WM_APP_TRAY)
        {
            uint notifyMsg = (uint)(lParam.ToInt32() & 0xFFFF);

            if (notifyMsg == WM_RBUTTONUP)
            {
                ShowContextMenu();
                handled = true;
            }
            else if (notifyMsg == WM_LBUTTONDBLCLK)
            {
                LaunchFullUi();
                handled = true;
            }
        }
        return IntPtr.Zero;
    }

    private void ShowContextMenu()
    {
        GetCursorPos(out var pt);
        SetForegroundWindow(_hwnd);

        var hMenu = CreatePopupMenu();
        AppendMenu(hMenu, MF_STRING, new IntPtr(CMD_OPEN), $"Open {BrandInfo.AppDisplayName}");
        AppendMenu(hMenu, MF_SEPARATOR, IntPtr.Zero, null);
        AppendMenu(hMenu, MF_STRING, new IntPtr(CMD_EXIT), "Exit");

        int cmd = TrackPopupMenuEx(hMenu, TPM_RETURNCMD | TPM_RIGHTALIGN, pt.X, pt.Y, _hwnd, IntPtr.Zero);
        DestroyMenu(hMenu);

        if (cmd == CMD_OPEN) LaunchFullUi();
        else if (cmd == CMD_EXIT) _wpfApp.Dispatcher.Invoke(() => { Dispose(); _wpfApp.Shutdown(); });
    }

    private static void LaunchFullUi()
    {
        var exePath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(exePath) && File.Exists(exePath))
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = exePath,
                UseShellExecute = true
            });
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        var data = BuildNotifyIconData("");
        Shell_NotifyIcon(NIM_DELETE, ref data);

        if (_hIcon != IntPtr.Zero)
        {
            DestroyIcon(_hIcon);
            _hIcon = IntPtr.Zero;
        }
    }
}
