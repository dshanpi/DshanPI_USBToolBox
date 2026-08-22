# DshanPI USBToolBox driver installation

USBToolBox shows this installer on its first Windows launch. It is also available
at **Settings > Windows Device Drivers**, where the package can be installed,
reinstalled, or uninstalled. Approve the Windows Administrator prompt when it
appears.

For manual installation, run `Install-DshanPI-USBToolBox.cmd`. For manual removal,
run the following from an Administrator PowerShell prompt:

```powershell
.\Install-DshanPI-USBToolBox.ps1 -Action Uninstall
```

The installer does two things:

1. Stages the original Microsoft-signed WCH driver packages without changing their INF files.
2. Sets the Windows device-instance `FriendlyName` for connected USBToolBox interfaces.

Expected names in Device Manager:

- `USB-HiSpeed-SERIAL-A DshanPI USBToolBox (COMx)`
- `USB-HiSpeed-SERIAL-B DshanPI USBToolBox (COMx)`
- `DshanPI USBToolBox`

The friendly-name task runs as `SYSTEM` once per minute. This makes the names apply to a device first connected after driver preinstallation, and to a new device instance created when the USB port changes. Press F5 in Device Manager if it is already open.

If the USBToolBox is being used by another program during installation, Windows can report that a restart is required. The driver package has still been installed successfully. Close the program and unplug/replug the device, or restart Windows. Do not run the installer a second time.

The task only matches these three interfaces:

- `USB\VID_1A86&PID_55DE&MI_00`
- `USB\VID_1A86&PID_55DE&MI_02`
- `USB\VID_1A86&PID_55DE&MI_04`

To remove only the automatic naming task, run this command from an Administrator command prompt:

```bat
schtasks /Delete /TN "DshanPI USBToolBox Friendly Names" /F
```

The naming executable is installed at `C:\ProgramData\DshanPI\USBToolBox\Set-DshanPI-FriendlyNames.exe`.
