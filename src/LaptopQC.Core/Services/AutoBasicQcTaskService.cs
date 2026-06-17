using System.Diagnostics;
using System.Text;

namespace LaptopQC.Core.Services;

/// <summary>
/// Registers/manages the Windows Scheduled Task for weekly automated basic QC.
/// The task runs the main app with --auto-basic-qc.
/// - Scheduled WEEKLY, anchored to the day/time of the first completed full QC.
/// - Uses XML-based registration so StartWhenAvailable=true is supported
///   (catches up if the machine was off or offline at the trigger time).
/// - Runs at highest available privilege level (required because app.manifest demands admin).
/// </summary>
public static class AutoBasicQcTaskService
{
    private const string TaskName = "PramaanAutoBasicQC";

    // File written by QCWorkflowService.FinalizeGrades() after every full QC.
    private static readonly string TimestampFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Pramaan", "last_qc_test.txt");

    public static void EnsureRegistered()
    {
        try
        {
            var exePath = FindAppExe();
            if (exePath == null)
                return;

            // Only register the task if it doesn't already exist.
            // Re-creating it every startup (with /F) wipes its execution history and
            // breaks the StartWhenAvailable catch-up mechanism in Windows Task Scheduler.
            if (TaskExists())
                return;

            RegisterTask(exePath);
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Auto basic QC task registration failed: {ex.Message}");
        }
    }

    private static bool TaskExists()
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
        catch { return false; }
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

    /// <summary>
    /// Returns the anchor time for the weekly schedule.
    /// If a completed QC exists, use the recorded timestamp (day-of-week + time).
    /// Otherwise fall back to 7 days from now at 09:00.
    /// </summary>
    private static DateTime GetAnchorTime()
    {
        try
        {
            if (File.Exists(TimestampFile))
            {
                var text = File.ReadAllText(TimestampFile).Trim();
                if (DateTime.TryParse(text, null,
                    System.Globalization.DateTimeStyles.RoundtripKind, out var parsed))
                {
                    // Convert to local time to get the correct day-of-week and hour
                    return parsed.ToLocalTime();
                }
            }
        }
        catch { /* fall through */ }

        // No QC yet — schedule for 7 days from now at 09:00 local
        return DateTime.Now.Date.AddDays(7).AddHours(9);
    }

    private static void RegisterTask(string appExePath)
    {
        var anchor = GetAnchorTime();
        var dayOfWeek = anchor.DayOfWeek.ToString(); // e.g. "Monday"
        var startTime = anchor.ToString("HH:mm:ss");

        // Build the ISO 8601 start boundary (required for XML triggers)
        var startBoundary = anchor.ToString("yyyy-MM-ddTHH:mm:ss");

        var xmlContent = BuildTaskXml(appExePath, dayOfWeek, startTime, startBoundary);

        // Write XML to a temp file and register via schtasks /Create /XML
        var tempXml = Path.Combine(Path.GetTempPath(), "PramaanAutoBasicQC.xml");
        try
        {
            File.WriteAllText(tempXml, xmlContent, Encoding.Unicode);

            var psi = new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = $"/Create /TN \"{TaskName}\" /XML \"{tempXml}\" /F",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(psi);
            process?.WaitForExit(15000);

            if (process?.ExitCode == 0)
                Debug.WriteLine($"Auto basic QC task registered (weekly on {dayOfWeek} at {startTime}): {appExePath}");
            else
            {
                var err = process?.StandardError.ReadToEnd();
                Debug.WriteLine($"Auto basic QC task registration failed (exit {process?.ExitCode}): {err}");
            }
        }
        finally
        {
            try { File.Delete(tempXml); } catch { }
        }
    }

    private static string BuildTaskXml(string exePath, string dayOfWeek, string startTime, string startBoundary)
    {
        // Map .NET DayOfWeek name to the Task Scheduler XML day element name.
        // The XML uses full day names: Monday, Tuesday, Wednesday, etc.
        var taskCommand = $"\"{exePath}\"";
        var taskArgs = "--auto-basic-qc";

        return $@"<?xml version=""1.0"" encoding=""UTF-16""?>
<Task version=""1.4"" xmlns=""http://schemas.microsoft.com/windows/2004/02/mit/task"">
  <RegistrationInfo>
    <Description>Pramaan weekly automated basic QC health check</Description>
    <Author>Pramaan</Author>
  </RegistrationInfo>
  <Triggers>
    <WeeklyTrigger>
      <StartBoundary>{startBoundary}</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByWeek>
        <WeeksInterval>1</WeeksInterval>
        <DaysOfWeek>
          <{dayOfWeek} />
        </DaysOfWeek>
      </ScheduleByWeek>
    </WeeklyTrigger>
  </Triggers>
  <Principals>
    <Principal id=""Author"">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context=""Author"">
    <Exec>
      <Command>{taskCommand}</Command>
      <Arguments>{taskArgs}</Arguments>
    </Exec>
  </Actions>
</Task>";
    }
}
