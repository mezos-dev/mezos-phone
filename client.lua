local QBCore = exports['qb-core']:GetCoreObject({ 'Functions' })
local sharedVehicles = exports['qb-core']:GetShared('Vehicles')
local PlayerJob = {}
local patt = '[?!@#]'
local phoneProp = 0
local phoneModel = `prop_npc_phone_02`
local DoNotDisturb = false -- [mezos-phone] toggled from Control Center
PhoneData = {
    MetaData = {},
    isOpen = false,
    PlayerData = nil,
    Contacts = {},
    Tweets = {},
    MentionedTweets = {},
    Hashtags = {},
    Chats = {},
    CallData = {},
    RecentCalls = {},
    Garage = {},
    Mails = {},
    Adverts = {},
    GarageVehicles = {},
    AnimationData = {
        lib = nil,
        anim = nil,
    },
    SuggestedContacts = {},
    CryptoTransactions = {},
    Images = {},
}

-- Functions

local function LoadAnimation(dict)
    RequestAnimDict(dict)
    while not HasAnimDictLoaded(dict) do
        Wait(1)
    end
end

local function CheckAnimLoop()
    CreateThread(function()
        while PhoneData.AnimationData.lib ~= nil and PhoneData.AnimationData.anim ~= nil do
            local ped = PlayerPedId()
            if not IsEntityPlayingAnim(ped, PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 3) then
                LoadAnimation(PhoneData.AnimationData.lib)
                TaskPlayAnim(ped, PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 3.0, 3.0, -1, 50, 0, false, false, false)
            end
            Wait(500)
        end
    end)
end

function newPhoneProp()
    deletePhone()
    RequestModel(phoneModel)
    while not HasModelLoaded(phoneModel) do
        Wait(1)
    end
    phoneProp = CreateObject(phoneModel, 1.0, 1.0, 1.0, 1, 1, 0)

    local bone = GetPedBoneIndex(PlayerPedId(), 28422)
    if phoneModel == `prop_cs_phone_01` then
        AttachEntityToEntity(phoneProp, PlayerPedId(), bone, 0.0, 0.0, 0.0, 50.0, 320.0, 50.0, 1, 1, 0, 0, 2, 1)
    else
        AttachEntityToEntity(phoneProp, PlayerPedId(), bone, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1, 1, 0, 0, 2, 1)
    end
end

function deletePhone()
    if phoneProp ~= 0 then
        DeleteObject(phoneProp)
        phoneProp = 0
    end
end

function DoPhoneAnimation(anim)
    local ped = PlayerPedId()
    local AnimationLib = 'cellphone@'
    local AnimationStatus = anim
    if IsPedInAnyVehicle(ped, false) then
        AnimationLib = 'anim@cellphone@in_car@ps'
    end
    LoadAnimation(AnimationLib)
    TaskPlayAnim(ped, AnimationLib, AnimationStatus, 3.0, 3.0, -1, 50, 0, false, false, false)
    PhoneData.AnimationData.lib = AnimationLib
    PhoneData.AnimationData.anim = AnimationStatus
    CheckAnimLoop()
end

function string:split(delimiter)
    local result = {}
    local from = 1
    local delim_from, delim_to = string.find(self, delimiter, from)
    while delim_from do
        result[#result + 1] = string.sub(self, from, delim_from - 1)
        from = delim_to + 1
        delim_from, delim_to = string.find(self, delimiter, from)
    end
    result[#result + 1] = string.sub(self, from)
    return result
end

local function escape_str(s)
    return s
end

local function GenerateTweetId()
    local tweetId = 'TWEET-' .. math.random(11111111, 99999999)
    return tweetId
end

local function IsNumberInContacts(num)
    local retval = num
    for _, v in pairs(PhoneData.Contacts) do
        if num == v.number then
            retval = v.name
        end
    end
    return retval
end

local function CalculateTimeToDisplay()
    local hour = GetClockHours()
    local minute = GetClockMinutes()

    local obj = {}

    if minute <= 9 then
        minute = '0' .. minute
    end

    obj.hour = hour
    obj.minute = minute

    return obj
end

local function GetClosestPlayer()
    local closestPlayers = QBCore.Functions.GetPlayersFromCoords()
    local closestDistance = -1
    local closestPlayer = -1
    local coords = GetEntityCoords(PlayerPedId())
    for i = 1, #closestPlayers, 1 do
        if closestPlayers[i] ~= PlayerId() then
            local pos = GetEntityCoords(GetPlayerPed(closestPlayers[i]))
            local distance = #(pos - coords)

            if closestDistance == -1 or closestDistance > distance then
                closestPlayer = closestPlayers[i]
                closestDistance = distance
            end
        end
    end
    return closestPlayer, closestDistance
end

local function GetKeyByDate(Number, Date)
    local retval = nil
    if PhoneData.Chats[Number] ~= nil then
        if PhoneData.Chats[Number].messages ~= nil then
            for key, chat in pairs(PhoneData.Chats[Number].messages) do
                if chat.date == Date then
                    retval = key
                    break
                end
            end
        end
    end
    return retval
end

local function GetKeyByNumber(Number)
    local retval = nil
    if PhoneData.Chats then
        for k, v in pairs(PhoneData.Chats) do
            if v.number == Number then
                retval = k
            end
        end
    end
    return retval
end

local function ReorganizeChats(key)
    local ReorganizedChats = {}
    ReorganizedChats[1] = PhoneData.Chats[key]
    for k, chat in pairs(PhoneData.Chats) do
        if k ~= key then
            ReorganizedChats[#ReorganizedChats + 1] = chat
        end
    end
    PhoneData.Chats = ReorganizedChats
end

local function findVehFromPlateAndLocate(plate)
    local gameVehicles = QBCore.Functions.GetVehicles()
    for i = 1, #gameVehicles do
        local vehicle = gameVehicles[i]
        if DoesEntityExist(vehicle) then
            if QBCore.Functions.GetPlate(vehicle) == plate then
                local vehCoords = GetEntityCoords(vehicle)
                SetNewWaypoint(vehCoords.x, vehCoords.y)
                return true
            end
        end
    end
end

-- While the phone is open the player can still walk / drive (Config.WalkWithPhone), but the camera is locked:
-- moving the mouse never free-looks. The cursor stays visible. Everything that would fight with the phone (shooting, menus) is blocked.
local BlockedControls = {
    24, 25, 47, 58, 257, 263, 264,   -- attack / aim / weapon
    140, 141, 142, 143,              -- melee
    37, 199, 200, 202, 322, 177,     -- weapon wheel / pause / escape / back
    44, 45, 157, 158, 159, 160, 161, 162, 163, 164, 165, -- cover, reload, weapon slots 1-9
    245, 244, 288, 289, 170, 166, 167, 168, 318, -- chat, F1-F7 menus
    14, 15, 16, 17, 81, 82, 99, 100, -- scroll wheel (weapon / radio switch)
}
local PhoneTyping = false

local function DisableDisplayControlActions()
    for i = 1, #BlockedControls do DisableControlAction(0, BlockedControls[i], true) end
    for c = 1, 6 do DisableControlAction(0, c, true) end -- no free look (camera app aims by dragging instead)
    if PhoneTyping or not Config.WalkWithPhone then
        DisableAllControlActions(0)
        EnableControlAction(0, 249, true) -- push to talk
    end
end

local function LoadPhone()
    Wait(100)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetPhoneData', function(pData)
        PlayerJob = QBCore.Functions.GetPlayerData().job
        PhoneData.PlayerData = QBCore.Functions.GetPlayerData()
        -- not logged in yet (resource restart on the character screen)
        if not pData or not PhoneData.PlayerData or not PhoneData.PlayerData.citizenid or not PhoneData.PlayerData.metadata then return end

        local PhoneMeta = PhoneData.PlayerData.metadata['phone']
        PhoneData.MetaData = PhoneMeta

        if PhoneMeta == nil then
            PhoneMeta = {}
            PhoneData.MetaData = PhoneMeta
        end

        if PhoneMeta.profilepicture == nil then
            PhoneData.MetaData.profilepicture = 'default'
        else
            PhoneData.MetaData.profilepicture = PhoneMeta.profilepicture
        end

        if pData.Applications ~= nil and next(pData.Applications) ~= nil then
            for k, v in pairs(pData.Applications) do
                if Config.PhoneApplications[k] then Config.PhoneApplications[k].Alerts = v end
            end
        end

        if pData.MentionedTweets ~= nil and next(pData.MentionedTweets) ~= nil then
            PhoneData.MentionedTweets = pData.MentionedTweets
        end

        if pData.PlayerContacts ~= nil and next(pData.PlayerContacts) ~= nil then
            PhoneData.Contacts = pData.PlayerContacts
        end

        if pData.Chats ~= nil and next(pData.Chats) ~= nil then
            local Chats = {}
            for _, v in pairs(pData.Chats) do
                Chats[v.number] = {
                    name = IsNumberInContacts(v.number),
                    number = v.number,
                    messages = json.decode(v.messages)
                }
            end

            PhoneData.Chats = Chats
        end

        if pData.Hashtags ~= nil and next(pData.Hashtags) ~= nil then
            PhoneData.Hashtags = pData.Hashtags
        end

        if pData.Tweets ~= nil and next(pData.Tweets) ~= nil then
            PhoneData.Tweets = pData.Tweets
        end

        if pData.Mails ~= nil and next(pData.Mails) ~= nil then
            PhoneData.Mails = pData.Mails
        end

        if pData.Adverts ~= nil and next(pData.Adverts) ~= nil then
            PhoneData.Adverts = pData.Adverts
        end

        if pData.CryptoTransactions ~= nil and next(pData.CryptoTransactions) ~= nil then
            PhoneData.CryptoTransactions = pData.CryptoTransactions
        end
        if pData.Images ~= nil and next(pData.Images) ~= nil then
            PhoneData.Images = pData.Images
        end

        SendNUIMessage({
            action = 'LoadPhoneData',
            PhoneData = PhoneData,
            PlayerData = PhoneData.PlayerData,
            PlayerJob = PhoneData.PlayerData.job,
            applications = Config.PhoneApplications,
            PlayerId = GetPlayerServerId(PlayerId())
        })
        TriggerEvent('mezos-phone:client:loaded')
    end)
end

local Opening = false
local function OpenPhone()
    if Opening or PhoneData.isOpen then return end
    Opening = true
    QBCore.Functions.TriggerCallback('mezos-phone:server:device', function(device)
        Opening = false
        local HasPhone = device ~= nil
        if HasPhone and not PhoneData.isOpen then
            PhoneData.PlayerData = QBCore.Functions.GetPlayerData()
            PhoneTyping = false
            SetNuiFocus(true, true)
            SetNuiFocusKeepInput(Config.WalkWithPhone == true)
            SendNUIMessage({
                action = 'open',
                Tweets = PhoneData.Tweets,
                AppData = Config.PhoneApplications,
                CallData = PhoneData.CallData,
                PlayerData = PhoneData.PlayerData,
                device = device, -- iApple: setup / activation lock
            })
            PhoneData.isOpen = true

            CreateThread(function()
                while PhoneData.isOpen do
                    DisableDisplayControlActions()
                    -- Esc closes the phone (the game sees the key before the phone page does)
                    if not PhoneTyping and (IsDisabledControlJustPressed(0, 200) or IsDisabledControlJustPressed(0, 322)) then
                        SendNUIMessage({ action = 'mz:forceClose' })
                    end
                    Wait(0)
                end
                -- keep the pause menu from opening on the same Esc press
                local untilTime = GetGameTimer() + 400
                while GetGameTimer() < untilTime do
                    DisableControlAction(0, 200, true)
                    DisableControlAction(0, 199, true)
                    DisableControlAction(0, 322, true)
                    Wait(0)
                end
            end)

            if not PhoneData.CallData.InCall then
                DoPhoneAnimation('cellphone_text_in')
            else
                DoPhoneAnimation('cellphone_call_to_text')
            end

            SetTimeout(250, function()
                newPhoneProp()
            end)

            if GetResourceState('qb-garages') == 'started' then
                QBCore.Functions.TriggerCallback('qb-garages:server:GetPlayerVehicles', function(vehicles)
                    PhoneData.GarageVehicles = vehicles or {}
                end)
            end
        elseif not HasPhone then
            QBCore.Functions.Notify("You don't have a phone", 'error')
        end
    end)
end

local function GenerateCallId()
    -- unique voice channel per call (the old formula could give two different calls the same channel)
    return math.random(1000, 99999) * 10 + (GetPlayerServerId(PlayerId()) % 10)
end

local function CancelCall()
    TriggerServerEvent('qb-phone:server:CancelCall', PhoneData.CallData)
    if PhoneData.CallData.CallType == 'ongoing' then
        exports['pma-voice']:removePlayerFromCall(PhoneData.CallData.CallId)
    end
    PhoneData.CallData.CallType = nil
    PhoneData.CallData.InCall = false
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.TargetData = {}
    PhoneData.CallData.CallId = nil

    if not PhoneData.isOpen then
        StopAnimTask(PlayerPedId(), PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 2.5)
        deletePhone()
        PhoneData.AnimationData.lib = nil
        PhoneData.AnimationData.anim = nil
    else
        PhoneData.AnimationData.lib = nil
        PhoneData.AnimationData.anim = nil
    end

    TriggerServerEvent('qb-phone:server:SetCallState', false)
    SendNUIMessage({ action = 'SetupHomeCall', CallData = PhoneData.CallData }) -- [mezos-phone] keep Dynamic Island in sync

    if not PhoneData.isOpen then
        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Phone',
                text = 'The call has been ended',
                icon = 'fas fa-phone',
                color = '#e84118',
            },
        })
    else
        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Phone',
                text = 'The call has been ended',
                icon = 'fas fa-phone',
                color = '#e84118',
            },
        })

        SendNUIMessage({
            action = 'SetupHomeCall',
            CallData = PhoneData.CallData,
        })

        SendNUIMessage({
            action = 'CancelOutgoingCall',
        })
    end
