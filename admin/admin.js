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
// 保存后尚未被后台刷新确认的乐观文章（避免 GitHub 读取缓存导致列表闪烁/丢失）
let pendingArticles = {};
// 保存后尚未被后台刷新确认的站点配置（避免 GitHub 读取缓存导致设置被旧数据覆盖）
let pendingConfig = null;
let pendingConfigSavedAt = 0;
const PENDING_CONFIG_TTL = 5 * 60 * 1000; // 5 分钟内若读到旧缓存仍用本地乐观配置覆盖

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

function debounce(fn, wait) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
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

        const result = await uploadImageBlob(blob, cropperFile.name, format);
        closeImageCropper();
        if (cb) cb.resolve(result);
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
    // 返回对象：url 是相对路径（保存到数据库用），previewUrl 是 GitHub raw URL（编辑器即时预览用）
    return result.data;
}

// 把相对路径转成 GitHub raw URL，供后台图片字段即时预览（避免 file:// 或 Pages 子目录下破图）
function toPreviewUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
    const p = url.startsWith('/') ? url : '/' + url;
    return `https://raw.githubusercontent.com/fengdlwxy-sudo/websit/main${p}`;
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
    const previewUrl = toPreviewUrl(value);
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
        const uploadResult = await openImageCropper({ file, ...options });
        const url = uploadResult?.url || uploadResult;
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
            const previewUrl = toPreviewUrl(url);
            preview.innerHTML = `<img src="${previewUrl}" alt="预览"><div class="image-field-tag image-field-tag-success">已上传</div>`;
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
let selectedImageRatio = null;      // 选中图片的原始宽高比
let ratioLockEnabled = true;        // 是否锁定宽高比

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
        <div class="toolbar-group">
            <button type="button" onclick="richEditorInsertVideo()" title="插入视频">🎬 视频</button>
            <button type="button" onclick="richEditorToggleSource()" title="HTML 源码"><> 源码</button>
            <button type="button" onclick="richEditorTogglePreview()" title="预览">👁 预览</button>
            <button type="button" onclick="richEditorToggleFullscreen()" title="全屏">⛶ 全屏</button>
            <button type="button" onclick="richEditorClearContent()" title="清空内容">🗑 清空</button>
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
            <span>宽:</span><input type="number" id="editorImgWidth" oninput="updateSelectedImageSize('width')">
            <span>高:</span><input type="number" id="editorImgHeight" oninput="updateSelectedImageSize('height')">
            <label class="ratio-lock" title="锁定宽高比">
                <input type="checkbox" id="editorImgRatioLock" checked onchange="toggleImageRatioLock()">
                <span id="editorImgRatioLockIcon">🔒</span>
            </label>
            <button type="button" class="btn btn-default btn-small" onclick="setImageWidthPercent(25)">25%</button>
            <button type="button" class="btn btn-default btn-small" onclick="setImageWidthPercent(50)">50%</button>
            <button type="button" class="btn btn-default btn-small" onclick="setImageWidthPercent(75)">75%</button>
            <button type="button" class="btn btn-default btn-small" onclick="setImageWidthPercent(100)">100%</button>
            <button type="button" class="btn btn-default btn-small" onclick="setImageAlign('left')" title="左对齐">⬅</button>
            <button type="button" class="btn btn-default btn-small" onclick="setImageAlign('center')" title="居中">↔</button>
            <button type="button" class="btn btn-default btn-small" onclick="setImageAlign('right')" title="右对齐">➡</button>
            <button type="button" class="btn btn-default btn-small" onclick="clearSelectedImage()">取消选择</button>
        </div>
        <span class="editor-word-count" id="editorWordCount">0 字</span>
    </div>
    `;
}

function initRichEditor(initialHtml = '', placeholder = '') {
    currentRichEditor = document.getElementById('richEditorContent');
    if (!currentRichEditor) return;
    currentRichEditor.innerHTML = initialHtml || '';
    if (placeholder) currentRichEditor.setAttribute('data-placeholder', placeholder);
    setupImageResize(currentRichEditor);
    updateWordCount();
    if (currentRichEditor._editorEventsBound) return;
    currentRichEditor._editorEventsBound = true;
    // 输入时实时统计字数
    currentRichEditor.addEventListener('input', updateWordCount);
    // 粘贴处理：支持从微信公众号等来源一键复制图文，图片自动保留并绕过防盗链
    currentRichEditor.addEventListener('paste', handleRichEditorPaste);
    // 图片加载失败时给标记，方便用户识别
    currentRichEditor.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG') {
            e.target.setAttribute('data-loading-error', '1');
        }
    }, true);
    currentRichEditor.addEventListener('load', (e) => {
        if (e.target.tagName === 'IMG') {
            e.target.removeAttribute('data-loading-error');
        }
    }, true);
    // 选中图片后，浮层工具栏随内容/窗口滚动重新定位
    const repositionFloatTb = () => positionImageFloatToolbar();
    currentRichEditor.addEventListener('scroll', repositionFloatTb, true);
    window.addEventListener('resize', repositionFloatTb);
    window.addEventListener('scroll', repositionFloatTb, true);
}

/**
 * 智能粘贴：从微信公众号/网页复制图文时，图片也能一并进来并显示。
 * - 微信懒加载图片：真实地址在 data-src / data-original / data-lazy-src，转正到 src
 * - 外链图片（如微信 qpic）：加 referrerpolicy="no-referrer" 绕过防盗链，前台可直接显示
 * - 清理 script/style/link 等冗余与潜在危险标签
 */
function handleRichEditorPaste(e) {
    if (!currentRichEditor) return;
    const cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    const html = cd.getData('text/html');
    if (!html || !html.trim()) return; // 纯文本/无 HTML 走浏览器默认粘贴
    e.preventDefault();

    const tpl = document.createElement('div');
    tpl.innerHTML = html;

    tpl.querySelectorAll('img').forEach(img => {
        // 微信等平台常用 data-src 存放真实图片地址
        const realSrc = img.getAttribute('data-src')
            || img.getAttribute('data-original')
            || img.getAttribute('data-lazy-src');
        if (realSrc) {
            img.setAttribute('src', realSrc);
        }
        ['data-src', 'data-original', 'data-lazy-src'].forEach(a => img.removeAttribute(a));
        // 清理内联事件，避免 XSS 与重复加载逻辑
        img.removeAttribute('onerror');
        img.removeAttribute('onload');
        img.removeAttribute('onclick');

        const src = (img.getAttribute('src') || '').trim();
        if (/^https?:\/\//i.test(src)) {
            // 外链图片（微信 qpic 等）加 no-referrer 绕过防盗链，前台可直接显示
            img.setAttribute('referrerpolicy', 'no-referrer');
        }
        // 自适应，避免超大图撑破布局
        const cur = img.getAttribute('style') || '';
        img.setAttribute('style', (cur + ';max-width:100%;height:auto;').replace(/;;+/g, ';'));
    });

    // 移除潜在危险的脚本/样式/link 标签（微信冗余样式与脚本）
    tpl.querySelectorAll('script, style, link').forEach(el => el.remove());

    const content = tpl.innerHTML;
    currentRichEditor.focus();
    const ok = document.execCommand('insertHTML', false, content);
    if (!ok) {
        currentRichEditor.insertAdjacentHTML('beforeend', content);
    }
    updateWordCount();
    positionImageFloatToolbar();
}

function getRichEditorHtml() {
    // 移除选中状态，避免保存选中样式
    clearSelectedImage();
    if (!currentRichEditor) return '';

    // 如果在源码模式，先把 textarea 内容同步回编辑器
    const sourceArea = document.getElementById('richEditorSourceArea');
    if (sourceArea) {
        currentRichEditor.innerHTML = sourceArea.value;
        richEditorToggleSource();
    }
    // 如果在预览模式，先退出
    if (richEditorPreviewMode) {
        richEditorTogglePreview();
    }

    // 克隆节点，把编辑器里的 GitHub raw 预览 URL 替换回相对路径，避免数据库保存外链
    const clone = currentRichEditor.cloneNode(true);
    clone.querySelectorAll('img').forEach(img => {
        const original = img.getAttribute('data-original-src');
        if (original) {
            img.setAttribute('src', original);
            img.removeAttribute('data-original-src');
        }
        // 兜底：直接把 raw.githubusercontent.com 的 URL 统一替换为相对路径
        const src = img.getAttribute('src') || '';
        const rawMatch = src.match(/https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+(\/assets\/images\/uploads\/[^?#]+)/);
        if (rawMatch) {
            img.setAttribute('src', rawMatch[1]);
        }
        // 移除编辑器内部选中样式和错误标记
        img.classList.remove('selected');
        img.style.outline = '';
        img.removeAttribute('data-loading-error');
    });
    return clone.innerHTML;
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

function richEditorInsertVideo() {
    if (!currentRichEditor) return;
    const url = prompt('请输入视频地址（支持哔哩哔哩、腾讯视频、YouTube 等 iframe 嵌入链接）：', 'https://');
    if (!url) return;
    let embedHtml = '';
    // 哔哩哔哩
    const bvidMatch = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
    if (bvidMatch) {
        embedHtml = `<iframe src="https://player.bilibili.com/player.html?bvid=${bvidMatch[1]}&page=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width:100%;height:360px;border-radius:8px;margin:12px 0;display:block;"></iframe>`;
    }
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/i);
    if (ytMatch) {
        embedHtml = `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:360px;border-radius:8px;margin:12px 0;display:block;"></iframe>`;
    }
    // 默认用 iframe 包裹
    if (!embedHtml) {
        embedHtml = `<iframe src="${escapeHtml(url)}" frameborder="0" allowfullscreen style="width:100%;height:360px;border-radius:8px;margin:12px 0;display:block;"></iframe>`;
    }
    currentRichEditor.focus();
    document.execCommand('insertHTML', false, embedHtml + '<p><br></p>');
    showToast('视频已插入', 'success');
}

