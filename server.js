// server.js (actualizado)
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// Rutas existentes
const locationRoutes = require('./routes/locations');
const userRoutes = require('./routes/users');
const locationRoutesNew = require('./routes/locationNewRoutes');
const brigadaRoutes = require('./routes/brigadas');
const registradorRoutes = require('./routes/registradores');
const bingoRoutes = require ('./routes/bingoRoutes')
// Nueva ruta para WhatsApp OTP
const whatsappOTPRoutes = require('./routes/whatsappOTPRoutes');
// Nueva ruta para envío masivo
const bulkMessagingRoutes = require('./routes/bulkMessagingRoutes');

// Rutas V2
const v2Routes = require('./v2-rest/routes/index');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configuración para almacenar archivos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Hacer que la carpeta de uploads sea accesible públicamente
app.use('/uploads', express.static(uploadDir));

// Rutas existentes
app.use('/api/locations', locationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/locationNew', locationRoutesNew);
app.use('/api/brigadas', brigadaRoutes);
app.use('/api/registradores', registradorRoutes);

// Nueva ruta para WhatsApp OTP
app.use('/api/whatsapp-otp', whatsappOTPRoutes);
// Nueva ruta para envío masivo
app.use('/api/bulk-messaging', bulkMessagingRoutes);
app.use('/api/admin/bingo', bingoRoutes);

// Rutas V2
app.use('/api/v2', v2Routes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});