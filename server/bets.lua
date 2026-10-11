--[[
    mezos-phone | 1xBet (app id 'bet')
    The server runs virtual matches (football, basketball, UFC) all the time. Odds come from a Monte-Carlo
    simulation of the same engine that plays the match, so they are fair minus Config.Bets.Margin.
    Bets are paid from / to the bank. Pending bets from a previous server session are refunded on start.
]]
local QBCore = exports['qb-core']:GetCoreObject()
local B = Config.Bets or {}
local MARGIN = B.Margin or 0.07

local TEAMS = {
    football = {
        { 'Los Santos FC', 86 }, { 'Vinewood United', 82 }, { 'Del Perro Athletic', 78 }, { 'Rockford Hills', 76 },
        { 'Vespucci Beach', 72 }, { 'Mirror Park City', 70 }, { 'Sandy Shores AFC', 62 }, { 'Paleto Bay Rovers', 60 },
        { 'La Mesa Wanderers', 66 }, { 'Chumash Coast', 64 },
    },
    basketball = {
        { 'LS Panic', 85 }, { 'Vinewood Stars', 82 }, { 'Liberty City Salamanders', 80 }, { 'San Fierro Fog', 76 },
        { 'Blaine County Bulls', 70 }, { 'Davis Hustlers', 73 },
    },
    ufc = {
        { 'Marcus "The Hammer" Reed', 84 }, { 'Diego Alvarez', 80 }, { 'Ivan Volkov', 82 }, { 'Kenji Sato', 77 },
        { 'Tyrone "Iron" Banks', 75 }, { 'Luca Romano', 72 }, { 'Andre Silva', 79 }, { 'Jamal Carter', 70 },
    },
}
local LEAGUE = { football = 'San Andreas Premier League', basketball = 'SABL', ufc = 'UFC Fight Night Los Santos' }
local DURATION = { football = 360, basketball = 300, ufc = 180 } -- real seconds a match is live
local TICKS = { football = 18, basketball = 24, ufc = 3 }

local Matches, MatchId = {}, 0

-- ---------- simulation ----------
local function SimTick(sport, hs, as, st)
    if sport == 'football' then
        local lh = 1.45 * (hs / as) ^ 1.6 / TICKS.football
        local la = 1.15 * (as / hs) ^ 1.6 / TICKS.football
        return (math.random() < lh) and 1 or 0, (math.random() < la) and 1 or 0
    elseif sport == 'basketball' then
        local base = 105 / TICKS.basketball
        return math.max(0, math.floor(base * (hs / as) ^ 0.5 + (math.random() - 0.5) * 8 + 0.5)),
               math.max(0, math.floor(base * 0.97 * (as / hs) ^ 0.5 + (math.random() - 0.5) * 8 + 0.5))
    end
    return 0, 0
end

local function UfcWinner(hs, as)
    local p = hs ^ 3 / (hs ^ 3 + as ^ 3)
    return math.random() < p and 'home' or 'away'
end

local function SimFull(sport, hs, as)
    if sport == 'ufc' then return UfcWinner(hs, as) end
    local h, a = 0, 0
    for _ = 1, TICKS[sport] do
        local dh, da = SimTick(sport, hs, as)
        h, a = h + dh, a + da
    end
    if h > a then return 'home' elseif a > h then return 'away' end
    return sport == 'football' and 'draw' or (math.random() < hs / (hs + as) and 'home' or 'away')
end

local function MakeOdds(sport, hs, as)
    local n, c = 1500, { home = 0, draw = 0, away = 0 }
    local yieldable = coroutine.isyieldable()
    for i = 1, n do
        if yieldable and i % 300 == 0 then Wait(0) end
        local r = SimFull(sport, hs, as)
        c[r] = c[r] + 1
    end
    local odds = {}
    for k, v in pairs(c) do
        if v > 0 and not (k == 'draw' and sport ~= 'football') then
            local p = v / n
            odds[k] = math.max(1.02, math.floor(100 / (p * (1 + MARGIN))) / 100)
        end
    end
    return odds
end