end

local function CallContact(CallData, AnonymousCall)
    local RepeatCount = 0
    PhoneData.CallData.CallType = 'outgoing'
    PhoneData.CallData.InCall = true
    PhoneData.CallData.TargetData = CallData
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.CallId = GenerateCallId()

    TriggerServerEvent('qb-phone:server:CallContact', PhoneData.CallData.TargetData, PhoneData.CallData.CallId, AnonymousCall)
    TriggerServerEvent('qb-phone:server:SetCallState', true)

    for _ = 1, Config.CallRepeats + 1, 1 do
        if not PhoneData.CallData.AnsweredCall then
            if RepeatCount + 1 ~= Config.CallRepeats + 1 then
                if PhoneData.CallData.InCall then
                    RepeatCount = RepeatCount + 1
                    TriggerServerEvent('InteractSound_SV:PlayOnSource', 'demo', 0.1)
                else
                    break
                end
                Wait(Config.RepeatTimeout)
            else
                CancelCall()
                break
            end
        else
            break
        end
    end
end

local function AnswerCall()
    if (PhoneData.CallData.CallType == 'incoming' or PhoneData.CallData.CallType == 'outgoing') and PhoneData.CallData.InCall and not PhoneData.CallData.AnsweredCall then
        PhoneData.CallData.CallType = 'ongoing'
        PhoneData.CallData.AnsweredCall = true
        PhoneData.CallData.CallTime = 0

        SendNUIMessage({ action = 'AnswerCall', CallData = PhoneData.CallData })
        SendNUIMessage({ action = 'SetupHomeCall', CallData = PhoneData.CallData })

        TriggerServerEvent('qb-phone:server:SetCallState', true)

        if PhoneData.isOpen then
            DoPhoneAnimation('cellphone_text_to_call')
        else
            DoPhoneAnimation('cellphone_call_listen_base')
        end

        CreateThread(function()
            while true do
                if PhoneData.CallData.AnsweredCall then
                    PhoneData.CallData.CallTime = PhoneData.CallData.CallTime + 1
                    SendNUIMessage({
                        action = 'UpdateCallTime',
                        Time = PhoneData.CallData.CallTime,
                        Name = PhoneData.CallData.TargetData.name,
                    })
                else
                    break
                end

                Wait(1000)
            end
        end)

        TriggerServerEvent('qb-phone:server:AnswerCall', PhoneData.CallData)
        exports['pma-voice']:addPlayerToCall(PhoneData.CallData.CallId)
    else
        PhoneData.CallData.InCall = false
        PhoneData.CallData.CallType = nil
        PhoneData.CallData.AnsweredCall = false

        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Phone',
                text = "You don't have a incoming call...",
                icon = 'fas fa-phone',
                color = '#e84118',
            },
        })
    end
end

-- Command

local function TryOpenPhone()
    local PlayerData = QBCore.Functions.GetPlayerData()
    if PhoneData.isOpen or not LocalPlayer.state.isLoggedIn or (MezosCamera and MezosCamera.active) then return end
    if MezosBatteryDead and MezosBatteryDead() then
        QBCore.Functions.Notify('Your phone battery is dead. Charge it in a vehicle, at home or with a power bank.', 'error')
        return
    end
    if not PlayerData.metadata['ishandcuffed'] and not PlayerData.metadata['inlaststand'] and not PlayerData.metadata['isdead'] and not IsPauseMenuActive() then
        OpenPhone()
    else
        QBCore.Functions.Notify('Action not available at the moment..', 'error')
    end
end

local lastToggle = 0
local function TogglePhone()
    if GetGameTimer() - lastToggle < 400 then return end
    lastToggle = GetGameTimer()
    if PhoneData.isOpen then
        SendNUIMessage({ action = 'mz:forceClose' })
    else
        TryOpenPhone()
    end
end
OpenMezosPhone = OpenPhone

RegisterCommand('phone', TryOpenPhone)
RegisterCommand('mezosphone', TogglePhone)
RegisterKeyMapping('mezosphone', 'Open / close the phone', 'keyboard', Config.OpenPhone)

-- typing in a text field: stop walking so the letters do not move the player
RegisterNUICallback('mz:typing', function(data, cb)
    PhoneTyping = data and data.state == true
    if PhoneData.isOpen then SetNuiFocusKeepInput(Config.WalkWithPhone == true and not PhoneTyping) end
    cb('ok')
end)

-- NUI Callbacks

RegisterNUICallback('CancelOutgoingCall', function(_, cb)
    CancelCall()
    cb('ok')
end)

RegisterNUICallback('DenyIncomingCall', function(_, cb)
    CancelCall()
    cb('ok')
end)

RegisterNUICallback('CancelOngoingCall', function(_, cb)
    CancelCall()
    cb('ok')
end)

RegisterNUICallback('AnswerCall', function(_, cb)
    AnswerCall()
    cb('ok')
end)

RegisterNUICallback('ClearRecentAlerts', function(_, cb)
    TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'phone', 0)
    Config.PhoneApplications['phone'].Alerts = 0
    SendNUIMessage({ action = 'RefreshAppAlerts', AppData = Config.PhoneApplications })
    cb('ok')
end)

