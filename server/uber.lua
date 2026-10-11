--[[
    mezos-phone | Uber (app id 'ride')
    Riders request a ride (optionally to their map waypoint), drivers accept it.
    waiting -> accepted -> arrived -> ontrip -> done   (fare is charged from the rider and paid to the driver)
    Drivers: on-duty Config.RideJobs, or anyone who presses "Go online" (Config.Uber.AnyoneCanDrive)
]]
local QBCore = exports['qb-core']:GetCoreObject()
local U = Config.Uber or {}
local Rides, Online, Finished = {}, {}, {}
local RideId = 0

local function JobDriver(P)
    local job = P and P.PlayerData.job
    if not job or not job.onduty then return false end
    for _, j in ipairs(Config.RideJobs or {}) do
        if job.name == j then return true end
    end
    return false
end

local function IsDriver(P)
    return P ~= nil and (Online[P.PlayerData.source] == true or JobDriver(P))
end

local function Drivers()
    local list = {}
    for _, src in ipairs(QBCore.Functions.GetPlayers()) do
        local P = QBCore.Functions.GetPlayer(src)
        if IsDriver(P) then list[#list + 1] = P end
    end
    return list
end

local function Fare(km)
    return math.max(U.MinFare or 60, math.floor((U.BaseFare or 40) + km * (U.PerKm or 30)))
end

local function Dist(a, b)
    if not a or not b then return 0 end
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2) / 1000.0
end

local function DriverStats(cid)
    local r = MySQL.single.await('SELECT * FROM mezos_uber_drivers WHERE citizenid = ?', { cid })
    if not r then return { rating = 5.0, trips = 0, earnings = 0 } end
    return { rating = r.rating_count > 0 and math.floor(r.rating_sum / r.rating_count * 10 + 0.5) / 10 or 5.0, trips = r.trips, earnings = r.earnings }
end

local function Public(r)
    return {
        id = r.id, riderName = r.riderName, riderPhone = r.riderPhone, pickup = r.pickup, pickupStreet = r.pickupStreet,
        dest = r.dest, destStreet = r.destStreet, km = r.km, fare = r.fare, note = r.note, status = r.status, created = r.created,
        driverName = r.driverName, driverPhone = r.driverPhone, plate = r.plate, vehicle = r.vehicle, driverRating = r.driverRating,
    }
end

local function RideOf(src)
    for _, r in pairs(Rides) do
        if (r.rider == src or r.driver == src) and r.status ~= 'done' and r.status ~= 'cancelled' then return r end
    end
end

local function Push(r)
    TriggerClientEvent('mezos-phone:client:ride:update', r.rider, Public(r))
    if r.driver then TriggerClientEvent('mezos-phone:client:ride:update', r.driver, Public(r)) end
    for _, D in ipairs(Drivers()) do
        if D.PlayerData.source ~= r.driver then TriggerClientEvent('mezos-phone:client:ride:board', D.PlayerData.source) end
    end
end

local function Notify(src, text, color)
    TriggerClientEvent('qb-phone:client:CustomNotification', src, 'Uber', text, 'fas fa-taxi', color or '#000000', 6000)
end

