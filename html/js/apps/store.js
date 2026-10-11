/* App Store — apps are installed on the server (per character), some cost money */
'use strict';

const AppStore = {
    nav: null, view: null, tabbar: null, tab: 'today', downloads: {},

    info(id) {
        const c = (S.catalog || []).find((a) => a.id === id) || { id };
        const r = S.ratings[id];
        const rating = r && r.n ? (Number(c.rating || 4.5) * Number(c.reviews || 0) + r.avg * r.n) / (Number(c.reviews || 0) + r.n) : Number(c.rating || 0);
        return Object.assign({ name: Phone.label(id), dev: 'Mezos Inc.', category: 'Utilities', size: 20, desc: '' }, c, { score: rating, count: Number(c.reviews || 0) + (r ? r.n : 0) });
    },
    storeApps() { return (S.catalog || []).filter((a) => !a.system && Apps.get(a.id)); },
    installed(id) { return (S.installed || []).includes(id); },
    price(a) { return Number(a.price) > 0 ? money(a.price) : 'GET'; },
    stars(v) {
        const full = Math.round(Number(v) * 2) / 2;
        let h = '';
        for (let i = 1; i <= 5; i++) h += `<i class="fa-${full >= i ? 'solid fa-star' : full >= i - 0.5 ? 'solid fa-star-half-stroke' : 'regular fa-star'}"></i>`;
        return `<span class="as-stars">${h}</span>`;
    },
    fmtCount(n) { n = Number(n) || 0; return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : String(n); },

    async open(nav, opts = {}) {
        this.nav = nav;
        const root = el('<div class="page as-root"></div>');
        this.view = el('<div class="tab-view"></div>');
        this.tabbar = UI.tabbar([
            { id: 'today', icon: 'fa-solid fa-file-lines', label: 'Today' },
            { id: 'games', icon: 'fa-solid fa-rocket', label: 'Games' },
            { id: 'apps', icon: 'fa-solid fa-layer-group', label: 'Apps' },
            { id: 'search', icon: 'fa-solid fa-magnifying-glass', label: 'Search' },
        ], 'today', (id) => this.show(id));
        root.append(this.view, this.tabbar);
        nav.push(root, false);
        this.show('today');
        await this.refresh();
        if (opts.app) this.detail(opts.app);
    },

    async refresh() {
        const d = await nui('mz:store', { fn: 'get' });
        if (d && d.installed) {
            S.ratings = d.ratings || S.ratings;
            S.balance = d.balance;
            Phone.setInstalled(d.installed);
            this.repaint();
        }
    },

    show(id) {
        this.tab = id;
        this.view.innerHTML = '';
        const page = this[id]();
        page.style.position = 'absolute';
        this.view.appendChild(page);
    },

    getBtn(a, small) {
        const dl = this.downloads[a.id];
        if (dl) return `<span class="as-get as-progress" data-get="${a.id}" style="--p:${dl.p}"><i></i></span>`;
        if (this.installed(a.id)) return `<span class="as-get ${small ? '' : 'big'}" data-open="${a.id}">OPEN</span>`;
        return `<span class="as-get ${small ? '' : 'big'}" data-get="${a.id}">${this.price(a)}</span>`;
    },

    bindButtons(box) {
        box.addEventListener('click', (e) => {
            const g = e.target.closest('[data-get]');
            const o = e.target.closest('[data-open]');
            const card = e.target.closest('[data-app]');
            if (g) { e.stopPropagation(); this.install(g.dataset.get, g); return; }
            if (o) { e.stopPropagation(); Phone.openApp(o.dataset.open); return; }
            if (card) this.detail(card.dataset.app);
        });
    },

    rowHTML(a, rank) {
        return `<div class="as-row" data-app="${a.id}">
            ${rank ? `<b class="as-rank">${rank}</b>` : ''}
            ${iconHTML(a.id)}
            <div class="as-row-body"><b>${esc(a.name)}</b><span>${esc(a.desc || a.category)}</span></div>
            <div class="as-row-btn">${this.getBtn(a, true)}${Number(a.price) > 0 && !this.installed(a.id) ? '<small>In-App Purchase</small>' : ''}</div>
        </div>`;
    },

    /* ---------- Today (home) ---------- */
    CATS: [
        { id: 'Social', icon: 'fa-solid fa-user-group', color: '#ff2d55', match: /social/i },
        { id: 'Travel', icon: 'fa-solid fa-car-side', color: '#0a84ff', match: /travel|navigation/i },
        { id: 'Games', icon: 'fa-solid fa-gamepad', color: '#bf5af2', match: /games|entertainment/i },
        { id: 'Money', icon: 'fa-solid fa-sack-dollar', color: '#30d158', match: /finance|sports|shopping|business/i },
        { id: 'Lifestyle', icon: 'fa-solid fa-heart', color: '#ff9f0a', match: /lifestyle|health|music/i },
        { id: 'Utilities', icon: 'fa-solid fa-toolbox', color: '#8e8e93', match: /utilities|productivity|weather/i },
    ],
    catApps(cat) { return this.storeApps().map((a) => this.info(a.id)).filter((a) => cat.match.test(a.category)); },

    today() {
        const d = new Date();
        const page = UI.page({ title: 'Today', tabbar: true, cls: 'asx' });
        page.setTitle('');
        const apps = this.storeApps().map((a) => this.info(a.id));
        const featured = apps.filter((a) => a.featured);
        const top = apps.slice().sort((x, y) => y.count - x.count);
        const must = apps.filter((a) => !a.featured).sort((x, y) => y.score - x.score);
        const mine = apps.filter((a) => this.installed(a.id));
        const avatar = avatarHTML(`${S.player.charinfo.firstname || ''} ${S.player.charinfo.lastname || ''}`, S.meta.profilepicture, 'sm');
        const labels = ['APP OF THE DAY', 'NEW IN LOS SANTOS', 'EDITORS’ CHOICE', 'TRENDING NOW', 'MUST TRY', 'POPULAR'];
        const cols = [];
        for (let i = 0; i < must.length; i += 3) cols.push(must.slice(i, i + 3));
        const sec = (title, see, sub) => `<div class="asx-sec"><div><h3>${esc(title)}</h3>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${see ? `<span class="asx-see" data-see="${see}">See All</span>` : ''}</div>`;

        page.content.innerHTML = `
            <div class="as-today-head"><div><small>${DAYS[d.getDay()].toUpperCase()} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}</small><h1>Today</h1></div>${avatar}</div>

            <div class="asx-hero" id="asx-hero">${featured.map((a, i) => `
                <div class="asx-card f${i % 6}" data-app="${a.id}">
                    <div class="asx-card-bg">${iconHTML(a.id)}</div>
                    <div class="asx-card-top"><small>${labels[i % labels.length]}</small><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>
                    <div class="asx-card-foot">${iconHTML(a.id)}<div><b>${esc(a.name)}</b><span>${esc(a.category)}</span></div>${this.getBtn(a, true)}</div>
                </div>`).join('')}</div>
            <div class="asx-dots" id="asx-dots">${featured.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>

            <div class="asx-cats">${this.CATS.map((c) => `<div class="asx-cat" data-cat="${c.id}"><span style="background:${c.color}"><i class="${c.icon}"></i></span><b>${c.id}</b></div>`).join('')}</div>

            ${cols.length ? `${sec('Must-Have Apps', '', 'Hand-picked for life in the city')}
            <div class="asx-cols">${cols.map((col) => `<div class="asx-col">${col.map((a) => this.rowHTML(a)).join('')}</div>`).join('')}</div>` : ''}

            ${sec('Top Charts', 'charts', 'Most downloaded this week')}
            <div class="as-list asx-charts">${top.slice(0, 5).map((a, i) => this.rowHTML(a, i + 1)).join('')}</div>

            ${sec('Made for Los Santos', '', '')}
            <div class="asx-grid">${apps.filter((a) => !a.preinstalled).map((a) => `<div class="asx-tile" data-app="${a.id}">${iconHTML(a.id)}<b>${esc(a.name)}</b><small>${a.score.toFixed(1)} <i class="fa-solid fa-star"></i></small></div>`).join('')}</div>

            <div class="asx-mine" data-tab="apps"><div class="asx-mine-icons">${mine.slice(0, 4).map((a) => iconHTML(a.id)).join('')}</div>
                <div><b>Your Apps</b><span>${mine.length} downloaded on this iPhone</span></div><i class="fa-solid fa-chevron-right"></i></div>
            <div class="asx-foot">Apps are saved to your character and stay installed.</div>`;

        this.bindButtons(page.content);
        // hero carousel dots
        const hero = $('#asx-hero', page.content);
        const dots = $$('#asx-dots i', page.content);
        hero.addEventListener('scroll', () => {
            const i = Math.round(hero.scrollLeft / Math.max(1, hero.clientWidth * 0.88));
            dots.forEach((x, k) => x.classList.toggle('on', k === i));
        });
        page.content.addEventListener('click', (e) => {
            const c = e.target.closest('[data-cat]');
            const s2 = e.target.closest('[data-see]');
            const t = e.target.closest('[data-tab]');
            if (c) this.listPage(this.CATS.find((x) => x.id === c.dataset.cat));
            else if (s2) this.listPage({ id: 'Top Charts', charts: true });
            else if (t) { this.tabbar.select('apps'); this.show('apps'); }
        });
        return page;
    },

    /** category / chart list */
    listPage(cat) {
        if (!cat) return;
        const apps = cat.charts ? this.storeApps().map((a) => this.info(a.id)).sort((x, y) => y.count - x.count) : this.catApps(cat);
        const page = UI.page({ title: cat.id, large: true, back: true, backLabel: 'Today' });
        page.content.innerHTML = apps.length ? `<div class="as-list">${apps.map((a, i) => this.rowHTML(a, cat.charts ? i + 1 : 0)).join('')}</div>` : '<div class="as-empty">No apps in this category yet</div>';
        this.bindButtons(page.content);
        this.nav.push(page);
    },

    games() {
        const page = UI.page({ title: 'Games', large: true, tabbar: true });
        const apps = this.storeApps().map((a) => this.info(a.id)).filter((a) => /games|entertainment|music/i.test(a.category));
        page.content.innerHTML = `<div class="as-list">${apps.map((a) => this.rowHTML(a)).join('')}</div>`;
        this.bindButtons(page.content);
        return page;
    },

    apps() {
        const page = UI.page({ title: 'Apps', large: true, tabbar: true });
        const apps = this.storeApps().map((a) => this.info(a.id));
        const cats = {};
        apps.forEach((a) => { (cats[a.category] = cats[a.category] || []).push(a); });
        const mine = apps.filter((a) => this.installed(a.id));
        let html = `<div class="as-section"><h3>On This iPhone</h3><span>${mine.length} apps</span></div>
            <div class="as-list">${mine.length ? mine.map((a) => this.rowHTML(a)).join('') : '<div class="as-empty">No downloaded apps yet</div>'}</div>`;
        Object.keys(cats).sort().forEach((c) => {
            html += `<div class="as-section"><h3>${esc(c)}</h3></div><div class="as-list">${cats[c].map((a) => this.rowHTML(a)).join('')}</div>`;
        });
        page.content.innerHTML = html;
        this.bindButtons(page.content);
        if (mine.length) {
            page.content.appendChild(UI.footer('To delete an app, open it here and tap the trash icon. System apps (Phone, Messages, Camera...) cannot be deleted.'));
        }
        return page;
    },

    search() {
        const box = el('<div class="as-list"></div>');
        const render = (q) => {
            const apps = this.storeApps().map((a) => this.info(a.id)).filter((a) => !q || `${a.name} ${a.category} ${a.dev} ${a.desc}`.toLowerCase().includes(q));
            box.innerHTML = apps.length ? apps.map((a) => this.rowHTML(a)).join('') : '<div class="as-empty">No results</div>';
        };
        const page = UI.page({ title: 'Search', large: true, tabbar: true, search: { placeholder: 'Games, Apps and more', onInput: render } });
        page.content.appendChild(box);
        this.bindButtons(box);
        render('');
        return page;
    },

    async install(id, btn) {
        const a = this.info(id);
        if (this.installed(id) || this.downloads[id]) return;
        if (Number(a.price) > 0) {
            const ok = await UI.confirm(`Buy ${a.name}?`, `${money(a.price)} will be paid from your bank account.`, 'Buy');
            if (!ok) return;
        }
        const res = await nui('mz:store', { fn: 'install', id });
        if (!res || !res.ok) {
            UI.alert({ title: 'Cannot Download', text: (res && res.error) || 'The App Store is not available right now.' });
            return;
        }
        // fake download progress based on the app size (the install is already saved)
        const dl = this.downloads[id] = { p: 0 };
        const total = clamp(Number(a.size || 40) * 18, 900, 4500);
        const start = Date.now();
        const tick = () => {
            dl.p = clamp((Date.now() - start) / total, 0, 1);
            $$(`[data-get="${id}"].as-progress`).forEach((b) => b.style.setProperty('--p', dl.p));
            if (dl.p < 1) return requestAnimationFrame(tick);
            delete this.downloads[id];
            Phone.setInstalled(res.installed);
            this.repaint();
            Phone.notify({ app: 'store', title: 'App Store', text: `${a.name} was installed on your Home Screen.`, icon: 'fa-solid fa-bag-shopping', color: '#0a84ff' });
        };
        this.repaint();
        requestAnimationFrame(tick);
    },

    async uninstall(id) {
        const a = this.info(id);
        if (!(await UI.confirm(`Delete "${a.name}"?`, 'Deleting this app will remove it from your Home Screen. You can download it again for free.', 'Delete App', true))) return false;
        const res = await nui('mz:store', { fn: 'remove', id });
        if (res && res.ok) {
            Phone.setInstalled(res.installed);
            this.repaint();
            return true;
        }
        return false;
    },

    repaint() {
        if (S.currentApp !== 'store' || !this.nav) return;
        $$('#app-window [data-get], #app-window [data-open]').forEach((b) => {
            const id = b.dataset.get || b.dataset.open;
            const a = this.info(id);
            const tmp = el(`<div>${this.getBtn(a, !b.classList.contains('big'))}</div>`).firstElementChild;
            b.replaceWith(tmp);
        });
        // buttons are updated in place - the list keeps its scroll position
    },

    detail(id) {
        const a = this.info(id);
        const page = UI.page({ title: '', back: true, backLabel: this.tab[0].toUpperCase() + this.tab.slice(1) });
        const shots = this.screens(id);
        page.content.innerHTML = `
            <div class="as-detail-head">${iconHTML(id)}<div><h2>${esc(a.name)}</h2><span>${esc(a.dev)}</span>
                <div class="as-detail-btns">${this.getBtn(a)}${this.installed(id) ? '<span class="as-del" id="as-del"><i class="fa-solid fa-trash-can"></i></span>' : ''}</div></div></div>
            <div class="as-stats">
                <div><small>${this.fmtCount(a.count)} RATINGS</small><b>${a.score.toFixed(1)}</b>${this.stars(a.score)}</div>
                <div><small>AGE</small><b>12+</b><span>Years Old</span></div>
                <div><small>CATEGORY</small><b><i class="fa-solid fa-layer-group"></i></b><span>${esc(a.category)}</span></div>
                <div><small>SIZE</small><b>${a.size}</b><span>MB</span></div>
            </div>
            <div class="as-shots">${shots}</div>
            <div class="as-desc">${esc(a.desc)}</div>
            <div class="as-section"><h3>Ratings &amp; Reviews</h3><span class="link" id="as-write">Write a Review</span></div>
            <div class="as-rating-big"><b>${a.score.toFixed(1)}</b><span>out of 5<br>${this.fmtCount(a.count)} Ratings</span></div>
            <div id="as-reviews" class="as-reviews">${UI.loading().outerHTML}</div>
            <div class="as-section"><h3>Information</h3></div>
            <div class="list">${[['Provider', a.dev], ['Size', a.size + ' MB'], ['Category', a.category], ['Price', Number(a.price) > 0 ? money(a.price) : 'Free']].map(([k, v]) => `<div class="row"><div class="row-body"><div class="row-title text-gray">${k}</div></div><div class="row-value">${esc(v)}</div></div>`).join('')}</div>`;
        this.bindButtons(page.content);
        const del = $('#as-del', page);
        if (del) del.onclick = async () => { if (await this.uninstall(id)) this.nav.pop(); };
        $('#as-write', page).onclick = () => this.writeReview(id, page);
        this.loadReviews(id, page);
        this.nav.push(page);
    },

    screens(id) {
        const mock = {
            instagram: ['fa-regular fa-heart', 'fa-solid fa-camera-retro', 'fa-regular fa-paper-plane'],
            x: ['fa-brands fa-x-twitter', 'fa-solid fa-retweet', 'fa-solid fa-hashtag'],
            tiktok: ['fa-solid fa-music', 'fa-solid fa-video', 'fa-regular fa-heart'],
            market: ['fa-solid fa-car', 'fa-solid fa-house', 'fa-solid fa-tags'],
            ride: ['fa-solid fa-car-side', 'fa-solid fa-route', 'fa-solid fa-star'],
            tinder: ['fa-solid fa-fire-flame-curved', 'fa-solid fa-heart', 'fa-solid fa-comments'],
            bet: ['fa-solid fa-futbol', 'fa-solid fa-basketball', 'fa-solid fa-trophy'],
            darkchat: ['fa-solid fa-user-secret', 'fa-solid fa-lock', 'fa-solid fa-terminal'],
            radio: ['fa-solid fa-radio', 'fa-solid fa-headphones', 'fa-solid fa-compact-disc'],
            health: ['fa-solid fa-heart-pulse', 'fa-solid fa-person-walking', 'fa-solid fa-droplet'],
            arcade: ['fa-solid fa-gamepad', 'fa-solid fa-trophy', 'fa-solid fa-dice'],
            browser: ['fa-solid fa-newspaper', 'fa-solid fa-car-side', 'fa-solid fa-building-columns'],
            findmy: ['fa-solid fa-location-crosshairs', 'fa-solid fa-user-group', 'fa-solid fa-route'],
        }[id] || ['fa-solid fa-mobile-screen', 'fa-solid fa-star', 'fa-solid fa-bolt'];
        const bg = (ICONS[id] && ICONS[id].bg) || '#555';
        return mock.map((ic) => `<div class="as-shot" style="background:${bg}"><i class="${ic}"></i></div>`).join('');
    },

    async loadReviews(id, page) {
        const list = await nui('mz:store', { fn: 'reviews', id });
        const box = $('#as-reviews', page);
        if (!box) return;
        const rows = Array.isArray(list) ? list : Object.values(list || {});
        box.innerHTML = rows.length ? rows.map((r) => `<div class="as-review"><div class="as-review-top">${this.stars(r.rating)}<small>${esc(r.name)} · ${esc(timeAgo(r.created))}</small></div>${r.text ? `<p>${esc(r.text)}</p>` : ''}</div>`).join('')
            : '<div class="as-empty">No reviews yet. Be the first!</div>';
    },

    writeReview(id, page) {
        let rating = 5;
        UI.sheet({
            title: 'Write a Review', done: 'Send',
            content: (body) => {
                body.innerHTML = `<div class="as-pick-stars">${[1, 2, 3, 4, 5].map((i) => `<i class="fa-solid fa-star on" data-r="${i}"></i>`).join('')}</div><div class="section-footer" style="text-align:center">Tap to Rate</div>`;
                body.appendChild(UI.form([{ id: 'text', placeholder: 'Review (optional)', textarea: true, max: 300 }]));
                $('.as-pick-stars', body).onclick = (e) => {
                    const st = e.target.closest('[data-r]'); if (!st) return;
                    rating = Number(st.dataset.r);
                    $$('.as-pick-stars i', body).forEach((x) => x.classList.toggle('on', Number(x.dataset.r) <= rating));
                };
            },
            onDone: async (sheet) => {
                const text = $('textarea', sheet).value.trim();
                const ok = await nui('mz:store', { fn: 'review', app: id, rating, text });
                if (ok !== true) { UI.hud('fa-solid fa-triangle-exclamation', 'Could not send'); return false; }
                UI.hud('fa-solid fa-check', 'Thanks for your review!');
                this.loadReviews(id, page);
                return true;
            },
        });
    },
};

Apps.define('store', { open: (nav, o) => AppStore.open(nav, o), onReopen: (o) => { if (o && o.app) AppStore.detail(o.app); } });
