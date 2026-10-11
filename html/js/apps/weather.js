/* Weather + Maps + Compass (live game data from client.lua) */
'use strict';

/* ---------------- Weather ---------------- */
Apps.define('weather', {
    dark: true,
    async open(nav) {
        const page = el('<div class="page weather-page"><div class="scroll" id="wx-scroll"></div></div>');
        nav.push(page, false);
        const w = (await Phone.refreshWorld()) || S.world || {};
        const info = Weather.info(w);
        page.classList.add(info.rain ? 'rain' : info.night ? 'night' : 'day');
        const hour = Number(w.hour) || 12;
        const hours = [];
        for (let i = 0; i < 12; i++) {
            const h = (hour + i) % 24;
            const wi = Weather.info(Object.assign({}, w, { hour: h }));
            hours.push(`<div class="wx-h"><small>${i === 0 ? 'Now' : pad2(h)}</small><i class="${wi.icon}"></i><b>${wi.temp}°</b></div>`);
        }
        const today = new Date().getDay();
        const types = ['CLEAR', 'CLOUDS', 'EXTRASUNNY', 'RAIN', 'CLEARING', 'OVERCAST', 'EXTRASUNNY', 'NEUTRAL', 'THUNDER', 'CLEAR'];
        const seed = (new Date().getDate() * 7) % types.length;
        const days = [];
        for (let i = 0; i < 7; i++) {
            const t = i === 0 ? info : Weather.info({ weather: types[(seed + i) % types.length], hour: 13 });
            const lo = t.low - (i % 3), hi = t.high + (i % 2);
            days.push(`<div class="wx-d"><b>${i === 0 ? 'Today' : DAYS[(today + i) % 7].slice(0, 3)}</b><i class="${t.icon.replace('fa-moon', 'fa-sun')}"></i><span class="lo">${lo}°</span><span class="bar"><i style="left:${(lo + 5) * 2.2}%;right:${100 - (hi + 5) * 2.2}%"></i></span><span>${hi}°</span></div>`);
        }
        $('#wx-scroll', page).innerHTML = `
            <div class="wx-hero"><div class="wx-city">${esc(w.zone || 'Los Santos')}</div><div class="wx-temp">${info.temp}°</div><div class="wx-cond">${esc(info.label)}</div><div class="wx-hl">H:${info.high}°  L:${info.low}°</div></div>
            <div class="wx-card"><div class="wx-card-title"><i class="fa-regular fa-clock"></i> HOURLY FORECAST</div><div class="wx-hours">${hours.join('')}</div></div>
            <div class="wx-card"><div class="wx-card-title"><i class="fa-regular fa-calendar"></i> 7-DAY FORECAST</div>${days.join('')}</div>
            <div class="wx-tiles">
                <div class="wx-card"><div class="wx-card-title"><i class="fa-solid fa-wind"></i> WIND</div><div class="wx-big">${Math.round((Number(w.wind) || 0) * 3.6)} <small>km/h</small></div></div>
                <div class="wx-card"><div class="wx-card-title"><i class="fa-solid fa-droplet"></i> RAIN</div><div class="wx-big">${Math.round((Number(w.rain) || 0) * 100)}<small>%</small></div></div>
                <div class="wx-card"><div class="wx-card-title"><i class="fa-solid fa-clock"></i> CITY TIME</div><div class="wx-big">${pad2(w.hour || 0)}:${pad2(w.minute || 0)}</div></div>
                <div class="wx-card"><div class="wx-card-title"><i class="fa-solid fa-sun"></i> SUNSET</div><div class="wx-big">20:00</div></div>
            </div>`;
    },
});

