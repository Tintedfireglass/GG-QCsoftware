using Avalonia.Controls;
using Avalonia.Interactivity;

namespace Pramaan.Avalonia.Views;

public partial class CleanupWindow : Window
{
    public CleanupWindow()
    {
        InitializeComponent();
        Loaded += CleanupWindow_Loaded;
    }

    private void CleanupWindow_Loaded(object? sender, RoutedEventArgs e)
    {
        if (DataContext is ViewModels.CleanupViewModel vm && vm.ScanCommand.CanExecute(null))
        {
            vm.ScanCommand.Execute(null);
        }
    }

    private void Close_Click(object? sender, RoutedEventArgs e)
    {
        Close();
    }
}
