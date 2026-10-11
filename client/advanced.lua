--[[
    mezos-phone | advanced phone functions
    Browser data · Emergency SOS / 911 reports · Find My (live location sharing) · real flashlight · battery + charging
]]
local QBCore = exports['qb-core']:GetCoreObject()
local BAT = Config.Battery or {}
local EM = Config.Emergency or {}

local function Callback(name, cb, ...)
    local done = false
    QBCore.Functions.TriggerCallback(name, function(...)
        done = true
        cb(...)
    end, ...)
    SetTimeout(15000, function() if not done then cb(nil) end end)
end

local function Street(coords)
    local s1, s2 = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local a, b = GetStreetNameFromHashKey(s1), s2 ~= 0 and GetStreetNameFromHashKey(s2) or nil
    local zone = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z))
    return (b and b ~= '' and (a .. ' / ' .. b) or a) .. (zone and zone ~= 'NULL' and (', ' .. zone) or '')
end

-- ================= Browser =================
local VehicleCache
local function Vehicles()
    if VehicleCache then return VehicleCache end
    local list = {}
    for model, v in pairs(QBCore.Shared.Vehicles or {}) do
        if type(v) == 'table' and (tonumber(v.price) or 0) > 0 then
            list[#list + 1] = {
                model = tostring(v.model or model), name = v.name or model, brand = v.brand or '',
                price = tonumber(v.price) or 0, category = v.category or 'other', shop = type(v.shop) == 'string' and v.shop or nil,
            }
        end
    end
    table.sort(list, function(a, b) return a.price > b.price end)
    VehicleCache = list
    return list
end

RegisterNUICallback('mz:browser', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    local fn = data.fn
    if fn == 'news' then Callback('mezos-phone:server:browser:news', cb, data.arg)
    elseif fn == 'article' then Callback('mezos-phone:server:browser:article', cb, data.arg)
    elseif fn == 'publish' then Callback('mezos-phone:server:browser:publish', cb, data.arg)
    elseif fn == 'delete' then Callback('mezos-phone:server:browser:delete', cb, data.arg)
    elseif fn == 'vehicles' then cb(Vehicles())
    elseif fn == 'money' then
        local pd = QBCore.Functions.GetPlayerData()
        cb({ money = pd.money or {}, name = pd.charinfo and (pd.charinfo.firstname .. ' ' .. pd.charinfo.lastname) or '', account = pd.charinfo and pd.charinfo.account or '' })
    elseif fn == 'config' then
        local d = (Config.Browser or {}).Dealership
        cb({ allowInternet = (Config.Browser or {}).AllowInternet ~= false, homepage = (Config.Browser or {}).Homepage, dealership = d and { x = d.x, y = d.y } or nil })
    else
        cb(nil)
    end
end)

RegisterNetEvent('mezos-phone:client:breakingNews', function(a)
    SendNUIMessage({ action = 'mz:breakingNews', article = a })
end)

-- ================= Emergency =================
RegisterNUICallback('mz:emergency', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    data.street = Street(GetEntityCoords(PlayerPedId()))
    Callback('mezos-phone:server:emergency', cb, data)
end)

local LastAlert
RegisterNetEvent('mezos-phone:client:emergencyAlert', function(a)
    if type(a) ~= 'table' or type(a.coords) ~= 'table' then return end
    LastAlert = a
    local blip = AddBlipForCoord(a.coords.x + 0.0, a.coords.y + 0.0, a.coords.z + 0.0)
    SetBlipSprite(blip, a.sos and 161 or (a.kind == 'ems' and 153 or 526))
    SetBlipColour(blip, a.kind == 'ems' and 1 or 38)
    SetBlipScale(blip, a.sos and 1.3 or 1.0)
    SetBlipFlashes(blip, true)
    SetBlipAsShortRange(blip, false)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(a.sos and 'Emergency SOS' or (a.kind == 'ems' and 'EMS request' or '911 report'))
    EndTextCommandSetBlipName(blip)
    SetTimeout((tonumber(a.blip) or 120) * 1000, function() if DoesBlipExist(blip) then RemoveBlip(blip) end end)
    PlaySoundFrontend(-1, 'Event_Start_Text', 'GTAO_FM_Events_Soundset', false)
    SendNUIMessage({ action = 'mz:emergencyAlert', alert = a })
end)

RegisterNUICallback('mz:emergency:gps', function(_, cb)
    if LastAlert then SetNewWaypoint(LastAlert.coords.x + 0.0, LastAlert.coords.y + 0.0) end
    cb('ok')
end)

