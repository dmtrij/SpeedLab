$ErrorActionPreference = "Stop"

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$url = "http://localhost:$port"
$appDataDir = if ($env:SPEEDLAB_DATA_DIR) {
  [System.IO.Path]::GetFullPath($env:SPEEDLAB_DATA_DIR)
} else {
  Join-Path $projectDir "app-data"
}
$stdoutLog = Join-Path $appDataDir "server.stdout.log"
$stderrLog = Join-Path $appDataDir "server.stderr.log"
$pidFile = Join-Path $appDataDir ".speedlab.pid"

New-Item -ItemType Directory -Path $appDataDir -Force | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function New-SpeedLabIcon {
  $bitmap = New-Object System.Drawing.Bitmap 32, 32
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(7, 17, 31))
  $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(140, 240, 211))
  $font = New-Object System.Drawing.Font "Segoe UI", 11, ([System.Drawing.FontStyle]::Bold)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center

  $graphics.FillEllipse($bgBrush, 0, 0, 31, 31)
  $graphics.DrawString("SL", $font, $accentBrush, (New-Object System.Drawing.RectangleF 0, 0, 32, 31), $format)

  $handle = $bitmap.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($handle)

  $graphics.Dispose()
  $bitmap.Dispose()
  $bgBrush.Dispose()
  $accentBrush.Dispose()
  $font.Dispose()
  $format.Dispose()

  return $icon
}

function Get-SpeedLabProcess {
  if (!(Test-Path $pidFile)) {
    return $null
  }

  $rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if (!$rawPid -or !($rawPid -as [int])) {
    return $null
  }

  return Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
}

function Test-SpeedLabHttp {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Set-TrayStatus {
  param([string]$Message)

  $script:notifyIcon.Text = "SpeedLab - $Message"
}

function Start-SpeedLab {
  $existing = Get-SpeedLabProcess
  if ($existing -and !$existing.HasExited) {
    Set-TrayStatus "уже запущен"
    return
  }

  $process = Start-Process `
    -FilePath $nodeExe `
    -ArgumentList "server.js" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru

  Set-Content -Path $pidFile -Value $process.Id -Encoding ASCII
  Start-Sleep -Milliseconds 900

  if (Test-SpeedLabHttp) {
    Set-TrayStatus "запущен"
  } else {
    Set-TrayStatus "запускается"
  }
}

function Stop-SpeedLab {
  $process = Get-SpeedLabProcess
  if ($process -and !$process.HasExited) {
    Stop-Process -Id $process.Id -Force
  }

  if (Test-Path $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force
  }

  Set-TrayStatus "остановлен"
}

function Restart-SpeedLab {
  Stop-SpeedLab
  Start-Sleep -Milliseconds 400
  Start-SpeedLab
}

function Open-SpeedLab {
  Start-Process $url
}

$script:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$script:notifyIcon.Icon = New-SpeedLabIcon
$script:notifyIcon.Visible = $true
$script:notifyIcon.Text = "SpeedLab"

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add("Открыть SpeedLab")
$openItem.add_Click({ Open-SpeedLab })

$restartItem = $menu.Items.Add("Перезапустить сервер")
$restartItem.add_Click({ Restart-SpeedLab })

$stopItem = $menu.Items.Add("Остановить сервер")
$stopItem.add_Click({ Stop-SpeedLab })

$menu.Items.Add("-") | Out-Null

$exitItem = $menu.Items.Add("Выход")
$exitItem.add_Click({
  Stop-SpeedLab
  $script:notifyIcon.Visible = $false
  $script:notifyIcon.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$script:notifyIcon.ContextMenuStrip = $menu
$script:notifyIcon.add_DoubleClick({ Open-SpeedLab })

Start-SpeedLab
Open-SpeedLab

[System.Windows.Forms.Application]::Run()
