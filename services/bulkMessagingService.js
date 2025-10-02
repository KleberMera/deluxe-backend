// services/bulkMessagingService.js
const db = require('../config/db');
const WhatsAppOTPService = require('./whatsappOTPService');
const EventEmitter = require('events');

class BulkMessagingService extends EventEmitter {
  constructor() {
    super();
    this.activeCampaigns = new Map(); // campaignId -> campaign data
    this.messageQueue = new Map(); // campaignId -> queue array
    this.processingIntervals = new Map(); // campaignId -> interval ID
  }

  /**
   * Crear una nueva campaña de envío masivo
   * @param {Object} campaignData - Datos de la campaña
   * @returns {Object} - Datos de la campaña creada
   */
  async createCampaign(campaignData) {
    // Parsear campos que pueden venir como strings JSON desde formularios multipart
    const parsedData = {
      ...campaignData,
      userIds: typeof campaignData.userIds === 'string' ? JSON.parse(campaignData.userIds) : campaignData.userIds,
      filters: typeof campaignData.filters === 'string' ? JSON.parse(campaignData.filters) : campaignData.filters
    };

    const {
      name,
      message,
      filters,
      userIds, // Array de IDs específicos de usuarios
      intervalMinutes = 1,
      maxMessagesPerHour = 60,
      createdBy = 'admin',
      imageUrl = null, // URL de imagen opcional
      imageBuffer = null, // Buffer de imagen opcional
      imageFileName = null // Nombre del archivo de imagen
    } = parsedData;

    try {
      console.log('📝 Creando campaña de envío masivo:', name);

      let targetUsers;

      // Si se proporcionan userIds específicos, usarlos en lugar de filtros
      if (userIds && userIds.length > 0) {
        console.log(`🎯 Usando lista específica de ${userIds.length} usuarios`);
        targetUsers = await this.getUsersByIds(userIds);
      } else {
        console.log('🔍 Usando filtros geográficos para seleccionar usuarios');
        targetUsers = await this.getFilteredUsers(filters);
      }

      if (targetUsers.length === 0) {
        throw new Error('No se encontraron usuarios que coincidan con los filtros o IDs especificados');
      }

      // Crear la campaña en la base de datos
      const [result] = await db.query(`
        INSERT INTO bulk_messaging_campaigns
        (name, message, filters, total_users, interval_minutes, max_messages_per_hour, status, created_by, created_at, image_url, image_file_name)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), ?, ?)
      `, [
        name,
        message,
        JSON.stringify(filters),
        targetUsers.length,
        intervalMinutes,
        maxMessagesPerHour,
        createdBy,
        imageUrl,
        imageFileName
      ]);

      const campaignId = result.insertId;

      // Crear registros individuales para cada usuario
      const userRecords = targetUsers.map(user => [
        campaignId,
        user.id,
        user.phone,
        user.first_name,
        user.last_name,
        'pending'
      ]);

      await db.query(`
        INSERT INTO bulk_messaging_logs
        (campaign_id, user_id, phone, first_name, last_name, status)
        VALUES ?
      `, [userRecords]);

      const campaign = {
        id: campaignId,
        name,
        message,
        filters,
        totalUsers: targetUsers.length,
        intervalMinutes,
        maxMessagesPerHour,
        status: 'pending',
        createdBy,
        createdAt: new Date(),
        imageUrl,
        imageFileName,
        targetUsers
      };

      console.log(`✅ Campaña creada: ${campaignId} - ${targetUsers.length} usuarios`);

      return campaign;

    } catch (error) {
      console.error('❌ Error creando campaña:', error);
      throw error;
    }
  }

