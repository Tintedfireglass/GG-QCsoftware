using Avalonia.Controls;
using Avalonia.Input;
using Pramaan.Avalonia.ViewModels;

namespace Pramaan.Avalonia.Views;

public partial class KeyboardTestWindow : Window
{
    private KeyboardTestViewModel ViewModel => (KeyboardTestViewModel)DataContext!;

    public KeyboardTestWindow()
    {
        InitializeComponent();
        
        // Subscribe to completion
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(KeyboardTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                Close();
            }
        };
    }

    private void Window_KeyDown(object? sender, KeyEventArgs e)
    {
        HandleKeyPress(e);
    }

    private void HandleKeyPress(KeyEventArgs e)
    {
        int virtualKeyCode = GetVirtualKey(e.Key);

        if (virtualKeyCode > 0)
        {
            ViewModel.RegisterKeyPress(virtualKeyCode);
        }
        
        // Mark as handled to prevent default behavior for navigation/system keys
        if (e.Key == Key.Tab || e.Key == Key.Enter || e.Key == Key.Space ||
            e.Key == Key.LWin || e.Key == Key.RWin || 
            e.Key == Key.Left || e.Key == Key.Right || e.Key == Key.Up || e.Key == Key.Down)
        {
            e.Handled = true;
        }

        // Also check modifier keys directly since they may not trigger as main key
        CheckModifierKeys(e.KeyModifiers);
    }
    
    private void CheckModifierKeys(KeyModifiers modifiers)
    {
        // Generic modifier codes for LEFT side keys (matches ViewModel)
        // VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12
        
        if (modifiers.HasFlag(KeyModifiers.Shift))
            ViewModel.RegisterKeyPress(0x10);
            
        if (modifiers.HasFlag(KeyModifiers.Control))
            ViewModel.RegisterKeyPress(0x11);
            
        if (modifiers.HasFlag(KeyModifiers.Alt))
            ViewModel.RegisterKeyPress(0x12);
    }

    private int GetVirtualKey(Key key)
    {
        if (key >= Key.A && key <= Key.Z) return (int)key - (int)Key.A + 0x41;
        if (key >= Key.D0 && key <= Key.D9) return (int)key - (int)Key.D0 + 0x30;
        if (key >= Key.NumPad0 && key <= Key.NumPad9) return (int)key - (int)Key.NumPad0 + 0x60;
        if (key >= Key.F1 && key <= Key.F24) return (int)key - (int)Key.F1 + 0x70;
        
        return key switch {
            Key.Escape => 0x1B,
            Key.Back => 0x08, Key.Tab => 0x09, Key.Enter => 0x0D, Key.Space => 0x20,
            Key.LeftShift => 0x10, Key.RightShift => 0x10,
            Key.LeftCtrl => 0x11, Key.RightCtrl => 0xA3,
            Key.LeftAlt => 0x12, Key.RightAlt => 0xA5,
            Key.LWin => 0x5B, Key.RWin => 0x5C,
            Key.Left => 0x25, Key.Up => 0x26, Key.Right => 0x27, Key.Down => 0x28,
            Key.OemTilde => 0xC0, Key.OemMinus => 0xBD, Key.OemPlus => 0xBB,
            Key.OemOpenBrackets => 0xDB, Key.OemCloseBrackets => 0xDD, Key.OemPipe => 0xDC,
            Key.OemSemicolon => 0xBA, Key.OemQuotes => 0xDE,
            Key.OemComma => 0xBC, Key.OemPeriod => 0xBE, Key.OemQuestion => 0xBF,
            Key.Divide => 0x6F, Key.Multiply => 0x6A, Key.Subtract => 0x6D, Key.Add => 0x6B,
            Key.Decimal => 0x6E,
            Key.CapsLock => 0x14,
            Key.NumLock => 0x90,
            _ => 0
        };
    }

    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}
