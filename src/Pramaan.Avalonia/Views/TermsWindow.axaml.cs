using System;
using System.Diagnostics;
using System.IO;
using Avalonia.Controls;
using Avalonia.Interactivity;

namespace Pramaan.Avalonia.Views;

public partial class TermsWindow : Window
{
    public bool Accepted { get; private set; }

    public TermsWindow()
    {
        InitializeComponent();
    }

    private void Accept_Click(object? sender, RoutedEventArgs e)
    {
        Accepted = true;
        Close();
    }

    private void Decline_Click(object? sender, RoutedEventArgs e)
    {
        Accepted = false;
        Close();
    }

    private void Link_Click(object? sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch { }
        }
    }

    // ── Persistence ─────────────────────────────────────────

    private static string AcceptanceFlagPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Pramaan", "tnc_accepted.txt");

    public static bool HasAccepted() => File.Exists(AcceptanceFlagPath);

    public static void RecordAcceptance()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(AcceptanceFlagPath)!);
            File.WriteAllText(AcceptanceFlagPath, $"Accepted: {DateTime.UtcNow:o}");
        }
        catch { }
    }
}
