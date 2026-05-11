using Spectre.Console;
using Spectre.Console.Rendering;
using LaptopQC.Core.Models;
using LaptopQC.Hardware.Models;

namespace Pramaan.CLI.UI;

/// <summary>Renders the main Spectre.Console layout dashboard.</summary>
public static class DashboardRenderer
{
    public static Layout Build(DashboardState state)
    {
        var layout = new Layout("Root").SplitRows(
            new Layout("Header").Size(1),
            new Layout("Top").Ratio(4).SplitColumns(
                new Layout("Logo").Ratio(3),
                new Layout("SysInfo").Ratio(4),
                new Layout("Menu").Ratio(4)),
            new Layout("Summary").Ratio(4),
            new Layout("Details").Ratio(6).SplitColumns(
                new Layout("Health").Ratio(7),
                new Layout("Progress").Ratio(3)),
            new Layout("Bottom").Ratio(3).SplitColumns(
                new Layout("Reports").Ratio(7),
                new Layout("Help").Ratio(3)),
            new Layout("Footer").Size(2));

        layout["Header"].Update(BuildHeader());
        layout["Logo"].Update(BuildLogo());
        layout["SysInfo"].Update(BuildSysInfo(state));
        layout["Menu"].Update(BuildMenu(state));
        layout["Summary"].Update(BuildSummary(state));
        layout["Health"].Update(BuildComponentHealth(state));
        layout["Progress"].Update(BuildProgress(state));
        layout["Reports"].Update(BuildReports(state));
        layout["Help"].Update(BuildHelp());
        layout["Footer"].Update(BuildFooter(state));

        return layout;
    }

    // ── Panels ───────────────────────────────────────────────────────────────

    static IRenderable BuildHeader()
    {
        var time = DateTime.Now.ToString("MMM d, HH:mm:ss");
        return new Panel(new Markup(
            $"[purple]Pramaan CLI v1.0.0[/]          [bold white]Hardware Quality Check Dashboard[/]          [purple]{time}[/]"))
            { BorderStyle = Style.Parse("purple") };
    }

    static IRenderable BuildLogo()
    {
        var figlet = new FigletText("PRAMAAN").Color(Color.Purple).LeftJustified();
        return new Panel(new Rows(figlet, new Markup("  Trust. Verify. [purple]Sell Better.[/]")))
            .Border(BoxBorder.None);
    }

