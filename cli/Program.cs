using System;
using System.Linq;
using System.Threading.Tasks;
using Spectre.Console;
using LaptopQC.Core.Models;
using LaptopQC.Core.Services;
using LaptopQC.Hardware.Models;
using Pramaan.CLI.Diagnostics;
using Pramaan.CLI.UI;

namespace Pramaan.CLI;

class Program
{
    static DashboardState state = new();
    static bool isRunning = true;

    static async Task Main(string[] args)
    {
        Console.CursorVisible = false;

        // Gather basic system info upfront for header display
        try
        {
            var sysDiag = new LinuxSystemDiagnostic();
            state.SystemInfo = sysDiag.GetInfo();
        }
        catch { /* non-fatal */ }

        while (isRunning)
        {
            int? actionToRun = null;
            Console.CursorVisible = false;

            while (Console.KeyAvailable) Console.ReadKey(true);

            var layout = DashboardRenderer.Build(state);

            await AnsiConsole.Live(layout)
                .AutoClear(false)
                .Overflow(VerticalOverflow.Ellipsis)
                .Cropping(VerticalOverflowCropping.Top)
                .StartAsync(async ctx =>
                {
                    ctx.Refresh();

                    while (isRunning)
                    {
                        if (Console.KeyAvailable)
                        {
                            var key = Console.ReadKey(true);
                            switch (key.Key)
                            {
                                case ConsoleKey.UpArrow:
                                    state.SelectedMenuIndex =
                                        state.SelectedMenuIndex > 0
                                        ? state.SelectedMenuIndex - 1
                                        : DashboardState.MenuItems.Length - 1;
                                    break;

                                case ConsoleKey.DownArrow:
                                    state.SelectedMenuIndex =
                                        state.SelectedMenuIndex < DashboardState.MenuItems.Length - 1
                                        ? state.SelectedMenuIndex + 1
                                        : 0;
                                    break;

                                case ConsoleKey.Enter:
                                    actionToRun = state.SelectedMenuIndex;
                                    return; // Break out of Live context

                                case ConsoleKey.Q:
                                case ConsoleKey.Escape:
                                    isRunning = false;
                                    return; // Break out of Live context
                            }

                            ctx.UpdateTarget(DashboardRenderer.Build(state));
                            ctx.Refresh();
                        }

                        await Task.Delay(50);
                    }
                });

            if (!isRunning) break;

            if (actionToRun.HasValue)
            {
                Console.CursorVisible = true;
                AnsiConsole.Clear();
                await HandleMenuAction(actionToRun.Value);
                if (actionToRun.Value != 0 && actionToRun.Value != 3 && actionToRun.Value != 4)
                {
                    AnsiConsole.MarkupLine("\n[grey]Press any key to return to dashboard...[/]");
                    Console.ReadKey(true);
                }
                AnsiConsole.Clear();
            }
        }

        Console.CursorVisible = true;
        AnsiConsole.MarkupLine("\n[purple]Thank you for using Pramaan CLI.[/]\n");
    }

    static async Task HandleMenuAction(int action)
    {
        switch (action)
        {
            case 0: // Run Full QC
                state.StatusMessage = "Starting Full QC Wizard...";
                await new QCWizard(state).RunAsync();
                break;

            case 1: // Run Diagnostics Only
                await RunDiagnosticsOnlyWithLive();
                break;

            case 2: // Run Stress Tests Only
                await RunStressTestsOnlyWithLive();
                break;

            case 3: // View Results Table
                ShowResultsTable();
                break;

            case 4: // Settings (placeholder)
                state.StatusMessage = "Settings: Not yet implemented.";
                break;

            case 5: // Exit
                isRunning = false;
                break;
        }
    }

    static async Task RunDiagnosticsOnlyWithLive()
    {
        await AnsiConsole.Live(DashboardRenderer.Build(state))
            .AutoClear(false)
            .StartAsync(async ctx =>
            {
                await RunDiagnosticsOnly(ctx);
            });
    }

    static async Task RunStressTestsOnlyWithLive()
    {
        await AnsiConsole.Live(DashboardRenderer.Build(state))
            .AutoClear(false)
            .StartAsync(async ctx =>
            {
                await RunStressTestsOnly(ctx);
            });
    }

