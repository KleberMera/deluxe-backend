const db = require('../config/db');

exports.getBingoStatus = async (req, res) => {
    try {
        // Verificación simple de conexión a la base de datos
        await db.query('SELECT 1');
        
        res.status(200).json({ 
            success: true,
            status: 'online',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error al verificar estado de conexión:', error);
        res.status(500).json({ 
            success: false,
            status: 'offline',
            error: 'Error de conexión a la base de datos'
        });
    }
};

exports.getBingoStats = async (req, res) => {
    try {
        const stats = {};
        
        // Usuarios registrandose (incompletos)
        const [incompletos] = await db.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE phone IS NOT NULL 
            AND otp IS NOT NULL 
            AND otp_expires_at IS NOT NULL 
            AND first_name IS NULL 
            AND last_name IS NULL 
            AND id_card IS NULL
        `);
        stats.usuarios_incompletos = incompletos[0].count;
        
        // Usuarios registrados
        const [registrados] = await db.query(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE phone IS NOT NULL 
            AND first_name IS NOT NULL 
            AND last_name IS NOT NULL 
            AND id_card IS NOT NULL 
            AND id_tabla IS NOT NULL 
            AND phone_verified IS NOT NULL
            AND (otp IS NULL OR otp = '') 
            AND otp_expires_at IS NULL
        `);
        stats.usuarios_registrados = registrados[0].count;
        
        // Tablas entregadas
        const [entregadas] = await db.query(`
            SELECT COUNT(*)-1 as count FROM bingo_tables WHERE entregado = 1
        `);
        stats.tablas_entregadas = entregadas[0].count;
        
        // Tablas disponibles
        const [pendientes] = await db.query(`
            SELECT COUNT(*)+1 as count FROM bingo_tables WHERE entregado = 0
        `);
        stats.tablas_pendientes = pendientes[0].count;
        
        // Total de tablas
        const [total] = await db.query(`
            SELECT COUNT(*) as count FROM bingo_tables
        `);
        stats.total_tablas = total[0].count;
        
        // Tablas entregadas hoy
        const [hoy] = await db.query(`
            SELECT COUNT(*) as count 
            FROM bingo_tables bt, users u 
            WHERE entregado = 1 
            AND u.id_tabla = bt.id 
            AND DATE(u.created_at) = CURDATE()
        `);
        stats.tablas_hoy = hoy[0].count;
        
        // Promedio por día (últimos 5 días)
        const [promedio] = await db.query(`
            SELECT ROUND(COUNT(*) / 5) as promedio 
            FROM bingo_tables bt, users u 
            WHERE bt.entregado = 1 
            AND u.id_tabla = bt.id 
            AND u.created_at >= DATE_SUB(CURDATE(), INTERVAL 4 DAY)
        `);
        stats.promedio_dia = promedio[0].promedio || 0;
        
        // Estadísticas diarias
        stats.estadisticas_diarias = await getDailyRegistrations();
        
        // Top cantones
        const [cantones] = await db.query(`
            SELECT c.nombre as canton, COUNT(bt.id) as tablas_entregadas
            FROM bingo_tables bt
            JOIN users u ON bt.id = u.id_tabla
            JOIN cantones c ON u.canton_id = c.id
            WHERE bt.entregado = 1
            GROUP BY c.id, c.nombre
            ORDER BY tablas_entregadas DESC
            LIMIT 10
        `);
        stats.por_canton = cantones;
        
        // Top barrios (solo para Guayaquil - canton_id = 1)
        const [barrios] = await db.query(`
            SELECT b.barrio as barrio, COUNT(bt.id) as tablas_entregadas
            FROM bingo_tables bt
            JOIN users u ON bt.id = u.id_tabla AND u.canton_id = 1
            JOIN barrios b ON b.id = u.barrio_id
            WHERE bt.entregado = 1
            GROUP BY b.id, b.barrio
            ORDER BY tablas_entregadas DESC
            LIMIT 1000
        `);
        stats.por_barrio = barrios;
        
        res.status(200).json({
            success: true,
            data: stats
        });
        
    } catch (error) {
        console.error('Error al obtener estadísticas de bingo:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener estadísticas',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.searchBingoTables = async (req, res) => {
    const { table_number, phone, cedula } = req.query;
    
    if (!table_number && !phone && !cedula) {
        return res.status(400).json({ 
            success: false,
            error: 'Al menos un criterio de búsqueda es requerido' 
        });
    }
    
    try {
        const conditions = [];
        const params = [];
        
        if (table_number) {
            conditions.push(`
                ? BETWEEN 
                CAST(SUBSTRING_INDEX(bt.table_code, '_', 1) AS UNSIGNED) AND 
                CAST(SUBSTRING_INDEX(bt.table_code, '_', -1) AS UNSIGNED)
            `);
            params.push(parseInt(table_number));
        }
        
        if (phone) {
            conditions.push("u.phone LIKE ?");
            params.push(`%${phone}%`);
        }
        
        if (cedula) {
            conditions.push("u.id_card LIKE ?");
            params.push(`%${cedula}%`);
        }
        
        const whereClause = conditions.join(' OR ');
        
        const query = `
            SELECT 
                bt.id, 
                bt.table_code, 
                bt.file_name, 
                bt.file_url,
                bt.created_at, 
                bt.entregado,
                bt.registro_manual,
                bt.ocr_validated,
                bt.ocr_confidence,
                u.first_name,
                u.last_name,
                u.phone,
                u.id_card,
                c.nombre as canton,
                b.BARRIO as barrio,
                p.nombre as provincia,
                br.nombre_brigada as brigada,
                u.ubicacion_detallada,
                u.latitud,
                u.longitud,
                CAST(SUBSTRING_INDEX(bt.table_code, '_', 1) AS UNSIGNED) as rango_inicio,
                CAST(SUBSTRING_INDEX(bt.table_code, '_', -1) AS UNSIGNED) as rango_fin,
                reg.nombre_registrador as registrador_nombre,
                NULL as registrador_apellido,
                NULL as registrador_telefono
            FROM bingo_tables bt
            JOIN users u ON bt.id = u.id_tabla
            LEFT JOIN cantones c ON u.canton_id = c.id
            LEFT JOIN barrios b ON u.barrio_id = b.ID
            LEFT JOIN provincias p ON u.provincia_id = p.id
            LEFT JOIN brigadas br ON u.id_evento = br.id_brigada
            LEFT JOIN registrador reg ON u.id_registrador = reg.id
            WHERE ${whereClause}
            ORDER BY u.created_at DESC
            LIMIT 10
        `;
        
        const [results] = await db.query(query, params);
        
        if (table_number && results.length === 0) {
            return res.status(404).json({
                success: false,
                error: `No se encontró la tabla con número ${table_number}`,
                suggestion: 'Verifique que el número esté dentro de los rangos existentes'
            });
        }
        
        res.status(200).json({
            success: true,
            data: results
        });
        
    } catch (error) {
        console.error('Error en búsqueda de tablas de bingo:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error en la búsqueda',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.getRecentBingoTables = async (req, res) => {
    try {
        const [results] = await db.query(`
            SELECT 
                bt.id, 
                bt.table_code, 
                bt.file_name, 
                bt.file_url,
                bt.created_at, 
                bt.entregado,
                bt.registro_manual,
                bt.ocr_validated,
                bt.ocr_confidence,
                u.first_name,
                u.last_name,
                u.phone,
                u.id_card,
                c.nombre as canton,
                b.BARRIO as barrio,
                p.nombre as provincia,
                br.nombre_brigada as brigada,
                u.ubicacion_detallada,
                u.latitud,
                u.longitud,
                reg.nombre_registrador as registrador_nombre,
                NULL as registrador_apellido,
                NULL as registrador_telefono
            FROM bingo_tables bt
            JOIN users u ON u.id_tabla = bt.id
            LEFT JOIN cantones c ON u.canton_id = c.id
            LEFT JOIN barrios b ON u.barrio_id = b.ID
            LEFT JOIN provincias p ON u.provincia_id = p.id
            LEFT JOIN brigadas br ON u.id_evento = br.id_brigada
            LEFT JOIN registrador reg ON u.id_registrador = reg.id
            WHERE bt.entregado = 1
            ORDER BY u.created_at DESC 
            LIMIT 50
        `);
        
        res.status(200).json({
            success: true,
            data: results
        });
        
    } catch (error) {
        console.error('Error al obtener tablas recientes:', error);
        res.status(500).json({ 
            success: false,
            error: 'Error al obtener datos recientes',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Función auxiliar para estadísticas diarias
// Función auxiliar para estadísticas diarias CORREGIDA
// Función auxiliar para estadísticas diarias CORREGIDA
// Función auxiliar para estadísticas diarias CORREGIDA
async function getDailyRegistrations() {
    const dailyStats = [];
    
    // CAMBIO PRINCIPAL: Usar DATE() en ambos lados para comparar solo fechas
    const [dbResults] = await db.query(`
        SELECT DATE(u.created_at) as fecha, COUNT(*) as count 
        FROM bingo_tables bt, users u 
        WHERE entregado = 1 
        AND u.id_tabla = bt.id 
        AND DATE(u.created_at) >= DATE_SUB(CURDATE(), INTERVAL 4 DAY)
        GROUP BY DATE(u.created_at)
        ORDER BY fecha DESC
    `);
    
    // Crear array asociativo para fácil acceso por fecha
    const dbData = {};
    dbResults.forEach(row => {
        dbData[row.fecha] = row.count;
    });
    
    // Nombres de días en español
    const dayNames = {
        'Sunday': 'Dom',
        'Monday': 'Lun', 
        'Tuesday': 'Mar',
        'Wednesday': 'Mié',
        'Thursday': 'Jue',
        'Friday': 'Vie',
        'Saturday': 'Sáb'
    };
    
    // Nombres de meses en español
    const monthNames = {
        'Jan': 'Ene', 'Feb': 'Feb', 'Mar': 'Mar', 'Apr': 'Abr',
        'May': 'May', 'Jun': 'Jun', 'Jul': 'Jul', 'Aug': 'Ago',
        'Sep': 'Sep', 'Oct': 'Oct', 'Nov': 'Nov', 'Dec': 'Dic'
    };
    
    // Generar los últimos 5 días (índices 0-4)
    for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayText = i === 0 ? 'Hoy' : 
                       i === 1 ? 'Ayer' : 
                       `${date.getDate()}/${monthNames[date.toLocaleString('en-US', { month: 'short' })]}`;
        
        dailyStats.push({
            fecha_db: dateStr,
            dia_texto: dayText,
            count: dbData[dateStr] || 0
        });
    }
    
    return dailyStats;
}

// Obtener rango de tablas entregadas entre dos fechas
exports.getTableRangeByDate = async (req, res) => {
    const fecha_inicio = req.query.fecha_inicio || req.body.fecha_inicio;
    const fecha_fin = req.query.fecha_fin || req.body.fecha_fin;
    
    if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
            success: false,
            error: 'Se requieren fecha_inicio y fecha_fin'
        });
    }

    try {
        // Consulta con JOIN para obtener tablas entregadas basándose en la fecha de registro del usuario
        const [tablas] = await db.query(`
            SELECT 
                bt.id, 
                bt.table_code, 
                bt.entregado,
                bt.registro_manual,
                u.created_at as fecha_entrega,
                u.first_name,
                u.last_name,
                u.phone,
                u.id_card
            FROM bingo_tables bt
            INNER JOIN users u ON bt.id = u.id_tabla
            WHERE bt.entregado = 1
            AND bt.registro_manual = 0
            AND DATE(u.created_at) >= ?
            AND DATE(u.created_at) <= ?
            ORDER BY u.created_at ASC
        `, [fecha_inicio, fecha_fin]);

        // También obtener estadísticas para depuración
        const [estadisticas] = await db.query(`
            SELECT 
                COUNT(*) as total_usuarios_en_rango,
                COUNT(CASE WHEN bt.entregado = 1 THEN 1 END) as tablas_entregadas_en_rango,
                COUNT(CASE WHEN bt.entregado = 1 AND bt.registro_manual = 0 THEN 1 END) as tablas_automaticas_entregadas_en_rango,
                COUNT(CASE WHEN bt.entregado = 1 AND bt.registro_manual = 1 THEN 1 END) as tablas_manuales_entregadas_en_rango
            FROM users u
            LEFT JOIN bingo_tables bt ON bt.id = u.id_tabla
            WHERE DATE(u.created_at) >= ?
            AND DATE(u.created_at) <= ?
        `, [fecha_inicio, fecha_fin]);

        let rango = {
            id_inicial: null,
            id_final: null,
            table_code_inicial: null,
            table_code_final: null,
            fecha_inicial: null,
            fecha_final: null
        };

        if (tablas.length > 0) {
            rango.id_inicial = tablas[0].id;
            rango.id_final = tablas[tablas.length - 1].id;
            rango.table_code_inicial = tablas[0].table_code;
            rango.table_code_final = tablas[tablas.length - 1].table_code;
            rango.fecha_inicial = tablas[0].fecha_entrega;
            rango.fecha_final = tablas[tablas.length - 1].fecha_entrega;
        }

        res.status(200).json({
            success: true,
            rango,
            debug_info: {
                fechas_consultadas: { fecha_inicio, fecha_fin },
                tablas_encontradas: tablas.length,
                estadisticas: estadisticas[0],
                muestra_tablas: tablas.slice(0, 5).map(t => ({
                    id: t.id,
                    table_code: t.table_code,
                    fecha_entrega: t.fecha_entrega,
                    usuario: `${t.first_name} ${t.last_name}`,
                    entregado: t.entregado,
                    registro_manual: t.registro_manual
                }))
            }
        });

    } catch (error) {
        console.error('Error al obtener rango de tablas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener rango de tablas',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};