/* Advanced phone functions: battery, flashlight, Emergency SOS, Find My, Siri commands, breaking news */
'use strict';

/* ================= Battery ================= */
S.battery = { level: 100, charging: false, enabled: true };

Phone.paintBattery = function () {
    const b = S.battery;
    const bat = $('.sb-battery');
    if (!bat) return;
    bat.classList.toggle('low', b.level <= 20 && !b.charging);
    bat.classList.toggle('charging', !!b.charging);
    bat.classList.toggle('hidden', b.enabled === false);
    $('.sb-battery-level', bat).style.width = Math.max(4, b.level) + '%';
    bat.title = `${b.level}%`;
    const lc = $('#lock-charge');
    if (lc) {
        lc.innerHTML = b.charging ? `<i class="fa-solid fa-bolt"></i> Charging · ${b.level}%` : '';
        lc.classList.toggle('show', !!b.charging);
    }
};

Phone.on('mz:battery', (d) => {
    S.battery = { level: Number(d.level) || 0, charging: !!d.charging, source: d.source, enabled: d.enabled !== false };
    Phone.paintBattery();
    const cc = $('#cc');
    if (cc && cc.classList.contains('show')) { const t = $('.cc-battery b', cc); if (t) t.textContent = `${S.battery.level}%`; }
});

Phone.on('mz:lowBattery', (d) => {
    if (!S.open) return;
    UI.alert({ title: 'Low Battery', text: `${d.level}% of battery remaining. Charge your phone in a vehicle, at home or with a power bank.`, buttons: [{ text: 'Close', style: 'bold', value: true }] });
});

/* ================= Flashlight (real light in game) ================= */
Phone.setTorch = function (on) {
    this._torch = !!on;
    nui('mz:torch', { on: this._torch });
    const lt = $('#lock-torch'); if (lt) lt.classList.toggle('on', this._torch);
    if ($('#cc').classList.contains('show')) this.renderCC();
};
Phone.on('mz:torch', (d) => {
    Phone._torch = !!d.on;
    const lt = $('#lock-torch'); if (lt) lt.classList.toggle('on', Phone._torch);
});

/* lock screen: real torch + charging line */
(() => {
    const render = Phone.renderLock.bind(Phone);
    Phone.renderLock = function () {
        render();
        const ls = $('#lockscreen');
        const t = $('#lock-torch', ls);
        if (t) t.onclick = (e) => { e.stopPropagation(); Phone.setTorch(!Phone._torch); };
        const time = $('#lock-time', ls);
        if (time && !$('#lock-charge', ls)) time.after(el('<div class="lock-charge" id="lock-charge"></div>'));
        Phone.paintBattery();
    };
})();

/* ================= Emergency SOS ================= */
const SOS = {
    async open() {
        const r = await UI.alert({
            title: 'Emergency SOS',
            text: 'Your location is sent to the emergency services that are on duty.',
            buttons: [{ text: 'Police', style: 'red bold', value: 'police' }, { text: 'Ambulance', style: 'red bold', value: 'ems' }, { text: 'Cancel', value: false }],
        });
        if (!r.value) return;
        const res = await nui('mz:emergency', { kind: r.value, sos: true, text: 'Emergency SOS' });
        if (!res || res.error) return UI.hud('fa-solid fa-triangle-exclamation', (res && res.error) || 'Could not send', 2200);
        UI.alert({
            title: res.sent > 0 ? 'Help is on the way' : 'SOS sent',
            text: res.sent > 0 ? `${res.sent} ${r.value === 'ems' ? 'medic' : 'officer'}${res.sent === 1 ? '' : 's'} received your location.` : 'Nobody is on duty right now. Your alert was still sent.',
            buttons: [{ text: 'OK', style: 'bold', value: true }],
        });
    },
};

