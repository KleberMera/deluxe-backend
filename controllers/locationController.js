const locationModel = require('../models/locationModel');

// Obtener todos los cantones
exports.getCantones = async (req, res) => {
  try {
    const cantones = await locationModel.getCantones();
    res.json(cantones);
  } catch (error) {
    console.error('Error al obtener cantones:', error);
    res.status(500).json({ error: 'Error al obtener cantones' });
  }
};

// Obtener parroquias de un cantón
exports.getParroquias = async (req, res) => {
  try {
    const { canton } = req.params;
    const parroquias = await locationModel.getParroquias(canton);
    res.json(parroquias);
  } catch (error) {
    console.error('Error al obtener parroquias:', error);
    res.status(500).json({ error: 'Error al obtener parroquias' });
  }
};

// Obtener recintos de una parroquia
exports.getRecintos = async (req, res) => {
  try {
    const { canton, parroquia } = req.params;
    const recintos = await locationModel.getRecintos(canton, parroquia);
    res.json(recintos);
  } catch (error) {
    console.error('Error al obtener recintos:', error);
    res.status(500).json({ error: 'Error al obtener recintos' });
  }
};

// Obtener juntas/mesas de un recinto
exports.getJuntas = async (req, res) => {
  try {
    const { canton, parroquia, recinto } = req.params;
    const juntas = await locationModel.getJuntas(canton, parroquia, recinto);
    res.json(juntas);
  } catch (error) {
    console.error('Error al obtener juntas:', error);
    res.status(500).json({ error: 'Error al obtener juntas' });
  }
};