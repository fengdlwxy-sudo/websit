/**
 * 汇程移民 - GitHub Pages 版后台数据层
 * 用 GitHub REST API 直接读写仓库里的 data/*.json 与图片，无需自建 Node 服务。
 * 本文件在 admin.js 之前加载，提供全局函数：githubApiRequest / ghUploadImageBlob / ghConfig / loadGhConfig / saveGhConfig / ghVerifyToken
 */

const GH_API = 'https://api.github.com';

// 内容类型 -> 数据文件 映射（与 server.js 的 dataFiles 保持一致）
const DATA_FILES = {
    config: 'config.json',
    news: 'news.json',
    cases: 'cases.json',
    certificates: 'certificates.json',
    countries: 'countries.json',
    projects: 'projects.json',
    articles: 'articles.json',
    categories: 'categories.json',
    users: 'users.json'
};

const DATA_DEFAULTS = {
    config: {},
    news: { featured: null, items: [] },
    cases: { items: [] },
    certificates: { items: [] },
    countries: { items: [] },
    projects: { items: [] },
    articles: { featured: null, items: [] },
    categories: { projectCategories: [], articleCategories: [] },
    users: { items: [] }
};

// 仓库配置（默认指向 www 站仓库；用户可在登录页修改）
const GH_CONFIG_KEY = 'ghConfig';
let ghConfig = loadGhConfig();

function loadGhConfig() {
    try {
        const raw = localStorage.getItem(GH_CONFIG_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
        token: '',
        owner: 'fengdlwxy-sudo',
        repo: 'websit',
        branch: 'main'
    };
}

function saveGhConfig(cfg) {
    ghConfig = Object.assign({}, ghConfig, cfg);
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(ghConfig));
    return ghConfig;
}

// UTF-8 安全的 base64 编解码（GitHub 接口要求 base64 的 UTF-8 字节）
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
}

function base64ToUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// 生成与 server.js 风格一致的 ID
function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

// 底层 GitHub 请求
async function ghRaw(method, path, body, isBase64Body) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + ghConfig.token,
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (body && !isBase64Body) headers['Content-Type'] = 'application/json';
    const res = await fetch(GH_API + path, {
        method,
        headers,
        body: body ? (isBase64Body ? body : JSON.stringify(body)) : undefined
    });
    return res;
}

// 校验令牌是否有效（调用 GET /user）
async function ghVerifyToken(token) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28'
    };
    const res = await fetch(GH_API + '/user', { method: 'GET', headers });
    if (!res.ok) {
        const err = new Error(res.status === 401 ? '令牌无效或无权限' : ('GitHub 返回 ' + res.status));
        err.status = res.status;
        throw err;
    }
    return res.json();
}

// 读取某个数据文件，不存在则返回默认值
async function ghReadData(key) {
    const file = DATA_FILES[key];
    const path = `/repos/${ghConfig.owner}/${ghConfig.repo}/contents/data/${file}?ref=${encodeURIComponent(ghConfig.branch)}`;
    const res = await ghRaw('GET', path);
    if (res.status === 404) return JSON.parse(JSON.stringify(DATA_DEFAULTS[key]));
    if (!res.ok) throw new Error('读取 ' + file + ' 失败：GitHub ' + res.status);
    const json = await res.json();
    try {
        return JSON.parse(base64ToUtf8(json.content));
    } catch (e) {
        return JSON.parse(JSON.stringify(DATA_DEFAULTS[key]));
    }
}

// 写入某个数据文件（自动处理 sha，遇 409 冲突最多重试 3 次）
async function ghWriteData(key, data, message, attempt = 0) {
    const file = DATA_FILES[key];
    const path = `/repos/${ghConfig.owner}/${ghConfig.repo}/contents/data/${file}`;
    // 先取 sha，加 cache buster 避免 GitHub 返回缓存的旧 sha
    const getRes = await ghRaw('GET', path + '?ref=' + encodeURIComponent(ghConfig.branch) + '&_cb=' + Date.now());
    let sha = null;
    if (getRes.status !== 404) {
        if (!getRes.ok) {
            const t = await getRes.text();
            throw new Error('读取 ' + file + ' 版本失败：GitHub ' + getRes.status + ' ' + t.slice(0, 120));
        }
        const j = await getRes.json();
        sha = j.sha;
    }
    const body = {
        message: message || ('update ' + file),
        content: utf8ToBase64(JSON.stringify(data, null, 2)),
        branch: ghConfig.branch
    };
    if (sha) body.sha = sha;
    const putRes = await ghRaw('PUT', path, body);
    if (putRes.status === 409 && attempt < 3) {
        // 并发冲突：指数退避后重新读取 sha 再写
        const delay = 800 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        return ghWriteData(key, data, message, attempt + 1);
    }
    if (!putRes.ok) {
        const t = await putRes.text();
        throw new Error('写入 ' + file + ' 失败：GitHub ' + putRes.status + ' ' + t.slice(0, 120));
    }
    return putRes.json();
}

