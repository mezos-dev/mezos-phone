-- mezos-phone | NUI bridge for the new apps (App Store, Instagram, X, TikTok, Marketplace, Ride, Radio, Health, AirDrop)
local QBCore = exports['qb-core']:GetCoreObject()

local function Callback(name, cb, ...)
    local done = false
    QBCore.Functions.TriggerCallback(name, function(...)
        done = true
        cb(...)
    end, ...)
    SetTimeout(15000, function() if not done then cb(nil) end end)
end

-- https address of the server's media files ('' = use the game-connection fallback only)
local function MediaBase()
    return GlobalState.mezosMediaBase or ''
end

AddStateBagChangeHandler('mezosMediaBase', 'global', function(_, _, value)
    SendNUIMessage({ action = 'mz:mediaBase', base = value or '' })
end)

-- photos / videos the page cannot load directly are sent through the game connection
local MediaReq, MediaSeq = {}, 0
RegisterNUICallback('mz:media', function(data, cb)
    if type(data) == 'table' and data.discord then
        -- fresh Discord link for mzdiscord://<id>/<file>
        return Callback('mezos-phone:server:media:link', function(url) cb(url and { url = url } or nil) end, tostring(data.discord))
    end
    local name = type(data) == 'table' and data.name
    if type(name) ~= 'string' or not name:match('^[%w_%-]+%.%a+$') then return cb(nil) end
    MediaSeq = MediaSeq + 1
    local id = MediaSeq
    MediaReq[id] = cb
    TriggerServerEvent('mezos-phone:server:media:fetch', id, name)
    SetTimeout(90000, function()
        if MediaReq[id] then MediaReq[id](nil) MediaReq[id] = nil end
    end)
end)

RegisterNetEvent('mezos-phone:client:media', function(id, mime, b64)
    local cb = MediaReq[id]
    if not cb then return end
    MediaReq[id] = nil
    cb(b64 and { mime = mime, data = b64 } or nil)
end)

-- ================= boot data =================
RegisterNUICallback('mz:boot', function(_, cb)
    Callback('mezos-phone:server:store:get', function(data)
        data = data or {}
        local stations = {}
        for i, s in ipairs(Config.RadioStations or {}) do stations[i] = s end
        cb({
            installed = data.installed or {},
            ratings = data.ratings or {},
            catalog = Config.Store,
            mediaBase = MediaBase(),
            stations = stations,
            maxVideo = (Config.Media and Config.Media.MaxVideoSeconds) or 30,
        })
    end)
end)

AddEventHandler('mezos-phone:client:loaded', function()
    Callback('mezos-phone:server:store:get', function(data)
        if data then SendNUIMessage({ action = 'mz:installed', installed = data.installed, mediaBase = MediaBase() }) end
    end)
end)

local lastJob
AddEventHandler('QBCore:Client:OnJobUpdate', function(job)
    local key = job and job.name or ''
    if key == lastJob then return end -- only when the job really changes (MDT app etc.)
    lastJob = key
    Callback('mezos-phone:server:store:get', function(data)
        if data then SendNUIMessage({ action = 'mz:installed', installed = data.installed }) end
    end)
end)

-- ================= App Store =================
RegisterNUICallback('mz:store', function(data, cb)
    local fn = data and data.fn
    if fn == 'get' then
        Callback('mezos-phone:server:store:get', cb)
    elseif fn == 'install' then
        Callback('mezos-phone:server:store:install', cb, data.id)
    elseif fn == 'remove' then
        Callback('mezos-phone:server:store:remove', cb, data.id)
    elseif fn == 'reviews' then
        Callback('mezos-phone:server:store:reviews', cb, data.id)
    elseif fn == 'review' then
        Callback('mezos-phone:server:store:review', cb, data)
    else
        cb(nil)
    end
end)

-- ================= Social (instagram / x / tiktok) =================
local SocialFns = {
    me = true, signup = true, updateProfile = true, feed = true, thread = true, profile = true, search = true,
    trends = true, notifications = true, post = true, delete = true, like = true, follow = true,
}
RegisterNUICallback('mz:social', function(data, cb)
    if type(data) ~= 'table' or not SocialFns[data.fn] then return cb(nil) end
    if data.fn == 'delete' or data.fn == 'like' or data.fn == 'thread' then
        Callback('mezos-phone:server:social:' .. data.fn, cb, data.arg)
    else
        Callback('mezos-phone:server:social:' .. data.fn, cb, data.app, data.arg)
    end
end)

