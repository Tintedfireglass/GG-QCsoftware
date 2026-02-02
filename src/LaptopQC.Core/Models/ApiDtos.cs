using System.Text.Json.Serialization;

namespace LaptopQC.Core.Models;

// DTOs matching the Next.js API interface
public class SubmitQCResultRequest
{
    [JsonPropertyName("reportId")]
    public string ReportId { get; set; } = "";
    
    [JsonPropertyName("machineId")]
    public string MachineId { get; set; } = "";
    
    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; }
    
    [JsonPropertyName("refurbishId")]
    public string? RefurbishId { get; set; }
    
    [JsonPropertyName("technicianNotes")]
    public string? TechnicianNotes { get; set; }
    
    [JsonPropertyName("overallPass")]
    public bool OverallPass { get; set; }
    
    [JsonPropertyName("systemInfo")]
    public SystemInfoSnapshot? SystemInfo { get; set; }
    
    [JsonPropertyName("testResults")]
    public List<ApiTestResult> TestResults { get; set; } = new();
    
    // Detailed snapshots
    [JsonPropertyName("cpuDetails")]
    public object? CpuDetails { get; set; }
    
    [JsonPropertyName("ramDetails")]
    public object? RamDetails { get; set; }
    
    [JsonPropertyName("storageDetails")]
    public object? StorageDetails { get; set; }
    
    [JsonPropertyName("batteryDetails")]
    public object? BatteryDetails { get; set; }
    
    [JsonPropertyName("deviceDetails")]
    public object? DeviceDetails { get; set; }
}

public class SystemInfoSnapshot
{
    [JsonPropertyName("manufacturer")]
    public string? Manufacturer { get; set; }
    
    [JsonPropertyName("model")]
    public string? Model { get; set; }
    
    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; set; }
    
    [JsonPropertyName("macAddress")]
    public string? MacAddress { get; set; }
    
    [JsonPropertyName("cpuModel")]
    public string? CpuModel { get; set; }
    
    [JsonPropertyName("ramTotal")]
    public long? RamTotal { get; set; }
}

public class ApiTestResult
{
    [JsonPropertyName("testType")]
    public string TestType { get; set; } = "";
    
    [JsonPropertyName("tested")]
    public bool Tested { get; set; }
    
    [JsonPropertyName("passed")]
    public bool Passed { get; set; }
    
    [JsonPropertyName("message")]
    public string? Message { get; set; }
    
    [JsonPropertyName("details")]
    public object? Details { get; set; }
    
    [JsonPropertyName("timestamp")]
    public DateTime? Timestamp { get; set; }
}

public class SubmitResponse
{
    [JsonPropertyName("message")]
    public string? Message { get; set; }
    
    [JsonPropertyName("id")]
    public int Id { get; set; }
}
