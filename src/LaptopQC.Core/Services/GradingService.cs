using LaptopQC.Core.Models;
using System.Text.RegularExpressions;

namespace LaptopQC.Core.Services;

/// <summary>
/// Device grade tiers for refurbished laptop quality assessment
/// </summary>
public enum DeviceGrade
{
    A,  // 90-100: Like-new condition
    B,  // 80-89:  Good condition
    C,  // 70-79:  Acceptable condition
    D,  // 50-69:  Below average
    E,  // 1-49:   Poor condition
    F   // 0:      Non-functional
}

/// <summary>
/// Defines a scorable test component for the grading system.
/// ──────────────────────────────────────────────────────────
/// To ADD a new test:    Add a TestDefinition to GradingService.TestDefinitions
/// To REMOVE a test:     Remove its entry (or set Weight = 0)
/// To CHANGE priority:   Adjust the Weight value
/// ──────────────────────────────────────────────────────────
/// </summary>
public class TestDefinition
{
    /// <summary>Identifier matching the test type</summary>
    public required string Name { get; init; }
    
    /// <summary>Weight in the overall score. Higher = more impact on grade.</summary>
    public required int Weight { get; init; }
    
    /// <summary>Extracts the TestResult from a QCReport</summary>
    public required Func<QCReport, TestResult> GetResult { get; init; }
    
    /// <summary>
    /// Scoring function: takes (QCReport, TestResult) and returns 0-100.
    /// Return null to exclude this test from the weighted average
    /// (e.g., no battery on desktop, no discrete GPU).
    /// </summary>
    public required Func<QCReport, TestResult, int?> ScoreFunc { get; init; }
}

/// <summary>
/// Grades refurbished devices using a weighted scoring system.
/// All test definitions live in TestDefinitions — just add/remove entries.
/// </summary>
public class GradingService
{
    // ═══════════════════════════════════════════════════════════
    //  TEST REGISTRY — Add, remove, or reorder tests here
    // ═══════════════════════════════════════════════════════════

    public static readonly List<TestDefinition> TestDefinitions = new()
    {
        new() { Name = "Battery",    Weight = 25, GetResult = r => r.BatteryTest,    ScoreFunc = ScoreBattery },
        new() { Name = "SMART",      Weight = 20, GetResult = r => r.SmartTest,      ScoreFunc = ScoreSmart },
        new() { Name = "CPU",        Weight = 15, GetResult = r => r.CpuTest,        ScoreFunc = ScoreCpu },
        new() { Name = "GPU",        Weight = 10, GetResult = r => r.GpuTest,        ScoreFunc = ScoreGpu },
        new() { Name = "Keyboard",   Weight = 10, GetResult = r => r.KeyboardTest,   ScoreFunc = ScoreBinary },
        new() { Name = "RAM",        Weight = 5,  GetResult = r => r.RamTest,        ScoreFunc = ScoreRam },
        new() { Name = "Trackpad",   Weight = 5,  GetResult = r => r.TrackpadTest,   ScoreFunc = ScoreBinary },
        new() { Name = "Storage",    Weight = 4,  GetResult = r => r.StorageTest,    ScoreFunc = ScoreBinary },
        new() { Name = "USB",        Weight = 4,  GetResult = r => r.UsbTest,        ScoreFunc = ScoreBinary },
        new() { Name = "AudioVideo", Weight = 4,  GetResult = r => r.AudioVideoTest, ScoreFunc = ScoreBinary },
        new() { Name = "AudioJack",  Weight = 2,  GetResult = r => r.AudioJackTest,  ScoreFunc = ScoreBinary },
        new() { Name = "Network",    Weight = 3,  GetResult = r => r.NetworkTest,    ScoreFunc = ScoreNetwork },
    };

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════

    /// <summary>
    /// Scores and grades every test, then calculates the overall device grade.
    /// Call after ALL tests (automated + interactive) are complete.
    /// Also runs the PRAMAAN scoring engine (category-based, configurable).
    /// </summary>
    public void GradeReport(QCReport report, PramaanScoringConfig? pramaanConfig = null)
    {
        double totalWeightedScore = 0;
        double totalWeight = 0;

        foreach (var def in TestDefinitions)
        {
            var testResult = def.GetResult(report);

            if (!testResult.Tested)
                continue;

            int? score = def.ScoreFunc(report, testResult);

            if (score == null)
                continue;

            int clamped = Math.Clamp(score.Value, 0, 100);
            testResult.Score = clamped;
            testResult.Grade = ScoreToGrade(clamped).ToString();

            totalWeightedScore += clamped * def.Weight;
            totalWeight += def.Weight;
        }

        if (totalWeight > 0)
        {
            report.OverallScore = (int)Math.Round(totalWeightedScore / totalWeight);
            report.OverallGrade = ScoreToGrade(report.OverallScore).ToString();
        }
        else
        {
            report.OverallScore = 0;
            report.OverallGrade = DeviceGrade.F.ToString();
        }

        // ── PRAMAAN scoring ──
        var pramaanEngine = new PramaanScoringEngine(pramaanConfig);
        report.PramaanResult = pramaanEngine.ScoreReport(report);
    }

    /// <summary>Maps a score (0-100) to a DeviceGrade</summary>
    public static DeviceGrade ScoreToGrade(int score) => score switch
    {
        >= 90 => DeviceGrade.A,
        >= 80 => DeviceGrade.B,
        >= 70 => DeviceGrade.C,
        >= 50 => DeviceGrade.D,
        > 0   => DeviceGrade.E,
        _     => DeviceGrade.F
    };