let richEditorSourceMode = false;
let richEditorSourceBackup = '';

function richEditorToggleSource() {
    if (!currentRichEditor) return;
    clearSelectedImage();
    richEditorSourceMode = !richEditorSourceMode;
    const toolbar = currentRichEditor.previousElementSibling;
    if (richEditorSourceMode) {
        richEditorSourceBackup = currentRichEditor.innerHTML;
        currentRichEditor.setAttribute('contenteditable', 'false');
        // 用一个 textarea 展示源码
        const ta = document.createElement('textarea');
        ta.id = 'richEditorSourceArea';
        ta.className = 'rich-editor-source';
        ta.value = richEditorSourceBackup;
        ta.style.cssText = 'width:100%;min-height:360px;padding:16px;border:none;outline:none;font-family:Consolas,Monaco,monospace;font-size:13px;line-height:1.6;resize:vertical;background:#f8f9fa;color:#333;';
        currentRichEditor.parentNode.insertBefore(ta, currentRichEditor.nextSibling);
        currentRichEditor.style.display = 'none';
        if (toolbar) toolbar.style.pointerEvents = 'none';
        showToast('已进入 HTML 源码模式，修改后再次点击 <> 源码 即可保存', 'info');
    } else {
        const ta = document.getElementById('richEditorSourceArea');
        if (ta) {
            currentRichEditor.innerHTML = ta.value;
            ta.remove();
        }
        currentRichEditor.setAttribute('contenteditable', 'true');
        currentRichEditor.style.display = '';
        if (toolbar) toolbar.style.pointerEvents = '';
        setupImageResize(currentRichEditor);
        showToast('已退出源码模式', 'success');
    }
}

