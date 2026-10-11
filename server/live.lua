--[[
    mezos-phone | Live video for Instagram, TikTok and X
    The streamer's game view is captured with `screencapture` a few times per second and relayed to the viewers.
    A viewer only gets the next picture after confirming the previous one, so slow connections never pile up.
]]
local QBCore = exports['qb-core']:GetCoreObject()
local APPS = { instagram = 'Instagram', x = 'X', tiktok = 'TikTok' }
local ICONS = { instagram = 'fab fa-instagram', x = 'fab fa-x-twitter', tiktok = 'fab fa-tiktok' }
local LIVE = Config.Live or {}
local Lives = {}    -- [hostSrc] = live
local Watching = {} -- [viewerSrc] = hostSrc
local Rate = {}

local function Limited(src, key, ms)
    local k = src .. key
    local now = GetGameTimer()
    if Rate[k] and now - Rate[k] < ms then return true end
    Rate[k] = now
    return false
end

local function Public(l)
    return {
        id = l.host, app = l.app, username = l.username, display = l.display, avatar = l.avatar, verified = l.verified,
        title = l.title, viewers = l.count, likes = l.likes, started = l.started,
    }
end

local function Send(l, payload, withHost)
    for v in pairs(l.viewers) do TriggerClientEvent('mezos-phone:client:live', v, payload) end
    if withHost then TriggerClientEvent('mezos-phone:client:live', l.host, payload) end
end

local function Account(app, cid)
    return MySQL.single.await('SELECT username, display, avatar, verified FROM mezos_social_accounts WHERE app = ? AND citizenid = ?', { app, cid })
end

local function Leave(src)
    local host = Watching[src]
    Watching[src] = nil
    local l = host and Lives[host]
    if not l or not l.viewers[src] then return end
    l.viewers[src] = nil
    l.pending[src] = nil
    l.count = math.max(0, l.count - 1)
    Send(l, { t = 'viewers', n = l.count }, true)
end

local function Stop(host, reason)
    local l = Lives[host]
    if not l then return end
    Lives[host] = nil
    for v in pairs(l.viewers) do
        Watching[v] = nil
        TriggerClientEvent('mezos-phone:client:live', v, { t = 'end', id = host, reason = reason })
    end
    TriggerClientEvent('mezos-phone:client:live:list', -1, l.app)
end

MezosPhone.IsLive = function(src) return Lives[src] ~= nil end

-- send a picture to every viewer that confirmed the previous one
local function Relay(l, data)
    l.frame = data
    l.lastFrame = GetGameTimer()
    local now = GetGameTimer()
    for v in pairs(l.viewers) do
        local p = l.pending[v]
        if not p or now - p > 5000 then
            l.pending[v] = now
            TriggerLatentClientEvent('mezos-phone:client:live:frame', v, LIVE.Bandwidth or 400000, l.host, data)
        end
    end
end

-- pictures sent by the streamer's phone (what the phone camera shows)
RegisterNetEvent('mezos-phone:server:live:frame', function(data)
    local l = Lives[source]
    if not l or type(data) ~= 'string' or #data > 400000 or not data:match('^data:image/') then return end
    l.clientFrames = true
    Relay(l, data)
end)

-- fallback: capture loop with screencapture when the phone cannot send pictures itself
local function Run(l)
    CreateThread(function()
        local interval = LIVE.Interval or 450
        local fails = 0
        while Lives[l.host] == l do
            local got, data = false, nil
            exports.screencapture:serverCapture(l.host, {
                encoding = 'webp', maxWidth = LIVE.Width or 960, maxHeight = LIVE.Height or 540,
            }, function(d)
                data = d
                got = true
            end, 'base64')
            local waited = 0
            while not got and waited < 6000 and Lives[l.host] == l do
                Wait(50)
                waited = waited + 50
            end
            if Lives[l.host] ~= l then break end
            if l.clientFrames then break end -- the phone took over
            if type(data) == 'string' and #data > 200 then
                fails = 0
                Relay(l, data)
            else
                fails = fails + 1
                if fails >= 8 then
                    TriggerClientEvent('qb-phone:client:CustomNotification', l.host, APPS[l.app], 'Live video stopped: the camera stopped responding', ICONS[l.app], '#ff3b30', 4000)
                    TriggerClientEvent('mezos-phone:client:live', l.host, { t = 'hostEnd' })
                    Stop(l.host, 'error')
                    break
                end
            end
            Wait(interval)
        end
    end)
end