RegisterNUICallback('SetBackground', function(data, cb)
    local background = data.background
    PhoneData.MetaData.background = background
    TriggerServerEvent('qb-phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

RegisterNUICallback('GetMissedCalls', function(_, cb)
    cb(PhoneData.RecentCalls)
end)

RegisterNUICallback('GetSuggestedContacts', function(_, cb)
    cb(PhoneData.SuggestedContacts)
end)

RegisterNUICallback('HasPhone', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:HasPhone', function(HasPhone)
        cb(HasPhone)
    end)
end)

RegisterNUICallback('SetupGarageVehicles', function(_, cb)
    cb(PhoneData.GarageVehicles)
end)

RegisterNUICallback('RemoveMail', function(data, cb)
    local MailId = data.mailId
    TriggerServerEvent('qb-phone:server:RemoveMail', MailId)
    cb('ok')
end)

RegisterNUICallback('Close', function(data, cb)
    if MezosCamera and MezosCamera.active then MezosCamera.Stop(true) end
    if type(data) == 'table' and data.camera then
        -- the Camera app takes over (client/camera.lua handles the animation)
    elseif not PhoneData.CallData.InCall then
        DoPhoneAnimation('cellphone_text_out')
        SetTimeout(400, function()
            if PhoneData.isOpen then return end -- reopened in the meantime
            StopAnimTask(PlayerPedId(), PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 2.5)
            deletePhone()
            PhoneData.AnimationData.lib = nil
            PhoneData.AnimationData.anim = nil
        end)
    else
        PhoneData.AnimationData.lib = nil
        PhoneData.AnimationData.anim = nil
        DoPhoneAnimation('cellphone_text_to_call')
    end
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    PhoneTyping = false
    PhoneData.isOpen = false
    cb('ok')
end)

RegisterNUICallback('AcceptMailButton', function(data, cb)
    if data.buttonEvent ~= nil or data.buttonData ~= nil then
        TriggerEvent(data.buttonEvent, data.buttonData)
    end
    TriggerServerEvent('qb-phone:server:ClearButtonData', data.mailId)
    cb('ok')
end)

RegisterNUICallback('AddNewContact', function(data, cb)
    PhoneData.Contacts[#PhoneData.Contacts + 1] = {
        name = data.ContactName,
        number = data.ContactNumber,
        iban = data.ContactIban
    }
    Wait(100)
    cb(PhoneData.Contacts)
    if PhoneData.Chats[data.ContactNumber] ~= nil and next(PhoneData.Chats[data.ContactNumber]) ~= nil then
        PhoneData.Chats[data.ContactNumber].name = data.ContactName
    end
    TriggerServerEvent('qb-phone:server:AddNewContact', data.ContactName, data.ContactNumber, data.ContactIban)
end)

RegisterNUICallback('GetMails', function(_, cb)
    cb(PhoneData.Mails)
end)

RegisterNUICallback('GetWhatsappChat', function(data, cb)
    if PhoneData.Chats[data.phone] ~= nil then
        cb(PhoneData.Chats[data.phone])
    else
        cb(false)
    end
end)

RegisterNUICallback('GetProfilePicture', function(data, cb)
    local number = data.number
    QBCore.Functions.TriggerCallback('qb-phone:server:GetPicture', function(picture)
        cb(picture)
    end, number)
end)

RegisterNUICallback('GetBankContacts', function(_, cb)
    cb(PhoneData.Contacts)
end)

RegisterNUICallback('GetInvoices', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetInvoices', function(resp)
        cb(resp)
    end)
end)

RegisterNUICallback('SharedLocation', function(data, cb)
    local x = data.coords.x
    local y = data.coords.y
    SetNewWaypoint(x, y)
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Messages',
            text = 'Location has been set!',
            icon = 'fas fa-comment',
            color = '#25D366',
            timeout = 1500,
        },
    })
    cb('ok')
end)

RegisterNUICallback('PostAdvert', function(data, cb)
    TriggerServerEvent('qb-phone:server:AddAdvert', data.message, data.url)
    cb('ok')
end)

RegisterNUICallback('DeleteAdvert', function(_, cb)
    TriggerServerEvent('qb-phone:server:DeleteAdvert')
    cb('ok')
end)

RegisterNUICallback('LoadAdverts', function(_, cb)
    SendNUIMessage({
        action = 'RefreshAdverts',
        Adverts = PhoneData.Adverts
    })
    cb('ok')
end)

RegisterNUICallback('ClearAlerts', function(data, cb)
    local chat = data.number
    local ChatKey = GetKeyByNumber(chat)

    if ChatKey and PhoneData.Chats[ChatKey] and PhoneData.Chats[ChatKey].Unread ~= nil then
        local newAlerts = (Config.PhoneApplications['whatsapp'].Alerts - PhoneData.Chats[ChatKey].Unread)
        Config.PhoneApplications['whatsapp'].Alerts = newAlerts
        TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'whatsapp', newAlerts)

        PhoneData.Chats[ChatKey].Unread = 0

        SendNUIMessage({
            action = 'RefreshWhatsappAlerts',
            Chats = PhoneData.Chats,
        })
        SendNUIMessage({ action = 'RefreshAppAlerts', AppData = Config.PhoneApplications })
    end
    cb('ok')
end)

RegisterNUICallback('PayInvoice', function(data, cb)
    local senderCitizenId = data.senderCitizenId
    local society = data.society
    local amount = data.amount
    local invoiceId = data.invoiceId
    QBCore.Functions.TriggerCallback('qb-phone:server:PayInvoice', function(resp)
        cb(resp)
    end, society, amount, invoiceId, senderCitizenId)
    TriggerServerEvent('qb-phone:server:BillingEmail', data, true)
end)

RegisterNUICallback('DeclineInvoice', function(data, cb)
    local society = data.society
    local amount = data.amount
    local invoiceId = data.invoiceId
    QBCore.Functions.TriggerCallback('qb-phone:server:DeclineInvoice', function(resp)
        cb(resp)
    end, society, amount, invoiceId)
    TriggerServerEvent('qb-phone:server:BillingEmail', data, false)
end)

RegisterNUICallback('EditContact', function(data, cb)
    local NewName = data.CurrentContactName
    local NewNumber = data.CurrentContactNumber
    local NewIban = data.CurrentContactIban
    local OldName = data.OldContactName
    local OldNumber = data.OldContactNumber
    local OldIban = data.OldContactIban
    for _, v in pairs(PhoneData.Contacts) do
        if v.name == OldName and v.number == OldNumber then
            v.name = NewName
            v.number = NewNumber
            v.iban = NewIban
        end
    end
    if PhoneData.Chats[NewNumber] ~= nil and next(PhoneData.Chats[NewNumber]) ~= nil then
        PhoneData.Chats[NewNumber].name = NewName
    end
    Wait(100)
    cb(PhoneData.Contacts)
    TriggerServerEvent('qb-phone:server:EditContact', NewName, NewNumber, NewIban, OldName, OldNumber, OldIban)
end)

RegisterNUICallback('GetHashtagMessages', function(data, cb)
    if PhoneData.Hashtags[data.hashtag] ~= nil and next(PhoneData.Hashtags[data.hashtag]) ~= nil then
        cb(PhoneData.Hashtags[data.hashtag])
    else
        cb(nil)
    end
end)

RegisterNUICallback('GetTweets', function(_, cb)
    cb(PhoneData.Tweets)
end)

RegisterNUICallback('UpdateProfilePicture', function(data, cb)
    local pf = data.profilepicture
    PhoneData.MetaData.profilepicture = pf
    TriggerServerEvent('qb-phone:server:SaveMetaData', PhoneData.MetaData)
    cb('ok')
end)

RegisterNUICallback('PostNewTweet', function(data, cb)
    local TweetMessage = {
        firstName = PhoneData.PlayerData.charinfo.firstname,
        lastName = PhoneData.PlayerData.charinfo.lastname,
        citizenid = PhoneData.PlayerData.citizenid,
        message = escape_str(data.Message),
        time = data.Date,
        tweetId = GenerateTweetId(),
        picture = data.Picture,
        url = data.url
    }

    local TwitterMessage = data.Message
    local MentionTag = TwitterMessage:split('@')
    local Hashtag = TwitterMessage:split('#')
    if #Hashtag <= 3 then
        for i = 2, #Hashtag, 1 do
            local Handle = Hashtag[i]:split(' ')[1]
            if Handle ~= nil or Handle ~= '' then
                local InvalidSymbol = string.match(Handle, patt)
                if InvalidSymbol then
                    Handle = Handle:gsub('%' .. InvalidSymbol, '')
                end
                TriggerServerEvent('qb-phone:server:UpdateHashtags', Handle, TweetMessage)
            end
        end

        for i = 2, #MentionTag, 1 do
            local Handle = MentionTag[i]:split(' ')[1]
            if Handle ~= nil or Handle ~= '' then
                local Fullname = Handle:split('_')
                local Firstname = Fullname[1]
                table.remove(Fullname, 1)
                local Lastname = table.concat(Fullname, ' ')

                if (Firstname ~= nil and Firstname ~= '') and (Lastname ~= nil and Lastname ~= '') then
                    if Firstname ~= PhoneData.PlayerData.charinfo.firstname and Lastname ~= PhoneData.PlayerData.charinfo.lastname then
                        TriggerServerEvent('qb-phone:server:MentionedPlayer', Firstname, Lastname, TweetMessage)
                    end
                end
            end
        end

        PhoneData.Tweets[#PhoneData.Tweets + 1] = TweetMessage
        Wait(100)
        cb(PhoneData.Tweets)

        TriggerServerEvent('qb-phone:server:UpdateTweets', PhoneData.Tweets, TweetMessage)
    else
        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Twitter',
                text = 'Invalid Tweet',
                icon = 'fab fa-twitter',
                color = '#1DA1F2',
                timeout = 1000,
            },
        })
    end
