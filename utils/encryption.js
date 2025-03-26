const crypto = require('crypto');
const dotenv = require('dotenv');

// تحميل متغيرات البيئة
dotenv.config();

// المفتاح وvector الافتراضي في حال عدم توفرهما في ملف البيئة - يجب أن يكونوا بالطول المطلوب
const DEFAULT_ENCRYPTION_KEY = 'whatsapp-message-secure-key-32bytes!';
const DEFAULT_ENCRYPTION_IV = 'secure-iv-16bytes';

// دالة تحضير المفتاح بطول صحيح (32 بايت)
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY;
  // تأكد من أن المفتاح بطول 32 بايت
  return key.padEnd(32).slice(0, 32);
};

// دالة تحضير الـ IV بطول صحيح (16 بايت)
const getEncryptionIV = () => {
  const iv = process.env.ENCRYPTION_IV || DEFAULT_ENCRYPTION_IV;
  // تأكد من أن الـ IV بطول 16 بايت
  return iv.padEnd(16).slice(0, 16);
};

// دالة تشفير النصوص
const encrypt = (text) => {
  // إذا كان النص فارغا أو غير موجود، أعد نصا فارغا
  if (!text) return '';
  
  try {
    // إنشاء cipher باستخدام المفتاح وال vector
    const key = Buffer.from(getEncryptionKey());
    const iv = Buffer.from(getEncryptionIV());
    
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    // تشفير النص
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
  } catch (error) {
    console.error('Encryption failed:', error);
    return text; // في حالة الفشل، أعد النص الأصلي
  }
};

// دالة فك تشفير النصوص
const decrypt = (encryptedText) => {
  // إذا كان النص المشفر فارغا أو غير موجود، أعد نصا فارغا
  if (!encryptedText) return '';
  
  try {
    // إنشاء decipher باستخدام المفتاح وال vector
    const key = Buffer.from(getEncryptionKey());
    const iv = Buffer.from(getEncryptionIV());
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    // فك تشفير النص
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // console.error('فشل فك تشفير البيانات:', error);
    return encryptedText; // في حالة الفشل، أعد النص المشفر
  }
};

// دالة خاصة للتعامل مع البيانات الموجودة بالفعل في قاعدة البيانات
// تستخدم عند أول تشغيل للتطبيق بعد تفعيل التشفير
const isEncrypted = (text) => {
  // محاولة فك تشفير النص للتحقق مما إذا كان مشفرًا بالفعل
  try {
    // نحاول فك التشفير، إذا نجح بدون أخطاء فهو مشفر بالفعل
    decrypt(text);
    // النص يبدو كأنه مشفر بالفعل (لم تحدث أخطاء عند فك التشفير)
    return true;
  } catch (error) {
    // إذا حدث خطأ عند فك التشفير، فالنص ليس مشفرًا بعد
    return false;
  }
};

module.exports = {
  encrypt,
  decrypt,
  isEncrypted
}; 