/* Control Centre: Emergency SOS + battery tiles, real torch */
(() => {
    const render = Phone.renderCC.bind(Phone);
    Phone.renderCC = function () {
        render();
        const grid = $('#cc .cc-grid');
        if (!grid) return;
        const torch = $('[data-cc="torch"]', grid);
        if (torch) { torch.removeAttribute('data-cc'); torch.dataset.torch = '1'; }
        grid.appendChild(el(`<div class="cc-tile cc-sos" data-sos="1" title="Emergency SOS"><b>SOS</b></div>`));
        grid.appendChild(el(`<div class="cc-tile cc-battery ${S.battery.charging ? 'on' : ''}" title="Battery"><i class="fa-solid ${S.battery.charging ? 'fa-bolt' : 'fa-battery-three-quarters'}"></i><b>${S.battery.level}%</b></div>`));
        grid.onclick = (e) => {
            if (e.target.closest('[data-torch]')) { e.stopPropagation(); Phone.setTorch(!Phone._torch); }
            else if (e.target.closest('[data-sos]')) { e.stopPropagation(); Phone.closePanels(); SOS.open(); }
        };
    };
})();

/* alerts for police / EMS on duty */
Phone.on('mz:emergencyAlert', (d) => {
    const a = d.alert || {};
    const title = a.sos ? 'EMERGENCY SOS' : a.kind === 'ems' ? 'EMS request' : '911 report';
    Phone.notify({
        title, text: `${a.caller}${a.phone ? ` (${a.phone})` : ''} · ${a.street || 'Unknown location'}${a.text && !a.sos ? `\n${a.text}` : ''}`,
        icon: a.kind === 'ems' ? 'fas fa-truck-medical' : 'fas fa-shield-halved', color: '#ff3b30', timeout: 9000,
        onTap: () => { nui('mz:emergency:gps'); UI.hud('fa-solid fa-location-dot', 'GPS set'); },
    });
});

/* Weazel News breaking stories */
Phone.on('mz:breakingNews', (d) => {
    const a = d.article || {};
    Phone.notify({ title: 'Weazel News · BREAKING', text: a.title || '', icon: 'fas fa-newspaper', color: '#d71920', app: 'browser', timeout: 7000,
        onTap: () => Phone.openApp('browser', { url: `weazelnews.com/article/${a.id}` }) });
});

