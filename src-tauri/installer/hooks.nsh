; Desktop shortcut. Tauri's own uninstall section already removes it (it checks
; the shortcut actually points at this install, and unpins it from the taskbar),
; so only the creating half belongs here.
!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
!macroend