    /// <summary>Human-readable label for a grade letter</summary>
    public static string GradeLabel(string grade) => grade switch
    {
        "A" => "Like-New Condition",
        "B" => "Good Condition",
        "C" => "Acceptable Condition",
        "D" => "Below Average",
        "E" => "Poor Condition",
        "F" => "Non-Functional",
        _   => "Unknown"
    };

    // ═══════════════════════════════════════════════════════════
    //  SCORING FUNCTIONS (0-100, null = exclude)
    // ═══════════════════════════════════════════════════════════

    /// <summary>Battery: health % + cycle count penalty. Null for desktops.</summary>
    private static int? ScoreBattery(QCReport report, TestResult _)
    {
        if (report.BatteryDetails == null || !report.BatteryDetails.IsPresent)
            return null;

        int health = report.BatteryDetails.HealthPercent ?? 100;
        int score = health switch
        {
            >= 90 => 100,
            >= 80 => 85,
            >= 70 => 70,
            >= 60 => 55,
            >= 50 => 40,
            _     => 20
        };

        uint cycles = report.BatteryDetails.CycleCount;
        if (cycles > 1500) score -= 10;
        else if (cycles > 1000) score -= 5;

        return Math.Max(0, score);
    }

    /// <summary>SMART: uses health score from SMART data. Penalizes self-test failure.</summary>
    private static int? ScoreSmart(QCReport report, TestResult result)
    {
        if (!result.Tested) return null;

        // Extract health scores from detail strings like "ModelName: Excellent (95%)"
        var scores = new List<int>();
        foreach (var detail in result.Details)
        {
            var match = Regex.Match(detail, @"\((\d+)%\)");
            if (match.Success && int.TryParse(match.Groups[1].Value, out int pct))
                scores.Add(pct);
        }

        int score = scores.Count > 0 ? (int)scores.Average() : (result.Passed ? 80 : 30);

        // Self-test failure caps the score
        if (result.Details.Any(d => d.Contains("Self-Test Failed", StringComparison.OrdinalIgnoreCase) && !d.Contains("Skipped")))
            score = Math.Min(score, 30);

        return Math.Clamp(score, 0, 100);
    }

    /// <summary>CPU: scored by throttle verdict keywords in test message.</summary>
    private static int? ScoreCpu(QCReport report, TestResult result)
    {
        if (!result.Tested) return null;

        string msg = (result.Message ?? "").ToUpperInvariant();

        if (msg.Contains("EXCELLENT")) return 100;
        if (msg.Contains("CRITICAL"))  return 10;
        if (msg.Contains("FAIL"))      return 30;
        if (msg.Contains("WARNING"))   return 55;
        if (msg.Contains("PASS"))      return 85;

        return result.Passed ? 80 : 25;
    }

    /// <summary>GPU: scored by temp/throttle. Null if no discrete GPU.</summary>
    private static int? ScoreGpu(QCReport report, TestResult result)
    {
        if (!result.Tested) return null;

        string msg = result.Message ?? "";
        if (msg.Contains("No discrete GPU", StringComparison.OrdinalIgnoreCase))
            return null;

        if (!result.Passed) return 15;

        // Parse max temp and clock drop from details
        double maxTemp = 0, clockDrop = 0;
        foreach (var detail in result.Details)
        {
            var tempMatch = Regex.Match(detail, @"Max Temperature:\s*([\d.]+)");
            if (tempMatch.Success) double.TryParse(tempMatch.Groups[1].Value, out maxTemp);

            var dropMatch = Regex.Match(detail, @"\((\d+)% drop\)");
            if (dropMatch.Success) double.TryParse(dropMatch.Groups[1].Value, out clockDrop);
        }

        int score = maxTemp switch
        {
            > 95 => 15,
            > 90 => 55,
            > 80 => 80,
            _    => 100
        };

        if (clockDrop > 30) score -= 25;

        return Math.Clamp(score, 0, 100);
    }

    /// <summary>RAM: stress pass/fail.</summary>
    private static int? ScoreRam(QCReport report, TestResult result)
    {
        if (!result.Tested) return null;

        if (result.Details.Any(d => d.Contains("Stress Test Failed", StringComparison.OrdinalIgnoreCase)))
            return 20;

        return result.Passed ? 100 : 25;
    }

    /// <summary>Binary scoring for interactive tests: 100 if passed, 0 if failed.</summary>
    private static int? ScoreBinary(QCReport _, TestResult result)
    {
        if (!result.Tested) return null;
        return result.Passed ? 100 : 0;
    }

    /// <summary>
    /// Network scoring: WiFi+Ethernet = 100, WiFi only = 85, Ethernet only = 70, none = 0.
    /// Looks for "WiFi: Connected" / "Ethernet: Connected" in result.Details.
    /// </summary>
    private static int? ScoreNetwork(QCReport _, TestResult result)
    {
        if (!result.Tested) return null;
        if (!result.Passed) return 0;

        bool hasWifi = result.Details.Any(d => d.Contains("WiFi: Connected", StringComparison.OrdinalIgnoreCase));
        bool hasEthernet = result.Details.Any(d => d.Contains("Ethernet: Connected", StringComparison.OrdinalIgnoreCase));

        return (hasWifi, hasEthernet) switch
        {
            (true, true)   => 100,
            (true, false)  => 85,
            (false, true)  => 70,
            _              => result.Passed ? 80 : 0  // Fallback if details don't match
        };
    }
}
