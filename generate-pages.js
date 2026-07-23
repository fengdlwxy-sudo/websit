const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');

const headerStart = indexHtml.indexOf('<body>');
const headerEnd = indexHtml.indexOf('</header>') + 9;
const header = indexHtml.substring(headerStart, headerEnd);

const footerStart = indexHtml.indexOf('<!-- 页脚 -->');
const footerEnd = indexHtml.indexOf('</footer>') + 9;
const footer = indexHtml.substring(footerStart, footerEnd);

const sideToolsStart = indexHtml.indexOf('<!-- 侧边悬浮工具 -->');
const sideToolsEnd = indexHtml.indexOf('</body>');
const sideTools = indexHtml.substring(sideToolsStart, sideToolsEnd).trim();

const categoryMap = {
  investment: '投资移民',
  business: '创业移民',
  skilled: '技术移民'
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Projects page
const projectsHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>移民项目 - 汇程移民</title>
    <meta name="description" content="汇程移民提供全球移民项目，涵盖投资移民、创业移民、技术移民。">
    <link rel="icon" href="assets/images/favicon.png">
    <link rel="stylesheet" href="css/style.css">
    <style>
        .page-banner { background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%); color: white; padding: 80px 0 60px; text-align: center; }
        .page-banner-title { font-size: 40px; font-weight: 700; margin-bottom: 12px; }
        .page-banner-subtitle { font-size: 16px; opacity: 0.85; }
        .filter-section { padding: 35px 0 20px; background: var(--bg-light); border-bottom: 1px solid var(--border); }
        .filter-group { margin-bottom: 15px; }
        .filter-label { font-size: 14px; color: var(--text-light); margin-bottom: 10px; font-weight: 500; }
        .filter-tabs { display: flex; flex-wrap: wrap; gap: 10px; }
        .filter-tab { padding: 8px 18px; border-radius: 20px; background: white; border: 1px solid var(--border); color: var(--text); font-size: 14px; cursor: pointer; transition: all .2s; text-decoration: none; }
        .filter-tab:hover, .filter-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
        .projects-section { padding: 50px 0 70px; }
        .projects-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 25px; }
        .project-card { background: white; border-radius: var(--radius-lg); overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); transition: all .3s; border: 1px solid var(--border); }
        .project-card:hover { transform: translateY(-5px); box-shadow: 0 12px 30px rgba(0,0,0,0.12); }
        .project-card-image { height: 160px; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); display: flex; align-items: center; justify-content: center; position: relative; }
        .project-card-image img { width: 70px; height: 70px; object-fit: contain; border-radius: 50%; box-shadow: 0 4px 15px rgba(0,0,0,0.2); background: white; }
        .project-card-category { position: absolute; top: 12px; left: 12px; padding: 4px 12px; background: var(--accent); color: white; border-radius: 20px; font-size: 12px; }
        .project-card-body { padding: 22px; }
        .project-card-title { font-size: 18px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
        .project-card-price { font-size: 15px; color: var(--primary); font-weight: 600; margin-bottom: 12px; }
        .project-card-summary { font-size: 14px; color: var(--text-light); line-height: 1.6; margin-bottom: 18px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .project-card-btn { display: inline-block; padding: 10px 22px; background: var(--primary); color: white; border-radius: var(--radius); text-decoration: none; font-size: 14px; transition: background .2s; }
        .project-card-btn:hover { background: var(--primary-dark); }
        .loading, .empty, .error { text-align: center; padding: 60px 20px; color: var(--text-light); }
        @media (max-width: 992px) { .projects-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 576px) { .projects-grid { grid-template-columns: 1fr; } .page-banner-title { font-size: 30px; } }
    </style>
</head>
${header}

    <section class="page-banner">
        <div class="container">
            <h1 class="page-banner-title">移民项目</h1>
            <p class="page-banner-subtitle">全球优质移民项目，为您定制专属身份规划方案</p>
        </div>
    </section>

    <section class="filter-section">
        <div class="container">
            <div class="filter-group">
                <div class="filter-label">按国家筛选</div>
                <div class="filter-tabs" id="countryFilters">
                    <a href="projects.html" class="filter-tab active" data-id="">全部</a>
                </div>
            </div>
            <div class="filter-group">
                <div class="filter-label">按类型筛选</div>
                <div class="filter-tabs" id="categoryFilters">
                    <a href="projects.html" class="filter-tab active" data-id="">全部</a>
                    <a href="?category=investment" class="filter-tab" data-id="investment">投资移民</a>
                    <a href="?category=business" class="filter-tab" data-id="business">创业移民</a>
                    <a href="?category=skilled" class="filter-tab" data-id="skilled">技术移民</a>
                </div>
            </div>
        </div>
    </section>

    <section class="projects-section">
        <div class="container">
            <div id="projectsLoading" class="loading">正在加载项目...</div>
            <div id="projectsGrid" class="projects-grid" style="display:none;"></div>
            <div id="projectsEmpty" class="empty" style="display:none;">暂无相关项目</div>
        </div>
    </section>

${footer}
${sideTools}

    <script src="js/main.js"></script>
    <script>
        const categoryMap = ${JSON.stringify(categoryMap)};

        function getParam(name) {
            return new URLSearchParams(window.location.search).get(name) || '';
        }

        async function loadFilters() {
            try {
                const res = await fetch('/api/countries');
                const result = await res.json();
                const countries = result.data || [];
                const container = document.getElementById('countryFilters');
                const currentCountry = getParam('countryId');
                countries.forEach(c => {
                    const a = document.createElement('a');
                    a.href = '?countryId=' + encodeURIComponent(c.id);
                    a.className = 'filter-tab' + (c.id === currentCountry ? ' active' : '');
                    a.textContent = c.name;
                    container.appendChild(a);
                });
            } catch (e) { console.error(e); }
        }

        async function loadProjects() {
            const grid = document.getElementById('projectsGrid');
            const loading = document.getElementById('projectsLoading');
            const empty = document.getElementById('projectsEmpty');
            const countryId = getParam('countryId');
            const category = getParam('category');

            try {
                const params = new URLSearchParams();
                if (countryId) params.append('countryId', countryId);
                if (category) params.append('category', category);
                const res = await fetch('/api/projects?' + params.toString());
                const result = await res.json();
                const projects = result.data || [];

                loading.style.display = 'none';
                if (projects.length === 0) {
                    empty.style.display = 'block';
                    return;
                }

                grid.innerHTML = projects.map(p => \`
                    <div class="project-card">
                        <div class="project-card-image">
                            <span class="project-card-category">\${categoryMap[p.category] || '移民项目'}</span>
                            <img src="\${p.image || 'assets/images/flags/gr.svg'}" alt="\${p.title}">
                        </div>
                        <div class="project-card-body">
                            <h3 class="project-card-title">\${p.title}</h3>
                            <div class="project-card-price">\${p.price || '咨询顾问'}</div>
                            <p class="project-card-summary">\${p.summary || ''}</p>
                            <a href="project-detail.html?id=\${p.id}" class="project-card-btn">查看详情</a>
                        </div>
                    </div>
                \`).join('');
                grid.style.display = 'grid';
            } catch (err) {
                loading.innerHTML = '<div class="error">加载失败，请刷新重试</div>';
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadFilters();
            loadProjects();

            const currentCategory = getParam('category');
            document.querySelectorAll('#categoryFilters .filter-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.id === currentCategory);
            });
        });
    </script>
</body>
</html>
`;

fs.writeFileSync('projects.html', projectsHtml, 'utf8');
console.log('Created projects.html');

// Project detail page
const projectDetailHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title id="pageTitle">项目详情 - 汇程移民</title>
    <meta name="description" content="汇程移民项目详情，了解移民条件、优势、办理流程。">
    <link rel="icon" href="assets/images/favicon.png">
    <link rel="stylesheet" href="css/style.css">
    <style>
        .breadcrumb-wrapper { background: var(--bg-light); padding: 15px 0; border-bottom: 1px solid var(--border); }
        .breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-light); }
        .breadcrumb a { color: var(--text-light); text-decoration: none; }
        .breadcrumb a:hover { color: var(--primary); }
        .breadcrumb .current { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 400px; }
        .detail-section { padding: 50px 0 70px; }
        .detail-layout { display: grid; grid-template-columns: 1fr 340px; gap: 40px; align-items: start; }
        .detail-hero { background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%); color: white; border-radius: var(--radius-lg); padding: 40px; margin-bottom: 30px; position: relative; overflow: hidden; }
        .detail-hero::before { content: ''; position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; border-radius: 50%; background: rgba(255,255,255,0.08); }
        .detail-hero-badge { display: inline-block; padding: 5px 14px; background: var(--accent); border-radius: 20px; font-size: 13px; margin-bottom: 15px; }
        .detail-hero-title { font-size: 32px; font-weight: 700; margin-bottom: 12px; }
        .detail-hero-price { font-size: 18px; opacity: 0.9; }
        .detail-hero-flag { position: absolute; right: 40px; top: 50%; transform: translateY(-50%); width: 100px; height: 100px; object-fit: contain; border-radius: 50%; background: white; box-shadow: 0 8px 25px rgba(0,0,0,0.2); }
        .detail-content { background: white; border-radius: var(--radius-lg); padding: 35px; border: 1px solid var(--border); line-height: 1.8; color: var(--text); }
        .detail-content h2 { font-size: 24px; color: var(--primary-dark); margin: 30px 0 15px; padding-bottom: 10px; border-bottom: 2px solid var(--bg-light); }
        .detail-content h3 { font-size: 18px; color: var(--primary); margin: 25px 0 12px; }
        .detail-content ul, .detail-content ol { margin: 15px 0; padding-left: 25px; }
        .detail-content li { margin-bottom: 8px; }
        .detail-content p { margin-bottom: 15px; }
        .detail-content strong { color: var(--primary-dark); }
        .sidebar { position: sticky; top: 100px; }
        .sidebar-card { background: white; border-radius: var(--radius-lg); padding: 25px; margin-bottom: 20px; border: 1px solid var(--border); box-shadow: 0 4px 15px rgba(0,0,0,0.04); }
        .sidebar-title { font-size: 18px; font-weight: 600; color: var(--primary-dark); margin-bottom: 18px; padding-bottom: 12px; border-bottom: 2px solid var(--bg-light); }
        .sidebar-list { list-style: none; padding: 0; margin: 0; }
        .sidebar-list li { padding: 10px 0; border-bottom: 1px dashed var(--border); font-size: 14px; color: var(--text); display: flex; align-items: flex-start; gap: 8px; }
        .sidebar-list li::before { content: '✓'; color: var(--primary); font-weight: bold; }
        .cta-box { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border-radius: var(--radius-lg); padding: 25px; text-align: center; }
        .cta-box h4 { font-size: 18px; margin-bottom: 12px; }
        .cta-box p { font-size: 14px; opacity: 0.9; margin-bottom: 18px; }
        .cta-box a { display: inline-block; padding: 12px 28px; background: var(--accent); color: white; border-radius: var(--radius); text-decoration: none; font-weight: 600; }
        .related-section { padding: 0 0 60px; }
        .related-title { font-size: 24px; color: var(--primary-dark); margin-bottom: 25px; }
        .related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .related-card { background: white; border-radius: var(--radius); padding: 20px; border: 1px solid var(--border); transition: all .2s; }
        .related-card:hover { box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
        .related-card a { color: var(--text); text-decoration: none; font-weight: 600; }
        .related-card a:hover { color: var(--primary); }
        .loading, .empty, .error { text-align: center; padding: 60px 20px; color: var(--text-light); }
        @media (max-width: 992px) { .detail-layout { grid-template-columns: 1fr; } .detail-hero-flag { display: none; } .related-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 576px) { .detail-hero { padding: 25px; } .detail-hero-title { font-size: 24px; } .related-grid { grid-template-columns: 1fr; } }
    </style>
</head>
${header}

    <div class="breadcrumb-wrapper">
        <div class="container">
            <div class="breadcrumb">
                <a href="index.html">首页</a>
                <span class="sep">›</span>
                <a href="projects.html">移民项目</a>
                <span class="sep">›</span>
                <span class="current" id="breadcrumbTitle">项目详情</span>
            </div>
        </div>
    </div>

    <section class="detail-section">
        <div class="container">
            <div id="detailLoading" class="loading">正在加载项目详情...</div>
            <div id="detailContent" style="display:none;">
                <div class="detail-hero">
                    <span class="detail-hero-badge" id="projectCategory">投资移民</span>
                    <h1 class="detail-hero-title" id="projectTitle">项目名称</h1>
                    <div class="detail-hero-price" id="projectPrice">投资金额</div>
                    <img id="projectFlag" src="" alt="" class="detail-hero-flag">
                </div>
                <div class="detail-layout">
                    <div class="detail-content" id="projectBody"></div>
                    <aside class="sidebar">
                        <div class="sidebar-card">
                            <h4 class="sidebar-title">项目优势</h4>
                            <ul class="sidebar-list" id="projectAdvantages"></ul>
                        </div>
                        <div class="sidebar-card">
                            <h4 class="sidebar-title">申请条件</h4>
                            <ul class="sidebar-list" id="projectRequirements"></ul>
                        </div>
                        <div class="cta-box">
                            <h4>获取专属方案</h4>
                            <p>汇程移民专业顾问为您一对一解答</p>
                            <a href="tel:136-5185-2270">立即咨询</a>
                        </div>
                    </aside>
                </div>
            </div>
            <div id="detailError" class="error" style="display:none;">项目加载失败，请返回<a href="projects.html">项目列表</a></div>
        </div>
    </section>

    <section class="related-section" id="relatedSection" style="display:none;">
        <div class="container">
            <h2 class="related-title">相关项目</h2>
            <div class="related-grid" id="relatedGrid"></div>
        </div>
    </section>

${footer}
${sideTools}

    <script src="js/main.js"></script>
    <script>
        const categoryMap = ${JSON.stringify(categoryMap)};

        function getParam(name) {
            return new URLSearchParams(window.location.search).get(name) || '';
        }

        function escapeHtml(str) {
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        async function loadProject() {
            const id = getParam('id');
            if (!id) {
                document.getElementById('detailLoading').style.display = 'none';
                document.getElementById('detailError').style.display = 'block';
                return;
            }

            try {
                const res = await fetch('/api/projects/' + encodeURIComponent(id));
                if (!res.ok) throw new Error('Project not found');
                const result = await res.json();
                const p = result.data;

                document.getElementById('pageTitle').textContent = p.title + ' - 汇程移民';
                document.getElementById('breadcrumbTitle').textContent = p.title;
                document.getElementById('projectCategory').textContent = categoryMap[p.category] || '移民项目';
                document.getElementById('projectTitle').textContent = p.title;
                document.getElementById('projectPrice').textContent = '投资金额：' + (p.price || '咨询顾问');
                document.getElementById('projectFlag').src = p.image || 'assets/images/flags/gr.svg';
                document.getElementById('projectFlag').alt = p.title;
                document.getElementById('projectBody').innerHTML = p.content || '<p>暂无详细介绍</p>';

                const advList = document.getElementById('projectAdvantages');
                advList.innerHTML = (p.advantages && p.advantages.length ? p.advantages : ['专业顾问一对一服务', '量身定制移民方案']).map(a => '<li>' + escapeHtml(a) + '</li>').join('');

                const reqList = document.getElementById('projectRequirements');
                reqList.innerHTML = (p.requirements && p.requirements.length ? p.requirements : ['请咨询顾问了解详细条件']).map(r => '<li>' + escapeHtml(r) + '</li>').join('');

                document.getElementById('detailLoading').style.display = 'none';
                document.getElementById('detailContent').style.display = 'block';

                loadRelated(p.countryId, p.id);
            } catch (err) {
                document.getElementById('detailLoading').style.display = 'none';
                document.getElementById('detailError').style.display = 'block';
            }
        }

        async function loadRelated(countryId, excludeId) {
            try {
                const res = await fetch('/api/projects?countryId=' + encodeURIComponent(countryId));
                const result = await res.json();
                const projects = (result.data || []).filter(p => p.id !== excludeId).slice(0, 3);
                if (projects.length === 0) return;

                document.getElementById('relatedSection').style.display = 'block';
                document.getElementById('relatedGrid').innerHTML = projects.map(p => \`
                    <div class="related-card">
                        <a href="project-detail.html?id=\${p.id}">\${p.title}</a>
                        <p style="margin-top:8px;font-size:13px;color:var(--text-light);line-height:1.5;">\${p.summary || ''}</p>
                    </div>
                \`).join('');
            } catch (e) { console.error(e); }
        }

        document.addEventListener('DOMContentLoaded', loadProject);
    </script>
</body>
</html>
`;

fs.writeFileSync('project-detail.html', projectDetailHtml, 'utf8');
console.log('Created project-detail.html');
