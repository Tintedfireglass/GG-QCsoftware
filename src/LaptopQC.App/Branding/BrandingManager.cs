using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Windows;

namespace LaptopQC.App.Branding;

public static class BrandingManager
{
    public static void LoadBrandResources(Application app)
    {
        var brandKey = BrandInfo.BrandXamlKey;
        var uri = new Uri($"/Branding/{brandKey}.xaml", UriKind.Relative);

        var dict = new ResourceDictionary { Source = uri };
        app.Resources.MergedDictionaries.Add(dict);
    }
}

public static class BrandInfo
{
    private static readonly Lazy<IReadOnlyDictionary<string, string>> _metadata = new(() =>
    {
        var asm = Assembly.GetExecutingAssembly();
        return asm
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .GroupBy(a => a.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Last().Value ?? "", StringComparer.OrdinalIgnoreCase);
    });

    private static string Get(string key, string fallback)
    {
        return _metadata.Value.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value
            : fallback;
    }

    public static string BrandXamlKey => Get("Brand", "Pramaan");
    public static string AppDisplayName => Get("Brand.AppDisplayName", "PRAMAAN");
    public static string Publisher => Get("Brand.Publisher", "GadgetGuruz");
    public static string? UpdateBaseUrl
    {
        get
        {
            var value = Get("Brand.UpdateUrl", "");
            return string.IsNullOrWhiteSpace(value) ? null : value.TrimEnd('/');
        }
    }

    public static string ApiBaseUrl
    {
        get
        {
            var value = Get("Brand.ApiUrl", "https://pramaan-dashboard.gadgetguruz.com");
            return value.TrimEnd('/');
        }
    }

    public static string ApiKey => Get("Brand.ApiKey", "default-api-key-change-in-production");

    /// <summary>
    /// Returns the verification URL for a given health ID, e.g. https://cirtyn.com/verify/abc123
    /// </summary>
    public static string VerifyUrl(string healthId) => $"{ApiBaseUrl}/verify/{healthId}";

    /// <summary>
    /// Builds the manifest check URL for the given platform.
    /// e.g. https://pramaan-dashboard.gadgetguruz.com/api/updates/windows/latest
    /// </summary>
    public static string? UpdateCheckUrl(string platform = "windows")
        => UpdateBaseUrl is { } b ? $"{b}/api/updates/{platform}/latest" : null;

    public static string InstallerFileNamePrefix => $"{AppDisplayName}_Setup_";
    public static string IconFileName => Get("Brand.IconFileName", "pramana_icon.ico");
    public static string LogoFileName => System.IO.Path.GetFileName(Get("Brand.LogoPath", "Resources\\pramana_logo.png"));
    public static string TrayIconRelativePath => System.IO.Path.Combine("Resources", IconFileName);
    public static string AppDataFolderName => BrandXamlKey;
}
