// Script de prueba para el nuevo endpoint
// Ejecutar desde el directorio del proyecto con: node test_check_user_endpoint.js

const express = require('express');
const router = require('./v2-rest/routes/index');

const app = express();
app.use(express.json());
app.use('/api/v2', router);

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Servidor de prueba ejecutándose en puerto ${PORT}`);
  console.log('\n=== NUEVO ENDPOINT CREADO ===');
  console.log('GET /api/v2/usuarios-otros/check/:id_card');
  console.log('\nEjemplo de uso:');
  console.log(`GET http://localhost:${PORT}/api/v2/usuarios-otros/check/1234567890`);
  console.log('\nRespuesta esperada:');
  console.log(JSON.stringify({
    "success": true,
    "message": "Usuario encontrado" || "Usuario no encontrado",
    "data": {}, // datos del usuario o null
    "exists": true, // true o false
    "brigadaInfo": {
      "id_evento": 1, // id de la brigada activa
      "nombre_brigada": "Brigada Principal",
      "activa": true
    }
  }, null, 2));
});