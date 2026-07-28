const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/* ---------- 设计令牌（与热门项目海报保持一致） ---------- */
const TEAL = '#00A8A5';
const TEAL_DARK = '#008B8B';
const TEAL_DEEP = '#0E7490';
const INK = '#0F2E3D';
const BODY = '#334155';
const SUB = '#475569';
const CARD_LINE = '#E6EDF2';

const W = 1080;
const headerH = 340;
const footerH = 400;
const cardX = 40, cardW = 1000;

/* ---------- 工具函数 ---------- */
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
// 按近似像素宽度换行（CJK 计 1 字宽，ASCII 计 0.52 字宽）
function wrapPx(text, maxW, fs) {
  const chars = [...text];
  const lines = []; let cur = ''; let curW = 0;
  for (const ch of chars) {
    const w = (ch.codePointAt(0) >= 0x2E80) ? fs : fs * 0.52;
    if (curW + w > maxW && cur.length > 0) { lines.push(cur); cur = ch; curW = w; }
    else { cur += ch; curW += w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- 内容数据 ---------- */
const highlights = [
  '5年一更新居留卡', '终身持有永居权益', '每年仅登陆14天', '全家四代同申', '无高额居住要求'
];

const mainItems = [
  { icon: 'circle', text: '年满18周岁，非欧盟 / 欧洲经济区 / 瑞士公民；受限制裁国家申请者无法递交申请' },
  { icon: 'circle', text: '无任何刑事犯罪记录，可通过马耳他政府严苛背景尽职调查' },
  { icon: 'circle', text: '资产达标二选一：', sub: [
    { icon: 'check', text: '全家总资产≥50万欧元，其中流动资产不少于15万欧元' },
    { icon: 'check', text: '个人年收入≥10万欧元，资产来源全程可追溯、合规可核验' }
  ]},
  { icon: 'circle', text: '购置覆盖申根区全境的商业医疗保险，保额不低于3万欧元' },
  { icon: 'circle', text: '语言宽松：基础英语 A2 水平即可；持有全日制英语授课本科及以上学历，可直接免语言考核' }
];

const familyItems = [
  { icon: 'circle', text: '合法配偶，无犯罪记录' },
  { icon: 'circle', text: '29 周岁以下未婚、经济依附主申的子女（未成年子女无条件随同）' },
  { icon: 'circle', text: '主申请人及配偶双方父母、祖父母，提供经济赡养依附证明即可随同申请' }
];

/* ---------- 生成一个条件卡片 ---------- */
function buildSection({ title, items, startY }) {
  const pad = 44;
  const titleX = cardX + pad;
  const iconCx = cardX + pad + 16;
  const textX = iconCx + 34;
  const wrapW = (cardX + cardW - pad) - textX;
  const subTextX = textX + 40;
  const subWrapW = (cardX + cardW - pad) - subTextX;
  const fs = 27, lineH = 44, subFs = 25, subLineH = 40, gap = 20;

  let cy = startY + 96;
  let svg = '';

  items.forEach(it => {
    const lines = wrapPx(it.text, wrapW, fs);
    let blockH = lines.length * lineH;
    let subArr = [];
    if (it.sub) {
      it.sub.forEach(s => subArr.push(wrapPx(s.text, subWrapW, subFs)));
      const subTotal = subArr.reduce((a, l) => a + l.length, 0);
      blockH += 16 + subTotal * subLineH;
    }
    const itemH = Math.max(lineH, blockH) + gap;
    const iconCy = cy + lineH / 2 - 2;

    if (it.icon === 'check') {
      svg += `<circle cx="${iconCx}" cy="${iconCy}" r="14" fill="${TEAL}"/>
        <polyline points="${iconCx - 7},${iconCy} ${iconCx - 2},${iconCy + 6} ${iconCx + 8},${iconCy - 7}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      svg += `<circle cx="${iconCx}" cy="${iconCy}" r="13" fill="none" stroke="${TEAL_DEEP}" stroke-width="3"/>`;
    }
    lines.forEach((ln, i) => {
      svg += `<text x="${textX}" y="${cy + lineH / 2 + 9 + i * lineH}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="${fs}" fill="${BODY}">${escapeXml(ln)}</text>`;
    });
    if (it.sub) {
      let sy = cy + lines.length * lineH + 16;
      it.sub.forEach((s, si) => {
        const arr = subArr[si];
        const sIconCx = subTextX - 22;
        const sIconCy = sy + subLineH / 2 - 2;
        svg += `<circle cx="${sIconCx}" cy="${sIconCy}" r="12" fill="${TEAL}"/>
          <polyline points="${sIconCx - 6},${sIconCy} ${sIconCx - 2},${sIconCy + 5} ${sIconCx + 7},${sIconCy - 6}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        arr.forEach((ln, i) => {
          svg += `<text x="${subTextX}" y="${sy + subLineH / 2 + 8 + i * subLineH}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="${subFs}" fill="${SUB}">${escapeXml(ln)}</text>`;
        });
        sy += arr.length * subLineH;
      });
    }
    cy += itemH;
  });

  const cardH = cy - startY + 30;
  return {
    svg: `
    <g>
      <rect x="${cardX}" y="${startY}" width="${cardW}" height="${cardH}" rx="22" fill="#FFFFFF" stroke="${CARD_LINE}" stroke-width="1.5"/>
      <rect x="${cardX}" y="${startY}" width="8" height="${cardH}" rx="4" fill="${TEAL}"/>
      <rect x="${titleX}" y="${startY + 28}" width="6" height="34" rx="3" fill="${TEAL}"/>
      <text x="${titleX + 22}" y="${startY + 56}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="34" font-weight="700" fill="${INK}">${escapeXml(title)}</text>
      ${svg}
    </g>`,
    height: cardH
  };
}

