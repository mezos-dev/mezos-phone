--[[
    mezos-phone | Find My: share your live location with contacts
    Shares live in memory (they end on a server restart). Positions are sent every few seconds to the people you share with.
]]
local QBCore = exports['qb-core']:GetCoreObject()
local Shares = {} -- [ownerCid] = { [targetCid] = { expires = os.time() | 0, name = targetName } }

local function Name(P) return P.PlayerData.charinfo.firstname .. ' ' .. P.PlayerData.charinfo.lastname end

local function CidByPhone(number)
    number = tostring(number or ''):gsub('%s', '')
    if number == '' then return nil end
    local P = QBCore.Functions.GetPlayerByPhone(number)
    if P then return P.PlayerData.citizenid, Name(P) end
    local row = MySQL.single.await("SELECT citizenid, charinfo FROM players WHERE JSON_UNQUOTE(JSON_EXTRACT(charinfo, '$.phone')) = ? LIMIT 1", { number })
    if not row then return nil end
    local ci = json.decode(row.charinfo or '{}') or {}
    return row.citizenid, ((ci.firstname or '') .. ' ' .. (ci.lastname or ''))
end

local function Expired(s) return s.expires ~= 0 and s.expires < os.time() end

QBCore.Functions.CreateCallback('mezos-phone:server:findmy:state', function(source, cb)
    local P = QBCore.Functions.GetPlayer(source)
    if not P then return cb(nil) end
    local cid = P.PlayerData.citizenid
    local mine = {}
    for target, s in pairs(Shares[cid] or {}) do
        if not Expired(s) then mine[#mine + 1] = { cid = target, name = s.name, number = s.number, expires = s.expires } end
    end
    local people = {}
    for owner, list in pairs(Shares) do
        local s = list[cid]
        if s and not Expired(s) then
            local O = QBCore.Functions.GetPlayerByCitizenId(owner)
            people[#people + 1] = { cid = owner, name = s.ownerName, number = s.ownerNumber, online = O ~= nil, expires = s.expires }
        end
    end
    cb({ sharing = mine, people = people, now = os.time() })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:findmy:share', function(source, cb, data)
    local P = QBCore.Functions.GetPlayer(source)
    if not P or type(data) ~= 'table' then return cb({ error = 'Not available' }) end
    local target, tname = CidByPhone(data.number)
    if not target then return cb({ error = 'No one has this number' }) end
    local cid = P.PlayerData.citizenid
    if target == cid then return cb({ error = 'That is your own number' }) end
    local minutes = tonumber(data.minutes) or 60
    Shares[cid] = Shares[cid] or {}
    Shares[cid][target] = {
        expires = minutes > 0 and (os.time() + math.floor(minutes) * 60) or 0,
        name = tname, number = tostring(data.number), ownerName = Name(P), ownerNumber = P.PlayerData.charinfo.phone,
    }
    local T = QBCore.Functions.GetPlayerByCitizenId(target)
    if T then
        TriggerClientEvent('qb-phone:client:CustomNotification', T.PlayerData.source, 'Find My',
            Name(P) .. ' is sharing their location with you', 'fas fa-location-dot', '#30d158', 5000)
    end
    cb({ ok = true, name = tname })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:findmy:stop', function(source, cb, target)
    local P = QBCore.Functions.GetPlayer(source)
    if not P then return cb(false) end
    local list = Shares[P.PlayerData.citizenid]
    if list then
        if target then list[tostring(target)] = nil else Shares[P.PlayerData.citizenid] = nil end
    end
    cb(true)
end)

-- send positions to the people who can see them
CreateThread(function()
    local hadData = {}
    while true do
        Wait(4000)
        local outgoing = {} -- [targetSrc] = list
        for owner, list in pairs(Shares) do
            local O = QBCore.Functions.GetPlayerByCitizenId(owner)
            local ped = O and GetPlayerPed(O.PlayerData.source)
            local c = ped and ped ~= 0 and GetEntityCoords(ped)
            local any = false
            for target, s in pairs(list) do
                if Expired(s) then
                    list[target] = nil
                else
                    any = true
                    local T = c and QBCore.Functions.GetPlayerByCitizenId(target)
                    if T then
                        local t = T.PlayerData.source
                        outgoing[t] = outgoing[t] or {}
                        outgoing[t][#outgoing[t] + 1] = { cid = owner, name = s.ownerName, x = c.x, y = c.y, z = c.z }
                    end
                end
            end
            if not any then Shares[owner] = nil end
        end
        for src, list in pairs(outgoing) do
            TriggerClientEvent('mezos-phone:client:findmy', src, list)
            hadData[src] = true
        end
        for src in pairs(hadData) do
            if not outgoing[src] then
                TriggerClientEvent('mezos-phone:client:findmy', src, {})
                hadData[src] = nil
            end
        end
    end
end)
