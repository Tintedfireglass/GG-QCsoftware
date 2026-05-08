using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Spectre.Console;
using LaptopQC.Core.Models;
using LaptopQC.Core.Services;
using LaptopQC.Core.Diagnostics;
using Pramaan.CLI.Diagnostics;

namespace Pramaan.CLI;

class Program
{
    static async Task Main(string[] args)
    {
        AnsiConsole.Write(
            new FigletText("PRAMAAN CLI")
                .Centered()
                .Color(Color.Blue));

        var report = new QCReport();
        var sysDiag = new LinuxSystemDiagnostic();
        
        // ── Phase 1: Pre-Diagnostics (Gather Identity silently) ──
        await AnsiConsole.Status()
            .StartAsync("Initializing environment...", async ctx =>
            {
                ctx.Spinner(Spinner.Known.Dots);
                ctx.SpinnerStyle(Style.Parse("green"));
                
                // Get basic system info needed for licensing
                report.SystemInfo = sysDiag.GetInfo();
                report.MacAddress = report.SystemInfo?.MacAddress ?? "";
                await Task.Delay(200); // UI visual buffer
            });

        string machineSerial = MachineIdentityService.GetBestIdentityKey(
            report.SystemInfo?.SerialNumber,
            report.SystemInfo?.MacAddress,
            report.SystemInfo?.ComputerName);

        // ── Phase 2: Authentication Flow ──
        var authService = new AuthService();
        var trialService = new TrialService();
        string? activeToken = null;
        bool isUnactivated = false;

        // Check if we are already activated
        if (authService.IsLoggedIn)
        {
            AnsiConsole.MarkupLine($"[green]✓ Activated with License Key:[/] {authService.LicenseKey}");
            activeToken = authService.Token;
            report.DeviceId = authService.MachineId ?? 0;
        }
        else if (trialService.IsTrialActive)
        {
            AnsiConsole.MarkupLine($"[yellow]✓ Active Trial:[/] {trialService.CurrentTrial?.Email} ({trialService.DaysRemaining} days remaining)");
            activeToken = trialService.CurrentTrial?.Token;
        }
        else
        {
            // Prompt user for action
            var choice = AnsiConsole.Prompt(
                new SelectionPrompt<string>()
                    .Title("\n[bold]Activation Required[/]\nChoose an option to continue:")
                    .PageSize(4)
                    .AddChoices(new[] {
                        "🔑 Activate License Key",
                        "⏳ Start 7-Day Free Trial",
                        "⚠️ Continue Unactivated (Limited Features)"
                    }));

            if (choice.Contains("Activate License Key"))
            {
                var key = AnsiConsole.Prompt(new TextPrompt<string>("Enter your [green]16-digit License Key[/]:"));
                
                var result = await default(Task<LoginResult>); // placeholder for spinner
                await AnsiConsole.Status().StartAsync("Activating...", async ctx => 
                {
                    result = await authService.LoginWithLicenseAsync(key, machineSerial, report.SystemInfo?.MacAddress, report.SystemInfo?.ComputerName);
                });

                if (result.Success)
                {
                    AnsiConsole.MarkupLine("[bold green]Activation Successful![/]\n");
                    activeToken = authService.Token;
                    report.DeviceId = authService.MachineId ?? 0;
                }
                else
                {
                    AnsiConsole.MarkupLine($"[bold red]Activation Failed:[/] {result.Message}");
                    isUnactivated = true;
                }
            }
            else if (choice.Contains("Start 7-Day Free Trial"))
            {
                var email = AnsiConsole.Prompt(
                    new TextPrompt<string>("Enter your [yellow]Email Address[/]:")
                        .Validate(e => e.Contains("@") ? ValidationResult.Success() : ValidationResult.Error("[red]Please enter a valid email[/]")));

                var result = await default(Task<TrialResult>);
                await AnsiConsole.Status().StartAsync("Starting trial...", async ctx => 
                {
                    result = await trialService.StartOrRefreshTrialAsync(email, machineSerial, report.SystemInfo?.MacAddress, report.SystemInfo?.ComputerName);
                });

                if (result.Success)
                {
                    AnsiConsole.MarkupLine($"[bold green]Trial Started![/] You have {result.DaysRemaining} days remaining.\n");
                    activeToken = result.Token;
                }
                else
                {
                    AnsiConsole.MarkupLine($"[bold red]Trial Failed:[/] {result.ErrorMessage}");
                    isUnactivated = true;
                }
            }
            else
            {
                AnsiConsole.MarkupLine("[yellow]Continuing in unactivated mode. Submissions will be limited.[/]\n");
                isUnactivated = true;
            }
        }

        // ── Phase 3a: Refurbishment Metadata ──
        AnsiConsole.MarkupLine("\n[bold cyan]── Session Details ──[/]");
        report.RefurbishId = AnsiConsole.Prompt(
            new TextPrompt<string>("Enter [green]Refurbish ID / Order ID[/] (optional):")
                .AllowEmpty());
                
        report.TechnicianNotes = AnsiConsole.Prompt(
            new TextPrompt<string>("Enter [green]Technician Notes[/] (optional):")
                .AllowEmpty());

        // ── Phase 3b: Automated Diagnostics & Stress Tests ──
        AnsiConsole.MarkupLine("\n[bold cyan]── Automated Hardware Diagnostics ──[/]");
        
        await AnsiConsole.Status()
            .StartAsync("Gathering Basic Info...", async ctx =>
            {
                ctx.Spinner(Spinner.Known.Dots);
                ctx.SpinnerStyle(Style.Parse("green"));

                ctx.Status("Gathering CPU Info...");
                var cpuDiag = new LinuxCpuDiagnostic();
                report.CpuDetails = cpuDiag.GetInfo();
                var cpuVal = cpuDiag.ValidateCpu(report.CpuDetails);
                report.CpuTest = new TestResult { Tested = true, Passed = cpuVal.IsHealthy, Message = cpuVal.Message };
                report.CpuTest.Details.Add(report.CpuDetails.Name);
                report.CpuTest.Details.Add($"{report.CpuDetails.Cores} cores / {report.CpuDetails.Threads} threads");
                
                ctx.Status("Gathering RAM Info...");
                var ramDiag = new LinuxRamDiagnostic();
                report.RamDetails = ramDiag.GetInfo();
                var ramVal = ramDiag.ValidateRam(report.RamDetails);
                report.RamTest = new TestResult { Tested = true, Passed = ramVal.IsHealthy, Message = ramVal.Message };
                report.RamTest.Details.Add($"{report.RamDetails.TotalCapacityGB} GB Total");
                
                ctx.Status("Gathering Storage Info...");
                var storageDiag = new LinuxStorageDiagnostic();
                report.StorageDetails = storageDiag.GetInfo();
                var storageVal = storageDiag.ValidateStorage(report.StorageDetails);
                report.StorageTest = new TestResult { Tested = true, Passed = storageVal.IsHealthy, Message = storageVal.Message };
                foreach(var d in report.StorageDetails.Devices)
                {
                    report.StorageTest.Details.Add($"{d.Model} ({d.SizeGB:F0} GB {(d.IsSsd ? "SSD" : "HDD")})");
                }

                ctx.Status("Gathering Battery Info...");
                var batteryDiag = new LinuxBatteryDiagnostic();
                report.BatteryDetails = batteryDiag.GetInfo();
                var batteryVal = batteryDiag.ValidateBattery(report.BatteryDetails);
                report.BatteryTest = new TestResult { Tested = true, Passed = batteryVal.IsHealthy, Message = batteryVal.Message };
                if (report.BatteryDetails.IsPresent && !report.BatteryDetails.IsTampered)
                {
                    report.BatteryTest.Details.Add($"Health: {report.BatteryDetails.HealthPercent}%");
                    report.BatteryTest.Details.Add($"Cycle Count: {report.BatteryDetails.CycleCount}");
                }

                ctx.Status("Gathering Peripheral Info...");
                var deviceDiag = new LinuxDeviceDiagnostic();
                report.DeviceDetails = deviceDiag.GetInfo();
                var deviceVal = deviceDiag.ValidateDevices(report.DeviceDetails);
                
                // Record Network test explicitly from DeviceDetails (like WPF)
                bool wifiConnected = report.DeviceDetails.NetworkDevices.Any(n => n.AdapterType == "WiFi" && n.IsConnected);
                bool ethConnected = report.DeviceDetails.NetworkDevices.Any(n => n.AdapterType == "Ethernet" && n.IsConnected);
                report.NetworkTest = new TestResult 
                { 
                    Tested = true, 
                    Passed = wifiConnected || ethConnected,
                    Message = (wifiConnected || ethConnected) ? "Network OK" : "No active network connection"
                };
                if (wifiConnected) report.NetworkTest.Details.Add("WiFi: Connected");
                if (ethConnected) report.NetworkTest.Details.Add("Ethernet: Connected");
            });

        // ── SMART Tests ──
        AnsiConsole.MarkupLine("[bold grey]Starting SMART Health Check...[/]");
        var smartService = new LinuxSmartTestService();
        if (smartService.IsAvailable)
        {
            var healthCheck = smartService.QuickHealthCheck();
            foreach (var device in healthCheck.Devices)
            {
                report.StorageTest.Details.Add($"[SMART] {device.Model}: {device.HealthStatus} ({device.HealthScore}%)");
                
                // Sync health data to report storage details
                var storageDevice = report.StorageDetails?.Devices.FirstOrDefault(d => 
                    d.Model.Contains(device.Model, StringComparison.OrdinalIgnoreCase) || 
                    device.Model.Contains(d.Model, StringComparison.OrdinalIgnoreCase));
                    
                if (storageDevice != null)
                {
                    storageDevice.HealthPercent = device.HealthScore;
                    storageDevice.Temperature = device.Temperature;
                    storageDevice.PowerOnHours = device.PowerOnHours;
                }
                
                // Run short self-test
                if (device.HealthPassed)
                {
                    await AnsiConsole.Progress()
                        .StartAsync(async ctx =>
                        {
                            var task = ctx.AddTask($"[green]SMART Self-Test ({device.Model})[/]", new ProgressTaskSettings { MaxValue = 100 });
                            var progress = new Progress<SmartTestProgress>(p => 
                            {
                                task.Value = p.PercentComplete;
                                task.Description = $"[green]SMART Self-Test ({device.Model})[/] - {p.Status}";
                            });
                            
                            var testResult = await smartService.RunShortTestAsync(device.DevicePath, progress, device.DeviceType);
                            
                            if (testResult.Success && testResult.Passed)
                                report.StorageTest.Details.Add($"Self-Test Passed: {device.Model}");
                            else
                                report.StorageTest.Details.Add($"Self-Test Failed/Inconclusive: {device.Model} ({testResult.Message})");
                        });
                }
            }
            if (!healthCheck.OverallHealthy)
            {
                report.StorageTest.Passed = false;
                report.StorageTest.Message += " (SMART Warning/Fail)";
            }
            
            var finalStorageVal = new LinuxStorageDiagnostic().ValidateStorage(report.StorageDetails);
            report.StorageTest.Passed &= finalStorageVal.IsHealthy;
            report.StorageTest.Message = finalStorageVal.Message + (healthCheck.OverallHealthy ? "" : " (SMART Warning/Fail)");
        }
        else
        {
            AnsiConsole.MarkupLine("[yellow]smartctl not available, skipping SMART checks.[/]");
            report.StorageTest.Details.Add("SMART tools not available for self-test");
            
            var finalStorageVal = new LinuxStorageDiagnostic().ValidateStorage(report.StorageDetails);
            report.StorageTest.Passed &= finalStorageVal.IsHealthy;
            report.StorageTest.Message = finalStorageVal.Message;
        }

        // ── Stress Tests ──
        // CPU Stress
        await AnsiConsole.Progress()
            .StartAsync(async ctx =>
            {
                var cpuStress = new LinuxCpuStressTest(durationSeconds: 15);
                var task = ctx.AddTask("[blue]CPU Stress Test[/]", new ProgressTaskSettings { MaxValue = 100 });
                cpuStress.OnProgress += p => 
                {
                    task.Value = p.PercentComplete;
                    task.Description = $"[blue]CPU Stress Test[/] - {p.Status}";
                };
                
                var cpuResult = await cpuStress.RunAsync();
                report.CpuTest.Passed &= cpuResult.Passed;
                report.CpuTest.Details.Add(cpuResult.Message);
            });

        // RAM Stress
        await AnsiConsole.Progress()
            .StartAsync(async ctx =>
            {
                var ramStress = new LinuxRamStressTest(testSizeMB: 512, iterations: 2);
                var task = ctx.AddTask("[blue]RAM Stress Test[/]", new ProgressTaskSettings { MaxValue = 100 });
                ramStress.OnProgress += p => 
                {
                    task.Value = p.PercentComplete;
                    task.Description = $"[blue]RAM Stress Test[/] - Iteration {p.CurrentIteration}/{p.TotalIterations} ({p.PercentComplete}%)";
                };
                
                var ramResult = await ramStress.RunAsync();
                report.RamTest.Passed &= ramResult.Passed;
                report.RamTest.Details.Add(ramResult.Message);
            });

        // GPU Stress
        await AnsiConsole.Progress()
            .StartAsync(async ctx =>
            {
                var gpuStress = new LinuxGpuStressTest(durationSeconds: 15);
                var task = ctx.AddTask("[blue]GPU Stress Test[/]", new ProgressTaskSettings { MaxValue = 100 });
                gpuStress.OnProgress += p => 
                {
                    task.Value = p.PercentComplete;
                    task.Description = $"[blue]GPU Stress Test[/] - {p.Status}";
                };
                
                var gpuResult = await gpuStress.RunAsync();
                report.GpuTest = new TestResult 
                { 
                    Tested = true, 
                    Passed = gpuResult.Passed, 
                    Message = gpuResult.Message 
                };
                report.GpuTest.Details.Add($"GPU: {gpuResult.GpuName}");
                if (gpuResult.MaxTemp > 0)
                    report.GpuTest.Details.Add($"Max Temperature: {gpuResult.MaxTemp:F1}°C");
            });

        // ── Phase 4: Interactive Manual Tests ──
        AnsiConsole.MarkupLine("\n[bold cyan]── Interactive Component Tests ──[/]");
        AnsiConsole.MarkupLine("[grey]Please answer Y/N for the following components based on your physical testing.[/]\n");

        bool CheckManual(string component, string details)
        {
            return AnsiConsole.Confirm($"Did the [bold white]{component}[/] work correctly? [grey]({details})[/]");
        }

        report.KeyboardTest = new TestResult { Tested = true, Passed = CheckManual("Keyboard", "All keys register correctly"), Message = "Manual verification" };
        report.TrackpadTest = new TestResult { Tested = true, Passed = CheckManual("Trackpad", "Mouse movement and clicks work"), Message = "Manual verification" };
        report.UsbTest = new TestResult { Tested = true, Passed = CheckManual("USB Ports", $"Tested physical ports"), Message = "Manual verification" };
        report.AudioVideoTest = new TestResult { Tested = true, Passed = CheckManual("Audio/Video", "Speakers and webcam work"), Message = "Manual verification" };
        report.AudioJackTest = new TestResult { Tested = true, Passed = CheckManual("Audio Jack", "Headphone jack outputs sound"), Message = "Manual verification" };

        // ── Phase 5 & 6: Grading & Submission ──
        var submitSuccess = false;
        string? errorMessage = null;

        await AnsiConsole.Status()
            .StartAsync("Scoring and Submitting...", async ctx =>
            {
                ctx.Spinner(Spinner.Known.Dots);
                ctx.SpinnerStyle(Style.Parse("green"));

                ctx.Status("Grading Report...");
                var gradingService = new GradingService();
                
                // Get active config from PRAMAAN cloud for the engine
                var configService = new PramaanConfigService();
                var liveConfig = await configService.GetActiveConfigAsync();
                
                gradingService.GradeReport(report, liveConfig);

                ctx.Status("Submitting to Cloud...");
                var submitService = new QCSubmissionService();
                var submitResult = await submitService.SubmitReportAsync(report, null, activeToken);

                submitSuccess = submitResult.Success;
                if (!submitSuccess)
                {
                    errorMessage = submitResult.ErrorMessage;
                }
            });

        // ── Output Summary ──
        AnsiConsole.MarkupLine("\n[bold cyan]── Final Results ──[/]");
        var table = new Table();
        table.AddColumn("Component");
        table.AddColumn("Status");
        table.AddColumn("Details");
        
        table.AddRow("System", report.SystemInfo?.ComputerName ?? "Unknown", report.SystemInfo?.SerialNumber ?? "");
        table.AddRow("CPU", report.CpuTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", report.CpuTest.Message);
        table.AddRow("RAM", report.RamTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", report.RamTest.Message);
        table.AddRow("Storage", report.StorageTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", report.StorageTest.Message);
        table.AddRow("Battery", report.BatteryTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", report.BatteryTest.Message);
        table.AddRow("GPU", report.GpuTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", report.GpuTest.Message);
        table.AddRow("Network", report.NetworkTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", report.NetworkTest.Message);
        table.AddRow("Keyboard", report.KeyboardTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", "Manual Check");
        table.AddRow("Trackpad", report.TrackpadTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", "Manual Check");
        table.AddRow("USB", report.UsbTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", "Manual Check");
        table.AddRow("Audio/Video", report.AudioVideoTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", "Manual Check");
        table.AddRow("Audio Jack", report.AudioJackTest.Passed ? "[green]PASS[/]" : "[red]FAIL[/]", "Manual Check");
        
        AnsiConsole.Write(table);

        // PRAMAAN Scores Table
        if (report.PramaanResult != null)
        {
            var pTable = new Table();
            pTable.AddColumn("PRAMAAN Category");
            pTable.AddColumn("Score");
            foreach (var cat in report.PramaanResult.CategoryScores)
            {
                string label = cat.Key.Replace("_", " ").ToUpper();
                if (label == "THERMAL") label = "THERMAL (CPU/GPU)";
                pTable.AddRow(label, cat.Value.ToString() + "/100");
            }
            AnsiConsole.Write(pTable);
        }

        AnsiConsole.MarkupLine($"\n[bold white]Overall Health Score:[/] [bold yellow]{report.PramaanResult?.OverallHealthScore ?? report.OverallScore}[/] (Grade: [bold green]{report.PramaanResult?.GradeLabel ?? report.OverallGrade}[/])");
        
        if (submitSuccess)
        {
            var apiConfig = new ApiConfiguration();
            var domain = apiConfig.ApiUrl.Replace("/api", "");
            if (domain.EndsWith("/")) domain = domain.TrimEnd('/');
            
            var reportUrl = $"{domain}/reports/{report.HealthId}";

            AnsiConsole.MarkupLine($"\n[bold cyan]Cloud Report Link:[/] [link={reportUrl}]{reportUrl}[/]\n");
        }
        else
        {
            AnsiConsole.MarkupLine($"\n[bold red]Cloud Submission Failed:[/] {errorMessage}\n");
        }
    }
}
