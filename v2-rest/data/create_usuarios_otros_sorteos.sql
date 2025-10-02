-- Tabla para usuarios de otros sorteos
-- Basada en la estructura de la tabla 'users' con columna adicional fecha_registro
-- SIN id_tabla ya que estos usuarios no están asociados a tablas de bingo

CREATE TABLE `usuarios_otros_sorteos` (
  `id` int NOT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_card` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provincia_id` int DEFAULT NULL,
  `canton_id` int DEFAULT NULL,
  `barrio_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `latitud` decimal(10,8) DEFAULT NULL,
  `longitud` decimal(11,8) DEFAULT NULL,
  `ubicacion_detallada` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `otp` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `otp_expires_at` timestamp NULL DEFAULT NULL,
  `phone_verified` tinyint(1) DEFAULT '0',
  `id_registrador` int DEFAULT NULL,
  `id_evento` int DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha específica de registro en el sorteo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para la tabla usuarios_otros_sorteos
ALTER TABLE `usuarios_otros_sorteos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `id_card` (`id_card`),
  ADD KEY `fk_usuarios_otros_provincia` (`provincia_id`),
  ADD KEY `fk_usuarios_otros_canton` (`canton_id`),
  ADD KEY `fk_usuarios_otros_barrio` (`barrio_id`),
  ADD KEY `idx_otp` (`otp_expires_at`,`otp`),
  ADD KEY `fk_usuarios_otros_registrador` (`id_registrador`),
  ADD KEY `fk_usuarios_otros_evento` (`id_evento`),
  ADD KEY `idx_fecha_registro` (`fecha_registro`);

-- AUTO_INCREMENT para la tabla usuarios_otros_sorteos
ALTER TABLE `usuarios_otros_sorteos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

-- Restricciones para la tabla usuarios_otros_sorteos (opcional - según tu esquema de FK)
-- Descomenta las líneas siguientes si quieres mantener las relaciones con otras tablas

/*
ALTER TABLE `usuarios_otros_sorteos`
  ADD CONSTRAINT `fk_usuarios_otros_provincia` FOREIGN KEY (`provincia_id`) REFERENCES `provincias` (`id`),
  ADD CONSTRAINT `fk_usuarios_otros_canton` FOREIGN KEY (`canton_id`) REFERENCES `cantones` (`id`),
  ADD CONSTRAINT `fk_usuarios_otros_barrio` FOREIGN KEY (`barrio_id`) REFERENCES `barrios` (`ID`),
  ADD CONSTRAINT `fk_usuarios_otros_registrador` FOREIGN KEY (`id_registrador`) REFERENCES `registrador` (`id`);
*/