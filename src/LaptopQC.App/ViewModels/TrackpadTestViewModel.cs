using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;

namespace LaptopQC.App.ViewModels;

/// <summary>
/// ViewModel for the trackpad test window
/// </summary>
public partial class TrackpadTestViewModel : ObservableObject
{
    private readonly InputTestService.TrackpadTestState _testState;

    [ObservableProperty]
    private double _progressPercent;

    [ObservableProperty]
    private string _progressText = "0% tested";

    [ObservableProperty]
    private string _instructions = "Move the cursor, click left/right buttons, and scroll to test all trackpad functions.";

    [ObservableProperty]
    private bool _isComplete;

    [ObservableProperty]
    private bool _passed;

    [ObservableProperty]
    private string _resultMessage = "";

    // Individual test status for UI display
    [ObservableProperty]
    private bool _movementTested;

    [ObservableProperty]
    private bool _leftClickTested;

    [ObservableProperty]
    private bool _rightClickTested;

    [ObservableProperty]
    private bool _scrollTested;

    public TrackpadTestViewModel()
    {
        _testState = new InputTestService.TrackpadTestState();
    }

    /// <summary>
    /// Register cursor movement
    /// </summary>
    public void RegisterMovement(int deltaX, int deltaY)
    {
        _testState.RegisterMovement(deltaX, deltaY);
        MovementTested = _testState.MovementDetected;
        UpdateProgress();
    }

    /// <summary>
    /// Register a mouse click
    /// </summary>
    public void RegisterClick(bool isRightClick)
    {
        _testState.RegisterClick(isRightClick);
        LeftClickTested = _testState.LeftClickDetected;
        RightClickTested = _testState.RightClickDetected;
        UpdateProgress();
    }

    /// <summary>
    /// Register scroll action
    /// </summary>
    public void RegisterScroll(int delta)
    {
        _testState.RegisterScroll(delta);
        ScrollTested = _testState.ScrollDetected;
        UpdateProgress();
    }

    private void UpdateProgress()
    {
        ProgressPercent = _testState.PercentComplete;
        var tested = 0;
        if (MovementTested) tested++;
        if (LeftClickTested) tested++;
        if (RightClickTested) tested++;
        if (ScrollTested) tested++;
        ProgressText = $"{ProgressPercent:F0}% tested ({tested}/4 actions)";

        if (ProgressPercent >= 100)
        {
            Instructions = "✓ All trackpad functions tested! Click Complete to finish.";
        }
        else if (ProgressPercent >= 75)
        {
            Instructions = "Almost done! One more action to test.";
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
