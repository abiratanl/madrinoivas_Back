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
  `role` enum('admin','owner','attendant','customer','local_manager') NOT NULL DEFAULT 'customer',
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
-- 3. CUSTOMERS
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
-- 4. ADDRESSES
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
-- 7. COLLECTIONS
-- Agrupamento lógico de produtos (Noivas, Madrinhas, Debutantes, Noivos, Acessórios)
-- =================================================================================
CREATE TABLE IF NOT EXISTS `collections` (
  `id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `name` varchar(100) NOT NULL COMMENT 'Nome da coleção (ex: Noivas 2026)',
  `slug` varchar(120) NOT NULL COMMENT 'URL amigável (ex: noivas-2026)',
  `description` text DEFAULT NULL,
  `cover_image_url` varchar(255) DEFAULT NULL COMMENT 'Imagem do card da coleção',
  `position` int DEFAULT '0' COMMENT 'Ordem na listagem',
  `is_active` tinyint(1) DEFAULT '1',
  `start_at` timestamp NULL DEFAULT NULL COMMENT 'Início da vigência',
  `end_at` timestamp NULL DEFAULT NULL COMMENT 'Fim da vigência',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_collections_store_slug` (`store_id`, `slug`),
  KEY `fk_collections_store` (`store_id`),
  KEY `idx_collections_active_position` (`store_id`, `is_active`, `position`),
  CONSTRAINT `fk_collections_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================================
-- 8. PRODUCTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `category_id` char(36) DEFAULT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `size` varchar(10) DEFAULT NULL,
  `color` varchar(50) DEFAULT NULL,
  `brand` varchar(100) DEFAULT NULL,
  `purchase_price` decimal(10,2) DEFAULT '0.00',
  `rental_price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('available','reserved','rented','laundry','maintenance','transferring','discarded') NOT NULL DEFAULT 'available',
  `retired_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_featured` tinyint(1) DEFAULT '0' COMMENT 'Define se aparece na Home Page',
  `collection_id` char(36) DEFAULT NULL COMMENT 'Coleção a que pertence',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code_store` (`code`,`store_id`),
  KEY `idx_product_status` (`status`),
  KEY `fk_products_store` (`store_id`),
  KEY `fk_products_category` (`category_id`),
  KEY `idx_featured` (`is_featured`),
  KEY `fk_products_collection` (`collection_id`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_products_collection` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_products_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================================
-- 9. BANNERS
-- Slides do Hero Carousel (Marketing visual)
-- =================================================================================
CREATE TABLE IF NOT EXISTS `banners` (
  `id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `title` varchar(100) DEFAULT NULL COMMENT 'Texto alternativo para SEO',
  `image_url` varchar(255) NOT NULL,
  `link_url` varchar(255) DEFAULT NULL COMMENT 'Se clicar, vai para onde? (ex: /categoria/noivas)',
  `position` int DEFAULT '0' COMMENT 'Ordem de exibição no carrossel (1, 2, 3...)',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `subtitle` varchar(255) DEFAULT NULL COMMENT 'Texto secundário no overlay',
  `button_text` varchar(50) DEFAULT NULL COMMENT 'Texto do botão CTA (ex: Ver Coleção)',
  `button_variant` enum('primary','outline','ghost') DEFAULT 'primary' COMMENT 'Estilo do botão',
  `overlay_position` enum('left','center','right') DEFAULT 'center' COMMENT 'Alinhamento do conteúdo',
  `overlay_bg_color` varchar(7) DEFAULT NULL COMMENT 'Cor fundo overlay (hex) - ex: #00000080',
  `text_color` varchar(7) DEFAULT '#FFFFFF' COMMENT 'Cor do texto',
  `start_at` timestamp NULL DEFAULT NULL COMMENT 'Início da exibição (agendamento)',
  `end_at` timestamp NULL DEFAULT NULL COMMENT 'Fim da exibição (expiração automática)',
  `target_blank` tinyint(1) DEFAULT '0' COMMENT 'Abrir link em nova aba',
  `mobile_image_url` varchar(255) DEFAULT NULL COMMENT 'Imagem alternativa para mobile',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `collection_id` char(36) DEFAULT NULL COMMENT 'Coleção destacada (se link interno)',
  PRIMARY KEY (`id`),
  KEY `fk_banners_store` (`store_id`),
  KEY `idx_banners_active_position` (`store_id`,`is_active`,`position`),
  KEY `fk_banners_collection` (`collection_id`),
  CONSTRAINT `fk_banners_collection` FOREIGN KEY (`collection_id`) REFERENCES `collections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_banners_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================================
-- 10. RENTALS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `rentals` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `start_date` datetime NOT NULL,
  `end_date_scheduled` datetime NOT NULL,
  `end_date_actual` datetime DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `discount` decimal(10,2) NOT NULL DEFAULT '0.00',
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
-- 11. RENTAL ITEMS
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
-- 12. INSTALLMENTS
-- Installments (receivables) of a rental; penalty entries use type 'penalty'.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `installments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `number` int NOT NULL,
  `total_installments` int NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `due_date` date NOT NULL,
  `amount_paid` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('pending','partially_paid','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
  `type` enum('installment','penalty') NOT NULL DEFAULT 'installment',
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_installments_rental_number_type` (`rental_id`,`number`,`type`),
  CONSTRAINT `fk_installments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 13. PAYMENTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `installment_id` char(36) DEFAULT NULL,
  `user_id` char(36) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('entry','installment','spontaneous','pickup_balance') NOT NULL DEFAULT 'spontaneous',
  `payment_method` enum('cash','credit_card','debit_card','pix','bank_transfer') NOT NULL,
  `notes` text DEFAULT NULL,
  `status` enum('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  `paid_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancelled_by` char(36) DEFAULT NULL,
  `cancellation_reason` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_payments_installment` (`installment_id`),
  KEY `fk_payments_user` (`user_id`),
  KEY `fk_payments_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_payments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_installment` FOREIGN KEY (`installment_id`) REFERENCES `installments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 14. STORES - Initial Data
-- =================================================================================

INSERT INTO `stores` (`id`, `name`, `address`, `phone`) VALUES 
-- Loja 1: Guaratinguetá
('18f78a0d-2e11-4c7b-9128-867142436811', 'Madri Noivas - Guaratinguetá', 'R. Dr. Castro Santos, 98 - Centro, Guaratinguetá - SP, 12505-010', '(12) 3133-7543'),

-- Loja 2: Cruzeiro
('92a6c8b3-764d-4a1e-8260-559648661522', 'Madri Noivas - Cruzeiro', 'Rua Dr. Othon Barcellos, 280 - Centro, Cruzeiro - SP, 12701-080', '(12) 3143-6987');