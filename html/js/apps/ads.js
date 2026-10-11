/* Ads (Yellow pages) */
'use strict';

const AdsApp = {
    nav: null, page: null, ads: [],

    open(nav) {
        this.nav = nav;
        this.page = UI.page({ title: 'Ads', large: true, sub: 'Buy, sell & services in Los Santos', right: [{ icon: 'fa-solid fa-plus', onClick: () => this.post() }] });
        nav.push(this.page, false);
        this.page.content.appendChild(UI.loading());
        nui('LoadAdverts');
    },

    render() {
        if (!this.page) return;
        const c = this.page.content;
        c.innerHTML = '';
        const list = Object.values(this.ads || {}).filter(Boolean);
        const myNumber = String((S.player.charinfo || {}).phone);
        if (!list.length) { c.appendChild(UI.empty('fa-solid fa-bullhorn', 'No Ads Yet', 'Tap + to post the first advertisement.')); return; }
        list.slice().reverse().forEach((ad) => {
            const mine = String(ad.number) === myNumber;
            const card = el(`<div class="ad-card fade-in">
                <div class="ad-head">${avatarHTML(ad.name, null, 'sm')}<div><b>${esc(ad.name)}</b><small>${esc(ad.number)}</small></div>${mine ? '<span class="pill blue">Your ad</span>' : ''}</div>
                <div class="ad-text">${esc(ad.message)}</div>
                ${ad.url ? `${Media.html(ad.url, 'ad-img')}` : ''}
                <div class="ad-actions">
                    ${mine ? '<div class="btn small danger ad-del"><i class="fa-solid fa-trash"></i>Delete</div>' : `<div class="btn small tinted ad-call"><i class="fa-solid fa-phone"></i>Call</div><div class="btn small tinted ad-msg"><i class="fa-solid fa-comment"></i>Message</div>`}
                </div></div>`);
            const img = $('.ad-img', card); if (img) img.onclick = () => UI.viewImage(img.src);
            if (mine) $('.ad-del', card).onclick = async () => {
                if (!(await UI.confirm('Delete Ad', 'Remove your advertisement?', 'Delete', true))) return;
                nui('DeleteAdvert');
                UI.hud('fa-solid fa-trash', 'Ad deleted');
            };
            else {
                $('.ad-call', card).onclick = () => Phone.startCall(ad.number, ad.name);
                $('.ad-msg', card).onclick = () => Phone.openApp('whatsapp', { number: ad.number, name: ad.name });
            }
            c.appendChild(card);
        });
    },

    post() {
        let url = '';
        UI.sheet({
            title: 'New Ad', done: 'Post',
            content: (body) => {
                const form = UI.form([{ id: 'msg', placeholder: 'What are you advertising?', textarea: true, max: 400 }]);
                body.appendChild(el('<div style="height:1rem"></div>'));
                body.appendChild(form);
                body._form = form;
                const prev = el('<div class="pad mt"></div>');
                const pick = UI.list([
                    { icon: 'fa-regular fa-image', iconBg: 'var(--purple)', title: 'Add Photo from Library', onClick: async () => {
                        const imgs = await nui('GetGalleryData');
                        const list = Array.isArray(imgs) ? imgs : Object.values(imgs || {});
                        if (!list.length) return UI.hud('fa-regular fa-images', 'No photos');
                        UI.sheet({ title: 'Choose Photo', content: (b2, sh2) => {
                            const g = el(`<div class="photo-grid">${list.map((p, i) => `<div class="ph" data-i="${i}">${Media.html(p.image, 'ph-media')}</div>`).join('')}</div>`);
                            g.onclick = (e) => { const t = e.target.closest('.ph'); if (t) { url = list[Number(t.dataset.i)].image; prev.innerHTML = Media.html(url, 'ad-prev-img'); sh2.close(); } };
                            b2.appendChild(g);
                        } });
                    } },
                    { icon: 'fa-solid fa-link', iconBg: 'var(--blue)', title: 'Add Image URL', onClick: async () => {
                        const u = await UI.prompt('Image URL', '', 'https://');
                        if (u && /^https?:\/\//.test(u)) { url = u; prev.innerHTML = Media.html(url, 'ad-prev-img'); }
                    } },
                ]);
                pick.style.marginTop = '1rem';
                body.append(pick, prev);
                body.appendChild(UI.footer('Your name and phone number are shown with the ad. You can have one active ad.'));
            },
            onDone: (sheet) => {
                const v = sheet.body._form.values();
                if (!v.msg) { UI.hud('fa-solid fa-triangle-exclamation', "Ad can't be empty"); return false; }
                nui('PostAdvert', { message: v.msg, url });
                return true;
            },
        });
    },
};

Apps.define('advert', { open: (nav) => AdsApp.open(nav), onClose: () => { AdsApp.page = null; } });
Phone.on('RefreshAdverts', (d) => { AdsApp.ads = d.Adverts || {}; if (S.currentApp === 'advert') AdsApp.render(); });