QBCore.Functions.CreateCallback('mezos-phone:server:ride:state', function(source, cb)
    local P = QBCore.Functions.GetPlayer(source)
    if not P then return cb({}) end
    local open = {}
    if IsDriver(P) then
        for _, r in pairs(Rides) do
            if r.status == 'waiting' then open[#open + 1] = Public(r) end
        end
        table.sort(open, function(a, b) return a.created < b.created end)
    end
    local mine = RideOf(source)
    cb({
        isDriver = IsDriver(P), online = Online[source] == true, jobDriver = JobDriver(P), canDrive = U.AnyoneCanDrive == true or JobDriver(P),
        drivers = #Drivers(), current = mine and Public(mine) or nil, mineAsDriver = mine and mine.driver == source or false, open = open,
        stats = DriverStats(P.PlayerData.citizenid), balance = P.PlayerData.money.bank,
        pricing = { base = U.BaseFare or 40, perKm = U.PerKm or 30, min = U.MinFare or 60 },
    })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:ride:request', function(source, cb, data)
    local src = source
    local P = QBCore.Functions.GetPlayer(src)
    if not P or RideOf(src) then return cb({ error = 'You already have a ride.' }) end
    local drivers = Drivers()
    local others = 0
    for _, D in ipairs(drivers) do if D.PlayerData.source ~= src then others = others + 1 end end
    if others == 0 then return cb({ error = 'No drivers are online right now. Try again in a moment.' }) end
    data = type(data) == 'table' and data or {}
    local c = GetEntityCoords(GetPlayerPed(src))
    local dest = type(data.dest) == 'table' and tonumber(data.dest.x) and { x = tonumber(data.dest.x), y = tonumber(data.dest.y) } or nil
    local pickup = { x = c.x, y = c.y, z = c.z }
    local km = dest and Dist(pickup, dest) or nil
    RideId = RideId + 1
    local ci = P.PlayerData.charinfo
    local r = {
        id = RideId, rider = src, riderCid = P.PlayerData.citizenid, riderName = ci.firstname .. ' ' .. ci.lastname, riderPhone = ci.phone,
        pickup = pickup, pickupStreet = tostring(data.street or ''):sub(1, 60), dest = dest, destStreet = tostring(data.destStreet or ''):sub(1, 60),
        km = km and math.floor(km * 10 + 0.5) / 10 or nil, fare = km and Fare(km) or nil,
        note = tostring(data.note or ''):sub(1, 120), status = 'waiting', created = os.time(),
    }
    if r.fare and P.PlayerData.money.bank < r.fare then return cb({ error = ('You need $%d in your bank for this ride.'):format(r.fare) }) end
    Rides[r.id] = r
    for _, D in ipairs(drivers) do
        if D.PlayerData.source ~= src then
            Notify(D.PlayerData.source, ('New ride request%s%s'):format(r.pickupStreet ~= '' and (' at ' .. r.pickupStreet) or '', r.fare and (' · $' .. r.fare) or ''))
        end
    end
    Push(r)
    cb({ ok = true, ride = Public(r) })
end)

local function Pay(r, P)
    local Rider = QBCore.Functions.GetPlayer(r.rider)
    local fare = r.fare
    if not fare then
        local c = Rider and GetEntityCoords(GetPlayerPed(r.rider)) or nil
        fare = Fare(c and Dist(r.pickup, { x = c.x, y = c.y }) or 0)
        r.fare = fare
    end
    local paid = false
    if Rider then
        paid = Rider.Functions.RemoveMoney('bank', fare, 'uber-ride') or Rider.Functions.RemoveMoney('cash', fare, 'uber-ride')
    end
    if paid then
        P.Functions.AddMoney('bank', fare, 'uber-fare')
        Notify(r.driver, ('Trip complete - you earned $%d'):format(fare), '#30d158')
        Notify(r.rider, ('Thanks for riding! $%d was paid to %s.'):format(fare, r.driverName), '#000000')
    else
        Notify(r.driver, 'The rider could not pay for this trip.', '#ff3b30')
    end
    MySQL.query.await([[INSERT INTO mezos_uber_drivers (citizenid, trips, earnings) VALUES (?, 1, ?)
        ON DUPLICATE KEY UPDATE trips = trips + 1, earnings = earnings + VALUES(earnings)]], { P.PlayerData.citizenid, paid and fare or 0 })
    Finished[r.id] = { driverCid = P.PlayerData.citizenid, rider = r.rider }
    TriggerClientEvent('mezos-phone:client:ride:rate', r.rider, { id = r.id, driverName = r.driverName, fare = fare, paid = paid })
end

QBCore.Functions.CreateCallback('mezos-phone:server:ride:action', function(source, cb, id, action)
    local src = source
    local P = QBCore.Functions.GetPlayer(src)
    if not P then return cb({ error = 'Not allowed.' }) end
    if action == 'online' or action == 'offline' then
        if action == 'online' and not (U.AnyoneCanDrive or JobDriver(P)) then return cb({ error = 'Only taxi drivers can drive.' }) end
        if action == 'offline' and RideOf(src) and RideOf(src).driver == src then return cb({ error = 'Finish your trip first.' }) end
        Online[src] = action == 'online' or nil
        return cb({ ok = true })
    end
    local r = Rides[tonumber(id) or -1]
    if not r then return cb({ error = 'This ride no longer exists.' }) end
    if action == 'accept' then
        if not IsDriver(P) or r.status ~= 'waiting' then return cb({ error = 'Someone else took this ride.' }) end
        if r.rider == src then return cb({ error = 'You cannot drive yourself.' }) end
        if RideOf(src) then return cb({ error = 'Finish your current trip first.' }) end
        local ci = P.PlayerData.charinfo
        r.driver, r.driverName, r.driverPhone, r.status = src, ci.firstname .. ' ' .. ci.lastname, ci.phone, 'accepted'
        r.driverRating = DriverStats(P.PlayerData.citizenid).rating
        local veh = GetVehiclePedIsIn(GetPlayerPed(src), false)
        if veh ~= 0 then r.plate = GetVehicleNumberPlateText(veh) end
        Notify(r.rider, r.driverName .. ' is on the way!')
        TriggerClientEvent('mezos-phone:client:ride:waypoint', src, r.pickup)
    elseif action == 'arrived' and r.driver == src and r.status == 'accepted' then
        r.status = 'arrived'
        Notify(r.rider, 'Your Uber has arrived.')
    elseif action == 'start' and r.driver == src and (r.status == 'arrived' or r.status == 'accepted') then
        r.status = 'ontrip'
        if r.dest then TriggerClientEvent('mezos-phone:client:ride:waypoint', src, r.dest) end
        Notify(r.rider, 'Your trip has started. Enjoy the ride!')
    elseif action == 'complete' and r.driver == src and r.status == 'ontrip' then
        r.status = 'done'
        Pay(r, P)
    elseif action == 'cancel' and (r.rider == src or r.driver == src) then
        if r.driver == src and r.rider ~= src then
            r.driver, r.driverName, r.driverPhone, r.plate, r.status = nil, nil, nil, nil, 'waiting'
            Notify(r.rider, 'Your driver cancelled - finding you another one.', '#ff3b30')
            TriggerClientEvent('mezos-phone:client:ride:update', src, nil)
        else
            r.status = 'cancelled'
            if r.driver then Notify(r.driver, 'The rider cancelled the trip.', '#ff3b30') end
        end
    else
        return cb({ error = 'Not allowed right now.' })
    end
    Push(r)
    if r.status == 'done' or r.status == 'cancelled' then Rides[r.id] = nil end
    cb({ ok = true })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:ride:rate', function(source, cb, id, stars)
    local f = Finished[tonumber(id) or -1]
    stars = math.floor(tonumber(stars) or 0)
    if not f or f.rider ~= source or stars < 1 or stars > 5 then return cb(false) end
    Finished[tonumber(id)] = nil
    MySQL.query.await([[INSERT INTO mezos_uber_drivers (citizenid, rating_sum, rating_count) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE rating_sum = rating_sum + VALUES(rating_sum), rating_count = rating_count + 1]], { f.driverCid, stars })
    cb(true)
end)

AddEventHandler('playerDropped', function()
    local src = source
    Online[src] = nil
    for id, r in pairs(Rides) do
        if r.rider == src then
            r.status = 'cancelled'
            if r.driver then TriggerClientEvent('mezos-phone:client:ride:update', r.driver, Public(r)) end
            Rides[id] = nil
        elseif r.driver == src then
            r.driver, r.driverName, r.driverPhone, r.plate, r.status = nil, nil, nil, nil, 'waiting'
            Push(r)
        end
    end
end)
