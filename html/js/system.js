/* =========================================================
   mezos-phone — "iOS" system: lock screen, home screen,
   app windows, Dynamic Island, notifications, Control Centre
   ========================================================= */
'use strict';

const BUILTIN_APPS = ['clock', 'calendar', 'weather', 'maps', 'notes', 'calculator', 'compass', 'store', 'browser', 'findmy'];
const CORE_APPS = ['phone', 'whatsapp', 'mail', 'camera', 'gallery', 'bank', 'settings', 'store', 'meos'];
const DOCK_APPS = ['phone', 'browser', 'whatsapp', 'bank'];
const HOME_ORDER = [
    'mail', 'gallery', 'camera', 'settings', 'clock', 'calendar', 'weather', 'maps', 'notes', 'calculator', 'store', 'findmy', 'health', 'radio',
    'instagram', 'x', 'tiktok', 'tinder', 'market', 'ride', 'bet', 'darkchat', 'arcade', 'advert',
    'garage', 'houses', 'lawyers', 'crypto', 'racing', 'meos', 'compass',
];
const APP_LABELS = {
    phone: 'Phone', whatsapp: 'Messages', mail: 'Mail', camera: 'Camera', gallery: 'Photos', bank: 'Wallet', settings: 'Settings',
    advert: 'Ads', garage: 'Garage', houses: 'Home', lawyers: 'Services', crypto: 'Crypto', racing: 'Racing',
    meos: 'MDT', clock: 'Clock', calendar: 'Calendar', weather: 'Weather', maps: 'Maps', notes: 'Notes', calculator: 'Calculator',
    compass: 'Compass', store: 'App Store', instagram: 'Instagram', x: 'X', tiktok: 'TikTok', market: 'Marketplace', ride: 'Uber',
    tinder: 'Tinder', bet: '1xBet', darkchat: 'DarkChat', browser: 'Safari', findmy: 'Find My',
    radio: 'Radio', health: 'Health', arcade: 'Arcade',
};

const WALLPAPERS = {
    'mz-aurora':   { label: 'Aurora',    css: 'radial-gradient(120% 80% at 20% 10%, #ff7eb3 0%, transparent 55%), radial-gradient(100% 70% at 90% 30%, #7a5cff 0%, transparent 60%), radial-gradient(120% 90% at 50% 100%, #00c6ff 0%, transparent 60%), linear-gradient(160deg, #1b1035, #0b1d4d)' },
    'mz-sunset':   { label: 'Sunset',    css: 'radial-gradient(90% 60% at 50% 105%, #ffd36e 0%, transparent 60%), linear-gradient(180deg, #2d1b69 0%, #b83b5e 55%, #f08a5d 85%, #f9ed69 120%)' },
    'mz-ocean':    { label: 'Ocean',     css: 'radial-gradient(110% 70% at 80% 0%, #4facfe 0%, transparent 60%), radial-gradient(100% 80% at 0% 100%, #00f2fe 0%, transparent 55%), linear-gradient(180deg, #0f2027, #203a43 50%, #2c5364)' },
    'mz-mint':     { label: 'Mint',      css: 'radial-gradient(100% 70% at 0% 0%, #a8ff78 0%, transparent 60%), radial-gradient(100% 70% at 100% 100%, #78ffd6 0%, transparent 60%), linear-gradient(180deg, #134e5e, #2f8f6f)' },
    'mz-graphite': { label: 'Graphite',  css: 'radial-gradient(90% 60% at 30% 20%, #5f6774 0%, transparent 60%), radial-gradient(80% 60% at 80% 90%, #3a3f47 0%, transparent 60%), linear-gradient(180deg, #1c1e22, #0b0c0e)' },
    'mz-purple':   { label: 'Deep Purple', css: 'radial-gradient(100% 60% at 50% 0%, #c471f5 0%, transparent 65%), radial-gradient(90% 70% at 50% 100%, #fa71cd 0%, transparent 60%), linear-gradient(180deg, #2b0a4a, #12052a)' },
    'mz-gold':     { label: 'Gold',      css: 'radial-gradient(100% 70% at 30% 10%, #fceabb 0%, transparent 55%), radial-gradient(100% 70% at 80% 100%, #f8b500 0%, transparent 60%), linear-gradient(180deg, #5c3d0e, #2b1b04)' },
    'mz-red':      { label: 'Product Red', css: 'radial-gradient(100% 70% at 20% 0%, #ff6b6b 0%, transparent 60%), radial-gradient(100% 80% at 90% 100%, #b31217 0%, transparent 60%), linear-gradient(180deg, #5a0b0f, #200304)' },
};
const DEFAULT_WALLPAPER = 'mz-aurora';