let richEditorPreviewMode = false;

function richEditorTogglePreview() {
    if (!currentRichEditor) return;
    clearSelectedImage();
    richEditorPreviewMode = !richEditorPreviewMode;
    const toolbar = currentRichEditor.previousElementSibling;
    const actions = currentRichEditor.nextElementSibling;
    if (richEditorPreviewMode) {
        currentRichEditor.setAttribute('contenteditable', 'false');
        const preview = document.createElement('div');
        preview.id = 'richEditorPreviewArea';
        preview.className = 'rich-editor-preview';
        preview.innerHTML = currentRichEditor.innerHTML;
        preview.style.cssText = 'min-height:280px;max-height:500px;overflow-y:auto;padding:16px;line-height:1.8;background:white;';
        currentRichEditor.parentNode.insertBefore(preview, currentRichEditor.nextSibling);
        currentRichEditor.style.display = 'none';
        if (toolbar) toolbar.style.pointerEvents = 'none';
        if (actions) actions.style.display = 'none';
        showToast('已进入预览模式，再次点击 👁 预览 可返回编辑', 'info');
    } else {
        const preview = document.getElementById('richEditorPreviewArea');
        if (preview) preview.remove();
        currentRichEditor.setAttribute('contenteditable', 'true');
        currentRichEditor.style.display = '';
        if (toolbar) toolbar.style.pointerEvents = '';
        if (actions) actions.style.display = '';
    }
}

function richEditorToggleFullscreen() {
    const wrapper = currentRichEditor?.closest('.rich-editor');
    if (!wrapper) return;
    wrapper.classList.toggle('fullscreen');
    const isFullscreen = wrapper.classList.contains('fullscreen');
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    positionImageFloatToolbar();
    showToast(isFullscreen ? '已进入全屏编辑' : '已退出全屏编辑', 'success');
}

function richEditorClearContent() {
    if (!currentRichEditor) return;
    if (confirm('确定要清空编辑器里的所有内容吗？此操作不可撤销。')) {
        currentRichEditor.innerHTML = '';
        clearSelectedImage();
        updateWordCount();
        showToast('内容已清空', 'success');
    }
}

