const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

// Rutas para cantones, parroquias, recintos y juntas
router.get('/cantones', locationController.getCantones);
router.get('/parroquias/:canton', locationController.getParroquias);
router.get('/recintos/:canton/:parroquia', locationController.getRecintos);
router.get('/juntas/:canton/:parroquia/:recinto', locationController.getJuntas);

module.exports = router;