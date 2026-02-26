namespace LaptopQC.Hardware.Providers;

public interface ISmartctlProvider
{
    bool IsAvailable { get; }
    string? FindSmartctlPath();
    List<SmartctlDrive> ScanDrives();
    SmartData? GetSmartData(string devicePath);
    SmartTestResult StartShortTest(string devicePath);
    SmartTestStatus GetTestStatus(string devicePath);
    List<SmartTestLogEntry> GetTestLog(string devicePath);
}
