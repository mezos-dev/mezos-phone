/* Marketplace + Uber */
'use strict';

const MARKET_CATS = [
    { id: 'all', label: 'All', icon: 'fa-solid fa-border-all' },
    { id: 'vehicles', label: 'Vehicles', icon: 'fa-solid fa-car' },
    { id: 'property', label: 'Property', icon: 'fa-solid fa-house' },
    { id: 'items', label: 'Items', icon: 'fa-solid fa-box' },
    { id: 'services', label: 'Services', icon: 'fa-solid fa-screwdriver-wrench' },
    { id: 'jobs', label: 'Jobs', icon: 'fa-solid fa-briefcase' },
    { id: 'other', label: 'Other', icon: 'fa-solid fa-tag' },
];
const market = (fn, arg, extra = {}) => nui('mz:market', Object.assign({ fn, arg }, extra));

const Market = {
    nav: null, cat: 'all', q: '', grid: null,

    open(nav, opts = {}) {
        this.nav = nav;
        const page = UI.page({
            title: 'Marketplace', large: true,
            right: [{ icon: 'fa-regular fa-user', onClick: () => this.mine() }, { icon: 'fa-solid fa-plus', onClick: () => this.create() }],
            search: { placeholder: 'Search Marketplace', onInput: (v) => { this.q = v; clearTimeout(this._t); this._t = setTimeout(() => this.load(), 300); } },
        });
        const chips = el(`<div class="chips mk-chips">${MARKET_CATS.map((c) => `<span data-c="${c.id}" class="${c.id === this.cat ? 'on' : ''}"><i class="${c.icon}"></i> ${c.label}</span>`).join('')}</div>`);
        chips.onclick = (e) => {
            const c = e.target.closest('[data-c]'); if (!c) return;
            this.cat = c.dataset.c;
            $$('span', chips).forEach((x) => x.classList.toggle('on', x === c));
            this.load();
        };
        page.content.appendChild(chips);
        this.grid = el('<div class="mk-grid"></div>');
        page.content.appendChild(this.grid);
        nav.push(page, false);
        this.load();
        if (opts.compose) setTimeout(() => this.create(opts.compose), 350);
    },
    onReopen(o) { if (o && o.compose) this.create(o.compose); },

    async load() {
        this.grid.innerHTML = UI.loading().outerHTML;
        const rows = listOf(await market('list', { category: this.cat === 'all' ? null : this.cat, q: this.q }));
        this.grid.innerHTML = '';
        if (!rows.length) { this.grid.appendChild(UI.empty('fa-solid fa-store', 'No listings', 'Be the first to sell something!')); return; }
        rows.forEach((r) => this.grid.appendChild(this.card(r)));
    },

    card(r) {
        const c = el(`<div class="mk-card">${r.image ? `<div class="mk-img">${Media.html(r.image)}</div>` : `<div class="mk-img mk-noimg"><i class="${(MARKET_CATS.find((x) => x.id === r.category) || MARKET_CATS[6]).icon}"></i></div>`}
            <b>${Number(r.price) ? money(r.price) : 'Free'}</b><span>${esc(r.title)}</span>${Number(r.sold) ? '<em>SOLD</em>' : ''}</div>`);
        c.onclick = () => this.detail(r);
        return c;
    },

    detail(r) {
        const page = UI.page({ title: '', back: true, backLabel: 'Marketplace' });
        page.content.innerHTML = `
            ${r.image ? `<div class="mk-hero">${Media.html(r.image)}</div>` : ''}
            <div class="mk-detail"><h2>${esc(r.title)}</h2><div class="mk-price">${Number(r.price) ? money(r.price) : 'Free'}</div>
            <small>Listed ${esc(timeAgo(r.created))} ago · ${esc((MARKET_CATS.find((x) => x.id === r.category) || {}).label || 'Other')}</small>
            ${r.description ? `<p>${safeHTML(r.description)}</p>` : ''}</div>
            <div class="section-header">SELLER</div>`;
        page.content.appendChild(UI.list([{ avatar: avatarHTML(r.seller, null, 'sm'), title: r.seller, sub: r.phone || '' }]));
        const btns = el('<div class="btn-row mt"></div>');
        if (r.mine) {
            const sold = el(`<div class="btn ${Number(r.sold) ? 'gray' : 'success'}">${Number(r.sold) ? 'Relist' : 'Mark as sold'}</div>`);
            sold.onclick = async () => { await market('update', null, { id: r.id, op: Number(r.sold) ? 'relist' : 'sold' }); this.nav.pop(); this.load(); };
            const del = el('<div class="btn danger">Delete</div>');
            del.onclick = async () => { if (await UI.confirm('Delete listing?', '', 'Delete', true)) { await market('update', null, { id: r.id, op: 'delete' }); this.nav.pop(); this.load(); } };
            btns.append(sold, del);
        } else if (r.phone) {
            const msg = el('<div class="btn primary"><i class="fa-solid fa-comment"></i>Message</div>');
            msg.onclick = () => {
                Phone.openApp('whatsapp', { number: r.phone, name: r.seller });
                setTimeout(() => { const i = $('#chat-text'); if (i) i.value = `Hi! Is "${r.title}" still available?`; }, 900);
            };
            const call = el('<div class="btn tinted"><i class="fa-solid fa-phone"></i>Call</div>');
            call.onclick = () => Phone.startCall(r.phone, r.seller);
            btns.append(msg, call);
        }
        page.content.appendChild(btns);
        this.nav.push(page);
    },

    async mine() {
        const page = UI.page({ title: 'Your listings', back: true, backLabel: 'Marketplace' });
        const grid = el('<div class="mk-grid"></div>');
        page.content.appendChild(grid);
        this.nav.push(page);
        const rows = listOf(await market('list', { mine: true }));
        if (!rows.length) grid.appendChild(UI.empty('fa-solid fa-tags', 'Nothing listed', 'Tap + to sell something.'));
        rows.forEach((r) => grid.appendChild(this.card(r)));
    },

    create(image) {
        let img = image || '';
        UI.sheet({
            title: 'New listing', done: 'Publish',
            content: (body) => {
                body.innerHTML = `<div class="mk-photo" id="mk-photo">${img ? Media.html(img) : '<i class="fa-solid fa-camera"></i><span>Add photo</span>'}</div>`;
                const form = UI.form([
                    { id: 'title', label: 'Title', placeholder: 'What are you selling?', max: 60 },
                    { id: 'price', label: 'Price', placeholder: '$0', type: 'number' },
                    { id: 'description', placeholder: 'Description', textarea: true, max: 1000 },
                ]);
                body.appendChild(form);
                const cats = el(`<div class="chips mk-chips mt">${MARKET_CATS.slice(1).map((c, i) => `<span data-c="${c.id}" class="${i === 0 ? 'on' : ''}"><i class="${c.icon}"></i> ${c.label}</span>`).join('')}</div>`);
                cats.onclick = (e) => { const c = e.target.closest('[data-c]'); if (!c) return; $$('span', cats).forEach((x) => x.classList.toggle('on', x === c)); };
                body.appendChild(cats);
                $('#mk-photo', body).onclick = async () => {
                    const u = await PhotosApp.pick({ title: 'Listing photo', only: 'image', onCamera: () => Camera.start({ purpose: 'photo', onResult: (url) => Phone.openApp('market', { compose: url }) }) });
                    if (u) { img = u; $('#mk-photo', body).innerHTML = Media.html(u); }
                };
                body._form = form; body._cats = cats;
            },
            onDone: async (sheet) => {
                const v = sheet.body._form.values();
                const cat = $('span.on', sheet.body._cats);
                const r = await market('create', { title: v.title, price: v.price, description: v.description, category: cat ? cat.dataset.c : 'other', image: img });
                if (!r || r.error) { UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Could not publish'); return false; }
                UI.hud('fa-solid fa-circle-check', 'Listing published');
                this.load();
                return true;
            },
        });
    },
};
Apps.define('market', { open: (nav, o) => Market.open(nav, o), onReopen: (o) => Market.onReopen(o) });
Phone.on('mz:market:new', () => { if (S.currentApp === 'market' && Market.nav && Market.nav.depth === 1) Market.load(); });

/* ================= Uber (app id 'ride') ================= */
const ride = (fn, extra = {}) => nui('mz:ride', Object.assign({ fn }, extra));
const RideApp = {
    nav: null, page: null, st: null, mode: 'ride',

    open(nav) {
        this.nav = nav;
        this._first = true;
        this.page = el(`<div class="page uber-page">
            <div class="uber-map"><div class="ride-pin"><i class="fa-solid fa-location-dot"></i></div><div class="ride-pulse"></div>
                <div class="uber-top"><b class="uber-logo">Uber</b><div class="uber-seg"><span data-m="ride">Ride</span><span data-m="drive">Drive</span></div></div></div>
            <div class="uber-sheet"></div></div>`);
        $('.uber-seg', this.page).onclick = (e) => { const t = e.target.closest('[data-m]'); if (t) { this.mode = t.dataset.m; this.render(); } };
        nav.push(this.page, false);
        this.load();
    },

    async load() {
        const st = await ride('state');
        if (!st || S.currentApp !== 'ride' || !this.page) return;
        this.st = st;
        if (st.current) this.mode = st.mineAsDriver ? 'drive' : 'ride';
        else if (st.isDriver && this._first) this.mode = 'drive';
        this._first = false;
        this.render();
    },

    render() {
        const st = this.st || {};
        $$('.uber-seg span', this.page).forEach((x) => x.classList.toggle('on', x.dataset.m === this.mode));
        $('.uber-seg', this.page).classList.toggle('hidden', !st.canDrive && !st.isDriver);
        const box = $('.uber-sheet', this.page);
        const r = st.current;
        if (this.mode === 'drive') {
            if (r && st.mineAsDriver) return this.driverTrip(box, r);
            if (st.isDriver) return this.board(box, listOf(st.open));
            return this.driverOffline(box);
        }
        if (r && !st.mineAsDriver) return this.riderTrip(box, r);
        return this.riderHome(box);
    },

    price(km) {
        const p = (this.st && this.st.pricing) || { base: 40, perKm: 30, min: 60 };
        return Math.max(p.min, Math.floor(p.base + km * p.perKm));
    },

    async riderHome(box) {
        const st = this.st || {};
        box.innerHTML = `<div class="uber-where"><i class="fa-solid fa-magnifying-glass"></i><span id="ub-dest">Where to?</span></div>
            <div class="uber-option on"><div class="uber-car"><i class="fa-solid fa-car-side"></i></div><div><b>UberX <small><i class="fa-solid fa-user"></i> 4</small></b><span>${st.drivers ? `${st.drivers} driver${st.drivers === 1 ? '' : 's'} nearby · ${Math.max(2, 9 - st.drivers)} min` : 'No drivers online'}</span></div><b id="ub-price">—</b></div>
            <input class="uber-note" id="ub-note" maxlength="120" placeholder="Note for your driver (optional)">
            <div class="uber-pay"><i class="fa-solid fa-building-columns"></i> Bank · ${money(st.balance)}</div>
            <div class="uber-btn ${st.drivers ? '' : 'off'}" id="ub-go">Request UberX</div>`;
        $('#ub-go', box).onclick = async () => {
            if (!st.drivers) return UI.hud('fa-solid fa-car-side', 'No drivers online');
            const b = $('#ub-go', box);
            b.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i>';
            const res = await ride('request', { note: $('#ub-note', box).value });
            if (!res || res.error) { b.textContent = 'Request UberX'; return UI.alert({ title: 'Uber', text: (res && res.error) || 'Could not request a ride.' }); }
            this.st.current = res.ride;
            this.render();
        };
        const w = await ride('waypoint');
        if (!this.page || !$('#ub-dest', box)) return;
        if (w && w.street) {
            $('#ub-dest', box).innerHTML = `<b>${esc(w.street)}</b><small>${w.km} km · from your map waypoint</small>`;
            $('#ub-price', box).textContent = money(this.price(w.km));
        } else {
            $('#ub-dest', box).innerHTML = '<b>Where to?</b><small>Set a waypoint on your map to see the price</small>';
            $('#ub-price', box).textContent = 'Meter';
        }
    },

    riderTrip(box, r) {
        const steps = { waiting: ['Connecting you to a driver…', 0], accepted: ['Your driver is on the way', 1], arrived: ['Your driver has arrived', 2], ontrip: ['Heading to your destination', 3] };
        const [title, n] = steps[r.status] || ['Uber', 0];
        box.innerHTML = `<div class="uber-status"><h2>${title}</h2><div class="uber-progress">${[0, 1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>
            <span>${esc(r.pickupStreet || '')}${r.destStreet ? ' → ' + esc(r.destStreet) : ''}</span></div>
            ${r.status === 'waiting' ? '<div class="ride-spinner"></div>' : `<div class="uber-driver">${avatarHTML(r.driverName, null, 'md')}<div><b>${esc(r.driverName)}</b><span><i class="fa-solid fa-star"></i> ${Number(r.driverRating || 5).toFixed(1)}</span>${r.plate ? `<em>${esc(r.plate)}</em>` : ''}</div>
                <span class="ride-round" id="ub-msg"><i class="fa-solid fa-comment"></i></span><span class="ride-round green" id="ub-call"><i class="fa-solid fa-phone"></i></span></div>`}
            <div class="uber-fare"><span>Fare</span><b>${r.fare ? money(r.fare) : 'Meter'}</b></div>
            ${r.status !== 'ontrip' ? '<div class="uber-btn ghost" id="ub-cancel">Cancel ride</div>' : ''}`;
        const c = $('#ub-call', box); if (c) c.onclick = () => Phone.startCall(r.driverPhone, r.driverName);
        const m = $('#ub-msg', box); if (m) m.onclick = () => Phone.openApp('whatsapp', { number: r.driverPhone, name: r.driverName });
        const x = $('#ub-cancel', box);
        if (x) x.onclick = async () => { if (await UI.confirm('Cancel ride?', '', 'Cancel ride', true)) { await ride('action', { id: r.id, op: 'cancel' }); this.load(); } };
    },

    driverOffline(box) {
        const s = (this.st && this.st.stats) || {};
        box.innerHTML = `<h2 class="uber-h">Drive with Uber</h2>
            <div class="uber-stats"><div><b>${money(s.earnings)}</b><span>Earnings</span></div><div><b>${s.trips || 0}</b><span>Trips</span></div><div><b>${Number(s.rating || 5).toFixed(1)} <i class="fa-solid fa-star"></i></b><span>Rating</span></div></div>
            <div class="uber-btn green" id="ub-online">Go online</div>
            <div class="section-footer">Riders pay the fare automatically into your bank account when you complete the trip.</div>`;
        $('#ub-online', box).onclick = async () => {
            const r = await ride('action', { op: 'online' });
            if (!r || r.error) return UI.hud('fa-solid fa-circle-info', (r && r.error) || 'Not available');
            UI.hud('fa-solid fa-car-side', "You're online");
            this.load();
        };
    },

    board(box, list) {
        const st = this.st || {};
        box.innerHTML = `<div class="uber-online"><span class="uber-dot"></span><div><b>You're online</b><span>${list.length ? `${list.length} request${list.length === 1 ? '' : 's'}` : 'Finding trips…'}</span></div>
            ${st.online ? '<div class="btn small gray" id="ub-off">Go offline</div>' : ''}</div><div class="uber-board"></div>`;
        const off = $('#ub-off', box);
        if (off) off.onclick = async () => { const r = await ride('action', { op: 'offline' }); if (r && r.error) UI.hud('fa-solid fa-circle-info', r.error); this.load(); };
        const b = $('.uber-board', box);
        list.forEach((r) => {
            const row = el(`<div class="uber-req"><div class="uber-req-top"><b>${r.fare ? money(r.fare) : 'Meter'}</b><span>${r.km ? r.km + ' km' : ''}</span></div>
                <div class="uber-route"><i class="fa-solid fa-circle-dot"></i>${esc(r.pickupStreet || 'Pickup')}</div>
                ${r.destStreet ? `<div class="uber-route"><i class="fa-solid fa-square"></i>${esc(r.destStreet)}</div>` : ''}
                ${r.note ? `<small>“${esc(r.note)}”</small>` : ''}<div class="uber-btn small">Accept · ${esc(r.riderName)}</div></div>`);
            $('.uber-btn', row).onclick = async () => {
                const res = await ride('action', { id: r.id, op: 'accept' });
                if (!res || res.error) return UI.hud('fa-solid fa-circle-info', (res && res.error) || 'Too late');
                this.load();
            };
            b.appendChild(row);
        });
    },

    driverTrip(box, r) {
        const next = { accepted: ['arrived', 'I have arrived'], arrived: ['start', 'Start trip'], ontrip: ['complete', `Complete trip${r.fare ? ' · ' + money(r.fare) : ''}`] }[r.status];
        box.innerHTML = `<h2 class="uber-h">${r.status === 'ontrip' ? 'Drop off ' : 'Pick up '}${esc(r.riderName)}</h2>
            <div class="uber-route big"><i class="fa-solid fa-circle-dot"></i><span>${esc(r.pickupStreet || 'Pickup')}</span><span class="ride-round" data-gps="pickup"><i class="fa-solid fa-location-arrow"></i></span></div>
            ${r.dest ? `<div class="uber-route big"><i class="fa-solid fa-square"></i><span>${esc(r.destStreet || 'Destination')}</span><span class="ride-round" data-gps="dest"><i class="fa-solid fa-location-arrow"></i></span></div>` : ''}
            ${r.note ? `<div class="ride-notebox">“${esc(r.note)}”</div>` : ''}
            <div class="uber-driver">${avatarHTML(r.riderName, null, 'md')}<div><b>${esc(r.riderName)}</b><span>Rider</span></div><span class="ride-round green" id="ub-call"><i class="fa-solid fa-phone"></i></span></div>
            ${next ? `<div class="uber-btn ${r.status === 'ontrip' ? 'green' : ''}" id="ub-next">${next[1]}</div>` : ''}
            ${r.status !== 'ontrip' ? '<div class="uber-btn ghost" id="ub-drop">Cancel trip</div>' : ''}`;
        $$('[data-gps]', box).forEach((g) => { g.onclick = () => { ride('gps', { coords: g.dataset.gps === 'dest' ? r.dest : r.pickup }); UI.hud('fa-solid fa-location-arrow', 'GPS set'); }; });
        $('#ub-call', box).onclick = () => Phone.startCall(r.riderPhone, r.riderName);
        const n = $('#ub-next', box);
        if (n) n.onclick = async () => { const res = await ride('action', { id: r.id, op: next[0] }); if (res && res.error) UI.hud('fa-solid fa-circle-info', res.error); this.load(); };
        const d = $('#ub-drop', box); if (d) d.onclick = async () => { await ride('action', { id: r.id, op: 'cancel' }); this.load(); };
    },

    rate(info) {
        let stars = 5;
        UI.sheet({
            title: 'Rate your trip', done: 'Submit', half: true,
            content: (body) => {
                body.innerHTML = `<div class="uber-rate">${avatarHTML(info.driverName, null, 'lg')}<b>How was your trip with ${esc(info.driverName)}?</b><span>${info.paid ? 'You paid ' + money(info.fare) : 'Payment failed'}</span>
                    <div class="as-pick-stars">${[1, 2, 3, 4, 5].map((i) => `<i class="fa-solid fa-star on" data-r="${i}"></i>`).join('')}</div></div>`;
                $('.as-pick-stars', body).onclick = (e) => {
                    const t = e.target.closest('[data-r]'); if (!t) return;
                    stars = Number(t.dataset.r);
                    $$('.as-pick-stars i', body).forEach((x) => x.classList.toggle('on', Number(x.dataset.r) <= stars));
                };
            },
            onDone: async () => { await ride('rate', { id: info.id, stars }); UI.hud('fa-solid fa-star', 'Thanks!'); return true; },
        });
    },
};
Apps.define('ride', { open: (nav) => RideApp.open(nav), onClose: () => { RideApp.page = null; }, dark: true });
Phone.on('mz:ride:update', () => { if (S.currentApp === 'ride') RideApp.load(); });
Phone.on('mz:ride:board', () => { if (S.currentApp === 'ride') RideApp.load(); });
Phone.on('mz:ride:rate', (d) => {
    const go = () => { Phone.openApp('ride'); setTimeout(() => RideApp.rate(d.info || {}), 500); };
    if (S.open && !S.locked) go(); else Phone._afterUnlock = go;
});
