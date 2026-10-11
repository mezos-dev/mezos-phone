/* Settings */
'use strict';

const SettingsApp = {
    nav: null, root: null,

    open(nav) {
        this.nav = nav;
        this.root = UI.page({ title: 'Settings', large: true, search: { placeholder: 'Search', onInput: (q) => this.renderRoot(q) } });
        nav.push(this.root, false);
        this.renderRoot();
    },

    renderRoot(q = '') {
        const c = this.root.content;
        c.innerHTML = '';
        const ch = S.player.charinfo || {};
        const g = (rows) => {
            const f = rows.filter((r) => !q || String(r.title).toLowerCase().includes(q));
            if (f.length) { c.appendChild(UI.list(f)); c.appendChild(el('<div style="height:1.6rem"></div>')); }
        };
        if (!q) {
            c.appendChild(UI.list([{
                avatar: avatarHTML(`${ch.firstname || ''} ${ch.lastname || ''}`, S.meta.profilepicture, 'md'),
                title: `<b style="font-size:1.3rem">${esc((ch.firstname || '') + ' ' + (ch.lastname || ''))}</b>`, html: true,
                sub: 'Mezos ID, Number & Profile Photo', onClick: () => this.profile(),
            }]));
            c.appendChild(el('<div style="height:1.6rem"></div>'));
        }
        g([
            { icon: 'fa-solid fa-plane', iconBg: '#ff9500', title: 'Airplane Mode', toggle: { on: !!Store.get('airplane'), onChange: (v) => { Store.set('airplane', v); Phone.updateChrome(); } } },
            { icon: 'fa-solid fa-wifi', iconBg: '#007aff', title: 'Wi-Fi', toggle: { on: !!Store.get('wifi'), onChange: (v) => { Store.set('wifi', v); Phone.updateChrome(); } } },
            { icon: 'fa-brands fa-bluetooth-b', iconBg: '#007aff', title: 'Bluetooth', toggle: { on: !!Store.get('bluetooth'), onChange: (v) => Store.set('bluetooth', v) } },
            { icon: 'fa-solid fa-tower-cell', iconBg: '#34c759', title: 'Mobile Service', value: ch.phone || '', onClick: () => this.phonePage() },
        ]);
        g([
            { icon: 'fa-solid fa-bell', iconBg: '#ff3b30', title: 'Notifications', onClick: () => this.notifications() },
            { icon: 'fa-solid fa-volume-high', iconBg: '#ff2d55', title: 'Sounds & Haptics', onClick: () => this.sounds() },
            { icon: 'fa-solid fa-moon', iconBg: '#5856d6', title: 'Focus', value: Store.get('dnd') ? 'On' : 'Off', onClick: () => this.notifications() },
        ]);
        g([
            { icon: 'fa-solid fa-gear', iconBg: '#8e8e93', title: 'General', onClick: () => this.about() },
            { icon: 'fa-solid fa-toggle-on', iconBg: '#8e8e93', title: 'Control Centre', onClick: () => UI.alert({ title: 'Control Centre', text: 'Tap the top-right corner of the screen (above the battery) to open Control Centre. Tap the top-left corner for Notifications.' }) },
            { icon: 'fa-solid fa-sun', iconBg: '#007aff', title: 'Display & Brightness', onClick: () => this.display() },
            { icon: 'fa-solid fa-image', iconBg: '#30b0c7', title: 'Wallpaper', onClick: () => this.wallpaper() },
            { icon: 'fa-solid fa-face-smile', iconBg: '#34c759', title: 'Face ID & Passcode', onClick: () => this.security() },
        ]);
        g([
            { icon: 'fa-solid fa-phone', iconBg: '#34c759', title: 'Phone', onClick: () => this.phonePage() },
            { icon: 'fa-solid fa-bag-shopping', iconBg: '#007aff', title: 'Store & Apps', onClick: () => Phone.openApp('store') },
            { icon: 'fa-solid fa-wallet', iconBg: '#1c1c1e', title: 'Wallet', onClick: () => Phone.openApp('bank') },
        ]);
        if (!q) {
            c.appendChild(UI.list([{ title: 'Reset Phone Settings', cls: 'red', noChevron: true, onClick: async () => {
                if (!(await UI.confirm('Reset Settings', 'Notes, alarms and events are kept. Display, focus and security settings go back to default.', 'Reset', true))) return;
                ['dark', 'brightness', 'scale', 'dnd', 'faceId', 'passcode', 'anonymous', 'airplane', 'wifi', 'bluetooth', 'volume', 'hidden'].forEach((k) => Store.set(k, STORE_DEFAULTS[k]));
                nui('mz:setDND', { state: false });
                Phone.applySettings(); Phone.renderHome(); Phone.rerenderApp();
            } }]));
        }
    },

    profile() {
        const ch = S.player.charinfo || {};
        const md = S.player.metadata || {};
        const page = UI.page({ title: 'Mezos ID', back: true, backLabel: 'Settings' });
        const name = `${ch.firstname || ''} ${ch.lastname || ''}`;
        page.content.innerHTML = `<div class="center-col" style="padding:1rem 0 1.4rem">${avatarHTML(name, S.meta.profilepicture, 'lg')}<h2 style="margin-top:.7rem;font-size:1.7rem">${esc(name)}</h2><span class="text-gray">${esc(ch.phone || '')}</span><div class="btn small tinted mt" id="pp-edit">Edit Photo</div></div>`;
        $('#pp-edit', page).onclick = () => UI.actions({ buttons: [
            { text: 'Choose from Photos', onClick: () => this.pickPhoto((url) => this.setPicture(url, page)) },
            { text: 'Use Image URL', onClick: async () => { const u = await UI.prompt('Profile Photo', 'Paste an image link', 'https://'); if (u && /^https?:\/\//.test(u)) this.setPicture(u, page); } },
            { text: 'Remove Photo', red: true, onClick: () => this.setPicture('default', page) },
        ] });
        page.content.appendChild(UI.list([
            { title: 'Phone Number', value: ch.phone || '-', onClick: () => { copyText(ch.phone); UI.hud('fa-solid fa-copy', 'Copied'); }, noChevron: true },
            { title: 'Citizen ID', value: S.player.citizenid || '-', onClick: () => { copyText(S.player.citizenid); UI.hud('fa-solid fa-copy', 'Copied'); }, noChevron: true },
            { title: 'Bank Account', value: ch.account || '-', onClick: () => { copyText(ch.account); UI.hud('fa-solid fa-copy', 'Copied'); }, noChevron: true },
            { title: 'Job', value: (S.job && S.job.label) || (S.player.job && S.player.job.label) || '-' },
            { title: 'Server ID', value: String(S.playerId || '-') },
            { title: 'Serial Number', value: 'MZ-' + ((md.phonedata && md.phonedata.SerialNumber) || '000000') },
        ]));
        this.nav.push(page);
    },

    setPicture(url, page) {
        S.meta.profilepicture = url;
        nui('UpdateProfilePicture', { profilepicture: url });
        UI.hud('fa-solid fa-circle-check', 'Profile photo updated');
        this.nav.pop();
        setTimeout(() => { this.renderRoot(); this.profile(); }, 450);
    },

    async pickPhoto(cb) {
        const d = await nui('GetGalleryData');
        const list = Array.isArray(d) ? d : Object.values(d || {});
        if (!list.length) return UI.hud('fa-regular fa-images', 'No photos yet');
        UI.sheet({ title: 'Choose Photo', content: (b, sh) => {
            const g = el(`<div class="photo-grid">${list.map((p, i) => `<div class="ph" data-i="${i}">${Media.html(p.image, 'ph-media')}</div>`).join('')}</div>`);
            g.onclick = (e) => { const t = e.target.closest('.ph'); if (t) { sh.close(); cb(list[Number(t.dataset.i)].image); } };
            b.appendChild(g);
        } });
    },

    notifications() {
        const page = UI.page({ title: 'Notifications', back: true, backLabel: 'Settings' });
        page.content.appendChild(el('<div style="height:.6rem"></div>'));
        page.content.appendChild(UI.list([
            { icon: 'fa-solid fa-moon', iconBg: '#5856d6', title: 'Do Not Disturb', toggle: { on: !!Store.get('dnd'), onChange: (v) => { Store.set('dnd', v); nui('mz:setDND', { state: v }); Phone.updateChrome(); } } },
        ]));
        page.content.appendChild(UI.footer('When Do Not Disturb is on, banners are hidden and your phone will not ring. Notifications still go to Notification Centre.'));
        page.content.appendChild(el('<div style="height:1.4rem"></div>'));
        page.content.appendChild(UI.list([{ title: `Clear Notification Centre (${S.notifications.length})`, cls: 'red', noChevron: true, onClick: () => { S.notifications = []; UI.hud('fa-solid fa-check', 'Cleared'); this.nav.pop(); } }]));
        this.nav.push(page);
    },

    sounds() {
        const page = UI.page({ title: 'Sounds & Haptics', back: true, backLabel: 'Settings' });
        page.content.appendChild(UI.header('Ringer and Alerts'));
        const row = el(`<div class="list"><div class="row" style="gap:1rem"><i class="fa-solid fa-volume-low text-gray"></i><input class="slider" type="range" min="0" max="100" value="${Store.get('volume')}"><i class="fa-solid fa-volume-high text-gray"></i></div></div>`);
        $('input', row).addEventListener('input', (e) => Store.set('volume', Number(e.target.value)));
        page.content.appendChild(row);
        page.content.appendChild(UI.footer('Used for alarms and timers. The ringtone follows the server sound settings.'));
        this.nav.push(page);
    },

    display(instant) {
        const page = UI.page({ title: 'Display & Brightness', back: true, backLabel: 'Settings' });
        page.content.appendChild(UI.header('Appearance'));
        const ap = el(`<div class="list"><div class="appearance">
            <div class="ap ${!Store.get('dark') ? 'sel' : ''}" data-d="0"><div class="ap-prev light"><span></span><span></span></div>Light<i class="fa-solid fa-circle-check"></i></div>
            <div class="ap ${Store.get('dark') ? 'sel' : ''}" data-d="1"><div class="ap-prev dark"><span></span><span></span></div>Dark<i class="fa-solid fa-circle-check"></i></div>
        </div></div>`);
        ap.onclick = (e) => {
            const a = e.target.closest('.ap'); if (!a) return;
            Store.set('dark', a.dataset.d === '1');
            Phone.applySettings(); Phone.renderHome();
            Phone.rerenderApp();
            SettingsApp.display(true);
        };
        page.content.appendChild(ap);
        page.content.appendChild(UI.header('Brightness'));
        const br = el(`<div class="list"><div class="row" style="gap:1rem"><i class="fa-solid fa-sun text-gray" style="font-size:.85rem"></i><input class="slider" type="range" min="20" max="100" value="${Store.get('brightness')}"><i class="fa-solid fa-sun text-gray" style="font-size:1.3rem"></i></div></div>`);
        $('input', br).addEventListener('input', (e) => { Store.set('brightness', Number(e.target.value)); Phone.applySettings(); });
        page.content.appendChild(br);
        page.content.appendChild(UI.header('Phone Size'));
        const sz = el(`<div class="list"><div class="row" style="gap:1rem"><i class="fa-solid fa-mobile-screen text-gray" style="font-size:.85rem"></i><input class="slider" type="range" min="75" max="125" step="5" value="${Store.get('scale')}"><i class="fa-solid fa-mobile-screen text-gray" style="font-size:1.4rem"></i></div></div>`);
        $('input', sz).addEventListener('change', (e) => { Store.set('scale', Number(e.target.value)); Phone.applySettings(); });
        page.content.appendChild(sz);
        page.content.appendChild(UI.footer('Changes how big the phone is on your screen.'));
        this.nav.push(page, !instant);
    },

    wallpaper() {
        const page = UI.page({ title: 'Wallpaper', back: true, backLabel: 'Settings' });
        const cur = S.meta.background && S.meta.background !== 'default-qbcore' ? S.meta.background : DEFAULT_WALLPAPER;
        const grid = el(`<div class="wp-grid">${Object.keys(WALLPAPERS).map((k) => `<div class="wp ${k === cur ? 'sel' : ''}" data-k="${k}"><div class="wp-prev" style="background:${WALLPAPERS[k].css}"><span class="wp-time">9:41</span></div><span>${esc(WALLPAPERS[k].label)}</span></div>`).join('')}</div>`);
        grid.onclick = (e) => {
            const w = e.target.closest('.wp'); if (!w) return;
            this.setWallpaper(w.dataset.k);
            $$('.wp', grid).forEach((x) => x.classList.toggle('sel', x === w));
        };
        page.content.appendChild(grid);
        page.content.appendChild(UI.list([
            { icon: 'fa-regular fa-images', iconBg: 'var(--purple)', title: 'Choose from Photos', onClick: () => this.pickPhoto((u) => this.setWallpaper(u)) },
            { icon: 'fa-solid fa-link', iconBg: 'var(--blue)', title: 'Custom Image URL', onClick: async () => { const u = await UI.prompt('Wallpaper', 'Paste an image link', 'https://'); if (u && /^https?:\/\//.test(u)) this.setWallpaper(u); } },
        ]));
        this.nav.push(page);
    },

    setWallpaper(bg) {
        S.meta.background = bg;
        nui('SetBackground', { background: bg });
        Phone.applyWallpaper();
        UI.hud('fa-solid fa-image', 'Wallpaper set');
    },

    security() {
        const page = UI.page({ title: 'Face ID & Passcode', back: true, backLabel: 'Settings' });
        const fill = () => {
            page.content.innerHTML = '';
            page.content.appendChild(el('<div class="center-col" style="padding:1.2rem 0"><i class="fa-solid fa-face-smile" style="font-size:4rem;color:var(--green)"></i></div>'));
            page.content.appendChild(UI.list([{ title: 'Unlock with Face ID', toggle: { on: !!Store.get('faceId'), onChange: (v) => Store.set('faceId', v) } }]));
            page.content.appendChild(UI.footer('When on, your phone unlocks automatically when you look at it. When off, swipe up on the lock screen.'));
            page.content.appendChild(el('<div style="height:1.4rem"></div>'));
            const has = !!Store.get('passcode');
            page.content.appendChild(UI.list(has ? [
                { title: 'Turn Passcode Off', cls: 'blue', noChevron: true, onClick: async () => {
                    const cur = await UI.prompt('Enter Passcode', 'Enter your current passcode', '••••', '', 'password');
                    if (cur === null) return;
                    if (cur !== Store.get('passcode')) return UI.alert({ title: 'Wrong Passcode' });
                    Store.set('passcode', ''); fill(); UI.hud('fa-solid fa-lock-open', 'Passcode off');
                } },
                { title: 'Change Passcode', cls: 'blue', noChevron: true, onClick: () => this.setPasscode(fill) },
            ] : [{ title: 'Turn Passcode On', cls: 'blue', noChevron: true, onClick: () => this.setPasscode(fill) }]));
            page.content.appendChild(UI.footer('A 4-digit passcode is asked every time you open your phone.'));
        };
        fill();
        this.nav.push(page);
    },

    async setPasscode(done) {
        const a = await UI.prompt('Set Passcode', 'Enter a 4-digit passcode', '••••', '', 'password');
        if (a === null) return;
        if (!/^\d{4}$/.test(a)) return UI.alert({ title: 'Invalid', text: 'The passcode must be 4 digits.' });
        const b = await UI.prompt('Verify Passcode', 'Enter the passcode again', '••••', '', 'password');
        if (a !== b) return UI.alert({ title: "Passcodes didn't match" });
        Store.set('passcode', a);
        UI.hud('fa-solid fa-lock', 'Passcode set');
        done && done();
    },

    phonePage() {
        const ch = S.player.charinfo || {};
        const page = UI.page({ title: 'Phone', back: true, backLabel: 'Settings' });
        page.content.appendChild(el('<div style="height:.6rem"></div>'));
        page.content.appendChild(UI.list([
            { title: 'My Number', value: ch.phone || '-', onClick: () => { copyText(ch.phone); UI.hud('fa-solid fa-copy', 'Copied'); }, noChevron: true },
            { title: 'Show My Caller ID', toggle: { on: !Store.get('anonymous'), onChange: (v) => Store.set('anonymous', !v) } },
        ]));
        page.content.appendChild(UI.footer('Turn off to call with a hidden number.'));
        page.content.appendChild(el('<div style="height:1.4rem"></div>'));
        page.content.appendChild(UI.list([
            { icon: 'fa-solid fa-tower-broadcast', iconBg: 'var(--blue)', title: 'Share My Contact (AirDrop)', onClick: () => { nui('mz:shareContact'); UI.hud('fa-solid fa-tower-broadcast', 'Shared with the nearest person'); } },
            { icon: 'fa-solid fa-star', iconBg: 'var(--orange)', title: 'Clear Favorites', onClick: () => { Store.set('favorites', []); UI.hud('fa-solid fa-check', 'Cleared'); } },
        ]));
        this.nav.push(page);
    },

    about() {
        const ch = S.player.charinfo || {};
        const md = S.player.metadata || {};
        const page = UI.page({ title: 'About', back: true, backLabel: 'Settings' });
        page.content.innerHTML = `<div class="center-col" style="padding:1.4rem 0"><div class="about-logo"><i class="fa-solid fa-mobile-screen-button"></i></div><h2 style="margin-top:.6rem">mezos-phone</h2><span class="text-gray">MZ OS 17 · iPhone style</span></div>`;
        const notes = (Store.get('notes') || []).length, photos = '-';
        page.content.appendChild(UI.list([
            { title: 'Name', value: `${ch.firstname || ''}'s Phone` },
            { title: 'Model Name', value: 'Mezos 15 Pro' },
            { title: 'Software Version', value: '17.0 (MZ)' },
            { title: 'Phone Number', value: ch.phone || '-' },
            { title: 'Serial Number', value: 'MZ-' + ((md.phonedata && md.phonedata.SerialNumber) || '000000') },
            { title: 'Apps', value: String(Phone.installedApps().length) },
            { title: 'Notes', value: String(notes) },
            { title: 'Capacity', value: '256 GB' },
        ]));
        this.nav.push(page);
    },
};

Apps.define('settings', { open: (nav) => SettingsApp.open(nav) });
