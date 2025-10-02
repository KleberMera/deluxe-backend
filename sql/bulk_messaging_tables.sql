-- Tabla para almacenar las campañas de mensajería masiva
CREATE TABLE IF NOT EXISTS `bulk_messaging_campaigns` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT 'Nombre de la campaña',
  `message` text NOT NULL COMMENT 'Mensaje a enviar',
  `filters` json NOT NULL COMMENT 'Filtros aplicados para seleccionar usuarios',
  `total_users` int(11) NOT NULL DEFAULT 0 COMMENT 'Total de usuarios objetivo',
  `interval_minutes` int(11) NOT NULL DEFAULT 1 COMMENT 'Intervalo en minutos entre lotes',
  `max_messages_per_hour` int(11) NOT NULL DEFAULT 60 COMMENT 'Máximo de mensajes por hora',
  `status` enum('pending','running','completed','cancelled','error') NOT NULL DEFAULT 'pending' COMMENT 'Estado de la campaña',
  `created_by` varchar(100) NOT NULL DEFAULT 'admin' COMMENT 'Usuario que creó la campaña',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `started_at` timestamp NULL DEFAULT NULL COMMENT 'Momento de inicio de la campaña',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT 'Momento de finalización',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Campañas de mensajería masiva';

-- Tabla para logs detallados de cada mensaje enviado
CREATE TABLE IF NOT EXISTS `bulk_messaging_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `campaign_id` int(11) NOT NULL COMMENT 'ID de la campaña',
  `user_id` int(11) NOT NULL COMMENT 'ID del usuario objetivo',
  `phone` varchar(20) NOT NULL COMMENT 'Número de teléfono',
  `first_name` varchar(100) DEFAULT NULL COMMENT 'Nombre del usuario',
  `last_name` varchar(100) DEFAULT NULL COMMENT 'Apellido del usuario',
  `status` enum('pending','sent','error','cancelled') NOT NULL DEFAULT 'pending' COMMENT 'Estado del envío',
  `error_message` text DEFAULT NULL COMMENT 'Mensaje de error si falló',
  `sent_at` timestamp NULL DEFAULT NULL COMMENT 'Momento del envío',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_sent_at` (`sent_at`),
  CONSTRAINT `fk_bulk_logs_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `bulk_messaging_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bulk_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Logs de mensajes enviados en campañas masivas';

-- Índices adicionales para optimizar consultas
CREATE INDEX `idx_campaign_status_sent_at` ON `bulk_messaging_logs` (`campaign_id`, `status`, `sent_at`);
CREATE INDEX `idx_phone_sent_at` ON `bulk_messaging_logs` (`phone`, `sent_at`);

-- Vistas útiles para estadísticas
CREATE OR REPLACE VIEW `v_campaign_stats` AS
SELECT 
  c.id,
  c.name,
  c.status as campaign_status,
  c.total_users,
  c.created_at,
  c.started_at,
  c.completed_at,
  COUNT(l.id) as total_logs,
  SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
  SUM(CASE WHEN l.status = 'error' THEN 1 ELSE 0 END) as error_count,
  SUM(CASE WHEN l.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
  SUM(CASE WHEN l.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
  ROUND((SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) / COUNT(l.id)) * 100, 2) as success_percentage
FROM bulk_messaging_campaigns c
LEFT JOIN bulk_messaging_logs l ON c.id = l.campaign_id
GROUP BY c.id;

-- Vista para estadísticas por barrio
CREATE OR REPLACE VIEW `v_messaging_by_barrio` AS
SELECT 
  b.id as barrio_id,
  b.nombre as barrio_name,
  c.nombre as canton_name,
  p.nombre as provincia_name,
  COUNT(l.id) as total_messages,
  SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) as sent_messages,
  SUM(CASE WHEN l.status = 'error' THEN 1 ELSE 0 END) as error_messages,
  COUNT(DISTINCT l.user_id) as unique_users,
  COUNT(DISTINCT l.campaign_id) as campaigns_count
FROM bulk_messaging_logs l
JOIN users u ON l.user_id = u.id
JOIN barrios b ON u.barrio_id = b.id
JOIN cantones c ON b.canton_id = c.id
JOIN provincias p ON c.provincia_id = p.id
GROUP BY b.id, b.nombre, c.nombre, p.nombre;

-- Procedimiento para limpiar logs antiguos (opcional)
DELIMITER //
CREATE OR REPLACE PROCEDURE CleanOldBulkMessagingLogs(IN days_old INT)
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE campaign_id_to_clean INT;
  DECLARE campaigns_cursor CURSOR FOR 
    SELECT id FROM bulk_messaging_campaigns 
    WHERE completed_at IS NOT NULL 
    AND completed_at < DATE_SUB(NOW(), INTERVAL days_old DAY);
  
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  
  OPEN campaigns_cursor;
  
  cleanup_loop: LOOP
    FETCH campaigns_cursor INTO campaign_id_to_clean;
    IF done THEN
      LEAVE cleanup_loop;
    END IF;
    
    -- Eliminar logs de campañas antiguas completadas
    DELETE FROM bulk_messaging_logs 
    WHERE campaign_id = campaign_id_to_clean;
    
    -- Opcional: también eliminar la campaña
    -- DELETE FROM bulk_messaging_campaigns WHERE id = campaign_id_to_clean;
    
  END LOOP;
  
  CLOSE campaigns_cursor;
  
  SELECT CONCAT('Limpieza completada para campañas anteriores a ', days_old, ' días') as result;
END //
DELIMITER ;

-- Ejemplo de uso del procedimiento (limpiar logs de más de 90 días):
-- CALL CleanOldBulkMessagingLogs(90);