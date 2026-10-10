/**
 * GET /api/visitors/online
 * ==========================
 * Called by the admin panel to fetch currently online visitors.
 * Requires X-Admin-Auth header for basic protection.
 * Polling interval: 3–5 seconds from admin panel.
 */

import { getOnlineVisitors } from './_utils';

export async function onRequestGet(context) {
  const { request, env } = context;

  // Shared secret — must match the one in admin panel（从环境变量读取）
  const ADMIN_AUTH_SECRET = env.ADMIN_AUTH_SECRET || '';

  // Basic auth check
  const authHeader = request.headers.get('X-Admin-Auth');
  if (!ADMIN_AUTH_SECRET || authHeader !== ADMIN_AUTH_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const visitors = await getOnlineVisitors(env);

    return new Response(JSON.stringify({
      online: visitors.length,
      visitors: visitors,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error', online: 0, visitors: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