/* ---------------- Maps ---------------- */
const MapsApp = {
    nav: null, page: null,
    async open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Maps', large: false, translucent: true, search: { placeholder: 'Search Maps', onInput: (q) => this.render(q) } });
        this.page.classList.add('maps-page');
        nav.push(this.page, false);
        this.page.content.appendChild(UI.loading());
        await Phone.refreshWorld();
        this.render();
    },
    render(q = '') {
        const w = S.world || {};
        const c = this.page.content;
        c.innerHTML = '';
        if (!q) {
            c.appendChild(el(`<div class="map-card">
                <div class="map-art"><svg viewBox="0 0 300 140" preserveAspectRatio="none">
                    <rect width="300" height="140" fill="var(--map-land)"/><path d="M0,95 C60,70 90,120 150,100 S250,60 300,80 L300,140 L0,140Z" fill="var(--map-water)"/>
                    <path d="M20,0 L60,140 M0,40 L300,55 M140,0 L170,140 M230,0 L210,140 M0,110 L300,20" stroke="var(--map-road)" stroke-width="5" fill="none"/>
                    <path d="M0,40 L300,55" stroke="#ffcc5c" stroke-width="3" fill="none"/></svg>
                    <span class="me-dot"></span></div>
                <div class="map-info"><b>${esc(w.street || 'Unknown street')}</b><small>${esc([w.cross, w.zone].filter(Boolean).join(' · '))}</small>
                <div class="map-coords">${(Number(w.x) || 0).toFixed(1)}, ${(Number(w.y) || 0).toFixed(1)} ${w.inVehicle ? ` · <i class="fa-solid fa-gauge-high"></i> ${w.speed} km/h` : ''}</div></div>
                <div class="btn-row" style="padding:0 1rem 1rem">
                    <div class="btn small tinted" id="mp-share"><i class="fa-solid fa-share-nodes"></i>Share</div>
                    <div class="btn small tinted" id="mp-coords"><i class="fa-solid fa-crosshairs"></i>Coords</div>
                    <div class="btn small ${w.waypoint ? 'danger' : 'gray'}" id="mp-clear"><i class="fa-solid fa-xmark"></i>Clear GPS</div>
                </div></div>`));
            $('#mp-share', c).onclick = async () => {
                const num = await UI.prompt('Share Location', 'Send your location to (number or contact name)', 'Number');
                if (!num) return;
                const ct = (S.contacts || []).find((x) => (x.name || '').toLowerCase() === num.toLowerCase());
                const dt = new Date();
                nui('SendMessage', { ChatNumber: String(ct ? ct.number : num), ChatDate: `${dt.getDate()}-${dt.getMonth()}-${dt.getFullYear()}`, ChatMessage: 'Shared Location', ChatTime: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`, ChatType: 'location' });
                UI.hud('fa-solid fa-location-arrow', 'Location sent');
            };
            $('#mp-coords', c).onclick = async () => {
                const v = await UI.prompt('Go to coordinates', 'Enter X, Y', '-265.3, -963.6');
                if (!v) return;
                const m = v.match(/(-?\d+(\.\d+)?)\s*[, ]\s*(-?\d+(\.\d+)?)/);
                if (!m) return UI.alert({ title: 'Invalid coordinates' });
                nui('mz:setWaypoint', { x: Number(m[1]), y: Number(m[3]), label: 'Custom location' });
            };
            $('#mp-clear', c).onclick = () => { nui('mz:clearWaypoint'); UI.hud('fa-solid fa-xmark', 'GPS cleared'); };
        }
        const places = (w.places || []).filter((p) => !q || `${p.label} ${p.category}`.toLowerCase().includes(q)).sort((a, b) => a.distance - b.distance);
        const cats = [...new Set(places.map((p) => p.category || 'Places'))];
        if (!places.length) { c.appendChild(UI.empty('fa-solid fa-map-location-dot', 'No places found', '')); return; }
        if (!q) {
            c.appendChild(UI.header('Guides', true));
            const chips = el(`<div class="chips">${cats.map((k) => `<span data-k="${esc(k)}">${esc(k)}</span>`).join('')}</div>`);
            chips.onclick = (e) => { const s = e.target.closest('span'); if (s) { this.page.searchInput.value = s.dataset.k; this.render(s.dataset.k.toLowerCase()); } };
            c.appendChild(chips);
            c.appendChild(UI.header('Nearby', true));
        }
        c.appendChild(UI.list(places.map((p) => ({
            icon: p.icon || 'fa-solid fa-location-dot', iconBg: '#ff3b30', title: p.label,
            sub: `${p.category || ''} · ${p.distance >= 1000 ? (p.distance / 1000).toFixed(1) + ' km' : p.distance + ' m'}`,
            right: '<span class="btn small primary" style="height:2rem">Go</span>', noChevron: true,
            onClick: () => { nui('mz:setWaypoint', { x: p.x, y: p.y, label: p.label }); UI.hud('fa-solid fa-route', `Route to ${p.label}`); },
        }))));
    },
};
Apps.define('maps', { open: (nav) => MapsApp.open(nav) });

/* ---------------- Compass ---------------- */
const CompassApp = {
    timer: null,
    open(nav) {
        const page = el(`<div class="page compass-page">
            <div class="cmp-wrap"><div class="cmp-mark"></div><div class="cmp-dial" id="cmp-dial">
                ${Array.from({ length: 72 }, (_, i) => `<i style="transform:rotate(${i * 5}deg)" class="${i % 6 === 0 ? 'big' : ''}"></i>`).join('')}
                ${['N', 'E', 'S', 'W'].map((d, i) => `<b style="transform:rotate(${i * 90}deg)"><span style="transform:rotate(${-i * 90}deg)" class="${d === 'N' ? 'n' : ''}">${d}</span></b>`).join('')}
                ${[30, 60, 120, 150, 210, 240, 300, 330].map((a) => `<em style="transform:rotate(${a}deg)"><span>${a}</span></em>`).join('')}
            </div><div class="cmp-cross"></div></div>
            <div class="cmp-deg" id="cmp-deg">0° N</div>
            <div class="cmp-loc" id="cmp-loc">—</div>
            <div class="cmp-coords" id="cmp-coords"></div></div>`);
        nav.push(page, false);
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        let rot = 0;
        const tick = async () => {
            const w = await nui('mz:getWorld');
            if (!w || S.currentApp !== 'compass') return;
            S.world = w;
            const h = Math.round(Number(w.camHeading) || 0) % 360;
            let target = -h;
            while (target - rot > 180) target -= 360;
            while (target - rot < -180) target += 360;
            rot = target;
            const dial = $('#cmp-dial'); if (dial) dial.style.transform = `rotate(${rot}deg)`;
            const d = $('#cmp-deg'); if (d) d.textContent = `${h}° ${dirs[Math.round(h / 45) % 8]}`;
            const l = $('#cmp-loc'); if (l) l.textContent = [w.street, w.zone].filter(Boolean).join(', ');
            const c = $('#cmp-coords'); if (c) c.textContent = `${(+w.x).toFixed(1)}, ${(+w.y).toFixed(1)}  ·  Alt ${Math.round(+w.z)} m`;
        };
        tick();
        clearInterval(this.timer);
        this.timer = setInterval(tick, 250);
    },
    onClose() { clearInterval(this.timer); },
};
Apps.define('compass', { open: (nav) => CompassApp.open(nav), onClose: () => CompassApp.onClose(), dark: true });
