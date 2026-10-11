# mezos-phone

iPhone-style phone for QBCore, rebuilt from `qb-phone`.

## Install
1. Keep `mezos-phone` in `resources/[Mezos]`. Do **not** run `qb-phone` at the same time.
2. Start `screencapture` (already in `[standalone]`) – the Camera uses it.
3. Database: the new tables are created automatically on start (see `mezos-phone.sql` for reference).
4. Restart the server.

## Keys
| Key | Action |
| --- | --- |
| **M** | open / close the phone (rebind in Settings › Key Bindings › FiveM) |
| **Esc** | close the phone |
| typing in a text field | movement pauses while you type |

You can walk, drive and look around with the mouse while the phone is open - the cursor always stays visible (`Config.WalkWithPhone`).

## Phone numbers
All numbers are 10 digits and start with **06** or **07**. Old numbers are converted automatically when the
resource starts (contacts and message threads are moved to the new number). Turn off with `Config.ConvertOldNumbers`.

## iApple Setup Assistant
Every phone item has its own serial number, owner and passcode (saved in the item, `Config.SetupAssistant`).
- A **new phone** starts with the iPhone setup: language, region, Wi-Fi, Face ID, passcode, iApple ID, terms,
  phone name, appearance and wallpaper.
- A phone set up by **another character** shows **Activation Lock**: type the owner's passcode to erase it and set it
  up for yourself (a phone without passcode can simply be erased).
- Face ID unlocks your own phone even with a passcode; changing the passcode in Settings updates the phone item.

## Camera
PHOTO and VIDEO. The phone is the viewfinder (the rest of the screen is dimmed) and shows the camera picture and the player keeps walking / running normally.
A photo / video **only** starts when you press the shutter button on the phone (videos: max `Config.Media.MaxVideoSeconds`).

| Control | Action |
| --- | --- |
| W A S D | walk / run while filming |
| drag on the picture in the phone | aim the camera (moving the mouse alone does not turn it) |
| shutter button | take the photo · start / stop the video (recorded from the phone picture, portrait) |
| PHOTO · VIDEO | switch mode |
| 0.5 · 1× · 2 · 3 | zoom |
| filter chips · ← → | filters (real GTA filters) |
| flip · ⚡ · ⏱ · grid | selfie · flash · timer · grid |
| ✕ / Backspace | back to the Home Screen (Esc / M puts the phone away) |

## Photo / video storage
`Config.Media.provider = 'discord'` (default): files are uploaded to a Discord webhook. Put the webhook in
`server/config_server.lua` (server only, players never see it) or `set mezos_phone_webhook "..."` in server.cfg.
Discord links expire after a day, so the phone stores the message id and gets a fresh link automatically.
Without a webhook the phone falls back to `'local'` (files in `mezos-phone/media`).

## App Store
System apps (Phone, Messages, Mail, Camera, Photos, Wallet, Settings, App Store, MDT for police) are always installed.
Everything else is downloaded from the App Store and saved per character. Prices, sizes and texts are in `Config.Store`.

| App | What it does |
| --- | --- |
| Instagram | photo posts, likes (double-tap), comments, follow, profiles, explore, notifications |
| X | posts, replies, reposts/quotes, likes, trends (#hashtags), mentions, who to follow |
| TikTok | full-screen video feed (For You / Following), likes, comments, follow, discover |
| Marketplace | sell vehicles, property, items, services with a photo; message or call the seller |
| Uber | ride to your map waypoint with a price up front; anyone can go online as a driver (`Config.Uber`), fare is paid automatically, drivers get ratings |
| Tinder | photo profile, swipe deck, matches, "It's a Match!" and messaging (numbers only shared after a match) |
| 1xBet | virtual football / basketball / UFC running all day with live scores; bets paid from and to the bank (`Config.Bets`) |
| DarkChat | anonymous channels with a random alias per channel, messages vanish after 3 days (`Config.DarkChat`) |
| Safari | browser with tabs, bookmarks, history and city websites (below) + real websites (`Config.Browser`) |
| Find My | share your live location with a contact (15 min / 1 h / until you stop) - they see you on the map |
| Radio | every GTA radio station on foot or in a car, favorites, Dynamic Island while playing |
| Health | health, armor, food, water, stress, daily step counter, weekly steps chart |
| Arcade | Snake and 2048 with saved best scores |
| + legacy | Yellow Pages, Garage, Home, Services, Crypto, Racing, Compass |

Extra: **AirDrop** – share a photo/video with a player standing next to you (Photos › share).

## Live video
Instagram (live button / "+" › Go Live), TikTok ("+" › Go LIVE, LIVE tab) and X ("+" › Go live) can stream what your
camera sees. Followers get a notification, viewers can comment and send hearts, and the streamer sees comments,
hearts and viewer count on the camera. It uses `screencapture` (a few pictures per second, no sound) - tune it with
`Config.Live`.

## Safari websites
| Site | |
| --- | --- |
| eyefind.info | search engine (sites, news, cars, Marketplace listings) |
| weazelnews.com | news; jobs in `Config.Browser.NewsJobs` write articles, "breaking" notifies everyone |
| legendarymotorsport.net | every vehicle of `QBCore.Shared.Vehicles` with price, photos, finance calculator, GPS to the dealership |
| dynasty8realestate.com | properties posted in the Marketplace |
| mazebank.com | balance, cash, account number |
| lspd.gov / pillboxhospital.com | report a crime / request an ambulance (sends your location to on-duty units), stations with GPS |

## Advanced
- **Flashlight** (Control Centre / lock screen / Siri): a real light from your hand that other players see.
- **Battery** (`Config.Battery`): drains while used, charges in a running vehicle, indoors or with a power bank item.
  At 0% the phone turns off and calls to it fail. Exports `GetBattery()` / `SetBattery(level)` (client).
- **Emergency SOS** (Control Centre): sends your location to on-duty police or EMS (`Config.Emergency`).
- **Siri** in Spotlight (swipe down on the Home Screen): "call maria", "text john", "go to pillbox", "flashlight on",
  "go live", "sos", "uber", math like "12*7", anything else searches the web.

## Compatibility
- All `qb-phone:*` events are unchanged and `provide 'qb-phone'` keeps other resources working.
- Exports: `IsPhoneOpen()`, `ClosePhone()`, `SendNotification(title, text, icon, color, timeout)` (client),
  `HasPhone(source)`, `sendNewMailToOffline(citizenid, mailData)` (server).
