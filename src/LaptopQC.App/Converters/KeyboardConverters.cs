using System.Globalization;
using System.Windows.Data;

namespace LaptopQC.App.Converters;

/// <summary>
/// Converts key column position to Canvas.Left pixel value
/// and row position to Canvas.Top pixel value
/// </summary>
public class KeyPositionConverter : IValueConverter, IMultiValueConverter
{
    private const double KeyWidth = 50;
    private const double KeyHeight = 44;
    private const double Padding = 2;

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        // Single value conversion (Y position from Row)
        if (parameter?.ToString() == "Y" && value is int row)
        {
            return row * KeyHeight;
        }
        return 0.0;
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }

    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        // Multi value conversion (X position from Column and Width)
        if (parameter?.ToString() == "X" && values.Length >= 1)
        {
            if (values[0] is double column)
            {
                return column * KeyWidth;
            }
        }
        return 0.0;
    }
}

/// <summary>
/// Converts key width unit (1 = standard key) to pixel width
/// </summary>
public class KeyWidthConverter : IValueConverter
{
    private const double KeyWidth = 50;
    private const double Margin = 4;

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is double width)
        {
            return (width * KeyWidth) - Margin;
        }
        return KeyWidth - Margin;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
