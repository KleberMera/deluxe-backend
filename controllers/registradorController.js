const db = require('../config/db');

exports.createRegistrador = async (req, res) => {
    const { nombre_registrador } = req.body;
    
    if (!nombre_registrador) {
        return res.status(400).json({ 
            success: false, 
            error: 'El nombre del registrador es obligatorio' 
        });
    }
    
    try {
        const [result] = await db.query(
            'INSERT INTO registrador (nombre_registrador) VALUES (?)',
            [nombre_registrador.trim()]
        );
        
        res.status(201).json({
            success: true,
            message: 'Registrador creado correctamente',
            registradorId: result.insertId
        });
    } catch (error) {
        console.error('Error al crear registrador:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error en el servidor' 
        });
    }
};

exports.getRegistradores = async (req, res) => {
    try {
        const [registradores] = await db.query(
            'SELECT id, nombre_registrador FROM registrador ORDER BY nombre_registrador ASC'
        );
        
        res.status(200).json({
            success: true,
            registradores
        });
    } catch (error) {
        console.error('Error al obtener registradores:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al consultar los registradores' 
        });
    }
}; // ← Esta llave faltaba

exports.getDashboardMetrics = async (req, res) => {
    try {
        // Obtener todos los registradores y sus usuarios asociados
        const [registradores] = await db.query(`
            SELECT 
                r.id AS registrador_id,
                r.nombre_registrador,
                u.id AS user_id,
                u.first_name,
                u.last_name,
                u.created_at,
                u.id_evento AS brigada_id
            FROM registrador r
            LEFT JOIN users u ON u.id_registrador = r.id
            ORDER BY r.id, u.created_at
        `);
        
        // Obtener todas las brigadas y sus usuarios asociados
        const [brigadas] = await db.query(`
            SELECT 
                b.id_brigada,
                b.nombre_brigada,
                b.descripcion,
                b.fecha_creacion,
                b.activa,
                u.id AS user_id,
                u.first_name,
                u.last_name,
                u.created_at,
                u.id_registrador
            FROM brigadas b
            LEFT JOIN users u ON u.id_evento = b.id_brigada
            ORDER BY b.id_brigada, u.created_at
        `);
        
        // Obtener todos los usuarios
        const [usuarios] = await db.query(`
            SELECT 
                id,
                first_name,
                last_name,
                id_card,
                phone,
                id_registrador,
                id_evento AS brigada_id,
                created_at,
                latitud,
                longitud
            FROM users
            ORDER BY created_at DESC
        `);
        
        res.status(200).json({
            success: true,
            registradores, // Incluye usuarios por registrador
            brigadas,      // Incluye usuarios por brigada
            usuarios       // Datos puros para mapear, agrupar o analizar como quieras
        });
    } catch (error) {
        console.error('Error al obtener métricas completas:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error al obtener datos del dashboard',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};