-- ================= Find My =================
local FindBlips, FindLast = {}, {}
RegisterNetEvent('mezos-phone:client:findmy', function(list)
    list = type(list) == 'table' and list or {}
    local seen = {}
    for _, p in ipairs(list) do
        seen[p.cid] = true
        local b = FindBlips[p.cid]
        if not b or not DoesBlipExist(b) then
            b = AddBlipForCoord(p.x + 0.0, p.y + 0.0, p.z + 0.0)
            SetBlipSprite(b, 480)
            SetBlipColour(b, 2)
            SetBlipScale(b, 0.85)
            SetBlipAsShortRange(b, false)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName('Find My: ' .. tostring(p.name))
            EndTextCommandSetBlipName(b)
            FindBlips[p.cid] = b
        else
            SetBlipCoords(b, p.x + 0.0, p.y + 0.0, p.z + 0.0)
        end
    end
    for cid, b in pairs(FindBlips) do
        if not seen[cid] then
            if DoesBlipExist(b) then RemoveBlip(b) end
            FindBlips[cid] = nil
        end
    end
    FindLast = list
end)

RegisterNUICallback('mz:findmy', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    if data.fn == 'state' then
        Callback('mezos-phone:server:findmy:state', function(st)
            if not st then return cb(nil) end
            local me = GetEntityCoords(PlayerPedId())
            local pos = {}
            for _, p in ipairs(FindLast) do pos[p.cid] = p end
            for _, p in ipairs(st.people or {}) do
                local at = pos[p.cid]
                if at then
                    local c = vector3(at.x, at.y, at.z)
                    p.street = Street(c)
                    p.distance = #(me - c)
                    p.x, p.y = at.x, at.y
                end
            end
            st.me = Street(me)
            cb(st)
        end)
    elseif data.fn == 'share' then Callback('mezos-phone:server:findmy:share', cb, data.arg)
    elseif data.fn == 'stop' then Callback('mezos-phone:server:findmy:stop', cb, data.arg)
    else cb(nil) end
end)

-- ================= Flashlight (everyone nearby sees it) =================
local Torch = false
local function SetTorch(on)
    Torch = on == true
    LocalPlayer.state:set('mzTorch', Torch, true)
    SendNUIMessage({ action = 'mz:torch', on = Torch })
end
MezosSetTorch = SetTorch

RegisterNUICallback('mz:torch', function(data, cb)
    SetTorch(type(data) == 'table' and data.on == true)
    cb('ok')
end)

CreateThread(function()
    while true do
        local sleep = 400
        local myPed = PlayerPedId()
        local myPos = GetEntityCoords(myPed)
        for _, pid in ipairs(GetActivePlayers()) do
            local ped = GetPlayerPed(pid)
            local st = Player(GetPlayerServerId(pid)).state
            if st and st.mzTorch and DoesEntityExist(ped) and not IsEntityDead(ped) then
                local pos = GetEntityCoords(ped)
                if #(pos - myPos) < 90.0 then
                    sleep = 0
                    local from = GetPedBoneCoords(ped, 57005, 0.12, 0.02, 0.0) -- right hand
                    local dir
                    if ped == myPed then
                        local rot = GetGameplayCamRot(2)
                        local rx, rz = math.rad(rot.x), math.rad(rot.z)
                        dir = vector3(-math.sin(rz) * math.abs(math.cos(rx)), math.cos(rz) * math.abs(math.cos(rx)), math.sin(rx))
                    else
                        local f = GetEntityForwardVector(ped)
                        dir = vector3(f.x, f.y, f.z - 0.12)
                    end
                    DrawSpotLight(from.x, from.y, from.z, dir.x, dir.y, dir.z, 255, 250, 235, 28.0, 4.0, 1.0, 24.0, 35.0)
                    DrawLightWithRange(from.x + dir.x * 0.3, from.y + dir.y * 0.3, from.z + dir.z * 0.3, 255, 250, 235, 1.2, 0.6)
                end
            end
        end
        if Torch and IsEntityDead(myPed) then SetTorch(false) end
        Wait(sleep)
    end
end)

-- ================= Battery =================
local Battery = { level = 100.0, charging = false, source = nil, dead = false, sent = -1, sentCharging = nil, warned = {} }
local PowerbankUntil = 0

local function Cid()
    local pd = QBCore.Functions.GetPlayerData()
    return pd and pd.citizenid
end

local function Save()
    local cid = Cid()
    if cid then SetResourceKvpFloat('mzbattery_' .. cid, Battery.level) end
end

