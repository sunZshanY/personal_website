/**
 * Omiaちゃん Blog — 主脚本 v5.2
 * ==============================
 * 背景：雫API (api.imlazy.ink)
 * 数据：data/posts.json（GitHub 托管，每日更新）
 * 留言：Giscus（基于 GitHub Discussions）
 * 访客：localStorage 本地存储
 */
(function() {
    'use strict';

    // ========== 常量 ==========
    var IMG_API_WIDE = '/api/bg';
    var DATA_URL = 'data/posts.json';
    var BG_TICK = 60000;
    var API_TIMEOUT = 8000;

    var TYPE_LINE = 'Hello My name is Omiaちゃん';
    var TYPE_TICK = 100, TYPE_REST = 3000, TYPE_DEL = 90, TYPE_GAP = 1500;

    // ========== 全局态 ==========
    var g_postHeap = [];
    var bgLooper = null;
    var g_currentBgSrc = null;
    var g_currentBgIsApi = false;
    var watchingId = null;

    // ========== DOM 缓取 ==========
    function $(s) { return document.querySelector(s); }
    function $$(s) { return document.querySelectorAll(s); }

    var E = {
        // 背景
        bgLayer:        $('#bgLayer'),
        // Toast
        toast:          $('#toastContainer'),
        // 顶栏
        typeWriter:     $('#typed-text'),
        apiDot:         $('#apiStatusDot'),
        apiLabel:       $('#apiStatusText'),
        themeToggle:    $('#themeToggle'),
        // 博客
        blogList:       $('#blogList'),
        blogEmpty:      $('#blogEmpty'),
        blogSearch:     $('#blogSearch'),
        // 状态栏
        visitorCount:   $('#visitorCount'),
        // 详情弹窗
        detailModal:    $('#blogDetailModal'),
        detailTitle:    $('#detailTitle'),
        detailContent:  $('#detailContent'),
        detailTags:     $('#detailTags'),
        detailImgWrap:  $('#detailImageWrapper'),
        detailShareBtn: $('#detailShareBtn')
    };

    // ========== 工具 ==========
    function _safeHTML(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function _safeAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function _debounce(fn, ms) {
        var t;
        return function() { var c=this, a=arguments; clearTimeout(t); t=setTimeout(function(){fn.apply(c,a);}, ms); };
    }

    function _shake(el) {
        if (!el) return;
        el.style.animation = 'none'; void el.offsetWidth;
        el.style.animation = 'shake 0.5s ease';
        setTimeout(function(){ el.style.animation = ''; }, 500);
    }

    // ========== Toast ==========
    function _pop(msg, type) {
        type = type || 'info';
        var icons = { success: '✅', error: '❌', info: 'ℹ️' };
        var el = document.createElement('div');
        el.className = 'toast-item toast-' + type;
        el.textContent = (icons[type]||'') + ' ' + msg;
        E.toast.appendChild(el);
        setTimeout(function() {
            el.style.animation = 'toastOut 0.35s ease forwards';
            setTimeout(function(){ el.remove(); }, 350);
        }, 2800);
    }

    // ========== 背景 (雫API) ==========
    var FALLBACK_BG = ['images/columbina-5k-3840x2160-25922.jpg','images/oshi-no-ko-3840x2160-25261.jpg','images/sparxie-honkai-star-3840x2160-26290.jpg','images/zhuang-fangyi-3840x2160-26226.jpg'];
    var _fallbackIdx = -1;  // 本地轮播指针
    var _apiOnline = false; // 记录上次 API 状态

    function _setApiStatus(state) {
        if (!E.apiDot || !E.apiLabel) return;
        E.apiDot.classList.remove('connected', 'fallback');
        E.apiLabel.classList.remove('connected', 'fallback');
        if (state === 'online') {
            E.apiDot.classList.add('connected');
            E.apiLabel.classList.add('connected');
            E.apiLabel.textContent = '雫API在线';
        } else if (state === 'fallback') {
            E.apiDot.classList.add('fallback');
            E.apiLabel.classList.add('fallback');
            E.apiLabel.textContent = '本地壁纸';
        } else {
            E.apiLabel.textContent = '离线';
        }
    }

    function _setBg(src, fromApi) {
        if (!E.bgLayer) return;
        // 淡入淡出交叉过渡
        E.bgLayer.style.opacity = '0';
        setTimeout(function() {
            E.bgLayer.style.backgroundImage = "url('"+src+"')";
            E.bgLayer.style.opacity = '1';
            g_currentBgSrc = src;
            g_currentBgIsApi = !!fromApi;
            _updateWallpaperInfo();
        }, 400);
    }

    function _nextFallback() {
        _fallbackIdx = (_fallbackIdx + 1) % FALLBACK_BG.length;
        return FALLBACK_BG[_fallbackIdx];
    }

    function _randFallback() {
        // 首次随机选一张，避免总从第一张开始
        if (_fallbackIdx < 0) {
            _fallbackIdx = Math.floor(Math.random() * FALLBACK_BG.length);
        }
        return FALLBACK_BG[_fallbackIdx];
    }

    function _tryApiBg() {
        return new Promise(function(ok) {
            var img = new Image();
            var done = false;
            var bomb = setTimeout(function(){
                if (!done) { done = true; ok(null); }
            }, API_TIMEOUT);
            img.onload = function() {
                if (!done) {
                    done = true;
                    clearTimeout(bomb);
                    ok(img.currentSrc || img.src);
                }
            };
            img.onerror = function() {
                if (!done) { done = true; clearTimeout(bomb); ok(null); }
            };
            img.src = IMG_API_WIDE + '?_t=' + Date.now();
        });
    }

    async function _paintBg() {
        if (!E.bgLayer) return;
        // 首次加载：立即显示本地壁纸兜底
        var currentBg = E.bgLayer.style.backgroundImage;
        if (!currentBg || currentBg === 'none') {
            var fb = _randFallback();
            E.bgLayer.style.backgroundImage = "url('"+fb+"')";
            E.bgLayer.style.opacity = '1';
            g_currentBgSrc = fb;
            g_currentBgIsApi = false;
            _updateWallpaperInfo();
        }
        // 尝试从雫API获取新图片
        var src = await _tryApiBg();
        if (src && src.indexOf('data:') === -1) {
            _setBg(src, true);
            _apiOnline = true;
            _setApiStatus('online');
        } else {
            // API 不可用 → 本地壁纸轮播
            _apiOnline = false;
            _setBg(_nextFallback(), false);
            _setApiStatus('fallback');
        }
    }

    function _startBgLoop() {
        if (bgLooper) clearInterval(bgLooper);
        _paintBg();
        bgLooper = setInterval(_paintBg, BG_TICK);
    }

    // ========== 壁纸信息展示 ==========
    function _updateWallpaperInfo() {
        var infoEl = document.getElementById('wallpaperInfo');
        if (!infoEl) return;
        if (g_currentBgSrc) {
            var label = g_currentBgIsApi ? '雫API' : '本地壁纸';
            var fileName = g_currentBgSrc.split('/').pop().split('?')[0];
            if (fileName.length > 28) fileName = fileName.slice(0, 25) + '...';
            infoEl.textContent = label + ' | ' + fileName;
            infoEl.title = g_currentBgSrc;
        } else {
            infoEl.textContent = '等待加载...';
            infoEl.title = '';
        }
    }

    // 点击状态栏壁纸信息可打开原图
    window.openCurrentWallpaper = function() {
        if (g_currentBgSrc) {
            window.openLightbox(g_currentBgSrc);
        }
    };

    // ========== 数据层 ==========
    // 博客数据：从 data/posts.json 加载（GitHub 托管）
    var BOX_KEY = 'omiblog_z';       // 保留作为缓存
    var EYE_KEY = 'kaze_count';
    var EYE_FLAG = 'kaze_flag';
    var THEME_KEY = 'omiblog_theme';

    var g_logo = null;

    function _applyLogo(logo) {
        if (!logo) return;
        g_logo = logo;
        document.querySelectorAll('.topbar-logo, .profile-image').forEach(function(el) {
            el.src = logo;
        });
        var favicon = document.querySelector('link[rel="icon"]');
        if (favicon) favicon.href = logo;
    }

    function _loadPosts() {
        // 最简逻辑：本地有数据优先用，没有则从服务器取
        try {
            var r = localStorage.getItem(BOX_KEY);
            if (r) {
                var parsed = JSON.parse(r);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    g_postHeap = parsed;
                    console.log('Using localStorage, ' + parsed.length + ' posts');
                    // 后台异步刷新服务器数据（仅当没有管理员本地同步标志时）
                    if (!localStorage.getItem('omiblog_admin_sync')) {
                        fetch(DATA_URL + '?_t=' + Date.now())
                            .then(function(resp){ if(resp.ok) return resp.json() })
                            .then(function(data){
                                if(data){
                                    if(data.logo) _applyLogo(data.logo);
                                    if(Array.isArray(data.posts)) localStorage.setItem(BOX_KEY,JSON.stringify(data.posts));
                                }
                            })
                            .catch(function(){});
                    }
                    return Promise.resolve();
                }
            }
        } catch(e) {}

        // 本地无数据，从服务器加载
        return fetch(DATA_URL + '?_t=' + Date.now())
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data) {
                if (data) {
                    if (data.logo) _applyLogo(data.logo);
                    if (Array.isArray(data.posts)) {
                        g_postHeap = data.posts;
                        try { localStorage.setItem(BOX_KEY, JSON.stringify(g_postHeap)); } catch(e) {}
                    } else {
                        throw new Error('Invalid format');
                    }
                } else {
                    throw new Error('Invalid format');
                }
            })
            .catch(function(err) {
                console.warn('Cannot load data/posts.json:', err.message);
                g_postHeap = [];
            });
    }

    // ========== 实时访客心跳 ==========
    var VISITOR_API = '/api/visitors/heartbeat';
    var HEARTBEAT_MS = 30000; // 30秒一次心跳

    function _getSessionId() {
        var id = sessionStorage.getItem('visitor_sid');
        if (!id) {
            id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem('visitor_sid', id);
        }
        return id;
    }

    function _sendHeartbeat() {
        try {
            var data = {
                sessionId: _getSessionId(),
                page: location.pathname,
                referrer: document.referrer || ''
            };
            // 优先使用 sendBeacon（不阻塞页面卸载），降级到 fetch
            if (navigator.sendBeacon) {
                var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                navigator.sendBeacon(VISITOR_API, blob);
            } else {
                fetch(VISITOR_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    keepalive: true
                }).catch(function(){});
            }
        } catch(e) {}
    }

    function _startHeartbeat() {
        _sendHeartbeat();
        setInterval(_sendHeartbeat, HEARTBEAT_MS);
        // 用户切回标签页时立即上报
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) _sendHeartbeat();
        });
    }

    // ========== 访客计数 ==========
    function _eyeBump() {
        var c = parseInt(localStorage.getItem(EYE_KEY),10)||0;
        if (!sessionStorage.getItem(EYE_FLAG)) { c++; localStorage.setItem(EYE_KEY,'' + c); sessionStorage.setItem(EYE_FLAG,'1'); }
        _eyeShow(c);
    }
    function _eyeShow(v) {
        if (E.visitorCount) { var n = typeof v==='number'?v:(parseInt(localStorage.getItem(EYE_KEY),10)||0); E.visitorCount.textContent = n; }
    }
    window._resetEye = function() { localStorage.setItem(EYE_KEY,'0'); _eyeShow(0); _pop('计数已归零','success'); };

    // ========== 弹窗 ==========
    window.openModal = function(id) {
        var m=document.getElementById(id); if(!m)return;
        m.classList.remove('hidden'); document.body.style.overflow='hidden';
        var inp=m.querySelector('input:not([type="hidden"])'); if(inp)setTimeout(function(){inp.focus();},150);
    };
    window.closeModal = function(id) {
        var m=document.getElementById(id); if(!m)return;
        m.classList.add('hidden'); document.body.style.overflow='';
        if(id==='blogDetailModal'){
            if(E.detailTitle) E.detailTitle.textContent='';
            if(E.detailContent) E.detailContent.innerHTML='';
            if(E.detailTags) E.detailTags.innerHTML='';
            if(E.detailImgWrap){ E.detailImgWrap.innerHTML=''; E.detailImgWrap.classList.add('hidden'); }
            watchingId = null;
        }
    };

    function _backdropClick(e) { if(e.target.classList.contains('modal'))window.closeModal(e.target.id); }

    // ========== 导航 ==========
    function _wireNav() {
        var btns=$$('.sidebar-btn[data-panel]'), panes=$$('.content-panel');
        btns.forEach(function(b){
            b.addEventListener('click',function(){
                if(this.classList.contains('disabled')||this.disabled)return;
                btns.forEach(function(x){x.classList.remove('active');}); this.classList.add('active');
                var tid=this.dataset.panel;
                panes.forEach(function(p){p.classList.remove('active');});
                var t=document.getElementById(tid);
                if(t){t.classList.add('active');t.style.animation='none';void t.offsetWidth;t.style.animation='';}
                if(tid==='guestbook')_loadGiscus();
            });
        });
    }

    // ========== 博客渲染 ==========
    function _paintPosts() {
        var s = E.blogSearch ? E.blogSearch.value.trim().toLowerCase() : '';
        var f = g_postHeap;
        if (s) f = g_postHeap.filter(function(b){return ~b.title.toLowerCase().indexOf(s)||~b.content.toLowerCase().indexOf(s)||b.tags.some(function(t){return ~t.toLowerCase().indexOf(s);});});

        E.blogList.innerHTML = '';
        if (!f.length) { E.blogList.style.display='none'; E.blogEmpty.classList.remove('hidden'); E.blogEmpty.querySelector('.empty-subtitle').textContent=s?'没有匹配的结果…':'敬请期待新文章~'; return; }
        E.blogList.style.display=''; E.blogEmpty.classList.add('hidden');

        f.forEach(function(b){
            var card=document.createElement('article'); card.className='blog-card'; card.dataset.blogId=b.id;
            var tagsH=b.tags.map(function(t){return'<span class="blog-tag">'+_safeHTML(t)+'</span>';}).join('');
            var picH=(b.image||b.images)?'<div class="blog-image-wrapper"><img src="'+_safeAttr(b.image||b.images)+'" alt="'+_safeAttr(b.title)+'" class="blog-image" loading="lazy" onclick="event.stopPropagation();openLightbox(\''+_safeAttr(b.image||b.images)+'\')" onerror="this.parentElement.style.display=\'none\'"></div>':'';
            card.innerHTML='<div class="blog-date">'+_safeHTML(b.date)+'</div><h3 class="blog-card-title" title="点击查看完整文章">'+_safeHTML(b.title)+'</h3>'+picH+'<div class="blog-body"><p>'+_safeHTML(b.content)+'</p></div><div class="blog-tags-row">'+tagsH+'</div><span class="read-more" data-action="expand">展开阅读 ↓</span>';
            E.blogList.appendChild(card);
        });
    }

    function _cardClick(e) {
        // "展开阅读" 按钮 —— 内联展开/收起（不跳转）
        var rm = e.target.closest('.read-more');
        if (rm) {
            e.stopPropagation();
            var card = rm.closest('.blog-card');
            if (!card) return;
            var body = card.querySelector('.blog-body');
            var isExpanded = card.classList.contains('expanded');
            if (isExpanded) {
                card.classList.remove('expanded');
                rm.setAttribute('data-action', 'expand');
                rm.innerHTML = '展开阅读 ↓';
                if (body) body.scrollTop = 0;
            } else {
                card.classList.add('expanded');
                rm.setAttribute('data-action', 'collapse');
                rm.innerHTML = '收起内容 ↑';
            }
            return;
        }
        // 点击博客卡片 → 跳转阅读页
        var c=e.target.closest('.blog-card'); if(!c)return;
        if(e.target.closest('button')||e.target.closest('.blog-image'))return;
        var id=parseInt(c.dataset.blogId,10);
        if(id) location.href = 'read.html?post=' + id;
    }

    // ========== 留言板 (Giscus) ==========
    var GISCUS_REPO = 'sunZshanY/personal_website';
    var GISCUS_REPO_ID = 'R_kgDOTLFsVw';
    var GISCUS_CATEGORY = 'General';
    var GISCUS_CATEGORY_ID = 'DIC_kwDOTLFsV84DCJlw';
    var _giscusLoaded = false;

    // ========== 主题管理 ==========
    function _currentTheme() {
        return document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function _syncGiscusTheme(mode) {
        var iframe = document.querySelector('iframe.giscus-frame');
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage({ giscus: { setConfig: { theme: mode } } }, 'https://giscus.app');
    }

    function _applyTheme(mode) {
        if (mode !== 'light') mode = 'dark';
        document.body.setAttribute('data-theme', mode);
        try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
        if (E.themeToggle) {
            E.themeToggle.textContent = mode === 'light' ? '☀️' : '🌙';
            E.themeToggle.title = mode === 'light' ? '切换到深色主题' : '切换到浅色主题';
        }
        _syncGiscusTheme(mode);
    }

    function _buildGuestbookPanel() {
        var friendsPanel = $('#friends');
        if (!friendsPanel) return;

        friendsPanel.id = 'guestbook';
        friendsPanel.setAttribute('aria-labelledby', 'gbHeading');
        friendsPanel.innerHTML = '<h2 class="panel-title" id="gbHeading" style="text-align:center">💬 留言板</h2>'
            + '<div class="giscus" id="giscusContainer"></div>';

        var friendsBtn = document.querySelector('.sidebar-btn[data-panel="friends"]');
        if (friendsBtn) {
            friendsBtn.dataset.panel = 'guestbook';
            friendsBtn.textContent = ' 留言';
            friendsBtn.classList.remove('disabled');
            friendsBtn.removeAttribute('disabled');
        }
    }

    function _loadGiscus() {
        if (_giscusLoaded) return;
        var container = $('#giscusContainer');
        if (!container) return;
        _giscusLoaded = true;

        var script = document.createElement('script');
        script.src = 'https://giscus.app/client.js';
        script.setAttribute('data-repo', GISCUS_REPO);
        script.setAttribute('data-repo-id', GISCUS_REPO_ID);
        script.setAttribute('data-category', GISCUS_CATEGORY);
        script.setAttribute('data-category-id', GISCUS_CATEGORY_ID);
        script.setAttribute('data-mapping', 'pathname');
        script.setAttribute('data-strict', '0');
        script.setAttribute('data-reactions-enabled', '1');
        script.setAttribute('data-emit-metadata', '0');
        script.setAttribute('data-input-position', 'bottom');
        script.setAttribute('data-theme', _currentTheme());
        script.setAttribute('data-lang', 'zh-CN');
        script.setAttribute('crossorigin', 'anonymous');
        script.async = true;
        container.appendChild(script);
    }

    // ========== 灯箱 ==========
    window.openLightbox = function(src) { var ex=document.querySelector('.lightbox-overlay'); if(ex)ex.remove(); var o=document.createElement('div'); o.className='lightbox-overlay'; o.innerHTML='<img src="'+_safeAttr(src)+'" alt="放大查看">'; o.addEventListener('click',function(){o.remove();}); document.body.appendChild(o); };

    // ========== 打字机 ==========
    var _ti=0,_tdel=false,_tTimer=null;
    function _typeLoop() {
        clearTimeout(_tTimer); if(!E.typeWriter)return;
        if(!_tdel){ if(_ti<TYPE_LINE.length){E.typeWriter.textContent+=TYPE_LINE[_ti];_ti++;_tTimer=setTimeout(_typeLoop,TYPE_TICK);}else{_tdel=true;_tTimer=setTimeout(_typeLoop,TYPE_REST);} }
        else{ if(_ti>0){E.typeWriter.textContent=TYPE_LINE.slice(0,_ti-1);_ti--;_tTimer=setTimeout(_typeLoop,TYPE_DEL);}else{_tdel=false;_tTimer=setTimeout(_typeLoop,TYPE_GAP);} }
    }

    // ========== storage 事件 ==========
    function _onStoreChange(evt) {
        if(!evt.key)return;
        switch(evt.key){
            case BOX_KEY: _loadPosts().then(function(){ _paintPosts(); }); break;
            case EYE_KEY: _eyeShow(null); break;
        }
    }

    // ========== 事件绑线 ==========
    function _wireItUp() {
        _wireNav();

        if (E.themeToggle) {
            E.themeToggle.addEventListener('click', function() {
                _applyTheme(_currentTheme() === 'dark' ? 'light' : 'dark');
            });
        }

        E.blogSearch.addEventListener('input', _debounce(_paintPosts, 300));
        E.blogList.addEventListener('click', _cardClick);
        E.detailShareBtn.addEventListener('click', function(){
            if(!watchingId)return;
            var link=location.origin+location.pathname.replace(/[^/]*$/,'')+'read.html?post='+watchingId;
            navigator.clipboard.writeText(link).then(function(){_pop('链接已复制','success');}).catch(function(){_pop('复制失败','error');});
        });
        $$('.modal').forEach(function(m){ m.addEventListener('click', _backdropClick); });

        window.addEventListener('keydown', function(e){
            if(e.key==='Escape'){
                if(E.detailModal&&!E.detailModal.classList.contains('hidden'))window.closeModal('blogDetailModal');
            }
        });

        window.addEventListener('storage', _onStoreChange, false);

        // 读取 URL 参数：?post=xxx 跳转到阅读页
        var params=new URLSearchParams(location.search);
        var pp=params.get('post'); if(pp){ location.replace('read.html?post='+encodeURIComponent(pp)); return; }
    }

    // ========== 入口 ==========
    async function _kickstart() {
        _buildGuestbookPanel();
        _eyeBump();
        _wireItUp();
        _startHeartbeat();

        // 加载博客数据（从 JSON 文件）
        await _loadPosts();
        _paintPosts();
    }

    window.addEventListener('DOMContentLoaded', async function() {
        var savedTheme = null;
        try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
        _applyTheme(savedTheme || 'dark');
        document.body.classList.add('loaded');
        await _kickstart();
        _typeLoop();
        _startBgLoop();
    });

    // ========== 暴露全局 ==========
    window.openModal = window.openModal;
    window.closeModal = window.closeModal;
    window.openLightbox = window.openLightbox;
    window._resetEye = window._resetEye;

})();
