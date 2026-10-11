/* Live video for Instagram, TikTok and X (server/live.lua)
   Streamer: Camera in live mode (photos.js) · Viewer: LiveViewer below */
'use strict';

const live = (fn, arg) => nui('mz:live', { fn, arg });

/** shared bits of the live overlay (comments + floating hearts) */
const LiveUI = {
    addComment(box, c) {
        if (!box) return;
        const row = c.t === 'join'
            ? el(`<div class="lc-row join"><b>${esc(c.user)}</b> joined</div>`)
            : el(`<div class="lc-row ${c.host ? 'host' : ''}">${avatarHTML(c.user, c.avatar, 'xs')}<div><b>${esc(c.user)}</b>${c.host ? '<span class="lc-host">Host</span>' : ''}<p>${esc(c.text)}</p></div></div>`);
        box.appendChild(row);
        while (box.children.length > 30) box.firstElementChild.remove();
        box.scrollTop = box.scrollHeight;
    },
    heart(box) {
        if (!box) return;
        const colors = ['#ff2d55', '#ff9f0a', '#bf5af2', '#0a84ff', '#30d158', '#ffd60a'];
        const h = el(`<i class="fa-solid fa-heart lh" style="color:${colors[Math.floor(Math.random() * colors.length)]};left:${Math.round(Math.random() * 30)}%;animation-duration:${(1.6 + Math.random()).toFixed(2)}s"></i>`);
        box.appendChild(h);
        setTimeout(() => h.remove(), 2800);
    },
};

/* ---------- watching someone ---------- */
const LiveViewer = {
    cur: null, page: null,

    async open(app, info) {
        if (!Phone.nav) return;
        const r = await live('join', info.id);
        if (!r || r.error) { UI.hud('fa-solid fa-circle-info', (r && r.error) || 'This live video has ended'); return; }
        this.cur = r;
        const page = el(`<div class="page live-view lv-${esc(app)}">
            <div class="lv-stage"><img class="lv-frame" alt=""><div class="lv-wait"><i class="fa-solid fa-circle-notch spin"></i><span>Connecting…</span></div></div>
            <div class="lv-top">
                <div class="lv-host">${avatarHTML(r.display, r.avatar, 'sm')}<div><b>${esc(r.username)}</b><small>${esc(r.title || Phone.label(app))}</small></div></div>
                <span class="live-badge">LIVE</span>
                <span class="live-eye"><i class="fa-solid fa-eye"></i><b class="lv-n">${fmtCount(r.viewers)}</b></span>
                <span class="lv-close"><i class="fa-solid fa-xmark"></i></span>
            </div>
            <div class="live-chat"></div>
            <div class="live-hearts"></div>
            <div class="lv-bar"><input placeholder="Add a comment…" maxlength="150"><span class="lv-send"><i class="fa-solid fa-paper-plane"></i></span><span class="lv-like"><i class="fa-solid fa-heart"></i></span></div>
            <div class="lv-ended"><i class="fa-solid fa-video-slash"></i><b>Live video ended</b><span>Thanks for watching @${esc(r.username)}</span><div class="btn gray small lv-back">Close</div></div>
        </div>`);
        this.page = page;
        const chat = $('.live-chat', page);
        (Array.isArray(r.comments) ? r.comments : Object.values(r.comments || {})).forEach((c) => LiveUI.addComment(chat, c));
        if (r.frame) this.frame(r.frame);
        const leave = () => this.leave();
        page._onPop = leave;
        $('.lv-close', page).onclick = () => Phone.nav && Phone.nav.pop();
        $('.lv-back', page).onclick = () => Phone.nav && Phone.nav.pop();
        $('.lv-host', page).onclick = () => { const a = Live.appObj(app); if (a) { Phone.nav.pop(); a.profile(r.username); } };
        const inp = $('.lv-bar input', page);
        const send = async () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; await live('comment', v); };
        $('.lv-send', page).onclick = send;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        let lastTap = 0;
        const like = () => { live('like'); LiveUI.heart($('.live-hearts', page)); };
        $('.lv-like', page).onclick = like;
        $('.lv-stage', page).onclick = () => { const n = Date.now(); if (n - lastTap < 300) like(); lastTap = n; };
        Phone.nav.push(page);
    },

    frame(data) {
        if (!this.page) return;
        const img = $('.lv-frame', this.page);
        img.src = data;
        this.page.classList.add('playing');
    },

    onEvent(d) {
        if (!this.page || !this.cur) return;
        if (d.t === 'viewers') $('.lv-n', this.page).textContent = fmtCount(d.n);
        else if (d.t === 'comment' || d.t === 'join') LiveUI.addComment($('.live-chat', this.page), d);
        else if (d.t === 'like') LiveUI.heart($('.live-hearts', this.page));
        else if (d.t === 'end' && Number(d.id) === Number(this.cur.id)) { this.page.classList.add('ended'); this.cur = null; }
    },

    leave() {
        if (this.cur) live('leave');
        this.cur = null;
        this.page = null;
    },
};