function updateWordCount() {
    const el = document.getElementById('editorWordCount');
    if (!el || !currentRichEditor) return;
    const text = currentRichEditor.innerText || '';
    // 中文字符 + 英文单词分别统计
    const cnChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const enWords = (text.replace(/[\u4e00-\u9fa5]/g, '').match(/[a-zA-Z0-9_]+/g) || []).length;
    el.textContent = `${cnChars + enWords} 字`;
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
        const uploadResult = await openImageCropper({ file: pendingEditorImage });
        // 编辑器内使用 GitHub raw URL 即时预览，保存时再替换回相对路径
        const previewUrl = uploadResult?.previewUrl || uploadResult?.url || uploadResult;
        insertImageToEditor(previewUrl, uploadResult?.url);
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

function insertImageToEditor(previewUrl, originalUrl) {
    if (!currentRichEditor || !previewUrl) return;
    currentRichEditor.focus();
    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = '';
    if (originalUrl) img.setAttribute('data-original-src', originalUrl);
    img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;margin:12px 0;display:block;';

    // 预加载图片，成功后再插入编辑器，避免显示破图小图标
    const loader = new Image();
    loader.onload = () => {
        document.execCommand('insertHTML', false, img.outerHTML + '<p><br></p>');
        showToast('图片已插入正文', 'success');
    };
    loader.onerror = () => {
        // 预览失败也插入，但给用户提示；保存并部署后正式 URL 即可访问
        document.execCommand('insertHTML', false, img.outerHTML + '<p><br></p>');
        showToast('图片预览尚未同步，保存部署后可正常显示', 'warning');
    };
    loader.src = previewUrl;
}

function setupImageResize(editor) {
    if (editor._imageResizeBound) return;
    editor._imageResizeBound = true;
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
    // 计算并保存原始宽高比
    const nw = img.naturalWidth || parseFloat(img.style.width) || img.width || 0;
    const nh = img.naturalHeight || parseFloat(img.style.height) || img.height || 0;
    selectedImageRatio = (nw && nh) ? nw / nh : null;
    showImageSizePanel(img);
    ensureImageFloatToolbar();
    positionImageFloatToolbar();
    updateAlignButtonsState();
}

function clearSelectedImage() {
    if (selectedEditorImage) {
        selectedEditorImage.classList.remove('selected');
        selectedEditorImage = null;
    }
    selectedImageRatio = null;
    const panel = document.getElementById('editorImageSizePanel');
    if (panel) panel.style.display = 'none';
    if (imageResizeOverlay) {
        imageResizeOverlay.remove();
        imageResizeOverlay = null;
    }
    if (imageFloatToolbar) imageFloatToolbar.style.display = 'none';
}

// ---- 选中图片浮层工具栏（左/中/右对齐 + 快捷尺寸） ----
let imageFloatToolbar = null;

function ensureImageFloatToolbar() {
    if (imageFloatToolbar) return imageFloatToolbar;
    const tb = document.createElement('div');
    tb.className = 'image-float-toolbar';
    tb.setAttribute('contenteditable', 'false');
    tb.innerHTML = `
        <button type="button" data-align="left" title="左对齐（文字环绕）">⬅ 左</button>
        <button type="button" data-align="center" title="居中">↔ 中</button>
        <button type="button" data-align="right" title="右对齐（文字环绕）">右 ➡</button>
        <span class="ift-sep"></span>
        <button type="button" data-pct="25" title="宽度 25%">25%</button>
        <button type="button" data-pct="50" title="宽度 50%">50%</button>
        <button type="button" data-pct="75" title="宽度 75%">75%</button>
        <button type="button" data-pct="100" title="宽度 100%">100%</button>
    `;
    // 阻止事件冒泡到编辑器，避免点击按钮时取消图片选中或丢焦点
    tb.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
    tb.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.align) {
            setImageAlign(btn.dataset.align);
        } else if (btn.dataset.pct) {
            setImageWidthPercent(parseInt(btn.dataset.pct, 10));
        }
    });
    document.body.appendChild(tb);
    imageFloatToolbar = tb;
    return tb;
}

function positionImageFloatToolbar() {
    if (!imageFloatToolbar || !selectedEditorImage || imageFloatToolbar.style.display === 'none') return;
    const img = selectedEditorImage;
    const r = img.getBoundingClientRect();
    const tb = imageFloatToolbar;
    // 先显示再测量尺寸，测量时隐藏避免闪跳
    tb.style.visibility = 'hidden';
    tb.style.display = 'flex';
    const tbW = tb.offsetWidth;
    const tbH = tb.offsetHeight;
    tb.style.visibility = '';
    let top = r.top - tbH - 10;
    let left = r.left + r.width / 2 - tbW / 2;
    if (top < 8) top = r.bottom + 10;                       // 上方空间不足则显示在图片下方
    if (left < 8) left = 8;
    if (left + tbW > window.innerWidth - 8) left = window.innerWidth - tbW - 8;
    tb.style.top = top + 'px';
    tb.style.left = left + 'px';
}

function getCurrentAlign(img) {
    const fl = (img.style.float || '').toLowerCase();
    if (fl === 'left') return 'left';
    if (fl === 'right') return 'right';
    return 'center';
}

function updateAlignButtonsState() {
    if (!imageFloatToolbar || !selectedEditorImage) return;
    const cur = getCurrentAlign(selectedEditorImage);
    imageFloatToolbar.querySelectorAll('button[data-align]').forEach(b => {
        b.classList.toggle('active', b.dataset.align === cur);
    });
}

function syncSizePanelFromImage() {
    if (!selectedEditorImage) return;
    const wInput = document.getElementById('editorImgWidth');
    const hInput = document.getElementById('editorImgHeight');
    if (!wInput || !hInput) return;
    const w = selectedEditorImage.style.width;
    const h = selectedEditorImage.style.height;
    wInput.value = (w && w.indexOf('%') === -1) ? Math.round(parseFloat(w)) : '';
    hInput.value = (h && h.indexOf('%') === -1 && h !== 'auto') ? Math.round(parseFloat(h)) : '';
}

