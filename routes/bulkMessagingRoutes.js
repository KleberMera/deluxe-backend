// routes/bulkMessagingRoutes.js
const express = require('express');
const router = express.Router();
const bulkMessagingService = require('../services/bulkMessagingService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuración de multer para subir imágenes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/bulk-images/');
    
    // Crear la carpeta si no existe
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `bulk_campaign_${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Permitir solo imágenes
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  },
  fileFilter: fileFilter
});

// Middleware de autenticación básica para rutas administrativas
const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Simple verificación - puedes mejorar esto
  if (authHeader === 'Bearer admin-token-123') {
    next();
  } else {
    res.status(401).json({ error: 'No autorizado' });
  }
};

// ============ RUTAS DE FILTROS ============

// Obtener todas las provincias disponibles
router.get('/filters/provinces', async (req, res) => {
  try {
    const db = require('../config/db');
    const [provinces] = await db.query('SELECT id, nombre FROM provincias ORDER BY nombre');

    res.json({
      success: true,
      data: provinces
    });
  } catch (error) {
    console.error('Error obteniendo provincias:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener cantones por provincia
router.get('/filters/provinces/:provinceId/cantones', async (req, res) => {
  try {
    const { provinceId } = req.params;
    const db = require('../config/db');

    const [cantones] = await db.query(
      'SELECT id, nombre FROM cantones WHERE provincia_id = ? ORDER BY nombre',
      [provinceId]
    );

    res.json({
      success: true,
      data: cantones
    });
  } catch (error) {
    console.error('Error obteniendo cantones:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener barrios por cantón
router.get('/filters/cantones/:cantonId/barrios', async (req, res) => {
  try {
    const { cantonId } = req.params;
    const db = require('../config/db');

    const [barrios] = await db.query(
      'SELECT ID as id, BARRIO as nombre FROM barrios WHERE canton_id = ? ORDER BY BARRIO',
      [cantonId]
    );

    res.json({
      success: true,
      data: barrios
    });
  } catch (error) {
    console.error('Error obteniendo barrios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============ RUTAS DE USUARIOS ============

// Previsualizar usuarios que coinciden con los filtros
router.post('/users/preview', async (req, res) => {
  try {
    const { filters, userIds, limit = 50, page = 1, searchTerm = '' } = req.body;

    if (!filters && !userIds) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren filtros o userIds'
      });
    }

    let result;

    // Si se proporcionan userIds específicos, usarlos en lugar de filtros
    if (userIds && userIds.length > 0) {
      const users = await bulkMessagingService.getUsersByIds(userIds, {
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        searchTerm
      });

      // Obtener total para paginación
      const totalQuery = userIds.length > 0 ? `SELECT COUNT(*) as total FROM users WHERE id IN (${userIds.map(() => '?').join(',')}) AND phone_verified = 1` : 'SELECT COUNT(*) as total FROM users WHERE phone_verified = 1';
      const db = require('../config/db');
      const [totalResult] = await db.query(totalQuery, userIds.length > 0 ? userIds : []);
      const total = totalResult[0].total;

      result = {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } else {
      result = await bulkMessagingService.getFilteredUsers(filters, {
        page: parseInt(page),
        limit: parseInt(limit)
      }, searchTerm);
    }

    // Calcular estadísticas del conjunto completo (para el resumen)
    let summaryStats = { totalCount: 0, withTable: 0, withoutTable: 0, byProvince: {} };

    if (filters || (userIds && userIds.length > 0)) {
      let allUsers;
      if (userIds && userIds.length > 0) {
        allUsers = await bulkMessagingService.getUsersByIds(userIds);
      } else {
        const allResult = await bulkMessagingService.getFilteredUsers(filters, { page: 1, limit: 10000 }, ''); // Obtener todos para estadísticas
        allUsers = allResult.users;
      }

      summaryStats = {
        totalCount: allUsers.length,
        withTable: allUsers.filter(u => u.id_tabla).length,
        withoutTable: allUsers.filter(u => !u.id_tabla).length,
        byProvince: allUsers.reduce((acc, user) => {
          const province = user.provincia || 'Sin provincia';
          acc[province] = (acc[province] || 0) + 1;
          return acc;
        }, {})
      };
    }

    res.json({
      success: true,
      data: {
        users: result.users,
        pagination: result.pagination,
        summary: summaryStats
      }
    });
  } catch (error) {
    console.error('Error previsualizando usuarios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============ RUTAS DE CAMPAÑAS ============

// Crear una nueva campaña
router.post('/campaigns', adminAuth, upload.single('campaignImage'), async (req, res) => {
  try {
    const campaignData = req.body;
    const uploadedFile = req.file;

    if (!campaignData.name || !campaignData.message || !campaignData.filters) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren name, message y filters'
      });
    }

    // Procesar imagen si fue subida
    let imageUrl = null;
    let imageFileName = null;

    if (uploadedFile) {
      // Crear URL pública completa para la imagen
      const baseUrl = process.env.BASE_URL || 'https://restdeluxe.bingoamigo.net';
      imageUrl = `${baseUrl}/uploads/bulk-images/${uploadedFile.filename}`;
      imageFileName = uploadedFile.originalname;
      
      console.log('📁 Imagen subida para campaña:', uploadedFile.filename);
      console.log('🔗 URL de imagen:', imageUrl);
    }

    // Agregar datos de imagen a campaignData
    campaignData.imageUrl = imageUrl;
    campaignData.imageFileName = imageFileName;

    const campaign = await bulkMessagingService.createCampaign(campaignData);

    res.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error creando campaña:', error);
    
    // Limpiar archivo subido si hay error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error limpiando archivo:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener lista de campañas
router.get('/campaigns', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filters = {};
    if (status) filters.status = status;

    const campaigns = await bulkMessagingService.getCampaigns(filters);

    // Paginación simple
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCampaigns = campaigns.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        campaigns: paginatedCampaigns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: campaigns.length,
          pages: Math.ceil(campaigns.length / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo campañas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener detalles completos de una campaña específica (incluyendo todos los logs)
router.get('/campaigns/:campaignId/details', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { page = 1, limit = 100, status } = req.query;

    // Obtener información básica de la campaña
    const campaign = await bulkMessagingService.getCampaignStatus(parseInt(campaignId));

    // Obtener todos los logs de la campaña con paginación
    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const logsResult = await bulkMessagingService.getCampaignLogs(parseInt(campaignId), pagination);

    // Filtrar por status si se especifica
    let filteredLogs = logsResult.logs;
    if (status) {
      filteredLogs = logsResult.logs.filter(log => log.status === status);
    }

    // Crear estadísticas detalladas
    const stats = {
      total: logsResult.pagination.total,
      sent: filteredLogs.filter(log => log.status === 'sent').length,
      error: filteredLogs.filter(log => log.status === 'error').length,
      pending: filteredLogs.filter(log => log.status === 'pending').length,
      cancelled: filteredLogs.filter(log => log.status === 'cancelled').length
    };

    // Obtener lista detallada de números fallidos
    const failedNumbers = filteredLogs
      .filter(log => log.status === 'error')
      .map(log => ({
        id: log.id,
        user_id: log.user_id,
        phone: log.phone,
        name: `${log.first_name || ''} ${log.last_name || ''}`.trim(),
        error_message: log.error_message,
        sent_at: log.sent_at,
        barrio: log.barrio,
        canton: log.canton,
        provincia: log.provincia,
        table_code: log.table_code,
        tabla_entregado: log.tabla_entregado,
        ocr_validated: log.ocr_validated
      }));

    res.json({
      success: true,
      data: {
        campaign: {
          ...campaign,
          filters: campaign.filters
        },
        logs: filteredLogs,
        stats,
        failed_numbers: failedNumbers,
        pagination: {
          ...logsResult.pagination,
          filteredTotal: filteredLogs.length
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo detalles de campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener detalles de una campaña específica
router.get('/campaigns/:campaignId', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await bulkMessagingService.getCampaignStatus(campaignId);

    res.json({
      success: true,
      data: campaign
    });
  } catch (error) {
    console.error('Error obteniendo campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Iniciar una campaña
router.post('/campaigns/:campaignId/start', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    await bulkMessagingService.startCampaign(parseInt(campaignId));

    res.json({
      success: true,
      message: 'Campaña iniciada exitosamente'
    });
  } catch (error) {
    console.error('Error iniciando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cancelar una campaña
router.post('/campaigns/:campaignId/cancel', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    await bulkMessagingService.cancelCampaign(parseInt(campaignId));

    res.json({
      success: true,
      message: 'Campaña cancelada exitosamente'
    });
  } catch (error) {
    console.error('Error cancelando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pausar una campaña
router.post('/campaigns/:campaignId/pause', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await bulkMessagingService.pauseCampaign(parseInt(campaignId));

    res.json({
      success: true,
      message: result.message || 'Campaña pausada exitosamente'
    });
  } catch (error) {
    console.error('Error pausando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reanudar una campaña
router.post('/campaigns/:campaignId/resume', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await bulkMessagingService.resumeCampaign(parseInt(campaignId));

    res.json({
      success: true,
      message: result.message || 'Campaña reanudada exitosamente'
    });
  } catch (error) {
    console.error('Error reanudando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Eliminar una campaña permanentemente
router.delete('/campaigns/:campaignId', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;

    const result = await bulkMessagingService.deleteCampaign(parseInt(campaignId));

    res.json({
      success: true,
      message: result.message || 'Campaña eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener logs detallados de una campaña
router.get('/campaigns/:campaignId/logs', adminAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { page = 1, limit = 50, status } = req.query;

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await bulkMessagingService.getCampaignLogs(parseInt(campaignId), pagination);

    // Filtrar por status si se especifica
    if (status) {
      result.logs = result.logs.filter(log => log.status === status);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error obteniendo logs de campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============ RUTAS DE ESTADÍSTICAS ============

// Obtener estadísticas generales
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const db = require('../config/db');

    // Estadísticas de campañas
    const [campaignStats] = await db.query(`
      SELECT
        COUNT(*) as total_campaigns,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_campaigns,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_campaigns,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_campaigns
      FROM bulk_messaging_campaigns
    `);

    // Estadísticas de mensajes
    const [messageStats] = await db.query(`
      SELECT
        COUNT(*) as total_messages,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_messages,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_messages,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_messages
      FROM bulk_messaging_logs
    `);

    // Estadísticas por barrio (top 10)
    const [barrioStats] = await db.query(`
      SELECT
        b.BARRIO as barrio,
        COUNT(l.id) as total_messages,
        SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) as sent_messages
      FROM bulk_messaging_logs l
      JOIN users u ON l.user_id = u.id
      JOIN barrios b ON u.barrio_id = b.ID
      GROUP BY b.ID, b.BARRIO
      ORDER BY total_messages DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        campaigns: campaignStats[0],
        messages: messageStats[0],
        topBarrios: barrioStats
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============ EVENTOS EN TIEMPO REAL ============