const Phone = {
    handlers: {},
    on(action, fn) { (this.handlers[action] = this.handlers[action] || []).push(fn); },
    emit(action, data) { (this.handlers[action] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },

    nav: null,
    page: 0,
    pages: 1,
    bannerTimer: null,
    bannerActive: false,
    callMinimized: false,
    clockTick: null,

    /* ================= open / close ================= */
    /** App Store data + media address (asked once, then pushed by the server) */
    async boot(force) {
        if (this._booted && !force) return;
        const b = await nui('mz:boot');
        if (!b || typeof b !== 'object') return;
        this._booted = true;
        S.installed = Array.isArray(b.installed) ? b.installed : Object.values(b.installed || {});
        S.catalog = Array.isArray(b.catalog) ? b.catalog : Object.values(b.catalog || {});
        S.ratings = b.ratings || {};
        S.stations = Array.isArray(b.stations) ? b.stations : Object.values(b.stations || {});
        S.maxVideo = Number(b.maxVideo) || 30;
        if (typeof b.mediaBase === 'string') Media.base = b.mediaBase;
        this.renderHome();
    },

    setInstalled(list) {
        S.installed = Array.isArray(list) ? list : Object.values(list || {});
        this.renderHome();
        if (S.currentApp && !this.installedApps().includes(S.currentApp) && S.currentApp !== 'store') this.closeApp();
    },

    show(data) {
        S.open = true;
        this.boot();
        if (data) {
            if (data.PlayerData) S.player = data.PlayerData;
            if (data.AppData) S.appsCfg = data.AppData;
            if (data.CallData) S.call = data.CallData;
            if (data.Tweets) S.tweets = data.Tweets;
        }
        const phone = $('#phone');
        phone.classList.remove('is-hidden', 'is-peek', 'is-peek-small');
        this.applySettings();
        this.renderHome();
        this.renderLock();
        this.lock(true);
        this.refreshCall();
        this.refreshWorld();
        if (Store.get('faceId')) setTimeout(() => { if (S.open) this.unlock(true); }, 650); // Face ID recognises the owner
        this.updateChrome();
    },

    hide(silent) {
        if (!S.open) return;
        S.open = false;
        if (S.currentApp === 'camera') this.closeApp(true); // stop filming when the phone is put away
        UI.closeModals();
        $('#viewer').classList.remove('show');
        this.closePanels();
        this.closeSpotlight();
        $('#passcode') && $('#passcode').classList.remove('show');
        if (!silent) nui('Close');
        this.updatePeek();
    },

    /* ================= lock screen ================= */
    lock(instant) {
        S.locked = true;
        const ls = $('#lockscreen');
        if (instant) ls.classList.add('no-anim');
        ls.classList.remove('unlocked');
        $('#screen').classList.add('locked');
        if (instant) { void ls.offsetWidth; ls.classList.remove('no-anim'); }
        this.renderLock();
        this.updateChrome();
    },

    async unlock(face) {
        if (!S.locked) return;
        if (Store.get('passcode') && !face) return this.showPasscode();
        const ic = $('.lock-icon');
        if (ic) { ic.classList.add('scan'); ic.innerHTML = '<i class="fa-solid fa-lock-open"></i>'; }
        await sleep(280);
        S.locked = false;
        $('#lockscreen').classList.add('unlocked');
        $('#screen').classList.remove('locked');
        this.updateChrome();
        this.runUnlockHooks();
    },

    runUnlockHooks() {
        if (this._afterUnlock) { const f = this._afterUnlock; this._afterUnlock = null; f(); }
        if (this._airdropPending) { const f = this._airdropPending; this._airdropPending = null; setTimeout(f, 400); }
    },

    renderLock() {
        const ls = $('#lockscreen');
        const d = new Date();
        const notifs = S.notifications.slice(0, 6);
        ls.innerHTML = `
            <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
            <div class="lock-date">${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
            <div class="lock-time" id="lock-time">${this.timeString()}</div>
            <div class="lock-notifs">${notifs.map((n) => this.bannerHTML(n)).join('')}</div>
            <div class="lock-bottom">
                <div class="lock-round ${this._torch ? 'on' : ''}" id="lock-torch"><i class="fa-solid fa-lightbulb"></i></div>
                <div class="lock-round" id="lock-camera"><i class="fa-solid fa-camera"></i></div>
            </div>
            <div class="lock-hint">Swipe up to open</div>`;
        $('#lock-torch', ls).onclick = (e) => { e.stopPropagation(); this._torch = !this._torch; e.currentTarget.classList.toggle('on', this._torch); };
        $('#lock-camera', ls).onclick = (e) => { e.stopPropagation(); this._afterUnlock = () => this.openApp('camera'); this.unlock(); };
    },

    showPasscode() {
        let pc = $('#passcode');
        if (!pc) {
            pc = el(`<div id="passcode" class="passcode">
                <div class="pc-title">Enter Passcode</div>
                <div class="pc-dots"><span></span><span></span><span></span><span></span></div>
                <div class="pc-pad">${[['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['', ''], ['0', ''], ['', '']]
                    .map(([n, l]) => `<div class="pc-key ${n ? '' : 'blank'}" data-k="${n}">${n}<small>${l}</small></div>`).join('')}</div>
                <div class="pc-cancel">Cancel</div></div>`);
            $('#screen').appendChild(pc);
            pc._val = '';
            pc.addEventListener('click', (e) => {
                if (e.target.closest('.pc-cancel')) { pc.classList.remove('show'); pc._val = ''; this.paintDots(pc); return; }
                const k = e.target.closest('.pc-key'); if (!k || !k.dataset.k) return;
                pc._val += k.dataset.k;
                this.paintDots(pc);
                if (pc._val.length === 4) {
                    if (pc._val === Store.get('passcode')) {
                        setTimeout(() => {
                            pc.classList.remove('show'); pc._val = ''; this.paintDots(pc);
                            S.locked = false;
                            $('#lockscreen').classList.add('unlocked');
                            $('#screen').classList.remove('locked');
                            this.updateChrome();
                            this.runUnlockHooks();
                        }, 150);
                    } else {
                        const dots = $('.pc-dots', pc);
                        dots.classList.add('shake');
                        setTimeout(() => { dots.classList.remove('shake'); pc._val = ''; this.paintDots(pc); }, 450);
                    }
                }
            });
        }
        pc.classList.add('show');
    },
    paintDots(pc) { $$('.pc-dots span', pc).forEach((s, i) => s.classList.toggle('on', i < pc._val.length)); },

    timeString() {
        const h = Number(S.time.hour) || 0;
        return `${h}:${pad2(S.time.minute)}`;
    },

    setTime(t) {
        if (!t) return;
        S.time = t;
        const str = this.timeString();
        $('#sb-time').textContent = str;
        const lt = $('#lock-time'); if (lt) lt.textContent = str;
        Phone.emit('mz:time', t);
    },

    /* ================= home screen ================= */
    isAllowed(cfg) {
        if (!cfg) return false;
        const job = (S.job && S.job.name) || (S.player.job && S.player.job.name);
        const onduty = (S.job && S.job.onduty) !== undefined ? S.job.onduty : (S.player.job && S.player.job.onduty);
        if (cfg.job && cfg.job !== job) return false;
        if (Array.isArray(cfg.blockedjobs) && cfg.blockedjobs.includes(job) && onduty) return false;
        return true;
    },

    installedApps() {
        if (Array.isArray(S.installed)) {
            return S.installed.filter((id) => Apps.get(id) && (!S.appsCfg[id] || this.isAllowed(S.appsCfg[id])));
        }
        const hidden = Store.get('hidden') || [];
        const ids = [];
        Object.keys(S.appsCfg || {}).forEach((id) => {
            if (this.isAllowed(S.appsCfg[id]) && !hidden.includes(id)) ids.push(id);
        });
        BUILTIN_APPS.forEach((id) => { if (!hidden.includes(id) && !ids.includes(id)) ids.push(id); });
        return ids;
    },

    label(id) {
        const cfg = S.appsCfg[id];
        return APP_LABELS[id] || (cfg && cfg.tooltipText) || id;
    },

    appIconHTML(id, withLabel = true) {
        const cfg = S.appsCfg[id] || {};
        const alerts = Number(cfg.Alerts) || 0;
        return `<div class="app-icon" data-app="${esc(id)}">
            ${iconHTML(id, cfg)}${alerts > 0 ? `<span class="badge">${alerts > 99 ? '99+' : alerts}</span>` : ''}
            ${withLabel ? `<span class="app-label">${esc(this.label(id))}</span>` : ''}
        </div>`;
    },

    renderHome() {
        const apps = this.installedApps();
        const dock = DOCK_APPS.filter((a) => apps.includes(a));
        const rest = apps.filter((a) => !dock.includes(a));
        const ordered = HOME_ORDER.filter((a) => rest.includes(a))
            .concat(rest.filter((a) => !HOME_ORDER.includes(a)).sort((a, b) => ((S.appsCfg[a] || {}).slot || 99) - ((S.appsCfg[b] || {}).slot || 99)));

        const pages = [];
        pages.push(ordered.slice(0, 12));
        for (let i = 12; i < ordered.length; i += 20) pages.push(ordered.slice(i, i + 20));

        const pagesEl = $('#home-pages');
        pagesEl.innerHTML = pages.map((p, i) => `<div class="home-page">${i === 0 ? this.widgetsHTML() : ''}${p.map((id) => this.appIconHTML(id)).join('')}</div>`).join('');
        $('#dock').innerHTML = dock.map((id) => this.appIconHTML(id, false)).join('');
        this.pages = pages.length;
        this.page = Math.min(this.page, this.pages - 1);
        $('#home-dots').innerHTML = pages.map((_, i) => `<span data-p="${i}" class="${i === this.page ? 'active' : ''}"></span>`).join('');
        this.goPage(this.page);
        $('#home').classList.toggle('dark-widgets', !!Store.get('dark'));
    },

    widgetsHTML() {
        const w = S.world;
        const wx = Weather.info(w);
        const night = w ? (w.hour < 6 || w.hour >= 20) : false;
        const d = new Date();
        const todayKey = localKey(d);
        const ev = (Store.get('events') || []).filter((e) => e.date === todayKey).sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 2);
        return `
        <div class="widget widget-weather ${wx.rain ? 'rain' : night ? 'night' : ''}" data-app="weather">
            <div class="w-city">${esc(w ? (w.zone || 'Los Santos') : 'Los Santos')} <i class="fa-solid fa-location-arrow" style="font-size:.7rem"></i></div>
            <div class="w-temp">${wx.temp}°</div>
            <div class="w-ic"><i class="${wx.icon}"></i></div>
            <div class="w-cond">${esc(wx.label)}</div>
            <div class="w-range">H:${wx.high}° L:${wx.low}°</div>
        </div>
        <div class="widget widget-cal" data-app="calendar">
            <div class="c-day">${DAYS[d.getDay()]}</div>
            <div class="c-num">${d.getDate()}</div>
            ${ev.length ? ev.map((e) => `<div class="c-ev">${esc(e.title)}<small>${esc(e.time || 'All day')}</small></div>`).join('') : '<div class="c-empty">No events today</div>'}
        </div>`;
    },

    goPage(i) {
        this.page = clamp(i, 0, this.pages - 1);
        $('#home-pages').style.transform = `translateX(${-100 * this.page}%)`;
        $$('#home-dots span').forEach((s, k) => s.classList.toggle('active', k === this.page));
    },

    refreshBadges(appData) {
        if (appData) {
            Object.keys(appData).forEach((k) => {
                if (S.appsCfg[k]) S.appsCfg[k].Alerts = appData[k].Alerts;
                else S.appsCfg[k] = appData[k];
            });
        }
        $$('.app-icon[data-app]').forEach((ic) => {
            const cfg = S.appsCfg[ic.dataset.app];
            const n = cfg ? Number(cfg.Alerts) || 0 : 0;
            let b = $('.badge', ic);
            if (n > 0) {
                if (!b) { b = el('<span class="badge"></span>'); ic.querySelector('.icon').after(b); }
                b.textContent = n > 99 ? '99+' : n;
            } else if (b) b.remove();
        });
    },

    async refreshWorld() {
        const w = await nui('mz:getWorld');
        if (w && typeof w === 'object') {
            S.world = w;
            const ww = $('.widget-weather');
            if (ww) {
                const tmp = el(`<div>${this.widgetsHTML()}</div>`);
                ww.replaceWith(tmp.children[0]);
            }
        }
        return S.world;
    },

    /* ================= apps ================= */
    openApp(id, opts = {}) {
        if (S.locked) { this._afterUnlock = () => this.openApp(id, opts); return this.unlock(); }
        const def = Apps.get(id);
        if (!def) {
            this.notify({ title: 'System', text: `${this.label(id)} is not available.`, icon: 'fa-solid fa-circle-exclamation', color: '#ff3b30' });
            return;
        }
        this.closeSpotlight();
        this.closePanels();
        if (def.action) return def.action(opts);

        if (S.currentApp && S.currentApp !== id) this.closeApp(true);
        if (S.currentApp === id) {
            if (opts && Object.keys(opts).length && def.onReopen) def.onReopen(opts);
            return;
        }

        const win = $('#app-window');
        win.innerHTML = '';
        win.className = 'app-window';
        // zoom from the icon
        const ic = $(`#home .app-icon[data-app="${id}"] .icon`);
        const scr = $('#screen').getBoundingClientRect();
        if (ic) {
            const r = ic.getBoundingClientRect();
            win.style.transformOrigin = `${r.left + r.width / 2 - scr.left}px ${r.top + r.height / 2 - scr.top}px`;
        } else {
            win.style.transformOrigin = '50% 60%';
        }
        if (def.dark || Store.get('dark')) win.classList.add('dark');
        this.nav = new Nav(win);
        S.currentApp = id;
        $('#screen').classList.add('app-open');
        try {
            def.open(this.nav, opts);
        } catch (e) { console.error(e); }
        requestAnimationFrame(() => win.classList.add('open'));
        this.updateChrome();
    },

    closeApp(instant) {
        if (!S.currentApp) return;
        const def = Apps.get(S.currentApp);
        try { def && def.onClose && def.onClose(); } catch (e) { console.error(e); }
        const win = $('#app-window');
        S.currentApp = null;
        this.nav = null;
        UI.closeModals();
        $('#screen').classList.remove('app-open');
        if (instant) {
            win.className = 'app-window';
            win.innerHTML = '';
        } else {
            win.classList.add('closing');
            win.classList.remove('open');
            setTimeout(() => { if (!S.currentApp) { win.innerHTML = ''; win.className = 'app-window'; } }, 450);
        }
        this.updateChrome();
    },

    goHome() {
        if ($('#modal-layer').children.length) { UI.closeModals(); return; }
        if (this.panelOpen()) return this.closePanels();
        if ($('#spotlight').classList.contains('show')) return this.closeSpotlight();
        if (this.callScreenVisible()) { this.callMinimized = true; this.refreshCall(); return; }
        if (S.currentApp) return this.closeApp();
        if (this.page !== 0) return this.goPage(0);
    },

    clearAlerts(app) {
        if (S.appsCfg[app] && S.appsCfg[app].Alerts > 0) {
            nui('ClearGeneralAlerts', { app });
            S.appsCfg[app].Alerts = 0;
            this.refreshBadges();
        }
    },

    /* ================= chrome (status bar / indicator) ================= */
    updateChrome() {
        const def = S.currentApp ? Apps.get(S.currentApp) : null;
        const lightApp = !!(def && !Store.get('dark') && !def.dark);
        const overlay = this.panelOpen() || this.callScreenVisible() || $('#spotlight').classList.contains('show') || S.locked;
        const darkText = lightApp && !overlay;
        $('#statusbar').classList.toggle('dark-text', darkText);
        $('#home-indicator').classList.toggle('dark', darkText);
        $('#sb-dnd').classList.toggle('hidden', !Store.get('dnd'));
        $('#sb-plane').classList.toggle('hidden', !Store.get('airplane'));
        $('#sb-signal').classList.toggle('hidden', !!Store.get('airplane'));
        $('#sb-wifi').classList.toggle('hidden', !Store.get('wifi'));
        $('#home-indicator').classList.toggle('hide', S.locked && !this.callScreenVisible());
    },

    applySettings() {
        document.documentElement.style.setProperty('--scale', (Number(Store.get('scale')) || 100) / 100);
        const dark = !!Store.get('dark');
        $('#app-window').classList.toggle('dark', dark || !!(S.currentApp && Apps.get(S.currentApp) && Apps.get(S.currentApp).dark));
        $('#modal-layer').classList.toggle('dark', dark);
        $('#banner-layer').classList.toggle('dark', dark);
        $('#nc').classList.toggle('dark', dark);
        $('#dimmer').style.opacity = ((100 - (Number(Store.get('brightness')) || 100)) / 100 * 0.75).toFixed(2);
        this.applyWallpaper();
        this.updateChrome();
    },

    applyWallpaper() {
        let bg = S.meta && S.meta.background;
        const wp = $('#wallpaper');
        if (!bg || bg === 'default-qbcore' || bg === 'default') bg = DEFAULT_WALLPAPER;
        if (WALLPAPERS[bg]) {
            wp.style.backgroundImage = WALLPAPERS[bg].css;
        } else {
            const set = (u) => { wp.style.backgroundImage = `url('${String(u).replace(/'/g, '%27')}'), ${WALLPAPERS[DEFAULT_WALLPAPER].css}`; };
            if (Media.isToken(bg) && !Media.base) Media.resolve(bg).then(set).catch(() => {});
            else set(Media.url(bg));
        }
    },

    /* ================= notifications ================= */
    appFromNotification(n) {
        const t = `${n.title || ''} ${n.icon || ''}`.toLowerCase();
        if (n.app) return n.app;
        if (/whatsapp|message|fa-comment/.test(t)) return 'whatsapp';
        if (/mail|envelope/.test(t)) return 'mail';
        if (/bank|wallet|university|money/.test(t)) return 'bank';
        if (/tweet|twitter/.test(t)) return 'x';
        if (/marketplace/.test(t)) return 'market';
        if (/uber|fa-taxi|\bride\b/.test(t)) return 'ride';
        if (/1xbet|fa-trophy/.test(t)) return 'bet';
        if (/tinder|match/.test(t)) return 'tinder';
        if (/airdrop/.test(t)) return 'gallery';
        if (/carrier|sim-card/.test(t)) return 'settings';
        if (/advert|fa-ad\b|bullhorn/.test(t)) return 'advert';
        if (/racing|flag-checkered/.test(t)) return 'racing';
        if (/crypto|chart-pie/.test(t)) return 'crypto';
        if (/phone|call/.test(t)) return 'phone';
        if (/settings|paint-brush/.test(t)) return 'settings';
        if (/garage|vehicle/.test(t)) return 'garage';
        if (/alarm|timer|clock/.test(t)) return 'clock';
        if (/calendar/.test(t)) return 'calendar';
        return null;
    },

    bannerHTML(n) {
        let icon;
        if (n.app && ICONS[n.app]) {
            icon = iconHTML(n.app).replace('class="icon"', 'class="b-icon icon" ');
        } else {
            icon = `<div class="b-icon" style="background:${esc(n.color || '#8e8e93')}"><i class="${esc(n.icon || 'fa-solid fa-bell')}"></i></div>`;
        }
        return `<div class="banner" data-nid="${n.id}">${icon}<div class="b-body"><div class="b-head"><span class="b-title">${esc(n.title || 'Notification')}</span><span class="b-time">${n.when ? timeAgo(n.when) : 'now'}</span></div><div class="b-text">${safeHTML(n.text || '')}</div></div></div>`;
    },

    async notify(n) {
        n = Object.assign({}, n);
        n.id = uid();
        n.when = Date.now();
        n.app = this.appFromNotification(n);
        if (n.title) n.title = String(n.title).replace(/&#36;/g, '$');
        if (n.text) n.text = String(n.text).replace(/&#36;/g, '$');
        S.notifications.unshift(n);
        if (S.notifications.length > 40) S.notifications.length = 40;
        if ($('#nc').classList.contains('show')) this.renderNC();
        if (S.locked && S.open) this.renderLock();
        if (Store.get('dnd')) return;

        if (!S.open) {
            const has = await nui('HasPhone');
            if (has === false) return;
        }
        const layer = $('#banner-layer');
        layer.innerHTML = '';
        const b = el(this.bannerHTML(n));
        layer.appendChild(b);
        b.onclick = () => {
            b.classList.remove('show');
            if (S.open && n.onTap) n.onTap();
            else if (S.open && n.app) this.openApp(n.app);
        };
        requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('show')));
        this.bannerActive = true;
        this.updatePeek();
        clearTimeout(this.bannerTimer);
        const timeout = Math.max(1800, Number(n.timeout) || 3200);
        this.bannerTimer = setTimeout(() => {
            b.classList.remove('show');
            setTimeout(() => { b.remove(); this.bannerActive = false; this.updatePeek(); }, 450);
        }, timeout);
    },

    updatePeek() {
        const phone = $('#phone');
        if (S.open) { phone.classList.remove('is-hidden', 'is-peek', 'is-peek-small'); return; }
        const c = S.call || {};
        phone.classList.remove('is-peek', 'is-peek-small', 'is-hidden');
        if (c.InCall && c.CallType === 'incoming') phone.classList.add('is-peek');
        else if (this.bannerActive) phone.classList.add('is-peek');
        else if (c.InCall) phone.classList.add('is-peek-small');
        else phone.classList.add('is-hidden');
        if (!phone.classList.contains('is-hidden')) {
            // when peeking the user sees the lock screen
            if (!S.locked) this.lock(true);
        }
    },

    /* ================= Dynamic Island + calls ================= */
    callScreenVisible() { return $('#call-screen').classList.contains('show'); },

    callName() {
        const t = (S.call && S.call.TargetData) || {};
        if (t.anonymous && S.call.CallType === 'incoming') return 'Unknown';
        return t.name || t.number || 'Unknown';
    },

    callTime() {
        const s = Number(S.call.CallTime) || 0;
        return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
    },

    startCall(number, name) {
        number = String(number || '').trim();
        if (!number) return;
        name = name || Phone.contactName(number);
        const cData = { number, name };
        if (number === String(S.player.charinfo && S.player.charinfo.phone)) {
            return this.notify({ app: 'phone', title: 'Phone', text: "You can't call yourself!" });
        }
        if (Store.get('airplane')) return this.notify({ app: 'phone', title: 'Phone', text: 'Turn off Airplane Mode to make calls.' });
        nui('CallContact', { ContactData: cData, Anonymous: !!Store.get('anonymous') }).then((st) => {
            if (!st) return;
            if (!st.IsOnline) return this.notify({ app: 'phone', title: 'Phone', text: `${name} is not available right now.` });
            if (!st.CanCall) return this.notify({ app: 'phone', title: 'Phone', text: `${name} is busy.` });
            if (st.InCall) return this.notify({ app: 'phone', title: 'Phone', text: "You're already in a call!" });
            S.call = { InCall: true, CallType: 'outgoing', AnsweredCall: false, TargetData: cData };
            this.callMinimized = false;
            this.refreshCall();
            if (Store.get('anonymous')) this.notify({ app: 'phone', title: 'Phone', text: 'Calling with hidden caller ID.' });
        });
    },

    refreshCall() {
        const c = S.call || {};
        const cs = $('#call-screen');
        const isl = $('#island');
        const inner = $('.island-inner', isl);
        isl.className = 'island';

        if (!c.InCall) {
            cs.classList.remove('show');
            this.callMinimized = false;
            inner.innerHTML = '';
            if (typeof Radio !== 'undefined') Radio.island(); // music Live Activity
            this.updatePeek();
            this.updateChrome();
            return;
        }
        const name = this.callName();
        // Dynamic Island content
        if (!S.open && c.CallType === 'incoming') {
            isl.classList.add('tall', 'has-content');
            inner.innerHTML = `<div class="island-tall"><div class="isl-row">${avatarHTML(name, null)}<div class="isl-text"><div class="isl-sub">${c.TargetData && c.TargetData.anonymous ? 'No Caller ID' : 'mobile'}</div><div class="isl-title" style="font-size:1.2rem">${esc(name)}</div></div>
                <div class="island-btns"><span class="round-btn red"><i class="fa-solid fa-phone" style="transform:rotate(135deg)"></i></span><span class="round-btn green"><i class="fa-solid fa-phone"></i></span></div></div>
                <div class="hint">Open your phone to answer</div></div>`;
        } else {
            isl.classList.add('compact', 'has-content');
            const right = c.CallType === 'ongoing' ? `<span class="isl-green">${this.callTime()}</span>` : c.CallType === 'incoming' ? '<span class="isl-green">Incoming</span>' : '<span class="isl-green">Calling…</span>';
            inner.innerHTML = `<div class="isl-left"><i class="fa-solid fa-phone isl-green"></i>${c.CallType === 'ongoing' ? '<span class="wave"><i></i><i></i><i></i><i></i></span>' : ''}</div><div class="isl-right">${right}</div>`;
        }

        // Full-screen call UI
        if (S.open && !this.callMinimized) {
            this.renderCallScreen();
            cs.classList.add('show');
        } else {
            cs.classList.remove('show');
        }
        this.updatePeek();
        this.updateChrome();
    },

    renderCallScreen() {
        const c = S.call;
        const cs = $('#call-screen');
        const name = this.callName();
        const status = c.CallType === 'incoming' ? (c.TargetData && c.TargetData.anonymous ? 'No Caller ID' : 'incoming call…')
            : c.CallType === 'outgoing' ? 'calling…' : this.callTime();
        const pic = null;
        const wp = $('#wallpaper').style.backgroundImage;
        if (c.CallType === 'incoming') {
            cs.innerHTML = `<div class="call-bg" style="background-image:${wp}"></div>
                ${avatarHTML(name, pic, 'lg')}
                <div class="call-name">${esc(name)}</div>
                <div class="call-status" id="call-status">${esc(status)}</div>
                <div class="call-extra"><div id="call-remind"><i class="fa-solid fa-clock"></i>Remind Me</div><div id="call-msg"><i class="fa-solid fa-comment"></i>Message</div></div>
                <div class="call-incoming">
                    <div class="ci decline" id="call-decline"><span><i class="fa-solid fa-phone"></i></span>Decline</div>
                    <div class="ci accept" id="call-accept"><span><i class="fa-solid fa-phone"></i></span>Accept</div>
                </div>`;
            $('#call-decline', cs).onclick = () => nui('DenyIncomingCall');
            $('#call-accept', cs).onclick = () => nui('AnswerCall');
            $('#call-remind', cs).onclick = () => { nui('DenyIncomingCall'); this.addReminder(name, c.TargetData && c.TargetData.number); };
            $('#call-msg', cs).onclick = () => {
                const num = c.TargetData && c.TargetData.number;
                nui('DenyIncomingCall');
                if (num && !(c.TargetData && c.TargetData.anonymous)) setTimeout(() => this.openApp('whatsapp', { number: num, name }), 300);
            };
        } else {
            const muted = !!this._muted, speaker = !!this._speaker;
            cs.innerHTML = `<div class="call-bg" style="background-image:${wp}"></div>
                ${avatarHTML(name, pic, 'lg')}
                <div class="call-name">${esc(name)}</div>
                <div class="call-status" id="call-status">${esc(status)}</div>
                <div class="call-grid">
                    <div class="call-btn ${muted ? 'on' : ''}" data-cb="mute"><span><i class="fa-solid fa-microphone-slash"></i></span>mute</div>
                    <div class="call-btn" data-cb="keypad"><span><i class="fa-solid fa-table-cells"></i></span>keypad</div>
                    <div class="call-btn ${speaker ? 'on' : ''}" data-cb="speaker"><span><i class="fa-solid fa-volume-high"></i></span>speaker</div>
                    <div class="call-btn" data-cb="add"><span><i class="fa-solid fa-plus"></i></span>add call</div>
                    <div class="call-btn" data-cb="video"><span><i class="fa-solid fa-video"></i></span>FaceTime</div>
                    <div class="call-btn" data-cb="contacts"><span><i class="fa-solid fa-address-book"></i></span>contacts</div>
                </div>
                <div class="call-end" id="call-end"><i class="fa-solid fa-phone"></i></div>`;
            $('#call-end', cs).onclick = () => nui(c.CallType === 'outgoing' ? 'CancelOutgoingCall' : 'CancelOngoingCall');
            $('.call-grid', cs).addEventListener('click', (e) => {
                const b = e.target.closest('.call-btn'); if (!b) return;
                const k = b.dataset.cb;
                if (k === 'mute') { this._muted = !this._muted; b.classList.toggle('on', this._muted); }
                else if (k === 'speaker') { this._speaker = !this._speaker; b.classList.toggle('on', this._speaker); }
                else if (k === 'contacts' || k === 'add' || k === 'keypad') { this.callMinimized = true; this.refreshCall(); this.openApp('phone', { tab: k === 'keypad' ? 'keypad' : 'contacts' }); }
                else if (k === 'video') UI.hud('fa-solid fa-video-slash', 'FaceTime unavailable');
            });
        }
    },

    addReminder(name, number) {
        const events = Store.get('events') || [];
        const d = new Date(Date.now() + 3600000);
        events.push({ id: uid(), date: localKey(d), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, title: `Call back ${name}${number ? ' (' + number + ')' : ''}` });
        Store.set('events', events);
        this.notify({ app: 'calendar', title: 'Reminder', text: `Call back ${name} in 1 hour.` });
    },

    /* ================= Notification + Control centre ================= */
    panelOpen() { return $('#nc').classList.contains('show') || $('#cc').classList.contains('show'); },
    closePanels() { $('#nc').classList.remove('show'); $('#cc').classList.remove('show'); this.updateChrome(); },

    toggleNC() {
        const nc = $('#nc');
        if (nc.classList.contains('show')) return this.closePanels();
        $('#cc').classList.remove('show');
        this.renderNC();
        nc.classList.add('show');
        this.updateChrome();
    },

    renderNC() {
        const nc = $('#nc');
        nc.innerHTML = `<div class="nc-head"><h2>Notifications</h2>${S.notifications.length ? '<div class="nc-clear" id="nc-clear"><i class="fa-solid fa-xmark"></i></div>' : ''}</div>
            <div class="nc-list">${S.notifications.length ? S.notifications.map((n) => this.bannerHTML(n)).join('') : '<div class="nc-empty"><i class="fa-regular fa-bell-slash" style="font-size:2.6rem;display:block;margin-bottom:.8rem"></i>No Older Notifications</div>'}</div>`;
        const c = $('#nc-clear', nc);
        if (c) c.onclick = (e) => { e.stopPropagation(); S.notifications = []; this.renderNC(); };
        $$('.banner', nc).forEach((b) => {
            b.onclick = (e) => {
                e.stopPropagation();
                const n = S.notifications.find((x) => x.id === b.dataset.nid);
                this.closePanels();
                if (n && n.onTap) n.onTap();
                else if (n && n.app) this.openApp(n.app);
            };
        });
    },

    toggleCC() {
        const cc = $('#cc');
        if (cc.classList.contains('show')) return this.closePanels();
        $('#nc').classList.remove('show');
        this.renderCC();
        cc.classList.add('show');
        this.updateChrome();
    },

    renderCC() {
        const cc = $('#cc');
        const st = (k) => !!Store.get(k);
        const bright = Number(Store.get('brightness')) || 100;
        const vol = Number(Store.get('volume')) || 0;
        cc.innerHTML = `<div class="cc-grid">
            <div class="cc-tile big">
                <div class="cc-dot ${st('airplane') ? 'on-orange' : ''}" data-cc="airplane"><i class="fa-solid fa-plane"></i></div>
                <div class="cc-dot ${!st('airplane') ? 'on-green' : ''}" data-cc="cellular"><i class="fa-solid fa-tower-cell"></i></div>
                <div class="cc-dot ${st('wifi') ? 'on-blue' : ''}" data-cc="wifi"><i class="fa-solid fa-wifi"></i></div>
                <div class="cc-dot ${st('bluetooth') ? 'on-blue' : ''}" data-cc="bluetooth"><i class="fa-brands fa-bluetooth-b"></i></div>
            </div>
            <div class="cc-tile big" style="grid-template-columns:1fr;place-items:start;cursor:pointer" data-cc="share">
                <div style="font-size:.85rem;opacity:.7">AirDrop</div>
                <div style="font-size:1rem;font-weight:600">Share my contact</div>
                <div class="cc-dot on-blue" style="justify-self:end;align-self:end"><i class="fa-solid fa-tower-broadcast"></i></div>
            </div>
            <div class="cc-tile ${st('anonymous') ? 'on' : ''}" data-cc="anonymous" title="Hide Caller ID"><i class="fa-solid fa-user-secret"></i></div>
            <div class="cc-tile ${st('dark') ? 'on' : ''}" data-cc="dark" title="Dark Mode"><i class="fa-solid fa-circle-half-stroke"></i></div>
            <div class="cc-tile cc-vslider" data-slider="brightness" style="grid-row:span 2"><div class="fill" style="height:${bright}%"></div><i class="fa-solid fa-sun"></i></div>
            <div class="cc-tile cc-vslider" data-slider="volume" style="grid-row:span 2"><div class="fill" style="height:${vol}%"></div><i class="fa-solid fa-volume-high"></i></div>
            <div class="cc-tile cc-label-tile ${st('dnd') ? 'on' : ''}" data-cc="dnd"><span class="cc-ic"><i class="fa-solid fa-moon"></i></span><span>Focus<small>${st('dnd') ? 'Do Not Disturb' : 'Off'}</small></span></div>
            <div class="cc-tile ${this._torch ? 'on' : ''}" data-cc="torch"><i class="fa-solid fa-lightbulb"></i></div>
            <div class="cc-tile" data-cc="clock"><i class="fa-solid fa-stopwatch"></i></div>
            <div class="cc-tile" data-cc="calculator"><i class="fa-solid fa-calculator"></i></div>
            <div class="cc-tile" data-cc="camera"><i class="fa-solid fa-camera"></i></div>
            <div class="cc-tile" data-cc="gps" title="Clear GPS"><i class="fa-solid fa-location-crosshairs"></i></div>
            <div class="cc-tile" data-cc="lock" title="Lock"><i class="fa-solid fa-lock"></i></div>
            <div class="cc-tile" data-cc="maps"><i class="fa-solid fa-map"></i></div>
            <div class="cc-tile" data-cc="notes"><i class="fa-solid fa-note-sticky"></i></div>
        </div><div class="cc-hint">Tap outside to close</div>`;

        cc.onclick = (e) => {
            const t = e.target.closest('[data-cc]');
            if (!t) { if (!e.target.closest('.cc-grid')) this.closePanels(); return; }
            const k = t.dataset.cc;
            const flip = (key) => { Store.set(key, !Store.get(key)); };
            switch (k) {
                case 'airplane': flip('airplane'); break;
                case 'cellular': if (Store.get('airplane')) flip('airplane'); break;
                case 'wifi': flip('wifi'); break;
                case 'bluetooth': flip('bluetooth'); break;
                case 'anonymous': flip('anonymous'); UI.hud('fa-solid fa-user-secret', Store.get('anonymous') ? 'Caller ID hidden' : 'Caller ID shown'); break;
                case 'dark': flip('dark'); this.applySettings(); this.renderHome(); this.rerenderApp(); break;
                case 'dnd': flip('dnd'); nui('mz:setDND', { state: Store.get('dnd') }); break;
                case 'torch': this._torch = !this._torch; break;
                case 'share': nui('mz:shareContact'); UI.hud('fa-solid fa-tower-broadcast', 'Contact shared nearby'); break;
                case 'gps': nui('mz:clearWaypoint'); UI.hud('fa-solid fa-location-crosshairs', 'GPS cleared'); break;
                case 'lock': this.closePanels(); this.closeApp(true); this.lock(); return;
                default: this.closePanels(); this.openApp(k); return;
            }
            this.renderCC();
            this.updateChrome();
        };
        $$('.cc-vslider', cc).forEach((sl) => {
            const set = (ev) => {
                const r = sl.getBoundingClientRect();
                let v = Math.round(clamp((r.bottom - ev.clientY) / r.height * 100, 5, 100));
                $('.fill', sl).style.height = v + '%';
                Store.set(sl.dataset.slider, v);
                if (sl.dataset.slider === 'brightness') this.applySettings();
            };
            sl.addEventListener('pointerdown', (ev) => {
                ev.stopPropagation();
                set(ev);
                const move = (e2) => set(e2);
                const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
            });
        });
    },

    rerenderApp() {
        if (!S.currentApp) return;
        const id = S.currentApp;
        this.closeApp(true);
        this.openApp(id);
    },

    /* ================= Spotlight ================= */
    openSpotlight() {
        const sp = $('#spotlight');
        sp.innerHTML = `<div class="spot-bar"><div class="spot-input"><i class="fa-solid fa-magnifying-glass"></i><input id="spot-q" placeholder="Search"></div><span class="spot-cancel">Cancel</span></div><div class="spot-results" id="spot-results"></div>`;
        sp.classList.add('show');
        const q = $('#spot-q', sp);
        const render = () => {
            const v = q.value.trim().toLowerCase();
            const apps = this.installedApps().filter((id) => !v || this.label(id).toLowerCase().includes(v));
            const contacts = v ? (S.contacts || []).filter((c) => (c.name || '').toLowerCase().includes(v) || String(c.number || '').includes(v)).slice(0, 8) : [];
            $('#spot-results', sp).innerHTML = `
                <div class="spot-title">${v ? 'Apps' : 'Siri Suggestions'}</div>
                <div class="spot-apps">${apps.slice(0, v ? 16 : 8).map((id) => this.appIconHTML(id)).join('')}</div>
                ${contacts.length ? `<div class="spot-title">Contacts</div>${contacts.map((c, i) => `<div class="spot-row" data-ci="${i}">${avatarHTML(c.name)}<div><div style="font-weight:600">${esc(c.name)}</div><div style="opacity:.6;font-size:.9rem">${esc(c.number)}</div></div></div>`).join('')}` : ''}`;
            $$('.spot-row', sp).forEach((r) => { r.onclick = () => { const c = contacts[Number(r.dataset.ci)]; this.closeSpotlight(); this.openApp('phone', { contact: c }); }; });
        };
        q.addEventListener('input', render);
        render();
        $('.spot-cancel', sp).onclick = () => this.closeSpotlight();
        setTimeout(() => q.focus(), 200);
        this.updateChrome();
    },
    closeSpotlight() { $('#spotlight').classList.remove('show'); this.updateChrome(); },

    /* ================= contacts helper ================= */
    contactName(number) {
        const c = (S.contacts || []).find((x) => String(x.number) === String(number));
        return c ? c.name : String(number);
    },
};

