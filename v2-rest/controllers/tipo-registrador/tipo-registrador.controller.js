// Controlador para tipos de registradores - V2
const TipoRegistradorModel = require('../../models/tipo-registrador.model');

const tipoRegistradorController = {
  // Crear nuevo tipo de registrador
  createTipo: async (req, res) => {
    try {
      const {
        nombre_tipo,
        descripcion
      } = req.body;

      // Validaciones básicas
      if (!nombre_tipo || nombre_tipo.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del tipo de registrador es obligatorio'
        });
      }

      if (nombre_tipo.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del tipo no puede exceder 100 caracteres'
        });
      }

      // Crear el tipo
      const result = await TipoRegistradorModel.create({
        nombre_tipo: nombre_tipo.trim(),
        descripcion: descripcion?.trim() || null
      });

      res.status(201).json({
        success: true,
        message: 'Tipo de registrador creado exitosamente',
        data: {
          id: result.id,
          nombre_tipo,
          descripcion
        }
      });

    } catch (error) {
      console.error('Error en createTipo:', error);
      
      if (error.message.includes('Ya existe un tipo')) {
        return res.status(409).json({
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

  // Obtener todos los tipos de registradores
  getAllTipos: async (req, res) => {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      
      const tipos = await TipoRegistradorModel.getAll(includeInactive);

      res.status(200).json({
        success: true,
        data: tipos,
        total: tipos.length
      });

    } catch (error) {
      console.error('Error en getAllTipos:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener tipo por ID
  getTipoById: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID de tipo de registrador inválido'
        });
      }

      const tipo = await TipoRegistradorModel.findById(parseInt(id));

      if (!tipo) {
        return res.status(404).json({
          success: false,
          message: 'Tipo de registrador no encontrado'
        });
      }

      res.status(200).json({
        success: true,
        data: tipo
      });

    } catch (error) {
      console.error('Error en getTipoById:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Actualizar tipo de registrador
  updateTipo: async (req, res) => {
    try {
      const { id } = req.params;
      const {
        nombre_tipo,
        descripcion,
        activo
      } = req.body;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID de tipo de registrador inválido'
        });
      }

      // Validaciones
      if (!nombre_tipo || nombre_tipo.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El nombre del tipo de registrador es obligatorio'
        });
      }

      if (activo !== undefined && typeof activo !== 'boolean' && activo !== 0 && activo !== 1) {
        return res.status(400).json({
          success: false,
          message: 'El campo activo debe ser true, false, 0 o 1'
        });
      }

      const result = await TipoRegistradorModel.update(parseInt(id), {
        nombre_tipo: nombre_tipo.trim(),
        descripcion: descripcion?.trim() || null,
        activo: activo !== undefined ? (activo === true || activo === 1 ? 1 : 0) : 1
      });

      res.status(200).json({
        success: true,
        message: 'Tipo de registrador actualizado exitosamente'
      });

    } catch (error) {
      console.error('Error en updateTipo:', error);
      
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

  // Desactivar tipo de registrador
  deactivateTipo: async (req, res) => {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
          success: false,
          message: 'ID de tipo de registrador inválido'
        });
      }

      const result = await TipoRegistradorModel.deactivate(parseInt(id));

      res.status(200).json({
        success: true,
        message: 'Tipo de registrador desactivado exitosamente'
      });

    } catch (error) {
      console.error('Error en deactivateTipo:', error);
      
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};

module.exports = tipoRegistradorController;