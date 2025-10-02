// routes/whatsappOTPRoutes.js
const express = require('express');
const router = express.Router();
const WhatsAppOTPService = require('../services/whatsappOTPService');

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

// ============ RUTAS PÚBLICAS ============

// Ruta para obtener el estado del servicio
router.get('/status', async (req, res) => {
  try {
    const status = await WhatsAppOTPService.getStatus();
    res.json({
      ...status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('❌ Error obteniendo estado de WhatsApp:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estado del servicio WhatsApp',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Ruta para obtener el QR (si es necesario)
router.get('/qr', (req, res) => {
  if (!WhatsAppOTPService.qr) {
    return res.status(404).json({ 
      error: 'QR no disponible',
      status: WhatsAppOTPService.status 
    });
  }
  
  // Extraer el base64 del Data URL
  const base64Data = WhatsAppOTPService.qr.replace(/^data:image\/png;base64,/, "");
  
  // Convertir a buffer
  const imgBuffer = Buffer.from(base64Data, 'base64');
  
  // Enviar como imagen
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': imgBuffer.length
  });
  res.end(imgBuffer);
});

// Ruta para obtener QR en formato JSON (útil para frontends)
router.get('/qr-data', (req, res) => {
  if (!WhatsAppOTPService.qr) {
    return res.status(404).json({ 
      error: 'QR no disponible',
      status: WhatsAppOTPService.status 
    });
  }
  
  res.json({
    qr: WhatsAppOTPService.qr,
    status: WhatsAppOTPService.status
  });
});

// Ruta principal para enviar OTP
router.post('/send-otp', async (req, res) => {
  const { phoneNumber, otpCode } = req.body;

  if (!phoneNumber || !otpCode) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren phoneNumber y otpCode'
    });
  }

  try {
    // Verificar estado antes de intentar enviar
    const whatsappStatus = await WhatsAppOTPService.getStatus();

    if (!whatsappStatus.effectiveReady) {
      return res.status(503).json({
        success: false,
        error: 'Servicio WhatsApp no disponible temporalmente',
        whatsappStatus: whatsappStatus,
        details: `Estado actual: ${whatsappStatus.status}, Estado cliente: ${whatsappStatus.clientState}`
      });
    }

    const result = await WhatsAppOTPService.sendOTP(phoneNumber, otpCode);
    res.json({
      success: true,
      message: 'OTP enviado correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error enviando OTP:', error);

    // Obtener estado actual para debugging
    let currentStatus = {};
    try {
      currentStatus = await WhatsAppOTPService.getStatus();
    } catch (statusError) {
      console.error('Error obteniendo estado para debugging:', statusError);
    }

    res.status(500).json({
      success: false,
      error: error.message,
      whatsappStatus: currentStatus,
      timestamp: new Date().toISOString()
    });
  }
});

// Ruta para buscar usuario por cédula o teléfono
router.post('/search-user', async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere identifier (cédula o teléfono)'
    });
  }

  try {
    const db = require('../config/db');
    
    // Buscar usuario por cédula o teléfono
    const [users] = await db.query(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.phone, 
        u.id_card, 
        u.phone_verified,
        bt.id as table_id,
        bt.table_code,
        bt.file_name,
        bt.file_url
      FROM users u
      LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
      WHERE u.id_card = ? OR u.phone = ?
      LIMIT 1
    `, [identifier, identifier]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        idCard: user.id_card,
        phoneVerified: user.phone_verified === 1,
        table: user.table_id ? {
          id: user.table_id,
          tableCode: user.table_code,
          fileName: user.file_name,
          fileUrl: user.file_url
        } : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error buscando usuario:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Ruta para reenviar tabla de BINGO
router.post('/resend-table', async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({
      success: false,
      error: 'Se requiere identifier (cédula o teléfono)'
    });
  }

  try {
    // Verificar estado antes de intentar enviar
    const whatsappStatus = await WhatsAppOTPService.getStatus();

    if (!whatsappStatus.effectiveReady) {
      return res.status(503).json({
        success: false,
        error: 'Servicio WhatsApp no disponible temporalmente',
        whatsappStatus: whatsappStatus,
        details: `Estado actual: ${whatsappStatus.status}, Estado cliente: ${whatsappStatus.clientState}`
      });
    }

    const db = require('../config/db');
    
    // Buscar usuario y su tabla
    const [users] = await db.query(`
      SELECT 
        u.id, 
        u.first_name, 
        u.last_name, 
        u.phone, 
        u.id_card, 
        bt.id as table_id,
        bt.table_code,
        bt.file_name,
        bt.file_url
      FROM users u
      LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
      WHERE u.id_card = ? OR u.phone = ?
      LIMIT 1
    `, [identifier, identifier]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const user = users[0];

    if (!user.table_id) {
      return res.status(404).json({
        success: false,
        error: 'El usuario no tiene una tabla de bingo asignada'
      });
    }

    // Preparar datos de la tabla para enviar
    const tableData = {
      id: user.table_id,
      table_code: user.table_code,
      file_name: user.file_name,
      file_url: user.file_url
    };

    // Enviar tabla usando el método existente
    const result = await WhatsAppOTPService.sendBingoTable(
      user.phone, 
      user.first_name, 
      user.last_name, 
      tableData
    );

    res.json({
      success: true,
      message: 'Tabla de BINGO reenviada correctamente',
      tableCode: result.tableCode,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        idCard: user.id_card
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error reenviando tabla:', error);

    // Obtener estado actual para debugging
    let currentStatus = {};
    try {
      currentStatus = await WhatsAppOTPService.getStatus();
    } catch (statusError) {
      console.error('Error obteniendo estado para debugging:', statusError);
    }

    res.status(500).json({
      success: false,
      error: error.message,
      whatsappStatus: currentStatus,
      timestamp: new Date().toISOString()
    });
  }
});

// ============ RUTAS ADMINISTRATIVAS ============

// Ruta para reiniciar el servicio
router.post('/admin/restart', adminAuth, async (req, res) => {
  try {
    console.log('🔄 Reinicio administrativo solicitado');
    await WhatsAppOTPService.restart();
    res.json({ 
      success: true, 
      message: 'Servicio reiniciado' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ruta para forzar re-autenticación
router.post('/admin/reauth', adminAuth, async (req, res) => {
  try {
    console.log('🔑 Re-autenticación forzada solicitada');
    await WhatsAppOTPService.forceReauth();
    res.json({ 
      success: true, 
      message: 'Re-autenticación iniciada' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ruta para reinicio completo del sistema
router.post('/admin/complete-reset', adminAuth, async (req, res) => {
  try {
    console.log('🔄 Reinicio del cliente solicitado (sesión preservada)');
    await WhatsAppOTPService.forceClientRestart();
    res.json({ 
      success: true, 
      message: 'Cliente reiniciado - sesión preservada' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ruta para limpieza completa de sesión (usar solo si es necesario)
router.post('/admin/clear-session', adminAuth, async (req, res) => {
  try {
    console.log('🗑️ Limpieza completa de sesión solicitada');
    await WhatsAppOTPService.forceSessionCleanup();
    res.json({ 
      success: true, 
      message: 'Sesión limpiada completamente - necesitarás reescanear QR' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Ruta para diagnóstico avanzado del cliente
router.get('/diagnose', adminAuth, async (req, res) => {
  try {
    const diagnosis = await WhatsAppOTPService.diagnoseClientHealth();
    res.json({
      success: true,
      diagnosis: diagnosis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    res.status(500).json({
      success: false,
      error: 'Error al realizar diagnóstico',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Ruta de health check para monitoreo externo
router.get('/health', (req, res) => {
  const status = WhatsAppOTPService.getStatus();
  
  if (status.isReady) {
    res.status(200).json({
      status: 'healthy',
      service: 'whatsapp-otp',
      ready: true
    });
  } else {
    res.status(503).json({
      status: 'unhealthy',
      service: 'whatsapp-otp',
      ready: false,
      currentStatus: status.status
    });
  }
});

// ============ EVENTOS EN TIEMPO REAL ============

// Ruta para Server-Sent Events (útil para monitoreo en tiempo real)
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Enviar estado inicial
  res.write(`data: ${JSON.stringify({
    type: 'status',
    ...WhatsAppOTPService.getStatus(),
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Listeners para eventos del servicio
  const onReady = () => {
    res.write(`data: ${JSON.stringify({
      type: 'ready',
      message: 'WhatsApp cliente listo',
      timestamp: new Date().toISOString()
    })}\n\n`);
  };

  const onDisconnected = (reason) => {
    res.write(`data: ${JSON.stringify({
      type: 'disconnected',
      reason: reason,
      timestamp: new Date().toISOString()
    })}\n\n`);
  };

  const onQR = (qr) => {
    res.write(`data: ${JSON.stringify({
      type: 'qr',
      message: 'Nuevo QR disponible',
      timestamp: new Date().toISOString()
    })}\n\n`);
  };

  const onAuthFailure = (msg) => {
    res.write(`data: ${JSON.stringify({
      type: 'auth_failure',
      message: msg,
      timestamp: new Date().toISOString()
    })}\n\n`);
  };

  // Registrar listeners
  WhatsAppOTPService.on('ready', onReady);
  WhatsAppOTPService.on('disconnected', onDisconnected);
  WhatsAppOTPService.on('qr', onQR);
  WhatsAppOTPService.on('auth_failure', onAuthFailure);

  // Cleanup cuando el cliente se desconecta
  req.on('close', () => {
    WhatsAppOTPService.removeListener('ready', onReady);
    WhatsAppOTPService.removeListener('disconnected', onDisconnected);
    WhatsAppOTPService.removeListener('qr', onQR);
    WhatsAppOTPService.removeListener('auth_failure', onAuthFailure);
  });
});

module.exports = router;