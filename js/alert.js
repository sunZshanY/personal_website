(function() {
    'use strict';

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
            tags: ['C++', 'GCC','GNU/Linux']
        },
    ];

    // ==================== 全局状态 ====================
    let blogs = [];
    let isAdminLoggedIn = false;

    // ==================== DOM 缓存 ====================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        blogList:       $('#blogList'),
        blogEmpty:      $('#blogEmpty'),
        blogSearch:     $('#blogSearch'),
        adminPanel:     $('#adminPanel'),
        addBlogBtn:     $('#addBlogBtn'),
        hiddenLogin:    $('#hiddenLogin'),
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
        bgLayer:        $('#bgLayer'),
        typedText:      $('#typed-text'),
        toastContainer: $('#toastContainer'),
        visitorCount:   $('#visitorCount'),
        blogImage:      $('#blogImage'),
        blogImageFile:  $('#blogImageFile'),
        imagePreview:   $('#imagePreview'),
        imagePreviewImg:$('#imagePreviewImg'),
        clearImageBtn:  $('#clearImageBtn'),
        // 博客详情查看
        blogDetailModal:   $('#blogDetailModal'),
        detailTitle:       $('#detailTitle'),
        detailMeta:        $('#detailMeta'),
        detailImageWrapper:$('#detailImageWrapper'),
        detailContent:     $('#detailContent'),
        detailTags:        $('#detailTags'),
        detailShareBtn:    $('#detailShareBtn'),
    };

    // 暂存的 base64 图片数据（文件选择后暂存于此，保存时写入博客数据）
    let pendingImageData = null;

    // 当前查看的博客详情 ID（用于分享链接）
    let currentDetailBlogId = null;

    // ==================== 访客计数器 ====================
    function updateVisitorCount() {
        const storageKey = 'site_visitor_count_v2';
        const sessionKey = 'site_visit_session';

        // 获取当前总访问量
        let totalVisits = parseInt(localStorage.getItem(storageKey), 10) || 0;

        // 检查是否是新会话（同一浏览器标签页会话内只计一次）
        if (!sessionStorage.getItem(sessionKey)) {
            totalVisits++;
            localStorage.setItem(storageKey, totalVisits.toString());
            sessionStorage.setItem(sessionKey, '1');
        }

        // 渲染到页面
        if (dom.visitorCount) {
            dom.visitorCount.textContent = totalVisits;
        }
    }

    // ==================== 初始化 ====================
    function init() {
        loadBlogs();
        checkLoginStatus();
        renderBlogs();
        updateVisitorCount();
        bindEvents();
    }

    // ==================== 数据存储 ====================
    function loadBlogs() {
        try {
            const stored = localStorage.getItem('blogs');
            blogs = stored ? JSON.parse(stored) : [...defaultBlogs];
            if (!stored) saveBlogs();
        } catch (e) {
            console.warn('本地存储读取失败，使用默认数据');
            blogs = [...defaultBlogs];
        }
    }

    function saveBlogs() {
        try {
            localStorage.setItem('blogs', JSON.stringify(blogs));
        } catch (e) {
            showToast('本地存储已满，请清理旧数据', 'error');
        }
    }

    // ==================== Toast 通知系统 ====================
    function showToast(message, type = 'info') {
        const item = document.createElement('div');
        item.className = `toast-item toast-${type}`;
        item.textContent = message;
        dom.toastContainer.appendChild(item);
        setTimeout(() => {
            item.style.animation = 'toastOut 0.4s ease forwards';
            setTimeout(() => item.remove(), 400);
        }, 3000);
    }

    // ==================== 登录验证 ====================
    function checkLoginStatus() {
        isAdminLoggedIn = localStorage.getItem('isAdminLoggedIn') === 'true';
        updateAdminUI();
    }

    function updateAdminUI() {
        const show = (el, v) => {
            if (el) el.classList.toggle('hidden', !v);
        };
        show(dom.adminPanel,  isAdminLoggedIn);
        show(dom.addBlogBtn,  isAdminLoggedIn);
        show(dom.hiddenLogin, !isAdminLoggedIn);
        renderBlogs();
    }

    window.adminLogin = function() {
        const username = dom.username.value.trim();
        const password = dom.password.value;
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            isAdminLoggedIn = true;
            localStorage.setItem('isAdminLoggedIn', 'true');
            updateAdminUI();
            closeModal('loginModal');
            dom.username.value = '';
            dom.password.value = '';
            dom.loginError.textContent = '';
            showToast('✅ 登录成功，欢迎回来！', 'success');
        } else {
            dom.loginError.textContent = '❌ 管理员账号或密码错误';
            shakeElement(dom.loginModal.querySelector('.modal-content'));
        }
    };

    window.adminLogout = function() {
        isAdminLoggedIn = false;
        localStorage.removeItem('isAdminLoggedIn');
        updateAdminUI();
        showToast('👋 已退出登录', 'info');
    };

    // ==================== 模态框操作 ====================
    window.openModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // 聚焦第一个输入框
        const firstInput = modal.querySelector('input:not([type="hidden"])');
        if (firstInput) setTimeout(() => firstInput.focus(), 150);
    };

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        // 清除博客表单数据
        if (modalId === 'blogModal') clearBlogForm();
        if (modalId === 'loginModal') dom.loginError.textContent = '';
        // 清除详情内容以释放内存
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

    // ==================== 图片上传处理 ====================
    function clearImageFields() {
        pendingImageData = null;
        if (dom.blogImage) dom.blogImage.value = '';
        if (dom.blogImageFile) dom.blogImageFile.value = '';
        if (dom.imagePreview) dom.imagePreview.style.display = 'none';
        if (dom.imagePreviewImg) dom.imagePreviewImg.src = '';
    }

    function handleImageFileSelect() {
        const file = dom.blogImageFile.files[0];
        if (!file) return;

        // 检查文件类型
        if (!file.type.startsWith('image/')) {
            showToast('请选择图片文件', 'error');
            dom.blogImageFile.value = '';
            return;
        }

        // 限制图片大小 2MB
        if (file.size > 2 * 1024 * 1024) {
            showToast('图片大小不能超过 2MB', 'error');
            dom.blogImageFile.value = '';
            return;
        }

        // 转为 base64
        const reader = new FileReader();
        reader.onload = function(e) {
            pendingImageData = e.target.result;
            showImagePreview(pendingImageData);
            // 选择本地图片后清空 URL 输入
            if (dom.blogImage) dom.blogImage.value = '';
        };
        reader.onerror = function() {
            showToast('图片读取失败，请重试', 'error');
        };
        reader.readAsDataURL(file);
    }

    function handleImageUrlInput() {
        const url = dom.blogImage.value.trim();
        if (url) {
            pendingImageData = url;
            showImagePreview(url);
            // 输入 URL 后清空文件选择
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
        // 优先返回本地文件转的 base64，其次返回 URL
        return pendingImageData || (dom.blogImage ? dom.blogImage.value.trim() : '');
    }

    function populateImageFields(imageData) {
        clearImageFields();
        if (!imageData) return;

        if (imageData.startsWith('data:image/')) {
            // base64 数据，无法回填文件 input，仅显示预览
            pendingImageData = imageData;
            showImagePreview(imageData);
        } else {
            // URL 字符串
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
    
    const loginModal = document.getElementById('loginModal');
    const blogModal = document.getElementById('blogModal');
    const blogDetailModal = document.getElementById('blogDetailModal');
    if (loginModal) loginModal.addEventListener('click', handleModalBackdropClick);
    if (blogModal) blogModal.addEventListener('click', handleModalBackdropClick);
    if (blogDetailModal) blogDetailModal.addEventListener('click', handleModalBackdropClick);

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
        void el.offsetWidth; // 触发回流
        el.style.animation = 'shake 0.5s ease';
        setTimeout(() => el.style.animation = '', 500);
    }

    // ==================== 博客 CRUD ====================
    function renderBlogs() {
        const searchTerm = dom.blogSearch ? dom.blogSearch.value.trim().toLowerCase() : '';
        let filteredBlogs = blogs;
        if (searchTerm) {
            filteredBlogs = blogs.filter(b =>
                b.title.toLowerCase().includes(searchTerm) ||
                b.content.toLowerCase().includes(searchTerm) ||
                b.tags.some(t => t.toLowerCase().includes(searchTerm))
            );
        }

        dom.blogList.innerHTML = '';
        if (filteredBlogs.length === 0) {
            dom.blogList.style.display = 'none';
            dom.blogEmpty.classList.remove('hidden');
            const p = dom.blogEmpty.querySelector('.empty-subtitle');
            if (p) p.textContent = searchTerm ? '未找到匹配的博客' : '暂无博客文章......';
            return;
        }
        dom.blogList.style.display = '';
        dom.blogEmpty.classList.add('hidden');

        filteredBlogs.forEach(blog => {
            const card = document.createElement('article');
            card.className = 'blog-card';
            card.dataset.blogId = blog.id;
            card.style.animation = 'fadeInUp 0.5s ease forwards';

            const tagsHtml = blog.tags
                .map(tag => `<span class="blog-tag">${escapeHtml(tag)}</span>`)
                .join('');

            const editButtons = isAdminLoggedIn
                ? `<div class="blog-actions">
                        <button class="edit-btn" onclick="editBlog(${blog.id})">✏️ 编辑</button>
                        <button class="delete-btn" onclick="deleteBlog(${blog.id})">🗑️ 删除</button>
                    </div>`
                : '';

            const blogImage = blog.image || blog.images || '';
            const imageHtml = blogImage
                ? `<div class="blog-image-wrapper">
                       <img src="${escapeAttr(blogImage)}" alt="${escapeAttr(blog.title)}" class="blog-image" loading="lazy" onclick="window.openLightbox && window.openLightbox('${escapeAttr(blogImage)}')" onerror="this.parentElement.style.display='none'">
                   </div>`
                : '';

            card.innerHTML = `
                <div class="blog-date">${escapeHtml(blog.date)}</div>
                <h3 class="blog-card-title">${escapeHtml(blog.title)}</h3>
                ${imageHtml}
                <p>${escapeHtml(blog.content)}</p>
                <div class="blog-tags-row">${tagsHtml}</div>
                <span class="read-more">阅读全文 →</span>
                ${editButtons}
            `;
            dom.blogList.appendChild(card);
        });
    }

    // ==================== 博客卡片事件委托（内存优化：单一监听器） ====================
    function handleBlogCardClick(e) {
        const card = e.target.closest('.blog-card');
        if (!card) return;

        // 忽略编辑/删除按钮的点击（它们有自己的 onclick 处理）
        if (e.target.closest('.edit-btn') || e.target.closest('.delete-btn')) return;

        // 忽略图片灯箱点击（图片有自己的 lightbox 处理）
        if (e.target.closest('.blog-image')) return;

        const blogId = parseInt(card.dataset.blogId, 10);
        if (blogId) openBlogDetail(blogId);
    }

    // ==================== 博客详情查看 ====================
    window.openBlogDetail = function(blogId) {
        const blog = blogs.find(b => b.id === blogId);
        if (!blog) return;

        // 避免重复渲染同一博客
        if (currentDetailBlogId === blogId && dom.blogDetailModal && !dom.blogDetailModal.classList.contains('hidden')) return;

        currentDetailBlogId = blogId;

        // 标题
        dom.detailTitle.textContent = blog.title;

        // 元信息
        dom.detailMeta.innerHTML = `📅 ${escapeHtml(blog.date)} | ✍️ Omiaちゃん`;

        // 图片
        const img = blog.image || blog.images || '';
        if (img) {
            dom.detailImageWrapper.classList.remove('hidden');
            dom.detailImageWrapper.innerHTML = `<img src="${escapeAttr(img)}" alt="${escapeAttr(blog.title)}" loading="lazy" onclick="window.openLightbox && window.openLightbox('${escapeAttr(img)}')">`;
        } else {
            dom.detailImageWrapper.classList.add('hidden');
            dom.detailImageWrapper.innerHTML = '';
        }

        // 内容 — 按换行拆分为段落
        const paragraphs = blog.content.split('\n').filter(p => p.trim());
        dom.detailContent.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');

        // 标签
        dom.detailTags.innerHTML = blog.tags.map(t => `<span class="blog-tag">${escapeHtml(t)}</span>`).join('');

        openModal('blogDetailModal');
    };

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ==================== 图片灯箱 ====================
    window.openLightbox = function(src) {
        // 移除已有灯箱
        const existing = document.querySelector('.lightbox-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'lightbox-overlay';
        overlay.innerHTML = '<img src="' + escapeAttr(src) + '" alt="放大查看">';
        overlay.addEventListener('click', function() { overlay.remove(); });
        document.body.appendChild(overlay);
    };

    window.openAddBlog = function() {
        dom.blogModalTitle.textContent = '发布新博客';
        dom.blogId.value = '';
        dom.blogTitle.value = '';
        dom.blogDate.value = new Date().toISOString().split('T')[0];
        dom.blogContent.value = '';
        dom.blogTags.value = '';
        dom.charCount.textContent = '0 / 5000';
        dom.charCount.className = 'char-count';
        openModal('blogModal');
    };

    window.editBlog = function(id) {
        const blog = blogs.find(b => b.id === id);
        if (!blog) return;
        dom.blogModalTitle.textContent = '编辑博客';
        dom.blogId.value = blog.id;
        dom.blogTitle.value = blog.title;
        dom.blogDate.value = blog.date;
        dom.blogContent.value = blog.content;
        dom.blogTags.value = blog.tags.join(', ');
        populateImageFields(blog.image || '');
        updateCharCount();
        openModal('blogModal');
    };

    window.saveBlog = function() {
        const id      = dom.blogId.value;
        const title   = dom.blogTitle.value.trim();
        const date    = dom.blogDate.value;
        const content = dom.blogContent.value.trim();
        const tags    = dom.blogTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
        const image   = getBlogImageData();

        if (!title)   { showToast('请填写博客标题', 'error'); dom.blogTitle.focus(); return; }
        if (!date)    { showToast('请选择日期', 'error'); return; }
        if (!content) { showToast('请填写博客内容', 'error'); dom.blogContent.focus(); return; }

        if (id) {
            const index = blogs.findIndex(b => b.id === parseInt(id));
            if (index !== -1) {
                blogs[index] = { ...blogs[index], title, date, content, tags, image };
                showToast('✅ 博客已更新', 'success');
            }
        } else {
            const newId = blogs.length > 0 ? Math.max(...blogs.map(b => b.id)) + 1 : 1;
            blogs.unshift({ id: newId, title, date, content, tags, image });
            showToast('✅ 博客发布成功', 'success');
        }

        saveBlogs();
        renderBlogs();
        closeModal('blogModal');
    };

    window.deleteBlog = function(id) {
        if (!confirm('确定要删除这篇博客吗？此操作不可恢复。')) return;
        blogs = blogs.filter(b => b.id !== id);
        saveBlogs();
        renderBlogs();
        showToast(' 博客已删除', 'info');
    };

    // ==================== 字数统计 ====================
    function updateCharCount() {
        const len = dom.blogContent.value.length;
        const max = 5000;
        dom.charCount.textContent = `${len} / ${max}`;
        dom.charCount.className = 'char-count';
        if (len > max * 0.9) dom.charCount.classList.add('danger');
        else if (len > max * 0.7) dom.charCount.classList.add('warning');
    }

    // ==================== 搜索过滤 ====================
    function onBlogSearch() {
        renderBlogs();
    }

    // ==================== 打字机效果 ====================
    const typewriterText = "Hello My name is Omiaちゃん";
    const typingSpeed  = 100;   // 打字速度 (ms)
    const pauseDelay   = 3000;  // 打完后的停顿 (ms)
    const deleteSpeed  = 90;    // 删除速度 (ms)
    const restartDelay = 1500;  // 删完后重新开始的停顿 (ms)

    let typeIndex    = 0;
    let isDeleting   = false;
    let typeTimer    = null;

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
    const backgroundImages = [
        'images/columbina-5k-3840x2160-25922.jpg',
        'images/oshi-no-ko-3840x2160-25261.jpg',
        'images/sparxie-honkai-star-3840x2160-26290.jpg',
        'images/zhuang-fangyi-3840x2160-26226.jpg'
    ];

    function setRandomBackground() {
        if (backgroundImages.length === 0 || !dom.bgLayer) return;
        const idx = Math.floor(Math.random() * backgroundImages.length);
        const url = backgroundImages[idx];
        const img = new Image();
        img.onload = function() {
            dom.bgLayer.style.backgroundImage = `url('${url}')`;
            dom.bgLayer.style.opacity = 1;
        };
        img.onerror = function() {
            console.warn('背景图片加载失败:', url);
            // 失败时尝试下一张
            const next = backgroundImages.filter(b => b !== url);
            if (next.length > 0) {
                const fallback = next[Math.floor(Math.random() * next.length)];
                dom.bgLayer.style.backgroundImage = `url('${fallback}')`;
            }
        };
        img.src = url;
    }

    // 预加载所有背景图片
    function preloadBackgrounds() {
        backgroundImages.forEach(url => {
            const img = new Image();
            img.src = url;
        });
    }

    // ==================== 导航切换 ====================
    function bindNavEvents() {
        const navBtns = $$('.nav-btn');
        const sections = $$('.content-section');

        navBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.classList.contains('disabled')) return;
                navBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const targetId = this.dataset.target;
                
                sections.forEach(s => {
                    s.classList.remove('active');
                    s.style.animation = 'none';
                });
                
                const target = document.getElementById(targetId);
                if (target) {
                    target.classList.add('active');
                    // 触发重绘以重新播放动画
                    void target.offsetWidth;
                    target.style.animation = 'fadeInUp 0.5s ease forwards';
                }
            });
        });
    }

    // ==================== 全局事件绑定 ====================
    function bindEvents() {
        // 退出登录
        if (dom.adminPanel) {
            const logoutBtn = dom.adminPanel.querySelector('#logoutBtn');
            if (logoutBtn) logoutBtn.addEventListener('click', adminLogout);
        }
        // 新增博客
        if (dom.addBlogBtn) dom.addBlogBtn.addEventListener('click', openAddBlog);
        // 博客搜索
        if (dom.blogSearch) dom.blogSearch.addEventListener('input', debounce(onBlogSearch, 300));
        // 字数统计
        if (dom.blogContent) dom.blogContent.addEventListener('input', updateCharCount);
        // 导航
        bindNavEvents();
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
        // 图片上传：文件选择
        if (dom.blogImageFile) dom.blogImageFile.addEventListener('change', handleImageFileSelect);
        // 图片上传：URL 输入
        if (dom.blogImage) dom.blogImage.addEventListener('input', debounce(handleImageUrlInput, 500));
        // 清除图片
        if (dom.clearImageBtn) dom.clearImageBtn.addEventListener('click', clearImageFields);
        // 博客卡片点击 → 详情查看（事件委托，单监听器覆盖所有卡片）
        if (dom.blogList) dom.blogList.addEventListener('click', handleBlogCardClick);
        // 详情分享按钮
        if (dom.detailShareBtn) {
            dom.detailShareBtn.addEventListener('click', function() {
                if (!currentDetailBlogId) return;
                const url = `${window.location.origin}${window.location.pathname}?blog=${currentDetailBlogId}`;
                navigator.clipboard.writeText(url).then(function() {
                    showToast('📋 链接已复制到剪贴板', 'success');
                }).catch(function() {
                    showToast('复制失败，请手动复制地址栏链接', 'error');
                });
            });
        }
    }

    // ==================== 工具函数 ====================
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ==================== 页面启动 ====================
    window.addEventListener('DOMContentLoaded', function() {
        // 页面加载动画
        document.body.classList.add('loaded');
        
        init();
        startTyping();
        setRandomBackground();
        preloadBackgrounds();
    });

    // ==================== 暴露到全局作用域（兼容 onclick 属性） ====================
    window.editBlog   = window.editBlog;
    window.deleteBlog = window.deleteBlog;
    window.saveBlog   = window.saveBlog;
    window.openAddBlog = window.openAddBlog;
    window.adminLogin  = window.adminLogin;
    window.adminLogout = window.adminLogout;
    window.openModal   = window.openModal;
    window.closeModal  = window.closeModal;
})();
