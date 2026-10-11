-- mezos-phone | App Store (installed apps are saved in the character metadata: phonedata.InstalledApps)
local QBCore = exports['qb-core']:GetCoreObject()
local STORE_VERSION = 2

local Catalog = {}
for _, a in ipairs(Config.Store) do Catalog[a.id] = a end

local function JobAllowed(Player, app)
    if not app.job then return true end
    return Player.PlayerData.job and Player.PlayerData.job.name == app.job
end

-- returns the phonedata table with a valid InstalledApps list (and upgrades old characters once)
local function GetPhoneData(Player)
    local pd = Player.PlayerData.metadata['phonedata'] or {}
    local apps = type(pd.InstalledApps) == 'table' and pd.InstalledApps or {}
    if apps.__v ~= STORE_VERSION then
        local fresh = {}
        for _, a in ipairs(Config.Store) do
            if a.preinstalled then fresh[a.id] = true end
        end
        -- characters that used the phone before the App Store keep their old apps
        local veteran = next(apps) ~= nil or (Player.PlayerData.metadata['phone'] and next(Player.PlayerData.metadata['phone']) ~= nil)
        if veteran then
            for _, id in ipairs(Config.LegacyApps or {}) do fresh[id] = true end
        end
        fresh.__v = STORE_VERSION
        apps = fresh
        pd.InstalledApps = apps
        pd.SeenApps = {}
        for _, a in ipairs(Config.Store) do if a.preinstalled then pd.SeenApps[a.id] = true end end
        Player.Functions.SetMetaData('phonedata', pd)
    end
    -- apps that became preinstalled in an update are added once (removing them later is respected)
    if type(pd.SeenApps) ~= 'table' then
        pd.SeenApps = { clock = true, calendar = true, weather = true, maps = true, notes = true, calculator = true }
    end
    local changed = false
    for _, a in ipairs(Config.Store) do
        if a.preinstalled and not pd.SeenApps[a.id] then
            pd.SeenApps[a.id] = true
            apps[a.id] = true
            changed = true
        end
    end
    pd.InstalledApps = apps
    if changed then Player.Functions.SetMetaData('phonedata', pd) end
    return pd
end

local function InstalledList(Player)
    local pd = GetPhoneData(Player)
    local list = {}
    for _, a in ipairs(Config.Store) do
        if (a.system or pd.InstalledApps[a.id]) and JobAllowed(Player, a) then list[#list + 1] = a.id end
    end
    return list
end
MezosPhone.InstalledList = InstalledList

local function Ratings()
    local rows = MySQL.query.await('SELECT app, AVG(rating) AS avg, COUNT(1) AS n FROM mezos_store_reviews GROUP BY app') or {}
    local r = {}
    for _, v in ipairs(rows) do r[v.app] = { avg = tonumber(v.avg) or 0, n = tonumber(v.n) or 0 } end
    return r
end

QBCore.Functions.CreateCallback('mezos-phone:server:store:get', function(source, cb)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player then return cb(nil) end
    cb({ installed = InstalledList(Player), ratings = Ratings(), balance = Player.PlayerData.money.bank })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:store:install', function(source, cb, id)
    local Player = QBCore.Functions.GetPlayer(source)
    local app = Catalog[id]
    if not Player or not app or app.system then return cb({ ok = false, error = 'This app is not available.' }) end
    if not JobAllowed(Player, app) then return cb({ ok = false, error = 'This app is not available for your job.' }) end
    local pd = GetPhoneData(Player)
    if pd.InstalledApps[id] then return cb({ ok = true, installed = InstalledList(Player) }) end
    local price = tonumber(app.price) or 0
    if price > 0 and not Player.Functions.RemoveMoney('bank', price, 'app-store-' .. id) then
        return cb({ ok = false, error = 'Not enough money in your bank account.' })
    end
    pd.InstalledApps[id] = true
    Player.Functions.SetMetaData('phonedata', pd)
    cb({ ok = true, installed = InstalledList(Player) })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:store:remove', function(source, cb, id)
    local Player = QBCore.Functions.GetPlayer(source)
    local app = Catalog[id]
    if not Player or not app or app.system then return cb({ ok = false }) end
    local pd = GetPhoneData(Player)
    pd.InstalledApps[id] = nil
    Player.Functions.SetMetaData('phonedata', pd)
    cb({ ok = true, installed = InstalledList(Player) })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:store:reviews', function(_, cb, id)
    if not Catalog[id] then return cb({}) end
    cb(MySQL.query.await('SELECT name, rating, text, created FROM mezos_store_reviews WHERE app = ? ORDER BY created DESC LIMIT 30', { id }) or {})
end)

QBCore.Functions.CreateCallback('mezos-phone:server:store:review', function(source, cb, data)
    local Player = QBCore.Functions.GetPlayer(source)
    if not Player or type(data) ~= 'table' or not Catalog[data.app] then return cb(false) end
    local rating = math.floor(tonumber(data.rating) or 0)
    if rating < 1 or rating > 5 then return cb(false) end
    local text = tostring(data.text or ''):sub(1, 300)
    local name = Player.PlayerData.charinfo.firstname .. ' ' .. Player.PlayerData.charinfo.lastname:sub(1, 1) .. '.'
    MySQL.query.await('REPLACE INTO mezos_store_reviews (app, citizenid, name, rating, text) VALUES (?, ?, ?, ?, ?)', { data.app, Player.PlayerData.citizenid, name, rating, text })
    cb(true)
end)
