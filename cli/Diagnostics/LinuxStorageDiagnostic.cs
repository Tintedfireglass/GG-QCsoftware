using System.Text.Json;
using System.Text.RegularExpressions;
using LaptopQC.Core.Abstractions;
using LaptopQC.Core.Diagnostics;

namespace Pramaan.CLI.Diagnostics;

public class LinuxStorageDiagnostic : IStorageDiagnostic
{
    public StorageInfo GetInfo()
    {
        var info = new StorageInfo();

        try
        {
            // Use lsblk -J to enumerate block devices (JSON output)
            var lsblkJson = LinuxCommandRunner.TryRun("lsblk", "-J -b -o NAME,SIZE,TYPE,MODEL,ROTA,MOUNTPOINT");
            if (!string.IsNullOrEmpty(lsblkJson))
            {
                using var doc = JsonDocument.Parse(lsblkJson);
                if (doc.RootElement.TryGetProperty("blockdevices", out var devices))
                {
                    foreach (var dev in devices.EnumerateArray())
                    {
                        var type = dev.TryGetProperty("type", out var t) ? t.GetString() ?? "" : "";
                        if (type != "disk") continue;

                        var name = dev.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                        var model = dev.TryGetProperty("model", out var m) ? m.GetString()?.Trim() ?? "" : "";
                        var sizeStr = dev.TryGetProperty("size", out var s) ? s.GetString() ?? "0" : "0";
                        var rotaStr = dev.TryGetProperty("rota", out var r) ? r.GetString() ?? "1" : "1";

                        long.TryParse(sizeStr, out long sizeBytes);
                        bool.TryParse(rotaStr == "1" ? "true" : "false", out bool isHdd);

                        var device = new StorageDevice
                        {
                            DeviceId = $"/dev/{name}",
                            Model = string.IsNullOrWhiteSpace(model) ? name.ToUpperInvariant() : model,
                            SizeGB = sizeBytes / (1024.0 * 1024 * 1024),
                            IsSsd = !isHdd
                        };

                        // Gather volume usage from mounted children
                        if (dev.TryGetProperty("children", out var children))
                        {
                            foreach (var child in children.EnumerateArray())
                            {
                                var mount = child.TryGetProperty("mountpoint", out var mp) ? mp.GetString() : null;
                                if (!string.IsNullOrEmpty(mount))
                                {
                                    var df = LinuxCommandRunner.TryRun("df", $"-B1 {mount}");
                                    var dfMatch = Regex.Match(df, @"\S+\s+(\d+)\s+(\d+)\s+(\d+)");
                                    if (dfMatch.Success)
                                    {
                                        long used = long.Parse(dfMatch.Groups[2].Value);
                                        long free = long.Parse(dfMatch.Groups[3].Value);
                                        info.Volumes.Add(new StorageVolume
                                        {
                                            Name = mount,
                                            UsedBytes = used,
                                            FreeBytes = free
                                        });
                                    }
                                }
                            }
                        }

                        info.Devices.Add(device);
                    }
                }
            }
        }
        catch { /* Try fallback */ }

        // Fallback: parse /proc/partitions
        if (info.Devices.Count == 0)
        {
            var partitions = LinuxCommandRunner.ReadFile("/proc/partitions");
            foreach (var line in partitions.Split('\n').Skip(2))
            {
                var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 4) continue;
                var name = parts[3];
                // Only root disks (sda, nvme0n1, vda, etc. — no partition numbers for non-nvme)
                if (Regex.IsMatch(name, @"^\d") || (name.StartsWith("sd") && Regex.IsMatch(name, @"sd[a-z]\d")))
                    continue;
                if (long.TryParse(parts[2], out long kb))
                {
                    info.Devices.Add(new StorageDevice
                    {
                        DeviceId = $"/dev/{name}",
                        Model = name.ToUpperInvariant(),
                        SizeGB = kb / (1024.0 * 1024),
                        IsSsd = !name.StartsWith("hd")
                    });
                }
            }
        }

        return info;
    }

    public (bool IsHealthy, string Message) ValidateStorage(StorageInfo info)
    {
        EvaluateTamperState(info);
        if (info.Devices.Count == 0) return (false, "No storage devices detected");
        if (info.IsTampered) return (false, string.IsNullOrWhiteSpace(info.TamperReason) ? "Storage Tampered" : info.TamperReason);
        if (info.IsInconclusive) return (false, string.IsNullOrWhiteSpace(info.InconclusiveReason) ? "Storage health could not be determined" : info.InconclusiveReason);
        if (info.IsSuspicious) return (true, "Storage data suspicious — review recommended");
        return (true, $"{info.Devices.Count} drive(s) detected, {info.TotalCapacityGB:F0}GB total");
    }

    private static void EvaluateTamperState(StorageInfo info)
    {
        info.IsTampered = false;
        info.IsInconclusive = false;
        info.TamperReason = null;
        info.InconclusiveReason = null;
        
        bool hasHealthData = false;
        foreach (var device in info.Devices)
        {
            if (device.HealthPercent.HasValue) hasHealthData = true;
            if (device.SizeGB <= 0)
            {
                device.IsTampered = true;
                info.IsTampered = true;
                info.TamperReason = "Storage Tampered - Unable to read data";
            }
        }

        if (!hasHealthData && info.Devices.Count > 0)
        {
            info.IsInconclusive = true;
            info.InconclusiveReason = "Storage health inconclusive — run with sudo to enable SMART";
        }
    }
}
