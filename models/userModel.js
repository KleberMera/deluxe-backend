const db = require('../config/db');

// Función para buscar usuario por teléfono
const findUserByPhone = async (phone) => {
  console.log('🔍 Buscando usuario por teléfono:', phone);
  
  const query = 'SELECT id, phone, otp, otp_expires_at, phone_verified FROM users WHERE phone = ? LIMIT 1';
  
  try {
    const [results] = await db.execute(query, [phone]);
    
    if (results.length > 0) {
      console.log('👤 Usuario encontrado:', results[0].id);
      return results[0];
    }
    
    console.log('🚫 No se encontró usuario con teléfono:', phone);
    return null;
  } catch (error) {
    console.error('❌ Error en findUserByPhone:', error);
    throw error;
  }
};

// Función para guardar OTP (crear usuario temporal o actualizar OTP existente)
const saveOTP = async (phone, otp, expiresAt) => {
  console.log('💾 Guardando OTP para teléfono:', phone);
  console.log('🔢 OTP a guardar:', otp);
  console.log('⏰ Expira en:', expiresAt);
  console.log('🕐 Tiempo actual:', new Date());
  
  const query = `
    INSERT INTO users (phone, otp, otp_expires_at, phone_verified, created_at, updated_at) 
    VALUES (?, ?, ?, 0, NOW(), NOW())
    ON DUPLICATE KEY UPDATE 
      otp = VALUES(otp), 
      otp_expires_at = VALUES(otp_expires_at),
      updated_at = NOW()
  `;
  
  try {
    const [result] = await db.execute(query, [phone, otp, expiresAt]);
    console.log('✅ OTP guardado correctamente');
    
    // Verificar que se guardó correctamente
    const [check] = await db.execute(
      'SELECT otp, otp_expires_at, created_at FROM users WHERE phone = ?',
      [phone]
    );
    
    if (check.length > 0) {
      console.log('🔍 Verificación - OTP en BD:', check[0].otp);
      console.log('🔍 Verificación - Expira:', check[0].otp_expires_at);
      console.log('🔍 Verificación - Creado:', check[0].created_at);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error guardando OTP:', error);
    throw error;
  }
};

// Función para verificar OTP
const verifyOTP = async (phone, otp) => {
  console.log('🔐 Verificando OTP para teléfono:', phone);
  console.log('🔢 OTP ingresado:', otp);
  
  try {
    // Primero obtener los datos para debugging
    const [debugResults] = await db.execute(
      'SELECT otp, otp_expires_at, created_at FROM users WHERE phone = ? LIMIT 1',
      [phone]
    );
    
    if (debugResults.length === 0) {
      console.log('❌ Usuario no encontrado para teléfono:', phone);
      return false;
    }
    
    const userData = debugResults[0];
    const currentTime = new Date();
    const expiryTime = new Date(userData.otp_expires_at);
    
    console.log('🔢 OTP en BD:', userData.otp);
    console.log('⏰ Expira en BD:', userData.otp_expires_at);
    console.log('📅 Creado en BD:', userData.created_at);
    console.log('🕐 Tiempo actual:', currentTime);
    console.log('⌛ ¿Expirado?', currentTime > expiryTime);
    console.log('🔍 ¿OTP coincide?', userData.otp === otp);
    
    // Verificar si el OTP coincide
    if (userData.otp !== otp) {
      console.log('❌ OTP no coincide');
      return false;
    }
    
    // Verificar si no ha expirado
    if (currentTime > expiryTime) {
      console.log('❌ OTP expirado');
      return false;
    }
    
    console.log('✅ OTP válido y no expirado');
    return true;
    
  } catch (error) {
    console.error('❌ Error verificando OTP:', error);
    throw error;
  }
};

// Función para limpiar OTP después de verificación exitosa
const clearOTP = async (phone) => {
  console.log('🧹 Limpiando OTP para teléfono:', phone);
  
  const query = 'UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE phone = ?';
  
  try {
    const [result] = await db.execute(query, [phone]);
    console.log('✅ OTP limpiado exitosamente');
    return result;
  } catch (error) {
    console.error('❌ Error limpiando OTP:', error);
    throw error;
  }
};

// Función para verificar si cédula existe (excluyendo usuario específico)
const idCardExists = async (idCard, excludeUserId = null) => {
  console.log('🔍 Verificando cédula:', idCard);
  
  let query = 'SELECT 1 FROM users WHERE id_card = ?';
  const params = [idCard];
  
  if (excludeUserId) {
    query += ' AND id != ?';
    params.push(excludeUserId);
  }
  
  query += ' LIMIT 1';
  
  try {
    const [results] = await db.execute(query, params);
    const exists = results.length > 0;
    console.log('✅ Cédula existe:', exists);
    return exists;
  } catch (error) {
    console.error('❌ Error en idCardExists:', error);
    throw error;
  }
};

// Función para verificar si teléfono existe y está verificado
const phoneExists = async (phone) => {
  console.log('🔍 Verificando teléfono:', phone);
  
  const query = 'SELECT 1 FROM users WHERE phone = ? AND phone_verified = 1 LIMIT 1';
  
  try {
    const [results] = await db.execute(query, [phone]);
    const exists = results.length > 0;
    console.log('✅ Teléfono existe y verificado:', exists);
    return exists;
  } catch (error) {
    console.error('❌ Error en phoneExists:', error);
    throw error;
  }
};

// Función para verificar si teléfono o cédula ya existen
const checkDataExists = async (phone, idCard) => {
  console.log('🔍 Verificando teléfono y cédula...');
  
  const query = `
    SELECT 
      'phone' as type, id FROM users WHERE phone = ? AND phone_verified = 1
    UNION ALL
    SELECT 
      'idCard' as type, id FROM users WHERE id_card = ?
    LIMIT 2
  `;
  
  try {
    const [results] = await db.execute(query, [phone, idCard]);
    
    const phoneExists = results.some(r => r.type === 'phone');
    const idCardExists = results.some(r => r.type === 'idCard');
    
    console.log('✅ Resultados verificación:', { phoneExists, idCardExists });
    
    return {
      phone: phoneExists,
      idCard: idCardExists,
      any: phoneExists || idCardExists
    };
  } catch (error) {
    console.error('❌ Error en checkDataExists:', error);
    throw error;
  }
};

// Función para completar el registro del usuario - Simplificada para nueva estructura
const completeUserRegistration = async (phone, userData) => {
  console.log('🔄 Completando registro para teléfono:', phone);
  
  const connection = await db.getConnection();
  
  try {
    // Iniciar transacción
    await connection.beginTransaction();
    
    // Actualizar el registro con los datos del usuario
    const updateQuery = `
      UPDATE users SET 
        first_name = ?,
        last_name = ?,
        id_card = ?,
        provincia_id = ?,
        canton_id = ?,
        barrio_id = ?,
        latitud = ?,
        longitud = ?,
        phone_verified = 1,
        otp = NULL,
        otp_expires_at = NULL,
        updated_at = NOW()
      WHERE phone = ? AND otp IS NOT NULL
    `;
    
    const values = [
      userData.firstName,
      userData.lastName,
      userData.idCard,
      userData.provinciaId,
      userData.cantonId,
      userData.barrioId,
      userData.latitud,
      userData.longitud,
      phone
    ];
    
    console.log('📝 Ejecutando UPDATE para completar registro...');
    
    const [result] = await connection.execute(updateQuery, values);
    
    if (result.affectedRows === 0) {
      throw new Error('No se pudo completar el registro. Verifique que el OTP sea válido.');
    }
    
    console.log('✅ Registro completado, filas afectadas:', result.affectedRows);
    
    // Obtener el ID del usuario registrado
    const getUserQuery = 'SELECT id FROM users WHERE phone = ? LIMIT 1';
    const [userResult] = await connection.execute(getUserQuery, [phone]);
    
    const userId = userResult[0].id;
    
    // Commit de la transacción
    await connection.commit();
    
    console.log('🎉 Registro completado exitosamente para userId:', userId);
    
    return { 
      userId, 
      message: 'Usuario registrado correctamente' 
    };
    
  } catch (error) {
    console.error('❌ Error en completeUserRegistration:', error);
    
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('❌ Error en rollback:', rollbackError);
    }
    
    throw error;
  } finally {
    connection.release();
  }
};

