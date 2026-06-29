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
-- 3. STORES TABEL - Initial Data
-- =================================================================================

INSERT INTO `stores` (`id`, `name`, `address`, `phone`) VALUES 
-- Loja 1: Guaratinguetá
('18f78a0d-2e11-4c7b-9128-867142436811', 'Madri Noivas - Guaratinguetá', 'R. Dr. Castro Santos, 98 - Centro, Guaratinguetá - SP, 12505-010', '(12) 3133-7543'),

-- Loja 2: Cruzeiro
('92a6c8b3-764d-4a1e-8260-559648661522', 'Madri Noivas - Cruzeiro', 'Rua Dr. Othon Barcellos, 280 - Centro, Cruzeiro - SP, 12701-080', '(12) 3143-6987');