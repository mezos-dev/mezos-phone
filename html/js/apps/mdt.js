/* MDT (police) */
'use strict';

const MDT = {
    nav: null, alerts: [], root: null,

    open(nav) {
        this.nav = nav;
        const ch = S.player.charinfo || {};
        const page = UI.page({ title: 'MDT', large: true, sub: `Officer ${ch.firstname || ''} ${ch.lastname || ''}` });
        this.root = page;
        nav.push(page, false);
        const c = page.content;
        const tiles = el(`<div class="mdt-tiles">
            <div class="mdt-tile" data-t="person"><i class="fa-solid fa-user"></i><b>Persons</b></div>
            <div class="mdt-tile" data-t="vehicle"><i class="fa-solid fa-car"></i><b>Vehicles</b></div>
            <div class="mdt-tile" data-t="house"><i class="fa-solid fa-house"></i><b>Houses</b></div>
            <div class="mdt-tile" data-t="scan"><i class="fa-solid fa-barcode"></i><b>Scan Plate</b></div>
        </div>`);
        tiles.onclick = (e) => { const t = e.target.closest('.mdt-tile'); if (t) this[t.dataset.t](); };
        c.appendChild(tiles);
        c.appendChild(UI.header('Dispatch Alerts', true));
        this.alertBox = el('<div></div>');
        c.appendChild(this.alertBox);
        this.renderAlerts();
    },

    renderAlerts() {
        if (!this.alertBox) return;
        this.alertBox.innerHTML = '';
        if (!this.alerts.length) { this.alertBox.appendChild(UI.list([{ icon: 'fa-solid fa-tower-broadcast', iconBg: 'var(--gray)', title: 'No alerts', sub: 'New dispatch calls show up here' }])); return; }
        this.alerts.forEach((a) => {
            const card = el(`<div class="mdt-alert ${a.title === 'Assistance colleague' ? 'urgent' : ''}">
                <div class="ma-top"><b><i class="fa-solid fa-triangle-exclamation"></i> ${esc(a.title)}</b><small>${esc(timeAgo(a._at))}</small></div>
                <div class="ma-text">${esc(a.description || '')}</div>
                ${a.coords ? '<div class="btn small primary ma-gps"><i class="fa-solid fa-location-dot"></i>Set GPS</div>' : ''}</div>`);
            const g = $('.ma-gps', card); if (g) g.onclick = () => { nui('SetAlertWaypoint', { alert: a }); UI.hud('fa-solid fa-location-dot', 'GPS set'); };
            this.alertBox.appendChild(card);
        });
    },

    searchPage(title, placeholder, run) {
        const page = UI.page({ title, back: true, backLabel: 'MDT' });
        const bar = el(`<div class="search"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="${esc(placeholder)}"></div>`);
        const res = el('<div></div>');
        page.content.append(bar, res);
        const inp = $('input', bar);
        inp.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !inp.value.trim()) return;
            res.innerHTML = ''; res.appendChild(UI.loading());
            await run(inp.value.trim(), res);
        });
        this.nav.push(page);
        setTimeout(() => inp.focus(), 450);
    },

    person() {
        this.searchPage('Persons', 'Name or citizen ID (Enter)', async (q, res) => {
            const r = await nui('FetchSearchResults', { input: q });
            const list = Array.isArray(r) ? r : Object.values(r || {});
            res.innerHTML = '';
            if (!list.length) { res.appendChild(UI.empty('fa-solid fa-user-slash', 'No Results', '')); return; }
            res.appendChild(UI.list(list.map((p) => ({
                avatar: avatarHTML(`${p.firstname} ${p.lastname}`, null, 'sm'), title: `${p.firstname} ${p.lastname}`, sub: p.citizenid,
                right: p.warrant ? '<span class="pill red">Warrant</span>' : '',
                onClick: () => this.personDetail(p),
            }))));
        });
    },

    personDetail(p) {
        const page = UI.page({ title: `${p.firstname} ${p.lastname}`, back: true, backLabel: 'Results' });
        page.content.innerHTML = `<div class="center-col" style="padding:1rem 0">${avatarHTML(`${p.firstname} ${p.lastname}`, null, 'lg')}<h2 style="margin-top:.7rem">${esc(p.firstname)} ${esc(p.lastname)}</h2>${p.warrant ? '<span class="pill red mt">ACTIVE WARRANT</span>' : ''}</div>`;
        page.content.appendChild(UI.list([
            { title: 'Citizen ID', value: p.citizenid },
            { title: 'Date of birth', value: p.birthdate || '-' },
            { title: 'Phone', value: p.phone || '-' },
            { title: 'Nationality', value: p.nationality || '-' },
            { title: 'Gender', value: Number(p.gender) === 1 ? 'Female' : 'Male' },
            { title: "Driver's license", right: `<span class="pill ${p.driverlicense ? 'green' : 'red'}">${p.driverlicense ? 'Valid' : 'None'}</span>` },
            { title: 'Apartment', value: (p.appartmentdata && p.appartmentdata.label) || 'None', onClick: p.appartmentdata ? () => { nui('SetApartmentLocation', { data: p }); } : null, noChevron: true },
        ]));
        if (p.phone) {
            const b = el('<div class="btn-row mt2"><div class="btn tinted"><i class="fa-solid fa-phone"></i>Call</div><div class="btn tinted"><i class="fa-solid fa-comment"></i>Message</div></div>');
            b.children[0].onclick = () => Phone.startCall(p.phone, `${p.firstname} ${p.lastname}`);
            b.children[1].onclick = () => Phone.openApp('whatsapp', { number: p.phone, name: `${p.firstname} ${p.lastname}` });
            page.content.appendChild(b);
        }
        this.nav.push(page);
    },

    vehicleCards(list, res) {
        res.innerHTML = '';
        if (!list.length) { res.appendChild(UI.empty('fa-solid fa-car-burst', 'No Results', '')); return; }
        list.forEach((v) => {
            res.appendChild(el(`<div class="mdt-alert">
                <div class="ma-top"><b><i class="fa-solid fa-car"></i> ${esc(v.label || 'Vehicle')}</b><span class="plate">${esc(v.plate)}</span></div>
                <div class="ma-text">Owner: ${esc(v.owner || 'Unknown')}</div>
                <div class="rc-meta" style="margin-top:.5rem"><span class="pill ${v.status ? 'green' : 'red'}">MOT ${v.status ? 'valid' : 'expired'}</span><span class="pill ${v.isFlagged ? 'red' : 'green'}">${v.isFlagged ? 'FLAGGED' : 'Not flagged'}</span></div></div>`));
        });
    },

    vehicle() {
        this.searchPage('Vehicles', 'Plate (Enter)', async (q, res) => {
            const r = await nui('FetchVehicleResults', { input: q });
            this.vehicleCards(Array.isArray(r) ? r : Object.values(r || {}), res);
        });
    },

    async scan() {
        const page = UI.page({ title: 'Plate Scanner', back: true, backLabel: 'MDT' });
        const res = el('<div></div>');
        res.appendChild(UI.loading());
        page.content.append(el('<div class="section-footer">Scanning the closest vehicle…</div>'), res);
        this.nav.push(page);
        const r = await nui('FetchVehicleScan');
        if (r && r.plate) this.vehicleCards([r], res);
        else { res.innerHTML = ''; res.appendChild(UI.empty('fa-solid fa-car', 'No vehicle nearby', '')); }
    },

    house() {
        this.searchPage('Houses', 'Owner name (Enter)', async (q, res) => {
            const r = await nui('FetchPlayerHouses', { input: q });
            const list = Array.isArray(r) ? r : Object.values(r || {});
            res.innerHTML = '';
            if (!list.length) { res.appendChild(UI.empty('fa-solid fa-house-circle-xmark', 'No Results', '')); return; }
            res.appendChild(UI.list(list.map((h) => ({
                icon: 'fa-solid fa-house', iconBg: 'var(--orange)', title: h.label, sub: `Owner: ${h.charinfo ? h.charinfo.firstname + ' ' + h.charinfo.lastname : '-'} · Tier ${h.tier}`,
                onClick: () => { if (h.coords && h.coords.enter) { nui('SetGPSLocation', { coords: h.coords.enter }); UI.hud('fa-solid fa-location-dot', 'GPS set'); } },
            }))));
        });
    },
};

Apps.define('meos', { open: (nav) => MDT.open(nav), onClose: () => { MDT.alertBox = null; } });
Phone.on('AddPoliceAlert', (d) => {
    if (!d.alert) return;
    d.alert._at = Date.now();
    MDT.alerts.unshift(d.alert);
    if (MDT.alerts.length > 30) MDT.alerts.length = 30;
    MDT.renderAlerts();
    Phone.notify({ app: 'meos', title: `Dispatch: ${d.alert.title}`, text: d.alert.description || '' });
});
