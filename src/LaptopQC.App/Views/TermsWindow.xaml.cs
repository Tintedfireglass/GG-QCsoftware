using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Navigation;

namespace LaptopQC.App.Views;

public partial class TermsWindow : Window
{
    public bool Accepted { get; private set; }

    public TermsWindow()
    {
        InitializeComponent();
    }

    private void Accept_Click(object sender, RoutedEventArgs e)
    {
        Accepted = true;
        Close();
    }

    private void Decline_Click(object sender, RoutedEventArgs e)
    {
        Accepted = false;
        Close();
    }

    private void Link_Navigate(object sender, RequestNavigateEventArgs e)
    {
        Process.Start(new ProcessStartInfo(e.Uri.AbsoluteUri) { UseShellExecute = true });
        e.Handled = true;
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
