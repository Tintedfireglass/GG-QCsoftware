using LaptopQC.Core.Models;
using System.Text;

namespace LaptopQC.Core.Services;

public class ReportGenerator
{
    public string GenerateHtmlReport(QCReport report)
    {
        var sb = new StringBuilder();
        
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html>");
        sb.AppendLine("<head>");
        sb.AppendLine($"<title>QC Report - {report.RefurbishId}</title>");
        sb.AppendLine("<style>");
        sb.AppendLine("body { font-family: Segoe UI, sans-serif; margin: 20px; color: #333; }");
        sb.AppendLine(".header { border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-bottom: 20px; }");
        sb.AppendLine(".info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }");
        sb.AppendLine(".status-pass { color: green; font-weight: bold; }");
        sb.AppendLine(".status-fail { color: red; font-weight: bold; }");
        sb.AppendLine(".test-section { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 5px; }");
        sb.AppendLine(".test-header { display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1em; background-color: #f5f5f5; padding: 10px; margin: -15px -15px 10px -15px; border-bottom: 1px solid #ddd; }");
        sb.AppendLine("ul { margin: 5px 0; padding-left: 20px; }");
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        
        // Header
        sb.AppendLine("<div class='header'>");
        sb.AppendLine($"<h1>Laptop QC Report: {report.RefurbishId}</h1>");
        sb.AppendLine($"<p>Date: {report.Timestamp}</p>");
        sb.AppendLine($"<p>Technician Notes: {report.TechnicianNotes}</p>");
        sb.AppendLine("</div>");

        // System Info
        sb.AppendLine("<h2>System Information</h2>");
        sb.AppendLine("<div class='info-grid'>");
        if (report.SystemInfo != null)
        {
            sb.AppendLine($"<div><strong>Manufacturer:</strong> {report.SystemInfo.Manufacturer}</div>");
            sb.AppendLine($"<div><strong>Model:</strong> {report.SystemInfo.Model}</div>");
            sb.AppendLine($"<div><strong>Serial:</strong> {report.SystemInfo.SerialNumber}</div>");
            sb.AppendLine($"<div><strong>MAC Address:</strong> {report.MacAddress}</div>");
        }
        if (report.CpuDetails != null)
             sb.AppendLine($"<div><strong>CPU:</strong> {report.CpuDetails.Name}</div>");
        if (report.RamDetails != null)
             sb.AppendLine($"<div><strong>RAM:</strong> {report.RamDetails.TotalCapacityGB} GB</div>");
        sb.AppendLine("</div>");

        // Detailed Specs
        sb.AppendLine("<h2>Hardware Specifications</h2>");
        sb.AppendLine("<div class='test-section'>");
        sb.AppendLine("<table style='width:100%; border-collapse: collapse;'>");
        
        if (report.SystemInfo != null)
        {
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>BIOS Version:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.SystemInfo.BiosVersion}</td></tr>");
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>OS Version:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.SystemInfo.OsVersion}</td></tr>");
        }

        if (report.CpuDetails != null)
        {
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>CPU:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.CpuDetails.Name}</td></tr>");
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Cores/Threads:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.CpuDetails.Cores} / {report.CpuDetails.Threads}</td></tr>");
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Base Clock:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.CpuDetails.MaxClockSpeedMHz} MHz</td></tr>");
        }

        if (report.DeviceDetails?.Gpus?.Any() == true)
        {
            foreach (var gpu in report.DeviceDetails.Gpus)
            {
                var mem = gpu.MemoryGB > 0 ? $"{gpu.MemoryGB:F1} GB" : "Unknown Memory";
                var res = gpu.CurrentResX > 0 ? $"({gpu.CurrentResX}x{gpu.CurrentResY} @ {gpu.CurrentRefreshRate}Hz)" : "";
                sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>GPU:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{gpu.Name} <br/><span style='font-size:0.9em;color:#666'>{mem} {res} - v{gpu.DriverVersion}</span></td></tr>");
            }
        }

        if (report.RamDetails != null)
        {
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Total RAM:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.RamDetails.TotalCapacityGB} GB</td></tr>");
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Slots Used:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.RamDetails.UsedSlots} / {report.RamDetails.TotalSlots}</td></tr>");
        }

        if (report.StorageDetails != null)
        {
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Storage Total:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.StorageDetails.TotalCapacityGB:F0} GB</td></tr>");
            foreach(var drive in report.StorageDetails.Devices)
            {
                var health = drive.HealthPercent.HasValue ? $"{drive.HealthPercent}% Health" : "Smart Data N/A";
                sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Drive:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{drive.Model} ({drive.SizeGB:F0} GB) - {drive.MediaType} - S/N: {drive.SerialNumber} <br/><span style='font-size:0.9em;color:#666'>{health}, {drive.PowerOnHours} hrs</span></td></tr>");
            }
        }

        if (report.BatteryDetails != null && report.BatteryDetails.IsPresent)
        {
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Battery:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.BatteryDetails.ManufactureName} {report.BatteryDetails.SerialNumber}</td></tr>");
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Capacity:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.BatteryDetails.FullChargedCapacityMWh} / {report.BatteryDetails.DesignedCapacityMWh} mWh ({report.BatteryDetails.WearLevelPercent}% Wear)</td></tr>");
            sb.AppendLine($"<tr><td style='padding:5px; border-bottom:1px solid #eee;'><strong>Cycle Count:</strong></td><td style='padding:5px; border-bottom:1px solid #eee;'>{report.BatteryDetails.CycleCount}</td></tr>");
        }
        
        sb.AppendLine("</table>");
        sb.AppendLine("</div>");

        // Overall Status
        var overallClass = report.OverallPass ? "status-pass" : "status-fail";
        var overallText = report.OverallPass ? "PASS" : "FAIL";
        sb.AppendLine($"<h2>Overall Status: <span class='{overallClass}'>{overallText}</span></h2>");
        
        // Test Results
        sb.AppendLine("<h2>Test Details</h2>");
        
        AppendTestSection(sb, "CPU", report.CpuTest);
        AppendTestSection(sb, "RAM", report.RamTest);
        AppendTestSection(sb, "Storage", report.StorageTest);
        AppendTestSection(sb, "SMART Health", report.SmartTest);
        AppendTestSection(sb, "Battery", report.BatteryTest);
        AppendTestSection(sb, "Keyboard", report.KeyboardTest);
        AppendTestSection(sb, "Trackpad", report.TrackpadTest);
        AppendTestSection(sb, "USB Ports", report.UsbTest);
        AppendTestSection(sb, "Audio / Video", report.AudioVideoTest);
        AppendTestSection(sb, "GPU Stress Test", report.GpuTest);

        sb.AppendLine("</body>");
        sb.AppendLine("</html>");
        
        return sb.ToString();
    }

    private void AppendTestSection(StringBuilder sb, string name, TestResult result)
    {
        var statusClass = result.Passed ? "status-pass" : "status-fail";
        var statusText = result.Passed ? "PASS" : "FAIL";
        if (!result.Tested)
        {
            statusClass = "";
            statusText = "NOT TESTED";
        }

        sb.AppendLine("<div class='test-section'>");
        sb.AppendLine("<div class='test-header'>");
        sb.AppendLine($"<span>{name}</span>");
        sb.AppendLine($"<span class='{statusClass}'>{statusText}</span>");
        sb.AppendLine("</div>");
        
        sb.AppendLine($"<p>{result.Message}</p>");
        
        if (result.Details.Any())
        {
            sb.AppendLine("<ul>");
            foreach (var detail in result.Details)
            {
                sb.AppendLine($"<li>{detail}</li>");
            }
            sb.AppendLine("</ul>");
        }
        
        sb.AppendLine("</div>");
    }

    public string SaveReport(QCReport report)
    {
        var html = GenerateHtmlReport(report);
        
        var folder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Reports");
        Directory.CreateDirectory(folder);
        
        var filename = $"QC_Report_{report.RefurbishId}_{report.Timestamp:yyyyMMdd_HHmmss}.html";
        // Sanitize filename
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            filename = filename.Replace(c, '_');
        }
        
        var path = Path.Combine(folder, filename);
        File.WriteAllText(path, html);
        
        return path;
    }
}
