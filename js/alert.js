/**
 * Omiaちゃん Blog — v3.0 雫API 动态版
 * =====================================
 * 背景图片: 雫API (api.imlazy.ink) 随机ACG壁纸
 * 数据存储: localStorage + Flask API 渐进增强
 * 域名: omia.xyz
 */
(function() {
    'use strict';

    // ==================== API 配置 ====================
    const SHIZUKU_IMG_API  = 'https://api.imlazy.ink/img/';       // 横屏随机图
    const SHIZUKU_IMG_API_V = 'https://api.imlazy.ink/img-phone/'; // 竖屏随机图
    const FLASK_API_BASE   = 'http://127.0.0.1:5000/api';

    // ==================== 常量 ====================
    const ADMIN_USER  = 'admin';
    const ADMIN_PASS  = '123456';
    const API_TIMEOUT = 5000;
    const API_RETRIES = 3;
    const BG_REFRESH  = 60000; // 背景自动切换间隔 (ms)

    const DEFAULT_BLOGS = [
        {
            id: 1,
            title: 'Hello World',
            date: '2026-07-02',
            content: 'Hello World！这是 Omiaちゃん 的第一篇测试博客文章。欢迎来到我的小博客，这里将记录我的编程学习、项目开发以及日常生活的点点滴滴～',
            tags: ['测试', '博客', 'HelloWorld']
        },
        {
            id: 2,
            title: 'C++你崛起吧',
            date: '2026-07-06',
            image: 'images/1.jpg',
            tags: ['C++', 'GCC', 'GNU/Linux']
        }
    ];

    const TYPE_TEXT  = 'Hello My name is Omiaちゃん';
    const TYPE_SPEED = 100, TYPE_PAUSE = 3000, TYPE_DEL = 90, TYPE_RESTART = 1500;

    // ==================== 全局状态 ====================
    let blogs          = [];
    let isAdmin        = false;
    let apiOnline      = false;
    let apiToken       = '';
    let pendingImage   = null;
    let detailBlogId   = null;
    let bgTimer        = null;

    // ==================== DOM 缓存 ====================
    const $  = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    const D = {
        bgLayer:          $('#bgLayer'),
        typedText:        $('#typed-text'),
        toast:            $('#toastContainer'),
        // 顶部栏
        apiDot:           $('#apiStatusDot'),
        apiLabel:         $('#apiStatusText'),
        adminBadge:       $('#adminBadge'),
        logoutBtn:        $('#logoutBtn'),
        loginBtn:         $('#loginBtn'),
        // 侧边栏
        sidebarNewBlog:   $('#sidebarNewBlog'),
        // 博客
        blogList:         $('#blogList'),
        blogEmpty:        $('#blogEmpty'),
        blogSearch:       $('#blogSearch'),
        addBlogBtn:       $('#addBlogBtn'),
        // 状态栏
        visitorCount:     $('#visitorCount'),
        statusUser:       $('#statusUser'),
        hiddenLogin:      $('#hiddenLogin'),
        // 登录
        loginModal:       $('#loginModal'),
        loginError:       $('#loginError'),
        username:         $('#username'),
        password:         $('#password'),
        // 博客编辑
        blogModal:        $('#blogModal'),
        blogModalTitle:   $('#blogModalTitle'),
        blogId:           $('#blogId'),
        blogTitle:        $('#blogTitle'),
        blogDate:         $('#blogDate'),
        blogContent:      $('#blogContent'),
        blogTags:         $('#blogTags'),
        charCount:        $('#charCount'),
        blogImage:        $('#blogImage'),
        blogImageFile:    $('#blogImageFile'),
        imgPreview:       $('#imagePreview'),
        imgPreviewImg:    $('#imagePreviewImg'),
        clearImgBtn:      $('#clearImageBtn'),
        // 详情
        detailModal:      $('#blogDetailModal'),
        detailTitle:      $('#detailTitle'),
        detailMeta:       $('#detailMeta'),
        detailImgWrap:    $('#detailImageWrapper'),
        detailContent:    $('#detailContent'),
        detailTags:       $('#detailTags'),
        detailShareBtn:   $('#detailShareBtn'),
    };

    // ==================== 雫API — 随机背景图 ====================
    /**
     * 从雫API获取随机ACG壁纸URL。
     * API返回302重定向到CDN图片地址，通过 Image 预加载捕获最终URL。
     */
    function fetchShizukuBg() {
        return new Promise(function(resolve) {
            var img = new Image();
            var timeout = setTimeout(function() {
                img.src = '';
                resolve(null);
            }, 8000);

            img.onload = function() {
                clearTimeout(timeout);
                resolve(img.currentSrc || img.src);
            };
            img.onerror = function() {
                clearTimeout(timeout);
                resolve(null);
            };
            // 加时间戳防止缓存
            img.src = SHIZUKU_IMG_API + '?_t=' + Date.now();
        });
    }

    /** 设置背景，失败则用本地备用图 */
    async function setShizukuBackground() {
        if (!D.bgLayer) return;
        var url = await fetchShizukuBg();
        if (url && !url.includes('data:')) {
            D.bgLayer.style.backgroundImage = "url('" + url + "')";
            D.bgLayer.style.opacity = '1';
        } else if (!D.bgLayer.style.backgroundImage || D.bgLayer.style.backgroundImage === 'none') {
            // 本地备用
            D.bgLayer.style.backgroundImage = "url('images/columbina-5k-3840x2160-25922.jpg')";
            D.bgLayer.style.opacity = '1';
        }
    }

    /** 启动背景自动切换 */
    function startBgAutoRefresh() {
        stopBgAutoRefresh();
        setShizukuBackground();
        bgTimer = setInterval(setShizukuBackground, BG_REFRESH);
    }

    function stopBgAutoRefresh() {
        if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
    }

    // ==================== Flask API 客户端 ====================
    const FlaskApi = {
        async request(method, path, body) {
            var ctrl = new AbortController();
            var t = setTimeout(function() { ctrl.abort(); }, API_TIMEOUT);
            try {
                var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
                if (apiToken) headers['Authorization'] = 'Bearer ' + apiToken;
                var opts = { method: method, headers: headers, signal: ctrl.signal };
                if (body && method !== 'GET') opts.body = JSON.stringify(body);
                var res = await fetch(FLASK_API_BASE + path, opts);
                clearTimeout(t);
                var data = await res.json();
                return { status: res.status, ok: res.ok, data: data };
            } catch (e) {
                clearTimeout(t);
                return { status: 0, ok: false, data: { error: e.name === 'AbortError' ? 'Timeout' : 'NetworkError' } };
            }
        },
        async health() {
            var r = await this.request('GET', '/health');
            return r.ok && r.data.status === 'ok';
        },
        async login(u, p) {
            var r = await this.request('POST', '/auth/login', { username: u, password: p });
            if (r.ok && r.data.token) { apiToken = r.data.token; apiOnline = true; updateApiStatus(); return true; }
            return false;
        },
        async checkAuth() {
            if (!apiToken) return false;
            var r = await this.request('GET', '/auth/status');
            return r.ok && r.data.authenticated;
        },
        async logout() { await this.request('POST', '/auth/logout'); apiToken = ''; },
        async getBlogs(s) {
            var p = '/blogs'; if (s) p += '?search=' + encodeURIComponent(s);
            var r = await this.request('GET', p);
            if (r.ok) return r.data.blogs || [];
            throw new Error(r.data.message || '获取失败');
        },
        async createBlog(d) {
            var r = await this.request('POST', '/blogs', d);
            if (r.ok) return r.data.blog;
            throw new Error(r.data.message || '创建失败');
        },
        async updateBlog(id, d) {
            var r = await this.request('PUT', '/blogs/' + id, d);
            if (r.ok) return r.data.blog;
            throw new Error(r.data.message || '更新失败');
        },
        async deleteBlog(id) {
            var r = await this.request('DELETE', '/blogs/' + id);
            if (r.ok) return true;
            throw new Error(r.data.message || '删除失败');
        }
    };

    async function tryConnectFlask() {
        for (var i = 0; i < API_RETRIES; i++) {
            try { if (await FlaskApi.health()) { apiOnline = true; console.log('[Flask] 已连接'); updateApiStatus(); return true; } }
            catch (e) { /* retry */ }
            if (i < API_RETRIES - 1) await sleep(500);
        }
        console.log('[Flask] 未连接，离线模式');
        updateApiStatus();
        return false;
    }

    function updateApiStatus() {
        if (!D.apiDot || !D.apiLabel) return;
        D.apiDot.classList.toggle('connected', apiOnline);
        D.apiLabel.classList.toggle('connected', apiOnline);
        D.apiLabel.textContent = apiOnline ? '已连接' : '离线模式';
    }

    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    // ==================== Toast ====================
    function toast(msg, type) {
        type = type || 'info';
        var icons = { success: '✅', error: '❌', info: 'ℹ️' };
        var el = document.createElement('div');
        el.className = 'toast-item toast-' + type;
        el.textContent = (icons[type] || '') + ' ' + msg;
        D.toast.appendChild(el);
        setTimeout(function() {
            el.style.animation = 'toastOut 0.35s ease forwards';
            setTimeout(function() { el.remove(); }, 350);
        }, 2800);
    }

    // ==================== 数据持久化 ====================
    function loadBlogs() {
        try { var s = localStorage.getItem('blogs'); blogs = s ? JSON.parse(s) : DEFAULT_BLOGS.slice(); if (!s) saveLocal(); }
        catch (e) { blogs = DEFAULT_BLOGS.slice(); }
    }
    function saveLocal() {
        try { localStorage.setItem('blogs', JSON.stringify(blogs)); }
        catch (e) { toast('存储空间不足', 'error'); }
    }
    async function syncFromFlask() {
        if (!apiOnline) return;
        try { var b = await FlaskApi.getBlogs(); if (b.length) { blogs = b; saveLocal(); renderBlogs(); } }
        catch (e) { console.warn('[Flask] 同步失败: ' + e.message); }
    }

    // ==================== 登录 ====================
    function checkLogin() { isAdmin = localStorage.getItem('isAdminLoggedIn') === 'true'; updateAdminUI(); }
    function updateAdminUI() {
        var show = function(el, v) { if (el) el.classList.toggle('hidden', !v); };
        show(D.adminBadge, isAdmin); show(D.logoutBtn, isAdmin);
        show(D.loginBtn, !isAdmin); show(D.addBlogBtn, isAdmin);
        show(D.sidebarNewBlog, isAdmin); show(D.hiddenLogin, !isAdmin);
        $$('.admin-only').forEach(function(b) { b.classList.toggle('hidden', !isAdmin); });
        if (D.statusUser) { D.statusUser.textContent = isAdmin ? '👤 管理员' : '🔒 未登录'; D.statusUser.classList.toggle('logged-in', isAdmin); }
        renderBlogs();
    }

    window.adminLogin = async function() {
        var u = D.username.value.trim(), p = D.password.value;
        var ok = (u === ADMIN_USER && p === ADMIN_PASS);
        var apiOk = false;
        if (apiOnline) { apiOk = await FlaskApi.login(u, p); if (apiOk) { localStorage.setItem('apiAuthToken', apiToken); await syncFromFlask(); } }
        if (ok || apiOk) { isAdmin = true; localStorage.setItem('isAdminLoggedIn', 'true'); updateAdminUI(); closeModal('loginModal'); D.username.value = ''; D.password.value = ''; D.loginError.textContent = ''; toast('登录成功 ' + (apiOk ? '(API)' : '(离线)'), 'success'); }
        else { D.loginError.textContent = '❌ 账号或密码错误'; shake(D.loginModal.querySelector('.modal-content')); }
    };
    window.adminLogout = async function() {
        isAdmin = false; localStorage.removeItem('isAdminLoggedIn');
        if (apiOnline && apiToken) { await FlaskApi.logout(); apiToken = ''; localStorage.removeItem('apiAuthToken'); }
        updateAdminUI(); toast('已退出登录', 'info');
    };

    // ==================== 模态框 ====================
    window.openModal  = function(id) { var m = document.getElementById(id); if (!m) return; m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; var inp = m.querySelector('input:not([type="hidden"])'); if (inp) setTimeout(function() { inp.focus(); }, 150); };
    window.closeModal = function(id) {
        var m = document.getElementById(id); if (!m) return;
        m.classList.add('hidden'); document.body.style.overflow = '';
        if (id === 'blogModal') resetForm();
        if (id === 'loginModal') D.loginError.textContent = '';
        if (id === 'blogDetailModal') { D.detailTitle.textContent = ''; D.detailContent.innerHTML = ''; D.detailTags.innerHTML = ''; D.detailImgWrap.innerHTML = ''; D.detailImgWrap.classList.add('hidden'); detailBlogId = null; }
    };
    function modalBackdrop(e) { if (e.target.classList.contains('modal')) closeModal(e.target.id); }
    function resetForm() { D.blogId.value = ''; D.blogTitle.value = ''; D.blogDate.value = ''; D.blogContent.value = ''; D.blogTags.value = ''; D.charCount.textContent = '0 / 5000'; D.charCount.className = 'char-count'; clearImages(); }

    // ==================== 侧边栏导航 ====================
    function bindNav() {
        var btns = $$('.sidebar-btn[data-panel]'), panels = $$('.content-panel');
        btns.forEach(function(b) {
            b.addEventListener('click', function() {
                if (this.classList.contains('disabled') || this.disabled) return;
                btns.forEach(function(x) { x.classList.remove('active'); });
                this.classList.add('active');
                var tid = this.dataset.panel;
                panels.forEach(function(p) { p.classList.remove('active'); });
                var tgt = document.getElementById(tid);
                if (tgt) { tgt.classList.add('active'); tgt.style.animation = 'none'; void tgt.offsetWidth; tgt.style.animation = 'panelIn 0.35s ease forwards'; }
            });
        });
        if (D.sidebarNewBlog) D.sidebarNewBlog.addEventListener('click', openAddBlog);
    }

    // ==================== 博客 CRUD ====================
    function renderBlogs() {
        var s = D.blogSearch ? D.blogSearch.value.trim().toLowerCase() : '';
        var f = blogs;
        if (s) f = blogs.filter(function(b) { return b.title.toLowerCase().includes(s) || b.content.toLowerCase().includes(s) || b.tags.some(function(t) { return t.toLowerCase().includes(s); }); });
        D.blogList.innerHTML = '';
        if (!f.length) { D.blogList.style.display = 'none'; D.blogEmpty.classList.remove('hidden'); D.blogEmpty.querySelector('.empty-subtitle').textContent = s ? '未找到匹配的博客' : '登录后点击「新建博客」开始创作吧'; return; }
        D.blogList.style.display = ''; D.blogEmpty.classList.add('hidden');

        f.forEach(function(b) {
            var card = document.createElement('article'); card.className = 'blog-card'; card.dataset.blogId = b.id;
            var tagsH = b.tags.map(function(t) { return '<span class="blog-tag">' + escHtml(t) + '</span>'; }).join('');
            var actH = isAdmin ? '<div class="blog-actions"><button class="rinui-btn primary" onclick="event.stopPropagation();editBlog(' + b.id + ')">✏️ 编辑</button><button class="rinui-btn danger" onclick="event.stopPropagation();deleteBlog(' + b.id + ')">🗑️ 删除</button></div>' : '';
            var imgH = (b.image || b.images) ? '<div class="blog-image-wrapper"><img src="' + escAttr(b.image || b.images) + '" alt="' + escAttr(b.title) + '" class="blog-image" loading="lazy" onclick="event.stopPropagation();openLightbox(\'' + escAttr(b.image || b.images) + '\')" onerror="this.parentElement.style.display=\'none\'"></div>' : '';
            card.innerHTML = '<div class="blog-date">' + escHtml(b.date) + '</div><h3 class="blog-card-title">' + escHtml(b.title) + '</h3>' + imgH + '<p>' + escHtml(b.content) + '</p><div class="blog-tags-row">' + tagsH + '</div><span class="read-more">阅读全文 →</span>' + actH;
            D.blogList.appendChild(card);
        });
    }

    function cardClick(e) {
        var c = e.target.closest('.blog-card'); if (!c) return;
        if (e.target.closest('button') || e.target.closest('.blog-image')) return;
        var id = parseInt(c.dataset.blogId, 10); if (id) openDetail(id);
    }

    window.openAddBlog = function() { D.blogModalTitle.textContent = '✏️ 发布新博客'; resetForm(); D.blogDate.value = new Date().toISOString().split('T')[0]; openModal('blogModal'); };
    window.editBlog    = function(id) {
        var b = blogs.find(function(x) { return x.id === id; }); if (!b) return;
        D.blogModalTitle.textContent = '✏️ 编辑博客'; D.blogId.value = b.id; D.blogTitle.value = b.title; D.blogDate.value = b.date; D.blogContent.value = b.content; D.blogTags.value = b.tags.join(', ');
        populateImages(b.image || ''); updateCharCount(); openModal('blogModal');
    };
    window.saveBlog    = async function() {
        var id = D.blogId.value, title = D.blogTitle.value.trim(), date = D.blogDate.value, content = D.blogContent.value.trim();
        var tags = D.blogTags.value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(Boolean);
        var img = getImageData();
        if (!title) { toast('请填写标题', 'error'); D.blogTitle.focus(); return; }
        if (!date)  { toast('请选择日期', 'error'); return; }
        if (!content) { toast('请填写内容', 'error'); D.blogContent.focus(); return; }
        var payload = { title: title, date: date, content: content, tags: tags, image: img };

        if (apiOnline && apiToken) {
            try { if (id) { await FlaskApi.updateBlog(parseInt(id), payload); } else { await FlaskApi.createBlog(payload); } toast(id ? '已更新 (API)' : '发布成功 (API)', 'success'); await syncFromFlask(); }
            catch (e) { toast('API失败: ' + e.message, 'error'); saveLocalBlog(id, title, date, content, tags, img); }
        } else { saveLocalBlog(id, title, date, content, tags, img); }
        renderBlogs(); closeModal('blogModal');
    };
    function saveLocalBlog(id, title, date, content, tags, img) {
        if (id) { var i = blogs.findIndex(function(b) { return b.id === parseInt(id); }); if (i !== -1) { blogs[i] = Object.assign({}, blogs[i], { title: title, date: date, content: content, tags: tags, image: img }); toast('已更新 (离线)', 'success'); } }
        else { var nid = blogs.length ? Math.max.apply(null, blogs.map(function(b) { return b.id; })) + 1 : 1; blogs.unshift({ id: nid, title: title, date: date, content: content, tags: tags, image: img }); toast('发布成功 (离线)', 'success'); }
        saveLocal();
    }
    window.deleteBlog = async function(id) {
        if (!confirm('确定删除？不可恢复。')) return;
        if (apiOnline && apiToken) { try { await FlaskApi.deleteBlog(id); toast('已删除 (API)', 'info'); await syncFromFlask(); } catch (e) { toast('API失败: ' + e.message, 'error'); blogs = blogs.filter(function(b) { return b.id !== id; }); saveLocal(); } }
        else { blogs = blogs.filter(function(b) { return b.id !== id; }); saveLocal(); toast('已删除', 'info'); }
        renderBlogs();
    };

    // ==================== 博客详情 ====================
    function openDetail(id) {
        var b = blogs.find(function(x) { return x.id === id; }); if (!b) return;
        if (detailBlogId === id && D.detailModal && !D.detailModal.classList.contains('hidden')) return;
        detailBlogId = id;
        D.detailTitle.textContent = b.title;
        D.detailMeta.innerHTML = '📅 ' + escHtml(b.date) + ' | ✍️ Omiaちゃん';
        var img = b.image || b.images || '';
        if (img) { D.detailImgWrap.classList.remove('hidden'); D.detailImgWrap.innerHTML = '<img src="' + escAttr(img) + '" alt="' + escAttr(b.title) + '" onclick="openLightbox(\'' + escAttr(img) + '\')">'; }
        else { D.detailImgWrap.classList.add('hidden'); D.detailImgWrap.innerHTML = ''; }
        D.detailContent.innerHTML = b.content.split('\n').filter(function(p) { return p.trim(); }).map(function(p) { return '<p>' + escHtml(p.trim()) + '</p>'; }).join('');
        D.detailTags.innerHTML = b.tags.map(function(t) { return '<span class="blog-tag">' + escHtml(t) + '</span>'; }).join('');
        openModal('blogDetailModal');
    }

    // ==================== 图片处理 ====================
    function clearImages() { pendingImage = null; if (D.blogImage) D.blogImage.value = ''; if (D.blogImageFile) D.blogImageFile.value = ''; if (D.imgPreview) D.imgPreview.classList.add('hidden'); if (D.imgPreviewImg) D.imgPreviewImg.src = ''; }
    function getImageData() { return pendingImage || (D.blogImage ? D.blogImage.value.trim() : ''); }
    function populateImages(d) { clearImages(); if (!d) return; if (d.startsWith('data:image/')) { pendingImage = d; showPreview(d); } else { if (D.blogImage) D.blogImage.value = d; pendingImage = d; showPreview(d); } }
    function showPreview(src) { if (!D.imgPreview || !D.imgPreviewImg) return; D.imgPreview.classList.remove('hidden'); D.imgPreviewImg.src = src; }
    function handleFileSelect() {
        var f = D.blogImageFile.files[0]; if (!f) return;
        if (!f.type.startsWith('image/')) { toast('请选择图片文件', 'error'); D.blogImageFile.value = ''; return; }
        if (f.size > 2*1024*1024) { toast('图片不能超过2MB', 'error'); D.blogImageFile.value = ''; return; }
        var r = new FileReader(); r.onload = function(e) { pendingImage = e.target.result; showPreview(pendingImage); if (D.blogImage) D.blogImage.value = ''; };
        r.onerror = function() { toast('读取失败', 'error'); }; r.readAsDataURL(f);
    }
    function handleUrlInput() { var u = D.blogImage.value.trim(); if (u) { pendingImage = u; showPreview(u); if (D.blogImageFile) D.blogImageFile.value = ''; } else { pendingImage = null; if (D.imgPreview) D.imgPreview.classList.add('hidden'); } }
    window.openLightbox = function(src) { var ex = document.querySelector('.lightbox-overlay'); if (ex) ex.remove(); var o = document.createElement('div'); o.className = 'lightbox-overlay'; o.innerHTML = '<img src="' + escAttr(src) + '" alt="放大查看">'; o.addEventListener('click', function() { o.remove(); }); document.body.appendChild(o); };

    // ==================== 字数统计 ====================
    function updateCharCount() { if (!D.charCount) return; var l = D.blogContent.value.length, m = 5000; D.charCount.textContent = l + ' / ' + m; D.charCount.className = 'char-count' + (l > m*0.9 ? ' danger' : '') + (l > m*0.7 && l <= m*0.9 ? ' warning' : ''); }

    // ==================== 访客计数 ====================
    function visitorCount() { var k = 'site_visitor_v3', sk = 'site_visit_v3', t = parseInt(localStorage.getItem(k),10)||0; if (!sessionStorage.getItem(sk)) { t++; localStorage.setItem(k, String(t)); sessionStorage.setItem(sk, '1'); } if (D.visitorCount) D.visitorCount.textContent = t; }

    // ==================== 打字机 ====================
    var ti = 0, td = false, tt = null;
    function typing() { clearTimeout(tt); if (!D.typedText) return; if (!td) { if (ti < TYPE_TEXT.length) { D.typedText.textContent += TYPE_TEXT[ti]; ti++; tt = setTimeout(typing, TYPE_SPEED); } else { td = true; tt = setTimeout(typing, TYPE_PAUSE); } } else { if (ti > 0) { D.typedText.textContent = TYPE_TEXT.slice(0, ti-1); ti--; tt = setTimeout(typing, TYPE_DEL); } else { td = false; tt = setTimeout(typing, TYPE_RESTART); } } }

    // ==================== 工具 ====================
    function escHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function escAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function debounce(f, d) { var t; return function() { var c=this, a=arguments; clearTimeout(t); t = setTimeout(function() { f.apply(c,a); }, d); }; }
    function shake(el) { if (!el) return; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'shake 0.5s ease'; setTimeout(function() { el.style.animation = ''; }, 500); }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        bindNav();
        D.loginBtn.addEventListener('click', function() { openModal('loginModal'); });
        D.logoutBtn.addEventListener('click', adminLogout);
        D.hiddenLogin.addEventListener('click', function() { openModal('loginModal'); });
        D.addBlogBtn.addEventListener('click', openAddBlog);
        D.blogSearch.addEventListener('input', debounce(renderBlogs, 300));
        D.blogContent.addEventListener('input', updateCharCount);
        D.blogImageFile.addEventListener('change', handleFileSelect);
        D.blogImage.addEventListener('input', debounce(handleUrlInput, 500));
        D.clearImgBtn.addEventListener('click', clearImages);
        D.blogList.addEventListener('click', cardClick);
        D.detailShareBtn.addEventListener('click', function() { if (!detailBlogId) return; var u = location.origin + location.pathname + '?blog=' + detailBlogId; navigator.clipboard.writeText(u).then(function() { toast('链接已复制', 'success'); }).catch(function() { toast('复制失败', 'error'); }); });
        $$('.modal').forEach(function(m) { m.addEventListener('click', modalBackdrop); });
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (D.detailModal && !D.detailModal.classList.contains('hidden')) closeModal('blogDetailModal');
                else if (D.blogModal && !D.blogModal.classList.contains('hidden')) closeModal('blogModal');
                else if (D.loginModal && !D.loginModal.classList.contains('hidden')) closeModal('loginModal');
            }
            if (e.key === 'Enter' && D.loginModal && !D.loginModal.classList.contains('hidden')) adminLogin();
            if ((e.ctrlKey||e.metaKey) && e.key === 's' && D.blogModal && !D.blogModal.classList.contains('hidden')) { e.preventDefault(); saveBlog(); }
        });
    }

    // ==================== 启动 ====================
    async function init() {
        var fp = tryConnectFlask();
        loadBlogs(); checkLogin(); renderBlogs(); visitorCount(); bindEvents();
        await fp;
        if (apiOnline) { await syncFromFlask(); var st = localStorage.getItem('apiAuthToken'); if (st) { apiToken = st; if (await FlaskApi.checkAuth()) { isAdmin = true; updateAdminUI(); } else { apiToken = ''; localStorage.removeItem('apiAuthToken'); } } }
    }

    window.addEventListener('DOMContentLoaded', async function() {
        document.body.classList.add('loaded');
        await init();
        typing();
        startBgAutoRefresh();
    });

    window.editBlog = window.editBlog; window.deleteBlog = window.deleteBlog;
    window.saveBlog = window.saveBlog; window.openAddBlog = window.openAddBlog;
    window.adminLogin = window.adminLogin; window.adminLogout = window.adminLogout;
    window.openModal = window.openModal; window.closeModal = window.closeModal;

})();
