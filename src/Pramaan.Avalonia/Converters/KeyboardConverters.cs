using System.Globalization;
using Avalonia.Data.Converters;

namespace Pramaan.Avalonia.Converters;

/// <summary>
/// Converts key column and row positions to Canvas coordinates.
/// </summary>
public class KeyPositionConverter : global::Avalonia.Data.Converters.IValueConverter, IMultiValueConverter
{
    private const double KeyWidth = 48;
    private const double KeyHeight = 42;

    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (parameter?.ToString() == "Y" && value is int row)
            return row * KeyHeight;

        return 0.0;
    }

    public object[]? ConvertBack(object? value, Type[] targetTypes, object? parameter, CultureInfo culture)
    {
        return Array.Empty<object>();
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return null;
    }

    public object? Convert(IList<object?> values, Type targetType, object? parameter, CultureInfo culture)
    {
        if (parameter?.ToString() == "X" && values.Count >= 1 && values[0] is double column)
            return column * KeyWidth;

        return 0.0;
    }
}

/// <summary>
/// Converts key width units to pixel width.
/// </summary>
public class KeyWidthConverter : global::Avalonia.Data.Converters.IValueConverter
{
    private const double KeyWidth = 48;
    private const double Margin = 3;

    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is double width)
            return (width * KeyWidth) - Margin;

        return KeyWidth - Margin;
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return null;
    }
}
