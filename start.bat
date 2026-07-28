@echo off
setlocal
cd /d "%~dp0"

echo ====================================
echo  AAS Editor: Entwicklungsumgebung
echo ====================================
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo FEHLER: pnpm wurde nicht gefunden. Erst "corepack enable" ausfuehren.
  pause
  exit /b 1
)

if not exist ".env" (
  echo .env fehlt, wird aus .env.example angelegt.
  copy /y ".env.example" ".env" >nul
  echo Bitte AUTH_PASSWORD und SESSION_SECRET darin aendern.
  echo.
)

if not exist "node_modules" (
  echo Abhaengigkeiten werden installiert, das dauert einen Moment ...
  call pnpm install
  if errorlevel 1 (
    echo FEHLER: pnpm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
  echo.
)

if not exist "test-data" (
  echo Hinweis: die offiziellen aas-core-Testdaten fehlen.
  echo Fuer "pnpm test" zuerst "pnpm test-data" ausfuehren.
  echo.
)

echo Backend startet auf http://localhost:3200
start "AAS Editor Backend" cmd /k "cd /d "%~dp0" && pnpm dev:server"

echo Frontend startet auf http://localhost:5273
start "AAS Editor Frontend" cmd /k "cd /d "%~dp0" && pnpm dev"

echo.
echo Beide Fenster laufen weiter. Zum Beenden dort jeweils Strg+C.
echo Der Browser oeffnet gleich das Frontend.
timeout /t 5 /nobreak >nul
start "" "http://localhost:5273"

endlocal
