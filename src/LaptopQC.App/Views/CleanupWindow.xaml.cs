using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;

namespace LaptopQC.App.Views;

public partial class CleanupWindow : Window
{
    private string? _lastSortProperty;
    private ListSortDirection _lastSortDirection = ListSortDirection.Ascending;

    public CleanupWindow()
    {
        InitializeComponent();
        Loaded += CleanupWindow_Loaded;
    }

    private void CleanupWindow_Loaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is ViewModels.CleanupViewModel vm && vm.ScanCommand.CanExecute(null))
        {
            vm.ScanCommand.Execute(null);
        }
    }

    private void GridViewColumnHeader_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not GridViewColumnHeader header) return;
        if (header.Tag is not string sortBy || string.IsNullOrWhiteSpace(sortBy)) return;

        var direction = ListSortDirection.Ascending;
        if (_lastSortProperty == sortBy)
        {
            direction = _lastSortDirection == ListSortDirection.Ascending
                ? ListSortDirection.Descending
                : ListSortDirection.Ascending;
        }

        _lastSortProperty = sortBy;
        _lastSortDirection = direction;

        var itemsSource = CategoriesList.ItemsSource ?? Array.Empty<object>();
        var view = CollectionViewSource.GetDefaultView(itemsSource);
        if (view == null) return;

        view.SortDescriptions.Clear();
        view.SortDescriptions.Add(new SortDescription(sortBy, direction));
        view.Refresh();
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
