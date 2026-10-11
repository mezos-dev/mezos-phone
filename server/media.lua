--[[
    mezos-phone | media (Camera photos + videos)
    Photos/videos are captured with `screencapture` (screenshot-basic replacement) on the server side.
    provider 'local'      -> files are written to mezos-phone/media and served at <server>/mezos-phone/media/<file>
    provider 'fivemanage' -> uploaded to fivemanage.com (convar mezos_phone_fivemanage)
    Saved paths look like  mzmedia://<file>.
    The phone page is https, so plain http links are blocked by the browser. Files are shown through
    1. Config.Media.PublicUrl (if set), else 2. the server's https cfx.re address (web_baseUrl), and if that fails
    3. the file is sent to the player through the game connection (always works).
]]
local QBCore = exports['qb-core']:GetCoreObject()
local RESOURCE = GetCurrentResourceName()
local MEDIA_DIR = GetResourcePath(RESOURCE) .. '/media'
local FIVEMANAGE_KEY = GetConvar('mezos_phone_fivemanage', '')
local FIVEMANAGE_URL = 'https://api.fivemanage.com/api/v3/file'
local ActiveVideos = {} -- [src] = captureId
local AirDrops = {}     -- [targetSrc] = { from = src, url = url, expires = os.time() + 60 }

local MIME = { jpg = 'image/jpeg', jpeg = 'image/jpeg', png = 'image/png', webp = 'image/webp', webm = 'video/webm' }

local warned = false
local function Webhook()
    local w = GetConvar('mezos_phone_webhook', '')
    if w == '' and ServerConfig and ServerConfig.DiscordWebhook then w = ServerConfig.DiscordWebhook end
    return w
end

local function Provider()
    local p = (Config.Media and Config.Media.provider) or 'local'
    if p == 'discord' and not Webhook():match('^https://[%w%.]*discord[%w%.]*%.com/api/webhooks/') then
        if not warned then
            warned = true
            print('^3[mezos-phone] Media provider is "discord" but no webhook is set (server/config_server.lua or convar mezos_phone_webhook) - using local storage.^7')
        end
        return 'local'
    end
    if p == 'fivemanage' and FIVEMANAGE_KEY == '' then
        print('^3[mezos-phone] Media provider is "fivemanage" but convar mezos_phone_fivemanage is empty - using local storage.^7')
        return 'local'
    end
    return p
end

local function HasScreencapture()
    local st = GetResourceState('screencapture')
    if st == 'started' then return 'screencapture' end
    if GetResourceState('screenshot-basic') == 'started' then return 'screenshot-basic' end
    return nil
end

-- ---------- base64 ----------
local B64 = {}
do
    local chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    for i = 1, #chars do B64[chars:byte(i)] = i - 1 end
    B64[('-'):byte()] = 62; B64[('_'):byte()] = 63
end

local function Base64Decode(data)
    data = data:gsub('^data:[^,]*,', ''):gsub('[^%w%+/%-_=]', '')
    local out, n = {}, 0
    local len = #data
    local byte, char = string.byte, string.char
    local yieldable = coroutine.isyieldable()
    for i = 1, len, 4 do
        if yieldable and i % 65536 == 1 and i > 1 then Wait(0) end
        local a, b, c, d = byte(data, i, i + 3)
        local va, vb = B64[a] or 0, B64[b] or 0
        local vc = (c and c ~= 61) and B64[c] or nil
        local vd = (d and d ~= 61) and B64[d] or nil
        local triple = (va << 18) | (vb << 12) | ((vc or 0) << 6) | (vd or 0)
        n = n + 1
        if vd then
            out[n] = char((triple >> 16) & 255, (triple >> 8) & 255, triple & 255)
        elseif vc then
            out[n] = char((triple >> 16) & 255, (triple >> 8) & 255)
        else
            out[n] = char((triple >> 16) & 255)
        end
    end
    return table.concat(out)
end

local B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local B64E = {}
for i = 1, 64 do B64E[i - 1] = B64C:sub(i, i) end

