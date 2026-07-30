/* ================================================================
 * 汇程移民 - 全站右侧悬浮联系面板
 * - 自包含：HTML / CSS / JS 全部内联，无需依赖任何框架
 * - 任何页面只要引入本文件即可自动注入
 * - position: fixed 始终悬浮于视口右侧，跟随用户滚动
 * - 移动端 < 768px 自动隐藏，避免遮挡正文
 * - 点击 × 可关闭；可记住用户选择(localStorage)
 * ================================================================ */
(function () {
  'use strict';

  // 跳过 admin 后台
  try {
    if (/\/admin\//.test(window.location.pathname)) return;
  } catch (e) {}

  // 避免重复注入
  if (document.getElementById('hcContactFloat')) return;

  var STORAGE_KEY = 'hc_contact_float_dismissed';
  try {
    if (window.localStorage && localStorage.getItem(STORAGE_KEY) === '1') {
      // 用户曾关闭过 —— 本次仍不显示（简化：让用户清掉 localStorage 即可重现）
      // 改为：仍然显示，但加一个小 "已关闭" 提示按钮。取舍后：尊重用户选择。
      return;
    }
  } catch (e) {}

  // ---- 资源路径解析（静态页在 /articles/*.html 也能用） ----
  function resolveAsset(p) {
    // 站点绝对资源走根路径最稳
    if (!p) return '';
    if (/^https?:\/\//i.test(p) || /^data:/i.test(p) || p.startsWith('/')) return p;
    return '/' + p;
  }
  var wechatQR = resolveAsset('assets/images/qrcode/wechat-qr1.jpg');

  // ---- 样式 ----
  var CSS = [
    '#hcContactFloat{',
    '  position:fixed;',
    '  right:18px;',
    '  top:96px;',
    '  width:220px;',
    '  z-index:9999;',
    '  background:linear-gradient(180deg,#1ab1b1 0%,#0e8e8e 100%);',
    '  color:#fff;',
    '  border-radius:16px;',
    '  box-shadow:0 10px 28px rgba(0,0,0,.18);',
    '  padding:20px 16px 18px;',
    '  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;',
    '  text-align:center;',
    '  box-sizing:border-box;',
    '  user-select:none;',
    '  transition:transform .25s ease,opacity .25s ease;',
    '}',
    '#hcContactFloat .hcf-close{',
    '  position:absolute;',
    '  top:6px;',
    '  right:8px;',
    '  width:24px;',
    '  height:24px;',
    '  line-height:22px;',
    '  text-align:center;',
    '  background:rgba(255,255,255,.18);',
    '  color:#fff;',
    '  border:0;',
    '  border-radius:50%;',
    '  cursor:pointer;',
    '  font-size:16px;',
    '  padding:0;',
    '  transition:background .2s;',
    '}',
    '#hcContactFloat .hcf-close:hover{background:rgba(255,255,255,.32);}',
    '#hcContactFloat .hcf-title{',
    '  font-size:20px;',
    '  font-weight:700;',
    '  margin:0 0 6px;',
    '  letter-spacing:1px;',
    '  color:#fff;',
    '}',
    '#hcContactFloat .hcf-sub{',
    '  font-size:12.5px;',
    '  margin:0 0 14px;',
    '  color:rgba(255,255,255,.92);',
    '  line-height:1.5;',
    '}',
    '#hcContactFloat .hcf-phone{',
    '  display:block;',
    '  background:rgba(255,255,255,.95);',
    '  color:#0e8e8e;',
    '  text-decoration:none;',
    '  border-radius:10px;',
    '  padding:10px 8px;',
    '  margin:0 0 8px;',
    '  font-size:15px;',
    '  font-weight:600;',
    '  letter-spacing:.5px;',
    '  transition:transform .2s,box-shadow .2s;',
    '}',
    '#hcContactFloat .hcf-phone:hover{',
    '  transform:translateY(-1px);',
    '  box-shadow:0 4px 12px rgba(0,0,0,.12);',
    '}',
    '#hcContactFloat .hcf-phone .hcf-ic{',
    '  display:inline-block;',
    '  margin-right:6px;',
    '  font-style:normal;',
    '  font-size:14px;',
    '}',
    '#hcContactFloat .hcf-divider{',
    '  position:relative;',
    '  margin:14px 0 10px;',
    '  text-align:center;',
    '  font-size:12px;',
    '  color:rgba(255,255,255,.85);',
    '}',
    '#hcContactFloat .hcf-divider::before,',
    '#hcContactFloat .hcf-divider::after{',
    '  content:"";',
    '  position:absolute;',
    '  top:50%;',
    '  width:32%;',
    '  height:1px;',
    '  background:rgba(255,255,255,.32);',
    '}',
    '#hcContactFloat .hcf-divider::before{left:0;}',
    '#hcContactFloat .hcf-divider::after{right:0;}',
    '#hcContactFloat .hcf-qr{',
    '  width:128px;',
    '  height:128px;',
    '  margin:0 auto;',
    '  background:#fff;',
    '  border-radius:10px;',
    '  padding:8px;',
    '  box-sizing:border-box;',
    '  box-shadow:0 4px 12px rgba(0,0,0,.10);',
    '}',
    '#hcContactFloat .hcf-qr img{',
    '  display:block;',
    '  width:100%;',
    '  height:100%;',
    '  object-fit:contain;',
    '}',
    '#hcContactFloat .hcf-tip{',
    '  margin:10px 0 2px;',
    '  font-size:13px;',
    '  font-weight:600;',
    '  color:#fff;',
    '}',
    '#hcContactFloat .hcf-tip .hcf-dot{',
    '  display:inline-block;',
    '  width:6px;',
    '  height:6px;',
    '  border-radius:50%;',
    '  background:#7ee07e;',
    '  margin-right:5px;',
    '  vertical-align:middle;',
    '  box-shadow:0 0 6px #7ee07e;',
    '}',
    '#hcContactFloat .hcf-subtip{',
    '  margin:0 0 12px;',
    '  font-size:11.5px;',
    '  color:rgba(255,255,255,.78);',
    '  letter-spacing:.3px;',
    '}',
    '#hcContactFloat .hcf-cta{',
    '  display:block;',
    '  background:#fff;',
    '  color:#0e8e8e;',
    '  text-decoration:none;',
    '  font-weight:700;',
    '  font-size:14.5px;',
    '  border-radius:10px;',
    '  padding:11px 0;',
    '  letter-spacing:2px;',
    '  transition:transform .2s,box-shadow .2s;',
    '}',
    '#hcContactFloat .hcf-cta:hover{',
    '  transform:translateY(-1px);',
    '  box-shadow:0 6px 16px rgba(0,0,0,.18);',
    '}',
    '@media (max-width: 1280px){',
    '  #hcContactFloat{right:12px;width:200px;top:84px;}',
    '  #hcContactFloat .hcf-qr{width:108px;height:108px;}',
    '}',
    '@media (max-width: 1024px){',
    '  #hcContactFloat{right:10px;width:184px;top:80px;padding:16px 12px 14px;}',
    '  #hcContactFloat .hcf-qr{width:96px;height:96px;}',
    '  #hcContactFloat .hcf-title{font-size:18px;}',
    '}',
    '@media (max-width: 768px){',
    '  #hcContactFloat{display:none !important;}',
    '}'
  ].join('');

  // ---- HTML ----
  var HTML = [
    '<button class="hcf-close" id="hcfCloseBtn" aria-label="关闭联系面板" title="关闭">&times;</button>',
    '<h3 class="hcf-title">免费移民评估</h3>',
    '<p class="hcf-sub">专业顾问 1 对 1 为您定制专属方案</p>',
    '<a class="hcf-phone" href="tel:13651852270" rel="nofollow">',
    '  <i class="hcf-ic">📞</i>136-5185-2270',
    '</a>',
    '<a class="hcf-phone" href="tel:19901726016" rel="nofollow">',
    '  <i class="hcf-ic">📱</i>199-0172-6016',
    '</a>',
    '<div class="hcf-divider">或 添加微信咨询</div>',
    '<div class="hcf-qr"><img src="', wechatQR, '" alt="汇程移民 微信二维码" loading="lazy"></div>',
    '<p class="hcf-tip"><span class="hcf-dot"></span>扫一扫添加微信</p>',
    '<p class="hcf-subtip">7&times;24小时在线 · 1 对 1 答疑</p>',
    '<a class="hcf-cta" href="tel:13651852270" rel="nofollow">立即咨询 &rarr;</a>'
  ].join('');

  // ---- 注入 ----
  function inject() {
    if (document.getElementById('hcContactFloat')) return;
    var style = document.createElement('style');
    style.id = 'hcContactFloatStyle';
    style.appendChild(document.createTextNode(CSS));
    document.head.appendChild(style);

    var box = document.createElement('div');
    box.id = 'hcContactFloat';
    box.setAttribute('aria-label', '免费移民咨询');
    box.innerHTML = HTML;
    document.body.appendChild(box);

    // 关闭按钮
    var closeBtn = document.getElementById('hcfCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        box.style.transition = 'transform .25s ease, opacity .25s ease';
        box.style.opacity = '0';
        box.style.transform = 'translateX(20px)';
        setTimeout(function () {
          if (box.parentNode) box.parentNode.removeChild(box);
        }, 260);
        try {
          if (window.localStorage) localStorage.setItem(STORAGE_KEY, '1');
        } catch (e) {}
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
