/* Tinder, 1xBet, DarkChat */
'use strict';

/* ================= Tinder ================= */
const dating = (fn, extra = {}) => nui('mz:dating', Object.assign({ fn }, extra));
const Tinder = {
    nav: null, root: null, me: null, deck: [], tab: 'deck',

    async open(nav) {
        this.nav = nav;
        nav.push(el('<div class="page tinder"><div class="so-splash">' + iconHTML('tinder') + '</div></div>'), false);
        const d = await dating('me');
        if (S.currentApp !== 'tinder') return;
        if (!d || !d.profile) return nav.reset(this.setupPage((d && d.suggest) || {}, true));
        this.me = d.profile;
        this.shell();
    },

    shell() {
        this.root = el(`<div class="page tinder">
            <div class="td-head"><span data-t="profile"><i class="fa-solid fa-user"></i></span><span data-t="deck" class="logo"><i class="fa-solid fa-fire-flame-curved"></i> tinder</span><span data-t="matches"><i class="fa-solid fa-comments"></i></span></div>
            <div class="td-body"></div></div>`);
        $('.td-head', this.root).onclick = (e) => { const t = e.target.closest('[data-t]'); if (t) this.show(t.dataset.t); };
        this.nav.reset(this.root);
        this.show('deck');
    },

    show(t) {
        this.tab = t;
        $$('.td-head [data-t]', this.root).forEach((x) => x.classList.toggle('on', x.dataset.t === t));
        const body = $('.td-body', this.root);
        body.innerHTML = '';
        this[t](body);
    },

    setupPage(sug, first) {
        const me = this.me || {};
        let photo = me.photo || '';
        let gender = me.gender || sug.gender || 'man';
        let interest = me.interest || (gender === 'man' ? 'woman' : 'man');
        const page = UI.page({ title: first ? 'Create profile' : 'Edit profile', back: first ? false : true });
        page.classList.add('tinder-setup');
        page.content.innerHTML = `<div class="td-photo-pick" id="td-photo">${photo ? Media.html(photo) : '<i class="fa-solid fa-camera"></i><span>Add your best photo</span>'}</div>`;
        const form = UI.form([
            { id: 'name', label: 'First name', value: me.name || sug.name || '', max: 30 },
            { id: 'bio', label: 'About me', value: me.bio || '', textarea: true, max: 300, placeholder: 'Coffee, fast cars and sunsets at Del Perro…' },
        ]);
        page.content.appendChild(form);
        const seg = (label, items, val, set) => {
            page.content.appendChild(UI.header(label));
            page.content.appendChild(UI.segmented(items, val, set));
        };
        seg('I AM A', [{ id: 'man', label: 'Man' }, { id: 'woman', label: 'Woman' }, { id: 'other', label: 'Other' }], gender, (v) => { gender = v; });
        seg('SHOW ME', [{ id: 'woman', label: 'Women' }, { id: 'man', label: 'Men' }, { id: 'everyone', label: 'Everyone' }], interest, (v) => { interest = v; });
        const btn = el('<div class="btn-row mt"><div class="btn td-btn">Save</div></div>');
        page.content.appendChild(btn);
        $('#td-photo', page).onclick = async () => {
            const u = await PhotosApp.pick({ title: 'Profile photo', only: 'image' });
            if (u) { photo = u; $('#td-photo', page).innerHTML = Media.html(u); }
        };
        $('.btn', btn).onclick = async () => {
            const v = form.values();
            const r = await dating('save', { arg: { name: v.name, bio: v.bio, gender, interest, photo } });
            if (!r || r.error) return UI.alert({ title: 'Tinder', text: (r && r.error) || 'Could not save.' });
            const d = await dating('me');
            this.me = d && d.profile;
            UI.hud('fa-solid fa-fire-flame-curved', 'Profile saved');
            this.shell();
        };
        return page;
    },

    async deck(body) {
        body.innerHTML = '<div class="td-stack"></div><div class="td-actions"><span class="td-no"><i class="fa-solid fa-xmark"></i></span><span class="td-yes"><i class="fa-solid fa-heart"></i></span></div>';
        const stack = $('.td-stack', body);
        stack.innerHTML = '<div class="td-empty"><div class="td-radar">' + avatarHTML(this.me.name, this.me.photo, 'lg') + '</div><span>Finding people near you…</span></div>';
        this.deckList = listOf(await dating('deck'));
        if (this.tab !== 'deck') return;
        this.paintDeck(stack);
        $('.td-no', body).onclick = () => this.swipeTop(stack, false);
        $('.td-yes', body).onclick = () => this.swipeTop(stack, true);
    },

    paintDeck(stack) {
        stack.innerHTML = '';
        const list = this.deckList.slice(0, 3).reverse();
        if (!list.length) {
            stack.innerHTML = '<div class="td-empty"><div class="td-radar">' + avatarHTML(this.me.name, this.me.photo, 'lg') + '</div><b>No one new around you</b><span>Check back later - new people join every day.</span></div>';
            return;
        }
        list.forEach((p) => {
            const c = el(`<div class="td-card">${Media.html(p.photo)}<div class="td-stamp like">LIKE</div><div class="td-stamp nope">NOPE</div>
                <div class="td-info"><b>${esc(p.name)} <span>${esc(p.age)}</span></b>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}</div></div>`);
            c._p = p;
            stack.appendChild(c);
        });
        this.drag(stack.lastElementChild, stack);
    },

    drag(card, stack) {
        if (!card) return;
        let x0 = null, dx = 0;
        card.addEventListener('pointerdown', (e) => { x0 = e.clientX; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
        card.addEventListener('pointermove', (e) => {
            if (x0 === null) return;
            dx = e.clientX - x0;
            card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
            $('.td-stamp.like', card).style.opacity = clamp(dx / 80, 0, 1);
            $('.td-stamp.nope', card).style.opacity = clamp(-dx / 80, 0, 1);
        });
        card.addEventListener('pointerup', () => {
            if (x0 === null) return;
            x0 = null;
            card.style.transition = '';
            if (Math.abs(dx) > 90) this.swipeTop(stack, dx > 0);
            else { card.style.transform = ''; $$('.td-stamp', card).forEach((s) => { s.style.opacity = 0; }); }
            dx = 0;
        });
    },

    async swipeTop(stack, like) {
        const card = stack.lastElementChild;
        if (!card || !card._p || card._gone) return;
        card._gone = true;
        card.style.transition = 'transform .35s ease, opacity .35s';
        card.style.transform = `translateX(${like ? 140 : -140}%) rotate(${like ? 24 : -24}deg)`;
        card.style.opacity = '0';
        $(`.td-stamp.${like ? 'like' : 'nope'}`, card).style.opacity = 1;
        const p = card._p;
        this.deckList = this.deckList.filter((x) => x.id !== p.id);
        setTimeout(() => this.paintDeck(stack), 330);
        const r = await dating('swipe', { id: p.id, like });
        if (r && r.match) this.matchScreen(r.profile || p);
    },

    matchScreen(p) {
        const ov = el(`<div class="td-match"><h1>It's a Match!</h1><span>You and ${esc(p.name)} have liked each other.</span>
            <div class="td-match-pics">${avatarHTML(this.me.name, this.me.photo, 'lg')}${avatarHTML(p.name, p.photo, 'lg')}</div>
            <div class="btn td-btn" id="td-msg">Send a message</div><div class="btn gray" id="td-keep">Keep swiping</div></div>`);
        $('#app-window').appendChild(ov);
        Sfx.tone([660, 880, 1320], 0.14, 'sine', 0.15);
        $('#td-keep', ov).onclick = () => ov.remove();
        $('#td-msg', ov).onclick = () => { ov.remove(); if (p.phone) Phone.openApp('whatsapp', { number: p.phone, name: p.name }); };
    },

    async matches(body) {
        body.appendChild(UI.loading());
        const list = listOf(await dating('matches'));
        body.innerHTML = '';
        if (!list.length) { body.appendChild(UI.empty('fa-solid fa-heart', 'No matches yet', 'Keep swiping - your matches show up here.')); return; }
        body.appendChild(el('<div class="td-sec">New matches</div>'));
        const row = el(`<div class="td-newm">${list.map((m, i) => `<div data-i="${i}">${avatarHTML(m.name, m.photo, 'lg')}<span>${esc(m.name)}</span></div>`).join('')}</div>`);
        body.appendChild(row);
        body.appendChild(el('<div class="td-sec">Messages</div>'));
        const open = (m) => UI.actions({
            title: `${m.name}, ${m.age}`,
            buttons: [
                { text: 'Send a message', bold: true, onClick: () => (m.phone ? Phone.openApp('whatsapp', { number: m.phone, name: m.name }) : UI.hud('fa-solid fa-circle-info', 'No number')) },
                { text: 'Unmatch', red: true, onClick: async () => { await dating('unmatch', { arg: m.id }); this.show('matches'); } },
            ],
        });
        row.onclick = (e) => { const t = e.target.closest('[data-i]'); if (t) open(list[Number(t.dataset.i)]); };
        list.forEach((m) => {
            const r = el(`<div class="td-mrow">${avatarHTML(m.name, m.photo, 'md')}<div><b>${esc(m.name)}</b><span>${esc(m.bio || 'Say hi 👋')}</span></div><i class="fa-solid fa-comment"></i></div>`);
            r.onclick = () => open(m);
            body.appendChild(r);
        });
    },

    profile(body) {
        const me = this.me || {};
        body.innerHTML = `<div class="td-me">${avatarHTML(me.name, me.photo, 'lg')}<b>${esc(me.name)}, ${esc(me.age)}</b><span>${esc(me.bio || '')}</span></div>`;
        body.appendChild(UI.list([
            { icon: 'fa-solid fa-pen', iconBg: '#fd297b', title: 'Edit profile', onClick: () => this.nav.push(this.setupPage({}, false)) },
            { icon: 'fa-solid fa-eye-slash', iconBg: '#8e8e93', title: 'Show me on Tinder', toggle: { on: Number(me.active) !== 0, onChange: (v) => { me.active = v ? 1 : 0; dating('pause', { arg: v }); } } },
        ]));
        body.appendChild(UI.footer('When this is off, nobody new can see your card. Your matches stay.'));
    },
};
Apps.define('tinder', { open: (nav) => Tinder.open(nav) });
Phone.on('mz:dating:match', (d) => {
    const p = d.profile || {};
    Phone.notify({ app: 'tinder', title: 'Tinder', text: `It's a match with ${p.name || 'someone'}! 🔥` });
    if (S.currentApp === 'tinder' && Tinder.me) Tinder.matchScreen(p);
});

/* ================= 1xBet ================= */
const bet = (fn, extra = {}) => nui('mz:bet', Object.assign({ fn }, extra));
const SPORT_ICON = { football: 'fa-solid fa-futbol', basketball: 'fa-solid fa-basketball', ufc: 'fa-solid fa-hand-fist' };
const Bet = {
    nav: null, page: null, sport: 'all', tab: 'sports', data: null, timer: null,

    open(nav) {
        this.nav = nav;
        this.page = el(`<div class="page xb">
            <div class="xb-head"><b class="xb-logo">1X<span>BET</span></b><div class="xb-bal"><small>Balance</small><b id="xb-bal">—</b></div></div>
            <div class="xb-tabs"><span data-t="sports" class="on">Sports</span><span data-t="mine">My bets</span></div>
            <div class="xb-chips">${[['all', 'fa-solid fa-fire', 'Top'], ['football', SPORT_ICON.football, 'Football'], ['basketball', SPORT_ICON.basketball, 'Basketball'], ['ufc', SPORT_ICON.ufc, 'UFC']].map(([id, ic, l]) => `<span data-s="${id}" class="${id === this.sport ? 'on' : ''}"><i class="${ic}"></i> ${l}</span>`).join('')}</div>
            <div class="scroll xb-list"></div></div>`);
        $('.xb-tabs', this.page).onclick = (e) => { const t = e.target.closest('[data-t]'); if (!t) return; this.tab = t.dataset.t; $$('.xb-tabs span', this.page).forEach((x) => x.classList.toggle('on', x === t)); $('.xb-chips', this.page).classList.toggle('hidden', this.tab !== 'sports'); this.render(); };
        $('.xb-chips', this.page).onclick = (e) => { const t = e.target.closest('[data-s]'); if (!t) return; this.sport = t.dataset.s; $$('.xb-chips span', this.page).forEach((x) => x.classList.toggle('on', x === t)); this.render(); };
        $('.xb-list', this.page).addEventListener('click', (e) => {
            const o = e.target.closest('[data-odd]');
            if (o && !o.classList.contains('locked')) this.slip(Number(o.dataset.m), o.dataset.odd);
        });
        nav.push(this.page, false);
        this.load();
        this.timer = setInterval(() => this.load(), 5000);
    },

    async load() {
        const d = await bet('matches');
        if (!d || !this.page) return;
        this.data = d;
        $('#xb-bal', this.page).textContent = money(d.balance);
        if (this.tab === 'sports') this.render();
    },

    countdown(m) {
        const s = Math.max(0, m.kickoff - m.now);
        return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 60)}:${pad2(s % 60)}`;
    },

    card(m) {
        const live = m.status === 'live', done = m.status === 'finished';
        const locked = m.status !== 'upcoming' || m.kickoff - m.now <= 5;
        const odd = (k, lbl) => (m.odds && m.odds[k] ? `<span class="xb-odd ${locked ? 'locked' : ''} ${done && m.result === k ? 'win' : ''}" data-m="${m.id}" data-odd="${k}"><small>${lbl}</small><b>${locked && !done ? '<i class="fa-solid fa-lock"></i>' : Number(m.odds[k]).toFixed(2)}</b></span>` : '');
        const status = live ? `<span class="xb-live"><i></i>LIVE ${m.sport === 'ufc' ? 'R' + Math.max(1, m.minute) : m.minute + "'"}</span>` : done ? '<span class="xb-ft">FINISHED</span>' : `<span class="xb-time"><i class="fa-regular fa-clock"></i> ${this.countdown(m)}</span>`;
        const showScore = live || done;
        return `<div class="xb-card ${live ? 'is-live' : ''}">
            <div class="xb-card-top"><span><i class="${SPORT_ICON[m.sport]}"></i> ${esc(m.league)}</span>${status}</div>
            <div class="xb-teams"><div><b>${esc(m.home)}</b>${showScore && m.sport !== 'ufc' ? `<em>${m.score[0]}</em>` : ''}</div><div><b>${esc(m.away)}</b>${showScore && m.sport !== 'ufc' ? `<em>${m.score[1]}</em>` : ''}</div></div>
            ${(m.events || []).length ? `<div class="xb-events">${listOf(m.events).slice(-3).map((e) => esc(e)).join(' · ')}</div>` : ''}
            <div class="xb-odds">${odd('home', '1')}${odd('draw', 'X')}${odd('away', '2')}</div></div>`;
    },

    async render() {
        const box = $('.xb-list', this.page);
        if (!box) return;
        if (this.tab === 'mine') return this.mine(box);
        const all = listOf(this.data && this.data.matches).filter((m) => this.sport === 'all' || m.sport === this.sport);
        const sec = (title, list) => (list.length ? `<div class="xb-sec">${title}</div>${list.map((m) => this.card(m)).join('')}` : '');
        const html = sec('<i class="fa-solid fa-circle xb-red"></i> Live', all.filter((m) => m.status === 'live'))
            + sec('Upcoming', all.filter((m) => m.status === 'upcoming'))
            + sec('Results', all.filter((m) => m.status === 'finished'))
            + '<div class="xb-legal">18+ · Bet responsibly. Virtual sports - results are simulated.</div>';
        const top = box.scrollTop;
        box.innerHTML = all.length ? html : UI.loading().outerHTML;
        box.scrollTop = top;
    },

    async mine(box) {
        const rows = listOf(await bet('mine')).filter((r) => r && r.label && r.status);
        if (this.tab !== 'mine') return;
        if (!rows.length) { box.innerHTML = ''; box.appendChild(UI.empty('fa-solid fa-ticket', 'No bets yet', 'Tap any odds to place your first bet.')); return; }
        const won = rows.filter((r) => r.status === 'won').reduce((a, r) => a + Number(r.payout), 0);
        const staked = rows.reduce((a, r) => a + Number(r.stake), 0);
        box.innerHTML = `<div class="xb-summary"><div><small>Staked</small><b>${money(staked)}</b></div><div><small>Won</small><b class="g">${money(won)}</b></div></div>`
            + rows.map((r) => `<div class="xb-bet ${r.status}"><div><b>${esc(r.pick_label)} <span>@ ${Number(r.odds).toFixed(2)}</span></b><small>${esc(r.label)}</small></div>
                <div class="xb-bet-r"><em>${r.status.toUpperCase()}</em><small>${money(r.stake)} → ${r.status === 'won' ? money(r.payout) : r.status === 'refunded' ? 'refund' : money(Math.floor(r.stake * r.odds))}</small></div></div>`).join('');
    },

    slip(id, pick) {
        const m = listOf(this.data && this.data.matches).find((x) => x.id === id);
        if (!m) return;
        const odds = Number(m.odds[pick]);
        const pickLabel = pick === 'home' ? m.home : pick === 'away' ? m.away : 'Draw';
        const min = this.data.min, max = this.data.max;
        UI.sheet({
            title: 'Bet slip', done: 'Place bet', half: true,
            content: (body) => {
                body.innerHTML = `<div class="xb-slip"><small>${esc(m.home)} vs ${esc(m.away)}</small><b>${esc(pickLabel)}</b><div class="xb-slip-odds">${odds.toFixed(2)}</div>
                    <div class="xb-stake"><span>$</span><input id="xb-stake" type="number" min="${min}" max="${max}" value="${Math.max(min, 100)}"></div>
                    <div class="xb-quick">${[50, 100, 500, 1000, 5000].map((v) => `<span data-v="${v}">$${v}</span>`).join('')}</div>
                    <div class="xb-win">Potential win <b id="xb-win"></b></div><small class="text-gray">Min ${money(min)} · Max ${money(max)}</small></div>`;
                const inp = $('#xb-stake', body);
                const upd = () => { $('#xb-win', body).textContent = money(Math.floor((Number(inp.value) || 0) * odds)); };
                inp.addEventListener('input', upd); upd();
                $('.xb-quick', body).onclick = (e) => { const t = e.target.closest('[data-v]'); if (t) { inp.value = t.dataset.v; upd(); } };
            },
            onDone: async (sheet) => {
                const stake = Number($('#xb-stake', sheet).value);
                const r = await bet('place', { match: id, pick, stake });
                if (!r || r.error) { UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Bet failed', 2200); return false; }
                $('#xb-bal', this.page).textContent = money(r.balance);
                UI.hud('fa-solid fa-ticket', `Bet placed · win ${money(r.potential)}`, 1800);
                return true;
            },
        });
    },
};
Apps.define('bet', { open: (nav) => Bet.open(nav), onClose: () => { clearInterval(Bet.timer); Bet.page = null; }, dark: true });

/* ================= DarkChat ================= */
const dark = (fn, extra = {}) => nui('mz:darkchat', Object.assign({ fn }, extra));
const aliasColor = (a) => { let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0; return `hsl(${h % 360},70%,62%)`; };
const DarkChat = {
    nav: null, channel: null, chatPage: null, unread: {},

    channels() { return Store.get('darkchat') || []; },

    open(nav) {
        this.nav = nav;
        const page = el(`<div class="page dc"><div class="dc-head"><i class="fa-solid fa-user-secret"></i> darkchat<small>end-to-end encrypted</small></div>
            <div class="dc-join"><span>#</span><input id="dc-ch" maxlength="24" placeholder="channel name"><div class="dc-go" id="dc-go">JOIN</div></div>
            <div class="scroll dc-list"></div></div>`);
        nav.push(page, false);
        this.listPage = page;
        const join = () => { const v = $('#dc-ch', page).value.trim(); if (v) { $('#dc-ch', page).value = ''; this.join(v); } };
        $('#dc-go', page).onclick = join;
        $('#dc-ch', page).addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
        this.renderList();
    },

    renderList() {
        const box = this.listPage && $('.dc-list', this.listPage);
        if (!box) return;
        const list = this.channels();
        box.innerHTML = list.length ? '' : '<div class="dc-empty">&gt; no channels yet_<br><br>Type a channel name above. Anyone who knows the name can read it.</div>';
        list.forEach((ch) => {
            const r = el(`<div class="dc-row"><b># ${esc(ch)}</b>${this.unread[ch] ? `<span class="dc-badge">${this.unread[ch]}</span>` : ''}<i class="fa-solid fa-chevron-right"></i></div>`);
            r.onclick = () => this.join(ch);
            r.addEventListener('contextmenu', (e) => { e.preventDefault(); this.forget(ch); });
            box.appendChild(r);
        });
    },

    forget(ch) {
        Store.set('darkchat', this.channels().filter((c) => c !== ch));
        dark('leave', { channel: ch });
        this.renderList();
    },

    async join(name) {
        const r = await dark('join', { channel: name });
        if (!r || r.error) return UI.alert({ title: 'DarkChat', text: (r && r.error) || 'Connection failed.' });
        const ch = r.channel;
        if (!this.channels().includes(ch)) Store.set('darkchat', this.channels().concat(ch).slice(-20));
        this.unread[ch] = 0;
        this.renderList();
        this.channel = ch;
        const page = el(`<div class="page dc"><div class="dc-head chat"><span class="dc-back"><i class="fa-solid fa-chevron-left"></i></span><div><b># ${esc(ch)}</b><small>you are <em style="color:${aliasColor(r.alias)}">${esc(r.alias)}</em> · ${r.online} online</small></div><span class="dc-leave"><i class="fa-solid fa-right-from-bracket"></i></span></div>
            <div class="scroll dc-msgs"></div>
            <div class="dc-input"><span>&gt;</span><input maxlength="500" placeholder="type a message…"><div class="dc-go">SEND</div></div></div>`);
        this.chatPage = page;
        page._onPop = () => { this.channel = null; this.chatPage = null; this.renderList(); };
        $('.dc-back', page).onclick = () => this.nav.pop();
        $('.dc-leave', page).onclick = async () => { if (await UI.confirm(`Leave #${ch}?`, 'It is removed from your list.', 'Leave', true)) { this.forget(ch); this.nav.pop(); } };
        const inp = $('.dc-input input', page);
        const send = async () => {
            const v = inp.value.trim(); if (!v) return;
            inp.value = '';
            const m = await dark('send', { channel: ch, message: v });
            if (m && m.id) this.add(m);
        };
        $('.dc-input .dc-go', page).onclick = send;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        this.nav.push(page);
        listOf(r.messages).forEach((m) => this.add(m, true));
        const box = $('.dc-msgs', page); box.scrollTop = box.scrollHeight;
        setTimeout(() => inp.focus(), 400);
    },

    add(m, quiet) {
        const box = this.chatPage && $('.dc-msgs', this.chatPage);
        if (!box) return;
        const d = parseDate(m.created);
        box.appendChild(el(`<div class="dc-msg ${m.mine ? 'mine' : ''}"><span class="dc-alias" style="color:${aliasColor(m.alias)}">${esc(m.alias)}</span><span class="dc-time">${d ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : ''}</span><p>${esc(m.message)}</p></div>`));
        if (!quiet) box.scrollTop = box.scrollHeight;
    },
};
Apps.define('darkchat', { open: (nav) => DarkChat.open(nav), onClose: () => { DarkChat.channel = null; DarkChat.chatPage = null; DarkChat.listPage = null; }, dark: true });
Phone.on('mz:darkchat:msg', (d) => {
    if (S.currentApp === 'darkchat' && DarkChat.channel === d.channel) return DarkChat.add(d.msg);
    DarkChat.unread[d.channel] = (DarkChat.unread[d.channel] || 0) + 1;
    DarkChat.renderList();
    Phone.notify({ app: 'darkchat', title: `#${d.channel}`, text: `${d.msg.alias}: ${String(d.msg.message).slice(0, 80)}` });
});
// rejoin saved channels after loading in, so new messages arrive as notifications
Phone.on('LoadPhoneData', () => setTimeout(() => (Store.get('darkchat') || []).forEach((ch) => dark('join', { channel: ch })), 4000));
