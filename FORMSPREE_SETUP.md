# 客户表单直发邮箱 — 对接与部署说明

## 方案核心
客户在网站 `www.huichengyimin.com` 填写的 **姓名 + 电话 + 意向国家**，通过 **Formspree** 直接发到你邮箱 **fengdlinfo@126.com**。

- ✅ 不经过公开 GitHub 仓库，不写进任何网站代码
- ✅ 别人抓到全部网站源码，也只看到一行 `FORMSPREE_ID`（那只是收件箱地址，不是密钥，泄露也不会暴露历史客户数据）
- ✅ 数据进你邮箱，只有你能看

> 已完成的改动：仓库 `js/main.js` 第 867–957 行那段"明文 GitHub PAT 写 Issues"逻辑，已**整段替换**为 Formspree 直邮版本。旧 `ghp_` token 已从源码彻底清除（残留 0 行）。

---

## 你需要做的 3 步（涉及账号，我替代不了）

### 第 1 步：注册 Formspree 并绑定邮箱
1. 打开 https://formspree.io 注册（免费版足够，每月 50 封内不收费）
2. 新建一个 Form（表单），在收件邮箱处填 **fengdlinfo@126.com** 并验证
3. 建好后，Formspree 给你一个 Endpoint，形如：
   ```
   https://formspree.io/f/abcdwxyz
   ```
   其中 `abcdwxyz` 就是你的 **Formspree ID**

### 第 2 步：填入 ID（已完成）
`js/main.js` 第 875 行已填入真实 ID：
```js
const FORMSPREE_ID = 'xykrvgpq'; // 你的 Formspree 表单 ID（客户信息直发 fengdlinfo@126.com）
```
> 蜜罐字段已修正为标准 `gotcha`（非 `_gotcha`），可正确拦截机器人垃圾提交。

### 第 3 步：提交上线
在 GitHub 网页或本地把改动 push 到 `main` 分支，GitHub Pages 会自动重新部署（等 1~2 分钟刷新生效）。

---

## 部署后自检
1. 打开网站，填一次表单提交 —— 你的 `fengdlinfo@126.com` 应收到一封标题为
   `[汇程移民-客户咨询] 姓名 - 电话` 的邮件
2. 如果没收到：
   - 检查 `FORMSPREE_ID` 是否填对（没填的话会弹"提交未成功"并提示未配置）
   - 检查 Formspree 后台该表单是否绑定了正确邮箱且已验证
   - 浏览器按 F12 看 Console，会有具体失败原因

---

## ⚠️ 仍需处理的安全项（与本次表单无关，但建议尽快）
你公开仓库里 `data/users.json` 含明文后台密码 `ken/ken6363`（还有 `server.js` 写死的 `Admin6363`）。
- 它属于**未上线的 Node 后端**，线上是纯 GitHub Pages 静态站，所以此刻登不进活后台
- 但任何人点开你仓库就能看到这个密码
- **建议**：把仓库 Settings 设成 **Private**，或把 `data/users.json` 从公开仓库删除并清理 git 历史

---

## 关于"后台添加文章/图片"
纯 GitHub Pages 没有带登录的后台执行环境。添加文章/图片目前最稳的做法是：
- **方式一（推荐）**：在 GitHub 网页直接编辑 `data/articles.json` / 上传图片到 `assets/images/uploads/`，提交即上线
- **方式二（保留网页后台）**：需要一套最小权限的登录机制，属于折中方案，如需我可另给

本次只处理了"客户信息直发邮箱"这一核心诉求。后台文章管理若你想要网页版，我们单独再聊。
