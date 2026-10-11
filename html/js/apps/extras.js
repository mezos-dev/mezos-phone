/* Radio, Health, Arcade */
'use strict';

/* ================= Radio (GTA stations everywhere + Dynamic Island) ================= */
const Radio = {
    station: null, page: null,

    stationInfo(id) { return (S.stations || []).find((s) => s.id === id); },

    open(nav) {
        this.page = UI.page({ title: 'Radio', large: true });
        nav.push(this.page, false);
        this.render();
    },

    render() {
        if (!this.page) return;
        const c = this.page.content;
        const cur = this.stationInfo(this.station);
        const favs = Store.get('radioFav') || [];
        c.innerHTML = `
            <div class="rd-now ${cur ? 'on' : ''}" style="--c:${cur ? cur.color : '#8e8e93'}">
                <div class="rd-art"><i class="fa-solid fa-radio"></i>${cur ? '<span class="rd-eq"><i></i><i></i><i></i><i></i></span>' : ''}</div>
                <div class="rd-now-body"><small>${cur ? 'NOW PLAYING' : 'NOT PLAYING'}</small><b>${esc(cur ? cur.label : 'Choose a station')}</b><span>${esc(cur ? cur.genre : 'Works on foot and in vehicles')}</span></div>
                <div class="rd-ctrl">
                    <span id="rd-prev"><i class="fa-solid fa-backward"></i></span>
                    <span id="rd-play" class="big"><i class="fa-solid ${cur ? 'fa-stop' : 'fa-play'}"></i></span>
                    <span id="rd-next"><i class="fa-solid fa-forward"></i></span>
                </div>
            </div>
            ${favs.length ? '<div class="section-header">FAVORITES</div>' : ''}
            <div class="rd-grid fav"></div>
            <div class="section-header">ALL STATIONS</div>
            <div class="rd-grid all"></div>`;
        const tile = (s) => {
            const t = el(`<div class="rd-tile ${s.id === this.station ? 'on' : ''}" style="--c:${s.color}"><div class="rd-tile-art"><i class="fa-solid fa-${s.id === this.station ? 'volume-high' : 'radio'}"></i></div><b>${esc(s.label)}</b><span>${esc(s.genre)}</span><i class="fa-${favs.includes(s.id) ? 'solid' : 'regular'} fa-star rd-fav"></i></div>`);
            t.onclick = () => this.play(s.id);
            $('.rd-fav', t).onclick = (e) => {
                e.stopPropagation();
                let f = Store.get('radioFav') || [];
                f = f.includes(s.id) ? f.filter((x) => x !== s.id) : f.concat(s.id);
                Store.set('radioFav', f);
                this.render();
            };
            return t;
        };
        const all = S.stations || [];
        all.filter((s) => favs.includes(s.id)).forEach((s) => $('.rd-grid.fav', c).appendChild(tile(s)));
        all.forEach((s) => $('.rd-grid.all', c).appendChild(tile(s)));
        const step = (d) => {
            if (!all.length) return;
            const i = all.findIndex((s) => s.id === this.station);
            this.play(all[(i + d + all.length) % all.length].id);
        };
        $('#rd-play', c).onclick = () => (this.station ? this.stop() : this.play((all[0] || {}).id));
        $('#rd-prev', c).onclick = () => step(-1);
        $('#rd-next', c).onclick = () => step(1);
    },

    play(id) { if (id) nui('mz:radio', { fn: 'play', id }); },
    stop() { nui('mz:radio', { fn: 'stop' }); },

    island() {
        // Dynamic Island "Live Activity" while music plays and there is no call
        if (S.call && S.call.InCall) return;
        const isl = $('#island');
        const inner = $('.island-inner', isl);
        const cur = this.stationInfo(this.station);
        isl.classList.remove('compact', 'has-content', 'music');
        if (!cur) { inner.innerHTML = ''; return; }
        isl.classList.add('compact', 'has-content', 'music');
        inner.innerHTML = `<div class="isl-left"><span class="isl-art" style="background:${cur.color}"><i class="fa-solid fa-radio"></i></span></div><div class="isl-right"><span class="wave music"><i></i><i></i><i></i><i></i></span></div>`;
    },
};
Apps.define('radio', { open: (nav) => Radio.open(nav), onClose: () => { Radio.page = null; } });
Phone.on('mz:radio', (d) => {
    Radio.station = d.station || null;
    Radio.render();
    Radio.island();
    if (d.station) { const s = Radio.stationInfo(d.station); if (s) UI.hud('fa-solid fa-radio', s.label, 1100); }
});
$('#island').addEventListener('click', () => { if (Radio.station && !(S.call && S.call.InCall) && S.open) Phone.openApp('radio'); });

