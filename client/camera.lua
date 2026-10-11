--[[
    mezos-phone | Camera (PHOTO / VIDEO)
    The phone screen shows the camera picture. The camera is a script camera held in front of the player,
    so the player walks / runs normally (W A S D) while filming, and the view follows the mouse.
    Mouse:  drag on the picture in the phone to aim (moving the mouse alone does not turn the camera)
            photos / videos ONLY start with the shutter button
    Keys:   ← → = filter · Backspace = back to Home Screen · Esc / M = put the phone away
]]
local QBCore = exports['qb-core']:GetCoreObject()

MezosCamera = { active = false, feed = false }
local Cam = MezosCamera

local TIMERS = { 0, 3, 10 }
local ZOOMS = { { label = '0.5', fov = 85.0 }, { label = '1', fov = 55.0 }, { label = '2', fov = 32.0 }, { label = '3', fov = 20.0 } }
local HEAD = 31086 -- SKEL_Head

local state = { mode = 'photo', filter = 1, selfie = false, flash = false, timer = 1, grid = false, zoom = 2, busy = false, busyAt = 0, counting = false, live = false, recording = false, recStart = 0 }
local handle -- script camera
local view = { yaw = 0.0, pitch = 0.0, selfieYaw = 0.0, selfiePitch = 0.0 } -- where the phone camera points (changed by dragging)

local function Norm(a)
    a = a % 360.0
    if a > 180.0 then a = a - 360.0 end
    return a
end
PendingPhotos = {}
local PhotoSeq = 0

local function SetBusy(on)
    state.busy = on
    state.busyAt = on and GetGameTimer() or 0
end

local function Hud(data)
    data.action = 'mz:camera'
    SendNUIMessage(data)
end

local function Filters()
    local list = {}
    for i, f in ipairs(Config.CameraFilters or {}) do list[i] = f.label end
    return list
end

local function ApplyFilter()
    local f = (Config.CameraFilters or {})[state.filter]
    ClearTimecycleModifier()
    if f and f.modifier then
        SetTimecycleModifier(f.modifier)
        SetTimecycleModifierStrength(1.0)
    end
end

local function PushState()
    local zooms = {}
    for i, z in ipairs(ZOOMS) do zooms[i] = z.label end
    Hud({
        state = 'update', mode = state.mode, recording = state.recording, filter = state.filter, filterLabel = ((Config.CameraFilters or {})[state.filter] or {}).label,
        selfie = state.selfie, flash = state.flash, timer = TIMERS[state.timer], grid = state.grid, busy = state.busy,
        zoom = ZOOMS[state.zoom].label, zooms = zooms, live = state.live,
    })
end

-- ---------- the camera itself ----------
local function Direction(rot)
    local rx, rz = math.rad(rot.x), math.rad(rot.z)
    return vector3(-math.sin(rz) * math.abs(math.cos(rx)), math.cos(rz) * math.abs(math.cos(rx)), math.sin(rx))
end

local function UpdateCamera()
    if not handle then return end
    local ped = PlayerPedId()
    if state.selfie then
        -- phone held at arm's length in front of the face, looking back at the player (drag = move the arm around)
        local a = math.rad(view.selfieYaw)
        local pos = GetOffsetFromEntityInWorldCoords(ped, 0.72 * math.sin(a), 0.72 * math.cos(a), 0.62 + view.selfiePitch / 100.0)
        SetCamCoord(handle, pos.x, pos.y, pos.z)
        PointCamAtPedBone(handle, ped, HEAD, 0.0, 0.0, 0.03, true)
    else
        local rot = vector3(view.pitch, 0.0, view.yaw)
        local head = GetPedBoneCoords(ped, HEAD, 0.0, 0.0, 0.0)
        local pos = head + Direction(rot) * 0.32 + vector3(0.0, 0.0, 0.02)
        StopCamPointing(handle)
        SetCamCoord(handle, pos.x, pos.y, pos.z)
        SetCamRot(handle, view.pitch, 0.0, view.yaw, 2)
        -- walking goes where the phone points
        SetGameplayCamRelativeHeading(Norm(view.yaw - GetEntityHeading(ped)))
    end
    local fov = ZOOMS[state.zoom].fov
    if state.selfie then fov = math.max(fov, 55.0) end
    SetCamFov(handle, fov)
