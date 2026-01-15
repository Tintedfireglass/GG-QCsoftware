using System.Windows;
using System.Windows.Input;
using LaptopQC.App.ViewModels;

namespace LaptopQC.App.Views;

/// <summary>
/// Keyboard test window - captures all key presses for testing
/// </summary>
public partial class KeyboardTestWindow : Window
{
    private KeyboardTestViewModel ViewModel => (KeyboardTestViewModel)DataContext;

    public KeyboardTestWindow()
    {
        InitializeComponent();
        
        // Subscribe to completion
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(KeyboardTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                DialogResult = ViewModel.Passed;
                Close();
            }
        };
    }

    /// <summary>
    /// Handle key down events
    /// </summary>
    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        HandleKeyPress(e);
    }

    /// <summary>
    /// Preview key down to capture system keys like Tab, Enter, etc.
    /// </summary>
    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        HandleKeyPress(e);
        
        // Mark as handled to prevent default behavior for navigation/system keys
        if (e.Key == Key.Tab || e.Key == Key.Enter || e.Key == Key.Space ||
            e.Key == Key.LWin || e.Key == Key.RWin)
        {
            e.Handled = true;
        }
    }

    private void HandleKeyPress(KeyEventArgs e)
    {
        // Get the actual key - handle special cases for modifier keys
        Key key = e.Key;
        
        // For DeadCharProcessed or ImeProcessed, use the actual key
        if (key == Key.DeadCharProcessed || key == Key.ImeProcessed)
        {
            key = e.DeadCharProcessedKey;
        }
        
        // For System key (Alt combinations)
        if (key == Key.System)
        {
            key = e.SystemKey;
        }
        
        // Convert WPF Key to virtual key code
        int virtualKeyCode = KeyInterop.VirtualKeyFromKey(key);

        if (virtualKeyCode > 0)
        {
            ViewModel.RegisterKeyPress(virtualKeyCode);
        }
        
        // Also check modifier keys directly since they may not trigger as main key
        CheckModifierKeys();
    }
    
    private void CheckModifierKeys()
    {
        // Generic modifier codes for LEFT side keys (matches ViewModel)
        // VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12
        
        // Left Shift registers as generic VK_SHIFT
        if (Keyboard.IsKeyDown(Key.LeftShift))
            ViewModel.RegisterKeyPress(0x10);
        // Right Shift also registers as generic (no separate right shift key in layout)
        if (Keyboard.IsKeyDown(Key.RightShift))
            ViewModel.RegisterKeyPress(0x10);
            
        // Left Ctrl registers as generic VK_CONTROL
        if (Keyboard.IsKeyDown(Key.LeftCtrl))
            ViewModel.RegisterKeyPress(0x11);
        // Right Ctrl registers as VK_RCONTROL (0xA3) - separate key in layout
        if (Keyboard.IsKeyDown(Key.RightCtrl))
            ViewModel.RegisterKeyPress(0xA3);
            
        // Left Alt registers as generic VK_MENU
        if (Keyboard.IsKeyDown(Key.LeftAlt))
            ViewModel.RegisterKeyPress(0x12);
        // Right Alt registers as VK_RMENU (0xA5) - separate key in layout
        if (Keyboard.IsKeyDown(Key.RightAlt))
            ViewModel.RegisterKeyPress(0xA5);
    }

    /// <summary>
    /// Gets the test result
    /// </summary>
    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}
