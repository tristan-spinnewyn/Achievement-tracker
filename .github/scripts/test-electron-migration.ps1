<#
  End-to-end check of the move from the Electron app (v2.x) to the Tauri app,
  on a clean Windows runner:
  1. installs the Electron app, as its users did, and gives it some data;
  2. runs the Tauri installer the way electron-updater does on quit
     (`--updated /S`, see latest.yml in the release workflow);
  3. checks that the Electron app is gone, its data kept, and the Tauri app
     installed with the shortcuts;
  4. starts the Tauri app once and checks that it copied the Electron data.

  It installs and uninstalls applications for the current user: it refuses to
  run anywhere but on GitHub Actions.
#>
param(
  [Parameter(Mandatory = $true)][string]$ElectronInstaller,
  [Parameter(Mandatory = $true)][string]$TauriInstaller
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') {
  throw 'This check installs and removes applications: it only runs on GitHub Actions.'
}

$electronGuid = '75cabb0c-6d13-5258-a69d-23b1c2b51965'
$electronUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$electronGuid"
$electronDir = Join-Path $env:LOCALAPPDATA 'Programs\FFXIV Achievement Tracker'
$electronData = Join-Path $env:APPDATA 'ffxiv-achievement-tracker'
$tauriExe = Join-Path $env:LOCALAPPDATA 'FFXIV Achievement Tracker\ffxiv-achievement-tracker.exe'
$tauriData = Join-Path $env:APPDATA 'com.shin.ffxiv-achievement-tracker'
$shortcutName = 'FFXIV Achievement Tracker.lnk'
$startMenuShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) $shortcutName
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) $shortcutName

function Assert-That([bool]$Condition, [string]$Description) {
  if (-not $Condition) { throw "FAILED: $Description" }
  Write-Host "ok - $Description"
}

function Get-ShortcutTarget([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return (New-Object -ComObject WScript.Shell).CreateShortcut($Path).TargetPath
}

function Invoke-Installer([string]$Path, [string[]]$Arguments) {
  $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Wait -PassThru
  Write-Host "$(Split-Path $Path -Leaf) $($Arguments -join ' ') exited with $($process.ExitCode)"
}

# 1. The Electron app and its data.
Invoke-Installer $ElectronInstaller @('/S', '/currentuser')
Assert-That (Test-Path $electronUninstallKey) 'the Electron app is registered'
Assert-That (Test-Path (Join-Path $electronDir 'FFXIV Achievement Tracker.exe')) 'the Electron app is installed'

New-Item -ItemType Directory -Force -Path $electronData | Out-Null
$electronUser = Join-Path $electronData 'userdata.json'
# UTF-8 without BOM, like the Electron app writes it.
[IO.File]::WriteAllText($electronUser, '{"progress":{"100":{"completed":true}},"settings":{"autoBackupDocuments":false,"autoSync":false}}')
[IO.File]::WriteAllText((Join-Path $electronData 'window-state.json'), '{"width":1280,"height":868,"x":40,"y":40,"maximized":false}')

# 2. The update, as electron-updater runs it when the app quits.
Invoke-Installer $TauriInstaller @('--updated', '/S')

# 3. One app left, the Electron data kept.
Assert-That (-not (Test-Path $electronUninstallKey)) 'the Electron app is no longer registered'
Assert-That (-not (Test-Path $electronDir)) 'the Electron install folder is removed'
Assert-That (Test-Path $electronUser) 'the Electron data is kept'
Assert-That (Test-Path $tauriExe) 'the Tauri app is installed'
Assert-That ((Get-ShortcutTarget $startMenuShortcut) -eq $tauriExe) 'the Start Menu shortcut opens the Tauri app'
Assert-That ((Get-ShortcutTarget $desktopShortcut) -eq $tauriExe) 'the desktop shortcut opens the Tauri app'

# 4. First launch of the Tauri app: it copies the Electron data.
$tauriUser = Join-Path $tauriData 'userdata.json'
$app = Start-Process -FilePath $tauriExe -PassThru
try {
  $deadline = (Get-Date).AddSeconds(60)
  while (-not (Test-Path $tauriUser) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
} finally {
  Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
}
Assert-That (Test-Path $tauriUser) 'the Tauri app created its user data'
Assert-That ((Get-FileHash $tauriUser).Hash -eq (Get-FileHash $electronUser).Hash) 'the Tauri app copied the Electron user data'
