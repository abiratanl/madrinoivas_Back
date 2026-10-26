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
  `cnpj` varchar(18) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `owner_name` varchar(255) DEFAULT NULL COMMENT 'Legal representative name',
  `owner_cpf` varchar(14) DEFAULT NULL COMMENT 'Legal representative CPF',
  `owner_signature` mediumtext COMMENT 'Owner signature image path in R2 storage',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================================
-- 2. USERS
-- System users (Admins, Owners, Attendants) and Clients with login access.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','owner','attendant','customer','local_manager') NOT NULL DEFAULT 'customer',
  `store_id` char(36) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `must_change_password` tinyint(1) DEFAULT '1',
  `password_reset_token` varchar(255) DEFAULT NULL,
  `password_reset_expires` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_store` (`store_id`),
  CONSTRAINT `fk_users_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 3. CUSTOMERS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `rg` varchar(12) DEFAULT NULL,
  `cpf` varchar(14) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `measurements` json DEFAULT NULL,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  `deleted_at` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cpf` (`cpf`),
  UNIQUE KEY `rg_UNIQUE` (`rg`),
  KEY `fk_customers_user` (`user_id`),
  CONSTRAINT `fk_customers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 4. ADDRESSES
-- Shared address table for both customers and stores
-- =================================================================================
CREATE TABLE IF NOT EXISTS `addresses` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `store_id` char(36) DEFAULT NULL,
  `type` enum('residential','commercial','billing','delivery','event_venue') NOT NULL DEFAULT 'residential',
  `label` varchar(50) DEFAULT NULL,
  `zip_code` varchar(10) NOT NULL,
  `street` varchar(255) NOT NULL,
  `number` varchar(20) NOT NULL,
  `complement` varchar(100) DEFAULT NULL,
  `neighborhood` varchar(100) DEFAULT NULL,
  `city` varchar(100) NOT NULL,
  `state` char(2) NOT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_address_city` (`city`),
  KEY `fk_addresses_customer` (`customer_id`),
  KEY `idx_addresses_store` (`store_id`),
  CONSTRAINT `fk_addresses_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_addresses_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 5. CONTACTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `store_id` char(36) DEFAULT NULL,
  `type` enum('mobile','whatsapp','landline','email','instagram','facebook') NOT NULL DEFAULT 'whatsapp',
  `value` varchar(255) NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_contacts_customer` (`customer_id`),
  KEY `idx_contacts_store` (`store_id`),
  CONSTRAINT `fk_contacts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contacts_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================================
