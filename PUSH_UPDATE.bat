@echo off
cd /d "%~dp0"
echo ========================================
echo  MHGym update pushen naar Railway
echo ========================================

:: Verwijder eventuele git lock
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo Lock verwijderd.
)

:: Haal de commit op uit de bundle
echo Commit importeren...
git fetch mhgym_update.bundle HEAD:refs/remotes/bundle/main 2>nul

:: Of: voeg bestanden toe en commit direct
git add client/src/pages/AdminPage.jsx
git add src/controllers/cashController.js
git add src/routes/cash.js
git add scripts/ensure-schema.js
git add migrations/002_cash_overdue.sql

git commit -m "feat: Cash & Fonds menu, achterstand-melding, Jeugdsportfonds filter"

:: Push naar GitHub (Railway deployt automatisch)
echo Pushen naar GitHub...
git push origin main

if %ERRORLEVEL% == 0 (
    echo.
    echo ✅ Klaar! Railway bouwt nu automatisch opnieuw.
    echo    Over ~2 minuten is de update live.
) else (
    echo.
    echo ❌ Push mislukt. Controleer je internetverbinding of GitHub toegang.
)

echo.
pause