/* ================= Health ================= */
const Health = {
    open(nav) {
        const page = UI.page({ title: 'Summary', large: true, sub: 'Today' });
        nav.push(page, false);
        this.page = page;
        this.load();
        this.timer = setInterval(() => this.load(), 3000);
    },
    async load() {
        const d = await nui('mz:health');
        if (!d || !this.page) return;
        const c = this.page.content;
        const goal = 6000;
        const pct = clamp(d.steps / goal, 0, 1);
        const ring = (v, color, r) => {
            const C = 2 * Math.PI * r;
            return `<circle cx="60" cy="60" r="${r}" stroke="${color}" stroke-opacity=".22" stroke-width="11" fill="none"/>
                <circle cx="60" cy="60" r="${r}" stroke="${color}" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - clamp(v, 0, 1))}" transform="rotate(-90 60 60)"/>`;
        };
        const hist = listOf(d.history).slice(0, 6).reverse().concat([{ day: 'Today', steps: d.steps }]);
        const max = Math.max(goal, ...hist.map((h) => Number(h.steps) || 0));
        c.innerHTML = `
            <div class="hl-card hl-rings">
                <svg viewBox="0 0 120 120">${ring(pct, '#ff2d55', 52)}${ring(d.health / 100, '#30d158', 38)}${ring((100 - d.stress) / 100, '#0a84ff', 24)}</svg>
                <div class="hl-legend">
                    <div><small style="color:#ff2d55">Steps</small><b>${Number(d.steps).toLocaleString('en-US')}<span>/${goal.toLocaleString('en-US')}</span></b></div>
                    <div><small style="color:#30d158">Health</small><b>${d.health}<span>%</span></b></div>
                    <div><small style="color:#0a84ff">Calm</small><b>${100 - d.stress}<span>%</span></b></div>
                </div>
            </div>
            <div class="hl-grid">
                ${this.tile('fa-solid fa-heart-pulse', '#ff2d55', 'Heart Rate', `${d.health > 0 ? 62 + Math.round(d.stress / 3) + (d.steps % 7) : 0}`, 'BPM')}
                ${this.tile('fa-solid fa-shield-halved', '#5e5ce6', 'Armor', d.armor, '%')}
                ${this.tile('fa-solid fa-burger', '#ff9f0a', 'Food', d.hunger, '%', d.hunger)}
                ${this.tile('fa-solid fa-droplet', '#0a84ff', 'Water', d.thirst, '%', d.thirst)}
                ${this.tile('fa-solid fa-brain', '#bf5af2', 'Stress', d.stress, '%', d.stress, true)}
                ${this.tile('fa-solid fa-person-walking', '#ff375f', 'Distance', d.km, 'km')}
            </div>
            <div class="hl-card"><div class="hl-title"><i class="fa-solid fa-shoe-prints" style="color:#ff2d55"></i> Steps this week</div>
                <div class="hl-bars">${hist.map((h) => `<div><span style="height:${Math.max(4, (Number(h.steps) || 0) / max * 100)}%"></span><small>${esc(h.day === 'Today' ? 'Today' : String(h.day).slice(5))}</small></div>`).join('')}</div></div>
            <div class="hl-card hl-id"><i class="fa-solid fa-staff-snake"></i><div><b>Medical ID</b><span>Blood type ${esc(d.blood)}</span></div></div>
            <div class="section-footer">Steps are counted while you walk with your phone. Food and water come from your character.</div>`;
    },
    tile(icon, color, label, value, unit, bar, invert) {
        return `<div class="hl-tile"><div class="hl-tile-top" style="color:${color}"><i class="${icon}"></i>${label}</div><b>${esc(value)}<span>${unit}</span></b>
            ${bar !== undefined ? `<div class="hl-bar"><i style="width:${clamp(Number(bar), 0, 100)}%;background:${invert ? (bar > 60 ? '#ff3b30' : color) : (bar < 25 ? '#ff3b30' : color)}"></i></div>` : ''}</div>`;
    },
};
Apps.define('health', { open: (nav) => Health.open(nav), onClose: () => { clearInterval(Health.timer); Health.page = null; } });

