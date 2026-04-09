using System.Windows;
using LaptopQC.App.ViewModels;

namespace LaptopQC.App.Views;

public partial class QCWizardWindow : Window
{
    public QCWizardWindow()
    {
        InitializeComponent();
        App.AuthService.LoggedOut += HandleLoggedOut;
        Closed += (_, _) => App.AuthService.LoggedOut -= HandleLoggedOut;
    }

    private void HandleLoggedOut()
    {
        Dispatcher.Invoke(() =>
        {
            if (IsVisible)
            {
                MessageBox.Show(
                    this,
                    "Activation required. QC session closed.",
                    "Activation Required",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
            Close();
        });
    }
}
