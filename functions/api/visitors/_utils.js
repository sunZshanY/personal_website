/**
 * Visitor tracking — shared KV utilities
 * =======================================
 * KV key: visitor:{sessionId}
 * TTL: 300s (5 min without heartbeat = offline)
 */

const KV_PREFIX = 'visitor:';
const HEARTBEAT_TTL = 300; // seconds

export function getVisitorKey(sessionId) {
  return KV_PREFIX + sessionId;
}

/**
 * Record or refresh a visitor heartbeat.
 * Returns the stored entry.
 */
export async function recordHeartbeat(env, sessionId, data) {
  const key = getVisitorKey(sessionId);
  const existing = await env.VISITOR_STORE.get(key, 'json');

  const now = Date.now();
  const entry = {
    sessionId,
    ip: data.ip || '未知',
    country: data.country || '未知',
    userAgent: data.userAgent || '未知',
    page: data.page || '/',
    referrer: data.referrer || '',
    firstSeen: existing ? existing.firstSeen : now,
    lastSeen: now,
  };

  await env.VISITOR_STORE.put(key, JSON.stringify(entry), {
    expirationTtl: HEARTBEAT_TTL
  });

  return entry;
}

/**
 * Fetch all currently online visitors (keys that haven't expired).
 * Sorted by lastSeen descending.
 */
export async function getOnlineVisitors(env) {
  const list = await env.VISITOR_STORE.list({ prefix: KV_PREFIX });
  const visitors = [];

  for (const key of list.keys) {
    const data = await env.VISITOR_STORE.get(key.name, 'json');
    if (data) {
      visitors.push(data);
    }
  }

  // Sort by lastSeen descending (most recent first)
  visitors.sort((a, b) => b.lastSeen - a.lastSeen);

  return visitors;
}

/**
 * Simplify a User-Agent string to just browser name.
 */
export function simplifyUA(ua) {
  if (!ua) return '未知';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  // Mobile apps / other
  if (ua.includes('Mobile')) return 'Mobile';
  return ua.split('/')[0].split(' ')[0] || '未知';
}
