const express = require('express');
const router = express.Router();
const tipoRegistradorController = require('../../controllers/tipo-registrador/tipo-registrador.controller');

// Rutas para tipos de registradores - V2

// POST /api/v2/tipos-registradores - Crear nuevo tipo de registrador
router.post('/', tipoRegistradorController.createTipo);

// GET /api/v2/tipos-registradores - Obtener todos los tipos de registradores
router.get('/', tipoRegistradorController.getAllTipos);

// GET /api/v2/tipos-registradores/:id - Obtener tipo de registrador por ID
router.get('/:id', tipoRegistradorController.getTipoById);

// PUT /api/v2/tipos-registradores/:id - Actualizar tipo de registrador
router.put('/:id', tipoRegistradorController.updateTipo);

// DELETE /api/v2/tipos-registradores/:id - Desactivar tipo de registrador
router.delete('/:id', tipoRegistradorController.deactivateTipo);

module.exports = router;