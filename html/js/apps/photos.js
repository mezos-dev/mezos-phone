/* Photos + Camera */
'use strict';

/* ---------- sounds (no files needed) ---------- */
const Sfx = {
    ctx: null,
    ac() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } } return this.ctx; },
    vol() { return clamp((Number(Store.get('volume')) || 60) / 100, 0, 1); },
    shutter() {
        // the real iPhone-like shutter from interact-sound, synthesized click as a fallback
        const a = new Audio(`https://cfx-nui-interact-sound/client/html/sounds/photo.ogg`);
        a.volume = 0.55 * this.vol();
        a.play().catch(() => this.click());
    },
    click() {
        const ac = this.ac(); if (!ac) return;
        const t = ac.currentTime;
        [0, 0.075].forEach((off, i) => {
            const len = 0.05;
            const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
            const d = buf.getChannelData(0);
            for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / d.length, 3);
            const src = ac.createBufferSource(); src.buffer = buf;
            const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = i ? 2400 : 1600; f.Q.value = 0.8;
            const g = ac.createGain(); g.gain.value = 0.9 * this.vol();
            src.connect(f).connect(g).connect(ac.destination);
            src.start(t + off);
        });
    },
    tone(freqs, dur = 0.12, type = 'sine', gain = 0.18) {
        const ac = this.ac(); if (!ac) return;
        let t = ac.currentTime;
        freqs.forEach((fr) => {
            const o = ac.createOscillator(); const g = ac.createGain();
            o.type = type; o.frequency.value = fr;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(gain * this.vol() + 0.0001, t + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(ac.destination);
            o.start(t); o.stop(t + dur + 0.02);
            t += dur * 0.8;
        });
    },
    saved() { this.tone([1318, 1760], 0.11, 'sine', 0.12); },
    recStart() { this.tone([880], 0.16, 'sine', 0.2); },
    recStop() { this.tone([880, 660], 0.14, 'sine', 0.2); },
    error() { this.tone([330, 262], 0.16, 'triangle', 0.18); },
    tick() { this.tone([1000], 0.06, 'square', 0.05); },
};

