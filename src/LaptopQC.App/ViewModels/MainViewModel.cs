using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LaptopQC.Core.Diagnostics;
using LaptopQC.Hardware.Models;
using System.Collections.ObjectModel;

namespace LaptopQC.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly CpuDiagnostic _cpuDiagnostic;
    private readonly RamDiagnostic _ramDiagnostic;
    private readonly SystemDiagnostic _systemDiagnostic;

    [ObservableProperty]
    private SystemInfo? _systemInfo;

    [ObservableProperty]
    private CpuInfo? _cpuInfo;

    [ObservableProperty]
    private RamInfo? _ramInfo;

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private string _statusMessage = "Ready to scan";

    [ObservableProperty]
    private string _cpuStatus = "";

    [ObservableProperty]
    private string _ramStatus = "";

    public ObservableCollection<DiagnosticResult> Results { get; } = new();

    public MainViewModel()
    {
        _cpuDiagnostic = new CpuDiagnostic();
        _ramDiagnostic = new RamDiagnostic();
        _systemDiagnostic = new SystemDiagnostic();
    }

    [RelayCommand]
    private async Task RunDiagnosticsAsync()
    {
        IsScanning = true;
        StatusMessage = "Scanning hardware...";

        try
        {
            await Task.Run(() =>
            {
                // System Info
                SystemInfo = _systemDiagnostic.GetInfo();
                AddResult("System", "Detection", true, $"{SystemInfo.Manufacturer} {SystemInfo.Model}");

                // CPU
                CpuInfo = _cpuDiagnostic.GetInfo();
                var cpuValidation = _cpuDiagnostic.ValidateCpu(CpuInfo);
                CpuStatus = cpuValidation.Message;
                AddResult("CPU", "Detection", cpuValidation.IsHealthy, CpuInfo.Name);
                AddResult("CPU", "Cores/Threads", true, $"{CpuInfo.Cores} cores / {CpuInfo.Threads} threads");
                AddResult("CPU", "Clock Speed", true, $"{CpuInfo.MaxClockSpeedMHz} MHz");

                // RAM
                RamInfo = _ramDiagnostic.GetInfo();
                var ramValidation = _ramDiagnostic.ValidateRam(RamInfo);
                RamStatus = ramValidation.Message;
                AddResult("RAM", "Detection", ramValidation.IsHealthy, $"{RamInfo.TotalCapacityGB} GB Total");
                
                foreach (var module in RamInfo.Modules)
                {
                    AddResult("RAM", $"Slot {module.Slot}", true, 
                        $"{module.CapacityGB}GB {module.MemoryType} @ {module.SpeedMHz}MHz");
                }
            });

            StatusMessage = "Scan complete!";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
            AddResult("Error", "Scan Failed", false, ex.Message);
        }
        finally
        {
            IsScanning = false;
        }
    }

    [RelayCommand]
    private async Task RunStressTestsAsync()
    {
        IsScanning = true;
        StatusMessage = "Running stress tests... (This may take a minute)";
        
        try
        {
            // CPU Stress Test
            StatusMessage = "Stress testing CPU... (Initializing)";
            var cpuStress = new CpuStressTest(durationSeconds: 15);
            cpuStress.OnProgress += (p) => 
            {
                var temp = p.CurrentTemp > 0 ? $"{p.CurrentTemp:F0}°C" : "N/A";
                var speed = p.CurrentClock > 0 ? $" @ {p.CurrentClock:F0}MHz" : "";
                StatusMessage = $"Stress testing CPU: {p.PercentComplete}% | Temp: {temp}{speed}";
            };
            
            var cpuResult = await cpuStress.RunAsync();
            AddResult("CPU", "Stress Test", cpuResult.Passed, cpuResult.Message);
            
            // Add detailed metrics
            if (cpuResult.MaxTemp > 0)
                AddResult("CPU", "Max Temperature", cpuResult.MaxTemp <= 90, $"{cpuResult.MaxTemp:F1}°C");
            if (cpuResult.MaxClock > 0)
            {
                double throttlePercent = cpuResult.MaxClock > 0 ? (1 - cpuResult.MinClock / cpuResult.MaxClock) * 100 : 0;
                AddResult("CPU", "Clock Range", throttlePercent < 25, $"{cpuResult.MinClock:F0} - {cpuResult.MaxClock:F0} MHz ({throttlePercent:F0}% drop)");
            }
            
            CpuStatus = cpuResult.Passed ? "✓ Passed Stress Test" : "✗ Failed Stress Test";

            // RAM Stress Test
            StatusMessage = "Stress testing RAM...";
            var ramStress = new RamStressTest(testSizeMB: 512, iterations: 2);
            ramStress.OnProgress += (p) => 
            {
                StatusMessage = $"Stress testing RAM: {p.PercentComplete}%";
            };

            var ramResult = await ramStress.RunAsync();
            AddResult("RAM", "Stress Test", ramResult.Passed, ramResult.Message);
            RamStatus = ramResult.Passed ? "✓ Passed Stress Test" : "✗ Failed Stress Test";

            StatusMessage = "Stress tests complete!";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
            AddResult("Error", "Stress Test Failed", false, ex.Message);
        }
        finally
        {
            IsScanning = false;
        }
    }

    private void AddResult(string component, string test, bool passed, string details)
    {
        App.Current.Dispatcher.Invoke(() =>
        {
            Results.Add(new DiagnosticResult
            {
                Component = component,
                Test = test,
                Passed = passed,
                Details = details
            });
        });
    }
}

public class DiagnosticResult
{
    public string Component { get; set; } = "";
    public string Test { get; set; } = "";
    public bool Passed { get; set; }
    public string Details { get; set; } = "";
    public string Status => Passed ? "✓ PASS" : "✗ FAIL";
}
