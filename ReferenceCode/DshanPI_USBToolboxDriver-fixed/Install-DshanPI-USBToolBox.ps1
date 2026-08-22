#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Uninstall')]
    [string]$Action = 'Install',
    [string]$ResultPath,
    [switch]$Quiet,
    [switch]$ValidateOnly,
    [switch]$SkipDriverInstall,
    [switch]$SkipScheduledTask
)

$ErrorActionPreference = 'Stop'
$TaskName = 'DshanPI USBToolBox Friendly Names'
$ScriptFilePath = [string]$MyInvocation.MyCommand.Path
$PackageRoot = [string]$PSScriptRoot
$InstallDirectory = ''
$System32Directory = ''
$RestartRequired = $false
$OperationStage = 'initializing'
$OperationLog = New-Object 'System.Collections.Generic.List[string]'
$OperationWarnings = New-Object 'System.Collections.Generic.List[string]'

function Initialize-OperationEnvironment {
    # Do not rely solely on process environment variables here. The script runs
    # in a newly elevated PowerShell process, where inherited variables may be
    # missing or have been sanitized by Windows.
    if ([string]::IsNullOrWhiteSpace($script:PackageRoot)) {
        if (-not [string]::IsNullOrWhiteSpace($ScriptFilePath)) {
            $script:PackageRoot = [IO.Path]::GetDirectoryName($ScriptFilePath)
        }
    }
    if ([string]::IsNullOrWhiteSpace($script:PackageRoot)) {
        throw 'Unable to determine the bundled driver package directory.'
    }

    $windowsDirectory = [Environment]::GetFolderPath(
        [Environment+SpecialFolder]::Windows
    )
    if ([string]::IsNullOrWhiteSpace($windowsDirectory)) {
        $windowsDirectory = [string]$env:SystemRoot
    }
    if ([string]::IsNullOrWhiteSpace($windowsDirectory)) {
        throw 'Unable to determine the Windows directory.'
    }
    $script:System32Directory = [IO.Path]::Combine($windowsDirectory, 'System32')

    $commonApplicationData = [Environment]::GetFolderPath(
        [Environment+SpecialFolder]::CommonApplicationData
    )
    if ([string]::IsNullOrWhiteSpace($commonApplicationData)) {
        $systemDriveRoot = [IO.Path]::GetPathRoot($windowsDirectory)
        if ([string]::IsNullOrWhiteSpace($systemDriveRoot)) {
            throw 'Unable to determine the ProgramData directory.'
        }
        $commonApplicationData = [IO.Path]::Combine($systemDriveRoot, 'ProgramData')
    }
    $script:InstallDirectory = [IO.Path]::Combine(
        $commonApplicationData,
        'DshanPI',
        'USBToolBox'
    )
}

function Add-OperationLog {
    param([string]$Message)
    $OperationLog.Add($Message) | Out-Null
    if (-not $Quiet) {
        Write-Host $Message
    }
}

function Add-OperationWarning {
    param([string]$Message)
    $OperationWarnings.Add($Message) | Out-Null
    if (-not $Quiet) {
        Write-Warning $Message
    }
}

