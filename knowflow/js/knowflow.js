/**
 * KnowFlow — 个人知识库前端逻辑
 * ================================
 * 纯前端 + localStorage 持久化，RinUI 架构。
 * 可对接 Python Flask / Java Spring Boot 后端 API。
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'knowflow_notes';
    const CATEGORY_KEY = 'knowflow_categories';

    // ==================== 状态 ====================
    let notes = [];
    let categories = [];
    let filterType = 'all';   // 'all'|'favorites'|'category'|'tag'
    let filterValue = 'all';
    let currentView = 'grid';
    let editNoteId = null;
    let deleteTargetId = null;
    let detailNoteId = null;
    let previewOn = false;

    // ==================== DOM ====================
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    const D = {
        toast: $('#toastContainer'),
        globalSearch: $('#globalSearch'), searchClear: $('#searchClear'),
        noteCount: $('#noteCount'), newNoteBtn: $('#newNoteBtn'), emptyNewBtn: $('#emptyNewBtn'),
        exportBtn: $('#exportBtn'), importBtn: $('#importBtn'), importFile: $('#importFile'),
        countAll: $('#countAll'), countFav: $('#countFav'),
        categoryList: $('#categoryList'), tagCloud: $('#tagCloud'),
        addCategoryBtn: $('#addCategoryBtn'), storageInfo: $('#storageInfo'),
        emptyState: $('#emptyState'), noteGrid: $('#noteGrid'),
        statusFilter: $('#statusFilter'), statusStats: $('#statusStats'),
        // Editor
        noteModal: $('#noteModal'), noteModalTitle: $('#noteModalTitle'),
        noteId: $('#noteId'), noteTitle: $('#noteTitle'),
        noteCategory: $('#noteCategory'), noteContent: $('#noteContent'),
        noteTags: $('#noteTags'), noteCharCount: $('#noteCharCount'),
        contentPreview: $('#contentPreview'), previewToggle: $('#previewToggle'),
        saveNoteBtn: $('#saveNoteBtn'), favToggleBtn: $('#favToggleBtn'),
        newCategoryInlineBtn: $('#newCategoryInlineBtn'),
        // Confirm
        confirmModal: $('#confirmModal'), confirmMessage: $('#confirmMessage'),
        confirmDeleteBtn: $('#confirmDeleteBtn'),
        // Detail
        detailModal: $('#detailModal'), detailTitle: $('#detailTitle'),
        detailMeta: $('#detailMeta'), detailContent: $('#detailContent'),
        detailTags: $('#detailTags'), detailEditBtn: $('#detailEditBtn'),
        detailDeleteBtn: $('#detailDeleteBtn'),
    };

    // ==================== Toast ====================
    function toast(msg, type) {
        type = type || 'info';
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        const el = document.createElement('div');
        el.className = 'toast-item toast-' + type;
        el.textContent = (icons[type] || '') + ' ' + msg;
        D.toast.appendChild(el);
        setTimeout(() => {
            el.style.animation = 'toastOut 0.35s ease forwards';
            setTimeout(() => el.remove(), 350);
        }, 2800);
    }

    // ==================== 数据 ====================
    function load() {
        try { notes = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch (e) { notes = []; }
        try { categories = JSON.parse(localStorage.getItem(CATEGORY_KEY)) || []; }
        catch (e) { categories = []; }
        syncCategories();
    }

    function saveNotes() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); updateStorageInfo(); }
        catch (e) { toast('存储空间不足', 'error'); }
    }

    function saveCategories() {
        try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories)); }
        catch (e) { /* silent */ }
    }

    function syncCategories() {
        const used = new Set();
        notes.forEach(n => { if (n.category) used.add(n.category); });
        used.forEach(c => { if (!categories.includes(c)) categories.push(c); });
        saveCategories();
    }

    function updateStorageInfo() {
        if (!D.storageInfo) return;
        try { D.storageInfo.textContent = '💾 ' + (new Blob([JSON.stringify(notes)]).size / 1024).toFixed(1) + ' KB'; }
        catch (e) {}
    }

    // ==================== 工具 ====================
    function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') +
               ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }
    function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function escAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function preview(s, max) {
        max = max || 120;
        let t = s.replace(/#{1,6}\s/g,'').replace(/\*\*/g,'').replace(/\*/g,'').replace(/`/g,'').replace(/[-*+]\s/g,'').replace(/\n/g,' ').trim();
        return t.length > max ? t.substring(0, max) + '...' : (t || '(空内容)');
    }
    function debounce(fn, ms) {
        let t;
        return function() { const ctx=this, args=arguments; clearTimeout(t); t = setTimeout(() => fn.apply(ctx, args), ms); };
    }

    // ==================== Markdown → HTML ====================
    function md2html(text) {
        if (!text) return '';
        let h = escHtml(text);
        h = h.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
        h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
        h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        h = h.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        h = h.replace(/\n\n+/g, '</p><p>');
        h = '<p>' + h + '</p>';
        h = h.replace(/<p>\s*<\/p>/g, '');
        return h;
    }

    // ==================== 筛选 ====================
    function getFiltered() {
        const s = D.globalSearch ? D.globalSearch.value.trim().toLowerCase() : '';
        let f = notes;
        if (filterType === 'favorites') f = f.filter(n => n.favorite);
        else if (filterType === 'category') f = f.filter(n => filterValue === '__none__' ? !n.category : n.category === filterValue);
        else if (filterType === 'tag') f = f.filter(n => (n.tags||[]).includes(filterValue));
        if (s) f = f.filter(n => n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s) || (n.tags||[]).some(t => t.toLowerCase().includes(s)) || (n.category||'').toLowerCase().includes(s));
        f.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return f;
    }

    function setFilter(type, val) {
        filterType = type; filterValue = val;
        $$('.sidebar-btn').forEach(b => b.classList.remove('active'));
        $$('.cat-item').forEach(b => b.classList.remove('active'));
        $$('.tag-item').forEach(b => b.classList.remove('active'));

        if (type === 'all') { const b = document.querySelector('.sidebar-btn[data-filter="all"]'); if (b) b.classList.add('active'); }
        else if (type === 'favorites') { const b = document.querySelector('.sidebar-btn[data-filter="favorites"]'); if (b) b.classList.add('active'); }
        else if (type === 'category') { const b = document.querySelector('.cat-item[data-cat="' + CSS.escape(val) + '"]'); if (b) b.classList.add('active'); }
        else if (type === 'tag') { const b = document.querySelector('.tag-item[data-tag="' + CSS.escape(val) + '"]'); if (b) b.classList.add('active'); }
        renderAll();
    }

    // ==================== 渲染 ====================
    function renderAll() {
        renderSidebar();
        renderNotes();
    }

    function renderSidebar() {
        syncCategories();
        if (D.countAll) D.countAll.textContent = notes.length;
        if (D.countFav) D.countFav.textContent = notes.filter(n => n.favorite).length;

        // 分类
        const catCounts = {};
        notes.forEach(n => { const c = n.category || '无分类'; catCounts[c] = (catCounts[c]||0) + 1; });

        let catHtml = '<button class="cat-item' + (filterType==='category'&&filterValue==='__none__'?' active':'') + '" data-cat="__none__">📂 无分类<span class="cat-count">' + (catCounts['无分类']||0) + '</span><span class="cat-del" data-cat="__none__" style="visibility:hidden;">×</span></button>';
        const allCats = [...new Set([...categories, ...Object.keys(catCounts).filter(c => c !== '无分类')])];
        allCats.forEach(c => {
            catHtml += '<button class="cat-item' + (filterType==='category'&&filterValue===c?' active':'') + '" data-cat="' + escAttr(c) + '">📂 ' + escHtml(c) + '<span class="cat-count">' + (catCounts[c]||0) + '</span><span class="cat-del" data-cat="' + escAttr(c) + '">×</span></button>';
        });
        D.categoryList.innerHTML = catHtml;

        // 标签云
        const tagCounts = {};
        notes.forEach(n => { (n.tags||[]).forEach(t => { tagCounts[t] = (tagCounts[t]||0) + 1; }); });
        const sorted = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]);
        D.tagCloud.innerHTML = sorted.map(([t,c]) => '<span class="tag-item' + (filterType==='tag'&&filterValue===t?' active':'') + '" data-tag="' + escAttr(t) + '">' + escHtml(t) + ' (' + c + ')</span>').join('');
    }

    function renderNotes() {
        const filtered = getFiltered();
        if (D.noteCount) D.noteCount.textContent = filtered.length + ' / ' + notes.length + ' 条';
        if (D.statusStats) D.statusStats.textContent = '共 ' + notes.length + ' 条笔记';
        if (D.statusFilter) {
            const labels = { all: '全部笔记', favorites: '⭐ 收藏夹', category: '分类: ' + (filterValue === '__none__' ? '无分类' : filterValue), tag: '标签: #' + filterValue };
            D.statusFilter.textContent = '筛选：' + (labels[filterType] || '全部笔记');
        }

        if (filtered.length === 0) {
            D.emptyState.classList.remove('hidden'); D.noteGrid.classList.add('hidden');
            const sub = D.emptyState.querySelector('.empty-subtitle');
            if (sub) sub.textContent = notes.length === 0 ? '点击「✏️ 新建笔记」开始记录' : '没有匹配的笔记，尝试调整筛选条件';
            return;
        }

        D.emptyState.classList.add('hidden'); D.noteGrid.classList.remove('hidden');
        D.noteGrid.classList.toggle('list-view', currentView === 'list');

        D.noteGrid.innerHTML = filtered.map(n => {
            const cat = n.category ? '<span class="card-cat">📂 ' + escHtml(n.category) + '</span>' : '';
            const tags = (n.tags||[]).slice(0,4).map(t => '<span class="card-tag">#' + escHtml(t) + '</span>').join('');
            return '<article class="note-card" data-id="' + n.id + '">' +
                '<button class="card-fav' + (n.favorite?' active':'') + '" data-id="' + n.id + '">⭐</button>' +
                cat + '<h3 class="card-title">' + escHtml(n.title) + '</h3>' +
                '<p class="card-preview">' + escHtml(preview(n.content, 150)) + '</p>' +
                (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
                '<div class="card-meta"><span>🕐 ' + fmtDate(n.updatedAt) + '</span>' +
                '<span class="card-actions"><button class="rinui-btn flat small card-edit" data-id="' + n.id + '">✏️</button><button class="rinui-btn flat small card-del" data-id="' + n.id + '">🗑️</button></span></div>' +
                '</article>';
        }).join('');

        bindCardEvents();
    }

    function bindCardEvents() {
        D.noteGrid.querySelectorAll('.note-card').forEach(card => {
            card.addEventListener('click', function(e) {
                if (e.target.closest('button')) return;
                openDetail(this.dataset.id);
            });
        });
        D.noteGrid.querySelectorAll('.card-fav').forEach(b => {
            b.addEventListener('click', function(e) { e.stopPropagation(); toggleFav(this.dataset.id); });
        });
        D.noteGrid.querySelectorAll('.card-edit').forEach(b => {
            b.addEventListener('click', function(e) { e.stopPropagation(); openEditor(this.dataset.id); });
        });
        D.noteGrid.querySelectorAll('.card-del').forEach(b => {
            b.addEventListener('click', function(e) { e.stopPropagation(); confirmDelete(this.dataset.id); });
        });
    }

    // ==================== CRUD ====================
    function openEditor(id) {
        editNoteId = id; previewOn = false;
        syncCategories();
        updateCategorySelect();

        if (id) {
            const n = notes.find(x => x.id === id);
            if (!n) return;
            D.noteModalTitle.textContent = '✏️ 编辑笔记';
            D.noteId.value = n.id; D.noteTitle.value = n.title;
            D.noteCategory.value = n.category || ''; D.noteContent.value = n.content;
            D.noteTags.value = (n.tags||[]).join(', ');
            D.favToggleBtn.textContent = n.favorite ? '⭐' : '☆';
        } else {
            D.noteModalTitle.textContent = '✏️ 新建笔记';
            D.noteId.value = ''; D.noteTitle.value = ''; D.noteCategory.value = '';
            D.noteContent.value = ''; D.noteTags.value = '';
            D.favToggleBtn.textContent = '☆';
        }
        D.contentPreview.classList.add('hidden'); D.noteContent.classList.remove('hidden');
        D.previewToggle.textContent = '👁 预览';
        updateNoteCharCount();
        openModal('noteModal');
        setTimeout(() => D.noteTitle.focus(), 150);
    }

    function saveNote() {
        const id = D.noteId.value;
        const title = D.noteTitle.value.trim();
        const category = D.noteCategory.value;
        const content = D.noteContent.value.trim();
        const tags = D.noteTags.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);

        if (!title) { toast('请输入标题', 'error'); D.noteTitle.focus(); return; }

        const now = new Date().toISOString();
        if (id) {
            const n = notes.find(x => x.id === id);
            if (n) { n.title = title; n.category = category; n.content = content; n.tags = tags; n.updatedAt = now; }
        } else {
            notes.unshift({ id: uid(), title, category, content, tags, createdAt: now, updatedAt: now, favorite: false });
        }
        if (category && !categories.includes(category)) { categories.push(category); saveCategories(); }
        saveNotes(); closeModal('noteModal'); renderAll();
        toast(id ? '笔记已更新' : '笔记已创建', 'success');
    }

    function toggleFav(id) {
        const n = notes.find(x => x.id === id);
        if (!n) return;
        n.favorite = !n.favorite; n.updatedAt = new Date().toISOString();
        saveNotes(); renderAll();
    }

    function confirmDelete(id) {
        deleteTargetId = id;
        const n = notes.find(x => x.id === id);
        D.confirmMessage.textContent = '确定要删除「' + (n ? n.title : '') + '」吗？此操作不可撤销！';
        openModal('confirmModal');
    }

    function deleteNote() {
        if (!deleteTargetId) return;
        notes = notes.filter(n => n.id !== deleteTargetId);
        saveNotes(); closeModal('confirmModal'); closeModal('detailModal');
        renderAll(); toast('笔记已删除', 'info');
        deleteTargetId = null;
    }

    function openDetail(id) {
        const n = notes.find(x => x.id === id);
        if (!n) return;
        detailNoteId = id;
        D.detailTitle.textContent = n.title;
        D.detailMeta.innerHTML = (n.category ? '📂 ' + escHtml(n.category) + ' | ' : '') + '🕐 ' + fmtDate(n.createdAt) + ' | 更新: ' + fmtDate(n.updatedAt) + (n.favorite ? ' | ⭐' : '');
        D.detailContent.innerHTML = md2html(n.content);
        D.detailTags.innerHTML = (n.tags||[]).map(t => '<span style="display:inline-block;padding:4px 10px;background:#0f3460;color:#80b0e0;font-size:11px;border-radius:11px;margin:2px;font-family:JetBrains Mono,monospace;">#' + escHtml(t) + '</span>').join('');
        openModal('detailModal');
    }

    // ==================== 分类 ====================
    function updateCategorySelect() {
        if (!D.noteCategory) return;
        const v = D.noteCategory.value;
        D.noteCategory.innerHTML = '<option value="">无分类</option>' + categories.map(c => '<option value="' + escAttr(c) + '"' + (c===v?' selected':'') + '>' + escHtml(c) + '</option>').join('');
    }

    function addCategory() {
        const name = prompt('新建分类名称：');
        if (!name || !name.trim()) return;
        const t = name.trim();
        if (categories.includes(t)) { toast('分类已存在', 'info'); return; }
        categories.push(t); saveCategories(); updateCategorySelect();
        D.noteCategory.value = t; toast('分类「' + t + '」已创建', 'success');
    }

    // ==================== 编辑器 ====================
    function applyMarkdown(action) {
        const ta = D.noteContent;
        const start = ta.selectionStart, end = ta.selectionEnd;
        const text = ta.value, sel = text.substring(start, end);
        let rep = '', off = 0;
        switch (action) {
            case 'bold': rep = '**' + (sel||'文字') + '**'; off = sel ? 0 : -2; break;
            case 'italic': rep = '*' + (sel||'文字') + '*'; off = sel ? 0 : -1; break;
            case 'heading': rep = '\n## ' + (sel||'标题'); break;
            case 'code': rep = sel.includes('\n') ? '\n```\n' + sel + '\n```\n' : '`' + (sel||'代码') + '`'; off = sel ? 0 : -1; break;
            case 'list': rep = '\n- ' + (sel||'列表项'); break;
            case 'link': rep = '[' + (sel||'链接') + '](url)'; break;
        }
        ta.value = text.substring(0, start) + rep + text.substring(end);
        ta.focus();
        const np = start + rep.length + off;
        ta.setSelectionRange(np, np);
        updateNoteCharCount();
    }

    function togglePreview() {
        previewOn = !previewOn;
        if (previewOn) {
            D.noteContent.classList.add('hidden'); D.contentPreview.classList.remove('hidden');
            D.contentPreview.innerHTML = md2html(D.noteContent.value);
            D.previewToggle.textContent = '✏️ 编辑';
        } else {
            D.noteContent.classList.remove('hidden'); D.contentPreview.classList.add('hidden');
            D.previewToggle.textContent = '👁 预览';
        }
    }

    function updateNoteCharCount() {
        if (!D.noteCharCount) return;
        const len = D.noteContent.value.length, max = 50000;
        D.noteCharCount.textContent = len + ' / ' + max;
        D.noteCharCount.className = 'char-count' + (len > max*0.9 ? ' danger' : '') + (len > max*0.7 && len <= max*0.9 ? ' warning' : '');
    }

    // ==================== 导入导出 ====================
    function exportData() {
        const blob = new Blob([JSON.stringify({ version: '1.0', exportedAt: new Date().toISOString(), notes, categories }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'knowflow-' + new Date().toISOString().slice(0,10) + '.json';
        a.click(); URL.revokeObjectURL(a.href);
        toast('已导出', 'success');
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.notes || !Array.isArray(data.notes)) throw new Error('格式错误');
                if (!confirm('导入 ' + data.notes.length + ' 条笔记？选择"确定"合并到当前知识库。')) return;
                const ids = new Set(notes.map(n => n.id));
                data.notes.forEach(n => { if (ids.has(n.id)) n.id = uid(); notes.unshift(n); });
                if (data.categories) data.categories.forEach(c => { if (!categories.includes(c)) categories.push(c); });
                saveNotes(); saveCategories(); syncCategories(); renderAll();
                toast('导入完成', 'success');
            } catch (err) { toast('导入失败：格式不正确', 'error'); }
        };
        reader.onerror = function() { toast('文件读取失败', 'error'); };
        reader.readAsText(file);
    }

    // ==================== 模态框 ====================
    function openModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('hidden'); document.body.style.overflow = 'hidden'; } }
    function closeModal(id) {
        const m = document.getElementById(id); if (!m) return;
        m.classList.add('hidden'); document.body.style.overflow = '';
        if (id === 'noteModal') { editNoteId = null; previewOn = false; }
        if (id === 'confirmModal') deleteTargetId = null;
    }

    // ==================== 事件绑定 ====================
    function bind() {
        // 侧边栏
        $$('.sidebar-btn[data-filter]').forEach(b => {
            b.addEventListener('click', function() { setFilter(this.dataset.filter, this.dataset.filter); });
        });
        D.categoryList.addEventListener('click', function(e) {
            if (e.target.closest('.cat-del')) {
                e.stopPropagation();
                const cat = e.target.closest('.cat-del').dataset.cat;
                if (cat === '__none__') return;
                if (confirm('删除分类「' + cat + '」？笔记不会被删除。')) {
                    categories = categories.filter(c => c !== cat);
                    notes.forEach(n => { if (n.category === cat) n.category = ''; });
                    saveNotes(); saveCategories();
                    if (filterType === 'category' && filterValue === cat) setFilter('all', 'all');
                    else renderAll();
                    toast('分类已删除', 'info');
                }
                return;
            }
            const item = e.target.closest('.cat-item');
            if (item) setFilter('category', item.dataset.cat);
        });
        D.tagCloud.addEventListener('click', function(e) {
            const item = e.target.closest('.tag-item');
            if (item) setFilter('tag', item.dataset.tag);
        });
        D.addCategoryBtn.addEventListener('click', addCategory);
        D.newCategoryInlineBtn.addEventListener('click', addCategory);

        // 搜索
        D.globalSearch.addEventListener('input', debounce(renderAll, 250));
        D.searchClear.addEventListener('click', () => { D.globalSearch.value = ''; D.searchClear.classList.add('hidden'); renderAll(); D.globalSearch.focus(); });
        D.globalSearch.addEventListener('input', function() { D.searchClear.classList.toggle('hidden', !this.value); });

        // 新建
        D.newNoteBtn.addEventListener('click', () => openEditor(null));
        D.emptyNewBtn.addEventListener('click', () => openEditor(null));

        // 视图
        $$('.view-toggle').forEach(b => {
            b.addEventListener('click', function() {
                $$('.view-toggle').forEach(x => x.classList.remove('active'));
                this.classList.add('active'); currentView = this.dataset.view; renderNotes();
            });
        });

        // 导入导出
        D.exportBtn.addEventListener('click', exportData);
        D.importBtn.addEventListener('click', () => D.importFile.click());
        D.importFile.addEventListener('change', function() { if (this.files[0]) importData(this.files[0]); this.value = ''; });

        // 编辑器
        D.saveNoteBtn.addEventListener('click', saveNote);
        D.favToggleBtn.addEventListener('click', function() {
            if (editNoteId) { toggleFav(editNoteId); const n = notes.find(x => x.id === editNoteId); if (n) this.textContent = n.favorite ? '⭐' : '☆'; }
        });
        D.previewToggle.addEventListener('click', togglePreview);
        D.noteContent.addEventListener('input', updateNoteCharCount);
        $$('.tool-btn[data-action]').forEach(b => {
            b.addEventListener('click', function() { applyMarkdown(this.dataset.action); });
        });
        D.noteModal.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveNote(); }
        });

        // 确认删除
        D.confirmDeleteBtn.addEventListener('click', deleteNote);

        // 详情
        D.detailEditBtn.addEventListener('click', () => { closeModal('detailModal'); openEditor(detailNoteId); });
        D.detailDeleteBtn.addEventListener('click', () => { closeModal('detailModal'); confirmDelete(detailNoteId); });

        // 关闭按钮
        $('#closeNoteModal').addEventListener('click', () => closeModal('noteModal'));
        $('#cancelNoteBtn').addEventListener('click', () => closeModal('noteModal'));
        $('#closeConfirmModal').addEventListener('click', () => closeModal('confirmModal'));
        $('#cancelConfirmBtn').addEventListener('click', () => closeModal('confirmModal'));
        $('#closeDetailModal').addEventListener('click', () => closeModal('detailModal'));
        $('#closeDetailBtn').addEventListener('click', () => closeModal('detailModal'));

        // 遮罩
        $$('.modal').forEach(m => m.addEventListener('click', function(e) { if (e.target === m) closeModal(m.id); }));

        // ESC
        window.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (D.detailModal && !D.detailModal.classList.contains('hidden')) closeModal('detailModal');
                else if (D.noteModal && !D.noteModal.classList.contains('hidden')) closeModal('noteModal');
                else if (D.confirmModal && !D.confirmModal.classList.contains('hidden')) closeModal('confirmModal');
            }
        });
    }

    // ==================== 启动 ====================
    function init() { load(); renderAll(); bind(); updateStorageInfo(); }
    window.addEventListener('DOMContentLoaded', init);

})();
