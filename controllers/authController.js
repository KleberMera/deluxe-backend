// controllers/authController.js
const db = require('../config/dbConfig');
const WhatsAppService = require('../services/whatsappService');
const { generateOTP } = require('../utils/otpGenerator');

exports.sendVerificationOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validar número de teléfono
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'Número de teléfono inválido' });
    }

    // Generar OTP (6 dígitos, válido por 5 minutos)
    const otp = generateOTP(6);
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

    // Guardar OTP en la base de datos (sin usuario aún)
    await db.query(
      'INSERT INTO temp_otp_verifications (phone, otp, expires_at) VALUES (?, ?, ?)',
      [phone, otp, otpExpires]
    );

    // Enviar OTP por WhatsApp
    await WhatsAppService.sendOTP(phone, otp);

    res.json({ 
      success: true,
      message: 'Código de verificación enviado'
    });
  } catch (error) {
    console.error('Error al enviar OTP:', error);
    res.status(500).json({ 
      error: error.message || 'Error al enviar código de verificación' 
    });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Buscar OTP en la base de datos
    const [otpRecord] = await db.query(
      'SELECT * FROM temp_otp_verifications WHERE phone = ? AND otp = ? AND expires_at > NOW()',
      [phone, otp]
    );

    if (!otpRecord || otpRecord.length === 0) {
      return res.status(400).json({ error: 'Código inválido o expirado' });
    }

    // Si el OTP es válido, marcar como verificado
    await db.query(
      'UPDATE temp_otp_verifications SET verified = TRUE WHERE id = ?',
      [otpRecord[0].id]
    );

    res.json({ 
      success: true,
      verified: true
    });
  } catch (error) {
    console.error('Error al verificar OTP:', error);
    res.status(500).json({ 
      error: error.message || 'Error al verificar código' 
    });
  }
};