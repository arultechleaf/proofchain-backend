-- MySQL migration: admin-managed subscription plans, price history, user subscriptions and their payments.
-- Run once on a database where DB_SYNCHRONIZE=false (e.g. Railway) BEFORE deploying the code that uses it:
-- the app reads the new users columns at every sign-in.
-- Locally (DB_SYNCHRONIZE=true) the app creates all of this by itself.
-- The app adds the five sample plans the first time subscription_plans is empty.

CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_value` int NOT NULL,
  `duration_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount_percentage` decimal(5,2) NOT NULL DEFAULT '0.00',
  `final_price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INR',
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_3679d2313bfaf654eb1bc25eae` (`plan_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_plan_price_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL,
  `old_price` decimal(12,2) DEFAULT NULL,
  `new_price` decimal(12,2) NOT NULL,
  `old_discount` decimal(5,2) DEFAULT NULL,
  `new_discount` decimal(5,2) NOT NULL,
  `old_final_price` decimal(12,2) DEFAULT NULL,
  `new_final_price` decimal(12,2) NOT NULL,
  `changed_by` int DEFAULT NULL,
  `changed_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_a7643015cd11f9bcbeb9ec56dd` (`plan_id`,`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `plan_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_value` int NOT NULL,
  `duration_type` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(12,2) NOT NULL,
  `discount_percentage` decimal(5,2) NOT NULL DEFAULT '0.00',
  `final_price` decimal(12,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INR',
  `start_at` datetime NOT NULL,
  `end_at` datetime NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `reminder_sent_at` datetime DEFAULT NULL,
  `payment_id` int DEFAULT NULL,
  `assigned_by` int DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_31e995e841cc3d61ad6edea033` (`status`,`end_at`),
  KEY `IDX_cf427b0b12e1b2ee93a64328e1` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `user_subscription_id` int DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INR',
  `method` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'created',
  `razorpay_order_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `razorpay_payment_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_63f73c8deabd418e92cd2c0937` (`razorpay_order_id`),
  KEY `IDX_c8c12bf0637939e745ca37f891` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users: the subscription state checked at every request (run once; MySQL has no ADD COLUMN IF NOT EXISTS).
ALTER TABLE `users`
  ADD COLUMN `subscription_status` varchar(20) NOT NULL DEFAULT 'none',
  ADD COLUMN `subscription_plan_id` int NULL,
  ADD COLUMN `subscription_end_at` datetime NULL;
