using System.Globalization;
using Avalonia.Data.Converters;

namespace Pramaan.Avalonia.Converters;

/// <summary>
/// Inverts a boolean value
/// </summary>
public class InverseBoolConverter : global::Avalonia.Data.Converters.IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
            return !boolValue;
        return value;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is bool boolValue)
            return !boolValue;
        return value;
    }
}