end)

RegisterNUICallback('DeleteTweet', function(data, cb)
    TriggerServerEvent('qb-phone:server:DeleteTweet', data.id)
    cb('ok')
end)

RegisterNUICallback('GetMentionedTweets', function(_, cb)
    cb(PhoneData.MentionedTweets)
end)

RegisterNUICallback('GetHashtags', function(_, cb)
    if PhoneData.Hashtags ~= nil and next(PhoneData.Hashtags) ~= nil then
        cb(PhoneData.Hashtags)
    else
        cb(nil)
    end
end)

RegisterNUICallback('FetchSearchResults', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:FetchResult', function(result)
        cb(result)
    end, data.input)
end)


RegisterNUICallback('GetTruckerData', function(_, cb)
    local jobrep = QBCore.Functions.GetPlayerData().metadata['jobrep'] or {}
    if GetResourceState('qb-trucker') ~= 'started' then return cb({}) end
    cb(exports['qb-trucker']:GetTier(jobrep['trucker'] or 0))
end)

RegisterNUICallback('GetGalleryData', function(_, cb)
    local data = PhoneData.Images
    cb(data)
end)

RegisterNUICallback('DeleteImage', function(image, cb)
    TriggerServerEvent('qb-phone:server:RemoveImageFromGallery', image)
    Wait(400)
    TriggerServerEvent('qb-phone:server:getImageFromGallery')
    cb(true)
end)


RegisterNUICallback('track-vehicle', function(data, cb)
    local veh = data.veh
    if findVehFromPlateAndLocate(veh.plate) then
        QBCore.Functions.Notify('Your vehicle has been marked', 'success')
    else
        QBCore.Functions.Notify('This vehicle cannot be located', 'error')
    end
    cb('ok')
end)

RegisterNUICallback('DeleteContact', function(data, cb)
    local Name = data.CurrentContactName
    local Number = data.CurrentContactNumber

    for k, v in pairs(PhoneData.Contacts) do
        if v.name == Name and v.number == Number then
            table.remove(PhoneData.Contacts, k)
            --if PhoneData.isOpen then
            SendNUIMessage({
                action = 'PhoneNotification',
                PhoneNotify = {
                    title = 'Phone',
                    text = 'You deleted contact!',
                    icon = 'fa fa-phone-alt',
                    color = '#04b543',
                    timeout = 1500,
                },
            })
            break
        end
    end
    Wait(100)
    cb(PhoneData.Contacts)
    if PhoneData.Chats[Number] ~= nil and next(PhoneData.Chats[Number]) ~= nil then
        PhoneData.Chats[Number].name = Number
    end
    TriggerServerEvent('qb-phone:server:RemoveContact', Name, Number)
end)

RegisterNUICallback('GetCryptoData', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-crypto:server:GetCryptoData', function(CryptoData)
        cb(CryptoData)
    end, data.crypto)
end)

RegisterNUICallback('BuyCrypto', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-crypto:server:BuyCrypto', function(CryptoData)
        cb(CryptoData)
    end, data)
end)

RegisterNUICallback('SellCrypto', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-crypto:server:SellCrypto', function(CryptoData)
        cb(CryptoData)
    end, data)
end)

RegisterNUICallback('TransferCrypto', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-crypto:server:TransferCrypto', function(CryptoData)
        cb(CryptoData)
    end, data)
end)

RegisterNUICallback('GetCryptoTransactions', function(_, cb)
    local Data = {
        CryptoTransactions = PhoneData.CryptoTransactions
    }
    cb(Data)
end)

RegisterNUICallback('GetAvailableRaces', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:GetRaces', function(Races)
        cb(Races)
    end)
end)

RegisterNUICallback('JoinRace', function(data, cb)
    TriggerServerEvent('qb-lapraces:server:JoinRace', data.RaceData)
    cb('ok')
end)

RegisterNUICallback('LeaveRace', function(data, cb)
    TriggerServerEvent('qb-lapraces:server:LeaveRace', data.RaceData)
    cb('ok')
end)

RegisterNUICallback('StartRace', function(data, cb)
    TriggerServerEvent('qb-lapraces:server:StartRace', data.RaceData.RaceId)
    cb('ok')
end)

RegisterNUICallback('SetAlertWaypoint', function(data, cb)
    local coords = data.alert.coords
    QBCore.Functions.Notify('GPS Location set: ' .. data.alert.title)
    SetNewWaypoint(coords.x, coords.y)
    cb('ok')
end)

RegisterNUICallback('RemoveSuggestion', function(data, cb)
    data = data.data
    if PhoneData.SuggestedContacts ~= nil and next(PhoneData.SuggestedContacts) ~= nil then
        for k, v in pairs(PhoneData.SuggestedContacts) do
            if (data.name[1] == v.name[1] and data.name[2] == v.name[2]) and data.number == v.number and data.bank == v.bank then
                table.remove(PhoneData.SuggestedContacts, k)
            end
        end
    end
    cb('ok')
end)

local function IsPlateFlagged(plate)
    local p, done = promise.new(), false
    local function finish(v) if not done then done = true p:resolve(v) end end
    QBCore.Functions.TriggerCallback('police:server:IsPlateFlagged', function(flagged) finish(flagged == true) end, plate)
    SetTimeout(3000, function() finish(false) end) -- qb-policejob missing / slow
    return Citizen.Await(p)
end

RegisterNUICallback('FetchVehicleResults', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetVehicleSearchResults', function(result)
        if type(result) == 'table' then
            for k, v in pairs(result) do result[k].isFlagged = IsPlateFlagged(v.plate) end
        end
        cb(result or {})
    end, data.input)
end)

RegisterNUICallback('FetchVehicleScan', function(_, cb)
    local vehicle = QBCore.Functions.GetClosestVehicle()
    if not vehicle or vehicle == 0 or #(GetEntityCoords(vehicle) - GetEntityCoords(PlayerPedId())) > 8.0 then return cb(nil) end
    local plate = QBCore.Functions.GetPlate(vehicle)
    local vehname = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle)):lower()
    QBCore.Functions.TriggerCallback('qb-phone:server:ScanPlate', function(result)
        if type(result) ~= 'table' then return cb(nil) end
        result.isFlagged = IsPlateFlagged(plate)
        result.label = sharedVehicles[vehname] and sharedVehicles[vehname]['name'] or 'Unknown brand..'
        cb(result)
    end, plate)
end)

RegisterNUICallback('GetRaces', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:GetListedRaces', function(Races)
        cb(Races)
    end)
end)

RegisterNUICallback('GetTrackData', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:GetTrackData', function(TrackData, CreatorData)
        TrackData.CreatorData = CreatorData
        cb(TrackData)
    end, data.RaceId)
end)

RegisterNUICallback('SetupRace', function(data, cb)
    TriggerServerEvent('qb-lapraces:server:SetupRace', data.RaceId, tonumber(data.AmountOfLaps))
    cb('ok')
end)

RegisterNUICallback('HasCreatedRace', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:HasCreatedRace', function(HasCreated)
        cb(HasCreated)
    end)
end)

RegisterNUICallback('IsInRace', function(_, cb)
    local InRace = exports['qb-lapraces']:IsInRace()
    cb(InRace)
end)

RegisterNUICallback('IsAuthorizedToCreateRaces', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:IsAuthorizedToCreateRaces', function(IsAuthorized, NameAvailable)
        data = {
            IsAuthorized = IsAuthorized,
            IsBusy = exports['qb-lapraces']:IsInEditor(),
            IsNameAvailable = NameAvailable,
        }
        cb(data)
    end, data.TrackName)
end)

RegisterNUICallback('StartTrackEditor', function(data, cb)
    TriggerServerEvent('qb-lapraces:server:CreateLapRace', data.TrackName)
    cb('ok')
end)

RegisterNUICallback('GetRacingLeaderboards', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:GetRacingLeaderboards', function(Races)
        cb(Races)
    end)
end)

RegisterNUICallback('RaceDistanceCheck', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:GetRacingData', function(RaceData)
        local ped = PlayerPedId()
        local coords = GetEntityCoords(ped)
        local checkpointcoords = RaceData.Checkpoints[1].coords
        local dist = #(coords - vector3(checkpointcoords.x, checkpointcoords.y, checkpointcoords.z))
        if dist <= 115.0 then
            if data.Joined then
                TriggerEvent('qb-lapraces:client:WaitingDistanceCheck')
            end
            cb(true)
        else
            QBCore.Functions.Notify('You\'re too far away from the race. GPS has been set to the race.', 'error', 5000)
            SetNewWaypoint(checkpointcoords.x, checkpointcoords.y)
            cb(false)
        end
    end, data.RaceId)
end)

RegisterNUICallback('IsBusyCheck', function(data, cb)
    if data.check == 'editor' then
        cb(exports['qb-lapraces']:IsInEditor())
    else
        cb(exports['qb-lapraces']:IsInRace())
    end
end)

RegisterNUICallback('CanRaceSetup', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-lapraces:server:CanRaceSetup', function(CanSetup)
        cb(CanSetup)
    end)
end)

RegisterNUICallback('GetPlayerHouses', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetPlayerHouses', function(Houses)
        cb(Houses)
    end)
end)

RegisterNUICallback('GetPlayerKeys', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetHouseKeys', function(Keys)
        cb(Keys)
    end)
end)

