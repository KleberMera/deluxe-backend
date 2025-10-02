const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const WhatsAppService = require('../services/whatsappOTPService');
const { generateOTP } = require('../utils/otpGenerator');
const db = require('../config/db');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @route POST /api/users/send-otp
 * @description Envía un código OTP al número de WhatsApp proporcionado
 * @param {string} phone - Número de teléfono a verificar
 * @returns {object} - Mensaje de confirmación o error
 */
router.post('/send-otp', userController.sendOTP);

/**
 * @route POST /api/users/check-phone
 * @description Verifica si un número de teléfono ya está registrado
 * @param {string} phone - Número de teléfono a verificar
 * @returns {object} - Indica si el teléfono existe y si está verificado
 */
router.post('/check-user-exists', async (req, res) => {
  const { phone, idCard } = req.body; // Removido email ya que no existe en tu tabla
  
  if (!phone && !idCard) {
    return res.status(400).json({ 
      success: false,
      error: 'Se requiere al menos un campo (teléfono o cédula) para verificar' 
    });
  }
  
  try {
    // Consulta con los nombres exactos de tus campos
    let query = `
      SELECT 
        id, 
        phone,
        phone_verified, 
        first_name, 
        last_name, 
        id_card,
        otp,
        otp_expires_at,
        provincia_id,
        canton_id,
        barrio_id,
        ubicacion_detallada
      FROM users 
      WHERE `;
    
    let params = [];
    
    if (phone) {
      query += 'phone = ?';
      params.push(phone);
    } else if (idCard) {
      query += 'id_card = ?';
      params.push(idCard);
    }
    
    query += ' LIMIT 1';
    
    const [results] = await db.query(query, params);
    
    if (results.length > 0) {
      const user = results[0];
      
      // Definición de registro zombie adaptada a tu estructura
      const isZombieRecord = 
        user.phone_verified === 0 &&     // No está verificado (tu campo es tinyint, no boolean)
        (
          (!user.first_name || user.first_name.trim() === '') ||    // Falta nombre
          (!user.last_name || user.last_name.trim() === '') ||      // Falta apellido
          !user.provincia_id ||           // Falta provincia
          !user.canton_id ||              // Falta cantón
          !user.barrio_id ||              // Falta barrio
          (!user.ubicacion_detallada || user.ubicacion_detallada.trim() === '') // Falta ubicación
        ) &&
        user.phone;                      // Tiene teléfono (confirma que es un intento de registro)
      
      if (isZombieRecord) {
        // Eliminar el registro zombie
        await db.query('DELETE FROM users WHERE id = ?', [user.id]);
        
        const missingFields = [];
        if (!user.first_name || user.first_name.trim() === '') missingFields.push('nombre');
        if (!user.last_name || user.last_name.trim() === '') missingFields.push('apellido');
        if (!user.id_card) missingFields.push('cédula');
        if (!user.provincia_id) missingFields.push('provincia');
        if (!user.canton_id) missingFields.push('cantón');
        if (!user.barrio_id) missingFields.push('barrio');
        if (!user.ubicacion_detallada || user.ubicacion_detallada.trim() === '') missingFields.push('ubicación detallada');
        
        console.log(`🧟 Registro zombie eliminado (ID: ${user.id}) - Datos faltantes: ${missingFields.join(', ')}`);
        
        return res.json({ 
          success: true,
          exists: false,
          verified: false,
          message: 'Se encontró un registro incompleto que ha sido limpiado. Puede proceder con el registro.',
          details: {
            wasZombie: true,
            deletedUserId: user.id,
            missingFields: {
              firstName: !user.first_name || user.first_name.trim() === '',
              lastName: !user.last_name || user.last_name.trim() === '',
              idCard: !user.id_card,
              location: !user.provincia_id || !user.canton_id || !user.barrio_id,
              address: !user.ubicacion_detallada || user.ubicacion_detallada.trim() === ''
            }
          }
        });
      }
      
      // Si es un registro completo o verificado
      return res.json({ 
        success: true,
        exists: true,
        verified: user.phone_verified === 1,
        message: user.phone_verified === 1 ? 
          'El usuario ya está registrado y verificado' : 
          'El usuario ya está registrado pero no verificado',
        userData: {
          firstName: user.first_name,
          lastName: user.last_name,
          idCard: user.id_card,
          phone: user.phone
        }
      });
    }
    
    // Si no existe ningún registro
    res.json({ 
      success: true,
      exists: false,
      verified: false,
      message: 'El usuario no está registrado'
    });
    
  } catch (error) {
    console.error('Error al verificar usuario:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al verificar el usuario',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
/**
 * @route POST /api/users/register
 * @description Registra un nuevo usuario después de verificar el OTP
 * @consumes multipart/form-data
 * @param {string} email - Correo electrónico
 * @param {string} password - Contraseña
 * @param {string} otp - Código de verificación recibido por WhatsApp
 * @param {file} idCardFront - Foto frontal de la cédula (opcional)
 * @param {file} idCardBack - Foto posterior de la cédula (opcional)
 * @param {file} photo - Foto de perfil (opcional)
 * @returns {object} - Datos del usuario registrado o mensaje de error
 */
router.post('/register', userController.registerUser);
router.post('/assign-bingo-table', userController.assignBingoTable);

/**
 * @route POST /api/users/register-manual
 * @description Registra un usuario manualmente sin verificación OTP
 * @param {string} firstName - Nombres del usuario
 * @param {string} lastName - Apellidos del usuario
 * @param {string} idCard - Cédula del usuario
 * @param {string} phone - Teléfono del usuario
 * @param {number} provinciaId - ID de provincia
 * @param {number} cantonId - ID de cantón
 * @param {number} barrioId - ID de barrio
 * @param {string} ubicacionDetallada - Ubicación detallada
 * @param {number} latitud - Coordenada latitud
 * @param {number} longitud - Coordenada longitud
 * @param {number} tableStart - Número inicial de tabla
 * @param {number} tableQuantity - Cantidad de tablas a registrar
 * @returns {object} - Datos del usuario registrado y tablas asignadas
 */
router.post('/register-manual', userController.registerManualUser);

/**
 * @route POST /api/users/complete-registration
 * @description Completa el registro de usuario con verificación OTP y registro manual de tabla
 * @param {string} firstName - Nombres del usuario
 * @param {string} lastName - Apellidos del usuario
 * @param {string} idCard - Cédula del usuario
 * @param {string} phone - Teléfono del usuario
 * @param {string} userEnteredOTP - Código OTP recibido
 * @param {number} provinciaId - ID de provincia
 * @param {number} cantonId - ID de cantón
 * @param {number} barrioId - ID de barrio
 * @param {string} ubicacionDetallada - Ubicación detallada
 * @param {number} latitud - Coordenada latitud
 * @param {number} longitud - Coordenada longitud
 * @param {number} tableStart - Número inicial de tabla
 * @param {number} tableEnd - Número final de tabla
 * @param {string} tablePhotoUrl - URL de la foto de la tabla (obligatoria)
 * @returns {object} - Datos del usuario registrado y tabla asignada
 */
  router.post('/complete-registration', upload.single('tablePhoto'), userController.completeUserRegistration);

/**
 * @route GET /api/users/export-csv
 * @description Exporta la lista de usuarios en formato CSV
 * @returns {file} - Archivo CSV con datos de usuarios
 */
router.get('/export-csv', userController.exportUsersCsv);
router.get('/map-data', userController.getUsersMapData);

/**
 * @route POST /api/users/consultar-usuario
 * @description Consulta si un usuario existe por cédula y verifica el estado de sus tablas
 * @param {string} idCard - Cédula del usuario a consultar
 * @returns {object} - Información del usuario y estado de sus tablas
 */
router.post('/consultar-usuario', async (req, res) => {
  try {
    const { idCard } = req.body;

    // Validación básica
    if (!idCard) {
      return res.status(400).json({
        success: false,
        error: 'La cédula es requerida'
      });
    }

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

    // Buscar TODOS los registros del usuario con esa cédula
    const [userResults] = await db.query(
      `SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.id_card,
        u.phone,
        u.id_evento,
        u.id_tabla,
        u.provincia_id,
        u.canton_id,
        u.barrio_id,
        u.ubicacion_detallada,
        u.latitud,
        u.longitud,
        u.created_at,
        bt.table_code,
        bt.file_name,
        bt.entregado,
        bt.registro_manual,
        bt.created_at as table_created_at,
        p.nombre as provincia_nombre,
        c.nombre as canton_nombre,
        b.BARRIO as barrio_nombre
      FROM users u
      LEFT JOIN bingo_tables bt ON u.id_tabla = bt.id
      LEFT JOIN provincias p ON u.provincia_id = p.id
      LEFT JOIN cantones c ON u.canton_id = c.id
      LEFT JOIN barrios b ON u.barrio_id = b.id
      WHERE u.id_card = ?
      ORDER BY u.created_at DESC`,
      [idCard.trim()]
    );

    if (userResults.length === 0) {
      // Usuario no existe
      return res.status(200).json({
        success: true,
        exists: false,
        message: 'Usuario no encontrado. Puede proceder con el registro.',
        brigadaInfo: {
          id_evento,
          maxTables
        }
      });
    }

    // Filtrar registros de la brigada activa
    const activeBrigadaTables = userResults.filter(user => user.id_evento === id_evento);
    const otherBrigadasTables = userResults.filter(user => user.id_evento !== id_evento);

    // Contar tablas en brigada activa
    const tablesInActiveBrigada = activeBrigadaTables.length;
    const canRegisterMore = tablesInActiveBrigada < maxTables;
    const remainingSlots = maxTables - tablesInActiveBrigada;

    // Preparar información de tablas
    const tablesInfo = activeBrigadaTables.map(user => ({
      id: user.id_tabla,
      tableCode: user.table_code,
      fileName: user.file_name,
      entregado: user.entregado,
      registroManual: user.registro_manual,
      createdAt: user.table_created_at,
      userId: user.id
    }));

    // Información del usuario (tomar el más reciente)
    const latestUser = userResults[0];

    const response = {
      success: true,
      exists: true,
      user: {
        id: latestUser.id,
        firstName: latestUser.first_name,
        lastName: latestUser.last_name,
        idCard: latestUser.id_card,
        phone: latestUser.phone,
        location: {
          provincia: {
            id: latestUser.provincia_id,
            nombre: latestUser.provincia_nombre
          },
          canton: {
            id: latestUser.canton_id,
            nombre: latestUser.canton_nombre
          },
          barrio: {
            id: latestUser.barrio_id,
            nombre: latestUser.barrio_nombre
          },
          ubicacionDetallada: latestUser.ubicacion_detallada,
          latitud: latestUser.latitud,
          longitud: latestUser.longitud
        },
        createdAt: latestUser.created_at
      },
      brigadaInfo: {
        id_evento,
        maxTables,
        currentTables: tablesInActiveBrigada,
        canRegisterMore,
        remainingSlots: Math.max(0, remainingSlots)
      },
      tables: {
        activeBrigada: tablesInfo,
        otherBrigadas: otherBrigadasTables.length
      }
    };

    // Determinar mensaje según el estado
    if (tablesInActiveBrigada === 0) {
      response.message = `Usuario existe pero no tiene tablas en la brigada activa. Puede registrar hasta ${maxTables} tabla(s).`;
      response.hasTable = false;
    } else if (tablesInActiveBrigada >= maxTables) {
      response.message = `Usuario ha alcanzado el límite máximo de ${maxTables} tabla(s) para esta brigada.`;
      response.hasTable = true;
      response.limitReached = true;
    } else {
      response.message = `Usuario tiene ${tablesInActiveBrigada} tabla(s) en esta brigada. Puede registrar ${remainingSlots} tabla(s) más.`;
      response.hasTable = true;
      response.limitReached = false;
    }

    // Información adicional sobre tablas entregadas
    const deliveredTables = tablesInfo.filter(table => table.entregado === 1);
    const manualTables = tablesInfo.filter(table => table.registroManual === 1);

    if (deliveredTables.length > 0) {
      response.deliveredTables = deliveredTables.length;
      response.manualTables = manualTables.length;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error en consultar-usuario:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al consultar usuario',
      details: process.env.NODE_ENV === 'development' ? {
        sql: error.sql,
        stack: error.stack
      } : undefined
    });
  }
});module.exports = router;