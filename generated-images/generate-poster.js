const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const projects = [
  {
    title: '美国移民',
    desc: '圆梦美国，3年移美一步到位，优质教育、福利优厚，一人申请，全家受益',
    tag: 'EB类',
    color: '#1E3A5F'
  },
  {
    title: '爱尔兰移民',
    desc: '6-8个月快速获批，先获批后投资，英国欧盟自由居住',
    tag: 'Stamp 4 永居',
    color: '#0D7C66'
  },
  {
    title: '加拿大投资移民',
    desc: '一步到位快速移民加拿大，不限投资额度，生意类型自由选择',
    tag: 'SUV',
    color: '#C41E3A'
  },
  {
    title: '澳洲移民',
    desc: '20万澳币起移民全球福利大国，创业移民+投资移民 多种方式任选',
    tag: '188/888',
    color: '#2E5C8A'
  },
  {
    title: '希腊购房移民',
    desc: '一带一路东风至，25万欧，即移民又获利。爱琴海畔做房东',
    tag: '25万欧',
    color: '#E85D75'
  },
  {
    title: '格林纳达护照',
    desc: '跳板美国，税筹任选，15万美元起投，全家轻松定居美国',
    tag: 'E2跳板',
    color: '#6B4C9A'
  },
  {
    title: '葡萄牙购房移民',
    desc: '6个月快速办理，一人办理全家获批 自由穿行欧洲26国',
    tag: '黄金签证',
    color: '#C41E3A'
  },
  {
    title: '英国移民',
    desc: '最低5万英镑起，高性价比移民英国，工作、教育、身份三不误',
    tag: '创新签证',
    color: '#1E3A5F'
  }
];

const W = 1080;
const headerH = 320;
const footerH = 400;
const cardH = 280;
const cardGap = 24;
const topPadding = 40;
const bottomPadding = 40;
const H = headerH + topPadding + projects.length * (cardH + cardGap) + bottomPadding + footerH;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxChars) {
  const chars = text.split('');
  const lines = [];
  let line = '';
  for (let i = 0; i < chars.length; i++) {
    if (line.length >= maxChars) {
      lines.push(line);
      line = chars[i];
    } else {
      line += chars[i];
    }
  }
  if (line) lines.push(line);
  return lines;
}

let cardsSvg = '';
let y = headerH + topPadding;

projects.forEach((p, i) => {
  const lines = wrapText(p.desc, 20);
  const titleY = y + 60;
  const descY = titleY + 50;
  const descLines = lines.slice(0, 3).map((l, idx) => `<text x="180" y="${descY + idx * 46}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="28" fill="#475569">${escapeXml(l)}</text>`).join('');

  cardsSvg += `
    <g>
      <rect x="40" y="${y}" width="1000" height="${cardH}" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <rect x="40" y="${y}" width="8" height="${cardH}" rx="4" fill="${p.color}"/>
      <circle cx="100" cy="${y + cardH/2}" r="42" fill="${p.color}" opacity="0.1"/>
      <text x="100" y="${y + cardH/2 + 14}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="40" font-weight="700" fill="${p.color}" text-anchor="middle">${i + 1}</text>
      <text x="180" y="${titleY}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="38" font-weight="700" fill="#1E293B">${escapeXml(p.title)}</text>
      <rect x="180" y="${y + cardH - 68}" width="160" height="42" rx="21" fill="${p.color}" opacity="0.12"/>
      <text x="260" y="${y + cardH - 38}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="22" font-weight="600" fill="${p.color}" text-anchor="middle">${escapeXml(p.tag)}</text>
      ${descLines}
    </g>
  `;
  y += cardH + cardGap;
});

