Config = Config or {}

--[[
    mezos-phone  |  iPhone style phone for QBCore
    ---------------------------------------------------------------
    * System apps are always on the phone (Phone, Messages, Camera ...)
    * Everything else is downloaded from the App Store (saved per character)
    * Apps with `job = 'police'` only show for that job
]]

Config.BillingCommissions = { -- This is a percentage (0.10) == 10%
    mechanic = 0.10
}
Config.TweetDuration = 12 -- (legacy Twitter) hours of tweets to load
Config.RepeatTimeout = 2000
Config.CallRepeats = 10

-- Key that opens AND closes the phone (players can still rebind it in Settings > Key Bindings > FiveM)
Config.OpenPhone = 'M'

-- Any of these items counts as "having a phone"
Config.PhoneItems = { 'phone', 'iphone', 'samsungphone' }

-- iApple Setup Assistant: a new phone item asks for setup (language, Wi-Fi, Face ID, passcode, iApple ID...).
-- A phone set up by another character shows Activation Lock (owner passcode, or Erase when it has none).
Config.SetupAssistant = true

-- Walk / drive while the phone is open (typing in a text field pauses movement automatically)
Config.WalkWithPhone = true

-- Phone numbers: 06xxxxxxxx / 07xxxxxxxx. Old numbers in other formats are converted when the player loads in.
Config.ConvertOldNumbers = true

--[[ Media (photos + videos taken with the Camera)
    provider = 'discord'    -> uploaded to a Discord webhook (put the webhook in server/config_server.lua - it stays on the server)
    provider = 'local'      -> saved in mezos-phone/media and served by this server (no account needed)
    provider = 'fivemanage' -> uploaded to fivemanage.com  (set mezos_phone_fivemanage "API_KEY" in server.cfg)
    PublicUrl: leave '' to use the address players connected with. If players connect through a domain / proxy,
               put the direct address here, e.g. 'http://123.45.67.89:30120'
]]
Config.Media = {
    provider = 'discord',   -- falls back to 'local' while no webhook is set
    PublicUrl = '',
    MaxVideoSeconds = 30,
    MaxPerPlayer = 300, -- oldest local files are deleted after this amount
}

-- Camera filters = real GTA timecycle filters, so they are visible in the saved photo
Config.CameraFilters = {
    { label = 'Original', modifier = false },
    { label = 'Vivid',    modifier = 'phone_cam1' },
    { label = 'Warm',     modifier = 'phone_cam2' },
    { label = 'Cool',     modifier = 'phone_cam3' },
    { label = 'Retro',    modifier = 'phone_cam4' },
    { label = 'Drama',    modifier = 'phone_cam5' },
    { label = 'Faded',    modifier = 'phone_cam6' },
    { label = 'Sunset',   modifier = 'phone_cam7' },
    { label = 'Film',     modifier = 'phone_cam8' },
    { label = 'Mono',     modifier = 'CAMERA_BW' },
    { label = 'Noir',     modifier = 'NG_filmnoir_BW01' },
    { label = 'CCTV',     modifier = 'CAMERA_secuirity' },
}