/* ---------- glue for the 3 apps ---------- */
const Live = {
    appObj(id) { return { instagram: Instagram, x: XApp, tiktok: TikTok }[id]; },
    async list(app) { const r = await live('list', app); return Array.isArray(r) ? r : Object.values(r || {}); },

    async goLive(app) {
        const r = await UI.alert({
            title: `Go Live on ${Phone.label(app)}`,
            text: 'Your followers get a notification. Everyone sees what your camera sees.',
            input: { placeholder: 'Title (optional)' },
            buttons: [{ text: 'Cancel', value: false }, { text: 'Go Live', style: 'bold red', value: true }],
        });
        if (!r.value) return;
        Camera.start({ live: { app, title: r.input || '' } });
    },

    /** "live now" chips row used by Instagram stories + X */
    card(l, app, cls = 'ig-story live') {
        const n = el(`<div class="${cls}">${avatarHTML(l.display, l.avatar, 'md')}<em>LIVE</em><span>${esc(l.username)}</span></div>`);
        n.onclick = () => LiveViewer.open(app, l);
        return n;
    },
};

/* Instagram: live button in the nav bar, live accounts first in the stories row, "+" asks Post / Live */
(() => {
    const home = Instagram.tab_home;
    Instagram.tab_home = function () {
        const page = home.call(this);
        $('.nav-actions', page).prepend(UI._navBtn({ icon: 'fa-solid fa-tower-broadcast', onClick: () => Live.goLive('instagram') }));
        return page;
    };
    const bar = Instagram.storiesBar;
    Instagram.storiesBar = function () {
        const b = bar.call(this);
        const fill = async () => {
            $$('.ig-story.live', b).forEach((x) => x.remove());
            const lives = await Live.list('instagram');
            const me = $('.ig-story.me', b);
            lives.reverse().forEach((l) => me.after(Live.card(l, 'instagram')));
        };
        fill();
        b._fillLive = fill;
        Instagram._liveBar = b;
        return b;
    };
    const compose = Instagram.compose;
    Instagram.compose = function (media) {
        if (media) return compose.call(this, media);
        UI.actions({ buttons: [
            { text: 'Post', bold: true, onClick: () => compose.call(this) },
            { text: 'Go Live', onClick: () => Live.goLive('instagram') },
        ] });
    };
})();

