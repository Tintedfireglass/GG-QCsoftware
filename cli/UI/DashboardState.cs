using LaptopQC.Core.Models;
using LaptopQC.Hardware.Models;

namespace Pramaan.CLI.UI;

public record RecentReportEntry(string Id, string Date, string Score, string Status);

/// <summary>Mutable shared state for the dashboard live view.</summary>
public class DashboardState
{
    public static readonly string[] MenuItems =
    {
        "1. Run Full QC (Recommended)",
        "2. Run Diagnostics",
        "3. Run Stress Tests",
        "4. View Results Table",
        "5. Settings",
        "0. Exit"
    };

    public int SelectedMenuIndex { get; set; } = 0;
    public SystemInfo? SystemInfo { get; set; }
    public string ReportId { get; set; } = "PRM" + DateTime.Now.ToString("yyMMddHHmm");
    public QCReport? Report { get; set; }

    // Scores
    public int OverallScore { get; set; } = 0;
    public string GradeLabel { get; set; } = "N/A";
    public int WarningCount { get; set; } = 0;
    public int FailCount { get; set; } = 0;

    // Progress
    public int ProgressCpu { get; set; } = 0;
    public int ProgressRam { get; set; } = 0;
    public int ProgressStorage { get; set; } = 0;
    public int ProgressGpu { get; set; } = 0;
    public int ProgressComp { get; set; } = 0;
    public string Elapsed { get; set; } = "00:00:00";
    public string StatusMessage { get; set; } = "Ready. Use ↑/↓ and Enter to navigate.";
    public string FooterMessage { get; set; } = "";

    public List<RecentReportEntry> RecentReports { get; set; } = new();

    public void UpdateFromReport(QCReport r)
    {
        Report = r;
        OverallScore = r.PramaanResult?.OverallHealthScore ?? r.OverallScore;
        GradeLabel = GetGradeLabel(r.PramaanResult?.GradeBand ?? r.OverallGrade);

        // Count failures and warnings
        var tests = new[] { r.CpuTest, r.RamTest, r.StorageTest, r.BatteryTest,
                            r.GpuTest, r.NetworkTest, r.KeyboardTest, r.TrackpadTest,
                            r.UsbTest, r.AudioVideoTest, r.AudioJackTest };
        FailCount = tests.Count(t => t.Tested && !t.Passed);
        WarningCount = 0; // Could add warning logic based on scores < threshold
    }

    private static string GetGradeLabel(string? grade) => grade switch
    {
        "A+" => "EXCELLENT",
        "A"  => "VERY GOOD",
        "B"  => "GOOD",
        "C"  => "FAIR",
        "D"  => "POOR",
        "F"  => "FAILED",
        _    => "N/A"
    };
}
