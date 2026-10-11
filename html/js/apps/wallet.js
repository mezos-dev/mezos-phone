/* Wallet — bank balance, transfers and invoices */
'use strict';

const WalletApp = {
    nav: null, page: null, invoices: [],

    balance() { return Number((S.player.money || {}).bank) || 0; },

    open(nav, opts = {}) {
        this.nav = nav;
        this.page = UI.page({ title: 'Wallet', large: true, right: [{ icon: 'fa-solid fa-plus', onClick: () => this.transfer() }] });
        nav.push(this.page, false);
        this.render();
        nui('GetInvoices').then((inv) => { this.invoices = Array.isArray(inv) ? inv : Object.values(inv || {}); this.render(); });
        nui('GetBankContacts').then((c) => { if (Array.isArray(c)) S.contacts = c; });
        if (opts.transfer) setTimeout(() => this.transfer(opts.transfer), 300);
    },
    onReopen(opts) { if (opts.transfer) this.transfer(opts.transfer); },

    render() {
        const ch = S.player.charinfo || {};
        const acc = ch.account || '—';
        const c = this.page.content;
        c.innerHTML = `
        <div class="wallet-card" id="wallet-card">
            <div class="wc-top"><span class="wc-bank"><i class="fa-solid fa-building-columns"></i> Mezos Bank</span><span class="wc-type">DEBIT</span></div>
            <div class="wc-chip"></div>
            <div class="wc-balance-label">Balance</div>
            <div class="wc-balance" id="wc-balance">${money(this.balance())}</div>
            <div class="wc-bottom"><span>${esc((ch.firstname || '') + ' ' + (ch.lastname || ''))}</span><span class="wc-acc">${esc(acc)}</span></div>
        </div>
        <div class="wallet-actions">
            <div class="wa" data-a="transfer"><span><i class="fa-solid fa-arrow-up-right-from-square"></i></span>Send</div>
            <div class="wa" data-a="invoices"><span><i class="fa-solid fa-file-invoice-dollar"></i>${this.invoices.length ? `<b class="badge">${this.invoices.length}</b>` : ''}</span>Bills</div>
            <div class="wa" data-a="copy"><span><i class="fa-solid fa-copy"></i></span>Account</div>
            <div class="wa" data-a="share"><span><i class="fa-solid fa-share-nodes"></i></span>Share</div>
        </div>`;
        $('#wallet-card', c).onclick = () => { copyText(acc); UI.hud('fa-solid fa-copy', 'Account number copied'); };
        $('.wallet-actions', c).addEventListener('click', (e) => {
            const a = e.target.closest('.wa'); if (!a) return;
            if (a.dataset.a === 'transfer') this.transfer();
            else if (a.dataset.a === 'invoices') this.invoicesPage();
            else if (a.dataset.a === 'copy') { copyText(acc); UI.hud('fa-solid fa-copy', 'Account number copied'); }
            else if (a.dataset.a === 'share') { nui('mz:shareContact'); UI.hud('fa-solid fa-tower-broadcast', 'Details shared nearby'); }
        });

        c.appendChild(UI.header('Bills to pay', true));
        if (!this.invoices.length) {
            c.appendChild(UI.list([{ icon: 'fa-solid fa-check', iconBg: 'var(--green)', title: "You're all caught up", sub: 'No open invoices' }]));
        } else {
            c.appendChild(this.invoiceList(this.invoices.slice(0, 3)));
            if (this.invoices.length > 3) {
                const more = UI.list([{ title: `See all ${this.invoices.length} bills`, cls: 'blue', onClick: () => this.invoicesPage() }]);
                more.style.marginTop = '.6rem';
                c.appendChild(more);
            }
        }
        const quick = (S.contacts || []).filter((x) => x.iban && x.iban !== '0' && x.iban !== '').slice(0, 8);
        if (quick.length) {
            c.appendChild(UI.header('Quick send', true));
            const row = el(`<div class="quick-send">${quick.map((q, i) => `<div class="qs" data-i="${i}">${avatarHTML(q.name, null, 'md')}<span>${esc(String(q.name).split(' ')[0])}</span></div>`).join('')}</div>`);
            row.onclick = (e) => { const q = e.target.closest('.qs'); if (q) this.transfer({ iban: quick[Number(q.dataset.i)].iban, name: quick[Number(q.dataset.i)].name }); };
            c.appendChild(row);
        }
    },

    invoiceList(list) {
        const wrap = el('<div class="list"></div>');
        list.forEach((inv) => {
            const row = el(`<div class="row invoice-row">
                <div class="row-icon" style="background:var(--orange)"><i class="fa-solid fa-file-invoice-dollar"></i></div>
                <div class="row-body"><div class="row-title bold">${esc(inv.society || 'Invoice')}</div><div class="row-sub">${esc(inv.reason || ('From ' + (inv.sender || 'unknown')))}</div></div>
                <div class="inv-amount">${money(inv.amount)}</div>
                <div class="inv-btns">${Number(inv.candecline) === 1 || inv.candecline === undefined ? '<span class="inv-no"><i class="fa-solid fa-xmark"></i></span>' : ''}<span class="inv-yes"><i class="fa-solid fa-check"></i></span></div>
            </div>`);
            $('.inv-yes', row).onclick = () => this.pay(inv);
            const no = $('.inv-no', row); if (no) no.onclick = () => this.decline(inv);
            wrap.appendChild(row);
        });
        return wrap;
    },

    invoicesPage() {
        const page = UI.page({ title: 'Bills', back: true, backLabel: 'Wallet' });
        page._fill = () => {
            page.content.innerHTML = '';
            if (!this.invoices.length) page.content.appendChild(UI.empty('fa-solid fa-file-circle-check', 'No Bills', 'You have no open invoices.'));
            else { page.content.appendChild(el('<div style="height:.6rem"></div>')); page.content.appendChild(this.invoiceList(this.invoices)); }
        };
        page._fill();
        this._billsPage = page;
        page._onPop = () => { this._billsPage = null; };
        this.nav.push(page);
    },

    async pay(inv) {
        if (this.balance() < Number(inv.amount)) return UI.alert({ title: 'Insufficient Funds', text: `You need ${money(inv.amount)} to pay this bill.` });
        if (!(await UI.confirm('Pay Bill', `Pay ${money(inv.amount)} to ${inv.society}?`, 'Pay'))) return;
        const ok = await nui('PayInvoice', { sender: inv.sender, amount: inv.amount, society: inv.society, invoiceId: inv.id, senderCitizenId: inv.sendercitizenid });
        if (ok) {
            this.invoices = this.invoices.filter((x) => x.id !== inv.id);
            if (S.player.money) S.player.money.bank = this.balance() - Number(inv.amount);
            UI.hud('fa-solid fa-circle-check', 'Paid');
            this.refresh();
        } else UI.alert({ title: 'Payment Failed', text: "You don't have enough balance." });
    },

    async decline(inv) {
        if (!(await UI.confirm('Decline Bill', `Decline the ${money(inv.amount)} bill from ${inv.society}?`, 'Decline', true))) return;
        const ok = await nui('DeclineInvoice', { sender: inv.sender, amount: inv.amount, society: inv.society, invoiceId: inv.id });
        if (ok === true) {
            this.invoices = this.invoices.filter((x) => x.id !== inv.id);
            UI.hud('fa-solid fa-xmark', 'Declined');
            this.refresh();
        } else UI.alert({ title: 'Wallet', text: "Couldn't decline this invoice." });
    },

    refresh() {
        if (S.currentApp !== 'bank') return;
        this.render();
        if (this._billsPage) this._billsPage._fill();
    },

    transfer(pre = {}) {
        UI.sheet({
            title: 'Send Money', done: 'Send',
            content: (body) => {
                body.appendChild(el(`<div class="center-col" style="padding:1rem 0 .4rem"><div class="send-amount-label">Available</div><div class="send-available">${money(this.balance())}</div></div>`));
                const form = UI.form([
                    { id: 'iban', label: 'To', placeholder: 'Account number', value: pre.iban || '' },
                    { id: 'amount', label: 'Amount', placeholder: '$0', type: 'number' },
                ]);
                body.appendChild(form);
                body._form = form;
                if (pre.name) body.appendChild(UI.footer(`Sending to ${pre.name}`));
                const list = (S.contacts || []).filter((x) => x.iban && x.iban !== '0');
                if (list.length) {
                    body.appendChild(UI.header('Contacts'));
                    body.appendChild(UI.list(list.map((x) => ({ avatar: avatarHTML(x.name, null, 'sm'), title: x.name, sub: x.iban, onClick: () => form.set('iban', x.iban), noChevron: true }))));
                }
            },
            onDone: async (sheet) => {
                const v = sheet.body._form.values();
                const amount = Math.floor(Number(v.amount));
                if (!v.iban || !amount || amount <= 0) { UI.hud('fa-solid fa-triangle-exclamation', 'Fill out all fields'); return false; }
                if (amount > this.balance()) { UI.hud('fa-solid fa-triangle-exclamation', 'Not enough balance'); return false; }
                if (!(await UI.confirm('Confirm Transfer', `Send ${money(amount)} to ${v.iban}?`, 'Send'))) return false;
                const r = await nui('CanTransferMoney', { sendTo: v.iban, amountOf: amount });
                if (r && r.TransferedMoney) {
                    if (S.player.money) S.player.money.bank = r.NewBalance;
                    UI.hud('fa-solid fa-paper-plane', `Sent ${money(amount)}`);
                    this.refresh();
                    return true;
                }
                UI.hud('fa-solid fa-circle-xmark', 'Transfer failed');
                return false;
            },
        });
    },
};

Apps.define('bank', { open: (nav, o) => WalletApp.open(nav, o), onReopen: (o) => WalletApp.onReopen(o) });
Phone.on('UpdateBank', () => { if (S.currentApp === 'bank' && WalletApp.page) { const b = $('#wc-balance'); if (b) b.textContent = money(WalletApp.balance()); } });
