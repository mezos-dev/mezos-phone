-- mezos-phone | creates the tables for the new apps automatically (no SQL import needed)
local Tables = {
    [[CREATE TABLE IF NOT EXISTS `mezos_social_accounts` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `app` VARCHAR(16) NOT NULL,
        `citizenid` VARCHAR(50) NOT NULL,
        `username` VARCHAR(24) NOT NULL,
        `display` VARCHAR(40) NOT NULL,
        `avatar` VARCHAR(255) DEFAULT NULL,
        `bio` VARCHAR(160) DEFAULT NULL,
        `verified` TINYINT(1) NOT NULL DEFAULT 0,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `app_user` (`app`, `username`),
        UNIQUE KEY `app_cid` (`app`, `citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_social_posts` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `app` VARCHAR(16) NOT NULL,
        `citizenid` VARCHAR(50) NOT NULL,
        `content` TEXT DEFAULT NULL,
        `media` VARCHAR(255) DEFAULT NULL,
        `media_type` VARCHAR(10) DEFAULT NULL,
        `reply_to` INT DEFAULT NULL,
        `repost_of` INT DEFAULT NULL,
        `views` INT NOT NULL DEFAULT 0,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `app_created` (`app`, `id`),
        KEY `citizenid` (`citizenid`),
        KEY `reply_to` (`reply_to`),
        KEY `repost_of` (`repost_of`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_social_likes` (
        `post_id` INT NOT NULL,
        `citizenid` VARCHAR(50) NOT NULL,
        PRIMARY KEY (`post_id`, `citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_social_follows` (
        `app` VARCHAR(16) NOT NULL,
        `follower` VARCHAR(50) NOT NULL,
        `followed` VARCHAR(50) NOT NULL,
        PRIMARY KEY (`app`, `follower`, `followed`),
        KEY `followed` (`app`, `followed`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_social_notifs` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `app` VARCHAR(16) NOT NULL,
        `citizenid` VARCHAR(50) NOT NULL,
        `actor` VARCHAR(50) NOT NULL,
        `type` VARCHAR(12) NOT NULL,
        `post_id` INT DEFAULT NULL,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `target` (`app`, `citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_market` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `citizenid` VARCHAR(50) NOT NULL,
        `seller` VARCHAR(60) NOT NULL,
        `phone` VARCHAR(20) DEFAULT NULL,
        `title` VARCHAR(60) NOT NULL,
        `description` TEXT DEFAULT NULL,
        `price` INT NOT NULL DEFAULT 0,
        `category` VARCHAR(20) NOT NULL DEFAULT 'other',
        `image` VARCHAR(255) DEFAULT NULL,
        `sold` TINYINT(1) NOT NULL DEFAULT 0,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `citizenid` (`citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_store_reviews` (
        `app` VARCHAR(20) NOT NULL,
        `citizenid` VARCHAR(50) NOT NULL,
        `name` VARCHAR(60) NOT NULL,
        `rating` TINYINT NOT NULL,
        `text` VARCHAR(300) DEFAULT NULL,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`app`, `citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_uber_drivers` (
        `citizenid` VARCHAR(50) NOT NULL,
        `trips` INT NOT NULL DEFAULT 0,
        `earnings` INT NOT NULL DEFAULT 0,
        `rating_sum` INT NOT NULL DEFAULT 0,
        `rating_count` INT NOT NULL DEFAULT 0,
        PRIMARY KEY (`citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_dating_profiles` (
        `citizenid` VARCHAR(50) NOT NULL,
        `name` VARCHAR(30) NOT NULL,
        `age` TINYINT NOT NULL DEFAULT 25,
        `gender` VARCHAR(8) NOT NULL DEFAULT 'other',
        `interest` VARCHAR(10) NOT NULL DEFAULT 'everyone',
        `bio` VARCHAR(300) DEFAULT NULL,
        `photo` VARCHAR(255) DEFAULT NULL,
        `active` TINYINT(1) NOT NULL DEFAULT 1,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`citizenid`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_dating_swipes` (
        `citizenid` VARCHAR(50) NOT NULL,
        `target` VARCHAR(50) NOT NULL,
        `liked` TINYINT(1) NOT NULL DEFAULT 0,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`citizenid`, `target`),
        KEY `target` (`target`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_bets` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `citizenid` VARCHAR(50) NOT NULL,
        `match_id` INT NOT NULL,
        `label` VARCHAR(120) NOT NULL,
        `pick` VARCHAR(8) NOT NULL,
        `pick_label` VARCHAR(60) NOT NULL,
        `odds` DECIMAL(8,2) NOT NULL,
        `stake` INT NOT NULL,
        `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
        `payout` INT NOT NULL DEFAULT 0,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `citizenid` (`citizenid`),
        KEY `match_status` (`match_id`, `status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_darkchat` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `channel` VARCHAR(24) NOT NULL,
        `alias` VARCHAR(24) NOT NULL,
        `citizenid` VARCHAR(50) NOT NULL,
        `message` VARCHAR(500) NOT NULL,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `channel` (`channel`, `id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `mezos_news` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `citizenid` VARCHAR(50) NOT NULL,
        `author` VARCHAR(60) NOT NULL,
        `title` VARCHAR(120) NOT NULL,
        `body` TEXT NOT NULL,
        `image` VARCHAR(255) DEFAULT NULL,
        `category` VARCHAR(20) NOT NULL DEFAULT 'city',
        `views` INT NOT NULL DEFAULT 0,
        `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
}

MezosPhoneDBReady = false
CreateThread(function()
    for _, q in ipairs(Tables) do
        local ok, err = pcall(MySQL.query.await, q)
        if not ok then print('^1[mezos-phone] SQL error: ' .. tostring(err) .. '^7') end
    end
    MezosPhoneDBReady = true
end)
