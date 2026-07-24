#!/usr/bin/env bash
# 汇程移民网站 - VM 部署/更新脚本
# 用法：
#   首次： bash deploy/deploy.sh init
#   更新： bash deploy/deploy.sh update
# 前置：已安装 git / node(>=18) / nginx / certbot，且 DNS 已指向本机 IP。

set -e
REPO="https://github.com/fendlwxy/hcym.git"   # ← 已替换为真实仓库地址
DIR="/var/www/hcym"
APP_USER="www-data"

case "$1" in
  init)
    echo "==> 首次部署"
    sudo mkdir -p "$DIR" /var/www/letsencrypt
    sudo chown -R "$USER:$USER" "$DIR"
    git clone "$REPO" "$DIR"
    cd "$DIR"
    npm install --omit=dev
    # 保护线上数据：让 git pull 不要覆盖 data/*.json（后台产生的内容）
    git update-index --assume-unchanged data/*.json 2>/dev/null || true
    # 安装/启用服务
    sudo cp deploy/huichengyimin.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable huichengyimin
    sudo systemctl restart huichengyimin
    # Nginx
    sudo cp deploy/nginx-m.huichengyimin.com.conf /etc/nginx/sites-available/m.huichengyimin.com
    sudo ln -sf /etc/nginx/sites-available/m.huichengyimin.com /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    echo "==> 部署完成。确认 DNS 生效后执行： sudo certbot --nginx -d m.huichengyimin.com"
    ;;
  update)
    echo "==> 拉取更新"
    cd "$DIR"
    git pull --ff-only
    npm install --omit=dev
    sudo systemctl restart huichengyimin
    echo "==> 更新完成"
    ;;
  *)
    echo "用法: $0 {init|update}"
    exit 1
    ;;
esac
