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
# ignore error if not currently merging

# 5. Prepare a single clean commit
#    GitHub secret scanning may block pushes that contain a GitHub PAT in any
#    commit. We reset local history to the current remote tip and commit all
#    current files as one clean snapshot so that old (possibly bad) commits are
#    no longer part of the push.
Write-Host "Fetching remote state..."
git fetch $remoteName $branch
if ($LASTEXITCODE -ne 0) {
    Stop-WithPause "Could not fetch from $remoteName/$branch. Check your network and token."
}

Write-Host ""
Write-Host "WARNING: This will overwrite the remote Git history on $remoteName/$branch" -ForegroundColor Yellow
Write-Host "with a single clean commit containing your current files. This is needed" -ForegroundColor Yellow
Write-Host "because GitHub blocked a previous push that contained a personal access token." -ForegroundColor Yellow
$confirm = Read-Host "Type 'yes' to continue"
if ($confirm -ne 'yes') {
    Stop-WithPause "Deployment cancelled by user."
}

Write-Host "Resetting local history to match remote (your file changes are preserved)..."
git reset --soft "$remoteName/$branch"
if ($LASTEXITCODE -ne 0) {
    Stop-WithPause "Could not reset to $remoteName/$branch."
}

# 合并远程 data/ 与本地 data/（本地优先，远程补充本地缺失的项）。
# 后台发文/编辑直接写 GitHub，本地磁盘的 data 可能是旧的；但本地若已恢复/更新过，
# 也不应被远程旧版覆盖。采用「本地优先 + 远程补缺失」的并集合并，避免任何一方内容丢失。
Write-Host "Merging live data files from remote (local-first union, never lose content)..."

function KeyOf($x) {
    if ($x -is [PSCustomObject]) {
        if ($x.PSObject.Properties.Name -contains 'id')   { return [string]$x.id }
        if ($x.PSObject.Properties.Name -contains 'slug') { return [string]$x.slug }
        if ($x.PSObject.Properties.Name -contains 'title'){ return [string]$x.title }
    }
    return $null
}
function Merge-List($local, $remote) {
    $map = @{}
    foreach ($x in $local) { $k = KeyOf $x; if ($k -and -not $map.ContainsKey($k)) { $map[$k] = $x } }
    foreach ($x in $remote){ $k = KeyOf $x; if ($k -and -not $map.ContainsKey($k)) { $map[$k] = $x } }
    return @($map.Values)
}
function Merge-Json($local, $remote) {
    if ($null -eq $local) { return $remote }
    if ($null -eq $remote) { return $local }
    if ($local -is [System.Collections.IList] -and $remote -is [System.Collections.IList]) {
        return Merge-List $local $remote
    }
    if ($local.GetType().Name -eq 'PSCustomObject' -and $remote.GetType().Name -eq 'PSCustomObject') {
        $out = New-Object PSObject
        foreach ($p in $local.PSObject.Properties) { Add-Member -InputObject $out -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force }
        foreach ($p in $remote.PSObject.Properties) {
            $exists = $out.PSObject.Properties.Name -contains $p.Name
            if (-not $exists) {
                Add-Member -InputObject $out -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
                continue
            }
            $lv = $out.PSObject.Properties[$p.Name].Value
            if ($lv -is [System.Collections.IList] -and $p.Value -is [System.Collections.IList]) {
                $out.PSObject.Properties[$p.Name].Value = Merge-List $lv $p.Value
            } elseif ($lv.GetType().Name -eq 'PSCustomObject' -and $p.Value.GetType().Name -eq 'PSCustomObject') {
                $out.PSObject.Properties[$p.Name].Value = Merge-Json $lv $p.Value
            }
        }
        return $out
    }
    return $local
}

$dataDir = Join-Path $projectRoot "data"
if (Test-Path $dataDir) {
    Get-ChildItem $dataDir -Filter *.json | ForEach-Object {
        $rel = "data/" + $_.Name
        $refSpec = "$remoteName/$branch" + ':' + $rel
        $remoteRaw = git show $refSpec 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $remoteRaw) {
            Write-Host "  (no remote $rel, keep local)" -ForegroundColor DarkGray
            return
        }
        try {
            $localObj  = Get-Content $_.FullName -Raw | ConvertFrom-Json
            $remoteObj = $remoteRaw | ConvertFrom-Json
            $merged = Merge-Json $localObj $remoteObj
            $merged | ConvertTo-Json -Depth 20 | Set-Content $_.FullName -Encoding UTF8
            Write-Host "  [OK] merged $rel" -ForegroundColor Green
        } catch {
            Write-Host "  (skip $rel merge, parse error)" -ForegroundColor DarkYellow
        }
    }
}

Write-Host "Committing all current files as a single clean snapshot..."
git add -A
git commit -m "deploy: update website" --no-edit
# commit returns non-zero when nothing to commit, which is fine

# 6. Push using token embedded URL (avoids Windows credential popup)
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
    git push -f -u $remoteName $branch
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
