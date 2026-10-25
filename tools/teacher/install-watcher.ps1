# Installs the 8.5 homework watcher (watch.mjs) as a hidden background task: it starts now, at every logon,
# and Task Scheduler checks every five minutes that it is still running. Run it again any time; it replaces the old task.
#   install-watcher.cmd             install and start
#   install-watcher.cmd -Remove     stop and remove
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$name = "8.5 homework watcher"

function Stop-Watcher {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'teacher[\\/]watch\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Stop-Watcher
  Write-Host "The homework watcher is stopped and removed."
  return
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot "watch.mjs"

# conhost --headless runs node without a window
$action = New-ScheduledTaskAction -Execute "conhost.exe" -Argument "--headless `"$node`" `"$script`"" -WorkingDirectory $root
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Stop-Watcher
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($atLogon, $every5) -Settings $settings -Principal $principal -Description "8.5: hands Send to Claude requests from Teacher mode to Claude Code and publishes the homework." -Force | Out-Null
Start-ScheduledTask -TaskName $name
Start-Sleep -Seconds 4
try { $s = Invoke-RestMethod -Uri "http://127.0.0.1:47185" -TimeoutSec 5; Write-Host "The homework watcher is running (started $($s.started))." }
catch { Write-Host "The task is installed but the watcher did not answer yet. Look at tools\teacher\watch.log." }
