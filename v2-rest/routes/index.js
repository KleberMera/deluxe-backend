const express = require('express');
const router = express.Router();

// Importar rutas de los módulos v2
const usuariosOtrosRoutes = require('./usuarios-otros-sorteos/usuarios-otros.routes');
const registradoresRoutes = require('./registradores/registradores.routes');
const tiposRegistradoresRoutes = require('./tipo-registrador/tipo-registrador.routes');
const locationsRoutes = require('./locations/locations.routes');

// Configurar rutas v2
router.use('/usuarios-otros', usuariosOtrosRoutes);
router.use('/registradores', registradoresRoutes);
router.use('/tipos-registradores', tiposRegistradoresRoutes);
router.use('/locationNew', locationsRoutes);

// Ruta de información general de la API v2
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: "API Deluxe Backend v2.0",
    version: "2.0",
    timestamp: new Date().toISOString(),
    availableModules: [
      {
        name: "usuarios-otros-sorteos",
        basePath: "/api/v2/usuarios-otros",
        description: "Gestión de usuarios y otros tipos de sorteos"
      },
      {
        name: "registradores",
        basePath: "/api/v2/registradores",
        description: "Gestión de registradores y sus funcionalidades"
      },
      {
        name: "tipos-registradores",
        basePath: "/api/v2/tipos-registradores",
        description: "Gestión de tipos de registradores y categorías"
      },
      {
        name: "locations",
        basePath: "/api/v2/locations",
        description: "Gestión de ubicaciones geográficas (provincias, cantones, barrios, parroquias, recintos)"
      }
    ],
    documentation: "Endpoints disponibles para la nueva versión de la API"
  });
});

module.exports = router;