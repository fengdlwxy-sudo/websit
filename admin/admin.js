/**
 * 汇程移民 - 后台管理系统脚本
 */

const API_BASE = '/api';
// 后台已改为 GitHub Pages 模式：登录令牌即 GitHub PAT，存于 ghConfig.token
let authToken = (window.GitHubBackend && GitHubBackend.config.token) || localStorage.getItem('adminToken') || '';

// 如果直接双击打开本地 HTML 文件（file:// 协议），fetch 会请求到磁盘根目录，导致登录报“网络错误”
const isFileProtocol = window.location.protocol === 'file:';
if (isFileProtocol) {
    window.addEventListener('DOMContentLoaded', () => {
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.innerHTML = '请通过网站地址访问后台（例如 <strong>https://www.huichengyimin.com/admin</strong>），<br>不要直接双击打开本地 HTML 文件。';
        }
    });
}

let allData = {
    config: null,
    news: null,
    cases: null,
    certificates: null,
    countries: [],
    projects: [],
    articles: { featured: [], items: [] },
    categories: null,
    users: []
};
let currentEditType = null;
let currentEditId = null;

// ==================== 工具函数 ====================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return dateStr;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    return dateStr;
}

// ==================== 图片裁剪上传 ====================
let currentCropper = null;
let cropperFile = null;
let cropperCallback = null;

function openImageCropper(options = {}) {
    return new Promise((resolve, reject) => {
        const file = options.file;
        if (!file) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = () => {
                const f = input.files[0];
                if (!f) return reject(new Error('未选择文件'));
                if (!f.type.startsWith('image/')) {
                    showToast('请选择图片文件', 'error');
                    return reject(new Error('非图片文件'));
                }
                openImageCropper({ ...options, file: f }).then(resolve).catch(reject);
            };
            input.click();
            return;
        }

        cropperFile = file;
        cropperCallback = { resolve, reject };

        const modal = document.getElementById('imageCropperModal');
        const img = document.getElementById('cropperImage');
        const widthInput = document.getElementById('cropperWidth');
        const heightInput = document.getElementById('cropperHeight');
        const aspectSelect = document.getElementById('cropperAspectRatio');

        widthInput.value = options.width || '';
        heightInput.value = options.height || '';
        aspectSelect.value = String(options.aspectRatio || 'NaN');

        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        modal.style.display = 'flex';

        if (currentCropper) {
            currentCropper.destroy();
            currentCropper = null;
        }

        img.onload = () => {
            currentCropper = new Cropper(img, {
                aspectRatio: options.aspectRatio || NaN,
                viewMode: 1,
                dragMode: 'crop',
                autoCropArea: 0.8,
                responsive: true,
                guides: true,
                highlight: false,
                background: false,
                cropBoxResizable: true,
                cropBoxMovable: true,
                ready() {
                    if (options.aspectRatio) {
                        this.cropper.setAspectRatio(options.aspectRatio);
                    }
                }
            });
        };

        aspectSelect.onchange = () => {
            if (!currentCropper) return;
            const val = parseFloat(aspectSelect.value);
            currentCropper.setAspectRatio(isNaN(val) ? NaN : val);
        };

        // 质量滑块实时更新显示
        const qualitySlider = document.getElementById('cropperQuality');
        const qualityVal = document.getElementById('cropperQualityVal');
        if (qualitySlider && qualityVal) {
            qualitySlider.oninput = () => {
                qualityVal.textContent = qualitySlider.value;
            };
        }

        const confirmBtn = document.getElementById('cropperConfirmBtn');
        confirmBtn.onclick = () => confirmImageCrop();
    });
}

async function confirmImageCrop() {
    if (!currentCropper || !cropperFile) return;
    const widthInput = document.getElementById('cropperWidth');
    const heightInput = document.getElementById('cropperHeight');
    const qualityInput = document.getElementById('cropperQuality');
    const formatSelect = document.getElementById('cropperFormat');
    const targetWidth = parseInt(widthInput.value, 10) || null;
    const targetHeight = parseInt(heightInput.value, 10) || null;
    const quality = parseFloat(qualityInput?.value || 0.8);
    const format = formatSelect?.value || 'image/jpeg';

    // 保存 callback 引用，避免 closeImageCropper 清空后无法 resolve/reject
    const cb = cropperCallback;

    try {
        const canvas = currentCropper.getCroppedCanvas({
            width: targetWidth || undefined,
            height: targetHeight || undefined,
            fillColor: '#fff',
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
        if (!canvas) {
            showToast('裁剪失败，请重试', 'error');
            if (cb) cb.reject(new Error('裁剪失败'));
            return;
        }

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(resolve, format, quality);
            setTimeout(() => reject(new Error('图片导出超时')), 5000);
        });
        if (!blob) throw new Error('图片导出失败');

        const url = await uploadImageBlob(blob, cropperFile.name, format);
        closeImageCropper();
        if (cb) cb.resolve(url);
    } catch (err) {
        closeImageCropper();
        showToast('上传失败：' + err.message, 'error');
        if (cb) cb.reject(err);
    }
}

async function uploadImageBlob(blob, originalName, format = 'image/jpeg') {
    // GitHub Pages 模式下，图片直接以 base64 提交到仓库 assets/images/uploads/
    const result = await GitHubBackend.ghUploadImageBlob(blob, originalName, format);
    if (!result.success || !result.data?.url) {
        throw new Error('上传失败');
    }
    return result.data.url;
}

function closeImageCropper() {
    const modal = document.getElementById('imageCropperModal');
    modal.style.display = 'none';
    if (currentCropper) {
        currentCropper.destroy();
        currentCropper = null;
    }
    const img = document.getElementById('cropperImage');
    if (img.src) {
        URL.revokeObjectURL(img.src);
        img.src = '';
    }
    cropperFile = null;
    cropperCallback = null;
}

function imageFieldHtml(inputId, value = '', options = {}) {
    const label = options.label || '图片';
    const placeholder = options.placeholder || '图片 URL';
    const previewUrl = value || '';
    const previewContent = previewUrl
        ? `<img src="${previewUrl}" alt="预览">`
        : `<div class="image-field-empty">暂无图片<br>建议尺寸：${options.suggest || '按实际展示区域选择'}</div>`;
    const safeOptions = JSON.stringify(options).replace(/"/g, '&quot;');

    return `
        <div class="image-field" data-image-field="${inputId}">
            <label>${label}</label>
            <div class="image-field-preview" id="${inputId}Preview">${previewContent}</div>
            <input type="hidden" id="${inputId}" value="${escapeHtml(value || '')}" placeholder="${placeholder}">
            <div class="image-field-actions">
                <label class="btn btn-default btn-small">
                    📁 选择图片
                    <input type="file" accept="image/*" style="display:none" onchange="handleImageFieldSelect(this, '${inputId}', ${safeOptions})">
                </label>
                <button type="button" class="btn btn-primary btn-small" id="${inputId}UploadBtn" onclick="confirmImageFieldUpload('${inputId}', ${safeOptions})" style="display:none;">☁️ 上传</button>
                <button type="button" class="btn btn-default btn-small" onclick="openImageLibraryPicker('${inputId}')">🖼️ 从图库选择</button>
                <button type="button" class="btn btn-danger btn-small" onclick="clearImageField('${inputId}')">清除</button>
                <span class="image-field-status" id="${inputId}Status"></span>
            </div>
        </div>
    `;
}

// 暂存已选择但未上传的图片文件
const pendingImageFiles = new Map();

function handleImageFieldSelect(input, inputId, options) {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        input.value = '';
        return;
    }
    // 用 ObjectURL 预览
    const preview = document.getElementById(inputId + 'Preview');
    if (preview) {
        if (pendingImageFiles.has(inputId)) {
            const old = pendingImageFiles.get(inputId);
            if (old._objectUrl) URL.revokeObjectURL(old._objectUrl);
        }
        const objectUrl = URL.createObjectURL(file);
        file._objectUrl = objectUrl;
        pendingImageFiles.set(inputId, file);
        preview.innerHTML = `<img src="${objectUrl}" alt="待上传预览"><div class="image-field-tag">待上传</div>`;
    }
    // 显示"上传"按钮
    const uploadBtn = document.getElementById(inputId + 'UploadBtn');
    if (uploadBtn) uploadBtn.style.display = '';
    const status = document.getElementById(inputId + 'Status');
    if (status) status.textContent = `已选择: ${file.name}（${(file.size / 1024).toFixed(1)} KB）`;
    input.value = '';
}

async function confirmImageFieldUpload(inputId, options) {
    const file = pendingImageFiles.get(inputId);
    if (!file) {
        showToast('请先选择图片', 'warning');
        return;
    }
    const uploadBtn = document.getElementById(inputId + 'UploadBtn');
    const status = document.getElementById(inputId + 'Status');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';
    }
    if (status) status.textContent = '上传中...';
    try {
        const url = await openImageCropper({ file, ...options });
        setImageFieldValue(inputId, url);
        // 清理暂存
        if (file._objectUrl) URL.revokeObjectURL(file._objectUrl);
        pendingImageFiles.delete(inputId);
        if (uploadBtn) uploadBtn.style.display = 'none';
        if (status) status.textContent = `✓ 已上传`;
        setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } catch (err) {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '☁️ 上传';
        }
        if (status) status.textContent = '✗ 上传失败：' + (err.message || '用户取消');
    }
}

async function handleImageFieldUpload(input, inputId, options) {
    // 兼容旧调用：直接选择并上传
    handleImageFieldSelect(input, inputId, options);
    if (pendingImageFiles.has(inputId)) {
        await confirmImageFieldUpload(inputId, options);
    }
}

function setImageFieldValue(inputId, url) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(inputId + 'Preview');
    const uploadBtn = document.getElementById(inputId + 'UploadBtn');
    if (input) input.value = url || '';
    if (preview) {
        if (url) {
            preview.innerHTML = `<img src="${url}" alt="预览"><div class="image-field-tag image-field-tag-success">已上传</div>`;
        } else {
            preview.innerHTML = `<div class="image-field-empty">暂无图片</div>`;
        }
    }
    if (uploadBtn) {
        uploadBtn.style.display = 'none';
        uploadBtn.disabled = false;
        uploadBtn.textContent = '☁️ 上传';
    }
}

// ==================== 图片库选择器（独立 modal，避免覆盖编辑器 DOM）====================
let _imageLibraryPickerTarget = null;
let _imageLibraryCache = [];

async function openImageLibraryPicker(inputId) {
    _imageLibraryPickerTarget = inputId;
    let images = [];
    try {
        const result = await apiRequest('/images');
        images = (result && result.data) || [];
    } catch (err) {
        showToast('加载图片库失败：' + err.message, 'error');
        return;
    }
    if (!images.length) {
        showToast('图片库为空，请先到"图片管理"上传图片', 'warning');
        return;
    }
    _imageLibraryCache = images;
    renderImageLibraryModal(images, '');
    setTimeout(() => {
        const search = document.getElementById('imageLibrarySearch');
        if (search) search.focus();
    }, 100);
}

