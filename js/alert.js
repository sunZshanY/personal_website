/**
 * Omiaちゃん Blog — 前端交互逻辑 v2.0
 * ======================================
 * 严格遵循 RinUI 架构：侧边栏导航、顶部状态指示器、模态框系统。
 * 数据持久化: localStorage（离线模式）+ Flask API（在线模式，渐进增强）。
 */
(function() {
    'use strict';

    // ==================== 常量配置 ====================
    const ADMIN_USERNAME = 'admin';
    const ADMIN_PASSWORD = '123456';
    const API_BASE_URL = 'http://127.0.0.1:5000/api';
    const API_TIMEOUT_MS = 5000;
    const API_RETRY_COUNT = 3;

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
        },
    ];

    const BACKGROUND_IMAGES = [
        'images/columbina-5k-3840x2160-25922.jpg',
        'images/oshi-no-ko-3840x2160-25261.jpg',
        'images/sparxie-honkai-star-3840x2160-26290.jpg',
        'images/zhuang-fangyi-3840x2160-26226.jpg'
    ];

    const TYPEWRITER_TEXT = 'Hello My name is Omiaちゃん';
    const TYPEWRITER_SPEED = 100;
    const TYPEWRITER_PAUSE = 3000;
    const TYPEWRITER_DELETE = 90;
    const TYPEWRITER_RESTART = 1500;

    // ==================== 全局状态 ====================
    let blogs = [];
    let isAdminLoggedIn = false;
    let useApiBackend = false;
    let apiAuthToken = '';
    let apiConnected = false;
    let pendingImageData = null;
    let currentDetailBlogId = null;

    // ==================== DOM 引用 ====================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const D = {
        // 布局
        bgLayer:          $('#bgLayer'),
        typedText:        $('#typed-text'),
        toastContainer:   $('#toastContainer'),
        // 顶部栏
        apiStatusDot:     $('#apiStatusDot'),
        apiStatusText:    $('#apiStatusText'),
        adminBadge:       $('#adminBadge'),
        logoutBtn:        $('#logoutBtn'),
        loginBtn:         $('#loginBtn'),
        // 侧边栏
        sidebarNewBlog:   $('#sidebarNewBlog'),
        // 博客内容
        blogList:         $('#blogList'),
        blogEmpty:        $('#blogEmpty'),
        blogSearch:       $('#blogSearch'),
        addBlogBtn:       $('#addBlogBtn'),
        // 状态栏
        visitorCount:     $('#visitorCount'),
        statusUser:       $('#statusUser'),
        hiddenLogin:      $('#hiddenLogin'),
        // 登录弹窗
        loginModal:       $('#loginModal'),
        loginError:       $('#loginError'),
        username:         $('#username'),
        password:         $('#password'),
        // 博客编辑弹窗
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
        imagePreview:     $('#imagePreview'),
        imagePreviewImg:  $('#imagePreviewImg'),
        clearImageBtn:    $('#clearImageBtn'),
        // 博客详情弹窗
        blogDetailModal:   $('#blogDetailModal'),
        detailTitle:       $('#detailTitle'),
        detailMeta:        $('#detailMeta'),
        detailImageWrapper:$('#detailImageWrapper'),
        detailContent:     $('#detailContent'),
        detailTags:        $('#detailTags'),
        detailShareBtn:    $('#detailShareBtn'),
    };

    // ==================== API 客户端 ====================
    const ApiClient = {
        async request(method, path, body) {
            const ctrl = new AbortController();
            const timer = setTimeout(function() { ctrl.abort(); }, API_TIMEOUT_MS);
            try {
                const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
                if (apiAuthToken) headers['Authorization'] = 'Bearer ' + apiAuthToken;
                const opts = { method: method, headers: headers, signal: ctrl.signal };
                if (body && method !== 'GET') opts.body = JSON.stringify(body);
                const res = await fetch(API_BASE_URL + path, opts);
                clearTimeout(timer);
                const data = await res.json();
                return { status: res.status, ok: res.ok, data: data };
            } catch (err) {
                clearTimeout(timer);
                if (err.name === 'AbortError') return { status: 0, ok: false, data: { error: 'Timeout' } };
                return { status: 0, ok: false, data: { error: 'NetworkError' } };
            }
        },
        async healthCheck() {
            const r = await this.request('GET', '/health');
            return r.ok && r.data.status === 'ok';
        },
        async login(user, pass) {
            const r = await this.request('POST', '/auth/login', { username: user, password: pass });
            if (r.ok && r.data.token) { apiAuthToken = r.data.token; apiConnected = true; return true; }
            return false;
        },
        async checkAuth() {
            if (!apiAuthToken) return false;
            const r = await this.request('GET', '/auth/status');
            return r.ok && r.data.authenticated;
        },
        async logout() {
            await this.request('POST', '/auth/logout');
            apiAuthToken = '';
        },
        async getBlogs(search) {
            var p = '/blogs';
            if (search) p += '?search=' + encodeURIComponent(search);
            const r = await this.request('GET', p);
            if (r.ok) return r.data.blogs || [];
            throw new Error(r.data.message || '获取失败');
        },
        async createBlog(data) {
            const r = await this.request('POST', '/blogs', data);
            if (r.ok) return r.data.blog;
            throw new Error(r.data.message || '创建失败');
        },
        async updateBlog(id, data) {
            const r = await this.request('PUT', '/blogs/' + id, data);
            if (r.ok) return r.data.blog;
            throw new Error(r.data.message || '更新失败');
        },
        async deleteBlog(id) {
            const r = await this.request('DELETE', '/blogs/' + id);
            if (r.ok) return true;
            throw new Error(r.data.message || '删除失败');
        },
        async getVisitors() {
            const r = await this.request('GET', '/stats/visitors');
            return r.ok ? r.data : null;
        },
        async incrementVisitors() {
            const r = await this.request('POST', '/stats/visitors');
            return r.ok ? r.data : null;
        },
    };

    // ==================== Toast 通知 ====================
    function showToast(message, type) {
        type = type || 'info';
        var icons = { success: '✅', error: '❌', info: 'ℹ️' };
        var item = document.createElement('div');
        item.className = 'toast-item toast-' + type;
        item.textContent = (icons[type] || '') + ' ' + message;
        D.toastContainer.appendChild(item);
        setTimeout(function() {
            item.style.animation = 'toastOut 0.35s ease forwards';
            setTimeout(function() { item.remove(); }, 350);
        }, 2800);
    }

    // ==================== API 连接检测 ====================
    async function tryConnectApi() {
        for (var i = 0; i < API_RETRY_COUNT; i++) {
            try {
                if (await ApiClient.healthCheck()) {
                    useApiBackend = true;
                    apiConnected = true;
                    console.log('[API] 已连接 Flask 服务器');
                    updateConnectionUI();
                    return true;
                }
            } catch (e) { /* retry */ }
            if (i < API_RETRY_COUNT - 1) await sleep(500);
        }
        console.log('[API] 服务器未连接，使用离线模式');
        updateConnectionUI();
        return false;
    }

    function updateConnectionUI() {
        if (D.apiStatusDot && D.apiStatusText) {
            if (apiConnected) {
                D.apiStatusDot.classList.add('connected');
                D.apiStatusText.classList.add('connected');
                D.apiStatusText.textContent = '已连接';
            } else {
                D.apiStatusDot.classList.remove('connected');
                D.apiStatusText.classList.remove('connected');
                D.apiStatusText.textContent = '离线模式';
            }
        }
    }

    function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    // ==================== 数据持久化 ====================
    function loadBlogs() {
        try {
            var stored = localStorage.getItem('blogs');
            blogs = stored ? JSON.parse(stored) : DEFAULT_BLOGS.slice();
            if (!stored) saveBlogsLocal();
        } catch (e) {
            console.warn('localStorage 读取失败');
            blogs = DEFAULT_BLOGS.slice();
        }
    }

    function saveBlogsLocal() {
        try { localStorage.setItem('blogs', JSON.stringify(blogs)); }
        catch (e) { showToast('存储空间不足，请清理旧数据', 'error'); }
    }

    async function syncFromApi() {
        if (!useApiBackend) return;
        try {
            var apiBlogs = await ApiClient.getBlogs();
            if (apiBlogs.length > 0) {
                blogs = apiBlogs;
                saveBlogsLocal();
                renderBlogs();
                console.log('[API] 同步 ' + apiBlogs.length + ' 篇博客');
            }
        } catch (e) { console.warn('[API] 同步失败: ' + e.message); }
    }

    // ==================== 登录系统 ====================
    function checkLoginStatus() {
        isAdminLoggedIn = localStorage.getItem('isAdminLoggedIn') === 'true';
        var savedToken = localStorage.getItem('apiAuthToken');
        if (!isAdminLoggedIn && savedToken) apiAuthToken = savedToken;
        updateAdminUI();
    }

    function updateAdminUI() {
        var show = function(el, v) { if (el) el.classList.toggle('hidden', !v); };

        show(D.adminBadge, isAdminLoggedIn);
        show(D.logoutBtn, isAdminLoggedIn);
        show(D.loginBtn, !isAdminLoggedIn);
        show(D.addBlogBtn, isAdminLoggedIn);
        show(D.sidebarNewBlog, isAdminLoggedIn);
        show(D.hiddenLogin, !isAdminLoggedIn);

        // 侧边栏管理员按钮
        var adminBtns = $$('.admin-only');
        adminBtns.forEach(function(b) { b.classList.toggle('hidden', !isAdminLoggedIn); });

        // 状态栏用户状态
        if (D.statusUser) {
            D.statusUser.textContent = isAdminLoggedIn ? '👤 管理员' : '🔒 未登录';
            D.statusUser.classList.toggle('logged-in', isAdminLoggedIn);
        }

        renderBlogs();
    }

    window.adminLogin = async function() {
        var username = D.username.value.trim();
        var password = D.password.value;
        var localOk = (username === ADMIN_USERNAME && password === ADMIN_PASSWORD);
        var apiOk = false;

        if (useApiBackend) {
            apiOk = await ApiClient.login(username, password);
            if (apiOk) {
                localStorage.setItem('apiAuthToken', apiAuthToken);
                await syncFromApi();
            }
        }

        if (localOk || apiOk) {
            isAdminLoggedIn = true;
            localStorage.setItem('isAdminLoggedIn', 'true');
            updateAdminUI();
            closeModal('loginModal');
            D.username.value = '';
            D.password.value = '';
            D.loginError.textContent = '';
            showToast('登录成功，欢迎回来！' + (apiOk ? '（API 模式）' : '（离线模式）'), 'success');
        } else {
            D.loginError.textContent = '❌ 管理员账号或密码错误';
            shakeElement(D.loginModal.querySelector('.modal-content'));
        }
    };

    window.adminLogout = async function() {
        isAdminLoggedIn = false;
        localStorage.removeItem('isAdminLoggedIn');
        if (useApiBackend && apiAuthToken) {
            await ApiClient.logout();
            apiAuthToken = '';
            localStorage.removeItem('apiAuthToken');
        }
        updateAdminUI();
        showToast('已退出登录', 'info');
    };

    // ==================== 模态框操作 ====================
    window.openModal = function(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        var input = modal.querySelector('input:not([type="hidden"])');
        if (input) setTimeout(function() { input.focus(); }, 150);
    };

    window.closeModal = function(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';

        if (modalId === 'blogModal') resetBlogForm();
        if (modalId === 'loginModal') D.loginError.textContent = '';
        if (modalId === 'blogDetailModal') {
            D.detailTitle.textContent = '';
            D.detailContent.innerHTML = '';
            D.detailTags.innerHTML = '';
            D.detailImageWrapper.innerHTML = '';
            D.detailImageWrapper.classList.add('hidden');
            currentDetailBlogId = null;
        }
    };

    function handleModalBackdrop(e) {
        if (e.target.classList.contains('modal')) closeModal(e.target.id);
    }

    function resetBlogForm() {
        D.blogId.value = '';
        D.blogTitle.value = '';
        D.blogDate.value = '';
        D.blogContent.value = '';
        D.blogTags.value = '';
        D.charCount.textContent = '0 / 5000';
        D.charCount.className = 'char-count';
        clearImageFields();
    }

    // ==================== 侧边栏导航 ====================
    function bindSidebarNav() {
        var btns = $$('.sidebar-btn[data-panel]');
        var panels = $$('.content-panel');

        btns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (this.classList.contains('disabled') || this.hasAttribute('disabled')) return;

                // 更新激活状态
                btns.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');

                // 切换面板
                var targetId = this.dataset.panel;
                panels.forEach(function(p) { p.classList.remove('active'); });
                var target = document.getElementById(targetId);
                if (target) {
                    target.classList.add('active');
                    target.style.animation = 'none';
                    void target.offsetWidth;
                    target.style.animation = 'panelIn 0.35s ease forwards';
                }
            });
        });

        // "新建博客"按钮
        if (D.sidebarNewBlog) {
            D.sidebarNewBlog.addEventListener('click', openAddBlog);
        }
    }

    // ==================== 博客 CRUD ====================
    function renderBlogs() {
        var search = D.blogSearch ? D.blogSearch.value.trim().toLowerCase() : '';
        var filtered = blogs;
        if (search) {
            filtered = blogs.filter(function(b) {
                return b.title.toLowerCase().includes(search) ||
                       b.content.toLowerCase().includes(search) ||
                       b.tags.some(function(t) { return t.toLowerCase().includes(search); });
            });
        }

        D.blogList.innerHTML = '';

        if (filtered.length === 0) {
            D.blogList.style.display = 'none';
            D.blogEmpty.classList.remove('hidden');
            var p = D.blogEmpty.querySelector('.empty-subtitle');
            if (p) p.textContent = search ? '未找到匹配的博客' : '登录后点击「新建博客」开始创作吧';
            return;
        }

        D.blogList.style.display = '';
        D.blogEmpty.classList.add('hidden');

        filtered.forEach(function(blog) {
            var card = document.createElement('article');
            card.className = 'blog-card';
            card.dataset.blogId = blog.id;

            var tagsHtml = blog.tags.map(function(t) {
                return '<span class="blog-tag">' + escapeHtml(t) + '</span>';
            }).join('');

            var actionsHtml = isAdminLoggedIn ?
                '<div class="blog-actions">' +
                    '<button class="rinui-btn primary" onclick="event.stopPropagation();editBlog(' + blog.id + ')">✏️ 编辑</button>' +
                    '<button class="rinui-btn danger" onclick="event.stopPropagation();deleteBlog(' + blog.id + ')">🗑️ 删除</button>' +
                '</div>' : '';

            var img = blog.image || blog.images || '';
            var imgHtml = img ?
                '<div class="blog-image-wrapper">' +
                    '<img src="' + escapeAttr(img) + '" alt="' + escapeAttr(blog.title) + '" class="blog-image" loading="lazy" onclick="event.stopPropagation();openLightbox(\'' + escapeAttr(img) + '\')" onerror="this.parentElement.style.display=\'none\'">' +
                '</div>' : '';

            card.innerHTML =
                '<div class="blog-date">' + escapeHtml(blog.date) + '</div>' +
                '<h3 class="blog-card-title">' + escapeHtml(blog.title) + '</h3>' +
                imgHtml +
                '<p>' + escapeHtml(blog.content) + '</p>' +
                '<div class="blog-tags-row">' + tagsHtml + '</div>' +
                '<span class="read-more">阅读全文 →</span>' +
                actionsHtml;

            D.blogList.appendChild(card);
        });
    }

    function handleBlogCardClick(e) {
        var card = e.target.closest('.blog-card');
        if (!card) return;
        if (e.target.closest('button') || e.target.closest('.blog-image') || e.target.closest('a')) return;
        var id = parseInt(card.dataset.blogId, 10);
        if (id) openBlogDetail(id);
    }

    window.openAddBlog = function() {
        D.blogModalTitle.textContent = '✏️ 发布新博客';
        resetBlogForm();
        D.blogDate.value = new Date().toISOString().split('T')[0];
        openModal('blogModal');
    };

    window.editBlog = function(id) {
        var blog = blogs.find(function(b) { return b.id === id; });
        if (!blog) return;
        D.blogModalTitle.textContent = '✏️ 编辑博客';
        D.blogId.value = blog.id;
        D.blogTitle.value = blog.title;
        D.blogDate.value = blog.date;
        D.blogContent.value = blog.content;
        D.blogTags.value = blog.tags.join(', ');
        populateImageFields(blog.image || '');
        updateCharCount();
        openModal('blogModal');
    };

    window.saveBlog = async function() {
        var id    = D.blogId.value;
        var title = D.blogTitle.value.trim();
        var date  = D.blogDate.value;
        var content = D.blogContent.value.trim();
        var tags  = D.blogTags.value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(Boolean);
        var image = getImageData();

        if (!title)   { showToast('请填写博客标题', 'error'); D.blogTitle.focus(); return; }
        if (!date)    { showToast('请选择日期', 'error'); return; }
        if (!content) { showToast('请填写博客内容', 'error'); D.blogContent.focus(); return; }

        var payload = { title: title, date: date, content: content, tags: tags, image: image };

        if (useApiBackend && apiAuthToken) {
            try {
                if (id) { await ApiClient.updateBlog(parseInt(id), payload); }
                else    { await ApiClient.createBlog(payload); }
                showToast(id ? '博客已更新（API 模式）' : '博客发布成功（API 模式）', 'success');
                await syncFromApi();
            } catch (e) {
                showToast('API 保存失败: ' + e.message, 'error');
                saveBlogLocal(id, title, date, content, tags, image);
            }
        } else {
            saveBlogLocal(id, title, date, content, tags, image);
        }

        renderBlogs();
        closeModal('blogModal');
    };

    function saveBlogLocal(id, title, date, content, tags, image) {
        if (id) {
            var idx = blogs.findIndex(function(b) { return b.id === parseInt(id); });
            if (idx !== -1) {
                blogs[idx] = Object.assign({}, blogs[idx], { title: title, date: date, content: content, tags: tags, image: image });
                showToast('博客已更新（离线模式）', 'success');
            }
        } else {
            var newId = blogs.length > 0 ? Math.max.apply(null, blogs.map(function(b) { return b.id; })) + 1 : 1;
            blogs.unshift({ id: newId, title: title, date: date, content: content, tags: tags, image: image });
            showToast('博客发布成功（离线模式）', 'success');
        }
        saveBlogsLocal();
    }

    window.deleteBlog = async function(id) {
        if (!confirm('确定要删除这篇博客吗？此操作不可恢复。')) return;

        if (useApiBackend && apiAuthToken) {
            try {
                await ApiClient.deleteBlog(id);
                showToast('博客已删除（API 模式）', 'info');
                await syncFromApi();
            } catch (e) {
                showToast('API 删除失败: ' + e.message, 'error');
                blogs = blogs.filter(function(b) { return b.id !== id; });
                saveBlogsLocal();
            }
        } else {
            blogs = blogs.filter(function(b) { return b.id !== id; });
            saveBlogsLocal();
            showToast('博客已删除', 'info');
        }

        renderBlogs();
    };

    // ==================== 博客详情 ====================
    function openBlogDetail(blogId) {
        var blog = blogs.find(function(b) { return b.id === blogId; });
        if (!blog) return;
        if (currentDetailBlogId === blogId && D.blogDetailModal && !D.blogDetailModal.classList.contains('hidden')) return;

        currentDetailBlogId = blogId;
        D.detailTitle.textContent = blog.title;
        D.detailMeta.innerHTML = '📅 ' + escapeHtml(blog.date) + ' | ✍️ Omiaちゃん';

        var img = blog.image || blog.images || '';
        if (img) {
            D.detailImageWrapper.classList.remove('hidden');
            D.detailImageWrapper.innerHTML = '<img src="' + escapeAttr(img) + '" alt="' + escapeAttr(blog.title) + '" loading="lazy" onclick="openLightbox(\'' + escapeAttr(img) + '\')">';
        } else {
            D.detailImageWrapper.classList.add('hidden');
            D.detailImageWrapper.innerHTML = '';
        }

        var paras = blog.content.split('\n').filter(function(p) { return p.trim(); });
        D.detailContent.innerHTML = paras.map(function(p) { return '<p>' + escapeHtml(p.trim()) + '</p>'; }).join('');
        D.detailTags.innerHTML = blog.tags.map(function(t) { return '<span class="blog-tag">' + escapeHtml(t) + '</span>'; }).join('');

        openModal('blogDetailModal');
    }

    // ==================== 图片处理 ====================
    function clearImageFields() {
        pendingImageData = null;
        if (D.blogImage) D.blogImage.value = '';
        if (D.blogImageFile) D.blogImageFile.value = '';
        if (D.imagePreview) D.imagePreview.classList.add('hidden');
        if (D.imagePreviewImg) D.imagePreviewImg.src = '';
    }

    function getImageData() {
        return pendingImageData || (D.blogImage ? D.blogImage.value.trim() : '');
    }

    function populateImageFields(imageData) {
        clearImageFields();
        if (!imageData) return;
        if (imageData.startsWith('data:image/')) {
            pendingImageData = imageData;
            showImagePreview(imageData);
        } else {
            if (D.blogImage) D.blogImage.value = imageData;
            pendingImageData = imageData;
            showImagePreview(imageData);
        }
    }

    function showImagePreview(src) {
        if (!D.imagePreview || !D.imagePreviewImg) return;
        D.imagePreview.classList.remove('hidden');
        D.imagePreviewImg.src = src;
    }

    function handleImageFileSelect() {
        var file = D.blogImageFile.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); D.blogImageFile.value = ''; return; }
        if (file.size > 2 * 1024 * 1024)    { showToast('图片大小不能超过 2MB', 'error'); D.blogImageFile.value = ''; return; }

        var reader = new FileReader();
        reader.onload = function(e) {
            pendingImageData = e.target.result;
            showImagePreview(pendingImageData);
            if (D.blogImage) D.blogImage.value = '';
        };
        reader.onerror = function() { showToast('图片读取失败', 'error'); };
        reader.readAsDataURL(file);
    }

    function handleImageUrlInput() {
        var url = D.blogImage.value.trim();
        if (url) { pendingImageData = url; showImagePreview(url); if (D.blogImageFile) D.blogImageFile.value = ''; }
        else { pendingImageData = null; if (D.imagePreview) D.imagePreview.classList.add('hidden'); }
    }

    // 图片灯箱
    window.openLightbox = function(src) {
        var exist = document.querySelector('.lightbox-overlay');
        if (exist) exist.remove();
        var overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';
        overlay.innerHTML = '<img src="' + escapeAttr(src) + '" alt="放大查看">';
        overlay.addEventListener('click', function() { overlay.remove(); });
        document.body.appendChild(overlay);
    };

    // ==================== 字数统计 ====================
    function updateCharCount() {
        if (!D.charCount) return;
        var len = D.blogContent.value.length;
        var max = 5000;
        D.charCount.textContent = len + ' / ' + max;
        D.charCount.className = 'char-count';
        if (len > max * 0.9) D.charCount.classList.add('danger');
        else if (len > max * 0.7) D.charCount.classList.add('warning');
    }

    // ==================== 访客计数 ====================
    function updateVisitorCount() {
        var key = 'site_visitor_count_v2';
        var sessionKey = 'site_visit_session';
        var total = parseInt(localStorage.getItem(key), 10) || 0;

        if (!sessionStorage.getItem(sessionKey)) {
            total++;
            localStorage.setItem(key, total.toString());
            sessionStorage.setItem(sessionKey, '1');
        }

        if (D.visitorCount) D.visitorCount.textContent = total;
    }

    // ==================== 打字机效果 ====================
    var typeIdx = 0, typeDel = false, typeTimer = null;

    function startTyping() {
        clearTimeout(typeTimer);
        if (!D.typedText) return;

        if (!typeDel) {
            if (typeIdx < TYPEWRITER_TEXT.length) {
                D.typedText.textContent += TYPEWRITER_TEXT[typeIdx];
                typeIdx++;
                typeTimer = setTimeout(startTyping, TYPEWRITER_SPEED);
            } else {
                typeDel = true;
                typeTimer = setTimeout(startTyping, TYPEWRITER_PAUSE);
            }
        } else {
            if (typeIdx > 0) {
                D.typedText.textContent = TYPEWRITER_TEXT.slice(0, typeIdx - 1);
                typeIdx--;
                typeTimer = setTimeout(startTyping, TYPEWRITER_DELETE);
            } else {
                typeDel = false;
                typeTimer = setTimeout(startTyping, TYPEWRITER_RESTART);
            }
        }
    }

    // ==================== 背景图片 ====================
    function setRandomBackground() {
        if (!BACKGROUND_IMAGES.length || !D.bgLayer) return;
        var idx = Math.floor(Math.random() * BACKGROUND_IMAGES.length);
        var url = BACKGROUND_IMAGES[idx];
        var img = new Image();
        img.onload = function() {
            D.bgLayer.style.backgroundImage = "url('" + url + "')";
            D.bgLayer.style.opacity = 1;
        };
        img.onerror = function() {
            var rest = BACKGROUND_IMAGES.filter(function(b) { return b !== url; });
            if (rest.length) {
                D.bgLayer.style.backgroundImage = "url('" + rest[Math.floor(Math.random() * rest.length)] + "')";
            }
        };
        img.src = url;
    }

    function preloadBackgrounds() {
        BACKGROUND_IMAGES.forEach(function(url) { var img = new Image(); img.src = url; });
    }

    // ==================== 工具函数 ====================
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function debounce(fn, delay) {
        var timer;
        return function() {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
        };
    }

    function shakeElement(el) {
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'shake 0.5s ease';
        setTimeout(function() { el.style.animation = ''; }, 500);
    }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        // 侧边栏导航
        bindSidebarNav();

        // 登录/登出
        if (D.loginBtn) D.loginBtn.addEventListener('click', function() { openModal('loginModal'); });
        if (D.logoutBtn) D.logoutBtn.addEventListener('click', adminLogout);
        if (D.hiddenLogin) D.hiddenLogin.addEventListener('click', function() { openModal('loginModal'); });

        // 新建博客
        if (D.addBlogBtn) D.addBlogBtn.addEventListener('click', openAddBlog);

        // 搜索
        if (D.blogSearch) D.blogSearch.addEventListener('input', debounce(renderBlogs, 300));

        // 字数统计
        if (D.blogContent) D.blogContent.addEventListener('input', updateCharCount);

        // 图片
        if (D.blogImageFile) D.blogImageFile.addEventListener('change', handleImageFileSelect);
        if (D.blogImage) D.blogImage.addEventListener('input', debounce(handleImageUrlInput, 500));
        if (D.clearImageBtn) D.clearImageBtn.addEventListener('click', clearImageFields);

        // 博客卡片点击委托
        if (D.blogList) D.blogList.addEventListener('click', handleBlogCardClick);

        // 详情分享
        if (D.detailShareBtn) {
            D.detailShareBtn.addEventListener('click', function() {
                if (!currentDetailBlogId) return;
                var url = window.location.origin + window.location.pathname + '?blog=' + currentDetailBlogId;
                navigator.clipboard.writeText(url).then(function() {
                    showToast('链接已复制到剪贴板', 'success');
                }).catch(function() {
                    showToast('复制失败，请手动复制地址栏链接', 'error');
                });
            });
        }

        // 模态框遮罩
        $$('.modal').forEach(function(m) { m.addEventListener('click', handleModalBackdrop); });

        // 键盘快捷键
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (D.blogDetailModal && !D.blogDetailModal.classList.contains('hidden')) closeModal('blogDetailModal');
                else if (D.blogModal && !D.blogModal.classList.contains('hidden')) closeModal('blogModal');
                else if (D.loginModal && !D.loginModal.classList.contains('hidden')) closeModal('loginModal');
            }
            if (e.key === 'Enter' && D.loginModal && !D.loginModal.classList.contains('hidden')) {
                adminLogin();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && D.blogModal && !D.blogModal.classList.contains('hidden')) {
                e.preventDefault();
                saveBlog();
            }
        });
    }

    // ==================== 初始化 ====================
    async function init() {
        var apiPromise = tryConnectApi();

        loadBlogs();
        checkLoginStatus();
        renderBlogs();
        updateVisitorCount();
        bindEvents();

        await apiPromise;
        if (useApiBackend) {
            await syncFromApi();
            var savedToken = localStorage.getItem('apiAuthToken');
            if (savedToken) {
                apiAuthToken = savedToken;
                if (await ApiClient.checkAuth()) {
                    isAdminLoggedIn = true;
                    updateAdminUI();
                } else {
                    apiAuthToken = '';
                    localStorage.removeItem('apiAuthToken');
                }
            }
        }
    }

    // ==================== 启动 ====================
    window.addEventListener('DOMContentLoaded', async function() {
        document.body.classList.add('loaded');
        await init();
        startTyping();
        setRandomBackground();
        preloadBackgrounds();
    });

    // 暴露到全局
    window.editBlog     = window.editBlog;
    window.deleteBlog   = window.deleteBlog;
    window.saveBlog     = window.saveBlog;
    window.openAddBlog  = window.openAddBlog;
    window.adminLogin   = window.adminLogin;
    window.adminLogout  = window.adminLogout;
    window.openModal    = window.openModal;
    window.closeModal   = window.closeModal;

})();
