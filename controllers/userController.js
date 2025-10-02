const userModel = require('../models/userModel');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const { generateOTP } = require('../utils/otpGenerator');
const WhatsAppService = require('../services/whatsappOTPService');
const db = require('../config/db');
const BingoTableService = require('../services/bingoTableService');
const multer = require('multer');
const BingoTableServiceOCR = require('../services/ocrVerificationService');
const os = require('os');

// Configuración de multer para subir archivos a la carpeta manuales
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = '/var/www/pelicanotv_registro/tablas/manuales/';
    
    // Crear la carpeta si no existe
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // El nombre del archivo se generará después de tener el rango de tablas
    // Por ahora guardamos el archivo original
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `temp_${timestamp}${ext}`);
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

// Función auxiliar para validar URL (manteniendo compatibilidad)
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Middleware para manejar la subida de archivo
exports.uploadTablePhoto = upload.single('tablePhoto');

// PASO 1: Verificar si los datos ya existen antes de enviar OTP
exports.checkUserExists = async (req, res) => {
  try {
    const { phone, idCard } = req.body;
    
    if (!phone || !idCard) {
      return res.status(400).json({ 
        success: false,
        error: 'Teléfono y cédula son requeridos' 
      });
    }
    
    // Verificar si ya existen el teléfono o cédula
    const [existingUsers] = await db.query(
      'SELECT id FROM users WHERE phone = ? OR id_card = ?',
      [phone, idCard]
    );
    
    const exists = existingUsers.length > 0;
    
    res.json({
      success: true,
      exists: exists,
      message: exists ? 'Usuario ya registrado' : 'Datos disponibles'
    });
    
  } catch (error) {
    console.error('Error en verificación previa:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en verificación de datos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.consultarUsuario = async (req, res) => {
  try {
    const { idCard } = req.body;
    
    // Validación básica
    if (!idCard) {
      return res.status(400).json({ 
        success: false,
        error: 'La cédula es requerida'
      });
    }
    
    // Buscar usuario con su información de tabla si existe
    const [userResult] = await db.query(
      `SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.id_card,
        u.phone,
        u.id_tabla,
        bt.table_code,
        bt.file_name,
        bt.entregado,
        bt.registro_manual
      FROM users u
      LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
      WHERE u.id_card = ?
      LIMIT 1`,
      [idCard.trim()]
    );
    
    if (userResult.length === 0) {
      // Usuario no existe
      return res.status(200).json({
        success: true,
        exists: false,
        message: 'Usuario no encontrado. Puede proceder con el registro.'
      });
    }
    
    const user = userResult[0];
    
    // Usuario existe, verificar estado de la tabla
    if (!user.id_tabla) {
      // Usuario existe pero no tiene tabla asignada
      return res.status(200).json({
        success: true,
        exists: true,
        hasTable: false,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          idCard: user.id_card,
          phone: user.phone
        },
        message: 'Usuario existe pero no tiene tabla asignada.'
      });
    }
    
    // Usuario tiene tabla, verificar si está entregada y es registro manual
    const isDelivered = user.entregado === 1;
    const isManualRegistration = user.registro_manual === 1;
    
    return res.status(200).json({
      success: true,
      exists: true,
      hasTable: true,
      isDelivered: isDelivered,
      isManualRegistration: isManualRegistration,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        idCard: user.id_card,
        phone: user.phone
      },
      table: {
        id: user.id_tabla,
        tableCode: user.table_code,
        fileName: user.file_name,
        entregado: user.entregado,
        registroManual: user.registro_manual
      },
      message: isDelivered && isManualRegistration 
        ? 'Usuario ya tiene tabla entregada mediante registro manual.'
        : isDelivered 
          ? 'Usuario ya tiene tabla entregada.'
          : 'Usuario tiene tabla asignada pero no entregada.'
    });
    
  } catch (error) {
    console.error('Error en consultarUsuario:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Error al consultar usuario',
      details: process.env.NODE_ENV === 'development' ? {
        sql: error.sql,
        stack: error.stack
      } : undefined
    });
  }
};

