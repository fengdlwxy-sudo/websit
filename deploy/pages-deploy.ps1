# Deploy huichengyimin website to GitHub Pages via GitHub token
# This script is called by pages-deploy.bat

$repoOwner = "fengdlwxy-sudo"
$repoName  = "websit"
$branch    = "main"
$remoteName = "websit"

function Stop-WithPause($msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 1. Check Git
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Stop-WithPause "Git is not installed or not in PATH.`nPlease install Git for Windows from: https://git-scm.com/download/win`nThen re-run this script."
}

# 2. Move to project root
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path "$scriptDir\.."
Set-Location $projectRoot

# 3. Read GitHub token securely
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Deploy huichengyimin to GitHub Pages" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Please paste your GitHub Personal Access Token (ghp_...)." -ForegroundColor Yellow
Write-Host "(The token will NOT be shown on screen for security.)" -ForegroundColor DarkGray
$secureToken = Read-Host -Prompt "GitHub token" -AsSecureString
if (-not $secureToken -or $secureToken.Length -eq 0) {
    Stop-WithPause "No token entered. Please re-run and paste your token."
}

$tokenBSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
$token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($tokenBSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenBSTR)

# 4. Cleanup unfinished merge
Write-Host ""
Write-Host "Cleaning up any unfinished merge..."
git merge --abort 2>$null
if ($LASTEXITCODE -ne 0) { # ignore: may not be merging
}

# 5. Pull latest changes, preferring local version on conflicts
Write-Host "Pulling latest changes from $remoteName/$branch (using local version if conflicts)..."
$env:GIT_MERGE_AUTOEDIT = "no"
git pull --no-rebase -X ours $remoteName $branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "Some conflicts remain. Resolving by keeping local versions..." -ForegroundColor Yellow
    git add -A
    git commit -m "merge remote changes keeping local versions" --no-edit
    if ($LASTEXITCODE -ne 0) {
        Stop-WithPause "Could not resolve conflicts automatically."
    }
}

# 6. Commit local changes
Write-Host "Committing local changes..."
git add -A
git commit -m "deploy: update admin for GitHub Pages" --no-edit
# commit returns non-zero when nothing to commit, which is fine

# 7. Push using token embedded URL (avoids Windows credential popup)
$pushUrl = "https://$token@github.com/$repoOwner/$repoName.git"

Write-Host "Pushing to GitHub..."
$originalUrl = git remote get-url $remoteName 2>$null
if ($LASTEXITCODE -ne 0) {
    Stop-WithPause "Could not find git remote '$remoteName'. Please check .git/config"
}

git remote set-url $remoteName $pushUrl
if ($LASTEXITCODE -ne 0) {
    Stop-WithPause "Could not set temporary push URL."
}

try {
    git push -u $remoteName $branch
    $pushOk = $LASTEXITCODE -eq 0
} finally {
    # Always restore original URL, even on error
    git remote set-url $remoteName $originalUrl | Out-Null
}

# Clear token from memory
$token = $null
$secureToken = $null
[GC]::Collect()

if (-not $pushOk) {
    Write-Host ""
    Write-Host "Common causes:" -ForegroundColor Yellow
    Write-Host "  - Token copied incorrectly (missing characters or extra spaces)" -ForegroundColor Yellow
    Write-Host "  - Token does not have 'repo' and 'workflow' scopes" -ForegroundColor Yellow
    Write-Host "  - Token was revoked or expired" -ForegroundColor Yellow
    Write-Host "  - Windows credential manager has an old password cached" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To fix, regenerate your token at: https://github.com/settings/tokens" -ForegroundColor Yellow
    Write-Host "Required scopes: repo + workflow" -ForegroundColor Yellow
    Stop-WithPause "Push failed."
}

Write-Host ""
Write-Host "[OK] Push succeeded to $remoteName/$branch." -ForegroundColor Green
Write-Host "Wait 1-2 minutes, then open: https://www.huichengyimin.com/admin" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
