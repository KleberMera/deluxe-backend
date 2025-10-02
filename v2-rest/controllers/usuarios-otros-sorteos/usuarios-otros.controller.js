// Controlador para usuarios y otros sorteos - V2
const UsuariosOtrosSorteosModel = require('../../models/usuarios-otros-sorteos.model');

const usuariosOtrosController = {
  // Registrar un nuevo usuario en otros sorteos
  registerUser: async (req, res) => {
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
      } = req.body;

      // Validaciones básicas
      if (!first_name || !last_name || !id_card) {
        return res.status(400).json({
          success: false,
          message: 'Los campos nombre, apellido y cédula son obligatorios'
        });
      }

      // Validar formato de cédula (10 dígitos)
      if (!/^\d{10}$/.test(id_card)) {
        return res.status(400).json({
          success: false,
          message: 'La cédula debe tener exactamente 10 dígitos'
        });
      }

      // Verificar si ya existe un usuario con esa cédula
      const existingUser = await UsuariosOtrosSorteosModel.findByIdCard(id_card);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un usuario registrado con esta cédula',
          user: {
            id: existingUser.id,
            first_name: existingUser.first_name,
            last_name: existingUser.last_name,
            fecha_registro: existingUser.fecha_registro
          }
        });
      }

      // Crear el usuario
      const result = await UsuariosOtrosSorteosModel.create({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        id_card: id_card.trim(),
        phone: phone?.trim(),
        provincia_id: provincia_id || null,
        canton_id: canton_id || null,
        barrio_id: barrio_id || null,
        latitud: latitud || null,
        longitud: longitud || null,
        ubicacion_detallada: ubicacion_detallada?.trim(),
        id_registrador: id_registrador || null,
        id_evento: id_evento || null
      });

      res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente en otros sorteos',
        data: {
          id: result.id,
          first_name,
          last_name,
          id_card,
          fecha_registro: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error en registerUser:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error interno del servidor'
      });
    }
  },

  // Buscar usuario por cédula
  getUserByIdCard: async (req, res) => {
    try {
      const { id_card } = req.params;

      if (!id_card || !/^\d{10}$/.test(id_card)) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar una cédula válida de 10 dígitos'
        });
      }

      const user = await UsuariosOtrosSorteosModel.findByIdCard(id_card);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }

      res.status(200).json({
        success: true,
        data: user
      });

    } catch (error) {
      console.error('Error en getUserByIdCard:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener todos los usuarios con paginación
  getAllUsers: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros de paginación inválidos. Página >= 1, límite entre 1-100'
        });
      }

      const result = await UsuariosOtrosSorteosModel.getAll(page, limit);

      res.status(200).json({
        success: true,
        data: result.users,
        pagination: result.pagination
      });

    } catch (error) {
      console.error('Error en getAllUsers:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Verificar si un usuario existe por cédula con brigada activa
  checkUserExistsByIdCard: async (req, res) => {
    try {
      const { id_card } = req.params;

      if (!id_card || !/^\d{10}$/.test(id_card)) {
        return res.status(400).json({
          success: false,
          message: 'Debe proporcionar una cédula válida de 10 dígitos',
          data: null,
          exists: false,
          brigadaInfo: null
        });
      }

      // Verificar si hay brigadas activas
      const activeBrigada = await UsuariosOtrosSorteosModel.getActiveBrigada();
      
      console.log(activeBrigada);
      
      if (!activeBrigada) {
        return res.status(400).json({
          success: false,
          message: 'No hay brigadas activas disponibles',
          data: null,
          exists: false,
          brigadaInfo: null
        });
      }

      // Buscar usuario por cédula
      const user = await UsuariosOtrosSorteosModel.findByIdCard(id_card);

      const response = {
        success: true,
        message: user ? 'Usuario encontrado' : 'Usuario no encontrado',
        data: user || null,
        exists: !!user,
        brigadaInfo: {
          id_evento: activeBrigada.id_brigada,
          nombre_brigada: activeBrigada.nombre_brigada,
          activa: activeBrigada.activa
        }
      };

      res.status(200).json(response);

    } catch (error) {
      console.error('Error en checkUserExistsByIdCard:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        data: null,
        exists: false,
        brigadaInfo: null
      });
    }
  }
};

module.exports = usuariosOtrosController;