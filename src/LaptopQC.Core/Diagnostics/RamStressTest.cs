using System.Diagnostics;
using System.Runtime.InteropServices;

namespace LaptopQC.Core.Diagnostics;

/// <summary>
/// Provides RAM stress testing functionality with pattern testing
/// </summary>
public class RamStressTest
{
    private readonly long _testSizeMB;
    private readonly int _iterations;

    public event Action<StressTestProgress>? OnProgress;

    public RamStressTest(long testSizeMB = 256, int iterations = 3)
    {
        _testSizeMB = testSizeMB;
        _iterations = iterations;
    }

    /// <summary>
    /// Runs RAM stress test with pattern verification
    /// </summary>
    public async Task<RamStressResult> RunAsync(CancellationToken cancellationToken = default)
    {
        var result = new RamStressResult
        {
            TestSizeMB = _testSizeMB,
            Iterations = _iterations,
            StartTime = DateTime.Now
        };

        var errors = new List<string>();
        var stopwatch = Stopwatch.StartNew();

        try
        {
            int arraySize = (int)(_testSizeMB * 1024 * 1024 / sizeof(long));
            long[] testArray = new long[arraySize];

            for (int iteration = 0; iteration < _iterations; iteration++)
            {
                if (cancellationToken.IsCancellationRequested) break;

                // Report progress
                OnProgress?.Invoke(new StressTestProgress
                {
                    ElapsedSeconds = (int)stopwatch.Elapsed.TotalSeconds,
                    TotalSeconds = _iterations * 2, // Rough estimate
                    PercentComplete = (iteration * 100) / _iterations
                });

                // Pattern 1: Sequential values
                await Task.Run(() =>
                {
                    for (int i = 0; i < arraySize && !cancellationToken.IsCancellationRequested; i++)
                    {
                        testArray[i] = i * (iteration + 1);
                    }
                }, cancellationToken);

                // Verify pattern 1
                await Task.Run(() =>
                {
                    for (int i = 0; i < arraySize && !cancellationToken.IsCancellationRequested; i++)
                    {
                        if (testArray[i] != i * (iteration + 1))
                        {
                            errors.Add($"Pattern mismatch at iteration {iteration}, index {i}");
                            return;
                        }
                    }
                }, cancellationToken);

                // Pattern 2: Alternating bits (0xAA and 0x55)
                byte pattern = (byte)(iteration % 2 == 0 ? 0xAA : 0x55);
                long longPattern = 0;
                for (int b = 0; b < 8; b++)
                    longPattern |= ((long)pattern << (b * 8));

                await Task.Run(() =>
                {
                    for (int i = 0; i < arraySize && !cancellationToken.IsCancellationRequested; i++)
                    {
                        testArray[i] = longPattern;
                    }
                }, cancellationToken);

                // Verify pattern 2
                await Task.Run(() =>
                {
                    for (int i = 0; i < arraySize && !cancellationToken.IsCancellationRequested; i++)
                    {
                        if (testArray[i] != longPattern)
                        {
                            errors.Add($"Bit pattern mismatch at iteration {iteration}, index {i}");
                            return;
                        }
                    }
                }, cancellationToken);

                if (errors.Count > 0) break;
            }

            // Final progress
            OnProgress?.Invoke(new StressTestProgress
            {
                ElapsedSeconds = (int)stopwatch.Elapsed.TotalSeconds,
                TotalSeconds = (int)stopwatch.Elapsed.TotalSeconds,
                PercentComplete = 100
            });
        }
        catch (OutOfMemoryException)
        {
            errors.Add($"Could not allocate {_testSizeMB}MB for testing");
        }
        catch (Exception ex)
        {
            errors.Add($"Test error: {ex.Message}");
        }

        stopwatch.Stop();
        result.EndTime = DateTime.Now;
        result.ActualDurationSeconds = stopwatch.Elapsed.TotalSeconds;
        result.Errors = errors;
        result.Passed = errors.Count == 0 && !cancellationToken.IsCancellationRequested;
        result.Message = result.Passed
            ? $"RAM stress test passed - {_testSizeMB}MB tested with {_iterations} pattern iterations"
            : $"RAM stress test failed: {string.Join("; ", errors)}";

        return result;
    }
}

public class RamStressResult
{
    public bool Passed { get; set; }
    public string Message { get; set; } = "";
    public long TestSizeMB { get; set; }
    public int Iterations { get; set; }
    public double ActualDurationSeconds { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public List<string> Errors { get; set; } = new();
}
