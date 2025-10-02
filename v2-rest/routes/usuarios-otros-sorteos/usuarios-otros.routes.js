const express = require('express');
const router = express.Router();
const usuariosOtrosController = require('../../controllers/usuarios-otros-sorteos/usuarios-otros.controller');

// Rutas para usuarios y otros sorteos - V2



// POST /api/v2/usuarios-otros/register - Registrar nuevo usuario
router.post('/register', usuariosOtrosController.registerUser);

// GET /api/v2/usuarios-otros/user/:id_card - Buscar usuario por cédula
router.get('/user/:id_card', usuariosOtrosController.getUserByIdCard);

// GET /api/v2/usuarios-otros/users - Obtener todos los usuarios (con paginación)
router.get('/users', usuariosOtrosController.getAllUsers);

module.exports = router;