@echo off
echo Deploying huichengyimin website to GitHub Pages...
echo.

git --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    echo Please install Git for Windows from:
    echo https://git-scm.com/download/win
    echo Then re-run this script.
    pause
    exit /b 1
)

cd /d %~dp0\..

echo Cleaning up any unfinished merge...
git merge --abort 2>nul

echo Pulling latest changes from origin main ^(using local version if conflicts^)...
set GIT_MERGE_AUTOEDIT=no
git pull --no-rebase -X ours origin main
if %errorlevel% neq 0 (
    echo Some conflicts remain. Resolving by keeping local versions...
    git add -A
    git commit -m "merge remote changes keeping local versions"
    if %errorlevel% neq 0 (
        echo [ERROR] Could not resolve conflicts automatically.
        pause
        exit /b 1
    )
)

git add -A
git commit -m "deploy: update admin for GitHub Pages" || echo [INFO] Nothing new to commit
git push -u origin main

if %errorlevel% neq 0 (
    echo [ERROR] Push failed. Please check your GitHub login or token.
    pause
    exit /b 1
)

echo.
echo [OK] Push succeeded.
echo Wait 1-2 minutes, then open:
echo https://www.huichengyimin.com/admin
pause
