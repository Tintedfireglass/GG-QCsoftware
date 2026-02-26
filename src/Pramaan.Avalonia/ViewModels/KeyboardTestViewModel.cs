using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;
using System.Collections.ObjectModel;

namespace Pramaan.Avalonia.ViewModels;

/// <summary>
/// ViewModel for the keyboard test window
/// </summary>
public partial class KeyboardTestViewModel : ObservableObject
{
    private readonly InputTestService.KeyboardTestState _testState;

    [ObservableProperty]
    private double _progressPercent;

    [ObservableProperty]
    private string _progressText = "0% tested";

    [ObservableProperty]
    private string _instructions = "Press each key to test. Keys will light up when detected.";

    [ObservableProperty]
    private bool _isComplete;

    [ObservableProperty]
    private bool _passed;

    [ObservableProperty]
    private bool _showNumpad;

    [ObservableProperty]
    private string _resultMessage = "";



    /// <summary>
    /// Observable collection of key states for UI binding
    /// </summary>
    public ObservableCollection<KeyState> Keys { get; } = new();

    /// <summary>
    /// Dictionary for quick lookup of key states by virtual key code
    /// </summary>
    private readonly Dictionary<int, KeyState> _keyLookup = new();

    public KeyboardTestViewModel()
    {
        _testState = new InputTestService.KeyboardTestState();
        InitializeKeyboard();
    }

    /// <summary>
    /// Toggle Numpad visibility and update test requirements
    /// </summary>
    partial void OnShowNumpadChanged(bool value)
    {
        _testState.ResetExpectedKeys(value);
        InitializeKeyboard();
        
        // Refresh progress based on new total key count
        ProgressPercent = _testState.PercentComplete;
        var tested = _testState.TestedKeys.Intersect(_testState.ExpectedKeys).Count();
        ProgressText = $"{ProgressPercent:F0}% tested ({tested}/{_testState.ExpectedKeys.Count} keys)";
    }

    /// <summary>
    /// Initialize all keyboard keys with their positions and labels
    /// </summary>
    private void InitializeKeyboard()
    {
        Keys.Clear();
        _keyLookup.Clear();

        // Row 0: Function keys
        // Row 0: Function keys
        AddKey(0x1B, "Esc", 0, 0);
        AddKey(0x70, "F1", 0, 2);
        AddKey(0x71, "F2", 0, 3);
        AddKey(0x72, "F3", 0, 4);
        AddKey(0x73, "F4", 0, 5);
        AddKey(0x74, "F5", 0, 7);
        AddKey(0x75, "F6", 0, 8);
        AddKey(0x76, "F7", 0, 9);
        AddKey(0x77, "F8", 0, 10);
        AddKey(0x78, "F9", 0, 12);
        AddKey(0x79, "F10", 0, 13);
        AddKey(0x7A, "F11", 0, 14);
        AddKey(0x7B, "F12", 0, 15);

        // Row 1: Number row
        AddKey(0xC0, "`", 1, 0);
        AddKey(0x31, "1", 1, 1);
        AddKey(0x32, "2", 1, 2);
        AddKey(0x33, "3", 1, 3);
        AddKey(0x34, "4", 1, 4);
        AddKey(0x35, "5", 1, 5);
        AddKey(0x36, "6", 1, 6);
        AddKey(0x37, "7", 1, 7);
        AddKey(0x38, "8", 1, 8);
        AddKey(0x39, "9", 1, 9);
        AddKey(0x30, "0", 1, 10);
        AddKey(0xBD, "-", 1, 11);
        AddKey(0xBB, "=", 1, 12);
        AddKey(0x08, "Backspace", 1, 13, 2);  // Wide key

        // Row 2: QWERTY row
        AddKey(0x09, "Tab", 2, 0, 1.5);
        AddKey(0x51, "Q", 2, 1.5);
        AddKey(0x57, "W", 2, 2.5);
        AddKey(0x45, "E", 2, 3.5);
        AddKey(0x52, "R", 2, 4.5);
        AddKey(0x54, "T", 2, 5.5);
        AddKey(0x59, "Y", 2, 6.5);
        AddKey(0x55, "U", 2, 7.5);
        AddKey(0x49, "I", 2, 8.5);
        AddKey(0x4F, "O", 2, 9.5);
        AddKey(0x50, "P", 2, 10.5);
        AddKey(0xDB, "[", 2, 11.5);
        AddKey(0xDD, "]", 2, 12.5);
        AddKey(0xDC, "\\", 2, 13.5, 1.5);

        // Row 3: ASDF row
        AddKey(0x14, "Caps", 3, 0, 1.75);
        AddKey(0x41, "A", 3, 1.75);
        AddKey(0x53, "S", 3, 2.75);
        AddKey(0x44, "D", 3, 3.75);
        AddKey(0x46, "F", 3, 4.75);
        AddKey(0x47, "G", 3, 5.75);
        AddKey(0x48, "H", 3, 6.75);
        AddKey(0x4A, "J", 3, 7.75);
        AddKey(0x4B, "K", 3, 8.75);
        AddKey(0x4C, "L", 3, 9.75);
        AddKey(0xBA, ";", 3, 10.75);
        AddKey(0xDE, "'", 3, 11.75);
        AddKey(0x0D, "Enter", 3, 12.75, 2.25);

        // Row 4: ZXCV row
        AddKey(0x10, "Shift", 4, 0, 2.25);  // Left Shift
        AddKey(0x5A, "Z", 4, 2.25);
        AddKey(0x58, "X", 4, 3.25);
        AddKey(0x43, "C", 4, 4.25);
        AddKey(0x56, "V", 4, 5.25);
        AddKey(0x42, "B", 4, 6.25);
        AddKey(0x4E, "N", 4, 7.25);
        AddKey(0x4D, "M", 4, 8.25);
        AddKey(0xBC, ",", 4, 9.25);
        AddKey(0xBE, ".", 4, 10.25);
        AddKey(0xBF, "/", 4, 11.25);
        // Right shift would be 4, 12.25, 2.75 but we only track one Shift

        // Row 5: Bottom row (Note: Fn key cannot be detected - it's hardware-level)
        AddKey(0x11, "Ctrl", 5, 0, 1.25);  // Left Ctrl
        AddKey(0x5B, "Win", 5, 1.25, 1.25);
        AddKey(0x12, "Alt", 5, 2.5, 1.25);  // Left Alt
        AddKey(0x20, "Space", 5, 3.75, 6);  // Spacebar
        AddKey(0xA5, "Alt", 5, 9.75, 1.25);  // Right Alt (VK_RMENU)
        AddKey(0xA3, "Ctrl", 5, 11, 1.25);  // Right Ctrl (VK_RCONTROL)

        // Arrow keys
        AddKey(0x25, "â†", 5, 12.25);
        AddKey(0x26, "â†‘", 5, 13.25);
        AddKey(0x28, "â†“", 5, 14.25);
        AddKey(0x27, "â†’", 5, 15.25);

        if (ShowNumpad)
        {
            // Numpad starts around column 16.5
            double npStart = 16.5;

            // Row 0
            AddKey(0x90, "Num", 0, npStart);
            AddKey(0x6F, "/", 0, npStart + 1);
            AddKey(0x6A, "*", 0, npStart + 2);
            AddKey(0x6D, "-", 0, npStart + 3);

            // Row 1
            AddKey(0x67, "7", 1, npStart);
            AddKey(0x68, "8", 1, npStart + 1);
            AddKey(0x69, "9", 1, npStart + 2);
            AddKey(0x6B, "+", 1, npStart + 3, 1); // + spans 2 rows usually but let's keep it simple grid for now or use Height

            // Row 2
            AddKey(0x64, "4", 2, npStart);
            AddKey(0x65, "5", 2, npStart + 1);
            AddKey(0x66, "6", 2, npStart + 2);
            // + continues

            // Row 3
            AddKey(0x61, "1", 3, npStart);
            AddKey(0x62, "2", 3, npStart + 1);
            AddKey(0x63, "3", 3, npStart + 2);
            // Enter spans 2 rows

            // Row 4
            AddKey(0x60, "0", 4, npStart, 2);
            AddKey(0x6E, ".", 4, npStart + 2);
            // Enter continues
        }
    }

