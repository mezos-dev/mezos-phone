CREATE TABLE IF NOT EXISTS `player_contacts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `number` varchar(50) DEFAULT NULL,
  `iban` varchar(50) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `phone_invoices` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) DEFAULT NULL,
  `amount` int(11) NOT NULL DEFAULT 0,
  `society` tinytext DEFAULT NULL,
  `sender` varchar(50) DEFAULT NULL,
  `sendercitizenid` varchar(50) DEFAULT NULL,
  `candecline` int(1) not null default 1,
  `reason` varchar(256) default null,
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `phone_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) DEFAULT NULL,
  `number` varchar(50) DEFAULT NULL,
  `messages` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`),
  KEY `number` (`number`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `player_mails` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) DEFAULT NULL,
  `sender` varchar(50) DEFAULT NULL,
  `subject` varchar(50) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `read` tinyint(4) DEFAULT 0,
  `mailid` int(11) DEFAULT NULL,
  `date` timestamp NULL DEFAULT current_timestamp(),
  `button` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `crypto_transactions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) DEFAULT NULL,
  `title` varchar(50) DEFAULT NULL,
  `message` varchar(50) DEFAULT NULL,
  `date` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `player_vehicles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `license` varchar(50) DEFAULT NULL,
  `citizenid` varchar(50) DEFAULT NULL,
  `vehicle` varchar(50) DEFAULT NULL,
  `hash` varchar(50) DEFAULT NULL,
  `mods` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `plate` varchar(50) NOT NULL,
  `fakeplate` varchar(50) DEFAULT NULL,
  `garage` varchar(50) DEFAULT NULL,
  `fuel` int(11) DEFAULT 100,
  `engine` float DEFAULT 1000,
  `body` float DEFAULT 1000,
  `state` int(11) DEFAULT 1,
  `depotprice` int(11) NOT NULL DEFAULT 0,
  `drivingdistance` int(50) DEFAULT NULL,
  `status` text DEFAULT NULL,
  `balance` int(11) NOT NULL DEFAULT 0,
  `paymentamount` int(11) NOT NULL DEFAULT 0,
  `paymentsleft` int(11) NOT NULL DEFAULT 0,
  `financetime` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `plate` (`plate`),
  KEY `citizenid` (`citizenid`),
  KEY `license` (`license`)
) ENGINE=InnoDB AUTO_INCREMENT=1;

CREATE TABLE IF NOT EXISTS `phone_gallery` (
   `citizenid` VARCHAR(255) NOT NULL , 
   `image` VARCHAR(255) NOT NULL ,
   `date` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `phone_tweets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `citizenid` varchar(50) DEFAULT NULL,
  `firstName` varchar(25) DEFAULT NULL,
  `lastName` varchar(25) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `date` datetime DEFAULT current_timestamp(),
  `url` text DEFAULT NULL,
  `picture` text DEFAULT './img/default.png',
  `tweetId` varchar(25) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `citizenid` (`citizenid`)
) ENGINE=InnoDB AUTO_INCREMENT=1;

-- ===== mezos-phone v3 (created automatically by server/database.lua) =====

CREATE TABLE IF NOT EXISTS `mezos_social_accounts` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_social_posts` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_social_likes` (
  `post_id` INT NOT NULL,
  `citizenid` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`post_id`, `citizenid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_social_follows` (
  `app` VARCHAR(16) NOT NULL,
  `follower` VARCHAR(50) NOT NULL,
  `followed` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`app`, `follower`, `followed`),
  KEY `followed` (`app`, `followed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_social_notifs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `app` VARCHAR(16) NOT NULL,
  `citizenid` VARCHAR(50) NOT NULL,
  `actor` VARCHAR(50) NOT NULL,
  `type` VARCHAR(12) NOT NULL,
  `post_id` INT DEFAULT NULL,
  `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `target` (`app`, `citizenid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_market` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_store_reviews` (
  `app` VARCHAR(20) NOT NULL,
  `citizenid` VARCHAR(50) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `rating` TINYINT NOT NULL,
  `text` VARCHAR(300) DEFAULT NULL,
  `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`app`, `citizenid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_uber_drivers` (
    `citizenid` VARCHAR(50) NOT NULL,
    `trips` INT NOT NULL DEFAULT 0,
    `earnings` INT NOT NULL DEFAULT 0,
    `rating_sum` INT NOT NULL DEFAULT 0,
    `rating_count` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`citizenid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_dating_profiles` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_dating_swipes` (
    `citizenid` VARCHAR(50) NOT NULL,
    `target` VARCHAR(50) NOT NULL,
    `liked` TINYINT(1) NOT NULL DEFAULT 0,
    `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`citizenid`, `target`),
    KEY `target` (`target`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_bets` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_darkchat` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `channel` VARCHAR(24) NOT NULL,
    `alias` VARCHAR(24) NOT NULL,
    `citizenid` VARCHAR(50) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `created` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `channel` (`channel`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `mezos_news` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
