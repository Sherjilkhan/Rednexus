const raw = (window.__API_BASE__ || '').trim();
export const API_BASE = raw.startsWith('__') || raw === '' ? 'http://localhost:3001' : raw;

let token = null;
try {
  token = sessionStorage.getItem('rs_token');
} catch {
  /* sandboxed iframes block storage — fall back to in-memory only */
}

export function setToken(next) {
  token = next;
  try {
    if (next) sessionStorage.setItem('rs_token', next);
    else sessionStorage.removeItem('rs_token');
  } catch {
    /* ignore */
  }
}
export const getToken = () => token;

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.status === 401 && token) {
    // A stale session (e.g. the API restarted with fresh demo data) must not leave
    // the user stranded on a role surface they can no longer load.
    setToken(null);
    if (!location.hash.startsWith('#/login')) location.hash = '#/login';
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.details = data?.details || null;
    err.status = res.status;
    throw err;
  }
  return data;
}
