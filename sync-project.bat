@echo off
echo ==============================================
echo  Knight's Quest - Auto Sync to GitHub & Vercel
echo ==============================================
echo.

echo [1/3] Staging changes...
git add -A

echo.
echo [2/3] Committing changes...
:: Retrieve custom commit message if passed as argument, otherwise use default
if "%~1"=="" (
    git commit -m "auto: update project from Antigravity AI agent"
) else (
    git commit -m "%~1"
)

echo.
echo [3/3] Pushing to GitHub...
git push origin main

echo.
echo ==============================================
echo  Sync Complete! Vercel is now auto-deploying.
echo ==============================================