/* ---------- 布局 ---------- */
let y = headerH + 40;

// 亮点胶囊条：2 行，避免 5 个胶囊在一行内文字溢出
const stripY = y, stripH = 150;
const pillW = 220, pillH = 52, pillGap = 12;
const rows = [
  ['5年一更新居留卡', '终身持有永居权益', '每年仅登陆14天'],
  ['全家四代同申', '无高额居住要求']
];
let stripSvg = `<rect x="${cardX}" y="${stripY}" width="${cardW}" height="${stripH}" rx="18" fill="#E6FAF9"/>`;
rows.forEach((row, ri) => {
  const rowW = row.length * pillW + (row.length - 1) * pillGap;
  const startX = cardX + (cardW - rowW) / 2;
  const py = stripY + 18 + ri * (pillH + 12);
  row.forEach((h, i) => {
    const px = startX + i * (pillW + pillGap);
    stripSvg += `<rect x="${px}" y="${py}" width="${pillW}" height="${pillH}" rx="26" fill="#FFFFFF"/>
      <circle cx="${px + 22}" cy="${py + pillH / 2}" r="5" fill="${TEAL}"/>
      <text x="${px + 38}" y="${py + pillH / 2 + 8}" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="22" font-weight="600" fill="${TEAL_DEEP}">${escapeXml(h)}</text>`;
  });
});

y = stripY + stripH + 30;
const mainSec = buildSection({ title: '主申请人基础硬性条件', items: mainItems, startY: y });
y += mainSec.height + 28;
const famSec = buildSection({ title: '可一同随行的附属申请人（四代移民）', items: familyItems, startY: y });
y += famSec.height + 30;

const H = y + footerH;

