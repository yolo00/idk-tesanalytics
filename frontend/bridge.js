/**
 * bridge.js — lapisan komunikasi antara dashboard dan backend.
 * - Dibuka lewat Flask (python api_server.py): apiFetch = fetch biasa ke /api.
 * - Dibuka di dalam Streamlit (component): request dikirim ke Python lewat
 *   protokol komponen Streamlit, lalu dijawab oleh app.py. Tanpa localhost/port lain.
 */
(function () {
    const inStreamlit = location.search.includes('streamlitUrl');
    window.API_BASE = location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api';
    if (!inStreamlit) { window.apiFetch = (p, o) => fetch(window.API_BASE + p, o); return; }

    const send = (m) => window.parent.postMessage(Object.assign({ isStreamlitMessage: true }, m), '*');
    const pending = {};
    let seq = 0, tick = 0;

    window.apiFetch = (path, opts = {}) => new Promise((resolve) => {
        const id = 'r' + (++seq) + '_' + Date.now();
        pending[id] = { req: { id, path, method: opts.method || 'GET', body: opts.body || null }, resolve };
        send({ type: 'streamlit:setComponentValue', dataType: 'json',
               value: { n: ++tick, reqs: Object.values(pending).map(p => p.req) } });
    });

    window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || d.type !== 'streamlit:render') return;
        const resp = (d.args && d.args.responses) || {};
        for (const id in resp) {
            const p = pending[id];
            if (!p) continue;
            delete pending[id];
            const r = resp[id];
            p.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => JSON.parse(r.body) });
        }
    });

    send({ type: 'streamlit:componentReady', apiVersion: 1 });
    let hgt = 900;
    try { hgt = Math.max(700, window.parent.innerHeight - 16); } catch (e) { /* cross-origin */ }
    send({ type: 'streamlit:setFrameHeight', height: hgt });
})();
