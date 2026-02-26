using System.Diagnostics;

namespace LaptopQC.Core.Services;

/// <summary>
/// Registers/manages the Windows Scheduled Task for the QC reminder.
/// The task runs PramaanReminder.exe at logon to check if a QC test is overdue.
/// </summary>
public static class ReminderTaskService
{
    private const string TaskName = "PramaanQCReminder";

    /// <summary>
    /// Ensures the scheduled task is registered. Safe to call on every app startup —
    /// it checks first and only registers if the task doesn't exist yet.
    /// </summary>
    public static void EnsureRegistered()
    {
        try
        {
            if (IsTaskRegistered())
                return;

            var reminderExe = FindReminderExe();
            if (reminderExe == null)
                return; // Reminder exe not found — skip silently

            RegisterTask(reminderExe);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Reminder task registration failed: {ex.Message}");
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

    private static string? FindReminderExe()
    {
        var appDir = AppContext.BaseDirectory;

        // Check same directory (when deployed together)
        var sameDirPath = Path.Combine(appDir, "PramaanReminder.exe");
        if (File.Exists(sameDirPath))
            return sameDirPath;

        // Check sibling directory (dev build output)
        var siblingPath = Path.Combine(appDir, "..", "LaptopQC.Reminder",
            "bin", "Debug", "net8.0-windows10.0.17763.0", "PramaanReminder.exe");
        if (File.Exists(siblingPath))
            return Path.GetFullPath(siblingPath);

        var siblingRelease = Path.Combine(appDir, "..", "LaptopQC.Reminder",
            "bin", "Release", "net8.0-windows10.0.17763.0", "PramaanReminder.exe");
        if (File.Exists(siblingRelease))
            return Path.GetFullPath(siblingRelease);

        return null;
    }

    private static void RegisterTask(string reminderExePath)
    {
        // Use schtasks.exe to create the scheduled task
        var args = $"/Create /TN \"{TaskName}\" " +
                   $"/TR \"\\\"{reminderExePath}\\\"\" " +
                   $"/SC ONLOGON " +
                   $"/RL LIMITED " +
                   $"/F " +  // Force overwrite if exists
                   $"/IT";   // Only when user is interactively logged on

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
            Debug.WriteLine($"Reminder task registered: {reminderExePath}");
        else
            Debug.WriteLine($"Reminder task registration failed (exit {process?.ExitCode})");
    }
}