RegisterNUICallback('SetHouseLocation', function(data, cb)
    SetNewWaypoint(data.HouseData.HouseData.coords.enter.x, data.HouseData.HouseData.coords.enter.y)
    QBCore.Functions.Notify('GPS has been set to ' .. data.HouseData.HouseData.adress .. '!', 'success')
    cb('ok')
end)

RegisterNUICallback('RemoveKeyholder', function(data, cb)
    TriggerServerEvent('qb-houses:server:removeHouseKey', data.HouseData.name, {
        citizenid = data.HolderData.citizenid,
        firstname = data.HolderData.charinfo.firstname,
        lastname = data.HolderData.charinfo.lastname,
    })
    cb('ok')
end)

RegisterNUICallback('TransferCid', function(data, cb)
    local TransferedCid = data.newBsn
    QBCore.Functions.TriggerCallback('qb-phone:server:TransferCid', function(CanTransfer)
        cb(CanTransfer)
    end, TransferedCid, data.HouseData)
end)

RegisterNUICallback('FetchPlayerHouses', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:MeosGetPlayerHouses', function(result)
        cb(result)
    end, data.input)
end)

RegisterNUICallback('SetGPSLocation', function(data, cb)
    SetNewWaypoint(data.coords.x, data.coords.y)
    QBCore.Functions.Notify('GPS has been set!', 'success')
    cb('ok')
end)

RegisterNUICallback('SetApartmentLocation', function(data, cb)
    local ApartmentData = data.data.appartmentdata
    local TypeData = Apartments.Locations[ApartmentData.type]
    SetNewWaypoint(TypeData.coords.enter.x, TypeData.coords.enter.y)
    QBCore.Functions.Notify('GPS has been set!', 'success')
    cb('ok')
end)

RegisterNUICallback('GetCurrentLawyers', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetCurrentLawyers', function(lawyers)
        cb(lawyers)
    end)
end)

RegisterNUICallback('ClearMentions', function(_, cb)
    if Config.PhoneApplications['twitter'] then Config.PhoneApplications['twitter'].Alerts = 0 end
    SendNUIMessage({
        action = 'RefreshAppAlerts',
        AppData = Config.PhoneApplications
    })
    TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'twitter', 0)
    SendNUIMessage({ action = 'RefreshAppAlerts', AppData = Config.PhoneApplications })
    cb('ok')
end)

RegisterNUICallback('ClearGeneralAlerts', function(data, cb)
    SetTimeout(400, function()
        Config.PhoneApplications[data.app].Alerts = 0
        SendNUIMessage({
            action = 'RefreshAppAlerts',
            AppData = Config.PhoneApplications
        })
        TriggerServerEvent('qb-phone:server:SetPhoneAlerts', data.app, 0)
        SendNUIMessage({ action = 'RefreshAppAlerts', AppData = Config.PhoneApplications })
        cb('ok')
    end)
end)

RegisterNUICallback('TransferMoney', function(data, cb)
    data.amount = tonumber(data.amount)
    if tonumber(PhoneData.PlayerData.money.bank) >= data.amount then
        local amaountata = PhoneData.PlayerData.money.bank - data.amount
        TriggerServerEvent('qb-phone:server:TransferMoney', data.iban, data.amount)
        local cbdata = {
            CanTransfer = true,
            NewAmount = amaountata
        }
        cb(cbdata)
    else
        local cbdata = {
            CanTransfer = false,
            NewAmount = nil,
        }
        cb(cbdata)
    end
end)

RegisterNUICallback('CanTransferMoney', function(data, cb)
    local amount = tonumber(data.amountOf)
    local iban = data.sendTo
    local PlayerData = QBCore.Functions.GetPlayerData()

    if (PlayerData.money.bank - amount) >= 0 then
        QBCore.Functions.TriggerCallback('qb-phone:server:CanTransferMoney', function(Transferd)
            if Transferd then
                cb({ TransferedMoney = true, NewBalance = (PlayerData.money.bank - amount) })
            else
                SendNUIMessage({ action = 'PhoneNotification', PhoneNotify = { timeout = 3000, title = 'Wallet', text = 'Account does not exist!', icon = 'fas fa-university', color = '#ff0000', }, })
                cb({ TransferedMoney = false })
            end
        end, amount, iban)
    else
        cb({ TransferedMoney = false })
    end
end)

RegisterNUICallback('GetWhatsappChats', function(_, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetContactPictures', function(Chats)
        cb(Chats)
    end, PhoneData.Chats)
end)

RegisterNUICallback('CallContact', function(data, cb)
    QBCore.Functions.TriggerCallback('qb-phone:server:GetCallState', function(CanCall, IsOnline, _)
        local status = {
            CanCall = CanCall,
            IsOnline = IsOnline,
            InCall = PhoneData.CallData.InCall,
        }
        cb(status)
        if CanCall and not status.InCall and (data.ContactData.number ~= PhoneData.PlayerData.charinfo.phone) then
            CallContact(data.ContactData, data.Anonymous)
        end
    end, data.ContactData)
end)

RegisterNUICallback('SendMessage', function(data, cb)
    local ChatMessage = data.ChatMessage
    local ChatDate = data.ChatDate
    local ChatNumber = data.ChatNumber
    local ChatTime = data.ChatTime
    local ChatType = data.ChatType
    local Ped = PlayerPedId()
    local Pos = GetEntityCoords(Ped)
    local NumberKey = GetKeyByNumber(ChatNumber)
    local ChatKey = GetKeyByDate(NumberKey, ChatDate)
    if PhoneData.Chats[NumberKey] ~= nil then
        if (PhoneData.Chats[NumberKey].messages == nil) then
            PhoneData.Chats[NumberKey].messages = {}
        end
        if PhoneData.Chats[NumberKey].messages[ChatKey] ~= nil then
            if ChatType == 'message' then
                PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                    message = ChatMessage,
                    time = ChatTime,
                    sender = PhoneData.PlayerData.citizenid,
                    type = ChatType,
                    data = {},
                }
            elseif ChatType == 'location' then
                PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                    message = 'Shared Location',
                    time = ChatTime,
                    sender = PhoneData.PlayerData.citizenid,
                    type = ChatType,
                    data = {
                        x = Pos.x,
                        y = Pos.y,
                    },
                }
            elseif ChatType == 'picture' then
                PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                    message = 'Photo',
                    time = ChatTime,
                    sender = PhoneData.PlayerData.citizenid,
                    type = ChatType,
                    data = {
                        url = data.url
                    },
                }
            end
            TriggerServerEvent('qb-phone:server:UpdateMessages', PhoneData.Chats[NumberKey].messages, ChatNumber, false)
            NumberKey = GetKeyByNumber(ChatNumber)
            ReorganizeChats(NumberKey)
        else
            PhoneData.Chats[NumberKey].messages[#PhoneData.Chats[NumberKey].messages + 1] = {
                date = ChatDate,
                messages = {},
            }
            ChatKey = GetKeyByDate(NumberKey, ChatDate)
            if ChatType == 'message' then
                PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                    message = ChatMessage,
                    time = ChatTime,
                    sender = PhoneData.PlayerData.citizenid,
                    type = ChatType,
                    data = {},
                }
            elseif ChatType == 'location' then
                PhoneData.Chats[NumberKey].messages[ChatDate].messages[#PhoneData.Chats[NumberKey].messages[ChatDate].messages + 1] = {
                    message = 'Shared Location',
                    time = ChatTime,
                    sender = PhoneData.PlayerData.citizenid,
                    type = ChatType,
                    data = {
                        x = Pos.x,
                        y = Pos.y,
                    },
                }
            elseif ChatType == 'picture' then
                PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                    message = 'Photo',
                    time = ChatTime,
                    sender = PhoneData.PlayerData.citizenid,
                    type = ChatType,
                    data = {
                        url = data.url
                    },
                }
            end
            TriggerServerEvent('qb-phone:server:UpdateMessages', PhoneData.Chats[NumberKey].messages, ChatNumber, true)
            NumberKey = GetKeyByNumber(ChatNumber)
            ReorganizeChats(NumberKey)
        end
    else
        PhoneData.Chats[#PhoneData.Chats + 1] = {
            name = IsNumberInContacts(ChatNumber),
            number = ChatNumber,
            messages = {},
        }
        NumberKey = GetKeyByNumber(ChatNumber)
        PhoneData.Chats[NumberKey].messages[#PhoneData.Chats[NumberKey].messages + 1] = {
            date = ChatDate,
            messages = {},
        }
        ChatKey = GetKeyByDate(NumberKey, ChatDate)
        if ChatType == 'message' then
            PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                message = ChatMessage,
                time = ChatTime,
                sender = PhoneData.PlayerData.citizenid,
                type = ChatType,
                data = {},
            }
        elseif ChatType == 'location' then
            PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                message = 'Shared Location',
                time = ChatTime,
                sender = PhoneData.PlayerData.citizenid,
                type = ChatType,
                data = {
                    x = Pos.x,
                    y = Pos.y,
                },
            }
        elseif ChatType == 'picture' then
            PhoneData.Chats[NumberKey].messages[ChatKey].messages[#PhoneData.Chats[NumberKey].messages[ChatKey].messages + 1] = {
                message = 'Photo',
                time = ChatTime,
                sender = PhoneData.PlayerData.citizenid,
                type = ChatType,
                data = {
                    url = data.url
                },
            }
        end
        TriggerServerEvent('qb-phone:server:UpdateMessages', PhoneData.Chats[NumberKey].messages, ChatNumber, true)
        NumberKey = GetKeyByNumber(ChatNumber)
        ReorganizeChats(NumberKey)
    end

    QBCore.Functions.TriggerCallback('qb-phone:server:GetContactPicture', function(Chat)
        SendNUIMessage({
            action = 'UpdateChat',
            chatData = Chat,
            chatNumber = ChatNumber,
        })
    end, PhoneData.Chats[GetKeyByNumber(ChatNumber)])
    cb('ok')
