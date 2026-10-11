--[[
    mezos-phone | social backend shared by Instagram ('instagram'), X ('x') and TikTok ('tiktok')
    accounts, posts, replies/comments, reposts (X), likes, follows, notifications, search, trends
]]
local QBCore = exports['qb-core']:GetCoreObject()
local APPS = { instagram = true, x = true, tiktok = true }
local APP_NAMES = { instagram = 'Instagram', x = 'X', tiktok = 'TikTok' }
local APP_ICONS = { instagram = 'fab fa-instagram', x = 'fab fa-x-twitter', tiktok = 'fab fa-tiktok' }
local PAGE = 25
local RateLimit = {}

local function Cid(src)
    local P = QBCore.Functions.GetPlayer(src)
    return P and P.PlayerData.citizenid, P
end

local function Limited(src, key, ms)
    local k = src .. key
    local now = GetGameTimer()
    if RateLimit[k] and now - RateLimit[k] < ms then return true end
    RateLimit[k] = now
    return false
end

local function Clean(s, max)
    s = tostring(s or ''):gsub('[%c]', function(c) return c == '\n' and '\n' or '' end)
    s = s:gsub('^%s+', ''):gsub('%s+$', '')
    return s:sub(1, max)
end

local function ValidMedia(url)
    if type(url) ~= 'string' or url == '' then return nil end
    if #url > 250 then return nil end
    if url:match('^mzmedia://[%w_%-]+%.%a+$') or url:match('^mzdiscord://%d+/[%w_%-]+%.%a+$') or url:match('^https://[%w%-%._~:/%?#%[%]@!%$&\'%(%)%*%+,;=%%]+$') then return url end
    return nil
end

local function Account(app, cid)
    return MySQL.single.await('SELECT * FROM mezos_social_accounts WHERE app = ? AND citizenid = ?', { app, cid })
end

local function OnlineByCid(cid)
    local P = QBCore.Functions.GetPlayerByCitizenId(cid)
    return P and P.PlayerData.source
end

local function Notify(app, target, actor, kind, postId, text)
    if target == actor then return end
    MySQL.insert('INSERT INTO mezos_social_notifs (app, citizenid, actor, type, post_id) VALUES (?, ?, ?, ?, ?)', { app, target, actor, kind, postId })
    local src = OnlineByCid(target)
    if src then
        TriggerClientEvent('mezos-phone:client:social:notify', src, app, { title = APP_NAMES[app], text = text, icon = APP_ICONS[app] })
    end
end

local POST_SELECT = [[
    SELECT p.id, p.app, p.citizenid, p.content, p.media, p.media_type, p.reply_to, p.repost_of, p.views,
           UNIX_TIMESTAMP(p.created) AS created,
           a.username, a.display, a.avatar, a.verified,
           (SELECT COUNT(1) FROM mezos_social_likes l WHERE l.post_id = p.id) AS likes,
           (SELECT COUNT(1) FROM mezos_social_likes l WHERE l.post_id = p.id AND l.citizenid = ?) AS liked,
           (SELECT COUNT(1) FROM mezos_social_posts r WHERE r.reply_to = p.id) AS replies,
           (SELECT COUNT(1) FROM mezos_social_posts r WHERE r.repost_of = p.id) AS reposts,
           (SELECT COUNT(1) FROM mezos_social_posts r WHERE r.repost_of = p.id AND r.citizenid = ?) AS reposted
    FROM mezos_social_posts p
    JOIN mezos_social_accounts a ON a.app = p.app AND a.citizenid = p.citizenid
]]

