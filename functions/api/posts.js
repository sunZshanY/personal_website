/**
 * POST /api/posts
 * ===============
 * 纯 TXT 提交博客入口（管理面板专用）。
 *
 * TXT 格式（推荐带头部）：
 *   ---
 *   title: 文章标题
 *   date: 2026-08-15
 *   tags: 标签1, 标签2
 *   images: images/xx.jpg（可选）
 *   ---
 *   正文……
 *
 * 也可以不带头部：第一行作为标题，其余为正文。
 *
 * 流程：
 *   1. 校验 X-Admin-Auth
 *   2. 解析 TXT → post 对象
 *   3. 写入 KV（blog:posts / blog:main）→ 网站即时生效
 *   4. 通过 GitHub Contents API 更新仓库 data/posts.json 与 main.json
 *      → 触发 Cloudflare Pages 自动部署，仓库与线上保持一致
 */

const ADMIN_AUTH_SECRET = 'omia_admin_2024';
const KV_POSTS_KEY = 'blog:posts';
const KV_MAIN_KEY = 'blog:main';
const GH_OWNER = 'sunZshanY';
const GH_REPO = 'personal_website';
const GH_BRANCH = 'main';

export async function onRequestPost(context) {
  const { request, env } = context;

  if ((request.headers.get('X-Admin-Auth') || '') !== ADMIN_AUTH_SECRET) {
    return _json({ ok: false, error: '未授权' }, 401);
  }

  let body = '';
  try { body = await request.text(); } catch (e) {}

  let post = null;
  let txt = body;
  // 兼容两种提交：纯 TXT 文本，或 { txt: "..." } / 完整 post 对象的 JSON
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && (parsed.txt || parsed.title)) {
      if (typeof parsed.txt === 'string') {
        txt = parsed.txt;
      } else {
        post = parsed;
        txt = '';
      }
    }
  } catch (e) {}

  try {
    if (!post) post = parseTxt(txt);
    validatePost(post);
  } catch (err) {
    return _json({ ok: false, error: err.message }, 400);
  }

  // 当前文章：KV 优先（可能有未部署的提交），其次拉取站点静态文件
  const current = await loadCurrentPosts(env, request);
  const posts = current.posts.slice();
  const maxId = posts.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  post.id = maxId + 1;
  posts.push(post);

  const updatedAt = new Date().toISOString();
  const dataJson = {
    version: '5.1',
    updatedAt,
    logo: current.logo || 'images/images1.jpg',
    posts
  };
  const mainJson = { version: '5.1', updatedAt, posts: posts.map(summarize) };

  // 1) KV → 网站即时更新
  try {
    await env.VISITOR_STORE.put(KV_POSTS_KEY, JSON.stringify(dataJson));
    await env.VISITOR_STORE.put(KV_MAIN_KEY, JSON.stringify(mainJson));
  } catch (e) {
    return _json({ ok: false, error: 'KV 写入失败: ' + e.message }, 500);
  }

  // 2) GitHub → 自动部署
  const token = env.GITHUB_TOKEN || (request.headers.get('X-GitHub-Token') || '').trim();
  let github = null;
  let warning = '';
  if (token) {
    try {
      await pushToGitHub(token, 'data/posts.json', JSON.stringify(dataJson, null, 2), '发布博文：' + post.title);
      await pushToGitHub(token, 'main.json', JSON.stringify(mainJson, null, 2), '发布博文：' + post.title + '（摘要）');
      github = { pushed: true, files: ['data/posts.json', 'main.json'], repo: GH_OWNER + '/' + GH_REPO };
    } catch (err) {
      warning = err.message;
      github = { pushed: false };
    }
  } else {
    warning = '未配置 GitHub Token：网站数据已更新，但仓库尚未同步';
  }

  return _json({
    ok: true,
    post,
    count: posts.length,
    data: dataJson,
    github,
    warning: warning || undefined
  });
}

// ==================== 工具 ====================

function _json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function validatePost(p) {
  if (!p || typeof p !== 'object') throw new Error('文章格式错误');
  if (!p.title || !String(p.title).trim()) throw new Error('缺少 title');
  if (!p.content || !String(p.content).trim()) throw new Error('正文为空');
  p.title = String(p.title).trim();
  p.content = String(p.content).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) p.date = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(p.tags)) p.tags = [];
  p.tags = p.tags.map(t => String(t).trim()).filter(Boolean);
}

/**
 * 解析 TXT：
 *  - 带 --- 头部：解析 title/date/tags/images
 *  - 无头部：首行作为标题，其余为正文
 */
export function parseTxt(txt) {
  if (typeof txt !== 'string' || !txt.replace(/^\uFEFF/, '').trim()) {
    throw new Error('内容为空');
  }
  txt = txt.replace(/^\uFEFF/, '');
  const m = txt.match(/^\s*---+\s*\r?\n([\s\S]*?)\r?\n---+\s*(?:\r?\n)?([\s\S]*)$/);
  const meta = {};
  let content;

  if (m) {
    content = (m[2] || '').trim();
    for (const line of m[1].split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) meta[k] = v;
    }
  } else {
    const lines = txt.trim().split(/\r?\n/);
    const first = (lines.shift() || '').replace(/^#+\s*/, '').trim();
    if (!first) throw new Error('内容为空');
    meta.title = first;
    content = lines.join('\n').trim();
    if (!content) throw new Error('正文为空');
  }

  if (!meta.title) throw new Error('缺少 title（请在头部填写或首行写标题）');
  if (!content) throw new Error('正文为空');

  const post = {
    title: meta.title,
    date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') ? meta.date : new Date().toISOString().slice(0, 10),
    content
  };
  const tags = (meta.tags || '').split(/[,，]/).map(t => t.trim()).filter(Boolean);
  if (tags.length) post.tags = tags;
  if (meta.images || meta.image) post.images = meta.images || meta.image;
  return post;
}

function excerpt(content, maxLen) {
  if (!content) return '';
  const firstPara = content.split('\n').filter(p => p.trim())[0] || content;
  if (firstPara.length <= maxLen) return firstPara;
  return firstPara.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function summarize(p) {
  const out = { id: p.id, title: p.title, date: p.date, content: excerpt(p.content, 150) };
  if (Array.isArray(p.tags) && p.tags.length) out.tags = p.tags;
  if (p.images) out.images = p.images;
  return out;
}

async function loadCurrentPosts(env, request) {
  try {
    const cached = await env.VISITOR_STORE.get(KV_POSTS_KEY, 'json');
    if (cached && Array.isArray(cached.posts)) return cached;
  } catch (e) {}

  try {
    const url = new URL(request.url);
    const res = await fetch(url.origin + '/data/posts.json?_t=' + Date.now(), { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.posts)) return data;
    }
  } catch (e) {}

  return { version: '5.1', logo: 'images/images1.jpg', posts: [] };
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function pushToGitHub(token, path, content, message) {
  const api = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + encodeURIComponent(path);
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'omia-blog-admin'
  };

  const cur = await fetch(api + '?ref=' + GH_BRANCH, { headers });
  if (!cur.ok) throw new Error('GitHub 读取失败（' + path + '）: HTTP ' + cur.status);
  const info = await cur.json();

  const put = await fetch(api, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify({
      message,
      content: b64encode(content),
      sha: info.sha,
      branch: GH_BRANCH
    })
  });
  if (!put.ok) {
    const e = await put.json().catch(() => ({}));
    throw new Error('GitHub 提交失败（' + path + '）: HTTP ' + put.status + (e.message ? ' ' + e.message : ''));
  }
}
