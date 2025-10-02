const db = require('../config/db');

exports.createBrigada = async (req, res) => {
  const { nombre_brigada, descripcion } = req.body;
  
  if (!nombre_brigada) {
    return res.status(400).json({ success: false, error: 'El nombre de la brigada es obligatorio' });
  }

  try {
    const [existing] = await db.query('SELECT id_brigada FROM brigadas WHERE nombre_brigada = ?', [nombre_brigada]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Ya existe una brigada con ese nombre' });
    }

    const [result] = await db.query(
      'INSERT INTO brigadas (nombre_brigada, descripcion) VALUES (?, ?)',
      [nombre_brigada, descripcion || null]
    );

    res.status(201).json({
      success: true,
      message: 'Brigada creada exitosamente',
      brigadaId: result.insertId
    });
  } catch (error) {
    console.error('Error al crear brigada:', error);
    res.status(500).json({ success: false, error: 'Error en el servidor' });
  }
};