function renderImageLibraryModal(images, keyword) {
    const k = (keyword || '').toLowerCase().trim();
    const filtered = k ? images.filter(img => (img.name || '').toLowerCase().includes(k)) : images;
    const grid = filtered.map(img => {
        const safeUrl = (img.url || '').replace(/'/g, "\\'");
        return `
        <div class="image-library-item" data-url="${escapeHtml(img.url)}" onclick="selectFromImageLibrary('${safeUrl}')">
            <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.name)}" loading="lazy">
            <div class="image-library-name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>
        </div>
    `;
    }).join('');
    const html = `
        <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;">
            <input type="text" id="imageLibrarySearch" placeholder="搜索图片名..." oninput="renderImageLibraryModal(_imageLibraryCache, this.value)" style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;">
            <span style="color:var(--text-muted);font-size:13px;">共 ${images.length} 张${k ? `（显示 ${filtered.length}）` : ''}</span>
        </div>
        <div class="image-library-grid">${grid || '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px;">没有匹配的图片</p>'}</div>
    `;
    // 使用独立 modal 容器
    const modal = document.getElementById('imageLibraryModal');
    if (!modal) {
        console.error('imageLibraryModal element not found');
        return;
    }
    modal.querySelector('.modal-body').innerHTML = html;
    modal.style.display = 'flex';
}

window.closeImageLibrary = function() {
    const modal = document.getElementById('imageLibraryModal');
    if (modal) modal.style.display = 'none';
    _imageLibraryPickerTarget = null;
};

window.selectFromImageLibrary = function(url) {
    if (!_imageLibraryPickerTarget) return;
    const target = _imageLibraryPickerTarget;
    closeImageLibrary();
    // 等 modal 隐藏后再写值（确保 DOM 还在）
    setTimeout(() => {
        if (target === 'richEditor') {
            insertImageToRichEditor(url);
        } else {
            setImageFieldValue(target, url);
            showToast('已从图库选择图片');
        }
    }, 50);
};

// 把从图库选中的图片插入到富文本编辑器正文
function insertImageToRichEditor(url) {
    const editor = document.getElementById('richEditorContent');
    if (!editor) {
        showToast('编辑器未找到', 'error');
        return;
    }
    // 先把光标移到正文末尾（图库选择期间可能丢失选区）
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const img = `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:12px 0;display:block;">`;
    const ok = document.execCommand('insertHTML', false, img + '<p><br></p>');
    if (!ok) {
        // 兜底：直接追加到末尾
        editor.insertAdjacentHTML('beforeend', img);
    }
    showToast('图片已插入到正文');
}

function clearImageField(inputId) {
    if (pendingImageFiles.has(inputId)) {
        const f = pendingImageFiles.get(inputId);
        if (f._objectUrl) URL.revokeObjectURL(f._objectUrl);
        pendingImageFiles.delete(inputId);
    }
    setImageFieldValue(inputId, '');
    const status = document.getElementById(inputId + 'Status');
    if (status) status.textContent = '';
}

// ==================== 富文本编辑器 ====================
let currentRichEditor = null;
let selectedEditorImage = null;
let imageResizeOverlay = null;

function richEditorToolbarHtml() {
    return `
    <div class="rich-editor-toolbar">
        <div class="toolbar-group">
            <select onchange="richEditorFormat('formatBlock', this.value); this.value=''" title="段落样式">
                <option value="">正文</option>
                <option value="H1">大标题 H1</option>
                <option value="H2">小标题 H2</option>
                <option value="H3">三级标题 H3</option>
                <option value="P">段落</option>
            </select>
            <select onchange="richEditorFormat('fontSize', this.value); this.value=''" title="字体大小">
                <option value="">字号</option>
                <option value="1">小</option>
                <option value="2">较小</option>
                <option value="3">正常</option>
                <option value="4">较大</option>
                <option value="5">大</option>
                <option value="6">很大</option>
                <option value="7">极大</option>
            </select>
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="richEditorFormat('bold')" title="加粗"><b>B</b></button>
            <button type="button" onclick="richEditorFormat('italic')" title="斜体"><i>I</i></button>
            <button type="button" onclick="richEditorFormat('underline')" title="下划线"><u>U</u></button>
            <button type="button" onclick="richEditorFormat('strikeThrough')" title="删除线"><s>S</s></button>
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="richEditorFormat('justifyLeft')" title="左对齐">⬅</button>
            <button type="button" onclick="richEditorFormat('justifyCenter')" title="居中">↔</button>
            <button type="button" onclick="richEditorFormat('justifyRight')" title="右对齐">➡</button>
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="richEditorFormat('insertUnorderedList')" title="无序列表">• 列表</button>
            <button type="button" onclick="richEditorFormat('insertOrderedList')" title="有序列表">1. 列表</button>
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="richEditorFormat('removeFormat')" title="清除格式">🧹</button>
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="document.execCommand('undo'); currentRichEditor?.focus();" title="撤销 (Ctrl+Z)">↶</button>
            <button type="button" onclick="document.execCommand('redo'); currentRichEditor?.focus();" title="重做 (Ctrl+Y)">↷</button>
        </div>
        <div class="toolbar-group">
            <input type="color" onchange="richEditorFormat('foreColor', this.value); this.value='#000000';" value="#000000" title="字体颜色" style="width:32px;height:28px;padding:0;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
            <input type="color" onchange="richEditorFormat('hiliteColor', this.value); this.value='#ffff00';" value="#ffff00" title="背景高亮" style="width:32px;height:28px;padding:0;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="richEditorInsertLink()" title="插入链接">🔗 链接</button>
            <button type="button" onclick="richEditorFormat('unlink')" title="取消链接">⛓️‍💥</button>
            <button type="button" onclick="richEditorInsertTable()" title="插入表格">📊 表格</button>
            <button type="button" onclick="richEditorInsertCode()" title="插入代码">💻 代码</button>
            <button type="button" onclick="richEditorInsertQuote()" title="引用">❝ 引用</button>
        </div>
        <div class="toolbar-group">
            <button type="button" onclick="richEditorFormat('subscript')" title="下标">x₂</button>
            <button type="button" onclick="richEditorFormat('superscript')" title="上标">x²</button>
            <button type="button" onclick="richEditorFormat('indent')" title="增加缩进">→|</button>
            <button type="button" onclick="richEditorFormat('outdent')" title="减少缩进">|←</button>
        </div>
    </div>
    <div class="rich-editor-content" id="richEditorContent" contenteditable="true" data-placeholder="在此输入内容，支持图文混排..."></div>
    <div class="rich-editor-actions">
        <label class="btn btn-default btn-small">
            📁 选择图片
            <input type="file" id="richEditorImageUpload" accept="image/*" onchange="handleEditorImageSelect(this)">
        </label>
        <button type="button" class="btn btn-primary btn-small" id="richEditorImageUploadBtn" onclick="confirmEditorImageUpload()" style="display:none;">☁️ 上传并插入</button>
        <span class="image-field-status" id="richEditorImageStatus"></span>
        <button type="button" class="btn btn-default btn-small" onclick="clearEditorImageSelection()">清除选择</button>
        <button type="button" class="btn btn-default btn-small" onclick="richEditorFormat('insertHorizontalRule')">— 分割线</button>
        <button type="button" class="btn btn-default btn-small" onclick="richEditorInsertFromLibrary()">🖼️ 从图片库选择</button>
        <div class="image-size-panel" id="editorImageSizePanel" style="display:none; margin-left:auto;">
            <span>宽:</span><input type="number" id="editorImgWidth" onchange="updateSelectedImageSize()">
            <span>高:</span><input type="number" id="editorImgHeight" onchange="updateSelectedImageSize()">
            <button type="button" class="btn btn-default btn-small" onclick="clearSelectedImage()">取消选择</button>
        </div>
    </div>
    `;
}

function initRichEditor(initialHtml = '', placeholder = '') {
    currentRichEditor = document.getElementById('richEditorContent');
    if (!currentRichEditor) return;
    currentRichEditor.innerHTML = initialHtml || '';
    if (placeholder) currentRichEditor.setAttribute('data-placeholder', placeholder);
    setupImageResize(currentRichEditor);
}

function getRichEditorHtml() {
    // 移除选中状态，避免保存选中样式
    clearSelectedImage();
    return currentRichEditor ? currentRichEditor.innerHTML : '';
}

function richEditorFormat(command, value = null) {
    if (!currentRichEditor) return;
    currentRichEditor.focus();
    document.execCommand(command, false, value);
}

function richEditorInsertLink() {
    if (!currentRichEditor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        showToast('请先选中要添加链接的文字', 'info');
        return;
    }
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();
    if (!selectedText) {
        showToast('请先选中要添加链接的文字', 'info');
        return;
    }
    const url = prompt('请输入链接地址（以 http:// 或 https:// 开头）：', 'https://');
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))) {
        currentRichEditor.focus();
        document.execCommand('createLink', false, url);
        // 链接在新窗口打开
        const links = currentRichEditor.querySelectorAll(`a[href="${url}"]`);
        links.forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
        showToast('链接已插入', 'success');
    }
}

function richEditorInsertTable() {
    if (!currentRichEditor) return;
    const rows = prompt('表格行数 (1-10)：', '3');
    if (!rows) return;
    const cols = prompt('表格列数 (1-8)：', '3');
    if (!cols) return;
    const r = Math.min(10, Math.max(1, parseInt(rows) || 3));
    const c = Math.min(8, Math.max(1, parseInt(cols) || 3));
    let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;">';
    for (let i = 0; i < r; i++) {
        html += '<tr>';
        for (let j = 0; j < c; j++) {
            const cellTag = i === 0 ? 'th' : 'td';
            html += `<${cellTag} style="border:1px solid #ddd;padding:8px;${i === 0 ? 'background:#f5f5f5;font-weight:600;' : ''}">${i === 0 ? '表头' : '内容'}</${cellTag}>`;
        }
        html += '</tr>';
    }
    html += '</table><p></p>';
    currentRichEditor.focus();
    document.execCommand('insertHTML', false, html);
    showToast(`已插入 ${r}x${c} 表格`, 'success');
}

function richEditorInsertCode() {
    if (!currentRichEditor) return;
    const lang = prompt('代码语言（可选，如 javascript、python、html）：', '');
    currentRichEditor.focus();
    if (lang) {
        document.execCommand('insertHTML', false,
            `<pre style="background:#1e1e1e;color:#d4d4d4;padding:14px;border-radius:6px;overflow-x:auto;font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.5;margin:10px 0;"><code class="language-${escapeHtml(lang)}">// 在此粘贴代码</code></pre><p></p>`);
    } else {
        document.execCommand('insertHTML', false,
            `<pre style="background:#f5f5f5;color:#333;padding:14px;border-radius:6px;overflow-x:auto;font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.5;margin:10px 0;"><code>// 在此粘贴代码</code></pre><p></p>`);
    }
    showToast('已插入代码块', 'success');
}

function richEditorInsertQuote() {
    if (!currentRichEditor) return;
    currentRichEditor.focus();
    document.execCommand('formatBlock', false, 'blockquote');
    // 给 blockquote 加样式
    const quotes = currentRichEditor.querySelectorAll('blockquote:not([style])');
    quotes.forEach(q => {
        q.style.cssText = 'border-left:4px solid var(--primary, #007A8A);padding:10px 16px;margin:12px 0;color:#555;background:#f8f9fa;font-style:italic;border-radius:0 6px 6px 0;';
    });
}

function richEditorInsertFromLibrary() {
    // 复用图片库选择器（如果存在）
    if (typeof openImageLibraryPicker === 'function') {
        openImageLibraryPicker('richEditor');
    } else {
        showToast('图片库选择器未加载', 'error');
    }
}