/* ---------- 头部 logo 处理（扣青底，留白标） ---------- */
(async () => {
  const logoBuf = fs.readFileSync('E:/WorkBuddy2/hcym/logo.png');
  const logoMeta = await sharp(logoBuf).metadata();
  const logoBox = 110;
  const logoScale = Math.min(logoBox / logoMeta.width, logoBox / logoMeta.height);
  const logoW = Math.round(logoMeta.width * logoScale);
  const logoH = Math.round(logoMeta.height * logoScale);
  const logoX = Math.round(70 + (logoBox - logoW) / 2);
  const logoY = Math.round(55 + (logoBox - logoH) / 2);

  const qrSize = 230;
  const qrX = 715;
  const qrY = H - footerH + 65;

  const footer = `
    <g transform="translate(0, ${H - footerH})">
      <rect width="${W}" height="${footerH}" fill="#FFFFFF"/>
      <rect x="40" y="0" width="1000" height="2" fill="${CARD_LINE}"/>
      <text x="60" y="90" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="34" font-weight="600" fill="${INK}">马耳他永居规划 · 从一份评估开始</text>
      <text x="60" y="142" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="28" fill="#64748B">一对一方案定制，匹配您的家庭身份目标</text>
      <rect x="60" y="178" width="540" height="84" rx="42" fill="${TEAL}"/>
      <text x="330" y="232" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF" text-anchor="middle">咨询热线：136-5185-2270</text>
      <text x="60" y="320" font-family="Arial, sans-serif" font-size="24" fill="#94A3B8">官网：www.huichengyimin.com</text>
      <rect x="700" y="50" width="260" height="260" rx="16" fill="#FFFFFF" stroke="${CARD_LINE}" stroke-width="1"/>
      <text x="830" y="333" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="26" font-weight="600" fill="${INK}" text-anchor="middle">扫码关注公众号</text>
    </g>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F0FDFC"/>
      <stop offset="60%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#FFFFFF"/>
    </linearGradient>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${TEAL}"/>
      <stop offset="100%" stop-color="${TEAL_DARK}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <rect width="${W}" height="${headerH}" fill="url(#headerGrad)"/>
  <text x="210" y="108" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="46" font-weight="700" fill="#FFFFFF">汇程移民</text>
  <text x="212" y="142" font-family="Arial, sans-serif" font-size="18" letter-spacing="3" fill="#FFFFFF" opacity="0.9">HUICHENG IMMIGRATION</text>
  <text x="${W / 2}" y="248" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="56" font-weight="700" fill="#FFFFFF" text-anchor="middle">马耳他永久居留 MPRP</text>
  <text x="${W / 2}" y="296" font-family="Noto Sans SC, Microsoft YaHei, SimHei, sans-serif" font-size="26" fill="rgba(255,255,255,0.92)" text-anchor="middle">投资永居 · 一步拿欧盟永居</text>

  ${stripSvg}
  ${mainSec.svg}
  ${famSec.svg}
  ${footer}
</svg>`;

  const svgPath = path.join(__dirname, 'malta-mprp-poster.svg');
  const jpgPath = path.join(__dirname, `malta-mprp-poster-${new Date().toISOString().split('T')[0]}.jpg`);
  fs.writeFileSync(svgPath, svg, 'utf8');

  async function knockOutLogo(inputBuf, tw, th) {
    const { data, info } = await sharp(inputBuf)
      .resize({ width: tw, height: th, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      data[i + 3] = (r > 200 && g > 200 && b > 200) ? 255 : 0;
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
  }

  const logoOverlay = await knockOutLogo(logoBuf, logoW, logoH);
  const qrOverlay = await sharp(path.join(__dirname, 'site-wechat-qr.jpg'))
    .resize(qrSize, qrSize).flatten({ background: { r: 255, g: 255, b: 255 } }).jpeg().toBuffer();

  sharp(Buffer.from(svg))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .composite([{ input: logoOverlay, left: logoX, top: logoY }, { input: qrOverlay, left: qrX, top: qrY }])
    .toFile(jpgPath)
    .then(() => console.log('JPG generated:', jpgPath, 'size', W + 'x' + H))
    .catch(err => { console.error('Error:', err); process.exit(1); });
})();
