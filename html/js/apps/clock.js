/* Clock — world clock, alarms, stopwatch, timer */
'use strict';

const ClockApp = {
    nav: null, view: null, tabbar: null, tab: 'world', tick: null,
    sw: { running: false, start: 0, elapsed: 0, laps: [] },
    timer: { running: false, end: 0, remaining: 0, total: 0 },

    CITIES: [
        { name: 'New York', tz: 'America/New_York' }, { name: 'London', tz: 'Europe/London' },
        { name: 'Casablanca', tz: 'Africa/Casablanca' }, { name: 'Dubai', tz: 'Asia/Dubai' },
        { name: 'Tokyo', tz: 'Asia/Tokyo' }, { name: 'Sydney', tz: 'Australia/Sydney' },
        { name: 'Paris', tz: 'Europe/Paris' }, { name: 'Los Angeles', tz: 'America/Los_Angeles' },
    ],

    ring(title, text) {
        Phone.notify({ app: 'clock', title, text, timeout: 6000 });
        const vol = (Number(Store.get('volume')) || 0) / 100 * 0.4;
        if (vol > 0) nui('mz:playSound', { name: 'ringing', volume: vol.toFixed(2) });
    },

    fmt(ms, cs = true) {
        ms = Math.max(0, ms);
        const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
        return cs ? `${pad2(m)}:${pad2(s)},${pad2(c)}` : (m >= 60 ? `${Math.floor(m / 60)}:${pad2(m % 60)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`);
    },

    open(nav) {
        this.nav = nav;
        const root = el('<div class="page"></div>');
        this.view = el('<div class="tab-view"></div>');
        this.tabbar = UI.tabbar([
            { id: 'world', icon: 'fa-solid fa-globe', label: 'World Clock' },
            { id: 'alarm', icon: 'fa-solid fa-bell', label: 'Alarms' },
            { id: 'stopwatch', icon: 'fa-solid fa-stopwatch', label: 'Stopwatch' },
            { id: 'timer', icon: 'fa-solid fa-hourglass-half', label: 'Timers' },
        ], this.tab, (id) => this.show(id));
        root.append(this.view, this.tabbar);
        nav.push(root, false);
        this.show(this.tab);
        clearInterval(this.tick);
        this.tick = setInterval(() => this.update(), 50);
    },
    onClose() { clearInterval(this.tick); this.tick = null; },

    show(id) {
        this.tab = id;
        this.tabbar.select(id);
        this.view.innerHTML = '';
        const p = this[id]();
        p.style.position = 'absolute';
        this.view.appendChild(p);
    },

    world() {
        const page = UI.page({ title: 'World Clock', large: true, tabbar: true });
        const rows = [{ name: 'Los Santos', sub: 'In-game time', game: true }, { name: 'Local Time', sub: 'Your computer' }]
            .concat(this.CITIES.map((c) => ({ name: c.name, tz: c.tz })));
        page.content.appendChild(el(`<div class="wc-list">${rows.map((r, i) => `<div class="wc-row"><div><small>${esc(r.sub || 'Today')}</small><b>${esc(r.name)}</b></div><span class="wc-time" data-i="${i}"></span></div>`).join('')}</div>`));
        this._wc = rows;
        return page;
    },

    alarm() {
        const page = UI.page({ title: 'Alarms', large: true, tabbar: true, right: [{ icon: 'fa-solid fa-plus', onClick: () => this.editAlarm() }] });
        const list = (Store.get('alarms') || []).slice().sort((a, b) => a.time.localeCompare(b.time));
        if (!list.length) page.content.appendChild(UI.empty('fa-solid fa-bell', 'No Alarms', 'Alarms use your real (computer) time.'));
        else page.content.appendChild(el('<div class="section-footer">Alarms use your real (computer) time.</div>'));
        list.forEach((a) => {
            const row = el(`<div class="alarm-row ${a.on ? '' : 'off'}"><div><b>${esc(a.time)}</b><small>${esc(a.label || 'Alarm')}</small></div><div class="toggle ${a.on ? 'on' : ''}"></div></div>`);
            $('.toggle', row).onclick = (e) => {
                e.stopPropagation();
                const all = Store.get('alarms') || [];
                const x = all.find((y) => y.id === a.id); if (x) x.on = !x.on;
                Store.set('alarms', all);
                this.show('alarm');
            };
            row.onclick = () => this.editAlarm(a);
            page.content.appendChild(row);
        });
        return page;
    },

    editAlarm(a) {
        const d = new Date();
        UI.sheet({
            title: a ? 'Edit Alarm' : 'Add Alarm', done: 'Save', half: true,
            content: (body) => {
                body.appendChild(el(`<div class="time-pick"><input type="time" id="al-time" value="${esc(a ? a.time : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`)}"></div>`));
                const f = UI.form([{ id: 'label', label: 'Label', placeholder: 'Alarm', value: a ? a.label : '' }]);
                body.appendChild(f);
                body._form = f;
                if (a) {
                    const del = UI.list([{ title: 'Delete Alarm', cls: 'red', noChevron: true, onClick: () => {
                        Store.set('alarms', (Store.get('alarms') || []).filter((x) => x.id !== a.id));
                        UI.closeModals(); this.show('alarm');
                    } }]);
                    del.style.marginTop = '1.4rem';
                    body.appendChild(del);
                }
            },
            onDone: (sheet) => {
                const time = $('#al-time', sheet).value;
                if (!time) return false;
                const label = sheet.body._form.values().label;
                const all = Store.get('alarms') || [];
                if (a) { const x = all.find((y) => y.id === a.id); if (x) { x.time = time; x.label = label; x.on = true; } }
                else all.push({ id: uid(), time, label, on: true });
                Store.set('alarms', all);
                this.show('alarm');
                return true;
            },
        });
    },

    stopwatch() {
        const page = el(`<div class="page sw-page">
            <div class="sw-display" id="sw-display">00:00,00</div>
            <div class="sw-btns"><div class="sw-btn gray" id="sw-left">Lap</div><div class="sw-btn green" id="sw-right">Start</div></div>
            <div class="sw-laps scroll" id="sw-laps"></div></div>`);
        $('#sw-right', page).onclick = () => {
            const sw = this.sw;
            if (sw.running) { sw.elapsed += Date.now() - sw.start; sw.running = false; }
            else { sw.start = Date.now(); sw.running = true; }
            this.paintSW();
        };
        $('#sw-left', page).onclick = () => {
            const sw = this.sw;
            if (sw.running) sw.laps.unshift(this.swNow());
            else { sw.elapsed = 0; sw.laps = []; }
            this.paintSW();
        };
        setTimeout(() => this.paintSW(), 0);
        return page;
    },
    swNow() { return this.sw.elapsed + (this.sw.running ? Date.now() - this.sw.start : 0); },
    paintSW() {
        const r = $('#sw-right'), l = $('#sw-left'), laps = $('#sw-laps');
        if (!r) return;
        r.textContent = this.sw.running ? 'Stop' : 'Start';
        r.className = `sw-btn ${this.sw.running ? 'red' : 'green'}`;
        l.textContent = this.sw.running || !this.swNow() ? 'Lap' : 'Reset';
        const lapTimes = this.sw.laps.map((t, i, arr) => t - (arr[i + 1] || 0));
        const max = Math.max(...lapTimes), min = Math.min(...lapTimes);
        laps.innerHTML = lapTimes.map((t, i) => `<div class="lap ${lapTimes.length > 1 && t === max ? 'text-red' : ''} ${lapTimes.length > 1 && t === min ? 'text-green' : ''}"><span>Lap ${lapTimes.length - i}</span><span>${this.fmt(t)}</span></div>`).join('');
    },

    timer() {
        const page = el(`<div class="page sw-page">
            <div class="timer-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" stroke="var(--fill2)"/><circle id="tm-arc" cx="50" cy="50" r="46" stroke="var(--orange)" stroke-dasharray="289" stroke-dashoffset="0"/></svg>
                <div class="tm-center"><div class="sw-display small" id="tm-display">05:00</div><div class="tm-pick" id="tm-pick">
                    <input type="number" id="tm-min" min="0" max="180" value="${Math.floor((Store.get('timerPreset') || 300) / 60)}"><span>min</span><input type="number" id="tm-sec" min="0" max="59" value="${(Store.get('timerPreset') || 300) % 60}"><span>sec</span></div></div></div>
            <div class="sw-btns"><div class="sw-btn gray" id="tm-left">Cancel</div><div class="sw-btn green" id="tm-right">Start</div></div>
            <div class="tm-presets">${[1, 3, 5, 10, 15, 30].map((m) => `<span data-m="${m}">${m} min</span>`).join('')}</div></div>`);
        $('.tm-presets', page).onclick = (e) => {
            const s = e.target.closest('span'); if (!s || this.timer.running || this.timer.remaining) return;
            $('#tm-min', page).value = s.dataset.m; $('#tm-sec', page).value = 0;
        };
        $('#tm-right', page).onclick = () => {
            const t = this.timer;
            if (t.running) { t.remaining = t.end - Date.now(); t.running = false; }
            else if (t.remaining > 0) { t.end = Date.now() + t.remaining; t.running = true; }
            else {
                const total = (Number($('#tm-min', page).value) || 0) * 60 + (Number($('#tm-sec', page).value) || 0);
                if (total <= 0) return;
                Store.set('timerPreset', total);
                t.total = total * 1000; t.end = Date.now() + t.total; t.running = true; t.remaining = 0;
            }
            this.paintTimer();
        };
        $('#tm-left', page).onclick = () => { this.timer.running = false; this.timer.remaining = 0; this.timer.total = 0; this.paintTimer(); };
        setTimeout(() => this.paintTimer(), 0);
        return page;
    },
    timerLeft() { const t = this.timer; return Number(t.running ? t.end - Date.now() : t.remaining) || 0; },
    paintTimer() {
        const r = $('#tm-right'); if (!r) return;
        const t = this.timer;
        const active = t.running || t.remaining > 0;
        r.textContent = t.running ? 'Pause' : t.remaining > 0 ? 'Resume' : 'Start';
        r.className = `sw-btn ${t.running ? 'orange' : 'green'}`;
        $('#tm-pick').style.display = active ? 'none' : 'flex';
        $('#tm-display').style.display = active ? 'block' : 'none';
        this.update();
    },

    update() {
        if (S.currentApp !== 'clock') return;
        if (this.tab === 'world' && this._wc) {
            const now = new Date();
            $$('.wc-time').forEach((s) => {
                const r = this._wc[Number(s.dataset.i)];
                if (r.game) s.textContent = Phone.timeString();
                else if (!r.tz) s.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
                else { try { s.textContent = now.toLocaleTimeString('en-GB', { timeZone: r.tz, hour: '2-digit', minute: '2-digit' }); } catch (e) { s.textContent = '--:--'; } }
            });
        } else if (this.tab === 'stopwatch') {
            const d = $('#sw-display'); if (d) d.textContent = this.fmt(this.swNow());
        } else if (this.tab === 'timer') {
            const d = $('#tm-display'), arc = $('#tm-arc');
            const left = this.timerLeft();
            if (d) d.textContent = this.fmt(Math.ceil(left / 1000) * 1000, false);
            if (arc && this.timer.total) arc.setAttribute('stroke-dashoffset', String(289 * (1 - left / this.timer.total)));
        }
    },
};

// Background checks (alarms + timer) — run even when the phone is closed
Phone.on('mz:second', () => {
    const t = ClockApp.timer;
    if (t.running && Date.now() >= t.end) {
        t.running = false; t.remaining = 0; t.total = 0;
        ClockApp.ring('Timer', 'Your timer is done.');
        ClockApp.paintTimer();
    }
    const now = new Date();
    if (now.getSeconds() > 1) return;
    const hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const stamp = now.toDateString() + hm;
    (Store.get('alarms') || []).forEach((a) => {
        if (a.on && a.time === hm && ClockApp._fired !== stamp + a.id) {
            ClockApp._fired = stamp + a.id;
            ClockApp.ring('Alarm', `${a.label || 'Alarm'} · ${a.time}`);
        }
    });
});

Apps.define('clock', { open: (nav) => ClockApp.open(nav), onClose: () => ClockApp.onClose(), dark: true });
