const express = require('express');
const router = express.Router();

// Importar controlador v1 para reutilizar funcionalidades de ubicaciones
const locationControllerV1 = require('../../../controllers/locationNewController');

// Rutas para ubicaciones - V2 (reutilizando funcionalidad v1)

// GET /api/v2/locations/provincias - Obtener todas las provincias
router.get('/provincias', locationControllerV1.getProvincias);

// GET /api/v2/locations/provincias/:provinciaId/cantones - Obtener cantones por provincia
router.get('/provincias/:provinciaId/cantones', locationControllerV1.getCantonesByProvincia);

// GET /api/v2/locations/cantones/:cantonId/barrios - Obtener barrios por cantón
router.get('/cantones/:cantonId/barrios', locationControllerV1.getBarriosByCanton);

// GET /api/v2/locations/cantones/:cantonNombre/parroquias - Obtener parroquias por cantón (por nombre)
router.get('/cantones/:cantonNombre/parroquias', locationControllerV1.getParroquiasByCanton);

// GET /api/v2/locations/recintos/:cantonNombre/:parroquiaNombre - Obtener recintos por cantón y parroquia
router.get('/recintos/:cantonNombre/:parroquiaNombre', locationControllerV1.getRecintosByCantonParroquia);

// GET /api/v2/locations/provincias/:provinciaId/barrios - Obtener barrios por provincia
router.get('/provincias/:provinciaId/barrios', locationControllerV1.getBarriosByProvincia);

module.exports = router;