/* Mail */
'use strict';

const MailApp = {
    nav: null, page: null, mails: [],

    open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Inbox', large: true, back: false, search: { placeholder: 'Search', onInput: (v) => this.render(v) } });
        nav.push(this.page, false);
        this.page.content.appendChild(UI.loading());
        nui('GetMails').then((m) => { this.mails = Array.isArray(m) ? m : Object.values(m || {}); this.render(); });
        Phone.clearAlerts('mail');
    },

    render(q = '') {
        const c = this.page.content;
        c.innerHTML = '';
        const list = this.mails.slice().sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0))
            .filter((m) => !q || `${m.sender} ${m.subject} ${m.message}`.toLowerCase().includes(q));
        if (!list.length) { c.appendChild(UI.empty('fa-regular fa-envelope-open', q ? 'No Results' : 'No Mail', q ? '' : 'Your inbox is empty.')); return; }
        const wrap = el('<div class="mail-list"></div>');
        list.forEach((m) => {
            const unread = Number(m.read) === 0 && !m._seen;
            const row = el(`<div class="mail-row">
                <span class="unread-dot ${unread ? '' : 'off'}"></span>
                <div class="mail-row-body">
                    <div class="msg-row-top"><b>${esc(m.sender)}</b><span>${esc(shortDate(m.date))} <i class="fa-solid fa-chevron-right"></i></span></div>
                    <div class="mail-subject">${esc(m.subject || '(No subject)')}</div>
                    <div class="msg-row-text">${esc(String(m.message || '').replace(/<[^>]+>/g, ' '))}</div>
                </div></div>`);
            row.onclick = () => { m._seen = true; this.detail(m); };
            wrap.appendChild(row);
        });
        c.appendChild(wrap);
        c.appendChild(el(`<div class="section-footer" style="text-align:center">${list.length} Mail${list.length === 1 ? '' : 's'}</div>`));
    },

    detail(m) {
        const page = UI.page({
            back: true, backLabel: 'Inbox', bg2: true,
            right: [{ icon: 'fa-solid fa-trash-can', onClick: () => this.remove(m) }],
        });
        const d = parseDate(m.date);
        page.content.innerHTML = `<div class="mail-view">
            <div class="mail-from">${avatarHTML(m.sender, null, 'md')}<div><b>${esc(m.sender)}</b><small>To: Me</small></div><span>${d ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''}</span></div>
            <h2>${esc(m.subject || '(No subject)')}</h2>
            <div class="mail-body">${safeHTML(m.message)}</div>
        </div>`;
        if (m.button) {
            const b = el(`<div class="pad mt"><div class="btn primary block"><i class="fa-solid fa-circle-check"></i>Accept</div></div>`);
            b.firstElementChild.onclick = () => {
                nui('AcceptMailButton', { buttonEvent: m.button.buttonEvent, buttonData: m.button.buttonData, mailId: m.mailid });
                m.button = null;
                UI.hud('fa-solid fa-check', 'Accepted');
                b.remove();
            };
            page.content.appendChild(b);
        }
        this.nav.push(page);
    },

    async remove(m) {
        if (!(await UI.confirm('Delete Mail', 'This mail will be deleted.', 'Delete', true))) return;
        nui('RemoveMail', { mailId: m.mailid });
        this.mails = this.mails.filter((x) => x.mailid !== m.mailid);
        this.nav.pop();
        this.render();
    },
};

Apps.define('mail', { open: (nav) => MailApp.open(nav) });
Phone.on('UpdateMails', (d) => {
    MailApp.mails = Array.isArray(d.Mails) ? d.Mails : Object.values(d.Mails || {});
    if (S.currentApp === 'mail' && MailApp.nav && MailApp.nav.depth === 1) MailApp.render();
});
