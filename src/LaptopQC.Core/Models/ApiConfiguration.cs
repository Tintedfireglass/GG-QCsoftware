namespace LaptopQC.Core.Models;

public class ApiConfiguration
{
    // Default to localhost for now, user can change via config file later
    public string ApiUrl { get; set; } = "http://localhost:3000/api";
    
    // Default API key matching the one in setup-guide.md
    public string ApiKey { get; set; } = "laptopqc-api-key-2024-change-this-to-something-secure";
    
    public bool AutoSubmitEnabled { get; set; } = true;
    public string StationId { get; set; } = Environment.MachineName;
}
