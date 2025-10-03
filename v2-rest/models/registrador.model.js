const db = require('../../config/db');

const RegistradorModel = {
  // Crear un nuevo registrador
  create: async (registradorData) => {
    const connection = await db.getConnection();
    try {
      const {
        nombre_registrador,
        id_tipo_registrador
      } = registradorData;

      const query = `
        INSERT INTO registrador (
          nombre_registrador, 
          id_tipo_registrador
        ) VALUES (?, ?)
      `;

      const [result] = await connection.execute(query, [
        nombre_registrador,
        id_tipo_registrador || null
      ]);

      return {
        success: true,
        id: result.insertId,
        message: 'Registrador creado exitosamente'
      };
    } catch (error) {
      console.error('Error al crear registrador:', error);
      throw new Error('Error al crear registrador: ' + error.message);
    } finally {
      connection.release();
    }
  },

  // Obtener todos los registradores
  getAll: async (page = 1, limit = 20) => {
    const connection = await db.getConnection();
    try {
      const offset = (page - 1) * limit;
      
      const countQuery = 'SELECT COUNT(*) as total FROM registrador';
      const [countResult] = await connection.execute(countQuery);
      const total = countResult[0].total;

      const query = `
        SELECT 
          r.id,
          r.nombre_registrador,
          r.id_tipo_registrador,
          tr.nombre_tipo as tipo_nombre,
          tr.descripcion as tipo_descripcion
        FROM registrador r
        LEFT JOIN tipos_registradores tr ON r.id_tipo_registrador = tr.id
        ORDER BY r.nombre_registrador ASC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await connection.execute(query, [limit, offset]);
      
      return {
        registradores: rows,
        pagination: {
          current_page: page,
          total_pages: Math.ceil(total / limit),
          total_records: total,
          records_per_page: limit
        }
      };
    } catch (error) {
      console.error('Error al obtener registradores:', error);
      throw new Error('Error al obtener registradores');
    } finally {
      connection.release();
    }
  },

  // Buscar registrador por ID
  findById: async (id) => {
    const connection = await db.getConnection();
    try {
      const query = `
        SELECT 
          r.id,
          r.nombre_registrador,
          r.id_tipo_registrador,
          tr.nombre_tipo as tipo_nombre,
          tr.descripcion as tipo_descripcion,
          tr.activo as tipo_activo
        FROM registrador r
        LEFT JOIN tipos_registradores tr ON r.id_tipo_registrador = tr.id
        WHERE r.id = ?
      `;

      const [rows] = await connection.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error al buscar registrador por ID:', error);
      throw new Error('Error al buscar registrador');
    } finally {
      connection.release();
    }
  },

  // Buscar registradores por tipo
  findByTipo: async (id_tipo_registrador) => {
    const connection = await db.getConnection();
    try {
      const query = `
        SELECT 
          r.id,
          r.nombre_registrador,
          r.id_tipo_registrador,
          tr.nombre_tipo as tipo_nombre,
          tr.descripcion as tipo_descripcion
        FROM registrador r
        INNER JOIN tipos_registradores tr ON r.id_tipo_registrador = tr.id
        WHERE r.id_tipo_registrador = ? AND tr.activo = 1
        ORDER BY r.nombre_registrador ASC
      `;

      const [rows] = await connection.execute(query, [id_tipo_registrador]);
      return rows;
    } catch (error) {
      console.error('Error al buscar registradores por tipo:', error);
      throw new Error('Error al buscar registradores por tipo');
    } finally {
      connection.release();
    }
  },

  // Actualizar registrador
  update: async (id, registradorData) => {
    const connection = await db.getConnection();
    try {
      const {
        nombre_registrador,
        id_tipo_registrador
      } = registradorData;

      const query = `
        UPDATE registrador 
        SET nombre_registrador = ?, id_tipo_registrador = ?
        WHERE id = ?
      `;

      const [result] = await connection.execute(query, [
        nombre_registrador,
        id_tipo_registrador || null,
        id
      ]);

      if (result.affectedRows === 0) {
        throw new Error('Registrador no encontrado');
      }

      return {
        success: true,
        message: 'Registrador actualizado exitosamente'
      };
    } catch (error) {
      console.error('Error al actualizar registrador:', error);
      throw new Error('Error al actualizar registrador: ' + error.message);
    } finally {
      connection.release();
    }
  },

  // Obtener estadísticas de registradores
  getStats: async () => {
    const connection = await db.getConnection();
    try {
      const query = `
        SELECT 
          COUNT(*) as total_registradores,
          COUNT(r.id_tipo_registrador) as con_tipo,
          COUNT(*) - COUNT(r.id_tipo_registrador) as sin_tipo,
          (
            SELECT COUNT(*) 
            FROM tipos_registradores 
            WHERE activo = 1
          ) as tipos_activos
        FROM registrador r
      `;

      const [rows] = await connection.execute(query);
      return rows[0];
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      throw new Error('Error al obtener estadísticas');
    } finally {
      connection.release();
    }
  },

  // Obtener registradores con tipo solo cuando hay brigadas activas
  getRegistradoresConTipoActivos: async () => {
    const connection = await db.getConnection();
    try {
      // Primero verificar si hay brigadas activas
      const brigadaQuery = `
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

      const [brigadaRows] = await connection.execute(brigadaQuery);
      const brigadaActiva = brigadaRows[0] || null;
      
      if (!brigadaActiva) {
        return {
          success: false,
          message: 'No hay brigadas activas disponibles',
          data: []
        };
      }

      const query = `
        SELECT 
          r.id,
          r.nombre_registrador,
          r.id_tipo_registrador,
          tr.nombre_tipo,
          tr.descripcion as tipo_descripcion,
          tr.activo as tipo_activo
        FROM registrador r
        INNER JOIN tipos_registradores tr ON r.id_tipo_registrador = tr.id
        WHERE tr.activo = 1
        ORDER BY r.nombre_registrador ASC
      `;

      const [rows] = await connection.execute(query);
      
      return {
        success: true,
        message: 'Registradores obtenidos exitosamente',
        data: rows,
        brigadaInfo: {
          id_evento: brigadaActiva.id_brigada,
          nombre_brigada: brigadaActiva.nombre_brigada,
          activa: brigadaActiva.activa
        }
      };
    } catch (error) {
      console.error('Error al obtener registradores con tipo activos:', error);
      throw new Error('Error al obtener registradores con tipo activos');
    } finally {
      connection.release();
    }
  }
};

module.exports = RegistradorModel;