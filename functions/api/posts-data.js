/**
 * GET /api/posts-data
 * ===================
 * 主站博客数据源：优先返回 KV 中的最新数据（管理面板提交后即时生效），
 * KV 为空时回退到静态 data/posts.json 并写入 KV。
 */

const KV_POSTS_KEY = 'blog:posts';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    const cached = await env.VISITOR_STORE.get(KV_POSTS_KEY, 'json');
    if (cached && Array.isArray(cached.posts)) {
      return new Response(JSON.stringify(cached), { status: 200, headers });
    }
  } catch (e) {}

  try {
    const url = new URL(request.url);
    const res = await fetch(url.origin + '/data/posts.json?_t=' + Date.now(), { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.posts)) {
        try { await env.VISITOR_STORE.put(KV_POSTS_KEY, JSON.stringify(data)); } catch (e) {}
        return new Response(JSON.stringify(data), { status: 200, headers });
      }
    }
  } catch (e) {}

  return new Response(JSON.stringify({ version: '5.1', posts: [] }), { status: 200, headers });
}
