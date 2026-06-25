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
-- 3. CATEGORIES
-- Hierarchical structure (e.g., Female -> Dresses -> Wedding).
-- =================================================================================
CREATE TABLE IF NOT EXISTS `categories` (
  `id` char(36) NOT NULL,
  `parent_id` char(36) DEFAULT NULL, -- Self-referencing for subcategories
  `name` varchar(100) NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 4. PRODUCTS
-- The inventory items (dresses, suits, accessories).
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
  `status` enum('available','reserved','rented','laundry','maintenance','retired', 'transferring') NOT NULL DEFAULT 'available',
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_code_store` (`code`,`store_id`),
  KEY `idx_product_status` (`status`),
  KEY `fk_products_store` (`store_id`),
  KEY `fk_products_category` (`category_id`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_products_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =================================================================================
-- 5. CUSTOMERS
-- Extended profile for clients (measurements, personal info).
-- =================================================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL, -- Link to 'users' if they have login access
  `name` varchar(255) NOT NULL,
  `cpf` varchar(14) UNIQUE, 
  `birth_date` date,
  `measurements` json, -- JSON for specific measurements (bust, waist, etc.)
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_customers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 6. ADDRESSES
-- Multiple addresses per customer (Residential, Delivery, Billing).
-- =================================================================================
CREATE TABLE IF NOT EXISTS `addresses` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `type` enum('residential', 'commercial', 'billing', 'delivery', 'event_venue') NOT NULL DEFAULT 'residential',
  `label` varchar(50) DEFAULT NULL, -- e.g., "Home", "Office", "Wedding Hall"
  `zip_code` varchar(10) NOT NULL,
  `street` varchar(255) NOT NULL,
  `number` varchar(20) NOT NULL,
  `complement` varchar(100),
  `neighborhood` varchar(100),
  `city` varchar(100) NOT NULL, -- Indexed for marketing queries
  `state` char(2) NOT NULL,
  `is_default` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_address_city` (`city`),
  CONSTRAINT `fk_addresses_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 7. CONTACTS
-- Extra contact info (Phones, Secondary Emails, Social Media).
-- =================================================================================
CREATE TABLE IF NOT EXISTS `contacts` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `type` enum('mobile', 'whatsapp', 'landline', 'email_secondary', 'instagram') NOT NULL DEFAULT 'whatsapp',
  `value` varchar(255) NOT NULL,
  `is_primary` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_contacts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 8. RENTALS (BOOKINGS)
-- Main transaction table. Controls dates and status.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `rentals` (
  `id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL, -- Audit: Who created the booking
  `delivery_address_id` char(36) DEFAULT NULL, -- NULL means pickup at store
  `delivery_type` enum('pickup_store', 'delivery', 'shipping') DEFAULT 'pickup_store',
  
  -- Scheduling & Logistics
  `start_date` datetime NOT NULL, -- Booking starts (Block inventory)
  `end_date_scheduled` datetime NOT NULL, -- Expected return
  `end_date_real` datetime DEFAULT NULL, -- Actual return
  `laundry_days_needed` int DEFAULT 2, -- Buffer days for cleaning after return
  
  `status` enum('budget', 'reserved', 'picked_up', 'returned', 'late', 'cancelled') NOT NULL DEFAULT 'budget',
  
  -- Financial Summary
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(10,2) DEFAULT '0.00',
  `penalty_fee` decimal(10,2) DEFAULT '0.00', 
  `notes` text,
  
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  KEY `idx_rentals_dates` (`start_date`, `end_date_scheduled`),
  CONSTRAINT `fk_rentals_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_rentals_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  CONSTRAINT `fk_rentals_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_rentals_address` FOREIGN KEY (`delivery_address_id`) REFERENCES `addresses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 9. RENTAL ITEMS
-- Many-to-Many relationship between Rentals and Products.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `rental_items` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL, -- Price frozen at the moment of rental
  `quantity` int DEFAULT 1,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ritems_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ritems_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 10. INSTALLMENTS (ACCOUNTS RECEIVABLE)
-- Planned payments (e.g., 50% signal + 50% upon pickup).
-- =================================================================================
CREATE TABLE IF NOT EXISTS `installments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `number` int NOT NULL, -- Installment number (1, 2...)
  `total_installments` int NOT NULL, -- Total installments (e.g., 2)
  `value` decimal(10,2) NOT NULL,
  `due_date` date NOT NULL,
  `amount_paid` decimal(10,2) DEFAULT '0.00',
  `paid_at` datetime DEFAULT NULL,
  `status` enum('pending', 'partially_paid', 'paid', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_installments_due` (`due_date`, `status`),
  CONSTRAINT `fk_installments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 11. PAYMENTS (CASH FLOW)
-- Actual money received. Linked to an installment.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `id` char(36) NOT NULL,
  `rental_id` char(36) NOT NULL,
  `installment_id` char(36) DEFAULT NULL, -- Can be NULL for ad-hoc payments
  `user_id` char(36) NOT NULL, -- Audit: Who processed the payment
  `amount` decimal(10,2) NOT NULL,
  `payment_method` enum('cash', 'credit_card', 'debit_card', 'pix', 'bank_transfer') NOT NULL,
  `paid_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_payments_rental` FOREIGN KEY (`rental_id`) REFERENCES `rentals` (`id`),
  CONSTRAINT `fk_payments_installment` FOREIGN KEY (`installment_id`) REFERENCES `installments` (`id`),
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 12. PRODUCT LOGS
-- History of maintenance, laundry, and repairs.
-- =================================================================================
CREATE TABLE IF NOT EXISTS `product_logs` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `store_id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL, -- Audit: Who logged the event
  `action` enum('sent_to_laundry', 'returned_from_laundry', 'sent_to_repair', 'returned_from_repair', 'damaged') NOT NULL,
  `cost` decimal(10,2) DEFAULT '0.00', -- Cost incurred (affects ROI)
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_logs_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  CONSTRAINT `fk_logs_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =================================================================================
-- 13. PRODUCT TRANSFERS
-- History of products transfer
-- =================================================================================

CREATE TABLE IF NOT EXISTS `product_transfers` (
  `id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `from_store_id` char(36) NOT NULL, 
  `to_store_id` char(36) NOT NULL,   
  `requested_by` char(36) NOT NULL,  -
  `status` enum('pending', 'in_transit', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `received_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_transfers_product` (`product_id`),
  KEY `fk_transfers_from` (`from_store_id`),
  KEY `fk_transfers_to` (`to_store_id`),
  CONSTRAINT `fk_transfers_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_transfers_from` FOREIGN KEY (`from_store_id`) REFERENCES `stores` (`id`),
  CONSTRAINT `fk_transfers_to` FOREIGN KEY (`to_store_id`) REFERENCES `stores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- =================================================================================
-- 13. STORES TABEL - Initial Data
-- =================================================================================


INSERT INTO `stores` (`id`, `name`, `address`, `phone`) VALUES 
-- Loja 1: Guaratinguetá
('18f78a0d-2e11-4c7b-9128-867142436811', 'Madri Noivas - Guaratinguetá', 'R. Dr. Castro Santos, 98 - Centro, Guaratinguetá - SP, 12505-010', '(12) 3133-7543'),

-- Loja 2: Cruzeiro
('92a6c8b3-764d-4a1e-8260-559648661522', 'Madri Noivas - Cruzeiro', 'Rua Dr. Othon Barcellos, 280 - Centro, Cruzeiro - SP, 12701-080', '(12) 3143-6987');