function showImageSizePanel(img) {
    const panel = document.getElementById('editorImageSizePanel');
    if (!panel) return;
    panel.style.display = 'flex';
    const lockEl = document.getElementById('editorImgRatioLock');
    if (lockEl) lockEl.checked = ratioLockEnabled;
    updateRatioLockIcon();

    // 优先读取行内样式中的尺寸，否则读自然尺寸
    const currentW = parseFloat(img.style.width) || img.width || img.naturalWidth || '';
    const currentH = parseFloat(img.style.height) || img.height || img.naturalHeight || '';
    document.getElementById('editorImgWidth').value = currentW ? Math.round(currentW) : '';
    document.getElementById('editorImgHeight').value = currentH ? Math.round(currentH) : '';
}

function updateRatioLockIcon() {
    const icon = document.getElementById('editorImgRatioLockIcon');
    if (icon) icon.textContent = ratioLockEnabled ? '🔒' : '🔓';
}

function toggleImageRatioLock() {
    const lockEl = document.getElementById('editorImgRatioLock');
    ratioLockEnabled = lockEl ? lockEl.checked : true;
    updateRatioLockIcon();
}

function updateSelectedImageSize(changedSide) {
    if (!selectedEditorImage) return;
    const wInput = document.getElementById('editorImgWidth');
    const hInput = document.getElementById('editorImgHeight');
    let w = parseFloat(wInput.value);
    let h = parseFloat(hInput.value);

    // 等比例缩放
    if (ratioLockEnabled && selectedImageRatio) {
        if (changedSide === 'width' && w) {
            h = Math.round(w / selectedImageRatio);
            hInput.value = h;
        } else if (changedSide === 'height' && h) {
            w = Math.round(h * selectedImageRatio);
            wInput.value = w;
        }
    }

    if (w) {
        selectedEditorImage.style.width = w + 'px';
        selectedEditorImage.style.maxWidth = 'none';
    } else {
        selectedEditorImage.style.width = '';
        selectedEditorImage.style.maxWidth = '100%';
    }
    if (h) {
        selectedEditorImage.style.height = h + 'px';
    } else {
        selectedEditorImage.style.height = 'auto';
    }
    syncSizePanelFromImage();
    updateAlignButtonsState();
    positionImageFloatToolbar();
}

function setImageWidthPercent(percent) {
    if (!selectedEditorImage) return;
    selectedEditorImage.style.width = percent + '%';
    selectedEditorImage.style.height = 'auto';
    selectedEditorImage.style.maxWidth = '100%';
    // 更新输入框显示为空（百分比模式）
    document.getElementById('editorImgWidth').value = '';
    document.getElementById('editorImgHeight').value = '';
    updateAlignButtonsState();
    positionImageFloatToolbar();
}

