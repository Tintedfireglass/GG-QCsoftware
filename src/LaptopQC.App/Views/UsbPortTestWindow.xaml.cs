using System.Windows;
using LaptopQC.App.ViewModels;

namespace LaptopQC.App.Views;

/// <summary>
/// USB port test window - detects USB device insertions
/// </summary>
public partial class UsbPortTestWindow : Window
{
    private UsbPortTestViewModel ViewModel => (UsbPortTestViewModel)DataContext;

    public UsbPortTestWindow()
    {
        InitializeComponent();
        
        // Start watching automatically
        Loaded += (s, e) => ViewModel.StartWatchingCommand.Execute(null);
        
        // Subscribe to completion
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(UsbPortTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                DialogResult = ViewModel.Passed;
                Close();
            }
        };
        
        // Clean up on close
        Closing += (s, e) => ViewModel.Dispose();
    }

    /// <summary>
    /// Gets the test result
    /// </summary>
    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}