// 暂存富文本编辑器中已选择但未上传的文件
let pendingEditorImage = null;

function handleEditorImageSelect(input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        input.value = '';
        return;
    }
    if (pendingEditorImage && pendingEditorImage._objectUrl) {
        URL.revokeObjectURL(pendingEditorImage._objectUrl);
    }
    pendingEditorImage = file;
    file._objectUrl = URL.createObjectURL(file);
    // 显示上传按钮和状态
    const uploadBtn = document.getElementById('richEditorImageUploadBtn');
    if (uploadBtn) uploadBtn.style.display = '';
    const status = document.getElementById('richEditorImageStatus');
    if (status) status.textContent = `已选择: ${file.name}（${(file.size / 1024).toFixed(1)} KB），点击"上传并插入"完成上传`;
    input.value = '';
}

async function confirmEditorImageUpload() {
    if (!pendingEditorImage) {
        showToast('请先选择图片', 'warning');
        return;
    }
    const uploadBtn = document.getElementById('richEditorImageUploadBtn');
    const status = document.getElementById('richEditorImageStatus');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '上传中...';
    }
    if (status) status.textContent = '上传中...';
    try {
        const url = await openImageCropper({ file: pendingEditorImage });
        insertImageToEditor(url);
        // 清理暂存
        if (pendingEditorImage._objectUrl) URL.revokeObjectURL(pendingEditorImage._objectUrl);
        pendingEditorImage = null;
        if (uploadBtn) {
            uploadBtn.style.display = 'none';
            uploadBtn.disabled = false;
            uploadBtn.textContent = '☁️ 上传并插入';
        }
        if (status) {
            status.textContent = '✓ 图片已插入到编辑器';
            setTimeout(() => { if (status.textContent.indexOf('已插入') !== -1) status.textContent = ''; }, 3000);
        }
    } catch (err) {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.textContent = '☁️ 上传并插入';
        }
        if (status) status.textContent = '✗ 上传失败：' + (err.message || '用户取消');
    }
}

function clearEditorImageSelection() {
    if (pendingEditorImage && pendingEditorImage._objectUrl) {
        URL.revokeObjectURL(pendingEditorImage._objectUrl);
    }
    pendingEditorImage = null;
    const uploadBtn = document.getElementById('richEditorImageUploadBtn');
    if (uploadBtn) {
        uploadBtn.style.display = 'none';
        uploadBtn.disabled = false;
        uploadBtn.textContent = '☁️ 上传并插入';
    }
    const status = document.getElementById('richEditorImageStatus');
    if (status) status.textContent = '';
}

async function handleEditorImageUpload(input) {
    // 兼容旧调用
    handleEditorImageSelect(input);
    if (pendingEditorImage) {
        await confirmEditorImageUpload();
    }
}

function insertImageToEditor(url) {
    if (!currentRichEditor) return;
    currentRichEditor.focus();
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    document.execCommand('insertHTML', false, img.outerHTML);
}

function setupImageResize(editor) {
    editor.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
            selectEditorImage(e.target);
        } else {
            clearSelectedImage();
        }
    });
}

function selectEditorImage(img) {
    clearSelectedImage();
    selectedEditorImage = img;
    img.classList.add('selected');
    showImageSizePanel(img);
}

function clearSelectedImage() {
    if (selectedEditorImage) {
        selectedEditorImage.classList.remove('selected');
        selectedEditorImage = null;
    }
    const panel = document.getElementById('editorImageSizePanel');
    if (panel) panel.style.display = 'none';
    if (imageResizeOverlay) {
        imageResizeOverlay.remove();
        imageResizeOverlay = null;
    }
}

function showImageSizePanel(img) {
    const panel = document.getElementById('editorImageSizePanel');
    if (!panel) return;
    panel.style.display = 'flex';
    document.getElementById('editorImgWidth').value = img.width || img.naturalWidth || '';
    document.getElementById('editorImgHeight').value = img.height || img.naturalHeight || '';
}

function updateSelectedImageSize() {
    if (!selectedEditorImage) return;
    const w = document.getElementById('editorImgWidth').value;
    const h = document.getElementById('editorImgHeight').value;
    if (w) selectedEditorImage.style.width = w + 'px';
    if (h) selectedEditorImage.style.height = h + 'px';
    if (!h) selectedEditorImage.style.height = 'auto';
}

async function apiRequest(url, options = {}) {
    try {
        return await GitHubBackend.githubApiRequest(url, options);
    } catch (err) {
        const msg = (err && err.message) || '';
        if (err && err.status === 401 || /401|令牌|无效|未登录/.test(msg)) {
            showLogin();
            throw new Error('登录已失效，请重新登录');
        }
        throw err;
    }
}

// ==================== 登录 ====================
function showLogin() {
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('adminLayout').style.display = 'none';
}

function showAdmin() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('adminLayout').style.display = 'flex';
    loadAllData();
    updateDashboard();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('loginToken').value.trim();
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const branch = document.getElementById('ghBranch').value.trim() || 'main';
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    if (!token) {
        errorEl.textContent = '请填写 GitHub 令牌';
        return;
    }

    // 保存仓库配置与令牌，供后续接口使用
    GitHubBackend.saveGhConfig({ token, owner, repo, branch });

    try {
        // 校验令牌（/login 内部会调用 GitHub 校验）
        const result = await apiRequest('/login', { method: 'POST' });
        if (result.success) {
            authToken = token;
            localStorage.setItem('adminToken', authToken);
            showAdmin();
            showToast('登录成功');
        } else {
            errorEl.textContent = result.message || '登录失败';
        }
    } catch (err) {
        if (isFileProtocol) {
            errorEl.innerHTML = '请通过网站地址访问后台（例如 <strong>https://www.huichengyimin.com/admin</strong>），<br>不要直接双击打开本地 HTML 文件。';
        } else if (err.message && (err.message.includes('令牌') || err.message.includes('401'))) {
            errorEl.textContent = '令牌无效或无权限，请检查 PAT 与仓库设置';
        } else if (err.message && err.message.includes('Failed to fetch')) {
            errorEl.textContent = '无法连接 GitHub，请检查网络';
        } else {
            errorEl.textContent = '登录失败：' + (err.message || '请重试');
        }
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    apiRequest('/logout', { method: 'POST' }).catch(() => {});
    authToken = '';
    localStorage.removeItem('adminToken');
    GitHubBackend.saveGhConfig({ token: '' });
    showLogin();
});

// ==================== 检查登录状态 ====================
async function checkAuth() {
    if (!authToken) {
        showLogin();
        return;
    }
    try {
        const result = await apiRequest('/auth-check');
        if (result.authenticated) {
            showAdmin();
        } else {
            showLogin();
        }
    } catch (err) {
        showLogin();
    }
}

// ==================== 加载所有数据 ====================
async function loadAllData() {
    try {
        const result = await apiRequest('/content');
        allData = result;

        // content 端点返回原始数据（无状态过滤），直接提取数组
        // 注意：articles 必须保留 {featured, items} 整体，因为头条管理依赖 featured
        allData.countries = allData.countries?.items || [];
        allData.projects = allData.projects?.items || [];
        if (allData.articles && !Array.isArray(allData.articles) && Array.isArray(allData.articles.items)) {
            // 保留 articles 整体结构（featured + items）
            allData.articles = {
                featured: Array.isArray(allData.articles.featured) ? allData.articles.featured
                          : (allData.articles.featured ? [allData.articles.featured] : []),
                items: allData.articles.items
            };
        } else if (!allData.articles) {
            allData.articles = { featured: [], items: [] };
        }
        allData.categories = allData.categories || { projectCategories: [], articleCategories: [] };

        // 加载用户列表
        try {
            const usersResp = await apiRequest('/users');
            allData.users = usersResp.data || [];
        } catch (err) {
            allData.users = [];
        }

        renderNews();
        renderCases();
        renderCertificates();
        renderBanners();
        renderImages();
        loadSettings();
        renderCountries();
        renderProjects();
        renderArticles();
        renderCategories();
        renderUsers();
        updateDashboard();
    } catch (err) {
        showToast('加载数据失败：' + err.message, 'error');
    }
}

// ==================== 导航切换 ====================
const pageTitles = {
    dashboard: '数据概览',
    news: '首页新闻推荐管理',
    countries: '国家管理',
    projects: '项目管理',
    articles: '文章管理',
    categories: '分类管理',
    cases: '成功案例管理',
    certificates: '荣誉证书管理',
    banners: '轮播管理',
    images: '图片管理',
    settings: '站点设置',
    users: '用户管理',
    leads: '客户咨询管理'
};

function switchPage(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = page.id === 'page-' + pageName ? 'block' : 'none';
    });
    document.getElementById('pageTitle').textContent = pageTitles[pageName] || pageName;
    if (pageName === 'dashboard') updateDashboard();
    if (pageName === 'leads') renderLeads();
}

document.querySelectorAll('.nav-item, [data-page-link]').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page || item.dataset.pageLink;
        if (page) switchPage(page);
    });
});

// 监听 hash 变化
window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#', '') || 'dashboard';
    switchPage(page);
});

if (location.hash) {
    switchPage(location.hash.replace('#', ''));
}

// ==================== 概览页 ====================
async function updateDashboard() {
    document.getElementById('statNews').textContent = allData.news?.items?.length || 0;
    document.getElementById('statCases').textContent = allData.cases?.items?.length || 0;
    document.getElementById('statCerts').textContent = allData.certificates?.items?.length || 0;
    document.getElementById('statCountries').textContent = allData.countries?.length || 0;
    document.getElementById('statProjects').textContent = allData.projects?.length || 0;
    document.getElementById('statArticles').textContent = (allData.articles && allData.articles.items) ? allData.articles.items.length : 0;
    try {
        const result = await apiRequest('/images');
        document.getElementById('statImages').textContent = result.data?.length || 0;
    } catch (err) {}
    // 客户咨询数量（GitHub Issues）
    try {
        const leadRes = await apiRequest('/leads');
        const leads = leadRes.data || [];
        const pending = leads.filter(l => l.status !== 'done').length;
        const el = document.getElementById('statLeads');
        if (el) el.textContent = pending > 0 ? (leads.length + '（' + pending + ' 待跟进）') : leads.length;
    } catch (err) {
        const el = document.getElementById('statLeads');
        if (el) el.textContent = '-';
    }
}

// ==================== 新闻管理 ====================
// 头条文章：以 articles.featured 数组为单一数据源（最多 2 条）
function getFeaturedList() {
    const af = allData.articles && allData.articles.featured;
    if (Array.isArray(af)) return af.filter(Boolean);
    if (af) return [af];
    return [];
}