QBCore.Functions.CreateCallback('mezos-phone:server:live:start', function(source, cb, arg)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or type(arg) ~= 'table' or not APPS[arg.app] then return cb({ error = 'Not available' }) end
    local clientFrames = arg.clientFrames == true
    if not clientFrames and GetResourceState('screencapture') ~= 'started' then return cb({ error = 'Live video needs the screencapture resource' }) end
    if Lives[src] then return cb({ error = 'You are already live' }) end
    local cid = Player.PlayerData.citizenid
    local acc = Account(arg.app, cid)
    if not acc then return cb({ error = 'Create an account first' }) end
    local count = 0
    for _ in pairs(Lives) do count = count + 1 end
    if count >= (LIVE.MaxStreams or 10) then return cb({ error = 'Too many live videos right now, try again later' }) end
    Leave(src)

    local title = tostring(arg.title or ''):gsub('[%c]', ''):sub(1, 60)
    local l = {
        host = src, app = arg.app, cid = cid, username = acc.username, display = acc.display, avatar = acc.avatar,
        verified = acc.verified, title = title, started = os.time(), viewers = {}, pending = {}, count = 0, likes = 0,
        comments = {},
    }
    Lives[src] = l
    if clientFrames then
        -- the phone sends the pictures; use screencapture only if nothing arrives
        SetTimeout(7000, function()
            if Lives[src] == l and not l.clientFrames and GetResourceState('screencapture') == 'started' then Run(l) end
        end)
    else
        Run(l)
    end
    cb({ ok = true })

    TriggerClientEvent('mezos-phone:client:live:list', -1, l.app)
    -- tell the followers who are online
    local followers = MySQL.query.await('SELECT follower FROM mezos_social_follows WHERE app = ? AND followed = ?', { l.app, cid }) or {}
    for _, f in ipairs(followers) do
        local P = QBCore.Functions.GetPlayerByCitizenId(f.follower)
        if P and P.PlayerData.source ~= src then
            TriggerClientEvent('mezos-phone:client:social:notify', P.PlayerData.source, l.app, {
                title = APPS[l.app], text = '@' .. l.username .. ' started a live video' .. (title ~= '' and (': ' .. title) or ''), icon = ICONS[l.app],
            })
        end
    end
end)

QBCore.Functions.CreateCallback('mezos-phone:server:live:stop', function(source, cb)
    Stop(source, 'ended')
    cb(true)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:live:list', function(source, cb, app)
    local list = {}
    for _, l in pairs(Lives) do
        if (not app or l.app == app) and l.host ~= source then list[#list + 1] = Public(l) end
    end
    table.sort(list, function(a, b) return a.viewers > b.viewers end)
    cb(list)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:live:join', function(source, cb, host)
    local src = source
    host = tonumber(host)
    local l = host and Lives[host]
    if not l then return cb({ error = 'This live video has ended' }) end
    if host == src then return cb({ error = 'This is your live video' }) end
    Leave(src)
    if l.count >= (LIVE.MaxViewers or 40) then return cb({ error = 'This live video is full' }) end
    l.viewers[src] = true
    l.count = l.count + 1
    Watching[src] = host
    local info = Public(l)
    info.comments = l.comments
    info.frame = l.frame
    cb(info)
    Send(l, { t = 'viewers', n = l.count }, true)
    local P = QBCore.Functions.GetPlayer(src)
    if P then
        local acc = Account(l.app, P.PlayerData.citizenid)
        TriggerClientEvent('mezos-phone:client:live', host, { t = 'join', user = acc and acc.username or P.PlayerData.charinfo.firstname })
    end
end)

QBCore.Functions.CreateCallback('mezos-phone:server:live:leave', function(source, cb)
    Leave(source)
    cb(true)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:live:comment', function(source, cb, text)
    local src = source
    local host = Lives[src] and src or Watching[src]
    local l = host and Lives[host]
    if not l then return cb(false) end
    if Limited(src, 'c', 1200) then return cb(false) end
    text = tostring(text or ''):gsub('[%c]', ''):gsub('^%s+', ''):gsub('%s+$', ''):sub(1, 150)
    if text == '' then return cb(false) end
    local P = QBCore.Functions.GetPlayer(src)
    if not P then return cb(false) end
    local acc = Account(l.app, P.PlayerData.citizenid)
    local c = { t = 'comment', user = acc and acc.username or (P.PlayerData.charinfo.firstname .. ' ' .. P.PlayerData.charinfo.lastname:sub(1, 1) .. '.'), avatar = acc and acc.avatar, text = text, host = src == host }
    l.comments[#l.comments + 1] = c
    if #l.comments > 40 then table.remove(l.comments, 1) end
    Send(l, c, true)
    cb(true)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:live:like', function(source, cb)
    local host = Watching[source]
    local l = host and Lives[host]
    if not l or Limited(source, 'l', 250) then return cb(false) end
    l.likes = l.likes + 1
    Send(l, { t = 'like', likes = l.likes }, true)
    cb(true)
end)

RegisterNetEvent('mezos-phone:server:live:ack', function(host)
    local src = source
    local l = Lives[tonumber(host) or -1]
    if l then l.pending[src] = nil end
end)

AddEventHandler('playerDropped', function()
    local src = source
    Leave(src)
    Stop(src, 'left')
end)
