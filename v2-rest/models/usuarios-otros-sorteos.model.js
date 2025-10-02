const db = require('../../config/db');

const UsuariosOtrosSorteosModel = {
  // Crear un nuevo usuario en otros sorteos
  create: async (userData) => {
    const connection = await db.getConnection();
    try {
      const {
        first_name,
        last_name,
        id_card,
        phone,
        provincia_id,
        canton_id,
        barrio_id,
        latitud,
        longitud,
        ubicacion_detallada,
        id_registrador,
        id_evento
      } = userData;

      const query = `
        INSERT INTO usuarios_otros_sorteos (
          first_name, 
          last_name, 
          id_card, 
          phone, 
          provincia_id, 
          canton_id, 
          barrio_id, 
          latitud, 
          longitud, 
          ubicacion_detallada, 
          id_registrador, 
          id_evento,
          fecha_registro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const [result] = await connection.execute(query, [
        first_name,
        last_name,
        id_card,
        phone,
        provincia_id,
        canton_id,
        barrio_id,
        latitud,
        longitud,
        ubicacion_detallada,
        id_registrador,
        id_evento
      ]);

      return {
        success: true,
        id: result.insertId,
        message: 'Usuario registrado exitosamente en otros sorteos'
      };
    } catch (error) {
      console.error('Error al crear usuario en otros sorteos:', error);
      
      // Manejo específico de errores
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.message.includes('id_card')) {
          throw new Error('Ya existe un usuario registrado con esta cédula');
        }
      }
      
      throw new Error('Error al registrar usuario: ' + error.message);
    } finally {
      connection.release();
    }
  },

  // Buscar usuario por cédula
  findByIdCard: async (id_card) => {
    const connection = await db.getConnection();
    try {
      const query = `
        SELECT 
          u.*,
          p.nombre as provincia_nombre,
          c.nombre as canton_nombre,
          b.BARRIO as barrio_nombre,
          r.nombre_registrador
        FROM usuarios_otros_sorteos u
        LEFT JOIN provincias p ON u.provincia_id = p.id
        LEFT JOIN cantones c ON u.canton_id = c.id
        LEFT JOIN barrios b ON u.barrio_id = b.ID
        LEFT JOIN registrador r ON u.id_registrador = r.id
        WHERE u.id_card = ?
      `;

      const [rows] = await connection.execute(query, [id_card]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error al buscar usuario por cédula:', error);
      throw new Error('Error al buscar usuario');
    } finally {
      connection.release();
    }
  },

  // Obtener todos los usuarios con paginación
  getAll: async (page = 1, limit = 10) => {
    const connection = await db.getConnection();
    try {
      const offset = (page - 1) * limit;
      
      const countQuery = 'SELECT COUNT(*) as total FROM usuarios_otros_sorteos';
      const [countResult] = await connection.execute(countQuery);
      const total = countResult[0].total;

      const query = `
        SELECT 
          u.*,
          p.nombre as provincia_nombre,
          c.nombre as canton_nombre,
          b.BARRIO as barrio_nombre,
          r.nombre_registrador
        FROM usuarios_otros_sorteos u
        LEFT JOIN provincias p ON u.provincia_id = p.id
        LEFT JOIN cantones c ON u.canton_id = c.id
        LEFT JOIN barrios b ON u.barrio_id = b.ID
        LEFT JOIN registrador r ON u.id_registrador = r.id
        ORDER BY u.fecha_registro DESC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await connection.execute(query, [limit, offset]);
      
      return {
        users: rows,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_records: total,
          records_per_page: limit
        }
      };
    } catch (error) {
      console.error('Error al obtener usuarios:', error);
      throw new Error('Error al obtener usuarios');
    } finally {
      connection.release();
    }
  },

  // Obtener brigada activa
  getActiveBrigada: async () => {
    const connection = await db.getConnection();
    try {
      const query = `
        SELECT 
          id_brigada,
          nombre_brigada,
          activa,
          max_tables_per_person,
          fecha_creacion
        FROM brigadas 
        WHERE activa = 1 
        ORDER BY fecha_creacion DESC 
        LIMIT 1
      `;

      const [rows] = await connection.execute(query);
      return rows[0] || null;
    } catch (error) {
      console.error('Error al obtener brigada activa:', error);
      throw new Error('Error al obtener brigada activa');
    } finally {
      connection.release();
    }
  }
};

module.exports = UsuariosOtrosSorteosModel;