/* ---------- Camera (inside the phone: the screen is the viewfinder) ---------- */
const CAM_MODES = ['night', 'photo', 'video'];
const Camera = {
    pending: null, filters: [], st: {}, page: null, lastUrl: null, maxVideo: 30, purpose: null, live: null, gv: null, aim: false,

    /** opts: { purpose: 'photo' | 'video', onResult(url), live: { app, title } } */
    start(opts = {}) {
        this.pending = opts.onResult ? opts : null;
        if (S.currentApp === 'camera') Phone.closeApp(true);
        Phone.openApp('camera', { purpose: opts.purpose || null, live: opts.live || null });
    },

    open(nav, opts = {}) {
        this.purpose = opts.purpose || null;
        const goLive = opts.live || null;
        const page = el(`<div class="page cam-app ${goLive ? 'live' : ''}">
            <canvas class="cam-feed"></canvas>
            <div class="cam-top">
                <span class="cam-btn" data-op="close" title="Close"><i class="fa-solid fa-xmark"></i></span>
                <span class="cam-btn" data-op="flash" title="Flash (F)"><i class="fa-solid fa-bolt"></i></span>
                <span class="cam-rec"><i></i><b id="cam-rec-time">00:00</b></span>
                <span class="cam-btn" data-op="timer" title="Timer (H)"><i class="fa-solid fa-stopwatch"></i><small></small></span>
                <span class="cam-btn" data-op="grid" title="Grid (G)"><i class="fa-solid fa-table-cells"></i></span>
            </div>
            <div class="cam-view" id="cam-view">
                <div class="cam-grid"><i></i><i></i><i></i><i></i></div>
                <div class="cam-flash"></div>
                <div class="cam-count" id="cam-count"></div>
                <div class="cam-badge" id="cam-badge"></div>
                <div class="cam-hint" id="cam-hint"></div>
                <div class="cam-toast" id="cam-toast"></div>
                <div class="cam-live-top"><span class="live-badge">LIVE</span><span class="live-eye"><i class="fa-solid fa-eye"></i><b id="cam-live-viewers">0</b></span><span class="live-time" id="cam-live-time">00:00</span></div>
                <div class="live-chat" id="cam-live-chat"></div>
                <div class="live-hearts" id="cam-live-hearts"></div>
            </div>
            <div class="cam-bottom">
                <div class="cam-filters" id="cam-filters"></div>
                <div class="cam-zooms" id="cam-zooms"></div>
                <div class="cam-switch" id="cam-modes"><span data-mode="photo">PHOTO</span><span data-mode="video">VIDEO</span></div>
                <div class="cam-controls">
                    <div class="cam-thumb" id="cam-thumb" data-op="gallery" title="Photos"></div>
                    <div class="cam-shutter" data-op="shutter" title="Take photo"><span></span><b class="cam-end">END</b></div>
                    <div class="cam-flipbtn" data-op="flip" title="Selfie (E)"><i class="fa-solid fa-camera-rotate"></i></div>
                </div>
            </div>
        </div>`);
        this.page = page;
        nav.push(page, false);
        $('#screen').classList.add('cam-mode');
        if (this.lastUrl) $('#cam-thumb', page).innerHTML = Media.html(this.lastUrl);
        this.paintHint();
        this.startFeed(page);

        page.addEventListener('click', (e) => {
            if (this._swiped) { this._swiped = false; return; }
            const m = e.target.closest('[data-mode]');
            if (m) return nui('mz:camera:action', { op: 'mode', value: m.dataset.mode });
            const f = e.target.closest('[data-filter]');
            if (f) return nui('mz:camera:action', { op: 'filter', value: Number(f.dataset.filter) });
            const z = e.target.closest('[data-zoom]');
            if (z) return nui('mz:camera:action', { op: 'zoom', value: z.dataset.zoom });
            const b = e.target.closest('[data-op]');
            if (!b) return;
            const op = b.dataset.op;
            if (op === 'close') return Phone.closeApp();
            if (op === 'shutter' && this.live) return this.endLive();
            if (op === 'gallery') { Phone.closeApp(true); return Phone.openApp('gallery'); }
            nui('mz:camera:action', { op });
        });
        page.addEventListener('contextmenu', (e) => e.preventDefault());
        this.dragZone($('#cam-view', page));
        nui('mz:camera:start', { purpose: this.purpose, live: !!goLive });
        if (goLive) this.startLive(goLive);
    },

    close() {
        if (this.live) this.stopLive(true);
        nui('mz:camera:stop');
        $('#screen').classList.remove('cam-mode', 'cam-feed-on');
        $('#cam-dim').classList.remove('show');
        // a running recording is finished by the game (recStop) so the clip is still saved
        if (this.gv) { this.gv.stop(); this.gv = null; }
        this.page = null;
    },

    /* live camera picture inside the phone (falls back to a see-through screen if the game view is unavailable) */
    startFeed(page) {
        const canvas = $('.cam-feed', page);
        let gv = null;
        try { gv = GameView.create(canvas); } catch (e) { gv = null; }
        if (!gv) { canvas.remove(); return; }
        this.gv = gv;
        gv.onFrame = (n) => {
            if (n === 3) gv.fit();
            if (n !== 24) return;
            if (gv.check()) {
                $('#screen').classList.add('cam-feed-on');
                canvas.classList.add('on');
                $('#cam-dim').classList.add('show'); // the phone is the viewfinder
                nui('mz:camera:feed', { on: true });
            } else {
                gv.stop();
                canvas.remove();
                this.gv = null;
            }
        };
        requestAnimationFrame(() => gv.start());
    },

    /** click & drag on the picture turns the camera */
    dragZone(zone) {
        let last = null; let id = null; let acc = { dx: 0, dy: 0 }; let timer = 0;
        const flush = () => {
            timer = 0;
            if (!acc.dx && !acc.dy) return;
            nui('mz:camera:drag', acc);
            acc = { dx: 0, dy: 0 };
        };
        zone.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest('[data-op],[data-filter],[data-zoom],[data-mode]')) return;
            last = { x: e.clientX, y: e.clientY }; id = e.pointerId;
            try { zone.setPointerCapture(id); } catch (err) { /* */ }
            zone.classList.add('dragging');
            e.preventDefault();
        });
        zone.addEventListener('pointermove', (e) => {
            if (!last || e.pointerId !== id) return;
            // drag like aiming: drag right = look right, drag down = look down
            acc.dx -= (e.clientX - last.x); acc.dy -= (e.clientY - last.y);
            last = { x: e.clientX, y: e.clientY };
            if (!timer) timer = setTimeout(flush, 30);
        });
        const end = (e) => {
            if (!last || (e && e.pointerId !== id)) return;
            last = null;
            zone.classList.remove('dragging');
            flush();
        };
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
    },

    /* video straight from the phone picture (MediaRecorder): smooth, portrait, no screencapture needed */
    recStart() {
        if (!this.gv || this.rec) return false;
        try {
            const stream = this.gv.canvas.captureStream(30);
            const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
            if (!type) return false;
            const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1600000 });
            const chunks = [];
            rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            rec.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                const blob = new Blob(chunks, { type: 'video/webm' });
                const fr = new FileReader();
                fr.onload = () => nui('mz:camera:video', { id: rec._id, data: fr.result });
                fr.onerror = () => nui('mz:camera:video', { id: rec._id, data: null });
                fr.readAsDataURL(blob);
            };
            rec.start(1000);
            this.rec = rec;
            return true;
        } catch (e) { this.rec = null; return false; }
    },
    recStop(id) {
        const rec = this.rec;
        this.rec = null;
        if (!rec) return nui('mz:camera:video', { id, data: null });
        rec._id = id;
        try { rec.stop(); } catch (e) { nui('mz:camera:video', { id, data: null }); }
    },

    async grab(id) {
        let data = null;
        try { if (this.gv) data = await this.gv.capture(); } catch (e) { data = null; }
        nui('mz:camera:photo', { id, data });
    },

    swipeZone(zone) {
        let x0 = null; let id = null; let moved = 0;
        const track = () => this.page && $('.cam-modes-track', this.page);
        zone.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || this.live || this.st.recording) return;
            if (e.target.closest('[data-op],[data-filter]')) return;
            x0 = e.clientX; id = e.pointerId; moved = 0;
            try { zone.setPointerCapture(id); } catch (err) { /* */ }
            const t = track(); if (t) t.style.transition = 'none';
        });
        zone.addEventListener('pointermove', (e) => {
            if (x0 === null || e.pointerId !== id) return;
            moved = e.clientX - x0;
            const t = track(); if (t) t.style.transform = `translateX(${(this._modeX || 0) + moved * 0.5}px)`;
        });
        const end = (e) => {
            if (x0 === null || (e && e.pointerId !== id)) return;
            x0 = null;
            const t = track(); if (t) t.style.transition = '';
            if (Math.abs(moved) > 30) { this._swiped = true; setTimeout(() => { this._swiped = false; }, 50); this.stepMode(moved < 0 ? 1 : -1); }
            this.paintModes();
        };
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
    },

    allowedModes() {
        return CAM_MODES.filter((m) => !((this.purpose === 'photo' && m === 'video') || (this.purpose === 'video' && m !== 'video')));
    },

    stepMode(dir) {
        const list = this.allowedModes();
        const i = list.indexOf(this.st.mode || 'photo');
        const next = list[clamp(i + dir, 0, list.length - 1)];
        if (next && next !== this.st.mode) { nui('mz:camera:action', { op: 'mode', value: next }); Sfx.tick(); }
    },

    /** mode names slide so the selected one is in the middle (like iOS) */
    paintModes() {
        const p = this.page;
        if (!p) return;
        const box = $('#cam-modes', p); const t = $('.cam-modes-track', p);
        const on = $(`[data-mode="${this.st.mode || 'photo'}"]`, t);
        if (!box || !t || !on) return;
        this._modeX = box.clientWidth / 2 - (on.offsetLeft + on.offsetWidth / 2);
        t.style.transform = `translateX(${this._modeX}px)`;
    },

    paintHint() {
        const h = this.page && $('#cam-hint', this.page);
        if (h) h.innerHTML = '<i class="fa-solid fa-hand"></i> Drag the picture to aim · W A S D to walk';
    },

    /* ---------- going live (Instagram / TikTok / X) ---------- */
    async startLive(cfg) {
        this.live = { app: cfg.app, title: cfg.title || '', started: Date.now(), viewers: 0, likes: 0, starting: true };
        this.toast('<i class="fa-solid fa-circle-notch spin"></i> Starting live video…');
        const r = await nui('mz:live', { fn: 'start', arg: { app: cfg.app, title: cfg.title || '', clientFrames: !!this.gv } });
        if (!this.live) return;
        if (!r || r.error) {
            this.live = null;
            nui('mz:camera:live', { on: false });
            Sfx.error();
            this.toast(`<i class="fa-solid fa-triangle-exclamation"></i> ${esc((r && r.error) || 'Could not go live')}`, 'bad');
            if (this.page) this.page.classList.remove('live');
            return;
        }
        this.live.starting = false;
        this.live.started = Date.now();
        nui('mz:camera:live', { on: true });
        if (this.gv) {
            let last = 0;
            this.gv.tap = () => {
                const now = Date.now();
                if (!this.live || now - last < 280) return;
                last = now;
                const data = this.gv.small(360, 0.55);
                if (data) nui('mz:live:frame', { data });
            };
        }
        Sfx.recStart();
        this.toast(`<i class="fa-solid fa-tower-broadcast"></i> You're live on ${esc(Phone.label(cfg.app))}`, 'ok');
        clearInterval(this._liveTick);
        this._liveTick = setInterval(() => {
            const t = this.page && $('#cam-live-time', this.page);
            if (!t || !this.live) return;
            const sec = Math.floor((Date.now() - this.live.started) / 1000);
            t.textContent = `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
        }, 1000);
    },

    stopLive(silent) {
        if (!this.live) return;
        const l = this.live;
        this.live = null;
        clearInterval(this._liveTick);
        if (this.gv) this.gv.tap = null;
        nui('mz:live', { fn: 'stop' });
        nui('mz:camera:live', { on: false });
        if (!silent) {
            Sfx.recStop();
            this.toast(`<i class="fa-solid fa-circle-check"></i> Live ended · ${l.viewers} viewers · ${l.likes} likes`, 'ok');
        }
        if (this.page) this.page.classList.remove('live');
    },

    async endLive() {
        if (!this.live) return;
        if (!(await UI.confirm('End live video?', 'Your viewers will be notified that your live video has ended.', 'End', true))) return;
        this.stopLive();
        setTimeout(() => { if (S.currentApp === 'camera' && !this.live) Phone.closeApp(); }, 1600);
    },

    onLive(d) {
        if (!this.live || !this.page) return;
        if (d.t === 'viewers') { this.live.viewers = Math.max(this.live.viewers, d.n); $('#cam-live-viewers', this.page).textContent = fmtCount(d.n); }
        else if (d.t === 'comment' || d.t === 'join') LiveUI.addComment($('#cam-live-chat', this.page), d);
        else if (d.t === 'like') { this.live.likes = d.likes; LiveUI.heart($('#cam-live-hearts', this.page)); }
    },

    paint() {
        const p = this.page;
        if (!p) return;
        const st = this.st;
        const mode = st.mode || 'photo';
        this.paintHint();
        p.classList.toggle('grid', !!st.grid);
        p.classList.toggle('recording', !!st.recording);
        p.classList.toggle('busy', !!st.busy);
        $('[data-op="flash"]', p).classList.toggle('on', !!st.flash);
        const t = $('[data-op="timer"]', p);
        t.classList.toggle('on', !!st.timer);
        $('small', t).textContent = st.timer ? st.timer + 's' : '';
        $('[data-op="grid"]', p).classList.toggle('on', !!st.grid);
        $('[data-op="flip"]', p).classList.toggle('on', !!st.selfie);
        $('.cam-shutter', p).classList.toggle('video', mode === 'video');
        $$('#cam-modes span', p).forEach((s) => {
            s.classList.toggle('on', s.dataset.mode === mode);
            s.classList.toggle('off', (this.purpose === 'photo' && s.dataset.mode === 'video') || (this.purpose === 'video' && s.dataset.mode !== 'video'));
        });
        const zb = $('#cam-zooms', p);
        const zooms = Array.isArray(st.zooms) ? st.zooms : Object.values(st.zooms || {});
        if (zb && zooms.length) zb.innerHTML = zooms.map((z) => `<span data-zoom="${esc(z)}" class="${String(z) === String(st.zoom) ? 'on' : ''}">${esc(z)}${String(z) === String(st.zoom) ? '×' : ''}</span>`).join('');
        $$('#cam-filters span', p).forEach((s) => s.classList.toggle('on', Number(s.dataset.filter) === Number(st.filter)));
        const on = $('#cam-filters span.on', p);
        if (on && on.scrollIntoView && this._lastFilter !== st.filter) { on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); this._lastFilter = st.filter; }
        const badge = $('#cam-badge', p);
        badge.innerHTML = mode === 'night' ? '<i class="fa-solid fa-moon"></i> NIGHT' : st.selfie ? 'SELFIE' : '';
        badge.classList.toggle('show', !!badge.innerHTML);
    },

    toast(html, cls = '') {
        const t = this.page && $('#cam-toast', this.page);
        if (!t) return;
        t.className = `cam-toast show ${cls}`;
        t.innerHTML = html;
        clearTimeout(this._toast);
        this._toast = setTimeout(() => t.classList.remove('show'), 2000);
    },

    tickRec(sec) {
        const r = this.page && $('#cam-rec-time', this.page);
        if (r) r.textContent = `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
    },

    onMessage(d) {
        switch (d.state) {
            case 'open':
                this.filters = Array.isArray(d.filters) ? d.filters : Object.values(d.filters || {});
                this.maxVideo = Number(d.maxVideo) || 30;
                if (this.page) $('#cam-filters', this.page).innerHTML = this.filters.map((f, i) => `<span data-filter="${i + 1}">${esc(f)}</span>`).join('');
                break;
            case 'update':
                this.st = d;
                this.paint();
                break;
            case 'countdown': {
                const c = this.page && $('#cam-count', this.page);
                if (!c) break;
                c.textContent = d.value > 0 ? d.value : '';
                c.classList.remove('pop'); void c.offsetWidth; if (d.value > 0) c.classList.add('pop');
                break;
            }
            case 'shutter': {
                Sfx.shutter();
                const f = this.page && $('.cam-flash', this.page);
                if (f) { f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
                this.toast('<i class="fa-solid fa-circle-notch spin"></i> Saving…');
                break;
            }
            case 'recording':
                if (d.on) { Sfx.recStart(); this.tickRec(0); } else Sfx.recStop();
                break;
            case 'tick':
                this.tickRec(d.seconds);
                break;
            case 'processing':
                this.toast('<i class="fa-solid fa-circle-notch spin"></i> Processing video…');
                break;
            case 'looking':
                if (this.page) this.page.classList.toggle('looking', !!d.on);
                break;
            case 'back':
                if (S.currentApp === 'camera') { if (this.live) this.endLive(); else Phone.closeApp(); }
                break;
            case 'grab':
                this.grab(d.id);
                break;
            case 'recStart':
                nui('mz:camera:recording', { ok: this.recStart() });
                break;
            case 'recStop':
                this.recStop(d.id);
                break;
            case 'liveEnd':
                this.endLive();
                break;
            case 'saved': {
                this.lastUrl = d.url;
                Sfx.saved();
                const th = this.page && $('#cam-thumb', this.page);
                if (th) { th.innerHTML = Media.html(d.url, '', { autoplay: true }); th.classList.remove('bounce'); void th.offsetWidth; th.classList.add('bounce'); }
                this.toast(`<i class="fa-solid fa-circle-check"></i> ${d.kind === 'video' ? 'Video' : 'Photo'} saved`, 'ok');
                if (this.pending) {
                    const p = this.pending;
                    this.pending = null;
                    setTimeout(() => p.onResult(d.url), 700);
                }
                break;
            }
            case 'failed':
                Sfx.error();
                this.toast(`<i class="fa-solid fa-triangle-exclamation"></i> ${esc(d.text || 'Failed')}`, 'bad');
                break;
            default:
                break;
        }
    },
};
Phone.on('mz:camera', (d) => Camera.onMessage(d));

/* ---------- Photos ---------- */
const PhotosApp = {
    nav: null, page: null, list: [], filter: 'all',

    open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Library', large: true, right: [{ icon: 'fa-solid fa-camera', onClick: () => Phone.openApp('camera') }] });
        nav.push(this.page, false);
        this.load();
    },

    async load() {
        const c = this.page.content;
        c.innerHTML = '';
        c.appendChild(UI.loading());
        const d = await nui('GetGalleryData');
        this.list = (Array.isArray(d) ? d : Object.values(d || {})).filter((p) => p && p.image);
        this.render();
    },

    render() {
        const c = this.page.content;
        c.innerHTML = '';
        const videos = this.list.filter((p) => Media.isVideo(p.image));
        c.appendChild(UI.segmented([{ id: 'all', label: `All Photos` }, { id: 'videos', label: `Videos (${videos.length})` }], this.filter, (id) => { this.filter = id; this.render(); }));
        const shown = this.filter === 'videos' ? videos : this.list;
        if (!shown.length) {
            c.appendChild(UI.empty('fa-regular fa-images', this.filter === 'videos' ? 'No Videos' : 'No Photos', 'Open the Camera to take photos and videos.'));
            const b = el('<div class="btn-row"><div class="btn primary"><i class="fa-solid fa-camera"></i>Open Camera</div></div>');
            b.onclick = () => Camera.start();
            c.appendChild(b);
            return;
        }
        const grid = el(`<div class="photo-grid big">${shown.map((p) => `<div class="ph" data-i="${this.list.indexOf(p)}">${Media.html(p.image, 'ph-media')}${Media.isVideo(p.image) ? '<span class="ph-video"><i class="fa-solid fa-play"></i></span>' : ''}</div>`).join('')}</div>`);
        grid.onclick = (e) => { const t = e.target.closest('.ph'); if (t) this.view(Number(t.dataset.i)); };
        c.appendChild(grid);
        c.appendChild(el(`<div class="section-footer" style="text-align:center">${this.list.length - videos.length} Photos, ${videos.length} Videos</div>`));
    },

    view(i) {
        const p = this.list[i];
        if (!p) return;
        const d = parseDate(p.date);
        const video = Media.isVideo(p.image);
        const page = el(`<div class="page photo-view">
            <div class="navbar translucent"><div class="nav-row">
                <div class="nav-btn" id="pv-back"><i class="fa-solid fa-chevron-left"></i>Library</div>
                <div class="nav-title">${d ? `${d.getDate()} ${MONTHS[d.getMonth()]}<br><small>${pad2(d.getHours())}:${pad2(d.getMinutes())}</small>` : 'Photo'}</div>
                <div class="nav-actions"></div></div></div>
            <div class="pv-img">${Media.html(p.image, '', { controls: true, autoplay: true })}</div>
            <div class="pv-bar">
                <span data-a="share" title="Share"><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
                <span data-a="airdrop" title="AirDrop"><i class="fa-solid fa-tower-broadcast"></i></span>
                <span data-a="send" title="Send in Messages"><i class="fa-solid fa-paper-plane"></i></span>
                ${video ? '' : '<span data-a="wall" title="Set as wallpaper"><i class="fa-solid fa-mobile-screen"></i></span>'}
                <span data-a="del" title="Delete"><i class="fa-solid fa-trash-can"></i></span>
            </div></div>`);
        $('#pv-back', page).onclick = () => this.nav.pop();
        const img = $('.pv-img img', page);
        if (img) img.onclick = () => UI.viewImage(img.src);
        $('.pv-bar', page).onclick = async (e) => {
            const b = e.target.closest('span'); if (!b) return;
            const a = b.dataset.a;
            if (a === 'share') this.share(p);
            else if (a === 'airdrop') this.airdrop(p);
            else if (a === 'wall') {
                S.meta.background = p.image;
                nui('SetBackground', { background: p.image });
                Phone.applyWallpaper();
                UI.hud('fa-solid fa-mobile-screen', 'Wallpaper set');
            } else if (a === 'send') this.sendTo(p);
            else if (a === 'del') {
                if (!(await UI.confirm(video ? 'Delete Video' : 'Delete Photo', 'This will be deleted from your library.', 'Delete', true))) return;
                await nui('DeleteImage', { image: p.image });
                this.nav.pop();
                setTimeout(() => this.load(), 500);
            }
        };
        this.nav.push(page);
    },

    share(p) {
        const apps = Phone.installedApps();
        const video = Media.isVideo(p.image);
        const buttons = [];
        if (apps.includes('instagram')) buttons.push({ text: 'Post on Instagram', onClick: () => { Phone.closeApp(true); Phone.openApp('instagram', { compose: p.image }); } });
        if (apps.includes('tiktok')) buttons.push({ text: 'Post on TikTok', onClick: () => { Phone.closeApp(true); Phone.openApp('tiktok', { compose: p.image }); } });
        if (apps.includes('x')) buttons.push({ text: 'Post on X', onClick: () => { Phone.closeApp(true); Phone.openApp('x', { compose: p.image }); } });
        if (apps.includes('market') && !video) buttons.push({ text: 'Sell on Marketplace', onClick: () => { Phone.closeApp(true); Phone.openApp('market', { compose: p.image }); } });
        buttons.push({ text: 'AirDrop', onClick: () => this.airdrop(p) });
        buttons.push({ text: 'Copy Link', onClick: () => { copyText(Media.url(p.image)); UI.hud('fa-solid fa-copy', 'Link copied'); } });
        UI.actions({ title: video ? 'Share Video' : 'Share Photo', buttons });
    },

    async sendTo(p) {
        const num = await UI.prompt('Send', 'Phone number or contact name', '06…');
        if (!num) return;
        const c = (S.contacts || []).find((x) => (x.name || '').toLowerCase() === num.toLowerCase());
        const number = c ? c.number : num.replace(/\s+/g, '');
        const dt = new Date();
        nui('SendMessage', { ChatNumber: String(number), ChatDate: `${dt.getDate()}-${dt.getMonth()}-${dt.getFullYear()}`, ChatMessage: Media.isVideo(p.image) ? 'Video' : 'Photo', ChatTime: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`, ChatType: 'picture', url: p.image });
        UI.hud('fa-solid fa-paper-plane', 'Sent');
    },

    async airdrop(p) {
        UI.sheet({
            title: 'AirDrop', half: true,
            content: async (body, sheet) => {
                body.innerHTML = `<div class="airdrop-scan"><div class="ad-radar"><i class="fa-solid fa-tower-broadcast"></i></div><span>Looking for people nearby…</span></div>`;
                const list = await nui('mz:airdrop:nearby');
                const people = Array.isArray(list) ? list : Object.values(list || {});
                body.innerHTML = '';
                if (!people.length) { body.appendChild(UI.empty('fa-solid fa-tower-broadcast', 'No One Nearby', 'Stand close to another person with a phone.')); return; }
                body.appendChild(el('<div class="section-header">PEOPLE NEARBY</div>'));
                const grid = el(`<div class="airdrop-people">${people.map((x, i) => `<div data-i="${i}">${avatarHTML(x.name, null, 'md')}<span>${esc(x.name)}</span></div>`).join('')}</div>`);
                grid.onclick = (e) => {
                    const t = e.target.closest('[data-i]'); if (!t) return;
                    const who = people[Number(t.dataset.i)];
                    nui('mz:airdrop:send', { target: who.id, url: p.image });
                    sheet.close();
                    UI.hud('fa-solid fa-tower-broadcast', `Sent to ${who.name}`);
                };
                body.appendChild(grid);
            },
        });
    },

    /** photo picker used by other apps → resolves the media url */
    pick(opts = {}) {
        return new Promise(async (resolve) => {
            const d = await nui('GetGalleryData');
            let list = (Array.isArray(d) ? d : Object.values(d || {})).filter((p) => p && p.image);
            if (opts.only === 'image') list = list.filter((p) => !Media.isVideo(p.image));
            if (opts.only === 'video') list = list.filter((p) => Media.isVideo(p.image));
            let picked = null;
            UI.sheet({
                title: opts.title || 'Choose', onClose: () => resolve(picked),
                content: (body, sheet) => {
                    const cam = el(`<div class="btn-row" style="margin:.4rem 0 .8rem"><div class="btn tinted"><i class="fa-solid fa-camera"></i>${opts.only === 'video' ? 'Record Video' : 'Take Photo'}</div></div>`);
                    cam.onclick = () => { sheet.close(); if (opts.onCamera) opts.onCamera(); };
                    if (opts.onCamera) body.appendChild(cam);
                    if (!list.length) { body.appendChild(UI.empty('fa-regular fa-images', 'Nothing here', 'Use the Camera first.')); return; }
                    const grid = el(`<div class="photo-grid">${list.map((p, i) => `<div class="ph" data-i="${i}">${Media.html(p.image, 'ph-media')}${Media.isVideo(p.image) ? '<span class="ph-video"><i class="fa-solid fa-play"></i></span>' : ''}</div>`).join('')}</div>`);
                    grid.onclick = (e) => { const t = e.target.closest('.ph'); if (t) { picked = list[Number(t.dataset.i)].image; sheet.close(); } };
                    body.appendChild(grid);
                },
            });
        });
    },
};

Apps.define('gallery', { open: (nav) => PhotosApp.open(nav) });
Apps.define('camera', {
    open: (nav, o) => Camera.open(nav, o),
    onReopen: (o) => { Camera.purpose = (o && o.purpose) || null; Camera.paint(); },
    onClose: () => Camera.close(),
    dark: true,
});

Phone.on('mz:airdrop:offer', async (d) => {
    const o = d.offer || {};
    const ask = async () => {
        const r = await UI.alert({
            title: 'AirDrop',
            text: `${o.from} would like to share a ${Media.isVideo(o.url) ? 'video' : 'photo'}.`,
            buttons: [{ text: 'Decline', value: false }, { text: 'Accept', style: 'bold', value: true }],
        });
        nui('mz:airdrop:answer', { accept: !!r.value });
        if (r.value) UI.hud('fa-solid fa-circle-check', 'Saved to Photos');
    };
    if (S.open && !S.locked) return ask();
    Phone.notify({ app: 'gallery', title: 'AirDrop', text: `${o.from} wants to share with you. Open your phone to accept.` });
    Phone._airdropPending = ask;
});
