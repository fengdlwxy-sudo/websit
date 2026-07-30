/**
 * 静态页预渲染脚本
 * 将 data/ 下的文章/项目/案例 全部烘焙成独立静态 HTML，便于百度等弱 JS 爬虫收录。
 * 运行：node generate-static-pages.js
 *   输出目录：articles/ projects/ cases/
 *   同步刷新：sitemap.xml
 *
 * 设计要点：
 *   - 共用 header/footer 从 index.html 抽取，路径自动转为根绝对路径（适配嵌套目录）
 *   - 完整 SEO：title / description / canonical / OG / Twitter / JSON-LD
 *   - Umeng 统计 (CNZZ) 嵌入页脚
 *   - 保留管理员入口 admin/
 *   - status==='published' 才会被渲染为公开页
 */
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.huichengyimin.com';
const DATA_DIR = 'data';

// ==================== 加载数据 ====================
const articlesData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'articles.json'), 'utf8'));
const projectsData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'projects.json'), 'utf8'));
const casesData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'cases.json'), 'utf8'));

const allArticles = [...(articlesData.featured || []), ...(articlesData.items || [])];
const allProjects = projectsData.items || [];
const allCases = casesData.items || [];

// 只渲染已发布
const pubArticles = allArticles.filter(a => !a.status || a.status === 'published');
const pubProjects = allProjects.filter(p => !p.status || p.status === 'published');
const pubCases = allCases.filter(c => !c.status || c.status === 'published');

console.log(`载入数据：${pubArticles.length} 篇文章 / ${pubProjects.length} 个项目 / ${pubCases.length} 个案例`);

// ==================== 抽取共享 header/footer ====================
const indexHtml = fs.readFileSync('index.html', 'utf8');

function extractBetween(start, end) {
  const s = indexHtml.indexOf(start);
  const e = indexHtml.indexOf(end);
  if (s < 0 || e < 0) throw new Error('Cannot extract: ' + start + ' / ' + end);
  return indexHtml.substring(s, e);
}

// 顶部联系栏 + 主导航（仅导航，不含首页正文区块，避免详情页内重复渲染整页首页）
const sharedHeader = extractBetween('<!-- 顶部联系栏 -->', '<!-- Banner区域 -->');
// 页脚 + 侧边悬浮工具
const sharedFooter = extractBetween('<!-- 页脚 -->', '</body>');