function Write-OperationResult {
    param(
        [bool]$Success,
        [int]$ExitCode,
        [string]$ErrorMessage = ''
    )
    if ([string]::IsNullOrWhiteSpace($ResultPath)) {
        return
    }

    $result = [ordered]@{
        success = $Success
        exitCode = $ExitCode
        restartRequired = $RestartRequired
        stage = $OperationStage
        error = $ErrorMessage
        warnings = @($OperationWarnings)
        log = @($OperationLog)
    }
    try {
        $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ResultPath -Encoding UTF8 -Force
    } catch {
        # Result reporting must never replace the original operation result.
    }
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-PnpUtil {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $pnputil = [IO.Path]::Combine($System32Directory, 'pnputil.exe')
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = @(& $pnputil @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    foreach ($line in $output) {
        Add-OperationLog ([string]$line)
    }
    switch ($exitCode) {
        0 { return }
        259 {
            # ERROR_NO_MORE_ITEMS: the package may still have been staged when
            # no matching device is connected or a better driver is active.
            Add-OperationWarning "$Description completed without changing a connected device."
            return
        }
        3010 {
            $script:RestartRequired = $true
            Add-OperationWarning "$Description completed; Windows requires a restart."
            return
        }
        1641 {
            $script:RestartRequired = $true
            Add-OperationWarning "$Description completed and Windows initiated a restart."
            return
        }
        default {
            $detail = ($output | ForEach-Object { [string]$_ }) -join ' '
            throw "$Description failed with exit code $exitCode. $detail"
        }
    }
}

function Get-DshanPIDriverPackages {
    $pnputil = [IO.Path]::Combine($System32Directory, 'pnputil.exe')
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = @(& $pnputil /enum-drivers 2>&1)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($exitCode -ne 0) {
        throw "Unable to enumerate installed driver packages; PnPUtil exited with $exitCode. $($lines -join ' ')"
    }

    $text = $lines -join "`r`n"
    $blocks = [regex]::Split($text, '(?:\r?\n){2,}')
    $packages = foreach ($block in $blocks) {
        if ($block -notmatch '(?i)\b(?:CH343SER|CH341WDM)\.INF\b') {
            continue
        }
        $published = [regex]::Match($block, '(?i)\boem\d+\.inf\b')
        if ($published.Success) {
            $published.Value.ToLowerInvariant()
        }
    }
    return @($packages | Sort-Object -Unique)
}

function Install-DshanPIDrivers {
    $renamerSource = [IO.Path]::Combine($PackageRoot, 'tools', 'Set-DshanPI-FriendlyNames.exe')
    $serialInf = [IO.Path]::Combine($PackageRoot, 'CH343SER', 'Driver', 'CH343SER.INF')
    $interfaceInf = [IO.Path]::Combine($PackageRoot, 'CH341PAR', 'CH341PAR', 'CH341WDM.INF')

    foreach ($requiredFile in @($serialInf, $interfaceInf)) {
        if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
            throw "Required file is missing: $requiredFile"
        }
    }

    # Remember whether a target was connected before PnPUtil replaces/restarts
    # its device nodes. If so, wait for those nodes below instead of treating a
    # momentary zero-match helper run as a completed friendly-name update.
    $targetDeviceWasPresent = $false
    if (Test-Path -LiteralPath $renamerSource -PathType Leaf) {
        & $renamerSource --quiet --dry-run --require-match
        $targetDeviceWasPresent = ($LASTEXITCODE -eq 0)
    }

    if (-not $SkipDriverInstall) {
        foreach ($inf in @($serialInf, $interfaceInf)) {
            $script:OperationStage = "installing $([IO.Path]::GetFileName($inf))"
            Add-OperationLog "Installing signed driver package: $inf"
            Invoke-PnpUtil -Arguments @('/add-driver', $inf, '/install') -Description "Installing $([IO.Path]::GetFileName($inf))"
        }
    }

    # Friendly names are useful but are not required for the device drivers to
    # work. Keep failures here as warnings instead of failing a valid driver install.
    $script:OperationStage = 'installing friendly-name helper'
    try {
        if (-not (Test-Path -LiteralPath $renamerSource -PathType Leaf)) {
            throw "Friendly-name helper is missing: $renamerSource"
        }
        New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
        $renamerInstalled = [IO.Path]::Combine($InstallDirectory, 'Set-DshanPI-FriendlyNames.exe')
        Copy-Item -LiteralPath $renamerSource -Destination $renamerInstalled -Force

        if (-not $SkipScheduledTask) {
            $script:OperationStage = 'registering friendly-name task'
            $taskAction = '"' + $renamerInstalled + '" --quiet'
            Add-OperationLog "Registering scheduled task: $TaskName"
            $previousErrorAction = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            try {
                $taskTool = [IO.Path]::Combine($System32Directory, 'schtasks.exe')
                $taskOutput = @(& $taskTool /Create /TN $TaskName /SC MINUTE /MO 1 /TR $taskAction /RU SYSTEM /RL HIGHEST /F 2>&1)
                $taskExitCode = $LASTEXITCODE
            } finally {
                $ErrorActionPreference = $previousErrorAction
            }
            foreach ($line in $taskOutput) {
                Add-OperationLog ([string]$line)
            }
            if ($taskExitCode -ne 0) {
                throw "Unable to register the friendly-name task; schtasks exited with $taskExitCode. $($taskOutput -join ' ')"
            }
        }

        $state = [ordered]@{
            installedAt = [DateTime]::UtcNow.ToString('o')
            packages = @(Get-DshanPIDriverPackages)
        }
        $statePath = [IO.Path]::Combine($InstallDirectory, 'install-state.json')
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

        $script:OperationStage = 'applying friendly names'
        Add-OperationLog 'Applying DshanPI friendly names to connected devices...'
        $friendlyNameApplied = $false
        $friendlyNameExitCode = 0
        $friendlyNameAttempts = if ($targetDeviceWasPresent) { 10 } else { 1 }
        for ($attempt = 1; $attempt -le $friendlyNameAttempts; $attempt++) {
            & $renamerInstalled --quiet --require-match
            $friendlyNameExitCode = $LASTEXITCODE
            if ($friendlyNameExitCode -eq 0) {
                $friendlyNameApplied = $true
                Add-OperationLog "Friendly names applied after attempt $attempt."
                break
            }
            if ($friendlyNameExitCode -ne 3) {
                break
            }
            if ($attempt -lt $friendlyNameAttempts) {
                Start-Sleep -Milliseconds 750
            }
        }

        if (-not $friendlyNameApplied) {
            if (-not $targetDeviceWasPresent -and $friendlyNameExitCode -eq 3) {
                Add-OperationLog 'No connected DshanPI target is present; the scheduled task will name it when connected.'
            } else {
                Add-OperationWarning "The immediate friendly-name update returned $friendlyNameExitCode. The scheduled task will retry automatically."
            }
        }
    } catch {
        Add-OperationWarning $_.Exception.Message
    }

    $script:OperationStage = 'complete'
    Add-OperationLog 'Driver installation completed successfully.'
}

function Uninstall-DshanPIDrivers {
    $script:OperationStage = 'removing friendly-name task'
    try {
        Add-OperationLog "Removing scheduled task: $TaskName"
        $previousErrorAction = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            $taskTool = [IO.Path]::Combine($System32Directory, 'schtasks.exe')
            $taskOutput = @(& $taskTool /Delete /TN $TaskName /F 2>&1)
            $taskExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorAction
        }
        # Exit code 1 means the task did not exist, which is already the desired state.
        if ($taskExitCode -notin @(0, 1)) {
            throw "Unable to remove the friendly-name task; schtasks exited with $taskExitCode. $($taskOutput -join ' ')"
        }
    } catch {
        Add-OperationWarning $_.Exception.Message
    }

    foreach ($publishedName in @(Get-DshanPIDriverPackages)) {
        $script:OperationStage = "removing $publishedName"
        Add-OperationLog "Removing driver package: $publishedName"
        Invoke-PnpUtil -Arguments @('/delete-driver', $publishedName, '/uninstall', '/force') -Description "Removing $publishedName"
    }

    $script:OperationStage = 'removing friendly-name helper'
    try {
        if (Test-Path -LiteralPath $InstallDirectory) {
            Remove-Item -LiteralPath $InstallDirectory -Recurse -Force
        }
    } catch {
        Add-OperationWarning $_.Exception.Message
    }

    $script:OperationStage = 'complete'
    Add-OperationLog 'Driver uninstallation completed successfully.'
}

