/* Garage, Home (houses) and Services */
'use strict';

/* ---------------- Garage ---------------- */
const GarageApp = {
    nav: null,
    stateLabel(v) {
        const s = String(v.state).toLowerCase();
        if (s === '1' || s === 'in' || s.includes('garage')) return ['In Garage', 'green'];
        if (s === '0' || s === 'out') return ['Out', 'orange'];
        if (s === '2' || s.includes('impound') || s.includes('depot')) return ['Impounded', 'red'];
        return [String(v.state || 'Unknown'), 'blue'];
    },
    open(nav) {
        this.nav = nav;
        const page = UI.page({ title: 'Garage', large: true, search: { placeholder: 'Search plate or model', onInput: (q) => render(q) } });
        nav.push(page, false);
        page.content.appendChild(UI.loading());
        let vehicles = [];
        const render = (q = '') => {
            page.content.innerHTML = '';
            const list = vehicles.filter((v) => !q || `${v.fullname} ${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(q));
            if (!list.length) { page.content.appendChild(UI.empty('fa-solid fa-car', 'No Vehicles', q ? 'No match.' : 'Vehicles you own show up here.')); return; }
            const grid = el('<div class="veh-list"></div>');
            list.forEach((v) => {
                const [lbl, col] = this.stateLabel(v);
                const card = el(`<div class="veh-card">
                    <div class="veh-ic"><i class="fa-solid fa-car-side"></i></div>
                    <div class="veh-info"><b>${esc(v.fullname || v.model)}</b><small>${esc(v.brand || '')}</small>
                        <div class="veh-meta"><span class="plate">${esc(v.plate)}</span><span class="pill ${col}">${esc(lbl)}</span></div></div>
                    <i class="fa-solid fa-chevron-right row-chev"></i></div>`);
                card.onclick = () => this.detail(v);
                grid.appendChild(card);
            });
            page.content.appendChild(grid);
        };
        nui('SetupGarageVehicles').then((v) => { vehicles = Array.isArray(v) ? v : Object.values(v || {}); render(); });
    },
    gauge(label, value, color) {
        const v = clamp(Math.round(value), 0, 100);
        return `<div class="gauge"><svg viewBox="0 0 36 36"><path d="M18 2.5 a15.5 15.5 0 0 1 0 31 a15.5 15.5 0 0 1 0 -31" fill="none" stroke="var(--fill2)" stroke-width="3.2"/>
            <path d="M18 2.5 a15.5 15.5 0 0 1 0 31 a15.5 15.5 0 0 1 0 -31" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="${v * 0.974} 100"/></svg>
            <b>${v}%</b><small>${label}</small></div>`;
    },
    detail(v) {
        const [lbl, col] = this.stateLabel(v);
        const page = UI.page({ title: v.fullname || v.model, back: true, backLabel: 'Garage' });
        page.content.innerHTML = `<div class="veh-hero"><i class="fa-solid fa-car-side"></i><h2>${esc(v.fullname || v.model)}</h2><span class="plate big">${esc(v.plate)}</span></div>
            <div class="gauges">${this.gauge('Fuel', v.fuel, 'var(--orange)')}${this.gauge('Engine', (v.engine || 0) / 10, 'var(--green)')}${this.gauge('Body', (v.body || 0) / 10, 'var(--blue)')}</div>`;
        page.content.appendChild(UI.list([
            { title: 'Brand', value: v.brand || '-' },
            { title: 'Model', value: v.model || '-' },
            { title: 'Plate', value: v.plate || '-' },
            { title: 'Garage', value: v.garage || '-' },
            { title: 'Status', right: `<span class="pill ${col}">${esc(lbl)}</span>` },
        ]));
        const b = el('<div class="pad mt2"><div class="btn primary block"><i class="fa-solid fa-location-crosshairs"></i>Track Vehicle</div></div>');
        b.firstElementChild.onclick = () => { nui('track-vehicle', { veh: v }); UI.hud('fa-solid fa-satellite-dish', 'Locating…'); };
        page.content.appendChild(b);
        this.nav.push(page);
    },
};
Apps.define('garage', { open: (nav) => GarageApp.open(nav) });

/* ---------------- Home (houses) ---------------- */
const HousesApp = {
    nav: null, houses: [],
    open(nav) {
        this.nav = nav;
        const page = UI.page({ title: 'Home', large: true });
        nav.push(page, false);
        this.page = page;
        this.load();
    },
    async load() {
        const c = this.page.content;
        c.innerHTML = '';
        c.appendChild(UI.loading());
        const [houses, keys] = await Promise.all([nui('GetPlayerHouses'), nui('GetPlayerKeys')]);
        this.houses = Array.isArray(houses) ? houses : Object.values(houses || {});
        const k = Array.isArray(keys) ? keys : Object.values(keys || {});
        c.innerHTML = '';
        c.appendChild(UI.header('My Houses', true));
        if (!this.houses.length) c.appendChild(UI.list([{ icon: 'fa-solid fa-house-circle-xmark', iconBg: 'var(--gray)', title: "You don't own a house", sub: 'Buy one from a real estate agent' }]));
        else {
            const grid = el('<div class="house-grid"></div>');
            this.houses.forEach((h) => {
                const card = el(`<div class="house-card"><div class="hc-ic"><i class="fa-solid fa-house-chimney"></i></div><b>${esc(h.label)}</b><small>Tier ${esc(h.tier)} · <i class="fa-solid fa-key"></i> ${(h.keyholders || []).length}${h.garage && Object.keys(h.garage).length ? ' · <i class="fa-solid fa-warehouse"></i>' : ''}</small></div>`);
                card.onclick = () => this.detail(h);
                grid.appendChild(card);
            });
            c.appendChild(grid);
        }
        c.appendChild(UI.header('Keys', true));
        if (!k.length) c.appendChild(UI.list([{ icon: 'fa-solid fa-key', iconBg: 'var(--gray)', title: 'No keys', sub: 'Keys shared with you appear here' }]));
        else c.appendChild(UI.list(k.map((key) => ({
            icon: 'fa-solid fa-key', iconBg: 'var(--orange)', title: (key.HouseData && (key.HouseData.adress || key.HouseData.label)) || key.label || 'House',
            sub: 'Tap to set GPS', onClick: () => { nui('SetHouseLocation', { HouseData: key }); UI.hud('fa-solid fa-location-dot', 'GPS set'); },
        }))));
    },
    detail(h) {
        const page = UI.page({ title: h.label, back: true, backLabel: 'Home' });
        page.content.innerHTML = `<div class="veh-hero"><i class="fa-solid fa-house-chimney" style="color:var(--orange)"></i><h2>${esc(h.label)}</h2><span class="pill">Tier ${esc(h.tier)}</span></div>`;
        page.content.appendChild(UI.list([
            { icon: 'fa-solid fa-location-dot', iconBg: 'var(--blue)', title: 'Set GPS', onClick: () => {
                const c = (h.coords && h.coords.enter) || h.coords || (h.HouseData && h.HouseData.coords && h.HouseData.coords.enter);
                if (c && c.x !== undefined) { nui('SetGPSLocation', { coords: { x: c.x, y: c.y } }); UI.hud('fa-solid fa-location-dot', 'GPS set'); }
                else UI.hud('fa-solid fa-location-crosshairs', 'No location for this house');
            } },
            { icon: 'fa-solid fa-right-left', iconBg: 'var(--purple)', title: 'Transfer House', onClick: () => this.transfer(h) },
        ]));
        page.content.appendChild(UI.header('Key Holders'));
        const holders = (h.keyholders || []).filter(Boolean);
        if (!holders.length) page.content.appendChild(UI.list([{ title: 'Nobody has keys', sub: '' }]));
        else page.content.appendChild(UI.list(holders.map((kh) => {
            const me = kh.citizenid === S.player.citizenid;
            const nm = kh.charinfo ? `${kh.charinfo.firstname} ${kh.charinfo.lastname}` : kh.citizenid;
            return {
                avatar: avatarHTML(nm, null, 'sm'), title: (me ? '(Me) ' : '') + nm, sub: kh.citizenid,
                right: me ? '' : '<span class="btn small danger kh-del"><i class="fa-solid fa-trash"></i></span>',
            };
        })));
        $$('.kh-del', page).forEach((b, i) => {
            const others = holders.filter((kh) => kh.citizenid !== S.player.citizenid);
            b.onclick = async () => {
                const kh = others[i];
                if (!(await UI.confirm('Remove Key', `Take the keys from ${kh.charinfo ? kh.charinfo.firstname : kh.citizenid}?`, 'Remove', true))) return;
                nui('RemoveKeyholder', { HolderData: kh, HouseData: h });
                h.keyholders = (h.keyholders || []).filter((x) => x && x.citizenid !== kh.citizenid);
                this.nav.pop(); setTimeout(() => this.detail(h), 430);
            };
        });
        this.nav.push(page);
    },
    async transfer(h) {
        const cid = await UI.prompt('Transfer House', 'Enter the Citizen ID of the new owner', 'Citizen ID');
        if (!cid) return;
        const ok = await nui('TransferCid', { newBsn: cid, HouseData: h });
        if (ok) { UI.hud('fa-solid fa-circle-check', 'House transferred'); this.nav.popToRoot(); this.load(); }
        else UI.alert({ title: 'Transfer Failed', text: 'This Citizen ID is not valid.' });
    },
};
Apps.define('houses', { open: (nav) => HousesApp.open(nav) });

/* ---------------- Services ---------------- */
const SERVICE_JOBS = {
    police: { label: 'Police', icon: 'fa-solid fa-shield-halved', color: '#0a3d91' },
    ambulance: { label: 'EMS', icon: 'fa-solid fa-truck-medical', color: '#ff3b30' },
    mechanic: { label: 'Mechanic', icon: 'fa-solid fa-wrench', color: '#ff9500' },
    taxi: { label: 'Taxi', icon: 'fa-solid fa-taxi', color: '#ffcc00' },
    lawyer: { label: 'Lawyers', icon: 'fa-solid fa-scale-balanced', color: '#5856d6' },
    realestate: { label: 'Real Estate', icon: 'fa-solid fa-house-chimney', color: '#34c759' },
};
Apps.define('lawyers', {
    open(nav) {
        const page = UI.page({ title: 'Services', large: true, sub: 'Who is on duty right now' });
        nav.push(page, false);
        page.content.appendChild(UI.loading());
        nui('GetCurrentLawyers').then((d) => {
            const list = Array.isArray(d) ? d : Object.values(d || {});
            page.content.innerHTML = '';
            const grid = el(`<div class="svc-grid">${Object.keys(SERVICE_JOBS).map((k) => {
                const n = list.filter((x) => x.typejob === k).length;
                return `<div class="svc" data-k="${k}"><span style="background:${SERVICE_JOBS[k].color}"><i class="${SERVICE_JOBS[k].icon}"></i></span><b>${SERVICE_JOBS[k].label}</b><small class="${n ? 'text-green' : 'text-gray'}">${n ? n + ' available' : 'Unavailable'}</small></div>`;
            }).join('')}</div>`);
            page.content.appendChild(grid);
            Object.keys(SERVICE_JOBS).forEach((k) => {
                const people = list.filter((x) => x.typejob === k);
                if (!people.length) return;
                page.content.appendChild(UI.header(SERVICE_JOBS[k].label));
                const lst = UI.list(people.map((p) => ({
                    avatar: avatarHTML(p.name, null, 'sm'), title: p.name, sub: p.phone,
                    right: '<span class="svc-btn msg"><i class="fa-solid fa-comment"></i></span><span class="svc-btn call"><i class="fa-solid fa-phone"></i></span>',
                })));
                $$('.row', lst).forEach((r, i) => {
                    $('.call', r).onclick = () => Phone.startCall(people[i].phone, people[i].name);
                    $('.msg', r).onclick = () => Phone.openApp('whatsapp', { number: people[i].phone, name: people[i].name });
                });
                lst.dataset.k = k;
                page.content.appendChild(lst);
            });
            grid.onclick = (e) => {
                const s = e.target.closest('.svc'); if (!s) return;
                const target = $(`.list[data-k="${s.dataset.k}"]`, page);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                else UI.hud(SERVICE_JOBS[s.dataset.k].icon, `No ${SERVICE_JOBS[s.dataset.k].label} on duty`);
            };
        });
    },
});