    static async Task RunDiagnosticsOnly(LiveDisplayContext ctx)
    {
        state.StatusMessage = "Running hardware diagnostics...";
        state.ProgressStorage = 0;
        ctx.UpdateTarget(DashboardRenderer.Build(state));
        ctx.Refresh();

        var report = state.Report ?? new QCReport();

        try
        {
            void Refresh(string msg) {
                state.StatusMessage = msg;
                ctx.UpdateTarget(DashboardRenderer.Build(state));
                ctx.Refresh();
            }

            Refresh("Gathering CPU info...");
            var cpuDiag = new LinuxCpuDiagnostic();
            report.CpuDetails = cpuDiag.GetInfo();
            var cpuVal = cpuDiag.ValidateCpu(report.CpuDetails);
            report.CpuTest = new TestResult { Tested = true, Passed = cpuVal.IsHealthy, Message = cpuVal.Message };
            report.CpuTest.Details.Add(report.CpuDetails.Name);

            Refresh("Gathering RAM info...");
            var ramDiag = new LinuxRamDiagnostic();
            report.RamDetails = ramDiag.GetInfo();
            var ramVal = ramDiag.ValidateRam(report.RamDetails);
            report.RamTest = new TestResult { Tested = true, Passed = ramVal.IsHealthy, Message = ramVal.Message };

            Refresh("Gathering storage info...");
            var storageDiag = new LinuxStorageDiagnostic();
            report.StorageDetails = storageDiag.GetInfo();
            var storVal = storageDiag.ValidateStorage(report.StorageDetails);
            report.StorageTest = new TestResult { Tested = true, Passed = storVal.IsHealthy, Message = storVal.Message };
            state.ProgressStorage = 50;

            Refresh("Gathering battery info...");
            var battDiag = new LinuxBatteryDiagnostic();
            report.BatteryDetails = battDiag.GetInfo();
            var batVal = battDiag.ValidateBattery(report.BatteryDetails);
            report.BatteryTest = new TestResult { Tested = true, Passed = batVal.IsHealthy, Message = batVal.Message };

            Refresh("Gathering device info...");
            var devDiag = new LinuxDeviceDiagnostic();
            report.DeviceDetails = devDiag.GetInfo();
            var wifiOk = report.DeviceDetails.NetworkDevices.Any(n => n.AdapterType == "WiFi" && n.IsConnected);
            var ethOk = report.DeviceDetails.NetworkDevices.Any(n => n.AdapterType == "Ethernet" && n.IsConnected);
            report.NetworkTest = new TestResult
            {
                Tested = true, Passed = wifiOk || ethOk,
                Message = (wifiOk || ethOk) ? "Network OK" : "No active connection"
            };

            // SMART
            Refresh("Running SMART checks...");
            var smartSvc = new LinuxSmartTestService();
            if (smartSvc.IsAvailable)
            {
                var hc = smartSvc.QuickHealthCheck();
                foreach (var dev in hc.Devices)
                {
                    report.StorageTest.Details.Add($"[SMART] {dev.Model}: {dev.HealthStatus} ({dev.HealthScore}%)");
                    // Best-effort: sync health% into StorageDetails for display
                var sd = report.StorageDetails?.Devices.FirstOrDefault(d =>
                    // Primary match: device path is always consistent on Linux
                    d.DeviceId.Equals(dev.DevicePath, StringComparison.OrdinalIgnoreCase) ||
                    // Fallback: model-name substring (for cases where DeviceId wasn't populated)
                    d.Model.Contains(dev.Model, StringComparison.OrdinalIgnoreCase) ||
                    dev.Model.Contains(d.Model, StringComparison.OrdinalIgnoreCase));
                if (sd != null)
                {
                    sd.HealthPercent = dev.HealthScore;
                    sd.Temperature = dev.Temperature;
                    sd.PowerOnHours = dev.PowerOnHours;
                    // Overwrite placeholder name (e.g. "NVME0N1") with the real vendor model
                    if (!string.IsNullOrWhiteSpace(dev.Model) && !dev.Model.StartsWith("/dev/", StringComparison.OrdinalIgnoreCase))
                        sd.Model = dev.Model;
                    // Populate serial if lsblk didn't provide one
                    if (string.IsNullOrWhiteSpace(sd.SerialNumber) && !string.IsNullOrWhiteSpace(dev.SerialNumber))
                        sd.SerialNumber = dev.SerialNumber;
                }
                }

                // Authoritative pass/fail comes directly from SMART — bypasses any prior
                // 'Inconclusive' result that fired before SMART data was available.
                // Also clear IsInconclusive so the GradingService doesn't hard-cap to 35.
                if (report.StorageDetails != null)
                {
                    report.StorageDetails.IsInconclusive = false;
                    report.StorageDetails.InconclusiveReason = null;
                }
                report.StorageTest.Passed = hc.OverallHealthy;
                report.StorageTest.Message = hc.OverallHealthy
                    ? $"{hc.Devices.Count} drive(s) healthy (SMART)"
                    : $"SMART health warning on {hc.Devices.Count(d => !d.HealthPassed)} drive(s)";
            }

            state.ProgressStorage = 100;
            state.UpdateFromReport(report);
            state.StatusMessage = "Diagnostics complete!";
        }
        catch (Exception ex)
        {
            state.StatusMessage = $"Error: {ex.Message}";
        }

        ctx.UpdateTarget(DashboardRenderer.Build(state));
        ctx.Refresh();
    }

