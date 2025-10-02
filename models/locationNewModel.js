const db = require('../config/db'); // Asegúrate de que este cliente sea el de mysql2/promise

// Modelo para Provincias
const getProvincias = async () => {
  const [results] = await db.query('SELECT id, nombre FROM provincias ORDER BY nombre');
  return results;
};

const getRecintosByCantonParroquia = async (canton, parroquia) => {
  const [results] = await db.query(
    'SELECT DISTINCT recintos FROM juntas_aux WHERE canton = ? AND parroquia = ? ORDER BY recintos',
    [canton, parroquia]
  );
  return results
    .map(item => item.recintos)
    .filter(nombre => nombre && nombre.trim() !== '');
};

const getParroquiasByCanton = async (canton) => {
  const [results] = await db.query(
    'SELECT DISTINCT parroquia FROM juntas_aux WHERE canton = ? ORDER BY parroquia',
    [canton]
  );
  return results.map(item => item.parroquia);
};

const getCantonesByProvincia = async (provinciaId) => {
  const [results] = await db.query(
    'SELECT id, nombre FROM cantones WHERE provincia_id = ? ORDER BY nombre',
    [provinciaId]
  );
  return results;
};

const getBarriosByCanton = async (cantonId) => {
  const [results] = await db.query(
    'SELECT ID as id, BARRIO as nombre FROM barrios WHERE canton_id = ? ORDER BY BARRIO',
    [cantonId]
  );
  return results;
};

const getBarriosByProvincia = async (provinciaId) => {
  const [results] = await db.query(
    'SELECT ID as id, BARRIO as nombre FROM barrios WHERE provincia_id = ? ORDER BY BARRIO',
    [provinciaId]
  );
  return results;
};

module.exports = {
  getProvincias,
  getCantonesByProvincia,
  getBarriosByCanton,
  getBarriosByProvincia,
  getRecintosByCantonParroquia,
  getParroquiasByCanton
};
