using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;
using System.Management;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;

namespace LaptopQC.App.ViewModels;

public partial class AudioVideoTestViewModel : ObservableObject, IDisposable
{
    private readonly AudioVideoTestService _service;
    private DispatcherTimer? _jackDetectionTimer;
    private DispatcherTimer? _displayPollingTimer;

    [ObservableProperty]
    private string _currentStepName = "Speaker Test (1/5)";

    [ObservableProperty]
    private string _instructions = "Test each speaker and mark individually as Pass or Fail.";

    [ObservableProperty]
    private bool _isSpeakerTestActive = true;

    [ObservableProperty]
    private bool _isMicTestActive;

    [ObservableProperty]
    private bool _isJackTestActive;

    [ObservableProperty]
    private bool _isCameraTestActive;

    [ObservableProperty]
    private bool _isDisplayTestActive;

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

    // 3.5mm Jack detection states
    [ObservableProperty]
    private bool _jackDetected;

    [ObservableProperty]
    private string _jackDeviceName = "";

    [ObservableProperty]
    private string _jackDetectionStatus = "⏳ Waiting for headphones...";

    // ─── DisplayPort / HDMI Test state ──────────────────────────────────
    [ObservableProperty]
    private bool _displayMonitorDetected;

    [ObservableProperty]
    private string _displayMonitorName = "";

    [ObservableProperty]
    private string _displayDetectionStatus = "⏳ Checking for external display...";

    // Track results of each stage
    private bool _micPassed;
    private bool _jackPassed;
    private bool _cameraPassed;
    private bool _displayPassed;

    // Public accessors for the wizard to read jack + display results
    public bool JackPassed => _jackPassed;
    public bool JackTested { get; private set; }
    public bool DisplayPortPassed => _displayPassed;
    public bool DisplayPortTested { get; private set; }

    public AudioVideoTestViewModel()
    {
        _service = new AudioVideoTestService();
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
        CurrentStepName = "Microphone Test (2/5)";
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
        StartJackTest();
    }

    [RelayCommand]
    private void FailMicTest()
    {
        _micPassed = false;
        StartJackTest();
    }

    // ─── 3.5mm Jack Test ─────────────────────────────────────────────────