local function Push(force)
    local lvl = math.floor(Battery.level + 0.5)
    if force or lvl ~= Battery.sent or Battery.charging ~= Battery.sentCharging then
        Battery.sent, Battery.sentCharging = lvl, Battery.charging
        SendNUIMessage({ action = 'mz:battery', level = lvl, charging = Battery.charging, source = Battery.source, enabled = BAT.Enabled ~= false })
    end
end

local function SetDead(dead)
    if Battery.dead == dead then return end
    Battery.dead = dead
    LocalPlayer.state:set('mzPhoneDead', dead, true)
    if dead then
        if Torch then SetTorch(false) end
        if PhoneData and PhoneData.isOpen then SendNUIMessage({ action = 'mz:forceClose' }) end
        QBCore.Functions.Notify('Your phone battery is dead. Charge it in a vehicle, at home or with a power bank.', 'error', 6000)
    end
end

function MezosBatteryDead()
    return BAT.Enabled ~= false and Battery.dead
end

function MezosBatteryLevel() return math.floor(Battery.level + 0.5) end
exports('GetBattery', MezosBatteryLevel)
exports('SetBattery', function(v)
    Battery.level = math.max(0, math.min(100, tonumber(v) or 100))
    if Battery.level > 2 then SetDead(false) end
    Push(true)
end)

local function ChargeSource(ped)
    if GetGameTimer() < PowerbankUntil then return 'powerbank', BAT.ChargePowerbank or 3 end
    local veh = GetVehiclePedIsIn(ped, false)
    if veh ~= 0 and GetIsVehicleEngineRunning(veh) then return 'car', BAT.ChargeVehicle or 5 end
    if (BAT.ChargeIndoors ~= false) and GetInteriorFromEntity(ped) ~= 0 and not (PhoneData and PhoneData.isOpen) then return 'home', BAT.ChargeHome or 8 end
    return nil
end

AddEventHandler('mezos-phone:client:loaded', function()
    local cid = Cid()
    if not cid then return end
    -- a new phone starts full, after that the saved level is used
    if GetResourceKvpString('mzbattery_init_' .. cid) then
        Battery.level = GetResourceKvpFloat('mzbattery_' .. cid) or 0.0
    else
        Battery.level = 100.0
        SetResourceKvp('mzbattery_init_' .. cid, '1')
    end
    Battery.warned = {}
    Battery.dead = false
    LocalPlayer.state:set('mzPhoneDead', false, true)
    if Battery.level <= 0.01 and BAT.Enabled ~= false then SetDead(true) end
    Push(true)
end)

RegisterNetEvent('mezos-phone:client:powerbank', function()
    PowerbankUntil = GetGameTimer() + (BAT.PowerbankSeconds or 180) * 1000
    QBCore.Functions.Notify('Phone is charging from the power bank', 'success')
end)

CreateThread(function()
    local lastSave = GetGameTimer()
    while true do
        Wait(1000)
        if BAT.Enabled ~= false and LocalPlayer.state.isLoggedIn then
            local ped = PlayerPedId()
            local src, rate = ChargeSource(ped)
            Battery.charging = src ~= nil
            Battery.source = src
            if src then
                Battery.level = math.min(100.0, Battery.level + 1.0 / rate)
                if Battery.dead and Battery.level >= 3 then SetDead(false) end
            else
                local open = PhoneData and PhoneData.isOpen
                local per = open and (BAT.DrainOpen or 70) or (BAT.DrainIdle or 720)
                local drain = 1.0 / per
                if Torch then drain = drain + 1.0 / (BAT.DrainTorch or 120) end
                if MezosCamera and MezosCamera.active then drain = drain + 1.0 / (BAT.DrainCamera or 150) end
                Battery.level = math.max(0.0, Battery.level - drain)
                if Battery.level <= 0.0 then SetDead(true) end
            end
            local lvl = math.floor(Battery.level + 0.5)
            for _, w in ipairs({ 20, 10, 5 }) do
                if lvl <= w and not Battery.charging and not Battery.warned[w] then
                    Battery.warned[w] = true
                    SendNUIMessage({ action = 'mz:lowBattery', level = lvl })
                    if not (PhoneData and PhoneData.isOpen) then QBCore.Functions.Notify(('Phone battery low: %d%%'):format(lvl), 'error') end
                elseif lvl > w + 5 then
                    Battery.warned[w] = nil
                end
            end
            Push(false)
            if GetGameTimer() - lastSave > 30000 then
                lastSave = GetGameTimer()
                Save()
            end
        end
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() then return end
    Save()
    for _, b in pairs(FindBlips) do if DoesBlipExist(b) then RemoveBlip(b) end end
    LocalPlayer.state:set('mzTorch', false, true)
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    Save()
    if Torch then SetTorch(false) end
end)
