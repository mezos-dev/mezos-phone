/* =========================================================
   mezos-phone — UI kit (navigation, sheets, alerts, lists)
   ========================================================= */
'use strict';

class Nav {
    constructor(win) { this.win = win; this.stack = []; }
    get top() { return this.stack[this.stack.length - 1]; }
    get depth() { return this.stack.length; }
    push(page, animate = true) {
        const prev = this.top;
        this.stack.push(page);
        page._nav = this;
        if (prev && animate) page.classList.add('enter');
        this.win.appendChild(page);
        if (prev && animate) {
            void page.offsetWidth;
            page.classList.remove('enter');
            prev.classList.add('behind');
        } else if (prev) {
            prev.classList.add('behind');
        }
        if (page._onShow) page._onShow();
        return page;
    }
    pop() {
        if (this.stack.length <= 1) return false;
        const top = this.stack.pop();
        const prev = this.top;
        top.classList.add('leave');
        prev.classList.remove('behind');
        if (top._onPop) top._onPop();
        if (prev._onShow) prev._onShow();
        setTimeout(() => top.remove(), 430);
        return true;
    }
    popToRoot() { while (this.stack.length > 1) this.pop(); }
    reset(page) {
        this.stack.forEach((p) => p.remove());
        this.stack = [];
        this.push(page, false);
    }
}