    static async Task RunStressTestsOnly(LiveDisplayContext ctx)
    {
        state.StatusMessage = "Running stress tests...";
        state.ProgressCpu = 0; state.ProgressRam = 0; state.ProgressGpu = 0;
        ctx.UpdateTarget(DashboardRenderer.Build(state)); ctx.Refresh();

        var report = state.Report ?? new QCReport();

        void Refresh(string msg) {
            state.StatusMessage = msg;
            ctx.UpdateTarget(DashboardRenderer.Build(state));
            ctx.Refresh();
        }

        try
        {
            var cpuStress = new LinuxCpuStressTest(durationSeconds: 15);
            cpuStress.OnProgress += p => { state.ProgressCpu = p.PercentComplete; Refresh($"CPU Stress: {p.Status}"); };
            var cpuResult = await cpuStress.RunAsync();
            if (!report.CpuTest.Tested)
                report.CpuTest = new TestResult { Tested = true, Passed = cpuResult.Passed, Message = cpuResult.Message };
            else
                report.CpuTest.Passed &= cpuResult.Passed;
            report.CpuTest.Details.Add(cpuResult.Message);
            state.ProgressCpu = 100; Refresh("CPU stress complete.");

            var ramStress = new LinuxRamStressTest(testSizeMB: 512, iterations: 2);
            ramStress.OnProgress += p => { state.ProgressRam = p.PercentComplete; Refresh($"RAM Stress: {p.CurrentIteration}/{p.TotalIterations}"); };
            var ramResult = await ramStress.RunAsync();
            if (!report.RamTest.Tested)
                report.RamTest = new TestResult { Tested = true, Passed = ramResult.Passed, Message = ramResult.Message };
            else
                report.RamTest.Passed &= ramResult.Passed;
            report.RamTest.Details.Add(ramResult.Message);
            state.ProgressRam = 100; Refresh("RAM stress complete.");

            var gpuStress = new LinuxGpuStressTest(durationSeconds: 15);
            gpuStress.OnProgress += p => { state.ProgressGpu = p.PercentComplete; Refresh($"GPU Stress: {p.Status}"); };
            var gpuResult = await gpuStress.RunAsync();
            report.GpuTest = new TestResult { Tested = true, Passed = gpuResult.Passed, Message = gpuResult.Message };
            report.GpuTest.Details.Add($"GPU: {gpuResult.GpuName}");
            if (gpuResult.MaxTemp > 0) report.GpuTest.Details.Add($"Max Temp: {gpuResult.MaxTemp:F1}°C");
            state.ProgressGpu = 100;

            state.UpdateFromReport(report);
            state.StatusMessage = "Stress tests complete!";
        }
        catch (Exception ex)
        {
            state.StatusMessage = $"Stress test error: {ex.Message}";
        }

        ctx.UpdateTarget(DashboardRenderer.Build(state)); ctx.Refresh();
    }

    static void ShowResultsTable()
    {
        var report = state.Report;
        if (report == null)
        {
            state.StatusMessage = "No scan data yet. Run Diagnostics or Full QC first.";
            return;
        }

        AnsiConsole.Clear();

        var t = new Table().Border(TableBorder.Rounded).BorderColor(Color.Purple).Expand();
        t.AddColumn(new TableColumn("[purple]Component[/]"));
        t.AddColumn(new TableColumn("[purple]Test[/]"));
        t.AddColumn(new TableColumn("[purple]Result[/]"));
        t.AddColumn(new TableColumn("[purple]Score[/]").RightAligned());
        t.AddColumn(new TableColumn("[purple]Details[/]"));

        void AddRow(string comp, string test, TestResult r)
        {
            if (!r.Tested) return;
            var status = r.Passed ? "[green]✓ PASS[/]" : "[red]✗ FAIL[/]";
            var scoreStr = $"[white]{r.Score}[/][grey]/100[/]";
            
            var detailsList = new List<string>();
            if (!string.IsNullOrEmpty(r.Message)) detailsList.Add(r.Message);
            detailsList.AddRange(r.Details);
            
            var details = string.Join("\n", detailsList.Distinct());
            
            t.AddRow(
                new Markup($"[white]{comp}[/]"), 
                new Markup($"[grey]{test}[/]"), 
                new Markup(status), 
                new Markup(scoreStr), 
                new Markup($"[grey]{details.EscapeMarkup()}[/]")
            );
        }

        AddRow("CPU", "Detection + Stress", report.CpuTest);
        AddRow("RAM", "Detection + Stress", report.RamTest);
        AddRow("Storage", "SMART + Self-Test", report.StorageTest);
        AddRow("Battery", "Health Check", report.BatteryTest);
        AddRow("GPU", "Stress Test", report.GpuTest);
        AddRow("Network", "Connectivity", report.NetworkTest);
        AddRow("Keyboard", "Manual Test", report.KeyboardTest);
        AddRow("Trackpad", "Manual Test", report.TrackpadTest);
        AddRow("USB Ports", "Manual Test", report.UsbTest);
        AddRow("Audio/Video", "Manual Test", report.AudioVideoTest);
        AddRow("Audio Jack", "Manual Test", report.AudioJackTest);

        AnsiConsole.Write(t);

        var score = report.PramaanResult?.OverallHealthScore ?? report.OverallScore;
        var grade = report.PramaanResult?.GradeBand ?? report.OverallGrade;
        AnsiConsole.MarkupLine($"\n[bold white]Overall Score:[/] [bold yellow]{score}/100[/]  Grade: [bold green]{grade}[/]");
        AnsiConsole.MarkupLine("\n[grey]Press any key to return to dashboard...[/]");
        Console.ReadKey(true);
        AnsiConsole.Clear();
    }
}
