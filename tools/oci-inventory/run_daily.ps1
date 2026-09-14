param([string]$RuntimeConfig = (Join-Path $PSScriptRoot '.runtime.json'))
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath $RuntimeConfig -Raw | ConvertFrom-Json
$env:PYTHONPATH = $settings.sdkPath
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUNBUFFERED = '1'
$logDirectory = Join-Path $settings.output 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logFile = Join-Path $logDirectory ('daily_' + (Get-Date -Format 'yyyy-MM-dd_HHmmss') + '.log')
& $settings.python (Join-Path $PSScriptRoot 'collector.py') --config $settings.ociConfig --output $settings.output --node $settings.node --workers 6 --profile-workers 2 --if-due *>> $logFile
exit $LASTEXITCODE
