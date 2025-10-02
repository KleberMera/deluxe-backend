const db = require('../../config/db');

const TipoRegistradorModel = {
  // Crear un nuevo tipo de registrador
  create: async (tipoData) => {
    const connection = await db.getConnection();
    try {
      const {
        nombre_tipo,
        descripcion
      } = tipoData;

      const query = `
        INSERT INTO tipos_registradores (
          nombre_tipo, 
          descripcion,
          created_at
        ) VALUES (?, ?, NOW())
      `;

      const [result] = await connection.execute(query, [
        nombre_tipo,
        descripcion
      ]);

      return {
        success: true,
        id: result.insertId,
        message: 'Tipo de registrador creado exitosamente'
      };
    } catch (error) {
      console.error('Error al crear tipo de registrador:', error);
      
      // Manejo específico de errores
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.message.includes('nombre_tipo')) {
          throw new Error('Ya existe un tipo de registrador con ese nombre');
        }
      }
      
      throw new Error('Error al crear tipo de registrador: ' + error.message);
    } finally {
      connection.release();
    }
  },

  // Obtener todos los tipos de registradores
  getAll: async (includeInactive = false) => {
    const connection = await db.getConnection();
    try {
      let query = `
        SELECT 
          id,
          nombre_tipo,
          descripcion,
          activo,
          created_at,
          updated_at
        FROM tipos_registradores
      `;
      
      if (!includeInactive) {
        query += ' WHERE activo = 1';
      }
      
      query += ' ORDER BY nombre_tipo ASC';

      const [rows] = await connection.execute(query);
      
      return rows;
    } catch (error) {
      console.error('Error al obtener tipos de registradores:', error);
      throw new Error('Error al obtener tipos de registradores');
    } finally {
      connection.release();
    }
  },

  // Buscar tipo por ID
  findById: async (id) => {
    const connection = await db.getConnection();
    try {
      const query = `
        SELECT 
          id,
          nombre_tipo,
          descripcion,
          activo,
          created_at,
          updated_at
        FROM tipos_registradores
        WHERE id = ?
      `;

      const [rows] = await connection.execute(query, [id]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error al buscar tipo por ID:', error);
      throw new Error('Error al buscar tipo de registrador');
    } finally {
      connection.release();
    }
  },

  // Actualizar tipo de registrador
  update: async (id, tipoData) => {
    const connection = await db.getConnection();
    try {
      const {
        nombre_tipo,
        descripcion,
        activo
      } = tipoData;

      const query = `
        UPDATE tipos_registradores 
        SET nombre_tipo = ?, descripcion = ?, activo = ?, updated_at = NOW()
        WHERE id = ?
      `;

      const [result] = await connection.execute(query, [
        nombre_tipo,
        descripcion,
        activo,
        id
      ]);

      if (result.affectedRows === 0) {
        throw new Error('Tipo de registrador no encontrado');
      }

      return {
        success: true,
        message: 'Tipo de registrador actualizado exitosamente'
      };
    } catch (error) {
      console.error('Error al actualizar tipo de registrador:', error);
      throw new Error('Error al actualizar tipo de registrador: ' + error.message);
    } finally {
      connection.release();
    }
  },

  // Desactivar tipo de registrador (soft delete)
  deactivate: async (id) => {
    const connection = await db.getConnection();
    try {
      const query = `
        UPDATE tipos_registradores 
        SET activo = 0, updated_at = NOW()
        WHERE id = ?
      `;

      const [result] = await connection.execute(query, [id]);

      if (result.affectedRows === 0) {
        throw new Error('Tipo de registrador no encontrado');
      }

      return {
        success: true,
        message: 'Tipo de registrador desactivado exitosamente'
      };
    } catch (error) {
      console.error('Error al desactivar tipo de registrador:', error);
      throw new Error('Error al desactivar tipo de registrador');
    } finally {
      connection.release();
    }
  }
};

module.exports = TipoRegistradorModel;