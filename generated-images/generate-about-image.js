const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const W = 840;
const H = 640;

// 把用户 logo 的青底扣掉，只保留白色图形
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

(async () => {
  const logoBuf = fs.readFileSync('E:/WorkBuddy2/hcym/logo.png');
  const logoBox = 90;
  const logoMeta = await sharp(logoBuf).metadata();
  const logoScale = Math.min(logoBox / logoMeta.width, logoBox / logoMeta.height);
  const logoW = Math.round(logoMeta.width * logoScale);
  const logoH = Math.round(logoMeta.height * logoScale);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F0FDFC"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00A8A5"/>
      <stop offset="100%" stop-color="#008B8B"/>
    </linearGradient>
  </defs>

  <!-- 背景 -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- 装饰性地球轮廓 -->
  <g transform="translate(560, 320)" opacity="0.12">
    <circle r="230" fill="none" stroke="#00A8A5" stroke-width="2"/>
    <ellipse rx="230" ry="90" fill="none" stroke="#00A8A5" stroke-width="1.5"/>
    <ellipse rx="230" ry="160" fill="none" stroke="#00A8A5" stroke-width="1.5"/>
    <line x1="-230" y1="0" x2="230" y2="0" stroke="#00A8A5" stroke-width="1.5"/>
    <line x1="0" y1="-230" x2="0" y2="230" stroke="#00A8A5" stroke-width="1.5"/>
  </g>

  <!-- 航线装饰 -->
  <g fill="none" stroke="#00A8A5" stroke-width="2" stroke-linecap="round" opacity="0.25">
    <path d="M 60 200 Q 280 120 520 280"/>
    <path d="M 120 500 Q 320 380 560 360"/>
    <path d="M 40 360 Q 220 300 480 420"/>
  </g>

  <!-- 小飞机/定位点装饰 -->
  <circle cx="520" cy="280" r="6" fill="#00A8A5" opacity="0.4"/>
  <circle cx="560" cy="360" r="6" fill="#00A8A5" opacity="0.4"/>
  <circle cx="480" cy="420" r="6" fill="#00A8A5" opacity="0.4"/>

  <!-- 左下角品牌区 -->
  <rect x="55" y="445" width="120" height="120" rx="24" fill="url(#brandGrad)"/>

  <!-- 右侧 lightly 品牌文字 -->
  <text x="210" y="510" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="36" font-weight="700" fill="#007A8A">汇程移民</text>
  <text x="212" y="545" font-family="Arial, sans-serif" font-size="16" letter-spacing="2" fill="#64748B">GLOBAL MIGRATION EXPERTS</text>
</svg>`;

  const jpgPath = path.join(__dirname, `about-huicheng-${new Date().toISOString().split('T')[0]}.jpg`);

  // logo 居中放在左下角青绿方块内（55,445 120x120）
  const logoOverlay = await knockOutLogo(logoBuf, logoW, logoH);
  const logoX = 55 + Math.round((120 - logoW) / 2);
  const logoY = 445 + Math.round((120 - logoH) / 2);

  sharp(Buffer.from(svg))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .composite([{ input: logoOverlay, left: logoX, top: logoY }])
    .toFile(jpgPath)
    .then(() => {
      console.log('About image generated:', jpgPath);
    })
    .catch(err => {
      console.error('Error generating about image:', err);
      process.exit(1);
    });
})();