end)


RegisterCommand('ping', function(_, args)
    if not args[1] then
        QBCore.Functions.Notify('You need to input a Player ID', 'error')
    else
        TriggerServerEvent('qb-phone:server:sendPing', args[1])
    end
end, false)

-- Handler Events

RegisterNetEvent('QBCore:Client:OnPlayerLoaded', function()
    LoadPhone()
end)

RegisterNetEvent('QBCore:Client:OnPlayerUnload', function()
    PhoneData = {
        MetaData = {},
        isOpen = false,
        PlayerData = nil,
        Contacts = {},
        Tweets = {},
        MentionedTweets = {},
        Hashtags = {},
        Chats = {},
        CallData = {},
        RecentCalls = {},
        Garage = {},
        Mails = {},
        Adverts = {},
        GarageVehicles = {},
        AnimationData = {
            lib = nil,
            anim = nil,
        },
        SuggestedContacts = {},
        CryptoTransactions = {},
        Images = {},
    }
    SendNUIMessage({ action = 'mz:reset' })
end)

RegisterNetEvent('QBCore:Client:OnPlayerUpdated', function(key, val)
    if key == 'job' then
        local JobInfo = val
        SendNUIMessage({
            action = 'UpdateApplications',
            JobData = JobInfo,
            applications = Config.PhoneApplications
        })

        PlayerJob = JobInfo
    elseif key == 'all' then
        local JobInfo = val.job
        SendNUIMessage({
            action = 'UpdateApplications',
            JobData = JobInfo,
            applications = Config.PhoneApplications
        })

        PlayerJob = JobInfo
    end
end)

-- Events

RegisterNetEvent('qb-phone:client:TransferMoney', function(amount, newmoney)
    PhoneData.PlayerData.money.bank = newmoney
    SendNUIMessage({ action = 'PhoneNotification', PhoneNotify = { title = 'Wallet', text = '&#36;' .. amount .. ' has been added to your account!', icon = 'fas fa-university', color = '#8c7ae6', }, })
    SendNUIMessage({ action = 'UpdateBank', NewBalance = PhoneData.PlayerData.money.bank })
end)

-- RegisterNetEvent('qb-phone:client:UpdateTweetsDel', function(source, Tweets)
--     PhoneData.Tweets = Tweets
--     print(source)
--     print(PhoneData.PlayerData.source)
--     --local MyPlayerId = PhoneData.PlayerData.source
--     --GetPlayerServerId(PlayerPedId())
--     if source ~= MyPlayerId then
--         SendNUIMessage({
--             action = "UpdateTweets",
--             Tweets = PhoneData.Tweets
--         })
--     end
-- end)

RegisterNetEvent('qb-phone:client:UpdateTweets', function(src, Tweets, NewTweetData, delete)
    PhoneData.Tweets = Tweets
    local MyPlayerId = PhoneData.PlayerData.source
    if not delete then -- New Tweet
        if src ~= MyPlayerId then
            SendNUIMessage({
                action = 'PhoneNotification',
                PhoneNotify = {
                    title = 'New Tweet (@' .. NewTweetData.firstName .. ' ' .. NewTweetData.lastName .. ')',
                    text = 'A new tweet as been posted.',
                    icon = 'fab fa-twitter',
                    color = '#1DA1F2',
                },
            })
            SendNUIMessage({
                action = 'UpdateTweets',
                Tweets = PhoneData.Tweets
            })
        else
            SendNUIMessage({
                action = 'PhoneNotification',
                PhoneNotify = {
                    title = 'Twitter',
                    text = 'The Tweet has been posted!',
                    icon = 'fab fa-twitter',
                    color = '#1DA1F2',
                    timeout = 1000,
                },
            })
        end
    else -- Deleting a tweet
        if src == MyPlayerId then
            SendNUIMessage({
                action = 'PhoneNotification',
                PhoneNotify = {
                    title = 'Twitter',
                    text = 'The Tweet has been deleted!',
                    icon = 'fab fa-twitter',
                    color = '#1DA1F2',
                    timeout = 1000,
                },
            })
        end
        SendNUIMessage({
            action = 'UpdateTweets',
            Tweets = PhoneData.Tweets
        })
    end
end)

RegisterNetEvent('qb-phone:client:RaceNotify', function(message)
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Racing',
            text = message,
            icon = 'fas fa-flag-checkered',
            color = '#353b48',
            timeout = 3500,
        },
    })
end)

RegisterNetEvent('qb-phone:client:AddRecentCall', function(data, time, type)
    PhoneData.RecentCalls[#PhoneData.RecentCalls + 1] = {
        name = IsNumberInContacts(data.number),
        time = time,
        type = type,
        number = data.number,
        anonymous = data.anonymous
    }
    TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'phone')
    Config.PhoneApplications['phone'].Alerts = Config.PhoneApplications['phone'].Alerts + 1
    SendNUIMessage({
        action = 'RefreshAppAlerts',
        AppData = Config.PhoneApplications
    })
end)

RegisterNetEvent('qb-phone-new:client:BankNotify', function(text)
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Wallet',
            text = text,
            icon = 'fas fa-university',
            timeout = 3500,
            color = '#ff002f',
        },
    })
end)

RegisterNetEvent('qb-phone:client:NewMailNotify', function(MailData)
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Mail',
            text = 'You received a new mail from ' .. MailData.sender,
            icon = 'fas fa-envelope',
            color = '#ff002f',
            timeout = 1500,
        },
    })
    Config.PhoneApplications['mail'].Alerts = Config.PhoneApplications['mail'].Alerts + 1
    TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'mail')
end)

RegisterNetEvent('qb-phone:client:UpdateMails', function(NewMails)
    SendNUIMessage({
        action = 'UpdateMails',
        Mails = NewMails
    })
    PhoneData.Mails = NewMails
end)

RegisterNetEvent('qb-phone:client:UpdateAdvertsDel', function(Adverts)
    PhoneData.Adverts = Adverts
    SendNUIMessage({
        action = 'RefreshAdverts',
        Adverts = PhoneData.Adverts
    })
end)

RegisterNetEvent('qb-phone:client:UpdateAdverts', function(Adverts, LastAd)
    PhoneData.Adverts = Adverts
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Advertisement',
            text = 'A new ad has been posted by ' .. LastAd,
            icon = 'fas fa-ad',
            color = '#ff8f1a',
            timeout = 2500,
        },
    })
    SendNUIMessage({
        action = 'RefreshAdverts',
        Adverts = PhoneData.Adverts
    })
end)

RegisterNetEvent('qb-phone:client:BillingEmail', function(data, paid, name)
    if paid then
        TriggerServerEvent('qb-phone:server:sendNewMail', {
            sender = 'Billing Department',
            subject = 'Invoice Paid',
            message = 'Invoice Has Been Paid From ' .. name .. ' In The Amount Of $' .. data.amount,
        })
    else
        TriggerServerEvent('qb-phone:server:sendNewMail', {
            sender = 'Billing Department',
            subject = 'Invoice Declined',
            message = 'Invoice Has Been Declined From ' .. name .. ' In The Amount Of $' .. data.amount,
        })
    end
end)

RegisterNetEvent('qb-phone:client:CancelCall', function()
    if PhoneData.CallData.CallType == 'ongoing' then
        SendNUIMessage({
            action = 'CancelOngoingCall'
        })
        exports['pma-voice']:removePlayerFromCall(PhoneData.CallData.CallId)
    end
    PhoneData.CallData.CallType = nil
    PhoneData.CallData.InCall = false
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.TargetData = {}

    if not PhoneData.isOpen then
        StopAnimTask(PlayerPedId(), PhoneData.AnimationData.lib, PhoneData.AnimationData.anim, 2.5)
        deletePhone()
        PhoneData.AnimationData.lib = nil
        PhoneData.AnimationData.anim = nil
    else
        PhoneData.AnimationData.lib = nil
        PhoneData.AnimationData.anim = nil
    end

    TriggerServerEvent('qb-phone:server:SetCallState', false)
    SendNUIMessage({ action = 'SetupHomeCall', CallData = PhoneData.CallData }) -- [mezos-phone] keep Dynamic Island in sync

    if not PhoneData.isOpen then
        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Phone',
                text = 'The call has been ended',
                icon = 'fas fa-phone',
                timeout = 3500,
                color = '#e84118',
            },
        })
    else
        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Phone',
                text = 'The call has been ended',
                icon = 'fas fa-phone',
                color = '#e84118',
            },
        })

        SendNUIMessage({
            action = 'SetupHomeCall',
            CallData = PhoneData.CallData,
        })

        SendNUIMessage({
            action = 'CancelOutgoingCall',
        })
    end
end)

