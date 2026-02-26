using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Data.Converters;
using Avalonia.Media;
using Pramaan.Avalonia.ViewModels;
using System;
using System.Globalization;

namespace Pramaan.Avalonia.Views;

public partial class AudioVideoTestWindow : Window
{
    private AudioVideoTestViewModel ViewModel => (AudioVideoTestViewModel)DataContext!;

    public AudioVideoTestWindow()
    {
        InitializeComponent();
        
        // Return result when complete
        ViewModel.PropertyChanged += (s, e) =>
        {
            if (e.PropertyName == nameof(AudioVideoTestViewModel.IsComplete) && ViewModel.IsComplete)
            {
                // Result checking logic in GetResult()
            }
        };
    }
    
    // Close button handler
    private void CloseButton_Click(object? sender, RoutedEventArgs e)
    {
        Close();
    }

    public (bool Passed, string Message) GetResult()
    {
        return (ViewModel.Passed, ViewModel.ResultMessage);
    }
}

public class BoolToPassFailStringConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool b)
        {
            return b ? "✓ PASS" : "✗ FAIL";
        }
        return "";
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class BoolToResultColorConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool b)
        {
            return b ? SolidColorBrush.Parse("#22c55e") : SolidColorBrush.Parse("#ef4444");
        }
        return SolidColorBrush.Parse("#00000000"); // Transparent
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
