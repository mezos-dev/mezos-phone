--[[
    mezos-phone | phone numbers are 10 digits and start with 06 or 07 (e.g. 0612345678)
    Old numbers are converted once (contacts + message threads that point to the old number are updated too).
]]
local QBCore = exports['qb-core']:GetCoreObject()

local function IsValid(num)
    return type(num) == 'string' and num:match('^0[67]%d%d%d%d%d%d%d%d$') ~= nil
end

local Taken = {}
local function NewNumber()
    for _ = 1, 200 do
        local n = '0' .. math.random(6, 7) .. math.random(10000000, 99999999)
        if not Taken[n] then
            local exists = MySQL.scalar.await('SELECT 1 FROM players WHERE JSON_UNQUOTE(JSON_EXTRACT(charinfo, "$.phone")) = ? LIMIT 1', { n })
            if not exists then
                Taken[n] = true
                return n
            end
        end
    end
end

local function MoveReferences(old, new)
    old = tostring(old)
    MySQL.update.await('UPDATE player_contacts SET number = ? WHERE number = ?', { new, old })
    MySQL.update.await('UPDATE phone_messages SET number = ? WHERE number = ?', { new, old })
end

-- online player (or one who just loaded in)
local function ConvertPlayer(Player)
    if not Player or not Player.PlayerData or not Player.PlayerData.charinfo then return end
    local ci = Player.PlayerData.charinfo
    if IsValid(tostring(ci.phone)) then return end
    local old = ci.phone
    local new = NewNumber()
    if not new then return end
    ci.phone = new
    Player.Functions.SetPlayerData('charinfo', ci)
    Player.Functions.Save()
    if old then MoveReferences(old, new) end
    print(('[mezos-phone] %s: phone number %s -> %s'):format(Player.PlayerData.citizenid, tostring(old), new))
    SetTimeout(5000, function()
        TriggerClientEvent('qb-phone:client:CustomNotification', Player.PlayerData.source, 'Carrier', 'Your new number is ' .. new, 'fas fa-sim-card', '#34c759', 8000)
    end)
end

AddEventHandler('QBCore:Server:PlayerLoaded', function(Player)
    if Config.ConvertOldNumbers then ConvertPlayer(Player) end
end)

-- convert every character in the database once on start (offline players too)
CreateThread(function()
    if not Config.ConvertOldNumbers then return end
    Wait(2000)
    local rows = MySQL.query.await("SELECT citizenid, charinfo FROM players WHERE JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.phone')) NOT REGEXP '^0[67][0-9]{8}$' OR JSON_EXTRACT(charinfo, '$.phone') IS NULL") or {}
    local count = 0
    for _, row in ipairs(rows) do
        local online = QBCore.Functions.GetPlayerByCitizenId(row.citizenid)
        if online then
            ConvertPlayer(online)
            count = count + 1
        else
            local ci = json.decode(row.charinfo or '{}') or {}
            if not IsValid(tostring(ci.phone)) then
                local old = ci.phone
                local new = NewNumber()
                if new then
                    ci.phone = new
                    MySQL.update.await('UPDATE players SET charinfo = ? WHERE citizenid = ?', { json.encode(ci), row.citizenid })
                    if old then MoveReferences(old, new) end
                    count = count + 1
                end
            end
        end
    end
    if count > 0 then print(('^2[mezos-phone] Converted %d phone numbers to the 06/07 format.^7'):format(count)) end
end)
