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

    [JsonPropertyName("appVersion")]
    public string? AppVersion { get; set; }
    
    [JsonPropertyName("overallPass")]
    public bool OverallPass { get; set; }
    
    [JsonPropertyName("overallScore")]
    public int OverallScore { get; set; }
    
    [JsonPropertyName("overallGrade")]
    public string OverallGrade { get; set; } = "";
    
    [JsonPropertyName("technicianId")]
    public int? TechnicianId { get; set; }
    
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
    
    // PRAMAAN scoring data
    [JsonPropertyName("pramaanScore")]
    public int? PramaanScore { get; set; }
    
    [JsonPropertyName("healthId")]
    public string HealthId { get; set; } = "";
    
    [JsonPropertyName("pramaanHash")]
    public string PramaanHash { get; set; } = "";
    
    [JsonPropertyName("pramaanGrade")]
    public string? PramaanGrade { get; set; }
    
    [JsonPropertyName("pramaanCategoryScores")]
    public Dictionary<string, int>? PramaanCategoryScores { get; set; }
    
    [JsonPropertyName("pramaanRiskFlags")]
    public Dictionary<string, bool>? PramaanRiskFlags { get; set; }
    
    [JsonPropertyName("pramaanAlgorithmVersion")]
    public string? PramaanAlgorithmVersion { get; set; }
}

public class SystemInfoSnapshot
{
    [JsonPropertyName("computerName")]
    public string? ComputerName { get; set; }

    [JsonPropertyName("manufacturer")]
    public string? Manufacturer { get; set; }
    
    [JsonPropertyName("model")]
    public string? Model { get; set; }
    
    [JsonPropertyName("serialNumber")]
    public string? SerialNumber { get; set; }
    
    [JsonPropertyName("macAddress")]
    public string? MacAddress { get; set; }

    [JsonPropertyName("osVersion")]
    public string? OsVersion { get; set; }

    [JsonPropertyName("windowsProductName")]
    public string? WindowsProductName { get; set; }

    [JsonPropertyName("windowsActivationStatus")]
    public string? WindowsActivationStatus { get; set; }

    [JsonPropertyName("isWindowsActivated")]
    public bool? IsWindowsActivated { get; set; }

    [JsonPropertyName("windowsLastUpdatedAt")]
    public DateTime? WindowsLastUpdatedAt { get; set; }

    [JsonPropertyName("antivirusStatus")]
    public string? AntivirusStatus { get; set; }

    [JsonPropertyName("isAntivirusHealthy")]
    public bool? IsAntivirusHealthy { get; set; }

    [JsonPropertyName("deviceId")]
    public int? DeviceId { get; set; }
    
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
    
    [JsonPropertyName("score")]
    public int Score { get; set; }
    
    [JsonPropertyName("grade")]
    public string Grade { get; set; } = "";
    
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

    [JsonPropertyName("demoExhausted")]
    public bool DemoExhausted { get; set; }
}

public class SubmitMachineHistoryRequest
{
    [JsonPropertyName("machineId")]
    public string MachineId { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public DateTime Timestamp { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; } = "";

    [JsonPropertyName("componentGrades")]
    public Dictionary<string, ComponentGrade> ComponentGrades { get; set; } = new();

    [JsonPropertyName("appVersion")]
    public string? AppVersion { get; set; }
}

public class ComponentGrade
{
    [JsonPropertyName("score")]
    public int Score { get; set; }

    [JsonPropertyName("grade")]
    public string Grade { get; set; } = "";
}
