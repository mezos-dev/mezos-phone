/* Calendar */
'use strict';

const CalendarApp = {
    nav: null, page: null, month: null, selected: null,

    key(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; },

    open(nav) {
        this.nav = nav;
        const now = new Date();
        this.month = new Date(now.getFullYear(), now.getMonth(), 1);
        this.selected = this.key(now);
        this.page = UI.page({ title: '', right: [{ text: 'Today', onClick: () => { const n = new Date(); this.month = new Date(n.getFullYear(), n.getMonth(), 1); this.selected = this.key(n); this.render(); } }, { icon: 'fa-solid fa-plus', onClick: () => this.add() }] });
        nav.push(this.page, false);
        this.render();
    },

    render() {
        const c = this.page.content;
        const events = Store.get('events') || [];
        const m = this.month;
        const first = new Date(m.getFullYear(), m.getMonth(), 1).getDay();
        const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const today = this.key(new Date());
        let cells = '';
        for (let i = 0; i < first; i++) cells += '<span></span>';
        for (let d = 1; d <= days; d++) {
            const k = this.key(new Date(m.getFullYear(), m.getMonth(), d));
            const has = events.some((e) => e.date === k);
            cells += `<span class="cd ${k === today ? 'today' : ''} ${k === this.selected ? 'sel' : ''}" data-k="${k}">${d}${has ? '<i></i>' : ''}</span>`;
        }
        c.innerHTML = `<div class="cal-head"><span class="cal-arrow" data-d="-1"><i class="fa-solid fa-chevron-left"></i></span><h2>${MONTHS[m.getMonth()]} <span class="text-red">${m.getFullYear()}</span></h2><span class="cal-arrow" data-d="1"><i class="fa-solid fa-chevron-right"></i></span></div>
            <div class="cal-week">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<span>${x}</span>`).join('')}</div>
            <div class="cal-grid">${cells}</div>`;
        $$('.cal-arrow', c).forEach((a) => { a.onclick = () => { this.month = new Date(m.getFullYear(), m.getMonth() + Number(a.dataset.d), 1); this.render(); }; });
        $('.cal-grid', c).onclick = (e) => { const d = e.target.closest('.cd'); if (d) { this.selected = d.dataset.k; this.render(); } };
        const sel = new Date(this.selected + 'T00:00:00');
        c.appendChild(UI.header(`${DAYS[sel.getDay()]}, ${sel.getDate()} ${MONTHS[sel.getMonth()]}`, true));
        const list = events.filter((e) => e.date === this.selected).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        if (!list.length) c.appendChild(UI.list([{ title: 'No Events', sub: 'Tap + to add an event', cls: 'muted' }]));
        else c.appendChild(UI.list(list.map((e) => ({
            title: `<span class="ev-bar"></span>${esc(e.title)}`, html: true, sub: e.time || 'All-day', onClick: () => this.add(e),
        }))));
    },

    add(ev) {
        UI.sheet({
            title: ev ? 'Edit Event' : 'New Event', done: ev ? 'Save' : 'Add',
            content: (body) => {
                const f = UI.form([
                    { id: 'title', placeholder: 'Title', value: ev ? ev.title : '', max: 60 },
                    { id: 'date', label: 'Date', type: 'date', value: ev ? ev.date : this.selected },
                    { id: 'time', label: 'Time', type: 'time', value: ev ? ev.time : '' },
                ]);
                body.appendChild(el('<div style="height:1rem"></div>'));
                body.appendChild(f);
                body._form = f;
                body.appendChild(UI.footer('Leave the time empty for an all-day event. You get a notification at the event time.'));
                if (ev) {
                    const del = UI.list([{ title: 'Delete Event', cls: 'red', noChevron: true, onClick: () => {
                        Store.set('events', (Store.get('events') || []).filter((x) => x.id !== ev.id));
                        UI.closeModals(); this.render();
                    } }]);
                    del.style.marginTop = '1.4rem';
                    body.appendChild(del);
                }
            },
            onDone: (sheet) => {
                const v = sheet.body._form.values();
                if (!v.title || !v.date) { UI.hud('fa-solid fa-triangle-exclamation', 'Add a title'); return false; }
                const all = Store.get('events') || [];
                if (ev) Object.assign(all.find((x) => x.id === ev.id) || {}, v);
                else all.push(Object.assign({ id: uid() }, v));
                Store.set('events', all);
                this.selected = v.date;
                const d = new Date(v.date + 'T00:00:00');
                this.month = new Date(d.getFullYear(), d.getMonth(), 1);
                this.render();
                return true;
            },
        });
    },
};

Apps.define('calendar', { open: (nav) => CalendarApp.open(nav) });

// Event reminders
Phone.on('mz:second', () => {
    const now = new Date();
    if (now.getSeconds() > 1) return;
    const k = CalendarApp.key(now), hm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    (Store.get('events') || []).forEach((e) => {
        if (e.date === k && e.time === hm && CalendarApp._fired !== k + hm + e.id) {
            CalendarApp._fired = k + hm + e.id;
            Phone.notify({ app: 'calendar', title: 'Calendar', text: `${e.title} · now`, timeout: 6000 });
        }
    });
});
