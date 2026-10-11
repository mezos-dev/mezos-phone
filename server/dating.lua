-- mezos-phone | Tinder: profiles, swipe deck, matches (phone numbers are only shared after a match)
local QBCore = exports['qb-core']:GetCoreObject()
local GENDERS = { man = true, woman = true, other = true }

local function Cid(src)
    local P = QBCore.Functions.GetPlayer(src)
    return P and P.PlayerData.citizenid, P
end

local function Age(birthdate)
    local y, m, d = tostring(birthdate or ''):match('(%d%d%d%d)%-(%d%d)%-(%d%d)')
    if not y then
        d, m, y = tostring(birthdate or ''):match('(%d%d)/(%d%d)/(%d%d%d%d)')
    end
    if not y then return 25 end
    local now = os.date('*t')
    local age = now.year - tonumber(y)
    if now.month < tonumber(m) or (now.month == tonumber(m) and now.day < tonumber(d)) then age = age - 1 end
    return math.max(18, math.min(99, age))
end

local function ValidMedia(url)
    if type(url) ~= 'string' or #url > 250 then return nil end
    if url:match('^mzmedia://[%w_%-]+%.%a+$') or url:match('^mzdiscord://%d+/[%w_%-]+%.%a+$') or url:match('^https://%S+$') then return url end
end

local function PhoneOf(cid)
    local P = QBCore.Functions.GetPlayerByCitizenId(cid)
    if P then return P.PlayerData.charinfo.phone end
    local ci = MySQL.scalar.await('SELECT charinfo FROM players WHERE citizenid = ?', { cid })
    ci = ci and json.decode(ci) or {}
    return ci.phone
end

QBCore.Functions.CreateCallback('mezos-phone:server:dating:me', function(source, cb)
    local cid, P = Cid(source)
    if not cid then return cb(nil) end
    local prof = MySQL.single.await('SELECT * FROM mezos_dating_profiles WHERE citizenid = ?', { cid })
    if prof then return cb({ profile = prof }) end
    local ci = P.PlayerData.charinfo
    cb({ suggest = { name = ci.firstname, age = Age(ci.birthdate), gender = tonumber(ci.gender) == 1 and 'woman' or 'man' } })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:dating:save', function(source, cb, data)
    local cid, P = Cid(source)
    if not cid or type(data) ~= 'table' then return cb({ error = 'Something went wrong.' }) end
    local photo = ValidMedia(data.photo)
    if not photo then return cb({ error = 'Add a photo from your gallery.' }) end
    local gender = GENDERS[data.gender] and data.gender or 'other'
    local interest = (data.interest == 'man' or data.interest == 'woman') and data.interest or 'everyone'
    local name = tostring(data.name or P.PlayerData.charinfo.firstname):sub(1, 30)
    local bio = tostring(data.bio or ''):gsub('[%c]', ' '):sub(1, 300)
    MySQL.query.await([[INSERT INTO mezos_dating_profiles (citizenid, name, age, gender, interest, bio, photo, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE name = VALUES(name), gender = VALUES(gender), interest = VALUES(interest), bio = VALUES(bio), photo = VALUES(photo), active = 1]],
        { cid, name, Age(P.PlayerData.charinfo.birthdate), gender, interest, bio, photo })
    cb({ ok = true })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:dating:deck', function(source, cb)
    local cid = Cid(source)
    local me = cid and MySQL.single.await('SELECT * FROM mezos_dating_profiles WHERE citizenid = ?', { cid })
    if not me then return cb({}) end
    local rows = MySQL.query.await([[SELECT p.citizenid AS id, p.name, p.age, p.gender, p.bio, p.photo FROM mezos_dating_profiles p
        WHERE p.active = 1 AND p.citizenid <> ?
          AND (? = 'everyone' OR p.gender = ?)
          AND (p.interest = 'everyone' OR p.interest = ?)
          AND NOT EXISTS (SELECT 1 FROM mezos_dating_swipes s WHERE s.citizenid = ? AND s.target = p.citizenid)
        ORDER BY RAND() LIMIT 25]], { cid, me.interest, me.interest, me.gender, cid }) or {}
    cb(rows)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:dating:swipe', function(source, cb, target, like)
    local cid = Cid(source)
    if not cid or type(target) ~= 'string' or target == cid then return cb(nil) end
    local exists = MySQL.scalar.await('SELECT 1 FROM mezos_dating_profiles WHERE citizenid = ?', { target })
    if not exists then return cb(nil) end
    MySQL.query.await('REPLACE INTO mezos_dating_swipes (citizenid, target, liked) VALUES (?, ?, ?)', { cid, target, like and 1 or 0 })
    if not like then return cb({ match = false }) end
    local mutual = MySQL.scalar.await('SELECT 1 FROM mezos_dating_swipes WHERE citizenid = ? AND target = ? AND liked = 1', { target, cid })
    if not mutual then return cb({ match = false }) end
    local them = MySQL.single.await('SELECT citizenid AS id, name, age, photo, bio FROM mezos_dating_profiles WHERE citizenid = ?', { target })
    local mine = MySQL.single.await('SELECT name, photo FROM mezos_dating_profiles WHERE citizenid = ?', { cid })
    them.phone = PhoneOf(target)
    local T = QBCore.Functions.GetPlayerByCitizenId(target)
    if T then
        TriggerClientEvent('mezos-phone:client:dating:match', T.PlayerData.source, { id = cid, name = mine and mine.name, photo = mine and mine.photo, phone = PhoneOf(cid) })
    end
    cb({ match = true, profile = them })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:dating:matches', function(source, cb)
    local cid = Cid(source)
    if not cid then return cb({}) end
    local rows = MySQL.query.await([[SELECT p.citizenid AS id, p.name, p.age, p.photo, p.bio FROM mezos_dating_swipes a
        JOIN mezos_dating_swipes b ON b.citizenid = a.target AND b.target = a.citizenid AND b.liked = 1
        JOIN mezos_dating_profiles p ON p.citizenid = a.target
        WHERE a.citizenid = ? AND a.liked = 1]], { cid }) or {}
    for _, r in ipairs(rows) do r.phone = PhoneOf(r.id) end
    cb(rows)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:dating:unmatch', function(source, cb, target)
    local cid = Cid(source)
    if not cid or type(target) ~= 'string' then return cb(false) end
    MySQL.query.await('UPDATE mezos_dating_swipes SET liked = 0 WHERE citizenid = ? AND target = ?', { cid, target })
    cb(true)
end)

QBCore.Functions.CreateCallback('mezos-phone:server:dating:pause', function(source, cb, active)
    local cid = Cid(source)
    if not cid then return cb(false) end
    MySQL.update.await('UPDATE mezos_dating_profiles SET active = ? WHERE citizenid = ?', { active and 1 or 0, cid })
    cb(true)
end)
