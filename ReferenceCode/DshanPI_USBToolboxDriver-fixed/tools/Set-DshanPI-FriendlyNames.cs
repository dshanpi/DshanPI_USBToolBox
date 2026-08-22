using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

internal static class Program
{
    private const uint DIGCF_PRESENT = 0x00000002;
    private const uint DIGCF_ALLCLASSES = 0x00000004;
    private const uint SPDRP_HARDWAREID = 0x00000001;
    private const uint SPDRP_DEVICEDESC = 0x00000000;
    private const uint SPDRP_FRIENDLYNAME = 0x0000000C;
    private const uint DICS_FLAG_GLOBAL = 0x00000001;
    private const uint DIREG_DEV = 0x00000001;
    private const int KEY_READ = 0x00020019;
    private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential)]
    private struct SP_DEVINFO_DATA
    {
        public int cbSize;
        public Guid ClassGuid;
        public uint DevInst;
        public UIntPtr Reserved;
    }

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr SetupDiGetClassDevs(
        IntPtr classGuid,
        string enumerator,
        IntPtr hwndParent,
        uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiEnumDeviceInfo(
        IntPtr deviceInfoSet,
        uint memberIndex,
        ref SP_DEVINFO_DATA deviceInfoData);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiGetDeviceRegistryProperty(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData,
        uint property,
        out uint propertyRegDataType,
        byte[] propertyBuffer,
        uint propertyBufferSize,
        out uint requiredSize);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiSetDeviceRegistryProperty(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData,
        uint property,
        byte[] propertyBuffer,
        uint propertyBufferSize);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiGetDeviceInstanceId(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData,
        StringBuilder deviceInstanceId,
        uint deviceInstanceIdSize,
        out uint requiredSize);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern IntPtr SetupDiOpenDevRegKey(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData,
        uint scope,
        uint hwProfile,
        uint keyType,
        int samDesired);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int RegQueryValueEx(
        IntPtr hKey,
        string valueName,
        IntPtr reserved,
        out uint type,
        byte[] data,
        ref uint dataSize);

    [DllImport("advapi32.dll")]
    private static extern int RegCloseKey(IntPtr hKey);

    private static string[] GetMultiStringProperty(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData,
        uint property)
    {
        uint type;
        uint required;
        SetupDiGetDeviceRegistryProperty(
            deviceInfoSet, ref deviceInfoData, property, out type, null, 0, out required);
        if (required == 0)
            return new string[0];

        byte[] buffer = new byte[required];
        if (!SetupDiGetDeviceRegistryProperty(
            deviceInfoSet, ref deviceInfoData, property, out type,
            buffer, (uint)buffer.Length, out required))
            return new string[0];

        string value = Encoding.Unicode.GetString(buffer).TrimEnd('\0');
        return value.Split(new[] { '\0' }, StringSplitOptions.RemoveEmptyEntries);
    }

    private static string GetStringProperty(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData,
        uint property)
    {
        string[] values = GetMultiStringProperty(deviceInfoSet, ref deviceInfoData, property);
        return values.Length == 0 ? string.Empty : values[0];
    }

    private static string GetInstanceId(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData)
    {
        StringBuilder value = new StringBuilder(1024);
        uint required;
        if (!SetupDiGetDeviceInstanceId(
            deviceInfoSet, ref deviceInfoData, value, (uint)value.Capacity, out required))
            return string.Empty;
        return value.ToString();
    }

    private static string GetPortName(
        IntPtr deviceInfoSet,
        ref SP_DEVINFO_DATA deviceInfoData)
    {
        IntPtr key = SetupDiOpenDevRegKey(
            deviceInfoSet, ref deviceInfoData,
            DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_READ);
        if (key == IntPtr.Zero || key == INVALID_HANDLE_VALUE)
            return string.Empty;

        try
        {
            uint type;
            uint size = 0;
            if (RegQueryValueEx(key, "PortName", IntPtr.Zero, out type, null, ref size) != 0 || size == 0)
                return string.Empty;

            byte[] buffer = new byte[size];
            if (RegQueryValueEx(key, "PortName", IntPtr.Zero, out type, buffer, ref size) != 0)
                return string.Empty;

            return Encoding.Unicode.GetString(buffer).TrimEnd('\0');
        }
        finally
        {
            RegCloseKey(key);
        }
    }

    private static string GetTargetBaseName(string[] hardwareIds)
    {
        foreach (string id in hardwareIds)
        {
            if (!id.StartsWith("USB\\VID_1A86&PID_55DE", StringComparison.OrdinalIgnoreCase))
                continue;

            if (Regex.IsMatch(id, "&MI_00$", RegexOptions.IgnoreCase))
                return "USB-HiSpeed-SERIAL-A DshanPI USBToolBox";
            if (Regex.IsMatch(id, "&MI_02$", RegexOptions.IgnoreCase))
                return "USB-HiSpeed-SERIAL-B DshanPI USBToolBox";
            if (Regex.IsMatch(id, "&MI_04$", RegexOptions.IgnoreCase))
                return "DshanPI USBToolBox";
        }
        return string.Empty;
    }

    private static string BuildFriendlyName(
        string targetBaseName,
        string previousName,
        string portName)
    {
        if (targetBaseName.IndexOf("SERIAL-", StringComparison.OrdinalIgnoreCase) < 0)
            return targetBaseName;

        if (!string.IsNullOrWhiteSpace(portName))
            return targetBaseName + " (" + portName.Trim() + ")";

        Match suffix = Regex.Match(previousName ?? string.Empty, @"\s*\((COM\d+)\)\s*$", RegexOptions.IgnoreCase);
        return suffix.Success ? targetBaseName + " (" + suffix.Groups[1].Value + ")" : targetBaseName;
    }

    private static int Main(string[] args)
    {
        bool quiet = false;
        bool dryRun = false;
        bool requireMatch = false;
        foreach (string arg in args)
        {
            if (string.Equals(arg, "--quiet", StringComparison.OrdinalIgnoreCase))
                quiet = true;
            if (string.Equals(arg, "--dry-run", StringComparison.OrdinalIgnoreCase))
                dryRun = true;
            if (string.Equals(arg, "--require-match", StringComparison.OrdinalIgnoreCase))
                requireMatch = true;
        }

        IntPtr deviceInfoSet = SetupDiGetClassDevs(
            IntPtr.Zero, null, IntPtr.Zero, DIGCF_PRESENT | DIGCF_ALLCLASSES);
        if (deviceInfoSet == INVALID_HANDLE_VALUE)
        {
            if (!quiet)
                Console.Error.WriteLine("Unable to enumerate devices: " + new Win32Exception().Message);
            return 1;
        }

        int matched = 0;
        int changed = 0;
        int failed = 0;

        try
        {
            for (uint index = 0; ; index++)
            {
                SP_DEVINFO_DATA data = new SP_DEVINFO_DATA();
                data.cbSize = Marshal.SizeOf(typeof(SP_DEVINFO_DATA));
                if (!SetupDiEnumDeviceInfo(deviceInfoSet, index, ref data))
                {
                    const int ERROR_NO_MORE_ITEMS = 259;
                    int error = Marshal.GetLastWin32Error();
                    if (error != ERROR_NO_MORE_ITEMS)
                        failed++;
                    break;
                }

                string[] hardwareIds = GetMultiStringProperty(
                    deviceInfoSet, ref data, SPDRP_HARDWAREID);
                string targetBaseName = GetTargetBaseName(hardwareIds);
                if (targetBaseName.Length == 0)
                    continue;

                matched++;
                string instanceId = GetInstanceId(deviceInfoSet, ref data);
                string previousName = GetStringProperty(
                    deviceInfoSet, ref data, SPDRP_FRIENDLYNAME);
                if (previousName.Length == 0)
                    previousName = GetStringProperty(deviceInfoSet, ref data, SPDRP_DEVICEDESC);

                string portName = GetPortName(deviceInfoSet, ref data);
                string newName = BuildFriendlyName(targetBaseName, previousName, portName);
                if (string.Equals(previousName, newName, StringComparison.Ordinal))
                {
                    if (!quiet)
                        Console.WriteLine("OK       {0}: {1}", instanceId, newName);
                    continue;
                }

                if (dryRun)
                {
                    if (!quiet)
                        Console.WriteLine("WOULD SET {0}: {1} -> {2}", instanceId, previousName, newName);
                    continue;
                }

                byte[] value = Encoding.Unicode.GetBytes(newName + "\0");
                if (!SetupDiSetDeviceRegistryProperty(
                    deviceInfoSet, ref data, SPDRP_FRIENDLYNAME,
                    value, (uint)value.Length))
                {
                    failed++;
                    if (!quiet)
                        Console.Error.WriteLine("FAILED   {0}: {1}", instanceId, new Win32Exception().Message);
                    continue;
                }

                changed++;
                if (!quiet)
                    Console.WriteLine("SET      {0}: {1}", instanceId, newName);
            }
        }
        finally
        {
            SetupDiDestroyDeviceInfoList(deviceInfoSet);
        }

        if (!quiet)
            Console.WriteLine("Matched: {0}; changed: {1}; failed: {2}", matched, changed, failed);
        if (failed != 0)
            return 2;
        // The normal scheduled task treats "no connected target" as success. The
        // installer uses --require-match while Windows is recreating the device
        // nodes, so it can distinguish "not ready yet" and retry before returning.
        return requireMatch && matched == 0 ? 3 : 0;
    }
}
