const express = require('express');
const router = express.Router();
const usuariosOtrosController = require('../../controllers/usuarios-otros-sorteos/usuarios-otros.controller');

// Rutas para usuarios y otros sorteos - V2

// GET /api/v2/usuarios-otros/test - Endpoint de prueba
router.get('/test', usuariosOtrosController.testMessage);

// GET /api/v2/usuarios-otros/info - Información del módulo
router.get('/info', usuariosOtrosController.getModuleInfo);

module.exports = router;