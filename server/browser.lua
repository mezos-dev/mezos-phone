--[[
    mezos-phone | Browser websites (Weazel News articles) + emergency alerts
    Emergency alerts are used by the Browser (lspd.gov / pillbox report forms) and Emergency SOS in the Control Centre.
]]
local QBCore = exports['qb-core']:GetCoreObject()
local BR = Config.Browser or {}
local EM = Config.Emergency or {}
local Cooldown = {}

local function InList(list, v)
    for _, x in ipairs(list or {}) do if x == v then return true end end
    return false
end

local function Clean(s, max)
    s = tostring(s or ''):gsub('\r', ''):gsub('[%z\1-\9\11-\31]', '')
    s = s:gsub('^%s+', ''):gsub('%s+$', '')
    return s:sub(1, max)
end

local function CanWrite(Player)
    local job = Player.PlayerData.job or {}
    return InList(BR.NewsJobs or { 'reporter' }, job.name)
end

local function Name(Player)
    return Player.PlayerData.charinfo.firstname .. ' ' .. Player.PlayerData.charinfo.lastname
end

-- ---------- Weazel News ----------
QBCore.Functions.CreateCallback('mezos-phone:server:browser:news', function(source, cb, opts)
    opts = type(opts) == 'table' and opts or {}
    local where, params = '', {}
    if opts.q and opts.q ~= '' then
        local like = '%' .. tostring(opts.q):gsub('[%%_]', ''):sub(1, 40) .. '%'
        where = 'WHERE title LIKE ? OR body LIKE ?'
        params = { like, like }
    elseif opts.category and opts.category ~= '' then
        where = 'WHERE category = ?'
        params = { tostring(opts.category):sub(1, 20) }
    end
    local rows = MySQL.query.await('SELECT id, citizenid, author, title, LEFT(body, 220) AS excerpt, image, category, views, UNIX_TIMESTAMP(created) AS created FROM mezos_news '
        .. where .. ' ORDER BY id DESC LIMIT 40', params) or {}
    local Player = QBCore.Functions.GetPlayer(source)
    local cid = Player and Player.PlayerData.citizenid
    for _, r in ipairs(rows) do r.mine = r.citizenid == cid r.citizenid = nil end
    cb({ articles = rows, canWrite = Player and CanWrite(Player) or false })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:browser:article', function(source, cb, id)
    id = tonumber(id)
    if not id then return cb(nil) end
    MySQL.update('UPDATE mezos_news SET views = views + 1 WHERE id = ?', { id })
    local a = MySQL.single.await('SELECT id, citizenid, author, title, body, image, category, views, UNIX_TIMESTAMP(created) AS created FROM mezos_news WHERE id = ?', { id })
    if not a then return cb(nil) end
    local Player = QBCore.Functions.GetPlayer(source)
    a.mine = Player and (a.citizenid == Player.PlayerData.citizenid or (CanWrite(Player) and Player.PlayerData.job.isboss)) or false
    a.citizenid = nil
    cb(a)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:browser:publish', function(source, cb, data)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player or type(data) ~= 'table' then return cb({ error = 'Not available' }) end
    if not CanWrite(Player) then return cb({ error = 'Only Weazel News reporters can publish' }) end
    local title, body = Clean(data.title, 120), Clean(data.body, 6000)
    if #title < 4 or #body < 20 then return cb({ error = 'Write a title and at least a few sentences' }) end
    local image = type(data.image) == 'string' and #data.image <= 250 and (data.image:match('^mzmedia://[%w_%-]+%.%a+$') or data.image:match('^mzdiscord://%d+/[%w_%-]+%.%a+$') or data.image:match('^https://%S+$')) or nil
    local cats = { city = true, crime = true, business = true, sports = true, weather = true, breaking = true }
    local category = cats[data.category] and data.category or 'city'
    local id = MySQL.insert.await('INSERT INTO mezos_news (citizenid, author, title, body, image, category) VALUES (?, ?, ?, ?, ?, ?)',
        { Player.PlayerData.citizenid, Name(Player), title, body, image, category })
    if category == 'breaking' then
        TriggerClientEvent('mezos-phone:client:breakingNews', -1, { id = id, title = title })
    end
    cb({ id = id })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:browser:delete', function(source, cb, id)
    local Player = QBCore.Functions.GetPlayer(source)
    id = tonumber(id)
    if not Player or not id then return cb(false) end
    local a = MySQL.single.await('SELECT citizenid FROM mezos_news WHERE id = ?', { id })
    if not a then return cb(false) end
    if a.citizenid ~= Player.PlayerData.citizenid and not (CanWrite(Player) and Player.PlayerData.job.isboss) then return cb(false) end
    MySQL.query.await('DELETE FROM mezos_news WHERE id = ?', { id })
    cb(true)
end)

-- ---------- emergency alerts ----------
local function IsResponder(Player, kind)
    local job = Player.PlayerData.job or {}
    if not job.onduty then return false end
    if kind == 'ems' then return job.type == 'ems' or InList(EM.EMSJobs, job.name) end
    return job.type == 'leo' or InList(EM.PoliceJobs, job.name)
end

--- kind 'police' | 'ems', data { text, street, anonymous, sos }
local function Alert(src, kind, data)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return { error = 'Not available' } end
    local now = os.time()
    local key = src .. kind
    if Cooldown[key] and now - Cooldown[key] < (EM.Cooldown or 45) then
        return { error = ('Please wait %ds before sending another alert'):format((EM.Cooldown or 45) - (now - Cooldown[key])) }
    end
    Cooldown[key] = now
    local c = GetEntityCoords(GetPlayerPed(src))
    local anonymous = data.anonymous == true and not data.sos
    local alert = {
        kind = kind, sos = data.sos == true,
        text = Clean(data.text, 300), street = Clean(data.street, 80),
        caller = anonymous and 'Anonymous' or Name(Player),
        phone = not anonymous and Player.PlayerData.charinfo.phone or nil,
        coords = { x = c.x, y = c.y, z = c.z },
        blip = EM.BlipSeconds or 120,
    }
    local count = 0
    for _, P in pairs(QBCore.Functions.GetQBPlayers()) do
        if IsResponder(P, kind) and P.PlayerData.source ~= src then
            count = count + 1
            TriggerClientEvent('mezos-phone:client:emergencyAlert', P.PlayerData.source, alert)
        end
    end
    return { sent = count }
end
MezosPhone.EmergencyAlert = Alert

QBCore.Functions.CreateCallback('mezos-phone:server:emergency', function(source, cb, data)
    if type(data) ~= 'table' then return cb({ error = 'Not available' }) end
    local kind = data.kind == 'ems' and 'ems' or 'police'
    cb(Alert(source, kind, data))
end)

-- power bank item (Config.Battery.PowerbankItem) charges the phone for a few minutes
CreateThread(function()
    local item = (Config.Battery or {}).PowerbankItem
    if not item or not QBCore.Shared.Items[item] then return end
    QBCore.Functions.CreateUseableItem(item, function(source, it)
        local P = QBCore.Functions.GetPlayer(source)
        if P and P.Functions.RemoveItem(item, 1, it and it.slot) then
            TriggerClientEvent('mezos-phone:client:powerbank', source)
        end
    end)
end)
