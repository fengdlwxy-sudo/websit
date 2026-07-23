# 头条文章支持 2 条 — 实现概览

## 用户反馈
首页「移民攻略」区块只显示 1 张头条卡片，但实际想要 **2 条重要文章**。
后台显示的卡片标题是乱码（GBK/UTF-8 错位），但前台正常。

## 根因
1. **数据源错位**：`admin/admin.js` 读 `news.featured`，前台读 `articles.featured`。`news.json` 中文是乱码。
2. **数据结构限制**：`articles.featured` 是单对象，最多 1 条。

## 修复
- `articles.featured` 升级为数组 `[item1, item2]`，最多 2 条
- 后台统一以 `articles.featured` 为单一数据源
- 服务端 PUT 接口支持整组替换 + 字段合并保护
- 前端兼容单对象/数组两种格式，自动渲染 1-2 张卡片
- 后台列表显示 2 个独立槽位 [头条 1] [头条 2]，分别编辑/清空
- `news.html` 取数组第一个作为置顶

## 修改的文件
- `data/articles.json` - featured 改为数组
- `server.js` - GET/PUT /api/articles/featured 重写
- `js/main.js` - renderArticles 支持数组
- `css/style.css` - .news-feature-grid 布局
- `admin/admin.js` - loadAllData 保留结构、renderNews 2 槽位、editFeaturedNews 接受 index
- `news.html` - 兼容数组

## 端到端验证
✓ 首页显示 2 张头条卡片
✓ 后台正确显示 2 槽位（无乱码）
✓ 编辑后保存并刷新，数据正确回显
✓ articles.json 数据完整保存
✓ 点击卡片正常进入详情页
✓ news.html 页面正常

## 截图
- `hc-2feat-FINAL-homepage.png` - 最终首页效果
- `hc-2feat-admin-news.png` - 后台 2 槽位列表
- `hc-2feat-admin-after-save.png` - 编辑保存后
- `hc-2feat-homepage-final.png` - 保存后首页