-- yields between chunks so a big video never freezes the server
local function Base64Encode(data)
    local out, byte = {}, string.byte
    local len, chunk = #data, 3 * 16384
    for start = 1, len, chunk do
        local stop = math.min(start + chunk - 1, len)
        local parts, n = {}, 0
        for i = start, stop, 3 do
            local a, b, c = byte(data, i, i + 2)
            local v = a << 16 | (b or 0) << 8 | (c or 0)
            n = n + 1
            parts[n] = B64E[v >> 18 & 63] .. B64E[v >> 12 & 63] .. (b and B64E[v >> 6 & 63] or '=') .. (c and B64E[v & 63] or '=')
        end
        out[#out + 1] = table.concat(parts)
        if stop < len and coroutine.isyieldable() then Wait(0) end
    end
    return table.concat(out)
end

-- ---------- files ----------
local function SafeName(name)
    return type(name) == 'string' and name:match('^[%w_%-]+%.%a+$') ~= nil
end

local function WriteFile(name, data)
    local f = io.open(MEDIA_DIR .. '/' .. name, 'wb')
    if not f then
        print(('^1[mezos-phone] Cannot write %s/%s - make sure the "media" folder exists inside mezos-phone.^7'):format(MEDIA_DIR, name))
        return false
    end
    f:write(data)
    f:close()
    return true
end

local function ReadFile(path)
    local f = io.open(path, 'rb')
    if not f then return nil end
    local d = f:read('a')
    f:close()
    return d
end

local function NewName(citizenid, ext)
    return ('%s_%d%04d.%s'):format(tostring(citizenid):gsub('[^%w]', ''), os.time(), math.random(0, 9999), ext)
end

-- ---------- gallery ----------
local function RefreshGallery(src, citizenid)
    local images = MySQL.query.await('SELECT * FROM phone_gallery WHERE citizenid = ? ORDER BY `date` DESC', { citizenid })
    TriggerClientEvent('qb-phone:refreshImages', src, images or {})
    return images or {}
end

local function TrimLocalMedia(citizenid)
    local max = (Config.Media and Config.Media.MaxPerPlayer) or 300
    local rows = MySQL.query.await("SELECT image FROM phone_gallery WHERE citizenid = ? AND image LIKE 'mzmedia://%' ORDER BY `date` DESC", { citizenid }) or {}
    for i = max + 1, #rows do
        MySQL.query.await('DELETE FROM phone_gallery WHERE citizenid = ? AND image = ?', { citizenid, rows[i].image })
    end
end

local function AddToGallery(src, citizenid, url)
    MySQL.insert.await('INSERT INTO phone_gallery (`citizenid`, `image`) VALUES (?, ?)', { citizenid, url })
    TrimLocalMedia(citizenid)
    RefreshGallery(src, citizenid)
end
MezosPhone.AddToGallery = AddToGallery

-- ---------- http: serve local media ----------
SetHttpHandler(function(req, res)
    local path = (req.path or ''):gsub('%?.*$', '')
    local file = path:match('^/media/(.+)$')
    if req.method == 'GET' and path == '/ping' then
        res.writeHead(200, { ['Content-Type'] = 'text/plain', ['Access-Control-Allow-Origin'] = '*' })
        return res.send('ok')
    end
    if req.method ~= 'GET' or not file or not SafeName(file) then
        res.writeHead(404, { ['Access-Control-Allow-Origin'] = '*' })
        return res.send('not found')
    end
    local data = ReadFile(MEDIA_DIR .. '/' .. file)
    if not data then
        res.writeHead(404, { ['Access-Control-Allow-Origin'] = '*' })
        return res.send('not found')
    end
    local ext = file:match('%.(%a+)$'):lower()
    res.writeHead(200, {
        ['Content-Type'] = MIME[ext] or 'application/octet-stream',
        ['Content-Length'] = tostring(#data),
        ['Access-Control-Allow-Origin'] = '*',
        ['Cache-Control'] = 'public, max-age=604800',
    })
    res.send(data)
end)

-- ---------- address the phone uses for media ----------
local function PublicBase()
    local pub = Config.Media and Config.Media.PublicUrl or ''
    if pub ~= '' then return pub:gsub('/+$', '') .. '/' .. RESOURCE end
    local web = GetConvar('web_baseUrl', '')
    if web ~= '' then return 'https://' .. web:gsub('^https?://', ''):gsub('/+$', '') .. '/' .. RESOURCE end
    return ''
end

-- the address is only used when it really reaches this server (closed ports / no port forwarding
-- make the cfx.re address hang, then the phone uses the game connection instead)
local function Reachable(base, cb)
    if base == '' then return cb(false) end
    local answered = false
    PerformHttpRequest(base .. '/ping', function(status, body)
        if answered then return end
        answered = true
        cb(status == 200 and tostring(body or ''):find('ok', 1, true) ~= nil)
    end, 'GET', '', {})
    SetTimeout(8000, function()
        if not answered then answered = true cb(false) end
    end)
end

CreateThread(function()
    Wait(5000)
    while true do
        local b = PublicBase()
        local p = promise.new()
        Reachable(b, function(ok) p:resolve(ok) end)
        local ok = Citizen.Await(p)
        local use = ok and b or ''
        if GlobalState.mezosMediaBase ~= use then
            GlobalState.mezosMediaBase = use
            print(use ~= '' and ('^2[mezos-phone] Media served from %s^7'):format(use)
                or '^3[mezos-phone] The server is not reachable from the internet - photos are sent through the game connection.^7')
        end
        Wait(ok and 300000 or 60000)
    end
end)

-- fallback: send the file through the game connection (small in-memory cache)
local Cache, CacheOrder, CacheSize = {}, {}, 0
local CACHE_MAX = 48 * 1024 * 1024
local Fetching = {}

local function Cached(name)
    if Cache[name] then return Cache[name] end
    local data = ReadFile(MEDIA_DIR .. '/' .. name)
    if not data then return nil end
    local b64 = Base64Encode(data)
    Cache[name] = b64
    CacheOrder[#CacheOrder + 1] = name
    CacheSize = CacheSize + #b64
    while CacheSize > CACHE_MAX and #CacheOrder > 1 do
        local old = table.remove(CacheOrder, 1)
        CacheSize = CacheSize - #(Cache[old] or '')
        Cache[old] = nil
    end
    return b64
end

RegisterNetEvent('mezos-phone:server:media:fetch', function(id, name)
    local src = source
    if type(name) ~= 'string' or not SafeName(name) then
        return TriggerClientEvent('mezos-phone:client:media', src, id, nil)
    end
    Fetching[src] = (Fetching[src] or 0) + 1
    if Fetching[src] > 24 then
        Fetching[src] = Fetching[src] - 1
        return TriggerClientEvent('mezos-phone:client:media', src, id, nil)
    end
    CreateThread(function()
        local b64 = Cached(name)
        local ext = name:match('%.(%a+)$'):lower()
        if b64 then
            TriggerLatentClientEvent('mezos-phone:client:media', src, 3000000, id, MIME[ext] or 'application/octet-stream', b64)
        else
            TriggerClientEvent('mezos-phone:client:media', src, id, nil)
        end
        Fetching[src] = math.max(0, (Fetching[src] or 1) - 1)
    end)
end)

-- ---------- Discord storage ----------
local Links = {} -- [messageId] = { url, exp }

local function SaveLink(id, url, exp)
    Links[id] = { url = url, exp = exp }
    SetResourceKvp('mzd_' .. id, exp .. '|' .. url)
end

local function GetLink(id)
    local l = Links[id]
    if not l then
        local raw = GetResourceKvpString('mzd_' .. id)
        local exp, url = raw and raw:match('^(%d+)|(.+)$')
        if url then l = { url = url, exp = tonumber(exp) } Links[id] = l end
    end
    if l and l.exp - 1800 > os.time() then return l.url end
    return nil
end

-- fresh links are asked one by one so Discord does not rate limit the webhook
local LinkQueue, LinkWaiting, Pumping = {}, {}, false
local function Pump()
    if Pumping then return end
    Pumping = true
    CreateThread(function()
        while #LinkQueue > 0 do
            local id = table.remove(LinkQueue, 1)
            local p = promise.new()
            exports[RESOURCE]:DiscordLink(Webhook(), id, function(r) p:resolve(r) end)
            local r = Citizen.Await(p)
            if r and r.url then SaveLink(id, r.url, math.floor(tonumber(r.expires) or (os.time() + 3600))) end
            local list = LinkWaiting[id] or {}
            LinkWaiting[id] = nil
            for _, cb in ipairs(list) do cb(r and r.url or nil) end
            Wait(300)
        end
        Pumping = false
    end)
end

QBCore.Functions.CreateCallback('mezos-phone:server:media:link', function(_, cb, id)
    id = tostring(id or '')
    if not id:match('^%d+$') then return cb(nil) end
    local url = GetLink(id)
    if url then return cb(url) end
    if Webhook() == '' then return cb(nil) end
    if not LinkWaiting[id] then
        LinkWaiting[id] = {}
        LinkQueue[#LinkQueue + 1] = id
    end
    table.insert(LinkWaiting[id], cb)
    Pump()
end)

--- stores a photo / video and returns its media token through cb
--- src: { b64 = data url / base64 } or { path = file on disk }
local StoreMediaNow
local function StoreMedia(Player, ext, src, cb)
    -- always in its own thread so decoding can pause between slices
    CreateThread(function() StoreMediaNow(Player, ext, src, cb) end)
end
StoreMediaNow = function(Player, ext, src, cb)
    local cid = Player.PlayerData.citizenid
    local name = NewName(cid, ext)
    local function saveLocal()
        local bin = src.b64 and Base64Decode(src.b64) or (src.path and ReadFile(src.path))
        if not bin or #bin < 200 or not WriteFile(name, bin) then return cb(nil) end
        cb('mzmedia://' .. name)
    end
    if Provider() ~= 'discord' then return saveLocal() end
    local who = ('%s %s (%s)'):format(Player.PlayerData.charinfo.firstname, Player.PlayerData.charinfo.lastname, cid)
    local info = ('%s %s · %s · %s'):format(ext == 'webm' and '🎥' or '📸', ext == 'webm' and 'Video' or 'Photo', who, os.date('%Y-%m-%d %H:%M'))
    exports[RESOURCE]:DiscordUpload(Webhook(), name, MIME[ext], src.b64 or { path = src.path }, info, function(r)
        if r and r.id then
            SaveLink(tostring(r.id), r.url, math.floor(tonumber(r.expires) or (os.time() + 3600)))
            cb(('mzdiscord://%s/%s'):format(r.id, name))
        else
            print('^3[mezos-phone] Discord upload failed - the file is kept on the server instead.^7')
            saveLocal()
        end
    end)
end
MezosPhone.StoreMedia = StoreMedia

-- ---------- photo ----------
QBCore.Functions.CreateCallback('mezos-phone:server:capturePhoto', function(source, cb)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return cb(nil) end
    local capture = HasScreencapture()
    if not capture then
        print('^1[mezos-phone] The camera needs the "screencapture" resource to be started.^7')
        return cb(nil)
    end
    local cid = Player.PlayerData.citizenid
    local done = false
    local function finish(url)
        if done then return end
        done = true
        if url then AddToGallery(src, cid, url) end
        cb(url)
    end
    SetTimeout(20000, function() finish(nil) end)

    if Provider() == 'fivemanage' then
        exports[capture]:remoteUpload(src, FIVEMANAGE_URL, {
            encoding = 'webp',
            headers = { ['Authorization'] = FIVEMANAGE_KEY },
            filename = 'photo_' .. cid,
        }, function(resp)
            local url = type(resp) == 'table' and ((resp.data and resp.data.url) or resp.url) or nil
            finish(url)
        end, 'blob')
    else
        exports[capture]:serverCapture(src, { encoding = 'webp', maxWidth = 1920, maxHeight = 1080 }, function(data)
            if type(data) ~= 'string' or #data < 100 then return finish(nil) end
            StoreMedia(Player, 'webp', { b64 = data }, finish)
        end, 'base64')
    end
end)

-- photo taken from the phone's own camera picture (what the viewfinder shows)
local LastPhoto = {}
RegisterNetEvent('mezos-phone:server:savePhoto', function(id, data)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local function done(url) TriggerClientEvent('mezos-phone:client:photoSaved', src, id, url) end
    if not Player or type(data) ~= 'string' or #data > 6000000 then return done(nil) end
    local now = GetGameTimer()
    if LastPhoto[src] and now - LastPhoto[src] < 700 then return done(nil) end
    LastPhoto[src] = now
    local kind = data:match('^data:image/(%a+);base64,')
    local ext = ({ webp = 'webp', jpeg = 'jpg', png = 'png' })[kind or '']
    if not ext then return done(nil) end
    if #data < 300 then return done(nil) end
    StoreMedia(Player, ext, { b64 = data }, function(url)
        if url then AddToGallery(src, Player.PlayerData.citizenid, url) end
        done(url)
    end)
end)

-- video recorded by the phone itself (webm data url)
RegisterNetEvent('mezos-phone:server:saveVideo', function(data)
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    local function done(url) TriggerClientEvent('mezos-phone:client:videoSaved', src, url) end
    if not Player or type(data) ~= 'string' or #data > 16000000 or not data:match('^data:video/webm') then return done(nil) end
    StoreMedia(Player, 'webm', { b64 = data }, function(url)
        if url then AddToGallery(src, Player.PlayerData.citizenid, url) end
        done(url)
    end)
end)

-- ---------- video ----------
local function SaveVideoResult(src, cid, result)
    if type(result) ~= 'table' or result.status ~= 'success' then
        print(('^3[mezos-phone] Video capture failed: %s^7'):format(type(result) == 'table' and tostring(result.error) or 'unknown'))
        TriggerClientEvent('mezos-phone:client:videoSaved', src, nil)
        return
    end
    if result.response then -- uploaded (fivemanage)
        local r = result.response
        local url = type(r) == 'table' and ((r.data and r.data.url) or r.url) or nil
        if url then AddToGallery(src, cid, url) end
        TriggerClientEvent('mezos-phone:client:videoSaved', src, url)
        return
    end
    local tmp = result.filePath
    local data = tmp and ReadFile(tmp)
    if not data and tmp then
        tmp = GetResourcePath('screencapture') .. '/tmp/' .. tostring(tmp):match('([^/\\]+)$')
        data = ReadFile(tmp)
    end
    if not data or #data < 200 then
        TriggerClientEvent('mezos-phone:client:videoSaved', src, nil)
        return
    end
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return end
    StoreMedia(Player, 'webm', { path = tmp }, function(url)
        os.remove(tmp)
        if url then AddToGallery(src, cid, url) end
        TriggerClientEvent('mezos-phone:client:videoSaved', src, url)
    end)
end

RegisterNetEvent('mezos-phone:server:startVideo', function()
    local src = source
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return end
    if ActiveVideos[src] then -- an older recording never finished: stop it and tell the camera
        local old = ActiveVideos[src]
        ActiveVideos[src] = nil
        if old ~= true then pcall(function() exports.screencapture:stopVideoCapture(old) end) end
        TriggerClientEvent('mezos-phone:client:videoSaved', src, nil)
        return
    end
    if MezosPhone.IsLive and MezosPhone.IsLive(src) then
        TriggerClientEvent('mezos-phone:client:videoSaved', src, nil)
        return
    end
    if GetResourceState('screencapture') ~= 'started' then
        TriggerClientEvent('mezos-phone:client:videoSaved', src, nil)
        return
    end
    local cid = Player.PlayerData.citizenid
    local seconds = (Config.Media and Config.Media.MaxVideoSeconds) or 30
    local opts = { duration = seconds, maxWidth = 1280, maxHeight = 720 }
    local id
    if Provider() == 'fivemanage' then
        opts.headers = { ['Authorization'] = FIVEMANAGE_KEY }
        opts.filename = 'video_' .. cid
        id = exports.screencapture:startVideoCaptureUpload(src, FIVEMANAGE_URL, opts, function(result)
            ActiveVideos[src] = nil
            SaveVideoResult(src, cid, result)
        end)
    else
        id = exports.screencapture:startVideoCapture(src, opts, function(result)
            ActiveVideos[src] = nil
            SaveVideoResult(src, cid, result)
        end)
    end
    ActiveVideos[src] = id or true
end)

RegisterNetEvent('mezos-phone:server:stopVideo', function()
    local src = source
    local id = ActiveVideos[src]
    if id and id ~= true then
        exports.screencapture:stopVideoCapture(id)
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    local id = ActiveVideos[src]
    if id and id ~= true then pcall(function() exports.screencapture:stopVideoCapture(id) end) end
    ActiveVideos[src] = nil
    AirDrops[src] = nil
    Fetching[src] = nil
end)

-- ---------- AirDrop (share a photo/video with a player next to you) ----------
RegisterNetEvent('mezos-phone:server:airdrop', function(target, url)
    local src = source
    target = tonumber(target)
    local Player = QBCore.Functions.GetPlayer(src)
    local Target = target and QBCore.Functions.GetPlayer(target)
    if not Player or not Target or type(url) ~= 'string' or #url > 250 then return end
    local owns = MySQL.scalar.await('SELECT COUNT(1) FROM phone_gallery WHERE citizenid = ? AND image = ?', { Player.PlayerData.citizenid, url })
    if (owns or 0) < 1 then return end
    if #(GetEntityCoords(GetPlayerPed(src)) - GetEntityCoords(GetPlayerPed(target))) > 6.0 then
        TriggerClientEvent('QBCore:Notify', src, 'Too far away for AirDrop', 'error')
        return
    end
    AirDrops[target] = { from = src, url = url, expires = os.time() + 60 }
    local name = Player.PlayerData.charinfo.firstname .. ' ' .. Player.PlayerData.charinfo.lastname
    TriggerClientEvent('mezos-phone:client:airdropOffer', target, { from = name, url = url })
end)

QBCore.Functions.CreateCallback('mezos-phone:server:nearbyNames', function(source, cb, ids)
    local list = {}
    if type(ids) ~= 'table' then return cb(list) end
    local myPos = GetEntityCoords(GetPlayerPed(source))
    for i = 1, math.min(#ids, 12) do
        local id = tonumber(ids[i])
        local P = id and QBCore.Functions.GetPlayer(id)
        if P and id ~= source and #(GetEntityCoords(GetPlayerPed(id)) - myPos) < 6.0 then
            list[#list + 1] = { id = id, name = P.PlayerData.charinfo.firstname .. ' ' .. P.PlayerData.charinfo.lastname:sub(1, 1) .. '.' }
        end
    end
    cb(list)
end)

RegisterNetEvent('mezos-phone:server:airdropAnswer', function(accept)
    local src = source
    local offer = AirDrops[src]
    AirDrops[src] = nil
    if not offer or offer.expires < os.time() then return end
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player then return end
    if accept then
        AddToGallery(src, Player.PlayerData.citizenid, offer.url)
        TriggerClientEvent('qb-phone:client:CustomNotification', offer.from, 'AirDrop', 'Your photo was accepted', 'fas fa-tower-broadcast', '#0a84ff', 2500)
    else
        TriggerClientEvent('qb-phone:client:CustomNotification', offer.from, 'AirDrop', 'Declined', 'fas fa-tower-broadcast', '#ff3b30', 2500)
    end
end)

CreateThread(function()
    local probe = io.open(MEDIA_DIR .. '/.write_test', 'wb')
    if probe then
        probe:close()
        os.remove(MEDIA_DIR .. '/.write_test')
    else
        print('^1[mezos-phone] The folder ' .. MEDIA_DIR .. ' is missing or not writable - the Camera cannot save photos.^7')
    end
    if not HasScreencapture() then
        print('^3[mezos-phone] "screencapture" is not started - the Camera will not work until it is.^7')
    end
end)
