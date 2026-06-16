using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Media;

namespace Pramaan.Avalonia.Converters;

/// <summary>
/// Converts a grade string (S, A, B, C, D, E) to a color brush.
/// </summary>
public class GradeToColorConverter : global::Avalonia.Data.Converters.IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var grade = value?.ToString() ?? "";

        return grade switch
        {
            "S" => new SolidColorBrush(Color.FromRgb(202, 138, 4)),
            "A" => new SolidColorBrush(Color.FromRgb(21, 128, 61)),
            "B" => new SolidColorBrush(Color.FromRgb(13, 148, 136)),
            "C" => new SolidColorBrush(Color.FromRgb(217, 119, 6)),
            "D" => new SolidColorBrush(Color.FromRgb(234, 88, 12)),
            "E" => new SolidColorBrush(Color.FromRgb(220, 38, 38)),
            _ => new SolidColorBrush(Color.FromRgb(107, 114, 128)),
        };
    }

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return null;
    }
}
