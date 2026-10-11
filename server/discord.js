/*
    mezos-phone | Discord webhook storage for photos / videos
    Discord attachment links expire after ~24h, so the phone saves  mzdiscord://<messageId>/<file>
    and asks for a fresh link (read back from the webhook message) when the old one runs out.
*/
const fs = require('fs');

async function send(url, opts, tries = 3) {
    for (let i = 0; i < tries; i++) {
        const r = await fetch(url, opts);
        if (r.status === 429) {
            const j = await r.json().catch(() => ({}));
            await new Promise((ok) => setTimeout(ok, Math.ceil((Number(j.retry_after) || 1) * 1000) + 100));
            continue;
        }
        if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 200)}`);
        return r.json();
    }
    throw new Error('Discord rate limit');
}

function expiry(url) {
    const m = /[?&]ex=([0-9a-f]+)/i.exec(String(url || ''));
    return m ? parseInt(m[1], 16) : Math.floor(Date.now() / 1000) + 12 * 3600;
}

/** data: base64 / data url, or { path } of a file on disk */
exports('DiscordUpload', (webhook, name, mime, data, info, cb) => {
    (async () => {
        let buf;
        if (data && typeof data === 'object' && data.path) buf = fs.readFileSync(data.path);
        else buf = Buffer.from(String(data || '').replace(/^data:[^,]*,/, ''), 'base64');
        if (!buf || buf.length < 100) throw new Error('empty file');
        const form = new FormData();
        form.append('payload_json', JSON.stringify({
            username: 'mezos-phone',
            content: info ? String(info).slice(0, 1800) : '',
            attachments: [{ id: 0, filename: name }],
        }));
        form.append('files[0]', new Blob([buf], { type: mime || 'application/octet-stream' }), name);
        const j = await send(`${webhook}${webhook.includes('?') ? '&' : '?'}wait=true`, { method: 'POST', body: form });
        const att = j.attachments && j.attachments[0];
        if (!att || !att.url) throw new Error('no attachment in Discord answer');
        cb({ id: String(j.id), url: att.url, expires: expiry(att.url) });
    })().catch((e) => {
        console.log(`^1[mezos-phone] Discord upload failed: ${e.message}^7`);
        cb(null);
    });
});

/** fresh link for an uploaded message */
exports('DiscordLink', (webhook, messageId, cb) => {
    (async () => {
        const j = await send(`${webhook.split('?')[0]}/messages/${messageId}`, { method: 'GET' });
        const att = j.attachments && j.attachments[0];
        cb(att && att.url ? { url: att.url, expires: expiry(att.url) } : null);
    })().catch((e) => {
        console.log(`^3[mezos-phone] Discord link refresh failed (${messageId}): ${e.message}^7`);
        cb(null);
    });
});
