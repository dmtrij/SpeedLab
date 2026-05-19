$ErrorActionPreference = "Stop"

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$trayScript = Join-Path $PSScriptRoot "speedlab-tray.ps1"
$trayLauncher = Join-Path $PSScriptRoot "speedlab-tray.vbs"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "SpeedLab.lnk"
$wscriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"
$iconSource = Join-Path $projectDir "public\favicon.svg"

if (!(Test-Path $trayScript)) {
  throw "Не найден $trayScript"
}

if (!(Test-Path $trayLauncher)) {
  throw "Не найден $trayLauncher"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $wscriptExe
$shortcut.Arguments = "`"$trayLauncher`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = "Запустить SpeedLab с иконкой в трее"
$shortcut.IconLocation = if (Test-Path $iconSource) { "$iconSource,0" } else { "$wscriptExe,0" }
$shortcut.Save()

Write-Host "Ярлык создан: $shortcutPath"
