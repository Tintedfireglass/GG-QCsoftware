using System.IO;
using System.Windows;
using System.Text.RegularExpressions;

namespace LaptopQC.App.Views;

public partial class TermsWindow : Window
{
    public bool Accepted { get; private set; }

    public TermsWindow()
    {
        InitializeComponent();
        LoadLegalText();
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

    private void LoadLegalText()
    {
        try
        {
            var legalPath = Path.Combine(AppContext.BaseDirectory, "legal.txt");
            if (File.Exists(legalPath))
            {
                var raw = File.ReadAllText(legalPath);
                var sections = SplitLegalSections(raw);
                TermsTextBox.Text = sections.Terms;
                PrivacyTextBox.Text = sections.Privacy;
                EulaTextBox.Text = sections.Eula;
                ElaTextBox.Text = sections.Ela;
                return;
            }
        }
        catch
        {
        }

        TermsTextBox.Text = "Legal text is unavailable. Please contact support.";
        PrivacyTextBox.Text = TermsTextBox.Text;
        EulaTextBox.Text = TermsTextBox.Text;
        ElaTextBox.Text = TermsTextBox.Text;
    }

    private static (string Terms, string Privacy, string Eula, string Ela) SplitLegalSections(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return ("", "", "", "");
        }

        string ExtractBetween(string text, int start, int end)
        {
            if (start < 0 || end < 0 || end <= start) return "";
            return text.Substring(start, end - start).Trim();
        }

        var normalized = raw.Replace("\r\n", "\n");

        var termsIdx = FindHeaderIndex(normalized, "Terms and Conditions");
        var privacyIdx = FindHeaderIndex(normalized, "Privacy Policy");
        var eulaIdx = FindHeaderIndex(normalized, "End User License Agreement");
        if (eulaIdx < 0) eulaIdx = FindHeaderIndex(normalized, "EULA");
        var elaIdx = FindHeaderIndex(normalized, "Enterprise License Agreement");
        if (elaIdx < 0) elaIdx = FindHeaderIndex(normalized, "ELA");

        if (termsIdx < 0 || privacyIdx < 0 || eulaIdx < 0 || elaIdx < 0)
        {
            return (raw.Trim(), raw.Trim(), raw.Trim(), raw.Trim());
        }

        var terms = ExtractBetween(normalized, termsIdx, privacyIdx);
        var privacy = ExtractBetween(normalized, privacyIdx, eulaIdx);
        var eula = ExtractBetween(normalized, eulaIdx, elaIdx);
        var ela = ExtractBetween(normalized, elaIdx, normalized.Length);

        return (terms, privacy, eula, ela);
    }

    private static int FindHeaderIndex(string text, string header)
    {
        var pattern = $"(?m)^(?:\\s*){Regex.Escape(header)}\\b";
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
        return match.Success ? match.Index : -1;
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