/* ================= Find My ================= */
const FindMy = {
    nav: null, page: null, tab: 'people', timer: null,

    open(nav) {
        this.nav = nav;
        const page = UI.page({ title: 'Find My', large: true });
        this.page = page;
        nav.push(page, false);
        this.radar = el('<div class="fm-radar"><div class="fm-ring r1"></div><div class="fm-ring r2"></div><div class="fm-ring r3"></div><div class="fm-sweep"></div><div class="fm-me"></div><div class="fm-dots"></div></div>');
        page.content.appendChild(this.radar);
        this.seg = UI.segmented([{ id: 'people', label: 'People' }, { id: 'me', label: 'Me' }], this.tab, (id) => { this.tab = id; this.draw(); });
        page.content.appendChild(this.seg);
        this.box = el('<div></div>');
        page.content.appendChild(this.box);
        this.box.appendChild(UI.loading());
        this.load();
        clearInterval(this.timer);
        this.timer = setInterval(() => { if (S.currentApp === 'findmy') this.load(); else clearInterval(this.timer); }, 5000);
    },

    async load() {
        const st = await nui('mz:findmy', { fn: 'state' });
        if (!st || S.currentApp !== 'findmy') return;
        this.st = { sharing: listOf(st.sharing), people: listOf(st.people), me: st.me, now: st.now };
        this.draw();
    },

    left(exp, now) {
        if (!exp) return 'Until you stop';
        const m = Math.max(0, Math.round((exp - now) / 60));
        return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
    },
    dist(m) { return m === undefined ? '' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; },

    draw() {
        if (!this.st || !this.box) return;
        const { sharing, people, me, now } = this.st;
        // radar dots (distance → radius)
        const dots = $('.fm-dots', this.radar);
        dots.innerHTML = people.filter((p) => p.distance !== undefined).map((p, i) => {
            const r = Math.min(46, 8 + Math.log10(1 + p.distance) * 11);
            const ang = (i * 137.5) * Math.PI / 180;
            return `<span style="left:${50 + Math.cos(ang) * r}%;top:${50 + Math.sin(ang) * r}%">${initials(p.name)}</span>`;
        }).join('');
        this.box.innerHTML = '';
        if (this.tab === 'people') {
            if (!people.length) {
                this.box.appendChild(UI.empty('fa-solid fa-user-group', 'No one is sharing with you', 'When friends share their location with you, they appear here and on your map.'));
                return;
            }
            this.box.appendChild(UI.list(people.map((p) => ({
                avatar: avatarHTML(p.name), title: p.name,
                sub: p.street ? `${p.street} · ${this.dist(p.distance)}` : (p.online ? 'Locating…' : 'Location not available'),
                onClick: () => UI.actions({ title: p.name, buttons: [
                    p.x !== undefined ? { text: 'Directions', bold: true, onClick: () => { nui('mz:setWaypoint', { x: p.x, y: p.y, label: p.name }); UI.hud('fa-solid fa-location-arrow', 'GPS set'); } } : null,
                    p.number ? { text: 'Call', onClick: () => Phone.startCall(p.number, p.name) } : null,
                    p.number ? { text: 'Message', onClick: () => Phone.openApp('whatsapp', { number: p.number, name: p.name }) } : null,
                ].filter(Boolean) }),
            }))));
            this.box.appendChild(UI.footer('Friends who share with you also show on the GPS map.'));
            return;
        }
        this.box.appendChild(UI.header('My Location'));
        this.box.appendChild(UI.list([{ icon: 'fa-solid fa-location-dot', iconBg: '#30d158', title: me || 'Unknown', sub: 'Current location' }]));
        const shareBtn = el('<div class="btn-row"><div class="btn primary"><i class="fa-solid fa-share-nodes"></i>Share My Location</div></div>');
        shareBtn.onclick = () => this.share();
        this.box.appendChild(shareBtn);
        if (sharing.length) {
            this.box.appendChild(UI.header('Sharing With'));
            this.box.appendChild(UI.list(sharing.map((s) => ({
                avatar: avatarHTML(s.name), title: s.name, sub: this.left(s.expires, now),
                right: '<span class="fm-stop">Stop</span>',
                onClick: async () => {
                    if (!(await UI.confirm('Stop sharing?', `${s.name} will no longer see your location.`, 'Stop Sharing', true))) return;
                    await nui('mz:findmy', { fn: 'stop', arg: s.cid });
                    this.load();
                },
            }))));
        }
    },

    share() {
        let number = '';
        let minutes = 60;
        UI.sheet({
            title: 'Share My Location', done: 'Share',
            content: (body) => {
                const contacts = (S.contacts || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
                body.appendChild(UI.form([{ id: 'num', label: 'Phone number', placeholder: '06…', value: '' }]));
                const inp = $('input', body);
                inp.addEventListener('input', () => { number = inp.value.trim(); });
                body.appendChild(UI.header('For how long?'));
                body.appendChild(UI.segmented([{ id: '15', label: '15 min' }, { id: '60', label: '1 hour' }, { id: '0', label: 'Until I stop' }], '60', (id) => { minutes = Number(id); }));
                if (contacts.length) {
                    body.appendChild(UI.header('Contacts'));
                    body.appendChild(UI.list(contacts.map((c) => ({ avatar: avatarHTML(c.name), title: c.name, sub: c.number, onClick: (e, row) => {
                        number = String(c.number); inp.value = number;
                        $$('.row', body).forEach((r) => r.classList.remove('fm-picked')); row.classList.add('fm-picked');
                    } }))));
                }
            },
            onDone: async () => {
                if (!number) { UI.hud('fa-solid fa-circle-info', 'Choose a contact or enter a number'); return false; }
                const r = await nui('mz:findmy', { fn: 'share', arg: { number, minutes } });
                if (!r || r.error) { UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Could not share', 2000); return false; }
                UI.hud('fa-solid fa-location-dot', `Sharing with ${r.name}`);
                this.tab = 'me';
                this.load();
                return true;
            },
        });
    },
};
Apps.define('findmy', { open: (nav) => FindMy.open(nav), onClose: () => clearInterval(FindMy.timer) });

/* ================= Siri (Spotlight commands) ================= */
const Siri = {
    contact(q) {
        q = String(q || '').trim().toLowerCase();
        if (!q) return null;
        if (/^[\d\s+]+$/.test(q)) return { name: q.replace(/\s/g, ''), number: q.replace(/\s/g, '') };
        const list = S.contacts || [];
        return list.find((c) => String(c.name).toLowerCase() === q) || list.find((c) => String(c.name).toLowerCase().startsWith(q)) || list.find((c) => String(c.name).toLowerCase().includes(q)) || null;
    },
    async place(q) {
        if (!S.world || !S.world.places) { try { S.world = await nui('mz:getWorld'); } catch (e) { /* */ } }
        const places = listOf(S.world && S.world.places);
        q = q.toLowerCase();
        return places.find((p) => String(p.label || p.name || '').toLowerCase().includes(q)) || null;
    },
    math(q) {
        if (!/^[\d\s+\-*/().%^]+$/.test(q) || !/\d\s*[+\-*/%^]\s*\d/.test(q)) return null;
        try { const v = Function(`"use strict";return (${q.replace(/\^/g, '**')})`)(); return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; } catch (e) { return null; }
    },
    /** → [{ icon, title, sub, run }] */
    async parse(raw) {
        const q = String(raw || '').trim();
        const l = q.toLowerCase();
        const out = [];
        let m;
        const has = (id) => Phone.installedApps().includes(id);
        const calc = this.math(q);
        if (calc !== null) out.push({ icon: 'fa-solid fa-calculator', title: `= ${calc.toLocaleString('en-US')}`, sub: 'Calculator', run: () => { copyText(String(calc)); UI.hud('fa-solid fa-copy', 'Copied'); } });
        if ((m = l.match(/^(?:call|phone|ring)\s+(.+)/))) {
            const c = this.contact(m[1]);
            if (c) out.push({ icon: 'fa-solid fa-phone', title: `Call ${c.name}`, sub: c.number, run: () => Phone.startCall(c.number, c.name) });
        }
        if ((m = l.match(/^(?:text|message|sms|msg)\s+(.+)/))) {
            const c = this.contact(m[1]);
            if (c) out.push({ icon: 'fa-solid fa-comment', title: `Message ${c.name}`, sub: c.number, run: () => Phone.openApp('whatsapp', { number: c.number, name: c.name }) });
        }
        if ((m = l.match(/^(?:navigate|directions|take me|drive|go to|gps|route)(?:\s+to)?\s+(.+)/))) {
            const p = await this.place(m[1]);
            if (p && p.x !== undefined) out.push({ icon: 'fa-solid fa-location-arrow', title: `Directions to ${p.label || p.name}`, sub: 'Set GPS', run: () => { nui('mz:setWaypoint', { x: p.x, y: p.y, label: p.label || p.name }); UI.hud('fa-solid fa-location-arrow', 'GPS set'); } });
            else out.push({ icon: 'fa-solid fa-map', title: `Find “${m[1]}” in Maps`, sub: 'Maps', run: () => Phone.openApp('maps') });
        }
        if (/^(?:flash ?light|torch|lamp)/.test(l)) {
            const on = /off/.test(l) ? false : /on/.test(l) ? true : !Phone._torch;
            out.push({ icon: 'fa-solid fa-lightbulb', title: `Turn flashlight ${on ? 'on' : 'off'}`, sub: 'Flashlight', run: () => Phone.setTorch(on) });
        }
        if (/^(?:sos|emergency|911|112|help me)/.test(l)) out.push({ icon: 'fa-solid fa-truck-medical', title: 'Emergency SOS', sub: 'Send your location to police / EMS', run: () => SOS.open() });
        if (/^(?:share (?:my )?location|where is|find my|locate)/.test(l) && has('findmy')) out.push({ icon: 'fa-solid fa-location-crosshairs', title: 'Open Find My', sub: 'Share or see locations', run: () => Phone.openApp('findmy') });
        if (/^(?:go live|start live|live)/.test(l)) ['instagram', 'tiktok', 'x'].filter(has).forEach((a) => out.push({ icon: 'fa-solid fa-tower-broadcast', title: `Go live on ${Phone.label(a)}`, sub: 'Live video', run: () => { Phone.openApp(a); setTimeout(() => Live.goLive(a), 600); } }));
        if (/^(?:uber|taxi|ride|cab)/.test(l) && has('ride')) out.push({ icon: 'fa-solid fa-taxi', title: 'Request an Uber', sub: 'To your map waypoint', run: () => Phone.openApp('ride') });
        if (/^(?:weather|is it raining|temperature)/.test(l)) out.push({ icon: 'fa-solid fa-cloud-sun', title: 'Weather', sub: 'Los Santos', run: () => Phone.openApp('weather') });
        if (/^(?:alarm|timer|stopwatch)/.test(l)) out.push({ icon: 'fa-solid fa-stopwatch', title: 'Open Clock', sub: 'Alarms & timers', run: () => Phone.openApp('clock') });
        if (/^(?:play|radio|music)/.test(l) && has('radio')) out.push({ icon: 'fa-solid fa-radio', title: 'Play the radio', sub: 'Radio', run: () => Phone.openApp('radio') });
        if (/^(?:dark mode|light mode)/.test(l)) out.push({ icon: 'fa-solid fa-circle-half-stroke', title: `Turn ${/dark/.test(l) ? 'on' : 'off'} Dark Mode`, sub: 'Display', run: () => { Store.set('dark', /dark/.test(l)); Phone.applySettings(); Phone.renderHome(); } });
        if (/^(?:lock|lock phone)$/.test(l)) out.push({ icon: 'fa-solid fa-lock', title: 'Lock iPhone', sub: '', run: () => { Phone.closeApp(true); Phone.lock(); } });
        if (q.length > 1 && has('browser')) out.push({ icon: 'fa-solid fa-compass', title: `Search the web for “${q}”`, sub: 'Safari', run: () => Phone.openApp('browser', { url: q }) });
        return out;
    },
};

(() => {
    const open = Phone.openSpotlight.bind(Phone);
    Phone.openSpotlight = function () {
        open();
        const sp = $('#spotlight');
        const q = $('#spot-q', sp);
        q.placeholder = 'Search or ask Siri';
        let actions = [];
        let seq = 0;
        const paint = async () => {
            const my = ++seq;
            const v = q.value.trim();
            const list = v ? await Siri.parse(v) : [];
            if (my !== seq) return;
            actions = list;
            const res = $('#spot-results', sp);
            const old = $('.siri-box', res); if (old) old.remove();
            if (!list.length) return;
            const box = el(`<div class="siri-box"><div class="spot-title"><span class="siri-orb"></span>Siri</div>${list.slice(0, 4).map((a, i) => `<div class="siri-row" data-si="${i}"><span class="siri-ic"><i class="${a.icon}"></i></span><div><b>${esc(a.title)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</div><i class="fa-solid fa-chevron-right"></i></div>`).join('')}</div>`);
            box.onclick = (e) => { const r = e.target.closest('[data-si]'); if (!r) return; const a = actions[Number(r.dataset.si)]; Phone.closeSpotlight(); a.run(); };
            res.prepend(box);
        };
        q.addEventListener('input', paint);
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && actions.length) { const a = actions[0]; Phone.closeSpotlight(); a.run(); } });
    };
})();
