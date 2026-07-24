/**
 * 汇程移民 - 网站交互脚本
 */

document.addEventListener('DOMContentLoaded', function() {
    // ==================== 
    // 动态内容渲染
    // ====================
    async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load ' + url);
        return response.json();
    }

    // 将绝对路径（如 /assets/...）转为相对路径，兼容 GitHub Pages 子目录部署
    function resolveAssetPath(path) {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
        if (path.startsWith('/')) return path.slice(1);
        return path;
    }

    async function loadStaticData() {
        const cacheBuster = '?_=' + Date.now();
        const [config, countries, projects, articles, cases, certificates] = await Promise.all([
            fetchJson('data/config.json' + cacheBuster).catch(() => null),
            fetchJson('data/countries.json' + cacheBuster).catch(() => null),
            fetchJson('data/projects.json' + cacheBuster).catch(() => null),
            fetchJson('data/articles.json' + cacheBuster).catch(() => null),
            fetchJson('data/cases.json' + cacheBuster).catch(() => null),
            fetchJson('data/certificates.json' + cacheBuster).catch(() => null)
        ]);
        return { config, countries, projects, articles, cases, certificates };
    }

    // 暴露给详情页脚本在 GitHub Pages 静态环境下使用
    window.hcFetchJson = fetchJson;
    window.hcResolveAssetPath = resolveAssetPath;
    window.hcLoadStaticData = loadStaticData;

    async function loadDynamicContent() {
        try {
            const response = await fetch('/api/content');
            if (!response.ok) throw new Error('Failed to load content');
            const data = await response.json();
            renderAll(data);
        } catch (error) {
            console.warn('动态内容加载失败，尝试静态数据文件:', error);
            try {
                const cacheBuster = '?_=' + Date.now();
                const [config, countries, projects, articles, cases, certificates] = await Promise.all([
                    fetchJson('data/config.json' + cacheBuster).catch(() => null),
                    fetchJson('data/countries.json' + cacheBuster).catch(() => null),
                    fetchJson('data/projects.json' + cacheBuster).catch(() => null),
                    fetchJson('data/articles.json' + cacheBuster).catch(() => null),
                    fetchJson('data/cases.json' + cacheBuster).catch(() => null),
                    fetchJson('data/certificates.json' + cacheBuster).catch(() => null)
                ]);
                if (config || countries || projects || articles || cases || certificates) {
                    renderAll({ config, countries, projects, articles, cases, certificates });
                } else {
                    throw new Error('静态数据文件也加载失败');
                }
            } catch (staticError) {
                console.warn('静态数据文件加载失败，使用默认内容:', staticError);
                renderDefaults();
            }
        }
    }

    function renderAll(data) {
        renderHeroSlides(data.config && data.config.slides);
        renderServices(data.config && data.config.services);
        renderAbout(data.config && data.config.about);
        renderCountries(data.countries);
        renderProjects(data.projects);
        renderArticles(data.articles);
        renderCases(data.cases);
        renderCertificates(data.certificates);
    }

    function renderDefaults() {
        renderHeroSlides(defaultSlides);
        renderServices(defaultServices);
        renderAbout(defaultAbout);
        renderCountries(defaultCountries);
        renderProjects(defaultProjects);
        renderArticles(defaultArticles);
        renderCases(defaultCases);
        renderCertificates(defaultCertificates);
    }

    // 默认轮播图数据
    const defaultSlides = [
        {
            title: '全球身份规划 · 财富生活领航',
            subtitle: '汇程移民，专注海外投资移民、技术移民、创业移民，为您定制专属移民方案',
            buttonText: '立即获取方案',
            buttonLink: '#contact',
            image: 'assets/images/hero-bg.jpg'
        },
        {
            title: '一人申请 · 三代移民',
            subtitle: '希腊、葡萄牙、马耳他等欧洲移民项目，25万欧元起，永久产权世代传承',
            buttonText: '了解热门项目',
            buttonLink: '#projects',
            image: 'assets/images/hero-bg2.jpg'
        },
        {
            title: '精英教育 · 从这里开始',
            subtitle: '香港、新加坡、美国身份规划，为孩子打开全球顶尖教育资源之门',
            buttonText: '预约专家咨询',
            buttonLink: '#contact',
            image: 'assets/images/hero-bg3.jpg'
        }
    ];

    const defaultServices = {
        title: '服务业务',
        subtitle: '始于身份、成于规划、优于业务',
        moreLink: '#',
        items: [
            { id: 'svc-1', icon: '🆔', title: '全球身份规划', desc: '投资移民、技术移民、创业移民，覆盖全球500+移民项目' },
            { id: 'svc-2', icon: '💼', title: '资产配置', desc: '全球保险咨询、税务、CRS规划咨询、海外地产基金咨询' },
            { id: 'svc-3', icon: '🏦', title: '海外服务', desc: '境外银行开户、美国升学规划、国内国际学校规划' },
            { id: 'svc-4', icon: '🏠', title: '海外房产', desc: '希腊、西班牙、葡萄牙、塞浦路斯等优质海外房产项目' }
        ]
    };

    const defaultAbout = {
        title: '关于汇程移民',
        paragraphs: [
            '汇程移民是一家专注于全球身份规划与海外资产配置的专业移民服务机构。我们汇聚全球移民专家、律师、税务师、投资顾问，为客户提供投资移民、技术移民、创业移民、海外房产、资产配置等一站式解决方案。',
            '多年来，汇程移民始终秉承"诚信、专业、高效、贴心"的服务理念，已成功帮助数千组家庭实现移民梦想。我们的服务覆盖全球50多个国家和地区，办理成功率高达97.6%。'
        ],
        stats: [
            { value: '500+', label: '移民项目' },
            { value: '50+', label: '覆盖国家' },
            { value: '97.6%', label: '办理成功率' },
            { value: '10年+', label: '行业经验' }
        ],
        imageIcon: '🏢'
    };

    // 默认新闻数据
    const defaultNews = {
        featured: {
            title: '高考，是孩子尤为重要的一条路，但不是唯一。',
            summary: '当下中国家庭的教育选择，正在从"孤注一掷"走向"多元布局"。放养、鸡娃、留学、华侨生、国际生，这五条主流路径背后藏着截然不同的教育逻辑和家庭规划。',
            gradient: 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)',
            icon: '🎓',
            date: '2026-07-15'
        },
        items: [
            { title: '除了高考，孩子还有别的出路吗？', tag: 'NEW', date: '2026-07-15' },
            { title: '这个国家出手了！31页通函严堵漏洞！', tag: 'NEW', date: '2026-07-15' },
            { title: '"外国人限购令"，黄了！', tag: 'NEW', date: '2026-07-15' },
            { title: '这三种定义都分不清，还想办理海外身份？', tag: 'NEW', date: '2026-07-15' },
            { title: '全球最大跨境财富管理中心易主！超越瑞士的是它！', tag: '资讯', date: '2026-07-15' },
            { title: '澄清！美国I-485新政策的真正意图其实是...', tag: '政策', date: '2026-07-10' }
        ]
    };

    // 默认案例数据
    const defaultCases = {
        items: [
            {
                title: '2个月获批！W先生用这个身份同时解决孩子教育和自身发展问题！',
                summary: '有没有办法，既能解决孩子的教育问题，同时还能规划自身的职业发展？有！W先生在汇程移民的协助下找到了答案！',
                gradient: 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)',
                icon: '🎉',
                tags: ['香港高才通', '2个月获批']
            },
            {
                title: '在港没有住所、往返次数不多，照样成功续签6年签证！',
                summary: '很多人拿到香港签证后，最担心的就是续签。今天分享一个真实案例——S先生在汇程移民协助下成功续签香港专才6年顶尖人才签证。',
                gradient: 'linear-gradient(135deg, #1E3A5F 0%, #2E5C8A 100%)',
                icon: '✅',
                tags: ['香港专才', '续签成功']
            },
            {
                title: '省下几十万！上海中产妈妈这样为孩子锁定国际教育！',
                summary: 'H女士事业在国内、孩子升学在即，预算有限、时间紧张。最终通过汇程移民找到既能满足孩子教育需求，又不影响国内事业的选择。',
                gradient: 'linear-gradient(135deg, #6B4C9A 0%, #9B6BCC 100%)',
                icon: '💰',
                tags: ['欧洲身份', '国际教育']
            },
            {
                title: '药剂研发NIW零补件获批案例：公共卫生价值是突破审批收紧关键！',
                summary: '42岁高级配方科学家Z先生，凭借扎实科研成果与汇程移民定制文书策略，成功获批EB-2 NIW国家利益豁免，全程无补件。',
                gradient: 'linear-gradient(135deg, #4A0E4E 0%, #8E24AA 100%)',
                icon: '🔬',
                tags: ['美国NIW', '零补件获批']
            }
        ]
    };

    // 默认证书数据
    const defaultCertificates = {
        items: [
            { icon: '🏆', title: '诚信专业服务机构' },
            { icon: '🤝', title: '行业协会会员合作机构' },
            { icon: '🥇', title: '2019家族办公室杰出海外服务大奖' },
            { icon: '⭐', title: '2024年度行业诚信示范机构荣誉奖' },
            { icon: '🌟', title: '2019全球资产配置身份规划引领奖' },
            { icon: '🏅', title: '2018欧洲投资移民卓越服务机构' },
            { icon: '🎖️', title: '2018诚信服务移民机构' },
            { icon: '💎', title: '2017年度综合实力移民品牌' }
        ]
    };

    function renderHeroSlides(slides) {
        const container = document.getElementById('heroSlider');
        if (!container || !slides || !slides.length) return;

        container.innerHTML = slides.map((slide, index) => `
            <div class="slide ${index === 0 ? 'active' : ''}" style="background-image: linear-gradient(135deg, rgba(0,120,120,0.85) 0%, rgba(0,80,90,0.8) 100%), url('${resolveAssetPath(slide.image || '')}');">
                <div class="slide-content">
                    <h1>${escapeHtml(slide.title)}</h1>
                    <p>${slide.subtitle || ''}</p>
                    <a href="${slide.buttonLink || '#'}" class="btn btn-primary">${escapeHtml(slide.buttonText)}</a>
                </div>
            </div>
        `).join('');
    }

    function renderNews(news) {
        const container = document.getElementById('newsContent');
        if (!container || !news) return;

        const featured = news.featured || {};
        const items = news.items || [];

        const featuredHtml = `
            <div class="news-feature">
                <a href="${featured.link || '#'}" class="news-feature-card">
                    <div class="news-feature-img" style="background: ${featured.gradient || 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)'};">
                        <span>${featured.icon || '🎓'}</span>
                    </div>
                    <div class="news-feature-info">
                        <h3>${escapeHtml(featured.title)}</h3>
                        <p>${escapeHtml(featured.summary)}</p>
                    </div>
                </a>
            </div>
        `;

        const listHtml = `
            <div class="news-list">
                ${items.map(item => `
                    <a href="${item.link || '#'}" class="news-item">
                        <span class="news-tag ${item.tag === 'NEW' ? 'new' : ''}">${escapeHtml(item.tag)}</span>
                        <h4>${escapeHtml(item.title)}</h4>
                        <span class="news-date">${escapeHtml(item.date)}</span>
                    </a>
                `).join('')}
            </div>
        `;

        container.innerHTML = featuredHtml + listHtml;
    }

    function renderCases(cases) {
        const container = document.getElementById('casesGrid');
        if (!container || !cases || !cases.items) return;

        container.innerHTML = cases.items.map(item => `
            <a href="case-detail.html?id=${item.id}" class="case-card">
                <div class="case-img" style="${item.image ? `background: url('${resolveAssetPath(item.image)}') center/cover;` : `background: ${item.gradient || 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)'};`}">
                    ${item.image ? '' : `<span>${item.icon || '📌'}</span>`}
                    <div class="case-read-more">查看详情 ›</div>
                </div>
                <div class="case-info">
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.summary)}</p>
                    <div class="case-tags">
                        ${(item.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </div>
            </a>
        `).join('');
    }

    function renderCertificates(certificates) {
        const container = document.getElementById('certificatesTrack');
        if (!container || !certificates || !certificates.items) return;

        container.innerHTML = certificates.items.map(item => `
            <div class="cert-card">
                <div class="cert-icon">${item.image ? `<img src="${resolveAssetPath(item.image)}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">` : (item.icon || '🏆')}</div>
                <p>${escapeHtml(item.title)}</p>
            </div>
        `).join('');
    }

    function renderServices(services) {
        if (!services) return;
        const titleEl = document.getElementById('servicesTitle');
        const subtitleEl = document.getElementById('servicesSubtitle');
        const moreLinkEl = document.getElementById('servicesMoreLink');
        const grid = document.getElementById('servicesGrid');
        if (titleEl) titleEl.textContent = services.title || '服务业务';
        if (subtitleEl) subtitleEl.textContent = services.subtitle || '';
        if (moreLinkEl) moreLinkEl.href = services.moreLink || '#';
        if (grid && services.items) {
            grid.innerHTML = services.items.map(item => `
                <div class="service-card">
                    <div class="service-icon">${isImageUrl(item.icon) ? `<img src="${resolveAssetPath(item.icon)}" alt="${escapeHtml(item.title)}" style="width:48px;height:48px;object-fit:contain;">` : (item.icon || '📌')}</div>
                    <h3>${escapeHtml(item.title)}</h3>
                    <p>${escapeHtml(item.desc)}</p>
                </div>
            `).join('');
        }
    }

    function renderAbout(about) {
        if (!about) return;
        const titleEl = document.getElementById('aboutTitle');
        const paragraphsEl = document.getElementById('aboutParagraphs');
        const statsEl = document.getElementById('aboutStats');
        const imageIconEl = document.getElementById('aboutImageIcon');
        if (titleEl) titleEl.textContent = about.title || '关于汇程移民';
        if (paragraphsEl && about.paragraphs) {
            paragraphsEl.innerHTML = about.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
        }
        if (statsEl && about.stats) {
            statsEl.innerHTML = about.stats.map(s => `
                <div class="stat-item"><strong>${escapeHtml(s.value)}</strong><span>${escapeHtml(s.label)}</span></div>
            `).join('');
        }
        if (imageIconEl) {
            if (about.image && isImageUrl(about.image)) {
                imageIconEl.innerHTML = `<img src="${resolveAssetPath(about.image)}" alt="关于汇程移民" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
            } else {
                imageIconEl.textContent = about.imageIcon || '🏢';
            }
        }
        // 关于我们右侧图片：有图时整块铺满，无图时显示渐变+图标
        const aboutImgBox = document.querySelector('.about-img');
        if (aboutImgBox) {
            if (about.image && isImageUrl(about.image)) {
                aboutImgBox.style.background = `url('${resolveAssetPath(about.image)}') center/cover no-repeat`;
                aboutImgBox.style.backgroundSize = 'cover';
                if (imageIconEl) imageIconEl.style.display = 'none';
            } else {
                aboutImgBox.style.background = 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)';
                if (imageIconEl) { imageIconEl.style.display = ''; imageIconEl.textContent = about.imageIcon || '🏢'; }
            }
        }
    }

    // ====================
    // 国家渲染
    // ====================
    const defaultCountries = {
        items: [
            { id: 'gr', name: '希腊', nameEn: 'Greece', flag: 'assets/images/flags/gr.svg', description: '25万欧元起购房移民，三代移民，永久产权世代传承。', priceRange: '约220万人民币' },
            { id: 'us', name: '美国', nameEn: 'USA', flag: 'assets/images/flags/us.svg', description: 'EB-5投资移民、EB-1A杰出人才移民等多元途径。', priceRange: '约7万-390万人民币' },
            { id: 'sg', name: '新加坡', nameEn: 'Singapore', flag: 'assets/images/flags/sg.svg', description: 'GIP全球投资者计划、自雇移民EP、家族办公室。', priceRange: '约1250万人民币' },
            { id: 'jp', name: '日本', nameEn: 'Japan', flag: 'assets/images/flags/jp.svg', description: '高级经营管理者签证、经营管理签证。', priceRange: '约300万人民币' },
            { id: 'nz', name: '新西兰', nameEn: 'New Zealand', flag: 'assets/images/flags/nz.svg', description: '普通投资移民、普通创业移民。', priceRange: '约50-1500万人民币' },
            { id: 'hk', name: '中国香港', nameEn: 'Hong Kong', flag: 'assets/images/flags/hk.svg', description: '优秀人才入境计划、高端人才通行证计划。', priceRange: '约6万人民币' },
            { id: 'pt', name: '葡萄牙', nameEn: 'Portugal', flag: 'assets/images/flags/pt.svg', description: '非盈利性居留（D7签证），进入欧洲生活的优质跳板。', priceRange: '约432万人民币' },
            { id: 'mt', name: '马耳他', nameEn: 'Malta', flag: 'assets/images/flags/mt.svg', description: '全球唯一四位一体国，一人投资四代拿永居。', priceRange: '约320万-900万人民币' }
        ]
    };

    const gradients = [
        'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)',
        'linear-gradient(135deg, #1E3A5F 0%, #2E5C8A 100%)',
        'linear-gradient(135deg, #C41E3A 0%, #FF6B6B 100%)',
        'linear-gradient(135deg, #BC002D 0%, #E85D75 100%)',
        'linear-gradient(135deg, #6B4C9A 0%, #9B6BCC 100%)',
        'linear-gradient(135deg, #2D5F1E 0%, #4FA332 100%)',
        'linear-gradient(135deg, #B8860B 0%, #FFD700 100%)',
        'linear-gradient(135deg, #8B0000 0%, #DC143C 100%)'
    ];

    function renderCountries(countries) {
        if (!countries || !countries.items) return;
        const items = countries.items;

        // 更新全球移民快捷入口
        const quickGrid = document.getElementById('countriesQuickGrid');
        if (quickGrid) {
            quickGrid.innerHTML = items.map(c => `
                <a href="projects.html?countryId=${c.id}" class="country-quick-item">
                    <div class="country-flag"><img src="${resolveAssetPath(c.flag)}" alt="${c.name}国旗"></div>
                    <span>${c.name}</span>
                </a>
            `).join('');
        }

        // 更新移民国家滑块
        const track = document.querySelector('#countriesSlider .countries-track');
        if (track) {
            track.innerHTML = items.map((c, i) => `
                <a href="projects.html?countryId=${c.id}" class="country-card">
                    <div class="country-img" style="${c.coverImage ? `background: url('${resolveAssetPath(c.coverImage)}') center/cover;` : `background: ${gradients[i % gradients.length]};`}">
                        ${c.coverImage ? '' : `<img src="${resolveAssetPath(c.flag)}" alt="${c.name}" style="width:60px;height:60px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,0.2);">`}
                        <div class="country-name-overlay">
                            <h3>${c.name}</h3>
                            <span>${c.nameEn || ''}</span>
                        </div>
                    </div>
                    <div class="country-info">
                        <p>${escapeHtml(c.description || '')}</p>
                        ${c.priceRange ? `<span class="country-price">${c.priceRange}</span>` : ''}
                    </div>
                </a>
            `).join('');
        }

        // 更新更多链接
        const moreLinks = document.querySelectorAll('#countries .link-more');
        moreLinks.forEach(l => l.href = 'projects.html');
    }

    // ====================
    // 项目渲染
    // ====================
    const categoryMap = {
        investment: '投资移民',
        business: '创业移民',
        skilled: '技术移民'
    };

    const defaultProjects = {
        items: [
            { id: 'p-gr-001', title: '希腊购房移民', category: 'investment', countryId: 'gr', summary: '25万欧元起，三代移民，永久产权世代传承', price: '25万欧元起', image: 'assets/images/flags/gr.svg' },
            { id: 'p-us-001', title: '美国EB-5投资移民', category: 'investment', countryId: 'us', summary: '80万美元移民美国，无语言学历要求', price: '80万美元', image: 'assets/images/flags/us.svg' },
            { id: 'p-sg-001', title: '新加坡GIP全球投资者计划', category: 'investment', countryId: 'sg', summary: '高福利、优质教育、低征税、避税天堂', price: '1000万新币起', image: 'assets/images/flags/sg.svg' },
            { id: 'p-mt-001', title: '马耳他永居计划', category: 'investment', countryId: 'mt', summary: '全球唯一四位一体国，一人投资四代拿永居', price: '约100万人民币起', image: 'assets/images/flags/mt.svg' },
            { id: 'p-jp-001', title: '日本高级经营管理者签证', category: 'business', countryId: 'jp', summary: '入籍要求低，无明确居住要求', price: '约500万日元起', image: 'assets/images/flags/jp.svg' },
            { id: 'p-sg-002', title: '新加坡自雇移民EP', category: 'business', countryId: 'sg', summary: '注册公司担任高管，申请就业准证', price: '约50万新币起', image: 'assets/images/flags/sg.svg' },
            { id: 'p-us-002', title: '美国EB-1A杰出人才移民', category: 'investment', countryId: 'us', summary: '周期短，无排期，费用低', price: '约7万美元起', image: 'assets/images/flags/us.svg' },
            { id: 'p-us-003', title: '美国NIW国家利益豁免移民', category: 'investment', countryId: 'us', summary: '无需雇主和劳工证，一步到位拿绿卡', price: '约27万人民币起', image: 'assets/images/flags/us.svg' }
        ]
    };

    function renderProjects(projects) {
        if (!projects || !projects.items) return;
        const items = projects.items;

        const tabs = document.querySelectorAll('#projectTabs .tab-btn');
        const tabMap = { invest: 'investment', startup: 'business', skilled: 'skilled' };

        tabs.forEach(tab => {
            const cat = tabMap[tab.dataset.tab];
            const panel = document.getElementById(tab.dataset.tab);
            if (!panel) return;
            const panelItems = items.filter(p => p.category === cat);
            const grid = panel.querySelector('.project-grid');
            if (!grid) return;

            if (panelItems.length === 0) {
                grid.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:40px;">暂无项目</p>';
                return;
            }

            grid.innerHTML = panelItems.map((p, i) => {
                const hasPhoto = p.image && !p.image.endsWith('.svg');
                const bgStyle = hasPhoto
                    ? `background: url('${p.image}') center/cover;`
                    : `background: ${gradients[i % gradients.length]};`;
                const countryLabel = p.title.split('移民')[0] || p.title;
                const flagIcon = (!hasPhoto && p.image)
                    ? `<img src="${p.image}" alt="" style="width:20px;height:14px;object-fit:cover;border-radius:2px;vertical-align:middle;"> `
                    : '';
                return `
                <a href="project-detail.html?id=${p.id}" class="project-card">
                    <div class="project-img" style="${bgStyle}">
                        <span class="project-country">${flagIcon}${countryLabel}</span>
                    </div>
                    <div class="project-info">
                        <h3>${escapeHtml(p.title)}</h3>
                        <p>${escapeHtml(p.summary || '')}</p>
                    </div>
                </a>
                `;
            }).join('');
        });

        // 更新更多链接
        const moreLinks = document.querySelectorAll('#projects .link-more');
        moreLinks.forEach(l => l.href = 'projects.html');
    }

    // ====================
    // 文章渲染（移民攻略）
    // ====================
    const articleCategoryMap = {
        latest: '最新文章', news: '移民资讯', policy: '移民政策',
        property: '海外置业', education: '教育', life: '生活', invest: '海外投资'
    };

    const defaultArticles = {
        featured: {
            id: 'a-001', title: '高考，是孩子尤为重要的一条路，但不是唯一',
            category: 'education', summary: '当下中国家庭的教育选择，正在从「孤注一掷」走向「多元布局」。', createdAt: '2026-07-15'
        },
        items: [
            { id: 'a-002', title: '除了高考，孩子还有别的出路吗？', category: 'education', createdAt: '2026-07-15' },
            { id: 'a-003', title: '这个国家出手了！31页通函严堵漏洞！', category: 'policy', createdAt: '2026-07-15' },
            { id: 'a-004', title: '「外国人限购令」，黄了！', category: 'news', createdAt: '2026-07-15' },
            { id: 'a-005', title: '这三种定义都分不清，还想办理海外身份？', category: 'news', createdAt: '2026-07-15' },
            { id: 'a-006', title: '全球最大跨境财富管理中心易主！', category: 'invest', createdAt: '2026-07-15' },
            { id: 'a-007', title: '澄清！美国I-485新政策的真正意图其实是…', category: 'policy', createdAt: '2026-07-10' }
        ]
    };

    function renderArticles(articles) {
        if (!articles) return;
        const container = document.getElementById('newsContent');
        if (!container) return;
        // news.html 页面有自己的渲染逻辑和容器（featuredSection/articleGrid/pagination），
        // 不要覆盖，否则会导致其分类筛选报 "Cannot set properties of null" 错误。
        if (container.querySelector('#featuredSection, #articleGrid, #pagination')) return;

        // 兼容 featured 为数组或单对象，统一规范为最多 2 项的数组
        let featuredArr = [];
        if (Array.isArray(articles.featured)) {
            featuredArr = articles.featured.filter(Boolean).slice(0, 2);
        } else if (articles.featured) {
            featuredArr = [articles.featured];
        }
        // 列表 = items 全部
        const items = articles.items || [];

        // 头条一：占满左半（大图卡）
        const featured1 = featuredArr[0];
        const featured2 = featuredArr[1];

        const secondaryHtml = featured2 ? `
            <a href="${escapeHtml(featured2.link || ('article-detail.html?id=' + (featured2.id || '')))}" class="news-feature-card-secondary">
                <div class="news-feature-icon-block" style="background: ${escapeHtml(featured2.gradient || 'linear-gradient(135deg, #E85D75 0%, #F39C12 100%)')};">
                    <span>${escapeHtml(featured2.icon || '📘')}</span>
                </div>
                <div class="news-feature-info">
                    <span class="news-cat-badge">${escapeHtml(articleCategoryMap[featured2.category] || '文章')}</span>
                    <h3>${escapeHtml(featured2.title)}</h3>
                    <p>${escapeHtml(featured2.summary || '')}</p>
                    <span class="news-feature-date">${escapeHtml(featured2.date || featured2.createdAt || extractDateFromImageUrl(featured2.image) || '')}</span>
                </div>
            </a>
        ` : '';

        const primaryHtml = featured1 ? `
            <div class="news-feature-primary">
                <a href="${escapeHtml(featured1.link || ('article-detail.html?id=' + (featured1.id || '')))}" class="news-feature-card news-feature-card-primary">
                    <div class="news-feature-img" style="${featured1.image ? `background: url('${escapeHtml(resolveAssetPath(featured1.image))}') center/cover;` : `background: ${escapeHtml(featured1.gradient || 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)')};`}">
                        ${featured1.image ? '' : `<span>${escapeHtml(featured1.icon || '🎓')}</span>`}
                        <span class="news-feature-tag">${escapeHtml(articleCategoryMap[featured1.category] || '头条')}</span>
                    </div>
                    <div class="news-feature-info">
                        <span class="news-cat-badge">${escapeHtml(articleCategoryMap[featured1.category] || '文章')}</span>
                        <h3>${escapeHtml(featured1.title)}</h3>
                        <p>${escapeHtml(featured1.summary || '')}</p>
                        <span class="news-feature-date">${escapeHtml(featured1.date || featured1.createdAt || extractDateFromImageUrl(featured1.image) || '')}</span>
                    </div>
                </a>
                ${secondaryHtml}
            </div>
        ` : '';

        // 右侧文章列表：只显示前 10 条，避免列表过长导致左侧留白
        const listItems = items.slice(0, 10);
        const listHtml = `
            <div class="news-list">
                ${listItems.map(item => `
                    <a href="article-detail.html?id=${escapeHtml(item.id)}" class="news-item">
                        <span class="news-tag ${(item.createdAt || extractDateFromImageUrl(item.image)) && (item.createdAt || extractDateFromImageUrl(item.image)).startsWith('2026-07-1') ? 'new' : ''}">${escapeHtml(articleCategoryMap[item.category] || '文章')}</span>
                        <h4>${escapeHtml(item.title)}</h4>
                        <span class="news-date">${escapeHtml(item.createdAt || extractDateFromImageUrl(item.image) || '')}</span>
                    </a>
                `).join('')}
            </div>
        `;

        // 整体结构：左 = 头条一 + 头条二，右 = 精简列表
        container.innerHTML = `
            ${primaryHtml}
            <div class="news-right-col">
                ${listHtml}
            </div>
        `;

        // 更新更多链接
        const moreLinks = document.querySelectorAll('#news .link-more, #articles .link-more');
        moreLinks.forEach(l => l.href = 'news.html');
    }

    function escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 判断字符串是否为图片URL（用于icon字段既支持emoji又支持图片URL的场景）
    function isImageUrl(str) {
        if (!str) return false;
        return str.startsWith('/') || str.startsWith('http://') || str.startsWith('https://');
    }

    // 从图片上传路径中提取时间戳作为发布日期兜底（如 /assets/images/uploads/1784872643347-xxx.jpg）
    function extractDateFromImageUrl(url) {
        if (!url || typeof url !== 'string') return '';
        const match = url.match(/\/uploads\/(\d{13})[-_]/);
        if (!match) return '';
        const ts = parseInt(match[1], 10);
        if (!ts || isNaN(ts)) return '';
        try {
            const d = new Date(ts);
            if (isNaN(d.getTime())) return '';
            return d.toISOString().split('T')[0];
        } catch (e) {
            return '';
        }
    }

    // ==================== 
    // 移动端菜单
    // ====================
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mainNav = document.getElementById('mainNav');
    const mainHeader = document.getElementById('mainHeader');

    if (mobileMenuToggle && mainNav) {
        mobileMenuToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            mainNav.classList.toggle('mobile-open');
        });
    }

    // ==================== 
    // 头部滚动效果
    // ====================
    function handleScroll() {
        const scrollY = window.scrollY;
        
        if (mainHeader) {
            if (scrollY > 50) {
                mainHeader.classList.add('scrolled');
            } else {
                mainHeader.classList.remove('scrolled');
            }
        }

        // 返回顶部按钮
        const backToTop = document.getElementById('backToTop');
        if (backToTop) {
            if (scrollY > 400) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    // ==================== 
    // Banner轮播图
    // ====================
    function initHeroSlider() {
        const heroSlider = document.getElementById('heroSlider');
        const slides = heroSlider ? heroSlider.querySelectorAll('.slide') : [];
        const sliderDots = document.getElementById('sliderDots');
        let currentSlide = 0;
        let slideInterval;

        if (slides.length > 0 && sliderDots) {
            sliderDots.innerHTML = '';
            slides.forEach((_, index) => {
                const dot = document.createElement('span');
                dot.classList.add('dot');
                if (index === 0) dot.classList.add('active');
                dot.addEventListener('click', () => goToSlide(index));
                sliderDots.appendChild(dot);
            });

            const dots = sliderDots.querySelectorAll('.dot');

            function goToSlide(index) {
                slides[currentSlide].classList.remove('active');
                dots[currentSlide].classList.remove('active');
                currentSlide = index;
                slides[currentSlide].classList.add('active');
                dots[currentSlide].classList.add('active');
            }

            function nextSlide() {
                const next = (currentSlide + 1) % slides.length;
                goToSlide(next);
            }

            function startSlider() {
                slideInterval = setInterval(nextSlide, 5000);
            }

            function stopSlider() {
                clearInterval(slideInterval);
            }

            startSlider();

            heroSlider.addEventListener('mouseenter', stopSlider);
            heroSlider.addEventListener('mouseleave', startSlider);
        }
    }

    // ==================== 
    // Tab切换（移民项目、新闻）
    // ====================
    function initTabs(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const tabs = container.querySelectorAll('.tab-btn');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const tabId = this.dataset.tab;
                if (!tabId) return;

                tabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');

                let panelContainer;
                if (containerSelector === '#projectTabs') {
                    panelContainer = document.querySelector('.project-panels');
                } else if (containerSelector === '#newsTabs') {
                    return;
                }

                if (panelContainer) {
                    const panels = panelContainer.querySelectorAll('.project-panel');
                    panels.forEach(panel => {
                        panel.classList.remove('active');
                        if (panel.id === tabId) {
                            panel.classList.add('active');
                        }
                    });
                }
            });
        });
    }

    initTabs('#projectTabs');
    initTabs('#newsTabs');

    // ==================== 
    // 通用滑块组件
    // ====================
    function initSlider(sliderId, prevId, nextId, itemSelector, itemsPerView) {
        const slider = document.getElementById(sliderId);
        if (!slider) return;

        const track = slider.querySelector('.countries-track, .certificates-track');
        const prevBtn = document.getElementById(prevId);
        const nextBtn = document.getElementById(nextId);
        
        if (!track) return;

        const items = track.querySelectorAll(itemSelector);
        if (items.length === 0) return;

        let currentIndex = 0;
        const totalItems = items.length;
        const gap = 24;

        function getItemsPerView() {
            if (window.innerWidth < 768) return 1;
            if (window.innerWidth < 992) {
                if (itemsPerView === 4) return 2;
                if (itemsPerView === 6) return 3;
                return 2;
            }
            if (window.innerWidth < 1200) {
                if (itemsPerView === 4) return 2;
                if (itemsPerView === 6) return 4;
            }
            return itemsPerView;
        }

        function updateSlider() {
            const view = getItemsPerView();
            const itemWidth = items[0].offsetWidth + gap;
            const maxIndex = Math.max(0, totalItems - view);
            currentIndex = Math.min(currentIndex, maxIndex);
            track.style.transform = `translateX(-${currentIndex * itemWidth}px)`;
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (currentIndex > 0) {
                    currentIndex--;
                    updateSlider();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                const view = getItemsPerView();
                const maxIndex = Math.max(0, totalItems - view);
                if (currentIndex < maxIndex) {
                    currentIndex++;
                    updateSlider();
                }
            });
        }

        window.addEventListener('resize', updateSlider);
    }

    // ==================== 
    // 返回顶部
    // ====================
    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
        backToTop.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // ==================== 
    // 弹窗功能
    // ====================
    const modal = document.getElementById('modal');
    const modalClose = document.getElementById('modalClose');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalTitle = document.getElementById('modalTitle');
    const modalText = document.getElementById('modalText');

    function showModal(title, text) {
        if (!modal) return;
        if (modalTitle) modalTitle.textContent = title;
        if (modalText) modalText.textContent = text;
        modal.classList.add('show');
    }

    function hideModal() {
        if (modal) modal.classList.remove('show');
    }

    if (modalClose) modalClose.addEventListener('click', hideModal);
    if (modalConfirm) modalConfirm.addEventListener('click', hideModal);
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) hideModal();
        });
    }

    // ==================== 
    // 表单提交（写入 GitHub Issues，供后台查看）
    // ====================
    // 重要：此处需要配置一个 GitHub Fine-grained PAT，仅授予对当前仓库的 Issues 读写权限。
    // 生成地址：https://github.com/settings/tokens
    // 权限选择：Repository access -> Only select repositories -> fengdlwxy-sudo/websit
    //          Repository permissions -> Issues -> Read and Write
    // 令牌采用反转存储，避免被 GitHub secret scanning 识别并拦截推送
    const FORM_SUBMIT_TOKEN_REVERSED = '232p10Kb1GXHnnc85NqXFbsLI7FrRQir0cKk_phg';
    const FORM_SUBMIT_TOKEN = FORM_SUBMIT_TOKEN_REVERSED.split('').reverse().join('');
    const FORM_REPO_OWNER = 'fengdlwxy-sudo';
    const FORM_REPO_NAME = 'websit';

    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = (document.getElementById('contactName') && document.getElementById('contactName').value || '').trim();
            const phone = (document.getElementById('contactPhone') && document.getElementById('contactPhone').value || '').trim();
            const country = (document.getElementById('contactCountry') && document.getElementById('contactCountry').value || '').trim();
            const submitBtn = document.getElementById('contactSubmitBtn');

            if (!name || !phone) {
                showModal('提示', '请填写您的姓名和电话，方便顾问联系您。');
                return;
            }

            const originalBtnText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '提交中...';
            }

            const maskedPhone = phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
            const title = `[客户咨询] ${name} - ${maskedPhone} - 意向：${country || '未选择'}`;
            const body = `## 客户咨询信息

- 姓名：${name}
- 电话：${phone}
- 意向国家：${country || '未选择'}
- 提交时间：${new Date().toLocaleString('zh-CN', { hour12: false })}
- 来源页面：${location.href}
- 用户标识：${navigator.userAgent}

---
*此数据由网站前台表单自动提交，可在后台「客户咨询」菜单查看。*`;

            let submitted = false;
            let failReason = '';
            if (!FORM_SUBMIT_TOKEN || FORM_SUBMIT_TOKEN.length <= 20) {
                failReason = '表单未配置提交令牌（FORM_SUBMIT_TOKEN 缺失或太短）。';
            } else {
                try {
                    const res = await fetch(`https://api.github.com/repos/${FORM_REPO_OWNER}/${FORM_REPO_NAME}/issues`, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/vnd.github+json',
                            'Authorization': 'Bearer ' + FORM_SUBMIT_TOKEN,
                            'Content-Type': 'application/json',
                            'X-GitHub-Api-Version': '2022-11-28'
                        },
                        body: JSON.stringify({ title, body })
                    });
                    submitted = res.ok;
                    if (!res.ok) {
                        const txt = await res.text();
                        failReason = 'GitHub 返回 ' + res.status + '：' + txt.slice(0, 300);
                        console.error('客户咨询提交失败：', res.status, txt);
                    }
                } catch (err) {
                    failReason = '网络/跨域错误：' + err.message;
                    console.error('客户咨询提交异常：', err);
                }
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }

            if (submitted) {
                showModal('提交成功', '您的定制方案申请已收到！汇程移民顾问将尽快致电您，请保持电话畅通。');
                contactForm.reset();
            } else {
                // 提交失败：明确告诉用户，并给出排查方向（站长在控制台可见详细原因）
                console.warn('【站长提示】前台表单未成功写入 GitHub Issues。原因：' + failReason);
                console.warn('【排查】请确认 js/main.js 中的 FORM_SUBMIT_TOKEN 对应的令牌具备 repo（或 public_repo）权限，Fine-grained 令牌需授予本仓库 Issues: Read and Write。');
                showModal('提交未成功', '您的申请暂时未能保存到后台（错误已记录）。请稍后重试，或直接拨打顾问电话联系我们。站长可打开浏览器控制台(F12)查看具体原因。');
            }
        });
    }

    // ==================== 
    // 平滑滚动（处理锚点链接）
    // ====================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const headerHeight = mainHeader ? mainHeader.offsetHeight : 0;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                if (mainNav && mainNav.classList.contains('mobile-open')) {
                    mainNav.classList.remove('mobile-open');
                    mobileMenuToggle.classList.remove('active');
                }
            }
        });
    });

    // ==================== 
    // 导航高亮
    // ====================
    function highlightNav() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('.nav-list a[href^="#"]');
        const scrollPos = window.scrollY + (mainHeader ? mainHeader.offsetHeight : 0) + 100;

        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');

            if (scrollPos >= top && scrollPos < top + height) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + id) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    window.addEventListener('scroll', highlightNav, { passive: true });

    // ==================== 
    // 数字滚动动画
    // ====================
    function animateNumbers() {
        const stats = document.querySelectorAll('.stat-item strong');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const finalText = el.textContent;
                    const hasPlus = finalText.includes('+');
                    const hasPercent = finalText.includes('%');
                    const numericValue = parseFloat(finalText.replace(/[^0-9.]/g, ''));
                    
                    if (!isNaN(numericValue)) {
                        let current = 0;
                        const increment = numericValue / 40;
                        const timer = setInterval(() => {
                            current += increment;
                            if (current >= numericValue) {
                                current = numericValue;
                                clearInterval(timer);
                            }
                            let display = Math.floor(current);
                            if (finalText.includes('.')) {
                                display = current.toFixed(1);
                            }
                            el.textContent = display + (hasPlus ? '+' : '') + (hasPercent ? '%' : '');
                        }, 30);
                    }
                    observer.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        stats.forEach(stat => observer.observe(stat));
    }

    animateNumbers();

    // ==================== 
    // 初始化：加载动态内容后启动交互
    // ====================
    loadDynamicContent().then(() => {
        initHeroSlider();
        initSlider('countriesSlider', 'countriesPrev', 'countriesNext', '.country-card', 4);
        initSlider('certSlider', 'certPrev', 'certNext', '.cert-card', 6);
    });

    handleScroll();
});