function setImageAlign(align) {
    if (!selectedEditorImage) return;
    const img = selectedEditorImage;
    img.style.display = 'block';
    img.style.float = 'none';
    img.style.height = 'auto';
    if (align === 'left') {
        // 左对齐并允许文字环绕：未指定宽度时给一个合理默认宽度
        if (!img.style.width || img.style.width === '100%') img.style.width = '50%';
        img.style.float = 'left';
        img.style.margin = '8px 18px 8px 0';
    } else if (align === 'right') {
        if (!img.style.width || img.style.width === '100%') img.style.width = '50%';
        img.style.float = 'right';
        img.style.margin = '8px 0 8px 18px';
    } else {
        // 居中：保持当前宽度（或自适应）
        if (!img.style.width) img.style.width = 'auto';
        img.style.margin = '12px auto';
    }
    syncSizePanelFromImage();
    updateAlignButtonsState();
    positionImageFloatToolbar();
    const label = align === 'center' ? '居中' : (align === 'left' ? '左对齐（文字环绕）' : '右对齐（文字环绕）');
    showToast(`图片已${label}`, 'success');
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

        // 合并乐观保存但后台刷新尚未确认的配置，避免 GitHub 读取缓存导致设置被旧数据覆盖
        if (pendingConfig && allData.config) {
            if (Date.now() - pendingConfigSavedAt < PENDING_CONFIG_TTL) {
                allData.config = { ...allData.config, ...pendingConfig };
            } else {
                pendingConfig = null;
                pendingConfigSavedAt = 0;
            }
        }

        // content 端点返回原始数据（无状态过滤），直接提取数组
        // 注意：articles 必须保留 {featured, items} 整体，因为头条管理依赖 featured
        allData.countries = allData.countries?.items || [];
        allData.projects = allData.projects?.items || [];
        if (allData.articles && !Array.isArray(allData.articles) && Array.isArray(allData.articles.items)) {
            // 保留 articles 整体结构（featured + items）
            const fetchedItems = allData.articles.items || [];
            // 合并乐观保存但后台刷新尚未确认的文章，避免 GitHub 读取缓存导致列表闪烁/丢失
            const mergedItems = fetchedItems.slice();
            Object.keys(pendingArticles).forEach(id => {
                const pi = pendingArticles[id];
                const fi = mergedItems.findIndex(f => f.id === id);
                if (fi >= 0) mergedItems[fi] = pi;   // 用更新的乐观版本覆盖
                else mergedItems.push(pi);
                delete pendingArticles[id];
            });
            allData.articles = {
                featured: Array.isArray(allData.articles.featured) ? allData.articles.featured
                          : (allData.articles.featured ? [allData.articles.featured] : []),
                items: mergedItems
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
    const keyword = (document.getElementById('articleSearchInput')?.value || '').trim().toLowerCase();
    let items = (allData.articles && allData.articles.items) || [];
    if (catFilter) items = items.filter(a => a.category === catFilter);
    if (keyword) {
        const terms = keyword.split(/\s+/).filter(Boolean);
        items = items.filter(a => {
            const title = (a.title || '').toLowerCase();
            const summary = (a.summary || '').toLowerCase();
            const slug = (a.slug || '').toLowerCase();
            const tags = (Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || '')).toLowerCase();
            return terms.every(t => title.includes(t) || summary.includes(t) || tags.includes(t) || slug.includes(t));
        }).sort((a, b) => {
            const score = x => {
                const t = (x.title || '').toLowerCase();
                const s = (x.summary || '').toLowerCase();
                let sc = 0;
                terms.forEach(term => {
                    if (t.includes(term)) sc += 10;
                    else if (s.includes(term)) sc += 5;
                });
                return sc;
            };
            return score(b) - score(a);
        });
    }

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

// 文章搜索：按钮点击 + 回车实时搜索
const articleSearchInput = document.getElementById('articleSearchInput');
const articleSearchBtn = document.getElementById('articleSearchBtn');
if (articleSearchInput) {
    articleSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') renderArticles();
    });
    articleSearchInput.addEventListener('input', debounce(renderArticles, 250));
}
if (articleSearchBtn) articleSearchBtn.addEventListener('click', renderArticles);

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
            <label>字数（前台显示用，可自定义）</label>
            <input type="number" id="editArticleWordCount" value="${item.wordCount != null ? item.wordCount : ''}" placeholder="如：1200" min="0">
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
        delete pendingArticles[id];
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
            <label>字数（前台显示用，可自定义）</label>
            <input type="number" id="editArticleWordCount" placeholder="如：1200" min="0">
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

// 服务项目可视化列表
function renderServicesList(items) {
    const container = document.getElementById('servicesList');
    if (!container) return;
    items = Array.isArray(items) ? items : [];
    container.innerHTML = items.map((item, idx) => `
        <div class="viz-row" data-idx="${idx}">
            <input type="text" class="field-narrow svc-icon" placeholder="图标 emoji" value="${escapeHtml(item.icon || '')}">
            <input type="text" class="field-medium svc-title" placeholder="标题" value="${escapeHtml(item.title || '')}">
            <input type="text" class="field-wide svc-desc" placeholder="描述" value="${escapeHtml(item.desc || '')}">
            <button type="button" class="btn-del" onclick="this.closest('.viz-row').remove()">删除</button>
        </div>
    `).join('');
}
function collectServicesList() {
    const rows = document.querySelectorAll('#servicesList .viz-row');
    return Array.from(rows).map((row, idx) => ({
        id: row.dataset.idx ? `svc-${parseInt(row.dataset.idx, 10) + 1}` : `svc-${idx + 1}`,
        icon: row.querySelector('.svc-icon')?.value || '',
        title: row.querySelector('.svc-title')?.value || '',
        desc: row.querySelector('.svc-desc')?.value || ''
    })).filter(it => it.title || it.desc || it.icon);
}

// 关于我们段落可视化列表
function renderAboutParagraphsList(items) {
    const container = document.getElementById('aboutParagraphsList');
    if (!container) return;
    items = Array.isArray(items) ? items : [];
    container.innerHTML = items.map((text, idx) => `
        <div class="viz-row" data-idx="${idx}">
            <textarea class="field-wide para-text" rows="2" placeholder="段落内容">${escapeHtml(text || '')}</textarea>
            <button type="button" class="btn-del" onclick="this.closest('.viz-row').remove()">删除</button>
        </div>
    `).join('');
}
function collectAboutParagraphsList() {
    const rows = document.querySelectorAll('#aboutParagraphsList .viz-row');
    return Array.from(rows).map(row => row.querySelector('.para-text')?.value || '').filter(Boolean);
}

