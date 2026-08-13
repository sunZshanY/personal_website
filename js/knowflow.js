/**
 * KnowFlow · 个人知识库管理系统
 * =================================
 * 基于 RinUI Fluent Design Dark Theme
 * 纯前端 + localStorage 持久化
 */
(function() {
    'use strict';

    // ============================================================
    // 数据模型
    // ============================================================
    // Note: { id, title, category, content, tags[], createdAt, updatedAt, favorite }
    // Category: 从 notes 中自动提取 + 手动管理

    const STORAGE_KEY = 'knowflow_notes';
    const CATEGORY_KEY = 'knowflow_categories';
    const SETTINGS_KEY = 'knowflow_settings';

    // ============================================================
    // 全局状态
    // ============================================================
    let notes = [];
    let categories = [];
    let currentFilter = 'all';       // 'all' | 'favorites' | category name | tag name
    let currentFilterType = 'all';   // 'all' | 'favorites' | 'category' | 'tag'
    let currentView = 'grid';        // 'grid' | 'list'
    let currentNoteId = null;        // 当前编辑的笔记 ID
    let pendingDeleteId = null;      // 待删除的笔记 ID
    let isPreviewMode = false;       // 编辑器预览模式

    // ============================================================
    // DOM 引用
    // ============================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        // 顶部栏
        globalSearch: $('#globalSearch'),
        searchClear: $('#searchClear'),
        noteCount: $('#noteCount'),
        newNoteBtn: $('#newNoteBtn'),
        exportBtn: $('#exportBtn'),
        importBtn: $('#importBtn'),
        importFile: $('#importFile'),
        // 侧边栏
        countAll: $('#countAll'),
        countFav: $('#countFav'),
        categoryList: $('#categoryList'),
        tagCloud: $('#tagCloud'),
        addCategoryBtn: $('#addCategoryBtn'),
        storageInfo: $('#storageInfo'),
        // 内容区
        emptyState: $('#emptyState'),
        noteGrid: $('#noteGrid'),
        // 状态栏
        statusFilter: $('#statusFilter'),
        statusStats: $('#statusStats'),
        // 编辑器模态框
        noteModal: $('#noteModal'),
        noteModalTitle: $('#noteModalTitle'),
        noteId: $('#noteId'),
        noteTitle: $('#noteTitle'),
        noteCategory: $('#noteCategory'),
        noteContent: $('#noteContent'),
        noteTags: $('#noteTags'),
        noteCharCount: $('#noteCharCount'),
        contentPreview: $('#contentPreview'),
        previewToggle: $('#previewToggle'),
        saveNoteBtn: $('#saveNoteBtn'),
        favToggleBtn: $('#favToggleBtn'),
        newCategoryInlineBtn: $('#newCategoryInlineBtn'),
        // 确认弹窗
        confirmModal: $('#confirmModal'),
        confirmMessage: $('#confirmMessage'),
        confirmDeleteBtn: $('#confirmDeleteBtn'),
        // 详情弹窗
        detailModal: $('#detailModal'),
        detailTitle: $('#detailTitle'),
        detailMeta: $('#detailMeta'),
        detailContent: $('#detailContent'),
        detailTags: $('#detailTags'),
        detailEditBtn: $('#detailEditBtn'),
        detailDeleteBtn: $('#detailDeleteBtn'),
        // Toast
        toastContainer: $('#toastContainer'),
    };

    // ============================================================
    // 数据持久化
    // ============================================================
    function loadData() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            notes = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn('[KnowFlow] 数据读取失败，初始化为空');
            notes = [];
        }
        try {
            const storedCat = localStorage.getItem(CATEGORY_KEY);
            categories = storedCat ? JSON.parse(storedCat) : [];
        } catch (e) {
            categories = [];
        }
        // 从笔记中同步分类
        syncCategoriesFromNotes();
    }

    function saveNotes() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
            updateStorageInfo();
        } catch (e) {
            showToast('存储空间不足，请导出数据后清理旧笔记', 'error');
        }
    }

    function saveCategories() {
        try {
            localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories));
        } catch (e) { /* 静默 */ }
    }

    function syncCategoriesFromNotes() {
        const usedCats = new Set();
        notes.forEach(n => { if (n.category) usedCats.add(n.category); });
        // 合并：保留手动添加的分类 + 从笔记提取的分类
        usedCats.forEach(c => {
            if (!categories.includes(c)) categories.push(c);
        });
        // 清理不再使用的分类（可选：保留手动创建的）
        saveCategories();
    }

    function updateStorageInfo() {
        if (!dom.storageInfo) return;
        let total = 0;
        try {
            total = new Blob([JSON.stringify(notes)]).size;
        } catch (e) {}
        const kb = (total / 1024).toFixed(1);
        dom.storageInfo.textContent = '💾 ' + kb + ' KB';
    }

    // ============================================================
    // Toast 通知
    // ============================================================
    function showToast(message, type) {
        type = type || 'info';
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        const item = document.createElement('div');
        item.className = 'toast-item toast-' + type;
        item.textContent = (icons[type] || '') + ' ' + message;
        dom.toastContainer.appendChild(item);
        setTimeout(() => {
            item.style.animation = 'toastSlideOut 0.35s ease forwards';
            setTimeout(() => item.remove(), 350);
        }, 2800);
    }

    // ============================================================
    // 工具函数
    // ============================================================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    function formatDate(isoStr) {
        if (!isoStr) return '';
        const d = new Date(isoStr);
        const pad = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
               ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function getContentPreview(content, maxLen) {
        maxLen = maxLen || 120;
        // 去掉 markdown 标记
        let text = content
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*/g, '')
            .replace(/\*/g, '')
            .replace(/`/g, '')
            .replace(/[-*+]\s/g, '')
            .replace(/\n/g, ' ')
            .trim();
        if (text.length > maxLen) text = text.substring(0, maxLen) + '...';
        return text || '(空内容)';
    }

    function debounce(fn, delay) {
        let timer;
        return function() {
            const ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(ctx, args), delay);
        };
    }

    // ============================================================
    // 简单 Markdown → HTML 转换（预览用）
    // ============================================================
    function markdownToHtml(text) {
        if (!text) return '';
        let html = escapeHtml(text);

        // 代码块 (```...```)
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // 行内代码 (`...`)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 标题
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // 粗体 + 斜体
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // 无序列表
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // 引用
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // 段落：连续换行 → <p>
        html = html.replace(/\n\n+/g, '</p><p>');
        html = '<p>' + html + '</p>';

        // 清理空段落
        html = html.replace(/<p>\s*<\/p>/g, '');
        // 清理块级元素外多余的 <p> 包裹
        html = html.replace(/<p>(<(h[1-3]|ul|ol|pre|blockquote)[^>]*>[\s\S]*?<\/\2>)<\/p>/g, '$1');

        return html;
    }

    // ============================================================
    // 侧边栏渲染
    // ============================================================
    function renderSidebar() {
        renderCategories();
        renderTagCloud();
        updateCounts();
    }

    function updateCounts() {
        if (dom.countAll) dom.countAll.textContent = notes.length;
        const favCount = notes.filter(n => n.favorite).length;
        if (dom.countFav) dom.countFav.textContent = favCount;
    }

    function renderCategories() {
        if (!dom.categoryList) return;

        syncCategoriesFromNotes();

        // 统计每个分类的笔记数
        const catCounts = {};
        notes.forEach(n => {
            const c = n.category || '无分类';
            catCounts[c] = (catCounts[c] || 0) + 1;
        });

        let html = '';

        // "无分类" 始终显示
        const noCatCount = catCounts['无分类'] || 0;
        html += '<button class="category-item' + (currentFilterType === 'category' && currentFilter === '__none__' ? ' active' : '') + '" data-category="__none__">' +
                '📂 无分类<span class="cat-count">' + noCatCount + '</span>' +
                '<span class="cat-delete" data-category="__none__" style="visibility:hidden;">×</span>' +
                '</button>';

        // 所有有笔记的分类
        const allCats = [...new Set([...categories, ...Object.keys(catCounts).filter(c => c !== '无分类')])];
        allCats.forEach(cat => {
            const count = catCounts[cat] || 0;
            html += '<button class="category-item' + (currentFilterType === 'category' && currentFilter === cat ? ' active' : '') + '" data-category="' + escapeAttr(cat) + '">' +
                    '📂 ' + escapeHtml(cat) + '<span class="cat-count">' + count + '</span>' +
                    '<span class="cat-delete" data-category="' + escapeAttr(cat) + '">×</span>' +
                    '</button>';
        });

        dom.categoryList.innerHTML = html;

        // 分类删除事件
        dom.categoryList.querySelectorAll('.cat-delete').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const cat = this.dataset.category;
                if (cat === '__none__') return;
                if (confirm('删除分类 "' + cat + '"？笔记不会被删除，只会取消分类关联。')) {
                    categories = categories.filter(c => c !== cat);
                    notes.forEach(n => { if (n.category === cat) n.category = ''; });
                    saveNotes();
                    saveCategories();
                    if (currentFilterType === 'category' && currentFilter === cat) {
                        setFilter('all', 'all');
                    }
                    renderAll();
                    showToast('分类已删除', 'info');
                }
            });
        });
    }

    function renderTagCloud() {
        if (!dom.tagCloud) return;

        const tagCounts = {};
        notes.forEach(n => {
            (n.tags || []).forEach(t => {
                tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
        });

        const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

        dom.tagCloud.innerHTML = sorted.map(([tag, count]) => {
            const active = currentFilterType === 'tag' && currentFilter === tag;
            return '<span class="tag-cloud-item' + (active ? ' active' : '') + '" data-tag="' + escapeAttr(tag) + '">' +
                   escapeHtml(tag) + ' (' + count + ')</span>';
        }).join('');
    }

    // ============================================================
    // 内容区渲染
    // ============================================================
    function getFilteredNotes() {
        const searchTerm = dom.globalSearch ? dom.globalSearch.value.trim().toLowerCase() : '';

        let filtered = notes;

        // 分类/收藏筛选
        if (currentFilterType === 'favorites') {
            filtered = filtered.filter(n => n.favorite);
        } else if (currentFilterType === 'category') {
            if (currentFilter === '__none__') {
                filtered = filtered.filter(n => !n.category);
            } else {
                filtered = filtered.filter(n => n.category === currentFilter);
            }
        } else if (currentFilterType === 'tag') {
            filtered = filtered.filter(n => (n.tags || []).includes(currentFilter));
        }

        // 搜索
        if (searchTerm) {
            filtered = filtered.filter(n =>
                n.title.toLowerCase().includes(searchTerm) ||
                n.content.toLowerCase().includes(searchTerm) ||
                (n.tags || []).some(t => t.toLowerCase().includes(searchTerm)) ||
                (n.category || '').toLowerCase().includes(searchTerm)
            );
        }

        // 按更新时间倒序
        filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        return filtered;
    }

    function renderNotes() {
        const filtered = getFilteredNotes();

        // 更新统计
        if (dom.noteCount) dom.noteCount.textContent = filtered.length + ' / ' + notes.length + ' 条笔记';
        if (dom.statusStats) dom.statusStats.textContent = '共 ' + notes.length + ' 条笔记';
        if (dom.statusFilter) {
            let label = '全部笔记';
            if (currentFilterType === 'favorites') label = '⭐ 收藏夹';
            else if (currentFilterType === 'category') label = '分类: ' + (currentFilter === '__none__' ? '无分类' : currentFilter);
            else if (currentFilterType === 'tag') label = '标签: #' + currentFilter;
            dom.statusFilter.textContent = '筛选：' + label;
        }

        // 空状态
        if (filtered.length === 0) {
            dom.emptyState.classList.remove('hidden');
            dom.noteGrid.classList.add('hidden');
            const subtitle = dom.emptyState.querySelector('.empty-subtitle');
            if (subtitle) {
                if (notes.length === 0) subtitle.textContent = '点击「✏️ 新建笔记」开始记录你的知识吧！';
                else subtitle.textContent = '没有匹配的笔记，尝试调整筛选条件';
            }
            return;
        }

        dom.emptyState.classList.add('hidden');
        dom.noteGrid.classList.remove('hidden');

        // 视图模式
        if (currentView === 'list') {
            dom.noteGrid.classList.add('list-view');
        } else {
            dom.noteGrid.classList.remove('list-view');
        }

        dom.noteGrid.innerHTML = filtered.map(note => {
            const preview = getContentPreview(note.content, 150);
            const catBadge = note.category
                ? '<span class="card-category">📂 ' + escapeHtml(note.category) + '</span>'
                : '';
            const tagsHtml = (note.tags || []).slice(0, 4).map(t =>
                '<span class="card-tag">#' + escapeHtml(t) + '</span>'
            ).join('');

            return '<article class="note-card" data-note-id="' + note.id + '">' +
                '<button class="card-fav-star' + (note.favorite ? ' active' : '') + '" data-id="' + note.id + '" title="切换收藏">⭐</button>' +
                catBadge +
                '<h3 class="card-title">' + escapeHtml(note.title) + '</h3>' +
                '<p class="card-preview">' + escapeHtml(preview) + '</p>' +
                (tagsHtml ? '<div class="card-tags">' + tagsHtml + '</div>' : '') +
                '<div class="card-meta">' +
                    '<span>🕐 ' + formatDate(note.updatedAt) + '</span>' +
                    '<span class="card-actions">' +
                        '<button class="rinui-btn flat small card-edit-btn" data-id="' + note.id + '">✏️</button>' +
                        '<button class="rinui-btn flat small card-delete-btn" data-id="' + note.id + '">🗑️</button>' +
                    '</span>' +
                '</div>' +
            '</article>';
        }).join('');

        // 绑定卡片事件
        bindNoteCardEvents();
    }

    function bindNoteCardEvents() {
        dom.noteGrid.querySelectorAll('.note-card').forEach(card => {
            // 点击卡片 → 查看详情
            card.addEventListener('click', function(e) {
                // 忽略按钮点击
                if (e.target.closest('button') || e.target.closest('.card-fav-star')) return;
                const id = this.dataset.noteId;
                openDetail(id);
            });
        });

        // 收藏按钮
        dom.noteGrid.querySelectorAll('.card-fav-star').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleFavorite(this.dataset.id);
            });
        });

        // 编辑按钮
        dom.noteGrid.querySelectorAll('.card-edit-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                openEditor(this.dataset.id);
            });
        });

        // 删除按钮
        dom.noteGrid.querySelectorAll('.card-delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                confirmDelete(this.dataset.id);
            });
        });
    }

    function renderAll() {
        renderSidebar();
        renderNotes();
    }

    // ============================================================
    // 筛选逻辑
    // ============================================================
    function setFilter(value, type) {
        currentFilter = value;
        currentFilterType = type;

        // 更新侧边栏激活状态
        $$('.sidebar-nav-btn').forEach(b => b.classList.remove('active'));
        $$('.category-item').forEach(b => b.classList.remove('active'));
        $$('.tag-cloud-item').forEach(b => b.classList.remove('active'));

        if (type === 'all') {
            const allBtn = document.querySelector('.sidebar-nav-btn[data-filter="all"]');
            if (allBtn) allBtn.classList.add('active');
        } else if (type === 'favorites') {
            const favBtn = document.querySelector('.sidebar-nav-btn[data-filter="favorites"]');
            if (favBtn) favBtn.classList.add('active');
        } else if (type === 'category') {
            const catBtn = document.querySelector('.category-item[data-category="' + CSS.escape(value) + '"]');
            if (catBtn) catBtn.classList.add('active');
        } else if (type === 'tag') {
            const tagBtn = document.querySelector('.tag-cloud-item[data-tag="' + CSS.escape(value) + '"]');
            if (tagBtn) tagBtn.classList.add('active');
        }

        renderAll();
    }

    // ============================================================
    // 笔记 CRUD
    // ============================================================
    function openEditor(noteId) {
        currentNoteId = noteId;
        isPreviewMode = false;

        // 更新分类下拉
        syncCategoriesFromNotes();
        updateCategorySelect();

        if (noteId) {
            const note = notes.find(n => n.id === noteId);
            if (!note) return;

            dom.noteModalTitle.textContent = '✏️ 编辑笔记';
            dom.noteId.value = note.id;
            dom.noteTitle.value = note.title;
            dom.noteCategory.value = note.category || '';
            dom.noteContent.value = note.content;
            dom.noteTags.value = (note.tags || []).join(', ');
            dom.favToggleBtn.textContent = note.favorite ? '⭐' : '☆';
            dom.favToggleBtn.title = note.favorite ? '取消收藏' : '收藏';
            dom.saveNoteBtn.textContent = '💾 更新';
        } else {
            dom.noteModalTitle.textContent = '✏️ 新建笔记';
            dom.noteId.value = '';
            dom.noteTitle.value = '';
            dom.noteCategory.value = '';
            dom.noteContent.value = '';
            dom.noteTags.value = '';
            dom.favToggleBtn.textContent = '☆';
            dom.favToggleBtn.title = '收藏';
            dom.saveNoteBtn.textContent = '💾 保存';
        }

        dom.contentPreview.classList.add('hidden');
        dom.noteContent.classList.remove('hidden');
        dom.previewToggle.textContent = '👁 预览';
        updateNoteCharCount();

        openModal('noteModal');
        setTimeout(() => dom.noteTitle.focus(), 150);
    }

    function saveNote() {
        const id = dom.noteId.value;
        const title = dom.noteTitle.value.trim();
        const category = dom.noteCategory.value;
        const content = dom.noteContent.value.trim();
        const tags = dom.noteTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);

        if (!title) {
            showToast('请输入笔记标题', 'error');
            dom.noteTitle.focus();
            return;
        }

        const now = new Date().toISOString();

        if (id) {
            // 更新
            const note = notes.find(n => n.id === id);
            if (note) {
                note.title = title;
                note.category = category;
                note.content = content;
                note.tags = tags;
                note.updatedAt = now;
            }
        } else {
            // 新建
            notes.unshift({
                id: generateId(),
                title: title,
                category: category,
                content: content,
                tags: tags,
                createdAt: now,
                updatedAt: now,
                favorite: false,
            });
        }

        // 自动添加新分类
        if (category && !categories.includes(category)) {
            categories.push(category);
            saveCategories();
        }

        saveNotes();
        closeModal('noteModal');
        renderAll();
        showToast(id ? '笔记已更新' : '笔记已创建', 'success');
    }

    function toggleFavorite(noteId) {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;
        note.favorite = !note.favorite;
        note.updatedAt = new Date().toISOString();
        saveNotes();
        renderAll();
        showToast(note.favorite ? '已添加到收藏夹' : '已取消收藏', 'info');
    }

    function confirmDelete(noteId) {
        pendingDeleteId = noteId;
        const note = notes.find(n => n.id === noteId);
        dom.confirmMessage.textContent = '确定要删除笔记「' + (note ? note.title : '') + '」吗？此操作不可撤销！';
        openModal('confirmModal');
    }

    function deleteNote() {
        if (!pendingDeleteId) return;
        notes = notes.filter(n => n.id !== pendingDeleteId);
        saveNotes();
        closeModal('confirmModal');
        closeModal('detailModal');
        renderAll();
        showToast('笔记已删除', 'info');
        pendingDeleteId = null;
    }

    // ============================================================
    // 详情查看
    // ============================================================
    function openDetail(noteId) {
        const note = notes.find(n => n.id === noteId);
        if (!note) return;

        currentNoteId = noteId;

        dom.detailTitle.textContent = note.title;
        dom.detailMeta.innerHTML =
            (note.category ? '📂 ' + escapeHtml(note.category) + ' | ' : '') +
            '🕐 创建: ' + formatDate(note.createdAt) + ' | 更新: ' + formatDate(note.updatedAt) +
            (note.favorite ? ' | ⭐ 已收藏' : '');

        dom.detailContent.innerHTML = markdownToHtml(note.content);
        dom.detailTags.innerHTML = (note.tags || []).map(t =>
            '<span class="blog-tag" style="display:inline-block;padding:4px 10px;background:#0f3460;color:#80b0e0;font-size:11px;border-radius:11px;margin:2px;font-family:JetBrains Mono,monospace;">#' + escapeHtml(t) + '</span>'
        ).join('');

        openModal('detailModal');
    }

    // ============================================================
    // 分类选择器
    // ============================================================
    function updateCategorySelect() {
        if (!dom.noteCategory) return;
        const currentVal = dom.noteCategory.value;
        dom.noteCategory.innerHTML = '<option value="">无分类</option>' +
            categories.map(c => '<option value="' + escapeAttr(c) + '"' + (c === currentVal ? ' selected' : '') + '>' + escapeHtml(c) + '</option>').join('');
    }

    function addCategoryInline() {
        const name = prompt('新建分类名称：');
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        if (categories.includes(trimmed)) {
            showToast('分类 "' + trimmed + '" 已存在', 'info');
            return;
        }
        categories.push(trimmed);
        saveCategories();
        updateCategorySelect();
        dom.noteCategory.value = trimmed;
        showToast('分类 "' + trimmed + '" 已创建', 'success');
    }

    // ============================================================
    // 编辑器工具栏
    // ============================================================
    function applyMarkdown(action) {
        const textarea = dom.noteContent;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end);

        let replacement = '';
        let cursorOffset = 0;

        switch (action) {
            case 'bold':
                replacement = '**' + (selected || '加粗文字') + '**';
                cursorOffset = selected ? 0 : -2;
                break;
            case 'italic':
                replacement = '*' + (selected || '斜体文字') + '*';
                cursorOffset = selected ? 0 : -1;
                break;
            case 'heading':
                replacement = '\n## ' + (selected || '标题');
                break;
            case 'code':
                if (selected.includes('\n')) {
                    replacement = '\n```\n' + selected + '\n```\n';
                } else {
                    replacement = '`' + (selected || '代码') + '`';
                    cursorOffset = selected ? 0 : -1;
                }
                break;
            case 'list':
                replacement = '\n- ' + (selected || '列表项');
                break;
            case 'link':
                replacement = '[' + (selected || '链接文字') + '](url)';
                break;
        }

        textarea.value = text.substring(0, start) + replacement + text.substring(end);
        textarea.focus();

        const newPos = start + replacement.length + cursorOffset;
        textarea.setSelectionRange(newPos, newPos);
        updateNoteCharCount();
    }

    function togglePreview() {
        isPreviewMode = !isPreviewMode;
        if (isPreviewMode) {
            dom.noteContent.classList.add('hidden');
            dom.contentPreview.classList.remove('hidden');
            dom.contentPreview.innerHTML = markdownToHtml(dom.noteContent.value);
            dom.previewToggle.textContent = '✏️ 编辑';
        } else {
            dom.noteContent.classList.remove('hidden');
            dom.contentPreview.classList.add('hidden');
            dom.previewToggle.textContent = '👁 预览';
        }
    }

    function updateNoteCharCount() {
        if (!dom.noteCharCount) return;
        const len = dom.noteContent.value.length;
        const max = 50000;
        dom.noteCharCount.textContent = len + ' / ' + max;
        dom.noteCharCount.className = 'char-count';
        if (len > max * 0.9) dom.noteCharCount.classList.add('danger');
        else if (len > max * 0.7) dom.noteCharCount.classList.add('warning');
    }

    // ============================================================
    // 导入导出
    // ============================================================
    function exportData() {
        const data = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            notes: notes,
            categories: categories,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'knowflow-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('知识库已导出', 'success');
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.notes || !Array.isArray(data.notes)) {
                    throw new Error('无效的数据格式');
                }

                if (!confirm('即将导入 ' + data.notes.length + ' 条笔记。\n\n选择"确定"将合并到现有知识库（重复笔记会保留两份）。\n选择"取消"将放弃导入。')) return;

                // 合并笔记
                const existingIds = new Set(notes.map(n => n.id));
                let importedCount = 0;
                data.notes.forEach(n => {
                    // 避免 ID 冲突
                    if (existingIds.has(n.id)) {
                        n.id = generateId();
                    }
                    notes.unshift(n);
                    importedCount++;
                });

                // 合并分类
                if (data.categories && Array.isArray(data.categories)) {
                    data.categories.forEach(c => {
                        if (!categories.includes(c)) categories.push(c);
                    });
                    saveCategories();
                }

                saveNotes();
                syncCategoriesFromNotes();
                renderAll();
                showToast('成功导入 ' + importedCount + ' 条笔记', 'success');
            } catch (err) {
                showToast('导入失败：文件格式不正确', 'error');
                console.error('[KnowFlow] 导入错误:', err);
            }
        };
        reader.onerror = function() {
            showToast('文件读取失败', 'error');
        };
        reader.readAsText(file);
    }

    // ============================================================
    // 模态框操作
    // ============================================================
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        if (modalId === 'noteModal') {
            currentNoteId = null;
            isPreviewMode = false;
        }
        if (modalId === 'confirmModal') {
            pendingDeleteId = null;
        }
    }

    function handleModalBackdrop(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
    }

    // ============================================================
    // 事件绑定
    // ============================================================
    function bindEvents() {
        // ---- 侧边栏导航 ----
        $$('.sidebar-nav-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const filter = this.dataset.filter;
                if (filter === 'all') setFilter('all', 'all');
                else if (filter === 'favorites') setFilter('favorites', 'favorites');
            });
        });

        // 分类点击
        if (dom.categoryList) {
            dom.categoryList.addEventListener('click', function(e) {
                const item = e.target.closest('.category-item');
                if (!item || e.target.closest('.cat-delete')) return;
                const cat = item.dataset.category;
                setFilter(cat, 'category');
            });
        }

        // 标签云点击
        if (dom.tagCloud) {
            dom.tagCloud.addEventListener('click', function(e) {
                const item = e.target.closest('.tag-cloud-item');
                if (!item) return;
                const tag = item.dataset.tag;
                setFilter(tag, 'tag');
            });
        }

        // 新增分类
        if (dom.addCategoryBtn) dom.addCategoryBtn.addEventListener('click', addCategoryInline);
        if (dom.newCategoryInlineBtn) dom.newCategoryInlineBtn.addEventListener('click', addCategoryInline);

        // ---- 顶部栏 ----
        // 搜索
        if (dom.globalSearch) dom.globalSearch.addEventListener('input', debounce(renderAll, 250));
        if (dom.searchClear) {
            dom.searchClear.addEventListener('click', function() {
                dom.globalSearch.value = '';
                dom.searchClear.classList.add('hidden');
                renderAll();
                dom.globalSearch.focus();
            });
            dom.globalSearch.addEventListener('input', function() {
                dom.searchClear.classList.toggle('hidden', !this.value);
            });
        }

        // 新建笔记
        if (dom.newNoteBtn) dom.newNoteBtn.addEventListener('click', () => openEditor(null));

        // 视图切换
        $$('.view-toggle').forEach(btn => {
            btn.addEventListener('click', function() {
                $$('.view-toggle').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentView = this.dataset.view;
                renderNotes();
            });
        });

        // 导入导出
        if (dom.exportBtn) dom.exportBtn.addEventListener('click', exportData);
        if (dom.importBtn) dom.importBtn.addEventListener('click', () => dom.importFile.click());
        if (dom.importFile) dom.importFile.addEventListener('change', function() {
            if (this.files[0]) importData(this.files[0]);
            this.value = '';
        });

        // ---- 编辑器 ----
        if (dom.saveNoteBtn) dom.saveNoteBtn.addEventListener('click', saveNote);
        if (dom.favToggleBtn) {
            dom.favToggleBtn.addEventListener('click', function() {
                if (currentNoteId) {
                    toggleFavorite(currentNoteId);
                    const note = notes.find(n => n.id === currentNoteId);
                    if (note) {
                        this.textContent = note.favorite ? '⭐' : '☆';
                    }
                }
            });
        }
        if (dom.previewToggle) dom.previewToggle.addEventListener('click', togglePreview);
        if (dom.noteContent) dom.noteContent.addEventListener('input', updateNoteCharCount);

        // 编辑器工具栏
        $$('.toolbar-btn[data-action]').forEach(btn => {
            if (btn.id === 'previewToggle') return;
            btn.addEventListener('click', function() {
                applyMarkdown(this.dataset.action);
            });
        });

        // 编辑器 Ctrl+S 保存
        if (dom.noteModal) {
            dom.noteModal.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    saveNote();
                }
            });
        }

        // ---- 确认弹窗 ----
        if (dom.confirmDeleteBtn) dom.confirmDeleteBtn.addEventListener('click', deleteNote);

        // ---- 详情弹窗 ----
        if (dom.detailEditBtn) dom.detailEditBtn.addEventListener('click', function() {
            const id = currentNoteId;
            closeModal('detailModal');
            openEditor(id);
        });
        if (dom.detailDeleteBtn) dom.detailDeleteBtn.addEventListener('click', function() {
            const id = currentNoteId;
            closeModal('detailModal');
            confirmDelete(id);
        });

        // ---- 关闭按钮 ----
        $('#closeNoteModal')?.addEventListener('click', () => closeModal('noteModal'));
        $('#cancelNoteBtn')?.addEventListener('click', () => closeModal('noteModal'));
        $('#closeConfirmModal')?.addEventListener('click', () => closeModal('confirmModal'));
        $('#cancelConfirmBtn')?.addEventListener('click', () => closeModal('confirmModal'));
        $('#closeDetailModal')?.addEventListener('click', () => closeModal('detailModal'));
        $('#closeDetailBtn')?.addEventListener('click', () => closeModal('detailModal'));

        // 模态框遮罩点击
        $$('.modal').forEach(m => m.addEventListener('click', handleModalBackdrop));

        // ESC 关闭
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (dom.detailModal && !dom.detailModal.classList.contains('hidden')) closeModal('detailModal');
                else if (dom.noteModal && !dom.noteModal.classList.contains('hidden')) closeModal('noteModal');
                else if (dom.confirmModal && !dom.confirmModal.classList.contains('hidden')) closeModal('confirmModal');
            }
        });
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        loadData();
        renderAll();
        bindEvents();
        updateStorageInfo();
        console.log('[KnowFlow] 知识库已就绪 — ' + notes.length + ' 条笔记');
    }

    // 启动
    window.addEventListener('DOMContentLoaded', init);

})();
