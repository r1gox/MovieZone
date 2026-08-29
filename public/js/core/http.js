// public/js/core/http.js
// Cliente HTTP con paciencia al cold start de Render

const inFlight = new Map();

const COLD_START_TIMEOUT = 75000; // primera carga del día
const NORMAL_TIMEOUT = 20000;     // cuando ya despertó
const WAKE_NOTICE_DELAY = 3500;   // avisar solo si tarda > 3.5s
const RETRIES = 2;
const RETRY_DELAY = 2000;

export const serverStatus = new EventTarget();

let awake = false;
let noticeTimer = null;
let pending = 0;

function announce(type, detail = {}) {
  serverStatus.dispatchEvent(new CustomEvent(type, { detail }));
}

function beginRequest() {
  pending += 1;
  if (awake || noticeTimer) return;
  noticeTimer = setTimeout(() => {
    if (!awake && pending > 0) announce('waking');
  }, WAKE_NOTICE_DELAY);
}

function endRequest(success) {
  pending = Math.max(0, pending - 1);
  if (success && !awake) {
    awake = true;
    announce('awake');
  }
  if (pending === 0) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
}

function buildUrl(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return `/api${path}${query ? `?${query}` : ''}`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * get('/catalogo', { page: 1, limit: 12 })
 * → GET /api/catalogo?page=1&limit=12
 */
export async function get(path, params = {}) {
  const url = buildUrl(path, params);

  if (inFlight.has(url)) return inFlight.get(url);

  const request = (async () => {
    const timeout = awake ? NORMAL_TIMEOUT : COLD_START_TIMEOUT;
    let lastError = null;

    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const response = await fetchWithTimeout(url, timeout);
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          endRequest(true);
          throw new Error(body?.error || `HTTP ${response.status}`);
        }

        endRequest(true);
        return body;
      } catch (error) {
        lastError = error;
        if (attempt < RETRIES) await wait(RETRY_DELAY * (attempt + 1));
      }
    }

    endRequest(false);
    throw lastError || new Error('No se pudo conectar con el servidor');
  })();

  beginRequest();
  inFlight.set(url, request);

  try {
    return await request;
  } finally {
    inFlight.delete(url);
  }
}
