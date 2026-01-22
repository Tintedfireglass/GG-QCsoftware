using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;

namespace LaptopQC.App.ViewModels;

public partial class AudioVideoTestViewModel : ObservableObject, IDisposable
{
    private readonly AudioVideoTestService _service;

    [ObservableProperty]
    private string _currentStepName = "Speaker Test";

    [ObservableProperty]
    private string _instructions = "Test each speaker and mark individually as Pass or Fail.";

    [ObservableProperty]
    private bool _isSpeakerTestActive = true;

    [ObservableProperty]
    private bool _isMicTestActive;

    [ObservableProperty]
    private bool _isCameraTestActive;

    [ObservableProperty]
    private bool _isRecording;

    [ObservableProperty]
    private bool _canPlayback;

    [ObservableProperty]
    private bool _passed;

    [ObservableProperty]
    private bool _isComplete;
    
    [ObservableProperty]
    private string _resultMessage = "";

    // Individual speaker test states
    [ObservableProperty]
    private bool _leftSpeakerTested;
    
    [ObservableProperty]
    private bool _rightSpeakerTested;
    
    [ObservableProperty]
    private bool _leftSpeakerPassed;
    
    [ObservableProperty]
    private bool _rightSpeakerPassed;

    // Track results of each stage
    private bool _micPassed;
    private bool _cameraPassed;

    public AudioVideoTestViewModel()
    {
        _service = new AudioVideoTestService();
        _currentStepName = "Speaker Test (1/3)";
    }

    [RelayCommand]
    private void TestLeftSpeaker()
    {
        _service.TestSpeaker(true);
    }

    [RelayCommand]
    private void TestRightSpeaker()
    {
        _service.TestSpeaker(false);
    }

    [RelayCommand]
    private void PassLeftSpeaker()
    {
        LeftSpeakerTested = true;
        LeftSpeakerPassed = true;
        CheckSpeakerTestComplete();
    }

    [RelayCommand]
    private void FailLeftSpeaker()
    {
        LeftSpeakerTested = true;
        LeftSpeakerPassed = false;
        CheckSpeakerTestComplete();
    }

    [RelayCommand]
    private void PassRightSpeaker()
    {
        RightSpeakerTested = true;
        RightSpeakerPassed = true;
        CheckSpeakerTestComplete();
    }

    [RelayCommand]
    private void FailRightSpeaker()
    {
        RightSpeakerTested = true;
        RightSpeakerPassed = false;
        CheckSpeakerTestComplete();
    }

    private void CheckSpeakerTestComplete()
    {
        // Only advance when both speakers have been tested
        if (LeftSpeakerTested && RightSpeakerTested)
        {
            StartMicTest();
        }
        else if (LeftSpeakerTested && !RightSpeakerTested)
        {
            Instructions = "Left speaker done. Now test the RIGHT speaker.";
        }
        else if (!LeftSpeakerTested && RightSpeakerTested)
        {
            Instructions = "Right speaker done. Now test the LEFT speaker.";
        }
    }

    private void StartMicTest()
    {
        IsSpeakerTestActive = false;
        IsMicTestActive = true;
        CurrentStepName = "Microphone Test (2/3)";
        Instructions = "Click 'Start Recording', speak into the mic, then 'Stop'. Play back to verify.";
    }

    [RelayCommand]
    private void StartRecording()
    {
        IsRecording = true;
        CanPlayback = false;
        _service.StartOneShotMicTest();
    }

    [RelayCommand]
    private void StopRecording()
    {
        IsRecording = false;
        _service.StopMicTest();
        CanPlayback = true;
    }

    [RelayCommand]
    private void PlaybackRecording()
    {
        _service.PlaybackMicRecording();
    }

    [RelayCommand]
    private void PassMicTest()
    {
        _micPassed = true;
        StartCameraTest();
    }

    [RelayCommand]
    private void FailMicTest()
    {
        _micPassed = false;
        StartCameraTest();
    }

    private void StartCameraTest()
    {
        IsMicTestActive = false;
        IsCameraTestActive = true;
        CurrentStepName = "Camera Test (3/3)";
        Instructions = "Click 'Open Camera App' and verify you can see the video feed.";
    }

    [RelayCommand]
    private void OpenCamera()
    {
        _service.LaunchCameraApp();
    }

    [RelayCommand]
    private void PassCameraTest()
    {
        _cameraPassed = true;
        FinishTest();
    }

    [RelayCommand]
    private void FailCameraTest()
    {
        _cameraPassed = false;
        FinishTest();
    }

    private void FinishTest()
    {
        IsCameraTestActive = false;
        IsComplete = true;
        
        List<string> failures = new();
        if (!LeftSpeakerPassed) failures.Add("Left Speaker");
        if (!RightSpeakerPassed) failures.Add("Right Speaker");
        if (!_micPassed) failures.Add("Microphone");
        if (!_cameraPassed) failures.Add("Camera");

        if (failures.Count == 0)
        {
            Passed = true;
            ResultMessage = "Audio & Video Tests Passed";
        }
        else
        {
            Passed = false;
            ResultMessage = $"Failed: {string.Join(", ", failures)}";
        }
    }

    public void Dispose()
    {
        _service.Dispose();
    }
}
