const sharp = require('sharp');
const path = require('path');

const ICON = 'E:/WorkBuddy2/hcym/generated-images/logo-icon-transparent.png';
const OUT_DIR = 'E:/WorkBuddy2/hcym/generated-images';

const ICON_SIZE = 256;
const H = 280;
const ICON_TOP = Math.round((H - ICON_SIZE) / 2); // 12
const ICON_LEFT = 20;
const TEXT_X = ICON_LEFT + ICON_SIZE + 24; // 300
const W = 840;

function textLayer(titleColor, subColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <text x="${TEXT_X}" y="128" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="68" font-weight="700" fill="${titleColor}">汇程移民</text>
    <text x="${TEXT_X + 2}" y="168" font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="3" font-weight="600" fill="${subColor}">GLOBAL MIGRATION EXPERTS</text>
  </svg>`;
}

(async () => {
  const iconBuf = await sharp(ICON).resize(ICON_SIZE, ICON_SIZE).png().toBuffer();

  const variants = [
    { name: 'logo-horizontal-transparent.png', title: '#0A5A66', sub: '#6B7B80' },
    { name: 'logo-horizontal-white.png', title: '#FFFFFF', sub: '#CFE3E5' },
  ];

  for (const v of variants) {
    const textBuf = await sharp(Buffer.from(textLayer(v.title, v.sub))).png().toBuffer();
    await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: textBuf, left: 0, top: 0 },
        { input: iconBuf, left: ICON_LEFT, top: ICON_TOP },
      ])
      .png()
      .toFile(path.join(OUT_DIR, v.name));
    console.log('done:', v.name);
  }
})();