const UI = {
    /** Build a page with an iOS navigation bar.
     *  opts: { title, large, sub, back, backLabel, right:[{icon,text,bold,onClick,id}], bg2, translucent, search, tabbar } */
    page(opts = {}) {
        const page = el(`<div class="page ${opts.bg2 ? 'bg2' : ''} ${opts.cls || ''}">
            <div class="navbar ${opts.translucent ? 'translucent' : ''} ${opts.bg2 ? 'bg2' : ''}">
                <div class="nav-row">
                    <div class="nav-left"></div>
                    <div class="nav-title">${opts.large ? '' : esc(opts.title || '')}</div>
                    <div class="nav-actions"></div>
                </div>
            </div>
            <div class="scroll ${opts.tabbar ? 'with-tabbar' : ''}"></div>
        </div>`);
        const left = $('.nav-left', page);
        if (opts.back) {
            const b = el(`<div class="nav-btn"><i class="fa-solid fa-chevron-left"></i>${esc(opts.backLabel || 'Back')}</div>`);
            b.onclick = () => (typeof opts.back === 'function' ? opts.back() : page._nav && page._nav.pop());
            left.appendChild(b);
        } else if (opts.left) {
            opts.left.forEach((r) => left.appendChild(UI._navBtn(r)));
        }
        const right = $('.nav-actions', page);
        (opts.right || []).forEach((r) => right.appendChild(UI._navBtn(r)));
        page.body = $('.scroll', page);
        page.nav = $('.navbar', page);
        if (opts.large) {
            page.body.appendChild(el(`<div class="large-title">${esc(opts.title || '')}</div>`));
            if (opts.sub) page.body.appendChild(el(`<div class="large-sub">${esc(opts.sub)}</div>`));
            // show small title when scrolled
            const t = $('.nav-title', page);
            page.body.addEventListener('scroll', () => {
                t.textContent = page.body.scrollTop > 40 ? (opts.title || '') : '';
                page.nav.classList.toggle('translucent', page.body.scrollTop > 6);
            });
        }
        if (opts.search) {
            const s = el(`<div class="search"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="${esc(opts.search.placeholder || 'Search')}"></div>`);
            const inp = $('input', s);
            inp.addEventListener('input', () => opts.search.onInput(inp.value.trim().toLowerCase()));
            page.body.appendChild(s);
            page.searchInput = inp;
        }
        page.content = el('<div class="page-content"></div>');
        page.body.appendChild(page.content);
        page.setTitle = (t) => { $('.nav-title', page).textContent = t; };
        return page;
    },

    _navBtn(r) {
        const b = el(`<div class="nav-btn ${r.bold ? 'bold' : ''}" ${r.id ? `id="${r.id}"` : ''}>${r.icon ? `<i class="${r.icon}"></i>` : ''}${r.text ? esc(r.text) : ''}</div>`);
        b.onclick = (e) => { e.stopPropagation(); r.onClick && r.onClick(b); };
        return b;
    },

    /** Grouped list: rows = [{ icon, iconBg, avatar, title, sub, value, chevron, onClick, cls, right(html), toggle:{on,onChange} }] */
    list(rows, opts = {}) {
        const wrap = el(`<div class="list ${opts.flush ? 'flush' : ''}"></div>`);
        rows.filter(Boolean).forEach((r) => wrap.appendChild(UI.row(r)));
        return wrap;
    },

    row(r) {
        const hasIcon = !!r.icon;
        const row = el(`<div class="row ${r.onClick ? 'tap' : ''} ${hasIcon ? 'has-icon' : ''} ${r.avatar ? 'has-avatar' : ''} ${r.cls || ''}">
            ${hasIcon ? `<div class="row-icon" style="background:${r.iconBg || 'var(--blue)'}"><i class="${r.icon}"></i></div>` : ''}
            ${r.avatar || ''}
            <div class="row-body">
                <div class="row-title ${r.bold ? 'bold' : ''}">${r.html ? r.title : esc(r.title)}</div>
                ${r.sub !== undefined && r.sub !== null && r.sub !== '' ? `<div class="row-sub ${r.wrap ? 'wrap' : ''}">${r.html ? r.sub : esc(r.sub)}</div>` : ''}
            </div>
            ${r.value !== undefined ? `<div class="row-value">${esc(r.value)}</div>` : ''}
            ${r.right || ''}
            ${r.toggle ? `<div class="toggle ${r.toggle.on ? 'on' : ''}"></div>` : ''}
            ${r.chevron || (r.onClick && r.chevron !== false && !r.toggle && !r.noChevron) ? '<i class="fa-solid fa-chevron-right row-chev"></i>' : ''}
        </div>`);
        if (r.onClick) row.addEventListener('click', (e) => r.onClick(e, row));
        if (r.toggle) {
            const t = $('.toggle', row);
            t.addEventListener('click', (e) => {
                e.stopPropagation();
                t.classList.toggle('on');
                r.toggle.onChange && r.toggle.onChange(t.classList.contains('on'), t);
            });
        }
        return row;
    },

    header(text, plain) { return el(`<div class="section-header ${plain ? 'plain' : ''}">${esc(text)}</div>`); },
    footer(text) { return el(`<div class="section-footer">${esc(text)}</div>`); },
    empty(icon, title, text) { return el(`<div class="empty"><i class="${icon}"></i><b>${esc(title)}</b><span>${esc(text || '')}</span></div>`); },
    loading() { return el('<div class="loading"><i class="fa-solid fa-circle-notch spin"></i></div>'); },

    segmented(items, active, onChange) {
        const seg = el(`<div class="segmented">${items.map((it) => `<span data-id="${esc(it.id)}" class="${it.id === active ? 'active' : ''}">${esc(it.label)}</span>`).join('')}</div>`);
        seg.addEventListener('click', (e) => {
            const sp = e.target.closest('span'); if (!sp) return;
            $$('span', seg).forEach((x) => x.classList.toggle('active', x === sp));
            onChange(sp.dataset.id);
        });
        return seg;
    },

    tabbar(tabs, active, onChange) {
        const bar = el(`<div class="tabbar">${tabs.map((t) => `<div class="tab ${t.id === active ? 'active' : ''}" data-id="${t.id}"><i class="${t.icon}"></i><span>${esc(t.label)}</span>${t.badge ? `<span class="badge">${t.badge}</span>` : ''}</div>`).join('')}</div>`);
        bar.addEventListener('click', (e) => {
            const t = e.target.closest('.tab'); if (!t) return;
            $$('.tab', bar).forEach((x) => x.classList.toggle('active', x === t));
            onChange(t.dataset.id);
        });
        bar.select = (id) => $$('.tab', bar).forEach((x) => x.classList.toggle('active', x.dataset.id === id));
        return bar;
    },

    /** Text fields group: fields = [{ id, label, placeholder, value, type, textarea }] */
    form(fields) {
        const wrap = el('<div class="list"></div>');
        fields.forEach((f) => {
            const inner = f.textarea
                ? `<textarea data-id="${f.id}" placeholder="${esc(f.placeholder || '')}" maxlength="${f.max || 1000}">${esc(f.value || '')}</textarea>`
                : `<input data-id="${f.id}" type="${f.type || 'text'}" placeholder="${esc(f.placeholder || '')}" value="${esc(f.value || '')}" ${f.max ? `maxlength="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`;
            wrap.appendChild(el(`<div class="field">${f.label ? `<label>${esc(f.label)}</label>` : ''}${inner}</div>`));
        });
        wrap.values = () => {
            const o = {};
            $$('[data-id]', wrap).forEach((i) => { o[i.dataset.id] = i.value.trim(); });
            return o;
        };
        wrap.set = (id, v) => { const i = $(`[data-id="${id}"]`, wrap); if (i) i.value = v; };
        return wrap;
    },

    _layer() { return $('#modal-layer'); },

    /** Bottom sheet modal */
    sheet(opts = {}) {
        const layer = UI._layer();
        const back = el('<div class="backdrop"></div>');
        const sheet = el(`<div class="sheet ${opts.half ? 'half' : ''}"><div class="grabber"></div></div>`);
        const page = UI.page({
            title: opts.title,
            left: opts.cancel === false ? [] : [{ text: opts.cancel || 'Cancel', onClick: () => close() }],
            right: opts.done ? [{ text: opts.done, bold: true, onClick: async () => { if (!opts.onDone || (await opts.onDone(sheet)) !== false) close(); } }] : [],
        });
        page.classList.remove('page');
        page.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
        sheet.appendChild(page);
        sheet.body = page.content;
        sheet.scroller = page.body;
        layer.append(back, sheet);
        requestAnimationFrame(() => { back.classList.add('show'); sheet.classList.add('show'); });
        const close = () => {
            back.classList.remove('show'); sheet.classList.remove('show');
            setTimeout(() => { back.remove(); sheet.remove(); }, 450);
            opts.onClose && opts.onClose();
        };
        back.onclick = close;
        sheet.close = close;
        if (opts.content) opts.content(sheet.body, sheet);
        return sheet;
    },

    /** iOS alert. buttons: [{ text, style:'bold'|'red', value }] → resolves { value, input } */
    alert(opts = {}) {
        return new Promise((resolve) => {
            const layer = UI._layer();
            const back = el('<div class="backdrop"></div>');
            const btns = opts.buttons || [{ text: 'OK', style: 'bold', value: true }];
            const a = el(`<div class="alert"><div class="a-body">
                <div class="a-title">${esc(opts.title || '')}</div>
                ${opts.text ? `<div class="a-text">${esc(opts.text)}</div>` : ''}
                ${opts.input ? `<input type="${opts.input.type || 'text'}" placeholder="${esc(opts.input.placeholder || '')}" value="${esc(opts.input.value || '')}">` : ''}
            </div><div class="a-btns ${btns.length > 2 ? 'vertical' : ''}">${btns.map((b, i) => `<div class="a-btn ${b.style || ''}" data-i="${i}">${esc(b.text)}</div>`).join('')}</div></div>`);
            layer.append(back, a);
            requestAnimationFrame(() => { back.classList.add('show'); a.classList.add('show'); });
            const inp = $('input', a);
            if (inp) setTimeout(() => inp.focus(), 250);
            const done = (i) => {
                back.classList.remove('show'); a.classList.remove('show');
                setTimeout(() => { back.remove(); a.remove(); }, 260);
                resolve({ value: i === null ? null : btns[i].value, input: inp ? inp.value.trim() : null });
            };
            a.addEventListener('click', (e) => { const b = e.target.closest('.a-btn'); if (b) done(Number(b.dataset.i)); });
            if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const i = btns.findIndex((b) => b.value); done(i < 0 ? btns.length - 1 : i); } });
        });
    },
    async confirm(title, text, ok = 'OK', destructive = false) {
        const r = await UI.alert({ title, text, buttons: [{ text: 'Cancel', value: false }, { text: ok, style: destructive ? 'red bold' : 'bold', value: true }] });
        return !!r.value;
    },
    async prompt(title, text, placeholder = '', value = '', type = 'text') {
        const r = await UI.alert({ title, text, input: { placeholder, value, type }, buttons: [{ text: 'Cancel', value: false }, { text: 'OK', style: 'bold', value: true }] });
        return r.value ? r.input : null;
    },

    /** Action sheet: buttons [{ text, red, bold, onClick }] */
    actions(opts = {}) {
        const layer = UI._layer();
        const back = el('<div class="backdrop"></div>');
        const sh = el(`<div class="action-sheet"><div class="as-group">${opts.title ? `<div class="as-title">${esc(opts.title)}</div>` : ''}${(opts.buttons || []).map((b, i) => `<div class="as-btn ${b.red ? 'red' : ''} ${b.bold ? 'bold' : ''}" data-i="${i}">${esc(b.text)}</div>`).join('')}</div><div class="as-group as-cancel"><div class="as-btn bold" data-i="-1">Cancel</div></div></div>`);
        layer.append(back, sh);
        requestAnimationFrame(() => { back.classList.add('show'); sh.classList.add('show'); });
        const close = () => { back.classList.remove('show'); sh.classList.remove('show'); setTimeout(() => { back.remove(); sh.remove(); }, 420); };
        back.onclick = close;
        sh.addEventListener('click', (e) => {
            const b = e.target.closest('.as-btn'); if (!b) return;
            close();
            const i = Number(b.dataset.i);
            if (i >= 0 && opts.buttons[i].onClick) opts.buttons[i].onClick();
        });
    },

    hud(icon, text, ms = 1300) {
        const h = el(`<div class="hud"><i class="${icon}"></i><span>${esc(text)}</span></div>`);
        UI._layer().appendChild(h);
        requestAnimationFrame(() => h.classList.add('show'));
        setTimeout(() => { h.classList.remove('show'); setTimeout(() => h.remove(), 300); }, ms);
    },

    closeModals() { UI._layer().innerHTML = ''; },

    /** big viewer outside phone */
    viewImage(src) {
        const v = $('#viewer');
        $('img', v).src = src;
        v.classList.add('show');
    },
};

document.addEventListener('click', (e) => {
    if (e.target.closest('#viewer')) $('#viewer').classList.remove('show');
});
