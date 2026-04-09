using System.Diagnostics;

namespace LaptopQC.Core.Services;

/// <summary>
/// Registers/manages the Windows Scheduled Task for monthly automated basic QC.
/// The task runs the main app with --auto-basic-qc.
/// </summary>
public static class AutoBasicQcTaskService
{
    private const string TaskName = "PramaanAutoBasicQC";

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
            Debug.WriteLine($"Auto basic QC task registration failed: {ex.Message}");
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
        var taskCommand = $"\\\"{appExePath}\\\" --auto-basic-qc";
        var args = $"/Create /TN \"{TaskName}\" " +
                   $"/TR \"{taskCommand}\" " +
                   $"/SC MONTHLY /MO 1 /D 1 /ST 09:00 " +
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
            Debug.WriteLine($"Auto basic QC task registered: {appExePath}");
        else
            Debug.WriteLine($"Auto basic QC task registration failed (exit {process?.ExitCode})");
    }
}
