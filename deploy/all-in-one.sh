#!/usr/bin/env bash
# 汇程移民网站 —— 一条龙部署脚本（在 VM 上、项目根目录内运行）
# 用法（在 VM 上）：
#   cd /var/www/hcym
#   sudo bash deploy/all-in-one.sh
#
# 可选环境变量（不填也能跑，只是 GitHub 推送那步会跳过）：
#   GITHUB_USER=fendlwxy GITHUB_TOKEN=ghp_xxx   # 用于自动推送到 GitHub
#   ADMIN_PASS=强密码                              # 不填则自动生成随机密码并打印
#   CERTBOT_EMAIL=admin@huichengyimin.com          # 证书注册邮箱
#   APP_DIR=/var/www/hcym  APP_USER=www-data  DOMAIN=m.huichengyimin.com

set -e
APP_DIR="${APP_DIR:-/var/www/hcym}"
APP_USER="${APP_USER:-www-data}"
DOMAIN="${DOMAIN:-m.huichengyimin.com}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@huichengyimin.com}"

# 必须在项目根目录（含 server.js）内运行
if [ ! -f server.js ]; then
  echo "错误：请在项目根目录（含 server.js）内运行本脚本"; exit 1
fi

echo "==> [1/6] 确保目录可写并安装依赖"
sudo mkdir -p "$APP_DIR" /var/www/letsencrypt
sudo chown -R "$USER:$USER" "$APP_DIR" 2>/dev/null || true
npm install --omit=dev

echo "==> [2/6] 生成 systemd 服务（含管理员密码）"
ADMIN_USER="${ADMIN_USER:-admin}"
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS="$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
  echo "    >>> 自动生成管理员密码：$ADMIN_PASS  （请妥善保存，后台 /admin 登录用）"
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

echo "==> [3/6] 配置 Nginx 反代"
sudo cp deploy/nginx-${DOMAIN}.conf /etc/nginx/sites-available/${DOMAIN}
sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo "==> [4/6] 申请 Let's Encrypt HTTPS 证书"
sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --no-eff-email -m ${CERTBOT_EMAIL} || {
  echo "    certbot 失败：请确认 80 端口公网可达、且 $DOMAIN 已解析到本机公网 IP"; exit 1; }

echo "==> [5/6] 目录归属交给运行用户"
sudo chown -R ${APP_USER}:${APP_USER} "$APP_DIR"

echo "==> [6/6] （可选）推送到 GitHub"
if [ -n "$GITHUB_TOKEN" ] && [ -n "$GITHUB_USER" ]; then
  git init -q 2>/dev/null || true
  git remote remove origin 2>/dev/null || true
  git remote add origin https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/hcym.git
  git add .
  git commit -m "init: 汇程移民快速评估表网站 + VM 部署配置" || true
  git branch -M main
  git push -u origin main && echo "    已推送到 GitHub: hcym" || echo "    GitHub 推送跳过/失败（可稍后手动处理）"
else
  echo "    未提供 GITHUB_USER/GITHUB_TOKEN，跳过 GitHub 推送。"
fi

echo ""
echo "✅ 部署完成！"
echo "   前台：https://${DOMAIN}"
echo "   后台：https://${DOMAIN}/admin  (账号 ${ADMIN_USER} / 密码见上方)"
