using System.Diagnostics;

namespace LaptopQC.Core.Diagnostics.macOS;

/// <summary>
/// Helper to run macOS CLI commands and capture output.
/// Used by all Mac diagnostic implementations.
/// </summary>
internal static class CommandRunner
{
    /// <summary>
    /// Runs a command and returns stdout. Throws on non-zero exit code.
    /// </summary>
    public static string Run(string command, string arguments, int timeoutMs = 10000)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = command,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        string output = process.StandardOutput.ReadToEnd();
        process.WaitForExit(timeoutMs);

        return output;
    }

    /// <summary>
    /// Runs a command and returns stdout, or empty string on failure.
    /// </summary>
    public static string TryRun(string command, string arguments, int timeoutMs = 10000)
    {
        try
        {
            return Run(command, arguments, timeoutMs);
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// Runs a command and returns a single trimmed line of output.
    /// Useful for sysctl queries that return a single value.
    /// </summary>
    public static string RunSingleLine(string command, string arguments)
    {
        return TryRun(command, arguments).Trim();
    }
}
