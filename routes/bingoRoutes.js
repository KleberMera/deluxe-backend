const express = require('express');
const router = express.Router();
const adminBingoController = require('../controllers/adminBingoController');

// Rutas para el dashboard de administración de Bingo
router.get('/status', adminBingoController.getBingoStatus);
router.get('/stats', adminBingoController.getBingoStats);
router.get('/search', adminBingoController.searchBingoTables);
router.get('/recent-data', adminBingoController.getRecentBingoTables);
router.get('/table-range-by-date', adminBingoController.getTableRangeByDate);

module.exports = router;