try {
    Initialize-OperationEnvironment

    if ($ValidateOnly) {
        $script:OperationStage = 'complete'
        Add-OperationLog "Validated driver package directory: $PackageRoot"
        Add-OperationLog "Validated Windows system directory: $System32Directory"
        Add-OperationLog "Validated application data directory: $InstallDirectory"
        Write-OperationResult -Success $true -ExitCode 0
        exit 0
    }

    if (-not (Test-IsAdministrator)) {
        throw 'Run this driver operation as Administrator.'
    }

    if ($Action -eq 'Uninstall') {
        Uninstall-DshanPIDrivers
    } else {
        Install-DshanPIDrivers
    }

    if ($RestartRequired) {
        Add-OperationWarning 'Close applications using USBToolBox, then reconnect the device or restart Windows.'
        Write-OperationResult -Success $true -ExitCode 3010
        exit 3010
    }
    Write-OperationResult -Success $true -ExitCode 0
    exit 0
} catch {
    if (-not [string]::IsNullOrWhiteSpace($_.InvocationInfo.PositionMessage)) {
        Add-OperationLog $_.InvocationInfo.PositionMessage
    }
    Write-OperationResult -Success $false -ExitCode 1 -ErrorMessage $_.Exception.Message
    if (-not $Quiet) {
        Write-Error $_.Exception.Message
    }
    exit 1
}
