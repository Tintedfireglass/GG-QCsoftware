using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.InteropServices;

#if WINDOWS
using LaptopQC.Core.Services;
#endif

namespace Pramaan.Avalonia.ViewModels;

public partial class CleanupViewModel : ObservableObject
{
    private const string WindowsUpdateId = "update_cache";

    public ObservableCollection<CleanupCategoryViewModel> Categories { get; } = new();

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private bool _isCleaning;

    [ObservableProperty]
    private string _statusMessage = "Ready to scan for junk files.";

    [ObservableProperty]
    private string _totalSizeLabel = "0 B";

    [ObservableProperty]
    private string _selectedSizeLabel = "0 B";

    [ObservableProperty]
    private string _adminStatus = "Standard";

    [ObservableProperty]
    private string _currentOperation = "";

    [ObservableProperty]
    private bool _isDeepScanning;

    [ObservableProperty]
    private bool _showApproxColumn = true;

    public CleanupViewModel()
    {
        AdminStatus = IsRunningAsAdmin() ? "Administrator" : "Standard";
    }

    [RelayCommand]
    private async Task ScanAsync()
    {
        if (IsScanning) return;

        IsScanning = true;
        StatusMessage = "Scanning junk files...";
        CurrentOperation = "Starting scan...";
        Categories.Clear();

        try
        {
#if WINDOWS
            var cleanupService = new CleanupService();
            var progress = new Progress<LaptopQC.Core.Services.CleanupProgress>(p =>
            {
                if (!string.IsNullOrWhiteSpace(p.Message))
                    CurrentOperation = p.Message;
            });

            var results = await Task.Run(() => cleanupService.Scan(progress));
            foreach (var category in results.Categories)
            {
                var vm = new CleanupCategoryViewModel(category);
                vm.PropertyChanged += CategoryOnPropertyChanged;
                Categories.Add(vm);
            }

            UpdateTotals();
            StatusMessage = "Scan complete.";
            CurrentOperation = "";
#else
            // macOS: use MacCleanupService
            var macService = new LaptopQC.Core.Diagnostics.macOS.MacCleanupService();
            var macProgress = new Progress<string>(msg => CurrentOperation = msg);

            var scanResults = await macService.ScanAsync(macProgress);
            foreach (var r in scanResults)
            {
                var vm = new CleanupCategoryViewModel(r);
                vm.PropertyChanged += CategoryOnPropertyChanged;
                Categories.Add(vm);
            }

            UpdateTotals();
            StatusMessage = $"Scan complete — {Categories.Count} categories found.";
            CurrentOperation = "";
#endif
        }
        catch (Exception ex)
        {
            StatusMessage = $"Scan error: {ex.Message}";
            CurrentOperation = "";
        }
        finally
        {
            IsScanning = false;
        }
    }

    [RelayCommand]
    private async Task DeepScanWindowsUpdateAsync()
    {
        if (IsDeepScanning) return;

#if WINDOWS
        var target = Categories.FirstOrDefault(c => c.Id == WindowsUpdateId);
        if (target == null)
        {
            StatusMessage = "Run a scan first.";
            return;
        }

        IsDeepScanning = true;
        StatusMessage = "Deep scanning Windows Update Cache...";
        CurrentOperation = "Starting deep scan...";

        try
        {
            var cleanupService = new CleanupService();
            var progress = new Progress<LaptopQC.Core.Services.CleanupProgress>(p =>
            {
                if (!string.IsNullOrWhiteSpace(p.Message))
                    CurrentOperation = p.Message;
            });

            var updated = await Task.Run(() => cleanupService.DeepScanWindowsUpdate(progress));
            target.UpdateFrom(updated);
            UpdateTotals();
            StatusMessage = "Windows Update deep scan complete.";
            target.MarkDeepScanned();
        }
        catch (Exception ex)
        {
            StatusMessage = $"Deep scan error: {ex.Message}";
        }
        finally
        {
            CurrentOperation = "";
            IsDeepScanning = false;
        }
#else
        await Task.CompletedTask;
        StatusMessage = "Windows Update deep scan is not available on macOS.";
#endif
    }