// Función para obtener usuarios para CSV
const getUsersCSV = async () => {
  const query = `
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
  `;
  
  try {
    const [results] = await db.execute(query);
    return results;
  } catch (error) {
    console.error('Error en getUsersCSV:', error);
    throw error;
  }
};

async function registerManualUser(userData, tables) {
  const conn = await db.getConnection();
  try {
    await conn.query('START TRANSACTION');

    // Insertar usuario
    const [userResult] = await conn.query(
      `INSERT INTO users SET ?`, 
      {
        ...userData,
        phone_verified: 1,
        created_at: new Date(),
        updated_at: new Date()
      }
    );

    const userId = userResult.insertId;

    // Insertar tablas
    const tableValues = tables.map(tableCode => ({
      table_code: tableCode,
      user_id: userId,
      registro_manual: 1,
      created_at: new Date()
    }));

    await conn.query(
      'INSERT INTO bingo_tables (table_code, user_id, registro_manual, created_at) VALUES ?',
      [tableValues.map(t => [t.table_code, t.user_id, t.registro_manual, t.created_at])]
    );

    await conn.query('COMMIT');
    return { userId, tables: tableValues };

  } catch (error) {
    await conn.query('ROLLBACK');
    throw error;
  } finally {
    conn.release();
  }
}


module.exports = {
  findUserByPhone,
  saveOTP,
  verifyOTP,
  clearOTP,
  idCardExists,
  phoneExists,
  checkDataExists,
  completeUserRegistration,
  getUsersCSV,
  registerManualUser
};