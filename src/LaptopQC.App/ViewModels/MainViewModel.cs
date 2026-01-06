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
        Results.Clear();

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