    [RelayCommand]
    private async Task CleanAsync()
    {
        if (IsCleaning) return;
        if (IsScanning || IsDeepScanning)
        {
            StatusMessage = "Please wait for the scan to finish before cleaning.";
            return;
        }

        var selected = Categories.Where(c => c.IsSelected && c.IsAvailable).ToList();
        if (selected.Count == 0)
        {
            StatusMessage = "Select at least one category to clean.";
            return;
        }

        IsCleaning = true;
        StatusMessage = "Cleaning selected categories...";
        CurrentOperation = "Starting cleanup...";

        try
        {
#if WINDOWS
            var cleanupService = new CleanupService();
            var progress = new Progress<LaptopQC.Core.Services.CleanupProgress>(p =>
            {
                if (!string.IsNullOrWhiteSpace(p.Message))
                    CurrentOperation = p.Message;
            });

            var result = await Task.Run(() =>
                cleanupService.Clean(selected.Select(c => c.ToCategory()), progress));

            var parts = new List<string>
            {
                $"Cleanup complete: {result.DeletedFiles} files, {FormatBytes(result.FreedBytes)} freed."
            };
            if (result.LockedFiles > 0)
                parts.Add($"{result.LockedFiles} locked");
            if (result.AccessDeniedFiles > 0)
                parts.Add($"{result.AccessDeniedFiles} denied");
            if (result.ScheduledOnReboot > 0)
                parts.Add($"{result.ScheduledOnReboot} scheduled for reboot");
            if (result.Errors.Count > 0)
                parts.Add($"{result.Errors.Count} errors");

            StatusMessage = string.Join(" ", parts);
            CurrentOperation = "";

            // Rescan only the categories that were cleaned
            var rescanned = await Task.Run(() =>
                cleanupService.RescanCategories(selected.Select(c => c.ToCategory()), progress));

            foreach (var updated in rescanned)
            {
                var vm = Categories.FirstOrDefault(c => c.Id == updated.Id);
                vm?.UpdateFrom(updated);
            }
            UpdateTotals();
            CurrentOperation = "";
#else
            // macOS: use MacCleanupService
            var macService = new LaptopQC.Core.Diagnostics.macOS.MacCleanupService();
            var macProgress = new Progress<string>(msg => CurrentOperation = msg);

            // Convert selected CleanupCategoryViewModel → MacCleanupService.ScanResult
            var macSelected = selected
                .Where(c => c.MacScanResult != null)
                .Select(c => c.MacScanResult!)
                .ToList();

            var macResult = await macService.CleanAsync(macSelected, macProgress);

            StatusMessage = $"Cleanup complete: {macResult.DeletedFiles} items, {FormatBytes(macResult.FreedBytes)} freed.";
            if (macResult.LockedFiles > 0)
                StatusMessage += $" ({macResult.LockedFiles} locked)";

            CurrentOperation = "";

            // Rescan to update sizes
            var macRescan = await macService.ScanAsync(
                macProgress,
                MacCleanupService.GetCategories()
                    .Where(c => macSelected.Any(s => s.Id == c.Id)));

            foreach (var r in macRescan)
            {
                var vm = Categories.FirstOrDefault(c => c.Id == r.Id);
                vm?.UpdateFromMac(r);
            }
            UpdateTotals();
            CurrentOperation = "";
#endif
        }
        catch (Exception ex)
        {
            StatusMessage = $"Cleanup error: {ex.Message}";
            CurrentOperation = "";
        }
        finally
        {
            IsCleaning = false;
        }
    }

    [RelayCommand]
    private void SelectAll()
    {
        foreach (var cat in Categories.Where(c => c.IsAvailable))
            cat.IsSelected = true;
        UpdateTotals();
    }

    [RelayCommand]
    private void SelectNone()
    {
        foreach (var cat in Categories)
            cat.IsSelected = false;
        UpdateTotals();
    }

    private void CategoryOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(CleanupCategoryViewModel.IsSelected))
            UpdateTotals();
    }

    private void UpdateTotals()
    {
        TotalSizeLabel = FormatBytes(Categories.Sum(c => c.SizeBytes));
        SelectedSizeLabel = FormatBytes(Categories.Where(c => c.IsSelected).Sum(c => c.SizeBytes));
        ShowApproxColumn = Categories.Any(c => c.IsApproximate);
    }

    private static bool IsRunningAsAdmin()
    {
        try
        {
#if WINDOWS
            using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            var principal = new System.Security.Principal.WindowsPrincipal(identity);
            return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
#else
            // On macOS check if effective UID is 0 (root)
            return false; // Pramaan on macOS does not require root for v1
#endif
        }
        catch
        {
            return false;
        }
    }

    private static string FormatBytes(long bytes)
    {
        string[] sizes = { "B", "KB", "MB", "GB", "TB" };
        double len = bytes;
        int order = 0;
        while (len >= 1024 && order < sizes.Length - 1)
        {
            order++;
            len /= 1024;
        }
        return $"{len:0.##} {sizes[order]}";
    }
}

public partial class CleanupCategoryViewModel : ObservableObject
{
#if WINDOWS
    public CleanupCategoryViewModel(LaptopQC.Core.Services.CleanupCategory category)
    {
        Id = category.Id;
        Name = category.Name;
        Description = category.Description;
        RequiresAdmin = category.RequiresAdmin;
        IsAvailable = category.IsAvailable;
        IsApproximate = category.IsApproximate;
        FileCount = category.FileCount;
        SizeBytes = category.SizeBytes;
        SizeLabel = IsApproximate ? $">= {FormatBytes(SizeBytes)}" : FormatBytes(SizeBytes);
        RequiresAdminLabel = RequiresAdmin ? "Yes" : "No";
        AvailabilityLabel = IsAvailable ? "Yes" : "No";
        ApproximateLabel = IsApproximate ? "Yes" : "No";
        IsSelected = IsAvailable;
        Targets = category.Targets;
        IsWindowsUpdate = Id == "update_cache";
    }