--[[ Legacy app list (alerts / job filters). The App Store below decides what is installed. ]]
Config.PhoneApplications = {
    ['phone']    = { app = 'phone',    color = '#34c759', icon = 'fas fa-phone',          tooltipText = 'Phone',    job = false, blockedjobs = {}, slot = 1,  Alerts = 0 },
    ['whatsapp'] = { app = 'whatsapp', color = '#34c759', icon = 'fas fa-comment',        tooltipText = 'Messages', job = false, blockedjobs = {}, slot = 2,  Alerts = 0 },
    ['mail']     = { app = 'mail',     color = '#0a84ff', icon = 'fas fa-envelope',       tooltipText = 'Mail',     job = false, blockedjobs = {}, slot = 3,  Alerts = 0 },
    ['camera']   = { app = 'camera',   color = '#3a3a3c', icon = 'fas fa-camera',         tooltipText = 'Camera',   job = false, blockedjobs = {}, slot = 4,  Alerts = 0 },
    ['gallery']  = { app = 'gallery',  color = '#ffffff', icon = 'fas fa-images',         tooltipText = 'Photos',   job = false, blockedjobs = {}, slot = 5,  Alerts = 0 },
    ['bank']     = { app = 'bank',     color = '#1c1c1e', icon = 'fas fa-wallet',         tooltipText = 'Wallet',   job = false, blockedjobs = {}, slot = 6,  Alerts = 0 },
    ['settings'] = { app = 'settings', color = '#8e8e93', icon = 'fas fa-gear',           tooltipText = 'Settings', job = false, blockedjobs = {}, slot = 7,  Alerts = 0 },
    ['advert']   = { app = 'advert',   color = '#ffcc00', icon = 'fas fa-bullhorn',       tooltipText = 'Ads',      job = false, blockedjobs = {}, slot = 9,  Alerts = 0 },
    ['garage']   = { app = 'garage',   color = '#5e5ce6', icon = 'fas fa-car',            tooltipText = 'Garage',   job = false, blockedjobs = {}, slot = 10, Alerts = 0 },
    ['houses']   = { app = 'houses',   color = '#30d158', icon = 'fas fa-house',          tooltipText = 'Home',     job = false, blockedjobs = {}, slot = 11, Alerts = 0 },
    ['lawyers']  = { app = 'lawyers',  color = '#64d2ff', icon = 'fas fa-briefcase',      tooltipText = 'Services', job = false, blockedjobs = {}, slot = 12, Alerts = 0 },
    ['crypto']   = { app = 'crypto',   color = '#1c1c1e', icon = 'fas fa-chart-line',     tooltipText = 'Crypto',   job = false, blockedjobs = {}, slot = 13, Alerts = 0 },
    ['racing']   = { app = 'racing',   color = '#ff375f', icon = 'fas fa-flag-checkered', tooltipText = 'Racing',   job = false, blockedjobs = {}, slot = 14, Alerts = 0 },
    ['meos']     = { app = 'meos',     color = '#0a3d91', icon = 'fas fa-shield-halved',  tooltipText = 'MDT',      job = 'police', blockedjobs = {}, slot = 15, Alerts = 0 },
    ['instagram']= { app = 'instagram',color = '#e1306c', icon = 'fab fa-instagram',      tooltipText = 'Instagram',job = false, blockedjobs = {}, slot = 16, Alerts = 0 },
    ['x']        = { app = 'x',        color = '#000000', icon = 'fab fa-x-twitter',      tooltipText = 'X',        job = false, blockedjobs = {}, slot = 17, Alerts = 0 },
    ['tiktok']   = { app = 'tiktok',   color = '#000000', icon = 'fab fa-tiktok',         tooltipText = 'TikTok',   job = false, blockedjobs = {}, slot = 18, Alerts = 0 },
    ['market']   = { app = 'market',   color = '#1877f2', icon = 'fas fa-store',          tooltipText = 'Marketplace', job = false, blockedjobs = {}, slot = 19, Alerts = 0 },
    ['ride']     = { app = 'ride',     color = '#000000', icon = 'fas fa-taxi',           tooltipText = 'Ride',     job = false, blockedjobs = {}, slot = 20, Alerts = 0 },
}
Config.MaxSlots = 40

