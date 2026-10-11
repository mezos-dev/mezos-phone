/* =========================================================
   mezos-phone — boot + NUI message router
   ========================================================= */
'use strict';

(function boot() {
    /* ---------- DOM wiring ---------- */
    document.addEventListener('click', (e) => {
        const icon = e.target.closest('#home .app-icon, #home .widget, #spotlight .app-icon');
        if (icon && S.open) {
            Phone.openApp(icon.dataset.app);
            return;
        }
        const dot = e.target.closest('#home-dots span');
        if (dot) Phone.goPage(Number(dot.dataset.p));
    });

    $('#home-search').addEventListener('click', () => Phone.openSpotlight());
    $('#home-indicator').addEventListener('click', () => Phone.goHome());
    $$('.sb-hot').forEach((h) => h.addEventListener('click', () => (h.dataset.open === 'nc' ? Phone.toggleNC() : Phone.toggleCC())));
    $('#nc').addEventListener('click', (e) => { if (!e.target.closest('.banner, .nc-clear')) Phone.closePanels(); });
    $('#island').addEventListener('click', () => {
        if (S.open && S.call && S.call.InCall) { Phone.callMinimized = false; Phone.refreshCall(); }
    });

    // Home pages: drag / wheel to switch
    const pages = $('#home-pages');
    let dragX = null, dragged = false;
    pages.addEventListener('pointerdown', (e) => { dragX = e.clientX; dragged = false; });
    window.addEventListener('pointerup', (e) => {
        if (dragX === null) return;
        const dx = e.clientX - dragX;
        if (Math.abs(dx) > 40) { dragged = true; Phone.goPage(Phone.page + (dx < 0 ? 1 : -1)); }
        dragX = null;
    });
    pages.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); dragged = false; } }, true);
    $('#home').addEventListener('wheel', (e) => {
        if (S.currentApp) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 20 || Phone._wheelLock) return;
        Phone._wheelLock = true; setTimeout(() => { Phone._wheelLock = false; }, 450);
        Phone.goPage(Phone.page + (d > 0 ? 1 : -1));
    });

    // Lock screen: swipe up or tap to unlock
    const ls = $('#lockscreen');
    let lsY = null;
    ls.addEventListener('pointerdown', (e) => { lsY = e.clientY; });
    ls.addEventListener('pointerup', (e) => {
        if (lsY === null) return;
        const dy = e.clientY - lsY; lsY = null;
        if (e.target.closest('.lock-round')) return;
        if (dy < -30 || Math.abs(dy) < 8) Phone.unlock();
    });

    // keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if ($('#viewer').classList.contains('show')) { $('#viewer').classList.remove('show'); return; }
            if (S.open) Phone.hide();
        }
    });

    /* ---------- background timers ---------- */
    setInterval(() => Phone.emit('mz:second'), 1000);
    setInterval(() => { if (S.open) Phone.refreshWorld(); }, 30000);

    /* ---------- NUI messages ---------- */
    window.addEventListener('message', (event) => {
        const d = event.data || {};
        switch (d.action) {
            case 'open':
                Store.load().then(() => Phone.show(d));
                break;
            case 'LoadPhoneData':
                S.player = d.PlayerData || S.player;
                S.job = d.PlayerJob || S.job;
                S.meta = (d.PhoneData && d.PhoneData.MetaData) || S.meta;
                S.contacts = (d.PhoneData && d.PhoneData.Contacts) || [];
                S.tweets = (d.PhoneData && d.PhoneData.Tweets) || [];
                S.appsCfg = d.applications || S.appsCfg;
                S.playerId = d.PlayerId;
                S.loaded = true;
                Store.load().then(() => { Phone.applySettings(); Phone.renderHome(); Phone.boot(true); });
                break;
            case 'mz:installed':
                if (typeof d.mediaBase === 'string') Media.base = d.mediaBase;
                if (d.installed) Phone.setInstalled(d.installed);
                break;
            case 'mz:mediaBase':
                Media.base = d.base || '';
                break;
            case 'mz:reset':
                Phone.hide(true);
                S.loaded = false; S.contacts = []; S.notifications = []; S.call = {};
                S.installed = null; Phone._booted = false;
                break;
            case 'mz:forceClose':
                Phone.hide();
                break;
            case 'UpdateTime':
                Phone.setTime(d.InGameTime);
                break;
            case 'PhoneNotification': {
                const n = d.PhoneNotify || (d.NotifyData && { title: d.NotifyData.title, text: d.NotifyData.content, icon: d.NotifyData.icon, color: d.NotifyData.color, timeout: d.NotifyData.timeout });
                if (n) Phone.notify(n);
                break;
            }
            case 'Notification':
                if (d.NotifyData) Phone.notify({ title: d.NotifyData.title, text: d.NotifyData.content, icon: d.NotifyData.icon, color: d.NotifyData.color, timeout: d.NotifyData.timeout });
                break;
            case 'RefreshAppAlerts':
            case 'RefreshAlerts':
                Phone.refreshBadges(d.AppData);
                break;
            case 'UpdateApplications':
                S.job = d.JobData || S.job;
                if (S.player) S.player.job = S.job;
                S.appsCfg = d.applications || S.appsCfg;
                Phone.renderHome();
                break;
            case 'RefreshContacts':
                S.contacts = d.Contacts || [];
                break;
            case 'SetupHomeCall':
                S.call = d.CallData || {};
                Phone.refreshCall();
                break;
            case 'AnswerCall':
                S.call = d.CallData || S.call;
                S.call.CallType = 'ongoing';
                Phone.callMinimized = false;
                Phone.refreshCall();
                break;
            case 'UpdateCallTime':
                S.call = S.call || {};
                S.call.InCall = true;
                S.call.CallType = 'ongoing';
                S.call.CallTime = d.Time;
                if (!S.call.TargetData) S.call.TargetData = { name: d.Name };
                {
                    const st = $('#call-status'); if (st && Phone.callScreenVisible()) st.textContent = Phone.callTime();
                    const r = $('#island .isl-right'); if (r) r.innerHTML = `<span class="isl-green">${Phone.callTime()}</span>`;
                    if (!$('#island').classList.contains('has-content')) Phone.refreshCall();
                }
                break;
            case 'CancelOutgoingCall':
            case 'CancelOngoingCall':
                S.call = { InCall: false };
                Phone.refreshCall();
                break;
            case 'IncomingCallAlert':
                if (!d.Canceled) {
                    S.call = { InCall: true, CallType: 'incoming', AnsweredCall: false, TargetData: Object.assign({}, d.CallData, { anonymous: d.AnonymousCall }) };
                    Phone.refreshCall();
                } else {
                    const name = d.AnonymousCall ? 'Unknown' : ((d.CallData && (d.CallData.name || d.CallData.number)) || 'Unknown');
                    S.call = { InCall: false };
                    Phone.refreshCall();
                    Phone.notify({ app: 'phone', title: 'Missed Call', text: name });
                }
                break;
            case 'UpdateBank':
                if (S.player.money) S.player.money.bank = d.NewBalance;
                break;
            default:
                break;
        }
        Phone.emit(d.action, d);
    });

    // initial paint
    Phone.applyWallpaper();
    Phone.renderHome();
    Phone.renderLock();
})();
