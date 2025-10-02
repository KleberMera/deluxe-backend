const locationModel = require('../models/locationNewModel');

// Obtener todas las provincias
exports.getProvincias = async (req, res) => {
  try {
    const provincias = await locationModel.getProvincias();
    res.status(200).json({
      success: true,
      data: provincias
    });
  } catch (error) {
    console.error('Error al obtener provincias:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener las provincias' 
    });
  }
};

// Obtener cantones por provincia
exports.getCantonesByProvincia = async (req, res) => {
  try {
    const { provinciaId } = req.params;
    const cantones = await locationModel.getCantonesByProvincia(provinciaId);
    
    if (!cantones || cantones.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron cantones para esta provincia'
      });
    }
    
    res.status(200).json({
      success: true,
      data: cantones
    });
  } catch (error) {
    console.error('Error al obtener cantones:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener los cantones' 
    });
  }
};

// Obtener barrios por cantón
exports.getBarriosByCanton = async (req, res) => {
  try {
    const { cantonId } = req.params;
    const barrios = await locationModel.getBarriosByCanton(cantonId);
    
    if (!barrios || barrios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron barrios para este cantón'
      });
    }
    
    res.status(200).json({
      success: true,
      data: barrios
    });
  } catch (error) {
    console.error('Error al obtener barrios:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener los barrios' 
    });
  }
};

exports.getParroquiasByCanton = async (req, res) => {
  try {
    const { cantonNombre } = req.params;
    const parroquias = await locationModel.getParroquiasByCanton(cantonNombre);
    
    res.status(200).json({
      success: true,
      data: parroquias
    });
  } catch (error) {
    console.error('Error al obtener parroquias:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener las parroquias' 
    });
  }
};

// Obtener recintos por cantón y parroquia
exports.getRecintosByCantonParroquia = async (req, res) => {
  try {
    const { cantonNombre, parroquiaNombre } = req.params;
    const recintos = await locationModel.getRecintosByCantonParroquia(cantonNombre, parroquiaNombre);
    
    res.status(200).json({
      success: true,
      data: recintos
    });
  } catch (error) {
    console.error('Error al obtener recintos:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener los recintos' 
    });
  }
};


// Obtener barrios por provincia
exports.getBarriosByProvincia = async (req, res) => {
  try {
    const { provinciaId } = req.params;
    const barrios = await locationModel.getBarriosByProvincia(provinciaId);
    
    if (!barrios || barrios.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron barrios para esta provincia'
      });
    }
    
    res.status(200).json({
      success: true,
      data: barrios
    });
  } catch (error) {
    console.error('Error al obtener barrios:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener los barrios' 
    });
  }
};