--[[ App Store
    system = true  -> always installed, cannot be removed
    preinstalled   -> installed on a new phone, can be removed
    price          -> taken from the bank when downloading (0 = free)
    size           -> MB, only changes the download time
]]
Config.Store = {
    -- system
    { id = 'phone',     system = true },
    { id = 'whatsapp',  system = true },
    { id = 'mail',      system = true },
    { id = 'camera',    system = true },
    { id = 'gallery',   system = true },
    { id = 'bank',      system = true },
    { id = 'settings',  system = true },
    { id = 'store',     system = true },
    { id = 'meos',      system = true, job = 'police' },

    -- preinstalled (removable)
    { id = 'clock',      preinstalled = true, name = 'Clock',      dev = 'Mezos Inc.',  category = 'Utilities',    rating = 4.6, reviews = 2310, size = 12,  desc = 'Alarms, stopwatch, timers and a world clock.' },
    { id = 'calendar',   preinstalled = true, name = 'Calendar',   dev = 'Mezos Inc.',  category = 'Productivity', rating = 4.5, reviews = 1880, size = 18,  desc = 'Plan your day with events and reminders.' },
    { id = 'weather',    preinstalled = true, name = 'Weather',    dev = 'Mezos Inc.',  category = 'Weather',      rating = 4.7, reviews = 5120, size = 24,  desc = 'Live Los Santos weather with an hourly forecast.' },
    { id = 'maps',       preinstalled = true, name = 'Maps',       dev = 'Mezos Inc.',  category = 'Navigation',   rating = 4.4, reviews = 9870, size = 64,  desc = 'Find places around the city and set your GPS in one tap.' },
    { id = 'notes',      preinstalled = true, name = 'Notes',      dev = 'Mezos Inc.',  category = 'Productivity', rating = 4.8, reviews = 3300, size = 9,   desc = 'Quick notes that stay on your phone.' },
    { id = 'calculator', preinstalled = true, name = 'Calculator', dev = 'Mezos Inc.',  category = 'Utilities',    rating = 4.6, reviews = 1200, size = 4,   desc = 'A simple, beautiful calculator.' },
    { id = 'browser',    preinstalled = true, name = 'Safari',     dev = 'Mezos Inc.',  category = 'Utilities',    rating = 4.6, reviews = 15400, size = 38, desc = 'Browse Los Santos: news, cars, homes, banking, city services - and the real internet.' },
    { id = 'findmy',     preinstalled = true, name = 'Find My',    dev = 'Mezos Inc.',  category = 'Navigation',   rating = 4.7, reviews = 6100, size = 14,  desc = 'Share your live location with friends and see where they are on the map.' },

    -- App Store
    { id = 'instagram', name = 'Instagram', dev = 'Instagram, Inc.', category = 'Social', rating = 4.7, reviews = 98200, size = 182, featured = true, color = 'linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 80%,#4f5bd5)',
      desc = 'Share photos from your Camera, follow people in Los Santos, like and comment on posts.' },
    { id = 'x',         name = 'X',         dev = 'X Corp.',          category = 'Social', rating = 4.3, reviews = 76400, size = 121, featured = true,
      desc = 'What is happening in the city right now. Post, reply, repost, like and see what is trending.' },
    { id = 'tiktok',    name = 'TikTok',    dev = 'TikTok Ltd.',      category = 'Entertainment', rating = 4.6, reviews = 120400, size = 248, featured = true,
      desc = 'Record short videos with your Camera and watch the For You feed of the whole city.' },
    { id = 'market',    name = 'Marketplace', dev = 'Mezos Inc.',     category = 'Shopping', rating = 4.5, reviews = 14300, size = 56, featured = true,
      desc = 'Buy and sell cars, houses, items and services. Contact sellers directly.' },
    { id = 'ride',      name = 'Uber',      dev = 'Uber Technologies', category = 'Travel', rating = 4.7, reviews = 88200, size = 92, featured = true,
      desc = 'Request a ride anywhere in Los Santos, or go online and earn money as a driver. Fares are paid automatically.' },
    { id = 'tinder',    name = 'Tinder',    dev = 'Tinder LLC',       category = 'Lifestyle', rating = 4.2, reviews = 64300, size = 110, featured = true,
      desc = 'Swipe right to like, left to pass. When you both like each other it is a match and you can text.' },
    { id = 'bet',       name = '1xBet',     dev = '1X Corp N.V.',     category = 'Sports', rating = 4.1, reviews = 51900, size = 84,
      desc = 'Bet on football, basketball and UFC fights with live scores. Winnings go straight to your bank. 18+ only.' },
    { id = 'darkchat',  name = 'DarkChat',  dev = 'Unknown',          category = 'Social Networking', rating = 3.8, reviews = 6600, size = 18,
      desc = 'Anonymous encrypted group chats. Nobody knows who you are - only the channel name.' },
    { id = 'radio',     name = 'Radio',     dev = 'Mezos Inc.',       category = 'Music', rating = 4.8, reviews = 41000, size = 33, featured = true,
      desc = 'Listen to every Los Santos radio station anywhere - on foot or in your car.' },
    { id = 'health',    name = 'Health',    dev = 'Mezos Inc.',       category = 'Health & Fitness', rating = 4.6, reviews = 8800, size = 28,
      desc = 'Your vitals, food, water, stress and a daily step counter.' },
    { id = 'arcade',    name = 'Arcade',    dev = 'Mezos Games',      category = 'Games', rating = 4.9, reviews = 31000, size = 46,
      desc = 'Snake and 2048 - with your best scores saved.' },
    { id = 'advert',    name = 'Yellow Pages', dev = 'LS Media',      category = 'Shopping', rating = 4.1, reviews = 5300, size = 20,
      desc = 'Post short adverts that everyone in the city can see.' },
    { id = 'garage',    name = 'Garage',    dev = 'Mezos Inc.',       category = 'Lifestyle', rating = 4.5, reviews = 7600, size = 30,
      desc = 'See and track all of your vehicles.' },
    { id = 'houses',    name = 'Home',      dev = 'Dynasty 8',        category = 'Lifestyle', rating = 4.2, reviews = 2100, size = 25,
      desc = 'Your houses, keys and locations.' },
    { id = 'lawyers',   name = 'Services',  dev = 'City of Los Santos', category = 'Business', rating = 4.3, reviews = 3100, size = 15,
      desc = 'Call on-duty police, EMS, mechanics, taxis, lawyers and realtors.' },
    { id = 'crypto',    name = 'Crypto',    dev = 'Qbit Exchange',    category = 'Finance', rating = 4.0, reviews = 6400, size = 40,
      desc = 'Buy, sell and transfer Qbit.' },
    { id = 'racing',    name = 'Racing',    dev = 'LS Underground',   category = 'Sports', rating = 4.4, reviews = 5200, size = 52,
      desc = 'Join and organise street races.' },
    { id = 'compass',   name = 'Compass',   dev = 'Mezos Inc.',       category = 'Utilities', rating = 4.5, reviews = 900, size = 6,
      desc = 'Live compass with your coordinates.' },
}

