/* Safari — tabs, bookmarks, history, Los Santos websites and the real internet */
'use strict';

const br = (fn, arg) => nui('mz:browser', { fn, arg });

/* ---------- websites ---------- */
const SITES = {
    'eyefind.info': { name: 'Eyefind', color: '#1a73e8', icon: 'fa-solid fa-magnifying-glass', keys: 'search engine web find' },
    'weazelnews.com': { name: 'Weazel News', color: '#d71920', icon: 'fa-solid fa-newspaper', keys: 'news articles journalism breaking weazel' },
    'legendarymotorsport.net': { name: 'Legendary Motorsport', color: '#b8932f', icon: 'fa-solid fa-car-side', keys: 'cars vehicles buy dealership supercar price' },
    'dynasty8realestate.com': { name: 'Dynasty 8', color: '#0f7a4b', icon: 'fa-solid fa-house', keys: 'houses homes property real estate apartment rent buy' },
    'mazebank.com': { name: 'Maze Bank', color: '#c8102e', icon: 'fa-solid fa-building-columns', keys: 'bank money balance account transfer' },
    'lspd.gov': { name: 'LSPD', color: '#13306b', icon: 'fa-solid fa-shield-halved', keys: 'police report crime 911 lspd sheriff' },
    'pillboxhospital.com': { name: 'Pillbox Medical', color: '#e0313d', icon: 'fa-solid fa-truck-medical', keys: 'hospital ems ambulance medical doctor' },
    'lifeinvader.com': { name: 'LifeInvader', color: '#1d4ed8', icon: 'fa-solid fa-user-group', keys: 'social network lifeinvader' },
};
const STATIONS = {
    police: [{ n: 'Mission Row Police Station', x: 428.9, y: -984.5 }, { n: 'Vespucci Police Station', x: -1108.2, y: -845.1 }, { n: 'Sandy Shores Sheriff', x: 1853.2, y: 3686.6 }, { n: 'Paleto Bay Sheriff', x: -448.4, y: 6008.6 }],
    ems: [{ n: 'Pillbox Hill Medical Center', x: 298.6, y: -584.5 }, { n: 'Sandy Shores Medical', x: 1839.6, y: 3672.9 }, { n: 'Paleto Bay Medical', x: -247.7, y: 6331.2 }],
};

