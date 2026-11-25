; Hooks of the NSIS installer (`bundle.windows.nsis.installerHooks` in tauri.conf.json).

; Uninstall key of the Electron app (v2.x). electron-builder derives this GUID
; from the app id (com.shin.ffxiv-achievement-tracker): it is the same on every computer.
!define ELECTRON_APP_GUID "75cabb0c-6d13-5258-a69d-23b1c2b51965"
!define ELECTRON_UNINSTALLER "Uninstall FFXIV Achievement Tracker.exe"

; Before installing, removes the Electron version of the app, so a single app
; and a single set of shortcuts remain. Its data (%APPDATA%\ffxiv-achievement-tracker)
; is kept: the Tauri app copies it on its first launch.
;
; This also covers the update path of the Electron app: electron-updater downloads
; this installer from the latest release (latest.yml) and runs it.
!macro NSIS_HOOK_PREINSTALL
  Push $R0
  Push $R1
  Push $R2
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ELECTRON_APP_GUID}" "QuietUninstallString"
  ReadRegStr $R1 HKCU "Software\${ELECTRON_APP_GUID}" "InstallLocation"
  ${If} $R0 != ""
  ${AndIf} $R1 != ""
    DetailPrint "Removing the Electron version of ${PRODUCTNAME}..."
    ; `_?=` runs the uninstaller from its folder, so ExecWait waits for it.
    ; Without --delete-app-data, the Electron uninstaller keeps the app data.
    ExecWait '$R0 _?=$R1' $R2
    DetailPrint "Electron version removed (exit code $R2)."
    ; Run in place, the uninstaller cannot delete itself nor its folder.
    Delete "$R1\${ELECTRON_UNINSTALLER}"
    RMDir "$R1"
  ${EndIf}
  Pop $R2
  Pop $R1
  Pop $R0
!macroend
