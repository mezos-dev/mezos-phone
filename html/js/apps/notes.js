/* Notes + Calculator + Store */
'use strict';

/* ---------------- Notes ---------------- */
const NotesApp = {
    nav: null, page: null,
    open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Notes', large: true, search: { placeholder: 'Search', onInput: (q) => this.render(q) } });
        this.page.classList.add('notes-page');
        const bar = el('<div class="notes-bar"><span id="notes-count"></span><i class="fa-solid fa-pen-to-square" id="notes-new"></i></div>');
        $('#notes-new', bar).onclick = () => this.edit();
        this.page.appendChild(bar);
        nav.push(this.page, false);
        this.render();
    },
    render(q = '') {
        const c = this.page.content;
        c.innerHTML = '';
        const notes = (Store.get('notes') || []).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updated - a.updated)
            .filter((n) => !q || (n.text || '').toLowerCase().includes(q));
        $('#notes-count', this.page).textContent = `${(Store.get('notes') || []).length} Notes`;
        if (!notes.length) { c.appendChild(UI.empty('fa-regular fa-note-sticky', q ? 'No Results' : 'No Notes', q ? '' : 'Tap the pencil to write your first note.')); return; }
        const pinned = notes.filter((n) => n.pinned), rest = notes.filter((n) => !n.pinned);
        const mk = (list) => UI.list(list.map((n) => {
            const lines = String(n.text || '').split('\n').filter((x) => x.trim());
            return { title: lines[0] || 'New Note', sub: `${shortDate(n.updated)}  ${lines[1] || 'No additional text'}`, onClick: () => this.edit(n), noChevron: true };
        }));
        if (pinned.length) { c.appendChild(UI.header('Pinned', true)); c.appendChild(mk(pinned)); }
        if (rest.length) { c.appendChild(UI.header(pinned.length ? 'Notes' : '', true)); c.appendChild(mk(rest)); }
    },
    edit(note) {
        const isNew = !note;
        note = note || { id: uid(), text: '', updated: Date.now(), pinned: false };
        const save = () => {
            const text = ta.value;
            let all = Store.get('notes') || [];
            if (!text.trim()) all = all.filter((n) => n.id !== note.id);
            else {
                const ex = all.find((n) => n.id === note.id);
                if (ex) { if (ex.text !== text) { ex.text = text; ex.updated = Date.now(); } ex.pinned = note.pinned; }
                else all.push({ id: note.id, text, updated: Date.now(), pinned: note.pinned });
            }
            Store.set('notes', all);
        };
        const page = UI.page({
            back: () => { save(); this.nav.pop(); this.render(); }, backLabel: 'Notes', bg2: true,
            right: [
                { icon: 'fa-solid fa-ellipsis', onClick: () => UI.actions({ buttons: [
                    { text: note.pinned ? 'Unpin Note' : 'Pin Note', onClick: () => { note.pinned = !note.pinned; save(); UI.hud('fa-solid fa-thumbtack', note.pinned ? 'Pinned' : 'Unpinned'); } },
                    { text: 'Copy Text', onClick: () => { copyText(ta.value); UI.hud('fa-solid fa-copy', 'Copied'); } },
                    { text: 'Send in Messages', onClick: async () => {
                        const num = await UI.prompt('Send Note', 'Phone number', 'Number');
                        if (!num) return;
                        const dt = new Date();
                        nui('SendMessage', { ChatNumber: String(num), ChatDate: `${dt.getDate()}-${dt.getMonth()}-${dt.getFullYear()}`, ChatMessage: ta.value.slice(0, 500), ChatTime: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`, ChatType: 'message' });
                        UI.hud('fa-solid fa-paper-plane', 'Sent');
                    } },
                    { text: 'Delete Note', red: true, onClick: () => { ta.value = ''; save(); this.nav.pop(); this.render(); } },
                ] }) },
                { text: 'Done', bold: true, onClick: () => { save(); ta.blur(); UI.hud('fa-solid fa-check', 'Saved', 700); } },
            ],
        });
        page.classList.add('notes-edit');
        const d = parseDate(note.updated);
        page.content.innerHTML = `<div class="note-date">${d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''}</div><textarea class="note-editor" maxlength="5000" placeholder="Start typing…"></textarea>`;
        const ta = $('textarea', page);
        ta.value = note.text || '';
        let t;
        ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(save, 600); });
        page._onPop = () => save();
        this.nav.push(page);
        if (isNew) setTimeout(() => ta.focus(), 450);
    },
};
Apps.define('notes', { open: (nav) => NotesApp.open(nav), onClose: () => { const ta = $('.note-editor'); if (ta) ta.dispatchEvent(new Event('input')); } });

/* ---------------- Calculator ---------------- */
const Calc = {
    cur: '0', prev: null, op: null, fresh: true,
    open(nav) {
        const page = el(`<div class="page calc-page"><div class="calc-display" id="calc-display">0</div><div class="calc-grid">
            ${[['AC', 'fn', 'clear'], ['+/-', 'fn', 'neg'], ['%', 'fn', 'pct'], ['÷', 'op', '/'],
               ['7', 'num'], ['8', 'num'], ['9', 'num'], ['×', 'op', '*'],
               ['4', 'num'], ['5', 'num'], ['6', 'num'], ['−', 'op', '-'],
               ['1', 'num'], ['2', 'num'], ['3', 'num'], ['+', 'op', '+'],
               ['0', 'num zero'], ['.', 'num', '.'], ['=', 'op', '=']]
                .map(([l, c, v]) => `<div class="ck ${c}" data-v="${v || l}">${l}</div>`).join('')}</div></div>`);
        nav.push(page, false);
        $('.calc-grid', page).onclick = (e) => { const k = e.target.closest('.ck'); if (k) this.press(k.dataset.v, k); };
        this._keys = (e) => {
            if (S.currentApp !== 'calculator') return;
            const map = { Enter: '=', '=': '=', Escape: null, Backspace: 'back', '/': '/', '*': '*', '-': '-', '+': '+', '.': '.', ',': '.', '%': 'pct' };
            if (/^[0-9]$/.test(e.key)) this.press(e.key);
            else if (map[e.key]) this.press(map[e.key]);
        };
        document.addEventListener('keydown', this._keys);
        this.paint();
    },
    onClose() { document.removeEventListener('keydown', this._keys); },
    calc(a, b, op) {
        a = parseFloat(a); b = parseFloat(b);
        switch (op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? NaN : a / b; default: return b; }
    },
    fmt(n) {
        const s = String(n);
        if (s === 'Error' || !isFinite(Number(s.replace(/\.$/, '')))) return 'Error';
        const neg = s.startsWith('-');
        const [i, d] = s.replace('-', '').split('.');
        return (neg ? '-' : '') + Number(i).toLocaleString('en-US') + (d !== undefined ? '.' + d : '');
    },
    press(v, keyEl) {
        if (/^[0-9]$/.test(v)) {
            if (this.fresh || this.cur === '0') { this.cur = v; this.fresh = false; }
            else if (this.cur.replace(/[-.]/g, '').length < 9) this.cur += v;
        } else if (v === '.') {
            if (this.fresh) { this.cur = '0.'; this.fresh = false; } else if (!this.cur.includes('.')) this.cur += '.';
        } else if (v === 'clear') { this.cur = '0'; this.prev = null; this.op = null; this.fresh = true; }
        else if (v === 'neg') { this.cur = this.cur.startsWith('-') ? this.cur.slice(1) : (this.cur === '0' ? '0' : '-' + this.cur); }
        else if (v === 'pct') { this.cur = String(parseFloat(this.cur) / 100); }
        else if (v === 'back') { if (!this.fresh) this.cur = this.cur.length > 1 ? this.cur.slice(0, -1) : '0'; }
        else if (['+', '-', '*', '/'].includes(v)) {
            if (this.op && !this.fresh) this.cur = String(+this.calc(this.prev, this.cur, this.op).toPrecision(12));
            this.prev = this.cur; this.op = v; this.fresh = true;
        } else if (v === '=') {
            if (this.op) { this.cur = String(+this.calc(this.prev, this.cur, this.op).toPrecision(12)); this.op = null; this.prev = null; this.fresh = true; }
        }
        this.paint();
    },
    paint() {
        const d = $('#calc-display'); if (!d) return;
        const txt = this.fmt(this.cur);
        d.textContent = txt;
        d.style.fontSize = txt.length > 9 ? '3.6rem' : txt.length > 7 ? '4.6rem' : '5.6rem';
        $$('.ck.op').forEach((k) => k.classList.toggle('active', this.fresh && this.op === k.dataset.v));
        const ac = $('.ck[data-v="clear"]'); if (ac) ac.textContent = this.cur !== '0' && !this.fresh ? 'C' : 'AC';
    },
};
Apps.define('calculator', { open: (nav) => Calc.open(nav), onClose: () => Calc.onClose(), dark: true });
