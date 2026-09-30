// public/js/core/http.js
// Cliente HTTP + estado "despertando servidor" (Render/Vercel cold start)

class ServerStatus extends EventTarget {
  constructor() {
    super();
    this._pending = 0;
    this._waking = false;
    this._timer = null;
  }

  _bump(delta) {
    this._pending = Math.max(0, this._pending + delta);
    if (this._pending > 0 && !this._waking) {
      // Solo mostrar banner si la petición tarda > 800ms
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        if (this._pending > 0 && !this._waking) {
          this._waking = true;
          this.dispatchEvent(new Event('waking'));
        }
      }, 800);
    }
    if (this._pending === 0) {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      if (this._waking) {
        this._waking = false;
        this.dispatchEvent(new Event('awake'));
      }
    }
  }

  track(promise) {
    this._bump(1);
    return Promise.resolve(promise).finally(() => this._bump(-1));
  }
}

export const serverStatus = new ServerStatus();

function buildUrl(path, params = {}) {
  let p = String(path || '');
  if (!p.startsWith('/api') && !p.startsWith('http')) {
    p = '/api' + (p.startsWith('/') ? p : '/' + p);
  }
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== '') q.set(k, String(v));
  });
  const qs = q.toString();
  return qs ? p + '?' + qs : p;
}

export async function get(path, params = {}) {
  const url = buildUrl(path, params);
  const req = (async () => {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  })();
  return serverStatus.track(req);
}

export async function post(path, body = {}, params = {}) {
  const url = buildUrl(path, params);
  const req = (async () => {
    const res = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  })();
  return serverStatus.track(req);
}
