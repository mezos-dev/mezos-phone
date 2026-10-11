-- mezos-phone | DarkChat: anonymous channels. Everyone gets a fixed alias per channel, nobody sees names or numbers.
local QBCore = exports['qb-core']:GetCoreObject()
local Members = {} -- [src] = { [channel] = true }

local function Cid(src)
    local P = QBCore.Functions.GetPlayer(src)
    return P and P.PlayerData.citizenid, P
end

local function Allowed(src)
    local item = Config.DarkChat and Config.DarkChat.RequiredItem
    if not item then return true end
    return QBCore.Functions.HasItem(src, item) == true
end

local function Channel(name)
    name = tostring(name or ''):lower():gsub('[^%w_%-]', '')
    if #name < 3 or #name > 24 then return nil end
    return name
end

-- same person + same channel = same alias, but it cannot be traced back
local ANIMALS = { 'Ghost', 'Raven', 'Viper', 'Wolf', 'Shadow', 'Cobra', 'Falcon', 'Phantom', 'Jackal', 'Mamba', 'Hawk', 'Lynx', 'Spectre', 'Panther' }
local SALT = GetConvar('mezos_phone_darkchat_salt', tostring(math.random(100000, 999999)) .. GetConvar('sv_hostname', 'x'))
local function Alias(cid, channel)
    local h = 5381
    local s = SALT .. cid .. '#' .. channel
    for i = 1, #s do h = ((h * 33) ~ s:byte(i)) & 0xFFFFFF end
    return ('%s-%04X'):format(ANIMALS[(h % #ANIMALS) + 1], (h >> 4) & 0xFFFF)
end

QBCore.Functions.CreateCallback('mezos-phone:server:darkchat:join', function(source, cb, name)
    local cid = Cid(source)
    if not cid then return cb({ error = 'Not available.' }) end
    if not Allowed(source) then return cb({ error = 'Connection refused. You need the right equipment.' }) end
    local ch = Channel(name)
    if not ch then return cb({ error = 'Channel names are 3-24 letters, numbers, - or _.' }) end
    Members[source] = Members[source] or {}
    Members[source][ch] = true
    local alias = Alias(cid, ch)
    local rows = MySQL.query.await('SELECT id, alias, message, UNIX_TIMESTAMP(created) AS created, citizenid FROM mezos_darkchat WHERE channel = ? ORDER BY id DESC LIMIT 80', { ch }) or {}
    local msgs = {}
    for i = #rows, 1, -1 do
        local r = rows[i]
        msgs[#msgs + 1] = { id = r.id, alias = r.alias, message = r.message, created = r.created, mine = r.citizenid == cid }
    end
    local online = 0
    for _, chans in pairs(Members) do if chans[ch] then online = online + 1 end end
    cb({ channel = ch, alias = alias, messages = msgs, online = online })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:darkchat:leave', function(source, cb, name)
    local ch = Channel(name)
    if ch and Members[source] then Members[source][ch] = nil end
    cb(true)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:darkchat:send', function(source, cb, name, message)
    local cid = Cid(source)
    local ch = Channel(name)
    message = tostring(message or ''):gsub('[%c]', ' '):sub(1, 500)
    if not cid or not ch or message:match('^%s*$') then return cb(false) end
    if not Allowed(source) then return cb(false) end
    local alias = Alias(cid, ch)
    local id = MySQL.insert.await('INSERT INTO mezos_darkchat (channel, alias, citizenid, message) VALUES (?, ?, ?, ?)', { ch, alias, cid, message })
    local msg = { id = id, alias = alias, message = message, created = os.time() }
    for src, chans in pairs(Members) do
        if chans[ch] and src ~= source then TriggerClientEvent('mezos-phone:client:darkchat:msg', src, ch, msg) end
    end
    msg.mine = true
    cb(msg)
end)

AddEventHandler('playerDropped', function() Members[source] = nil end)

-- old messages disappear after 3 days
CreateThread(function()
    Wait(10000)
    while true do
        MySQL.query('DELETE FROM mezos_darkchat WHERE created < NOW() - INTERVAL 3 DAY')
        Wait(3600000)
    end
end)
