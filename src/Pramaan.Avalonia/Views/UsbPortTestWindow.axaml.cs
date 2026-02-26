using Avalonia.Controls;
using Pramaan.Avalonia.ViewModels;
using Avalonia.Data.Converters;
using Avalonia.Media;
using System;
using System.Globalization;

namespace Pramaan.Avalonia.Views;

public partial class UsbPortTestWindow : Window
{
    private UsbPortTestViewModel ViewModel => (UsbPortTestViewModel)DataContext!;

    public UsbPortTestWindow()
    {
        InitializeComponent();
        
        Opened += (s, e) => ViewModel.StartWatchingCommand.Execute(null);
        
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(UsbPortTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                Close();
            }
        };
        
        Closing += (s, e) => ViewModel.Dispose();
    }

    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}

public class UsbVersionColorConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string version)
        {
            if (version == "USB 3.x")
                return SolidColorBrush.Parse("#0891b2");
            if (version == "USB 2.0")
                return SolidColorBrush.Parse("#6b7280");
        }
        return SolidColorBrush.Parse("#e5e7eb");
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class UsbVersionTextColorConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string version && (version == "USB 3.x" || version == "USB 2.0"))
        {
            return SolidColorBrush.Parse("White");
        }
        return SolidColorBrush.Parse("#374151");
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