    private void StartJackTest()
    {
        IsMicTestActive = false;
        IsJackTestActive = true;
        CurrentStepName = "3.5mm Jack Test (3/5)";
        Instructions = "Plug headphones into the 3.5mm jack. We will detect the connection automatically.";

        CheckHeadphoneConnection();

        _jackDetectionTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1.5)
        };
        _jackDetectionTimer.Tick += (s, e) => CheckHeadphoneConnection();
        _jackDetectionTimer.Start();
    }

    private void CheckHeadphoneConnection()
    {
        var (isConnected, deviceName) = _service.GetHeadphoneStatus();

        JackDetected = isConnected;
        JackDeviceName = deviceName;

        if (isConnected)
        {
            JackDetectionStatus = $"✓ Detected: {deviceName}";
            Instructions = "Headphones detected! Click 'Play Test Sound' and verify you hear audio through the headphones.";
        }
        else
        {
            JackDetectionStatus = "⏳ Waiting for headphones...";
        }
    }

    [RelayCommand]
    private void PlayJackTestSound()
    {
        var success = _service.PlayTestSoundToHeadphones();
        if (!success)
        {
            JackDetectionStatus = "⚠ Could not play to headphones. Check connection.";
        }
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

    // ─── Camera Test ─────────────────────────────────────────────────────

    private void StartCameraTest()
    {
        IsJackTestActive = false;
        IsCameraTestActive = true;
        CurrentStepName = "Camera Test (4/5)";
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
        StartDisplayTest();
    }

    [RelayCommand]
    private void FailCameraTest()
    {
        _cameraPassed = false;
        StartDisplayTest();
    }

    // ─── HDMI / DisplayPort Test ──────────────────────────────────────────

    private void StartDisplayTest()
    {
        IsCameraTestActive = false;
        IsDisplayTestActive = true;
        CurrentStepName = "Display Port / HDMI Test (5/5)";
        Instructions = "Connect an external monitor via HDMI or DisplayPort. Detection is automatic.";

        // Check immediately, then poll every 2 seconds for hotplug (same as jack test)
        CheckDisplayConnection();
        _displayPollingTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _displayPollingTimer.Tick += (s, e) => CheckDisplayConnection();
        _displayPollingTimer.Start();
    }

    private void CheckDisplayConnection()
    {
        // Run the WMI query on a background thread to avoid blocking the UI thread.
        // Win32_PnPEntity with PNPClass='Monitor' queries the Windows hardware device tree.
        // Every physically connected monitor — internal or external — gets a device entry here
        // when Windows loads its driver. This works in ALL display modes:
        //   - Extend (different desktops): count = 2+
        //   - Clone / Mirror:              count = 2+  ← GetSystemMetrics fails here, this doesn't
        //   - Projector Only:              count = 2+  (built-in may be off but still enumerated)
        //
        // Count == 1  → only the built-in display is connected
        // Count >= 2  → at least one external display is physically connected
        _ = Task.Run(() =>
        {
            int physicalCount;
            bool queryFailed = false;
            try
            {
                using var searcher = new ManagementObjectSearcher(
                    "SELECT Name FROM Win32_PnPEntity WHERE PNPClass = 'Monitor' AND Status = 'OK'");
                physicalCount = searcher.Get().Count;
            }
            catch
            {
                physicalCount = 0;
                queryFailed = true;
            }

            // Marshal results back to the UI thread
            Application.Current?.Dispatcher.InvokeAsync(() =>
            {
                if (queryFailed)
                {
                    DisplayDetectionStatus = "⚠ Could not query display hardware.";
                    return;
                }

                if (physicalCount >= 2)
                {
                    if (!DisplayMonitorDetected)
                    {
                        DisplayMonitorDetected = true;
                        DisplayMonitorName = $"{physicalCount} displays connected";
                        DisplayDetectionStatus = $"✓ External display detected ({physicalCount} displays connected)";
                        Instructions = "External display detected! Verify the image appears correctly on the external screen.";
                    }
                }
                else
                {
                    if (DisplayMonitorDetected)
                    {
                        DisplayMonitorDetected = false;
                        DisplayMonitorName = "";
                    }
                    DisplayDetectionStatus = "⏳ No external display detected. Connect a monitor via HDMI or DisplayPort.";
                }
            });
        });
    }

    private void StopDisplayPolling()
    {
        _displayPollingTimer?.Stop();
        _displayPollingTimer = null;
    }

    [RelayCommand]
    private void RefreshDisplayDetection()
    {
        DisplayDetectionStatus = "⏳ Checking...";
        CheckDisplayConnection();
    }

    [RelayCommand]
    private void PassDisplayTest()
    {
        StopDisplayPolling();
        _displayPassed = true;
        DisplayPortTested = true;
        FinishTest();
    }

    [RelayCommand]
    private void FailDisplayTest()
    {
        StopDisplayPolling();
        _displayPassed = false;
        DisplayPortTested = true;
        FinishTest();
    }

    private void FinishTest()
    {
        IsDisplayTestActive = false;
        IsComplete = true;

        List<string> failures = new();
        if (!LeftSpeakerPassed) failures.Add("Left Speaker");
        if (!RightSpeakerPassed) failures.Add("Right Speaker");
        if (!_micPassed) failures.Add("Microphone");
        if (!_jackPassed) failures.Add("3.5mm Jack");
        if (!_cameraPassed) failures.Add("Camera");
        if (!_displayPassed) failures.Add("Display Port / HDMI");

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
        StopDisplayPolling();
        _service.Dispose();
    }
}
