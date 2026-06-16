using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Media;

namespace Pramaan.Avalonia.Converters;

/// <summary>
/// Converts a boolean to a simple pass/fail label.
/// </summary>
public class BoolToPassFailConverter : global::Avalonia.Data.Converters.IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
            return boolValue ? "PASS" : "FAIL";

        return "N/A";
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return null;
    }
}

/// <summary>
/// Converts a boolean to green/red color for status display.
/// </summary>
public class BoolToColorConverter : global::Avalonia.Data.Converters.IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
        {
            var param = parameter as string ?? "";
            if (param == "bg")
                return boolValue
                    ? new SolidColorBrush(Color.Parse("#dcfce7"))
                    : new SolidColorBrush(Color.Parse("#fee2e2"));

            if (param == "fg")
                return boolValue
                    ? new SolidColorBrush(Color.Parse("#15803d"))
                    : new SolidColorBrush(Color.Parse("#dc2626"));

            return boolValue
                ? new SolidColorBrush(Color.FromRgb(0, 217, 255))
                : new SolidColorBrush(Color.FromRgb(255, 107, 107));
        }

        return new SolidColorBrush(Color.FromRgb(160, 160, 160));
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return null;
    }
}
