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
    public static string? UpdateUrl
    {
        get
        {
            var value = Get("Brand.UpdateUrl", "");
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
    }

    public static string InstallerFileNamePrefix => $"{AppDisplayName}_Setup_";
    public static string IconFileName => Get("Brand.IconFileName", "pramana_icon.ico");
    public static string TrayIconRelativePath => System.IO.Path.Combine("Resources", IconFileName);
    public static string AppDataFolderName => BrandXamlKey;
}