    public List<LaptopQC.Core.Services.CleanupTarget> Targets { get; }

    public LaptopQC.Core.Services.CleanupCategory ToCategory()
    {
        return new LaptopQC.Core.Services.CleanupCategory
        {
            Id = Id,
            Name = Name,
            Description = Description,
            RequiresAdmin = RequiresAdmin,
            IsAvailable = IsAvailable,
            FileCount = FileCount,
            SizeBytes = SizeBytes,
            Targets = Targets
        };
    }

    public void UpdateFrom(LaptopQC.Core.Services.CleanupCategory category)
    {
        IsAvailable = category.IsAvailable;
        FileCount = category.FileCount;
        SizeBytes = category.SizeBytes;
        IsApproximate = category.IsApproximate;
        SizeLabel = IsApproximate ? $">= {FormatBytes(SizeBytes)}" : FormatBytes(SizeBytes);
        ApproximateLabel = IsApproximate ? "Yes" : "No";
        AvailabilityLabel = category.IsAvailable ? "Yes" : "No";
        OnPropertyChanged(nameof(FileCount));
        OnPropertyChanged(nameof(SizeBytes));
        OnPropertyChanged(nameof(SizeLabel));
        OnPropertyChanged(nameof(IsApproximate));
        OnPropertyChanged(nameof(ApproximateLabel));
        OnPropertyChanged(nameof(AvailabilityLabel));
        OnPropertyChanged(nameof(IsAvailable));
    }
#endif

    public string Id { get; } = "";
    public string Name { get; } = "";
    public string Description { get; } = "";
    public bool RequiresAdmin { get; }
    public bool IsAvailable { get; private set; }
    public bool IsApproximate { get; private set; }
    public int FileCount { get; private set; }
    public long SizeBytes { get; private set; }
    public string SizeLabel { get; private set; } = "0 B";
    public string RequiresAdminLabel { get; } = "No";
    public string AvailabilityLabel { get; private set; } = "No";
    public string ApproximateLabel { get; private set; } = "No";
    public bool IsWindowsUpdate { get; }

    // macOS: hold a reference to the scan result so CleanAsync can pass it back.
    public LaptopQC.Core.Diagnostics.macOS.MacCleanupService.ScanResult? MacScanResult { get; private set; }

#if !WINDOWS
    public CleanupCategoryViewModel(LaptopQC.Core.Diagnostics.macOS.MacCleanupService.ScanResult r)
    {
        MacScanResult     = r;
        Id                = r.Id;
        Name              = r.Name;
        Description       = r.Description;
        IsApproximate     = r.IsApproximate;
        IsAvailable       = r.IsAvailable;
        FileCount         = r.FileCount;
        SizeBytes         = r.SizeBytes;
        SizeLabel         = IsApproximate ? $">= {FormatBytes(SizeBytes)}" : FormatBytes(SizeBytes);
        RequiresAdminLabel = "No";
        AvailabilityLabel = IsAvailable ? "Yes" : "No";
        ApproximateLabel  = IsApproximate ? "Yes" : "No";
        IsSelected        = IsAvailable;
    }

    public void UpdateFromMac(LaptopQC.Core.Diagnostics.macOS.MacCleanupService.ScanResult r)
    {
        MacScanResult = r;
        IsAvailable   = r.IsAvailable;
        FileCount     = r.FileCount;
        SizeBytes     = r.SizeBytes;
        IsApproximate = r.IsApproximate;
        SizeLabel     = IsApproximate ? $">= {FormatBytes(SizeBytes)}" : FormatBytes(SizeBytes);
        AvailabilityLabel = r.IsAvailable ? "Yes" : "No";
        ApproximateLabel  = r.IsApproximate ? "Yes" : "No";
        OnPropertyChanged(nameof(FileCount));
        OnPropertyChanged(nameof(SizeBytes));
        OnPropertyChanged(nameof(SizeLabel));
        OnPropertyChanged(nameof(IsApproximate));
        OnPropertyChanged(nameof(ApproximateLabel));
        OnPropertyChanged(nameof(AvailabilityLabel));
        OnPropertyChanged(nameof(IsAvailable));
    }
#endif

    /// <summary>True when this row should show a "Deep Scan" action button.</summary>
    [ObservableProperty]
    private bool _canDeepScan = true;

    [ObservableProperty]
    private bool _isSelected;

    public void MarkDeepScanned() => CanDeepScan = false;

    private static string FormatBytes(long bytes)
    {
        string[] sizes = { "B", "KB", "MB", "GB", "TB" };
        double len = bytes;
        int order = 0;
        while (len >= 1024 && order < sizes.Length - 1)
        {
            order++;
            len /= 1024;
        }
        return $"{len:0.##} {sizes[order]}";
    }
}
