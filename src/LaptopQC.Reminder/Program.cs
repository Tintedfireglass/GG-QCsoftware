using Microsoft.Toolkit.Uwp.Notifications;

// ──────────────────────────────────────────────────────────────
//  PRAMAAN QC Reminder
//  Runs via Windows Task Scheduler. Checks if a QC test is
//  overdue (30+ days) and shows a toast notification.
// ──────────────────────────────────────────────────────────────

const int REMINDER_DAYS = 30;

var appDataDir = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
    "Pramaan");

var timestampFile = Path.Combine(appDataDir, "last_qc_test.txt");

// ── Read last test date ─────────────────────────────────────
DateTime? lastTestDate = null;

if (File.Exists(timestampFile))
{
    try
    {
        var text = File.ReadAllText(timestampFile).Trim();
        if (DateTime.TryParse(text, null, System.Globalization.DateTimeStyles.RoundtripKind, out var parsed))
            lastTestDate = parsed;
    }
    catch { /* File read error — treat as never tested */ }
}

// ── Determine if reminder is needed ─────────────────────────
int daysSinceTest;
string message;

if (lastTestDate == null)
{
    daysSinceTest = int.MaxValue;
    message = "You haven't run a QC test yet. Run Pramaan to check your device.";
}
else
{
    daysSinceTest = (int)(DateTime.UtcNow - lastTestDate.Value).TotalDays;
    message = $"It's been {daysSinceTest} days since your last QC test. Time for a checkup!";
}

if (daysSinceTest < REMINDER_DAYS)
{
    // Not overdue — exit silently
    return;
}

// ── Find Pramaan.exe path ───────────────────────────────────
// Look next to this reminder exe, or in a known install location
var reminderDir = AppContext.BaseDirectory;
var pramaanPath = Path.Combine(reminderDir, "Pramaan.exe");

// Fallback: check parent directory
if (!File.Exists(pramaanPath))
    pramaanPath = Path.Combine(reminderDir, "..", "Pramaan.exe");

// ── Show toast notification ─────────────────────────────────
try
{
    var builder = new ToastContentBuilder()
        .AddText("🔧 Pramaan QC Reminder")
        .AddText(message);

    if (File.Exists(pramaanPath))
    {
        builder.AddButton(new ToastButton()
            .SetContent("Run QC Test")
            .AddArgument("action", "launch")
            .AddArgument("path", pramaanPath));
    }

    builder.Show();

    // Handle toast activation (when user clicks the button)
    ToastNotificationManagerCompat.OnActivated += args =>
    {
        var arguments = ToastArguments.Parse(args.Argument);
        if (arguments.TryGetValue("path", out var exePath) && File.Exists(exePath))
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = exePath,
                UseShellExecute = true,
                Verb = "runas"  // QC app requires admin
            });
        }
    };

    // Keep alive briefly so the toast can be interacted with
    await Task.Delay(5000);
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Toast notification error: {ex.Message}");
}
