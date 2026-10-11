--[[
    mezos-phone | server-only settings (this file is never sent to players)
]]
ServerConfig = ServerConfig or {}

-- Discord webhook used to store photos / videos (Config.Media.provider = 'discord').
-- Discord: Server Settings > Integrations > Webhooks > New Webhook > Copy Webhook URL
-- You can also leave this empty and put   set mezos_phone_webhook "https://discord.com/api/webhooks/..."   in server.cfg
ServerConfig.DiscordWebhook = 'https://discord.com/api/webhooks/1097882651614003300/R848lFugcThqis6BRzZj2n5rLnjGrcz2adEZ8RpntrUMw8gf60k_BCZ0o1imbBfWdMwk'
