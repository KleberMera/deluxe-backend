const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationNewController');

// Rutas existentes...
router.get('/provincias', locationController.getProvincias);
router.get('/provincias/:provinciaId/cantones', locationController.getCantonesByProvincia);
router.get('/cantones/:cantonId/barrios', locationController.getBarriosByCanton);

// Nuevas rutas para el sistema electoral
router.get('/cantones/:cantonNombre/parroquias', locationController.getParroquiasByCanton);
router.get('/recintos/:cantonNombre/:parroquiaNombre', locationController.getRecintosByCantonParroquia);

module.exports = router;