-- Apps that players who already had the phone keep (so nobody loses their apps after the update)
Config.LegacyApps = { 'advert', 'garage', 'houses', 'lawyers', 'crypto', 'racing', 'compass' }

-- Uber (app id 'ride')
Config.RideJobs = { 'taxi' }          -- these jobs (on duty) can always drive
Config.Uber = {
    AnyoneCanDrive = true,            -- any player can press "Go online" and drive for Uber
    BaseFare = 40,                    -- $ start price
    PerKm = 30,                       -- $ per km
    MinFare = 60,
}

-- 1xBet (app id 'bet')
Config.Bets = {
    MinStake = 10,
    MaxStake = 25000,
    Margin = 0.07,                    -- house edge built into the odds
}

-- DarkChat: set an item name (e.g. 'vpn') to require it, false = everyone can use it
Config.DarkChat = { RequiredItem = false }

-- Live video on Instagram / TikTok / X (needs `screencapture`). Pictures per second = 1000 / (Interval + capture time)
Config.Live = {
    Interval = 450,         -- ms between pictures (lower = smoother, more bandwidth)
    Width = 960, Height = 540,
    MaxViewers = 40,
    MaxStreams = 10,        -- live videos at the same time on the server
    Bandwidth = 400000,     -- bytes/s per viewer
}

-- Safari (Browser app). Websites: eyefind.info, weazelnews.com, legendarymotorsport.net, dynasty8realestate.com,
-- mazebank.com, lspd.gov, pillboxhospital.com, lifeinvader.com
Config.Browser = {
    Homepage = 'eyefind.info',
    AllowInternet = true,                 -- real websites too (many big sites refuse to load inside an app)
    NewsJobs = { 'reporter' },            -- jobs that can publish on Weazel News (the boss can delete articles)
    Dealership = vector3(-45.67, -1098.34, 26.42), -- "Visit the showroom" on legendarymotorsport.net
}

-- Emergency SOS (Control Centre) + 911 / EMS reports (lspd.gov, pillboxhospital.com)
Config.Emergency = {
    PoliceJobs = { 'police' },            -- jobs with type 'leo' are always included
    EMSJobs = { 'ambulance' },            -- jobs with type 'ems' are always included
    Cooldown = 45,                        -- seconds between alerts per player
    BlipSeconds = 120,
}

-- Battery: drains while the phone is used, charges in a running vehicle, indoors (phone closed) or with a power bank.
-- At 0% the phone turns off and calls to it fail until it is charged to 3%.
Config.Battery = {
    Enabled = true,
    DrainOpen = 70,         -- seconds per 1% while the phone is open
    DrainIdle = 720,        -- seconds per 1% while it is in the pocket
    DrainTorch = 120,       -- extra drain of the flashlight
    DrainCamera = 150,      -- extra drain of the camera / live video
    ChargeVehicle = 5,      -- seconds per 1% in a vehicle with the engine on
    ChargeHome = 8,         -- seconds per 1% inside a building (phone closed)
    ChargeIndoors = true,
    PowerbankItem = 'powerbank', -- only used if this item exists in qb-core/shared/items.lua
    ChargePowerbank = 3,
    PowerbankSeconds = 180,
}

