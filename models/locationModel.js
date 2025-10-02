const db = require('../config/db');

// Obtener todos los cantones únicos
const getCantones = () => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT DISTINCT canton FROM juntas_aux ORDER BY canton',
      (err, results) => {
        if (err) {
          return reject(err);
        }
        resolve(results);
      }
    );
  });
};

// Obtener parroquias de un cantón específico
const getParroquias = (canton) => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT DISTINCT parroquia FROM juntas_aux WHERE canton = ? ORDER BY parroquia',
      [canton],
      (err, results) => {
        if (err) {
          return reject(err);
        }
        resolve(results);
      }
    );
  });
};

// Obtener recintos de una parroquia específica
const getRecintos = (canton, parroquia) => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT DISTINCT recintos FROM juntas_aux WHERE canton = ? AND parroquia = ? ORDER BY recintos',
      [canton, parroquia],
      (err, results) => {
        if (err) {
          return reject(err);
        }
        resolve(results);
      }
    );
  });
};

// Obtener juntas/mesas de un recinto específico
const getJuntas = (canton, parroquia, recinto) => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT id_junta, numero_junta, tipo_junta, estado FROM juntas_aux WHERE canton = ? AND parroquia = ? AND recintos = ? AND (estado = "DISPONIBLE" OR estado IS NULL) ORDER BY numero_junta, tipo_junta',
      [canton, parroquia, recinto],
      (err, results) => {
        if (err) {
          return reject(err);
        }
        resolve(results);
      }
    );
  });
};

// Obtener detalles de una junta específica
const getJuntaById = (id) => {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM juntas_aux WHERE id_junta = ?',
      [id],
      (err, results) => {
        if (err) {
          return reject(err);
        }
        if (results.length === 0) {
          return resolve(null);
        }
        resolve(results[0]);
      }
    );
  });
};

// Marcar una junta como asignada
const asignarJunta = (idJunta, userId) => {
  return new Promise((resolve, reject) => {
    db.query(
      'UPDATE juntas_aux SET user_id = ?, estado = "ASIGNADA" WHERE id_junta = ? AND (estado = "DISPONIBLE" OR estado IS NULL)',
      [userId, idJunta],
      (err, result) => {
        if (err) {
          return reject(err);
        }
        if (result.affectedRows === 0) {
          return reject(new Error('Junta no disponible o no existe'));
        }
        resolve(result);
      }
    );
  });
};

module.exports = {
  getCantones,
  getParroquias,
  getRecintos,
  getJuntas,
  getJuntaById,
  asignarJunta
};