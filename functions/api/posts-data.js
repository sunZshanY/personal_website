/**
 * GET /api/posts-data
 * ===================
 * 主站博客数据源：KV（管理面板提交后即时生效）与静态 data/posts.json 双源比对，
 * 以文章数更多者为准（相同则取 updatedAt 更新者），静态更新时回写 KV，
 * 避免旧 KV 快照长期盖过部署上来的新静态数据。
 */

const KV_POSTS_KEY = 'blog:posts';

export async function onRequestGet(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  let cached = null;
  try {
    const value = await env.VISITOR_STORE.get(KV_POSTS_KEY, 'json');
    if (value && Array.isArray(value.posts)) cached = value;
  } catch (e) {}

  let staticData = null;
  try {
    const url = new URL(request.url);
    const res = await fetch(url.origin + '/data/posts.json?_t=' + Date.now(), { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.posts)) staticData = data;
    }
  } catch (e) {}

  let data = cached || staticData || null;
  if (cached && staticData) {
    const cacheCount = cached.posts.length;
    const staticCount = staticData.posts.length;
    const staticNewer = !cached.updatedAt || !staticData.updatedAt || staticData.updatedAt > cached.updatedAt;
    if (staticCount > cacheCount || (staticCount === cacheCount && staticNewer)) {
      data = staticData;
    }
  }

  if (data) {
    if (data !== cached) {
      try { await env.VISITOR_STORE.put(KV_POSTS_KEY, JSON.stringify(data)); } catch (e) {}
    }
    return new Response(JSON.stringify(data), { status: 200, headers });
  }

  return new Response(JSON.stringify({ version: '5.1', posts: [] }), { status: 200, headers });
}
