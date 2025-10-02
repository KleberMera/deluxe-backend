// Controlador para usuarios y otros sorteos - V2
const usuariosOtrosController = {
  // Endpoint de prueba simple
  testMessage: (req, res) => {
    try {
      const message = {
        success: true,
        message: "¡Hola desde la API v2! 🚀",
        version: "2.0",
        timestamp: new Date().toISOString(),
        feature: "usuarios-otros-sorteos",
        status: "funcionando correctamente"
      };
      
      res.status(200).json(message);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error en el endpoint de prueba",
        error: error.message
      });
    }
  },

  // Endpoint para obtener información del módulo
  getModuleInfo: (req, res) => {
    try {
      const info = {
        success: true,
        module: "usuarios-otros-sorteos",
        version: "2.0",
        description: "Módulo para gestión de usuarios y otros tipos de sorteos",
        endpoints: [
          "GET /api/v2/usuarios-otros/test - Mensaje de prueba",
          "GET /api/v2/usuarios-otros/info - Información del módulo"
        ],
        author: "Equipo Deluxe Backend",
        lastUpdate: new Date().toISOString()
      };
      
      res.status(200).json(info);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error al obtener información del módulo",
        error: error.message
      });
    }
  }
};

module.exports = usuariosOtrosController;