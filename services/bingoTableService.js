// services/bingoTableService.js
const db = require('../config/db');

class BingoTableService {
  
  /**
   * Verifica disponibilidad de un rango de tablas
   * @param {string} tableRange - Rango en formato "XXXX_YYYY"
   * @returns {Promise<boolean>}
   */
  async checkTableRangeAvailability(tableRange) {
    const [existingTables] = await db.query(
      'SELECT id FROM bingo_tables WHERE table_code = ? LIMIT 1',
      [tableRange]
    );
    
    return existingTables.length === 0;
  }

  /**
   * Asignar una tabla disponible a un usuario
   * @param {number} userId - ID del usuario
   * @returns {Object} - Datos de la tabla asignada
   */
  async assignTableToUser(userId) {
    try {
      console.log('🎯 Asignando tabla de BINGO al usuario:', userId);
      
      // Buscar una tabla disponible (no entregada)
      const [availableTables] = await db.query(`
        SELECT id, table_code, file_name, file_url 
        FROM bingo_tables 
        WHERE entregado = 0 
        ORDER BY id ASC 
        LIMIT 1
      `);
      
      if (availableTables.length === 0) {
        throw new Error('No hay tablas de BINGO disponibles en este momento');
      }
      
      const selectedTable = availableTables[0];
      console.log('📋 Tabla seleccionada:', selectedTable.table_code);
      
      // Iniciar transacción
      await db.query('START TRANSACTION');
      
      try {
        // Marcar la tabla como entregada
        await db.query(`
          UPDATE bingo_tables 
          SET entregado = 1 
          WHERE id = ?
        `, [selectedTable.id]);
        
        // Asignar la tabla al usuario
        await db.query(`
          UPDATE users 
          SET id_tabla = ? 
          WHERE id = ?
        `, [selectedTable.id, userId]);
        
        // Confirmar transacción
        await db.query('COMMIT');
        
        console.log('✅ Tabla asignada exitosamente al usuario');
        
        return {
          success: true,
          table: {
            id: selectedTable.id,
            table_code: selectedTable.table_code,
            file_name: selectedTable.file_name,
            file_url: selectedTable.file_url
          }
        };
        
      } catch (transactionError) {
        // Revertir transacción en caso de error
        await db.query('ROLLBACK');
        throw transactionError;
      }
      
    } catch (error) {
      console.error('❌ Error al asignar tabla:', error);
      throw error;
    }
  }
  
  /**
   * Verificar si un usuario ya tiene una tabla asignada
   * @param {number} userId - ID del usuario
   * @returns {Object|null} - Datos de la tabla si existe
   */
  async getUserTable(userId) {
    try {
      const [result] = await db.query(`
        SELECT bt.id, bt.table_code, bt.file_name, bt.file_url
        FROM users u
        INNER JOIN bingo_tables bt ON u.id_tabla = bt.id
        WHERE u.id = ?
      `, [userId]);
      
      return result.length > 0 ? result[0] : null;
      
    } catch (error) {
      console.error('❌ Error al obtener tabla del usuario:', error);
      throw error;
    }
  }
  
  /**
   * Obtener estadísticas de tablas
   * @returns {Object} - Estadísticas
   */
  async getTableStats() {
    try {
      const [stats] = await db.query(`
        SELECT 
          COUNT(*) as total_tables,
          SUM(CASE WHEN entregado = 1 THEN 1 ELSE 0 END) as delivered_tables,
          SUM(CASE WHEN entregado = 0 THEN 1 ELSE 0 END) as available_tables
        FROM bingo_tables
      `);
      
      return stats[0];
      
    } catch (error) {
      console.error('❌ Error al obtener estadísticas:', error);
      throw error;
    }
  }
  
  /**
   * Liberar una tabla (marcar como no entregada)
   * Útil para casos de error o testing
   * @param {number} tableId - ID de la tabla
   */
  async releaseTable(tableId) {
    try {
      await db.query('START TRANSACTION');
      
      // Quitar la tabla del usuario
      await db.query(`
        UPDATE users 
        SET id_tabla = NULL 
        WHERE id_tabla = ?
      `, [tableId]);
      
      // Marcar tabla como disponible
      await db.query(`
        UPDATE bingo_tables 
        SET entregado = 0 
        WHERE id = ?
      `, [tableId]);
      
      await db.query('COMMIT');
      
      console.log('✅ Tabla liberada exitosamente:', tableId);
      return { success: true };
      
    } catch (error) {
      await db.query('ROLLBACK');
      console.error('❌ Error al liberar tabla:', error);
      throw error;
    }
  }
}

module.exports = new BingoTableService();