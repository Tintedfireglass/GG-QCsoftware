using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using LaptopQC.Core.Models;
using LaptopQC.Core.Services;
using Pramaan.Avalonia.Views;
using AvaControls = global::Avalonia.Controls;
using AvaLayout   = global::Avalonia.Layout;
using AvaMedia    = global::Avalonia.Media;

namespace Pramaan.Avalonia.Services;

/// <summary>
/// Cross-platform auto-update service for the Avalonia (macOS / Linux) build.
/// Mirrors LaptopQC.App.Services.UpdateService for Windows.
///
/// Calls GET {baseUrl}/api/updates/macos/latest?current={version}
/// and downloads the new .zip, verifies SHA-256, then installs on macOS
/// by replacing the running .app bundle.
/// </summary>
public static class AvaloniaUpdateService
{
    private const string Platform = "macos";

    /// <summary>
    /// Call once on startup (after the main window is shown).
    /// Silently skips if there is no update or the check fails.
    /// </summary>
    public static async Task CheckForUpdatesAsync(Window owner)
    {
        try
        {
            // Derive update check URL from ApiConfiguration
            var apiUrl = new ApiConfiguration().ApiUrl;
            var baseUrl = apiUrl.Replace("/api", "");
            var checkUrl = $"{apiUrl}/updates/{Platform}/latest";

            var currentVersionText = AppVersionProvider.GetVersion().Split('+')[0].Trim();
            var manifest = await FetchManifestAsync(checkUrl, currentVersionText);
            if (manifest == null || !manifest.UpdateAvailable)
                return;

            // Prompt user
            bool install = await ShowUpdatePromptAsync(owner, manifest);
            if (!install)
                return;

            // Show download progress window
            var progressWindow = new UpdateDownloadWindow
            {
                WindowStartupLocation = WindowStartupLocation.CenterOwner
            };

            // Open as a child of owner but don't block
            progressWindow.Show(owner);

            string? zipPath;
            try
            {
                zipPath = await DownloadAsync(new Uri(manifest.Url), manifest.FileName, (recv, total) =>
                {
                    Dispatcher.UIThread.Post(() => progressWindow.UpdateProgress(recv, total));
                });
            }
            finally
            {
                Dispatcher.UIThread.Post(() => progressWindow.Close());
            }

            if (string.IsNullOrWhiteSpace(zipPath) || !File.Exists(zipPath))
            {
                await ShowErrorAsync(owner, "Download failed. Please try again later.");
                return;
            }

            // SHA-256 verification
            if (!string.IsNullOrWhiteSpace(manifest.Sha256))
            {
                if (!await VerifyChecksumAsync(zipPath, manifest.Sha256))
                {
                    File.Delete(zipPath);
                    await ShowErrorAsync(owner,
                        "The downloaded update failed the integrity check and was removed.\n" +
                        "Please try again.");
                    return;
                }
            }

            // Install on macOS: extract zip next to running .app, then relaunch
            await InstallAndRelaunchAsync(zipPath);
        }
        catch
        {
            // Best-effort — never crash the app because of an update check.
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static async Task<UpdateManifest?> FetchManifestAsync(string checkUrl, string currentVersion)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        var url = $"{checkUrl}?current={Uri.EscapeDataString(currentVersion)}";
        var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
            return null;
        return await response.Content.ReadFromJsonAsync<UpdateManifest>();
    }

    private static async Task<string?> DownloadAsync(
        Uri url,
        string? fileName,
        Action<long, long?>? onProgress = null)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(15) };
        var safeName = string.IsNullOrWhiteSpace(fileName)
            ? Path.GetFileName(url.LocalPath)
            : fileName;
        if (string.IsNullOrWhiteSpace(safeName))
            safeName = "PRAMAAN_update.zip";

        var dest = Path.Combine(Path.GetTempPath(), safeName);

        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
            return null;

        var total    = response.Content.Headers.ContentLength;
        long received = 0;
        var buf      = new byte[81920];

