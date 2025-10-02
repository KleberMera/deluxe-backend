const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class WhatsAppOTPService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isReady = false;
    this.qr = null;
    this.status = 'initializing';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.heartbeatInterval = null;
    this.sessionPath = path.join(__dirname, '../.wwebjs_auth');
    this.isShuttingDown = false;
    
    this.ensureSessionDirectory();
    this.initializeClient();
    this.startConnectionMonitoring();
  }


  ensureSessionDirectory() {
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      console.log('📁 Directorio de sesión creado:', this.sessionPath);
    }
  }

  initializeClient() {
    console.log('🚀 Inicializando cliente WhatsApp...');
    
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: "whatsapp-otp-service",
        dataPath: this.sessionPath
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ],
        timeout: 60000
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      }
    });

    this.setupClientListeners();
    
    this.client.initialize().catch(err => {
      console.error('❌ Error al inicializar WhatsApp:', err);
      this.handleClientError(err);
    });
  }

  setupClientListeners() {
    this.client.on('qr', async (qr) => {
      console.log('📱 QR Code generado - Escanea para autenticar');
      this.qr = await qrcode.toDataURL(qr);
      this.status = 'qr_ready';
      this.emit('qr', this.qr);
    });

    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp autenticado correctamente');
      this.status = 'authenticated';
      this.reconnectAttempts = 0;
    });

    this.client.on('ready', () => {
      console.log('🟢 WhatsApp cliente listo y operativo');
      this.isReady = true;
      this.status = 'ready';
      this.qr = null;
      this.reconnectAttempts = 0;
      this.emit('ready');
      this.startHeartbeat();
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔴 WhatsApp desconectado. Razón:', reason);
      this.isReady = false;
      this.status = 'disconnected';
      this.stopHeartbeat();
      this.emit('disconnected', reason);
      this.handleDisconnection(reason);
    });

    this.client.on('auth_failure', (msg) => {
      console.error('❌ Fallo de autenticación:', msg);
      this.status = 'auth_failed';
      this.isReady = false;
      this.emit('auth_failure', msg);
      this.handleAuthFailure();
    });

    this.client.on('loading_screen', (percent, message) => {
      console.log(`⏳ Cargando WhatsApp: ${percent}% - ${message}`);
    });

    this.client.on('change_state', (state) => {
      console.log('🔄 Estado cambiado a:', state);
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        if (this.isReady && this.client && !this.isShuttingDown) {
          const state = await this.client.getState();
          console.log('💓 Heartbeat - Estado:', state);
          
          if (state !== 'CONNECTED') {
            console.log('⚠️ Cliente no conectado, intentando reconectar...');
            this.handleConnectionLoss();
          }
        }
      } catch (error) {
        console.error('❌ Error en heartbeat:', error);
        if (!this.isShuttingDown) {
          this.handleConnectionLoss();
        }
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  startConnectionMonitoring() {
    setInterval(async () => {
      if (this.isReady && !this.isShuttingDown) {
        try {
          await this.client.getState();
        } catch (error) {
          console.log('🔍 Monitoreo detectó problema de conexión');
          this.handleConnectionLoss();
        }
      }
    }, 120000);
  }

  handleDisconnection(reason) {
    console.log(`🔄 Manejando desconexión: ${reason}`);
    
    if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
      console.log('🗑️ Sesión terminada por el usuario, limpiando datos...');
      this.gracefulSessionCleanup();
      return;
    }
    
    this.attemptReconnection();
  }

  handleConnectionLoss() {
    if (!this.isReady || this.isShuttingDown) return;
    
    console.log('📡 Pérdida de conexión detectada');
    this.isReady = false;
    this.status = 'reconnecting';
    this.attemptReconnection();
  }

  async attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Máximo de intentos de reconexión alcanzado');
      this.status = 'failed';
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`🔄 Intento de reconexión ${this.reconnectAttempts}/${this.maxReconnectAttempts} en ${delay}ms`);
    
    setTimeout(async () => {
      try {
        if (this.client) {
          await this.gracefulDestroy();
        }
        this.initializeClient();
      } catch (error) {
        console.error('❌ Error en intento de reconexión:', error);
        this.attemptReconnection();
      }
    }, delay);
  }

  handleAuthFailure() {
    console.log('🧹 Limpiando sesión por fallo de autenticación...');
    setTimeout(async () => {
      await this.gracefulSessionCleanup();
      this.restart();
    }, 2000);
  }

  handleClientError(error) {
    console.error('❌ Error del cliente:', error);
    this.status = 'error';
    
    setTimeout(() => {
      console.log('🔄 Reintentando inicialización...');
      this.restart();
    }, 10000);
  }

  async sendOTP(phoneNumber, otpCode) {
    if (!this.isReady) {
      throw new Error(`Cliente WhatsApp no está listo. Estado actual: ${this.status}`);
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      console.log('📞 Enviando OTP a:', formattedNumber);
      
      const numberId = await this.client.getNumberId(formattedNumber);
      
      if (!numberId) {
        throw new Error('El número no está registrado en WhatsApp');
      }

      const message = `🔐 Tu código de verificación de PelicanoTV es: ${otpCode}\n\n⚠️ No lo compartas con nadie.\n\n_Este código expira en 5 minutos._`;
      
      await this.client.sendMessage(numberId._serialized, message);
      
      console.log('✅ OTP enviado exitosamente a:', phoneNumber);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error al enviar OTP:', error);
      
      if (error.message.includes('wid error: invalid wid')) {
        throw new Error('Formato de número de teléfono inválido');
      } else if (error.message.includes('Phone number is not registered')) {
        throw new Error('El número no está registrado en WhatsApp');
      } else if (error.message.includes('Protocol error')) {
        this.handleConnectionLoss();
        throw new Error('Error de conexión. Reintentando...');
      }
      
      throw error;
    }
  }

  formatPhoneNumber(number) {
    let cleaned = number.replace(/\D/g, '');
    console.log('🧹 Número limpio:', cleaned);
    
    if (cleaned.length < 9) {
      throw new Error('Número de teléfono demasiado corto');
    }
    
    if (cleaned.startsWith('593')) {
      return cleaned + '@c.us';
    } else if (cleaned.startsWith('0')) {
      return '593' + cleaned.substring(1) + '@c.us';
    } else if (cleaned.length === 9) {
      return '593' + cleaned + '@c.us';
    } else if (cleaned.length === 10 && cleaned.startsWith('09')) {
      return '593' + cleaned.substring(1) + '@c.us';
    }
    
    return cleaned + '@c.us';
  }

  // MÉTODOS MEJORADOS PARA LIMPIEZA DE SESIÓN

  async gracefulDestroy() {
    console.log('🔄 Cerrando cliente de manera controlada...');
    this.isShuttingDown = true;
    this.stopHeartbeat();
    
    try {
      if (this.client) {
        // Dar tiempo para que se cierren las conexiones
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.client.destroy();
        console.log('✅ Cliente destruido correctamente');
      }
    } catch (error) {
      console.error('⚠️ Error al destruir cliente:', error.message);
    } finally {
      this.client = null;
      this.isShuttingDown = false;
    }
  }

  async gracefulSessionCleanup() {
    console.log('🧹 Iniciando limpieza controlada de sesión...');
    
    // Primero cerrar el cliente
    await this.gracefulDestroy();
    
    // Esperar un poco más para asegurar que todos los procesos se cierren
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Intentar limpiar la sesión con reintentos
    await this.cleanSessionWithRetries();
  }

  async cleanSessionWithRetries(maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🗑️ Intento ${attempt}/${maxRetries} de limpieza de sesión...`);
        
        if (fs.existsSync(this.sessionPath)) {
          // Intentar limpiar archivos específicos primero
          await this.cleanSpecificFiles();
          
          // Luego intentar limpiar todo el directorio
          fs.rmSync(this.sessionPath, { 
            recursive: true, 
            force: true,
            maxRetries: 3,
            retryDelay: 1000
          });
          
          console.log('✅ Sesión limpiada exitosamente');
          return;
        }
        
      } catch (error) {
        console.error(`❌ Error en intento ${attempt}:`, error.message);
        
        if (attempt === maxRetries) {
          console.error('❌ No se pudo limpiar la sesión completamente');
          // Marcar archivos problemáticos para limpieza manual
          await this.markForManualCleanup();
        } else {
          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }
  }

  async sendWelcomeMessage(phoneNumber, firstName, lastName) {
    if (!this.isReady) {
      throw new Error(`Cliente WhatsApp no está listo. Estado actual: ${this.status}`);
    }
    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      console.log('🎉 Enviando mensaje de bienvenida a:', formattedNumber);
      const numberId = await this.client.getNumberId(formattedNumber);
      if (!numberId) {
        throw new Error('El número no está registrado en WhatsApp');
      }
      // Crear mensaje personalizado de bienvenida
      const welcomeMessage = `🎉 ¡Bienvenido/a ${firstName} ${lastName}!
✅ Tu registro en *PelicanoTV* ha sido completado exitosamente.

📱 Ya formas parte de nuestra comunidad y podrás recibir notificaciones importantes.

🔔 Te mantendremos informado sobre:
✅ *Bingo Amigo Prime*
✅ *Noticias LIBERTENSES*
✅ *Podcast PTG*

¡Gracias por registrarte con nosotros!

*Equipo PelicanoTV* 🚀`;
      await this.client.sendMessage(numberId._serialized, welcomeMessage);
      // Esperar 5 segundos antes de enviar el segundo mensaje
      await new Promise(resolve => setTimeout(resolve, 3000));
      // Crear segundo mensaje de redes sociales
      const socialMessage = `📲 *¡Síguenos en todas nuestras redes como @pelicanotvcanal, el medio digital de los libertenses!* 📺😜🙌🏻🎙️📍
👉 *Facebook:* facebook.com/pelicanotvcanal  
👉 *TikTok:* tiktok.com/@pelicanotvcanal  
👉 *Instagram:* instagram.com/pelicanotvcanal  
👉 *YouTube:* youtube.com/@PelicanoTVcanal`;
      await this.client.sendMessage(numberId._serialized, socialMessage);
      console.log('✅ Mensaje de bienvenida y redes sociales enviado exitosamente a:', phoneNumber);
      return { success: true };
    } catch (error) {
      console.error('❌ Error al enviar mensaje de bienvenida:', error);
      if (error.message.includes('wid error: invalid wid')) {
        throw new Error('Formato de número de teléfono inválido');
      } else if (error.message.includes('Phone number is not registered')) {
        throw new Error('El número no está registrado en WhatsApp');
      } else if (error.message.includes('Protocol error')) {
        this.handleConnectionLoss();
        throw new Error('Error de conexión. Reintentando...');
      }
      throw error;
    }
  }

  // NUEVO MÉTODO: Enviar tabla de BINGO
  async sendBingoTable(phoneNumber, firstName, lastName, tableData) {
    if (!this.isReady) {
      throw new Error(`Cliente WhatsApp no está listo. Estado actual: ${this.status}`);
    }
    
    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      console.log('🎯 Enviando tabla de BINGO a:', formattedNumber);
      
      const numberId = await this.client.getNumberId(formattedNumber);
      if (!numberId) {
        throw new Error('El número no está registrado en WhatsApp');
      }

      // Mensaje antes de enviar la tabla
      const bingoMessage = `🎯 ¡Hola ${firstName}!

¡Tu tabla de *BINGO AMIGO PRIME* está lista! 🎉

📋 *Código de tabla:* ${tableData.table_code}
🎲 Ya puedes participar en nuestros bingos!

¡Te deseamos mucha suerte! 🍀

*Equipo PelicanoTV* 🚀`;

      await this.client.sendMessage(numberId._serialized, bingoMessage);
      
      // Esperar 3 segundos antes de enviar el PDF
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Descargar y enviar el PDF
      console.log('📄 Descargando PDF desde:', tableData.file_url);
      
      const response = await axios.get(tableData.file_url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.status !== 200) {
        throw new Error(`Error al descargar PDF: Status ${response.status}`);
      }

      // Crear media desde buffer
      const media = new MessageMedia(
        'application/pdf',
        Buffer.from(response.data).toString('base64'),
        tableData.file_name
      );

      // Enviar PDF con caption
      await this.client.sendMessage(numberId._serialized, media, {
        caption: `🎯 *Tu tabla de BINGO AMIGO PRIME*\n\n📋 Código: ${tableData.table_code}\n\n¡Guarda bien este PDF para participar! 🍀`
      });

      console.log('✅ Tabla de BINGO enviada exitosamente a:', phoneNumber);
      return { success: true, tableCode: tableData.table_code };

    } catch (error) {
      console.error('❌ Error al enviar tabla de BINGO:', error);
      
      if (error.message.includes('wid error: invalid wid')) {
        throw new Error('Formato de número de teléfono inválido');
      } else if (error.message.includes('Phone number is not registered')) {
        throw new Error('El número no está registrado en WhatsApp');
      } else if (error.message.includes('Protocol error')) {
        this.handleConnectionLoss();
        throw new Error('Error de conexión. Reintentando...');
      } else if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
        throw new Error('Error al descargar el archivo PDF');
      }
      
      throw error;
    }
  }


  async markForManualCleanup() {
    const cleanupMarker = path.join(this.sessionPath, '.cleanup_needed');
    try {
      fs.writeFileSync(cleanupMarker, new Date().toISOString());
      console.log('📝 Sesión marcada para limpieza manual');
    } catch (error) {
      console.error('Error al crear marcador de limpieza:', error);
    }
  }

  // MÉTODOS DE CONTROL MEJORADOS

  getStatus() {
    return {
      isReady: this.isReady,
      status: this.status,
      hasQR: !!this.qr,
      reconnectAttempts: this.reconnectAttempts,
      sessionExists: fs.existsSync(this.sessionPath),
      needsManualCleanup: fs.existsSync(path.join(this.sessionPath, '.cleanup_needed'))
    };
  }

  getQR() {
    return this.qr;
  }

  async restart() {
    console.log('🔄 Reiniciando servicio WhatsApp...');
    
    await this.gracefulDestroy();
    
    this.isReady = false;
    this.qr = null;
    this.status = 'restarting';
    this.reconnectAttempts = 0;
    
    setTimeout(() => {
      this.initializeClient();
    }, 3000); // Aumentado el delay
  }

  async forceReauth() {
    console.log('🔑 Forzando re-autenticación...');
    await this.gracefulSessionCleanup();
    await this.restart();
  }

  async shutdown() {
    console.log('🔌 Cerrando servicio WhatsApp...');
    
    await this.gracefulDestroy();
    
    this.isReady = false;
    this.status = 'shutdown';
  }

  // MÉTODO PARA LIMPIEZA MANUAL DE EMERGENCIA
  async emergencyCleanup() {
    console.log('🚨 Ejecutando limpieza de emergencia...');
    
    // Matar todos los procesos de Chrome/Chromium si es posible
    try {
      const { exec } = require('child_process');
      if (process.platform === 'win32') {
        exec('taskkill /f /im chrome.exe /t', () => {});
        exec('taskkill /f /im chromium.exe /t', () => {});
      } else {
        exec('pkill -f chrome', () => {});
        exec('pkill -f chromium', () => {});
      }
    } catch (error) {
      console.log('⚠️ No se pudieron cerrar procesos del navegador');
    }
    
    // Esperar y limpiar
    await new Promise(resolve => setTimeout(resolve, 5000));
    await this.cleanSessionWithRetries();
  }
}

// Exportar una instancia singleton
module.exports = new WhatsAppOTPService();