/* ---------- Weather model (shared by widget + app) ---------- */
const Weather = {
    TYPES: {
        EXTRASUNNY: { label: 'Sunny', icon: 'fa-solid fa-sun', base: 31 },
        CLEAR: { label: 'Clear', icon: 'fa-solid fa-sun', base: 27 },
        NEUTRAL: { label: 'Mostly Clear', icon: 'fa-solid fa-cloud-sun', base: 24 },
        SMOG: { label: 'Haze', icon: 'fa-solid fa-smog', base: 25 },
        FOGGY: { label: 'Foggy', icon: 'fa-solid fa-smog', base: 17 },
        OVERCAST: { label: 'Overcast', icon: 'fa-solid fa-cloud', base: 19 },
        CLOUDS: { label: 'Cloudy', icon: 'fa-solid fa-cloud', base: 21 },
        CLEARING: { label: 'Clearing', icon: 'fa-solid fa-cloud-sun-rain', base: 18, rain: true },
        RAIN: { label: 'Rain', icon: 'fa-solid fa-cloud-rain', base: 15, rain: true },
        THUNDER: { label: 'Thunderstorms', icon: 'fa-solid fa-cloud-bolt', base: 14, rain: true },
        SNOW: { label: 'Snow', icon: 'fa-solid fa-snowflake', base: -1, rain: true },
        BLIZZARD: { label: 'Blizzard', icon: 'fa-solid fa-snowflake', base: -6, rain: true },
        SNOWLIGHT: { label: 'Light Snow', icon: 'fa-regular fa-snowflake', base: 1, rain: true },
        XMAS: { label: 'Snow', icon: 'fa-solid fa-snowflake', base: -2, rain: true },
        HALLOWEEN: { label: 'Spooky', icon: 'fa-solid fa-ghost', base: 12 },
        RAIN_HALLOWEEN: { label: 'Rain', icon: 'fa-solid fa-cloud-rain', base: 11, rain: true },
        SNOW_HALLOWEEN: { label: 'Snow', icon: 'fa-solid fa-snowflake', base: 0, rain: true },
    },
    info(w) {
        const type = (w && w.weather) || 'CLEAR';
        const t = this.TYPES[type] || this.TYPES.CLEAR;
        const hour = w ? Number(w.hour) : 12;
        const night = hour < 6 || hour >= 20;
        const daily = Math.round(Math.sin(((hour - 9) / 24) * Math.PI * 2) * 4);
        let icon = t.icon;
        if (night && (type === 'CLEAR' || type === 'EXTRASUNNY')) icon = 'fa-solid fa-moon';
        if (night && type === 'NEUTRAL') icon = 'fa-solid fa-cloud-moon';
        return { type, label: night && (type === 'CLEAR' || type === 'EXTRASUNNY') ? 'Clear' : t.label, icon, temp: t.base + daily, high: t.base + 4, low: t.base - 5, rain: !!t.rain, night };
    },
};