    static IRenderable BuildSysInfo(DashboardState s)
    {
        var g = new Grid();
        g.AddColumn(new GridColumn().NoWrap());
        g.AddColumn(new GridColumn().NoWrap());
        g.AddColumn(new GridColumn());

        var si = s.SystemInfo;
        g.AddRow("[grey]Computer[/]", "[grey]:[/]", $"[white]{si?.ComputerName ?? "—"}[/]");
        g.AddRow("[grey]Model   [/]", "[grey]:[/]", $"[white]{si?.Model ?? "—"}[/]");
        g.AddRow("[grey]Serial  [/]", "[grey]:[/]", $"[white]{si?.SerialNumber ?? "—"}[/]");
        g.AddRow("[grey]OS      [/]", "[grey]:[/]", $"[white]{si?.OsVersion ?? "—"}[/]");
        g.AddRow("[grey]Uptime  [/]", "[grey]:[/]", $"[white]{GetUptime()}[/]");
        g.AddRow("[grey]Report ID[/]", "[grey]:[/]", $"[white]{s.ReportId}[/]");

        return new Panel(g).Header("[purple]SYSTEM INFORMATION[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildMenu(DashboardState s)
    {
        var t = new Table().HideHeaders().Border(TableBorder.None).Expand();
        t.AddColumn("Item");
        for (int i = 0; i < DashboardState.MenuItems.Length; i++)
        {
            if (i == s.SelectedMenuIndex)
                t.AddRow($"[black on purple] {DashboardState.MenuItems[i].PadRight(38)} [/]");
            else
                t.AddRow($"[grey] {DashboardState.MenuItems[i]} [/]");
        }
        return new Panel(t).Header("[purple]QUICK ACTIONS[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildSummary(DashboardState s)
    {
        var g = new Grid().Expand();
        for (int i = 0; i < 7; i++) g.AddColumn(new GridColumn().PadRight(1));

        g.AddRow(
            BuildOverallCard(s),
            BuildCpuCard(s),
            BuildRamCard(s),
            BuildStorageCard(s),
            BuildBatteryCard(s),
            BuildHwTestCard(s),
            BuildAlertsCard(s)
        );

        return new Panel(g).Header("[purple]HEALTH SUMMARY[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildOverallCard(DashboardState s)
    {
        string scoreColor = s.OverallScore >= 80 ? "green" : s.OverallScore >= 60 ? "yellow" : "red";
        string bar = GetScoreBar(s.OverallScore);
        string content = s.OverallScore == 0
            ? "[grey]No scan yet[/]"
            : $"[bold {scoreColor}]{s.OverallScore}[/][grey]/100[/]\n[bold {scoreColor}]{s.GradeLabel}[/]\n{bar}\n[grey]Fails: {s.FailCount}[/]";
        return new Panel(new Markup(content)).Header("[white]OVERALL[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildCpuCard(DashboardState s)
    {
        var c = s.Report?.CpuDetails;
        var t = s.Report?.CpuTest;
        string status = GetStatusMarkup(t);
        string lines;
        if (c == null)
            lines = "[grey]Not scanned[/]";
        else
        {
            var shortName = c.Name.Length > 20 ? c.Name[..20] + "…" : c.Name;
            lines = $"[white]{shortName}[/]\n[grey]{c.Cores}C / {c.Threads}T[/]  [grey]{c.MaxClockSpeedMHz:N0} MHz[/]";
        }
        return new Panel(new Markup($"{status}\n{lines}")).Header("[white]⚙ CPU[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildRamCard(DashboardState s)
    {
        var rm = s.Report?.RamDetails;
        var t = s.Report?.RamTest;
        string status = GetStatusMarkup(t);
        string lines;
        if (rm == null)
            lines = "[grey]Not scanned[/]";
        else
        {
            var mod = rm.Modules.FirstOrDefault();
            string speed = mod?.SpeedMHz > 0 ? $"{mod.SpeedMHz} MHz" : "—";
            string type = mod?.MemoryType ?? "—";
            lines = $"[white]{rm.TotalCapacityGB} GB {type}[/]\n[grey]{rm.Modules.Count} slot(s)  {speed}[/]";
        }
        return new Panel(new Markup($"{status}\n{lines}")).Header("[white]🧠 MEMORY[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildStorageCard(DashboardState s)
    {
        var sd = s.Report?.StorageDetails;
        var t = s.Report?.StorageTest;
        string status = GetStatusMarkup(t);
        string lines;
        if (sd == null)
            lines = "[grey]Not scanned[/]";
        else
        {
            var primary = sd.Devices.Where(d => d.SizeGB > 1).OrderByDescending(d => d.SizeGB).FirstOrDefault();
            if (primary == null)
                lines = "[grey]No drives found[/]";
            else
            {
                string driveType = primary.IsSsd ? "SSD" : "HDD";
                string health = primary.HealthPercent.HasValue ? $"  [green]Health {primary.HealthPercent}%[/]" : "";
                lines = $"[white]{primary.SizeGB:F0} GB {driveType}[/]{health}\n[grey]{primary.Model.Truncate(22)}[/]";
            }
        }
        return new Panel(new Markup($"{status}\n{lines}")).Header("[white]💾 STORAGE[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildBatteryCard(DashboardState s)
    {
        var b = s.Report?.BatteryDetails;
        var t = s.Report?.BatteryTest;
        string status = GetStatusMarkup(t);
        string lines;
        if (b == null)
            lines = "[grey]Not scanned[/]";
        else if (!b.IsPresent)
            lines = "[grey]No battery\n(Desktop)[/]";
        else if (b.IsTampered)
            lines = "[red]Tampered[/]\n[grey]Cannot read[/]";
        else
        {
            string health = b.HealthPercent.HasValue ? $"[white]Health {b.HealthPercent}%[/]" : "[grey]Health N/A[/]";
            string charge = $"[grey]Charge {b.EstimatedChargeRemaining}%[/]";
            string cycles = b.CycleCount.HasValue ? $"  [grey]{b.CycleCount} cycles[/]" : "";
            lines = $"{health}\n{charge}{cycles}";
        }
        return new Panel(new Markup($"{status}\n{lines}")).Header("[white]🔋 BATTERY[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildHwTestCard(DashboardState s)
    {
        var r = s.Report;
        string status;
        string lines;
        if (r == null || CountHwTests(r) == 0)
        {
            status = "[grey]Not Run[/]";
            lines = "[grey]Run Full QC to\ncomplete manual tests[/]";
        }
        else
        {
            int passed = CountHwPassed(r);
            int total = CountHwTests(r);
            status = passed == total ? "[green]All Passed[/]" : $"[yellow]{passed}/{total} Passed[/]";
            var parts = new List<string>();
            if (r.KeyboardTest.Tested) parts.Add($"[{(r.KeyboardTest.Passed ? "green" : "red")}]KB[/]");
            if (r.TrackpadTest.Tested) parts.Add($"[{(r.TrackpadTest.Passed ? "green" : "red")}]TP[/]");
            if (r.UsbTest.Tested) parts.Add($"[{(r.UsbTest.Passed ? "green" : "red")}]USB[/]");
            if (r.AudioVideoTest.Tested) parts.Add($"[{(r.AudioVideoTest.Passed ? "green" : "red")}]A/V[/]");
            if (r.AudioJackTest.Tested) parts.Add($"[{(r.AudioJackTest.Passed ? "green" : "red")}]Jack[/]");
            if (r.NetworkTest.Tested) parts.Add($"[{(r.NetworkTest.Passed ? "green" : "red")}]Net[/]");
            lines = string.Join("  ", parts);
        }
        return new Panel(new Markup($"{status}\n{lines}")).Header("[white]✔ HW TESTS[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildAlertsCard(DashboardState s)
    {
        string content;
        if (s.Report == null)
            content = "[grey]—[/]";
        else
        {
            string fails = s.FailCount > 0 ? $"[red]{s.FailCount} FAIL[/]" : "[green]0 FAIL[/]";
            string warns = s.WarningCount > 0 ? $"[yellow]{s.WarningCount} WARN[/]" : "[grey]0 WARN[/]";
            content = $"{fails}\n{warns}";
        }
        return new Panel(new Markup(content)).Header("[white]⚠ ALERTS[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildComponentHealth(DashboardState s)
    {
        var t = new Table().Border(TableBorder.Simple).BorderColor(Color.Purple).Expand();
        t.AddColumn(new TableColumn("[purple]Component[/]").Width(12));
        t.AddColumn(new TableColumn("[purple]Status[/]").Width(8));
        t.AddColumn(new TableColumn("[purple]Details[/]"));
        t.AddColumn(new TableColumn("[purple]Score[/]").Width(8).RightAligned());

        var r = s.Report;
        if (r == null)
        {
            t.AddRow("[grey]No scan data yet. Select 'Run Diagnostics' or 'Run Full QC' to begin.[/]", "", "", "");
            return new Panel(t).Header("[purple]COMPONENT HEALTH[/]").BorderColor(Color.Purple).Expand();
        }

        AddHealthRow(t, "⚙ CPU",      r.CpuTest,      FormatCpuDetails(r));
        AddHealthRow(t, "🧠 Memory",  r.RamTest,      FormatRamDetails(r));
        AddHealthRow(t, "💾 Storage", r.StorageTest,  FormatStorageDetails(r));
        AddHealthRow(t, "🔋 Battery", r.BatteryTest,  FormatBatteryDetails(r));
        AddHealthRow(t, "🎮 GPU",     r.GpuTest,      FormatGpuDetails(r));
        AddHealthRow(t, "🖥 Display", r.AudioVideoTest, FormatDisplayDetails(r));
        AddHealthRow(t, "✔ HW Tests", null,           FormatHwTestDetails(r), showScoreAs: $"{CountHwPassed(r)}/{CountHwTests(r)}");

        return new Panel(t).Header("[purple]COMPONENT HEALTH[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildProgress(DashboardState s)
    {
        var g = new Grid().Expand();
        g.AddColumn(new GridColumn().NoWrap());
        g.AddColumn(new GridColumn().PadLeft(1));
        g.AddColumn(new GridColumn().RightAligned().NoWrap());

        g.AddRow("[grey]CPU Stress[/]",      MakeBar(s.ProgressCpu),      $"[green]{s.ProgressCpu}%[/]");
        g.AddRow("[grey]RAM Stress[/]",      MakeBar(s.ProgressRam),      $"[green]{s.ProgressRam}%[/]");
        g.AddRow("[grey]Storage Test[/]",    MakeBar(s.ProgressStorage),  $"[green]{s.ProgressStorage}%[/]");
        g.AddRow("[grey]GPU Stress[/]",      MakeBar(s.ProgressGpu),      $"[green]{s.ProgressGpu}%[/]");
        g.AddRow("[grey]Component Tests[/]", MakeBar(s.ProgressComp),     $"[green]{s.ProgressComp}%[/]");
        g.AddEmptyRow();
        g.AddRow($"[grey]Elapsed: {s.Elapsed}[/]");
        if (!string.IsNullOrEmpty(s.StatusMessage))
            g.AddRow($"[yellow]{s.StatusMessage.EscapeMarkup().Truncate(35)}[/]");

        return new Panel(g).Header("[purple]TEST PROGRESS[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildReports(DashboardState s)
    {
        var t = new Table().Border(TableBorder.None).Expand();
        t.AddColumn("[purple]Report ID[/]");
        t.AddColumn("[purple]Date & Time[/]");
        t.AddColumn("[purple]Score[/]");
        t.AddColumn("[purple]Status[/]");

        if (s.RecentReports.Count == 0)
            t.AddRow("[grey]No reports yet. Run Full QC to generate a certified report.[/]", "", "", "");
        else
            foreach (var rep in s.RecentReports.Take(5))
                t.AddRow($"[grey]{rep.Id}[/]", $"[grey]{rep.Date}[/]", $"[white]{rep.Score}[/]", $"[green]{rep.Status}[/]");

        return new Panel(t).Header("[purple]RECENT REPORTS[/]").BorderColor(Color.Purple).Expand();
    }

    static IRenderable BuildHelp() =>
        new Panel(new Markup("[grey]Use [green]↑/↓[/] to navigate • [green]Enter[/] to select\n\nRun [yellow]Full QC[/] for a complete certified report\nRun [yellow]Diagnostics[/] for hardware-only scan[/]"))
            .Header("[purple]HELP[/]").BorderColor(Color.Purple).Expand();

    static IRenderable BuildFooter(DashboardState s)
    {
        var tip = string.IsNullOrEmpty(s.FooterMessage)
            ? "Tip: Run Full QC regularly to keep your device in top condition."
            : s.FooterMessage;
        return new Rows(new Rule().RuleStyle("purple"), new Markup($"[yellow]{tip.EscapeMarkup()}[/]"));
    }

    // ── Detail Formatters ─────────────────────────────────────────────────────

    static string FormatCpuDetails(QCReport r)
    {
        var c = r.CpuDetails;
        if (c == null) return "—";
        // Base info
        var parts = new List<string> { c.Name };
        parts.Add($"{c.Cores}C / {c.Threads}T");
        if (c.MaxClockSpeedMHz > 0) parts.Add($"{c.MaxClockSpeedMHz:N0} MHz");
        // Stress verdict comes from Message (e.g. "FAIL: Thermal throttle detected — clock dropped 40%")
        var msg = r.CpuTest.Message;
        if (!string.IsNullOrEmpty(msg)) parts.Add(msg.Truncate(55));
        return string.Join(" | ", parts);
    }

    static string FormatRamDetails(QCReport r)
    {
        var rm = r.RamDetails;
        if (rm == null) return "—";
        var parts = new List<string> { $"{rm.TotalCapacityGB} GB Total" };
        var mod = rm.Modules.FirstOrDefault();
        if (mod != null)
        {
            if (!string.IsNullOrEmpty(mod.MemoryType)) parts.Add(mod.MemoryType);
            if (mod.SpeedMHz > 0) parts.Add($"@ {mod.SpeedMHz} MHz");
        }
        parts.Add($"{rm.Modules.Count} module(s)");
        return string.Join(" | ", parts);
    }

    static string FormatGpuDetails(QCReport r)
    {
        var gt = r.GpuTest;
        if (!gt.Tested) return "Not tested";
        var parts = new List<string>();
        var gpuName = gt.Details.FirstOrDefault(d => d.StartsWith("GPU:"));
        if (gpuName != null) parts.Add(gpuName[4..].Trim().Truncate(28));
        if (!string.IsNullOrEmpty(gt.Message)) parts.Add(gt.Message.Truncate(45));
        var tempDetail = gt.Details.FirstOrDefault(d => d.Contains("Temp") || d.Contains("°C"));
        if (tempDetail != null) parts.Add(tempDetail.Truncate(25));
        return parts.Count == 0 ? "—" : string.Join(" | ", parts);
    }

    static string FormatStorageDetails(QCReport r)
    {
        var sd = r.StorageDetails;
        if (sd == null) return "—";
        var drives = sd.Devices.Where(d => d.SizeGB > 1).ToList();
        if (drives.Count == 0) return "No physical drives found";
        var parts = new List<string>();
        foreach (var d in drives.Take(2))
        {
            string driveType = d.IsSsd ? "SSD" : "HDD";
            string health = d.HealthPercent.HasValue ? $" Health {d.HealthPercent}%" : "";
            parts.Add($"{d.Model.Truncate(18)} {d.SizeGB:F0}GB {driveType}{health}");
        }
        // append SMART self-test result if present
        var smartLine = r.StorageTest.Details.FirstOrDefault(l => l.StartsWith("Self-Test"));
        if (smartLine != null) parts.Add(smartLine);
        return string.Join("  ·  ", parts);
    }

    static string FormatBatteryDetails(QCReport r)
    {
        var b = r.BatteryDetails;
        if (b == null || !b.IsPresent) return "No battery / Desktop";
        if (b.IsTampered) return "Tampered — Cannot read data";
        var parts = new List<string>();
        parts.Add($"Charge: {b.EstimatedChargeRemaining}%");
        if (b.HealthPercent.HasValue) parts.Add($"Health: {b.HealthPercent}%");
        if (b.WearLevelPercent.HasValue) parts.Add($"Wear: {b.WearLevelPercent}%");
        if (b.CycleCount.HasValue) parts.Add($"Cycles: {b.CycleCount}");
        if (b.FullChargedCapacityMWh > 0 && b.DesignedCapacityMWh > 0)
            parts.Add($"Cap: {b.FullChargedCapacityMWh}/{b.DesignedCapacityMWh} mWh");
        return string.Join(" | ", parts);
    }

    static string FormatDisplayDetails(QCReport r)
    {
        var dd = r.DeviceDetails;
        if (dd == null) return "—";
        var parts = new List<string>();
        foreach (var d in dd.Displays.Take(2))
        {
            string res = d.ScreenWidth > 0 ? $" ({d.Resolution})" : "";
            parts.Add($"{d.Name}{res}");
        }
        if (dd.Camera != null) parts.Add($"Camera: {dd.Camera.Name.Truncate(20)}");
        foreach (var a in dd.AudioDevices.Take(2)) parts.Add($"Audio: {a.Name.Truncate(20)}");
        return parts.Count == 0 ? "No A/V devices detected" : string.Join("  ·  ", parts);
    }

    static string FormatHwTestDetails(QCReport r)
    {
        var parts = new List<string>();
        if (r.KeyboardTest.Tested)   parts.Add($"Keyboard: {(r.KeyboardTest.Passed ? "✓" : "✗")}");
        if (r.TrackpadTest.Tested)   parts.Add($"Trackpad: {(r.TrackpadTest.Passed ? "✓" : "✗")}");
        if (r.UsbTest.Tested)        parts.Add($"USB: {(r.UsbTest.Passed ? "✓" : "✗")}");
        if (r.AudioVideoTest.Tested) parts.Add($"A/V: {(r.AudioVideoTest.Passed ? "✓" : "✗")}");
        if (r.AudioJackTest.Tested)  parts.Add($"Jack: {(r.AudioJackTest.Passed ? "✓" : "✗")}");
        if (r.NetworkTest.Tested)    parts.Add($"Network: {(r.NetworkTest.Passed ? "✓" : "✗")}");
        return parts.Count == 0 ? "[grey]Not run — use Full QC[/]" : string.Join("  ·  ", parts);
    }

    // ── Shared Helpers ────────────────────────────────────────────────────────

    static void AddHealthRow(Table t, string component, TestResult? test, string details, string? showScoreAs = null)
    {
        string statusMarkup = test == null || !test.Tested ? "[grey]Not Run[/]" :
                              test.Passed ? "[green]Pass[/]" : "[red]Fail[/]";
        string score = showScoreAs ?? (test == null ? "—" : $"{test.Score}/100");
        t.AddRow($"[white]{component}[/]", statusMarkup,
                 $"[grey]{details.EscapeMarkup().Truncate(72)}[/]",
                 $"[grey]{score}[/]");
    }

    static string GetStatusMarkup(TestResult? t)
    {
        if (t == null || !t.Tested) return "[grey]Not Run[/]";
        return t.Passed ? "[green]● Pass[/]" : "[red]● Fail[/]";
    }

    static string GetScoreBar(int score)
    {
        int filled = score / 10;
        return $"[purple]{new string('█', filled)}[/][grey]{new string('░', 10 - filled)}[/]";
    }

    static string MakeBar(int pct)
    {
        int w = 18, f = (int)(w * pct / 100.0);
        return $"[green]{new string('█', f)}[/][grey]{new string('─', w - f)}[/]";
    }

    static int CountHwTests(QCReport r)
    {
        int c = 0;
        if (r.KeyboardTest.Tested) c++;
        if (r.TrackpadTest.Tested) c++;
        if (r.UsbTest.Tested) c++;
        if (r.AudioVideoTest.Tested) c++;
        if (r.AudioJackTest.Tested) c++;
        if (r.NetworkTest.Tested) c++;
        return c;
    }

    static int CountHwPassed(QCReport r)
    {
        int c = 0;
        if (r.KeyboardTest.Tested && r.KeyboardTest.Passed) c++;
        if (r.TrackpadTest.Tested && r.TrackpadTest.Passed) c++;
        if (r.UsbTest.Tested && r.UsbTest.Passed) c++;
        if (r.AudioVideoTest.Tested && r.AudioVideoTest.Passed) c++;
        if (r.AudioJackTest.Tested && r.AudioJackTest.Passed) c++;
        if (r.NetworkTest.Tested && r.NetworkTest.Passed) c++;
        return c;
    }

    static string GetUptime()
    {
        try
        {
            var uptimeSec = long.Parse(File.ReadAllText("/proc/uptime").Split(' ')[0].Replace(".", "")) / 100;
            var ts = TimeSpan.FromSeconds(uptimeSec);
            return $"{(int)ts.TotalHours}h {ts.Minutes}m";
        }
        catch { return "—"; }
    }
}

public static class StringExtensions
{
    public static string Truncate(this string s, int max) =>
        s.Length <= max ? s : s[..(max - 1)] + "…";
}
