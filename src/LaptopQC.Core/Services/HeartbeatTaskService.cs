using System.Diagnostics;

namespace LaptopQC.Core.Services;

/// <summary>
/// Registers/manages the Windows Scheduled Task for periodic heartbeats.
/// The task runs the main app with --heartbeat to check in with the server and refresh last_seen.
/// </summary>
public static class HeartbeatTaskService
{
    private const string TaskName = "PramaanHeartbeat";

    public static void EnsureRegistered()
    {
        try
        {
            if (IsTaskRegistered())
                return;

            var exePath = FindAppExe();
            if (exePath == null)
                return;

            RegisterTask(exePath);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Heartbeat task registration failed: {ex.Message}");
        }
    }

    private static bool IsTaskRegistered()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Query /TN \"{TaskName}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            process?.WaitForExit(5000);
            return process?.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static string? FindAppExe()
    {
        var processPath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(processPath) && File.Exists(processPath))
            return processPath;

        var appDir = AppContext.BaseDirectory;
        var appExe = Path.Combine(appDir, "LaptopQC.App.exe");
        if (File.Exists(appExe))
            return appExe;

        return null;
    }

    private static void RegisterTask(string appExePath)
    {
        // Schedule: every 4 hours. Start: now + 5 minutes (local time).
        var startTime = DateTime.Now.AddMinutes(5).ToString("HH:mm");
        var taskCommand = $"\\\"{appExePath}\\\" --heartbeat";
        var args = $"/Create /TN \"{TaskName}\" " +
                   $"/TR \"{taskCommand}\" " +
                   $"/SC HOURLY /MO 4 /ST {startTime} " +
                   $"/RL LIMITED /F /IT";

        var psi = new ProcessStartInfo
        {
            FileName = "schtasks.exe",
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi);
        process?.WaitForExit(10000);

        if (process?.ExitCode == 0)
            Debug.WriteLine($"Heartbeat task registered: {appExePath}");
        else
            Debug.WriteLine($"Heartbeat task registration failed (exit {process?.ExitCode})");
    }
}