        await using var input  = await response.Content.ReadAsStreamAsync();
        await using var output = File.Create(dest);

        int read;
        do
        {
            read = await input.ReadAsync(buf, 0, buf.Length);
            if (read > 0)
            {
                await output.WriteAsync(buf, 0, read);
                received += read;
                onProgress?.Invoke(received, total);
            }
        } while (read > 0);

        return dest;
    }

    private static async Task<bool> VerifyChecksumAsync(string filePath, string expectedHex)
    {
        using var sha256 = SHA256.Create();
        await using var stream = File.OpenRead(filePath);
        var hashBytes = await sha256.ComputeHashAsync(stream);
        var actual    = Convert.ToHexString(hashBytes);
        return actual.Equals(expectedHex.Replace("-", ""), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// On macOS: extract the downloaded zip beside the running .app,
    /// then relaunch via 'open' so the new version starts cleanly.
    /// </summary>
    private static async Task InstallAndRelaunchAsync(string zipPath)
    {
        await Task.Run(() =>
        {
            // Find where the running .app lives
            var exePath  = Environment.ProcessPath ?? "";
            var appDir   = Path.GetDirectoryName(exePath) ?? "";      // Contents/MacOS
            var contents = Path.GetDirectoryName(appDir) ?? "";       // Contents
            var appBundle= Path.GetDirectoryName(contents) ?? "";     // PRAMAAN.app
            var parent   = Path.GetDirectoryName(appBundle) ?? "";    // parent folder

            if (string.IsNullOrEmpty(parent))
                parent = Path.GetTempPath();

            // Extract zip over the parent directory so the new .app replaces the old one
            var extractDir = Path.Combine(parent, "__pramaan_update__");
            if (Directory.Exists(extractDir))
                Directory.Delete(extractDir, recursive: true);
            Directory.CreateDirectory(extractDir);

            Process.Start(new ProcessStartInfo("unzip", $"-o \"{zipPath}\" -d \"{extractDir}\"")
            {
                UseShellExecute = false,
                CreateNoWindow  = true
            })?.WaitForExit(60000);

            // Find the extracted .app
            var newApp = Directory.GetFiles(extractDir, "*.app", SearchOption.AllDirectories)
                                  .FirstOrDefault();

            if (newApp == null)
                newApp = Directory.GetDirectories(extractDir, "*.app", SearchOption.AllDirectories)
                                  .FirstOrDefault();

            if (!string.IsNullOrEmpty(newApp))
            {
                // Make sure the binary is executable
                Process.Start("chmod", $"-R u+x \"{newApp}\"")?.WaitForExit(5000);

                // Relaunch the new .app
                Process.Start(new ProcessStartInfo("open", $"\"{newApp}\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow  = true
                });

                // Exit the running instance
                Environment.Exit(0);
            }
        });
    }

    // ── UI helpers ─────────────────────────────────────────────────────────────

    private static async Task<bool> ShowUpdatePromptAsync(Window owner, UpdateManifest manifest)
    {
        var tcs = new TaskCompletionSource<bool>();

        await Dispatcher.UIThread.InvokeAsync(() =>
        {
            // Use a simple dialog approach via a child window
            var dlg = new global::Avalonia.Controls.Window
            {
                Title                   = manifest.Mandatory ? "Mandatory Update" : "Update Available",
                Width                   = 440,
                SizeToContent           = global::Avalonia.Controls.SizeToContent.Height,
                WindowStartupLocation   = global::Avalonia.Controls.WindowStartupLocation.CenterOwner,
                CanResize               = false,
            };

            var msg = $"Version {manifest.Version} is available.\n\n" +
                      (string.IsNullOrWhiteSpace(manifest.Notes) ? "" : manifest.Notes + "\n\n") +
                      $"Size: {FormatBytes(manifest.Size)}\n\n" +
                      (manifest.Mandatory
                          ? "This update is mandatory and will install now."
                          : "Would you like to download and install it now?");

            var panel = new global::Avalonia.Controls.StackPanel { Margin = new global::Avalonia.Thickness(20), Spacing = 12 };
            panel.Children.Add(new global::Avalonia.Controls.TextBlock
            {
                Text       = dlg.Title,
                FontSize   = 16,
                FontWeight = global::Avalonia.Media.FontWeight.SemiBold
            });
            panel.Children.Add(new global::Avalonia.Controls.TextBlock
            {
                Text       = msg,
                TextWrapping = global::Avalonia.Media.TextWrapping.Wrap
            });

            var btnRow = new global::Avalonia.Controls.StackPanel
            {
                Orientation = global::Avalonia.Layout.Orientation.Horizontal,
                HorizontalAlignment = global::Avalonia.Layout.HorizontalAlignment.Right,
                Spacing = 8
            };

            if (!manifest.Mandatory)
            {
                var laterBtn = new global::Avalonia.Controls.Button { Content = "Later" };
                laterBtn.Click += (_, _) => { tcs.TrySetResult(false); dlg.Close(); };
                btnRow.Children.Add(laterBtn);
            }

            var installBtn = new global::Avalonia.Controls.Button
            {
                Content = manifest.Mandatory ? "OK" : "Install Now"
            };
            installBtn.Click += (_, _) => { tcs.TrySetResult(true); dlg.Close(); };
            btnRow.Children.Add(installBtn);
            panel.Children.Add(btnRow);

            dlg.Content = panel;
            dlg.Closed  += (_, _) => tcs.TrySetResult(false);
            dlg.ShowDialog(owner);
        });

        return await tcs.Task;
    }

    private static async Task ShowErrorAsync(Window owner, string message)
    {
        var tcs = new TaskCompletionSource<bool>();
        await Dispatcher.UIThread.InvokeAsync(() =>
        {
            var dlg = new global::Avalonia.Controls.Window
            {
                Title               = "Update Error",
                Width               = 360,
                SizeToContent       = global::Avalonia.Controls.SizeToContent.Height,
                WindowStartupLocation = global::Avalonia.Controls.WindowStartupLocation.CenterOwner,
                CanResize           = false
            };
            var panel = new global::Avalonia.Controls.StackPanel { Margin = new global::Avalonia.Thickness(20), Spacing = 12 };
            panel.Children.Add(new global::Avalonia.Controls.TextBlock
            {
                Text         = message,
                TextWrapping = global::Avalonia.Media.TextWrapping.Wrap
            });
            var ok = new global::Avalonia.Controls.Button { Content = "OK" };
            ok.Click += (_, _) => { tcs.TrySetResult(true); dlg.Close(); };
            panel.Children.Add(ok);
            dlg.Content = panel;
            dlg.Closed  += (_, _) => tcs.TrySetResult(true);
            dlg.ShowDialog(owner);
        });
        await tcs.Task;
    }

    private static string FormatBytes(long bytes)
    {
        const double gb = 1024.0 * 1024 * 1024;
        const double mb = 1024.0 * 1024;
        const double kb = 1024.0;
        if (bytes >= gb) return $"{bytes / gb:0.00} GB";
        if (bytes >= mb) return $"{bytes / mb:0.00} MB";
        if (bytes >= kb) return $"{bytes / kb:0.00} KB";
        return $"{bytes} B";
    }

    // ── Manifest model ───────────────────────────────────────────────────────

    private sealed class UpdateManifest
    {
        [JsonPropertyName("version")]         public string  Version        { get; init; } = "";
        [JsonPropertyName("updateAvailable")] public bool    UpdateAvailable { get; init; }
        [JsonPropertyName("mandatory")]       public bool    Mandatory       { get; init; }
        [JsonPropertyName("notes")]           public string? Notes           { get; init; }
        [JsonPropertyName("url")]             public string  Url             { get; init; } = "";
        [JsonPropertyName("sha256")]          public string? Sha256          { get; init; }
        [JsonPropertyName("size")]            public long    Size            { get; init; }
        [JsonPropertyName("fileName")]        public string? FileName        { get; init; }
    }
}