function parseUrl(input) {
    let u = String(input || '').trim();
    if (!u) return { internal: true, host: 'start', path: '', query: new URLSearchParams(), href: 'start' };
    if (/^about:|^start$/.test(u)) return { internal: true, host: 'start', path: '', query: new URLSearchParams(), href: 'start' };
    const hasScheme = /^https?:\/\//i.test(u);
    const bare = u.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const host = bare.split(/[/?#]/)[0].toLowerCase();
    if (SITES[host]) {
        const rest = bare.slice(host.length);
        const [path, qs] = rest.split('?');
        return { internal: true, host, path: (path || '').replace(/^\/+|\/+$/g, ''), query: new URLSearchParams(qs || ''), href: host + (rest || '') };
    }
    // text without a dot (or with spaces) -> search
    if (!hasScheme && (/\s/.test(u) || !/\.[a-z]{2,}/i.test(u))) return parseUrl(`eyefind.info/search?q=${encodeURIComponent(u)}`);
    return { internal: false, host, href: hasScheme ? u : `https://${u}` };
}

const Browser = {
    nav: null, page: null, tabs: [], cur: 0, cfg: null, editing: false,

    tab() { return this.tabs[this.cur]; },

    async open(nav, opts = {}) {
        this.nav = nav;
        if (!this.cfg) this.cfg = (await br('config')) || {};
        const page = el(`<div class="page br-app">
            <div class="br-top"></div>
            <div class="br-view"></div>
            <div class="br-bottom">
                <div class="br-progress"></div>
                <div class="br-address"><i class="fa-solid fa-lock br-lock"></i><span class="br-host">Search or enter website</span><i class="fa-solid fa-rotate-right br-reload"></i></div>
                <div class="br-tools">
                    <span data-t="back"><i class="fa-solid fa-chevron-left"></i></span>
                    <span data-t="fwd"><i class="fa-solid fa-chevron-right"></i></span>
                    <span data-t="share"><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
                    <span data-t="books"><i class="fa-solid fa-book-open"></i></span>
                    <span data-t="tabs"><i class="fa-regular fa-clone"></i><b class="br-tabn">1</b></span>
                </div>
            </div>
            <div class="br-edit">
                <div class="br-edit-bar"><div class="br-edit-input"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Search or enter website name" spellcheck="false"></div><span class="br-cancel">Cancel</span></div>
                <div class="br-suggest"></div>
            </div>
            <div class="br-tabsview"></div>
        </div>`);
        this.page = page;
        nav.push(page, false);
        if (!this.tabs.length) this.tabs = [{ hist: [], idx: -1, title: '' }];
        $('.br-address', page).onclick = (e) => { if (e.target.closest('.br-reload')) this.reload(); else this.edit(); };
        $('.br-tools', page).onclick = (e) => {
            const t = e.target.closest('[data-t]'); if (!t) return;
            ({ back: () => this.back(), fwd: () => this.forward(), share: () => this.share(), books: () => this.bookmarks(), tabs: () => this.showTabs() })[t.dataset.t]();
        };
        const inp = $('.br-edit input', page);
        inp.addEventListener('input', () => this.suggest(inp.value));
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { this.closeEdit(); this.go(inp.value); } });
        $('.br-cancel', page).onclick = () => this.closeEdit();
        const view = $('.br-view', page);
        view.addEventListener('scroll', () => page.classList.toggle('scrolled', view.scrollTop > 30));
        if (opts.url) this.go(opts.url);
        else if (this.tab().idx >= 0) this.render();
        else this.go(this.cfg.homepage || 'start');
    },

    onReopen(opts) { if (opts && opts.url) this.go(opts.url, true); },

    /* ---------- navigation ---------- */
    go(input, newTab) {
        const u = parseUrl(input);
        if (newTab) { this.tabs.push({ hist: [], idx: -1, title: '' }); this.cur = this.tabs.length - 1; }
        const t = this.tab();
        t.hist = t.hist.slice(0, t.idx + 1);
        t.hist.push(u.href);
        t.idx = t.hist.length - 1;
        this.render();
    },
    back() { const t = this.tab(); if (t.idx > 0) { t.idx--; this.render(); } },
    forward() { const t = this.tab(); if (t.idx < t.hist.length - 1) { t.idx++; this.render(); } },
    reload() { this.render(); },
    current() { const t = this.tab(); return t.hist[t.idx] || 'start'; },

    async render() {
        const p = this.page;
        if (!p) return;
        const href = this.current();
        const u = parseUrl(href);
        const view = $('.br-view', p);
        view.scrollTop = 0;
        view.innerHTML = '';
        p.classList.remove('scrolled', 'external');
        const t = this.tab();
        $('.br-host', p).textContent = u.host === 'start' ? 'Search or enter website' : u.host;
        $('.br-lock', p).style.display = u.host === 'start' ? 'none' : '';
        $('[data-t="back"]', p).classList.toggle('off', t.idx <= 0);
        $('[data-t="fwd"]', p).classList.toggle('off', t.idx >= t.hist.length - 1);
        $('.br-tabn', p).textContent = this.tabs.length;
        this.progress();
        const doc = el('<div class="br-doc"></div>');
        view.appendChild(doc);
        let title = '';
        try {
            if (!u.internal) title = this.external(doc, u);
            else if (u.host === 'start') title = this.start(doc);
            else {
                const site = SITES[u.host];
                doc.classList.add('site-' + u.host.split('.')[0]);
                const ctx = { doc, path: u.path, q: u.query, go: (x) => this.go(x), browser: this };
                title = await Sites[u.host](ctx) || site.name;
            }
        } catch (e) {
            console.error(e);
            doc.innerHTML = '<div class="br-error"><i class="fa-solid fa-triangle-exclamation"></i><b>Safari cannot open the page</b><span>Something went wrong while loading this website.</span></div>';
        }
        if (this.current() !== href) return; // navigated meanwhile
        t.title = title || u.host;
        if (u.host !== 'start') this.addHistory(href, t.title);
        doc.addEventListener('click', (e) => {
            const a = e.target.closest('[data-href]');
            if (a) { e.preventDefault(); this.go(a.dataset.href); }
        });
    },

    progress() {
        const bar = $('.br-progress', this.page);
        bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run');
    },

    external(doc, u) {
        this.page.classList.add('external');
        if (this.cfg.allowInternet === false) {
            doc.innerHTML = `<div class="br-error"><i class="fa-solid fa-globe"></i><b>Internet access is disabled</b><span>Only Los Santos websites can be opened on this server.</span><div class="btn primary small" data-href="eyefind.info">Go to Eyefind</div></div>`;
            return 'Not available';
        }
        doc.innerHTML = `<iframe class="br-frame" src="${esc(u.href)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>
            <div class="br-note"><i class="fa-solid fa-circle-info"></i> If the page stays blank, this website does not allow being opened inside other apps.</div>`;
        setTimeout(() => { const n = $('.br-note', doc); if (n) n.classList.add('hide'); }, 5000);
        return u.host;
    },

    /* ---------- start page ---------- */
    start(doc) {
        const books = Store.get('bookmarks') || [];
        const hist = Store.get('browserHistory') || [];
        const freq = {};
        hist.forEach((h) => { const host = parseUrl(h.url).host; freq[host] = (freq[host] || 0) + 1; });
        const top = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 4);
        const tile = (href, name, icon, color) => `<div class="br-fav" data-href="${esc(href)}"><span style="background:${color}"><i class="${icon}"></i></span><small>${esc(name)}</small></div>`;
        doc.innerHTML = `<div class="br-start">
            <h3>Favourites</h3>
            <div class="br-favs">${Object.entries(SITES).map(([h, s]) => tile(h, s.name, s.icon, s.color)).join('')}
                ${books.map((b) => tile(b.url, b.title, 'fa-solid fa-bookmark', '#8e8e93')).join('')}</div>
            ${top.length ? `<h3>Frequently Visited</h3><div class="br-favs">${top.map((h) => { const s = SITES[h]; return tile(h, s ? s.name : h, s ? s.icon : 'fa-solid fa-globe', s ? s.color : '#636366'); }).join('')}</div>` : ''}
            <div class="br-privacy"><i class="fa-solid fa-shield-halved"></i><div><b>Privacy Report</b><span>Safari prevented ${12 + hist.length * 3} trackers from profiling you.</span></div></div>
        </div>`;
        return 'Start Page';
    },

    /* ---------- address editing ---------- */
    edit() {
        const p = this.page;
        p.classList.add('editing');
        const inp = $('.br-edit input', p);
        const cur = this.current();
        inp.value = cur === 'start' ? '' : cur;
        this.suggest(inp.value);
        setTimeout(() => { inp.focus(); inp.select(); }, 60);
    },
    closeEdit() { this.page.classList.remove('editing'); $('.br-edit input', this.page).blur(); },

    suggest(v) {
        v = String(v || '').trim().toLowerCase();
        const box = $('.br-suggest', this.page);
        const hist = (Store.get('browserHistory') || []).filter((h) => !v || h.url.toLowerCase().includes(v) || (h.title || '').toLowerCase().includes(v)).slice(0, 5);
        const sites = Object.entries(SITES).filter(([h, s]) => !v || h.includes(v) || s.name.toLowerCase().includes(v) || s.keys.includes(v)).slice(0, 6);
        box.innerHTML = `${v ? `<div class="br-sg" data-go="${esc(v)}"><i class="fa-solid fa-magnifying-glass"></i><div><b>${esc(v)}</b><small>Eyefind Search</small></div></div>` : ''}
            ${sites.length ? '<h4>Websites</h4>' : ''}${sites.map(([h, s]) => `<div class="br-sg" data-go="${h}"><span class="br-sg-ic" style="background:${s.color}"><i class="${s.icon}"></i></span><div><b>${esc(s.name)}</b><small>${h}</small></div></div>`).join('')}
            ${hist.length ? '<h4>History</h4>' : ''}${hist.map((h) => `<div class="br-sg" data-go="${esc(h.url)}"><i class="fa-solid fa-clock-rotate-left"></i><div><b>${esc(h.title || h.url)}</b><small>${esc(h.url)}</small></div></div>`).join('')}`;
        box.onclick = (e) => { const t = e.target.closest('[data-go]'); if (t) { this.closeEdit(); this.go(t.dataset.go); } };
    },

    /* ---------- history / bookmarks / share / tabs ---------- */
    addHistory(url, title) {
        const h = (Store.get('browserHistory') || []).filter((x) => x.url !== url);
        h.unshift({ url, title, t: Date.now() });
        Store.set('browserHistory', h.slice(0, 60));
    },

    share() {
        const url = this.current();
        if (url === 'start') return;
        const t = this.tab();
        const books = Store.get('bookmarks') || [];
        const saved = books.some((b) => b.url === url);
        UI.actions({ title: t.title, buttons: [
            { text: 'Copy Link', onClick: () => { copyText(url); UI.hud('fa-solid fa-link', 'Link copied'); } },
            { text: saved ? 'Remove Bookmark' : 'Add Bookmark', onClick: () => {
                Store.set('bookmarks', saved ? books.filter((b) => b.url !== url) : [...books, { url, title: t.title }]);
                UI.hud('fa-solid fa-bookmark', saved ? 'Bookmark removed' : 'Bookmark added');
            } },
            { text: 'Send in Messages', onClick: async () => {
                const num = await UI.prompt('Send link', 'Phone number or contact name', '06…');
                if (!num) return;
                const c = (S.contacts || []).find((x) => (x.name || '').toLowerCase() === num.toLowerCase());
                const dt = new Date();
                nui('SendMessage', { ChatNumber: String(c ? c.number : num.replace(/\s+/g, '')), ChatDate: `${dt.getDate()}-${dt.getMonth()}-${dt.getFullYear()}`, ChatMessage: `${t.title}\n${url}`, ChatTime: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`, ChatType: 'message' });
                UI.hud('fa-solid fa-paper-plane', 'Sent');
            } },
        ] });
    },

    bookmarks() {
        let mode = 'books';
        UI.sheet({
            title: 'Bookmarks', cancel: 'Done',
            content: (body, sheet) => {
                const draw = () => {
                    body.innerHTML = '';
                    body.appendChild(UI.segmented([{ id: 'books', label: 'Bookmarks' }, { id: 'hist', label: 'History' }], mode, (id) => { mode = id; draw(); }));
                    const list = mode === 'books' ? (Store.get('bookmarks') || []) : (Store.get('browserHistory') || []);
                    if (!list.length) { body.appendChild(UI.empty(mode === 'books' ? 'fa-solid fa-bookmark' : 'fa-solid fa-clock-rotate-left', mode === 'books' ? 'No Bookmarks' : 'No History', mode === 'books' ? 'Use Share › Add Bookmark.' : '')); return; }
                    body.appendChild(UI.list(list.map((b) => ({ icon: mode === 'books' ? 'fa-solid fa-bookmark' : 'fa-solid fa-globe', iconBg: '#8e8e93', title: b.title || b.url, sub: b.url, onClick: () => { sheet.close(); this.go(b.url); } }))));
                    if (mode === 'hist') {
                        const c = el('<div class="btn-row"><div class="btn gray small">Clear History</div></div>');
                        c.onclick = () => { Store.set('browserHistory', []); draw(); };
                        body.appendChild(c);
                    }
                };
                draw();
            },
        });
    },

    showTabs() {
        const v = $('.br-tabsview', this.page);
        v.innerHTML = `<div class="br-tabgrid">${this.tabs.map((t, i) => {
            const u = parseUrl(t.hist[t.idx] || 'start');
            const s = SITES[u.host];
            return `<div class="br-tabcard ${i === this.cur ? 'on' : ''}" data-i="${i}"><div class="br-tabhead"><span>${esc(t.title || 'Start Page')}</span><i class="fa-solid fa-xmark" data-x="${i}"></i></div>
                <div class="br-tabbody" style="background:${s ? s.color : '#2c2c2e'}"><i class="${s ? s.icon : 'fa-solid fa-compass'}"></i></div></div>`;
        }).join('')}</div>
            <div class="br-tabbar"><span data-a="new"><i class="fa-solid fa-plus"></i></span><b>${this.tabs.length} Tab${this.tabs.length > 1 ? 's' : ''}</b><span data-a="done">Done</span></div>`;
        v.classList.add('show');
        v.onclick = (e) => {
            const x = e.target.closest('[data-x]');
            if (x) {
                this.tabs.splice(Number(x.dataset.x), 1);
                if (!this.tabs.length) this.tabs = [{ hist: [], idx: -1, title: '' }];
                this.cur = Math.min(this.cur, this.tabs.length - 1);
                return this.showTabs();
            }
            const c = e.target.closest('[data-i]');
            const a = e.target.closest('[data-a]');
            if (c) { this.cur = Number(c.dataset.i); v.classList.remove('show'); if (this.tab().idx < 0) this.go('start'); else this.render(); }
            else if (a && a.dataset.a === 'new') { v.classList.remove('show'); this.go('start', true); }
            else if (a) v.classList.remove('show');
        };
    },
};

/* =========================================================
   Website renderers: (ctx) → page title
   ========================================================= */
const siteHeader = (host, inner, cls = '') => `<header class="sh ${cls}">${inner}</header>`;

const Sites = {
    /* ---------- Eyefind (search) ---------- */
    async 'eyefind.info'(ctx) {
        const q = ctx.q.get('q') || '';
        const logo = '<span class="ef-logo"><b style="color:#1a73e8">e</b><b style="color:#ea4335">y</b><b style="color:#fbbc05">e</b><b style="color:#1a73e8">f</b><b style="color:#34a853">i</b><b style="color:#ea4335">n</b><b style="color:#1a73e8">d</b></span>';
        const form = `<form class="ef-search"><i class="fa-solid fa-magnifying-glass"></i><input name="q" value="${esc(q)}" placeholder="Search Los Santos" autocomplete="off"></form>`;
        if (ctx.path !== 'search' || !q) {
            ctx.doc.innerHTML = `<div class="ef-home">${logo}${form}
                <div class="ef-tiles">${Object.entries(SITES).filter(([h]) => h !== 'eyefind.info').map(([h, s]) => `<div data-href="${h}"><span style="background:${s.color}"><i class="${s.icon}"></i></span><small>${esc(s.name)}</small></div>`).join('')}</div>
                <div class="ef-today"><h4>Today in Los Santos</h4><div class="ef-news"></div></div></div>`;
            this._bindSearch(ctx);
            const d = await br('news', {});
            const list = d ? listOf(d.articles).slice(0, 3) : [];
            const box = $('.ef-news', ctx.doc);
            if (box) box.innerHTML = list.length ? list.map((a) => `<div class="ef-card" data-href="weazelnews.com/article/${a.id}">${a.image ? `<div class="ef-card-img">${Media.html(a.image)}</div>` : ''}<div><small>WEAZEL NEWS · ${esc(timeAgo(a.created))}</small><b>${esc(a.title)}</b></div></div>`).join('') : '<p class="ef-quiet">No news today. Los Santos is quiet… for now.</p>';
            return 'Eyefind';
        }
        ctx.doc.innerHTML = `<div class="ef-results-head">${logo.replace('ef-logo', 'ef-logo sm')}${form}</div><div class="ef-results"><div class="br-loading"><i class="fa-solid fa-circle-notch spin"></i></div></div>`;
        this._bindSearch(ctx);
        const ql = q.toLowerCase();
        const [news, vehicles, market] = await Promise.all([br('news', { q }), br('vehicles'), nui('mz:market', { fn: 'list', arg: { q } })]);
        const res = [];
        Object.entries(SITES).forEach(([h, s]) => { if (h.includes(ql) || s.name.toLowerCase().includes(ql) || s.keys.split(' ').some((k) => ql.includes(k) || k.includes(ql))) res.push({ href: h, title: s.name, url: h, text: `Official website of ${s.name}.` }); });
        listOf(news && news.articles).forEach((a) => res.push({ href: `weazelnews.com/article/${a.id}`, title: a.title, url: `weazelnews.com › article › ${a.id}`, text: a.excerpt }));
        listOf(vehicles).filter((v) => `${v.name} ${v.brand} ${v.model}`.toLowerCase().includes(ql)).slice(0, 5)
            .forEach((v) => res.push({ href: `legendarymotorsport.net/vehicle/${v.model}`, title: `${v.brand} ${v.name} – ${money(v.price)}`, url: `legendarymotorsport.net › ${v.category}`, text: `Buy the ${v.brand} ${v.name} today. Category: ${v.category}.` }));
        listOf(market).slice(0, 5).forEach((m) => res.push({ href: m.category === 'property' ? 'dynasty8realestate.com' : null, app: 'market', title: `${m.title} – ${money(m.price)}`, url: m.category === 'property' ? 'dynasty8realestate.com › listing' : 'Marketplace', text: m.description || `Sold by ${m.seller}` }));
        const box = $('.ef-results', ctx.doc);
        box.innerHTML = `<small class="ef-count">About ${res.length} result${res.length === 1 ? '' : 's'}</small>` + (res.length
            ? res.map((r) => `<div class="ef-r" ${r.href ? `data-href="${esc(r.href)}"` : `data-app="${r.app}"`}><small>${esc(r.url)}</small><b>${esc(r.title)}</b><p>${esc(String(r.text || '').slice(0, 160))}</p></div>`).join('')
            : `<div class="ef-none">No results for <b>${esc(q)}</b>.<br>Try different keywords.</div>`);
        box.onclick = (e) => { const a = e.target.closest('[data-app]'); if (a) Phone.openApp(a.dataset.app); };
        return `${q} – Eyefind Search`;
    },
    _bindSearch(ctx) {
        const f = $('.ef-search', ctx.doc);
        f.onsubmit = (e) => { e.preventDefault(); const v = $('input', f).value.trim(); if (v) ctx.go(`eyefind.info/search?q=${encodeURIComponent(v)}`); };
    },

    /* ---------- Weazel News ---------- */
    async 'weazelnews.com'(ctx) {
        const cats = ['city', 'crime', 'business', 'sports', 'weather', 'breaking'];
        const head = siteHeader('weazelnews.com', `<div class="wz-brand" data-href="weazelnews.com"><span>WEAZEL</span>NEWS</div><nav>${cats.map((c) => `<span data-href="weazelnews.com/${c}" class="${ctx.path === c ? 'on' : ''}">${c}</span>`).join('')}</nav>`, 'wz-head');
        const [section, id] = ctx.path.split('/');
        if (section === 'article' && id) {
            ctx.doc.innerHTML = head + '<div class="br-loading"><i class="fa-solid fa-circle-notch spin"></i></div>';
            const a = await br('article', id);
            if (!a) { ctx.doc.innerHTML = head + '<div class="br-error"><i class="fa-regular fa-newspaper"></i><b>Article not found</b></div>'; return 'Weazel News'; }
            const d = new Date(Number(a.created) * 1000);
            ctx.doc.innerHTML = `${head}<article class="wz-article"><span class="wz-cat ${esc(a.category)}">${esc(a.category)}</span><h1>${esc(a.title)}</h1>
                <div class="wz-meta">By <b>${esc(a.author)}</b> · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · <i class="fa-regular fa-eye"></i> ${fmtCount(a.views)}</div>
                ${a.image ? `<div class="wz-img">${Media.html(a.image, '', { controls: true })}</div>` : ''}
                ${String(a.body).split(/\n+/).map((pp) => `<p>${esc(pp)}</p>`).join('')}
                ${a.mine ? '<div class="btn gray small wz-del"><i class="fa-solid fa-trash-can"></i> Delete article</div>' : ''}</article>`;
            const del = $('.wz-del', ctx.doc);
            if (del) del.onclick = async () => { if (await UI.confirm('Delete article?', 'It will be removed for everyone.', 'Delete', true)) { await br('delete', a.id); ctx.go('weazelnews.com'); } };
            return a.title;
        }
        if (section === 'write') return this._wzWrite(ctx, head);
        ctx.doc.innerHTML = head + '<div class="br-loading"><i class="fa-solid fa-circle-notch spin"></i></div>';
        const d = await br('news', cats.includes(section) ? { category: section } : {});
        const list = d ? listOf(d.articles) : [];
        const hero = list[0];
        ctx.doc.innerHTML = `${head}
            ${d && d.canWrite ? '<div class="wz-write" data-href="weazelnews.com/write"><i class="fa-solid fa-pen-nib"></i> Write an article</div>' : ''}
            ${hero ? `<div class="wz-hero" data-href="weazelnews.com/article/${hero.id}">${hero.image ? Media.html(hero.image) : '<div class="wz-hero-ph"><i class="fa-solid fa-tower-broadcast"></i></div>'}<div><span class="wz-cat ${esc(hero.category)}">${esc(hero.category)}</span><h2>${esc(hero.title)}</h2><small>${esc(hero.author)} · ${esc(timeAgo(hero.created))}</small></div></div>` : ''}
            <div class="wz-list">${list.slice(1).map((a) => `<div class="wz-item" data-href="weazelnews.com/article/${a.id}"><div><span class="wz-cat ${esc(a.category)}">${esc(a.category)}</span><b>${esc(a.title)}</b><p>${esc(a.excerpt || '')}</p><small>${esc(a.author)} · ${esc(timeAgo(a.created))}</small></div>${a.image ? `<div class="wz-thumb">${Media.html(a.image)}</div>` : ''}</div>`).join('')}</div>
            ${!list.length ? '<div class="br-error"><i class="fa-regular fa-newspaper"></i><b>No stories yet</b><span>Reporters of Weazel News publish their articles here.</span></div>' : ''}
            <footer class="wz-foot">© Weazel News · Confirming your prejudices since 1983</footer>`;
        return 'Weazel News';
    },
    _wzWrite(ctx, head) {
        let image = '';
        ctx.doc.innerHTML = `${head}<div class="wz-form"><h2>New article</h2>
            <input class="wz-in" id="wz-title" maxlength="120" placeholder="Headline">
            <select class="wz-in" id="wz-cat">${['city', 'crime', 'business', 'sports', 'weather', 'breaking'].map((c) => `<option value="${c}">${c === 'breaking' ? 'BREAKING (notifies everyone)' : c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select>
            <div class="wz-pic"><span>Add photo / video</span></div>
            <textarea class="wz-in" id="wz-body" rows="10" maxlength="6000" placeholder="Write your story…"></textarea>
            <div class="wz-err"></div><div class="btn primary block wz-pub">Publish</div></div>`;
        $('.wz-pic', ctx.doc).onclick = async () => {
            const u = await PhotosApp.pick({ title: 'Article photo' });
            if (!u) return;
            image = u;
            $('.wz-pic', ctx.doc).innerHTML = Media.html(u, '', { autoplay: true });
        };
        $('.wz-pub', ctx.doc).onclick = async () => {
            const r = await br('publish', { title: $('#wz-title', ctx.doc).value, body: $('#wz-body', ctx.doc).value, category: $('#wz-cat', ctx.doc).value, image });
            if (!r || r.error) { $('.wz-err', ctx.doc).textContent = (r && r.error) || 'Could not publish'; return; }
            UI.hud('fa-solid fa-circle-check', 'Published');
            ctx.go(`weazelnews.com/article/${r.id}`);
        };
        return 'Write – Weazel News';
    },

    /* ---------- Legendary Motorsport ---------- */
    async 'legendarymotorsport.net'(ctx) {
        const head = siteHeader('', `<div class="lm-brand" data-href="legendarymotorsport.net"><i class="fa-solid fa-crown"></i> LEGENDARY<small>MOTORSPORT</small></div>`, 'lm-head');
        const all = listOf(await br('vehicles'));
        const img = (v) => `<img src="https://docs.fivem.net/vehicles/${esc(v.model)}.webp" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-car-side lm-noimg'}))">`;
        const [section, model] = ctx.path.split('/');
        if (section === 'vehicle' && model) {
            const v = all.find((x) => x.model === model);
            if (!v) { ctx.doc.innerHTML = head + '<div class="br-error"><b>Vehicle not found</b></div>'; return 'Legendary Motorsport'; }
            const months = [12, 24, 36];
            ctx.doc.innerHTML = `${head}<div class="lm-detail"><div class="lm-big">${img(v)}</div>
                <small class="lm-brandname">${esc(v.brand)}</small><h1>${esc(v.name)}</h1><div class="lm-price">${money(v.price)}</div>
                <div class="lm-specs"><div><small>Category</small><b>${esc(v.category)}</b></div><div><small>Model</small><b>${esc(v.model)}</b></div><div><small>Showroom</small><b>${esc(v.shop || 'PDM')}</b></div></div>
                <h3>Finance it</h3><div class="lm-fin">${months.map((m) => `<div><b>${money(Math.ceil(v.price * 0.9 * 1.08 / m))}</b><small>/ month · ${m} mo.</small></div>`).join('')}</div>
                <small class="lm-fine">10% down payment (${money(Math.ceil(v.price * 0.1))}), 8% APR. Ask the dealership for the real terms.</small>
                <div class="btn block lm-btn" id="lm-gps"><i class="fa-solid fa-location-dot"></i> Visit the showroom</div></div>`;
            $('#lm-gps', ctx.doc).onclick = () => { const d = ctx.browser.cfg.dealership; if (d) { nui('mz:setWaypoint', { x: d.x, y: d.y, label: 'Dealership' }); UI.hud('fa-solid fa-location-dot', 'GPS set'); } };
            return `${v.brand} ${v.name}`;
        }
        const cats = [...new Set(all.map((v) => v.category))].sort();
        const cat = ctx.q.get('cat') || '';
        const sort = ctx.q.get('sort') || 'high';
        const q = (ctx.q.get('q') || '').toLowerCase();
        let list = all.filter((v) => (!cat || v.category === cat) && (!q || `${v.brand} ${v.name}`.toLowerCase().includes(q)));
        list = list.sort((a, b) => (sort === 'low' ? a.price - b.price : sort === 'name' ? a.name.localeCompare(b.name) : b.price - a.price));
        const link = (o) => { const p = new URLSearchParams({ cat, sort, q, ...o }); [...p.keys()].forEach((k) => { if (!p.get(k)) p.delete(k); }); return `legendarymotorsport.net?${p}`; };
        ctx.doc.innerHTML = `${head}<div class="lm-hero"><h2>Exclusivity, Speed, Style.</h2><form class="lm-search"><i class="fa-solid fa-magnifying-glass"></i><input value="${esc(q)}" placeholder="Search ${all.length} vehicles"></form></div>
            <div class="lm-cats"><span data-href="${link({ cat: '' })}" class="${!cat ? 'on' : ''}">All</span>${cats.map((c) => `<span data-href="${link({ cat: c })}" class="${cat === c ? 'on' : ''}">${esc(c)}</span>`).join('')}</div>
            <div class="lm-sort">Sort: ${[['high', 'Price ↓'], ['low', 'Price ↑'], ['name', 'Name']].map(([k, l]) => `<span data-href="${link({ sort: k })}" class="${sort === k ? 'on' : ''}">${l}</span>`).join('')}<em>${list.length} results</em></div>
            <div class="lm-grid">${list.slice(0, 80).map((v) => `<div class="lm-card" data-href="legendarymotorsport.net/vehicle/${esc(v.model)}"><div class="lm-img">${img(v)}</div><small>${esc(v.brand)}</small><b>${esc(v.name)}</b><span>${money(v.price)}</span></div>`).join('')}</div>`;
        const f = $('.lm-search', ctx.doc);
        f.onsubmit = (e) => { e.preventDefault(); ctx.go(link({ q: $('input', f).value.trim() })); };
        return 'Legendary Motorsport';
    },

    /* ---------- Dynasty 8 ---------- */
    async 'dynasty8realestate.com'(ctx) {
        const head = siteHeader('', `<div class="d8-brand" data-href="dynasty8realestate.com"><b>DYNASTY</b><span>8</span></div><div class="d8-tag">Real Estate</div>`, 'd8-head');
        ctx.doc.innerHTML = head + '<div class="br-loading"><i class="fa-solid fa-circle-notch spin"></i></div>';
        const rows = listOf(await nui('mz:market', { fn: 'list', arg: { category: 'property' } }));
        ctx.doc.innerHTML = `${head}<div class="d8-hero"><h2>Find your new home in Los Santos</h2><p>${rows.length} propert${rows.length === 1 ? 'y' : 'ies'} for sale or rent</p><div class="btn small d8-list">List your property</div></div>
            <div class="d8-grid">${rows.map((r, i) => `<div class="d8-card" data-i="${i}"><div class="d8-img">${r.image ? Media.html(r.image) : '<i class="fa-solid fa-house"></i>'}</div><div class="d8-info"><b>${money(r.price)}</b><span>${esc(r.title)}</span><small><i class="fa-solid fa-user-tie"></i> ${esc(r.seller)} · ${esc(timeAgo(r.created))}</small>
                ${r.mine ? '' : `<div class="d8-btns"><span data-call="${i}"><i class="fa-solid fa-phone"></i> Call</span><span data-msg="${i}"><i class="fa-solid fa-comment"></i> Message</span></div>`}</div></div>`).join('')}</div>
            ${!rows.length ? '<div class="br-error"><i class="fa-solid fa-sign-hanging"></i><b>No listings right now</b><span>Post a property in the Marketplace (category Property) and it shows here.</span></div>' : ''}`;
        $('.d8-list', ctx.doc).onclick = () => Phone.openApp('market');
        ctx.doc.onclick = (e) => {
            const c = e.target.closest('[data-call]'); const m = e.target.closest('[data-msg]');
            if (c) { const r = rows[Number(c.dataset.call)]; if (r.phone) Phone.startCall(r.phone, r.seller); }
            if (m) { const r = rows[Number(m.dataset.msg)]; if (r.phone) Phone.openApp('whatsapp', { number: r.phone, name: r.seller }); }
        };
        return 'Dynasty 8 Real Estate';
    },

    /* ---------- Maze Bank ---------- */
    async 'mazebank.com'(ctx) {
        const head = siteHeader('', '<div class="mb-brand" data-href="mazebank.com"><i class="fa-solid fa-diamond"></i> MAZE BANK</div><small>Online Banking</small>', 'mb-head');
        ctx.doc.innerHTML = `${head}<div class="mb-login"><i class="fa-solid fa-fingerprint"></i><span>Signing in securely…</span></div>`;
        const d = (await br('money')) || {};
        await sleep(500);
        const m = d.money || {};
        ctx.doc.innerHTML = `${head}<div class="mb-welcome">Welcome back,<b>${esc(d.name || '')}</b></div>
            <div class="mb-card"><small>Current account</small><div class="mb-bal">${money(m.bank)}</div><span>${esc(d.account || '')}</span><i class="fa-solid fa-diamond"></i></div>
            <div class="mb-rows">
                <div><i class="fa-solid fa-money-bill-wave"></i><span>Cash in wallet</span><b>${money(m.cash)}</b></div>
                ${m.crypto !== undefined ? `<div><i class="fa-brands fa-bitcoin"></i><span>Crypto</span><b>${esc(m.crypto)}</b></div>` : ''}
            </div>
            <div class="mb-actions"><div data-app="bank"><i class="fa-solid fa-arrow-right-arrow-left"></i>Transfer</div><div data-app="bank"><i class="fa-solid fa-file-invoice-dollar"></i>Bills</div><div data-href="mazebank.com/loans"><i class="fa-solid fa-hand-holding-dollar"></i>Loans</div></div>
            ${ctx.path === 'loans' ? '<div class="mb-info"><h3>Personal loans</h3><p>Borrow up to $250,000 at 6.9% APR. Visit any Maze Bank branch and ask a banker.</p></div>' : '<div class="mb-info"><h3>Maze Bank Arena</h3><p>Banking for the bold. Your money, safe since 1977*.</p><small>*Not a guarantee.</small></div>'}`;
        ctx.doc.onclick = (e) => { const a = e.target.closest('[data-app]'); if (a) Phone.openApp(a.dataset.app); };
        return 'Maze Bank – Online Banking';
    },

    /* ---------- LSPD + Pillbox (report forms) ---------- */
    'lspd.gov'(ctx) { return Sites._service(ctx, 'police'); },
    'pillboxhospital.com'(ctx) { return Sites._service(ctx, 'ems'); },
    _service(ctx, kind) {
        const police = kind === 'police';
        const types = police ? ['Theft', 'Assault', 'Shots fired', 'Suspicious activity', 'Traffic accident', 'Vandalism', 'Other'] : ['Injured person', 'Unconscious person', 'Car crash', 'Overdose', 'Fire', 'Other'];
        const head = police
            ? siteHeader('', '<div class="pd-brand"><i class="fa-solid fa-shield-halved"></i><div>LOS SANTOS<b>POLICE DEPARTMENT</b></div></div>', 'pd-head')
            : siteHeader('', '<div class="pd-brand"><i class="fa-solid fa-staff-snake"></i><div>PILLBOX HILL<b>MEDICAL CENTER</b></div></div>', 'pd-head ems');
        ctx.doc.innerHTML = `${head}
            <div class="pd-banner"><i class="fa-solid fa-circle-exclamation"></i><div><b>In danger right now?</b><span>Use Emergency SOS in the Control Centre - it sends your location at once.</span></div></div>
            <div class="pd-form"><h2>${police ? 'Report a crime online' : 'Request an ambulance'}</h2>
                <label>What happened?</label><select class="wz-in" id="pd-type">${types.map((t) => `<option>${t}</option>`).join('')}</select>
                <label>Details</label><textarea class="wz-in" id="pd-text" rows="4" maxlength="250" placeholder="${police ? 'Describe the suspect, vehicle, direction…' : 'How many people, what injuries…'}"></textarea>
                ${police ? '<label class="pd-anon"><input type="checkbox" id="pd-anon"> Report anonymously</label>' : ''}
                <small class="pd-loc"><i class="fa-solid fa-location-dot"></i> Your current location is sent with the report.</small>
                <div class="pd-msg"></div><div class="btn block pd-send">${police ? 'Send report' : 'Send ambulance'}</div></div>
            <h3 class="pd-h">${police ? 'Stations' : 'Hospitals'}</h3>
            <div class="pd-stations">${STATIONS[kind].map((s, i) => `<div data-st="${i}"><i class="fa-solid fa-location-dot"></i><span>${esc(s.n)}</span><b>GPS</b></div>`).join('')}</div>`;
        $('.pd-send', ctx.doc).onclick = async (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i>';
            const anon = $('#pd-anon', ctx.doc);
            const r = await nui('mz:emergency', { kind, text: `${$('#pd-type', ctx.doc).value}: ${$('#pd-text', ctx.doc).value}`, anonymous: !!(anon && anon.checked) });
            btn.textContent = police ? 'Send report' : 'Send ambulance';
            const msg = $('.pd-msg', ctx.doc);
            if (!r || r.error) { msg.className = 'pd-msg bad'; msg.textContent = (r && r.error) || 'Could not send'; return; }
            msg.className = 'pd-msg ok';
            msg.textContent = r.sent > 0 ? `Sent. ${r.sent} ${police ? 'officer' : 'medic'}${r.sent === 1 ? '' : 's'} on duty received it.` : `Sent, but nobody is on duty right now.`;
        };
        $('.pd-stations', ctx.doc).onclick = (e) => {
            const s = e.target.closest('[data-st]'); if (!s) return;
            const st = STATIONS[kind][Number(s.dataset.st)];
            nui('mz:setWaypoint', { x: st.x, y: st.y, label: st.n });
            UI.hud('fa-solid fa-location-dot', 'GPS set');
        };
        return police ? 'LSPD – Los Santos Police' : 'Pillbox Hill Medical Center';
    },

    /* ---------- LifeInvader ---------- */
    'lifeinvader.com'(ctx) {
        const has = Phone.installedApps().includes('x');
        ctx.doc.innerHTML = `<div class="li-page"><div class="li-logo">Life<b>Invader</b></div><h2>LifeInvader is now X.</h2><p>Same city. Same drama. New logo.</p>
            <div class="btn primary" id="li-go">${has ? 'Open X' : 'Get X on the App Store'}</div></div>`;
        $('#li-go', ctx.doc).onclick = () => Phone.openApp(has ? 'x' : 'store', has ? {} : { app: 'x' });
        return 'LifeInvader';
    },
};

Apps.define('browser', {
    open: (nav, o) => Browser.open(nav, o),
    onReopen: (o) => Browser.onReopen(o),
    onClose: () => { Browser.page = null; },
});
