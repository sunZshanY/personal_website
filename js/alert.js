/**
 * Omiaちゃん Blog — 主脚本 v5.0
 * ==============================
 * 背景：雫API (api.imlazy.ink)
 * 数据：data/posts.json（GitHub 托管，每日更新）
 * 留言 & 访客：localStorage 本地存储
 */
(function() {
    'use strict';

    // ========== 常量 ==========
    var IMG_API_WIDE = 'https://api.imlazy.ink/img/';
    var DATA_URL = 'data/posts.json';
    var BG_TICK = 60000;

    var TYPE_LINE = 'Hello My name is Omiaちゃん';
    var TYPE_TICK = 100, TYPE_REST = 3000, TYPE_DEL = 90, TYPE_GAP = 1500;

    // ========== 全局态 ==========
    var g_postHeap = [];
    var g_noteHeap = [];
    var bgLooper = null;

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
        // 博客
        blogList:       $('#blogList'),
        blogEmpty:      $('#blogEmpty'),
        blogSearch:     $('#blogSearch'),
        // 留言板（动态注入到HTML）
        gbAuthor:       null,
        gbContact:      null,
        gbBody:         null,
        gbTally:        null,
        btnPostNote:    null,
        noteWall:       null,
        noteVoid:       null,
        // 状态栏
        visitorCount:   $('#visitorCount')
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
    function _fetchBg() {
        return new Promise(function(ok) {
            var img = new Image();
            var bomb = setTimeout(function(){ img.src=''; ok(null); }, 8000);
            img.onload = function() { clearTimeout(bomb); ok(img.currentSrc||img.src); };
            img.onerror = function() { clearTimeout(bomb); ok(null); };
            img.src = IMG_API_WIDE + '?_t=' + Date.now();
        });
    }

    async function _paintBg() {
        if (!E.bgLayer) return;
        var src = await _fetchBg();
        if (src && !~src.indexOf('data:')) {
            E.bgLayer.style.backgroundImage = "url('"+src+"')";
            E.bgLayer.style.opacity = '1';
        } else if (!E.bgLayer.style.backgroundImage || E.bgLayer.style.backgroundImage === 'none') {
            var fb = ['images/columbina-5k-3840x2160-25922.jpg','images/oshi-no-ko-3840x2160-25261.jpg','images/sparxie-honkai-star-3840x2160-26290.jpg','images/zhuang-fangyi-3840x2160-26226.jpg'];
            E.bgLayer.style.backgroundImage = "url('"+fb[Math.floor(Math.random()*fb.length)]+"')";
            E.bgLayer.style.opacity = '1';
        }
    }

    function _startBgLoop() {
        if (bgLooper) clearInterval(bgLooper);
        _paintBg();
        bgLooper = setInterval(_paintBg, BG_TICK);
    }

    // ========== 数据层 ==========
    // 博客数据：从 data/posts.json 加载（GitHub 托管）
    var BOX_KEY = 'omiblog_z';       // 保留作为缓存
    var NOTE_KEY = 'omi_comments';
    var EYE_KEY = 'kaze_count';
    var EYE_FLAG = 'kaze_flag';

    function _loadPosts() {
        // 最简逻辑：本地有数据优先用，没有则从服务器取
        try {
            var r = localStorage.getItem(BOX_KEY);
            if (r) {
                var parsed = JSON.parse(r);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    g_postHeap = parsed;
                    console.log('📦 使用本地数据（' + parsed.length + ' 篇）');
                    // 后台异步刷新服务器数据
                    fetch(DATA_URL + '?_t=' + Date.now())
                        .then(function(resp){ if(resp.ok) return resp.json() })
                        .then(function(data){ if(data&&Array.isArray(data.posts)){localStorage.setItem(BOX_KEY,JSON.stringify(data.posts))} })
                        .catch(function(){});
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
                if (data && Array.isArray(data.posts)) {
                    g_postHeap = data.posts;
                    try { localStorage.setItem(BOX_KEY, JSON.stringify(g_postHeap)); } catch(e) {}
                } else {
                    throw new Error('Invalid format');
                }
            })
            .catch(function(err) {
                console.warn('⚠️ 无法加载 data/posts.json:', err.message);
                g_postHeap = [];
            });
    }

    function _loadNotes() {
        try { var r=localStorage.getItem(NOTE_KEY); g_noteHeap=r?JSON.parse(r):[]; }
        catch(e){ g_noteHeap=[]; }
    }
    function _dumpNotes() { try{localStorage.setItem(NOTE_KEY,JSON.stringify(g_noteHeap));}catch(e){_pop('存储不足','error');} }

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
        if(id==='blogDetailModal'){ E.detailTitle.textContent='';E.detailContent.innerHTML='';E.detailTags.innerHTML='';E.detailImgWrap.innerHTML='';E.detailImgWrap.classList.add('hidden');watchingId=null; }
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
                if(tid==='guestbook')_paintNotes();
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

    // ========== 留言板 ==========
    function _buildGuestbookPanel() {
        // 动态注入留言板面板到 #friends 的位置（替换友链占位）
        var friendsPanel = $('#friends');
        if (!friendsPanel) return;

        // 替换友链面板为留言板
        friendsPanel.id = 'guestbook';
        friendsPanel.setAttribute('aria-labelledby', 'gbHeading');
        friendsPanel.innerHTML = '<h2 class="panel-title" id="gbHeading" style="text-align:center">💬 留言板</h2>'
            + '<div class="gb-write">'
            + '<div class="form-row dual">'
            + '<div class="form-field"><label for="gbAuthor">昵称 *</label><input type="text" id="gbAuthor" placeholder="你的昵称" maxlength="30" required></div>'
            + '<div class="form-field"><label for="gbContact">联系方式（选填）</label><input type="text" id="gbContact" placeholder="QQ / 邮箱 / GitHub" maxlength="60"></div>'
            + '</div>'
            + '<div class="form-field"><label for="gbBody">留言内容 *</label><textarea id="gbBody" rows="4" placeholder="说点什么吧～" maxlength="800"></textarea><span class="char-count" id="gbTally">0 / 800</span></div>'
            + '<button type="button" id="btnPostNote" class="rinui-btn primary">📝 提交留言</button>'
            + '</div>'
            + '<div id="noteWall" class="note-wall"></div>'
            + '<div id="noteVoid" class="empty-state"><span class="empty-icon">💭</span><p class="empty-title">暂无留言</p><p class="empty-subtitle">成为第一个留言的人吧～</p></div>';

        // 更新侧栏友链按钮为留言板
        var friendsBtn = document.querySelector('.sidebar-btn[data-panel="friends"]');
        if (friendsBtn) {
            friendsBtn.dataset.panel = 'guestbook';
            friendsBtn.textContent = ' 留言';
            friendsBtn.classList.remove('disabled');
            friendsBtn.removeAttribute('disabled');
        }

        // 重新缓存留言相关的DOM引用
        E.gbAuthor = $('#gbAuthor');
        E.gbContact = $('#gbContact');
        E.gbBody = $('#gbBody');
        E.gbTally = $('#gbTally');
        E.btnPostNote = $('#btnPostNote');
        E.noteWall = $('#noteWall');
        E.noteVoid = $('#noteVoid');
    }

    function _submitNote() {
        if (!E.gbAuthor || !E.gbBody) return;
        var nick = E.gbAuthor.value.trim();
        var contact = E.gbContact ? E.gbContact.value.trim() : '';
        var msg = E.gbBody.value.trim();

        if (!nick || nick.length < 2) { _pop('昵称至少需要2个字哦～','error'); E.gbAuthor.focus(); return; }
        if (!msg) { _pop('说点什么吧～','error'); E.gbBody.focus(); return; }

        var lastTs = 0;
        g_noteHeap.forEach(function(n){ if(n.nick===nick&&n.ts>lastTs)lastTs=n.ts; });
        if (Date.now() - lastTs < 30000) { _pop('发得太快了，过30秒再来吧～','error'); return; }

        var cid = g_noteHeap.length ? Math.max.apply(null, g_noteHeap.map(function(n){ return n.cid; })) + 1 : 1;
        var note = { cid: cid, nick: nick, msg: msg, contact: contact, ts: Date.now(), star: 0 };
        g_noteHeap.unshift(note);
        _dumpNotes(); _paintNotes();
        E.gbBody.value = '';
        if(E.gbTally)E.gbTally.textContent = '0 / 800';
        E.gbAuthor.value = '';
        if(E.gbContact)E.gbContact.value = '';
        _pop('留言成功！感谢你的支持～','success');
    }

    function _paintNotes() {
        if (!E.noteWall) return;
        E.noteWall.innerHTML = '';
        if (!g_noteHeap.length) { if(E.noteVoid)E.noteVoid.style.display=''; return; }
        if(E.noteVoid)E.noteVoid.style.display='none';

        g_noteHeap.forEach(function(n){
            var slab = document.createElement('div');
            slab.className = 'note-slab' + (n.star ? ' is-starred' : '');
            var timeStr = new Date(n.ts).toLocaleString('zh-CN');
            var starIcon = n.star ? ' ⭐' : '';
            var avatarHTML = n.avatar
                ? '<img src="' + _safeAttr(n.avatar) + '" alt="" class="note-avatar" loading="lazy" onerror="this.style.display=\'none\'">'
                : '<span class="note-avatar" style="display:inline-flex;align-items:center;justify-content:center;font-size:14px;color:var(--rinui-tag-text)">' + _safeHTML(n.nick.charAt(0).toUpperCase()) + '</span>';
            var contactHTML = n.contact ? '<div class="note-contact">📬 ' + _safeHTML(n.contact) + '</div>' : '';
            var ghLink = n.githubUser ? ' <a href="https://github.com/' + _safeAttr(n.githubUser) + '" target="_blank" rel="noopener noreferrer" class="note-gh-link" title="GitHub 主页">🐙</a>' : '';
            slab.innerHTML = '<div class="note-top"><div class="note-top-left">' + avatarHTML + '<span class="note-author">' + _safeHTML(n.nick) + starIcon + ghLink + '</span></div><span class="note-time">' + timeStr + '</span></div>'
                + '<div class="note-body">' + _safeHTML(n.msg) + '</div>' + contactHTML;
            E.noteWall.appendChild(slab);
        });
    }

    function _updateTallyNote() { if(E.gbTally){E.gbTally.textContent=E.gbBody.value.length+' / 800';} }

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
            case NOTE_KEY: _loadNotes(); _paintNotes(); break;
            case EYE_KEY: _eyeShow(null); break;
        }
    }

    // ========== 事件绑线 ==========
    function _wireItUp() {
        _wireNav();

        E.blogSearch.addEventListener('input', _debounce(_paintPosts, 300));
        E.blogList.addEventListener('click', _cardClick);
        E.detailShareBtn.addEventListener('click', function(){
            if(!watchingId)return;
            var link=location.origin+location.pathname.replace(/[^/]*$/,'')+'read.html?post='+watchingId;
            navigator.clipboard.writeText(link).then(function(){_pop('链接已复制','success');}).catch(function(){_pop('复制失败','error');});
        });
        $$('.modal').forEach(function(m){ m.addEventListener('click', _backdropClick); });

        // 留言板事件 (在 _buildGuestbookPanel 之后绑定)
        if (E.btnPostNote) E.btnPostNote.addEventListener('click', _submitNote);
        if (E.gbBody) E.gbBody.addEventListener('input', _updateTallyNote);

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
        _loadNotes();
        _buildGuestbookPanel(); // 动态构建留言板
        _paintNotes();
        _eyeBump();
        _wireItUp();

        // 加载博客数据（从 JSON 文件）
        await _loadPosts();
        _paintPosts();
    }

    window.addEventListener('DOMContentLoaded', async function() {
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