// PASO 2: Enviar OTP al teléfono
exports.sendOTP = async (req, res) => {
  try {
    const { phone, idCard, tableStart, tableEnd } = req.body;
    
    // Validación básica
    if (!phone || !idCard) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono y cédula son requeridos'
      });
    }
    
    // Limpiar valores
    const cleanPhone = phone.toString().trim();
    const cleanIdCard = idCard.toString().trim();
    
    // Determinar automáticamente si se requiere tabla basado en si se envían los datos
    const shouldRequireTable = tableStart !== undefined || tableEnd !== undefined;
    
    let tableRange = null;
    
    // Validación condicional de datos de tabla
    if (shouldRequireTable) {
      if (!tableStart || !tableEnd) {
        return res.status(400).json({
          success: false,
          error: 'Datos de tabla (inicio y fin) son requeridos para este tipo de registro'
        });
      }
      
      // Validar rango de tabla solo si se requiere
      const start = parseInt(tableStart);
      const end = parseInt(tableEnd);
      
      if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
        return res.status(400).json({ 
          success: false,
          error: 'Los números de tabla no son válidos'
        });
      }
      
      if (start >= end) {
        return res.status(400).json({ 
          success: false,
          error: 'El número final debe ser mayor al inicial'
        });
      }
      
      tableRange = `${start}_${end}`;
      
      // Verificar si el rango de tabla ya existe (solo si se requiere)
      console.log('🔍 Verificando disponibilidad de rango de tabla:', tableRange);
      const [existingTables] = await db.query(
        'SELECT id FROM bingo_tables WHERE table_code = ? LIMIT 1',
        [tableRange]
      );
      
      if (existingTables.length > 0) {
        return res.status(400).json({ 
          success: false,
          error: `El rango de tablas ${tableRange} ya está registrado`
        });
      }
    } else {
      // Si no se requiere tabla pero se enviaron datos, validarlos opcionalmente
      if (tableStart && tableEnd) {
        const start = parseInt(tableStart);
        const end = parseInt(tableEnd);
        
        if (!isNaN(start) && !isNaN(end) && start > 0 && end > 0 && start < end) {
          tableRange = `${start}_${end}`;
          
          // Verificar disponibilidad si se proporciona
          const [existingTables] = await db.query(
            'SELECT id FROM bingo_tables WHERE table_code = ? LIMIT 1',
            [tableRange]
          );
          
          if (existingTables.length > 0) {
            return res.status(400).json({ 
              success: false,
              error: `El rango de tablas ${tableRange} ya está registrado`
            });
          }
        }
      }
    }
    
    // Validar formato de teléfono
    const phoneRegex = /^[\d\s\+\-\(\)]+$/;
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de teléfono inválido'
      });
    }
    
    // ============ VERIFICACIÓN DE REGISTROS EXISTENTES ============
    
    console.log('🔍 Verificando existencia de datos de usuario...');
    
    // Buscar registros existentes con este teléfono o cédula
    const [existingUsers] = await db.query(
      'SELECT id, phone, id_card, phone_verified, first_name, last_name, otp_expires_at FROM users WHERE phone = ? OR id_card = ?',
      [cleanPhone, cleanIdCard]
    );
    
    let existingPhoneUser = null;
    let existingIdCardUser = null;
    
    // Separar registros por teléfono y cédula
    for (const user of existingUsers) {
      if (user.phone === cleanPhone) {
        existingPhoneUser = user;
      }
      if (user.id_card === cleanIdCard) {
        existingIdCardUser = user;
      }
    }
    
    // Verificar si hay un registro completo con este teléfono
    if (existingPhoneUser && existingPhoneUser.phone_verified && existingPhoneUser.first_name && existingPhoneUser.last_name) {
      return res.status(400).json({
        success: false,
        error: 'El teléfono ya está registrado y verificado'
      });
    }
    
    // Verificar si hay un registro completo con esta cédula
    if (existingIdCardUser && existingIdCardUser.phone_verified && existingIdCardUser.first_name && existingIdCardUser.last_name) {
      return res.status(400).json({
        success: false,
        error: 'La cédula ya está registrada y verificada'
      });
    }
    
    // Verificar si hay conflicto entre teléfono y cédula (diferentes usuarios completos)
    if (existingPhoneUser && existingIdCardUser && 
        existingPhoneUser.id !== existingIdCardUser.id &&
        existingPhoneUser.phone_verified && existingIdCardUser.phone_verified) {
      return res.status(400).json({
        success: false,
        error: 'El teléfono y la cédula pertenecen a diferentes usuarios ya registrados'
      });
    }
    
    // ============ LIMPIEZA DE REGISTROS INCOMPLETOS ============
    
    // Limpiar registros incompletos expirados
    const now = new Date();
    
    // Buscar registros incompletos con OTP expirado
    const [expiredIncompleteRecords] = await db.query(
      `SELECT id, phone, id_card FROM users 
       WHERE (phone = ? OR id_card = ?) 
       AND phone_verified = 0 
       AND (first_name IS NULL OR last_name IS NULL)
       AND otp_expires_at < ?`,
      [cleanPhone, cleanIdCard, now]
    );
    
    // Eliminar registros incompletos expirados
    for (const record of expiredIncompleteRecords) {
      try {
        await db.query('DELETE FROM users WHERE id = ?', [record.id]);
        console.log(`🗑️ Registro incompleto expirado eliminado: ID ${record.id}, teléfono: ${record.phone}`);
      } catch (cleanupError) {
        console.error('Error limpiando registro expirado:', cleanupError);
      }
    }
    
    // ============ MANEJO DE REGISTRO INCOMPLETO ACTIVO ============
    
    let shouldCreateNew = true;
    let existingIncompleteUser = null;
    
    // Buscar registro incompleto activo (no expirado)
    const [activeIncompleteRecords] = await db.query(
      `SELECT id, phone, id_card, otp_expires_at FROM users 
       WHERE (phone = ? OR id_card = ?) 
       AND phone_verified = 0 
       AND (first_name IS NULL OR last_name IS NULL)
       AND otp_expires_at >= ?`,
      [cleanPhone, cleanIdCard, now]
    );
    
    if (activeIncompleteRecords.length > 0) {
      // Verificar si el registro incompleto coincide exactamente con los datos enviados
      const activeRecord = activeIncompleteRecords[0];
      
      if (activeRecord.phone === cleanPhone && activeRecord.id_card === cleanIdCard) {
        // Registro incompleto exacto encontrado, actualizarlo
        existingIncompleteUser = activeRecord;
        shouldCreateNew = false;
        console.log(`🔄 Registro incompleto encontrado para actualizar: ID ${activeRecord.id}`);
      } else {
        // Hay conflicto: mismo teléfono o cédula pero diferentes datos
        return res.status(400).json({
          success: false,
          error: 'Ya existe un registro pendiente de verificación con estos datos. Espere a que expire o complete el registro anterior.'
        });
      }
    }
    
    // Verificar estado WhatsApp usando el método asíncrono
    const whatsappStatus = await WhatsAppService.getStatus();
    if (!whatsappStatus.effectiveReady) {
      return res.status(503).json({
        success: false,
        error: 'Servicio WhatsApp no disponible temporalmente',
        whatsappStatus: whatsappStatus,
        details: `Estado actual: ${whatsappStatus.status}, Estado cliente: ${whatsappStatus.clientState}`
      });
    }
    
    // Generar OTP
    const otp = generateOTP(6);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos
    
    // ============ GUARDAR O ACTUALIZAR OTP ============
    
    if (shouldCreateNew) {
      // Crear nuevo registro incompleto
      console.log('💾 Creando nuevo registro incompleto...');
      
      const [result] = await db.query(
        `INSERT INTO users (phone, id_card, otp, otp_expires_at, phone_verified, created_at, updated_at) 
         VALUES (?, ?, ?, ?, 0, NOW(), NOW())`,
        [cleanPhone, cleanIdCard, otp, otpExpires]
      );
      
      console.log(`✅ Nuevo registro incompleto creado con ID: ${result.insertId}`);
    } else {
      // Actualizar registro incompleto existente
      console.log('🔄 Actualizando registro incompleto existente...');
      
      await db.query(
        'UPDATE users SET otp = ?, otp_expires_at = ?, updated_at = NOW() WHERE id = ?',
        [otp, otpExpires, existingIncompleteUser.id]
      );
      
      console.log(`✅ Registro incompleto actualizado: ID ${existingIncompleteUser.id}`);
    }
    
    console.log('📱 Enviando OTP por WhatsApp...');
    
    // Verificar estado de WhatsApp antes de enviar
    try {
      const whatsappStatus = await WhatsAppService.getStatus();
      console.log('🔍 Estado WhatsApp antes de enviar:', {
        isReady: whatsappStatus.isReady,
        clientState: whatsappStatus.clientState,
        hasRequiredMethods: whatsappStatus.hasRequiredMethods,
        effectiveReady: whatsappStatus.effectiveReady
      });

      if (!whatsappStatus.effectiveReady || !whatsappStatus.hasRequiredMethods) {
        throw new Error(`WhatsApp no está listo para enviar mensajes. Estado: ${whatsappStatus.status}, Cliente: ${whatsappStatus.clientState}`);
      }

      // Intentar enviar OTP con reintentos
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`📞 Intento ${attempt}/3 de envío de OTP...`);
          await WhatsAppService.sendOTP(cleanPhone, otp);
          console.log(`✅ OTP enviado a ${cleanPhone}${tableRange ? ` para rango ${tableRange}` : ''}`);
          break;
        } catch (sendError) {
          lastError = sendError;
          console.error(`❌ Error en intento ${attempt}:`, sendError.message);
          
          if (attempt < 3) {
            console.log(`⏳ Esperando 3 segundos antes del siguiente intento...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verificar estado nuevamente
            const recheckStatus = await WhatsAppService.getStatus();
            if (!recheckStatus.effectiveReady) {
              console.log('⚠️ WhatsApp no está listo, esperando más tiempo...');
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          } else {
            throw lastError;
          }
        }
      }
    } catch (whatsappError) {
      console.error('❌ Error crítico con WhatsApp:', whatsappError.message);
      
      // Limpiar el registro incompleto si falla el envío
      if (!shouldCreateNew && existingIncompleteUser) {
        try {
          await db.query('DELETE FROM users WHERE id = ? AND phone_verified = 0', [existingIncompleteUser.id]);
          console.log('🗑️ Registro incompleto limpiado después del error');
        } catch (cleanupError) {
          console.error('❌ Error al limpiar registro:', cleanupError.message);
        }
      }
      
      throw new Error('Servicio WhatsApp no disponible temporalmente. Por favor, inténtalo de nuevo en unos minutos.');
    }
    
    console.log(`✅ OTP enviado a ${cleanPhone}${tableRange ? ` para rango ${tableRange}` : ''}`);
    
    const response = {
      success: true,
      message: 'Código de verificación enviado por WhatsApp',
      otpExpires: otpExpires.toISOString(),
      isUpdate: !shouldCreateNew,
      debug: process.env.NODE_ENV === 'development' ? { otp } : undefined
    };
    
    // Solo incluir tableRange en la respuesta si existe
    if (tableRange) {
      response.tableRange = tableRange;
    }
    
    return res.json(response);
    
  } catch (error) {
    console.error('❌ Error en sendOTP:', error);
    
    // Manejo específico de errores
    if (error.message.includes('WhatsApp') || error.message.includes('whatsapp')) {
      return res.status(400).json({
        success: false,
        error: 'Error enviando mensaje por WhatsApp',
        details: error.message
      });
    }
    
    if (error.message.includes('timeout')) {
      return res.status(408).json({
        success: false,
        error: 'La operación tardó demasiado tiempo. Intente nuevamente.'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// PASO 3: Verificar OTP y completar registro
exports.registerUser = async (req, res) => {
  try {
    const { 
      firstName, lastName, idCard, phone, userEnteredOTP,
      provinciaId, cantonId, barrioId, ubicacionDetallada, latitud, longitud
    } = req.body;
    
    // Debug: Imprimir valores recibidos
    console.log('📋 Datos recibidos:', {
      firstName: `"${firstName}"`,
      lastName: `"${lastName}"`,
      idCard: `"${idCard}"`,
      phone: `"${phone}"`,
      userEnteredOTP: `"${userEnteredOTP}"`,
      provinciaId,
      cantonId,
      barrioId,
      ubicacionDetallada: `"${ubicacionDetallada}"`
    });
    
    // Validaciones básicas mejoradas
    if (!firstName || !firstName.toString().trim() || 
        !lastName || !lastName.toString().trim() || 
        !idCard || !idCard.toString().trim() || 
        !phone || !phone.toString().trim() || 
        !userEnteredOTP || !userEnteredOTP.toString().trim() ||
        !ubicacionDetallada || !ubicacionDetallada.toString().trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Nombres, apellidos, cédula, teléfono, ubicación detallada y código de verificación son requeridos',
        received: {
          firstName: firstName ? `"${firstName}"` : 'null/undefined',
          lastName: lastName ? `"${lastName}"` : 'null/undefined',
          idCard: idCard ? `"${idCard}"` : 'null/undefined',
          phone: phone ? `"${phone}"` : 'null/undefined',
          userEnteredOTP: userEnteredOTP ? `"${userEnteredOTP}"` : 'null/undefined',
          ubicacionDetallada: ubicacionDetallada ? `"${ubicacionDetallada}"` : 'null/undefined'
        }
      });
    }
    
    // Verificar ubicación geográfica
    if (!provinciaId || !cantonId || !barrioId) {
      return res.status(400).json({ 
        success: false,
        error: 'Debe seleccionar provincia, cantón y barrio',
        received: {
          provinciaId,
          cantonId,
          barrioId
        }
      });
    }
    
    // Validar longitud de ubicación detallada
    if (ubicacionDetallada.toString().trim().length < 10) {
      return res.status(400).json({ 
        success: false,
        error: 'La ubicación detallada debe tener al menos 10 caracteres'
      });
    }
    
    // Limpiar valores de espacios en blanco
    const cleanFirstName = firstName.toString().trim();
    const cleanLastName = lastName.toString().trim();
    const cleanIdCard = idCard.toString().trim();
    const cleanPhone = phone.toString().trim();
    const cleanUserEnteredOTP = userEnteredOTP.toString().trim();
    const cleanUbicacionDetallada = ubicacionDetallada.toString().trim();
    
    // ============ VERIFICACIÓN DE REGISTRO EXISTENTE ============
    
    console.log('🔍 Verificando estado del registro...');
    
    // Buscar registro existente con este teléfono
    const [existingUser] = await db.query(
      `SELECT id, phone_verified, otp_expires_at, first_name, last_name, id_card 
       FROM users 
       WHERE phone = ? 
       LIMIT 1`,
      [cleanPhone]
    );
    
    let existingUserId = null;
    let isIncompleteRegistration = false;
    
    if (existingUser.length > 0) {
      const user = existingUser[0];
      existingUserId = user.id;
      
      // Si ya está completamente registrado
      if (user.phone_verified && user.first_name && user.last_name && user.id_card) {
        return res.status(400).json({
          success: false,
          error: 'Este número de teléfono ya está registrado y verificado'
        });
      }
      
      // Si existe pero está incompleto (solo phone y OTP)
      if (!user.phone_verified && !user.first_name) {
        isIncompleteRegistration = true;
        
        // Verificar si el OTP ha expirado
        const now = new Date();
        const otpExpiresAt = new Date(user.otp_expires_at);
        
        if (otpExpiresAt < now) {
          console.log('⚠️ Registro incompleto con OTP expirado encontrado, será limpiado si falla la verificación');
        }
      }
    }
    
    // ============ VERIFICACIÓN DE CÉDULA ============
    
    // Verificar si la cédula ya está registrada (excluir el registro actual si existe)
    const cedulaQuery = existingUserId ? 
      'SELECT id FROM users WHERE id_card = ? AND id != ? AND phone_verified = 1 LIMIT 1' :
      'SELECT id FROM users WHERE id_card = ? AND phone_verified = 1 LIMIT 1';
    
    const cedulaParams = existingUserId ? [cleanIdCard, existingUserId] : [cleanIdCard];
    
    const [existingIdCard] = await db.query(cedulaQuery, cedulaParams);
    
    if (existingIdCard.length > 0) {
      // Limpiar registro incompleto antes de mostrar error
      if (isIncompleteRegistration && existingUserId) {
        try {
          await db.query('DELETE FROM users WHERE id = ? AND phone_verified = 0', [existingUserId]);
          console.log('🗑️ Registro incompleto limpiado por conflicto de cédula');
        } catch (cleanupError) {
          console.error('Error limpiando registro incompleto:', cleanupError);
        }
      }
      
      return res.status(400).json({
        success: false,
        error: 'La cédula ya está registrada con otro número de teléfono'
      });
    }
    
    // ============ VERIFICACIÓN DE OTP ============
    
    console.log('🔐 Verificando OTP...');
    console.log('📞 Teléfono:', cleanPhone);
    console.log('🔢 OTP ingresado:', cleanUserEnteredOTP);
    
    // Debug del OTP en base de datos
    if (existingUserId) {
      const [otpCheck] = await db.query(
        'SELECT otp, otp_expires_at, created_at FROM users WHERE id = ?',
        [existingUserId]
      );
      
      if (otpCheck.length > 0) {
        const otpData = otpCheck[0];
        console.log('🔍 OTP en BD:', otpData.otp);
        console.log('⏰ Expira en:', otpData.otp_expires_at);
        console.log('📅 Creado en:', otpData.created_at);
        console.log('🕐 Tiempo actual:', new Date());
      }
    }
    
    const otpVerified = await userModel.verifyOTP(cleanPhone, cleanUserEnteredOTP);
    
    if (!otpVerified) {
      // Si OTP falla y hay un registro incompleto, limpiarlo
      if (isIncompleteRegistration && existingUserId) {
        try {
          await db.query('DELETE FROM users WHERE id = ? AND phone_verified = 0', [existingUserId]);
          console.log('🗑️ Registro incompleto limpiado por OTP inválido');
        } catch (cleanupError) {
          console.error('Error limpiando registro por OTP inválido:', cleanupError);
        }
      }
      
      return res.status(400).json({ 
        success: false,
        error: 'Código de verificación inválido o expirado'
      });
    }
    
    // ============ COMPLETAR REGISTRO ============
    
    console.log('💾 Completando registro en BD...');
    
    let result, userId;
    
    if (isIncompleteRegistration && existingUserId) {
      // Actualizar registro existente incompleto
      console.log('🔄 Actualizando registro incompleto existente...');
      
      [result] = await db.query(
        `UPDATE users SET 
          first_name = ?, 
          last_name = ?, 
          id_card = ?, 
          provincia_id = ?, 
          canton_id = ?, 
          barrio_id = ?, 
          ubicacion_detallada = ?,
          latitud = ?, 
          longitud = ?, 
          phone_verified = 1,
          otp = NULL,
          otp_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          cleanFirstName, 
          cleanLastName, 
          cleanIdCard, 
          parseInt(provinciaId), 
          parseInt(cantonId), 
          parseInt(barrioId), 
          cleanUbicacionDetallada,
          parseFloat(latitud) || null, 
          parseFloat(longitud) || null, 
          existingUserId
        ]
      );
      
      userId = existingUserId;
      
    } else {
      // Buscar y actualizar por teléfono (flujo original)
      console.log('🔄 Actualizando registro por teléfono...');
      
      [result] = await db.query(
        `UPDATE users SET 
          first_name = ?, 
          last_name = ?, 
          id_card = ?, 
          provincia_id = ?, 
          canton_id = ?, 
          barrio_id = ?, 
          ubicacion_detallada = ?,
          latitud = ?, 
          longitud = ?, 
          phone_verified = 1,
          otp = NULL,
          otp_expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE phone = ?`,
        [
          cleanFirstName, 
          cleanLastName, 
          cleanIdCard, 
          parseInt(provinciaId), 
          parseInt(cantonId), 
          parseInt(barrioId), 
          cleanUbicacionDetallada,
          parseFloat(latitud) || null, 
          parseFloat(longitud) || null, 
          cleanPhone
        ]
      );
      
      // Obtener el ID del usuario
      const [userData] = await db.query(
        'SELECT id FROM users WHERE phone = ?',
        [cleanPhone]
      );
      
      if (userData.length === 0) {
        throw new Error('No se pudo obtener el ID del usuario después del registro');
      }
      
      userId = userData[0].id;
    }
    
    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo completar el registro. Verifique el teléfono.'
      });
    }
    
    console.log(`✅ Registro completado exitosamente. Usuario ID: ${userId}`);
    
    // ============ ASIGNACIÓN DE TABLA DE BINGO ============
    
    console.log('🎯 Asignando tabla de BINGO...');
    let bingoTableData = null;
    let tableAssignmentError = null;
    
    try {
      const tableAssignment = await BingoTableService.assignTableToUser(userId);
      if (tableAssignment.success) {
        bingoTableData = tableAssignment.table;
        console.log('✅ Tabla de BINGO asignada:', bingoTableData.table_code);
      }
    } catch (tableError) {
      console.error('❌ Error al asignar tabla de BINGO:', tableError);
      tableAssignmentError = tableError.message;
      // No devolver error, continuar con el proceso
    }
    
    // ============ ENVÍO DE MENSAJES WHATSAPP ============
    
    console.log('📱 Enviando mensajes de WhatsApp...');
    let whatsappErrors = [];
    
    try {
      // Verificar que WhatsApp esté disponible
      const whatsappStatus = await WhatsAppService.getStatus();
      if (whatsappStatus.effectiveReady) {
        
        // Enviar mensaje de bienvenida
        try {
          await WhatsAppService.sendWelcomeMessage(cleanPhone, cleanFirstName, cleanLastName);
          console.log('✅ Mensaje de bienvenida enviado exitosamente');
        } catch (welcomeError) {
          console.error('❌ Error enviando mensaje de bienvenida:', welcomeError);
          whatsappErrors.push('Error al enviar mensaje de bienvenida');
        }
        
        // Enviar tabla de BINGO si se asignó correctamente
        if (bingoTableData) {
          try {
            await new Promise(resolve => setTimeout(resolve, 8000)); // Esperar 8 segundos
            
            const bingoResult = await WhatsAppService.sendBingoTable(
              cleanPhone, 
              cleanFirstName, 
              cleanLastName, 
              bingoTableData
            );
            
            if (bingoResult.success) {
              console.log('✅ Tabla de BINGO enviada exitosamente');
            }
          } catch (bingoError) {
            console.error('❌ Error enviando tabla de BINGO:', bingoError);
            whatsappErrors.push('Error al enviar tabla de BINGO');
            
            // Si falla el envío, considerar liberar la tabla para otro usuario
            try {
              await BingoTableService.releaseTable(bingoTableData.id);
              console.log('🔄 Tabla liberada debido a error en envío');
            } catch (releaseError) {
              console.error('❌ Error al liberar tabla:', releaseError);
            }
          }
        }
        
      } else {
        console.log('⚠️ WhatsApp no disponible, mensajes no enviados');
        whatsappErrors.push('Servicio de WhatsApp no disponible');
      }
    } catch (generalWhatsappError) {
      console.error('❌ Error general en WhatsApp:', generalWhatsappError);
      whatsappErrors.push('Error general en servicio de mensajería');
    }
    
    console.log('🎉 Usuario registrado exitosamente!');
    
    // ============ RESPUESTA EXITOSA ============
    
    const response = {
      success: true,
      message: 'Usuario registrado correctamente',
      userId: userId,
      isUpdate: isIncompleteRegistration,
      data: {
        user: {
          firstName: cleanFirstName,
          lastName: cleanLastName,
          idCard: cleanIdCard,
          phone: cleanPhone
        },
        bingoTable: bingoTableData ? {
          assigned: true,
          tableCode: bingoTableData.table_code,
          fileName: bingoTableData.file_name
        } : {
          assigned: false,
          error: tableAssignmentError
        },
        whatsapp: {
          sent: whatsappErrors.length === 0,
          errors: whatsappErrors
        }
      }
    };
    
    // Si hay errores no críticos, incluirlos en la respuesta
    if (tableAssignmentError || whatsappErrors.length > 0) {
      response.warnings = [];
      if (tableAssignmentError) {
        response.warnings.push(`Tabla de BINGO: ${tableAssignmentError}`);
      }
      if (whatsappErrors.length > 0) {
        response.warnings.push(`WhatsApp: ${whatsappErrors.join(', ')}`);
      }
    }
    
    res.status(201).json(response);
    
  } catch (error) {
    console.error('❌ Error al registrar usuario:', error);
    
    // En caso de error crítico, intentar limpiar registros incompletos
    if (phone) {
      try {
        const cleanPhone = phone.toString().trim();
        const [incompleteUser] = await db.query(
          'SELECT id FROM users WHERE phone = ? AND phone_verified = 0 AND first_name IS NULL',
          [cleanPhone]
        );
        
        if (incompleteUser.length > 0) {
          await db.query('DELETE FROM users WHERE id = ?', [incompleteUser[0].id]);
          console.log('🗑️ Registro incompleto limpiado por error crítico');
        }
      } catch (cleanupError) {
        console.error('Error en limpieza por error crítico:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.registerManualUser = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      idCard, 
      phone,
      provinciaId, 
      cantonId, 
      barrioId, 
      ubicacionDetallada, 
      latitud, 
      longitud,
      tableStart,
      tableEnd,
      id_registrador,
    } = req.body;
    
    // Validaciones básicas
    if (!firstName || !lastName || !idCard || !phone || 
        !provinciaId || !cantonId || !barrioId || !ubicacionDetallada ||
        !latitud || !longitud || !tableStart || !tableEnd) {
      return res.status(400).json({ 
        success: false,
        error: 'Todos los campos son requeridos'
      });
    }

    if (!id_registrador) {
      return res.status(400).json({
        success: false,
        error: 'Debe especificar el registrador y el evento'
      });
    }


    // Validar rango de tablas
    const start = parseInt(tableStart);
    const end = parseInt(tableEnd);
    
    if (start >= end) {
      return res.status(400).json({ 
        success: false,
        error: 'El número final debe ser mayor al inicial'
      });
    }
    const tableRange = `${start}_${end}`;
    const quantity = end - start + 1;
    
    // Obtener brigada activa y límites
    const [lastBrigada] = await db.query(
      'SELECT id_brigada, max_tables_per_person FROM brigadas WHERE activa = 1 ORDER BY fecha_creacion DESC LIMIT 1'
    );

    if (lastBrigada.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay brigadas activas registradas'
      });
    }

    const id_evento = lastBrigada[0].id_brigada;
    const maxTables = lastBrigada[0].max_tables_per_person || 1;
    
    // Verificar si el rango ya existe
    const [existingTables] = await db.query(
      'SELECT id FROM bingo_tables WHERE table_code = ? LIMIT 1',
      [tableRange]
    );
    if (existingTables.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'El rango de tablas ya está registrado'
      });
    }
    // Verificar el número de tablas que el usuario ya tiene en esta brigada
    const [existingCount] = await db.query(
      'SELECT COUNT(*) as count FROM users WHERE (phone = ? OR id_card = ?) AND id_evento = ?',
      [phone, idCard, id_evento]
    );
    const currentCount = existingCount[0].count;
    if (currentCount >= maxTables) {
      return res.status(400).json({ 
        success: false,
        error: `El usuario ya tiene ${currentCount} tabla(s) registrada(s) en esta brigada. Límite máximo: ${maxTables} tabla(s) por persona.`
      });
    }
    // Iniciar transacción
    await db.query('START TRANSACTION');
    try {
      // Registrar usuario (sin id_tabla aún)

      const [userResult] = await db.query(
        `INSERT INTO users (
          first_name, 
          last_name, 
          id_card, 
          phone,
          provincia_id, 
          canton_id, 
          barrio_id, 
          ubicacion_detallada,
          latitud, 
          longitud,
          phone_verified,
          id_registrador,
          id_evento,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
        [
          firstName.trim(),
          lastName.trim(),
          idCard.trim(),
          phone.trim(),
          provinciaId,
          cantonId,
          barrioId,
          ubicacionDetallada.trim(),
          latitud,
          longitud,
          id_registrador,
          id_evento
        ]
      );
      const userId = userResult.insertId;
      // Generar nombre de archivo PDF
      const fileName = `BINGO_AMIGO_TABLA_${tableRange}.pdf`;
      // Registrar el rango de tablas
      const [tableResult] = await db.query(
        `INSERT INTO bingo_tables (
          table_code,
          file_name,
          registro_manual,
          created_at,
          entregado
        ) VALUES (?, ?, 1, NOW(), 1)`,
        [tableRange, fileName]
      );
      
      const tableId = tableResult.insertId;
      
      // Actualizar el usuario con el id_tabla
      await db.query(
        'UPDATE users SET id_tabla = ? WHERE id = ?',
        [tableId, userId]
      );
      
      await db.query('COMMIT');
      // Respuesta exitosa
      res.status(201).json({
        success: true,
        message: 'Usuario y tablas registradas correctamente',
        data: {
          userId,
          tableId,
          tableRange,
          quantity,
          fileName
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('Error en transacción:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error en registerManualUser:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Error al registrar usuario manualmente',
      details: process.env.NODE_ENV === 'development' ? {
        sql: error.sql,
        stack: error.stack
      } : undefined
    });
  }
};



exports.completeUserRegistration = async (req, res) => {
  let tempFilePath = null;
  let finalFilePath = null;
  const bingoValidator = new BingoTableServiceOCR();
  
  try {
    // Datos de la primera parte (registro básico con OTP)
    const { 
      firstName, 
      lastName, 
      idCard, 
      phone, 
      userEnteredOTP,
      provinciaId, 
      cantonId, 
      barrioId, 
      ubicacionDetallada, 
      latitud, 
      longitud,
      // Datos de la tabla de BINGO (parte manual)
      tableStart,
      tableEnd
    } = req.body;
    
    // Archivo subido
    const tablePhotoFile = req.file;
    
    // ============ VALIDACIONES INICIALES ============
    
    // 1. Validar datos básicos del usuario
    if (!firstName || !firstName.toString().trim() || 
        !lastName || !lastName.toString().trim() || 
        !idCard || !idCard.toString().trim() || 
        !phone || !phone.toString().trim() || 
        !userEnteredOTP || !userEnteredOTP.toString().trim() ||
        !ubicacionDetallada || !ubicacionDetallada.toString().trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'Nombres, apellidos, cédula, teléfono, ubicación detallada y código de verificación son requeridos'
      });
    }
    
    // 2. Validar ubicación geográfica
    if (!provinciaId || !cantonId || !barrioId) {
      return res.status(400).json({ 
        success: false,
        error: 'Debe seleccionar provincia, cantón y barrio'
      });
    }
    
    // 3. Validar longitud de ubicación detallada
    if (ubicacionDetallada.toString().trim().length < 10) {
      return res.status(400).json({ 
        success: false,
        error: 'La ubicación detallada debe tener al menos 10 caracteres'
      });
    }
    
    // 4. Validar datos de la tabla (obligatorios en este flujo)
    if (!tableStart || !tableEnd) {
      return res.status(400).json({ 
        success: false,
        error: 'El rango de tabla (inicio y fin) es requerido'
      });
    }
    
    // 5. Validar que se haya subido una foto
    if (!tablePhotoFile) {
      return res.status(400).json({ 
        success: false,
        error: 'La foto de la tabla es requerida'
      });
    }
    
    // Limpiar valores
    const cleanFirstName = firstName.toString().trim();
    const cleanLastName = lastName.toString().trim();
    const cleanIdCard = idCard.toString().trim();
    const cleanPhone = phone.toString().trim();
    const cleanUserEnteredOTP = userEnteredOTP.toString().trim();
    const cleanUbicacionDetallada = ubicacionDetallada.toString().trim();
    
    // ============ FORMATO DE TABLAS ============
    
    // Asegurar que los números de tabla tengan 5 dígitos
    const paddedTableStart = tableStart.padStart(5, '0');
    const paddedTableEnd = tableEnd.padStart(5, '0');
    const tableRange = `${paddedTableStart}_${paddedTableEnd}`;
    
    // ============ VERIFICACIÓN DE REGISTRO EXISTENTE ============
    
    console.log('🔍 Verificando registro existente...');
    
    // Buscar si ya existe un registro con este teléfono
    const [existingRegistration] = await db.query(
      `SELECT id, phone_verified, otp_expires_at, first_name, last_name, id_card, id_tabla 
       FROM users 
       WHERE phone = ? 
       LIMIT 1`,
      [cleanPhone]
    );
    
    let isUpdate = false;
    let existingUserId = null;
    
    if (existingRegistration.length > 0) {
      const existing = existingRegistration[0];
      
      // Si ya está completamente registrado (phone_verified = 1 y tiene datos completos)
      if (existing.phone_verified && existing.first_name && existing.last_name && existing.id_card) {
        return res.status(400).json({ 
          success: false,
          error: 'Este número de teléfono ya está registrado y verificado'
        });
      }
      
      // Si existe pero no está verificado o no tiene datos completos
      isUpdate = true;
      existingUserId = existing.id;
      
      // Verificar si el OTP ha expirado
      const now = new Date();
      const otpExpiresAt = new Date(existing.otp_expires_at);
      
      if (otpExpiresAt < now) {
        console.log('⚠️ OTP expirado, permitiendo actualización');
      }
    }
    
    // ============ VERIFICACIÓN DE OTP ============
    
    console.log('🔐 Verificando OTP...');
    const otpVerified = await userModel.verifyOTP(cleanPhone, cleanUserEnteredOTP);
    
    if (!otpVerified) {
      return res.status(400).json({ 
        success: false,
        error: 'Código de verificación inválido o expirado'
      });
    }
    
    // ============ VALIDACIÓN DE CÉDULA (solo si no es update o si cambió) ============
    
    if (!isUpdate || (isUpdate && existingRegistration[0].id_card !== cleanIdCard)) {
      const [existingIdCard] = await db.query(
        'SELECT id FROM users WHERE id_card = ? AND phone != ? LIMIT 1',
        [cleanIdCard, cleanPhone]
      );
      
      if (existingIdCard.length > 0) {
        return res.status(400).json({ 
          success: false,
          error: 'La cédula ya está registrada con otro número de teléfono'
        });
      }
    }
    
    // ============ MANEJO DEL ARCHIVO PARA OCR ============
    
    // Crear archivo temporal desde el buffer para OCR
    const fileExtension = path.extname(tablePhotoFile.originalname) || '.jpg';
    const tempFileName = `temp_ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
    tempFilePath = path.join(os.tmpdir(), tempFileName);
    
    // Escribir el buffer a un archivo temporal
    fs.writeFileSync(tempFilePath, tablePhotoFile.buffer);
    
    console.log('📁 Archivo temporal creado para OCR:', tempFilePath);
    
    // ============ VALIDACIÓN OCR DE LA IMAGEN ============
    
    console.log('🔍 Validando imagen de tabla con OCR...');
    
    const ocrValidation = await bingoValidator.validateBingoTable(tempFilePath);
    
    if (!ocrValidation.success) {
      return res.status(400).json({ 
        success: false,
        error: 'Error al procesar la imagen de la tabla',
        details: ocrValidation.error
      });
    }
    
    if (!ocrValidation.isValidTable) {
      // Si la validación OCR falla y es un update, limpiar el registro incompleto
      if (isUpdate && existingUserId) {
        try {
          console.log('🗑️ Limpiando registro incompleto por falla en OCR...');
          await db.query('DELETE FROM users WHERE id = ? AND phone_verified = 0', [existingUserId]);
        } catch (cleanupError) {
          console.error('Error limpiando registro:', cleanupError);
        }
      }
      
      return res.status(400).json({ 
        success: false,
        error: 'La imagen no corresponde a una tabla válida de Bingo Amigo PRIME',
        details: {
          message: 'Por favor, tome una foto clara de una tabla oficial de Bingo Amigo PRIME',
          foundKeywords: ocrValidation.validation.foundKeywords,
          ocrConfidence: ocrValidation.ocrConfidence
        }
      });
    }
    
    console.log('✅ Tabla validada correctamente por OCR');
    console.log('📋 Palabras clave encontradas:', ocrValidation.validation.foundKeywords);
    
    // ============ VALIDACIÓN DE TABLA ============
    
    const start = parseInt(paddedTableStart);
    const end = parseInt(paddedTableEnd);
    
    if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Los números de tabla no son válidos'
      });
    }
    
    if (start >= end) {
      return res.status(400).json({ 
        success: false,
        error: 'El número final debe ser mayor al inicial'
      });
    }
    
    const quantity = end - start + 1;
    
    // Verificar si el rango ya existe (excluir el registro actual si es update)
    const tableExistsQuery = isUpdate ? 
      'SELECT id FROM bingo_tables WHERE table_code = ? AND id != (SELECT id_tabla FROM users WHERE id = ?) LIMIT 1' :
      'SELECT id FROM bingo_tables WHERE table_code = ? LIMIT 1';
    
    const tableExistsParams = isUpdate ? [tableRange, existingUserId] : [tableRange];
    
    const [existingTables] = await db.query(tableExistsQuery, tableExistsParams);
    
    if (existingTables.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: `El rango de tablas ${tableRange} ya está registrado`
      });
    }
    
    // ============ PROCESAMIENTO DEL ARCHIVO FINAL ============
    
    // Generar el nombre final del archivo
    const finalFileExtension = path.extname(tablePhotoFile.originalname);
    const finalFileName = `BINGO_AMIGO_TABLA_${tableRange}${finalFileExtension}`;
    finalFilePath = path.join('/var/www/pelicanotv_registro/tablas/manuales/', finalFileName);
    
    // Guardar el archivo final desde el buffer
    fs.writeFileSync(finalFilePath, tablePhotoFile.buffer);
    
    // URL pública del archivo
    const tablePhotoUrl = `https://registro.pelicanotvcanal.com/tablas/manuales/${finalFileName}`;
    
    // ============ TRANSACCIÓN PARA REGISTRO/ACTUALIZACIÓN ============
    
    await db.query('START TRANSACTION');
    
    try {
      let userId, tableId;
      
      if (isUpdate) {
        // ============ ACTUALIZAR REGISTRO EXISTENTE ============
        
        console.log('🔄 Actualizando registro existente...');
        
        userId = existingUserId;
        
        // Actualizar datos del usuario Y ELIMINAR OTP
        await db.query(
          `UPDATE users SET 
            first_name = ?, 
            last_name = ?, 
            id_card = ?, 
            provincia_id = ?, 
            canton_id = ?, 
            barrio_id = ?, 
            ubicacion_detallada = ?,
            latitud = ?, 
            longitud = ?,
            phone_verified = 1,
            otp = NULL,
            otp_expires_at = NULL,
            updated_at = NOW()
          WHERE id = ?`,
          [
            cleanFirstName,
            cleanLastName,
            cleanIdCard,
            parseInt(provinciaId),
            parseInt(cantonId),
            parseInt(barrioId),
            cleanUbicacionDetallada,
            parseFloat(latitud) || null,
            parseFloat(longitud) || null,
            userId
          ]
        );
        
        // Si ya tenía una tabla asignada, actualizarla; si no, crear nueva
        const existingTableId = existingRegistration[0].id_tabla;
        
        if (existingTableId) {
          // Actualizar tabla existente
          await db.query(
            `UPDATE bingo_tables SET 
              table_code = ?,
              file_name = ?,
              file_url = ?,
              ocr_confidence = ?,
              ocr_keywords = ?,
              updated_at = NOW()
            WHERE id = ?`,
            [
              tableRange, 
              finalFileName, 
              tablePhotoUrl,
              ocrValidation.ocrConfidence,
              JSON.stringify(ocrValidation.validation.foundKeywords),
              existingTableId
            ]
          );
          
          tableId = existingTableId;
        } else {
          // Crear nueva tabla
          const [tableResult] = await db.query(
            `INSERT INTO bingo_tables (
              table_code,
              file_name,
              file_url,
              registro_manual,
              ocr_validated,
              ocr_confidence,
              ocr_keywords,
              created_at,
              entregado
            ) VALUES (?, ?, ?, 1, 1, ?, ?, NOW(), 1)`,
            [
              tableRange, 
              finalFileName, 
              tablePhotoUrl,
              ocrValidation.ocrConfidence,
              JSON.stringify(ocrValidation.validation.foundKeywords)
            ]
          );
          
          tableId = tableResult.insertId;
          
          // Asignar la nueva tabla al usuario
          await db.query(
            'UPDATE users SET id_tabla = ? WHERE id = ?',
            [tableId, userId]
          );
        }
        
      } else {
        // ============ CREAR NUEVO REGISTRO ============
        
        console.log('➕ Creando nuevo registro...');
        
        // 1. Registrar usuario (SIN OTP porque ya está verificado)
        const [userResult] = await db.query(
          `INSERT INTO users (
            first_name, 
            last_name, 
            id_card, 
            phone,
            provincia_id, 
            canton_id, 
            barrio_id, 
            ubicacion_detallada,
            latitud, 
            longitud,
            phone_verified,
            otp,
            otp_expires_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NOW(), NOW())`,
          [
            cleanFirstName,
            cleanLastName,
            cleanIdCard,
            cleanPhone,
            parseInt(provinciaId),
            parseInt(cantonId),
            parseInt(barrioId),
            cleanUbicacionDetallada,
            parseFloat(latitud) || null,
            parseFloat(longitud) || null
          ]
        );
        
        userId = userResult.insertId;
        
        // 2. Registrar la tabla de BINGO
        const [tableResult] = await db.query(
          `INSERT INTO bingo_tables (
            table_code,
            file_name,
            file_url,
            registro_manual,
            ocr_validated,
            ocr_confidence,
            ocr_keywords,
            created_at,
            entregado
          ) VALUES (?, ?, ?, 1, 1, ?, ?, NOW(), 1)`,
          [
            tableRange, 
            finalFileName, 
            tablePhotoUrl,
            ocrValidation.ocrConfidence,
            JSON.stringify(ocrValidation.validation.foundKeywords)
          ]
        );
        
        tableId = tableResult.insertId;
        
        // 3. Asignar la tabla al usuario
        await db.query(
          'UPDATE users SET id_tabla = ? WHERE id = ?',
          [tableId, userId]
        );
      }
      
      await db.query('COMMIT');
      
      console.log(`✅ Archivo guardado: ${finalFilePath}`);
      console.log(`✅ URL pública: ${tablePhotoUrl}`);
      console.log(`✅ ${isUpdate ? 'Actualización' : 'Registro'} completado exitosamente`);
      
      // ============ ENVÍO DE NOTIFICACIONES ============
      
      let whatsappErrors = [];
      
      try {
        const whatsappStatus = await WhatsAppService.getStatus();
        if (whatsappStatus.effectiveReady) {
          
          // Enviar mensaje de bienvenida (para nuevos registros Y actualizaciones)
          try {
            console.log('📱 Enviando mensaje de bienvenida...');
            await WhatsAppService.sendWelcomeMessage(cleanPhone, cleanFirstName, cleanLastName);
            console.log('✅ Mensaje de bienvenida enviado exitosamente');
          } catch (welcomeError) {
            console.error('❌ Error enviando mensaje de bienvenida:', welcomeError);
            whatsappErrors.push('Error al enviar mensaje de bienvenida');
          }
          
          // Esperar un poco antes del siguiente mensaje
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Enviar confirmación de tabla (para todos)
          try {
            console.log('📱 Enviando confirmación de tabla...');
            await WhatsAppService.sendConfirmationMessage(cleanPhone, cleanFirstName, tableRange);
            
            console.log(`✅ Confirmación de tabla enviada`);
          } catch (confirmationError) {
            console.error('❌ Error enviando confirmación de tabla:', confirmationError);
            whatsappErrors.push('Error al enviar confirmación de tabla');
          }
        } else {
          console.log('⚠️ WhatsApp no disponible, mensajes no enviados');
          whatsappErrors.push('Servicio de WhatsApp no disponible');
        }
      } catch (generalWhatsappError) {
        console.error('❌ Error general en WhatsApp:', generalWhatsappError);
        whatsappErrors.push('Error general en servicio de mensajería');
      }
      
      // ============ RESPUESTA EXITOSA ============
      
      const response = {
        success: true,
        message: `${isUpdate ? 'Actualización' : 'Registro'} completo exitoso - Tabla validada por OCR`,
        data: {
          userId,
          isUpdate,
          user: {
            firstName: cleanFirstName,
            lastName: cleanLastName,
            idCard: cleanIdCard,
            phone: cleanPhone
          },
          bingoTable: {
            tableId,
            tableRange,
            quantity,
            photoUrl: tablePhotoUrl,
            fileName: finalFileName,
            ocrValidation: {
              isValid: true,
              confidence: ocrValidation.ocrConfidence,
              foundKeywords: ocrValidation.validation.foundKeywords
            }
          },
          whatsapp: {
            sent: whatsappErrors.length === 0,
            errors: whatsappErrors.length > 0 ? whatsappErrors : undefined
          }
        }
      };
      
      res.status(isUpdate ? 200 : 201).json(response);
      
    } catch (error) {
      await db.query('ROLLBACK');
      
      // Si hay error, eliminar el archivo subido
      try {
        if (finalFilePath && fs.existsSync(finalFilePath)) {
          fs.unlinkSync(finalFilePath);
          console.log('🗑️ Archivo eliminado por error en transacción');
        }
      } catch (fileError) {
        console.error('Error eliminando archivo:', fileError);
      }
      
      console.error('Error en transacción:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error en completeUserRegistration:', error);
    
    // Si hay error y es un registro fallido por OCR, limpiar registro incompleto
    if (error.message && error.message.includes('tabla válida')) {
      try {
        const [incompleteUser] = await db.query(
          'SELECT id FROM users WHERE phone = ? AND phone_verified = 0 AND first_name IS NULL',
          [phone]
        );
        
        if (incompleteUser.length > 0) {
          await db.query('DELETE FROM users WHERE id = ?', [incompleteUser[0].id]);
          console.log('🗑️ Registro incompleto limpiado por falla en OCR');
        }
      } catch (cleanupError) {
        console.error('Error en limpieza de registro incompleto:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack
      } : undefined
    });
  } finally {
    // Limpiar archivo temporal SIEMPRE
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🗑️ Archivo temporal eliminado:', tempFilePath);
      } catch (cleanupError) {
        console.error('Error limpiando archivo temporal:', cleanupError);
      }
    }
  }
};


