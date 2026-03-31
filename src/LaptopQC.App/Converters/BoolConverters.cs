using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows;

namespace LaptopQC.App.Converters;

/// <summary>
/// Converts a boolean to "✓" or "✗"
/// </summary>
public class BoolToPassFailConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
            return boolValue ? "✓" : "✗";
        return "?";
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

/// <summary>
/// Converts a boolean to green/red color for status display
/// </summary>
public class BoolToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
            return boolValue ? new SolidColorBrush(Color.FromRgb(0, 217, 255)) : new SolidColorBrush(Color.FromRgb(255, 107, 107));
        return new SolidColorBrush(Color.FromRgb(160, 160, 160));
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

/// <summary>
/// Converts boolean to Visibility.Visible (if false) or Collapsed (if true)
/// </summary>
public class InverseBooleanToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
            return boolValue ? Visibility.Collapsed : Visibility.Visible;
        return Visibility.Visible;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

/// <summary>
/// Converts boolean to a column width (parameter) or 0 when false.
/// </summary>
public class BoolToWidthConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is bool boolValue && boolValue)
        {
            if (parameter is double width)
                return width;
            if (parameter is string str && double.TryParse(str, out var parsed))
                return parsed;
            return 0d;
        }
        return 0d;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