local function Decorate(rows, cid)
    rows = rows or {}
    local ids, need = {}, {}
    for _, r in ipairs(rows) do
        r.mine = r.citizenid == cid
        r.liked = (tonumber(r.liked) or 0) > 0
        r.reposted = (tonumber(r.reposted) or 0) > 0
        r.citizenid = nil
        if r.repost_of and not need[r.repost_of] then
            need[r.repost_of] = true
            ids[#ids + 1] = r.repost_of
        end
    end
    if #ids > 0 then
        local placeholders = ('?,'):rep(#ids):sub(1, -2)
        local params = { cid, cid }
        for _, id in ipairs(ids) do params[#params + 1] = id end
        local originals = MySQL.query.await(POST_SELECT .. ' WHERE p.id IN (' .. placeholders .. ')', params) or {}
        local map = {}
        for _, o in ipairs(originals) do
            o.mine = o.citizenid == cid
            o.liked = (tonumber(o.liked) or 0) > 0
            o.reposted = (tonumber(o.reposted) or 0) > 0
            o.citizenid = nil
            map[o.id] = o
        end
        for _, r in ipairs(rows) do
            if r.repost_of then r.original = map[r.repost_of] end
        end
    end
    return rows
end

local function GetPost(id, cid)
    local rows = MySQL.query.await(POST_SELECT .. ' WHERE p.id = ?', { cid, cid, id })
    return Decorate(rows, cid)[1]
end

-- ---------- accounts ----------
QBCore.Functions.CreateCallback('mezos-phone:server:social:me', function(source, cb, app)
    local cid, P = Cid(source)
    if not cid or not APPS[app] then return cb(false) end
    local acc = Account(app, cid)
    if acc then
        acc.followers = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_follows WHERE app = ? AND followed = ?', { app, cid }) or 0
        acc.following = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_follows WHERE app = ? AND follower = ?', { app, cid }) or 0
        acc.posts = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_posts WHERE app = ? AND citizenid = ? AND reply_to IS NULL', { app, cid }) or 0
        acc.unread = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_notifs WHERE app = ? AND citizenid = ? AND id > ?', { app, cid, GetResourceKvpInt(('seen_%s_%s'):format(app, cid)) }) or 0
        cb(acc)
    else
        local ci = P.PlayerData.charinfo
        cb({ none = true, suggest = (ci.firstname .. ci.lastname):lower():gsub('[^%w]', ''):sub(1, 18), display = ci.firstname .. ' ' .. ci.lastname })
    end
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:signup', function(source, cb, app, data)
    local cid, P = Cid(source)
    if not cid or not APPS[app] or type(data) ~= 'table' then return cb({ error = 'Something went wrong.' }) end
    if Account(app, cid) then return cb({ error = 'You already have an account.' }) end
    local username = tostring(data.username or ''):lower()
    if not username:match('^[%w_%.]+$') or #username < 3 or #username > 20 then
        return cb({ error = 'Usernames are 3-20 letters, numbers, _ or .' })
    end
    if MySQL.scalar.await('SELECT 1 FROM mezos_social_accounts WHERE app = ? AND username = ?', { app, username }) then
        return cb({ error = 'That username is taken.' })
    end
    local ci = P.PlayerData.charinfo
    local display = Clean(data.display, 40)
    if display == '' then display = ci.firstname .. ' ' .. ci.lastname end
    local avatar = ValidMedia(data.avatar)
    MySQL.insert.await('INSERT INTO mezos_social_accounts (app, citizenid, username, display, avatar, bio) VALUES (?, ?, ?, ?, ?, ?)', { app, cid, username, display, avatar, '' })
    cb({ ok = true })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:updateProfile', function(source, cb, app, data)
    local cid = Cid(source)
    if not cid or not APPS[app] or type(data) ~= 'table' then return cb(false) end
    local acc = Account(app, cid)
    if not acc then return cb(false) end
    local display = Clean(data.display, 40)
    if display == '' then display = acc.display end
    local bio = Clean(data.bio, 160)
    local avatar = data.avatar == '' and nil or (ValidMedia(data.avatar) or acc.avatar)
    MySQL.update.await('UPDATE mezos_social_accounts SET display = ?, bio = ?, avatar = ? WHERE id = ?', { display, bio, avatar, acc.id })
    cb(true)
end)

-- ---------- feeds ----------
QBCore.Functions.CreateCallback('mezos-phone:server:social:feed', function(source, cb, app, opts)
    local cid = Cid(source)
    if not cid or not APPS[app] then return cb({}) end
    opts = type(opts) == 'table' and opts or {}
    local where, params = { 'p.app = ?', 'p.reply_to IS NULL' }, { cid, cid, app }
    if tonumber(opts.before) then
        where[#where + 1] = 'p.id < ?'
        params[#params + 1] = tonumber(opts.before)
    end
    if opts.tab == 'following' then
        where[#where + 1] = '(p.citizenid IN (SELECT followed FROM mezos_social_follows WHERE app = ? AND follower = ?) OR p.citizenid = ?)'
        params[#params + 1] = app; params[#params + 1] = cid; params[#params + 1] = cid
    end
    if app == 'tiktok' or opts.mediaOnly then
        where[#where + 1] = 'p.media IS NOT NULL'
    end
    if opts.hashtag then
        where[#where + 1] = 'p.content LIKE ?'
        params[#params + 1] = '%#' .. tostring(opts.hashtag):gsub('[%%_]', '') .. '%'
    end
    local rows = MySQL.query.await(POST_SELECT .. ' WHERE ' .. table.concat(where, ' AND ') .. ' ORDER BY p.id DESC LIMIT ' .. PAGE, params)
    cb(Decorate(rows, cid))
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:thread', function(source, cb, id)
    local cid = Cid(source)
    id = tonumber(id)
    if not cid or not id then return cb(nil) end
    local post = GetPost(id, cid)
    if not post then return cb(nil) end
    MySQL.update('UPDATE mezos_social_posts SET views = views + 1 WHERE id = ?', { id })
    local replies = MySQL.query.await(POST_SELECT .. ' WHERE p.reply_to = ? ORDER BY p.id ASC LIMIT 100', { cid, cid, id })
    cb({ post = post, replies = Decorate(replies, cid) })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:profile', function(source, cb, app, username)
    local cid = Cid(source)
    if not cid or not APPS[app] then return cb(nil) end
    local acc = MySQL.single.await('SELECT * FROM mezos_social_accounts WHERE app = ? AND username = ?', { app, tostring(username or ''):lower() })
    if not acc then return cb(nil) end
    local target = acc.citizenid
    acc.followers = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_follows WHERE app = ? AND followed = ?', { app, target }) or 0
    acc.following = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_follows WHERE app = ? AND follower = ?', { app, target }) or 0
    acc.isFollowing = MySQL.scalar.await('SELECT 1 FROM mezos_social_follows WHERE app = ? AND follower = ? AND followed = ?', { app, cid, target }) ~= nil
    acc.likes = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_likes l JOIN mezos_social_posts p ON p.id = l.post_id WHERE p.app = ? AND p.citizenid = ?', { app, target }) or 0
    acc.mine = target == cid
    local phone
    local P = QBCore.Functions.GetPlayerByCitizenId(target)
    if P then phone = P.PlayerData.charinfo.phone end
    acc.phone = phone
    acc.handle = target
    acc.citizenid = nil
    local posts = MySQL.query.await(POST_SELECT .. ' WHERE p.app = ? AND p.citizenid = ? AND p.reply_to IS NULL ORDER BY p.id DESC LIMIT 60', { cid, cid, app, target })
    acc.postCount = #(posts or {})
    cb({ account = acc, posts = Decorate(posts, cid) })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:search', function(source, cb, app, q)
    local cid = Cid(source)
    if not cid or not APPS[app] then return cb({}) end
    q = tostring(q or ''):gsub('[%%_]', ''):sub(1, 30)
    if #q < 1 then return cb({ accounts = {}, posts = {} }) end
    local like = '%' .. q .. '%'
    local accounts = MySQL.query.await('SELECT username, display, avatar, verified FROM mezos_social_accounts WHERE app = ? AND (username LIKE ? OR display LIKE ?) LIMIT 20', { app, like, like })
    local posts = MySQL.query.await(POST_SELECT .. ' WHERE p.app = ? AND p.content LIKE ? ORDER BY p.id DESC LIMIT 20', { cid, cid, app, like })
    cb({ accounts = accounts or {}, posts = Decorate(posts, cid) })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:trends', function(source, cb, app)
    if not APPS[app] then return cb({}) end
    local rows = MySQL.query.await("SELECT content FROM mezos_social_posts WHERE app = ? AND content LIKE '%#%' AND created > NOW() - INTERVAL 3 DAY ORDER BY id DESC LIMIT 500", { app }) or {}
    local count = {}
    for _, r in ipairs(rows) do
        local seen = {}
        for tag in tostring(r.content):gmatch('#([%w_]+)') do
            tag = tag:lower()
            if not seen[tag] then
                seen[tag] = true
                count[tag] = (count[tag] or 0) + 1
            end
        end
    end
    local list = {}
    for tag, n in pairs(count) do list[#list + 1] = { tag = tag, count = n } end
    table.sort(list, function(a, b) return a.count > b.count end)
    while #list > 15 do table.remove(list) end
    local suggested = MySQL.query.await([[SELECT a.username, a.display, a.avatar, a.verified, COUNT(f.follower) AS followers
        FROM mezos_social_accounts a LEFT JOIN mezos_social_follows f ON f.app = a.app AND f.followed = a.citizenid
        WHERE a.app = ? GROUP BY a.id ORDER BY followers DESC, a.id DESC LIMIT 10]], { app }) or {}
    cb({ tags = list, accounts = suggested })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:notifications', function(source, cb, app)
    local cid = Cid(source)
    if not cid or not APPS[app] then return cb({}) end
    local rows = MySQL.query.await([[SELECT n.id, n.type, n.post_id, UNIX_TIMESTAMP(n.created) AS created, a.username, a.display, a.avatar,
            p.media, p.content
        FROM mezos_social_notifs n
        LEFT JOIN mezos_social_accounts a ON a.app = n.app AND a.citizenid = n.actor
        LEFT JOIN mezos_social_posts p ON p.id = n.post_id
        WHERE n.app = ? AND n.citizenid = ? ORDER BY n.id DESC LIMIT 60]], { app, cid }) or {}
    if rows[1] then SetResourceKvpInt(('seen_%s_%s'):format(app, cid), rows[1].id) end
    cb(rows)
end)

-- ---------- actions ----------
QBCore.Functions.CreateCallback('mezos-phone:server:social:post', function(source, cb, app, data)
    local src = source
    local cid, P = Cid(src)
    if not cid or not APPS[app] or type(data) ~= 'table' then return cb({ error = 'Something went wrong.' }) end
    local acc = Account(app, cid)
    if not acc then return cb({ error = 'Create an account first.' }) end
    if Limited(src, 'post', 4000) then return cb({ error = 'Slow down a little.' }) end
    local content = Clean(data.content, app == 'x' and 280 or 2200)
    local media = ValidMedia(data.media)
    local mediaType = media and ((data.mediaType == 'video' or tostring(media):match('%.webm$') or tostring(media):match('%.mp4$')) and 'video' or 'image') or nil
    local replyTo = tonumber(data.replyTo)
    local repostOf = tonumber(data.repostOf)
    if content == '' and not media and not repostOf then return cb({ error = 'Write something first.' }) end
    if app == 'instagram' and not media and not replyTo then return cb({ error = 'Instagram posts need a photo.' }) end
    if app == 'tiktok' and not media and not replyTo then return cb({ error = 'TikTok posts need a video or photo.' }) end

    local parent
    if replyTo then
        parent = MySQL.single.await('SELECT id, citizenid, app FROM mezos_social_posts WHERE id = ?', { replyTo })
        if not parent or parent.app ~= app then return cb({ error = 'That post was deleted.' }) end
    end
    if repostOf then
        local orig = MySQL.single.await('SELECT id, citizenid, app FROM mezos_social_posts WHERE id = ?', { repostOf })
        if not orig or orig.app ~= app then return cb({ error = 'That post was deleted.' }) end
        local existing = MySQL.scalar.await('SELECT id FROM mezos_social_posts WHERE repost_of = ? AND citizenid = ? AND (content IS NULL OR content = "")', { repostOf, cid })
        if existing and content == '' then -- undo repost
            MySQL.query.await('DELETE FROM mezos_social_posts WHERE id = ?', { existing })
            return cb({ ok = true, undone = true })
        end
        Notify(app, orig.citizenid, cid, 'repost', repostOf, '@' .. acc.username .. ' reposted your post')
    end

    local id = MySQL.insert.await('INSERT INTO mezos_social_posts (app, citizenid, content, media, media_type, reply_to, repost_of) VALUES (?, ?, ?, ?, ?, ?, ?)',
        { app, cid, content ~= '' and content or nil, media, mediaType, replyTo, repostOf })

    if parent then
        Notify(app, parent.citizenid, cid, 'reply', replyTo, '@' .. acc.username .. (app == 'x' and ' replied: ' or ' commented: ') .. content:sub(1, 60))
    end
    -- mentions
    local mentioned = {}
    for user in content:gmatch('@([%w_%.]+)') do
        user = user:lower()
        if not mentioned[user] then
            mentioned[user] = true
            local target = MySQL.scalar.await('SELECT citizenid FROM mezos_social_accounts WHERE app = ? AND username = ?', { app, user })
            if target then Notify(app, target, cid, 'mention', id, '@' .. acc.username .. ' mentioned you: ' .. content:sub(1, 60)) end
        end
    end
    if not replyTo then
        TriggerClientEvent('mezos-phone:client:social:newPost', -1, app, { id = id, username = acc.username, citizenid = cid })
    end
    cb({ ok = true, post = GetPost(id, cid) })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:delete', function(source, cb, id)
    local cid = Cid(source)
    id = tonumber(id)
    if not cid or not id then return cb(false) end
    local owner = MySQL.scalar.await('SELECT citizenid FROM mezos_social_posts WHERE id = ?', { id })
    if owner ~= cid then return cb(false) end
    MySQL.query.await('DELETE FROM mezos_social_likes WHERE post_id = ?', { id })
    MySQL.query.await('DELETE FROM mezos_social_notifs WHERE post_id = ?', { id })
    MySQL.query.await('DELETE FROM mezos_social_posts WHERE id = ? OR reply_to = ? OR repost_of = ?', { id, id, id })
    cb(true)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:like', function(source, cb, id)
    local src = source
    local cid = Cid(src)
    id = tonumber(id)
    if not cid or not id then return cb(nil) end
    local post = MySQL.single.await('SELECT id, app, citizenid FROM mezos_social_posts WHERE id = ?', { id })
    if not post then return cb(nil) end
    local liked = MySQL.scalar.await('SELECT 1 FROM mezos_social_likes WHERE post_id = ? AND citizenid = ?', { id, cid })
    if liked then
        MySQL.query.await('DELETE FROM mezos_social_likes WHERE post_id = ? AND citizenid = ?', { id, cid })
    else
        MySQL.insert.await('INSERT IGNORE INTO mezos_social_likes (post_id, citizenid) VALUES (?, ?)', { id, cid })
        if not Limited(src, 'likenotif' .. id, 60000) then
            local acc = Account(post.app, cid)
            if acc then Notify(post.app, post.citizenid, cid, 'like', id, '@' .. acc.username .. ' liked your post') end
        end
    end
    local count = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_likes WHERE post_id = ?', { id }) or 0
    cb({ liked = not liked, likes = count })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:social:follow', function(source, cb, app, username)
    local cid = Cid(source)
    if not cid or not APPS[app] then return cb(nil) end
    local me = Account(app, cid)
    local target = MySQL.scalar.await('SELECT citizenid FROM mezos_social_accounts WHERE app = ? AND username = ?', { app, tostring(username or ''):lower() })
    if not me or not target or target == cid then return cb(nil) end
    local following = MySQL.scalar.await('SELECT 1 FROM mezos_social_follows WHERE app = ? AND follower = ? AND followed = ?', { app, cid, target })
    if following then
        MySQL.query.await('DELETE FROM mezos_social_follows WHERE app = ? AND follower = ? AND followed = ?', { app, cid, target })
    else
        MySQL.insert.await('INSERT IGNORE INTO mezos_social_follows (app, follower, followed) VALUES (?, ?, ?)', { app, cid, target })
        Notify(app, target, cid, 'follow', nil, '@' .. me.username .. ' started following you')
    end
    local followers = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_social_follows WHERE app = ? AND followed = ?', { app, target }) or 0
    cb({ following = not following, followers = followers })
end)

AddEventHandler('playerDropped', function()
    local src = tostring(source)
    for k in pairs(RateLimit) do
        if k:sub(1, #src) == src then RateLimit[k] = nil end
    end
end)
