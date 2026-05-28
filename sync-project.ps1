# Knight's Quest - Auto Sync to GitHub & Vercel
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " Knight's Quest - Auto Sync to GitHub & Vercel" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Stage changes
Write-Host "[1/3] Staging changes..." -ForegroundColor Yellow
git add -A

# 2. Commit changes
Write-Host "[2/3] Committing changes..." -ForegroundColor Yellow
$commitMsg = if ($args.Count -gt 0) { $args[0] } else { "auto: update project from Antigravity AI agent" }
git commit -m $commitMsg

# 3. Push to GitHub
Write-Host "[3/3] Pushing to GitHub..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " Sync Complete! Vercel is now auto-deploying." -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
