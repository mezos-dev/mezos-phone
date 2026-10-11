fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'mezos-phone'
author 'Mezos'
description 'mezos-phone - iPhone style phone for QBCore'
version '3.0.0'

-- Lets other resources that depend on "qb-phone" keep working
provide 'qb-phone'

dependencies {
    'qb-core',
    'oxmysql',
}

shared_scripts {
    'config.lua',
    '@qb-apartments/config.lua'
}

client_scripts {
    'client.lua',
    'client/*.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua',
    'server/*.lua',
    'server/discord.js',
}

node_version '22' -- fetch / FormData for the Discord uploader

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/css/*.css',
    'html/js/*.js',
    'html/js/apps/*.js',
    'html/fonts/*.woff2',
}