(async () => {
  // 使用用户提供的头部 logo（青底方形图标，直接叠加无需额外底托）
  const logoBuf = fs.readFileSync('E:/WorkBuddy2/hcym/logo.png');
  const logoMeta = await sharp(logoBuf).metadata();
  const logoBox = 110;
  const logoScale = Math.min(logoBox / logoMeta.width, logoBox / logoMeta.height);
  const logoW = Math.round(logoMeta.width * logoScale);
  const logoH = Math.round(logoMeta.height * logoScale);
  const logoX = Math.round(70 + (logoBox - logoW) / 2);
  const logoY = Math.round(100 + (logoBox - logoH) / 2);

  // 公众号二维码放在底部 footer 白卡内
  const qrSize = 230;
  const qrX = 715;
  const qrY = H - footerH + 65;

  // 顶部 logo 由 composite 直接叠加，不在 SVG 中内嵌 PNG，避免 sharp 不渲染透明 PNG
  const headerLogo = ``;

  const footer = `
    <g transform="translate(0, ${H - footerH})">
      <rect width="${W}" height="${footerH}" fill="#FFFFFF"/>
      <rect x="40" y="0" width="1000" height="2" fill="#E2E8F0"/>

      <!-- 左侧文字与热线 -->
      <text x="60" y="90" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="34" font-weight="600" fill="#1E293B">专业移民经验护航，助您身份规划更轻松</text>
      <text x="60" y="142" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="28" fill="#64748B">一对一定制，契合您的专属移民方案</text>

      <rect x="60" y="178" width="540" height="84" rx="42" fill="#00A8A5"/>
      <text x="330" y="232" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF" text-anchor="middle">咨询热线：136-5185-2270</text>

      <text x="60" y="320" font-family="Arial, sans-serif" font-size="24" fill="#94A3B8">官网：www.huichengyimin.com</text>

      <!-- 右侧公众号二维码白卡（图片稍后 composite 叠加） -->
      <rect x="700" y="50" width="260" height="260" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1"/>
      <text x="830" y="333" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="26" font-weight="600" fill="#1E293B" text-anchor="middle">扫码关注公众号</text>
    </g>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F0FDFC"/>
      <stop offset="50%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00A8A5"/>
      <stop offset="100%" stop-color="#008B8B"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <rect width="${W}" height="${headerH}" fill="url(#headerGrad)"/>
  ${headerLogo}
  <text x="210" y="155" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="52" font-weight="700" fill="#FFFFFF">汇程移民</text>
  <text x="212" y="195" font-family="Arial, sans-serif" font-size="20" letter-spacing="3" fill="#FFFFFF" opacity="0.9">HUICHENG IMMIGRATION</text>

  <text x="${W/2}" y="${headerH - 70}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="56" font-weight="700" fill="#FFFFFF" text-anchor="middle">热门移民项目</text>
  <text x="${W/2}" y="${headerH - 22}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="26" fill="rgba(255,255,255,0.9)" text-anchor="middle">全球优质身份规划方案 · 一对一专属定制</text>

  ${cardsSvg}

  ${footer}
</svg>`;

  const svgPath = path.join(__dirname, 'hot-projects-poster.svg');
  const jpgPath = path.join(__dirname, `hot-projects-poster-${new Date().toISOString().split('T')[0]}.jpg`);

  fs.writeFileSync(svgPath, svg, 'utf8');

  // 真实 logo 与二维码：用 composite 叠加，避免 SVG 内嵌 PNG 透明图不被渲染

  // 把用户 logo 的青底扣掉，只保留白色图形，输出带透明通道的 PNG
  async function knockOutLogo(inputBuf, targetW, targetH) {
    const resized = sharp(inputBuf).resize({
      width: targetW,
      height: targetH,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    });
    const { data, info } = await resized.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // 保留偏白像素（logo 图形），其余透明
      if (r > 200 && g > 200 && b > 200) {
        data[i + 3] = 255;
      } else {
        data[i + 3] = 0;
      }
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .png()
      .toBuffer();
  }

  const logoOverlay = await knockOutLogo(logoBuf, logoW, logoH);

  const qrOverlay = await sharp(path.join(__dirname, 'site-wechat-qr.jpg'))
    .resize(qrSize, qrSize)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg()
    .toBuffer();

  sharp(Buffer.from(svg))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .composite([
      { input: logoOverlay, left: logoX, top: logoY },
      { input: qrOverlay, left: qrX, top: qrY }
    ])
    .toFile(jpgPath)
    .then(() => {
      console.log('JPG generated:', jpgPath);
    })
    .catch(err => {
      console.error('Error generating JPG:', err);
      process.exit(1);
    });
})();