function renderNews() {
    const list = document.getElementById('newsList');
    if (!list) return;
    const items = (allData.news && allData.news.items) || [];
    const featured = getFeaturedList();

    // 头条区：始终显示 2 个槽位（头条1、头条2），方便用户识别与操作
    let html = '';
    const slotCount = 2;
    for (let i = 0; i < slotCount; i++) {
        const f = featured[i];
        const isEmpty = !f;
        html += `
            <div class="list-item" style="border-left: 4px solid var(--accent);">
                <div class="item-thumb">${f ? (f.icon || '🎓') : '➕'}</div>
                <div class="item-content">
                    <div class="item-title">[头条 ${i + 1}] ${f ? escapeHtml(f.title) : '<span style="color:var(--text-muted);">（未设置，点击右侧编辑添加）</span>'}</div>
                    <div class="item-meta">
                        <span class="tag">头条文章</span>
                        <span>${f ? (f.date || f.createdAt || '') : '—'}</span>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-default btn-small" onclick="editFeaturedNews(${i})">${f ? '编辑' : '添加'}</button>
                    ${f ? `<button class="btn btn-danger btn-small" onclick="clearFeaturedSlot(${i})">清空</button>` : ''}
                </div>
            </div>
        `;
    }

    // 普通新闻
    html += items.map(item => `
        <div class="list-item">
            <div class="item-thumb">${item.tag === 'NEW' ? '🆕' : '📰'}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-meta">
                    <span class="tag">${escapeHtml(item.tag || '普通')}</span>
                    <span>📅 ${item.date || ''}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editNews('${item.id}')">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteNews('${item.id}')">删除</button>
            </div>
        </div>
    `).join('');

    list.innerHTML = html || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无新闻，点击上方按钮添加</p>';
}

window.editFeaturedNews = async function(index) {
    // 头条文章：实际对应前台首页 articles.featured[index]
    index = Number(index) || 0;
    if (index < 0) index = 0;
    if (index > 1) index = 1;
    currentEditType = 'article-featured';
    currentEditId = index; // 复用 currentEditId 存头条下标

    let f = {};
    try {
        // apiRequest 返回的是 {success, data: {featured, items}}
        const resp = await apiRequest('/articles');
        const articleData = (resp && resp.data) || resp || {};
        const list = Array.isArray(articleData.featured) ? articleData.featured
                    : (articleData.featured ? [articleData.featured] : []);
        f = list[index] || {};
    } catch (err) {
        showToast('加载头条文章失败：' + err.message, 'error');
        return;
    }
    // 缓存所有头条用于保存时合并
    window._editingFeaturedList = (() => {
        try {
            const resp = allData.articles || {};
            const l = Array.isArray(resp.featured) ? resp.featured : (resp.featured ? [resp.featured] : []);
            return JSON.parse(JSON.stringify(l));
        } catch (e) { return []; }
    })();
    window._editingFeatured = JSON.parse(JSON.stringify(f));
    openModal('编辑头条文章 ' + (index + 1), `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editTitle" value="${escapeHtml(f.title || '')}" placeholder="例：高考之外，孩子还有哪些路？">
        </div>
        <div class="form-group">
            <label>摘要</label>
            <textarea id="editSummary" rows="3" placeholder="80-150 字最佳">${escapeHtml(f.summary || '')}</textarea>
        </div>
        ${imageFieldHtml('editFeaturedImage', f.image || '', {label: '头条封面图（上传后替换色块）', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>图标 (emoji，未上传图片时显示)</label>
            <input type="text" id="editIcon" value="${escapeHtml(f.icon || '🎓')}">
        </div>
        <div class="form-group">
            <label>背景渐变（未上传图片时生效）</label>
            <input type="text" id="editGradient" value="${escapeHtml(f.gradient || 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)')}">
        </div>
        <div class="form-group">
            <label>链接</label>
            <input type="text" id="editLink" value="${escapeHtml(f.link || ('article-detail.html?id=' + (f.id || 'a-001')))}">
        </div>
        <div class="form-group">
            <label>日期</label>
            <input type="date" id="editDate" value="${f.date || f.createdAt || ''}">
        </div>
    `);
};

window.clearFeaturedSlot = async function(index) {
    if (!confirm('确定要清空这个头条槽位吗？')) return;
    index = Number(index) || 0;
    const list = getFeaturedList().slice();
    list[index] = null;
    // 把 null 过滤后写回
    const cleaned = list.filter(Boolean);
    try {
        await apiRequest('/articles/featured', { method: 'PUT', body: JSON.stringify(cleaned) });
        showToast('已清空该头条槽位');
        await loadAllData();
    } catch (err) {
        showToast('清空失败：' + err.message, 'error');
    }
};

window.editNews = function(id) {
    const item = allData.news.items.find(i => i.id === id);
    if (!item) return;
    currentEditType = 'news';
    currentEditId = id;
    openModal('编辑新闻', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editTitle" value="${escapeHtml(item.title || '')}">
        </div>
        <div class="form-group">
            <label>标签 (NEW/资讯/政策 等)</label>
            <input type="text" id="editTag" value="${escapeHtml(item.tag || '')}">
        </div>
        <div class="form-group">
            <label>日期</label>
            <input type="date" id="editDate" value="${item.date || ''}">
        </div>
        <div class="form-group">
            <label>链接</label>
            <input type="text" id="editLink" value="${escapeHtml(item.link || '#')}">
        </div>
    `);
};

window.deleteNews = async function(id) {
    if (!confirm('确定要删除这条新闻吗？')) return;
    try {
        await apiRequest('/news/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addNewsBtn').addEventListener('click', () => {
    currentEditType = 'news';
    currentEditId = null;
    const today = new Date().toISOString().split('T')[0];
    openModal('新增新闻', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editTitle" placeholder="新闻标题">
        </div>
        <div class="form-group">
            <label>标签 (NEW/资讯/政策 等)</label>
            <input type="text" id="editTag" value="NEW">
        </div>
        <div class="form-group">
            <label>日期</label>
            <input type="date" id="editDate" value="${today}">
        </div>
        <div class="form-group">
            <label>链接</label>
            <input type="text" id="editLink" value="#">
        </div>
    `);
});

// ==================== 案例管理 ====================
function renderCases() {
    const list = document.getElementById('casesList');
    if (!allData.cases) return;
    const items = allData.cases.items || [];
    
    list.innerHTML = items.map(item => `
        <div class="list-item">
            <div class="item-thumb">${item.icon || '📌'}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-meta">
                    ${(item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editCase('${item.id}')">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteCase('${item.id}')">删除</button>
            </div>
        </div>
    `).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无案例</p>';
}