-- Radio app stations (GTA station names)
Config.RadioStations = {
    { id = 'RADIO_01_CLASS_ROCK',   label = 'Los Santos Rock Radio', genre = 'Classic Rock',  color = '#e74c3c' },
    { id = 'RADIO_02_POP',          label = 'Non-Stop-Pop FM',       genre = 'Pop',           color = '#ff6fb5' },
    { id = 'RADIO_03_HIPHOP_NEW',   label = 'Radio Los Santos',      genre = 'Hip Hop',       color = '#f1c40f' },
    { id = 'RADIO_04_PUNK',         label = 'Channel X',             genre = 'Punk',          color = '#2ecc71' },
    { id = 'RADIO_05_TALK_01',      label = 'WCTR',                  genre = 'Talk',          color = '#95a5a6' },
    { id = 'RADIO_06_COUNTRY',      label = 'Rebel Radio',           genre = 'Country',       color = '#d35400' },
    { id = 'RADIO_07_DANCE_01',     label = 'Soulwax FM',            genre = 'Electronic',    color = '#8e44ad' },
    { id = 'RADIO_08_MEXICAN',      label = 'East Los FM',           genre = 'Mexican',       color = '#16a085' },
    { id = 'RADIO_09_HIPHOP_OLD',   label = 'West Coast Classics',   genre = 'Classic Hip Hop', color = '#c0392b' },
    { id = 'RADIO_12_REGGAE',       label = 'Blue Ark',              genre = 'Reggae',        color = '#27ae60' },
    { id = 'RADIO_13_JAZZ',         label = 'Worldwide FM',          genre = 'Eclectic',      color = '#2980b9' },
    { id = 'RADIO_14_DANCE_02',     label = 'FlyLo FM',              genre = 'Electronic',    color = '#e67e22' },
    { id = 'RADIO_15_MOTOWN',       label = 'The Lowdown 91.1',      genre = 'Soul',          color = '#9b59b6' },
    { id = 'RADIO_16_SILVERLAKE',   label = 'Radio Mirror Park',     genre = 'Indie',         color = '#1abc9c' },
    { id = 'RADIO_17_FUNK',         label = 'Space 103.2',           genre = 'Funk',          color = '#f39c12' },
    { id = 'RADIO_18_90S_ROCK',     label = 'Vinewood Boulevard',    genre = 'Rock',          color = '#e84393' },
    { id = 'RADIO_20_THELAB',       label = 'The Lab',               genre = 'Hip Hop',       color = '#34495e' },
    { id = 'RADIO_21_DLC_XM17',     label = 'Blonded Los Santos',    genre = 'Alternative',   color = '#fdcb6e' },
    { id = 'RADIO_22_DLC_BATTLE_MIX1_RADIO', label = 'Los Santos Underground', genre = 'House', color = '#6c5ce7' },
}

-- Legacy qb-phone store apps (kept so old character metadata keeps loading)
Config.StoreApps = {}

-- Places shown in the Maps app (tap = set GPS)
Config.Places = {
    { label = 'Legion Square',          category = 'City',       icon = 'fas fa-tree-city',        coords = vector3(195.17, -933.77, 30.69) },
    { label = 'Pillbox Hospital',       category = 'Emergency',  icon = 'fas fa-hospital',         coords = vector3(298.60, -584.50, 43.26) },
    { label = 'Mission Row Police',     category = 'Emergency',  icon = 'fas fa-building-shield',  coords = vector3(428.90, -984.50, 30.70) },
    { label = 'City Hall',              category = 'City',       icon = 'fas fa-landmark',         coords = vector3(-265.36, -963.60, 31.22) },
    { label = 'Pacific Standard Bank',  category = 'City',       icon = 'fas fa-building-columns', coords = vector3(235.00, 216.00, 106.29) },
    { label = 'Motel Garage',           category = 'Vehicles',   icon = 'fas fa-square-parking',   coords = vector3(273.43, -343.99, 44.91) },
    { label = 'Los Santos Customs',     category = 'Vehicles',   icon = 'fas fa-wrench',           coords = vector3(-337.00, -136.90, 39.00) },
    { label = 'Premium Deluxe Motorsport', category = 'Vehicles', icon = 'fas fa-car-side',        coords = vector3(-56.80, -1096.50, 26.42) },
    { label = 'LS International Airport', category = 'Travel',   icon = 'fas fa-plane',            coords = vector3(-1037.00, -2737.00, 20.17) },
    { label = 'Del Perro Pier',         category = 'Leisure',    icon = 'fas fa-umbrella-beach',   coords = vector3(-1850.00, -1231.00, 13.02) },
    { label = 'Vinewood Sign',          category = 'Leisure',    icon = 'fas fa-star',             coords = vector3(711.00, 1198.00, 348.53) },
    { label = 'Mount Chiliad',          category = 'Leisure',    icon = 'fas fa-mountain',         coords = vector3(501.00, 5604.00, 797.91) },
    { label = 'Sandy Shores',           category = 'Travel',     icon = 'fas fa-sun',              coords = vector3(1961.00, 3740.00, 32.34) },
    { label = 'Paleto Bay',             category = 'Travel',     icon = 'fas fa-anchor',           coords = vector3(-448.00, 6011.00, 31.72) },
}
