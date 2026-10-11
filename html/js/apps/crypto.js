/* Crypto (Stocks style) — qb-crypto backend */
'use strict';

const CryptoApp = {
    nav: null, page: null, data: null, tx: [],

    open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Crypto', large: true, sub: 'Qbit · QBIT' });
        nav.push(this.page, false);
        this.page.content.appendChild(UI.loading());
        this.load();
    },

    async load() {
        const [d, t] = await Promise.all([nui('GetCryptoData', { crypto: 'qbit' }), nui('GetCryptoTransactions')]);
        this.data = d || { History: [], Portfolio: 0, Worth: 0, WalletId: '-' };
        this.tx = (t && t.CryptoTransactions) ? (Array.isArray(t.CryptoTransactions) ? t.CryptoTransactions : Object.values(t.CryptoTransactions)) : [];
        this.render();
    },

    chart(values, up) {
        if (values.length < 2) values = [values[0] || 0, values[0] || 0];
        const w = 300, h = 120, min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
        const pts = values.map((v, i) => [i / (values.length - 1) * w, h - 10 - ((v - min) / span) * (h - 20)]);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        const col = up ? '#30d158' : '#ff453a';
        return `<svg class="crypto-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
            <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
            <path d="${line} L${w},${h} L0,${h} Z" fill="url(#cg)"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    },

    render() {
        const d = this.data;
        const hist = Array.isArray(d.History) ? d.History : Object.values(d.History || {});
        const values = hist.length ? [Number(hist[0].PreviousWorth)].concat(hist.map((x) => Number(x.NewWorth))) : [Number(d.Worth)];
        const first = values[0] || 1, lastV = Number(d.Worth) || values[values.length - 1];
        const change = ((lastV - first) / first) * 100;
        const up = change >= 0;
        const port = Number(d.Portfolio) || 0;
        const c = this.page.content;
        c.innerHTML = `
            <div class="crypto-head"><div class="crypto-price">${money(lastV)}</div>
                <div class="crypto-change ${up ? 'text-green' : 'text-red'}"><i class="fa-solid fa-caret-${up ? 'up' : 'down'}"></i> ${Math.abs(change).toFixed(2)}% <span class="text-gray">all time</span></div></div>
            ${this.chart(values, up)}
            <div class="crypto-stats">
                <div><small>Holdings</small><b>${port.toFixed(4)}</b></div>
                <div><small>Value</small><b>${money(port * lastV)}</b></div>
                <div><small>Changes</small><b>${hist.length}</b></div>
            </div>
            <div class="btn-row">
                <div class="btn success" id="c-buy"><i class="fa-solid fa-arrow-down"></i>Buy</div>
                <div class="btn danger" id="c-sell"><i class="fa-solid fa-arrow-up"></i>Sell</div>
                <div class="btn tinted" id="c-send"><i class="fa-solid fa-paper-plane"></i>Send</div>
            </div>`;
        $('#c-buy', c).onclick = () => this.trade('buy');
        $('#c-sell', c).onclick = () => this.trade('sell');
        $('#c-send', c).onclick = () => this.send();
        c.appendChild(UI.header('Wallet'));
        c.appendChild(UI.list([{ icon: 'fa-solid fa-wallet', iconBg: '#1c1c1e', title: 'Wallet ID', value: d.WalletId || '-', onClick: () => { copyText(d.WalletId); UI.hud('fa-solid fa-copy', 'Wallet ID copied'); }, noChevron: true }]));
        c.appendChild(UI.header('Activity'));
        if (!this.tx.length) c.appendChild(UI.list([{ title: 'No transactions yet', sub: '' }]));
        else c.appendChild(UI.list(this.tx.slice().reverse().slice(0, 25).map((t) => ({
            icon: 'fa-solid fa-arrow-right-arrow-left', iconBg: 'var(--indigo)', title: t.TransactionTitle || 'Transaction', sub: t.TransactionMessage, wrap: true,
        }))));
        if (hist.length) {
            c.appendChild(UI.header('Price history'));
            c.appendChild(UI.list(hist.slice().reverse().slice(0, 15).map((x) => {
                const p = ((x.NewWorth - x.PreviousWorth) / (x.PreviousWorth || 1)) * 100;
                return { title: `${money(x.PreviousWorth)} → ${money(x.NewWorth)}`, right: `<span class="pill ${p >= 0 ? 'green' : 'red'}">${p >= 0 ? '+' : ''}${p.toFixed(1)}%</span>` };
            })));
        }
    },

    trade(kind) {
        const worth = Number(this.data.Worth) || 0;
        UI.sheet({
            title: kind === 'buy' ? 'Buy Qbit' : 'Sell Qbit', done: kind === 'buy' ? 'Buy' : 'Sell', half: true,
            content: (body) => {
                body.appendChild(el(`<div class="center-col" style="padding:1rem 0"><div class="send-amount-label">1 QBIT = ${money(worth)}</div><div class="send-available" id="ct-total">${money(0)}</div></div>`));
                const form = UI.form([{ id: 'coins', label: 'Amount', placeholder: '0.00', type: 'number', step: '0.01' }]);
                body.appendChild(form);
                body._form = form;
                body.appendChild(UI.footer(kind === 'buy' ? `Bank balance: ${money((S.player.money || {}).bank)}` : `You own ${(Number(this.data.Portfolio) || 0).toFixed(4)} QBIT`));
                $('input', form).addEventListener('input', (e) => { $('#ct-total', body).textContent = money(Math.ceil((Number(e.target.value) || 0) * worth)); });
            },
            onDone: async (sheet) => {
                const coins = Number(sheet.body._form.values().coins);
                if (!coins || coins <= 0) { UI.hud('fa-solid fa-triangle-exclamation', 'Enter an amount'); return false; }
                const price = Math.ceil(coins * worth);
                if (kind === 'buy' && Number((S.player.money || {}).bank) < price) { UI.hud('fa-solid fa-circle-xmark', 'Not enough money'); return false; }
                if (kind === 'sell' && Number(this.data.Portfolio) < coins) { UI.hud('fa-solid fa-circle-xmark', 'Not enough Qbit'); return false; }
                const r = await nui(kind === 'buy' ? 'BuyCrypto' : 'SellCrypto', { Coins: coins, Price: price });
                if (r === false || !r) { UI.hud('fa-solid fa-circle-xmark', 'Transaction failed'); return false; }
                if (S.player.money) S.player.money.bank = Number(S.player.money.bank) + (kind === 'buy' ? -price : price);
                this.data = r;
                this.render();
                UI.hud('fa-solid fa-circle-check', kind === 'buy' ? `Bought ${coins} QBIT` : `Sold ${coins} QBIT`);
                return true;
            },
        });
    },

    send() {
        UI.sheet({
            title: 'Send Qbit', done: 'Send', half: true,
            content: (body) => {
                const form = UI.form([{ id: 'wallet', label: 'Wallet ID', placeholder: 'Receiver wallet' }, { id: 'coins', label: 'Amount', placeholder: '0.00', type: 'number', step: '0.01' }]);
                body.appendChild(el('<div style="height:1rem"></div>'));
                body.appendChild(form);
                body._form = form;
            },
            onDone: async (sheet) => {
                const v = sheet.body._form.values();
                const coins = Number(v.coins);
                if (!v.wallet || !coins || coins <= 0) { UI.hud('fa-solid fa-triangle-exclamation', 'Fill out all fields'); return false; }
                if (v.wallet === this.data.WalletId) { UI.hud('fa-solid fa-circle-xmark', "Can't send to yourself"); return false; }
                if (Number(this.data.Portfolio) < coins) { UI.hud('fa-solid fa-circle-xmark', 'Not enough Qbit'); return false; }
                const r = await nui('TransferCrypto', { Coins: coins, WalletId: v.wallet });
                if (r === 'notenough') { UI.hud('fa-solid fa-circle-xmark', 'Not enough Qbit'); return false; }
                if (r === 'notvalid') { UI.hud('fa-solid fa-circle-xmark', "Wallet doesn't exist"); return false; }
                if (r && typeof r === 'object') { this.data = r; this.render(); }
                UI.hud('fa-solid fa-paper-plane', 'Sent');
                return true;
            },
        });
    },
};

Apps.define('crypto', { open: (nav) => CryptoApp.open(nav), dark: true });
Phone.on('UpdateTransactions', (d) => {
    CryptoApp.tx = Array.isArray(d.CryptoTransactions) ? d.CryptoTransactions : Object.values(d.CryptoTransactions || {});
    if (S.currentApp === 'crypto' && CryptoApp.data) CryptoApp.render();
});
