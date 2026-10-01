/**
 * bridge.js — lapisan komunikasi antara dashboard dan backend.
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

    // Streamlit memasang scrolling="no" pada iframe komponen, sehingga isi yang lebih
    // tinggi dari frame terpotong. Aktifkan scroll di dalam frame (iframe same-origin)
    // dan tinggikan frame setinggi layar, supaya sidebar sticky & modal tetap benar.
    function fit() {
        try {
            const fe = window.frameElement;
            if (fe) fe.setAttribute('scrolling', 'yes');
            const h = Math.max(600, window.parent.innerHeight - 8);
            send({ type: 'streamlit:setFrameHeight', height: h });
        } catch (e) { send({ type: 'streamlit:setFrameHeight', height: 900 }); }
    }
    fit();
    window.addEventListener('resize', fit);
})();