-- 6. CATEGORIES
-- =================================================================================
CREATE TABLE IF NOT EXISTS `categories` (
  `id` char(36) NOT NULL,
  `parent_id` char(36) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_categories_parent` (`parent_id`),
  CONSTRAINT `fk_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 9. PRODUCT IMAGES
-- 
-- =================================================================================
CREATE TABLE IF NOT EXISTS `product_images` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `url_thumb` varchar(255) NOT NULL COMMENT 'URL da miniatura para listas (WebP)',
  `url_full` varchar(255) NOT NULL COMMENT 'URL da imagem em alta resolução (WebP)',
  `is_main` tinyint(1) DEFAULT '0' COMMENT 'Define se é a foto de capa do produto',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_product_images_product` (`product_id`),
  CONSTRAINT `fk_product_images_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci


-- =================================================================================
-- 10. PRODUCT LOGS
-- Logs of product actions (laundry, repair, damage, etc.)
-- =================================================================================
CREATE TABLE IF NOT EXISTS `product_logs` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `action` enum('sent_to_laundry','returned_from_laundry','sent_to_repair','returned_from_repair','damaged') NOT NULL,
  `cost` decimal(10,2) DEFAULT '0.00',
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_logs_product` (`product_id`),
  KEY `fk_logs_store` (`store_id`),
  KEY `fk_logs_user` (`user_id`),
  CONSTRAINT `fk_logs_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_logs_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci


-- =================================================================================
-- 11. PRODUCT TRANSFERS
-- Records of product transfers between stores.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `product_transfers` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `from_store_id` char(36) NOT NULL,
  `to_store_id` char(36) NOT NULL,
  `requested_by` char(36) NOT NULL,
  `received_by` char(36) DEFAULT NULL,
  `status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
  `notes` text,
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `received_at` timestamp NULL DEFAULT NULL,
  `cancelled_by` char(36) DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_transfers_product` (`product_id`),
  KEY `fk_transfers_from` (`from_store_id`),
  KEY `fk_transfers_to` (`to_store_id`),
  KEY `fk_transfers_requested_by` (`requested_by`),
  KEY `fk_transfers_received_by` (`received_by`),
  CONSTRAINT `fk_transfers_from` FOREIGN KEY (`from_store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_transfers_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transfers_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_transfers_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_transfers_to` FOREIGN KEY (`to_store_id`) REFERENCES `stores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 12. BANNERS
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
-- 13. RENTALS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `rentals` (
  `id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `delivery_address_id` char(36) DEFAULT NULL,
  `delivery_type` enum('pickup_store','delivery','shipping') DEFAULT 'pickup_store',
  `start_date` datetime NOT NULL,
  `fitting_date` datetime DEFAULT NULL,
  `end_date_scheduled` datetime NOT NULL,
  `end_date_real` datetime DEFAULT NULL,
  `laundry_days_needed` int DEFAULT '2',
  `status` enum('budget','reserved','picked_up','returned','late','cancelled') NOT NULL DEFAULT 'budget',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(10,2) DEFAULT '0.00',
  `penalty_fee` decimal(10,2) DEFAULT '0.00',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rentals_dates` (`start_date`,`end_date_scheduled`),
  KEY `fk_rentals_store` (`store_id`),
  KEY `fk_rentals_customer` (`customer_id`),
  KEY `fk_rentals_user` (`user_id`),
  KEY `fk_rentals_address` (`delivery_address_id`),
  KEY `idx_rentals_status_id` (`status`,`id`),
  CONSTRAINT `fk_rentals_address` FOREIGN KEY (`delivery_address_id`) REFERENCES `addresses` (`id`),
  CONSTRAINT `fk_rentals_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_rentals_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_rentals_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 14. RENTAL ITEMS
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
-- 15. INSTALLMENTS
-- Installments (receivables) of a rental; penalty entries use type 'penalty'.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `installments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `number` int NOT NULL,
  `total_installments` int NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `due_date` date NOT NULL,
  `amount_paid` decimal(10,2) DEFAULT '0.00',
  `paid_at` datetime DEFAULT NULL,
  `status` enum('pending','partially_paid','paid','overdue','cancelled') NOT NULL DEFAULT 'pending',
  `type` enum('installment','penalty') DEFAULT 'installment',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_installments_due` (`due_date`,`status`),
  KEY `fk_installments_rental` (`rental_id`),
  KEY `idx_installments_rental_status` (`rental_id`,`status`),
  CONSTRAINT `fk_installments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 16. PAYMENTS
-- =================================================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `installment_id` char(36) DEFAULT NULL,
  `user_id` char(36) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('entry','installment','spontaneous','pickup_balance') NOT NULL DEFAULT 'spontaneous',
  `payment_method` enum('cash','credit_card','debit_card','pix','bank_transfer') NOT NULL,
  `paid_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancelled_by` char(36) DEFAULT NULL,
  `cancellation_reason` text,
  `notes` text,
  `status` enum('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  PRIMARY KEY (`id`),
  KEY `fk_payments_rental` (`rental_id`),
  KEY `fk_payments_installment` (`installment_id`),
  KEY `fk_payments_user` (`user_id`),
  KEY `fk_payments_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_payments_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_payments_installment` FOREIGN KEY (`installment_id`) REFERENCES `installments` (`id`),
  CONSTRAINT `fk_payments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`),
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

-- =================================================================================
-- 17. RECEIPTS
-- Payment receipts (issued, signed PDF documents) with WhatsApp delivery status.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `receipts` (
  `id` char(36) NOT NULL,
  `payment_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_method` varchar(20) NOT NULL,
  `issued_at` datetime NOT NULL,
  `created_by` char(36) DEFAULT NULL,
  `whatsapp_delivery_status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_receipts_payment` (`payment_id`),
  KEY `fk_receipts_customer` (`customer_id`),
  KEY `fk_receipts_created_by` (`created_by`),
  CONSTRAINT `fk_receipts_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_receipts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_receipts_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 18. CONTRACTS
-- Rental contracts. Two PDFs are kept permanently in Cloudflare R2 for audit:
-- the original draft (document_hash) and the final signed PDF.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `contracts` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `status` enum('draft','pending_signature','signed','cancelled') NOT NULL DEFAULT 'draft',
  `contract_number` varchar(50) DEFAULT NULL COMMENT 'Sequential contract number (PREFIX-YYYY-0001)',
  `lessee_signature` mediumtext NULL COMMENT 'Lessee signature as a PNG data URL',
  `document_hash` varchar(64) NOT NULL COMMENT 'SHA-256 hash of the original draft PDF',
  `signed_at` datetime DEFAULT NULL COMMENT 'Exact signature date/time (milliseconds)',
  `signer_ip` varchar(45) DEFAULT NULL COMMENT 'IP address of the signing tablet',
  `device_user_agent` text DEFAULT NULL COMMENT 'Tablet hardware/browser information',
  `draft_pdf_path` varchar(255) DEFAULT NULL COMMENT 'R2 key of the original draft PDF',
  `signed_pdf_path` varchar(255) DEFAULT NULL COMMENT 'R2 key of the final signed PDF',
  `notes` text DEFAULT NULL COMMENT 'Cancellation reason / internal notes',
  `issued_at` datetime NOT NULL,
  `created_by` char(36) DEFAULT NULL,
  `whatsapp_delivery_status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `email_delivery_status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contracts_contract_number` (`contract_number`),
  KEY `fk_contracts_rental` (`rental_id`),
  KEY `fk_contracts_customer` (`customer_id`),
  KEY `fk_contracts_created_by` (`created_by`),
  CONSTRAINT `fk_contracts_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_contracts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_contracts_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;




