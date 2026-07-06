(function() {
    'use strict';

    // ============================================================
    // Flask API 后端集成 (渐进增强)
    // ============================================================

    const API_CONFIG = {
        baseUrl: 'http://127.0.0.1:5000/api',
        timeout: 5000,
        healthRetry: 3,
    };

    let useApiBackend = false;
    let apiAuthToken = '';
    let apiConnected = false;

    /**
     * API 请求封装
     */
    const ApiClient = {
        async request(method, path, body = null) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                };
                if (apiAuthToken) {
                    headers['Authorization'] = 'Bearer ' + apiAuthToken;
                }

                const options = {
                    method,
                    headers,
                    signal: controller.signal,
                };
                if (body && method !== 'GET') {
                    options.body = JSON.stringify(body);
                }

                const resp = await fetch(API_CONFIG.baseUrl + path, options);
                clearTimeout(timeoutId);
                const data = await resp.json();
                return { status: resp.status, ok: resp.ok, data };
            } catch (err) {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    return { status: 0, ok: false, data: { error: 'Timeout', message: '请求超时' } };
                }
                return { status: 0, ok: false, data: { error: 'NetworkError', message: '网络连接失败' } };
            }
        },

        async healthCheck() {
            const result = await this.request('GET', '/health');
            return result.ok && result.data.status === 'ok';
        },

        async login(username, password) {
            const result = await this.request('POST', '/auth/login', { username, password });
            if (result.ok && result.data.token) {
                apiAuthToken = result.data.token;
                apiConnected = true;
                return true;
            }
            return false;
        },

        async checkAuth() {
            if (!apiAuthToken) return false;
            const result = await this.request('GET', '/auth/status');
            return result.ok && result.data.authenticated;
        },

        async logout() {
            await this.request('POST', '/auth/logout');
            apiAuthToken = '';
        },

        async getBlogs(search = '') {
            let path = '/blogs';
            if (search) path += '?search=' + encodeURIComponent(search);
            const result = await this.request('GET', path);
            if (result.ok) return result.data.blogs || [];
            throw new Error(result.data.message || '获取博客列表失败');
        },

        async createBlog(blogData) {
            const result = await this.request('POST', '/blogs', blogData);
            if (result.ok) return result.data.blog;
            throw new Error(result.data.message || '创建博客失败');
        },

        async updateBlog(id, blogData) {
            const result = await this.request('PUT', '/blogs/' + id, blogData);
            if (result.ok) return result.data.blog;
            throw new Error(result.data.message || '更新博客失败');
        },

        async deleteBlog(id) {
            const result = await this.request('DELETE', '/blogs/' + id);
            if (result.ok) return true;
            throw new Error(result.data.message || '删除博客失败');
        },

        async getVisitors() {
            const result = await this.request('GET', '/stats/visitors');
            if (result.ok) return result.data;
            return null;
        },

        async incrementVisitors() {
            const result = await this.request('POST', '/stats/visitors');
            if (result.ok) return result.data;
            return null;
        },
    };

    /**
     * 尝试连接 Flask API
     */
    async function tryConnectApi() {
        for (let i = 0; i < API_CONFIG.healthRetry; i++) {
            try {
                const healthy = await ApiClient.healthCheck();
                if (healthy) {
                    useApiBackend = true;
                    apiConnected = true;
                    console.log('[API] Flask 服务器已连接，启用 API 后端模式');
                    updateConnectionStatus();
                    return true;
                }
            } catch (e) {
                // 重试
            }
            if (i < API_CONFIG.healthRetry - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
        console.log('[API] Flask 服务器未连接，使用 localStorage 离线模式');
        updateConnectionStatus();
        return false;
    }

    /**
     * 更新顶部栏连接状态指示灯 (RinUI 风格)
     */
    function updateConnectionStatus() {
        const dot = document.getElementById('apiStatusDot');
        const text = document.getElementById('apiStatusText');
        if (dot && text) {
            if (apiConnected) {
                dot.classList.add('connected');
                text.classList.add('connected');
                text.textContent = '已连接';
            } else {
                dot.classList.remove('connected');
                text.classList.remove('connected');
                text.textContent = '离线模式';
            }
        }
    }

    // ==================== 管理员配置 ====================
    const ADMIN_USERNAME = 'admin';
    const ADMIN_PASSWORD = '123456';

    // ==================== 初始博客数据 ====================
    const defaultBlogs = [
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

    // ==================== 全局状态 ====================
    let blogs = [];
    let isAdminLoggedIn = false;

    // ==================== DOM 引用 ====================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        // 博客
        blogList:       $('#blogList'),
        blogEmpty:      $('#blogEmpty'),
        blogSearch:     $('#blogSearch'),
        addBlogBtn:     $('#addBlogBtn'),
        sidebarNewBlog: $('#sidebarNewBlog'),
        // 管理员
        adminBadge:     $('#adminBadge'),
        logoutBtn:      $('#logoutBtn'),
        loginBtn:       $('#loginBtn'),
        hiddenLogin:    $('#hiddenLogin'),
        statusUser:     $('#statusUser'),
        // 连接状态
        apiStatusDot:   $('#apiStatusDot'),
        apiStatusText:  $('#apiStatusText'),
        // 模态框
        blogModal:      $('#blogModal'),
        blogModalTitle: $('#blogModalTitle'),
        blogId:         $('#blogId'),
        blogTitle:      $('#blogTitle'),
        blogDate:       $('#blogDate'),
        blogContent:    $('#blogContent'),
        blogTags:       $('#blogTags'),
        charCount:      $('#charCount'),
        loginModal:     $('#loginModal'),
        loginError:     $('#loginError'),
        username:       $('#username'),
        password:       $('#password'),
        // 背景 & 打字
        bgLayer:        $('#bgLayer'),
        typedText:      $('#typed-text'),
        toastContainer: $('#toastContainer'),
        // 访客
        visitorCount:   $('#visitorCount'),
        // 图片
        blogImage:      $('#blogImage'),
        blogImageFile:  $('#blogImageFile'),
        imagePreview:   $('#imagePreview'),
        imagePreviewImg:$('#imagePreviewImg'),
        clearImageBtn:  $('#clearImageBtn'),
        // 详情
        blogDetailModal:   $('#blogDetailModal'),
        detailTitle:       $('#detailTitle'),
        detailMeta:        $('#detailMeta'),
        detailImageWrapper:$('#detailImageWrapper'),
        detailContent:     $('#detailContent'),
        detailTags:        $('#detailTags'),
        detailShareBtn:    $('#detailShareBtn'),
    };

    let pendingImageData = null;
    let currentDetailBlogId = null;

    // ==================== 访客计数器 ====================
    async function updateVisitorCount() {
        const storageKey = 'site_visitor_count_v2';
        const sessionKey = 'site_visit_session';

        let totalVisits = parseInt(localStorage.getItem(storageKey), 10) || 0;

        if (!sessionStorage.getItem(sessionKey)) {
            totalVisits++;
            localStorage.setItem(storageKey, totalVisits.toString());
            sessionStorage.setItem(sessionKey, '1');

            if (useApiBackend) {
                try {
                    const stats = await ApiClient.incrementVisitors();
                    if (stats) {
                        totalVisits = stats.total_visits;
                        localStorage.setItem(storageKey, totalVisits.toString());
                    }
                } catch (e) {
                    // 静默处理
                }
            }
        } else if (useApiBackend) {
            try {
                const stats = await ApiClient.getVisitors();
                if (stats) {
                    totalVisits = stats.total_visits;
                    localStorage.setItem(storageKey, totalVisits.toString());
                }
            } catch (e) {
                // 使用本地缓存
            }
        }

        if (dom.visitorCount) {
            dom.visitorCount.textContent = totalVisits;
        }
    }

    // ==================== 初始化 ====================
    async function init() {
        const apiPromise = tryConnectApi();

        loadBlogs();
        checkLoginStatus();
        renderBlogs();
        updateVisitorCount();
        bindEvents();

        await apiPromise;
        if (useApiBackend) {
            await syncFromApi();
            const savedToken = localStorage.getItem('apiAuthToken');
            if (savedToken) {
                apiAuthToken = savedToken;
                const authed = await ApiClient.checkAuth();
                if (authed) {
                    isAdminLoggedIn = true;
                    updateAdminUI();
                } else {
                    apiAuthToken = '';
                    localStorage.removeItem('apiAuthToken');
                }
            }
        }
    }

    // ==================== 数据存储 ====================
    function loadBlogs() {
        try {
            const stored = localStorage.getItem('blogs');
            blogs = stored ? JSON.parse(stored) : [...defaultBlogs];
            if (!stored) saveBlogsLocal();
        } catch (e) {
            console.warn('本地存储读取失败，使用默认数据');
            blogs = [...defaultBlogs];
        }
    }

    function saveBlogsLocal() {
        try {
            localStorage.setItem('blogs', JSON.stringify(blogs));
        } catch (e) {
            showToast('本地存储已满，请清理旧数据', 'error');
        }
    }

    function saveBlogs() {
        saveBlogsLocal();
    }

    async function syncFromApi() {
        if (!useApiBackend) return;
        try {
            const apiBlogs = await ApiClient.getBlogs();
            if (apiBlogs.length > 0) {
                blogs = apiBlogs;
                saveBlogsLocal();
                renderBlogs();
                console.log('[API] 已从服务器同步 ' + apiBlogs.length + ' 篇博客');
            }
        } catch (e) {
            console.warn('[API] 同步博客失败:', e.message);
        }
    }

    // ==================== Toast 通知 ====================
    function showToast(message, type) {
        type = type || 'info';
        const item = document.createElement('div');
        item.className = 'toast-item toast-' + type;
        // RinUI 图标
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        item.textContent = (icons[type] || '') + ' ' + message;
        dom.toastContainer.appendChild(item);
        setTimeout(function() {
            item.style.animation = 'toastSlideOut 0.35s ease forwards';
            setTimeout(function() { item.remove(); }, 350);
        }, 3000);
    }

    // ==================== 登录验证 ====================
    function checkLoginStatus() {
        isAdminLoggedIn = localStorage.getItem('isAdminLoggedIn') === 'true';
        if (!isAdminLoggedIn) {
            const savedToken = localStorage.getItem('apiAuthToken');
            if (savedToken) {
                apiAuthToken = savedToken;
            }
        }
        updateAdminUI();
    }

    function updateAdminUI() {
        // 顶部栏
        if (dom.adminBadge) dom.adminBadge.classList.toggle('hidden', !isAdminLoggedIn);
        if (dom.logoutBtn) dom.logoutBtn.classList.toggle('hidden', !isAdminLoggedIn);
        if (dom.loginBtn) dom.loginBtn.classList.toggle('hidden', isAdminLoggedIn);
        // 侧边栏
        if (dom.sidebarNewBlog) dom.sidebarNewBlog.classList.toggle('hidden', !isAdminLoggedIn);
        // 内容区
        if (dom.addBlogBtn) dom.addBlogBtn.classList.toggle('hidden', !isAdminLoggedIn);
        if (dom.hiddenLogin) dom.hiddenLogin.classList.toggle('hidden', isAdminLoggedIn);
        // 状态栏
        if (dom.statusUser) {
            if (isAdminLoggedIn) {
                dom.statusUser.textContent = '👤 管理员';
                dom.statusUser.classList.add('logged-in');
            } else {
                dom.statusUser.textContent = '🔒 未登录';
                dom.statusUser.classList.remove('logged-in');
            }
        }
        renderBlogs();
    }

    window.adminLogin = async function() {
        const username = dom.username.value.trim();
        const password = dom.password.value;

        const localValid = (username === ADMIN_USERNAME && password === ADMIN_PASSWORD);

        let apiSuccess = false;
        if (useApiBackend) {
            apiSuccess = await ApiClient.login(username, password);
            if (apiSuccess) {
                localStorage.setItem('apiAuthToken', apiAuthToken);
                await syncFromApi();
            }
        }

        if (localValid || apiSuccess) {
            isAdminLoggedIn = true;
            localStorage.setItem('isAdminLoggedIn', 'true');
            updateAdminUI();
            closeModal('loginModal');
            dom.username.value = '';
            dom.password.value = '';
            dom.loginError.textContent = '';
            var mode = apiSuccess ? '（API 模式）' : '（离线模式）';
            showToast('登录成功，欢迎回来！' + mode, 'success');
        } else {
            dom.loginError.textContent = '❌ 管理员账号或密码错误';
            shakeElement(dom.loginModal.querySelector('.modal-content'));
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
        var firstInput = modal.querySelector('input:not([type="hidden"])');
        if (firstInput) setTimeout(function() { firstInput.focus(); }, 150);
    };

    window.closeModal = function(modalId) {
        var modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (modalId === 'blogModal') clearBlogForm();
        if (modalId === 'loginModal') dom.loginError.textContent = '';
        if (modalId === 'blogDetailModal') {
            dom.detailTitle.textContent = '';
            dom.detailContent.innerHTML = '';
            dom.detailTags.innerHTML = '';
            dom.detailImageWrapper.innerHTML = '';
            dom.detailImageWrapper.classList.add('hidden');
            currentDetailBlogId = null;
        }
    };

    function clearBlogForm() {
        dom.blogId.value = '';
        dom.blogTitle.value = '';
        dom.blogDate.value = '';
        dom.blogContent.value = '';
        dom.blogTags.value = '';
        dom.charCount.textContent = '0 / 5000';
        dom.charCount.className = 'char-count';
        clearImageFields();
    }

    // ==================== 侧边栏导航 (RinUI) ====================
    function bindSidebarNav() {
        var navBtns = $$('.sidebar-nav-btn');
        var panels = $$('.content-panel');

        navBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (this.classList.contains('disabled')) return;

                // "新建博客" 按钮直接触发新建
                if (this.dataset.action === 'new-blog') {
                    openAddBlog();
                    return;
                }

                // 切换激活状态
                navBtns.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');

                // 切换内容面板
                var targetId = this.dataset.target;
                panels.forEach(function(p) {
                    p.classList.remove('active');
                    p.style.animation = 'none';
                });

                var target = document.getElementById(targetId);
                if (target) {
                    target.classList.add('active');
                    void target.offsetWidth;
                    target.style.animation = 'panelFadeIn 0.4s ease forwards';
                }
            });
        });
    }

    // ==================== 图片处理 ====================
    function clearImageFields() {
        pendingImageData = null;
        if (dom.blogImage) dom.blogImage.value = '';
        if (dom.blogImageFile) dom.blogImageFile.value = '';
        if (dom.imagePreview) dom.imagePreview.style.display = 'none';
        if (dom.imagePreviewImg) dom.imagePreviewImg.src = '';
    }

    function handleImageFileSelect() {
        var file = dom.blogImageFile.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('请选择图片文件', 'error');
            dom.blogImageFile.value = '';
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showToast('图片大小不能超过 2MB', 'error');
            dom.blogImageFile.value = '';
            return;
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            pendingImageData = e.target.result;
            showImagePreview(pendingImageData);
            if (dom.blogImage) dom.blogImage.value = '';
        };
        reader.onerror = function() {
            showToast('图片读取失败，请重试', 'error');
        };
        reader.readAsDataURL(file);
    }

    function handleImageUrlInput() {
        var url = dom.blogImage.value.trim();
        if (url) {
            pendingImageData = url;
            showImagePreview(url);
            if (dom.blogImageFile) dom.blogImageFile.value = '';
        } else {
            pendingImageData = null;
            if (dom.imagePreview) dom.imagePreview.style.display = 'none';
        }
    }

    function showImagePreview(src) {
        if (!dom.imagePreview || !dom.imagePreviewImg) return;
        dom.imagePreview.style.display = 'block';
        dom.imagePreviewImg.src = src;
    }

    function getBlogImageData() {
        return pendingImageData || (dom.blogImage ? dom.blogImage.value.trim() : '');
    }

    function populateImageFields(imageData) {
        clearImageFields();
        if (!imageData) return;

        if (imageData.startsWith('data:image/')) {
            pendingImageData = imageData;
            showImagePreview(imageData);
        } else {
            if (dom.blogImage) dom.blogImage.value = imageData;
            pendingImageData = imageData;
            showImagePreview(imageData);
        }
    }

    // 点击遮罩层关闭模态框
    function handleModalBackdropClick(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    }

    // ESC 键关闭模态框
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (dom.blogDetailModal && !dom.blogDetailModal.classList.contains('hidden')) closeModal('blogDetailModal');
            if (dom.blogModal && !dom.blogModal.classList.contains('hidden')) closeModal('blogModal');
            if (dom.loginModal && !dom.loginModal.classList.contains('hidden')) closeModal('loginModal');
        }
    });

    // ==================== 抖动动画 ====================
    function shakeElement(el) {
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'shake 0.5s ease';
        setTimeout(function() { el.style.animation = ''; }, 500);
    }

    // ==================== 博客 CRUD ====================
    function renderBlogs() {
        var searchTerm = dom.blogSearch ? dom.blogSearch.value.trim().toLowerCase() : '';
        var filteredBlogs = blogs;
        if (searchTerm) {
            filteredBlogs = blogs.filter(function(b) {
                return b.title.toLowerCase().includes(searchTerm) ||
                    b.content.toLowerCase().includes(searchTerm) ||
                    b.tags.some(function(t) { return t.toLowerCase().includes(searchTerm); });
            });
        }

        dom.blogList.innerHTML = '';
        if (filteredBlogs.length === 0) {
            dom.blogList.style.display = 'none';
            dom.blogEmpty.classList.remove('hidden');
            var p = dom.blogEmpty.querySelector('.empty-subtitle');
            if (p) p.textContent = searchTerm ? '未找到匹配的博客' : '登录后点击「新建博客」开始创作吧！';
            return;
        }
        dom.blogList.style.display = '';
        dom.blogEmpty.classList.add('hidden');

        filteredBlogs.forEach(function(blog) {
            var card = document.createElement('article');
            card.className = 'blog-card';
            card.dataset.blogId = blog.id;
            card.style.animation = 'cardSlideIn 0.4s ease forwards';

            var tagsHtml = blog.tags
                .map(function(tag) { return '<span class="blog-tag">' + escapeHtml(tag) + '</span>'; })
                .join('');

            var editButtons = isAdminLoggedIn
                ? '<div class="blog-actions">' +
                        '<button class="rinui-btn primary" onclick="event.stopPropagation(); editBlog(' + blog.id + ')">✏️ 编辑</button>' +
                        '<button class="rinui-btn danger" onclick="event.stopPropagation(); deleteBlog(' + blog.id + ')">🗑️ 删除</button>' +
                    '</div>'
                : '';

            var blogImage = blog.image || blog.images || '';
            var imageHtml = blogImage
                ? '<div class="blog-image-wrapper">' +
                       '<img src="' + escapeAttr(blogImage) + '" alt="' + escapeAttr(blog.title) + '" class="blog-image" loading="lazy" onclick="event.stopPropagation(); window.openLightbox(\'' + escapeAttr(blogImage) + '\')" onerror="this.parentElement.style.display=\'none\'">' +
                   '</div>'
                : '';

            card.innerHTML =
                '<div class="blog-date">' + escapeHtml(blog.date) + '</div>' +
                '<h3 class="blog-card-title">' + escapeHtml(blog.title) + '</h3>' +
                imageHtml +
                '<p>' + escapeHtml(blog.content) + '</p>' +
                '<div class="blog-tags-row">' + tagsHtml + '</div>' +
                '<span class="read-more">阅读全文 →</span>' +
                editButtons;

            dom.blogList.appendChild(card);
        });
    }

    // 博客卡片事件委托
    function handleBlogCardClick(e) {
        var card = e.target.closest('.blog-card');
        if (!card) return;

        // 忽略按钮和图片点击
        if (e.target.closest('.rinui-btn') || e.target.closest('.blog-image') || e.target.closest('.delete-btn') || e.target.closest('.edit-btn')) return;

        var blogId = parseInt(card.dataset.blogId, 10);
        if (blogId) openBlogDetail(blogId);
    }

    // ==================== 博客详情查看 ====================
    window.openBlogDetail = function(blogId) {
        var blog = blogs.find(function(b) { return b.id === blogId; });
        if (!blog) return;

        if (currentDetailBlogId === blogId && dom.blogDetailModal && !dom.blogDetailModal.classList.contains('hidden')) return;

        currentDetailBlogId = blogId;

        dom.detailTitle.textContent = blog.title;
        dom.detailMeta.innerHTML = '📅 ' + escapeHtml(blog.date) + ' | ✍️ Omiaちゃん';

        var img = blog.image || blog.images || '';
        if (img) {
            dom.detailImageWrapper.classList.remove('hidden');
            dom.detailImageWrapper.innerHTML = '<img src="' + escapeAttr(img) + '" alt="' + escapeAttr(blog.title) + '" loading="lazy" onclick="window.openLightbox(\'' + escapeAttr(img) + '\')">';
        } else {
            dom.detailImageWrapper.classList.add('hidden');
            dom.detailImageWrapper.innerHTML = '';
        }

        var paragraphs = blog.content.split('\n').filter(function(p) { return p.trim(); });
        dom.detailContent.innerHTML = paragraphs.map(function(p) { return '<p>' + escapeHtml(p.trim()) + '</p>'; }).join('');

        dom.detailTags.innerHTML = blog.tags.map(function(t) { return '<span class="blog-tag">' + escapeHtml(t) + '</span>'; }).join('');

        openModal('blogDetailModal');
    };

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ==================== 图片灯箱 ====================
    window.openLightbox = function(src) {
        var existing = document.querySelector('.lightbox-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';
        overlay.innerHTML = '<img src="' + escapeAttr(src) + '" alt="放大查看">';
        overlay.addEventListener('click', function() { overlay.remove(); });
        document.body.appendChild(overlay);
    };

    window.openAddBlog = function() {
        dom.blogModalTitle.textContent = '✏️ 发布新博客';
        dom.blogId.value = '';
        dom.blogTitle.value = '';
        dom.blogDate.value = new Date().toISOString().split('T')[0];
        dom.blogContent.value = '';
        dom.blogTags.value = '';
        dom.charCount.textContent = '0 / 5000';
        dom.charCount.className = 'char-count';
        clearImageFields();
        openModal('blogModal');
    };

    window.editBlog = function(id) {
        var blog = blogs.find(function(b) { return b.id === id; });
        if (!blog) return;
        dom.blogModalTitle.textContent = '✏️ 编辑博客';
        dom.blogId.value = blog.id;
        dom.blogTitle.value = blog.title;
        dom.blogDate.value = blog.date;
        dom.blogContent.value = blog.content;
        dom.blogTags.value = blog.tags.join(', ');
        populateImageFields(blog.image || '');
        updateCharCount();
        openModal('blogModal');
    };

    window.saveBlog = async function() {
        var id      = dom.blogId.value;
        var title   = dom.blogTitle.value.trim();
        var date    = dom.blogDate.value;
        var content = dom.blogContent.value.trim();
        var tags    = dom.blogTags.value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(Boolean);
        var image   = getBlogImageData();

        if (!title)   { showToast('请填写博客标题', 'error'); dom.blogTitle.focus(); return; }
        if (!date)    { showToast('请选择日期', 'error'); return; }
        if (!content) { showToast('请填写博客内容', 'error'); dom.blogContent.focus(); return; }

        var blogPayload = { title: title, date: date, content: content, tags: tags, image: image };

        if (useApiBackend && apiAuthToken) {
            try {
                if (id) {
                    await ApiClient.updateBlog(parseInt(id), blogPayload);
                    showToast('博客已更新（API 模式）', 'success');
                } else {
                    await ApiClient.createBlog(blogPayload);
                    showToast('博客发布成功（API 模式）', 'success');
                }
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
            var index = blogs.findIndex(function(b) { return b.id === parseInt(id); });
            if (index !== -1) {
                blogs[index] = Object.assign({}, blogs[index], { title: title, date: date, content: content, tags: tags, image: image });
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

    // ==================== 字数统计 ====================
    function updateCharCount() {
        var len = dom.blogContent.value.length;
        var max = 5000;
        dom.charCount.textContent = len + ' / ' + max;
        dom.charCount.className = 'char-count';
        if (len > max * 0.9) dom.charCount.classList.add('danger');
        else if (len > max * 0.7) dom.charCount.classList.add('warning');
    }

    // ==================== 搜索过滤 ====================
    function onBlogSearch() {
        renderBlogs();
    }

    // ==================== 打字机效果 ====================
    var typewriterText = "Hello My name is Omiaちゃん";
    var typingSpeed  = 100;
    var pauseDelay   = 3000;
    var deleteSpeed  = 90;
    var restartDelay = 1500;

    var typeIndex  = 0;
    var isDeleting = false;
    var typeTimer  = null;

    function startTyping() {
        clearTimeout(typeTimer);
        if (!dom.typedText) return;

        if (!isDeleting) {
            if (typeIndex < typewriterText.length) {
                dom.typedText.textContent += typewriterText[typeIndex];
                typeIndex++;
                typeTimer = setTimeout(startTyping, typingSpeed);
            } else {
                isDeleting = true;
                typeTimer = setTimeout(startTyping, pauseDelay);
            }
        } else {
            if (typeIndex > 0) {
                dom.typedText.textContent = typewriterText.slice(0, typeIndex - 1);
                typeIndex--;
                typeTimer = setTimeout(startTyping, deleteSpeed);
            } else {
                isDeleting = false;
                typeTimer = setTimeout(startTyping, restartDelay);
            }
        }
    }

    // ==================== 随机背景图片 ====================
    var backgroundImages = [
        'images/columbina-5k-3840x2160-25922.jpg',
        'images/oshi-no-ko-3840x2160-25261.jpg',
        'images/sparxie-honkai-star-3840x2160-26290.jpg',
        'images/zhuang-fangyi-3840x2160-26226.jpg'
    ];

    function setRandomBackground() {
        if (backgroundImages.length === 0 || !dom.bgLayer) return;
        var idx = Math.floor(Math.random() * backgroundImages.length);
        var url = backgroundImages[idx];
        var img = new Image();
        img.onload = function() {
            dom.bgLayer.style.backgroundImage = "url('" + url + "')";
            dom.bgLayer.style.opacity = 1;
        };
        img.onerror = function() {
            console.warn('背景图片加载失败:', url);
            var next = backgroundImages.filter(function(b) { return b !== url; });
            if (next.length > 0) {
                var fallback = next[Math.floor(Math.random() * next.length)];
                dom.bgLayer.style.backgroundImage = "url('" + fallback + "')";
            }
        };
        img.src = url;
    }

    function preloadBackgrounds() {
        backgroundImages.forEach(function(url) {
            var img = new Image();
            img.src = url;
        });
    }

    // ==================== 全局事件绑定 ====================
    function bindEvents() {
        // 侧边栏导航
        bindSidebarNav();

        // 登录/登出按钮 (顶部栏)
        if (dom.loginBtn) dom.loginBtn.addEventListener('click', function() { openModal('loginModal'); });
        if (dom.logoutBtn) dom.logoutBtn.addEventListener('click', adminLogout);
        // 状态栏隐藏登录入口
        if (dom.hiddenLogin) dom.hiddenLogin.addEventListener('click', function() { openModal('loginModal'); });

        // 新增博客
        if (dom.addBlogBtn) dom.addBlogBtn.addEventListener('click', openAddBlog);
        if (dom.sidebarNewBlog) dom.sidebarNewBlog.addEventListener('click', openAddBlog);

        // 博客搜索
        if (dom.blogSearch) dom.blogSearch.addEventListener('input', debounce(onBlogSearch, 300));

        // 字数统计
        if (dom.blogContent) dom.blogContent.addEventListener('input', updateCharCount);

        // 登录表单回车提交
        if (dom.loginModal) {
            dom.loginModal.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') adminLogin();
            });
        }

        // 博客表单 Ctrl+Enter 提交
        if (dom.blogModal) {
            dom.blogModal.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveBlog();
            });
        }

        // 图片上传
        if (dom.blogImageFile) dom.blogImageFile.addEventListener('change', handleImageFileSelect);
        if (dom.blogImage) dom.blogImage.addEventListener('input', debounce(handleImageUrlInput, 500));
        if (dom.clearImageBtn) dom.clearImageBtn.addEventListener('click', clearImageFields);

        // 博客卡片点击 → 详情查看 (事件委托)
        if (dom.blogList) dom.blogList.addEventListener('click', handleBlogCardClick);

        // 详情分享按钮
        if (dom.detailShareBtn) {
            dom.detailShareBtn.addEventListener('click', function() {
                if (!currentDetailBlogId) return;
                var url = window.location.origin + window.location.pathname + '?blog=' + currentDetailBlogId;
                navigator.clipboard.writeText(url).then(function() {
                    showToast('链接已复制到剪贴板', 'success');
                }).catch(function() {
                    showToast('复制失败，请手动复制地址栏链接', 'error');
                });
            });
        }

        // 模态框遮罩层点击
        var modals = document.querySelectorAll('.modal');
        modals.forEach(function(m) {
            m.addEventListener('click', handleModalBackdropClick);
        });
    }

    // ==================== 工具函数 ====================
    function debounce(fn, delay) {
        var timer;
        return function() {
            var args = arguments;
            var ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
        };
    }

    // ==================== 页面启动 ====================
    window.addEventListener('DOMContentLoaded', async function() {
        document.body.classList.add('loaded');

        await init();
        startTyping();
        setRandomBackground();
        preloadBackgrounds();
    });

    // ==================== 暴露到全局作用域 ====================
    window.editBlog     = window.editBlog;
    window.deleteBlog   = window.deleteBlog;
    window.saveBlog     = window.saveBlog;
    window.openAddBlog  = window.openAddBlog;
    window.adminLogin   = window.adminLogin;
    window.adminLogout  = window.adminLogout;
    window.openModal    = window.openModal;
    window.closeModal   = window.closeModal;
})();
