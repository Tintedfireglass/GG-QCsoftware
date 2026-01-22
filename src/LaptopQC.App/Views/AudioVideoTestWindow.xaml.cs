using System.Windows;

namespace LaptopQC.App.Views;

public partial class AudioVideoTestWindow : Window
{
    public AudioVideoTestWindow()
    {
        InitializeComponent();
    }
    
    // Close button handler (not MVVM pure but fine for simple window close)
    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
