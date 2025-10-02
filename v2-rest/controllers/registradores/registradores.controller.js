// Controlador para registradores - V2
const RegistradorModel = require('../../models/registrador.model');

const registradorController = {
  // Crear nuevo registrador
  createRegistrador: async (req, res) => {
    try {
      const {
        nombre_registrador,
        id_tipo_registrador
      } = req.body;

      // Validaciones básicas
      if (!nombre_registrador || nombre_registrador.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del registrador es obligatorio'
        });
      }

      if (nombre_registrador.length > 250) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del registrador no puede exceder 250 caracteres'
        });
      }

      if (id_tipo_registrador && isNaN(parseInt(id_tipo_registrador))) {
        return res.status(400).json({
          success: false,
          message: 'El ID del tipo de registrador debe ser un número válido'
        });
      }

      // Crear el registrador
      const result = await RegistradorModel.create({
        nombre_registrador: nombre_registrador.trim(),
        id_tipo_registrador: id_tipo_registrador ? parseInt(id_tipo_registrador) : null
      });

      res.status(201).json({
        success: true,
        message: 'Registrador creado exitosamente',
        data: {
          id: result.id,
          nombre_registrador,
          id_tipo_registrador: id_tipo_registrador || null
        }
      });

    } catch (error) {
      console.error('Error en createRegistrador:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  },

  // Obtener todos los registradores con paginación
  getAllRegistradores: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros de paginación inválidos. Página >= 1, límite entre 1-100'
        });
      }

      const result = await RegistradorModel.getAll(page, limit);

      res.status(200).json({
        success: true,
        data: result.registradores,
        pagination: result.pagination
      });

    } catch (error) {
      console.error('Error en getAllRegistradores:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener registrador por ID
  getRegistradorById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID de registrador inválido'
        });
      }

      const registrador = await RegistradorModel.findById(parseInt(id));

      if (!registrador) {
        return res.status(404).json({
          success: false,
          message: 'Registrador no encontrado'
        });
      }

      res.status(200).json({
        success: true,
        data: registrador
      });

    } catch (error) {
      console.error('Error en getRegistradorById:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener registradores por tipo
  getRegistradoresByTipo: async (req, res) => {
    try {
      const { id_tipo } = req.params;

      if (!id_tipo || isNaN(parseInt(id_tipo))) {
        return res.status(400).json({
          success: false,
          message: 'ID de tipo de registrador inválido'
        });
      }

      const registradores = await RegistradorModel.findByTipo(parseInt(id_tipo));

      res.status(200).json({
        success: true,
        data: registradores,
        total: registradores.length
      });

    } catch (error) {
      console.error('Error en getRegistradoresByTipo:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Actualizar registrador
  updateRegistrador: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        nombre_registrador,
        id_tipo_registrador
      } = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID de registrador inválido'
        });
      }

      // Validaciones
      if (!nombre_registrador || nombre_registrador.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del registrador es obligatorio'
        });
      }

      if (nombre_registrador.length > 250) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del registrador no puede exceder 250 caracteres'
        });
      }

      if (id_tipo_registrador && isNaN(parseInt(id_tipo_registrador))) {
        return res.status(400).json({
          success: false,
          message: 'El ID del tipo de registrador debe ser un número válido'
        });
      }

      const result = await RegistradorModel.update(parseInt(id), {
        nombre_registrador: nombre_registrador.trim(),
        id_tipo_registrador: id_tipo_registrador ? parseInt(id_tipo_registrador) : null
      });

      res.status(200).json({
        success: true,
        message: 'Registrador actualizado exitosamente'
      });

    } catch (error) {
      console.error('Error en updateRegistrador:', error);
      
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  },

  // Obtener estadísticas de registradores
  getStats: async (req, res) => {
    try {
      const stats = await RegistradorModel.getStats();

      res.status(200).json({
        success: true,
        data: {
          total_registradores: stats.total_registradores,
          registradores_con_tipo: stats.con_tipo,
          registradores_sin_tipo: stats.sin_tipo,
          tipos_registradores_activos: stats.tipos_activos,
          porcentaje_con_tipo: stats.total_registradores > 0 
            ? Math.round((stats.con_tipo / stats.total_registradores) * 100) 
            : 0
        }
      });

    } catch (error) {
      console.error('Error en getStats:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = registradorController;