exports.assignBingoTable = async (req, res) => {
  try {
    const { userId, phone } = req.body;
    
    if (!userId && !phone) {
      return res.status(400).json({ 
        success: false,
        error: 'Se requiere userId o phone para identificar al usuario'
      });
    }
    
    // Buscar usuario por ID o teléfono
    let user;
    if (userId) {
      const [users] = await db.query(
        'SELECT id, first_name, last_name, phone, id_tabla FROM users WHERE id = ?',
        [userId]
      );
      user = users[0];
    } else {
      const [users] = await db.query(
        'SELECT id, first_name, last_name, phone, id_tabla FROM users WHERE phone = ?',
        [phone]
      );
      user = users[0];
    }
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuario no encontrado'
      });
    }
    
    // Verificar si ya tiene tabla asignada
    if (user.id_tabla) {
      const [existingTable] = await db.query(
        'SELECT table_code FROM bingo_tables WHERE id = ?',
        [user.id_tabla]
      );
      
      return res.status(400).json({ 
        success: false,
        error: 'El usuario ya tiene una tabla asignada',
        tableCode: existingTable[0]?.table_code
      });
    }
    
    // Asignar nueva tabla
    console.log(`🎯 Asignando tabla a usuario ${user.id} (${user.phone})`);
    const tableAssignment = await BingoTableService.assignTableToUser(user.id);
    
    if (!tableAssignment.success) {
      return res.status(500).json({ 
        success: false,
        error: 'No se pudo asignar tabla',
        details: tableAssignment.error
      });
    }
    
    const tableData = tableAssignment.table;
    
    // Enviar tabla por WhatsApp
    let whatsappResult = { sent: false };
    const whatsappStatus = await WhatsAppService.getStatus();
    
    if (whatsappStatus.effectiveReady) {
      try {
        // Intentar con la URL principal primero
        try {
          const result = await WhatsAppService.sendBingoTable(
            user.phone,
            user.first_name,
            user.last_name,
            tableData
          );
          whatsappResult = { sent: true, usedFallback: false };
        } catch (primaryError) {
          console.error('❌ Error con URL principal, intentando con URL alternativa...', primaryError);
          
          // Crear objeto con URL alternativa
          const fallbackTableData = {
            ...tableData,
            file_url: tableData.file_url.replace(
              'registro.pelicanotv.com/tablas',
              'pelicanotvcanal.com/tablas',
              '34.82.33.50/tablas'
            )
          };
          
          const fallbackResult = await WhatsAppService.sendBingoTable(
            user.phone,
            user.first_name,
            user.last_name,
            fallbackTableData
          );
          whatsappResult = { sent: true, usedFallback: true };
        }
      } catch (whatsappError) {
        console.error('❌ Error al enviar tabla por WhatsApp:', whatsappError);
        whatsappResult = { 
          sent: false, 
          error: whatsappError.message,
          details: process.env.NODE_ENV === 'development' ? whatsappError.stack : undefined
        };
      }
    } else {
      whatsappResult.error = 'Servicio WhatsApp no disponible';
    }
    
    return res.json({
      success: true,
      message: 'Tabla asignada correctamente',
      userId: user.id,
      phone: user.phone,
      tableCode: tableData.table_code,
      whatsapp: whatsappResult
    });
    
  } catch (error) {
    console.error('❌ Error en assignBingoTable:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Exportar usuarios a CSV
exports.exportUsersCsv = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.id_card,
        u.phone,
        u.phone_verified,
        u.latitud,
        u.longitud,
        u.created_at,
        p.nombre as provincia,
        c.nombre as canton,
        b.BARRIO as barrio
      FROM users u
      LEFT JOIN provincias p ON u.provincia_id = p.id
      LEFT JOIN cantones c ON u.canton_id = c.id
      LEFT JOIN barrios b ON u.barrio_id = b.id
      WHERE u.phone_verified = 1
      ORDER BY u.created_at DESC
    `);
    
    const fields = [
      { label: 'ID', value: 'id' },
      { label: 'Nombres', value: 'first_name' },
      { label: 'Apellidos', value: 'last_name' },
      { label: 'Cédula', value: 'id_card' },
      { label: 'Teléfono', value: 'phone' },
      { label: 'Teléfono Verificado', value: 'phone_verified' },
      { label: 'Provincia', value: 'provincia' },
      { label: 'Cantón', value: 'canton' },
      { label: 'Barrio', value: 'barrio' },
      { label: 'Latitud', value: 'latitud' },
      { label: 'Longitud', value: 'longitud' },
      { label: 'Fecha Registro', value: 'created_at' }
    ];
    
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(users);
    
    res.header('Content-Type', 'text/csv');
    res.attachment('usuarios_verificados.csv');
    return res.send(csv);
    
  } catch (error) {
    console.error('Error al exportar usuarios a CSV:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al generar el archivo CSV' 
    });
  }
};


exports.getUsersMapData = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.id_card,
        u.phone,
        u.latitud,
        u.longitud,
        u.provincia_id,
        u.canton_id,
        u.barrio_id,
        u.created_at,
        p.nombre as provincia,
        c.nombre as canton,
        b.BARRIO as barrio
      FROM users u
      LEFT JOIN provincias p ON u.provincia_id = p.id
      LEFT JOIN cantones c ON u.canton_id = c.id
      LEFT JOIN barrios b ON u.barrio_id = b.id
      WHERE u.phone_verified = 1
        AND u.latitud IS NOT NULL
        AND u.longitud IS NOT NULL
      ORDER BY u.created_at DESC
    `);
    
    res.json({
      success: true,
      data: users,
      count: users.length
    });
    
  } catch (error) {
    console.error('Error al obtener datos para mapa:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener datos de ubicación de usuarios'
    });
  }
};