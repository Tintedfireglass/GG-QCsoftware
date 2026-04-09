using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using LaptopQC.Core.Services;

namespace LaptopQC.App.Services;

public static class UpdateService
{
    private const string UpdateUrl = "https://gadgetguruz.com/api/pramaan/download";

    public static async Task CheckForUpdatesAsync(Window owner)
    {
        try
        {
            var updateInfo = await FetchLatestAsync();
            if (updateInfo == null) return;

            var current = ParseVersion(AppVersionProvider.GetVersion());
            if (current == null) return;

            if (updateInfo.Version <= current)
                return;

            var result = MessageBox.Show(
                owner,
                $"A new version ({updateInfo.Version}) is available. Download and install now?",
                "Update Available",
                MessageBoxButton.YesNo,
                MessageBoxImage.Information);

            if (result != MessageBoxResult.Yes)
                return;

            var progressWindow = new Views.UpdateDownloadWindow
            {
                Owner = owner
            };
            progressWindow.Show();

            var installerPath = await DownloadInstallerAsync(updateInfo.DownloadUrl, progress =>
            {
                owner.Dispatcher.Invoke(() =>
                {
                    progressWindow.UpdateProgress(progress.BytesReceived, progress.TotalBytes);
                });
            });

            progressWindow.Close();
            if (string.IsNullOrWhiteSpace(installerPath) || !File.Exists(installerPath))
                return;

            Process.Start(new ProcessStartInfo(installerPath) { UseShellExecute = true });
            Application.Current.Shutdown();
        }
        catch
        {
            // Best-effort only; don't interrupt the app if update check fails.
        }
    }

    private static async Task<UpdateInfo?> FetchLatestAsync()
    {
        using var handler = new HttpClientHandler { AllowAutoRedirect = true };
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(20) };

        using var response = await http.GetAsync(UpdateUrl, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
            return null;

        var finalUri = response.RequestMessage?.RequestUri;
        if (finalUri == null)
            return null;

        var version = ParseVersionFromUrl(finalUri);
        if (version == null)
            return null;

        return new UpdateInfo(version, finalUri);
    }

    private static async Task<string?> DownloadInstallerAsync(Uri downloadUrl, Action<DownloadProgress>? onProgress = null)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        var fileName = Path.GetFileName(downloadUrl.LocalPath);
        if (string.IsNullOrWhiteSpace(fileName))
            fileName = "Pramaan_Setup.exe";

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

    private static Version? ParseVersion(string? versionText)
    {
        if (string.IsNullOrWhiteSpace(versionText))
            return null;

        var clean = versionText.Split('+')[0].Trim();
        return Version.TryParse(clean, out var version) ? version : null;
    }

    private static Version? ParseVersionFromUrl(Uri url)
    {
        var file = Path.GetFileName(url.LocalPath);
        if (string.IsNullOrWhiteSpace(file))
            return null;

        var match = Regex.Match(file, @"Pramaan_Setup_(\d+(?:\.\d+){1,3})\.exe", RegexOptions.IgnoreCase);
        if (!match.Success)
            return null;

        return Version.TryParse(match.Groups[1].Value, out var version) ? version : null;
    }

    private record UpdateInfo(Version Version, Uri DownloadUrl);
}

public record DownloadProgress(long BytesReceived, long? TotalBytes);
