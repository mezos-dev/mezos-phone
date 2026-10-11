/* Social apps: Instagram, X, TikTok — shared backend (server/social.lua) */
'use strict';

const social = (app, fn, arg) => nui('mz:social', { app, fn, arg });
const listOf = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
const fmtNum = (n) => { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e4) return Math.round(n / 1e3) + 'K'; if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; return String(n); };
const richText = (t, cls = 'so') => esc(t || '')
    .replace(/#([\w]+)/g, `<span class="${cls}-tag" data-tag="$1">#$1</span>`)
    .replace(/@([\w.]+)/g, `<span class="${cls}-at" data-user="$1">@$1</span>`)
    .replace(/\n/g, '<br>');
const verified = (a) => (Number(a.verified) ? '<i class="fa-solid fa-circle-check so-verified"></i>' : '');

/** base engine shared by the 3 apps */
class SocialApp {
    constructor(id, opts) {
        this.id = id;
        Object.assign(this, opts);
        this.nav = null; this.me = null; this.tab = null; this.view = null; this.tabbar = null;
    }

    async open(nav, opts = {}) {
        this.nav = nav;
        this.pendingCompose = opts.compose || null;
        const loading = el(`<div class="page ${this.cls}"><div class="so-splash">${iconHTML(this.id)}</div></div>`);
        nav.push(loading, false);
        await this.loadMe();
        if (S.currentApp !== this.id) return;
        if (!this.me) return nav.reset(this.signupPage());
        this.buildShell();
        if (this.pendingCompose) { const c = this.pendingCompose; this.pendingCompose = null; setTimeout(() => this.compose(c), 350); }
    }

    onReopen(opts) {
        if (opts && opts.compose && this.me) this.compose(opts.compose);
    }

    async loadMe() {
        const me = await social(this.id, 'me');
        this.me = me && !me.none ? me : null;
        this.suggest = me && me.none ? me : null;
        return this.me;
    }

    /* ---------- sign up ---------- */
    signupPage() {
        const sug = this.suggest || {};
        const page = el(`<div class="page ${this.cls} so-signup">
            <div class="scroll"><div class="so-signup-inner">
                <div class="so-logo">${this.logo}</div>
                <h2>${esc(this.signupTitle)}</h2>
                <p>${esc(this.signupText)}</p>
                <label>Username</label>
                <div class="so-input at"><span>@</span><input id="so-user" maxlength="20" value="${esc(sug.suggest || '')}"></div>
                <label>Name</label>
                <div class="so-input"><input id="so-name" maxlength="40" value="${esc(sug.display || '')}"></div>
                <div class="so-err" id="so-err"></div>
                <div class="btn primary block so-btn" id="so-go">Create account</div>
                <small>By signing up you agree to the ${esc(Phone.label(this.id))} Terms of Service.</small>
            </div></div></div>`);
        $('#so-go', page).onclick = async () => {
            const username = $('#so-user', page).value.trim().replace(/^@/, '');
            const display = $('#so-name', page).value.trim();
            const btn = $('#so-go', page);
            btn.innerHTML = '<i class="fa-solid fa-circle-notch spin"></i>';
            const r = await social(this.id, 'signup', { username, display });
            if (!r || r.error) {
                btn.textContent = 'Create account';
                $('#so-err', page).textContent = (r && r.error) || 'Something went wrong.';
                return;
            }
            await this.loadMe();
            this.buildShell();
            UI.hud('fa-solid fa-circle-check', `Welcome, @${this.me.username}`);
        };
        return page;
    }

    /* ---------- shell with tab bar ---------- */
    buildShell() {
        const root = el(`<div class="page ${this.cls}"></div>`);
        this.view = el('<div class="tab-view"></div>');
        this.tabbar = UI.tabbar(this.tabs(), this.tabs()[0].id, (id) => this.onTab(id));
        this.tabbar.classList.add('so-tabbar');
        root.append(this.view, this.tabbar);
        if (this.fab) {
            const fab = el(`<div class="fab above-tabs so-fab"><i class="${this.fab}"></i></div>`);
            fab.onclick = () => this.compose();
            root.appendChild(fab);
        }
        this.nav.reset(root);
        this.show(this.tabs()[0].id);
        this.updateBadge();
    }

    onTab(id) {
        if (id === 'create') { this.tabbar.select(this.tab); return this.compose(); }
        this.show(id);
    }

    show(id) {
        this.tab = id;
        this.view.innerHTML = '';
        const page = this['tab_' + id]();
        page.style.position = 'absolute';
        this.view.appendChild(page);
    }

    updateBadge() {
        const n = Number(this.me && this.me.unread) || 0;
        const tab = $(`.tab[data-id="activity"]`, this.tabbar);
        if (!tab) return;
        let b = $('.badge', tab);
        if (n > 0) { if (!b) { b = el('<span class="badge"></span>'); tab.appendChild(b); } b.textContent = n > 99 ? '99+' : n; } else if (b) b.remove();
    }

    /* ---------- shared actions ---------- */
    async like(post, node) {
        const r = await social(this.id, 'like', post.id);
        if (!r) return;
        post.liked = r.liked; post.likes = r.likes;
        if (node) this.paintLike(post, node);
    }

    async remove(post, node) {
        if (!(await UI.confirm('Delete post?', 'This can’t be undone.', 'Delete', true))) return;
        const ok = await social(this.id, 'delete', post.id);
        if (ok) { if (node) node.remove(); UI.hud('fa-solid fa-trash-can', 'Deleted'); }
    }

    async follow(username, btn) {
        const r = await social(this.id, 'follow', username);
        if (!r) return null;
        if (btn) { btn.classList.toggle('following', r.following); btn.textContent = r.following ? 'Following' : 'Follow'; }
        return r;
    }

    bindText(node) {
        $$('[data-tag]', node).forEach((t) => { t.onclick = (e) => { e.stopPropagation(); this.hashtag(t.dataset.tag); }; });
        $$('[data-user]', node).forEach((t) => { t.onclick = (e) => { e.stopPropagation(); this.profile(t.dataset.user); }; });
    }

    hashtag(tag) {
        const page = UI.page({ title: '#' + tag, back: true });
        page.content.appendChild(UI.loading());
        social(this.id, 'feed', { hashtag: tag }).then((rows) => {
            page.content.innerHTML = '';
            const list = listOf(rows);
            if (!list.length) return page.content.appendChild(UI.empty('fa-solid fa-hashtag', 'No posts', ''));
            this.renderList(page.content, list);
        });
        this.nav.push(page);
    }

    /** comments / replies sheet (Instagram + TikTok) */
    comments(post, onCount) {
        UI.sheet({
            title: 'Comments', cancel: 'Close',
            content: async (body, sheet) => {
                const box = el('<div class="so-comments"></div>');
                const bar = el(`<div class="so-comment-bar">${avatarHTML(this.me.display, this.me.avatar, 'sm')}<input placeholder="Add a comment…" maxlength="300"><span class="so-send">Post</span></div>`);
                body.append(box, bar);
                const load = async () => {
                    box.innerHTML = UI.loading().outerHTML;
                    const t = await social(this.id, 'thread', post.id);
                    const reps = t ? listOf(t.replies) : [];
                    box.innerHTML = reps.length ? '' : '<div class="so-nocomments"><b>No comments yet</b><span>Start the conversation.</span></div>';
                    reps.forEach((c) => {
                        const n = el(`<div class="so-comment">${avatarHTML(c.display, c.avatar, 'sm')}<div><div><b data-user="${esc(c.username)}">${esc(c.username)}</b> <small>${esc(timeAgo(c.created))}</small></div><p>${richText(c.content)}</p></div>
                            <span class="so-c-like ${c.liked ? 'on' : ''}"><i class="fa-${c.liked ? 'solid' : 'regular'} fa-heart"></i><small>${c.likes ? fmtNum(c.likes) : ''}</small></span></div>`);
                        $('.so-c-like', n).onclick = async (e) => {
                            const r = await social(this.id, 'like', c.id);
                            if (!r) return;
                            e.currentTarget.classList.toggle('on', r.liked);
                            e.currentTarget.innerHTML = `<i class="fa-${r.liked ? 'solid' : 'regular'} fa-heart"></i><small>${r.likes ? fmtNum(r.likes) : ''}</small>`;
                        };
                        if (c.mine) n.addEventListener('contextmenu', (e) => { e.preventDefault(); this.remove(c, n); });
                        this.bindText(n);
                        $$('[data-user]', n).forEach((u) => { u.onclick = () => { sheet.close(); this.profile(u.dataset.user); }; });
                        box.appendChild(n);
                    });
                    if (onCount) onCount(reps.length);
                };
                const inp = $('input', bar);
                const send = async () => {
                    const v = inp.value.trim(); if (!v) return;
                    inp.value = '';
                    const r = await social(this.id, 'post', { content: v, replyTo: post.id });
                    if (!r || r.error) return UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Failed');
                    load();
                };
                $('.so-send', bar).onclick = send;
                inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
                load();
            },
        });
    }

    /* ---------- profile ---------- */
    async profile(username) {
        const page = el(`<div class="page ${this.cls} so-profile-page"></div>`);
        const head = el(`<div class="navbar"><div class="nav-row"><div class="nav-btn so-back"><i class="fa-solid fa-chevron-left"></i></div><div class="nav-title">${esc(username)}</div><div class="nav-actions"></div></div></div>`);
        const body = el('<div class="scroll"></div>');
        page.append(head, body);
        $('.so-back', head).onclick = () => this.nav.pop();
        body.appendChild(UI.loading());
        this.nav.push(page);
        const d = await social(this.id, 'profile', username);
        body.innerHTML = '';
        if (!d || !d.account) { body.appendChild(UI.empty('fa-solid fa-user-slash', 'This account doesn’t exist', 'Try searching for another.')); return; }
        this.renderProfile(body, d.account, listOf(d.posts), page);
    }

    editProfile(acc, done) {
        let avatar = acc.avatar || '';
        UI.sheet({
            title: 'Edit profile', done: 'Done',
            content: (body) => {
                body.innerHTML = `<div class="so-edit-av">${avatarHTML(acc.display, avatar, 'lg')}<span class="link" id="so-av">Change photo</span></div>`;
                const form = UI.form([
                    { id: 'display', label: 'Name', value: acc.display, max: 40 },
                    { id: 'bio', label: 'Bio', value: acc.bio || '', textarea: true, max: 160 },
                ]);
                body.appendChild(form);
                $('#so-av', body).onclick = async () => {
                    const url = await PhotosApp.pick({ title: 'Profile photo', only: 'image' });
                    if (!url) return;
                    avatar = url;
                    $('.so-edit-av .avatar', body).outerHTML = avatarHTML(acc.display, avatar, 'lg');
                };
                body._form = form;
            },
            onDone: async (sheet) => {
                const v = sheet.body._form.values();
                const ok = await social(this.id, 'updateProfile', { display: v.display, bio: v.bio, avatar });
                if (!ok) { UI.hud('fa-solid fa-triangle-exclamation', 'Could not save'); return false; }
                await this.loadMe();
                if (done) done();
                return true;
            },
        });
    }

    /* ---------- compose (photo / video picker + caption) ---------- */
    async pickMedia(only) {
        return PhotosApp.pick({
            title: only === 'video' ? 'Choose video' : 'Choose photo', only,
            onCamera: () => Camera.start({ purpose: 'photo', onResult: (url) => Phone.openApp(this.id, { compose: url }) }),
        });
    }

    async publish(data) {
        const r = await social(this.id, 'post', data);
        if (!r || r.error) { UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Could not post'); return false; }
        if (this.me) this.me.posts = (Number(this.me.posts) || 0) + 1;
        UI.hud('fa-solid fa-circle-check', 'Posted');
        if (S.currentApp === this.id && this.nav && this.view) { this.nav.popToRoot(); this.show(this.tabs()[0].id); this.tabbar.select(this.tabs()[0].id); }
        return true;
    }

    /* ---------- notifications ---------- */
    async renderActivity(box) {
        box.appendChild(UI.loading());
        const rows = listOf(await social(this.id, 'notifications'));
        box.innerHTML = '';
        if (this.me) { this.me.unread = 0; this.updateBadge(); }
        if (!rows.length) { box.appendChild(UI.empty('fa-regular fa-bell', 'No activity yet', 'Likes, comments, follows and mentions show up here.')); return; }
        const words = { like: 'liked your post.', reply: this.id === 'x' ? 'replied to your post.' : 'commented on your post.', follow: 'started following you.', mention: 'mentioned you.', repost: 'reposted your post.' };
        const icons = { like: 'fa-solid fa-heart', reply: 'fa-solid fa-comment', follow: 'fa-solid fa-user-plus', mention: 'fa-solid fa-at', repost: 'fa-solid fa-retweet' };
        rows.forEach((n) => {
            const row = el(`<div class="so-notif">
                <span class="so-n-ic ${n.type}"><i class="${icons[n.type] || 'fa-solid fa-bell'}"></i></span>
                ${avatarHTML(n.display || n.username, n.avatar, 'sm')}
                <div class="so-n-body"><b>${esc(n.username || 'someone')}</b> ${esc(words[n.type] || '')} <small>${esc(timeAgo(n.created))}</small>${n.content && n.type !== 'like' ? `<p>${esc(String(n.content).slice(0, 80))}</p>` : ''}</div>
                ${n.media ? `<div class="so-n-media">${Media.html(n.media)}</div>` : ''}</div>`);
            row.onclick = () => { if (n.type === 'follow') this.profile(n.username); else if (n.post_id) this.openPost(n.post_id); };
            box.appendChild(row);
        });
    }

    async openPost(id) {
        const t = await social(this.id, 'thread', id);
        if (!t || !t.post) return UI.hud('fa-solid fa-circle-info', 'This post was deleted');
        this.postPage(t.post, listOf(t.replies));
    }
}

/* =================================================================
   Instagram
   ================================================================= */
const Instagram = new SocialApp('instagram', {
    cls: 'ig',
    logo: '<span class="ig-wordmark">Instagram</span>',
    signupTitle: 'Sign up for Instagram',
    signupText: 'Share photos with the people of Los Santos.',
    tabs: () => [
        { id: 'home', icon: 'fa-solid fa-house', label: '' },
        { id: 'explore', icon: 'fa-solid fa-magnifying-glass', label: '' },
        { id: 'create', icon: 'fa-regular fa-square-plus', label: '' },
        { id: 'activity', icon: 'fa-regular fa-heart', label: '' },
        { id: 'me', icon: 'fa-regular fa-circle-user', label: '' },
    ],

    tab_home() {
        const page = UI.page({ title: '', tabbar: true, right: [{ icon: 'fa-regular fa-paper-plane', onClick: () => Phone.openApp('whatsapp') }] });
        $('.nav-title', page).innerHTML = '<span class="ig-wordmark sm">Instagram</span>';
        $('.nav-title', page).style.textAlign = 'left';
        this.homePage = page;
        this.loadFeed(page.content);
        return page;
    },

    async loadFeed(box, before) {
        if (!before) { box.innerHTML = ''; box.appendChild(UI.loading()); }
        const rows = listOf(await social(this.id, 'feed', { before }));
        if (!before) box.innerHTML = '';
        if (!before) box.appendChild(this.storiesBar());
        if (!rows.length && !before) { box.appendChild(UI.empty('fa-brands fa-instagram', 'Welcome to Instagram', 'When people post photos, they’ll appear here.')); return; }
        rows.forEach((p) => box.appendChild(this.card(p)));
        if (rows.length >= 25) {
            const more = el('<div class="so-more">Load more</div>');
            more.onclick = () => { more.remove(); this.loadFeed(box, rows[rows.length - 1].id); };
            box.appendChild(more);
        }
    },

    storiesBar() {
        const bar = el(`<div class="ig-stories"><div class="ig-story me">${avatarHTML(this.me.display, this.me.avatar, 'md')}<span>Your story</span><b>+</b></div></div>`);
        $('.ig-story.me', bar).onclick = () => this.compose();
        social(this.id, 'trends').then((d) => {
            listOf(d && d.accounts).filter((a) => a.username !== this.me.username).slice(0, 8).forEach((a) => {
                const s = el(`<div class="ig-story">${avatarHTML(a.display, a.avatar, 'md')}<span>${esc(a.username)}</span></div>`);
                s.onclick = () => this.profile(a.username);
                bar.appendChild(s);
            });
        });
        return bar;
    },

    card(p) {
        const c = el(`<div class="ig-post">
            <div class="ig-head" data-user="${esc(p.username)}">${avatarHTML(p.display, p.avatar, 'sm')}<b>${esc(p.username)}</b>${verified(p)}<i class="fa-solid fa-ellipsis ig-more"></i></div>
            <div class="ig-media">${p.media ? Media.html(p.media, '', { autoplay: true }) : ''}<i class="fa-solid fa-heart ig-burst"></i></div>
            <div class="ig-actions"><span class="ig-like"></span><span class="ig-com"><i class="fa-regular fa-comment"></i></span><span class="ig-share"><i class="fa-regular fa-paper-plane"></i></span><span class="ig-save"><i class="fa-regular fa-bookmark"></i></span></div>
            <div class="ig-likes"></div>
            ${p.content ? `<div class="ig-cap"><b data-user="${esc(p.username)}">${esc(p.username)}</b> ${richText(p.content, 'ig')}</div>` : ''}
            ${Number(p.replies) ? `<div class="ig-viewc">View all ${fmtNum(p.replies)} comments</div>` : ''}
            <div class="ig-time">${esc(timeAgo(p.created))}</div></div>`);
        this.paintLike(p, c);
        $('.ig-head', c).onclick = () => this.profile(p.username);
        $('.ig-like', c).onclick = () => this.like(p, c);
        let lastTap = 0;
        $('.ig-media', c).onclick = () => {
            const now = Date.now();
            if (now - lastTap < 350) {
                const b = $('.ig-burst', c); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
                if (!p.liked) this.like(p, c);
            }
            lastTap = now;
        };
        const openC = () => this.comments(p, (n) => { p.replies = n; });
        $('.ig-com', c).onclick = openC;
        const vc = $('.ig-viewc', c); if (vc) vc.onclick = openC;
        $('.ig-share', c).onclick = () => { if (p.media) { copyText(Media.url(p.media)); UI.hud('fa-solid fa-link', 'Link copied'); } };
        const sv = $('.ig-save', c); sv.onclick = () => { sv.innerHTML = '<i class="fa-solid fa-bookmark"></i>'; UI.hud('fa-solid fa-bookmark', 'Saved'); };
        $('.ig-more', c).onclick = (e) => {
            e.stopPropagation();
            const btns = [];
            if (p.mine) btns.push({ text: 'Delete', red: true, onClick: () => this.remove(p, c) });
            btns.push({ text: 'Go to profile', onClick: () => this.profile(p.username) });
            if (p.media) btns.push({ text: 'Copy link', onClick: () => { copyText(Media.url(p.media)); UI.hud('fa-solid fa-link', 'Link copied'); } });
            UI.actions({ buttons: btns });
        };
        this.bindText(c);
        return c;
    },

    paintLike(p, c) {
        const l = $('.ig-like', c);
        if (l) { l.className = `ig-like ${p.liked ? 'on' : ''}`; l.innerHTML = `<i class="fa-${p.liked ? 'solid' : 'regular'} fa-heart"></i>`; }
        const n = $('.ig-likes', c);
        if (n) n.textContent = Number(p.likes) ? `${fmtNum(p.likes)} like${Number(p.likes) === 1 ? '' : 's'}` : 'Be the first to like this';
    },

    renderList(box, list) {
        const grid = el(`<div class="ig-grid">${list.map((p, i) => `<div data-i="${i}">${p.media ? Media.html(p.media) : ''}${Media.isVideo(p.media) ? '<i class="fa-solid fa-clapperboard"></i>' : ''}</div>`).join('')}</div>`);
        grid.onclick = (e) => { const t = e.target.closest('[data-i]'); if (t) this.postPage(list[Number(t.dataset.i)]); };
        box.appendChild(grid);
    },

    postPage(p) {
        const page = UI.page({ title: 'Post', back: true });
        page.content.appendChild(this.card(p));
        this.nav.push(page);
    },

    tab_explore() {
        const res = el('<div></div>');
        const page = UI.page({
            title: 'Search', tabbar: true,
            search: {
                placeholder: 'Search', onInput: async (q) => {
                    res.innerHTML = '';
                    if (!q) return this.exploreGrid(res);
                    const d = await social(this.id, 'search', q);
                    const accs = listOf(d && d.accounts);
                    if (accs.length) res.appendChild(UI.list(accs.map((a) => ({ avatar: avatarHTML(a.display, a.avatar, 'sm'), title: a.username, sub: a.display, onClick: () => this.profile(a.username) }))));
                    else res.appendChild(UI.empty('fa-solid fa-magnifying-glass', 'No results', ''));
                },
            },
        });
        page.content.appendChild(res);
        this.exploreGrid(res);
        return page;
    },

    async exploreGrid(box) {
        box.appendChild(UI.loading());
        const rows = listOf(await social(this.id, 'feed', {}));
        box.innerHTML = '';
        if (!rows.length) return box.appendChild(UI.empty('fa-regular fa-compass', 'Nothing to explore yet', ''));
        this.renderList(box, rows);
    },

    tab_activity() {
        const page = UI.page({ title: 'Notifications', large: true, tabbar: true });
        this.renderActivity(page.content);
        return page;
    },

    tab_me() {
        const page = el(`<div class="page ig so-profile-page"><div class="navbar"><div class="nav-row"><div class="nav-left"></div><div class="nav-title">${esc(this.me.username)}</div><div class="nav-actions"></div></div></div><div class="scroll with-tabbar"></div></div>`);
        const body = $('.scroll', page);
        body.appendChild(UI.loading());
        social(this.id, 'profile', this.me.username).then((d) => {
            body.innerHTML = '';
            if (d && d.account) this.renderProfile(body, d.account, listOf(d.posts), page);
        });
        return page;
    },

    renderProfile(body, a, posts) {
        const top = el(`<div class="ig-prof">
            <div class="ig-prof-top">${avatarHTML(a.display, a.avatar, 'lg')}
                <div class="ig-counts"><div><b>${fmtNum(a.postCount)}</b><span>posts</span></div><div><b class="fc">${fmtNum(a.followers)}</b><span>followers</span></div><div><b>${fmtNum(a.following)}</b><span>following</span></div></div></div>
            <div class="ig-prof-name">${esc(a.display)} ${verified(a)}</div>
            ${a.bio ? `<div class="ig-prof-bio">${richText(a.bio, 'ig')}</div>` : ''}
            <div class="ig-prof-btns">${a.mine ? '<div class="btn gray small" id="ig-edit">Edit profile</div><div class="btn gray small" id="ig-share">Share profile</div>'
                : `<div class="btn small ${a.isFollowing ? 'gray following' : 'primary'}" id="ig-follow">${a.isFollowing ? 'Following' : 'Follow'}</div><div class="btn gray small" id="ig-msg">Message</div>`}</div></div>`);
        body.appendChild(top);
        const ed = $('#ig-edit', top); if (ed) ed.onclick = () => this.editProfile(a, () => { if (this.tab === 'me' && this.nav.depth === 1) this.show('me'); });
        const sh = $('#ig-share', top); if (sh) sh.onclick = () => { copyText('@' + a.username); UI.hud('fa-solid fa-copy', 'Username copied'); };
        const fo = $('#ig-follow', top);
        if (fo) fo.onclick = async () => { const r = await this.follow(a.username, fo); if (r) { fo.classList.toggle('primary', !r.following); fo.classList.toggle('gray', r.following); $('.fc', top).textContent = fmtNum(r.followers); } };
        const ms = $('#ig-msg', top);
        if (ms) ms.onclick = () => (a.phone ? Phone.openApp('whatsapp', { number: a.phone, name: a.display }) : UI.hud('fa-solid fa-circle-info', `${a.display} is offline`));
        this.bindText(top);
        body.appendChild(el('<div class="ig-tabs"><i class="fa-solid fa-table-cells on"></i><i class="fa-regular fa-id-badge"></i></div>'));
        if (!posts.length) body.appendChild(UI.empty('fa-solid fa-camera', a.mine ? 'Share photos' : 'No posts yet', a.mine ? 'When you share photos, they will appear on your profile.' : ''));
        else this.renderList(body, posts);
    },

    async compose(media) {
        if (!media) media = await this.pickMedia();
        if (!media) return;
        UI.sheet({
            title: 'New post', done: 'Share',
            content: (body) => {
                body.innerHTML = `<div class="ig-compose"><div class="ig-compose-media">${Media.html(media, '', { autoplay: true })}</div><textarea id="ig-cap" maxlength="2200" placeholder="Write a caption…"></textarea></div>`;
            },
            onDone: (sheet) => this.publish({ content: $('#ig-cap', sheet).value, media }),
        });
    },
});

/* =================================================================
   X
   ================================================================= */
const XApp = new SocialApp('x', {
    cls: 'xa',
    fab: 'fa-solid fa-plus',
    logo: '<i class="fa-brands fa-x-twitter"></i>',
    signupTitle: 'Happening now',
    signupText: 'Join X today and see what Los Santos is talking about.',
    feedTab: 'foryou',
    tabs: () => [
        { id: 'home', icon: 'fa-solid fa-house', label: '' },
        { id: 'explore', icon: 'fa-solid fa-magnifying-glass', label: '' },
        { id: 'activity', icon: 'fa-regular fa-bell', label: '' },
        { id: 'me', icon: 'fa-regular fa-user', label: '' },
    ],

    tab_home() {
        const page = UI.page({ title: '', tabbar: true });
        $('.nav-title', page).innerHTML = '<i class="fa-brands fa-x-twitter" style="font-size:1.5rem"></i>';
        $('.nav-left', page).innerHTML = avatarHTML(this.me.display, this.me.avatar, 'sm');
        $('.nav-left .avatar', page).onclick = () => this.profile(this.me.username);
        const seg = el(`<div class="xa-seg"><span data-t="foryou" class="${this.feedTab === 'foryou' ? 'on' : ''}">For you</span><span data-t="following" class="${this.feedTab === 'following' ? 'on' : ''}">Following</span></div>`);
        page.nav.appendChild(seg);
        const box = el('<div></div>');
        page.content.appendChild(box);
        seg.onclick = (e) => {
            const t = e.target.closest('[data-t]'); if (!t) return;
            this.feedTab = t.dataset.t;
            $$('span', seg).forEach((x) => x.classList.toggle('on', x === t));
            this.loadFeed(box);
        };
        this.homeBox = box;
        this.loadFeed(box);
        return page;
    },

    async loadFeed(box, before) {
        if (!before) { box.innerHTML = ''; box.appendChild(UI.loading()); }
        const rows = listOf(await social(this.id, 'feed', { tab: this.feedTab, before }));
        if (!before) box.innerHTML = '';
        if (!rows.length && !before) {
            box.appendChild(UI.empty('fa-brands fa-x-twitter', this.feedTab === 'following' ? 'Follow some accounts' : 'Nothing to see here — yet', 'Tap + to post something.'));
            return;
        }
        this.renderList(box, rows);
        if (rows.length >= 25) {
            const more = el('<div class="so-more">Show more</div>');
            more.onclick = () => { more.remove(); this.loadFeed(box, rows[rows.length - 1].id); };
            box.appendChild(more);
        }
    },

    renderList(box, list) { list.forEach((p) => box.appendChild(this.card(p))); },

    card(p, opts = {}) {
        const repostBy = p.repost_of && !p.content ? p : null;
        const quote = p.repost_of && p.content ? p.original : null;
        const post = repostBy ? (p.original || p) : p;
        if (!post) return el('<div></div>');
        const c = el(`<div class="xa-post ${opts.big ? 'big' : ''}">
            ${repostBy ? `<div class="xa-rt"><i class="fa-solid fa-retweet"></i> ${esc(repostBy.display)} reposted</div>` : ''}
            <div class="xa-row">${avatarHTML(post.display, post.avatar, 'md')}
            <div class="xa-body">
                <div class="xa-head"><b data-user="${esc(post.username)}">${esc(post.display)}</b>${verified(post)}<span>@${esc(post.username)} · ${esc(timeAgo(post.created))}</span><i class="fa-solid fa-ellipsis xa-more"></i></div>
                ${post.content ? `<div class="xa-text">${richText(post.content, 'xa')}</div>` : ''}
                ${post.media ? `<div class="xa-media">${Media.html(post.media, '', { controls: Media.isVideo(post.media) })}</div>` : ''}
                ${quote ? `<div class="xa-quote"><div class="xa-head"><b>${esc(quote.display)}</b><span>@${esc(quote.username)}</span></div><div class="xa-text">${richText(quote.content || '', 'xa')}</div>${quote.media ? `<div class="xa-media">${Media.html(quote.media)}</div>` : ''}</div>` : ''}
                <div class="xa-actions">
                    <span class="xa-reply"><i class="fa-regular fa-comment"></i><small>${Number(post.replies) ? fmtNum(post.replies) : ''}</small></span>
                    <span class="xa-repost ${post.reposted ? 'on' : ''}"><i class="fa-solid fa-retweet"></i><small>${Number(post.reposts) ? fmtNum(post.reposts) : ''}</small></span>
                    <span class="xa-like"></span>
                    <span class="xa-views"><i class="fa-solid fa-chart-simple"></i><small>${fmtNum(Number(post.views) + Number(post.likes) * 3 + 1)}</small></span>
                    <span class="xa-share"><i class="fa-solid fa-arrow-up-from-bracket"></i></span>
                </div>
            </div></div></div>`);
        this.paintLike(post, c);
        $('.xa-like', c).onclick = (e) => { e.stopPropagation(); this.like(post, c); };
        $('.xa-reply', c).onclick = (e) => { e.stopPropagation(); this.compose(null, { replyTo: post }); };
        $('.xa-repost', c).onclick = (e) => {
            e.stopPropagation();
            UI.actions({
                buttons: [
                    { text: post.reposted ? 'Undo repost' : 'Repost', onClick: async () => {
                        const r = await social(this.id, 'post', { repostOf: post.id });
                        if (!r || r.error) return UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Failed');
                        post.reposted = !r.undone;
                        post.reposts = Math.max(0, Number(post.reposts) + (r.undone ? -1 : 1));
                        const rp = $('.xa-repost', c); rp.classList.toggle('on', post.reposted); $('small', rp).textContent = post.reposts ? fmtNum(post.reposts) : '';
                        UI.hud('fa-solid fa-retweet', r.undone ? 'Repost removed' : 'Reposted');
                    } },
                    { text: 'Quote', onClick: () => this.compose(null, { quote: post }) },
                ],
            });
        };
        $('.xa-share', c).onclick = (e) => { e.stopPropagation(); copyText(post.content || ''); UI.hud('fa-solid fa-copy', 'Copied'); };
        $('.xa-more', c).onclick = (e) => {
            e.stopPropagation();
            const btns = [];
            if (post.mine) btns.push({ text: 'Delete post', red: true, onClick: () => this.remove(post, c) });
            btns.push({ text: `View @${post.username}`, onClick: () => this.profile(post.username) });
            UI.actions({ buttons: btns });
        };
        $('.avatar', c).onclick = (e) => { e.stopPropagation(); this.profile(post.username); };
        if (!opts.big) c.onclick = () => this.openPost(post.id);
        const img = $('.xa-media img', c); if (img) img.onclick = (e) => { e.stopPropagation(); UI.viewImage(img.src); };
        this.bindText(c);
        return c;
    },

    paintLike(p, c) {
        const l = $('.xa-like', c);
        if (!l) return;
        l.className = `xa-like ${p.liked ? 'on' : ''}`;
        l.innerHTML = `<i class="fa-${p.liked ? 'solid' : 'regular'} fa-heart"></i><small>${Number(p.likes) ? fmtNum(p.likes) : ''}</small>`;
    },

    postPage(post, replies) {
        const page = UI.page({ title: 'Post', back: true });
        page.content.appendChild(this.card(post, { big: true }));
        const bar = el(`<div class="xa-replybar">${avatarHTML(this.me.display, this.me.avatar, 'sm')}<span>Post your reply</span></div>`);
        bar.onclick = () => this.compose(null, { replyTo: post, after: () => { this.nav.pop(); this.openPost(post.id); } });
        page.content.appendChild(bar);
        replies.forEach((r) => page.content.appendChild(this.card(r)));
        this.nav.push(page);
    },

    tab_explore() {
        const res = el('<div></div>');
        const page = UI.page({
            title: 'Explore', tabbar: true,
            search: { placeholder: 'Search X', onInput: async (q) => {
                res.innerHTML = '';
                if (!q) return this.trends(res);
                const d = await social(this.id, 'search', q);
                const accs = listOf(d && d.accounts);
                if (accs.length) { res.appendChild(UI.header('People', true)); res.appendChild(UI.list(accs.map((a) => ({ avatar: avatarHTML(a.display, a.avatar, 'sm'), title: a.display, sub: '@' + a.username, onClick: () => this.profile(a.username) })))); }
                const posts = listOf(d && d.posts);
                if (posts.length) { res.appendChild(UI.header('Posts', true)); this.renderList(res, posts); }
                if (!accs.length && !posts.length) res.appendChild(UI.empty('fa-solid fa-magnifying-glass', `No results for "${q}"`, ''));
            } },
        });
        page.content.appendChild(res);
        this.trends(res);
        return page;
    },

    async trends(box) {
        box.appendChild(UI.loading());
        const d = await social(this.id, 'trends');
        box.innerHTML = '';
        const tags = listOf(d && d.tags);
        box.appendChild(el('<div class="xa-section">Trends for you</div>'));
        if (!tags.length) box.appendChild(el('<div class="xa-trend"><small>No trends yet</small><b>Use #hashtags in your posts</b></div>'));
        tags.forEach((t, i) => {
            const r = el(`<div class="xa-trend"><small>${i + 1} · Trending in Los Santos</small><b>#${esc(t.tag)}</b><small>${fmtNum(t.count)} post${t.count === 1 ? '' : 's'}</small></div>`);
            r.onclick = () => this.hashtag(t.tag);
            box.appendChild(r);
        });
        const accs = listOf(d && d.accounts).filter((a) => a.username !== this.me.username);
        if (accs.length) {
            box.appendChild(el('<div class="xa-section">Who to follow</div>'));
            accs.forEach((a) => {
                const r = el(`<div class="xa-follow">${avatarHTML(a.display, a.avatar, 'md')}<div><b>${esc(a.display)}</b>${verified(a)}<span>@${esc(a.username)}</span></div><div class="btn small xa-fbtn">Follow</div></div>`);
                r.onclick = () => this.profile(a.username);
                $('.xa-fbtn', r).onclick = (e) => { e.stopPropagation(); this.follow(a.username, e.currentTarget); };
                box.appendChild(r);
            });
        }
    },

    tab_activity() {
        const page = UI.page({ title: 'Notifications', tabbar: true });
        this.renderActivity(page.content);
        return page;
    },

    tab_me() {
        const page = el('<div class="page xa so-profile-page"><div class="scroll with-tabbar"></div></div>');
        const body = $('.scroll', page);
        body.appendChild(UI.loading());
        social(this.id, 'profile', this.me.username).then((d) => { body.innerHTML = ''; if (d && d.account) this.renderProfile(body, d.account, listOf(d.posts)); });
        return page;
    },

    renderProfile(body, a, posts) {
        const top = el(`<div class="xa-prof">
            <div class="xa-banner"></div>
            <div class="xa-prof-row">${avatarHTML(a.display, a.avatar, 'lg')}
                ${a.mine ? '<div class="btn small xa-edit" id="xa-edit">Edit profile</div>' : `<div class="btn small ${a.isFollowing ? 'xa-edit' : 'xa-follow-btn'}" id="xa-follow">${a.isFollowing ? 'Following' : 'Follow'}</div>`}</div>
            <div class="xa-prof-name"><b>${esc(a.display)}</b>${verified(a)}<span>@${esc(a.username)}</span></div>
            ${a.bio ? `<div class="xa-prof-bio">${richText(a.bio, 'xa')}</div>` : ''}
            <div class="xa-prof-meta"><i class="fa-regular fa-calendar"></i> Joined ${esc((() => { const d = parseDate(a.created); return d ? MONTHS[d.getMonth()] + ' ' + d.getFullYear() : 'recently'; })())}</div>
            <div class="xa-prof-counts"><span><b>${fmtNum(a.following)}</b> Following</span><span><b class="fc">${fmtNum(a.followers)}</b> Followers</span></div>
            <div class="xa-prof-tabs"><span class="on">Posts</span><span>Replies</span><span>Media</span><span>Likes</span></div></div>`);
        body.appendChild(top);
        const ed = $('#xa-edit', top); if (ed) ed.onclick = () => this.editProfile(a, () => { if (this.tab === 'me' && this.nav.depth === 1) this.show('me'); });
        const fo = $('#xa-follow', top);
        if (fo) fo.onclick = async () => { const r = await this.follow(a.username, fo); if (r) { fo.className = `btn small ${r.following ? 'xa-edit' : 'xa-follow-btn'}`; $('.fc', top).textContent = fmtNum(r.followers); } };
        this.bindText(top);
        if (!posts.length) body.appendChild(UI.empty('fa-brands fa-x-twitter', a.mine ? 'You haven’t posted yet' : `@${a.username} hasn’t posted`, ''));
        else this.renderList(body, posts);
    },

    compose(media, opts = {}) {
        let attach = media || '';
        UI.sheet({
            title: opts.replyTo ? 'Reply' : '', done: opts.replyTo ? 'Reply' : 'Post',
            content: (body) => {
                body.innerHTML = `${opts.replyTo ? `<div class="xa-replying">Replying to <b>@${esc(opts.replyTo.username)}</b></div>` : ''}
                    <div class="tw-compose">${avatarHTML(this.me.display, this.me.avatar, 'md')}
                    <div style="flex:1"><textarea id="xa-text" maxlength="280" placeholder="${opts.replyTo ? 'Post your reply' : 'What is happening?!'}"></textarea><div id="xa-prev"></div></div></div>
                    ${opts.quote ? `<div class="xa-quote"><div class="xa-head"><b>${esc(opts.quote.display)}</b><span>@${esc(opts.quote.username)}</span></div><div class="xa-text">${esc(opts.quote.content || '')}</div></div>` : ''}
                    <div class="tw-tools"><span id="xa-photo"><i class="fa-regular fa-image"></i></span><span id="xa-cam"><i class="fa-solid fa-camera"></i></span><span class="tw-count" id="xa-count">280</span></div>`;
                const ta = $('#xa-text', body);
                const count = () => { const n = 280 - ta.value.length; const c = $('#xa-count', body); c.textContent = n; c.style.color = n < 20 ? 'var(--red)' : ''; };
                ta.addEventListener('input', count);
                const setMedia = (u) => {
                    attach = u || '';
                    $('#xa-prev', body).innerHTML = attach ? `<div class="tw-prev">${Media.html(attach)}<span id="xa-rm"><i class="fa-solid fa-xmark"></i></span></div>` : '';
                    const rm = $('#xa-rm', body); if (rm) rm.onclick = () => setMedia('');
                };
                setMedia(attach);
                $('#xa-photo', body).onclick = async () => { const u = await PhotosApp.pick({ title: 'Add media' }); if (u) setMedia(u); };
                $('#xa-cam', body).onclick = () => Camera.start({ purpose: 'photo', onResult: (url) => Phone.openApp('x', { compose: url }) });
                setTimeout(() => ta.focus(), 400);
            },
            onDone: async (sheet) => {
                const content = $('#xa-text', sheet).value;
                const data = { content, media: attach };
                if (opts.replyTo) data.replyTo = opts.replyTo.id;
                if (opts.quote) data.repostOf = opts.quote.id;
                if (opts.replyTo) {
                    const r = await social(this.id, 'post', data);
                    if (!r || r.error) { UI.hud('fa-solid fa-triangle-exclamation', (r && r.error) || 'Could not reply'); return false; }
                    UI.hud('fa-solid fa-circle-check', 'Reply sent');
                    if (opts.after) setTimeout(opts.after, 450);
                    return true;
                }
                return this.publish(data);
            },
        });
    },
});

/* =================================================================
   TikTok
   ================================================================= */
const TikTok = new SocialApp('tiktok', {
    cls: 'tt',
    logo: '<i class="fa-brands fa-tiktok tt-logo"></i>',
    signupTitle: 'Sign up for TikTok',
    signupText: 'Create a profile, follow other accounts and make your own videos.',
    feedTab: 'foryou',
    tabs: () => [
        { id: 'home', icon: 'fa-solid fa-house', label: 'Home' },
        { id: 'discover', icon: 'fa-solid fa-magnifying-glass', label: 'Discover' },
        { id: 'create', icon: 'tt-plus', label: '' },
        { id: 'activity', icon: 'fa-regular fa-message', label: 'Inbox' },
        { id: 'me', icon: 'fa-regular fa-user', label: 'Profile' },
    ],

    tab_home() {
        const page = el(`<div class="page tt-feed-page"><div class="tt-top"><span data-t="following" class="${this.feedTab === 'following' ? 'on' : ''}">Following</span><span data-t="foryou" class="${this.feedTab === 'foryou' ? 'on' : ''}">For You</span></div><div class="tt-feed"></div><div class="tt-new hidden">New videos ↑</div></div>`);
        const feed = $('.tt-feed', page);
        $('.tt-top', page).onclick = (e) => {
            const t = e.target.closest('[data-t]'); if (!t) return;
            this.feedTab = t.dataset.t;
            $$('.tt-top span', page).forEach((x) => x.classList.toggle('on', x === t));
            this.loadFeed(feed);
        };
        $('.tt-new', page).onclick = () => { $('.tt-new', page).classList.add('hidden'); this.loadFeed(feed); };
        this.feedPage = page;
        this.loadFeed(feed);
        return page;
    },

    async loadFeed(feed) {
        feed.innerHTML = '<div class="tt-loading"><i class="fa-solid fa-circle-notch spin"></i></div>';
        const rows = listOf(await social(this.id, 'feed', { tab: this.feedTab }));
        feed.innerHTML = '';
        if (!rows.length) {
            feed.innerHTML = `<div class="tt-empty"><i class="fa-brands fa-tiktok"></i><b>${this.feedTab === 'following' ? 'Follow creators to see their videos' : 'No videos yet'}</b><span>Tap + to record the first one.</span></div>`;
            return;
        }
        rows.forEach((p) => feed.appendChild(this.slide(p)));
        if (this.io) this.io.disconnect();
        this.io = new IntersectionObserver((entries) => entries.forEach((en) => {
            const v = $('video', en.target);
            if (!v) return;
            if (en.isIntersecting) { v.play().catch(() => {}); } else { v.pause(); }
        }), { root: feed, threshold: 0.6 });
        $$('.tt-slide', feed).forEach((s) => this.io.observe(s));
    },

    slide(p) {
        const s = el(`<div class="tt-slide">
            <div class="tt-media">${Media.html(p.media, '', {})}</div>
            <div class="tt-side">
                <div class="tt-av" data-user="${esc(p.username)}">${avatarHTML(p.display, p.avatar, 'md')}${p.mine ? '' : '<span class="tt-plus-follow">+</span>'}</div>
                <div class="tt-act tt-like"></div>
                <div class="tt-act tt-com"><i class="fa-solid fa-comment-dots"></i><small>${fmtNum(p.replies)}</small></div>
                <div class="tt-act tt-save"><i class="fa-solid fa-bookmark"></i><small>Save</small></div>
                <div class="tt-act tt-share"><i class="fa-solid fa-share"></i><small>Share</small></div>
                <div class="tt-disc"><i class="fa-solid fa-music"></i></div>
            </div>
            <div class="tt-info"><b data-user="${esc(p.username)}">@${esc(p.username)}</b>${verified(p)}<small> · ${esc(timeAgo(p.created))}</small>
                ${p.content ? `<p>${richText(p.content, 'tt')}</p>` : ''}
                <div class="tt-sound"><i class="fa-solid fa-music"></i> original sound - ${esc(p.display)}</div></div>
            <i class="fa-solid fa-heart tt-burst"></i>
            ${Media.isVideo(p.media) ? '<i class="fa-solid fa-play tt-paused"></i>' : ''}</div>`);
        this.paintLike(p, s);
        $('.tt-like', s).onclick = () => this.like(p, s);
        $('.tt-com', s).onclick = () => this.comments(p, (n) => { $('.tt-com small', s).textContent = fmtNum(n); });
        $('.tt-share', s).onclick = () => { copyText(Media.url(p.media)); UI.hud('fa-solid fa-link', 'Link copied'); };
        $('.tt-save', s).onclick = (e) => { e.currentTarget.classList.add('on'); UI.hud('fa-solid fa-bookmark', 'Added to Favorites'); };
        $$('[data-user]', s).forEach((u) => { u.onclick = (e) => { e.stopPropagation(); this.profile(p.username); }; });
        const plus = $('.tt-plus-follow', s);
        if (plus) plus.onclick = async (e) => { e.stopPropagation(); const r = await this.follow(p.username); if (r) { plus.textContent = r.following ? '✓' : '+'; plus.classList.toggle('done', r.following); } };
        let lastTap = 0;
        $('.tt-media', s).onclick = () => {
            const now = Date.now();
            const v = $('video', s);
            if (now - lastTap < 300) {
                const b = $('.tt-burst', s); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
                if (!p.liked) this.like(p, s);
            } else if (v) {
                setTimeout(() => {
                    if (Date.now() - lastTap < 300) return;
                    if (v.paused) v.play().catch(() => {}); else v.pause();
                    s.classList.toggle('paused', v.paused);
                }, 310);
            }
            lastTap = now;
        };
        if (p.mine) {
            $('.tt-share', s).oncontextmenu = (e) => { e.preventDefault(); this.remove(p, s); };
            const del = el('<div class="tt-act tt-del"><i class="fa-solid fa-trash-can"></i><small>Delete</small></div>');
            del.onclick = () => this.remove(p, s);
            $('.tt-side', s).insertBefore(del, $('.tt-disc', s));
        }
        this.bindText(s);
        return s;
    },

    paintLike(p, s) {
        const l = $('.tt-like', s);
        if (!l) return;
        l.classList.toggle('on', !!p.liked);
        l.innerHTML = `<i class="fa-solid fa-heart"></i><small>${fmtNum(p.likes)}</small>`;
    },

    renderList(box, list) {
        const grid = el(`<div class="tt-grid">${list.map((p, i) => `<div data-i="${i}">${Media.html(p.media)}<span><i class="fa-regular fa-heart"></i> ${fmtNum(p.likes)}</span></div>`).join('')}</div>`);
        grid.onclick = (e) => { const t = e.target.closest('[data-i]'); if (t) this.postPage(list[Number(t.dataset.i)]); };
        box.appendChild(grid);
    },

    postPage(p) {
        const page = el('<div class="page tt-feed-page single"><div class="tt-feed"></div><div class="tt-close"><i class="fa-solid fa-chevron-left"></i></div></div>');
        $('.tt-feed', page).appendChild(this.slide(p));
        $('.tt-close', page).onclick = () => this.nav.pop();
        this.nav.push(page);
        setTimeout(() => { const v = $('video', page); if (v) v.play().catch(() => {}); }, 400);
    },

    tab_discover() {
        const res = el('<div></div>');
        const page = UI.page({
            title: 'Discover', tabbar: true,
            search: { placeholder: 'Search', onInput: async (q) => {
                res.innerHTML = '';
                if (!q) return this.discover(res);
                const d = await social(this.id, 'search', q);
                const accs = listOf(d && d.accounts);
                if (accs.length) res.appendChild(UI.list(accs.map((a) => ({ avatar: avatarHTML(a.display, a.avatar, 'sm'), title: a.username, sub: a.display, onClick: () => this.profile(a.username) }))));
                const posts = listOf(d && d.posts).filter((x) => x.media);
                if (posts.length) this.renderList(res, posts);
                if (!accs.length && !posts.length) res.appendChild(UI.empty('fa-solid fa-magnifying-glass', 'No results', ''));
            } },
        });
        page.content.appendChild(res);
        this.discover(res);
        return page;
    },

    async discover(box) {
        const d = await social(this.id, 'trends');
        listOf(d && d.tags).slice(0, 6).forEach((t) => {
            const r = el(`<div class="tt-tag-row"><span class="tt-hash">#</span><div><b>${esc(t.tag)}</b><small>Trending hashtag</small></div><span class="tt-tag-n">${fmtNum(t.count)}</span></div>`);
            r.onclick = () => this.hashtag(t.tag);
            box.appendChild(r);
        });
        const rows = listOf(await social(this.id, 'feed', {}));
        if (rows.length) { box.appendChild(UI.header('Popular now', true)); this.renderList(box, rows); }
    },

    tab_activity() {
        const page = UI.page({ title: 'Inbox', tabbar: true });
        this.renderActivity(page.content);
        return page;
    },

    tab_me() {
        const page = el(`<div class="page tt-prof-page so-profile-page"><div class="navbar"><div class="nav-row"><div class="nav-left"></div><div class="nav-title">${esc(this.me.display)}</div><div class="nav-actions"></div></div></div><div class="scroll with-tabbar"></div></div>`);
        const body = $('.scroll', page);
        body.appendChild(UI.loading());
        social(this.id, 'profile', this.me.username).then((d) => { body.innerHTML = ''; if (d && d.account) this.renderProfile(body, d.account, listOf(d.posts)); });
        return page;
    },

    renderProfile(body, a, posts) {
        const top = el(`<div class="tt-prof">${avatarHTML(a.display, a.avatar, 'lg')}<b>@${esc(a.username)} ${verified(a)}</b>
            <div class="tt-prof-counts"><div><b>${fmtNum(a.following)}</b><span>Following</span></div><div><b class="fc">${fmtNum(a.followers)}</b><span>Followers</span></div><div><b>${fmtNum(a.likes)}</b><span>Likes</span></div></div>
            <div class="tt-prof-btns">${a.mine ? '<div class="btn gray small" id="tt-edit">Edit profile</div>' : `<div class="btn small ${a.isFollowing ? 'gray' : 'tt-red'}" id="tt-follow">${a.isFollowing ? 'Following' : 'Follow'}</div><div class="btn gray small" id="tt-msg"><i class="fa-regular fa-paper-plane"></i></div>`}</div>
            ${a.bio ? `<p>${richText(a.bio, 'tt')}</p>` : ''}</div>`);
        body.appendChild(top);
        const ed = $('#tt-edit', top); if (ed) ed.onclick = () => this.editProfile(a, () => { if (this.tab === 'me' && this.nav.depth === 1) this.show('me'); });
        const fo = $('#tt-follow', top);
        if (fo) fo.onclick = async () => { const r = await this.follow(a.username, fo); if (r) { fo.className = `btn small ${r.following ? 'gray' : 'tt-red'}`; $('.fc', top).textContent = fmtNum(r.followers); } };
        const ms = $('#tt-msg', top);
        if (ms) ms.onclick = () => (a.phone ? Phone.openApp('whatsapp', { number: a.phone, name: a.display }) : UI.hud('fa-solid fa-circle-info', `${a.display} is offline`));
        if (!posts.length) body.appendChild(UI.empty('fa-solid fa-video', a.mine ? 'Share your first video' : 'No videos yet', a.mine ? 'Tap + to record.' : ''));
        else this.renderList(body, posts);
    },

    async compose(media) {
        if (!media) media = await this.pickMedia();
        if (!media) return;
        UI.sheet({
            title: 'Post', done: 'Post',
            content: (body) => {
                body.innerHTML = `<div class="ig-compose"><div class="ig-compose-media tt">${Media.html(media, '', { autoplay: true })}</div><textarea id="tt-cap" maxlength="2200" placeholder="Describe your video… #hashtags @mentions"></textarea></div>`;
            },
            onDone: (sheet) => this.publish({ content: $('#tt-cap', sheet).value, media, mediaType: Media.isVideo(media) ? 'video' : 'image' }),
        });
    },
});

[Instagram, XApp, TikTok].forEach((a) => {
    Apps.define(a.id, {
        open: (nav, o) => a.open(nav, o),
        onReopen: (o) => a.onReopen(o),
        onClose: () => { if (a.io) { a.io.disconnect(); a.io = null; } a.view = null; },
        dark: a.id !== 'instagram',
    });
});

Phone.on('mz:social:notify', (d) => {
    const n = d.notify || {};
    Phone.notify({ app: d.app, title: n.title || Phone.label(d.app), text: n.text || '' });
    const a = { instagram: Instagram, x: XApp, tiktok: TikTok }[d.app];
    if (a && a.me) { a.me.unread = (Number(a.me.unread) || 0) + 1; if (S.currentApp === d.app) a.updateBadge(); }
});

Phone.on('mz:social:newPost', (d) => {
    if (S.currentApp !== d.app) return;
    if (d.app === 'tiktok' && TikTok.feedPage) { const n = $('.tt-new', TikTok.feedPage); if (n) n.classList.remove('hidden'); return; }
    const a = d.app === 'x' ? XApp : d.app === 'instagram' ? Instagram : null;
    if (!a || a.tab !== 'home' || !a.nav || a.nav.depth !== 1) return;
    const pageEl = $('#app-window .tab-view .page');
    if (!pageEl || $('.so-newpill', pageEl)) return;
    const pill = el(`<div class="so-newpill"><i class="fa-solid fa-arrow-up"></i> New posts</div>`);
    pill.onclick = () => { pill.remove(); a.show('home'); };
    pageEl.appendChild(pill);
});
