param(
    [Parameter(Mandatory=$true)][string]$InstallDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][string]$SdkPath,
    [Parameter(Mandatory=$true)][string]$Node,
    [Parameter(Mandatory=$true)][string]$NodeModules,
    [string]$OciConfig = (Join-Path $env:USERPROFILE '.oci\config'),
    [switch]$RegisterSchedule
)
$ErrorActionPreference = 'Stop'
foreach ($file in @($Python,$Node,$OciConfig)) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required file not found: $file" } }
foreach ($directory in @($InstallDirectory,$OutputDirectory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$destination = (Resolve-Path -LiteralPath $InstallDirectory).Path
$source = (Resolve-Path -LiteralPath $PSScriptRoot).Path
# Copy only versioned program/configuration files; never copy collected customer data.
if ($source -ne $destination) {
    foreach ($file in (Get-ChildItem -LiteralPath $source -File | Where-Object { $_.Extension -in @('.py','.mjs','.ps1','.md','.json') -and $_.Name -ne '.runtime.json' })) {
        $target = Join-Path $destination $file.Name
        if (Test-Path -LiteralPath $target) {
            if ($file.Name -eq 'baselines.json') { continue } # Keep human-maintained rules.
            if ((Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath $file.FullName).Hash) { continue }
            Copy-Item -LiteralPath $target -Destination ($target + '.bak_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
        }
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }
}
$runtime = @{ python=$Python; sdkPath=$SdkPath; node=$Node; ociConfig=$OciConfig; output=$OutputDirectory }
$runtime | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination '.runtime.json') -Encoding UTF8
$junction=Join-Path $destination 'node_modules'
if (-not (Test-Path -LiteralPath $junction)) { New-Item -ItemType Junction -Path $junction -Target $NodeModules | Out-Null }
if ($RegisterSchedule) {
    $name='Wizbase OCI Resource Inventory'
    $existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) { Export-ScheduledTask -TaskName $name | Set-Content -LiteralPath (Join-Path $destination ('schedule_backup_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.xml')) }
    $taskUser=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $runner=Join-Path $destination 'run_daily.ps1'
    $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$runner+'"') -WorkingDirectory $destination
    $daily=New-ScheduledTaskTrigger -Daily -At '11:30'
    $logon=New-ScheduledTaskTrigger -AtLogOn -User $taskUser
    $principal=New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $name -Action $action -Trigger @($daily,$logon) -Principal $principal -Settings $settings -Description 'Read-only OCI configuration inventory. Daily 11:30 local time; missed-run catch-up at user logon. All OCI config profiles. No cloud mutations.' -Force | Select-Object TaskName,State
}
Write-Output "Installed: $destination"
Write-Output "Data and dated workbooks: $OutputDirectory"
