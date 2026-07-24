#!/usr/bin/env bash
# 首次在 VM 上执行：克隆仓库并完整配置（systemd + nginx + certbot）
# 前置：VM 已装 git / node(>=18) / nginx / certbot；DNS 已指向本机；80/443 放通。
# 用法：
#   sudo bash deploy/vm-init.sh
# 可选环境变量：
#   REPO_URL=git@github.com:fendlwxy/hcym.git   # 推荐用 SSH 部署密钥（只读），私有库也能拉
#   GITHUB_USER=xxx GITHUB_TOKEN=ghp_xxx           # 或用 https+token 克隆（token 会写进 remote，注意安全）
#   ADMIN_PASS=强密码  CERTBOT_EMAIL=admin@huichengyimin.com
#   APP_DIR=/var/www/hcym  APP_USER=www-data  DOMAIN=m.huichengyimin.com

set -e
APP_DIR="${APP_DIR:-/var/www/hcym}"
APP_USER="${APP_USER:-www-data}"
DOMAIN="${DOMAIN:-m.huichengyimin.com}"
REPO_URL="${REPO_URL:-https://github.com/fendlwxy/hcym.git}"
if [ -n "$GITHUB_TOKEN" ] && [ -n "$GITHUB_USER" ]; then
  REPO_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/hcym.git"
fi

echo "==> [1/5] 克隆代码到 $APP_DIR"
sudo mkdir -p "$APP_DIR" /var/www/letsencrypt
sudo chown -R "$USER:$USER" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR"
npm install --omit=dev

echo "==> [2/5] 生成 systemd 服务"
ADMIN_USER="${ADMIN_USER:-admin}"
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS="$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
  echo "    >>> 管理员密码(请保存)：$ADMIN_PASS  （后台 /admin 登录用）"
fi
sudo tee /etc/systemd/system/huichengyimin.service >/dev/null <<EOF
[Unit]
Description=汇程移民快速评估表网站 (Node/Express)
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=PORT=3000
Environment=NODE_ENV=production
Environment=ADMIN_USER=${ADMIN_USER}
Environment=ADMIN_PASS=${ADMIN_PASS}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable huichengyimin
sudo systemctl restart huichengyimin

echo "==> [3/5] 配置 Nginx 反代"
sudo cp deploy/nginx-${DOMAIN}.conf /etc/nginx/sites-available/${DOMAIN}
sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo "==> [4/5] 申请 Let's Encrypt HTTPS 证书"
sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --no-eff-email -m ${CERTBOT_EMAIL:-admin@huichengyimin.com} || {
  echo "    certbot 失败：确认 80 端口公网可达且 $DOMAIN 已解析到本机"; exit 1; }

echo "==> [5/5] 目录归属运行用户"
sudo chown -R ${APP_USER}:${APP_USER} "$APP_DIR"

echo ""
echo "✅ 首次部署完成！之后每次 push 到 main，GitHub Actions 会自动拉取并重启。"
echo "   前台：https://${DOMAIN}"
echo "   后台：https://${DOMAIN}/admin  (账号 ${ADMIN_USER} / 密码见上方)"