/* ================= Arcade: Snake + 2048 ================= */
const Arcade = {
    nav: null,
    best(game) { return Number((Store.get('arcade') || {})[game]) || 0; },
    setBest(game, v) {
        const a = Object.assign({}, Store.get('arcade') || {});
        if (v > (Number(a[game]) || 0)) { a[game] = v; Store.set('arcade', a); return true; }
        return false;
    },
    open(nav) {
        this.nav = nav;
        const page = UI.page({ title: 'Arcade', large: true });
        page.content.innerHTML = `
            <div class="ar-card snake" data-g="snake"><i class="fa-solid fa-staff-snake"></i><div><b>Snake</b><span>Best: ${this.best('snake')}</span></div><span class="btn small primary">PLAY</span></div>
            <div class="ar-card g2048" data-g="2048"><b class="ar-2048">2048</b><div><b>2048</b><span>Best: ${this.best('2048')}</span></div><span class="btn small primary">PLAY</span></div>
            <div class="section-footer">Use the arrow keys or swipe on the board.</div>`;
        page.content.onclick = (e) => { const c = e.target.closest('[data-g]'); if (c) (c.dataset.g === 'snake' ? this.snake() : this.g2048()); };
        nav.push(page, false);
    },
    gamePage(title, onKey) {
        const page = UI.page({ title, back: true, backLabel: 'Arcade', cls: 'ar-page' });
        const key = (e) => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (k) { e.preventDefault(); onKey(k); } };
        document.addEventListener('keydown', key);
        let sx = null, sy = null;
        page.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
        page.addEventListener('pointerup', (e) => {
            if (sx === null) return;
            const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
            onKey(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        });
        page._onPop = () => { document.removeEventListener('keydown', key); if (page._stop) page._stop(); };
        this._cleanup = page._onPop;
        return page;
    },

    snake() {
        const N = 16;
        let snake, dir, next, food, score, timer, over;
        const page = this.gamePage('Snake', (k) => {
            const opp = { up: 'down', down: 'up', left: 'right', right: 'left' };
            if (over) return reset();
            if (k !== opp[dir]) next = k;
        });
        page.content.innerHTML = `<div class="ar-score"><span>Score <b id="sn-s">0</b></span><span>Best <b id="sn-b">${this.best('snake')}</b></span></div><canvas class="ar-canvas" width="320" height="320"></canvas><div class="ar-msg" id="sn-msg"></div>`;
        const cv = $('canvas', page); const ctx = cv.getContext('2d'); const cs = 320 / N;
        const place = () => { do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (snake.some((p) => p.x === food.x && p.y === food.y)); };
        const draw = () => {
            ctx.fillStyle = '#10141c'; ctx.fillRect(0, 0, 320, 320);
            ctx.fillStyle = '#ff375f'; ctx.beginPath(); ctx.arc(food.x * cs + cs / 2, food.y * cs + cs / 2, cs / 2.6, 0, Math.PI * 2); ctx.fill();
            snake.forEach((p, i) => { ctx.fillStyle = i === 0 ? '#5df777' : `hsl(${135 - i * 2},70%,${48 - Math.min(i, 20)}%)`; ctx.fillRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2); });
        };
        const step = () => {
            dir = next;
            const h = { x: snake[0].x + (dir === 'right') - (dir === 'left'), y: snake[0].y + (dir === 'down') - (dir === 'up') };
            if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= N || snake.some((p) => p.x === h.x && p.y === h.y)) {
                over = true; clearInterval(timer);
                const rec = this.setBest('snake', score);
                $('#sn-msg', page).innerHTML = `<b>Game over</b><span>${rec ? 'New best score! ' : ''}Press any arrow to play again</span>`;
                $('#sn-b', page).textContent = this.best('snake');
                Sfx.error();
                return;
            }
            snake.unshift(h);
            if (h.x === food.x && h.y === food.y) { score++; $('#sn-s', page).textContent = score; place(); Sfx.tick(); clearInterval(timer); timer = setInterval(step, Math.max(60, 140 - score * 3)); } else snake.pop();
            draw();
        };
        const reset = () => {
            snake = [{ x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }]; dir = next = 'right'; score = 0; over = false;
            $('#sn-s', page).textContent = 0; $('#sn-msg', page).innerHTML = '';
            place(); draw(); clearInterval(timer); timer = setInterval(step, 140);
        };
        page._stop = () => clearInterval(timer);
        this.nav.push(page);
        reset();
    },

    g2048() {
        let grid, score;
        const page = this.gamePage('2048', (k) => move(k));
        page.content.innerHTML = `<div class="ar-score"><span>Score <b id="g-s">0</b></span><span>Best <b id="g-b">${this.best('2048')}</b></span><span class="link" id="g-new">New game</span></div><div class="g-board"></div><div class="ar-msg" id="g-msg"></div>`;
        const board = $('.g-board', page);
        const add = () => {
            const empty = [];
            grid.forEach((r, y) => r.forEach((v, x) => { if (!v) empty.push([x, y]); }));
            if (!empty.length) return;
            const [x, y] = empty[Math.floor(Math.random() * empty.length)];
            grid[y][x] = Math.random() < 0.9 ? 2 : 4;
        };
        const paint = () => {
            board.innerHTML = grid.flat().map((v) => `<div class="g-cell v${Math.min(v, 4096)}">${v || ''}</div>`).join('');
            $('#g-s', page).textContent = score;
        };
        const slide = (row) => {
            const a = row.filter(Boolean);
            for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
            while (a.length < 4) a.push(0);
            return a;
        };
        const move = (k) => {
            const before = JSON.stringify(grid);
            const rot = (g) => g[0].map((_, i) => g.map((r) => r[i]));
            if (k === 'left') grid = grid.map(slide);
            if (k === 'right') grid = grid.map((r) => slide(r.slice().reverse()).reverse());
            if (k === 'up') grid = rot(rot(grid).map(slide));
            if (k === 'down') grid = rot(rot(grid).map((r) => slide(r.slice().reverse()).reverse()));
            if (JSON.stringify(grid) !== before) { add(); Sfx.tick(); }
            paint();
            const canMove = grid.some((r, y) => r.some((v, x) => !v || (r[x + 1] === v) || (grid[y + 1] && grid[y + 1][x] === v)));
            if (!canMove) {
                const rec = this.setBest('2048', score);
                $('#g-msg', page).innerHTML = `<b>No more moves</b><span>${rec ? 'New best score!' : 'Try again'}</span>`;
                $('#g-b', page).textContent = this.best('2048');
            }
        };
        const reset = () => { grid = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; score = 0; add(); add(); $('#g-msg', page).innerHTML = ''; paint(); };
        page._stop = () => this.setBest('2048', score);
        $('#g-new', page).onclick = () => { this.setBest('2048', score); reset(); };
        this.nav.push(page);
        reset();
    },
};
Apps.define('arcade', { open: (nav) => Arcade.open(nav), onClose: () => { if (Arcade._cleanup) Arcade._cleanup(); }, dark: true });
