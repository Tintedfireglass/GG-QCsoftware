using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Media;

namespace Pramaan.Avalonia.Converters;

/// <summary>
/// Converts a grade string (S, A, B, C, D, E) to a WPF SolidColorBrush.
/// </summary>
public class GradeToColorConverter : global::Avalonia.Data.Converters.IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var grade = value?.ToString() ?? "";
        
        return grade switch
        {
            "S" => new SolidColorBrush(Color.FromRgb(202, 138, 4)),    // Gold
            "A" => new SolidColorBrush(Color.FromRgb(21, 128, 61)),    // Green
            "B" => new SolidColorBrush(Color.FromRgb(13, 148, 136)),   // Teal
            "C" => new SolidColorBrush(Color.FromRgb(217, 119, 6)),    // Amber
            "D" => new SolidColorBrush(Color.FromRgb(234, 88, 12)),    // Orange
            "E" => new SolidColorBrush(Color.FromRgb(220, 38, 38)),    // Red
            _   => new SolidColorBrush(Color.FromRgb(107, 114, 128)),  // Gray
        };
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}