RegisterNetEvent('qb-phone:client:GetCalled', function(CallerNumber, CallId, AnonymousCall)
    local RepeatCount = 0
    local CallData = {
        number = CallerNumber,
        name = IsNumberInContacts(CallerNumber),
        anonymous = AnonymousCall
    }

    if AnonymousCall then
        CallData.name = 'Anonymous'
    end

    PhoneData.CallData.CallType = 'incoming'
    PhoneData.CallData.InCall = true
    PhoneData.CallData.AnsweredCall = false
    PhoneData.CallData.TargetData = CallData
    PhoneData.CallData.CallId = CallId

    TriggerServerEvent('qb-phone:server:SetCallState', true)

    SendNUIMessage({
        action = 'SetupHomeCall',
        CallData = PhoneData.CallData,
    })

    for _ = 1, Config.CallRepeats + 1, 1 do
        if not PhoneData.CallData.AnsweredCall then
            if RepeatCount + 1 ~= Config.CallRepeats + 1 then
                if PhoneData.CallData.InCall then
                    QBCore.Functions.TriggerCallback('qb-phone:server:HasPhone', function(HasPhone)
                        if HasPhone then
                            RepeatCount = RepeatCount + 1
                            if not DoNotDisturb then
                                TriggerServerEvent('InteractSound_SV:PlayOnSource', 'ringing', 0.2)
                            end

                            if not PhoneData.isOpen then
                                SendNUIMessage({
                                    action = 'IncomingCallAlert',
                                    CallData = PhoneData.CallData.TargetData,
                                    Canceled = false,
                                    AnonymousCall = AnonymousCall,
                                })
                            end
                        end
                    end)
                else
                    SendNUIMessage({
                        action = 'IncomingCallAlert',
                        CallData = PhoneData.CallData.TargetData,
                        Canceled = true,
                        AnonymousCall = AnonymousCall,
                    })
                    TriggerServerEvent('qb-phone:server:AddRecentCall', 'missed', CallData)
                    break
                end
                Wait(Config.RepeatTimeout)
            else
                SendNUIMessage({
                    action = 'IncomingCallAlert',
                    CallData = PhoneData.CallData.TargetData,
                    Canceled = true,
                    AnonymousCall = AnonymousCall,
                })
                TriggerServerEvent('qb-phone:server:AddRecentCall', 'missed', CallData)
                break
            end
        else
            TriggerServerEvent('qb-phone:server:AddRecentCall', 'incoming', CallData)
            break
        end
    end
end)

RegisterNetEvent('qb-phone:client:UpdateMessages', function(ChatMessages, SenderNumber, New)
    local NumberKey = GetKeyByNumber(SenderNumber)

    if New then
        PhoneData.Chats[#PhoneData.Chats + 1] = {
            name = IsNumberInContacts(SenderNumber),
            number = SenderNumber,
            messages = {},
        }

        NumberKey = GetKeyByNumber(SenderNumber)

        PhoneData.Chats[NumberKey] = {
            name = IsNumberInContacts(SenderNumber),
            number = SenderNumber,
            messages = ChatMessages
        }

        if PhoneData.Chats[NumberKey].Unread ~= nil then
            PhoneData.Chats[NumberKey].Unread = PhoneData.Chats[NumberKey].Unread + 1
        else
            PhoneData.Chats[NumberKey].Unread = 1
        end

        if PhoneData.isOpen then
            if SenderNumber ~= PhoneData.PlayerData.charinfo.phone then
                SendNUIMessage({
                    action = 'PhoneNotification',
                    PhoneNotify = {
                        title = 'Messages',
                        text = 'New message from ' .. IsNumberInContacts(SenderNumber) .. '!',
                        icon = 'fas fa-comment',
                        color = '#25D366',
                        timeout = 1500,
                    },
                })
            else
                SendNUIMessage({
                    action = 'PhoneNotification',
                    PhoneNotify = {
                        title = 'Messages',
                        text = 'Messaged yourself',
                        icon = 'fas fa-comment',
                        color = '#25D366',
                        timeout = 4000,
                    },
                })
            end

            NumberKey = GetKeyByNumber(SenderNumber)
            ReorganizeChats(NumberKey)

            Wait(100)
            QBCore.Functions.TriggerCallback('qb-phone:server:GetContactPictures', function(Chats)
                SendNUIMessage({
                    action = 'UpdateChat',
                    chatData = Chats[GetKeyByNumber(SenderNumber)],
                    chatNumber = SenderNumber,
                    Chats = Chats,
                })
            end, PhoneData.Chats)
        else
            SendNUIMessage({
                action = 'PhoneNotification',
                PhoneNotify = {
                    title = 'Messages',
                    text = 'New message from ' .. IsNumberInContacts(SenderNumber) .. '!',
                    icon = 'fas fa-comment',
                    color = '#25D366',
                    timeout = 3500,
                },
            })
            Config.PhoneApplications['whatsapp'].Alerts = Config.PhoneApplications['whatsapp'].Alerts + 1
            TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'whatsapp')
        end
    else
        PhoneData.Chats[NumberKey].messages = ChatMessages

        if PhoneData.Chats[NumberKey].Unread ~= nil then
            PhoneData.Chats[NumberKey].Unread = PhoneData.Chats[NumberKey].Unread + 1
        else
            PhoneData.Chats[NumberKey].Unread = 1
        end

        if PhoneData.isOpen then
            if SenderNumber ~= PhoneData.PlayerData.charinfo.phone then
                SendNUIMessage({
                    action = 'PhoneNotification',
                    PhoneNotify = {
                        title = 'Messages',
                        text = 'New message from ' .. IsNumberInContacts(SenderNumber) .. '!',
                        icon = 'fas fa-comment',
                        color = '#25D366',
                        timeout = 1500,
                    },
                })
            else
                SendNUIMessage({
                    action = 'PhoneNotification',
                    PhoneNotify = {
                        title = 'Messages',
                        text = 'Messaged yourself',
                        icon = 'fas fa-comment',
                        color = '#25D366',
                        timeout = 4000,
                    },
                })
            end

            NumberKey = GetKeyByNumber(SenderNumber)
            ReorganizeChats(NumberKey)

            Wait(100)
            QBCore.Functions.TriggerCallback('qb-phone:server:GetContactPictures', function(Chats)
                SendNUIMessage({
                    action = 'UpdateChat',
                    chatData = Chats[GetKeyByNumber(SenderNumber)],
                    chatNumber = SenderNumber,
                    Chats = Chats,
                })
            end, PhoneData.Chats)
        else
            SendNUIMessage({
                action = 'PhoneNotification',
                PhoneNotify = {
                    title = 'Messages',
                    text = 'New message from ' .. IsNumberInContacts(SenderNumber) .. '!',
                    icon = 'fas fa-comment',
                    color = '#25D366',
                    timeout = 3500,
                },
            })

            NumberKey = GetKeyByNumber(SenderNumber)
            ReorganizeChats(NumberKey)

            Config.PhoneApplications['whatsapp'].Alerts = Config.PhoneApplications['whatsapp'].Alerts + 1
            TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'whatsapp')
        end
    end
end)

RegisterNetEvent('qb-phone:client:RemoveBankMoney', function(amount)
    if amount > 0 then
        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Wallet',
                text = '$' .. amount .. ' has been removed from your balance!',
                icon = 'fas fa-university',
                color = '#ff002f',
                timeout = 3500,
            },
        })
    end
end)

RegisterNetEvent('qb-phone:RefreshPhone', function()
    LoadPhone()
    SetTimeout(250, function()
        SendNUIMessage({
            action = 'RefreshAlerts',
            AppData = Config.PhoneApplications,
        })
    end)
end)

RegisterNetEvent('qb-phone:client:AddTransaction', function(_, _, Message, Title)
    local Data = {
        TransactionTitle = Title,
        TransactionMessage = Message,
    }
    PhoneData.CryptoTransactions[#PhoneData.CryptoTransactions + 1] = Data
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Crypto',
            text = Message,
            icon = 'fas fa-chart-pie',
            color = '#04b543',
            timeout = 1500,
        },
    })
    SendNUIMessage({
        action = 'UpdateTransactions',
        CryptoTransactions = PhoneData.CryptoTransactions
    })

    TriggerServerEvent('qb-phone:server:AddTransaction', Data)
end)

RegisterNetEvent('qb-phone:client:AddNewSuggestion', function(SuggestionData)
    PhoneData.SuggestedContacts[#PhoneData.SuggestedContacts + 1] = SuggestionData
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = 'Phone',
            text = 'You have a new suggested contact!',
            icon = 'fa fa-phone-alt',
            color = '#04b543',
            timeout = 1500,
        },
    })
    Config.PhoneApplications['phone'].Alerts = Config.PhoneApplications['phone'].Alerts + 1
    TriggerServerEvent('qb-phone:server:SetPhoneAlerts', 'phone', Config.PhoneApplications['phone'].Alerts)
end)