// 解析 GitHub Issue 为客户咨询对象
function parseLeadIssue(issue) {
    const title = issue.title || '';
    const body = issue.body || '';
    const bodyName = body.match(/-\s*姓名[：:]\s*(.+)/);
    const bodyPhone = body.match(/-\s*电话[：:]\s*(.+)/);
    const bodyCountry = body.match(/-\s*意向国家[：:]\s*(.+)/);
    const bodyTime = body.match(/-\s*提交时间[：:]\s*(.+)/);
    // 标题格式：[客户咨询] 姓名 - 电话 - 意向：国家
    const titleParts = title.replace(/^\[客户咨询\]\s*/, '').split(/\s+-\s+/);
    return {
        id: issue.number,
        title: title,
        name: (bodyName ? bodyName[1].trim() : (titleParts[0] ? titleParts[0].trim() : '')),
        phone: (bodyPhone ? bodyPhone[1].trim() : (titleParts[1] ? titleParts[1].trim() : '')),
        country: (bodyCountry ? bodyCountry[1].trim() : (titleParts[2] ? titleParts[2].replace(/^意向[：:]\s*/, '').trim() : '')),
        createdAt: (bodyTime ? bodyTime[1].trim() : issue.created_at),
        status: issue.state === 'open' ? 'pending' : 'done',
        body: body,
        url: issue.html_url
    };
}

// ==================== 集合类通用增删改 ====================
async function collectionOp(key, method, id, bodyObj) {
    const data = await ghReadData(key);
    const items = Array.isArray(data.items) ? data.items : [];

    if (method === 'POST') {
        const today = new Date().toISOString().split('T')[0];
        const item = Object.assign({ id: generateId(), createdAt: today }, bodyObj);
        items.unshift(item);
        data.items = items;
        await ghWriteData(key, data, 'add ' + key + ' via admin');
        return { success: true, data: item };
    }
    if (method === 'PUT') {
        const idx = items.findIndex(it => it.id === id);
        if (idx === -1) throw new Error('记录不存在');
        const merged = Object.assign({}, items[idx], bodyObj, { id });
        // 兜底：记录没有创建日期时自动补今天，避免前台列表日期空白
        if (!merged.createdAt && !merged.date) {
            merged.createdAt = new Date().toISOString().split('T')[0];
        }
        items[idx] = merged;
        data.items = items;
        await ghWriteData(key, data, 'update ' + key + ' via admin');
        return { success: true, data: items[idx] };
    }
    if (method === 'DELETE') {
        const remaining = items.filter(it => it.id !== id);
        if (remaining.length === 0) throw new Error('至少保留一条记录');
        data.items = remaining;
        await ghWriteData(key, data, 'delete ' + key + ' via admin');
        return { success: true };
    }
    throw new Error('不支持的方法 ' + method);
}