RegisterNetEvent('mezos-phone:client:social:notify', function(app, n)
    SendNUIMessage({ action = 'mz:social:notify', app = app, notify = n })
end)

RegisterNetEvent('mezos-phone:client:social:newPost', function(app, info)
    local me = PhoneData and PhoneData.PlayerData and PhoneData.PlayerData.citizenid
    if info and info.citizenid == me then return end
    SendNUIMessage({ action = 'mz:social:newPost', app = app, info = { id = info and info.id, username = info and info.username } })
end)

-- ================= Marketplace =================
RegisterNUICallback('mz:market', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    if data.fn == 'list' then
        Callback('mezos-phone:server:market:list', cb, data.arg)
    elseif data.fn == 'create' then
        Callback('mezos-phone:server:market:create', cb, data.arg)
    elseif data.fn == 'update' then
        Callback('mezos-phone:server:market:update', cb, data.id, data.op)
    else
        cb(nil)
    end
end)

RegisterNetEvent('mezos-phone:client:market:new', function(item)
    SendNUIMessage({ action = 'mz:market:new', item = item })
end)

-- ================= Ride =================
local function StreetName()
    local c = GetEntityCoords(PlayerPedId())
    local s1, s2 = GetStreetNameAtCoord(c.x, c.y, c.z)
    local name = GetStreetNameFromHashKey(s1)
    if s2 ~= 0 then name = name .. ' / ' .. GetStreetNameFromHashKey(s2) end
    return name
end

-- map waypoint (Uber destination)
local function WaypointInfo()
    local blip = GetFirstBlipInfoId(8)
    if not DoesBlipExist(blip) then return nil end
    local c = GetBlipInfoIdCoord(blip)
    local s1, s2 = GetStreetNameAtCoord(c.x, c.y, 0.0)
    local name = GetStreetNameFromHashKey(s1)
    local zone = GetLabelText(GetNameOfZone(c.x, c.y, 0.0))
    if zone and zone ~= 'NULL' and zone ~= '' then name = name .. ', ' .. zone end
    return { x = c.x, y = c.y, street = name }
end

