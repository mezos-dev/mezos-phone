/* =========================================================
   mezos-phone — core (state, NUI bridge, helpers, app registry)
   ========================================================= */
'use strict';

const RES = (typeof GetParentResourceName === 'function') ? GetParentResourceName() : 'mezos-phone';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Send a NUI callback to client.lua and return the (json) answer */
async function nui(event, data = {}) {
    if (window.MZ_MOCK) return window.MZ_MOCK(event, data);
    try {
        const resp = await fetch(`https://${RES}/${event}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(data),
        });
        const text = await resp.text();
        try { return JSON.parse(text); } catch (e) { return text; }
    } catch (e) {
        return null;
    }
}

/* ---------- helpers ---------- */
const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** allow a tiny bit of formatting (used for mails coming from other scripts) */
function safeHTML(v) {
    let s = esc(v);
    s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>')
        .replace(/&lt;(\/?)(b|strong|i|em|u|p)&gt;/gi, '<$1$2>');
    return s.replace(/\n/g, '<br>');
}

function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

const pad2 = (n) => String(n).padStart(2, '0');
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDate(d) {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d === 'number') return new Date(d < 1e12 ? d * 1000 : d);
    const s = String(d);
    if (/^\d+$/.test(s)) return parseDate(Number(s));
    const x = new Date(s.includes('T') || s.includes('Z') ? s : s.replace(' ', 'T'));
    return isNaN(x) ? null : x;
}

function timeAgo(d) {
    const date = parseDate(d);
    if (!date) return '';
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return 'now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h';
    if (sec < 604800) return Math.floor(sec / 86400) + 'd';
    return date.getDate() + ' ' + MONTHS[date.getMonth()].slice(0, 3);
}

function shortDate(d) {
    const date = parseDate(d);
    if (!date) return '';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return pad2(date.getHours()) + ':' + pad2(date.getMinutes());
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (date.toDateString() === y.toDateString()) return 'Yesterday';
    if (now - date < 6 * 86400000) return DAYS[date.getDay()];
    return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(2)}`;
}

function initials(name) {
    const n = String(name || '?').replace(/^[^\p{L}\d]+/u, '').trim() || '?';
    if (/^[\d\s+()-]+$/.test(n)) return '<i class="fa-solid fa-user"></i>';
    const parts = n.split(/\s+/);
    return esc(((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '')).toUpperCase() || '?';
}

const AVATAR_COLORS = [
    ['#ff9a8b', '#ff6a88'], ['#a18cd1', '#7f6ad6'], ['#84fab0', '#38c38c'], ['#8fd3f4', '#4a9fe0'],
    ['#fbc2eb', '#e48dc8'], ['#fdcb6e', '#f39c12'], ['#a1c4fd', '#6f86d6'], ['#d4a5a5', '#a87171'],
];
function avatarHTML(name, picture, cls = '') {
    if (picture && picture !== 'default' && /^(https?:|\.\/|nui:|mzmedia:|mzdiscord:)/.test(picture)) {
        return `<div class="avatar ${cls}">${Media.html(picture, 'avatar-img')}</div>`;
    }
    let h = 0; const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
    return `<div class="avatar ${cls}" style="background:linear-gradient(180deg,${c[0]},${c[1]})">${initials(name)}</div>`;
}

function copyText(text) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
}

/* ---------- media (camera photos / videos) ----------
   Photos taken with the camera are saved as  mzmedia://<file>  on the game server.
   1. loaded from the server's https address (Media.base) when it has one
   2. otherwise (or if that fails) the file is sent through the game connection and shown from memory */
const Media = {
    base: '',
    blobs: new Map(),
    loading: new Map(),
    links: new Map(), // Discord: token -> { url, exp }
    isToken(u) { return /^mz(media|discord):\/\//.test(String(u || '')); },
    isDiscord(u) { return /^mzdiscord:\/\//.test(String(u || '')); },
    file(u) { return String(u).replace(/^mzmedia:\/\//, '').replace(/^mzdiscord:\/\/\d+\//, ''); },
    url(u) {
        if (!u) return '';
        u = String(u).replace(/^"|"$/g, '');
        if (!this.isToken(u)) return u;
        if (this.isDiscord(u)) {
            const l = this.links.get(u);
            return l && l.exp > Date.now() ? l.url : `mzmedia-pending:${this.file(u)}`;
        }
        if (this.blobs.has(u)) return this.blobs.get(u);
        // no https address: an invalid src makes the element fail at once and use the fallback
        return this.base ? `${this.base}/media/${this.file(u)}` : `mzmedia-pending:${this.file(u)}`;
    },
    isVideo(u) { return /\.(webm|mp4|mov)(\?|#|$)/i.test(String(u || '')); },
    /** <img> or <video> for a media url. video opts: { controls, autoplay } */
    html(u, cls = '', opts = {}) {
        const src = esc(this.url(u));
        if (this.isVideo(u)) {
            return `<video class="${cls}" src="${src}" data-mz="${esc(u)}" playsinline ${opts.controls ? 'controls' : 'muted loop'} ${opts.autoplay ? 'autoplay' : ''} preload="metadata"></video>`;
        }
        return `<img class="${cls}" src="${src}" data-mz="${esc(u)}" alt="" loading="lazy">`;
    },
    /** usable url (blob) for a token, downloading it through the game when needed */
    resolve(token) {
        if (!this.isToken(token)) return Promise.resolve(token);
        if (this.isDiscord(token)) {
            const l = this.links.get(token);
            if (l && l.exp > Date.now()) return Promise.resolve(l.url);
        } else if (this.blobs.has(token)) return Promise.resolve(this.blobs.get(token));
        if (this.loading.has(token)) return this.loading.get(token);
        const p = this.isDiscord(token) ? (async () => {
            // fresh Discord link from the server (old links expire)
            const r = await nui('mz:media', { discord: String(token).split('/')[2] });
            if (!r || !r.url) throw new Error('media unavailable');
            this.links.set(token, { url: r.url, exp: Date.now() + 6 * 3600 * 1000 });
            return r.url;
        })() : (async () => {
            const r = await nui('mz:media', { name: this.file(token) });
            if (!r || !r.data) throw new Error('media unavailable');
            const bin = atob(String(r.data).replace(/^data:[^,]*,/, ''));
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const obj = URL.createObjectURL(new Blob([arr], { type: r.mime || 'application/octet-stream' }));
            this.blobs.set(token, obj);
            return obj;
        })();
        this.loading.set(token, p);
        p.catch(() => {}).finally(() => this.loading.delete(token));
        return p;
    },
    async fallback(node) {
        if (this.isDiscord(node.dataset.mz)) this.links.delete(node.dataset.mz); // link expired -> ask again
        node.classList.add('media-loading');
        try {
            const obj = await this.resolve(node.dataset.mz);
            node.src = obj;
            if (node.tagName === 'VIDEO' && node.autoplay) node.play().catch(() => {});
        } catch (e) {
            node.classList.add('media-broken');
        }
        node.classList.remove('media-loading');
    },
};
document.addEventListener('error', (e) => {
    const t = e.target;
    if (!t || !t.dataset || !t.dataset.mz || t.dataset.mzRetry) return;
    if (t.tagName !== 'IMG' && t.tagName !== 'VIDEO') return;
    t.dataset.mzRetry = '1';
    if (Media.isToken(t.dataset.mz)) Media.fallback(t); else t.classList.add('media-broken');
}, true);

function fmtCount(n) { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; return String(n); }

/* typing in a text field pauses walking (client.lua) */
const isTextField = (n) => n && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(n.type)));
document.addEventListener('focusin', (e) => { if (isTextField(e.target)) nui('mz:typing', { state: true }); });
document.addEventListener('focusout', (e) => {
    if (!isTextField(e.target)) return;
    setTimeout(() => { if (!isTextField(document.activeElement)) nui('mz:typing', { state: false }); }, 50);
});

/* ---------- global state ---------- */
const S = {
    open: false,
    locked: true,
    loaded: false,
    hasPhone: true,
    player: { charinfo: {}, money: {}, metadata: {}, job: {} },
    job: {},
    meta: {},
    appsCfg: {},
    contacts: [],
    tweets: [],
    call: {},
    time: { hour: 12, minute: '00' },
    currentApp: null,
    notifications: [],
    playerId: 0,
    world: null,
    store: {},
    installed: null,   // app ids from the App Store (server)
    catalog: [],       // Config.Store
    ratings: {},
    stations: [],
    maxVideo: 30,
};

/* Persistent per-character store (client KVP) */
const STORE_DEFAULTS = {
    dark: false, brightness: 100, scale: 100, dnd: false, faceId: true, passcode: '',
    anonymous: false, airplane: false, wifi: true, bluetooth: true, volume: 60,
    hidden: [], notes: [], alarms: [], events: [], worldClocks: [], timerPreset: 300,
    arcade: {}, radioFav: [], darkchat: [], bookmarks: [], browserHistory: [],
};
const Store = {
    _timer: null,
    async load() {
        if (this._timer) return; // unsaved local changes are newer
        const data = await nui('mz:getStore');
        S.store = Object.assign({}, STORE_DEFAULTS, (data && typeof data === 'object') ? data : {});
    },
    get(k) { return S.store[k] === undefined ? STORE_DEFAULTS[k] : S.store[k]; },
    set(k, v) {
        S.store[k] = v;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._timer = null; nui('mz:setStore', { store: S.store }); }, 350);
    },
};

/* ---------- app registry ---------- */
const Apps = {
    defs: {},
    define(id, def) { this.defs[id] = Object.assign({ id, removable: false, builtin: false }, def); },
    get(id) { return this.defs[id]; },
};

/** iOS icon look for every app (gradient + glyph) */
const ICONS = {
    phone:    { bg: 'linear-gradient(180deg,#5df777,#0ec438)', ic: 'fa-solid fa-phone' },
    whatsapp: { bg: 'linear-gradient(180deg,#5df777,#0ec438)', ic: 'fa-solid fa-comment' },
    mail:     { bg: 'linear-gradient(180deg,#1ec8ff,#1a6dff)', ic: 'fa-solid fa-envelope' },
    camera:   { bg: 'linear-gradient(180deg,#e9e9ee,#b5b6bc)', ic: 'fa-solid fa-camera', dark: true },
    gallery:  { bg: '#fff', ic: 'photos' },
    bank:     { bg: 'linear-gradient(180deg,#2c2c2e,#000)', ic: 'wallet' },
    settings: { bg: 'linear-gradient(180deg,#a3a7ae,#6d7178)', ic: 'fa-solid fa-gear' },
    advert:   { bg: 'linear-gradient(180deg,#ffe25a,#ffb800)', ic: 'fa-solid fa-bullhorn' },
    garage:   { bg: 'linear-gradient(180deg,#7d7bff,#4b48d6)', ic: 'fa-solid fa-car-side' },
    houses:   { bg: 'linear-gradient(180deg,#ff9f45,#ff6b00)', ic: 'fa-solid fa-house-chimney' },
    lawyers:  { bg: 'linear-gradient(180deg,#5ee0f5,#1aa7c9)', ic: 'fa-solid fa-briefcase' },
    crypto:   { bg: 'linear-gradient(180deg,#2c2c2e,#000)', ic: 'fa-solid fa-chart-line', color: '#30d158' },
    racing:   { bg: 'linear-gradient(180deg,#ff5f7a,#e0153d)', ic: 'fa-solid fa-flag-checkered' },
    meos:     { bg: 'linear-gradient(180deg,#2b5bd7,#0b2a7a)', ic: 'fa-solid fa-shield-halved' },
    clock:    { bg: '#000', ic: 'clock' },
    calendar: { bg: '#fff', ic: 'calendar' },
    weather:  { bg: 'linear-gradient(180deg,#43a5ff,#1b6fe0)', ic: 'fa-solid fa-cloud-sun' },
    maps:     { bg: 'linear-gradient(135deg,#7ddc8b 0%,#7ddc8b 35%,#f6efe0 35%,#f6efe0 62%,#78c3ff 62%)', ic: 'fa-solid fa-location-arrow', color: '#1a73e8' },
    notes:    { bg: 'linear-gradient(180deg,#ffd84d 0 24%,#fff 24%)', ic: 'notes' },
    calculator:{ bg: 'linear-gradient(180deg,#3a3a3c,#1c1c1e)', ic: 'fa-solid fa-calculator', color: '#ff9f0a' },
    compass:  { bg: '#000', ic: 'fa-regular fa-compass' },
    store:    { bg: 'linear-gradient(180deg,#1ec8ff,#1a6dff)', ic: 'appstore' },
    instagram:{ bg: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)', ic: 'fa-brands fa-instagram' },
    x:        { bg: '#000', ic: 'fa-brands fa-x-twitter' },
    tiktok:   { bg: '#000', ic: 'tiktok' },
    market:   { bg: 'linear-gradient(180deg,#3b8bff,#1464e6)', ic: 'fa-solid fa-store' },
    ride:     { bg: '#000', ic: 'uber' },
    tinder:   { bg: 'linear-gradient(135deg,#fd267a,#ff6036)', ic: 'fa-solid fa-fire-flame-curved' },
    bet:      { bg: 'linear-gradient(180deg,#1f6fd1,#0b3d7e)', ic: 'onexbet' },
    darkchat: { bg: 'linear-gradient(180deg,#0f1512,#000)', ic: 'fa-solid fa-user-secret', color: '#39ff88' },
    radio:    { bg: 'linear-gradient(180deg,#ff5e62,#e0153d)', ic: 'fa-solid fa-radio' },
    health:   { bg: '#fff', ic: 'fa-solid fa-heart', color: '#ff2d55' },
    arcade:   { bg: 'linear-gradient(160deg,#7f5af0,#2cb67d)', ic: 'fa-solid fa-gamepad' },
    browser:  { bg: 'linear-gradient(180deg,#ffffff,#e6ebf2)', ic: 'safari' },
    findmy:   { bg: 'linear-gradient(180deg,#42d36a,#1e9e47)', ic: 'fa-solid fa-location-crosshairs' },
};

function iconHTML(id, fallback) {
    const def = ICONS[id] || { bg: (fallback && fallback.color) || '#555', ic: (fallback && fallback.icon) || 'fa-solid fa-circle' };
    let glyph;
    switch (def.ic) {
        case 'photos':
            glyph = `<svg viewBox="0 0 100 100" style="width:78%;height:78%">${[['#ff9500', 0], ['#ffcc00', 45], ['#34c759', 90], ['#30b0c7', 135], ['#007aff', 180], ['#af52de', 225], ['#ff2d55', 270], ['#ff3b30', 315]]
                .map(([c, r]) => `<ellipse cx="50" cy="29" rx="12" ry="21" fill="${c}" opacity=".82" transform="rotate(${r} 50 50)"/>`).join('')}</svg>`;
            break;
        case 'wallet':
            glyph = `<div class="wallet-glyph"><span style="background:#5ac8fa"></span><span style="background:#ffcc00"></span><span style="background:#34c759"></span><span style="background:#ff3b30"></span></div>`;
            break;
        case 'clock': {
            const d = new Date(); const h = d.getHours() % 12, m = d.getMinutes();
            glyph = `<div class="clock-glyph"><b class="h" style="transform:rotate(${h * 30 + m / 2}deg)"></b><b class="m" style="transform:rotate(${m * 6}deg)"></b><b class="s"></b></div>`;
            break;
        }
        case 'calendar': {
            const d = new Date();
            glyph = `<div class="cal-glyph"><small>${DAYS[d.getDay()].slice(0, 3).toUpperCase()}</small><b>${d.getDate()}</b></div>`;
            break;
        }
        case 'notes':
            glyph = `<div class="notes-glyph"><i></i><i></i><i></i></div>`;
            break;
        case 'appstore':
            glyph = '<svg viewBox="0 0 100 100" style="width:62%;height:62%" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"><path d="M38 18 L70 74"/><path d="M62 18 L30 74"/><path d="M18 74 H82"/></svg>';
            break;
        case 'uber':
            glyph = '<b style="color:#fff;font-size:1.05em;font-weight:600;letter-spacing:-.03em">Uber</b>';
            break;
        case 'onexbet':
            glyph = '<b style="color:#fff;font-size:.95em;font-weight:900;font-style:italic">1X<span style="color:#7fd1ff">BET</span></b>';
            break;
        case 'tiktok':
            glyph = '<i class="fa-brands fa-tiktok" style="color:#fff;text-shadow:-.12rem -.08rem 0 #25f4ee,.12rem .08rem 0 #fe2c55"></i>';
            break;
        case 'safari': {
            const ticks = Array.from({ length: 24 }, (_, i) => `<line x1="50" y1="9" x2="50" y2="${i % 6 ? 14 : 17}" stroke="#fff" stroke-width="${i % 6 ? 1.2 : 2}" transform="rotate(${i * 15} 50 50)"/>`).join('');
            glyph = `<svg viewBox="0 0 100 100" style="width:84%;height:84%"><defs><linearGradient id="sfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fc8ff"/><stop offset="1" stop-color="#1a63e6"/></linearGradient></defs>
                <circle cx="50" cy="50" r="45" fill="url(#sfg)"/>${ticks}
                <g transform="rotate(45 50 50)"><path d="M50 16 L57 50 L43 50 Z" fill="#ff3b30"/><path d="M50 84 L57 50 L43 50 Z" fill="#fff"/></g></svg>`;
            break;
        }
        default:
            glyph = `<i class="${def.ic}" style="${def.color ? 'color:' + def.color : ''}${def.dark ? ';color:#1c1c1e' : ''}"></i>`;
    }
    return `<div class="icon" style="background:${def.bg}">${glyph}</div>`;
}
