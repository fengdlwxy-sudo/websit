# Deploy huichengyimin website to GitHub Pages via GitHub token
# Called by pages-deploy.bat
#
# 设计原则（根治"部署后内容丢失"）：
#   1) 内容（data/ 与 assets/images/uploads/）由后台实时写入 GitHub，部署时一律以远程为准还原，
#      绝不拿本地可能过期的文件去覆盖远程真实内容。
#   2) 只把本地"代码改动"（HTML/CSS/JS 等）叠加进去，做成一个干净提交强推，
#      避免把历史上可能含令牌的提交重新推上去被 GitHub 拦截。
#   3) token 首次输入后缓存在本地 .deploy-token（已 gitignore），后续一键部署。

# 全局兜底：任何未捕获的错误都打印并保持窗口，避免"黑框一闪而过"看不清原因
trap {
    Write-Host ""
    Write-Host "[FATAL] 脚本意外出错：" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "（按任意键关闭）" -ForegroundColor DarkGray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

$repoOwner  = "fengdlwxy-sudo"
$repoName   = "websit"
$branch     = "main"
$remoteName = "websit"

function Stop-WithPause($msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 1. 检查 git
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
    Stop-WithPause "Git 未安装或不在 PATH。请先安装 Git for Windows: https://git-scm.com/download/win"
}

# 2. 切到项目根目录（deploy/ 的上级）
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path "$scriptDir\.."
Set-Location $projectRoot

# 3. 读取 / 缓存 token（本地 .deploy-token，已 gitignore）
$tokenFile = Join-Path $projectRoot ".deploy-token"
if (Test-Path $tokenFile) {
    $token = (Get-Content $tokenFile -Raw).Trim()
    Write-Host "使用本地缓存的 GitHub token。" -ForegroundColor DarkGray
} else {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "  Deploy huichengyimin to GitHub Pages" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "首次运行：请粘贴你的 GitHub Personal Access Token (ghp_...)。" -ForegroundColor Yellow
    Write-Host "(会保存在本地 .deploy-token，已 gitignore，以后无需再输入)" -ForegroundColor DarkGray
    $secureToken = Read-Host -Prompt "GitHub token" -AsSecureString
    $bstr  = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    if (-not $token) { Stop-WithPause "未输入 token，请重新运行并粘贴。" }
    Set-Content -Path $tokenFile -Value $token -NoNewline
    Write-Host "Token 已本地保存，后续运行不再需要输入。" -ForegroundColor Green
}

# 让其它 git 操作也顺滑（凭据缓存）
git config --global credential.helper store 2>$null

# 4. 清理可能残留的合并状态
git merge --abort 2>$null

# 5. 拉取远程最新状态
Write-Host "Fetching remote state..."
git fetch $remoteName $branch
if ($LASTEXITCODE -ne 0) { Stop-WithPause "无法 fetch $remoteName/$branch，检查网络与 token。" }

# 6. 把本地历史重置到远程 tip，做成单干净提交（避免重推含令牌的旧提交）
Write-Host "Resetting local history to remote tip (single clean commit)..."
git reset --soft "$remoteName/$branch"
if ($LASTEXITCODE -ne 0) { Stop-WithPause "无法 reset 到 $remoteName/$branch。" }

# 7. 关键：把远程的真实内容原样还原，绝不拿本地过期文件覆盖
Write-Host "Restoring live content from remote (data + uploads)..."
git checkout "$remoteName/$branch" -- data 2>$null
git checkout "$remoteName/$branch" -- assets/images/uploads 2>$null

# 8. 只叠加本地代码改动
Write-Host "Staging code changes + keeping live content..."
git add -A
$status = git status --porcelain
if (-not $status) {
    Write-Host "[OK] 没有需要部署的改动，无需推送。" -ForegroundColor Green
    Write-Host "Press any key..."; $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 0
}

git commit -m "deploy: update website - $(Get-Date -Format 'yyyy-MM-dd HH:mm')" --no-edit

# 9. 用内嵌 token 的 URL 推送（避免 Windows 凭据弹窗），推完还原
$pushUrl = "https://$token@github.com/$repoOwner/$repoName.git"
$originalUrl = git remote get-url $remoteName 2>$null
if ($LASTEXITCODE -ne 0) { Stop-WithPause "找不到 git remote '$remoteName'，请检查 .git/config" }

git remote set-url $remoteName $pushUrl
try {
    git push -f -u $remoteName $branch
    $pushOk = $LASTEXITCODE -eq 0
} finally {
    git remote set-url $remoteName $originalUrl | Out-Null
}

# 清掉内存里的 token
$token = $null
[GC]::Collect()

if (-not $pushOk) {
    Write-Host ""
    Write-Host "推送失败，常见原因：" -ForegroundColor Yellow
    Write-Host "  - token 复制不完整（缺字符或多了空格）" -ForegroundColor Yellow
    Write-Host "  - token 没有 repo 权限或已过期/被撤销" -ForegroundColor Yellow
    Write-Host "  - Windows 凭据管理器缓存了旧密码" -ForegroundColor Yellow
    Write-Host "重新生成 token: https://github.com/settings/tokens (需要 repo 权限)" -ForegroundColor Yellow
    Stop-WithPause "Push failed."
}

Write-Host ""
Write-Host "[OK] 推送成功 -> $remoteName/$branch" -ForegroundColor Green
Write-Host "等 1-2 分钟，然后 Ctrl+F5 打开 https://www.huichengyimin.com/admin" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