// 关于我们统计数据可视化列表
function renderAboutStatsList(items) {
    const container = document.getElementById('aboutStatsList');
    if (!container) return;
    items = Array.isArray(items) ? items : [];
    container.innerHTML = items.map((item, idx) => `
        <div class="viz-row" data-idx="${idx}">
            <input type="text" class="field-narrow stat-value" placeholder="数值，如 500+" value="${escapeHtml(item.value || '')}">
            <input type="text" class="field-medium stat-label" placeholder="标签，如 移民项目" value="${escapeHtml(item.label || '')}">
            <button type="button" class="btn-del" onclick="this.closest('.viz-row').remove()">删除</button>
        </div>
    `).join('');
}
function collectAboutStatsList() {
    const rows = document.querySelectorAll('#aboutStatsList .viz-row');
    return Array.from(rows).map(row => ({
        value: row.querySelector('.stat-value')?.value || '',
        label: row.querySelector('.stat-label')?.value || ''
    })).filter(it => it.value || it.label);
}

function updateAboutImagePreview(url) {
    const input = document.getElementById('aboutImage');
    const preview = document.getElementById('aboutImagePreview');
    if (input) input.value = url || '';
    if (!preview) return;
    if (url) {
        preview.innerHTML = `<img src="${toPreviewUrl(url)}" alt="预览">`;
    } else {
        preview.innerHTML = '<span style="color:#999;">未上传图片，点击上传</span>';
    }
}

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
    renderServicesList(services.items || []);
    
    const about = allData.config.about || {};
    document.getElementById('aboutTitle').value = about.title || '';
    renderAboutParagraphsList(about.paragraphs || []);
    renderAboutStatsList(about.stats || []);
    document.getElementById('aboutImageIcon').value = about.imageIcon || '';
    updateAboutImagePreview(about.image || '');
}

async function saveSiteSettings({ silent = false, skipToast = false } = {}) {
    const servicesItems = collectServicesList();
    const aboutParagraphs = collectAboutParagraphsList();
    const aboutStats = collectAboutStatsList();

    const newConfig = {
        ...allData.config,
        site: {
            name: document.getElementById('siteName').value,
            title: document.getElementById('siteTitle').value,
            description: document.getElementById('siteDescription').value,
            keywords: document.getElementById('siteKeywords').value,
            hotlineLabel: document.getElementById('hotlineLabel').value,
            hotline1: document.getElementById('hotline1').value,
            hotline2: document.getElementById('hotline2').value
        },
        services: {
            title: document.getElementById('servicesTitle').value,
            subtitle: document.getElementById('servicesSubtitle').value,
            moreLink: document.getElementById('servicesMoreLink').value,
            items: servicesItems
        },
        about: {
            title: document.getElementById('aboutTitle').value,
            paragraphs: aboutParagraphs,
            stats: aboutStats,
            imageIcon: document.getElementById('aboutImageIcon').value,
            image: document.getElementById('aboutImage')?.value || ''
        }
    };

    // 乐观更新：先更新内存与标记，避免 GitHub 读取缓存导致设置回退
    pendingConfig = JSON.parse(JSON.stringify(newConfig));
    pendingConfigSavedAt = Date.now();
    allData.config = pendingConfig;

    try {
        await apiRequest('/config', {
            method: 'PUT',
            body: JSON.stringify(newConfig)
        });
        if (!skipToast) showToast('保存成功');
        return true;
    } catch (err) {
        if (!silent) showToast('保存失败：' + (err.message || ''), 'error');
        return false;
    }
}