local function NewMatch(sport, startIn)
    local list = TEAMS[sport]
    local i = math.random(#list)
    local j
    repeat j = math.random(#list) until j ~= i
    local h, a = list[i], list[j]
    local hs, as = h[2] + math.random(-4, 4), a[2] + math.random(-4, 4)
    MatchId = MatchId + 1
    Matches[MatchId] = {
        id = MatchId, sport = sport, league = LEAGUE[sport], home = h[1], away = a[1], hs = hs, as = as,
        odds = MakeOdds(sport, hs, as), kickoff = os.time() + startIn, duration = DURATION[sport],
        status = 'upcoming', score = { 0, 0 }, tick = 0, events = {},
    }
end

local function Count(sport)
    local n = 0
    for _, m in pairs(Matches) do if m.sport == sport and m.status ~= 'finished' then n = n + 1 end end
    return n
end

-- ---------- money ----------
local function PayCitizen(cid, amount, reason)
    local P = QBCore.Functions.GetPlayerByCitizenId(cid)
    if P then
        P.Functions.AddMoney('bank', amount, reason)
        return P.PlayerData.source
    end
    local raw = MySQL.scalar.await('SELECT money FROM players WHERE citizenid = ?', { cid })
    if raw then
        local money = json.decode(raw) or {}
        money.bank = (money.bank or 0) + amount
        MySQL.update.await('UPDATE players SET money = ? WHERE citizenid = ?', { json.encode(money), cid })
    end
end

local function Settle(m)
    local bets = MySQL.query.await("SELECT * FROM mezos_bets WHERE match_id = ? AND status = 'pending'", { m.id }) or {}
    for _, b in ipairs(bets) do
        if b.pick == m.result then
            local payout = math.floor(b.stake * b.odds)
            MySQL.update.await("UPDATE mezos_bets SET status = 'won', payout = ? WHERE id = ?", { payout, b.id })
            local src = PayCitizen(b.citizenid, payout, '1xbet-win')
            if src then TriggerClientEvent('qb-phone:client:CustomNotification', src, '1xBet', ('You won $%d on %s!'):format(payout, b.label), 'fas fa-trophy', '#1a5bab', 7000) end
        else
            MySQL.update.await("UPDATE mezos_bets SET status = 'lost' WHERE id = ?", { b.id })
            local P = QBCore.Functions.GetPlayerByCitizenId(b.citizenid)
            if P then TriggerClientEvent('qb-phone:client:CustomNotification', P.PlayerData.source, '1xBet', ('Bet lost: %s'):format(b.label), 'fas fa-futbol', '#8e8e93', 5000) end
        end
    end
end

local function Step(m)
    local now = os.time()
    if m.status == 'upcoming' and now >= m.kickoff then m.status = 'live' end
    if m.status ~= 'live' then return end
    local should = math.min(TICKS[m.sport], math.floor((now - m.kickoff) / m.duration * TICKS[m.sport]))
    while m.tick < should do
        m.tick = m.tick + 1
        if m.sport == 'ufc' then
            m.events[#m.events + 1] = 'Round ' .. m.tick .. ' done'
        else
            local dh, da = SimTick(m.sport, m.hs, m.as)
            m.score[1], m.score[2] = m.score[1] + dh, m.score[2] + da
            if m.sport == 'football' then
                local minute = m.tick * 5
                if dh > 0 then m.events[#m.events + 1] = minute .. "' ⚽ " .. m.home end
                if da > 0 then m.events[#m.events + 1] = minute .. "' ⚽ " .. m.away end
            end
        end
    end
    if now >= m.kickoff + m.duration then
        if m.sport == 'ufc' then
            m.result = UfcWinner(m.hs, m.as)
            local how = ({ 'KO', 'TKO', 'Submission', 'Decision' })[math.random(4)]
            m.events[#m.events + 1] = (m.result == 'home' and m.home or m.away) .. ' wins by ' .. how
            m.score = m.result == 'home' and { 1, 0 } or { 0, 1 }
        else
            if m.score[1] == m.score[2] and m.sport == 'basketball' then
                if math.random() < m.hs / (m.hs + m.as) then m.score[1] = m.score[1] + 2 else m.score[2] = m.score[2] + 2 end
            end
            m.result = m.score[1] > m.score[2] and 'home' or m.score[2] > m.score[1] and 'away' or 'draw'
        end
        m.status = 'finished'
        m.finishedAt = now
        Settle(m)
    end
end

CreateThread(function()
    Wait(3000)
    while not MezosPhoneDBReady do Wait(500) end
    -- bets from a previous session can no longer be played -> refund
    local old = MySQL.query.await("SELECT * FROM mezos_bets WHERE status = 'pending'") or {}
    for _, b in ipairs(old) do
        MySQL.update.await("UPDATE mezos_bets SET status = 'refunded', payout = stake WHERE id = ?", { b.id })
        PayCitizen(b.citizenid, b.stake, '1xbet-refund')
    end
    while true do
        for sport, want in pairs({ football = 6, basketball = 3, ufc = 3 }) do
            while Count(sport) < want do NewMatch(sport, math.random(2, 30) * 60) end
        end
        for id, m in pairs(Matches) do
            Step(m)
            if m.status == 'finished' and os.time() - m.finishedAt > 600 then Matches[id] = nil end
        end
        Wait(5000)
    end
end)

local function PublicMatch(m)
    return {
        id = m.id, sport = m.sport, league = m.league, home = m.home, away = m.away, odds = m.odds, kickoff = m.kickoff,
        status = m.status, score = m.score, events = m.events, result = m.result, now = os.time(),
        minute = m.status == 'live' and math.min(m.sport == 'football' and 90 or m.sport == 'basketball' and 48 or 3,
            math.floor((os.time() - m.kickoff) / m.duration * (m.sport == 'football' and 90 or m.sport == 'basketball' and 48 or 3))) or nil,
    }
end

QBCore.Functions.CreateCallback('mezos-phone:server:bet:matches', function(source, cb)
    local P = QBCore.Functions.GetPlayer(source)
    local list = {}
    for _, m in pairs(Matches) do list[#list + 1] = PublicMatch(m) end
    table.sort(list, function(a, b) return a.kickoff < b.kickoff end)
    cb({ matches = list, balance = P and P.PlayerData.money.bank or 0, min = B.MinStake or 10, max = B.MaxStake or 25000 })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:bet:mine', function(source, cb)
    local P = QBCore.Functions.GetPlayer(source)
    if not P then return cb({}) end
    cb(MySQL.query.await('SELECT id, match_id, label, pick_label, odds, stake, status, payout, UNIX_TIMESTAMP(created) AS created FROM mezos_bets WHERE citizenid = ? ORDER BY id DESC LIMIT 50', { P.PlayerData.citizenid }) or {})
end)

QBCore.Functions.CreateCallback('mezos-phone:server:bet:place', function(source, cb, matchId, pick, stake)
    local P = QBCore.Functions.GetPlayer(source)
    local m = Matches[tonumber(matchId) or -1]
    stake = math.floor(tonumber(stake) or 0)
    if not P or not m then return cb({ error = 'This match is no longer available.' }) end
    if m.status ~= 'upcoming' or os.time() >= m.kickoff - 5 then return cb({ error = 'Betting is closed for this match.' }) end
    local odds = m.odds[pick]
    if not odds then return cb({ error = 'Invalid selection.' }) end
    if stake < (B.MinStake or 10) or stake > (B.MaxStake or 25000) then return cb({ error = ('Stake must be between $%d and $%d.'):format(B.MinStake or 10, B.MaxStake or 25000) }) end
    if not P.Functions.RemoveMoney('bank', stake, '1xbet-stake') then return cb({ error = 'Not enough money in your bank.' }) end
    local label = m.home .. ' vs ' .. m.away
    local pickLabel = pick == 'home' and m.home or pick == 'away' and m.away or 'Draw'
    MySQL.insert.await('INSERT INTO mezos_bets (citizenid, match_id, label, pick, pick_label, odds, stake) VALUES (?, ?, ?, ?, ?, ?, ?)',
        { P.PlayerData.citizenid, m.id, label, pick, pickLabel, odds, stake })
    cb({ ok = true, balance = P.PlayerData.money.bank, potential = math.floor(stake * odds) })
end)
