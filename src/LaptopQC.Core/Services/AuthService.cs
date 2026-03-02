using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace LaptopQC.Core.Services;

/// <summary>
/// Handles optional user authentication for the desktop app.
/// The app works locally without login, but login allows associating results with a technician.
/// </summary>
public class AuthService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiUrl;
    
    public bool IsLoggedIn => CurrentUser != null;
    public UserInfo? CurrentUser { get; private set; }
    public string? Token { get; private set; }

    public AuthService(string apiUrl = "https://gg-qcsoftware.vercel.app/api")
    {
        _apiUrl = apiUrl.TrimEnd('/');
        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(15)
        };
    }

    /// <summary>
    /// Attempt to login with username and password.
    /// </summary>
    public async Task<LoginResult> LoginAsync(string username, string password)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync($"{_apiUrl}/auth/login", new
            {
                username,
                password
            });

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<LoginResponse>();
                if (result != null)
                {
                    CurrentUser = result.User;
                    Token = result.Token;
                    return new LoginResult { Success = true, Message = "Login successful" };
                }
            }
            
            var error = await response.Content.ReadAsStringAsync();
            return new LoginResult { Success = false, Message = error ?? "Login failed" };
        }
        catch (HttpRequestException ex)
        {
            return new LoginResult 
            { 
                Success = false, 
                Message = $"Cannot connect to server. Working offline.\nError: {ex.Message}" 
            };
        }
        catch (TaskCanceledException)
        {
            return new LoginResult 
            { 
                Success = false, 
                Message = "Connection timed out. Check your internet connection." 
            };
        }
        catch (Exception ex)
        {
            return new LoginResult { Success = false, Message = ex.Message };
        }
    }

    /// <summary>
    /// Attempt to login with a 16-digit license key and lock it to this machine's serial number.
    /// </summary>
    public async Task<LoginResult> LoginWithLicenseAsync(string licenseKey, string machineSerial)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync($"{_apiUrl}/auth/license", new
            {
                licenseKey = licenseKey,
                machineSerial = machineSerial
            });

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<LoginResponse>();
                if (result != null)
                {
                    CurrentUser = result.User;
                    Token = result.Token;
                    return new LoginResult { Success = true, Message = "License Login successful" };
                }
            }
            
            var error = await response.Content.ReadFromJsonAsync<ApiErrorResponse>();
            return new LoginResult { Success = false, Message = error?.Message ?? "License Login failed" };
        }
        catch (HttpRequestException ex)
        {
            return new LoginResult 
            { 
                Success = false, 
                Message = $"Cannot connect to server to validate license.\nError: {ex.Message}" 
            };
        }
        catch (TaskCanceledException)
        {
            return new LoginResult 
            { 
                Success = false, 
                Message = "Connection timed out verifying license. Check your internet connection." 
            };
        }
        catch (Exception ex)
        {
            return new LoginResult { Success = false, Message = ex.Message };
        }
    }

    /// <summary>
    /// Logout and clear session.
    /// </summary>
    public void Logout()
    {
        CurrentUser = null;
        Token = null;
    }

    /// <summary>
    /// Get the current technician ID for result attribution.
    /// Returns null if not logged in.
    /// </summary>
    public int? GetTechnicianId() => CurrentUser?.Id;
}

public class LoginResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
}

public class LoginResponse
{
    [JsonPropertyName("token")]
    public string Token { get; set; } = "";
    
    [JsonPropertyName("user")]
    public UserInfo User { get; set; } = new();
}

public class UserInfo
{
    [JsonPropertyName("id")]
    public int Id { get; set; }
    
    [JsonPropertyName("username")]
    public string Username { get; set; } = "";
    
    [JsonPropertyName("role")]
    public string Role { get; set; } = "";
    
    [JsonPropertyName("display_name")]
    public string? DisplayName { get; set; }
    
    [JsonPropertyName("email")]
    public string? Email { get; set; }
    
    public string DisplayText => DisplayName ?? Username;
    
    public string RoleDisplay => Role switch
    {
        "SuperAdmin" => "Gadget Guruz",
        "Admin" => "Refurbisher",
        "User" => "Technician",
        _ => Role
    };
}

public class ApiErrorResponse
{
    [JsonPropertyName("error")]
    public string Error { get; set; } = "";
    
    [JsonPropertyName("message")]
    public string Message { get; set; } = "";
}
