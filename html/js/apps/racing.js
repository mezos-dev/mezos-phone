/* Racing — qb-lapraces backend */
'use strict';

const RacingApp = {
    nav: null, page: null,

    hms(s) { s = Math.round(Number(s) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}:${pad2(m)}:${pad2(s % 60)}`; },
    inRace(cid, racers) { return Object.keys(racers || {}).includes(cid); },

    open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Racing', large: true, right: [{ icon: 'fa-solid fa-trophy', onClick: () => this.leaderboards() }] });
        nav.push(this.page, false);
        this.load();
    },

    async load() {
        if (!this.page) return;
        const c = this.page.content;
        c.innerHTML = '';
        const actions = el(`<div class="race-actions">
            <div class="ra" id="r-setup"><i class="fa-solid fa-flag"></i><span>Start a Race</span></div>
            <div class="ra" id="r-create"><i class="fa-solid fa-route"></i><span>Create Track</span></div>
        </div>`);
        $('#r-setup', actions).onclick = () => this.setup();
        $('#r-create', actions).onclick = () => this.create();
        c.appendChild(actions);
        c.appendChild(UI.header('Active Races', true));
        const box = el('<div></div>');
        box.appendChild(UI.loading());
        c.appendChild(box);
        const races = await nui('GetAvailableRaces');
        const list = (Array.isArray(races) ? races : Object.values(races || {})).slice().reverse();
        box.innerHTML = '';
        if (!list.length) { box.appendChild(UI.empty('fa-solid fa-flag-checkered', 'No Races', 'Start a race to see it here.')); return; }
        const cid = S.player.citizenid;
        list.forEach((race) => {
            const rd = race.RaceData || {};
            const racers = Object.keys(rd.Racers || {}).length;
            const joined = this.inRace(cid, rd.Racers);
            const creator = race.SetupCitizenId === cid;
            const laps = Number(race.Laps) === 0 ? 'Sprint' : `${race.Laps} Lap${Number(race.Laps) === 1 ? '' : 's'}`;
            const card = el(`<div class="race-card ${rd.Started ? 'started' : ''}">
                <div class="rc-top"><b><i class="fa-solid fa-flag-checkered"></i> ${esc(rd.RaceName || 'Race')}</b><span class="pill ${rd.Started ? 'red' : 'green'}">${rd.Started ? 'Started' : 'Open'}</span></div>
                <div class="rc-meta"><span><i class="fa-solid fa-rotate"></i> ${laps}</span><span><i class="fa-solid fa-road"></i> ${esc(rd.Distance || 0)} m</span><span><i class="fa-solid fa-user"></i> ${racers}</span></div>
                <div class="rc-btns"></div></div>`);
            const btns = $('.rc-btns', card);
            const add = (txt, cls, fn) => { const b = el(`<div class="btn small ${cls}">${txt}</div>`); b.onclick = fn; btns.appendChild(b); };
            if (!joined && !rd.Started) add('<i class="fa-solid fa-right-to-bracket"></i>Join', 'primary', () => this.join(race));
            if (joined && creator && !rd.Started) add('<i class="fa-solid fa-flag-checkered"></i>Start', 'success', () => { nui('StartRace', { RaceData: race }); setTimeout(() => this.load(), 600); });
            if (joined) add('<i class="fa-solid fa-right-from-bracket"></i>Leave', 'danger', () => { nui('LeaveRace', { RaceData: race }); setTimeout(() => this.load(), 600); });
            box.appendChild(card);
        });
    },

    async join(race) {
        if (await nui('IsInRace')) return UI.hud('fa-solid fa-flag', "You're already in a race");
        const near = await nui('RaceDistanceCheck', { RaceId: race.RaceId, Joined: true });
        if (!near) return;
        if (await nui('IsBusyCheck', { check: 'editor' })) return UI.hud('fa-solid fa-route', "You're in the track editor");
        nui('JoinRace', Object.assign({}, race));
        setTimeout(() => this.load(), 600);
    },

    async setup() {
        const tracks = await nui('GetRaces');
        const list = (Array.isArray(tracks) ? tracks : Object.values(tracks || {})).filter((t) => !t.Started && !t.Waiting);
        let selected = null;
        UI.sheet({
            title: 'Start a Race', done: 'Start',
            content: (body) => {
                if (!list.length) { body.appendChild(UI.empty('fa-solid fa-route', 'No Tracks', 'Create a track first.')); return; }
                body.appendChild(UI.header('Track'));
                const info = el('<div class="section-footer" id="track-info">Select a track</div>');
                const lst = UI.list(list.map((t) => ({ title: t.RaceName, right: '<i class="fa-solid fa-check text-blue tick" style="visibility:hidden"></i>', onClick: async (e, row) => {
                    selected = t.RaceId;
                    $$('.tick', body).forEach((x) => { x.style.visibility = 'hidden'; });
                    $('.tick', row).style.visibility = 'visible';
                    const td = await nui('GetTrackData', { RaceId: t.RaceId });
                    if (td) {
                        const cr = td.CreatorData && td.CreatorData.charinfo ? `${td.CreatorData.charinfo.firstname} ${td.CreatorData.charinfo.lastname}` : '-';
                        const wr = td.Records && td.Records.Holder ? `${this.hms(td.Records.Time)} (${td.Records.Holder[0]} ${td.Records.Holder[1]})` : 'N/A';
                        info.textContent = `Distance ${td.Distance} m · Creator ${cr} · Record ${wr}`;
                    }
                }, noChevron: true })));
                body.append(lst, info);
                body.appendChild(UI.header('Laps'));
                const form = UI.form([{ id: 'laps', placeholder: '0 = sprint', type: 'number', value: '1' }]);
                body.appendChild(form);
                body._form = form;
            },
            onDone: async (sheet) => {
                if (!selected) { UI.hud('fa-solid fa-route', 'Select a track'); return false; }
                const laps = (sheet.body._form && sheet.body._form.values().laps) || '';
                if (laps === '') { UI.hud('fa-solid fa-rotate', 'Enter the number of laps'); return false; }
                if (await nui('HasCreatedRace')) { UI.hud('fa-solid fa-flag', 'You already have a race active'); return false; }
                const near = await nui('RaceDistanceCheck', { RaceId: selected, Joined: false });
                if (!near) return false;
                if (!(await nui('CanRaceSetup'))) { UI.hud('fa-solid fa-ban', "Can't set up a race now"); return false; }
                nui('SetupRace', { RaceId: selected, AmountOfLaps: laps });
                setTimeout(() => this.load(), 700);
                return true;
            },
        });
    },

    async create() {
        const auth = await nui('IsAuthorizedToCreateRaces', {});
        if (!auth || !auth.IsAuthorized) return UI.alert({ title: 'Racing', text: "You don't have permission to create tracks." });
        if (auth.IsBusy) return UI.hud('fa-solid fa-route', 'Already creating a track');
        if (await nui('IsBusyCheck', { check: 'race' })) return UI.hud('fa-solid fa-flag', "You're in a race");
        const name = await UI.prompt('New Track', 'Give your track a name', 'Track name');
        if (!name) return;
        const clean = name.replace(/[<>"'`]/g, '').slice(0, 30);
        const r = await nui('IsAuthorizedToCreateRaces', { TrackName: clean });
        if (!r || !r.IsAuthorized) return;
        if (!r.IsNameAvailable) return UI.alert({ title: 'Name taken', text: 'This track name is not available.' });
        nui('StartTrackEditor', { TrackName: clean });
        Phone.hide();
    },

    async leaderboards() {
        const page = UI.page({ title: 'Leaderboards', back: true, backLabel: 'Racing' });
        this.nav.push(page);
        page.content.appendChild(UI.loading());
        const races = await nui('GetRacingLeaderboards');
        const list = (Array.isArray(races) ? races : Object.values(races || {})).filter((r) => r.LastLeaderboard && r.LastLeaderboard.length);
        page.content.innerHTML = '';
        if (!list.length) { page.content.appendChild(UI.empty('fa-solid fa-trophy', 'No Results', 'Finish a race to see results.')); return; }
        page.content.appendChild(el('<div style="height:.6rem"></div>'));
        page.content.appendChild(UI.list(list.map((r) => ({
            icon: 'fa-solid fa-trophy', iconBg: 'var(--yellow)', title: r.RaceName, sub: `${r.LastLeaderboard.length} racers`,
            onClick: () => {
                const p2 = UI.page({ title: r.RaceName, back: true, backLabel: 'Leaderboards' });
                p2.content.appendChild(el('<div style="height:.6rem"></div>'));
                p2.content.appendChild(UI.list(r.LastLeaderboard.map((lb, i) => ({
                    avatar: `<div class="avatar sm" style="background:${['#ffd60a', '#c7c7cc', '#d4924a'][i] || 'var(--fill2)'};color:#000">${lb.BestLap === 'DNF' ? '—' : i + 1}</div>`,
                    title: `${(lb.Holder || [])[0] || ''} ${(lb.Holder || [])[1] || ''}`, value: lb.BestLap === 'DNF' ? 'DNF' : this.hms(lb.BestLap),
                }))));
                this.nav.push(p2);
            },
        }))));
    },
};

Apps.define('racing', { open: (nav) => RacingApp.open(nav), onClose: () => { RacingApp.page = null; } });
Phone.on('UpdateRacingApp', () => { if (S.currentApp === 'racing' && RacingApp.nav && RacingApp.nav.depth === 1) RacingApp.load(); });
