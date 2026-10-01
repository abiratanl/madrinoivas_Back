-- =================================================================================
-- DATABASE CREATION AND SETUP
-- =================================================================================
CREATE DATABASE IF NOT EXISTS `madri_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `madri_db`;

-- =================================================================================
-- 1. STORES
-- Physical locations of the rental network.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `stores` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `address` text,
  `phone` varchar(20),
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 2. USERS
-- System users (Admins, Owners, Attendants) and Clients with login access.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` char(36) NOT NULL,
  `store_id` char(36) DEFAULT NULL, -- NULL for global admins, specific ID for attendants
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','proprietario','atendente','cliente') NOT NULL DEFAULT 'cliente',
  `is_active` tinyint(1) DEFAULT '1',
  `must_change_password` tinyint(1) DEFAULT '1',
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  CONSTRAINT `fk_users_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 3. ADDRESSES
-- Shared address table for both customers and stores
-- =================================================================================
CREATE TABLE IF NOT EXISTS `addresses` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) DEFAULT NULL, -- FK to customers table
  `store_id` char(36) DEFAULT NULL,   -- FK to stores table
  `type` enum('residential','commercial','delivery','event_venue') DEFAULT 'residential',
  `label` varchar(100) DEFAULT 'Principal',
  `zip_code` varchar(9) DEFAULT NULL,
  `street` varchar(255) DEFAULT NULL,
  `number` varchar(20) DEFAULT NULL,
  `complement` varchar(100) DEFAULT NULL,
  `neighborhood` varchar(100) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` char(2) DEFAULT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_addresses_customer` (`customer_id`),
  KEY `idx_addresses_store` (`store_id`),
  CONSTRAINT `fk_addresses_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_addresses_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 4. CUSTOMERS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `rg` varchar(20) DEFAULT NULL,
  `cpf` varchar(14) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `measurements` json DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`),
  UNIQUE KEY `rg` (`rg`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 5. CONTACTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `type` enum('whatsapp','mobile','email') NOT NULL,
  `value` varchar(255) NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contacts_customer` (`customer_id`),
  CONSTRAINT `fk_contacts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 6. CATEGORIES
-- =================================================================================
CREATE TABLE IF NOT EXISTS `categories` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 7. PRODUCTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `rental_price` decimal(10,2) NOT NULL,
  `sale_price` decimal(10,2) DEFAULT NULL,
  `store_id` char(36) NOT NULL,
  `category_id` char(36) NOT NULL,
  `code` varchar(50) DEFAULT NULL,
  `status` enum('available','rented','maintenance','sold') DEFAULT 'available',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_products_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 8. RENTALS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `rentals` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `start_date` datetime NOT NULL,
  `end_date_scheduled` datetime NOT NULL,
  `end_date_actual` datetime DEFAULT NULL,
  `total_price` decimal(10,2) NOT NULL,
  `penalty_fee` decimal(10,2) DEFAULT '0.00',
  `status` enum('budget','reserved','picked_up','late','returned','cancelled') DEFAULT 'budget',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_rentals_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_rentals_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_rentals_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 9. RENTAL ITEMS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `rental_items` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_rental_items_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rental_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 10. PAYMENTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` enum('cash','card','pix','transfer','other') NOT NULL,
  `paid_at` datetime DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_payments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 11. STORES - Initial Data
-- =================================================================================

INSERT INTO `stores` (`id`, `name`, `address`, `phone`) VALUES 
-- Loja 1: Guaratinguetá
('18f78a0d-2e11-4c7b-9128-867142436811', 'Madri Noivas - Guaratinguetá', 'R. Dr. Castro Santos, 98 - Centro, Guaratinguetá - SP, 12505-010', '(12) 3133-7543'),

-- Loja 2: Cruzeiro
('92a6c8b3-764d-4a1e-8260-559648661522', 'Madri Noivas - Cruzeiro', 'Rua Dr. Othon Barcellos, 280 - Centro, Cruzeiro - SP, 12701-080', '(12) 3143-6987');