end

-- short bright light in front of the phone so the flash shows in the photo
local function FlashLight(ms)
    CreateThread(function()
        local untilTime = GetGameTimer() + ms
        while GetGameTimer() < untilTime do
            local ped = PlayerPedId()
            local pos = state.selfie and GetOffsetFromEntityInWorldCoords(ped, 0.0, 0.6, 0.6) or GetOffsetFromEntityInWorldCoords(ped, 0.0, 1.2, 0.6)
            DrawLightWithRangeAndShadow(pos.x, pos.y, pos.z, 255, 255, 255, 8.0, 6.0, 1.0)
            Wait(0)
        end
    end)
end

local function Countdown()
    state.counting = true
    for i = TIMERS[state.timer], 1, -1 do
        if not Cam.active then state.counting = false return false end
        Hud({ state = 'countdown', value = i })
        PlaySoundFrontend(-1, 'NAV_UP_DOWN', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
        Wait(1000)
    end
    state.counting = false
    Hud({ state = 'countdown', value = 0 })
    return Cam.active
end

-- only called from the shutter button on the phone
local function TakePhoto()
    if state.busy or state.live or not Cam.active then return end
    SetBusy(true)
    PushState()
    CreateThread(function()
        if TIMERS[state.timer] > 0 and not Countdown() then
            SetBusy(false)
            return
        end
        if state.flash then FlashLight(1500) end
        Hud({ state = 'shutter' })
        local done = false
        local function finish(url)
            if done then return end
            done = true
            SetBusy(false)
            if url then
                Hud({ state = 'saved', url = url, kind = 'photo' })
            else
                Hud({ state = 'failed', text = 'Photo could not be saved' })
            end
            if Cam.active then PushState() end
        end
        if Cam.feed then
            -- picture taken from the phone screen (what you see is what you get)
            PhotoSeq = PhotoSeq + 1
            PendingPhotos[PhotoSeq] = finish
            Hud({ state = 'grab', id = PhotoSeq })
        else
            QBCore.Functions.TriggerCallback('mezos-phone:server:capturePhoto', finish)
        end
        SetTimeout(30000, function()
            if not done then finish(nil) end
        end)
    end)
end

RegisterNUICallback('mz:camera:photo', function(data, cb)
    cb('ok')
    if type(data) ~= 'table' or not PendingPhotos[data.id] then return end
    if type(data.data) ~= 'string' or #data.data < 200 then
        local f = PendingPhotos[data.id]
        PendingPhotos[data.id] = nil
        return f(nil)
    end
    TriggerLatentServerEvent('mezos-phone:server:savePhoto', 1500000, data.id, data.data)
end)

RegisterNetEvent('mezos-phone:client:photoSaved', function(id, url)
    local f = PendingPhotos[id]
    PendingPhotos[id] = nil
    if f then f(url) end
end)

-- ---------- video ----------
-- the phone records its own camera picture (smooth, portrait); screencapture is only the fallback
local VideoSeq, PendingVideo, PhoneRecording = 0, nil, false
local RecordingAnswer

local function StopRecording()
    if not state.recording then return end
    state.recording = false
    SetBusy(true)
    if PhoneRecording then
        VideoSeq = VideoSeq + 1
        PendingVideo = VideoSeq
        Hud({ state = 'recStop', id = VideoSeq })
    else
        TriggerServerEvent('mezos-phone:server:stopVideo')
    end
    Hud({ state = 'recording', on = false })
    Hud({ state = 'processing' })
    PushState()
end

local function StartRecording()
    if state.busy or state.recording or state.live then return end
    CreateThread(function()
        if TIMERS[state.timer] > 0 then
            SetBusy(true)
            PushState()
            local ok = Countdown()
            SetBusy(false)
            if not ok then return end
        end
        state.recording = true
        state.recStart = GetGameTimer()
        PhoneRecording = false
        if Cam.feed then
            local answer, answered = promise.new(), false
            RecordingAnswer = function(ok)
                if answered then return end
                answered = true
                answer:resolve(ok)
            end
            Hud({ state = 'recStart' })
            SetTimeout(1500, function() if RecordingAnswer then RecordingAnswer(false) end end)
            PhoneRecording = Citizen.Await(answer) == true
            RecordingAnswer = nil
        end
        if not PhoneRecording then TriggerServerEvent('mezos-phone:server:startVideo') end
        Hud({ state = 'recording', on = true })
        PushState()
        local max = ((Config.Media and Config.Media.MaxVideoSeconds) or 30) * 1000
        while state.recording do
            local t = GetGameTimer() - state.recStart
            Hud({ state = 'tick', seconds = math.floor(t / 1000) })
            if t >= max then StopRecording() break end
            Wait(500)
        end
    end)
end

RegisterNUICallback('mz:camera:recording', function(data, cb)
    cb('ok')
    if RecordingAnswer then RecordingAnswer(type(data) == 'table' and data.ok == true) end
end)

-- finished video from the phone -> server (Discord / local)
RegisterNUICallback('mz:camera:video', function(data, cb)
    cb('ok')
    if type(data) ~= 'table' or data.id ~= PendingVideo then return end
    PendingVideo = nil
    if type(data.data) ~= 'string' or #data.data < 500 then
        return TriggerEvent('mezos-phone:client:videoSaved', nil)
    end
    Hud({ state = 'processing' })
    TriggerLatentServerEvent('mezos-phone:server:saveVideo', 2000000, data.data)
end)

RegisterNetEvent('mezos-phone:client:videoSaved', function(url)
    SetBusy(false)
    state.recording = false
    if url then
        Hud({ state = 'saved', url = url, kind = 'video' })
    else
        Hud({ state = 'failed', text = 'Video could not be saved' })
    end
    if Cam.active then PushState() end
end)

-- the shutter button on the phone (the only way to take a photo / start a video)
local function Shutter()
    if state.mode == 'video' then
        if state.recording then StopRecording() else StartRecording() end
    else
        TakePhoto()
    end
end

local function SetFilter(i)
    local n = #(Config.CameraFilters or {})
    if n == 0 then return end
    state.filter = ((i - 1) % n) + 1
    ApplyFilter()
    PushState()
end

function Cam.Start(opts)
    if Cam.active then return end
    opts = opts or {}
    Cam.active = true
    SetBusy(false)
    state.counting = false
    state.live = opts.live == true
    state.recording = false
    if state.live or opts.purpose == 'photo' then state.mode = 'photo' elseif opts.purpose == 'video' then state.mode = 'video' end

    -- keep the phone in the hand (texting animation is upper body only, so walking works)
    if PhoneData and PhoneData.isOpen and not (PhoneData.AnimationData and PhoneData.AnimationData.lib) then
        DoPhoneAnimation('cellphone_text_in')
    end

    local ped = PlayerPedId()
    local c = GetEntityCoords(ped)
    local start = GetGameplayCamRot(2)
    view.yaw, view.pitch = start.z, math.max(-60.0, math.min(60.0, start.x))
    view.selfieYaw, view.selfiePitch = 0.0, 0.0
    handle = CreateCamWithParams('DEFAULT_SCRIPTED_CAMERA', c.x, c.y, c.z + 0.6, 0.0, 0.0, GetEntityHeading(ped), ZOOMS[state.zoom].fov, false, 0)
    SetCamActive(handle, true)
    UpdateCamera()
    RenderScriptCams(true, false, 0, true, false)
    ApplyFilter()
    Hud({ state = 'open', filters = Filters() })
    PushState()

    CreateThread(function()
        local hideComps = { 1, 2, 3, 4, 6, 7, 8, 9, 13, 14, 17, 19, 20, 21, 22 }
        -- only the camera keys are blocked: walking, running, jumping, E, F ... keep working
        local block = { 174, 175, 24, 25, 14, 15, 16, 17 }
        while Cam.active do
            HideHudAndRadarThisFrame()
            for i = 1, #hideComps do HideHudComponentThisFrame(hideComps[i]) end
            for i = 1, #block do DisableControlAction(0, block[i], true) end
            UpdateCamera()

            -- safety: a capture that never answered must not lock the camera
            if state.busy and not state.recording and state.busyAt > 0 and GetGameTimer() - state.busyAt > 60000 then
                SetBusy(false)
                PushState()
            end

            if IsDisabledControlJustPressed(0, 175) then
                SetFilter(state.filter + 1)
            elseif IsDisabledControlJustPressed(0, 174) then
                SetFilter(state.filter - 1)
            elseif IsDisabledControlJustPressed(0, 177) then
                Hud({ state = 'back' })
            end
            if IsEntityDead(PlayerPedId()) then SendNUIMessage({ action = 'mz:forceClose' }) end
            Wait(0)
        end
    end)
end

-- closing = the phone is being put away
function Cam.Stop(closing)
    if not Cam.active then return end
    if state.recording then StopRecording() end -- the video is still saved
    Cam.active = false
    Cam.feed = false
    state.live = false
    for id, f in pairs(PendingPhotos) do PendingPhotos[id] = nil f(nil) end
    RenderScriptCams(false, false, 0, true, false)
    if handle then DestroyCam(handle, false) handle = nil end
    ClearTimecycleModifier()
end

RegisterNUICallback('mz:camera:start', function(data, cb)
    cb('ok')
    Cam.Start(type(data) == 'table' and data or {})
end)

-- dragging on the picture in the phone turns the camera (dx / dy in screen pixels)
RegisterNUICallback('mz:camera:drag', function(data, cb)
    cb('ok')
    if not Cam.active or type(data) ~= 'table' then return end
    local dx, dy = tonumber(data.dx) or 0, tonumber(data.dy) or 0
    local zoom = ZOOMS[state.zoom].fov / 55.0 -- slower when zoomed in
    if state.selfie then
        view.selfieYaw = math.max(-70.0, math.min(70.0, view.selfieYaw - dx * 0.25))
        view.selfiePitch = math.max(-25.0, math.min(25.0, view.selfiePitch + dy * 0.12))
    else
        view.yaw = Norm(view.yaw + dx * 0.18 * zoom)
        view.pitch = math.max(-70.0, math.min(70.0, view.pitch + dy * 0.14 * zoom))
    end
end)

RegisterNUICallback('mz:camera:stop', function(_, cb)
    cb('ok')
    Cam.Stop(false)
end)

RegisterNUICallback('mz:camera:action', function(data, cb)
    cb('ok')
    if not Cam.active or type(data) ~= 'table' then return end
    local op = data.op
    if op == 'shutter' then Shutter()
    elseif op == 'mode' then
        if (data.value == 'photo' or data.value == 'video') and not state.recording and not state.counting and not state.live then
            state.mode = data.value
            PlaySoundFrontend(-1, 'NAV_LEFT_RIGHT', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
            PushState()
        end
    elseif op == 'filter' then SetFilter(tonumber(data.value) or 1)
    elseif op == 'flip' then state.selfie = not state.selfie PushState()
    elseif op == 'flash' then state.flash = not state.flash PushState()
    elseif op == 'timer' then state.timer = (state.timer % #TIMERS) + 1 PushState()
    elseif op == 'grid' then state.grid = not state.grid PushState()
    elseif op == 'zoom' then
        for i, z in ipairs(ZOOMS) do if z.label == tostring(data.value) then state.zoom = i end end
        PushState()
    end
end)

-- the phone shows the camera picture (photos + live video are then taken from it)
RegisterNUICallback('mz:camera:feed', function(data, cb)
    cb('ok')
    Cam.feed = Cam.active and type(data) == 'table' and data.on == true
end)

RegisterNUICallback('mz:camera:live', function(data, cb)
    cb('ok')
    if not Cam.active then return end
    state.live = type(data) == 'table' and data.on == true
    PushState()
end)

-- live video pictures from the phone screen -> server -> viewers
RegisterNUICallback('mz:live:frame', function(data, cb)
    cb('ok')
    if not Cam.active or not state.live or type(data) ~= 'table' or type(data.data) ~= 'string' or #data.data > 400000 then return end
    TriggerLatentServerEvent('mezos-phone:server:live:frame', 250000, data.data)
end)

AddEventHandler('onResourceStop', function(res)
    if res ~= GetCurrentResourceName() or not Cam.active then return end
    RenderScriptCams(false, false, 0, true, false)
    if handle then DestroyCam(handle, false) end
    ClearTimecycleModifier()
end)
