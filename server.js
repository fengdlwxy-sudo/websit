/**
 * 汇程移民 - 网站后台管理系统
 * Node.js + Express + JSON 文件存储
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'assets', 'images', 'uploads');

// 默认管理员账号密码（可通过环境变量覆盖，生产环境建议用环境变量）
const ADMIN_USERNAME = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'Admin6363';

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 初始化数据文件
const dataFiles = {
    config: { file: 'config.json', default: {} },
    news: { file: 'news.json', default: { featured: null, items: [] } },
    cases: { file: 'cases.json', default: { items: [] } },
    certificates: { file: 'certificates.json', default: { items: [] } },
    countries: { file: 'countries.json', default: { items: [] } },
    projects: { file: 'projects.json', default: { items: [] } },
    articles: { file: 'articles.json', default: { featured: null, items: [] } },
    categories: { file: 'categories.json', default: { projectCategories: [], articleCategories: [] } },
    users: { file: 'users.json', default: { items: [] } }
};

Object.keys(dataFiles).forEach(key => {
    const filePath = path.join(DATA_DIR, dataFiles[key].file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(dataFiles[key].default, null, 2), 'utf8');
    }
});

// 确保默认管理员账户存在（首次启动或用户被清空时自动创建）
function ensureDefaultAdmin() {
    const usersData = readData('users');
    const items = usersData.items || [];
    const exists = items.some(u => u.username === ADMIN_USERNAME);
    if (!exists) {
        items.push({
            id: generateId(),
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD,
            role: 'admin',
            createdAt: new Date().toISOString().split('T')[0]
        });
        writeData('users', { items });
    }
}
ensureDefaultAdmin();

// 内存会话存储
const sessions = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.adminToken;
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ success: false, message: '请先登录' });
    }
    next();
}

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件（HTML 文件禁止浏览器缓存，避免用户看到旧版导航/内容）
const staticOptions = {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
};
app.use(express.static(__dirname, staticOptions));
app.use('/admin', express.static(path.join(__dirname, 'admin'), staticOptions));

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + ext;
        cb(null, name);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件'));
        }
    }
});

// 工具函数
function readData(key) {
    const filePath = path.join(DATA_DIR, dataFiles[key].file);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeData(key, data) {
    const filePath = path.join(DATA_DIR, dataFiles[key].file);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

// ==================== 
// 认证接口
// ====================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // 兼容环境变量中配置的 bootstrap 账号
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = generateToken();
        sessions.set(token, { username, loginAt: new Date().toISOString() });
        return res.json({ success: true, token });
    }
    // 从 users.json 校验
    try {
        const usersData = readData('users');
        const user = (usersData.items || []).find(u => u.username === username && u.password === password);
        if (user) {
            const token = generateToken();
            sessions.set(token, { username, loginAt: new Date().toISOString() });
            return res.json({ success: true, token });
        }
    } catch (error) {
        console.error('登录校验失败:', error);
    }
    res.status(401).json({ success: false, message: '账号或密码错误' });
});

app.post('/api/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    sessions.delete(token);
    res.json({ success: true });
});

app.get('/api/auth-check', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    res.json({ authenticated: !!token && sessions.has(token) });
});

// ==================== 
// 用户管理
// ====================
app.get('/api/users', requireAuth, (req, res) => {
    try {
        const usersData = readData('users');
        const items = (usersData.items || []).map(u => ({
            id: u.id,
            username: u.username,
            role: u.role || 'admin',
            createdAt: u.createdAt || ''
        }));
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/users', requireAuth, (req, res) => {
    try {
        const { username, password, role = 'admin' } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '账号和密码不能为空' });
        }
        const usersData = readData('users');
        const items = usersData.items || [];
        if (items.some(u => u.username === username)) {
            return res.status(409).json({ success: false, message: '该账号已存在' });
        }
        const newUser = {
            id: generateId(),
            username,
            password,
            role,
            createdAt: new Date().toISOString().split('T')[0]
        };
        items.unshift(newUser);
        writeData('users', { items });
        res.json({ success: true, data: { id: newUser.id, username, role, createdAt: newUser.createdAt } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/users/:id', requireAuth, (req, res) => {
    try {
        const { username, password, role = 'admin' } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, message: '账号不能为空' });
        }
        const usersData = readData('users');
        const items = usersData.items || [];
        const index = items.findIndex(u => u.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        const duplicate = items.find((u, idx) => idx !== index && u.username === username);
        if (duplicate) {
            return res.status(409).json({ success: false, message: '该账号已存在' });
        }
        items[index] = {
            ...items[index],
            username,
            role,
            ...(password ? { password } : {})
        };
        writeData('users', { items });
        res.json({ success: true, data: { id: items[index].id, username, role, createdAt: items[index].createdAt } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
    try {
        const usersData = readData('users');
        let items = usersData.items || [];
        const index = items.findIndex(u => u.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        const remaining = items.filter((_, idx) => idx !== index);
        if (remaining.length === 0) {
            return res.status(400).json({ success: false, message: '至少保留一个管理员账号' });
        }
        writeData('users', { items: remaining });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 内容聚合接口
// ====================
app.get('/api/content', (req, res) => {
    try {
        res.json({
            config: readData('config'),
            news: readData('news'),
            cases: readData('cases'),
            certificates: readData('certificates'),
            countries: readData('countries'),
            projects: readData('projects'),
            articles: readData('articles'),
            categories: readData('categories')
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 配置管理
// ====================
app.get('/api/config', (req, res) => {
    res.json(readData('config'));
});

app.put('/api/config', requireAuth, (req, res) => {
    try {
        writeData('config', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 新闻管理
// ====================
app.get('/api/news', (req, res) => {
    res.json(readData('news'));
});

app.post('/api/news', requireAuth, (req, res) => {
    try {
        const data = readData('news');
        const item = { id: generateId(), ...req.body };
        data.items.unshift(item);
        writeData('news', data);
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/news/featured', requireAuth, (req, res) => {
    try {
        const data = readData('news');
        data.featured = { ...req.body };
        writeData('news', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/news/:id', requireAuth, (req, res) => {
    try {
        const data = readData('news');
        const index = data.items.findIndex(item => item.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, message: '新闻不存在' });

        data.items[index] = { ...data.items[index], ...req.body, id: req.params.id };
        writeData('news', data);
        res.json({ success: true, data: data.items[index] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/news/:id', requireAuth, (req, res) => {
    try {
        const data = readData('news');
        data.items = data.items.filter(item => item.id !== req.params.id);
        writeData('news', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 案例管理
// ====================
app.get('/api/cases', (req, res) => {
    res.json(readData('cases'));
});

app.get('/api/cases/:id', (req, res) => {
    try {
        const data = readData('cases');
        const item = data.items.find(item => item.id === req.params.id);
        if (!item) return res.status(404).json({ success: false, message: '案例不存在' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/cases', requireAuth, (req, res) => {
    try {
        const data = readData('cases');
        const item = { id: generateId(), ...req.body };
        data.items.unshift(item);
        writeData('cases', data);
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/cases/:id', requireAuth, (req, res) => {
    try {
        const data = readData('cases');
        const index = data.items.findIndex(item => item.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, message: '案例不存在' });
        
        data.items[index] = { ...data.items[index], ...req.body, id: req.params.id };
        writeData('cases', data);
        res.json({ success: true, data: data.items[index] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/cases/:id', requireAuth, (req, res) => {
    try {
        const data = readData('cases');
        data.items = data.items.filter(item => item.id !== req.params.id);
        writeData('cases', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 荣誉证书管理
// ====================
app.get('/api/certificates', (req, res) => {
    res.json(readData('certificates'));
});

app.post('/api/certificates', requireAuth, (req, res) => {
    try {
        const data = readData('certificates');
        const item = { id: generateId(), ...req.body };
        data.items.push(item);
        writeData('certificates', data);
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/certificates/:id', requireAuth, (req, res) => {
    try {
        const data = readData('certificates');
        const index = data.items.findIndex(item => item.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, message: '证书不存在' });
        
        data.items[index] = { ...data.items[index], ...req.body, id: req.params.id };
        writeData('certificates', data);
        res.json({ success: true, data: data.items[index] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/certificates/:id', requireAuth, (req, res) => {
    try {
        const data = readData('certificates');
        data.items = data.items.filter(item => item.id !== req.params.id);
        writeData('certificates', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 国家/地区管理
// ====================
app.get('/api/countries', (req, res) => {
    try {
        const data = readData('countries');
        const items = data.items.filter(item => item.status === 'published');
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/countries/:id', (req, res) => {
    try {
        const data = readData('countries');
        const item = data.items.find(item => item.id === req.params.id);
        if (!item) return res.status(404).json({ success: false, message: '国家不存在' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/countries', requireAuth, (req, res) => {
    try {
        const data = readData('countries');
        const item = { id: generateId(), ...req.body, status: req.body.status || 'published' };
        data.items.unshift(item);
        writeData('countries', data);
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/countries/:id', requireAuth, (req, res) => {
    try {
        const data = readData('countries');
        const index = data.items.findIndex(item => item.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, message: '国家不存在' });
        data.items[index] = { ...data.items[index], ...req.body, id: req.params.id };
        writeData('countries', data);
        res.json({ success: true, data: data.items[index] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/countries/:id', requireAuth, (req, res) => {
    try {
        const data = readData('countries');
        data.items = data.items.filter(item => item.id !== req.params.id);
        writeData('countries', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 项目管理
// ====================
app.get('/api/projects', (req, res) => {
    try {
        const data = readData('projects');
        let items = data.items.filter(item => item.status === 'published');
        if (req.query.countryId) {
            items = items.filter(item => item.countryId === req.query.countryId);
        }
        if (req.query.category) {
            items = items.filter(item => item.category === req.query.category);
        }
        items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        res.json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/projects/:id', (req, res) => {
    try {
        const data = readData('projects');
        const item = data.items.find(item => item.id === req.params.id);
        if (!item) return res.status(404).json({ success: false, message: '项目不存在' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/projects', requireAuth, (req, res) => {
    try {
        const data = readData('projects');
        const item = { id: generateId(), ...req.body, status: req.body.status || 'published', createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0] };
        data.items.unshift(item);
        writeData('projects', data);
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
    try {
        const data = readData('projects');
        const index = data.items.findIndex(item => item.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, message: '项目不存在' });
        data.items[index] = { ...data.items[index], ...req.body, id: req.params.id, updatedAt: new Date().toISOString().split('T')[0] };
        writeData('projects', data);
        res.json({ success: true, data: data.items[index] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
    try {
        const data = readData('projects');
        data.items = data.items.filter(item => item.id !== req.params.id);
        writeData('projects', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 文章管理
// ====================
app.get('/api/articles', (req, res) => {
    try {
        const data = readData('articles');
        let items = data.items.filter(item => item.status === 'published');
        if (req.query.category) {
            items = items.filter(item => item.category === req.query.category);
        }
        items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: { featured: data.featured, items } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/articles/:id', (req, res) => {
    try {
        const data = readData('articles');
        let item = data.items.find(item => item.id === req.params.id);
        // 兼容 featured 为数组或对象
        if (!item && data.featured) {
            if (Array.isArray(data.featured)) {
                item = data.featured.find(f => f && f.id === req.params.id);
            } else if (data.featured.id === req.params.id) {
                item = data.featured;
            }
        }
        if (!item) return res.status(404).json({ success: false, message: '文章不存在' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/articles', requireAuth, (req, res) => {
    try {
        const data = readData('articles');
        const item = { id: generateId(), ...req.body, status: req.body.status || 'published', createdAt: new Date().toISOString().split('T')[0], updatedAt: new Date().toISOString().split('T')[0] };
        data.items.unshift(item);
        writeData('articles', data);
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 头条文章接口：支持 GET 读取数组、PUT 整组替换
app.get('/api/articles/featured', (req, res) => {
    try {
        const data = readData('articles');
        res.json({ success: true, data: data.featured || [] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/articles/featured', requireAuth, (req, res) => {
    try {
        const data = readData('articles');
        // 接收的 payload 形如：[{...}, {...}] 或 { items: [...] }，统一规范为数组
        let next;
        if (Array.isArray(req.body)) {
            next = req.body;
        } else if (Array.isArray(req.body && req.body.items)) {
            next = req.body.items;
        } else if (req.body && typeof req.body === 'object' && req.body.id) {
            // 兼容旧的单对象 PUT 模式：作为数组的第一个元素保留
            next = [req.body];
        } else {
            next = [];
        }
        // 限制最多 2 条头条
        next = next.slice(0, 2);
        // 合并保留每条原有字段，防止后台编辑时只提交部分字段把数据清空
        const original = Array.isArray(data.featured) ? data.featured : (data.featured ? [data.featured] : []);
        next = next.map((item, idx) => ({
            ...(original[idx] || {}),
            ...item,
            isFeatured: true
        }));
        data.featured = next;
        // 同步回写 items：精选文章被编辑后，保证文章列表区看到的数据一致
        if (Array.isArray(data.items)) {
            data.featured.forEach(fItem => {
                if (!fItem || !fItem.id) return;
                const idx = data.items.findIndex(it => it.id === fItem.id);
                if (idx !== -1) {
                    const syncFields = ['title', 'slug', 'category', 'summary', 'content', 'image', 'tags', 'date', 'createdAt'];
                    syncFields.forEach(field => {
                        if (field in fItem) data.items[idx][field] = fItem[field];
                    });
                }
            });
        }
        writeData('articles', data);
        res.json({ success: true, data: data.featured });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/articles/:id', requireAuth, (req, res) => {
    try {
        const data = readData('articles');
        const index = data.items.findIndex(item => item.id === req.params.id);
        if (index === -1) return res.status(404).json({ success: false, message: '文章不存在' });
        data.items[index] = { ...data.items[index], ...req.body, id: req.params.id, updatedAt: new Date().toISOString().split('T')[0] };
        // 如果该文章同时是精选/头条，同步更新 featured 中的展示字段，避免前后台图片不一致
        if (Array.isArray(data.featured)) {
            const fIdx = data.featured.findIndex(f => f && f.id === req.params.id);
            if (fIdx !== -1) {
                const syncFields = ['title', 'slug', 'category', 'summary', 'content', 'image', 'tags', 'date', 'createdAt'];
                syncFields.forEach(field => {
                    if (field in req.body) data.featured[fIdx][field] = req.body[field];
                });
            }
        }
        writeData('articles', data);
        res.json({ success: true, data: data.items[index] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/articles/:id', requireAuth, (req, res) => {
    try {
        const data = readData('articles');
        data.items = data.items.filter(item => item.id !== req.params.id);
        writeData('articles', data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 分类管理
// ====================
app.get('/api/categories', (req, res) => {
    try {
        res.json({ success: true, data: readData('categories') });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/categories', requireAuth, (req, res) => {
    try {
        writeData('categories', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 图片管理
// ====================
app.get('/api/images', (req, res) => {
    try {
        const files = fs.readdirSync(UPLOAD_DIR)
            .filter(file => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file))
            .map(file => ({
                name: file,
                url: '/assets/images/uploads/' + file,
                size: fs.statSync(path.join(UPLOAD_DIR, file)).size
            }));
        res.json({ success: true, data: files });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: '未选择文件' });
        }
        res.json({
            success: true,
            data: {
                name: req.file.filename,
                url: '/assets/images/uploads/' + req.file.filename,
                originalName: req.file.originalname
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/images/:name', requireAuth, (req, res) => {
    try {
        const filePath = path.join(UPLOAD_DIR, req.params.name);
        if (!filePath.startsWith(UPLOAD_DIR)) {
            return res.status(400).json({ success: false, message: '非法路径' });
        }
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 
// 错误处理
// ====================
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: err.message || '服务器错误' });
});

app.listen(PORT, () => {
    console.log(`汇程移民网站已启动`);
    console.log(`前台访问: http://localhost:${PORT}`);
    console.log(`后台管理: http://localhost:${PORT}/admin`);
    console.log(`默认管理员账号: ${ADMIN_USERNAME}`);
});
