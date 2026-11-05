const supabase = require('./supabase');

const EVENT_TYPES = ['challenge_assigned', 'assignment_assigned', 'challenge_due', 'assignment_due', 'event_scheduled', 'class_post'];
const ENTITY_TYPES = ['challenge_assignment', 'assignment', 'schedule_event', 'class_post'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const FEED_COLUMNS = 'id, type, entity_type, entity_id, child_id, title, body, data, actor_role, created_at, read_at';

// Structured, PII-free log line: ids and counts only, never emails, names or titles.
function logEvent(fields) {
  console.log(JSON.stringify({ svc: 'messages', ...fields }));
}

function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') return 'event must be an object';
  if (!EVENT_TYPES.includes(evt.type)) return `unknown type: ${evt.type}`;
  if (!ENTITY_TYPES.includes(evt.entity_type)) return `unknown entity_type: ${evt.entity_type}`;
  if (!evt.entity_id || typeof evt.entity_id !== 'string') return 'entity_id required';
  if (!evt.version || !Number.isFinite(Date.parse(evt.version))) return 'version must be a timestamp';
  if (!evt.title || !String(evt.title).trim()) return 'title required';
  if (!Array.isArray(evt.student_ids) || evt.student_ids.length === 0) return 'student_ids must be a non-empty array';
  if (!evt.student_ids.every(id => UUID_RE.test(String(id)))) return 'student_ids must be uuids';
  return null;
}

// Never throws: producers call this after their domain write and must not fail on it.
async function createNotificationEvent(evt) {
  const invalid = validateEvent(evt);
  if (invalid) {
    logEvent({ evt: 'notification.create', ok: false, type: evt?.type, entity: evt?.entity_id, reason: invalid });
    return { ok: false, error: invalid };
  }
  const { data, error } = await supabase.rpc('notify_event', { p_event: evt });
  if (error) {
    logEvent({ evt: 'notification.create', ok: false, type: evt.type, entity: evt.entity_id, reason: error.message });
    return { ok: false, error: error.message };
  }
  const inserted = data?.inserted ?? [];
  logEvent({
    evt: 'notification.create', ok: true, type: evt.type, entityType: evt.entity_type, entity: evt.entity_id,
    eventKey: data?.eventKey, recipients: data?.recipients ?? 0, inserted: inserted.length,
    duplicates: data?.duplicates ?? 0, orphanParentLinks: data?.orphanParentLinks ?? 0,
    notificationIds: inserted.map(r => r.id),
  });
  return {
    ok: true, eventKey: data?.eventKey, recipients: data?.recipients ?? 0, inserted,
    duplicates: data?.duplicates ?? 0, orphanParentLinks: data?.orphanParentLinks ?? 0,
  };
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ c: row.created_at, i: row.id })).toString('base64url');
}

// Returns null for anything malformed so the route can answer 400.
function decodeCursor(raw) {
  try {
    const { c, i } = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (typeof c !== 'string' || !Number.isFinite(Date.parse(c)) || !UUID_RE.test(String(i))) return null;
    return { c, i };
  } catch {
    return null;
  }
}

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function toApi(row) {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    childId: row.child_id,
    title: row.title,
    body: row.body,
    data: row.data || {},
    actorRole: row.actor_role,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

async function listNotifications(userId, { limit = DEFAULT_LIMIT, cursor = null, unreadOnly = false } = {}) {
  let q = supabase
    .from('notifications')
    .select(FEED_COLUMNS)
    .eq('recipient_id', userId);
  if (unreadOnly) q = q.is('read_at', null);
  // Keyset: strictly after the cursor in (created_at desc, id desc) order.
  if (cursor) q = q.or(`created_at.lt."${cursor.c}",and(created_at.eq."${cursor.c}",id.lt.${cursor.i})`);
  q = q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = data || [];
  const page = rows.slice(0, limit);
  return {
    items: page.map(toApi),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

async function unreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { head: true, count: 'exact' })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (error) throw new Error(error.message);
  return Number.isFinite(count) ? count : 0;
}

// Returns the row (already-read rows are returned unchanged), or null if it isn't this user's.
async function markRead(userId, id) {
  if (!UUID_RE.test(String(id))) return null;
  const { data: updated, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('recipient_id', userId)
    .is('read_at', null)
    .select(FEED_COLUMNS);
  if (error) throw new Error(error.message);
  if (updated && updated.length) return toApi(updated[0]);

  const { data: existing, error: readErr } = await supabase
    .from('notifications')
    .select(FEED_COLUMNS)
    .eq('id', id)
    .eq('recipient_id', userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  return existing ? toApi(existing) : null;
}

async function markAllRead(userId, { type } = {}) {
  let q = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (type) q = q.eq('type', type);
  const { data, error } = await q.select('id');
  if (error) throw new Error(error.message);
  return (data || []).length;
}

module.exports = {
  EVENT_TYPES, ENTITY_TYPES, MAX_LIMIT, DEFAULT_LIMIT,
  validateEvent, createNotificationEvent,
  encodeCursor, decodeCursor, parseLimit, toApi,
  listNotifications, unreadCount, markRead, markAllRead,
  logEvent,
};