    private void AddKey(int virtualKeyCode, string label, int row, double column, double width = 1)
    {
        var keyState = new KeyState
        {
            VirtualKeyCode = virtualKeyCode,
            Label = label,
            Row = row,
            Column = column,
            Width = width,
            IsTested = false
        };

        Keys.Add(keyState);
        _keyLookup[virtualKeyCode] = keyState;
    }

    /// <summary>
    /// Called when a key is pressed
    /// </summary>
    public void RegisterKeyPress(int virtualKeyCode)
    {
        // Update test state
        _testState.RegisterKeyPress(virtualKeyCode);

        // Update UI if this key is in our layout
        if (_keyLookup.TryGetValue(virtualKeyCode, out var keyState))
        {
            keyState.IsTested = true;
        }

        // Update progress
        ProgressPercent = _testState.PercentComplete;
        ProgressText = $"{ProgressPercent:F0}% tested ({_testState.TestedKeys.Intersect(_testState.ExpectedKeys).Count()}/{_testState.ExpectedKeys.Count} keys)";

        // Check if all required keys are tested
        if (ProgressPercent >= 100)
        {
            Instructions = "âœ“ All keys tested! Click Complete to finish.";
        }
        else if (ProgressPercent >= 95)
        {
            Instructions = "Almost done! A few more keys to test.";
        }
    }

    /// <summary>
    /// Complete the test and get results
    /// </summary>
    [RelayCommand]
    private void CompleteTest()
    {
        var result = _testState.GetResult();
        Passed = result.Passed;
        ResultMessage = result.Message;
        IsComplete = true;

        if (!Passed && result.FailedItems.Count > 0)
        {
            ResultMessage += $" (Missing: {string.Join(", ", result.FailedItems.Take(10))})";
        }
    }

    /// <summary>
    /// Cancel the test
    /// </summary>
    [RelayCommand]
    private void CancelTest()
    {
        Passed = false;
        ResultMessage = "Test cancelled";
        IsComplete = true;
    }
}

/// <summary>
/// Represents the state of a single keyboard key
/// </summary>
public partial class KeyState : ObservableObject
{
    public int VirtualKeyCode { get; set; }
    public string Label { get; set; } = "";
    public int Row { get; set; }
    public double Column { get; set; }
    public double Width { get; set; } = 1;

    [ObservableProperty]
    private bool _isTested;
}


