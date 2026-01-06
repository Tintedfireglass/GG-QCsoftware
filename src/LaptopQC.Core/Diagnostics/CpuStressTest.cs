using LaptopQC.Hardware.Providers;
using System.Diagnostics;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// CPU stress test with reliable thermal monitoring using dedicated threads
/// </summary>
public class CpuStressTest
{
    private readonly int _durationSeconds;
    private readonly int _threadCount;
    private volatile bool _isRunning;
    private readonly object _dataLock = new();

    // Shared data
    private readonly List<double> _temps = new();
    private readonly List<double> _clocks = new();

    public event Action<StressTestProgress>? OnProgress;

    public CpuStressTest(int durationSeconds = 30, int? threadCount = null)
    {
        _durationSeconds = durationSeconds;
        // Use slightly fewer threads to leave room for monitoring
        _threadCount = threadCount ?? Math.Max(1, Environment.ProcessorCount - 1);
    }

    public async Task<CpuStressResult> RunAsync(CancellationToken cancellationToken = default)
    {
        var result = new CpuStressResult
        {
            ThreadsUsed = _threadCount,
            DurationSeconds = _durationSeconds,
            StartTime = DateTime.Now
        };

        _isRunning = true;
        _temps.Clear();
        _clocks.Clear();

        // Initialize sensors FIRST (this takes time)
        var sensors = new SensorProvider();
        sensors.Initialize();

        var stopwatch = Stopwatch.StartNew();
        var stressThreads = new List<Thread>();

        // 1. Start dedicated monitoring thread (HIGH PRIORITY)
        var monitorThread = new Thread(() => MonitorLoop(stopwatch, cancellationToken, sensors))
        {
            Priority = ThreadPriority.AboveNormal,
            IsBackground = true,
            Name = "ThermalMonitor"
        };
        monitorThread.Start();

        // Small delay to ensure monitor is running first
        await Task.Delay(100, cancellationToken);

        // 2. Start stress threads (NORMAL PRIORITY)
        for (int i = 0; i < _threadCount; i++)
        {
            var t = new Thread(() => StressLoop(cancellationToken))
            {
                Priority = ThreadPriority.Normal,
                IsBackground = true,
                Name = $"StressWorker{i}"
            };
            stressThreads.Add(t);
            t.Start();
        }

        // 3. Wait for test duration
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(_durationSeconds), cancellationToken);
        }
        catch (TaskCanceledException) { }

        // 4. Stop everything
        _isRunning = false;

        // Wait for threads to finish
        foreach (var t in stressThreads)
            t.Join(1000);
        monitorThread.Join(1000);

        stopwatch.Stop();

        // 5. Analyze results
        lock (_dataLock)
        {
            result.EndTime = DateTime.Now;
            result.ActualDurationSeconds = stopwatch.Elapsed.TotalSeconds;
            result.MaxTemp = _temps.Count > 0 ? _temps.Max() : 0;
            result.AvgTemp = _temps.Count > 0 ? _temps.Average() : 0;
            result.MinClock = _clocks.Count > 0 ? _clocks.Min() : 0;
            result.MaxClock = _clocks.Count > 0 ? _clocks.Max() : 0;
            result.AvgClock = _clocks.Count > 0 ? _clocks.Average() : 0;
        }

        // Failure criteria
        var failures = new List<string>();

        // Critical overheating
        if (result.MaxTemp > 95)
            failures.Add($"CRITICAL: CPU overheated ({result.MaxTemp:F1}°C > 95°C)");
        else if (result.MaxTemp > 90)
            failures.Add($"WARNING: High temperature ({result.MaxTemp:F1}°C)");

        // Thermal throttling detection
        if (result.MaxClock > 0 && result.MaxTemp > 80)
        {
            double dropPercent = (1 - (result.MinClock / result.MaxClock)) * 100;
            if (dropPercent > 25)
            {
                failures.Add($"THROTTLING: Speed dropped {dropPercent:F0}% ({result.MaxClock:F0}→{result.MinClock:F0}MHz) at {result.MaxTemp:F1}°C");
            }
        }

        // Test completion check
        if (stopwatch.Elapsed.TotalSeconds < _durationSeconds * 0.9 && !cancellationToken.IsCancellationRequested)
            failures.Add("Test interrupted unexpectedly");

        result.Passed = failures.Count == 0;
        result.Message = result.Passed
            ? $"PASSED: Max {result.MaxTemp:F1}°C, Speed stable at ~{result.AvgClock:F0}MHz"
            : $"FAILED: {string.Join("; ", failures)}";

        return result;
    }

    private void MonitorLoop(Stopwatch stopwatch, CancellationToken ct, SensorProvider sensors)
    {
        var logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "stress_debug.log");
        
        try
        {
            using var log = new StreamWriter(logPath, append: false);
            log.WriteLine("Time,Temp(C),Clock(MHz),MaxClock,Throttle%");
            log.WriteLine("DEBUG: MonitorLoop started (sensors pre-initialized)");
            log.Flush();

            while (_isRunning && !ct.IsCancellationRequested)
            {
                try
                {
                    sensors.Update();
                    var temp = sensors.GetCpuTemperature();
                    var clock = sensors.GetCpuClockSpeed();

                    lock (_dataLock)
                    {
                        if (temp.HasValue) _temps.Add(temp.Value);
                        if (clock.HasValue) _clocks.Add(clock.Value);

                        double maxClock = _clocks.Count > 0 ? _clocks.Max() : 0;
                        double throttle = maxClock > 0 ? (1 - (clock ?? maxClock) / maxClock) * 100 : 0;

                        log.WriteLine($"{stopwatch.Elapsed.TotalSeconds:F1},{temp:F1},{clock:F0},{maxClock:F0},{throttle:F1}");
                        log.Flush();

                        OnProgress?.Invoke(new StressTestProgress
                        {
                            ElapsedSeconds = (int)stopwatch.Elapsed.TotalSeconds,
                            TotalSeconds = _durationSeconds,
                            PercentComplete = Math.Min(100, (int)(stopwatch.Elapsed.TotalSeconds / _durationSeconds * 100)),
                            CurrentTemp = temp ?? 0,
                            CurrentClock = clock ?? 0
                        });
                    }

                    Thread.Sleep(1000);
                }
                catch (Exception ex)
                {
                    log.WriteLine($"LOOP ERROR: {ex.Message}");
                    log.Flush();
                }
            }
            
            log.WriteLine("DEBUG: MonitorLoop exiting");
            sensors?.Dispose();
        }
        catch (Exception ex)
        {
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "monitor_crash.log"), ex.ToString());
        }
    }

    private void StressLoop(CancellationToken ct)
    {
        double x = 1.0;
        while (_isRunning && !ct.IsCancellationRequested)
        {
            // Heavy FP math to stress CPU
            for (int i = 0; i < 500000; i++)
            {
                x = Math.Sqrt(x * x + Math.Sin(x) * Math.Cos(x) + 1.0);
            }
        }
    }
}

public class CpuStressResult
{
    public bool Passed { get; set; }
    public string Message { get; set; } = "";
    public int ThreadsUsed { get; set; }
    public int DurationSeconds { get; set; }
    public double ActualDurationSeconds { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public double MaxTemp { get; set; }
    public double AvgTemp { get; set; }
    public double MinClock { get; set; }
    public double MaxClock { get; set; }
    public double AvgClock { get; set; }
}

public class StressTestProgress
{
    public int ElapsedSeconds { get; set; }
    public int TotalSeconds { get; set; }
    public int PercentComplete { get; set; }
    public double CurrentTemp { get; set; }
    public double CurrentClock { get; set; }
}