document.getElementById('saveSettingsBtn').addEventListener('click', () => saveSiteSettings());

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
        let saveResp = null;
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
            // 乐观更新：如果该头条对应 items 中的文章，同步更新内存，避免列表区与精选区不一致
            if (Array.isArray(allData.articles && allData.articles.items)) {
                payload.forEach(fItem => {
                    if (!fItem || !fItem.id) return;
                    const idx = allData.articles.items.findIndex(i => i.id === fItem.id);
                    if (idx !== -1) {
                        const syncFields = ['title', 'slug', 'category', 'summary', 'content', 'image', 'tags', 'date', 'createdAt'];
                        syncFields.forEach(field => {
                            if (field in fItem) allData.articles.items[idx][field] = fItem[field];
                        });
                    }
                });
            }
            allData.articles.featured = payload;
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
            const wordCountRaw = document.getElementById('editArticleWordCount')?.value?.trim();
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
            if (wordCountRaw !== '') {
                const wc = parseInt(wordCountRaw, 10);
                if (!isNaN(wc) && wc >= 0) data.wordCount = wc;
            }
            if (!data.title) return showToast('请输入文章标题', 'warning');
            if (currentEditId) {
                saveResp = await apiRequest('/articles/' + currentEditId, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                saveResp = await apiRequest('/articles', { method: 'POST', body: JSON.stringify(data) });
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
        
        // 保存成功后立即在内存里更新列表并渲染，不等 GitHub 读取缓存，保证“发布后立即显示”
        if (currentEditType === 'article' && saveResp && saveResp.data) {
            const saved = saveResp.data;
            const items = (allData.articles && allData.articles.items) || [];
            const idx = items.findIndex(i => i.id === saved.id);
            if (idx >= 0) items[idx] = saved;
            else items.unshift(saved);
            // 如果该文章是精选/头条，同步更新内存中的 featured，避免精选区与列表区显示不一致
            if (Array.isArray(allData.articles.featured)) {
                const fIdx = allData.articles.featured.findIndex(f => f && f.id === saved.id);
                if (fIdx !== -1) {
                    const syncFields = ['title', 'slug', 'category', 'summary', 'content', 'image', 'tags', 'date', 'createdAt'];
                    const updated = { ...allData.articles.featured[fIdx] };
                    syncFields.forEach(field => {
                        if (field in saved) updated[field] = saved[field];
                    });
                    allData.articles.featured[fIdx] = updated;
                }
            }
            pendingArticles[saved.id] = saved;
            renderArticles();
            updateDashboard();
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
    const aboutImagePreview = document.getElementById('aboutImagePreview');
    let isUploadingAboutImage = false;

    if (aboutImagePreview && aboutImageUpload) {
        aboutImagePreview.addEventListener('click', () => {
            if (isUploadingAboutImage) return;
            aboutImageUpload.click();
        });
    }

    if (aboutImageUpload) {
        aboutImageUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file || isUploadingAboutImage) return;
            isUploadingAboutImage = true;
            aboutImageUpload.disabled = true;
            const originalPreview = aboutImagePreview.innerHTML;
            aboutImagePreview.innerHTML = '<span style="color:#999;">上传中...</span>';
            try {
                const uploadResult = await openImageCropper({ file, aspectRatio: 420/320 });
                const url = uploadResult?.url || uploadResult;
                if (!url) throw new Error('上传未返回图片地址');
                updateAboutImagePreview(url);
                // 同步到内存配置，避免刷新后被旧数据覆盖
                if (allData.config) {
                    allData.config.about = { ...(allData.config.about || {}), image: url };
                }
                showToast('图片已上传，正在保存...');
                const saved = await saveSiteSettings({ skipToast: true });
                if (saved) {
                    showToast('图片已上传并保存');
                } else {
                    showToast('图片已上传，但自动保存失败，请手动点击保存设置', 'warning');
                }
            } catch (err) {
                aboutImagePreview.innerHTML = originalPreview;
                showToast('图片上传失败：' + (err.message || ''), 'error');
            } finally {
                isUploadingAboutImage = false;
                aboutImageUpload.disabled = false;
            }
        });
    }

    // 删除关于我们图片
    const aboutImageDeleteBtn = document.getElementById('aboutImageDeleteBtn');
    if (aboutImageDeleteBtn) {
        aboutImageDeleteBtn.addEventListener('click', async () => {
            if (!confirm('确定要删除右侧图片吗？')) return;
            updateAboutImagePreview('');
            if (allData.config) {
                allData.config.about = { ...(allData.config.about || {}), image: '' };
            }
            const saved = await saveSiteSettings({ skipToast: true });
            if (saved) {
                showToast('图片已删除');
            } else {
                showToast('本地已清空，但自动保存失败，请手动点击保存设置', 'warning');
            }
        });
    }

    // 站点设置可视化列表添加按钮
    document.getElementById('addServiceItemBtn')?.addEventListener('click', () => {
        const container = document.getElementById('servicesList');
        const idx = container?.children.length || 0;
        const row = document.createElement('div');
        row.className = 'viz-row';
        row.dataset.idx = idx;
        row.innerHTML = `
            <input type="text" class="field-narrow svc-icon" placeholder="图标 emoji">
            <input type="text" class="field-medium svc-title" placeholder="标题">
            <input type="text" class="field-wide svc-desc" placeholder="描述">
            <button type="button" class="btn-del" onclick="this.closest('.viz-row').remove()">删除</button>
        `;
        container?.appendChild(row);
    });
    document.getElementById('addAboutParagraphBtn')?.addEventListener('click', () => {
        const container = document.getElementById('aboutParagraphsList');
        const idx = container?.children.length || 0;
        const row = document.createElement('div');
        row.className = 'viz-row';
        row.dataset.idx = idx;
        row.innerHTML = `
            <textarea class="field-wide para-text" rows="2" placeholder="段落内容"></textarea>
            <button type="button" class="btn-del" onclick="this.closest('.viz-row').remove()">删除</button>
        `;
        container?.appendChild(row);
    });
    document.getElementById('addAboutStatBtn')?.addEventListener('click', () => {
        const container = document.getElementById('aboutStatsList');
        const idx = container?.children.length || 0;
        const row = document.createElement('div');
        row.className = 'viz-row';
        row.dataset.idx = idx;
        row.innerHTML = `
            <input type="text" class="field-narrow stat-value" placeholder="数值，如 500+">
            <input type="text" class="field-medium stat-label" placeholder="标签，如 移民项目">
            <button type="button" class="btn-del" onclick="this.closest('.viz-row').remove()">删除</button>
        `;
        container?.appendChild(row);
    });

    // 图片裁剪取消按钮
    const cropperCancel = document.getElementById('cropperCancelBtn');
    if (cropperCancel) {
        cropperCancel.addEventListener('click', closeImageCropper);
    }
});

// 初始化
checkAuth();
