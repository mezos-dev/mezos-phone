-- mezos-phone | Marketplace (buy & sell listings)
local QBCore = exports['qb-core']:GetCoreObject()
local CATEGORIES = { vehicles = true, property = true, items = true, services = true, jobs = true, other = true }

local function Clean(s, max)
    s = tostring(s or ''):gsub('[%c]', function(c) return c == '\n' and '\n' or '' end)
    return (s:gsub('^%s+', ''):gsub('%s+$', '')):sub(1, max)
end

local function ValidMedia(url)
    if type(url) ~= 'string' or url == '' or #url > 250 then return nil end
    if url:match('^mzmedia://[%w_%-]+%.%a+$') or url:match('^mzdiscord://%d+/[%w_%-]+%.%a+$') or url:match('^https://%S+$') then return url end
    return nil
end

-- ================= Marketplace =================
QBCore.Functions.CreateCallback('mezos-phone:server:market:list', function(source, cb, opts)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player then return cb({}) end
    opts = type(opts) == 'table' and opts or {}
    local where, params = { 'sold = 0' }, {}
    if opts.mine then
        where = { 'citizenid = ?' }
        params[#params + 1] = Player.PlayerData.citizenid
    end
    if CATEGORIES[opts.category] then
        where[#where + 1] = 'category = ?'
        params[#params + 1] = opts.category
    end
    if opts.q and opts.q ~= '' then
        local like = '%' .. tostring(opts.q):gsub('[%%_]', ''):sub(1, 40) .. '%'
        where[#where + 1] = '(title LIKE ? OR description LIKE ?)'
        params[#params + 1] = like
        params[#params + 1] = like
    end
    local rows = MySQL.query.await('SELECT id, citizenid, seller, phone, title, description, price, category, image, sold, UNIX_TIMESTAMP(created) AS created FROM mezos_market WHERE '
        .. table.concat(where, ' AND ') .. ' ORDER BY id DESC LIMIT 60', params) or {}
    for _, r in ipairs(rows) do
        r.mine = r.citizenid == Player.PlayerData.citizenid
        r.citizenid = nil
    end
    cb(rows)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:market:create', function(source, cb, data)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player or type(data) ~= 'table' then return cb({ error = 'Something went wrong.' }) end
    local title = Clean(data.title, 60)
    local price = math.floor(tonumber(data.price) or -1)
    if title == '' then return cb({ error = 'Add a title.' }) end
    if price < 0 or price > 100000000 then return cb({ error = 'Enter a valid price.' }) end
    local count = MySQL.scalar.await('SELECT COUNT(1) FROM mezos_market WHERE citizenid = ? AND sold = 0', { Player.PlayerData.citizenid }) or 0
    if count >= 10 then return cb({ error = 'You can have 10 active listings.' }) end
    local ci = Player.PlayerData.charinfo
    local id = MySQL.insert.await('INSERT INTO mezos_market (citizenid, seller, phone, title, description, price, category, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', {
        Player.PlayerData.citizenid, ci.firstname .. ' ' .. ci.lastname, ci.phone, title, Clean(data.description, 1000), price,
        CATEGORIES[data.category] and data.category or 'other', ValidMedia(data.image),
    })
    TriggerClientEvent('mezos-phone:client:market:new', -1, { id = id, title = title, price = price, seller = ci.firstname })
    cb({ ok = true, id = id })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:market:update', function(source, cb, id, action)
    local Player = QBCore.Functions.GetPlayer(source)
    id = tonumber(id)
    if not Player or not id then return cb(false) end
    local owner = MySQL.scalar.await('SELECT citizenid FROM mezos_market WHERE id = ?', { id })
    if owner ~= Player.PlayerData.citizenid then return cb(false) end
    if action == 'delete' then
        MySQL.query.await('DELETE FROM mezos_market WHERE id = ?', { id })
    elseif action == 'sold' then
        MySQL.update.await('UPDATE mezos_market SET sold = 1 WHERE id = ?', { id })
    elseif action == 'relist' then
        MySQL.update.await('UPDATE mezos_market SET sold = 0, created = CURRENT_TIMESTAMP WHERE id = ?', { id })
    end
    cb(true)
end)
