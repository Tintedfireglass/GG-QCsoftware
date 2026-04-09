using System;
using System.Windows;

namespace LaptopQC.App.Views;

public partial class UpdateDownloadWindow : Window
{
    public UpdateDownloadWindow()
    {
        InitializeComponent();
    }

    public void UpdateProgress(long bytesReceived, long? totalBytes)
    {
        if (totalBytes.HasValue && totalBytes.Value > 0)
        {
            DownloadProgress.IsIndeterminate = false;
            double percent = Math.Min(100, (bytesReceived * 100.0) / totalBytes.Value);
            DownloadProgress.Value = percent;
            ProgressText.Text = $"{FormatBytes(bytesReceived)} / {FormatBytes(totalBytes.Value)} ({percent:0}%)";
        }
        else
        {
            DownloadProgress.IsIndeterminate = true;
            ProgressText.Text = $"{FormatBytes(bytesReceived)} downloaded...";
        }
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
}