// 把相对路径都转成根绝对路径，让嵌套目录（articles/）也能用
function toAbsolute(html) {
  return html
    .replace(/href="css\//g, 'href="/css/')
    .replace(/href="assets\//g, 'href="/assets/')
    .replace(/src="assets\//g, 'src="/assets/')
    .replace(/href="js\//g, 'href="/js/')
    .replace(/src="js\//g, 'src="/js/')
    .replace(/href="\.\/admin\//g, 'href="/admin/')
    .replace(/href="#/g, 'href="/#');
}

const headerHtml = toAbsolute(sharedHeader);
const footerHtml = toAbsolute(sharedFooter);

// ==================== 通用片段 ====================
const UMENG_SCRIPT = `<!-- 友盟/UMeng 站点统计 -->
<script type="text/javascript">
(function() {
  var _u = 'https://s9.cnzz.com/';
  var _d = document, _g = _d.createElement('script'), _s = _d.getElementsByTagName('script')[0];
  _g.type = 'text/javascript'; _g.async = true; _g.src = _u + 'z.js?id=1281492695';
  _s.parentNode.insertBefore(_g, _s);
})();
</script>`;

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d) {
  if (!d) return '';
  const parts = String(d).split('-');
  return parts.length === 3 ? parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日' : d;
}

const CATEGORY_LABELS = {
  latest: '最新文章',
  news: '移民资讯',
  policy: '移民政策',
  property: '海外置业',
  education: '教育',
  life: '生活',
  invest: '海外投资'
};

const PROJECT_CAT_LABELS = {
  investment: '投资移民',
  business: '创业移民',
  skilled: '技术移民'
};

function getCategoryLabel(cat, map) {
  return map[cat] || cat || '';
}

function truncate(str, n) {
  str = String(str || '');
  return str.length > n ? str.slice(0, n) : str;
}

function resolveImageUrl(img) {
  if (!img) return '';
  if (/^https?:\/\//i.test(img) || /^data:/i.test(img)) return img;
  return img.startsWith('/') ? SITE_URL + img : SITE_URL + '/' + img;
}

function totalWords(html) {
  // 粗略估算正文字数（去 HTML 标签）
  return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
}

// ==================== 通用静态页框架 ====================
function wrapPage({ title, description, canonical, ogType, jsonLd, bodyHtml, breadcrumbHtml }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Cache-Control" content="content=\"no-cache, no-store, must-revalidate\">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>${escapeHtml(title)}</title>
<base href="/">
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="汇程移民">
<meta property="og:locale" content="zh_CN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="icon" href="/assets/images/favicon.png">
<link rel="stylesheet" href="/css/style.css?v=2026072817">
<script type="application/ld+json">${jsonLd}</script>
<style>
  .page-content { max-width: 800px; margin: 0 auto; padding: 30px 20px 80px; }
  .static-breadcrumb { padding: 15px 0; background: var(--bg-light); border-bottom: 1px solid var(--border); font-size: 14px; }
  .static-breadcrumb .container { display: flex; align-items: center; gap: 6px; color: var(--text-light); flex-wrap: wrap; }
  .static-breadcrumb a { color: var(--text-light); text-decoration: none; }
  .static-breadcrumb a:hover { color: var(--primary); }
  .static-breadcrumb .sep { color: var(--text-muted); }
  .static-breadcrumb .current { color: var(--text); font-weight: 500; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 576px) { .page-content { padding: 20px 15px 60px; } }
</style>
</head>
<body>
${headerHtml}
<div class="static-breadcrumb"><div class="container">${breadcrumbHtml}</div></div>
<main class="page-content">${bodyHtml}</main>
${footerHtml}
${UMENG_SCRIPT}
</body>
</html>`;
}

// ==================== 文章页生成 ====================
function generateArticlePage(article) {
  const url = `${SITE_URL}/articles/${article.id}.html`;
  const title = (article.title || '') + ' - 汇程移民';
  const desc = truncate(article.summary || '', 200);
  const cat = article.category || '';
  const catLabel = getCategoryLabel(cat, CATEGORY_LABELS);
  const date = article.createdAt || article.date || '';
  const updatedAt = article.updatedAt || '';
  const tags = article.tags || [];
  const content = article.content || '<p>暂无内容</p>';
  const coverUrl = resolveImageUrl(article.image);
  const wc = totalWords(content);

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary || '',
    image: coverUrl || undefined,
    datePublished: date || undefined,
    dateModified: updatedAt || date || undefined,
    author: { '@type': 'Organization', name: '汇程移民' },
    publisher: {
      '@type': 'Organization',
      name: '汇程移民',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/images/logo-full-color.png` }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url }
  });

  const bodyHtml = `
  <article class="static-article">
    <header class="static-article-header">
      <span class="cat-badge">${escapeHtml(catLabel)}</span>
      <h1>${escapeHtml(article.title)}</h1>
      <div class="static-article-meta">
        <span>📅 发布于 ${escapeHtml(date)}</span>
        ${updatedAt && updatedAt !== date ? `<span>🔄 更新于 ${escapeHtml(updatedAt)}</span>` : ''}
        ${wc > 0 ? `<span>📝 约 ${wc.toLocaleString('zh-CN')} 字</span>` : ''}
      </div>
      ${tags.length ? `<div class="static-article-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    </header>
    ${coverUrl ? `<img class="static-article-cover" src="${escapeHtml(article.image)}" alt="${escapeHtml(article.title)}">` : ''}
    <div class="static-article-body">${content}</div>
    <div class="static-article-cta">
      <h3>需要专业咨询？</h3>
      <p>汇程移民专业顾问 1 对 1 为您定制专属方案</p>
      <a href="tel:136-5185-2270">📞 136-5185-2270</a>
    </div>
  </article>
  <style>
    .static-article-header { margin-bottom: 30px; padding-bottom: 25px; border-bottom: 1px solid var(--border); }
    .static-article-header .cat-badge { display: inline-block; padding: 4px 14px; background: var(--primary); color: white; border-radius: 20px; font-size: 12px; margin-bottom: 12px; }
    .static-article-header h1 { font-size: 28px; color: var(--primary-dark); margin-bottom: 15px; line-height: 1.4; }
    .static-article-meta { color: var(--text-light); font-size: 14px; display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 15px; }
    .static-article-tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .static-article-tags .tag { padding: 3px 12px; background: var(--bg-light); border: 1px solid var(--border); border-radius: 14px; font-size: 12px; color: var(--text-light); }
    .static-article-cover { width: 100%; max-height: 420px; object-fit: cover; border-radius: var(--radius-lg); margin-bottom: 30px; }
    .static-article-body { font-size: 16px; line-height: 1.85; color: var(--text); }
    .static-article-body p { margin-bottom: 18px; }
    .static-article-body h2, .static-article-body h3 { color: var(--primary-dark); margin: 30px 0 15px; }
    .static-article-body img { max-width: 100%; border-radius: var(--radius); margin: 15px 0; }
    .static-article-body blockquote { border-left: 4px solid var(--primary); padding: 12px 20px; background: var(--bg-light); margin: 20px 0; color: var(--text-light); border-radius: 4px; }
    .static-article-body strong { color: var(--primary-dark); }
    .static-article-cta { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 30px; border-radius: var(--radius-lg); text-align: center; margin-top: 40px; }
    .static-article-cta h3 { font-size: 20px; margin-bottom: 10px; }
    .static-article-cta p { opacity: 0.9; margin-bottom: 18px; }
    .static-article-cta a { display: inline-block; padding: 12px 28px; background: var(--accent); color: white; border-radius: var(--radius); text-decoration: none; font-weight: 700; font-size: 17px; }
    @media (max-width: 576px) { .static-article-header h1 { font-size: 22px; } .static-article-meta { gap: 10px; font-size: 13px; } }
  </style>`;

  const breadcrumbHtml = `
    <a href="/">首页</a><span class="sep">›</span>
    <a href="/news.html">移民攻略</a><span class="sep">›</span>
    <span class="current">${escapeHtml(article.title)}</span>`;

  return wrapPage({
    title, description: desc, canonical: url, ogType: 'article',
    jsonLd, bodyHtml, breadcrumbHtml
  });
}

// ==================== 项目页生成 ====================
function generateProjectPage(project) {
  const url = `${SITE_URL}/projects/${project.id}.html`;
  const title = (project.title || '') + ' - 汇程移民';
  const desc = truncate(project.summary || '', 200);
  const catLabel = getCategoryLabel(project.category, PROJECT_CAT_LABELS);
  const advantages = project.advantages || [];
  const requirements = project.requirements || [];

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: project.title,
    description: project.summary || '',
    provider: { '@type': 'Organization', name: '汇程移民' },
    url: url,
    areaServed: { '@type': 'Country', name: '全球' }
  });

  const bodyHtml = `
  <header class="static-project-hero">
    <span class="badge">${escapeHtml(catLabel)}</span>
    <h1>${escapeHtml(project.title)}</h1>
    <div class="price">💰 ${escapeHtml(project.price || '咨询顾问')}</div>
  </header>
  <div class="static-project-body">${project.content || '<p>暂无详细介绍</p>'}</div>
  <div class="static-project-sidebar">
    <div class="sidebar-card">
      <h4>项目优势</h4>
      <ul>${advantages.length ? advantages.map(a => `<li>${escapeHtml(a)}</li>`).join('') : '<li>专业顾问一对一服务</li><li>量身定制移民方案</li>'}</ul>
    </div>
    <div class="sidebar-card">
      <h4>申请条件</h4>
      <ul>${requirements.length ? requirements.map(r => `<li>${escapeHtml(r)}</li>`).join('') : '<li>请咨询顾问了解详细条件</li>'}</ul>
    </div>
    <div class="cta-box">
      <h4>获取专属方案</h4>
      <p>汇程移民专业顾问为您一对一解答</p>
      <a href="tel:136-5185-2270">📞 136-5185-2270</a>
    </div>
  </div>
  <style>
    .static-project-hero { background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%); color: white; border-radius: var(--radius-lg); padding: 35px 30px; margin-bottom: 30px; }
    .static-project-hero .badge { display: inline-block; padding: 5px 14px; background: var(--accent); border-radius: 20px; font-size: 13px; margin-bottom: 12px; }
    .static-project-hero h1 { font-size: 30px; line-height: 1.4; margin-bottom: 10px; }
    .static-project-hero .price { font-size: 17px; opacity: 0.95; }
    .static-project-body { background: white; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 30px; margin-bottom: 30px; line-height: 1.8; color: var(--text); }
    .static-project-body h2 { font-size: 22px; color: var(--primary-dark); margin: 25px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--bg-light); }
    .static-project-body h3 { font-size: 18px; color: var(--primary); margin: 20px 0 10px; }
    .static-project-body p { margin-bottom: 14px; }
    .static-project-body strong { color: var(--primary-dark); }
    .static-project-body ul, .static-project-body ol { padding-left: 24px; margin: 12px 0; }
    .static-project-body li { margin-bottom: 6px; }
    .static-project-sidebar { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .static-project-sidebar .sidebar-card { background: white; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 22px; }
    .static-project-sidebar .sidebar-card h4 { color: var(--primary-dark); font-size: 16px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--bg-light); }
    .static-project-sidebar .sidebar-card ul { list-style: none; padding: 0; }
    .static-project-sidebar .sidebar-card li { padding: 8px 0; border-bottom: 1px dashed var(--border); font-size: 14px; }
    .static-project-sidebar .sidebar-card li:last-child { border: none; }
    .static-project-sidebar .cta-box { grid-column: 1 / -1; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 25px; border-radius: var(--radius-lg); text-align: center; }
    .static-project-sidebar .cta-box h4 { font-size: 18px; margin-bottom: 8px; }
    .static-project-sidebar .cta-box p { font-size: 14px; opacity: 0.9; margin-bottom: 15px; }
    .static-project-sidebar .cta-box a { display: inline-block; padding: 11px 28px; background: var(--accent); color: white; border-radius: var(--radius); text-decoration: none; font-weight: 700; }
    @media (max-width: 576px) { .static-project-hero { padding: 25px 20px; } .static-project-hero h1 { font-size: 22px; } .static-project-sidebar { grid-template-columns: 1fr; } }
  </style>`;

  const breadcrumbHtml = `
    <a href="/">首页</a><span class="sep">›</span>
    <a href="/projects.html">移民项目</a><span class="sep">›</span>
    <span class="current">${escapeHtml(project.title)}</span>`;

  return wrapPage({
    title, description: desc, canonical: url, ogType: 'website',
    jsonLd, bodyHtml, breadcrumbHtml
  });
}

// ==================== 案例页生成 ====================
function generateCasePage(c) {
  const url = `${SITE_URL}/cases/${c.id}.html`;
  const title = (c.title || '') + ' - 汇程移民';
  const desc = truncate(c.summary || '', 200);
  const tags = c.tags || [];
  const date = c.date || '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.title,
    description: c.summary || '',
    image: resolveImageUrl(c.image) || undefined,
    datePublished: date || undefined,
    author: { '@type': 'Organization', name: '汇程移民' },
    publisher: { '@type': 'Organization', name: '汇程移民' }
  });

  const heroHtml = c.image
    ? `<img class="static-case-hero-img" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title)}">`
    : `<div class="static-case-hero-gradient" style="background:${escapeHtml(c.gradient || 'linear-gradient(135deg, var(--primary), var(--primary-dark))')};">${escapeHtml(c.icon || '🎉')}</div>`;

  const bodyHtml = `
  <header class="static-case-hero">
    ${heroHtml}
    <div class="static-case-hero-overlay">
      <div class="tags">${tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>
      <h1>${escapeHtml(c.title)}</h1>
      ${date ? `<div class="date">${escapeHtml(date)}</div>` : ''}
    </div>
  </header>
  <div class="static-case-body">${c.content || '<p>暂无详情</p>'}</div>
  <div class="static-case-cta">
    <h3>您也想成为下一个成功案例？</h3>
    <p>汇程移民专业顾问 1 对 1 为您定制专属方案</p>
    <a href="tel:136-5185-2270">📞 136-5185-2270</a>
  </div>
  <style>
    .static-case-hero { position: relative; border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 30px; }
    .static-case-hero-img { width: 100%; height: 360px; object-fit: cover; display: block; }
    .static-case-hero-gradient { width: 100%; height: 360px; display: flex; align-items: center; justify-content: center; font-size: 80px; }
    .static-case-hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 30px 25px 20px; }
    .static-case-hero-overlay .tags { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .static-case-hero-overlay .tags span { padding: 4px 12px; background: var(--accent); color: white; border-radius: 20px; font-size: 12px; }
    .static-case-hero-overlay h1 { font-size: 24px; color: white; line-height: 1.4; margin: 0; }
    .static-case-hero-overlay .date { font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 8px; }
    .static-case-body { background: white; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 30px; line-height: 1.8; color: var(--text); }
    .static-case-body p { margin-bottom: 14px; }
    .static-case-body h2 { font-size: 22px; color: var(--primary-dark); margin: 25px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--bg-light); }
    .static-case-body img { max-width: 100%; border-radius: 8px; margin: 15px 0; }
    .static-case-cta { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 30px; border-radius: var(--radius-lg); text-align: center; margin-top: 30px; }
    .static-case-cta h3 { font-size: 20px; margin-bottom: 10px; }
    .static-case-cta p { opacity: 0.9; margin-bottom: 18px; }
    .static-case-cta a { display: inline-block; padding: 12px 28px; background: var(--accent); color: white; border-radius: var(--radius); text-decoration: none; font-weight: 700; font-size: 17px; }
    @media (max-width: 576px) { .static-case-hero-img, .static-case-hero-gradient { height: 220px; } .static-case-hero-overlay h1 { font-size: 18px; } }
  </style>`;

  const breadcrumbHtml = `
    <a href="/">首页</a><span class="sep">›</span>
    <a href="/#cases">成功案例</a><span class="sep">›</span>
    <span class="current">${escapeHtml(c.title)}</span>`;

  return wrapPage({
    title, description: desc, canonical: url, ogType: 'article',
    jsonLd, bodyHtml, breadcrumbHtml
  });
}

