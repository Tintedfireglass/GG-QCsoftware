using System.Net.Http.Json;
using System.Text.Json;
using LaptopQC.Core.Models;

namespace LaptopQC.Core.Services;

public class QCSubmissionService
{
    private readonly ApiConfiguration _config;
    private readonly HttpClient _httpClient;

    public QCSubmissionService(ApiConfiguration? config = null)
    {
        _config = config ?? new ApiConfiguration();
        _httpClient = new HttpClient();
        _httpClient.BaseAddress = new Uri(_config.ApiUrl);
        _httpClient.DefaultRequestHeaders.Add("X-API-Key", _config.ApiKey);
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<bool> SubmitReportAsync(QCReport report)
    {
        try
        {
            var request = MapToRequest(report);
            
            // Adjust the URL if base address ends with /api or not
            var endpoint = _config.ApiUrl.EndsWith("/api") ? "/api/qc-results" : "qc-results";
            // If base address is full path to API root
            if (_config.ApiUrl.EndsWith("/api"))
            {
                endpoint = "qc-results";
            }
            
            var response = await _httpClient.PostAsJsonAsync(endpoint, request);
            
            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<SubmitResponse>();
                return true;
            }
            else
            {
                var error = await response.Content.ReadAsStringAsync();
                System.Diagnostics.Debug.WriteLine($"API Submission Failed: {response.StatusCode} - {error}");
                return false;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"API Submission Error: {ex.Message}");
            return false;
        }
    }

    private SubmitQCResultRequest MapToRequest(QCReport report)
    {
        // Calculate total RAM safely
        long ramTotal = 0;
        if (report.RamDetails != null)
        {
            ramTotal = (long)(report.RamDetails.TotalCapacityGB * 1024 * 1024 * 1024); // Estimate bytes
        }

        var request = new SubmitQCResultRequest
        {
            ReportId = report.ReportId,
            MachineId = _config.StationId,
            Timestamp = report.Timestamp,
            RefurbishId = report.RefurbishId,
            TechnicianNotes = report.TechnicianNotes,
            OverallPass = report.OverallPass,
            
            SystemInfo = new SystemInfoSnapshot
            {
                Manufacturer = report.SystemInfo?.Manufacturer,
                Model = report.SystemInfo?.Model,
                SerialNumber = report.SystemInfo?.SerialNumber,
                MacAddress = report.MacAddress,
                CpuModel = report.CpuDetails?.Name,
                RamTotal = ramTotal > 0 ? ramTotal : (report.SystemInfo?.TotalMemoryBytes ?? 0)
            },
            
            CpuDetails = report.CpuDetails,
            RamDetails = report.RamDetails,
            StorageDetails = report.StorageDetails,
            BatteryDetails = report.BatteryDetails,
            DeviceDetails = report.DeviceDetails,
            
            TestResults = new List<ApiTestResult>()
        };

        // Helper to add test result
        void AddResult(string type, TestResult result)
        {
            request.TestResults.Add(new ApiTestResult
            {
                TestType = type,
                Tested = result.Tested,
                Passed = result.Passed,
                Message = result.Message,
                Details = result.Details,
                Timestamp = result.Timestamp == default ? report.Timestamp : result.Timestamp
            });
        }

        AddResult("CPU", report.CpuTest);
        AddResult("RAM", report.RamTest);
        AddResult("Storage", report.StorageTest);
        AddResult("SMART", report.SmartTest);
        AddResult("Battery", report.BatteryTest);
        AddResult("Keyboard", report.KeyboardTest);
        AddResult("Trackpad", report.TrackpadTest);
        AddResult("USB", report.UsbTest);
        AddResult("AudioVideo", report.AudioVideoTest);
        AddResult("GPU", report.GpuTest);

        return request;
    }
}
