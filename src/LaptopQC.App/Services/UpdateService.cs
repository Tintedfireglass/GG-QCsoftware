using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows;
using LaptopQC.App.Branding;
using LaptopQC.Core.Services;

namespace LaptopQC.App.Services;

public static class UpdateService
{
    // Platform token sent to the manifest API.
    private const string Platform = "windows";

    public static async Task CheckForUpdatesAsync(Window owner)
    {
        if (BrandInfo.UpdateCheckUrl() is not { } checkUrl)
            return;

        try
        {
            var currentVersionText = AppVersionProvider.GetVersion().Split('+')[0].Trim();

            // ── 1. Fetch manifest ────────────────────────────────────────────
            var manifest = await FetchManifestAsync(checkUrl, currentVersionText);
            if (manifest == null) return;

            if (!manifest.UpdateAvailable) return;

            // ── 2. Mandatory vs. optional prompt ────────────────────────────
            if (!manifest.Mandatory)
            {
                var result = MessageBox.Show(
                    owner,
                    $"Version {manifest.Version} is available.\n\n" +
                    $"{(string.IsNullOrWhiteSpace(manifest.Notes) ? "" : manifest.Notes + "\n\n")}" +
                    $"Size: {FormatBytes(manifest.Size)}\n\n" +
                    "Download and install now?",
                    "Update Available",
                    MessageBoxButton.YesNo,
                    MessageBoxImage.Information);

                if (result != MessageBoxResult.Yes)
                    return;
            }
            else
            {
                MessageBox.Show(
                    owner,
                    $"A mandatory update to version {manifest.Version} is required.\n\n" +
                    $"{(string.IsNullOrWhiteSpace(manifest.Notes) ? "" : manifest.Notes + "\n\n")}" +
                    $"Size: {FormatBytes(manifest.Size)}\n\n" +
                    "The update will now be downloaded and installed.",
                    "Mandatory Update Required",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
            }

            // ── 3. Download ──────────────────────────────────────────────────
            var downloadUrl = new Uri(manifest.Url);
            var fileName = string.IsNullOrWhiteSpace(manifest.FileName)
                ? Path.GetFileName(downloadUrl.LocalPath)
                : manifest.FileName;
            if (string.IsNullOrWhiteSpace(fileName))
                fileName = $"{BrandInfo.AppDisplayName}_Setup.exe";

            var progressWindow = new Views.UpdateDownloadWindow { Owner = owner };
            progressWindow.Show();

            string? installerPath;
            try
            {
                installerPath = await DownloadInstallerAsync(downloadUrl, fileName, progress =>
                {
                    owner.Dispatcher.Invoke(() =>
                        progressWindow.UpdateProgress(progress.BytesReceived, progress.TotalBytes));
                });
            }
            finally
            {
                progressWindow.Close();
            }

            if (string.IsNullOrWhiteSpace(installerPath) || !File.Exists(installerPath))
            {
                MessageBox.Show(owner, "Download failed. Please try again later.",
                    "Update Error", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // ── 4. SHA-256 verification ──────────────────────────────────────
            if (!string.IsNullOrWhiteSpace(manifest.Sha256))
            {
                var ok = await VerifyChecksumAsync(installerPath, manifest.Sha256);
                if (!ok)
                {
                    File.Delete(installerPath);
                    MessageBox.Show(owner,
                        "The downloaded installer failed the integrity check and was removed.\n" +
                        "Please try again.",
                        "Checksum Mismatch", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }
            }

            // ── 5. Launch installer & exit ───────────────────────────────────
            Process.Start(new ProcessStartInfo(installerPath) { UseShellExecute = true });
            Application.Current.Shutdown();
        }
        catch
        {
            // Best-effort — never crash the app because of an update check.
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /// <summary>
    /// Calls GET /api/updates/{platform}/latest?current={version}
    /// and deserialises the JSON manifest.
    /// </summary>
    private static async Task<UpdateManifest?> FetchManifestAsync(string checkUrl, string currentVersion)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        var url = $"{checkUrl}?current={Uri.EscapeDataString(currentVersion)}";
        var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
            return null;

        return await response.Content.ReadFromJsonAsync<UpdateManifest>();
    }

    /// <summary>
    /// Streams the installer to %TEMP% and reports progress.
    /// </summary>
    private static async Task<string?> DownloadInstallerAsync(
        Uri downloadUrl,
        string fileName,
        Action<DownloadProgress>? onProgress = null)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        var targetPath = Path.Combine(Path.GetTempPath(), fileName);

        using var response = await http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
            return null;

        var totalBytes = response.Content.Headers.ContentLength;
        long totalRead = 0;
        var buffer = new byte[81920];

        await using var input = await response.Content.ReadAsStreamAsync();
        await using var output = File.Create(targetPath);

        int read;
        do
        {
            read = await input.ReadAsync(buffer, 0, buffer.Length);
            if (read > 0)
            {
                await output.WriteAsync(buffer, 0, read);
                totalRead += read;
                onProgress?.Invoke(new DownloadProgress(totalRead, totalBytes));
            }
        } while (read > 0);

        return targetPath;
    }

    /// <summary>
    /// Computes the SHA-256 hash of the file and compares it to the expected hex string.
    /// </summary>
    private static async Task<bool> VerifyChecksumAsync(string filePath, string expectedHex)
    {
        using var sha256 = SHA256.Create();
        await using var stream = File.OpenRead(filePath);
        var hashBytes = await sha256.ComputeHashAsync(stream);
        var actual = Convert.ToHexString(hashBytes);   // uppercase hex
        return actual.Equals(expectedHex.Replace("-", ""), StringComparison.OrdinalIgnoreCase);
    }

    private static string FormatBytes(long bytes)
    {
        const double gb = 1024 * 1024 * 1024;
        const double mb = 1024 * 1024;
        const double kb = 1024;

        if (bytes >= gb) return $"{bytes / gb:0.00} GB";
        if (bytes >= mb) return $"{bytes / mb:0.00} MB";
        if (bytes >= kb) return $"{bytes / kb:0.00} KB";
        return $"{bytes} B";
    }

    // ── Data models ──────────────────────────────────────────────────────────

    /// <summary>
    /// Maps to the JSON returned by GET /api/updates/{platform}/latest
    /// </summary>
    private sealed class UpdateManifest
    {
        [JsonPropertyName("version")]      public string  Version        { get; init; } = "";
        [JsonPropertyName("updateAvailable")] public bool UpdateAvailable { get; init; }
        [JsonPropertyName("mandatory")]    public bool    Mandatory       { get; init; }
        [JsonPropertyName("notes")]        public string? Notes           { get; init; }
        [JsonPropertyName("url")]          public string  Url             { get; init; } = "";
        [JsonPropertyName("sha256")]       public string? Sha256          { get; init; }
        [JsonPropertyName("size")]         public long    Size            { get; init; }
        [JsonPropertyName("fileName")]     public string? FileName        { get; init; }
        [JsonPropertyName("publishedAt")]  public string? PublishedAt     { get; init; }
    }
}

public record DownloadProgress(long BytesReceived, long? TotalBytes);
