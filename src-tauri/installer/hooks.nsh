!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$DESKTOP\FlexExplorer.lnk" "$INSTDIR\FlexExplorer.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\FlexExplorer.lnk"
!macroend