RegisterNetEvent('qb-phone:client:UpdateHashtags', function(Handle, msgData)
    if PhoneData.Hashtags[Handle] ~= nil then
        PhoneData.Hashtags[Handle].messages[#PhoneData.Hashtags[Handle].messages + 1] = msgData
    else
        PhoneData.Hashtags[Handle] = {
            hashtag = Handle,
            messages = {}
        }
        PhoneData.Hashtags[Handle].messages[#PhoneData.Hashtags[Handle].messages + 1] = msgData
    end

    SendNUIMessage({
        action = 'UpdateHashtags',
        Hashtags = PhoneData.Hashtags,
    })
end)

RegisterNetEvent('qb-phone:client:AnswerCall', function()
    if (PhoneData.CallData.CallType == 'incoming' or PhoneData.CallData.CallType == 'outgoing') and PhoneData.CallData.InCall and not PhoneData.CallData.AnsweredCall then
        PhoneData.CallData.CallType = 'ongoing'
        PhoneData.CallData.AnsweredCall = true
        PhoneData.CallData.CallTime = 0

        SendNUIMessage({ action = 'AnswerCall', CallData = PhoneData.CallData })
        SendNUIMessage({ action = 'SetupHomeCall', CallData = PhoneData.CallData })

        TriggerServerEvent('qb-phone:server:SetCallState', true)

        if PhoneData.isOpen then
            DoPhoneAnimation('cellphone_text_to_call')
        else
            DoPhoneAnimation('cellphone_call_listen_base')
        end

        CreateThread(function()
            while true do
                if PhoneData.CallData.AnsweredCall then
                    PhoneData.CallData.CallTime = PhoneData.CallData.CallTime + 1
                    SendNUIMessage({
                        action = 'UpdateCallTime',
                        Time = PhoneData.CallData.CallTime,
                        Name = PhoneData.CallData.TargetData.name,
                    })
                else
                    break
                end

                Wait(1000)
            end
        end)
        exports['pma-voice']:addPlayerToCall(PhoneData.CallData.CallId)
    else
        PhoneData.CallData.InCall = false
        PhoneData.CallData.CallType = nil
        PhoneData.CallData.AnsweredCall = false

        SendNUIMessage({
            action = 'PhoneNotification',
            PhoneNotify = {
                title = 'Phone',
                text = "You don't have a incoming call...",
                icon = 'fas fa-phone',
                color = '#e84118',
            },
        })
    end
end)

RegisterNetEvent('qb-phone:client:addPoliceAlert', function(alertData)
    PlayerJob = QBCore.Functions.GetPlayerData().job
    if PlayerJob.name == 'police' and PlayerJob.onduty then
        SendNUIMessage({
            action = 'AddPoliceAlert',
            alert = alertData,
        })
    end
end)

RegisterNetEvent('qb-phone:client:GiveContactDetails', function()
    local player, distance = GetClosestPlayer()
    if player ~= -1 and distance < 2.5 then
        local PlayerId = GetPlayerServerId(player)
        TriggerServerEvent('qb-phone:server:GiveContactDetails', PlayerId)
    else
        QBCore.Functions.Notify('No one nearby!', 'error')
    end
end)

RegisterNetEvent('qb-phone:client:UpdateLapraces', function()
    SendNUIMessage({
        action = 'UpdateRacingApp',
    })
end)

RegisterNetEvent('qb-phone:client:GetMentioned', function(TweetMessage, AppAlerts)
    if Config.PhoneApplications['twitter'] then Config.PhoneApplications['twitter'].Alerts = AppAlerts end
    SendNUIMessage({ action = 'PhoneNotification', PhoneNotify = { title = 'You have been mentioned in a Tweet!', text = TweetMessage.message, icon = 'fab fa-twitter', color = '#1DA1F2', }, })
    TweetMessage = { firstName = TweetMessage.firstName, lastName = TweetMessage.lastName, message = escape_str(TweetMessage.message), time = TweetMessage.time, picture = TweetMessage.picture }
    PhoneData.MentionedTweets[#PhoneData.MentionedTweets + 1] = TweetMessage
    SendNUIMessage({ action = 'RefreshAppAlerts', AppData = Config.PhoneApplications })
    SendNUIMessage({ action = 'UpdateMentionedTweets', Tweets = PhoneData.MentionedTweets })
end)

RegisterNetEvent('qb-phone:refreshImages', function(images)
    PhoneData.Images = images
end)

RegisterNetEvent('qb-phone:client:CustomNotification', function(title, text, icon, color, timeout) -- Send a PhoneNotification to the phone from anywhere
    SendNUIMessage({
        action = 'PhoneNotification',
        PhoneNotify = {
            title = title,
            text = text,
            icon = icon,
            color = color,
            timeout = timeout,
        },
    })
end)


-- ============================================================
-- [mezos-phone] Extra iOS features (Store, Control Center, Maps,
-- Weather, Compass, Notes, Clock ...). Data saved per character
-- with client KVP so nothing needs to be added to the database.
-- ============================================================

local WeatherNames = {
    'EXTRASUNNY', 'CLEAR', 'NEUTRAL', 'SMOG', 'FOGGY', 'OVERCAST', 'CLOUDS', 'CLEARING',
    'RAIN', 'THUNDER', 'SNOW', 'BLIZZARD', 'SNOWLIGHT', 'XMAS', 'HALLOWEEN', 'RAIN_HALLOWEEN', 'SNOW_HALLOWEEN'
}

local function GetWeatherName()
    local hash = GetPrevWeatherTypeHashName()
    for _, name in ipairs(WeatherNames) do
        if hash == GetHashKey(name) then return name end
    end
    return 'CLEAR'
end

local function StoreKey()
    local cid = (PhoneData.PlayerData and PhoneData.PlayerData.citizenid) or 'unknown'
    return 'mezos_phone_' .. cid
end

RegisterNUICallback('mz:getStore', function(_, cb)
    local raw = GetResourceKvpString(StoreKey())
    local data = raw and json.decode(raw) or {}
    DoNotDisturb = data.dnd == true
    cb(data)
end)

RegisterNUICallback('mz:setStore', function(data, cb)
    if type(data.store) == 'table' then
        SetResourceKvp(StoreKey(), json.encode(data.store))
        DoNotDisturb = data.store.dnd == true
    end
    cb('ok')
end)

RegisterNUICallback('mz:setDND', function(data, cb)
    DoNotDisturb = data.state == true
    cb('ok')
end)

RegisterNUICallback('mz:getWorld', function(_, cb)
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local streetHash, crossHash = GetStreetNameAtCoord(coords.x, coords.y, coords.z)
    local street = GetStreetNameFromHashKey(streetHash)
    local cross = crossHash ~= 0 and GetStreetNameFromHashKey(crossHash) or nil
    local zone = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z))
    local veh = GetVehiclePedIsIn(ped, false)
    local speed = 0
    if veh ~= 0 then speed = math.floor(GetEntitySpeed(veh) * 3.6) end
    local places = {}
    for i, place in ipairs(Config.Places or {}) do
        places[#places + 1] = {
            id = i,
            label = place.label,
            icon = place.icon,
            category = place.category,
            x = place.coords.x,
            y = place.coords.y,
            distance = math.floor(#(coords - place.coords)),
        }
    end
    local waypoint = IsWaypointActive()
    cb({
        street = street,
        cross = cross,
        zone = zone,
        x = coords.x, y = coords.y, z = coords.z,
        heading = GetEntityHeading(ped),
        camHeading = (360.0 - GetGameplayCamRot(2).z) % 360.0,
        weather = GetWeatherName(),
        rain = GetRainLevel(),
        wind = GetWindSpeed(),
        hour = GetClockHours(),
        minute = GetClockMinutes(),
        dayOfWeek = GetClockDayOfWeek(),
        speed = speed,
        inVehicle = veh ~= 0,
        health = math.max(0, GetEntityHealth(ped) - 100),
        armour = GetPedArmour(ped),
        places = places,
        waypoint = waypoint,
        serverId = GetPlayerServerId(PlayerId()),
    })
end)

RegisterNUICallback('mz:setWaypoint', function(data, cb)
    if data and data.x and data.y then
        SetNewWaypoint(data.x + 0.0, data.y + 0.0)
        QBCore.Functions.Notify(data.label and ('GPS set: ' .. data.label) or 'GPS has been set!', 'success')
    end
    cb('ok')
end)

RegisterNUICallback('mz:clearWaypoint', function(_, cb)
    SetWaypointOff()
    cb('ok')
end)

RegisterNUICallback('mz:shareContact', function(_, cb)
    TriggerEvent('qb-phone:client:GiveContactDetails')
    cb('ok')
end)

RegisterNUICallback('mz:playSound', function(data, cb)
    if not DoNotDisturb and data and data.name then
        TriggerServerEvent('InteractSound_SV:PlayOnSource', data.name, tonumber(data.volume) or 0.2)
    end
    cb('ok')
end)

RegisterNUICallback('mz:copied', function(data, cb)
    if data and data.text then
        QBCore.Functions.Notify('Copied: ' .. tostring(data.text), 'success')
    end
    cb('ok')
end)

-- Let other resources check / close the phone
exports('IsPhoneOpen', function() return PhoneData.isOpen end)
exports('ClosePhone', function()
    if PhoneData.isOpen then SendNUIMessage({ action = 'mz:forceClose' }) end
end)
exports('SendNotification', function(title, text, icon, color, timeout)
    SendNUIMessage({ action = 'PhoneNotification', PhoneNotify = { title = title, text = text, icon = icon, color = color, timeout = timeout } })
end)

-- Threads

CreateThread(function()
    Wait(500)
    LoadPhone()
end)

CreateThread(function()
    while true do
        if PhoneData.isOpen then
            SendNUIMessage({
                action = 'UpdateTime',
                InGameTime = CalculateTimeToDisplay(),
            })
        end
        Wait(1000)
    end
end)

CreateThread(function()
    while true do
        Wait(60000)
        if LocalPlayer.state.isLoggedIn then
            QBCore.Functions.TriggerCallback('qb-phone:server:GetPhoneData', function(pData)
                if pData.PlayerContacts ~= nil and next(pData.PlayerContacts) ~= nil then
                    PhoneData.Contacts = pData.PlayerContacts
                end
                SendNUIMessage({
                    action = 'RefreshContacts',
                    Contacts = PhoneData.Contacts
                })
            end)
        end
    end
end)


-- ================= iApple device (Setup Assistant / Activation Lock) =================
RegisterNUICallback('mz:device', function(data, cb)
    if type(data) ~= 'table' then return cb(nil) end
    local names = { setup = 'mezos-phone:server:device:setup', passcode = 'mezos-phone:server:device:passcode', unlock = 'mezos-phone:server:device:unlock', get = 'mezos-phone:server:device' }
    local name = names[data.fn]
    if not name then return cb(nil) end
    local done = false
    QBCore.Functions.TriggerCallback(name, function(r) done = true cb(r) end, data.arg)
    SetTimeout(15000, function() if not done then cb(nil) end end)
end)
