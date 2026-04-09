using System.Windows;
using LaptopQC.App.Views;
using LaptopQC.Core.Services;

namespace LaptopQC.App.Services;

public static class ComplianceService
{
    private const int MaxDaysWithoutCheck = 7;

    public static async Task<bool> EnsureOnlineComplianceAsync(Window owner, bool force = false)
    {
        if (!force && !App.AuthService.IsOnlineCheckRequired(MaxDaysWithoutCheck))
        {
            App.SetComplianceLocked(false);
            return true;
        }

        var wifiTest = new WifiTestWindow
        {
            Owner = owner
        };
        var wifiResult = wifiTest.ShowDialog();
        if (wifiResult != true)
        {
            App.SetComplianceLocked(true);
            MessageBox.Show(owner,
                "Internet is required to continue. Please connect and retry.",
                "Internet Required",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return false;
        }

        App.AuthService.MarkOnlineCheckNow();
        App.SetComplianceLocked(false);

        // If we have a stored license, refresh it so disabled keys deactivate immediately
        if (!string.IsNullOrWhiteSpace(App.AuthService.LicenseKey))
        {
            var serial = DeviceIdentityService.GetMachineSerialNumber();
            var mac = DeviceIdentityService.GetMacAddress();
            var computerName = DeviceIdentityService.GetComputerName();

            LoginResult refreshResult = await App.AuthService.LoginWithLicenseAsync(
                App.AuthService.LicenseKey,
                serial,
                mac,
                computerName);

            if (!refreshResult.Success)
            {
                App.AuthService.Logout();
                MessageBox.Show(owner,
                    "Activation required. Your license is disabled or expired.",
                    "Activation Required",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
        }

        return true;
    }
}
