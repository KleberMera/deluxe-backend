const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

class BingoTableServiceOCR {
  constructor() {
    // Palabras clave básicas - más flexible
    this.validationKeywords = [
      'BINGO',
      'AMIGO', 
      'PRIME',
      'PELICANO',
      'PELICANOTV',
      'VIERNES',
      '8PM',
      '8 PM'
    ];
    
    // Solo necesita 1 palabra clave para pasar
    this.minKeywordsRequired = 1;
  }

  /**
   * Preprocesamiento básico y rápido
   */
  async quickPreprocess(imagePath) {
    try {
      if (!fs.existsSync(imagePath)) {
        console.error('❌ Archivo no existe:', imagePath);
        return imagePath;
      }

      const processedPath = imagePath.replace(path.extname(imagePath), '_quick.png');
      
      // Preprocesamiento mínimo pero efectivo
      await sharp(imagePath)
        .resize(1200, null, { withoutEnlargement: false })
        .greyscale()
        .normalize()
        .sharpen()
        .png({ quality: 90 })
        .toFile(processedPath);
      
      console.log('✅ Imagen procesada:', processedPath);
      return processedPath;
      
    } catch (error) {
      console.error('⚠️ Error en preprocesamiento, usando original:', error.message);
      return imagePath;
    }
  }

  /**
   * Normaliza texto de forma simple
   */
  normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .toUpperCase()
      .replace(/[^\w\sÁÉÍÓÚÑ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Validación simple - encuentra alguna palabra clave
   */
  validateKeywords(text) {
    const normalizedText = this.normalizeText(text);
    const foundKeywords = [];
    
    console.log('🔍 Buscando palabras clave en:', normalizedText.substring(0, 150));
    
    for (const keyword of this.validationKeywords) {
      if (normalizedText.includes(keyword)) {
        foundKeywords.push(keyword);
        console.log('✅ Encontrado:', keyword);
      }
    }
    
    const isValid = foundKeywords.length >= this.minKeywordsRequired;
    
    return {
      isValid,
      foundKeywords,
      confidence: foundKeywords.length / this.validationKeywords.length
    };
  }

  /**
   * OCR de un solo intento
   */
  async performSingleOCR(imagePath) {
    let worker = null;
    
    try {
      console.log('🤖 Iniciando OCR único...');
      
      worker = await Tesseract.createWorker('spa+eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      // Configuración simple pero efectiva
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚÑáéíóúñ '
      });
      
      const { data: { text, confidence } } = await worker.recognize(imagePath);
      
      await worker.terminate();
      return { text, confidence };
      
    } catch (error) {
      console.error('❌ Error en OCR:', error.message);
      
      if (worker) {
        try {
          await worker.terminate();
        } catch (e) {
          console.error('Error cerrando worker:', e);
        }
      }
      
      throw error;
    }
  }

  /**
   * Validación principal - UN SOLO INTENTO
   */
  async validateBingoTable(imagePath) {
    let processedImagePath = null;
    
    try {
      console.log('🎯 Validación OCR - Un solo intento');
      
      if (!imagePath) {
        throw new Error('imagePath requerido');
      }
      
      console.log('📥 Procesando:', imagePath);
      
      // Preprocesar imagen
      processedImagePath = await this.quickPreprocess(imagePath);
      
      // Un solo intento de OCR
      const { text, confidence } = await this.performSingleOCR(processedImagePath);
      
      console.log('📝 Texto extraído:', text.substring(0, 200) + '...');
      console.log('🎯 Confianza OCR:', confidence);
      
      // Validar palabras clave
      const validation = this.validateKeywords(text);
      
      // Limpiar archivo temporal
      if (processedImagePath !== imagePath && fs.existsSync(processedImagePath)) {
        fs.unlinkSync(processedImagePath);
      }
      
      console.log('✅ Resultado:', validation.isValid ? 'VÁLIDO' : 'NO VÁLIDO');
      console.log('📊 Palabras encontradas:', validation.foundKeywords);
      
      return {
        success: true,
        isValidTable: validation.isValid,
        extractedText: text,
        ocrConfidence: confidence,
        foundKeywords: validation.foundKeywords,
        validation: validation
      };
      
    } catch (error) {
      console.error('❌ Error en validación:', error.message);
      
      // Limpiar en caso de error
      if (processedImagePath && processedImagePath !== imagePath && fs.existsSync(processedImagePath)) {
        try {
          fs.unlinkSync(processedImagePath);
        } catch (e) {
          console.error('Error limpiando archivo:', e);
        }
      }
      
      return {
        success: false,
        error: error.message,
        isValidTable: false
      };
    }
  }

  /**
   * Test rápido para debugging
   */
  async quickTest(imagePath) {
    try {
      console.log('🧪 Test rápido OCR');
      
      const { text, confidence } = await this.performSingleOCR(imagePath);
      const validation = this.validateKeywords(text);
      
      return {
        success: true,
        text: text,
        confidence: confidence,
        isValid: validation.isValid,
        foundKeywords: validation.foundKeywords,
        normalizedText: this.normalizeText(text)
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = BingoTableServiceOCR;