window.editCase = function(id) {
    const item = allData.cases.items.find(i => i.id === id);
    if (!item) return;
    currentEditType = 'case';
    currentEditId = id;
    openModal('编辑案例', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editCaseTitle" value="${escapeHtml(item.title || '')}">
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="editCaseSummary" rows="3">${escapeHtml(item.summary || '')}</textarea>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
            <div>
                <label>发布日期</label>
                <input type="date" id="editCaseDate" value="${escapeHtml(item.date || '')}">
            </div>
            <div>
                <label>案例分类</label>
                <input type="text" id="editCaseCategory" value="${escapeHtml(item.category || '')}" placeholder="如：香港高才通">
            </div>
        </div>
        ${imageFieldHtml('editCaseImage', item.image || '', {label: '案例封面图（上传后替换色块）', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>图标 (emoji，未上传图片时显示)</label>
            <input type="text" id="editCaseIcon" value="${escapeHtml(item.icon || '🎉')}">
        </div>
        <div class="form-group">
            <label>背景渐变（未上传图片时生效）</label>
            <input type="text" id="editCaseGradient" value="${escapeHtml(item.gradient || 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)')}">
        </div>
        <div class="form-group">
            <label>标签 (英文逗号分隔)</label>
            <input type="text" id="editCaseTags" value="${escapeHtml((item.tags || []).join(', '))}">
        </div>
        <div class="form-group">
            <label>详情内容</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
    `, true);
    initRichEditor(item.content || '', '在此输入案例详情内容，支持图文混排、字体大小、加粗、插入图片等...');
};

window.deleteCase = async function(id) {
    if (!confirm('确定要删除这个案例吗？')) return;
    try {
        await apiRequest('/cases/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addCaseBtn').addEventListener('click', () => {
    currentEditType = 'case';
    currentEditId = null;
    openModal('新增案例', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editCaseTitle" placeholder="案例标题">
        </div>
        <div class="form-group">
            <label>描述</label>
            <textarea id="editCaseSummary" rows="3" placeholder="案例描述"></textarea>
        </div>
        <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
            <div>
                <label>发布日期</label>
                <input type="date" id="editCaseDate">
            </div>
            <div>
                <label>案例分类</label>
                <input type="text" id="editCaseCategory" placeholder="如：香港高才通">
            </div>
        </div>
        ${imageFieldHtml('editCaseImage', '', {label: '案例封面图（上传后替换色块）', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>图标 (emoji，未上传图片时显示)</label>
            <input type="text" id="editCaseIcon" value="🎉">
        </div>
        <div class="form-group">
            <label>背景渐变（未上传图片时生效）</label>
            <input type="text" id="editCaseGradient" value="linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)">
        </div>
        <div class="form-group">
            <label>标签 (英文逗号分隔)</label>
            <input type="text" id="editCaseTags" placeholder="标签1, 标签2">
        </div>
        <div class="form-group">
            <label>详情内容</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
    `, true);
    initRichEditor('', '在此输入案例详情内容，支持图文混排、字体大小、加粗、插入图片等...');
});

// ==================== 证书管理 ====================
function renderCertificates() {
    const list = document.getElementById('certsList');
    if (!allData.certificates) return;
    const items = allData.certificates.items || [];
    
    list.innerHTML = items.map(item => `
        <div class="list-item">
            <div class="item-thumb">${item.icon || '🏆'}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.title)}</div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editCert('${item.id}')">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteCert('${item.id}')">删除</button>
            </div>
        </div>
    `).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无证书</p>';
}

window.editCert = function(id) {
    const item = allData.certificates.items.find(i => i.id === id);
    if (!item) return;
    currentEditType = 'cert';
    currentEditId = id;
    openModal('编辑证书', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editCertTitle" value="${escapeHtml(item.title || '')}">
        </div>
        <div class="form-group">
            <label>图标 (emoji，图片为空时显示)</label>
            <input type="text" id="editCertIcon" value="${escapeHtml(item.icon || '🏆')}">
        </div>
        ${imageFieldHtml('editCertImage', item.image || '', {label: '证书图片（上传后替换emoji）', suggest: '建议尺寸300x300px'})}
    `);
};

window.deleteCert = async function(id) {
    if (!confirm('确定要删除这个证书吗？')) return;
    try {
        await apiRequest('/certificates/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addCertBtn').addEventListener('click', () => {
    currentEditType = 'cert';
    currentEditId = null;
    openModal('新增证书', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editCertTitle" placeholder="证书名称">
        </div>
        <div class="form-group">
            <label>图标 (emoji，图片为空时显示)</label>
            <input type="text" id="editCertIcon" value="🏆">
        </div>
        ${imageFieldHtml('editCertImage', '', {label: '证书图片（上传后替换emoji）', suggest: '建议尺寸300x300px'})}
    `);
});

// ==================== 国家管理 ====================
function renderCountries() {
    const list = document.getElementById('countriesList');
    if (!list) return;
    const items = allData.countries || [];
    
    list.innerHTML = items.map(item => `
        <div class="list-item">
            <div class="item-thumb">${item.flag ? `<img src="${item.flag}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;">` : '🌍'}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.name)} ${item.nameEn ? '(' + escapeHtml(item.nameEn) + ')' : ''}</div>
                <div class="item-meta">
                    <span class="tag">${escapeHtml(item.code || '无代码')}</span>
                    ${item.priceRange ? `<span>💰 ${escapeHtml(item.priceRange)}</span>` : ''}
                    <span class="tag ${item.status === 'published' ? 'tag-active' : 'tag-inactive'}">${item.status === 'published' ? '激活' : '隐藏'}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editCountry('${item.id}')">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteCountry('${item.id}')">删除</button>
            </div>
        </div>
    `).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无国家数据，点击上方按钮添加</p>';
}

window.editCountry = function(id) {
    const item = allData.countries.find(i => i.id === id);
    if (!item) return;
    currentEditType = 'country';
    currentEditId = id;
    openModal('编辑国家', `
        <div class="form-group">
            <label>国家名称 (中文)</label>
            <input type="text" id="editCountryName" value="${escapeHtml(item.name || '')}">
        </div>
        <div class="form-group">
            <label>国家名称 (英文)</label>
            <input type="text" id="editCountryNameEn" value="${escapeHtml(item.nameEn || '')}">
        </div>
        <div class="form-group">
            <label>国家代码 (如: au, ca, us)</label>
            <input type="text" id="editCountryCode" value="${escapeHtml(item.code || '')}">
        </div>
        ${imageFieldHtml('editCountryFlag', item.flag || '', {label: '国旗图片', suggest: '建议尺寸60x60px'})}
        ${imageFieldHtml('editCountryCover', item.coverImage || item.image || '', {label: '国家封面图（上传后替换色块）', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>描述</label>
            <textarea id="editCountryDesc" rows="3">${escapeHtml(item.description || '')}</textarea>
        </div>
        <div class="form-group">
            <label>价格范围</label>
            <input type="text" id="editCountryPriceRange" value="${escapeHtml(item.priceRange || '')}" placeholder="如: 50万-200万美元">
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="editCountryStatus">
                <option value="published" ${item.status === 'published' ? 'selected' : ''}>激活</option>
                <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>隐藏</option>
            </select>
        </div>
    `);
};

window.deleteCountry = async function(id) {
    if (!confirm('确定要删除这个国家吗？')) return;
    try {
        await apiRequest('/countries/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addCountryBtn').addEventListener('click', () => {
    currentEditType = 'country';
    currentEditId = null;
    openModal('添加国家', `
        <div class="form-group">
            <label>国家名称 (中文)</label>
            <input type="text" id="editCountryName" placeholder="如: 澳大利亚">
        </div>
        <div class="form-group">
            <label>国家名称 (英文)</label>
            <input type="text" id="editCountryNameEn" placeholder="如: Australia">
        </div>
        <div class="form-group">
            <label>国家代码 (如: au, ca, us)</label>
            <input type="text" id="editCountryCode" placeholder="如: au">
        </div>
        ${imageFieldHtml('editCountryFlag', '', {label: '国旗图片', suggest: '建议尺寸60x60px'})}
        ${imageFieldHtml('editCountryCover', '', {label: '国家封面图（上传后替换色块）', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>描述</label>
            <textarea id="editCountryDesc" rows="3" placeholder="国家描述..."></textarea>
        </div>
        <div class="form-group">
            <label>价格范围</label>
            <input type="text" id="editCountryPriceRange" placeholder="如: 50万-200万美元">
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="editCountryStatus">
                <option value="published">激活</option>
                <option value="inactive">隐藏</option>
            </select>
        </div>
    `);
});

// ==================== 项目管理 ====================
function populateProjectCountryFilter() {
    const filter = document.getElementById('projectCountryFilter');
    if (!filter) return;
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">全部国家</option>';
    (allData.countries || []).forEach(c => {
        filter.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
    });
    filter.value = currentVal;
}

function renderProjects() {
    const list = document.getElementById('projectsList');
    if (!list) return;
    populateProjectCountryFilter();
    
    const countryFilter = document.getElementById('projectCountryFilter')?.value || '';
    const categoryFilter = document.getElementById('projectCategoryFilter')?.value || '';
    
    let items = allData.projects || [];
    if (countryFilter) items = items.filter(p => p.countryId === countryFilter);
    if (categoryFilter) items = items.filter(p => p.category === categoryFilter);
    
    list.innerHTML = items.map(item => {
        const country = (allData.countries || []).find(c => c.id === item.countryId);
        const catLabel = { investment: '投资移民', business: '商业移民', skilled: '技术移民' }[item.category] || item.category;
        return `
        <div class="list-item">
            <div class="item-thumb">${item.image ? `<img src="${item.image}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;">` : '📋'}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-meta">
                    ${country ? `<span class="tag">🌍 ${escapeHtml(country.name)}</span>` : ''}
                    <span class="tag">${catLabel}</span>
                    ${item.price ? `<span>💰 ${escapeHtml(item.price)}</span>` : ''}
                    <span class="tag ${item.status === 'published' ? 'tag-active' : 'tag-inactive'}">${item.status === 'published' ? '激活' : '隐藏'}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editProject('${item.id}')">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteProject('${item.id}')">删除</button>
            </div>
        </div>
        `;
    }).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无项目，点击上方按钮添加</p>';
}

document.getElementById('projectCountryFilter').addEventListener('change', renderProjects);
document.getElementById('projectCategoryFilter').addEventListener('change', renderProjects);

function getCountrySelectHtml(selectedId) {
    let html = '<select id="editProjectCountry"><option value="">选择国家</option>';
    (allData.countries || []).forEach(c => {
        html += `<option value="${escapeHtml(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`;
    });
    html += '</select>';
    return html;
}

window.editProject = function(id) {
    const item = allData.projects.find(i => i.id === id);
    if (!item) return;
    currentEditType = 'project';
    currentEditId = id;
    openModal('编辑项目', `
        <div class="form-group">
            <label>项目标题</label>
            <input type="text" id="editProjectTitle" value="${escapeHtml(item.title || '')}">
        </div>
        <div class="form-group">
            <label>Slug</label>
            <input type="text" id="editProjectSlug" value="${escapeHtml(item.slug || '')}">
        </div>
        <div class="form-group">
            <label>所属国家</label>
            ${getCountrySelectHtml(item.countryId)}
        </div>
        <div class="form-group">
            <label>项目分类</label>
            <select id="editProjectCategory">
                <option value="investment" ${item.category === 'investment' ? 'selected' : ''}>投资移民</option>
                <option value="business" ${item.category === 'business' ? 'selected' : ''}>商业移民</option>
                <option value="skilled" ${item.category === 'skilled' ? 'selected' : ''}>技术移民</option>
            </select>
        </div>
        <div class="form-group">
            <label>摘要</label>
            <textarea id="editProjectSummary" rows="3">${escapeHtml(item.summary || '')}</textarea>
        </div>
        <div class="form-group">
            <label>价格</label>
            <input type="text" id="editProjectPrice" value="${escapeHtml(item.price || '')}">
        </div>
        ${imageFieldHtml('editProjectImage', item.image || '', {label: '项目封面图', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>内容</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
        <div class="form-group">
            <label>优势 (英文逗号分隔)</label>
            <textarea id="editProjectAdvantages" rows="2">${escapeHtml((item.advantages || []).join(', '))}</textarea>
        </div>
        <div class="form-group">
            <label>要求 (英文逗号分隔)</label>
            <textarea id="editProjectRequirements" rows="2">${escapeHtml((item.requirements || []).join(', '))}</textarea>
        </div>
        <div class="form-group">
            <label>排序 (数字越小越靠前)</label>
            <input type="number" id="editProjectSortOrder" value="${item.sortOrder || 0}">
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="editProjectStatus">
                <option value="published" ${item.status === 'published' ? 'selected' : ''}>激活</option>
                <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>隐藏</option>
            </select>
        </div>
    `, true);
    initRichEditor(item.content || '', '在此输入项目详情，支持图文混排、字体大小、加粗、插入图片等...');
};

window.deleteProject = async function(id) {
    if (!confirm('确定要删除这个项目吗？')) return;
    try {
        await apiRequest('/projects/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addProjectBtn').addEventListener('click', () => {
    currentEditType = 'project';
    currentEditId = null;
    openModal('添加项目', `
        <div class="form-group">
            <label>项目标题</label>
            <input type="text" id="editProjectTitle" placeholder="项目标题">
        </div>
        <div class="form-group">
            <label>Slug (留空自动生成)</label>
            <input type="text" id="editProjectSlug" placeholder="project-slug">
        </div>
        <div class="form-group">
            <label>所属国家</label>
            ${getCountrySelectHtml('')}
        </div>
        <div class="form-group">
            <label>项目分类</label>
            <select id="editProjectCategory">
                <option value="investment">投资移民</option>
                <option value="business">商业移民</option>
                <option value="skilled">技术移民</option>
            </select>
        </div>
        <div class="form-group">
            <label>摘要</label>
            <textarea id="editProjectSummary" rows="3" placeholder="项目摘要..."></textarea>
        </div>
        <div class="form-group">
            <label>价格</label>
            <input type="text" id="editProjectPrice" placeholder="如: 50万美元">
        </div>
        ${imageFieldHtml('editProjectImage', '', {label: '项目封面图', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>内容</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
        <div class="form-group">
            <label>优势 (英文逗号分隔)</label>
            <textarea id="editProjectAdvantages" rows="2" placeholder="优势1, 优势2"></textarea>
        </div>
        <div class="form-group">
            <label>要求 (英文逗号分隔)</label>
            <textarea id="editProjectRequirements" rows="2" placeholder="要求1, 要求2"></textarea>
        </div>
        <div class="form-group">
            <label>排序</label>
            <input type="number" id="editProjectSortOrder" value="0">
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="editProjectStatus">
                <option value="published">激活</option>
                <option value="inactive">隐藏</option>
            </select>
        </div>
    `, true);
    initRichEditor('', '在此输入项目详情，支持图文混排、字体大小、加粗、插入图片等...');
});

// ==================== 文章管理 ====================
function populateArticleCategoryFilter() {
    const filter = document.getElementById('articleCategoryFilter');
    if (!filter) return;
    const currentVal = filter.value;
    filter.innerHTML = '<option value="">全部分类</option>';
    const cats = allData.categories?.articleCategories || [];
    cats.forEach(c => {
        filter.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
    });
    filter.value = currentVal;
}

function renderArticles() {
    const list = document.getElementById('articlesList');
    if (!list) return;
    populateArticleCategoryFilter();

    const catFilter = document.getElementById('articleCategoryFilter')?.value || '';
    let items = (allData.articles && allData.articles.items) || [];
    if (catFilter) items = items.filter(a => a.category === catFilter);

    // 当前头条槽位占用情况
    const featured = getFeaturedList();
    const slotOf = {};
    featured.forEach((f, idx) => { if (f && f.id) slotOf[f.id] = idx; });

    list.innerHTML = items.map(item => {
        const cat = (allData.categories?.articleCategories || []).find(c => c.id === item.category);
        const currentSlot = slotOf[item.id];
        const inSlot1 = currentSlot === 0;
        const inSlot2 = currentSlot === 1;
        return `
        <div class="list-item" style="${inSlot1 || inSlot2 ? 'border-left:4px solid var(--accent);' : ''}">
            <div class="item-thumb">${item.image ? `<img src="${item.image}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;">` : '📝'}</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(item.title)} ${inSlot1 ? '<span class="tag tag-active">头条1</span>' : ''} ${inSlot2 ? '<span class="tag" style="background:#E85D75;color:#fff;">头条2</span>' : ''}</div>
                <div class="item-meta">
                    ${cat ? `<span class="tag">${escapeHtml(cat.name)}</span>` : ''}
                    ${(item.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                    <span class="tag ${item.status === 'published' ? 'tag-active' : 'tag-inactive'}">${item.status === 'published' ? '激活' : '隐藏'}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editArticle('${item.id}')">编辑</button>
                <button class="btn btn-primary btn-small" onclick="setArticleAsFeatured('${item.id}', 0)" ${inSlot1 ? 'disabled' : ''}>${inSlot1 ? '已置顶1' : '设为头条1'}</button>
                <button class="btn btn-primary btn-small" onclick="setArticleAsFeatured('${item.id}', 1)" ${inSlot2 ? 'disabled' : ''}>${inSlot2 ? '已置顶2' : '设为头条2'}</button>
                <button class="btn btn-danger btn-small" onclick="deleteArticle('${item.id}')">删除</button>
            </div>
        </div>
        `;
    }).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无文章，点击上方按钮添加</p>';
}

// 一键将文章设为头条1 / 头条2
window.setArticleAsFeatured = async function(articleId, slotIndex) {
    slotIndex = Number(slotIndex) || 0;
    if (slotIndex < 0) slotIndex = 0;
    if (slotIndex > 1) slotIndex = 1;

    const items = (allData.articles && allData.articles.items) || [];
    const article = items.find(i => i.id === articleId);
    if (!article) {
        showToast('文章不存在', 'error');
        return;
    }

    // 构建 featured 数据（复制文章核心字段，确保分类标签与文章一致）
    const featuredItem = {
        id: article.id,
        title: article.title,
        slug: article.slug || '',
        category: article.category || '',
        summary: article.summary || '',
        content: article.content || '',
        image: article.image || '',
        tags: Array.isArray(article.tags) ? article.tags : [],
        status: article.status || 'published',
        isFeatured: true,
        createdAt: article.createdAt || '',
        updatedAt: article.updatedAt || '',
        link: `article-detail.html?id=${article.id}`,
        icon: article.icon || '',
        gradient: article.gradient || 'linear-gradient(135deg, #007A8A 0%, #00A8B5 100%)',
        date: article.date || article.createdAt || ''
    };

    // 读取当前 featured 数组，替换指定槽位
    const currentFeatured = getFeaturedList().slice();
    while (currentFeatured.length < 2) currentFeatured.push(null);
    currentFeatured[slotIndex] = featuredItem;

    // 同步标记原文章 isFeatured，避免二次写 articles.json 导致 GitHub 409 冲突
    article.isFeatured = true;
    const payload = {
        featured: currentFeatured.filter(Boolean),
        items: items
    };

    try {
        // 一次性写完整 articles（featured + items），只触发一次 GitHub 提交
        await apiRequest('/articles/featured', { method: 'PUT', body: JSON.stringify(payload) });

        showToast(`已将「${article.title}」设为头条${slotIndex + 1}`);
        await loadAllData();
    } catch (err) {
        showToast('设置头条失败：' + err.message, 'error');
    }
};

document.getElementById('articleCategoryFilter').addEventListener('change', renderArticles);

function getArticleCategorySelectHtml(selectedId) {
    let html = '<select id="editArticleCategory"><option value="">选择分类</option>';
    const cats = allData.categories?.articleCategories || [];
    cats.forEach(c => {
        html += `<option value="${escapeHtml(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`;
    });
    html += '</select>';
    return html;
}

window.editArticle = function(id) {
    const items = (allData.articles && allData.articles.items) || [];
    const item = items.find(i => i.id === id);
    if (!item) return;
    currentEditType = 'article';
    currentEditId = id;
    openModal('编辑文章', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editArticleTitle" value="${escapeHtml(item.title || '')}">
        </div>
        <div class="form-group">
            <label>Slug</label>
            <input type="text" id="editArticleSlug" value="${escapeHtml(item.slug || '')}">
        </div>
        <div class="form-group">
            <label>分类</label>
            ${getArticleCategorySelectHtml(item.category)}
        </div>
        <div class="form-group">
            <label>摘要</label>
            <textarea id="editArticleSummary" rows="3">${escapeHtml(item.summary || '')}</textarea>
        </div>
        <div class="form-group">
            <label>内容</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
        ${imageFieldHtml('editArticleImage', item.image || '', {label: '文章封面图', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>标签 (英文逗号分隔)</label>
            <input type="text" id="editArticleTags" value="${escapeHtml((item.tags || []).join(', '))}">
        </div>
        <div class="form-group">
            <label>发布日期</label>
            <input type="date" id="editArticleDate" value="${escapeHtml(item.createdAt || item.date || '')}">
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="editArticleStatus">
                <option value="published" ${item.status === 'published' ? 'selected' : ''}>激活</option>
                <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>隐藏</option>
            </select>
        </div>
    `, true);
    initRichEditor(item.content || '', '在此输入文章内容，支持图文混排、字体大小、加粗、插入图片等...');
};

window.deleteArticle = async function(id) {
    if (!confirm('确定要删除这篇文章吗？')) return;
    try {
        await apiRequest('/articles/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addArticleBtn').addEventListener('click', () => {
    currentEditType = 'article';
    currentEditId = null;
    openModal('添加文章', `
        <div class="form-group">
            <label>标题</label>
            <input type="text" id="editArticleTitle" placeholder="文章标题">
        </div>
        <div class="form-group">
            <label>Slug (留空自动生成)</label>
            <input type="text" id="editArticleSlug" placeholder="article-slug">
        </div>
        <div class="form-group">
            <label>分类</label>
            ${getArticleCategorySelectHtml('')}
        </div>
        <div class="form-group">
            <label>摘要</label>
            <textarea id="editArticleSummary" rows="3" placeholder="文章摘要..."></textarea>
        </div>
        <div class="form-group">
            <label>内容</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
        ${imageFieldHtml('editArticleImage', '', {label: '文章封面图', suggest: '建议比例16:9'})}
        <div class="form-group">
            <label>标签 (英文逗号分隔)</label>
            <input type="text" id="editArticleTags" placeholder="标签1, 标签2">
        </div>
        <div class="form-group">
            <label>发布日期</label>
            <input type="date" id="editArticleDate" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="editArticleStatus">
                <option value="published">激活</option>
                <option value="inactive">隐藏</option>
            </select>
        </div>
    `, true);
    initRichEditor('', '在此输入文章内容，支持图文混排、字体大小、加粗、插入图片等...');
});

// ==================== 分类管理 ====================
function renderOneCategoryList(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const list = items || [];
    if (list.length === 0) {
        container.innerHTML = '<p class="cat-empty">暂无分类，点击下方按钮添加</p>';
        return;
    }
    container.innerHTML = list.map((c, i) => `
        <div class="cat-row" data-index="${i}">
            <input type="text" class="cat-id" value="${escapeHtml(c.id || '')}" placeholder="英文ID" title="分类英文ID（建议不改）" ${c.id ? '' : ''}>
            <input type="text" class="cat-name" value="${escapeHtml(c.name || '')}" placeholder="分类名称">
            <input type="number" class="cat-sort" value="${c.sortOrder != null ? c.sortOrder : (i + 1)}" title="排序（数字越小越靠前）" style="width: 70px;">
            <button type="button" class="cat-del" title="删除该分类">✕</button>
        </div>
    `).join('');
}

function renderCategories() {
    bindCategoryAddButtons();
    const cats = allData.categories || { projectCategories: [], articleCategories: [] };
    renderOneCategoryList('projectCategoriesList', cats.projectCategories);
    renderOneCategoryList('articleCategoriesList', cats.articleCategories);
}

function collectCategoryRows(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll('.cat-row'));
    const result = [];
    rows.forEach((row, i) => {
        const id = row.querySelector('.cat-id').value.trim();
        const name = row.querySelector('.cat-name').value.trim();
        const sortRaw = row.querySelector('.cat-sort').value.trim();
        if (!name) return; // 名称为空则跳过
        result.push({
            id: id || ('cat-' + Date.now() + '-' + i),
            name: name,
            sortOrder: sortRaw === '' ? (i + 1) : parseInt(sortRaw, 10)
        });
    });
    return result;
}

// 添加分类行（事件委托在初始化时绑定）
let _catButtonsBound = false;
function bindCategoryAddButtons() {
    if (_catButtonsBound) return; // 防止重复绑定
    _catButtonsBound = true;
    const buildRow = () => {
        const div = document.createElement('div');
        div.className = 'cat-row';
        div.innerHTML = '<input type="text" class="cat-id" placeholder="英文ID" title="分类英文ID"><input type="text" class="cat-name" placeholder="分类名称"><input type="number" class="cat-sort" value="99" title="排序" style="width:70px;"><button type="button" class="cat-del" title="删除该分类">✕</button>';
        return div;
    };
    const addProj = document.getElementById('addProjectCatBtn');
    const addArt = document.getElementById('addArticleCatBtn');
    if (addProj) {
        addProj.addEventListener('click', () => {
            document.getElementById('projectCategoriesList').appendChild(buildRow());
        });
    }
    if (addArt) {
        addArt.addEventListener('click', () => {
            document.getElementById('articleCategoriesList').appendChild(buildRow());
        });
    }
    // 删除行（事件委托，整个 document 只绑一次）
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('cat-del')) {
            const row = e.target.closest('.cat-row');
            if (row) row.remove();
        }
    });
}

document.getElementById('saveCategoriesBtn').addEventListener('click', async () => {
    try {
        const projectCategories = collectCategoryRows('projectCategoriesList');
        const articleCategories = collectCategoryRows('articleCategoriesList');

        await apiRequest('/categories', {
            method: 'PUT',
            body: JSON.stringify({ projectCategories, articleCategories })
        });
        showToast('分类保存成功');
        await loadAllData();
    } catch (err) {
        showToast('保存失败：' + err.message, 'error');
    }
});

// ==================== 用户管理 ====================
function renderUsers() {
    const list = document.getElementById('usersList');
    if (!list) return;
    const items = allData.users || [];

    if (items.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无用户，点击上方按钮添加</p>';
        return;
    }

    list.innerHTML = items.map(user => `
        <div class="list-item">
            <div class="item-thumb">👤</div>
            <div class="item-content">
                <div class="item-title">${escapeHtml(user.username)}</div>
                <div class="item-meta">
                    <span class="tag">${escapeHtml(user.role || 'admin')}</span>
                    <span>创建于 ${user.createdAt || '—'}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editUser('${user.id}')">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteUser('${user.id}')">删除</button>
            </div>
        </div>
    `).join('');
}

window.editUser = function(id) {
    const user = allData.users.find(u => u.id === id);
    if (!user) return;
    currentEditType = 'user';
    currentEditId = id;
    openModal('编辑用户', `
        <div class="form-group">
            <label>账号</label>
            <input type="text" id="editUserUsername" value="${escapeHtml(user.username)}">
        </div>
        <div class="form-group">
            <label>新密码（留空表示不修改）</label>
            <input type="password" id="editUserPassword" placeholder="不修改请留空">
        </div>
        <div class="form-group">
            <label>角色</label>
            <select id="editUserRole">
                <option value="admin" ${(user.role || 'admin') === 'admin' ? 'selected' : ''}>管理员</option>
            </select>
        </div>
    `);
};

window.deleteUser = async function(id) {
    if (!confirm('确定要删除该用户吗？')) return;
    try {
        await apiRequest('/users/' + id, { method: 'DELETE' });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败：' + err.message, 'error');
    }
};

document.getElementById('addUserBtn').addEventListener('click', () => {
    currentEditType = 'user';
    currentEditId = null;
    openModal('新增用户', `
        <div class="form-group">
            <label>账号</label>
            <input type="text" id="editUserUsername" placeholder="请输入账号">
        </div>
        <div class="form-group">
            <label>密码</label>
            <input type="password" id="editUserPassword" placeholder="请输入密码">
        </div>
        <div class="form-group">
            <label>角色</label>
            <select id="editUserRole">
                <option value="admin">管理员</option>
            </select>
        </div>
    `);
});

// ==================== 客户咨询 ====================
async function renderLeads() {
    const list = document.getElementById('leadsList');
    if (!list) return;
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载中...</p>';
    try {
        const res = await apiRequest('/leads');
        const leads = res.data || [];
        const filter = document.getElementById('leadStatusFilter');
        const status = filter ? filter.value : '';
        const filtered = status ? leads.filter(l => l.status === status) : leads;
        if (!filtered.length) {
            list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">暂无客户咨询</p>';
            return;
        }
        list.innerHTML = filtered.map(item => `
            <div class="list-item">
                <div class="item-thumb">📋</div>
                <div class="item-content">
                    <div class="item-title">${escapeHtml(item.name)} <span class="tag ${item.status === 'pending' ? 'tag-warning' : 'tag-success'}">${item.status === 'pending' ? '待跟进' : '已处理'}</span></div>
                    <div class="item-meta">
                        <span>电话：${escapeHtml(item.phone)}</span>
                        <span>意向国家：${escapeHtml(item.country || '未选择')}</span>
                        <span>提交时间：${escapeHtml(item.createdAt)}</span>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-default btn-small" onclick="viewLead(${item.id})">查看详情</button>
                    <button class="btn btn-${item.status === 'pending' ? 'success' : 'warning'} btn-small" onclick="toggleLeadStatus(${item.id}, '${item.status}')">${item.status === 'pending' ? '标记已处理' : '标记待跟进'}</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">加载失败：' + escapeHtml(err.message) + '</p>';
    }
}

window.viewLead = async function(id) {
    try {
        const res = await apiRequest('/leads/' + id);
        const item = res.data;
        openModal('客户咨询详情', `
            <div class="form-group">
                <label>姓名</label>
                <input type="text" value="${escapeHtml(item.name)}" readonly>
            </div>
            <div class="form-group">
                <label>电话</label>
                <input type="text" value="${escapeHtml(item.phone)}" readonly>
            </div>
            <div class="form-group">
                <label>意向国家</label>
                <input type="text" value="${escapeHtml(item.country || '未选择')}" readonly>
            </div>
            <div class="form-group">
                <label>提交时间</label>
                <input type="text" value="${escapeHtml(item.createdAt)}" readonly>
            </div>
            <div class="form-group">
                <label>当前状态</label>
                <input type="text" value="${item.status === 'pending' ? '待跟进' : '已处理'}" readonly>
            </div>
            <div class="form-group">
                <label>跟进备注</label>
                <textarea id="leadNote" rows="4" placeholder="记录跟进情况..."></textarea>
            </div>
            <div class="form-group">
                <button class="btn btn-primary" onclick="saveLeadNote(${item.id})">保存备注</button>
                <a href="${escapeHtml(item.url)}" target="_blank" class="btn btn-default" style="margin-left:10px;">在 GitHub 查看</a>
            </div>
            <hr style="margin:16px 0;border:0;border-top:1px solid var(--border);">
            <div style="font-size:13px;color:var(--text-light);white-space:pre-wrap;">${escapeHtml(item.body)}</div>
        `);
    } catch (err) {
        showToast('读取详情失败：' + err.message, 'error');
    }
};

window.toggleLeadStatus = async function(id, currentStatus) {
    const nextStatus = currentStatus === 'pending' ? 'done' : 'pending';
    const label = nextStatus === 'done' ? '已处理' : '待跟进';
    if (!confirm('确定要标记为「' + label + '」吗？')) return;
    try {
        await apiRequest('/leads/' + id, { method: 'PUT', body: JSON.stringify({ status: nextStatus }) });
        showToast('已标记为' + label);
        await renderLeads();
    } catch (err) {
        showToast('操作失败：' + err.message, 'error');
    }
};

window.saveLeadNote = async function(id) {
    const note = document.getElementById('leadNote');
    if (!note || !note.value.trim()) {
        showToast('请输入备注内容', 'warning');
        return;
    }
    try {
        await apiRequest('/leads/' + id, { method: 'PUT', body: JSON.stringify({ note: note.value.trim() }) });
        showToast('备注保存成功');
        closeModal();
        await renderLeads();
    } catch (err) {
        showToast('保存失败：' + err.message, 'error');
    }
};

document.getElementById('leadStatusFilter') && document.getElementById('leadStatusFilter').addEventListener('change', renderLeads);
document.getElementById('refreshLeadsBtn') && document.getElementById('refreshLeadsBtn').addEventListener('click', renderLeads);

// ==================== 轮播管理 ====================
function renderBanners() {
    const list = document.getElementById('bannersList');
    if (!allData.config) return;
    const items = allData.config.slides || [];
    
    list.innerHTML = items.map((item, index) => `
        <div class="list-item">
            <div class="item-thumb">
                ${item.image ? `<img src="${item.image}" alt="">` : '🖼️'}
            </div>
            <div class="item-content">
                <div class="item-title">[轮播${index + 1}] ${escapeHtml(item.title)}</div>
                <div class="item-meta">
                    <span class="tag">${escapeHtml(item.buttonText)}</span>
                    <span>${escapeHtml(item.buttonLink)}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn btn-default btn-small" onclick="editBanner(${index})">编辑</button>
                <button class="btn btn-danger btn-small" onclick="deleteBanner(${index})">删除</button>
            </div>
        </div>
    `).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px;">暂无轮播图</p>';
}

window.editBanner = function(index) {
    const item = allData.config.slides[index];
    if (!item) return;
    currentEditType = 'banner';
    currentEditId = index;
    openModal('编辑轮播图', `
        <div class="form-group">
            <label>主标题</label>
            <input type="text" id="editBannerTitle" value="${escapeHtml(item.title || '')}">
        </div>
        <div class="form-group">
            <label>副标题</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
        <div class="form-group">
            <label>按钮文字</label>
            <input type="text" id="editBannerBtnText" value="${escapeHtml(item.buttonText || '')}">
        </div>
        <div class="form-group">
            <label>按钮链接</label>
            <input type="text" id="editBannerBtnLink" value="${escapeHtml(item.buttonLink || '#')}">
        </div>
        ${imageFieldHtml('editBannerImage', item.image || '', {label: '背景图', suggest: '建议尺寸1920x1080px (16:9)', aspectRatio: 16/9})}
    `, true);
    initRichEditor(item.subtitle || '', '在此输入副标题，支持字体大小、加粗、斜体、插入图片等...');
};

window.deleteBanner = async function(index) {
    if (!confirm('确定要删除这个轮播吗？')) return;
    try {
        allData.config.slides.splice(index, 1);
        await apiRequest('/config', {
            method: 'PUT',
            body: JSON.stringify(allData.config)
        });
        showToast('删除成功');
        await loadAllData();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('addBannerBtn').addEventListener('click', () => {
    currentEditType = 'banner';
    currentEditId = null;
    openModal('新增轮播图', `
        <div class="form-group">
            <label>主标题</label>
            <input type="text" id="editBannerTitle" placeholder="主标题">
        </div>
        <div class="form-group">
            <label>副标题</label>
            <div class="rich-editor">${richEditorToolbarHtml()}</div>
        </div>
        <div class="form-group">
            <label>按钮文字</label>
            <input type="text" id="editBannerBtnText" value="立即了解">
        </div>
        <div class="form-group">
            <label>按钮链接</label>
            <input type="text" id="editBannerBtnLink" value="#contact">
        </div>
        ${imageFieldHtml('editBannerImage', '', {label: '背景图', suggest: '建议尺寸1920x1080px (16:9)', aspectRatio: 16/9})}
    `, true);
    initRichEditor('', '在此输入副标题，支持字体大小、加粗、斜体、插入图片等...');
});

// ==================== 图片管理 ====================
let allImages = [];

async function renderImages() {
    try {
        const result = await apiRequest('/images');
        allImages = result.data || [];
        const grid = document.getElementById('imageGrid');
        grid.innerHTML = allImages.map(img => `
            <div class="image-card">
                <img src="${img.url}" alt="${escapeHtml(img.name)}" loading="lazy">
                <div class="image-actions">
                    <button class="image-action-btn" onclick="copyImageUrl('${img.url}')" title="复制链接">📋</button>
                    <button class="image-action-btn danger" onclick="deleteImage('${img.name}')" title="删除">🗑️</button>
                </div>
                <div class="image-info">
                    <span class="name" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</span>
                    <span>${formatSize(img.size)}</span>
                </div>
            </div>
        `).join('') || '<p style="text-align: center; color: var(--text-muted); padding: 40px; grid-column: 1/-1;">暂无图片</p>';
    } catch (err) {
        showToast('加载图片失败', 'error');
    }
}

window.copyImageUrl = function(url) {
    const fullUrl = window.location.origin + url;
    navigator.clipboard.writeText(fullUrl).then(() => {
        showToast('链接已复制');
    }).catch(() => {
        showToast('复制失败，请手动复制', 'error');
    });
};

window.deleteImage = async function(name) {
    if (!confirm('确定要删除这张图片吗？此操作不可恢复！')) return;
    try {
        await apiRequest('/images/' + encodeURIComponent(name), { method: 'DELETE' });
        showToast('删除成功');
        await renderImages();
    } catch (err) {
        showToast('删除失败', 'error');
    }
};

document.getElementById('imageUpload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
        try {
            const result = await GitHubBackend.ghUploadImageBlob(file, file.name, file.type);
            if (result.success) {
                showToast(`已上传：${file.name}`);
            } else {
                showToast('上传失败：' + (result.message || ''), 'error');
            }
        } catch (err) {
            showToast('上传失败：' + err.message, 'error');
        }
    }
    e.target.value = '';
    await renderImages();
    updateDashboard();
});

// ==================== 站点设置 ====================
function loadSettings() {
    if (!allData.config || !allData.config.site) return;
    const s = allData.config.site;
    document.getElementById('siteName').value = s.name || '';
    document.getElementById('siteTitle').value = s.title || '';
    document.getElementById('siteDescription').value = s.description || '';
    document.getElementById('siteKeywords').value = s.keywords || '';
    document.getElementById('hotlineLabel').value = s.hotlineLabel || '';
    document.getElementById('hotline1').value = s.hotline1 || '';
    document.getElementById('hotline2').value = s.hotline2 || '';
    
    const services = allData.config.services || {};
    document.getElementById('servicesTitle').value = services.title || '';
    document.getElementById('servicesSubtitle').value = services.subtitle || '';
    document.getElementById('servicesMoreLink').value = services.moreLink || '';
    document.getElementById('servicesJson').value = JSON.stringify(services.items || [], null, 2);
    
    const about = allData.config.about || {};
    document.getElementById('aboutTitle').value = about.title || '';
    document.getElementById('aboutParagraphsJson').value = JSON.stringify(about.paragraphs || [], null, 2);
    document.getElementById('aboutStatsJson').value = JSON.stringify(about.stats || [], null, 2);
    document.getElementById('aboutImageIcon').value = about.imageIcon || '';
    // 加载关于我们图片预览
    const aboutImageInput = document.getElementById('aboutImage');
    const aboutImagePreview = document.getElementById('aboutImagePreview');
    if (about.image && aboutImageInput && aboutImagePreview) {
        aboutImageInput.value = about.image;
        aboutImagePreview.innerHTML = `<img src="${about.image}" style="width:100%;height:100%;object-fit:cover;">`;
    } else if (aboutImagePreview) {
        aboutImagePreview.innerHTML = '<span style="color:#999;">未上传图片</span>';
    }
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    let servicesItems, aboutParagraphs, aboutStats;
    try {
        servicesItems = JSON.parse(document.getElementById('servicesJson').value || '[]');
        aboutParagraphs = JSON.parse(document.getElementById('aboutParagraphsJson').value || '[]');
        aboutStats = JSON.parse(document.getElementById('aboutStatsJson').value || '[]');
    } catch (e) {
        return showToast('JSON 格式错误，请检查服务或关于我们配置', 'error');
    }
    
    allData.config.site = {
        name: document.getElementById('siteName').value,
        title: document.getElementById('siteTitle').value,
        description: document.getElementById('siteDescription').value,
        keywords: document.getElementById('siteKeywords').value,
        hotlineLabel: document.getElementById('hotlineLabel').value,
        hotline1: document.getElementById('hotline1').value,
        hotline2: document.getElementById('hotline2').value
    };
    allData.config.services = {
        title: document.getElementById('servicesTitle').value,
        subtitle: document.getElementById('servicesSubtitle').value,
        moreLink: document.getElementById('servicesMoreLink').value,
        items: servicesItems
    };
    allData.config.about = {
        title: document.getElementById('aboutTitle').value,
        paragraphs: aboutParagraphs,
        stats: aboutStats,
        imageIcon: document.getElementById('aboutImageIcon').value,
        image: document.getElementById('aboutImage')?.value || ''
    };
    try {
        await apiRequest('/config', {
            method: 'PUT',
            body: JSON.stringify(allData.config)
        });
        showToast('保存成功');
    } catch (err) {
        showToast('保存失败', 'error');
    }
});

// ==================== 弹窗 ====================
function openModal(title, html, wide = false) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    const modalContent = document.querySelector('#editModal .modal-content');
    if (modalContent) {
        modalContent.classList.toggle('wide', wide);
    }
    document.getElementById('editModal').classList.add('show');
}

function closeModal() {
    document.getElementById('editModal').classList.remove('show');
    currentRichEditor = null;
    clearSelectedImage();
    currentEditType = null;
    currentEditId = null;
    const modalContent = document.querySelector('#editModal .modal-content');
    if (modalContent) modalContent.classList.remove('wide');
}

document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeModal();
});

let isSaving = false;
document.getElementById('modalSaveBtn').addEventListener('click', async () => {
    if (isSaving) return;
    isSaving = true;
    const saveBtn = document.getElementById('modalSaveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '保存中...';
    saveBtn.disabled = true;
    try {
        if (currentEditType === 'news') {
            const data = {
                title: document.getElementById('editTitle').value,
                tag: document.getElementById('editTag').value,
                date: document.getElementById('editDate').value,
                link: document.getElementById('editLink').value
            };
            if (!data.title) return showToast('请输入标题', 'warning');
            if (currentEditId) {
                await apiRequest('/news/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/news', { method: 'POST', body: JSON.stringify(data) });
            }
        } else if (currentEditType === 'article-featured') {
            // 头条文章：合并原始数据 + 编辑器字段，写入 articles.featured
            // currentEditId 此时存的是头条下标 (0/1)
            const slotIndex = Number(currentEditId) || 0;
            const list = (window._editingFeaturedList && window._editingFeaturedList.length)
                ? window._editingFeaturedList.slice()
                : [];
            // 确保数组至少有 slotIndex+1 个槽位
            while (list.length < slotIndex + 1) list.push(null);
            const original = list[slotIndex] || window._editingFeatured || {};
            const updated = {
                ...original,
                title: document.getElementById('editTitle').value,
                summary: document.getElementById('editSummary').value,
                image: document.getElementById('editFeaturedImage')?.value || '',
                icon: document.getElementById('editIcon').value,
                gradient: document.getElementById('editGradient').value,
                link: document.getElementById('editLink').value,
                date: document.getElementById('editDate').value,
                isFeatured: true,
                status: original.status || 'published',
                updatedAt: new Date().toISOString().split('T')[0]
            };
            // 自动保证 id 存在（id 与 items.id 不重复）
            if (!updated.id) updated.id = 'a-featured-' + (slotIndex + 1);
            // 自动生成 slug（如果缺失）
            if (!updated.slug) {
                updated.slug = (updated.title || ('featured-' + (slotIndex + 1)))
                    .toLowerCase()
                    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 60);
            }
            list[slotIndex] = updated;
            // 清理 null 槽位后再发（最多 2 条）
            const payload = list.filter(Boolean).slice(0, 2);
            await apiRequest('/articles/featured', { method: 'PUT', body: JSON.stringify(payload) });
            window._editingFeatured = null;
            window._editingFeaturedList = null;
        } else if (currentEditType === 'case') {
            const data = {
                title: document.getElementById('editCaseTitle').value,
                summary: document.getElementById('editCaseSummary').value,
                date: document.getElementById('editCaseDate').value,
                category: document.getElementById('editCaseCategory').value,
                image: document.getElementById('editCaseImage')?.value || '',
                icon: document.getElementById('editCaseIcon').value,
                gradient: document.getElementById('editCaseGradient').value,
                tags: document.getElementById('editCaseTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                content: getRichEditorHtml()
            };
            if (!data.title) return showToast('请输入标题', 'warning');
            if (currentEditId) {
                await apiRequest('/cases/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/cases', { method: 'POST', body: JSON.stringify(data) });
            }
        } else if (currentEditType === 'cert') {
            const data = {
                title: document.getElementById('editCertTitle').value,
                icon: document.getElementById('editCertIcon').value,
                image: document.getElementById('editCertImage')?.value || ''
            };
            if (!data.title) return showToast('请输入标题', 'warning');
            if (currentEditId) {
                await apiRequest('/certificates/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/certificates', { method: 'POST', body: JSON.stringify(data) });
            }
        } else if (currentEditType === 'banner') {
            const data = {
                title: document.getElementById('editBannerTitle').value,
                subtitle: getRichEditorHtml(),
                buttonText: document.getElementById('editBannerBtnText').value,
                buttonLink: document.getElementById('editBannerBtnLink').value,
                image: document.getElementById('editBannerImage').value
            };
            if (currentEditId !== null && currentEditId >= 0) {
                allData.config.slides[currentEditId] = { ...allData.config.slides[currentEditId], ...data };
            } else {
                allData.config.slides = allData.config.slides || [];
                allData.config.slides.push(data);
            }
            await apiRequest('/config', { method: 'PUT', body: JSON.stringify(allData.config) });
        } else if (currentEditType === 'country') {
            const data = {
                name: document.getElementById('editCountryName').value,
                nameEn: document.getElementById('editCountryNameEn').value,
                code: document.getElementById('editCountryCode').value,
                flag: document.getElementById('editCountryFlag')?.value || '',
                coverImage: document.getElementById('editCountryCover')?.value || '',
                description: document.getElementById('editCountryDesc').value,
                priceRange: document.getElementById('editCountryPriceRange').value,
                status: document.getElementById('editCountryStatus').value
            };
            if (!data.name) return showToast('请输入国家名称', 'warning');
            if (!data.code) return showToast('请输入国家代码', 'warning');
            if (currentEditId) {
                await apiRequest('/countries/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/countries', { method: 'POST', body: JSON.stringify(data) });
            }
        } else if (currentEditType === 'project') {
            const data = {
                title: document.getElementById('editProjectTitle').value,
                slug: document.getElementById('editProjectSlug').value,
                countryId: document.getElementById('editProjectCountry').value,
                category: document.getElementById('editProjectCategory').value,
                summary: document.getElementById('editProjectSummary').value,
                price: document.getElementById('editProjectPrice').value,
                image: document.getElementById('editProjectImage').value,
                content: getRichEditorHtml(),
                advantages: document.getElementById('editProjectAdvantages').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                requirements: document.getElementById('editProjectRequirements').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                sortOrder: parseInt(document.getElementById('editProjectSortOrder').value) || 0,
                status: document.getElementById('editProjectStatus').value
            };
            if (!data.title) return showToast('请输入项目标题', 'warning');
            if (!data.countryId) return showToast('请选择所属国家', 'warning');
            if (currentEditId) {
                await apiRequest('/projects/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/projects', { method: 'POST', body: JSON.stringify(data) });
            }
        } else if (currentEditType === 'article') {
            const dateInput = document.getElementById('editArticleDate').value;
            const data = {
                title: document.getElementById('editArticleTitle').value,
                slug: document.getElementById('editArticleSlug').value,
                category: document.getElementById('editArticleCategory').value,
                summary: document.getElementById('editArticleSummary').value,
                content: getRichEditorHtml(),
                image: document.getElementById('editArticleImage').value,
                tags: document.getElementById('editArticleTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
                status: document.getElementById('editArticleStatus').value,
                createdAt: dateInput || (currentEditId ? undefined : new Date().toISOString().split('T')[0])
            };
            if (!data.title) return showToast('请输入文章标题', 'warning');
            if (currentEditId) {
                await apiRequest('/articles/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/articles', { method: 'POST', body: JSON.stringify(data) });
            }
        } else if (currentEditType === 'user') {
            const data = {
                username: document.getElementById('editUserUsername').value.trim(),
                password: document.getElementById('editUserPassword').value,
                role: document.getElementById('editUserRole').value
            };
            if (!data.username) return showToast('请输入账号', 'warning');
            if (!currentEditId && !data.password) return showToast('请输入密码', 'warning');
            if (currentEditId) {
                await apiRequest('/users/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await apiRequest('/users', { method: 'POST', body: JSON.stringify(data) });
            }
        }
        
        showToast('保存成功');
        closeModal();
        await loadAllData();
    } catch (err) {
        showToast('保存失败：' + err.message, 'error');
    } finally {
        isSaving = false;
        if (saveBtn) {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    }
});

// 关于我们图片上传监听
document.addEventListener('DOMContentLoaded', () => {
    const aboutImageUpload = document.getElementById('aboutImageUpload');
    if (aboutImageUpload) {
        aboutImageUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const url = await openImageCropper({ file, aspectRatio: 16/9 });
                const aboutImageInput = document.getElementById('aboutImage');
                const aboutImagePreview = document.getElementById('aboutImagePreview');
                if (aboutImageInput) aboutImageInput.value = url;
                if (aboutImagePreview) {
                    aboutImagePreview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
                }
            } catch (err) {}
            e.target.value = '';
        });
    }

    // 图片裁剪取消按钮
    const cropperCancel = document.getElementById('cropperCancelBtn');
    if (cropperCancel) {
        cropperCancel.addEventListener('click', closeImageCropper);
    }
});

// 初始化
checkAuth();
