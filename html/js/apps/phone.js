/* Phone — favourites, recents, contacts, keypad, calls */
'use strict';

const PhoneApp = {
    nav: null, root: null, tab: 'contacts', tabbar: null, view: null,

    open(nav, opts = {}) {
        this.nav = nav;
        this.root = el('<div class="page"></div>');
        this.view = el('<div class="tab-view"></div>');
        this.tab = opts.tab || (Number((S.appsCfg.phone || {}).Alerts) > 0 ? 'recents' : this.tab || 'contacts');
        this.tabbar = UI.tabbar([
            { id: 'favorites', icon: 'fa-solid fa-star', label: 'Favorites' },
            { id: 'recents', icon: 'fa-solid fa-clock-rotate-left', label: 'Recents' },
            { id: 'contacts', icon: 'fa-solid fa-circle-user', label: 'Contacts' },
            { id: 'keypad', icon: 'fa-solid fa-table-cells', label: 'Keypad' },
        ], this.tab, (id) => this.show(id));
        this.root.append(this.view, this.tabbar);
        nav.push(this.root, false);
        this.show(this.tab);
        Phone.clearAlerts('phone');
        if (opts.contact) setTimeout(() => this.detail(opts.contact), 50);
        if (opts.number) setTimeout(() => this.show('keypad', opts.number), 50);
    },

    onReopen(opts) {
        this.nav.popToRoot();
        if (opts.tab) { this.tabbar.select(opts.tab); this.show(opts.tab); }
        if (opts.contact) this.detail(opts.contact);
    },

    show(id, preset) {
        this.tab = id;
        this.tabbar.select(id);
        this.view.innerHTML = '';
        const page = this[id](preset);
        page.style.position = 'absolute';
        this.view.appendChild(page);
    },

    /* ---------- Favorites ---------- */
    favorites() {
        const page = UI.page({ title: 'Favorites', large: true, tabbar: true, right: [{ icon: 'fa-solid fa-plus', onClick: () => this.show('contacts') }] });
        const favs = (Store.get('favorites') || []).map((n) => (S.contacts || []).find((c) => String(c.number) === String(n)) || { name: n, number: n });
        if (!favs.length) {
            page.content.appendChild(UI.empty('fa-regular fa-star', 'No Favorites', 'Open a contact and tap "Add to Favorites".'));
            return page;
        }
        page.content.appendChild(UI.list(favs.map((c) => ({
            avatar: avatarHTML(c.name), title: c.name, sub: 'mobile', onClick: () => Phone.startCall(c.number, c.name),
            right: '<i class="fa-solid fa-circle-info text-blue info-btn" style="font-size:1.4rem"></i>', noChevron: true,
        }))));
        $$('.info-btn', page).forEach((b, i) => b.addEventListener('click', (e) => { e.stopPropagation(); this.detail(favs[i]); }));
        return page;
    },

    /* ---------- Recents ---------- */
    recents() {
        let filter = 'all';
        const page = UI.page({ title: 'Recents', large: true, tabbar: true });
        const seg = UI.segmented([{ id: 'all', label: 'All' }, { id: 'missed', label: 'Missed' }], filter, (v) => { filter = v; render(); });
        page.content.appendChild(seg);
        const box = el('<div></div>');
        page.content.appendChild(box);
        let calls = [];
        const render = () => {
            box.innerHTML = '';
            const list = calls.filter((c) => filter === 'all' || c.type === 'missed');
            if (!list.length) { box.appendChild(UI.empty('fa-solid fa-phone-slash', 'No Recents', '')); return; }
            box.appendChild(UI.list(list.map((c) => {
                const name = c.anonymous ? 'Unknown' : (Phone.contactName(c.number) || c.name);
                const icon = c.type === 'outgoing' ? '<i class="fa-solid fa-phone-flip" style="font-size:.8rem;opacity:.6;margin-right:.3rem"></i>' : '';
                return {
                    title: `<span class="${c.type === 'missed' ? 'text-red' : ''}">${esc(name)}</span>`, html: true,
                    sub: `${icon}${c.type === 'missed' ? 'Missed' : c.type === 'outgoing' ? 'Outgoing' : 'mobile'}`,
                    right: `<span class="row-value" style="font-size:.95rem">${esc(c.time || '')}</span><i class="fa-solid fa-circle-info text-blue info-btn" style="font-size:1.4rem;margin-left:.4rem"></i>`,
                    noChevron: true,
                    onClick: () => { if (!c.anonymous) Phone.startCall(c.number, name); },
                };
            })));
            $$('.info-btn', box).forEach((b, i) => b.addEventListener('click', (e) => {
                e.stopPropagation();
                const c = list[i];
                if (c.anonymous) return;
                this.detail((S.contacts || []).find((x) => String(x.number) === String(c.number)) || { name: c.number, number: c.number, unknown: true });
            }));
        };
        box.appendChild(UI.loading());
        nui('GetMissedCalls').then((r) => { calls = (Array.isArray(r) ? r : Object.values(r || {})).slice().reverse(); render(); });
        nui('ClearRecentAlerts');
        return page;
    },

    /* ---------- Contacts ---------- */
    contacts() {
        const me = S.player.charinfo || {};
        const page = UI.page({
            title: 'Contacts', large: true, tabbar: true,
            right: [{ icon: 'fa-solid fa-plus', onClick: () => this.editSheet() }],
            search: { placeholder: 'Search', onInput: (v) => render(v) },
        });
        const box = el('<div></div>');
        page.content.appendChild(box);

        const render = (q = '') => {
            box.innerHTML = '';
            if (!q) {
                box.appendChild(UI.list([{
                    avatar: avatarHTML(`${me.firstname || ''} ${me.lastname || ''}`, S.meta.profilepicture, 'md'),
                    title: `<b style="font-size:1.3rem">${esc((me.firstname || '') + ' ' + (me.lastname || ''))}</b>`, html: true,
                    sub: `My Card · ${esc(me.phone || '')}`,
                    onClick: () => this.myCard(),
                }]));
                const sug = el('<div></div>');
                box.appendChild(sug);
                nui('GetSuggestedContacts').then((list) => {
                    list = Array.isArray(list) ? list : Object.values(list || {});
                    if (!list.length) return;
                    sug.appendChild(UI.header(`Suggested (${list.length})`));
                    sug.appendChild(UI.list(list.map((s) => ({
                        icon: 'fa-solid fa-user-plus', iconBg: 'var(--orange)',
                        title: Array.isArray(s.name) ? s.name.join(' ') : s.name, sub: s.number,
                        onClick: () => this.editSheet({ name: Array.isArray(s.name) ? s.name.join(' ') : s.name, number: s.number, iban: s.bank }, false, s),
                    }))));
                });
            }
            const list = (S.contacts || []).filter((c) => !q || (c.name || '').toLowerCase().includes(q) || String(c.number).includes(q))
                .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            if (!list.length) {
                box.appendChild(UI.empty('fa-regular fa-address-book', q ? 'No Results' : 'No Contacts', q ? '' : 'Tap + to add your first contact.'));
                return;
            }
            const groups = {};
            list.forEach((c) => { const k = ((c.name || '#')[0] || '#').toUpperCase(); (groups[/[A-Z]/.test(k) ? k : '#'] = groups[/[A-Z]/.test(k) ? k : '#'] || []).push(c); });
            Object.keys(groups).sort().forEach((k) => {
                box.appendChild(UI.header(k));
                box.appendChild(UI.list(groups[k].map((c) => ({ title: c.name, onClick: () => this.detail(c), noChevron: true }))));
            });
            box.appendChild(el(`<div class="section-footer" style="text-align:center">${list.length} Contacts</div>`));
        };
        render();
        page._render = render;
        return page;
    },

    myCard() {
        const me = S.player.charinfo || {};
        this.detail({ name: `${me.firstname || ''} ${me.lastname || ''}`, number: me.phone, iban: me.account, me: true });
    },

    detail(c) {
        const isSaved = (S.contacts || []).some((x) => String(x.number) === String(c.number) && x.name === c.name);
        const favs = Store.get('favorites') || [];
        const fav = favs.includes(String(c.number));
        const page = UI.page({
            back: true, backLabel: 'Contacts', bg2: false,
            right: c.me ? [] : isSaved ? [{ text: 'Edit', onClick: () => this.editSheet(c, true) }] : [{ text: 'Add', bold: true, onClick: () => this.editSheet({ number: c.number }) }],
        });
        const pic = c.me ? S.meta.profilepicture : null;
        page.content.innerHTML = `
            <div class="contact-hero center-col">
                ${avatarHTML(c.name, pic, 'lg')}
                <div class="contact-name">${esc(c.name)}</div>
                <div class="contact-actions">
                    <div class="ca" data-a="message"><i class="fa-solid fa-comment"></i>message</div>
                    <div class="ca" data-a="call"><i class="fa-solid fa-phone"></i>call</div>
                    <div class="ca" data-a="video"><i class="fa-solid fa-video"></i>video</div>
                    <div class="ca ${c.iban ? '' : 'disabled'}" data-a="pay"><i class="fa-solid fa-dollar-sign"></i>pay</div>
                </div>
            </div>`;
        const rows = [
            { title: '<span class="row-sub" style="margin:0">mobile</span>', html: true, sub: `<span class="text-blue" style="font-size:1.17rem">${esc(c.number)}</span>`, onClick: () => Phone.startCall(c.number, c.name), noChevron: true },
        ];
        if (c.iban) rows.push({ title: '<span class="row-sub" style="margin:0">bank account</span>', html: true, sub: `<span style="font-size:1.17rem;color:var(--text)">${esc(c.iban)}</span>`, onClick: () => { copyText(c.iban); UI.hud('fa-solid fa-copy', 'Copied'); }, noChevron: true });
        page.content.appendChild(UI.list(rows));
        page.content.appendChild(el('<div style="height:1.2rem"></div>'));
        const actions = [];
        if (!c.me) {
            actions.push({ title: 'Send Message', cls: 'blue', onClick: () => Phone.openApp('whatsapp', { number: c.number, name: c.name }) });
            actions.push({ title: fav ? 'Remove from Favorites' : 'Add to Favorites', cls: 'blue', onClick: () => {
                let f = Store.get('favorites') || [];
                f = fav ? f.filter((n) => n !== String(c.number)) : f.concat(String(c.number));
                Store.set('favorites', f);
                UI.hud(fav ? 'fa-regular fa-star' : 'fa-solid fa-star', fav ? 'Removed' : 'Added to Favorites');
                this.nav.pop(); setTimeout(() => this.detail(c), 450);
            } });
        } else {
            actions.push({ title: 'Share My Contact (AirDrop)', cls: 'blue', onClick: () => { nui('mz:shareContact'); UI.hud('fa-solid fa-tower-broadcast', 'Shared nearby'); } });
            actions.push({ title: 'Copy My Number', cls: 'blue', onClick: () => { copyText(c.number); UI.hud('fa-solid fa-copy', 'Copied'); } });
        }
        page.content.appendChild(UI.list(actions.map((a) => Object.assign(a, { noChevron: true }))));
        if (isSaved && !c.me) {
            page.content.appendChild(el('<div style="height:1.2rem"></div>'));
            page.content.appendChild(UI.list([{ title: 'Delete Contact', cls: 'red', noChevron: true, onClick: () => this.remove(c) }]));
        }
        $('.contact-actions', page).addEventListener('click', (e) => {
            const a = e.target.closest('.ca'); if (!a || a.classList.contains('disabled')) return;
            const k = a.dataset.a;
            if (c.me && k !== 'pay') return UI.hud('fa-solid fa-circle-info', "That's you!");
            if (k === 'call') Phone.startCall(c.number, c.name);
            else if (k === 'message') Phone.openApp('whatsapp', { number: c.number, name: c.name });
            else if (k === 'video') UI.hud('fa-solid fa-video-slash', 'FaceTime unavailable');
            else if (k === 'pay') { Phone.closeApp(true); Phone.openApp('bank', { transfer: { iban: c.iban, name: c.name } }); }
        });
        this.nav.push(page);
    },

    editSheet(c = {}, editing = false, suggestion = null) {
        UI.sheet({
            title: editing ? 'Edit Contact' : 'New Contact', done: 'Done',
            content: (body) => {
                body.appendChild(el(`<div class="center-col" style="padding:1.2rem 0">${avatarHTML(c.name || '?', null, 'lg')}</div>`));
                const form = UI.form([
                    { id: 'name', placeholder: 'Name', value: c.name, max: 40 },
                    { id: 'number', placeholder: 'Phone', value: c.number, max: 20 },
                    { id: 'iban', placeholder: 'Bank account (optional)', value: c.iban, max: 30 },
                ]);
                body.appendChild(form);
                body._form = form;
            },
            onDone: async (sheet) => {
                const v = sheet.body._form.values();
                if (!v.name || !v.number) { UI.hud('fa-solid fa-triangle-exclamation', 'Fill in name and number'); return false; }
                let list;
                if (editing) {
                    list = await nui('EditContact', { CurrentContactName: v.name, CurrentContactNumber: v.number, CurrentContactIban: v.iban, OldContactName: c.name, OldContactNumber: c.number, OldContactIban: c.iban || '' });
                } else {
                    list = await nui('AddNewContact', { ContactName: v.name, ContactNumber: v.number, ContactIban: v.iban });
                    if (suggestion) nui('RemoveSuggestion', { data: suggestion });
                }
                if (Array.isArray(list)) S.contacts = list;
                else if (list && typeof list === 'object') S.contacts = Object.values(list);
                UI.hud('fa-solid fa-check', editing ? 'Saved' : 'Contact added');
                this.nav.popToRoot();
                this.show('contacts');
            },
        });
    },

    async remove(c) {
        if (!(await UI.confirm('Delete Contact', `Delete ${c.name}?`, 'Delete', true))) return;
        const list = await nui('DeleteContact', { CurrentContactName: c.name, CurrentContactNumber: c.number, CurrentContactIban: c.iban || '' });
        if (Array.isArray(list)) S.contacts = list;
        else if (list && typeof list === 'object') S.contacts = Object.values(list);
        this.nav.popToRoot();
        this.show('contacts');
    },

    /* ---------- Keypad ---------- */
    keypad(preset = '') {
        let num = preset || '';
        const page = el('<div class="page keypad-page"></div>');
        page.innerHTML = `
            <div class="kp-display"><div class="kp-number" id="kp-number"></div><div class="kp-add" id="kp-add">Add Number</div></div>
            <div class="kp-grid">${[['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']]
                .map(([n, l]) => `<div class="kp-key" data-k="${n}">${n}<small>${l}</small></div>`).join('')}
                <div></div><div class="kp-call" id="kp-call"><i class="fa-solid fa-phone"></i></div><div class="kp-del" id="kp-del"><i class="fa-solid fa-delete-left"></i></div>
            </div>`;
        const paint = () => {
            $('#kp-number', page).textContent = num;
            $('#kp-add', page).style.visibility = num ? 'visible' : 'hidden';
            $('#kp-del', page).style.visibility = num ? 'visible' : 'hidden';
            const known = (S.contacts || []).find((c) => String(c.number) === num);
            $('#kp-add', page).textContent = known ? known.name : 'Add Number';
        };
        $('.kp-grid', page).addEventListener('click', (e) => {
            const k = e.target.closest('.kp-key');
            if (k && num.length < 15) { num += k.dataset.k; paint(); }
        });
        $('#kp-del', page).onclick = () => { num = num.slice(0, -1); paint(); };
        $('#kp-call', page).onclick = () => { if (num) Phone.startCall(num); };
        $('#kp-add', page).onclick = () => {
            const known = (S.contacts || []).find((c) => String(c.number) === num);
            if (known) this.detail(known); else this.editSheet({ number: num });
        };
        page._keys = (e) => {
            if (this.tab !== 'keypad' || S.currentApp !== 'phone' || document.activeElement.tagName === 'INPUT') return;
            if (/^[0-9*#]$/.test(e.key) && num.length < 15) { num += e.key; paint(); }
            else if (e.key === 'Backspace') { num = num.slice(0, -1); paint(); }
            else if (e.key === 'Enter' && num) Phone.startCall(num);
        };
        document.removeEventListener('keydown', PhoneApp._kpHandler || (() => {}));
        PhoneApp._kpHandler = page._keys;
        document.addEventListener('keydown', page._keys);
        paint();
        return page;
    },

    onClose() {
        if (PhoneApp._kpHandler) document.removeEventListener('keydown', PhoneApp._kpHandler);
    },
};

Apps.define('phone', {
    open: (nav, opts) => PhoneApp.open(nav, opts),
    onReopen: (opts) => PhoneApp.onReopen(opts),
    onClose: () => PhoneApp.onClose(),
});

Phone.on('RefreshContacts', () => {
    if (S.currentApp === 'phone' && PhoneApp.tab === 'contacts' && PhoneApp.nav && PhoneApp.nav.depth === 1) PhoneApp.show('contacts');
});
