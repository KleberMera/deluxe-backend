const express = require('express');
const router = express.Router();
const brigadaController = require('../controllers/brigadaController');

// Crear brigada
router.post('/create', brigadaController.createBrigada);

module.exports = router;