RegisterNUICallback('mz:ride', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    if data.fn == 'state' then
        Callback('mezos-phone:server:ride:state', cb)
    elseif data.fn == 'request' then
        local req = { street = StreetName(), note = data.note }
        local dest = WaypointInfo()
        if dest and data.useWaypoint ~= false then req.dest, req.destStreet = { x = dest.x, y = dest.y }, dest.street end
        Callback('mezos-phone:server:ride:request', cb, req)
    elseif data.fn == 'waypoint' then
        local dest = WaypointInfo()
        if not dest then return cb({}) end
        local me = GetEntityCoords(PlayerPedId())
        cb({ street = dest.street, km = math.floor(#(vector2(dest.x, dest.y) - me.xy) / 100 + 0.5) / 10 })
    elseif data.fn == 'rate' then
        Callback('mezos-phone:server:ride:rate', cb, data.id, data.stars)
    elseif data.fn == 'action' then
        Callback('mezos-phone:server:ride:action', cb, data.id, data.op)
    elseif data.fn == 'gps' and data.coords then
        SetNewWaypoint(data.coords.x + 0.0, data.coords.y + 0.0)
        cb('ok')
    else
        cb(nil)
    end
end)

RegisterNetEvent('mezos-phone:client:ride:update', function(ride)
    SendNUIMessage({ action = 'mz:ride:update', ride = ride })
end)

RegisterNetEvent('mezos-phone:client:ride:board', function()
    SendNUIMessage({ action = 'mz:ride:board' })
end)

RegisterNetEvent('mezos-phone:client:ride:rate', function(info)
    SendNUIMessage({ action = 'mz:ride:rate', info = info })
end)

RegisterNetEvent('mezos-phone:client:ride:waypoint', function(coords)
    if coords then
        SetNewWaypoint(coords.x + 0.0, coords.y + 0.0)
        QBCore.Functions.Notify('GPS set to your rider', 'success')
    end
end)

-- ================= Radio (GTA stations everywhere) =================
local Radio = { station = nil }

local function RadioStop()
    Radio.station = nil
    SetMobileRadioEnabledDuringGameplay(false)
    SetMobilePhoneRadioState(false)
    SendNUIMessage({ action = 'mz:radio', station = nil })
end

local function RadioPlay(id)
    Radio.station = id
    SetAudioFlag('MobileRadioInGame', true)
    SetAudioFlag('AllowRadioDuringSwitch', true)
    SetMobileRadioEnabledDuringGameplay(true)
    SetMobilePhoneRadioState(true)
    SetRadioToStationName(id)
    local veh = GetVehiclePedIsIn(PlayerPedId(), false)
    if veh ~= 0 then
        SetVehRadioStation(veh, id)
    end
    SendNUIMessage({ action = 'mz:radio', station = id })
end

RegisterNUICallback('mz:radio', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    if data.fn == 'play' and type(data.id) == 'string' then
        RadioPlay(data.id)
    elseif data.fn == 'stop' then
        RadioStop()
    end
    cb({ station = Radio.station })
end)

CreateThread(function()
    while true do
        if Radio.station then
            -- keep the station after entering / leaving vehicles
            local veh = GetVehiclePedIsIn(PlayerPedId(), false)
            if veh ~= 0 then
                if GetPlayerRadioStationName() ~= Radio.station and GetPedInVehicleSeat(veh, -1) == PlayerPedId() then
                    SetVehRadioStation(veh, Radio.station)
                end
            else
                SetMobilePhoneRadioState(true)
                SetMobileRadioEnabledDuringGameplay(true)
            end
            Wait(1000)
        else
            Wait(2000)
        end
    end
end)

-- ================= Health =================
local Steps = { day = '', steps = 0, km = 0.0 }
local function StepsKey()
    local cid = PhoneData and PhoneData.PlayerData and PhoneData.PlayerData.citizenid or 'unknown'
    return 'mezos_phone_steps_' .. cid
end

local function Today()
    local y, m, d = GetLocalTime()
    return ('%d-%02d-%02d'):format(y, m, d)
end

local function LoadSteps()
    local raw = GetResourceKvpString(StepsKey())
    local d = raw and json.decode(raw) or {}
    if d.day ~= Today() then d = { day = Today(), steps = 0, km = 0.0, history = d.history or {} } end
    Steps = d
    Steps.history = Steps.history or {}
end

AddEventHandler('mezos-phone:client:loaded', LoadSteps)

CreateThread(function()
    Wait(3000)
    LoadSteps()
    local last = GetEntityCoords(PlayerPedId())
    local saveTick = 0
    while true do
        Wait(1000)
        local ped = PlayerPedId()
        local pos = GetEntityCoords(ped)
        if not IsPedInAnyVehicle(ped, false) and not IsPedFalling(ped) and not IsPedSwimming(ped) and not IsPedRagdoll(ped) then
            local dist = #(pos.xy - last.xy)
            if dist > 0.3 and dist < 12.0 then
                Steps.steps = Steps.steps + math.floor(dist / 0.75)
                Steps.km = Steps.km + dist / 1000.0
            end
        end
        last = pos
        saveTick = saveTick + 1
        if saveTick >= 30 then
            saveTick = 0
            if Steps.day ~= Today() then
                Steps.history = Steps.history or {}
                table.insert(Steps.history, 1, { day = Steps.day, steps = Steps.steps })
                while #Steps.history > 6 do table.remove(Steps.history) end
                Steps.day, Steps.steps, Steps.km = Today(), 0, 0.0
            end
            SetResourceKvp(StepsKey(), json.encode(Steps))
        end
    end
end)

RegisterNUICallback('mz:health', function(_, cb)
    local ped = PlayerPedId()
    local pd = QBCore.Functions.GetPlayerData()
    local meta = pd.metadata or {}
    cb({
        health = math.max(0, math.min(100, GetEntityHealth(ped) - 100)),
        armor = GetPedArmour(ped),
        hunger = math.floor(tonumber(meta.hunger) or 100),
        thirst = math.floor(tonumber(meta.thirst) or 100),
        stress = math.floor(tonumber(meta.stress) or 0),
        blood = meta.bloodtype or '?',
        steps = Steps.steps or 0,
        km = math.floor((Steps.km or 0) * 100) / 100,
        history = Steps.history or {},
    })
end)

-- ================= AirDrop =================
RegisterNUICallback('mz:airdrop:nearby', function(_, cb)
    local me = PlayerId()
    local myPos = GetEntityCoords(PlayerPedId())
    local ids = {}
    for _, p in ipairs(GetActivePlayers()) do
        if p ~= me and #(GetEntityCoords(GetPlayerPed(p)) - myPos) < 5.0 then
            ids[#ids + 1] = GetPlayerServerId(p)
        end
    end
    if #ids == 0 then return cb({}) end
    Callback('mezos-phone:server:nearbyNames', function(list) cb(list or {}) end, ids)
end)

RegisterNUICallback('mz:airdrop:send', function(data, cb)
    if data and data.target and data.url then
        TriggerServerEvent('mezos-phone:server:airdrop', data.target, data.url)
    end
    cb('ok')
end)

RegisterNUICallback('mz:airdrop:answer', function(data, cb)
    TriggerServerEvent('mezos-phone:server:airdropAnswer', data and data.accept == true)
    cb('ok')
end)

RegisterNetEvent('mezos-phone:client:airdropOffer', function(offer)
    SendNUIMessage({ action = 'mz:airdrop:offer', offer = offer })
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() and Radio.station then
        SetMobileRadioEnabledDuringGameplay(false)
        SetMobilePhoneRadioState(false)
    end
end)

-- ================= Tinder =================
local DatingFns = { me = true, save = true, deck = true, swipe = true, matches = true, unmatch = true, pause = true }
RegisterNUICallback('mz:dating', function(data, cb)
    if type(data) ~= 'table' or not DatingFns[data.fn] then return cb(nil) end
    if data.fn == 'swipe' then
        Callback('mezos-phone:server:dating:swipe', cb, data.id, data.like == true)
    else
        Callback('mezos-phone:server:dating:' .. data.fn, cb, data.arg)
    end
end)

RegisterNetEvent('mezos-phone:client:dating:match', function(profile)
    SendNUIMessage({ action = 'mz:dating:match', profile = profile })
end)

-- ================= 1xBet =================
RegisterNUICallback('mz:bet', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    if data.fn == 'matches' then
        Callback('mezos-phone:server:bet:matches', cb)
    elseif data.fn == 'mine' then
        Callback('mezos-phone:server:bet:mine', cb)
    elseif data.fn == 'place' then
        Callback('mezos-phone:server:bet:place', cb, data.match, data.pick, data.stake)
    else
        cb(nil)
    end
end)

-- ================= DarkChat =================
RegisterNUICallback('mz:darkchat', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    if data.fn == 'join' or data.fn == 'leave' then
        Callback('mezos-phone:server:darkchat:' .. data.fn, cb, data.channel)
    elseif data.fn == 'send' then
        Callback('mezos-phone:server:darkchat:send', cb, data.channel, data.message)
    else
        cb(nil)
    end
end)

RegisterNetEvent('mezos-phone:client:darkchat:msg', function(channel, msg)
    SendNUIMessage({ action = 'mz:darkchat:msg', channel = channel, msg = msg })
end)

-- ================= Live video (Instagram / TikTok / X) =================
local LiveFns = { start = true, stop = true, list = true, join = true, leave = true, comment = true, like = true }
RegisterNUICallback('mz:live', function(data, cb)
    if type(data) ~= 'table' or not LiveFns[data.fn] then return cb(nil) end
    Callback('mezos-phone:server:live:' .. data.fn, cb, data.arg)
end)

RegisterNetEvent('mezos-phone:client:live', function(payload)
    SendNUIMessage({ action = 'mz:live', data = payload })
end)

RegisterNetEvent('mezos-phone:client:live:list', function(app)
    SendNUIMessage({ action = 'mz:live:list', app = app })
end)

RegisterNetEvent('mezos-phone:client:live:frame', function(host, frame)
    SendNUIMessage({ action = 'mz:live:frame', host = host, frame = frame })
    TriggerServerEvent('mezos-phone:server:live:ack', host)
end)