  /**
   * Obtener usuarios por IDs específicos con paginación
   * @param {Array} userIds - Array de IDs de usuarios
   * @param {Object} options - Opciones de paginación y búsqueda
   * @returns {Array} - Lista de usuarios
   */
  async getUsersByIds(userIds, options = {}) {
    try {
      const { limit, offset, searchTerm } = options;
      
      if (!userIds || userIds.length === 0) {
        return [];
      }

      let query = `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.phone,
          u.id_card,
          u.phone_verified,
          u.provincia_id,
          u.canton_id,
          u.barrio_id,
          u.id_tabla,
          p.nombre as provincia,
          c.nombre as canton,
          b.BARRIO as barrio,
          bt.table_code,
          bt.entregado as tabla_entregado,
          bt.ocr_validated
        FROM users u
        LEFT JOIN provincias p ON u.provincia_id = p.id
        LEFT JOIN cantones c ON u.canton_id = c.id
        LEFT JOIN barrios b ON u.barrio_id = b.id
        LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
        WHERE u.phone_verified = 1 AND u.id IN (${userIds.map(() => '?').join(',')})
      `;

      const params = [...userIds];

      // Agregar búsqueda si hay término
      if (searchTerm) {
        query += ` AND (
          LOWER(u.first_name) LIKE LOWER(?) OR
          LOWER(u.last_name) LIKE LOWER(?) OR
          u.phone LIKE ? OR
          LOWER(b.BARRIO) LIKE LOWER(?) OR
          LOWER(c.nombre) LIKE LOWER(?)
        )`;
        const searchPattern = `%${searchTerm}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      query += ' ORDER BY u.created_at DESC';

      // Agregar paginación si se especifica
      if (limit) {
        query += ' LIMIT ?';
        params.push(limit);
        
        if (offset) {
          query += ' OFFSET ?';
          params.push(offset);
        }
      }

      const [users] = await db.query(query, params);
      
      console.log(`📋 Encontrados ${users.length} usuarios específicos`);
      return users;

    } catch (error) {
      console.error('❌ Error obteniendo usuarios por IDs:', error);
      throw error;
    }
  }

  /**
   * Obtener usuarios filtrados según criterios
   * @param {Object} filters - Filtros a aplicar
   * @returns {Array} - Lista de usuarios
   */
  async getFilteredUsers(filters, pagination = { page: 1, limit: 50 }, search = '') {
    try {
      let query = `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.phone,
          u.id_card,
          u.phone_verified,
          u.provincia_id,
          u.canton_id,
          u.barrio_id,
          u.id_tabla,
          p.nombre as provincia,
          c.nombre as canton,
          b.BARRIO as barrio,
          bt.table_code,
          bt.entregado as tabla_entregado,
          bt.ocr_validated
        FROM users u
        LEFT JOIN provincias p ON u.provincia_id = p.id
        LEFT JOIN cantones c ON u.canton_id = c.id
        LEFT JOIN barrios b ON u.barrio_id = b.id
        LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
        WHERE u.phone_verified = 1
      `;

      const params = [];
      const conditions = [];

      // Filtro por provincia
      if (filters.provinciaId) {
        conditions.push('u.provincia_id = ?');
        params.push(filters.provinciaId);
      }

      // Filtro por cantón
      if (filters.cantonId) {
        conditions.push('u.canton_id = ?');
        params.push(filters.cantonId);
      }

      // Filtro por barrio
      if (filters.barrioId) {
        conditions.push('u.barrio_id = ?');
        params.push(filters.barrioId);
      }

      // Filtro por rango de barrios
      if (filters.barrioIds && filters.barrioIds.length > 0) {
        conditions.push(`u.barrio_id IN (${filters.barrioIds.map(() => '?').join(',')})`);
        params.push(...filters.barrioIds);
      }

      // Filtro por usuarios con tabla asignada
      if (filters.hasTable !== undefined) {
        if (filters.hasTable) {
          conditions.push('u.id_tabla IS NOT NULL');
        } else {
          conditions.push('u.id_tabla IS NULL');
        }
      }

      // Filtro por fecha de registro
      if (filters.registrationDateFrom) {
        conditions.push('u.created_at >= ?');
        params.push(filters.registrationDateFrom);
      }

      if (filters.registrationDateTo) {
        conditions.push('u.created_at <= ?');
        params.push(filters.registrationDateTo);
      }

      // Búsqueda por nombre, apellido o teléfono
      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        conditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ?)');
        params.push(searchTerm, searchTerm, searchTerm);
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      // Obtener total de registros para paginación
      const countQuery = `SELECT COUNT(*) as total FROM (${query}) as filtered_users`;
      const [countResult] = await db.query(countQuery, params);
      const total = countResult[0].total;

      // Agregar ordenamiento y paginación
      const offset = (pagination.page - 1) * pagination.limit;
      query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
      params.push(pagination.limit, offset);

      const [users] = await db.query(query, params);

      return {
        users,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(total / pagination.limit)
        }
      };

    } catch (error) {
      console.error('❌ Error obteniendo usuarios filtrados:', error);
      throw error;
    }
  }

  /**
   * Iniciar el procesamiento de una campaña
   * @param {number} campaignId - ID de la campaña
   */
  async startCampaign(campaignId) {
    try {
      console.log(`🚀 Iniciando campaña: ${campaignId}`);

      // Obtener datos de la campaña
      const [campaigns] = await db.query(`
        SELECT * FROM bulk_messaging_campaigns WHERE id = ?
      `, [campaignId]);

      if (campaigns.length === 0) {
        throw new Error('Campaña no encontrada');
      }

      const campaign = campaigns[0];

      // Verificar que WhatsApp esté listo
      const whatsappStatus = await WhatsAppOTPService.getStatus();
      if (!whatsappStatus.effectiveReady) {
        throw new Error('Servicio WhatsApp no está disponible');
      }

      // Actualizar estado de la campaña
      await db.query(`
        UPDATE bulk_messaging_campaigns
        SET status = 'running', started_at = NOW()
        WHERE id = ?
      `, [campaignId]);

      // Obtener usuarios pendientes
      const [pendingUsers] = await db.query(`
        SELECT * FROM bulk_messaging_logs
        WHERE campaign_id = ? AND status = 'pending'
        ORDER BY id ASC
      `, [campaignId]);

      // Configurar el procesamiento por lotes
      const intervalMs = campaign.interval_minutes * 60 * 1000; // Convertir minutos a ms
      
      // Calcular cuántos mensajes procesar por intervalo
      const messagesPerInterval = Math.ceil(campaign.max_messages_per_hour * (campaign.interval_minutes / 60));
      const batchSize = Math.min(messagesPerInterval, pendingUsers.length);

      console.log(`⚙️ Configuración de campaña ${campaignId}:`);
      console.log(`   - Intervalo: ${campaign.interval_minutes} minutos (${intervalMs/1000} segundos)`);
      console.log(`   - Máximo mensajes por hora: ${campaign.max_messages_per_hour}`);
      console.log(`   - Mensajes por intervalo: ${messagesPerInterval}`);
      console.log(`   - Tamaño de lote: ${batchSize} mensajes`);

      this.activeCampaigns.set(campaignId, {
        ...campaign,
        status: 'running',
        pendingUsers: pendingUsers,
        processedCount: 0,
        successCount: 0,
        errorCount: 0
      });

      // Procesar primer lote inmediatamente
      await this.processBatch(campaignId, batchSize);

      // Configurar intervalo para lotes siguientes
      const intervalId = setInterval(async () => {
        try {
          const campaignData = this.activeCampaigns.get(campaignId);
          if (!campaignData || campaignData.status !== 'running') {
            clearInterval(intervalId);
            return;
          }

          // Verificar si quedan usuarios pendientes
          const remainingUsers = campaignData.pendingUsers.filter(u => u.status === 'pending');
          if (remainingUsers.length === 0) {
            await this.finishCampaign(campaignId);
            clearInterval(intervalId);
            return;
          }

          // Procesar siguiente lote
          const nextMessagesPerInterval = Math.ceil(campaignData.max_messages_per_hour * (campaignData.interval_minutes / 60));
          const nextBatchSize = Math.min(nextMessagesPerInterval, remainingUsers.length);
          await this.processBatch(campaignId, nextBatchSize);

        } catch (error) {
          console.error(`❌ Error en intervalo de campaña ${campaignId}:`, error);
        }
      }, intervalMs);

      this.processingIntervals.set(campaignId, intervalId);

      console.log(`✅ Campaña ${campaignId} iniciada - ${pendingUsers.length} mensajes programados`);

    } catch (error) {
      console.error(`❌ Error iniciando campaña ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Procesar un lote de mensajes
   * @param {number} campaignId - ID de la campaña
   * @param {number} batchSize - Tamaño del lote
   */
  async processBatch(campaignId, batchSize) {
    const campaignData = this.activeCampaigns.get(campaignId);
    if (!campaignData) return;

    const pendingUsers = campaignData.pendingUsers.filter(u => u.status === 'pending');
    const batch = pendingUsers.slice(0, batchSize);

    console.log(`📤 Procesando lote de ${batch.length} mensajes para campaña ${campaignId}`);

    for (const user of batch) {
      try {
        // Obtener información completa del usuario con datos de la tabla
        const [fullUserData] = await db.query(`
          SELECT
            u.id,
            u.first_name,
            u.last_name,
            u.phone,
            u.id_tabla,
            p.nombre as provincia,
            c.nombre as canton,
            b.BARRIO as barrio,
            bt.table_code,
            bt.entregado as tabla_entregado,
            bt.ocr_validated
          FROM users u
          LEFT JOIN provincias p ON u.provincia_id = p.id
          LEFT JOIN cantones c ON u.canton_id = c.id
          LEFT JOIN barrios b ON u.barrio_id = b.id
          LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
          WHERE u.id = ?
        `, [user.user_id]);

        const userData = fullUserData[0] || user; // Fallback al user básico si no se encuentra

        // Personalizar mensaje con datos completos del usuario
        const personalizedMessage = this.personalizeMessage(campaignData.message, userData);

        // Preparar datos de imagen si existe
        let imageData = null;
        if (campaignData.image_url) {
          let imageUrl = campaignData.image_url;
          
          // Convertir URLs relativas a URLs completas para campañas existentes
          if (imageUrl.startsWith('/uploads/')) {
            const baseUrl = process.env.BASE_URL || 'https://restdeluxe.bingoamigo.net';
            imageUrl = `${baseUrl}${imageUrl}`;
            console.log('🔄 Convertida URL relativa a completa:', imageUrl);
          }
          
          imageData = {
            url: imageUrl,
            fileName: campaignData.image_file_name
          };
          
          console.log('📎 Enviando imagen con mensaje:', imageData.url);
        }

        // Enviar mensaje con imagen opcional
        await WhatsAppOTPService.sendCustomMessage(user.phone, personalizedMessage, imageData);

        // Actualizar estado en BD
        await db.query(`
          UPDATE bulk_messaging_logs
          SET status = 'sent', sent_at = NOW()
          WHERE id = ?
        `, [user.id]);

        user.status = 'sent';
        campaignData.successCount++;
        campaignData.processedCount++;

        console.log(`✅ Mensaje enviado a ${user.first_name} ${user.last_name} (${user.phone})`);

        // Pausa más conservadora entre mensajes para evitar spam (5-10 segundos)
        const pauseMs = Math.random() * 5000 + 5000; // Entre 5 y 10 segundos
        await new Promise(resolve => setTimeout(resolve, pauseMs));

      } catch (error) {
        console.error(`❌ Error enviando mensaje a ${user.phone}:`, error);

        // Actualizar estado de error
        await db.query(`
          UPDATE bulk_messaging_logs
          SET status = 'error', error_message = ?, sent_at = NOW()
          WHERE id = ?
        `, [error.message, user.id]);

        user.status = 'error';
        campaignData.errorCount++;
        campaignData.processedCount++;
      }
    }

    // Emitir progreso
    this.emit('campaignProgress', {
      campaignId,
      processed: campaignData.processedCount,
      total: campaignData.totalUsers,
      success: campaignData.successCount,
      errors: campaignData.errorCount
    });

    // Verificar si ya no quedan mensajes pendientes y finalizar campaña
    const remainingUsers = campaignData.pendingUsers.filter(u => u.status === 'pending');
    if (remainingUsers.length === 0) {
      console.log(`🏁 Todos los mensajes procesados para campaña ${campaignId}, finalizando...`);
      await this.finishCampaign(campaignId);
    }
  }

  /**
   * Personalizar mensaje con datos del usuario
   * @param {string} message - Mensaje base
   * @param {Object} user - Datos del usuario
   * @returns {string} - Mensaje personalizado
   */
  personalizeMessage(message, user) {
    return message
      .replace(/\{firstName\}/g, user.first_name || '')
      .replace(/\{lastName\}/g, user.last_name || '')
      .replace(/\{fullName\}/g, `${user.first_name || ''} ${user.last_name || ''}`.trim())
      .replace(/\{phone\}/g, user.phone || '')
      .replace(/\{barrio\}/g, user.barrio || '')
      .replace(/\{canton\}/g, user.canton || '')
      .replace(/\{provincia\}/g, user.provincia || '')
      .replace(/\{tableCode\}/g, user.table_code || 'Sin tabla')
      .replace(/\{tablaEntregado\}/g, user.tabla_entregado ? 'Entregada' : 'No entregada')
      .replace(/\{ocrValidated\}/g, user.ocr_validated ? 'Validada' : 'Sin validar');
  }

  /**
   * Finalizar una campaña
   * @param {number} campaignId - ID de la campaña
   */
  async finishCampaign(campaignId) {
    try {
      const campaignData = this.activeCampaigns.get(campaignId);
      if (!campaignData) return;

      // Limpiar intervalo
      const intervalId = this.processingIntervals.get(campaignId);
      if (intervalId) {
        clearInterval(intervalId);
        this.processingIntervals.delete(campaignId);
      }

      // Actualizar estado en BD
      await db.query(`
        UPDATE bulk_messaging_campaigns
        SET status = 'completed', completed_at = NOW()
        WHERE id = ?
      `, [campaignId]);

      campaignData.status = 'completed';

      console.log(`✅ Campaña ${campaignId} completada`);
      this.emit('campaignCompleted', { campaignId, ...campaignData });

      // Limpiar de memoria
      this.activeCampaigns.delete(campaignId);

    } catch (error) {
      console.error(`❌ Error finalizando campaña ${campaignId}:`, error);
    }
  }

  /**
   * Cancelar una campaña
   * @param {number} campaignId - ID de la campaña
   */
  async cancelCampaign(campaignId) {
    try {
      const campaignData = this.activeCampaigns.get(campaignId);
      if (!campaignData) {
        throw new Error('Campaña no encontrada o no está activa');
      }

      // Limpiar intervalo
      const intervalId = this.processingIntervals.get(campaignId);
      if (intervalId) {
        clearInterval(intervalId);
        this.processingIntervals.delete(campaignId);
      }

      // Actualizar estado en BD
      await db.query(`
        UPDATE bulk_messaging_campaigns
        SET status = 'cancelled', completed_at = NOW()
        WHERE id = ?
      `, [campaignId]);

      // Marcar mensajes pendientes como cancelados
      await db.query(`
        UPDATE bulk_messaging_logs
        SET status = 'cancelled'
        WHERE campaign_id = ? AND status = 'pending'
      `, [campaignId]);

      campaignData.status = 'cancelled';

      console.log(`🛑 Campaña ${campaignId} cancelada`);
      this.emit('campaignCancelled', { campaignId, ...campaignData });

      // Limpiar de memoria
      this.activeCampaigns.delete(campaignId);

    } catch (error) {
      console.error(`❌ Error cancelando campaña ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Pausar una campaña activa
   * @param {number} campaignId - ID de la campaña
   */
  async pauseCampaign(campaignId) {
    try {
      const campaignData = this.activeCampaigns.get(campaignId);
      if (!campaignData) {
        throw new Error('Campaña no encontrada o no está activa');
      }

      if (campaignData.status !== 'running') {
        throw new Error('La campaña no está en estado de ejecución');
      }

      // Limpiar intervalo sin eliminar la campaña de memoria
      const intervalId = this.processingIntervals.get(campaignId);
      if (intervalId) {
        clearInterval(intervalId);
        this.processingIntervals.delete(campaignId);
      }

      // Actualizar estado en BD
      await db.query(`
        UPDATE bulk_messaging_campaigns
        SET status = 'paused'
        WHERE id = ?
      `, [campaignId]);

      campaignData.status = 'paused';

      console.log(`⏸️ Campaña ${campaignId} pausada`);
      this.emit('campaignPaused', { campaignId, ...campaignData });

      return { success: true, message: 'Campaña pausada exitosamente' };

    } catch (error) {
      console.error(`❌ Error pausando campaña ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Reanudar una campaña pausada
   * @param {number} campaignId - ID de la campaña
   */
  async resumeCampaign(campaignId) {
    try {
      const campaignData = this.activeCampaigns.get(campaignId);
      if (!campaignData) {
        // Si no está en memoria, intentar cargar desde BD
        const [campaigns] = await db.query(`
          SELECT * FROM bulk_messaging_campaigns WHERE id = ? AND status = 'paused'
        `, [campaignId]);

        if (campaigns.length === 0) {
          throw new Error('Campaña no encontrada o no está pausada');
        }

        const campaign = campaigns[0];

        // Obtener usuarios pendientes
        const [pendingUsers] = await db.query(`
          SELECT * FROM bulk_messaging_logs
          WHERE campaign_id = ? AND status = 'pending'
          ORDER BY id ASC
        `, [campaignId]);

        // Restaurar campaña en memoria
        this.activeCampaigns.set(campaignId, {
          ...campaign,
          status: 'paused',
          pendingUsers: pendingUsers,
          processedCount: 0, // Se recalculará
          successCount: 0, // Se recalculará
          errorCount: 0 // Se recalculará
        });
      }

      const updatedCampaignData = this.activeCampaigns.get(campaignId);

      if (updatedCampaignData.status !== 'paused') {
        throw new Error('La campaña no está pausada');
      }

      // Verificar que WhatsApp esté listo
      const whatsappStatus = await WhatsAppOTPService.getStatus();
      if (!whatsappStatus.effectiveReady) {
        throw new Error('Servicio WhatsApp no está disponible');
      }

      // Actualizar estado en BD
      await db.query(`
        UPDATE bulk_messaging_campaigns
        SET status = 'running'
        WHERE id = ?
      `, [campaignId]);

      updatedCampaignData.status = 'running';

      // Obtener usuarios aún pendientes
      const remainingUsers = updatedCampaignData.pendingUsers.filter(u => u.status === 'pending');
      if (remainingUsers.length === 0) {
        await this.finishCampaign(campaignId);
        return { success: true, message: 'Campaña completada - no quedan mensajes pendientes' };
      }

      // Configurar procesamiento
      const intervalMs = updatedCampaignData.interval_minutes * 60 * 1000;
      const messagesPerInterval = Math.ceil(updatedCampaignData.max_messages_per_hour * (updatedCampaignData.interval_minutes / 60));
      const batchSize = Math.min(messagesPerInterval, remainingUsers.length);

      console.log(`⚙️ Reanudando campaña ${campaignId} con configuración:`);
      console.log(`   - Intervalo: ${updatedCampaignData.interval_minutes} minutos`);
      console.log(`   - Máximo mensajes por hora: ${updatedCampaignData.max_messages_per_hour}`);
      console.log(`   - Mensajes por intervalo: ${messagesPerInterval}`);
      console.log(`   - Tamaño de lote: ${batchSize}`);

      // Procesar primer lote inmediatamente
      await this.processBatch(campaignId, batchSize);

      // Configurar intervalo para lotes siguientes
      const intervalId = setInterval(async () => {
        try {
          const currentCampaignData = this.activeCampaigns.get(campaignId);
          if (!currentCampaignData || currentCampaignData.status !== 'running') {
            clearInterval(intervalId);
            return;
          }

          // Verificar si quedan usuarios pendientes
          const stillPendingUsers = currentCampaignData.pendingUsers.filter(u => u.status === 'pending');
          if (stillPendingUsers.length === 0) {
            await this.finishCampaign(campaignId);
            clearInterval(intervalId);
            return;
          }

          // Procesar siguiente lote
          const resumeMessagesPerInterval = Math.ceil(currentCampaignData.max_messages_per_hour * (currentCampaignData.interval_minutes / 60));
          const resumeBatchSize = Math.min(resumeMessagesPerInterval, stillPendingUsers.length);
          await this.processBatch(campaignId, resumeBatchSize);

        } catch (error) {
          console.error(`❌ Error en intervalo reanudado de campaña ${campaignId}:`, error);
        }
      }, intervalMs);

      this.processingIntervals.set(campaignId, intervalId);

      console.log(`▶️ Campaña ${campaignId} reanudada - ${remainingUsers.length} mensajes restantes`);
      this.emit('campaignResumed', { campaignId, ...updatedCampaignData });

      return { success: true, message: `Campaña reanudada exitosamente - ${remainingUsers.length} mensajes pendientes` };

    } catch (error) {
      console.error(`❌ Error reanudando campaña ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar una campaña permanentemente
   * @param {number} campaignId - ID de la campaña
   */
  async deleteCampaign(campaignId) {
    try {
      const campaignData = this.activeCampaigns.get(campaignId);
      
      // Si la campaña está activa, primero cancelarla
      if (campaignData && campaignData.status === 'running') {
        await this.cancelCampaign(campaignId);
      }

      // Verificar que la campaña existe
      const [campaigns] = await db.query(`
        SELECT id, status FROM bulk_messaging_campaigns WHERE id = ?
      `, [campaignId]);

      if (campaigns.length === 0) {
        throw new Error('Campaña no encontrada');
      }

      const campaign = campaigns[0];

      // No permitir eliminar campañas en ejecución (seguridad adicional)
      if (campaign.status === 'running') {
        throw new Error('No se puede eliminar una campaña en ejecución. Cancélala primero.');
      }

      // Eliminar logs de la campaña primero (foreign key constraint)
      await db.query(`
        DELETE FROM bulk_messaging_logs WHERE campaign_id = ?
      `, [campaignId]);

      // Eliminar la campaña
      await db.query(`
        DELETE FROM bulk_messaging_campaigns WHERE id = ?
      `, [campaignId]);

      // Limpiar de memoria si existe
      this.activeCampaigns.delete(campaignId);
      
      // Limpiar interval si existe
      const intervalId = this.processingIntervals.get(campaignId);
      if (intervalId) {
        clearInterval(intervalId);
        this.processingIntervals.delete(campaignId);
      }

      console.log(`🗑️ Campaña ${campaignId} eliminada permanentemente`);
      this.emit('campaignDeleted', { campaignId });

      return { success: true, message: 'Campaña eliminada exitosamente' };

    } catch (error) {
      console.error(`❌ Error eliminando campaña ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener estado de una campaña
   * @param {number} campaignId - ID de la campaña
   * @returns {Object} - Estado de la campaña
   */
  async getCampaignStatus(campaignId) {
    try {
      const [campaigns] = await db.query(`
        SELECT * FROM bulk_messaging_campaigns WHERE id = ?
      `, [campaignId]);

      if (campaigns.length === 0) {
        throw new Error('Campaña no encontrada');
      }

      const campaign = campaigns[0];

      // Obtener estadísticas
      const [stats] = await db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM bulk_messaging_logs
        WHERE campaign_id = ?
      `, [campaignId]);

      return {
        ...campaign,
        filters: typeof campaign.filters === 'string' ? JSON.parse(campaign.filters) : campaign.filters,
        stats: stats[0]
      };

    } catch (error) {
      console.error(`❌ Error obteniendo estado de campaña ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Obtener lista de campañas
   * @param {Object} filters - Filtros opcionales
   * @returns {Array} - Lista de campañas
   */
  async getCampaigns(filters = {}) {
    try {
      let query = `
        SELECT
          c.id, c.name, c.total_users, c.status, c.created_at, c.started_at, c.completed_at,
          c.created_by, c.message, c.interval_minutes, c.max_messages_per_hour,
          COUNT(l.id) as total_messages,
          SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) as sent_messages,
          SUM(CASE WHEN l.status = 'error' THEN 1 ELSE 0 END) as error_messages,
          SUM(CASE WHEN l.status = 'pending' THEN 1 ELSE 0 END) as pending_messages,
          SUM(CASE WHEN l.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_messages
        FROM bulk_messaging_campaigns c
        LEFT JOIN bulk_messaging_logs l ON c.id = l.campaign_id
        WHERE 1=1
      `;

      const params = [];
      const conditions = [];

      if (filters.status) {
        conditions.push('c.status = ?');
        params.push(filters.status);
      }

      if (filters.createdBy) {
        conditions.push('c.created_by = ?');
        params.push(filters.createdBy);
      }

      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }

      query += ' GROUP BY c.id ORDER BY c.created_at DESC';

      const [campaigns] = await db.query(query, params);

      // Para cada campaña, obtener los números que fallaron
      for (let campaign of campaigns) {
        if (campaign.error_messages > 0) {
          const [errorLogs] = await db.query(`
            SELECT
              l.phone,
              l.first_name,
              l.last_name,
              l.error_message,
              l.sent_at,
              u.id_tabla,
              b.BARRIO as barrio,
              c.nombre as canton,
              p.nombre as provincia,
              bt.table_code
            FROM bulk_messaging_logs l
            LEFT JOIN users u ON l.user_id = u.id
            LEFT JOIN barrios b ON u.barrio_id = b.id
            LEFT JOIN cantones c ON u.canton_id = c.id
            LEFT JOIN provincias p ON u.provincia_id = p.id
            LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
            WHERE l.campaign_id = ? AND l.status = 'error'
            ORDER BY l.sent_at DESC
          `, [campaign.id]);

          campaign.failed_numbers = errorLogs.map(log => ({
            phone: log.phone,
            name: `${log.first_name || ''} ${log.last_name || ''}`.trim(),
            error_message: log.error_message,
            barrio: log.barrio,
            canton: log.canton,
            provincia: log.provincia,
            table_code: log.table_code,
            sent_at: log.sent_at
          }));
        } else {
          campaign.failed_numbers = [];
        }
      }

      return campaigns;

    } catch (error) {
      console.error('❌ Error obteniendo campañas:', error);
      throw error;
    }
  }

  /**
   * Obtener logs detallados de una campaña
   * @param {number} campaignId - ID de la campaña
   * @param {Object} pagination - Paginación
   * @returns {Object} - Logs con paginación
   */
  async getCampaignLogs(campaignId, pagination = { page: 1, limit: 50 }) {
    try {
      const offset = (pagination.page - 1) * pagination.limit;

      const [logs] = await db.query(`
        SELECT
          l.*,
          u.first_name,
          u.last_name,
          u.phone,
          u.id_tabla,
          b.BARRIO as barrio,
          c.nombre as canton,
          p.nombre as provincia,
          bt.table_code,
          bt.entregado as tabla_entregado,
          bt.ocr_validated
        FROM bulk_messaging_logs l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN barrios b ON u.barrio_id = b.id
        LEFT JOIN cantones c ON u.canton_id = c.id
        LEFT JOIN provincias p ON u.provincia_id = p.id
        LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
        WHERE l.campaign_id = ?
        ORDER BY l.id ASC
        LIMIT ? OFFSET ?
      `, [campaignId, pagination.limit, offset]);

      const [total] = await db.query(`
        SELECT COUNT(*) as total FROM bulk_messaging_logs WHERE campaign_id = ?
      `, [campaignId]);

      return {
        logs,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: total[0].total,
          pages: Math.ceil(total[0].total / pagination.limit)
        }
      };

    } catch (error) {
      console.error(`❌ Error obteniendo logs de campaña ${campaignId}:`, error);
      throw error;
    }
  }
}

module.exports = new BulkMessagingService();