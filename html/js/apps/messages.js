/* Messages (iMessage style) — uses the qb-phone whatsapp backend */
'use strict';

const Msg = {
    nav: null, listPage: null, chatPage: null, openNumber: null, chats: [],

    dateKey() { const d = new Date(); return `${d.getDate()}-${d.getMonth()}-${d.getFullYear()}`; },
    timeNow() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; },
    dateLabel(key) {
        const p = String(key || '').split('-').map(Number);
        if (p.length !== 3 || p.some(isNaN)) return key;
        const d = new Date(p[2], p[1], p[0]);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return 'Today';
        const y = new Date(now); y.setDate(now.getDate() - 1);
        if (d.toDateString() === y.toDateString()) return 'Yesterday';
        return `${DAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
    },
    last(chat) {
        const groups = Array.isArray(chat.messages) ? chat.messages : Object.values(chat.messages || {});
        const g = groups[groups.length - 1];
        if (!g) return { text: '', time: '' };
        const msgs = Array.isArray(g.messages) ? g.messages : Object.values(g.messages || {});
        const m = msgs[msgs.length - 1] || {};
        const text = m.type === 'location' ? '📍 Location' : m.type === 'picture' ? (Media.isVideo(m.data && m.data.url) ? '🎬 Video' : '📷 Photo') : (m.message || '');
        const lbl = this.dateLabel(g.date);
        return { text, time: lbl === 'Today' ? (m.time || '') : lbl };
    },

    open(nav, opts = {}) {
        this.nav = nav;
        this.listPage = UI.page({
            title: 'Messages', large: true,
            left: [{ text: 'Edit', onClick: () => UI.hud('fa-solid fa-circle-info', 'Swipe chats coming soon') }],
            right: [{ icon: 'fa-solid fa-pen-to-square', onClick: () => this.compose() }],
            search: { placeholder: 'Search', onInput: (v) => this.renderList(v) },
        });
        nav.push(this.listPage, false);
        this.listPage.content.appendChild(UI.loading());
        this.loadList();
        if (opts.number) this.openChat({ number: String(opts.number), name: opts.name || Phone.contactName(opts.number) });
    },
    onReopen(opts) {
        if (opts.number) { this.nav.popToRoot(); this.openChat({ number: String(opts.number), name: opts.name || Phone.contactName(opts.number) }); }
    },
    onClose() { this.openNumber = null; this.chatPage = null; },

    async loadList(chats) {
        if (!chats) chats = await nui('GetWhatsappChats');
        this.chats = Array.isArray(chats) ? chats.filter(Boolean) : Object.values(chats || {});
        this.renderList();
    },

    renderList(q = '') {
        const c = this.listPage.content;
        c.innerHTML = '';
        const list = this.chats.filter((ch) => !q || String(ch.name || '').toLowerCase().includes(q) || String(ch.number).includes(q));
        if (!list.length) {
            c.appendChild(UI.empty('fa-regular fa-comments', q ? 'No Results' : 'No Messages', q ? '' : 'Tap the compose button to start a conversation.'));
            return;
        }
        const wrap = el('<div class="msg-list"></div>');
        list.forEach((ch) => {
            const last = this.last(ch);
            const name = Phone.contactName(ch.number) !== String(ch.number) ? Phone.contactName(ch.number) : (ch.name || ch.number);
            const row = el(`<div class="msg-row">
                ${Number(ch.Unread) > 0 ? '<span class="unread-dot"></span>' : '<span class="unread-dot off"></span>'}
                ${avatarHTML(name, ch.picture, 'md')}
                <div class="msg-row-body">
                    <div class="msg-row-top"><b>${esc(name)}</b><span>${esc(last.time)} <i class="fa-solid fa-chevron-right"></i></span></div>
                    <div class="msg-row-text">${esc(last.text)}</div>
                </div></div>`);
            row.onclick = () => this.openChat({ number: String(ch.number), name, picture: ch.picture, unread: ch.Unread }, ch);
            wrap.appendChild(row);
        });
        c.appendChild(wrap);
    },

    compose() {
        UI.sheet({
            title: 'New Message',
            content: (body, sheet) => {
                const form = UI.form([{ id: 'to', label: 'To:', placeholder: 'Name or number', type: 'text' }]);
                body.appendChild(form);
                const res = el('<div class="mt"></div>');
                body.appendChild(res);
                const inp = $('input', form);
                const render = () => {
                    const v = inp.value.trim().toLowerCase();
                    res.innerHTML = '';
                    const list = (S.contacts || []).filter((c) => !v || (c.name || '').toLowerCase().includes(v) || String(c.number).includes(v));
                    if (/^\d{3,}$/.test(v)) list.unshift({ name: v, number: v, raw: true });
                    if (!list.length) return;
                    res.appendChild(UI.list(list.slice(0, 30).map((c) => ({
                        avatar: avatarHTML(c.name, null, 'sm'), title: c.raw ? `Send to ${c.number}` : c.name, sub: c.raw ? '' : c.number,
                        onClick: () => { sheet.close(); setTimeout(() => this.openChat({ number: String(c.number), name: c.raw ? c.number : c.name }), 200); },
                    }))));
                };
                inp.addEventListener('input', render);
                inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && /^\d{3,}$/.test(inp.value.trim())) { sheet.close(); this.openChat({ number: inp.value.trim(), name: Phone.contactName(inp.value.trim()) }); } });
                render();
                setTimeout(() => inp.focus(), 400);
            },
        });
    },

    async openChat(info, chatData) {
        this.openNumber = info.number;
        const page = el(`<div class="page chat-page">
            <div class="navbar translucent chat-nav">
                <div class="nav-row">
                    <div class="nav-btn" id="chat-back"><i class="fa-solid fa-chevron-left"></i></div>
                    <div class="chat-head" id="chat-head">${avatarHTML(info.name, info.picture, 'sm')}<span>${esc(info.name)} <i class="fa-solid fa-chevron-right"></i></span></div>
                    <div class="nav-actions"><div class="nav-btn" id="chat-call"><i class="fa-solid fa-phone"></i></div></div>
                </div>
            </div>
            <div class="scroll chat-scroll" id="chat-scroll"></div>
            <div class="chat-input">
                <div class="chat-plus" id="chat-plus"><i class="fa-solid fa-plus"></i></div>
                <div class="chat-field"><input id="chat-text" placeholder="iMessage" maxlength="500"><span class="chat-send" id="chat-send"><i class="fa-solid fa-arrow-up"></i></span></div>
            </div></div>`);
        this.chatPage = page;
        page._onPop = () => { this.openNumber = null; this.chatPage = null; this.loadList(); };
        $('#chat-back', page).onclick = () => this.nav.pop();
        $('#chat-call', page).onclick = () => Phone.startCall(info.number, info.name);
        $('#chat-head', page).onclick = () => {
            const c = (S.contacts || []).find((x) => String(x.number) === String(info.number));
            Phone.closeApp(true);
            Phone.openApp('phone', { contact: c || { name: info.number, number: info.number } });
        };
        const input = $('#chat-text', page);
        const send = () => {
            const msg = input.value.trim();
            if (!msg) return;
            this.send('message', msg);
            input.value = '';
        };
        $('#chat-send', page).onclick = send;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        $('#chat-plus', page).onclick = () => UI.actions({
            buttons: [
                { text: 'Share Current Location', onClick: () => this.send('location', 'Shared Location') },
                { text: 'Photo or Video from Library', onClick: () => this.pickPhoto() },
                { text: 'Take Photo', onClick: () => this.takePhoto('photo') },
                { text: 'Record Video', onClick: () => this.takePhoto('video') },
            ],
        });
        this.nav.push(page);
        if (!chatData) chatData = await nui('GetWhatsappChat', { phone: info.number });
        if (chatData && chatData.messages) {
            this.renderChat(chatData);
            if (Number(chatData.Unread || info.unread) > 0) nui('ClearAlerts', { number: info.number });
        } else {
            this.renderChat({ number: info.number, messages: [] });
        }
        if (!info.picture) {
            nui('GetProfilePicture', { number: info.number }).then((pic) => {
                if (pic && pic !== 'default' && this.chatPage === page) {
                    const a = $('#chat-head .avatar', page);
                    if (a) a.outerHTML = avatarHTML(info.name, pic, 'sm');
                }
            });
        }
        setTimeout(() => input.focus(), 450);
    },

    renderChat(chat) {
        if (!this.chatPage) return;
        const box = $('#chat-scroll', this.chatPage);
        const me = S.player.citizenid;
        const groups = Array.isArray(chat.messages) ? chat.messages : Object.values(chat.messages || {});
        if (!groups.length) {
            box.innerHTML = `<div class="chat-empty">${avatarHTML(Phone.contactName(chat.number), null, 'lg')}<b>${esc(Phone.contactName(chat.number))}</b><span>${esc(chat.number)}</span><small>Start your conversation</small></div>`;
            return;
        }
        let html = '';
        groups.forEach((g) => {
            html += `<div class="chat-date">${esc(this.dateLabel(g.date))}</div>`;
            const msgs = Array.isArray(g.messages) ? g.messages : Object.values(g.messages || {});
            msgs.forEach((m, i) => {
                const mine = m.sender === me;
                const next = msgs[i + 1];
                const tail = !next || (next.sender === me) !== mine;
                let inner;
                if (m.type === 'location') {
                    inner = `<div class="bubble loc ${mine ? 'me' : 'them'} ${tail ? 'tail' : ''}" data-x="${esc(m.data && m.data.x)}" data-y="${esc(m.data && m.data.y)}">
                        <div class="loc-map"><span class="loc-pin"><i class="fa-solid fa-location-dot"></i></span></div>
                        <div class="loc-label"><b>Shared Location</b><small>Tap to set GPS · ${esc(m.time)}</small></div></div>`;
                } else if (m.type === 'picture') {
                    const url = String((m.data && m.data.url) || '').replace(/^"|"$/g, '');
                    inner = `<div class="bubble pic ${mine ? 'me' : 'them'}">${Media.html(url, '', { controls: Media.isVideo(url) })}<small>${esc(m.time)}</small></div>`;
                } else {
                    inner = `<div class="bubble ${mine ? 'me' : 'them'} ${tail ? 'tail' : ''}">${esc(m.message)}<small>${esc(m.time)}</small></div>`;
                }
                html += `<div class="bubble-row ${mine ? 'me' : 'them'}">${inner}</div>`;
            });
        });
        box.innerHTML = html + '<div style="height:1rem"></div>';
        $$('.bubble.loc', box).forEach((b) => {
            b.onclick = () => nui('SharedLocation', { coords: { x: Number(b.dataset.x), y: Number(b.dataset.y) } });
        });
        $$('.bubble.pic img', box).forEach((img) => { img.onclick = () => UI.viewImage(img.src); });
        box.scrollTop = box.scrollHeight;
        setTimeout(() => { box.scrollTop = box.scrollHeight; }, 60);
    },

    send(type, message, url) {
        if (!this.openNumber) return;
        const data = { ChatNumber: this.openNumber, ChatDate: this.dateKey(), ChatMessage: message, ChatTime: this.timeNow(), ChatType: type };
        if (url) data.url = url;
        nui('SendMessage', data);
    },

    async pickPhoto() {
        const number = this.openNumber;
        const url = await PhotosApp.pick({ title: 'Photos' });
        if (url && number === this.openNumber) this.send('picture', Media.isVideo(url) ? 'Video' : 'Photo', url);
    },

    takePhoto(purpose = 'photo') {
        const number = this.openNumber;
        const name = Phone.contactName(number);
        Camera.start({
            purpose,
            onResult: (url) => {
                Phone.openApp('whatsapp', { number, name });
                setTimeout(() => {
                    nui('SendMessage', { ChatNumber: number, ChatDate: this.dateKey(), ChatMessage: Media.isVideo(url) ? 'Video' : 'Photo', ChatTime: this.timeNow(), ChatType: 'picture', url });
                }, 600);
            },
        });
    },
};

Apps.define('whatsapp', {
    open: (nav, opts) => Msg.open(nav, opts),
    onReopen: (opts) => Msg.onReopen(opts),
    onClose: () => Msg.onClose(),
});

Phone.on('UpdateChat', (d) => {
    if (S.currentApp !== 'whatsapp') return;
    if (Msg.openNumber && String(Msg.openNumber) === String(d.chatNumber) && d.chatData) {
        Msg.renderChat(d.chatData);
    } else if (Msg.openNumber && d.Chats) {
        const ch = (Array.isArray(d.Chats) ? d.Chats : Object.values(d.Chats)).find((c) => c && String(c.number) === String(Msg.openNumber));
        if (ch) Msg.renderChat(ch);
    } else if (!Msg.openNumber) {
        Msg.loadList(d.Chats);
    }
});
Phone.on('RefreshWhatsappAlerts', (d) => { if (S.currentApp === 'whatsapp' && !Msg.openNumber) Msg.loadList(d.Chats); });