/* TikTok: LIVE tab at the top of the feed, "+" asks Upload / Go LIVE */
(() => {
    const home = TikTok.tab_home;
    TikTok.tab_home = function () {
        const page = home.call(this);
        const top = $('.tt-top', page);
        const s = el(`<span data-t="live" class="${this.feedTab === 'live' ? 'on' : ''}">LIVE</span>`);
        top.prepend(s);
        return page;
    };
    const load = TikTok.loadFeed;
    TikTok.loadFeed = async function (feed) {
        if (this.feedTab !== 'live') return load.call(this, feed);
        feed.innerHTML = '<div class="tt-loading"><i class="fa-solid fa-circle-notch spin"></i></div>';
        const lives = await Live.list('tiktok');
        if (this.feedTab !== 'live') return;
        feed.innerHTML = '';
        this._liveFeed = feed;
        if (!lives.length) {
            feed.innerHTML = '<div class="tt-empty"><i class="fa-solid fa-tower-broadcast"></i><b>Nobody is live right now</b><span>Tap + and choose Go LIVE to start.</span></div>';
            return;
        }
        const grid = el(`<div class="tt-live-grid">${lives.map((l, i) => `<div data-i="${i}"><div class="tt-live-av">${avatarHTML(l.display, l.avatar, 'lg')}</div><em>LIVE</em><span class="tt-live-n"><i class="fa-solid fa-eye"></i> ${fmtCount(l.viewers)}</span><b>@${esc(l.username)}</b><small>${esc(l.title || 'Live now')}</small></div>`).join('')}</div>`);
        grid.onclick = (e) => { const t = e.target.closest('[data-i]'); if (t) LiveViewer.open('tiktok', lives[Number(t.dataset.i)]); };
        feed.appendChild(grid);
    };
    const compose = TikTok.compose;
    TikTok.compose = function (media) {
        if (media) return compose.call(this, media);
        UI.actions({ buttons: [
            { text: 'Upload video', bold: true, onClick: () => compose.call(this) },
            { text: 'Go LIVE', onClick: () => Live.goLive('tiktok') },
        ] });
    };
})();

/* X: "live now" row above the timeline, + asks Post / Go live */
(() => {
    const load = XApp.loadFeed;
    XApp.loadFeed = async function (box, before) {
        await load.call(this, box, before);
        if (before) return;
        const lives = await Live.list('x');
        if (!lives.length || !box.isConnected) return;
        const row = el('<div class="xa-live-row"></div>');
        lives.forEach((l) => {
            const c = el(`<div class="xa-live">${avatarHTML(l.display, l.avatar, 'sm')}<div><b>${esc(l.display)}</b><small><i class="fa-solid fa-tower-broadcast"></i> ${esc(l.title || 'Live now')} · ${fmtCount(l.viewers)}</small></div></div>`);
            c.onclick = () => LiveViewer.open('x', l);
            row.appendChild(c);
        });
        box.prepend(row);
    };
    const compose = XApp.compose;
    XApp.compose = function (media, opts) {
        if (media || (opts && Object.keys(opts).length)) return compose.call(this, media, opts);
        UI.actions({ buttons: [
            { text: 'Post', bold: true, onClick: () => compose.call(this) },
            { text: 'Go live', onClick: () => Live.goLive('x') },
        ] });
    };
})();

/* ---------- events ---------- */
Phone.on('mz:live:frame', (d) => {
    if (LiveViewer.cur && Number(LiveViewer.cur.id) === Number(d.host)) LiveViewer.frame(d.frame);
});
Phone.on('mz:live', (d) => {
    const p = d.data || {};
    if (p.t === 'hostEnd') { if (Camera.live) Camera.stopLive(true); return; }
    if (Camera.live) Camera.onLive(p);
    LiveViewer.onEvent(p);
});
Phone.on('mz:live:list', (d) => {
    if (S.currentApp !== d.app) return;
    if (d.app === 'instagram' && Instagram._liveBar && Instagram._liveBar.isConnected) Instagram._liveBar._fillLive();
    if (d.app === 'tiktok' && TikTok.feedTab === 'live' && TikTok._liveFeed && TikTok._liveFeed.isConnected) TikTok.loadFeed(TikTok._liveFeed);
});
(() => {
    // leaving the app (or putting the phone away) leaves the live video
    const close = Phone.closeApp.bind(Phone);
    Phone.closeApp = function (instant) {
        if (LiveViewer.cur) LiveViewer.leave();
        return close(instant);
    };
})();
