--[[
    mezos-phone | iApple device: every phone item has its own serial, owner, name and passcode (item info)
    - a new phone (never set up) shows the Setup Assistant
    - a phone set up by someone else shows Activation Lock: the owner's passcode (or "Erase iPhone" when it has none)
      lets the new holder set it up again
]]
local QBCore = exports['qb-core']:GetCoreObject()
local Tries = {}

local function IsPhoneName(name)
    for _, n in ipairs(Config.PhoneItems or { 'phone' }) do
        if n == name then return true end
    end
    return false
end

--- the phone the player uses = the phone item in the lowest slot
local function ActivePhone(src)
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return nil end
    local best
    for slot, item in pairs(Player.PlayerData.items or {}) do
        if type(item) == 'table' and item.name and IsPhoneName(item.name) then
            local s = tonumber(item.slot or slot)
            if not best or s < best.slot then best = { slot = s, name = item.name, info = type(item.info) == 'table' and item.info or {} } end
        end
    end
    return best, Player
end

local function SaveInfo(src, phone, info)
    local ok = pcall(function() exports['qb-inventory']:SetItemData(src, phone.name, 'info', info, phone.slot) end)
    if not ok then
        -- other inventories: write the item back through the player data
        local Player = QBCore.Functions.GetPlayer(src)
        local item = Player and Player.PlayerData.items[phone.slot]
        if item then
            item.info = info
            Player.Functions.SetPlayerData('items', Player.PlayerData.items)
        end
    end
end

local function NewSerial()
    local chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'
    local s = 'IA'
    for _ = 1, 9 do
        local i = math.random(#chars)
        s = s .. chars:sub(i, i)
    end
    return s
end

local function Describe(phone, Player)
    local info = phone.info
    local cid = Player.PlayerData.citizenid
    local mine = info.setup == true and info.owner == cid
    return {
        setup = info.setup == true,
        mine = mine,
        serial = info.serial,
        deviceName = info.deviceName,
        ownerName = info.ownerName,
        hasPasscode = (info.passcode or '') ~= '',
        passcode = mine and (info.passcode or '') or nil, -- only the owner gets it (lock screen)
        model = phone.name,
    }
end

QBCore.Functions.CreateCallback('mezos-phone:server:device', function(source, cb)
    local phone, Player = ActivePhone(source)
    if not phone then return cb(nil) end
    if not Config.SetupAssistant then return cb({ setup = true, mine = true }) end
    cb(Describe(phone, Player))
end)

-- finished the Setup Assistant
QBCore.Functions.CreateCallback('mezos-phone:server:device:setup', function(source, cb, data)
    local phone, Player = ActivePhone(source)
    if not phone or type(data) ~= 'table' then return cb(nil) end
    local info = phone.info
    if info.setup == true and info.owner ~= Player.PlayerData.citizenid then return cb({ error = 'This iPhone is locked to another iApple ID' }) end
    local code = tostring(data.passcode or '')
    if code ~= '' and not code:match('^%d%d%d%d$') then code = '' end
    local ci = Player.PlayerData.charinfo
    info.serial = info.serial or NewSerial()
    info.setup = true
    info.owner = Player.PlayerData.citizenid
    info.ownerName = ci.firstname .. ' ' .. ci.lastname
    info.deviceName = tostring(data.deviceName or ''):gsub('[%c<>]', ''):sub(1, 30)
    if info.deviceName == '' then info.deviceName = ci.firstname .. '’s iPhone' end
    info.passcode = code
    info.activated = os.date('%Y-%m-%d')
    SaveInfo(source, phone, info)
    cb(Describe(phone, Player))
end)

-- passcode changed in Settings
QBCore.Functions.CreateCallback('mezos-phone:server:device:passcode', function(source, cb, code)
    local phone, Player = ActivePhone(source)
    if not phone or phone.info.owner ~= Player.PlayerData.citizenid then return cb(false) end
    code = tostring(code or '')
    if code ~= '' and not code:match('^%d%d%d%d$') then return cb(false) end
    phone.info.passcode = code
    SaveInfo(source, phone, phone.info)
    cb(true)
end)

-- Activation Lock: unlock with the owner's passcode / erase a phone without passcode
QBCore.Functions.CreateCallback('mezos-phone:server:device:unlock', function(source, cb, code)
    local phone = ActivePhone(source)
    if not phone then return cb({ error = 'No phone' }) end
    local now = os.time()
    local t = Tries[source] or { n = 0, at = 0 }
    if t.n >= 5 and now - t.at < 60 then return cb({ error = ('iPhone is disabled. Try again in %ds'):format(60 - (now - t.at)) }) end
    local info = phone.info
    if (info.passcode or '') ~= '' and tostring(code or '') ~= info.passcode then
        t.n, t.at = (now - t.at < 60) and t.n + 1 or 1, now
        Tries[source] = t
        return cb({ error = 'Wrong passcode' })
    end
    Tries[source] = nil
    -- erase: keep the serial, forget the owner -> the Setup Assistant starts again
    SaveInfo(source, phone, { serial = info.serial or NewSerial(), erased = os.date('%Y-%m-%d') })
    cb({ ok = true })
end)

AddEventHandler('playerDropped', function() Tries[source] = nil end)

exports('GetPhoneOwner', function(src)
    local phone = ActivePhone(src)
    return phone and phone.info.owner or nil
end)
