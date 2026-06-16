using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Pramaan.Avalonia.ViewModels;

public partial class AudioVideoTestViewModel : ObservableObject, IDisposable
{
    private readonly IAudioVideoTestService _service;
    private DispatcherTimer? _jackDetectionTimer;

    [ObservableProperty] private string _currentStepName = "Speaker Test";
    [ObservableProperty] private string _instructions = "Test each speaker and mark individually as Pass or Fail.";
    [ObservableProperty] private bool _isSpeakerTestActive = true;
    [ObservableProperty] private bool _isMicTestActive;
    [ObservableProperty] private bool _isJackTestActive;
    [ObservableProperty] private bool _isCameraTestActive;
    [ObservableProperty] private bool _isRecording;
    [ObservableProperty] private bool _canPlayback;
    [ObservableProperty] private bool _passed;
    [ObservableProperty] private bool _isComplete;
    [ObservableProperty] private string _resultMessage = "";
    [ObservableProperty] private bool _leftSpeakerTested;
    [ObservableProperty] private bool _rightSpeakerTested;
    [ObservableProperty] private bool _leftSpeakerPassed;
    [ObservableProperty] private bool _rightSpeakerPassed;
    [ObservableProperty] private bool _jackDetected;
    [ObservableProperty] private string _jackDeviceName = "";
    [ObservableProperty] private string _jackDetectionStatus = "Waiting for headphones...";

    private bool _micPassed;
    private bool _jackPassed;
    private bool _cameraPassed;

    public bool JackPassed => _jackPassed;
    public bool JackTested { get; private set; }

    public AudioVideoTestViewModel()
    {
        _service = App.Current?.Services?.GetRequiredService<IAudioVideoTestService>()
            ?? throw new InvalidOperationException("DI container not initialized");
        _currentStepName = "Speaker Test (1/4)";
    }

    [RelayCommand] private void TestLeftSpeaker() => _service.TestSpeaker(true);
    [RelayCommand] private void TestRightSpeaker() => _service.TestSpeaker(false);

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
        if (LeftSpeakerTested && RightSpeakerTested)
            StartMicTest();
        else if (LeftSpeakerTested && !RightSpeakerTested)
            Instructions = "Left speaker done. Now test the RIGHT speaker.";
        else if (!LeftSpeakerTested && RightSpeakerTested)
            Instructions = "Right speaker done. Now test the LEFT speaker.";
    }

    private void StartMicTest()
    {
        IsSpeakerTestActive = false;
        IsMicTestActive = true;
        CurrentStepName = "Microphone Test (2/4)";
        Instructions = "Click 'Start Recording', speak into the mic, then 'Stop'. Play back to verify.";
    }

    [RelayCommand] private void StartRecording()
    {
        IsRecording = true;
        CanPlayback = false;
        _service.StartOneShotMicTest();
    }

    [RelayCommand] private void StopRecording()
    {
        IsRecording = false;
        _service.StopMicTest();
        CanPlayback = true;
    }

    [RelayCommand] private void PlaybackRecording() => _service.PlaybackMicRecording();

    [RelayCommand]
    private void PassMicTest()
    {
        _micPassed = true;
        StartJackTest();
    }

    [RelayCommand]
    private void FailMicTest()
    {
        _micPassed = false;
        StartJackTest();
    }

    private void StartJackTest()
    {
        IsMicTestActive = false;
        IsJackTestActive = true;
        CurrentStepName = "3.5mm Jack Test (3/4)";
        Instructions = "Plug headphones into the 3.5mm jack. We will detect the connection automatically.";

        CheckHeadphoneConnection();

        _jackDetectionTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1.5)
        };
        _jackDetectionTimer.Tick += (_, _) => CheckHeadphoneConnection();
        _jackDetectionTimer.Start();
    }

    private void CheckHeadphoneConnection()
    {
        var (isConnected, deviceName) = _service.GetHeadphoneStatus();

        JackDetected = isConnected;
        JackDeviceName = deviceName;

        if (isConnected)
        {
            JackDetectionStatus = $"Detected: {deviceName}";
            Instructions = "Headphones detected! Click 'Play Test Sound' and verify you hear audio through the headphones.";
        }
        else
        {
            JackDetectionStatus = "Waiting for headphones...";
        }
    }

    [RelayCommand]
    private void PlayJackTestSound()
    {
        var success = _service.PlayTestSoundToHeadphones();
        if (!success)
            JackDetectionStatus = "Could not play to headphones. Check connection.";
    }

    [RelayCommand]
    private void PassJackTest()
    {
        _jackPassed = true;
        JackTested = true;
        StopJackDetection();
        StartCameraTest();
    }

    [RelayCommand]
    private void FailJackTest()
    {
        _jackPassed = false;
        JackTested = true;
        StopJackDetection();
        StartCameraTest();
    }

    private void StopJackDetection()
    {
        _jackDetectionTimer?.Stop();
        _jackDetectionTimer = null;
        _service.StopJackPlayback();
    }

    private void StartCameraTest()
    {
        IsJackTestActive = false;
        IsCameraTestActive = true;
        CurrentStepName = "Camera Test (4/4)";
        Instructions = "Click 'Open Camera App' and verify you can see the video feed.";
    }

    [RelayCommand] private void OpenCamera() => _service.LaunchCameraApp();

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
        if (!_jackPassed) failures.Add("3.5mm Jack");
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
        StopJackDetection();
        _service.Dispose();
    }
}
