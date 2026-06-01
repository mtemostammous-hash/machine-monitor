
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\moham\Projects\machine-monitor\agent\watchdog.ps1""", 0, False
