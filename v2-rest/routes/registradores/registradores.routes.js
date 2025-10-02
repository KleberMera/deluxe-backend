const express = require('express');
const router = express.Router();
const registradorController = require('../../controllers/registradores/registradores.controller');

// Rutas para registradores - V2

// POST /api/v2/registradores - Crear nuevo registrador
router.post('/', registradorController.createRegistrador);

// GET /api/v2/registradores - Obtener todos los registradores (con paginación)
router.get('/', registradorController.getAllRegistradores);

// GET /api/v2/registradores/stats - Obtener estadísticas de registradores
router.get('/stats', registradorController.getStats);

// GET /api/v2/registradores/:id - Obtener registrador por ID
router.get('/:id', registradorController.getRegistradorById);

// GET /api/v2/registradores/tipo/:id_tipo - Obtener registradores por tipo
router.get('/tipo/:id_tipo', registradorController.getRegistradoresByTipo);

// PUT /api/v2/registradores/:id - Actualizar registrador
router.put('/:id', registradorController.updateRegistrador);

module.exports = router;