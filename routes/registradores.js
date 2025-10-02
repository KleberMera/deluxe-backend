const express = require('express');
const router = express.Router();
const registradorController = require('../controllers/registradorController');

// Crear registrador
router.post('/create', registradorController.createRegistrador);

// Obtener lista de registradores
router.get('/list', registradorController.getRegistradores);
router.get('/dashboard-metrics', registradorController.getDashboardMetrics);

module.exports = router;
