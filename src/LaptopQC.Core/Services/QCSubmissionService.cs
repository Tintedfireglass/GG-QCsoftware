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
        var url = _config.ApiUrl;
        if (!url.EndsWith("/")) url += "/";
        _httpClient.BaseAddress = new Uri(url);
        _httpClient.DefaultRequestHeaders.Add("X-API-Key", _config.ApiKey);
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    /// <summary>
    /// Submit a QC report to the server.
    /// </summary>
    /// <param name="report">The QC report to submit</param>
    /// <param name="technicianId">Optional technician ID if user is logged in</param>
    /// <returns>True if submission was successful</returns>
    public async Task<bool> SubmitReportAsync(QCReport report, int? technicianId = null)
    {
        try
        {
            var request = MapToRequest(report, technicianId);
            
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

    private SubmitQCResultRequest MapToRequest(QCReport report, int? technicianId = null)
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
            OverallScore = report.OverallScore,
            OverallGrade = report.OverallGrade,
            TechnicianId = technicianId, // Include logged-in technician ID if available
            
            SystemInfo = new SystemInfoSnapshot
            {
                Manufacturer = report.SystemInfo?.Manufacturer,
                Model = report.SystemInfo?.Model,
                SerialNumber = report.SystemInfo?.SerialNumber,
                MacAddress = report.MacAddress,
                DeviceId = report.DeviceId,
                CpuModel = report.CpuDetails?.Name,

                RamTotal = ramTotal > 0 ? ramTotal : 0
            },
            
            CpuDetails = report.CpuDetails,
            RamDetails = report.RamDetails,
            StorageDetails = report.StorageDetails,
            BatteryDetails = report.BatteryDetails,
            DeviceDetails = report.DeviceDetails,
            
            // PRAMAAN scoring data
            PramaanScore = report.PramaanResult?.OverallHealthScore,
            PramaanGrade = report.PramaanResult?.GradeBand,
            PramaanCategoryScores = report.PramaanResult?.CategoryScores,
            PramaanRiskFlags = report.PramaanResult?.RiskFlags,
            PramaanAlgorithmVersion = report.PramaanResult?.AlgorithmVersion,
            
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
                Score = result.Score,
                Grade = result.Grade,
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
        AddResult("AudioJack", report.AudioJackTest);
        AddResult("GPU", report.GpuTest);
        AddResult("Network", report.NetworkTest);

        return request;
    }
}
