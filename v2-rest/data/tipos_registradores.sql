-- --------------------------------------------------------
--
-- Crear tabla para tipos de registradores
--

CREATE TABLE `tipos_registradores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_tipo` varchar(100) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_tipo` (`nombre_tipo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
--
-- Alterar tabla registrador para agregar relación con tipos_registradores
--

ALTER TABLE `registrador` 
ADD COLUMN `id_tipo_registrador` int DEFAULT NULL,
ADD KEY `fk_registrador_tipo` (`id_tipo_registrador`),
ADD CONSTRAINT `fk_registrador_tipo` FOREIGN KEY (`id_tipo_registrador`) REFERENCES `tipos_registradores` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- --------------------------------------------------------
--
-- Insertar algunos tipos de registradores de ejemplo
--

INSERT INTO `tipos_registradores` (`nombre_tipo`, `descripcion`) VALUES
('Coordinador General', 'Registrador encargado de coordinar múltiples brigadas'),
('Coordinador de Brigada', 'Registrador encargado de una brigada específica'),
('Registrador de Campo', 'Registrador que trabaja directamente en terreno'),
('Supervisor', 'Registrador con funciones de supervisión y control'),
('Administrativo', 'Registrador con funciones principalmente administrativas');