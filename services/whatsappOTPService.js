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
      this.maxReconnectAttempts = 3; // Reducido
      this.reconnectDelay = 10000; // Aumentado
      this.heartbeatInterval = null;
      this.sessionPath = path.join(__dirname, '../.wwebjs_auth');
      this.isShuttingDown = false;
      this.initializationTimeout = null;
      this.readyTimeout = null;
      this.loadingStuckTimeout = null;
      this.loading100Timeout = null;
      this.readyFailures = 0; // Contador de fallos de ready
      this.maxReadyFailures = 3; // Máximo de fallos antes de limpiar sesión
      
      this.ensureSessionDirectory();
      this.initializeClient();
    }

    ensureSessionDirectory() {
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
        console.log('📁 Directorio de sesión creado:', this.sessionPath);
      }
    }

    initializeClient() {
      if (this.isShuttingDown) return;
      
      console.log('🚀 Inicializando cliente WhatsApp...');
      
      // Limpiar timeout anterior
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
      }
      
      try {
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
              '--disable-gpu',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor',
              '--no-first-run',
              '--no-zygote',
              '--disable-background-timer-throttling',
              '--disable-backgrounding-occluded-windows',
              '--disable-renderer-backgrounding',
              '--disable-extensions',
              '--disable-plugins',
              '--disable-default-apps',
              '--disable-translate',
              '--disable-sync',
              '--no-default-browser-check',
              '--disable-ipc-flooding-protection',
              '--disable-hang-monitor',
              '--disable-prompt-on-repost',
              '--disable-domain-reliability',
              '--disable-client-side-phishing-detection',
              '--disable-component-extensions-with-background-pages',
              '--disable-background-networking',
              '--disable-features=TranslateUI',
              '--disable-features=BlinkGenPropertyTrees',
              '--remote-debugging-port=0',
              '--single-process',
              '--disable-accelerated-2d-canvas',
              '--disable-accelerated-jpeg-decoding',
              '--disable-accelerated-mjpeg-decode',
              '--disable-accelerated-video-decode',
              '--disable-accelerated-video-encode',
              '--disable-app-list-dismiss-on-blur',
              '--disable-background-timer-throttling'
            ],
            timeout: 180000, // Aumentado para dar más tiempo
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
          },
          webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
          },
          // Configuración adicional para estabilidad
          authTimeoutMs: 60000,
          qrMaxRetries: 5
        });
        
        this.setupClientListeners();
        
        // Timeout para la inicialización
        this.initializationTimeout = setTimeout(() => {
          console.log('⏱️ Timeout en inicialización, reiniciando...');
          this.handleInitializationTimeout();
        }, 180000); // 3 minutos timeout
        
        this.client.initialize().catch(err => {
          console.error('❌ Error al inicializar WhatsApp:', err);
          this.handleClientError(err);
        });
        
      } catch (error) {
        console.error('❌ Error al crear cliente:', error);
        this.handleClientError(error);
      }
    }

    setupClientListeners() {
      if (!this.client) return;

      this.client.on('qr', async (qr) => {
        try {
          console.log('📱 QR Code generado - Escanea para autenticar');
          this.qr = await qrcode.toDataURL(qr);
          this.status = 'qr_ready';
          this.emit('qr', this.qr);
          
          // Limpiar timeout de inicialización cuando se genera QR
          if (this.initializationTimeout) {
            clearTimeout(this.initializationTimeout);
            this.initializationTimeout = null;
          }
        } catch (error) {
          console.error('❌ Error al generar QR:', error);
        }
      });

      this.client.on('authenticated', () => {
        console.log('✅ WhatsApp autenticado correctamente');
        this.status = 'authenticated';
        this.reconnectAttempts = 0;
        
        // Limpiar timeout
        if (this.initializationTimeout) {
          clearTimeout(this.initializationTimeout);
          this.initializationTimeout = null;
        }

        // Agregar timeout para forzar ready si no llega
        this.readyTimeout = setTimeout(() => {
          console.log('⚠️ Timeout esperando evento ready, forzando reinicio...');
          this.handleReadyTimeout();
        }, 30000); // Reducido a 30 segundos timeout para ready
      });

      this.client.on('ready', () => {
        console.log('🟢 WhatsApp cliente listo y operativo');
        this.isReady = true;
        this.status = 'ready';
        this.qr = null;
        this.reconnectAttempts = 0;
        this.readyFailures = 0; // Reset contador de fallos
        this.emit('ready');
        
        // Limpiar todos los timeouts cuando esté ready
        if (this.initializationTimeout) {
          clearTimeout(this.initializationTimeout);
          this.initializationTimeout = null;
        }
        if (this.readyTimeout) {
          clearTimeout(this.readyTimeout);
          this.readyTimeout = null;
        }
        if (this.loading100Timeout) {
          clearTimeout(this.loading100Timeout);
          this.loading100Timeout = null;
        }
        if (this.loadingStuckTimeout) {
          clearTimeout(this.loadingStuckTimeout);
          this.loadingStuckTimeout = null;
        }
        
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
        
        // Limpiar timeout
        if (this.initializationTimeout) {
          clearTimeout(this.initializationTimeout);
          this.initializationTimeout = null;
        }
        
        this.handleAuthFailure();
      });

      this.client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Cargando WhatsApp: ${percent}% - ${message}`);
        
        // Si se queda atascado en 99% por mucho tiempo, reiniciar
        if (percent === 99) {
          if (this.loadingStuckTimeout) {
            clearTimeout(this.loadingStuckTimeout);
          }
          
          this.loadingStuckTimeout = setTimeout(() => {
            // Solo reiniciar si NO está ready
            if (!this.isReady) {
              console.log('⚠️ WhatsApp atascado en 99%, forzando reinicio...');
              this.handleLoadingStuck();
            }
          }, 45000); // Aumentado a 45 segundos para dar más tiempo
        } else if (percent === 100) {
          // Limpiar timeout cuando llega a 100%
          if (this.loadingStuckTimeout) {
            clearTimeout(this.loadingStuckTimeout);
            this.loadingStuckTimeout = null;
          }
          
          // Nuevo timeout específico para cuando llega a 100% pero no se hace ready
          this.loading100Timeout = setTimeout(() => {
            // Solo reiniciar si NO está ready
            if (!this.isReady) {
              console.log('⚠️ WhatsApp llegó a 100% pero no está ready, forzando reinicio...');
              this.handleLoading100Stuck();
            }
          }, 30000); // 30 segundos timeout después de llegar a 100%
        }
      });

      this.client.on('change_state', (state) => {
        console.log('🔄 Estado cambiado a:', state);
      });
    }

    handleInitializationTimeout() {
      console.log('⏱️ Timeout en inicialización detectado');
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }
      
      this.status = 'timeout';
      this.handleClientError(new Error('Initialization timeout'));
    }

    handleLoadingStuck() {
      console.log('⏱️ WhatsApp atascado en carga, reiniciando...');
      if (this.loadingStuckTimeout) {
        clearTimeout(this.loadingStuckTimeout);
        this.loadingStuckTimeout = null;
      }
      
      this.status = 'loading_stuck';
      this.isReady = false;
      
      // Reiniciar cliente después de detectar que está atascado
      setTimeout(async () => {
        if (!this.isShuttingDown) {
          console.log('🔄 Reiniciando por loading stuck...');
          await this.gracefulDestroy();
          await new Promise(resolve => setTimeout(resolve, 5000));
          this.initializeClient();
        }
      }, 2000);
    }

    handleLoading100Stuck() {
      console.log('⏱️ WhatsApp atascado en 100% sin ready, reiniciando...');
      if (this.loading100Timeout) {
        clearTimeout(this.loading100Timeout);
        this.loading100Timeout = null;
      }
      
      this.status = 'loading_100_stuck';
      this.isReady = false;
      
      // Limpiar sesión para forzar re-autenticación
      setTimeout(async () => {
        if (!this.isShuttingDown) {
          console.log('🧹 Limpiando sesión por loading 100% stuck...');
          await this.gracefulSessionCleanup();
          this.initializeClient();
        }
      }, 1000);
    }

    handleReadyTimeout() {
      console.log('⏱️ Timeout esperando evento ready, forzando reinicio...');
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }
      
      this.status = 'ready_timeout';
      this.isReady = false;
      this.readyFailures++;
      
      console.log(`📊 Fallos de ready: ${this.readyFailures}/${this.maxReadyFailures}`);
      
      // Si alcanzamos el máximo de fallos, limpiar sesión completamente
      if (this.readyFailures >= this.maxReadyFailures) {
        console.log('🧹 Máximo de fallos de ready alcanzado, limpiando sesión completamente...');
        setTimeout(async () => {
          if (!this.isShuttingDown) {
            await this.gracefulSessionCleanup();
            this.readyFailures = 0; // Reset contador
            await new Promise(resolve => setTimeout(resolve, 10000)); // Esperar más tiempo
            this.initializeClient();
          }
        }, 2000);
      } else {
        // Reiniciar cliente sin limpiar sesión
        setTimeout(async () => {
          if (!this.isShuttingDown) {
            console.log('🔄 Reiniciando por timeout de ready...');
            await this.gracefulDestroy();
            await new Promise(resolve => setTimeout(resolve, 5000));
            this.initializeClient();
          }
        }, 2000);
      }
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
      }, 60000); // Cada minuto
    }

    stopHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }

    handleDisconnection(reason) {
      console.log(`🔄 Manejando desconexión: ${reason}`);
      
      if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
        console.log('🗑️ Sesión terminada por el usuario, limpiando datos...');
        this.gracefulSessionCleanup();
        return;
      }
      
      if (!this.isShuttingDown) {
        this.attemptReconnection();
      }
    }

    handleConnectionLoss() {
      if (!this.isReady || this.isShuttingDown) return;
      
      console.log('📡 Pérdida de conexión detectada');
      this.isReady = false;
      this.status = 'reconnecting';
      this.attemptReconnection();
    }

    async attemptReconnection() {
      if (this.isShuttingDown) return;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('❌ Máximo de intentos de reconexión alcanzado');
        this.status = 'failed';
        this.emit('max_reconnect_reached');
        return;
      }

      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      
      console.log(`🔄 Intento de reconexión ${this.reconnectAttempts}/${this.maxReconnectAttempts} en ${delay}ms`);
      
      setTimeout(async () => {
        if (this.isShuttingDown) return;
        
        try {
          await this.gracefulDestroy();
          // Esperar más tiempo antes de reinicializar
          await new Promise(resolve => setTimeout(resolve, 5000));
          this.initializeClient();
        } catch (error) {
          console.error('❌ Error en intento de reconexión:', error);
          if (!this.isShuttingDown) {
            this.attemptReconnection();
          }
        }
      }, delay);
    }

    handleAuthFailure() {
      console.log('🧹 Limpiando sesión por fallo de autenticación...');
      setTimeout(async () => {
        if (!this.isShuttingDown) {
          await this.gracefulSessionCleanup();
          this.restart();
        }
      }, 5000);
    }

    handleClientError(error) {
      console.error('❌ Error del cliente:', error);
      this.status = 'error';
      
      // Limpiar timeout si existe
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }
      
      if (!this.isShuttingDown) {
        setTimeout(() => {
          console.log('🔄 Reintentando inicialización...');
          this.restart();
        }, 15000); // Aumentado el delay
      }
    }

    async gracefulDestroy() {
      console.log('🔄 Cerrando cliente de manera controlada...');
      this.isShuttingDown = true;
      this.stopHeartbeat();
      
      // Limpiar todos los timeouts
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }
      
      if (this.readyTimeout) {
        clearTimeout(this.readyTimeout);
        this.readyTimeout = null;
      }

      if (this.loadingStuckTimeout) {
        clearTimeout(this.loadingStuckTimeout);
        this.loadingStuckTimeout = null;
      }

      if (this.loading100Timeout) {
        clearTimeout(this.loading100Timeout);
        this.loading100Timeout = null;
      }
      
      try {
        if (this.client) {
          // Esperar más tiempo para que se cierren las conexiones
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Verificar si el cliente aún existe antes de destruir
          if (this.client && typeof this.client.destroy === 'function') {
            await this.client.destroy();
            console.log('✅ Cliente destruido correctamente');
          }
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
      
      await this.gracefulDestroy();
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.cleanSessionWithRetries();
    }

    async cleanSessionWithRetries(maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🗑️ Intento ${attempt}/${maxRetries} de limpieza de sesión...`);
          
          if (fs.existsSync(this.sessionPath)) {
            fs.rmSync(this.sessionPath, { 
              recursive: true, 
              force: true,
              maxRetries: 3,
              retryDelay: 2000
            });
            
            console.log('✅ Sesión limpiada exitosamente');
            return;
          }
          
        } catch (error) {
          console.error(`❌ Error en intento ${attempt}:`, error.message);
          
          if (attempt === maxRetries) {
            console.error('❌ No se pudo limpiar la sesión completamente');
          } else {
            await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
          }
        }
      }
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
        const message = `🔐 Tu código de verificación de Pelícano TV es: ${otpCode}\n\n⚠️ No lo compartas con nadie.\n\n_Este código expira en 5 minutos._`;
        
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
  ✅ Tu registro en *Pelícano TV* ha sido completado exitosamente.

  📱 Ya formas parte de nuestra comunidad y podrás recibir notificaciones importantes.

  🔔 Te mantendremos informado sobre:
  ✅ *Bingo Amigo Prime*
  ✅ *Noticias LIBERTENSES*
  ✅ *Podcast PTG*

  ¡Gracias por registrarte con nosotros!

  *Equipo Pelícano TV* 🚀`;
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

      // Intentar descargar el PDF
      console.log('📄 Descargando PDF desde:', tableData.file_url);
      
      let pdfBuffer;
      try {
        const response = await axios.get(tableData.file_url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (response.status !== 200) {
          throw new Error(`Error al descargar PDF: Status ${response.status}`);
        }
        
        pdfBuffer = response.data;
      } catch (downloadError) {
        console.error('❌ Error al descargar PDF, intentando URLs alternativas...', downloadError);
        
        // Array de URLs alternativas (incluyendo por IP)
        const fallbackUrls = [
          tableData.file_url.replace('registro.pelicanotv.com/tablas', 'pelicanotvcanal.com/tablas'),
          tableData.file_url.replace('registro.pelicanotv.com/tablas', '34.127.92.12/tablas'),
          // Agregar más IPs de respaldo si es necesario
          tableData.file_url.replace(/https?:\/\/[^\/]+/, 'http://34.127.92.12')
        ];
        
        let lastError;
        for (const fallbackUrl of fallbackUrls) {
          try {
            console.log('🔄 Intentando con URL alternativa:', fallbackUrl);
            
            const fallbackResponse = await axios.get(fallbackUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            if (fallbackResponse.status === 200) {
              pdfBuffer = fallbackResponse.data;
              break; // Salir del bucle si fue exitoso
            }
          } catch (urlError) {
            lastError = urlError;
            console.error(`❌ Error con URL ${fallbackUrl}:`, urlError.message);
            continue; // Intentar con la siguiente URL
          }
        }
        
        if (!pdfBuffer) {
          throw new Error(`Error al descargar PDF de todas las URLs: ${lastError?.message || 'URLs no disponibles'}`);
        }
      }

      // Crear media desde buffer
      const media = new MessageMedia(
        'application/pdf',
        Buffer.from(pdfBuffer).toString('base64'),
        tableData.file_name
      );

      // Enviar PDF con caption completo (incluyendo saludo y toda la info)
      const caption = `🎯 ¡Hola ${firstName}!

  ¡Tu tabla de *BINGO AMIGO PRIME* está lista! 🎉

  📋 *Código de tabla:* ${tableData.table_code}
  🎲 Ya puedes participar en nuestros bingos!

  ¡Guarda bien este PDF para participar! 🍀
  ¡Te deseamos mucha suerte! 🍀

  *Equipo Pelícano TV* 🚀`;

      await this.client.sendMessage(numberId._serialized, media, {
        caption: caption
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
        throw new Error('Error al descargar el archivo PDF desde todas las URLs');
      }
      
      throw error;
    }
  }
    
    
  /**
   * Enviar mensaje personalizado (para campañas masivas)
   * @param {string} phoneNumber - Número de teléfono
   * @param {string} message - Mensaje a enviar
   * @param {Object} imageData - Datos de imagen opcional { url, fileName }
   * @returns {Object} - Resultado del envío
   */
  async sendCustomMessage(phoneNumber, message, imageData = null) {
    if (!this.isReady) {
      throw new Error(`Cliente WhatsApp no está listo. Estado actual: ${this.status}`);
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      console.log('📤 Enviando mensaje personalizado a:', formattedNumber);
      
      const numberId = await this.client.getNumberId(formattedNumber);
      if (!numberId) {
        throw new Error('El número no está registrado en WhatsApp');
      }

      // Si hay datos de imagen, descargar y enviar con imagen
      if (imageData && imageData.url) {
        console.log('📎 Descargando imagen desde:', imageData.url);
        
        try {
          const response = await axios.get(imageData.url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          
          if (response.status !== 200) {
            throw new Error(`Error al descargar imagen: Status ${response.status}`);
          }

          // Determinar el tipo MIME basado en la extensión del archivo
          const fileName = imageData.fileName || 'image.jpg';
          let mimeType = 'image/jpeg';
          
          if (fileName.toLowerCase().endsWith('.png')) {
            mimeType = 'image/png';
          } else if (fileName.toLowerCase().endsWith('.gif')) {
            mimeType = 'image/gif';
          } else if (fileName.toLowerCase().endsWith('.webp')) {
            mimeType = 'image/webp';
          }

          // Crear media desde buffer
          const media = new MessageMedia(
            mimeType,
            Buffer.from(response.data).toString('base64'),
            fileName
          );

          // Enviar mensaje con imagen
          await this.client.sendMessage(numberId._serialized, media, {
            caption: message
          });

          console.log('✅ Mensaje con imagen enviado exitosamente a:', phoneNumber);
          
        } catch (downloadError) {
          console.error('❌ Error al descargar imagen:', downloadError);
          // Si falla la descarga de imagen, enviar solo el mensaje de texto
          console.log('📝 Enviando mensaje de texto como fallback...');
          await this.client.sendMessage(numberId._serialized, message);
          console.log('✅ Mensaje de texto enviado exitosamente a:', phoneNumber);
        }
        
      } else {
        // Enviar solo mensaje de texto
        await this.client.sendMessage(numberId._serialized, message);
        console.log('✅ Mensaje personalizado enviado exitosamente a:', phoneNumber);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error al enviar mensaje personalizado:', error);
      
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

  // Agregar este método a tu clase WhatsAppOTPService

  async sendConfirmationMessage(phoneNumber, firstName, tableRange) {
    if (!this.isReady) {
      throw new Error(`Cliente WhatsApp no está listo. Estado actual: ${this.status}`);
    }

    try {
      const formattedNumber = this.formatPhoneNumber(phoneNumber);
      console.log('✅ Enviando confirmación de tabla a:', formattedNumber);
      
      const numberId = await this.client.getNumberId(formattedNumber);
      
      if (!numberId) {
        throw new Error('El número no está registrado en WhatsApp');
      }

      const confirmationMessage = `✅ *Registro completado*

  Tu registro y tabla de BINGO (rango ${tableRange}) han sido creados exitosamente.

  📱 ¡Ya estás listo para participar!

  *Equipo Pelícano TV* 🚀`;

      await this.client.sendMessage(numberId._serialized, confirmationMessage);
      
      console.log('✅ Confirmación de tabla enviada exitosamente a:', phoneNumber);
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error al enviar confirmación de tabla:', error);
      
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

    async getStatus() {
      let clientState = null;
      let hasRequiredMethods = false;
      
      try {
        if (this.client && this.isReady) {
          clientState = await this.client.getState();
          hasRequiredMethods = typeof this.client.sendMessage === 'function' && 
                             typeof this.client.getNumberId === 'function';
        }
      } catch (error) {
        console.error('⚠️ Error al obtener estado del cliente:', error);
        clientState = null;
      }
      
      const effectiveReady = this.isReady && 
                           this.status === 'ready' && 
                           this.client !== null && 
                           !this.isShuttingDown &&
                           hasRequiredMethods;
      
      return {
        isReady: this.isReady,
        status: this.status,
        hasQR: !!this.qr,
        reconnectAttempts: this.reconnectAttempts,
        sessionExists: fs.existsSync(this.sessionPath),
        hasInitTimeout: !!this.initializationTimeout,
        hasReadyTimeout: !!this.readyTimeout,
        hasLoadingTimeout: !!this.loadingStuckTimeout,
        hasLoading100Timeout: !!this.loading100Timeout,
        readyFailures: this.readyFailures,
        maxReadyFailures: this.maxReadyFailures,
        effectiveReady: effectiveReady,
        clientState: clientState,
        hasRequiredMethods: hasRequiredMethods
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
        if (!this.isShuttingDown) {
          this.initializeClient();
        }
      }, 5000);
    }

    async forceReauth() {
      console.log('🔑 Forzando re-autenticación...');
      await this.gracefulSessionCleanup();
      await this.restart();
    }

    async forceCleanRestart() {
      console.log('🧹 Forzando limpieza completa y reinicio...');
      this.readyFailures = 0;
      this.reconnectAttempts = 0;
      
      // Detener todo primero
      await this.gracefulDestroy();
      
      // Limpiar sesión con más tiempo de espera
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.cleanSessionWithRetries(5); // Más intentos
      
      // Esperar más tiempo antes de reiniciar
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      // Reinicializar
      this.status = 'force_restarting';
      this.initializeClient();
    }

    async shutdown() {
      console.log('🔌 Cerrando servicio WhatsApp...');
      this.isShuttingDown = true;
      
      await this.gracefulDestroy();
      
      this.isReady = false;
      this.status = 'shutdown';
    }
  }

  // Exportar una instancia singleton
  module.exports = new WhatsAppOTPService();