// ==================== 对外统一入口：模拟 server.js 的 /api/* ====================
async function githubApiRequest(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    let body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;

    // 登录：校验令牌
    if (url === '/login' && method === 'POST') {
        await ghVerifyToken(ghConfig.token);
        return { success: true, token: ghConfig.token };
    }

    // 登出：本地清除即可（GitHub 无会话）
    if (url === '/logout' && method === 'POST') {
        return { success: true };
    }

    // 鉴权检查
    if (url === '/auth-check' && method === 'GET') {
        try {
            await ghVerifyToken(ghConfig.token);
            return { authenticated: true };
        } catch (e) {
            return { authenticated: false };
        }
    }

    // 聚合内容（对应 server.js /api/content，前端 loadAllData 使用）
    if (url === '/content' && method === 'GET') {
        const [config, news, cases, certificates, countries, projects, articles, categories] = await Promise.all([
            ghReadData('config'), ghReadData('news'), ghReadData('cases'),
            ghReadData('certificates'), ghReadData('countries'), ghReadData('projects'),
            ghReadData('articles'), ghReadData('categories')
        ]);
        return { config, news, cases, certificates, countries, projects, articles, categories };
    }

    // 配置读写
    if (url === '/config') {
        if (method === 'GET') return await ghReadData('config');
        if (method === 'PUT') { await ghWriteData('config', body, 'update config via admin'); return { success: true }; }
    }

    // 分类
    if (url === '/categories' && method === 'PUT') {
        await ghWriteData('categories', body, 'update categories via admin');
        return { success: true };
    }

    // 用户管理
    if (url === '/users') {
        if (method === 'GET') {
            const data = await ghReadData('users');
            const items = (data.items || []).map(u => ({
                id: u.id, username: u.username, role: u.role || 'admin', createdAt: u.createdAt || ''
            }));
            return { success: true, data: items };
        }
        if (method === 'POST') {
            const { username, password, role = 'admin' } = body;
            if (!username || !password) throw new Error('账号和密码不能为空');
            const data = await ghReadData('users');
            const items = data.items || [];
            if (items.some(u => u.username === username)) throw new Error('该账号已存在');
            const newUser = { id: generateId(), username, password, role, createdAt: new Date().toISOString().split('T')[0] };
            items.unshift(newUser);
            data.items = items;
            await ghWriteData('users', data, 'add user via admin');
            return { success: true, data: { id: newUser.id, username, role, createdAt: newUser.createdAt } };
        }
    }
    if (url.startsWith('/users/') && method === 'PUT') {
        const id = url.split('/')[2];
        const { username, password, role = 'admin' } = body;
        if (!username) throw new Error('账号不能为空');
        const data = await ghReadData('users');
        const items = data.items || [];
        const idx = items.findIndex(u => u.id === id);
        if (idx === -1) throw new Error('用户不存在');
        const dup = items.find((u, i) => i !== idx && u.username === username);
        if (dup) throw new Error('该账号已存在');
        items[idx] = Object.assign({}, items[idx], { username, role }, password ? { password } : {});
        data.items = items;
        await ghWriteData('users', data, 'update user via admin');
        return { success: true, data: { id: items[idx].id, username, role, createdAt: items[idx].createdAt } };
    }
    if (url.startsWith('/users/') && method === 'DELETE') {
        const id = url.split('/')[2];
        const data = await ghReadData('users');
        let items = data.items || [];
        const idx = items.findIndex(u => u.id === id);
        if (idx === -1) throw new Error('用户不存在');
        const remaining = items.filter((_, i) => i !== idx);
        if (remaining.length === 0) throw new Error('至少保留一个管理员账号');
        data.items = remaining;
        await ghWriteData('users', data, 'delete user via admin');
        return { success: true };
    }

    // 图片列表
    if (url === '/images' && method === 'GET') {
        const path = `/repos/${ghConfig.owner}/${ghConfig.repo}/contents/assets/images/uploads?ref=${encodeURIComponent(ghConfig.branch)}`;
        const res = await ghRaw('GET', path);
        if (res.status === 404) return { success: true, data: [] };
        if (!res.ok) throw new Error('读取图片列表失败：GitHub ' + res.status);
        const arr = await res.json();
        const files = Array.isArray(arr) ? arr : [];
        return {
            success: true,
            data: files
                .filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name))
                .map(f => ({ name: f.name, url: '/assets/images/uploads/' + f.name, size: f.size }))
        };
    }

    // 图片删除
    if (url.startsWith('/images/') && method === 'DELETE') {
        const name = decodeURIComponent(url.split('/')[2]);
        const path = `/repos/${ghConfig.owner}/${ghConfig.repo}/contents/assets/images/uploads/${encodeURIComponent(name)}`;
        const getRes = await ghRaw('GET', path + '?ref=' + encodeURIComponent(ghConfig.branch));
        if (getRes.status === 404) return { success: true };
        const j = await getRes.json();
        const delRes = await ghRaw('DELETE', path, {
            message: 'delete image ' + name + ' via admin',
            sha: j.sha,
            branch: ghConfig.branch
        });
        if (!delRes.ok) throw new Error('删除图片失败：GitHub ' + delRes.status);
        return { success: true };
    }

    // 客户咨询（使用 GitHub Issues 存储）
    if (url === '/leads' && method === 'GET') {
        const q = encodeURIComponent('repo:' + ghConfig.owner + '/' + ghConfig.repo + ' "[客户咨询]" in:title');
        const res = await ghRaw('GET', '/search/issues?q=' + q + '&sort=created&order=desc&per_page=100');
        if (!res.ok) throw new Error('读取客户咨询失败：GitHub ' + res.status);
        const data = await res.json();
        return { success: true, data: (data.items || []).map(parseLeadIssue) };
    }
    if (url.startsWith('/leads/') && method === 'GET') {
        const id = url.split('/')[2];
        const res = await ghRaw('GET', '/repos/' + ghConfig.owner + '/' + ghConfig.repo + '/issues/' + encodeURIComponent(id));
        if (!res.ok) throw new Error('读取客户咨询详情失败：GitHub ' + res.status);
        return { success: true, data: parseLeadIssue(await res.json()) };
    }
    if (url.startsWith('/leads/') && method === 'PUT') {
        const id = url.split('/')[2];
        const payload = {};
        if (body && body.status === 'done') payload.state = 'closed';
        else if (body && body.status === 'pending') payload.state = 'open';
        if (body && typeof body.note === 'string' && body.note.trim()) {
            // 追加备注到 body
            const getRes = await ghRaw('GET', '/repos/' + ghConfig.owner + '/' + ghConfig.repo + '/issues/' + encodeURIComponent(id));
            if (!getRes.ok) throw new Error('读取客户咨询失败：GitHub ' + getRes.status);
            const issue = await getRes.json();
            const now = new Date().toLocaleString('zh-CN', { hour12: false });
            payload.body = (issue.body || '') + '\n\n---\n**后台备注** (' + now + ')：' + body.note.trim();
        }
        const res = await ghRaw('POST', '/repos/' + ghConfig.owner + '/' + ghConfig.repo + '/issues/' + encodeURIComponent(id), payload);
        if (!res.ok) throw new Error('更新客户咨询失败：GitHub ' + res.status);
        return { success: true, data: parseLeadIssue(await res.json()) };
    }

    // 文章头条（featured）
    if (url === '/articles/featured' && method === 'PUT') {
        const data = await ghReadData('articles');
        let next;
        if (Array.isArray(body)) next = body;
        else if (body && Array.isArray(body.featured)) next = body.featured;
        else if (body && typeof body === 'object' && body.id) next = [body];
        else next = [];
        next = next.slice(0, 2);
        const original = Array.isArray(data.featured) ? data.featured : (data.featured ? [data.featured] : []);
        data.featured = next.map((item, idx) => Object.assign({}, original[idx] || {}, item, { isFeatured: true }));
        // 若前端一并传回完整 items（如批量更新 isFeatured），避免二次写文件导致 409
        if (body && Array.isArray(body.items)) {
            data.items = body.items;
        }
        await ghWriteData('articles', data, 'update articles featured via admin');
        return { success: true, data: data.featured };
    }

    // 集合路由：/news /cases /certificates /countries /projects /articles
    const collMap = {
        '/news': 'news', '/cases': 'cases', '/certificates': 'certificates',
        '/countries': 'countries', '/projects': 'projects', '/articles': 'articles'
    };
    if (collMap[url] && (method === 'POST' || method === 'GET')) {
        if (method === 'GET') {
            const data = await ghReadData(collMap[url]);
            // 后台需要看到全部（含未发布），便于编辑
            if (collMap[url] === 'articles') return { success: true, data: { featured: data.featured || null, items: data.items || [] } };
            return { success: true, data: data.items || [] };
        }
        return collectionOp(collMap[url], 'POST', null, body);
    }
    if (url.startsWith('/news/') || url.startsWith('/cases/') || url.startsWith('/certificates/') ||
        url.startsWith('/countries/') || url.startsWith('/projects/') || url.startsWith('/articles/')) {
        const seg = url.split('/'); // ['', 'news', ':id']
        const key = collMap['/' + seg[1]];
        const id = seg[2];
        if (!key) throw new Error('未知接口 ' + url);
        return collectionOp(key, method, id, body);
    }

    throw new Error('未实现的接口：' + method + ' ' + url);
}

// 上传图片：把图片以 base64 写入仓库 assets/images/uploads/，再返回可访问 URL
async function ghUploadImageBlob(blob, originalName, format) {
    let ext = '.jpg';
    if (format === 'image/png') ext = '.png';
    if (format === 'image/webp') ext = '.webp';
    const filename = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(',')[1];

    const path = `/repos/${ghConfig.owner}/${ghConfig.repo}/contents/assets/images/uploads/${encodeURIComponent(filename)}`;
    const body = {
        message: 'upload image ' + filename + ' via admin',
        content: base64,
        branch: ghConfig.branch
    };
    const res = await ghRaw('PUT', path, body);
    if (!res.ok) {
        const t = await res.text();
        throw new Error('图片上传失败：GitHub ' + res.status + ' ' + t.slice(0, 120));
    }
    return { success: true, data: { name: filename, url: '/assets/images/uploads/' + filename } };
}

// 导出到全局，供 admin.js 使用
window.GitHubBackend = {
    githubApiRequest,
    ghUploadImageBlob,
    ghVerifyToken,
    loadGhConfig,
    saveGhConfig,
    get config() { return ghConfig; }
};
