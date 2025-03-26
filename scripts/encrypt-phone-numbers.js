/**
 * سكريبت لتشفير جميع أرقام الهواتف الموجودة في قاعدة البيانات
 * استخدم هذا السكريبت مرة واحدة فقط لتحويل البيانات الموجودة
 */

const db = require('../config/db');
const encryption = require('../utils/encryption');

const migrateData = async () => {
  console.log('بدء عملية تشفير أرقام الهواتف في قاعدة البيانات...');
  
  try {
    // الحصول على جميع جهات الاتصال
    const { rows } = await db.query('SELECT * FROM whatsapp_contacts');
    console.log(`تم العثور على ${rows.length} جهة اتصال للمعالجة.`);
    
    // عداد للإحصائيات
    let encryptedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // معالجة كل جهة اتصال
    for (const contact of rows) {
      try {
        // تخطي الأرقام الفارغة
        if (!contact.number || contact.number.trim() === '') {
          skippedCount++;
          continue;
        }
        
        // التحقق مما إذا كان الرقم مشفرًا بالفعل
        let isAlreadyEncrypted = false;
        try {
          // نحاول فك التشفير، إذا نجح فهو مشفر بالفعل
          encryption.decrypt(contact.number);
          isAlreadyEncrypted = true;
        } catch (decryptError) {
          // إذا فشل فك التشفير، فالرقم ليس مشفرًا بعد
          isAlreadyEncrypted = false;
        }
        
        if (isAlreadyEncrypted) {
          console.log(`تخطي الرقم (${contact.id}) لأنه مشفر بالفعل.`);
          skippedCount++;
          continue;
        }
        
        // تشفير الرقم وتحديث قاعدة البيانات
        const encryptedNumber = encryption.encrypt(contact.number);
        await db.query(
          'UPDATE whatsapp_contacts SET number = $1 WHERE id = $2',
          [encryptedNumber, contact.id]
        );
        
        encryptedCount++;
        console.log(`تم تشفير الرقم لجهة الاتصال رقم ${contact.id} بنجاح.`);
      } catch (error) {
        errorCount++;
        console.error(`فشل تشفير الرقم لجهة الاتصال رقم ${contact.id}:`, error.message);
      }
    }
    
    console.log('\n--- إحصائيات العملية ---');
    console.log(`إجمالي جهات الاتصال المعالجة: ${rows.length}`);
    console.log(`تم تشفير: ${encryptedCount}`);
    console.log(`تم تخطي: ${skippedCount}`);
    console.log(`فشل: ${errorCount}`);
    console.log('اكتملت عملية الترحيل!');
    
  } catch (error) {
    console.error('حدث خطأ أثناء عملية الترحيل:', error);
  } finally {
    // إغلاق اتصال قاعدة البيانات
    process.exit(0);
  }
};

// تنفيذ السكريبت
migrateData(); 