// EventSource para progreso de campañas
router.get('/events', adminAuth, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Función para enviar eventos
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Listeners para eventos del servicio
  const onCampaignProgress = (data) => {
    sendEvent('campaignProgress', data);
  };

  const onCampaignCompleted = (data) => {
    sendEvent('campaignCompleted', data);
  };

  const onCampaignCancelled = (data) => {
    sendEvent('campaignCancelled', data);
  };

  const onCampaignPaused = (data) => {
    sendEvent('campaignPaused', data);
  };

  const onCampaignResumed = (data) => {
    sendEvent('campaignResumed', data);
  };

  const onCampaignDeleted = (data) => {
    sendEvent('campaignDeleted', data);
  };

  // Registrar listeners
  bulkMessagingService.on('campaignProgress', onCampaignProgress);
  bulkMessagingService.on('campaignCompleted', onCampaignCompleted);
  bulkMessagingService.on('campaignCancelled', onCampaignCancelled);
  bulkMessagingService.on('campaignPaused', onCampaignPaused);
  bulkMessagingService.on('campaignResumed', onCampaignResumed);
  bulkMessagingService.on('campaignDeleted', onCampaignDeleted);

  // Enviar evento de conexión
  sendEvent('connected', { message: 'Conectado al stream de eventos' });

  // Cleanup cuando el cliente se desconecta
  req.on('close', () => {
    bulkMessagingService.removeListener('campaignProgress', onCampaignProgress);
    bulkMessagingService.removeListener('campaignCompleted', onCampaignCompleted);
    bulkMessagingService.removeListener('campaignCancelled', onCampaignCancelled);
    bulkMessagingService.removeListener('campaignPaused', onCampaignPaused);
    bulkMessagingService.removeListener('campaignResumed', onCampaignResumed);
    bulkMessagingService.removeListener('campaignDeleted', onCampaignDeleted);
  });
});

module.exports = router;