// ==================== 写入文件 ====================
function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

let count = 0;
ensureDir('articles');
pubArticles.forEach(a => {
  fs.writeFileSync(path.join('articles', a.id + '.html'), generateArticlePage(a), 'utf8');
  count++;
});
ensureDir('projects');
pubProjects.forEach(p => {
  fs.writeFileSync(path.join('projects', p.id + '.html'), generateProjectPage(p), 'utf8');
  count++;
});
ensureDir('cases');
pubCases.forEach(c => {
  fs.writeFileSync(path.join('cases', c.id + '.html'), generateCasePage(c), 'utf8');
  count++;
});

console.log(`已生成 ${count} 个静态页面`);

// ==================== 生成 sitemap.xml ====================
const urls = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/news.html', priority: '0.9', changefreq: 'daily' },
  { loc: '/projects.html', priority: '0.9', changefreq: 'weekly' }
];

pubArticles.forEach(a => {
  urls.push({
    loc: `/articles/${a.id}.html`,
    lastmod: a.updatedAt || a.createdAt || a.date,
    priority: '0.8',
    changefreq: 'monthly'
  });
});
pubProjects.forEach(p => {
  urls.push({
    loc: `/projects/${p.id}.html`,
    lastmod: p.updatedAt || p.createdAt,
    priority: '0.7',
    changefreq: 'monthly'
  });
});
pubCases.forEach(c => {
  urls.push({
    loc: `/cases/${c.id}.html`,
    lastmod: c.date,
    priority: '0.6',
    changefreq: 'monthly'
  });
});

const today = new Date().toISOString().split('T')[0];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
console.log(`sitemap.xml 已更新（共 ${urls.length} 条 URL）`);

// 同步刷新 Baidu 推送队列（仅当本地存在 baidu_push 目录时；CI/Action 环境跳过，避免向仓库外写入报错）
const BAIDU_PUSH_DIR = path.join('..', 'baidu_push');
if (fs.existsSync(BAIDU_PUSH_DIR)) {
  const allUrls = urls.map(u => SITE_URL + u.loc).join('\n') + '\n';
  fs.writeFileSync(path.join(BAIDU_PUSH_DIR, 'urls.txt'), allUrls, 'utf8');
  if (!fs.existsSync(path.join(BAIDU_PUSH_DIR, 'remaining.txt'))) {
    fs.writeFileSync(path.join(BAIDU_PUSH_DIR, 'remaining.txt'), allUrls, 'utf8');
  }
  console.log(`已同步 urls.txt（${urls.length} 条）`);
} else {
  console.log('跳过 baidu_push 同步（baidu_push 目录不存在，可能运行于 CI 环境）');
}

console.log('全部完成。');
