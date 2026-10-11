/* =========================================================
   iApple Setup Assistant (first start of a new phone) + Activation Lock (phone of another player)
   ========================================================= */
'use strict';

const IA_LOGO = '<svg viewBox="0 0 100 100" class="ia-logo"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="4"/><text x="50" y="63" text-anchor="middle" font-size="40" font-family="Inter, sans-serif" font-weight="300" fill="currentColor" font-style="italic">iA</text></svg>';

const Setup = {
    active: false, box: null, step: 0, data: {},

    /* ---------- shell ---------- */
    mount() {
        let box = $('#setup');
        if (!box) { box = el('<div id="setup" class="setup"></div>'); $('#screen').appendChild(box); }
        this.box = box;
        box.className = 'setup show';
        return box;
    },
    unmount() {
        this.active = false;
        Phone.updateChrome();
        if (this.box) { this.box.classList.remove('show'); const b = this.box; setTimeout(() => { if (!this.active) b.innerHTML = ''; }, 500); }
    },
    page(html, cls = '') {
        const p = el(`<div class="su-page ${cls}">${html}</div>`);
        const old = $('.su-page', this.box);
        this.box.appendChild(p);
        // status bar text dark on white setup pages, white on black ones
        $('#statusbar').classList.toggle('dark-text', !/black/.test(cls));
        requestAnimationFrame(() => p.classList.add('in'));
        if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 450); }
        return p;
    },
    header(icon, title, text) {
        return `<div class="su-head">${icon ? `<div class="su-icon">${icon}</div>` : ''}<h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div>`;
    },
    footer(primary, secondary) {
        return `<div class="su-foot"><div class="su-btn" data-next>${primary}</div>${secondary ? `<div class="su-link" data-skip>${secondary}</div>` : ''}</div>`;
    },
    bind(p, next, skip) {
        const n = $('[data-next]', p); if (n) n.onclick = next;
        const s = $('[data-skip]', p); if (s) s.onclick = skip || next;
        const b = el('<div class="su-back"><i class="fa-solid fa-chevron-left"></i> Back</div>');
        if (this.step > 2) { b.onclick = () => this.go(this.step - 1); p.appendChild(b); }
    },
    go(i) {
        this.step = i;
        const steps = [this.boot, this.hello, this.language, this.region, this.wifi, this.privacy, this.faceId, this.passcode, this.appleId, this.terms, this.name, this.appearance, this.wallpaper, this.welcome];
        (steps[i] || this.welcome).call(this);
    },

    start() {
        this.active = true;
        this.data = { faceId: false, passcode: '', dark: !!Store.get('dark'), wallpaper: DEFAULT_WALLPAPER };
        $('#lockscreen').classList.add('unlocked');
        this.mount();
        this.go(0);
    },

    /* ---------- steps ---------- */
    boot() {
        const p = this.page(`<div class="su-boot">${IA_LOGO}<div class="su-bar"><i></i></div></div>`, 'black');
        setTimeout(() => { if (this.active && this.step === 0) this.go(1); }, 2300);
        return p;
    },

    hello() {
        const words = ['hello', 'bonjour', 'hola', 'مرحبا', 'ciao', 'hallo', 'olá', 'привет', 'こんにちは', 'merhaba'];
        const p = this.page(`<div class="su-hello"><div class="su-hello-word">hello</div><div class="su-hello-hint"><span>Tap to set up</span><i class="fa-solid fa-chevron-up"></i></div><div class="su-a11y"><i class="fa-solid fa-universal-access"></i></div></div>`, 'hello');
        let i = 0;
        const w = $('.su-hello-word', p);
        clearInterval(this._hello);
        this._hello = setInterval(() => {
            if (!this.active || this.step !== 1) return clearInterval(this._hello);
            w.classList.add('fade');
            setTimeout(() => { i = (i + 1) % words.length; w.textContent = words[i]; w.classList.remove('fade'); }, 450);
        }, 2200);
        p.onclick = () => { clearInterval(this._hello); this.go(2); };
    },

    list(items, cur, key) {
        return `<div class="su-list">${items.map((it) => `<div class="su-row ${it.v === cur ? 'on' : ''}" data-v="${esc(it.v)}"><span>${it.label}</span>${it.sub ? `<small>${it.sub}</small>` : ''}<i class="fa-solid fa-check"></i></div>`).join('')}</div>`;
    },

    language() {
        const langs = [{ v: 'en', label: 'English' }, { v: 'fr', label: 'Français' }, { v: 'ar', label: 'العربية' }, { v: 'es', label: 'Español' }, { v: 'de', label: 'Deutsch' }, { v: 'pt', label: 'Português' }];
        const p = this.page(`${this.header('', 'Language', '')}${this.list(langs, this.data.language || 'en')}`);
        $$('.su-row', p).forEach((r) => { r.onclick = () => { this.data.language = r.dataset.v; this.go(3); }; });
        this.bind(p);
    },

    region() {
        const regions = [{ v: 'US', label: 'United States' }, { v: 'MA', label: 'Morocco' }, { v: 'FR', label: 'France' }, { v: 'GB', label: 'United Kingdom' }, { v: 'ES', label: 'Spain' }, { v: 'DE', label: 'Germany' }, { v: 'SA', label: 'San Andreas' }];
        const p = this.page(`${this.header('', 'Select Your Country or Region', '')}${this.list(regions, this.data.region || 'SA')}`);
        $$('.su-row', p).forEach((r) => { r.onclick = () => { this.data.region = r.dataset.v; this.go(4); }; });
        this.bind(p);
    },

    wifi() {
        const nets = [['LS-Public-WiFi', false, 3], ['Vinewood_5G', true, 3], ['MazeBank_Guest', true, 2], ['Bean Machine Free WiFi', false, 2], ['iFruit-Hotspot', true, 1]];
        const p = this.page(`${this.header('<i class="fa-solid fa-wifi"></i>', 'Choose a Wi-Fi Network', '')}
            <div class="su-list">${nets.map(([n, lock, bars], i) => `<div class="su-row net" data-i="${i}"><span>${n}</span><em>${lock ? '<i class="fa-solid fa-lock"></i>' : ''}<i class="fa-solid fa-wifi" style="opacity:${0.4 + bars * 0.2}"></i></em></div>`).join('')}</div>
            ${this.footer('Continue', 'Continue without Wi-Fi')}`);
        $('[data-next]', p).classList.add('off');
        $$('.su-row', p).forEach((r) => {
            r.onclick = async () => {
                const [name, lock] = nets[Number(r.dataset.i)];
                if (lock) {
                    const pw = await UI.prompt(`Enter the password for “${name}”`, '', 'Password', '', 'password');
                    if (pw === null) return;
                }
                $$('.su-row', p).forEach((x) => x.classList.remove('on', 'busy'));
                r.classList.add('busy');
                await sleep(900);
                r.classList.remove('busy'); r.classList.add('on');
                this.data.wifi = name;
                Store.set('wifi', true);
                $('[data-next]', p).classList.remove('off');
            };
        });
        this.bind(p, () => { if (this.data.wifi) this.go(5); }, () => this.go(5));
    },

    privacy() {
        const p = this.page(`${this.header('<i class="fa-solid fa-user-shield"></i>', 'Data & Privacy', 'This icon appears when an iApple feature asks to use your personal information.<br><br>You won’t see this with every feature since iApple only collects this information when needed to enable features, secure our services, or personalise your experience.')}
            <div class="su-learn">Learn more about how your data is managed…</div>${this.footer('Continue')}`);
        this.bind(p, () => this.go(6));
    },

    faceId() {
        const p = this.page(`${this.header('', 'Face ID', 'Use Face ID to unlock iPhone and to sign in to apps without typing your passcode.')}
            <div class="su-face"><div class="su-face-ring">${Array.from({ length: 48 }, (_, i) => `<b style="transform:rotate(${i * 7.5}deg) translateY(-6.4rem)"></b>`).join('')}</div><i class="fa-regular fa-face-smile su-face-ic"></i></div>
            ${this.footer('Set Up Face ID', 'Set Up Later in Settings')}`);
        this.bind(p, async () => {
            const btn = $('[data-next]', p);
            if (btn.classList.contains('off')) return;
            btn.classList.add('off'); btn.textContent = 'Move your head slowly…';
            const ticks = $$('.su-face-ring b', p);
            for (let i = 0; i < ticks.length; i++) { ticks[i].classList.add('on'); await sleep(45); }
            $('.su-face-ic', p).className = 'fa-solid fa-circle-check su-face-ic done';
            btn.textContent = 'Face ID is now set up';
            this.data.faceId = true;
            await sleep(900);
            this.go(7);
        }, () => { this.data.faceId = false; this.go(7); });
    },

    passcode(confirm) {
        const title = confirm ? 'Confirm Passcode' : 'Create a Passcode';
        const p = this.page(`${this.header('', title, confirm ? 'Enter your passcode again.' : 'Your passcode protects your data and is used to unlock iPhone.')}
            <div class="su-dots">${'<i></i>'.repeat(4)}</div><div class="su-err"></div>
            <div class="su-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => `<span data-k="${k}" class="${k === '' ? 'empty' : ''}">${k}</span>`).join('')}</div>
            ${confirm ? '' : '<div class="su-link" data-skip>Don’t Use Passcode</div>'}`);
        let val = '';
        const paint = () => $$('.su-dots i', p).forEach((d, i) => d.classList.toggle('on', i < val.length));
        $('.su-pad', p).onclick = async (e) => {
            const k = e.target.closest('[data-k]'); if (!k || k.dataset.k === '') return;
            if (k.dataset.k === '⌫') val = val.slice(0, -1); else if (val.length < 4) val += k.dataset.k;
            paint();
            if (val.length < 4) return;
            await sleep(180);
            if (!confirm) { this._first = val; return this.passcode(true); }
            if (val !== this._first) {
                $('.su-err', p).textContent = 'Passcodes did not match. Try again.';
                $('.su-dots', p).classList.add('shake');
                await sleep(600);
                return this.passcode(false);
            }
            this.data.passcode = val;
            this.go(8);
        };
        const s = $('[data-skip]', p);
        if (s) s.onclick = async () => {
            if (await UI.confirm('Are you sure you don’t want to use a passcode?', 'A passcode protects your data. Anyone who takes your phone can open it.', 'Don’t Use')) { this.data.passcode = ''; this.go(8); }
        };
        const b = el('<div class="su-back"><i class="fa-solid fa-chevron-left"></i> Back</div>');
        b.onclick = () => this.go(confirm ? 7 : 6);
        p.appendChild(b);
    },

    appleId() {
        const ci = S.player.charinfo || {};
        const name = `${ci.firstname || ''} ${ci.lastname || ''}`.trim();
        const mail = `${(ci.firstname || 'user').toLowerCase()}.${(ci.lastname || '').toLowerCase()}@iapple.ls`.replace(/[^a-z0-9.@]/g, '');
        const p = this.page(`${this.header(IA_LOGO, 'iApple ID', 'Sign in with your iApple ID to use iCloud, the App Store and more.')}
            <div class="su-card">${avatarHTML(name, S.meta && S.meta.profilepicture, 'md')}<div><b>${esc(name)}</b><span>${esc(mail)}</span><small>${esc(ci.phone || '')}</small></div></div>
            ${this.footer('Continue')}`);
        this.bind(p, async () => {
            const btn = $('[data-next]', p);
            btn.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i> Signing In…';
            await sleep(1200);
            this.go(9);
        });
    },

    terms() {
        const p = this.page(`${this.header('', 'Terms and Conditions', '')}
            <div class="su-terms"><b>iApple Media Services Terms and Conditions</b>
            <p>These terms govern your use of iPhone and the iApple services in the city of Los Santos. By tapping Agree you accept that your phone number, photos and messages may be read by the LSPD with a valid warrant, that Weazel News is not responsible for anything it publishes, and that 1xBet is for players aged 18 and over.</p>
            <p>Your iPhone is linked to your iApple ID. If it is lost or stolen, nobody can set it up again without your passcode (Activation Lock).</p>
            <p>Do not use iPhone while driving a vehicle at high speed. iApple is not responsible for crashes caused by texting.</p></div>
            <div class="su-foot su-foot-row"><div class="su-link" data-skip>Disagree</div><div class="su-btn" data-next>Agree</div></div>`);
        this.bind(p, async () => {
            const r = await UI.alert({ title: 'Terms and Conditions', text: 'I agree to the iApple Terms and Conditions.', buttons: [{ text: 'Cancel', value: false }, { text: 'Agree', style: 'bold', value: true }] });
            if (r.value) this.go(10);
        }, () => UI.alert({ title: 'You must agree to the Terms and Conditions to use iPhone.' }));
    },

    name() {
        const ci = S.player.charinfo || {};
        const def = `${ci.firstname || 'My'}’s iPhone`;
        const p = this.page(`${this.header('<i class="fa-solid fa-mobile-screen-button"></i>', 'Name Your iPhone', 'This name is shown in AirDrop and Find My.')}
            <div class="su-input"><input maxlength="30" value="${esc(this.data.deviceName || def)}"></div>${this.footer('Continue')}`);
        this.bind(p, () => { this.data.deviceName = $('input', p).value.trim() || def; this.go(11); });
    },

    appearance() {
        const p = this.page(`${this.header('', 'Appearance', 'Select an appearance. You can change it later in Settings.')}
            <div class="su-looks"><div data-dark="0" class="${this.data.dark ? '' : 'on'}"><span class="su-mini light"></span><b>Light</b><i class="fa-solid fa-circle-check"></i></div>
            <div data-dark="1" class="${this.data.dark ? 'on' : ''}"><span class="su-mini dark"></span><b>Dark</b><i class="fa-solid fa-circle-check"></i></div></div>${this.footer('Continue')}`);
        $$('[data-dark]', p).forEach((d) => { d.onclick = () => { this.data.dark = d.dataset.dark === '1'; $$('[data-dark]', p).forEach((x) => x.classList.toggle('on', x === d)); }; });
        this.bind(p, () => this.go(12));
    },

    wallpaper() {
        const ids = Object.keys(WALLPAPERS).slice(0, 6);
        const p = this.page(`${this.header('', 'Choose a Wallpaper', '')}
            <div class="su-walls">${ids.map((id) => `<div data-w="${id}" class="${id === this.data.wallpaper ? 'on' : ''}" style="background:${WALLPAPERS[id].css}"><small>${esc(WALLPAPERS[id].label)}</small></div>`).join('')}</div>${this.footer('Continue')}`);
        $$('[data-w]', p).forEach((d) => { d.onclick = () => { this.data.wallpaper = d.dataset.w; $$('[data-w]', p).forEach((x) => x.classList.toggle('on', x === d)); }; });
        this.bind(p, () => this.go(13));
    },

    async welcome() {
        const p = this.page(`<div class="su-welcome">${IA_LOGO}<h1>Welcome to iPhone</h1><div class="su-btn" data-next>Get Started</div></div>`, 'welcome');
        $('[data-next]', p).onclick = async (e) => {
            e.currentTarget.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i>';
            const r = await nui('mz:device', { fn: 'setup', arg: { deviceName: this.data.deviceName, passcode: this.data.passcode } });
            if (!r || r.error) { UI.alert({ title: 'Setup failed', text: (r && r.error) || 'Try again.' }); e.currentTarget.textContent = 'Get Started'; return; }
            S.device = r;
            // apply the choices
            Store.set('faceId', !!this.data.faceId);
            this._syncing = true; Store.set('passcode', this.data.passcode || ''); this._syncing = false;
            Store.set('dark', !!this.data.dark);
            Store.set('language', this.data.language || 'en');
            S.meta.background = this.data.wallpaper;
            nui('SetBackground', { background: this.data.wallpaper });
            Phone.applySettings(); Phone.renderHome();
            this.unmount();
            S.locked = true;
            Phone.unlock(true);
            UI.hud('fa-solid fa-circle-check', 'iPhone is ready');
        };
    },

    /* ---------- Activation Lock ---------- */
    activationLock(dev) {
        this.active = true;
        this.mount();
        const masked = String(dev.ownerName || 'Someone').split(' ').map((w) => w[0] + '•'.repeat(Math.max(2, w.length - 1))).join(' ');
        const p = this.page(`<div class="su-lock">${IA_LOGO}<h1>iPhone Locked to Owner</h1>
            <p>This iPhone is linked to the iApple ID of <b>${esc(masked)}</b>.${dev.hasPasscode ? ' Enter the passcode that was used on this iPhone to erase it and set it up for you.' : ' It has no passcode, so it can be erased and set up as a new iPhone.'}</p>
            ${dev.hasPasscode ? `<div class="su-dots">${'<i></i>'.repeat(4)}</div><div class="su-err"></div>
            <div class="su-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => `<span data-k="${k}" class="${k === '' ? 'empty' : ''}">${k}</span>`).join('')}</div>`
                : '<div class="su-btn danger" data-erase>Erase iPhone</div>'}
            <small class="su-serial">Serial ${esc(dev.serial || '—')}</small></div>`, 'black');
        const unlock = async (code) => {
            const r = await nui('mz:device', { fn: 'unlock', arg: code });
            if (!r || r.error) return r ? r.error : 'Try again';
            UI.hud('fa-solid fa-rotate', 'Erasing iPhone…', 1600);
            await sleep(1700);
            this.start();
            return null;
        };
        const er = $('[data-erase]', p);
        if (er) er.onclick = async () => { if (await UI.confirm('Erase iPhone?', 'All settings will be removed and the iPhone will be set up as new.', 'Erase', true)) unlock(''); };
        let val = '';
        const pad = $('.su-pad', p);
        if (pad) pad.onclick = async (e) => {
            const k = e.target.closest('[data-k]'); if (!k || k.dataset.k === '') return;
            if (k.dataset.k === '⌫') val = val.slice(0, -1); else if (val.length < 4) val += k.dataset.k;
            $$('.su-dots i', p).forEach((d, i) => d.classList.toggle('on', i < val.length));
            if (val.length < 4) return;
            const err = await unlock(val);
            if (err) {
                $('.su-err', p).textContent = err;
                $('.su-dots', p).classList.add('shake');
                setTimeout(() => $('.su-dots', p) && $('.su-dots', p).classList.remove('shake'), 500);
                val = '';
                $$('.su-dots i', p).forEach((d) => d.classList.remove('on'));
            }
        };
    },
};

/* ---------- hooks into the phone ---------- */
(() => {
    const show = Phone.show.bind(Phone);
    Phone.show = function (data) {
        show(data);
        const dev = data && data.device;
        S.device = dev || null;
        if (!dev) return;
        if (!dev.setup) return Setup.start();
        if (!dev.mine) return Setup.activationLock(dev);
        Setup.unmount();
        // the lock screen uses this phone's passcode
        if (typeof dev.passcode === 'string' && dev.passcode !== (Store.get('passcode') || '')) { Setup._syncing = true; Store.set('passcode', dev.passcode); Setup._syncing = false; }
    };
    const unlock = Phone.unlock.bind(Phone);
    Phone.unlock = function (face) {
        if (Setup.active) return;
        return unlock(face);
    };
    const set = Store.set.bind(Store);
    Store.set = function (k, v) {
        set(k, v);
        // passcode changed in Settings -> saved on the phone item too (Activation Lock)
        if (k === 'passcode' && !Setup._syncing && S.device && S.device.mine) nui('mz:device', { fn: 'passcode', arg: v || '' });
    };
})();
