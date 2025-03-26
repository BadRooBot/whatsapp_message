const db = require('../config/db');
const encryption = require('../utils/encryption');
const whatsappService = require('../services/whatsapp');
const bcrypt = require('bcrypt');

// عرض صفحة الملف الشخصي
const renderProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // الحصول على بيانات المستخدم الإضافية إذا وجدت
    const { rows } = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).render('partials/error', {
        error: 'لم يتم العثور على المستخدم'
      });
    }
    
    // الحصول على حالة جلسة WhatsApp
    const { rows: sessionRows } = await db.query(
      'SELECT session_data, is_active FROM whatsapp_sessions WHERE user_id = $1',
      [userId]
    );
    
    let isWhatsAppConnected = false;
    if (sessionRows.length > 0) {
      const sessionData = JSON.parse(sessionRows[0].session_data);
      isWhatsAppConnected = sessionRows[0].is_active && sessionData.status === 'READY';
    }
    
    // الحصول على عدد جهات الاتصال
    const { rows: contactsCount } = await db.query(
      'SELECT COUNT(*) FROM whatsapp_contacts WHERE user_id = $1',
      [userId]
    );
    
    // الحصول على عدد الرسائل المرسلة
    const { rows: messagesCount } = await db.query(
      'SELECT COUNT(*) FROM whatsapp_messages WHERE user_id = $1',
      [userId]
    );
    
    // التحقق مما إذا كان AI مُكوَّنًا
    const { rows: aiConfig } = await db.query(
      'SELECT * FROM ai_settings WHERE user_id = $1',
      [userId]
    );
    
    const isAIConfigured = aiConfig.length > 0;
    
    // Check for message in query parameters (for redirects with status messages)
    const message = req.query.message ? {
      type: req.query.type || 'info',
      text: req.query.message
    } : null;
    
    res.render('dashboard/profile', {
      user: req.user,
      profile: rows[0],
      currentPage: 'profile',
      message: message,
      stats: {
        contactsCount: parseInt(contactsCount[0].count) || 0,
        messagesCount: parseInt(messagesCount[0].count) || 0,
        isAIConfigured,
        isWhatsAppConnected
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).render('partials/error', {
      error: 'حدث خطأ أثناء تحميل الملف الشخصي. الرجاء المحاولة مرة أخرى.'
    });
  }
};

// تحديث بيانات الملف الشخصي
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, currentPassword, newPassword } = req.body;
    
    // تحقق من إدخال الاسم والبريد الإلكتروني
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: 'الاسم والبريد الإلكتروني مطلوبان'
      });
    }
    
    // إذا كان المستخدم يريد تغيير كلمة المرور
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: 'يجب إدخال كلمة المرور الحالية لتغيير كلمة المرور'
        });
      }
      
      // تحقق من كلمة المرور الحالية
      const { rows } = await db.query(
        'SELECT password FROM users WHERE id = $1',
        [userId]
      );
      
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'لم يتم العثور على المستخدم'
        });
      }
      
      const bcrypt = require('bcrypt');
      const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
      
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          error: 'كلمة المرور الحالية غير صحيحة'
        });
      }
      
      // تشفير كلمة المرور الجديدة
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      // تحديث البيانات مع كلمة المرور الجديدة
      await db.query(
        'UPDATE users SET name = $1, email = $2, password = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [name, email, hashedPassword, userId]
      );
    } else {
      // تحديث البيانات بدون تغيير كلمة المرور
      await db.query(
        'UPDATE users SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [name, email, userId]
      );
    }
    
    // تحديث البيانات في جلسة المستخدم
    req.user.name = name;
    req.user.email = email;
    
    // Opción 1: Devolver JSON para solicitudes AJAX
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.json({
        success: true,
        message: 'تم تحديث الملف الشخصي بنجاح'
      });
    } 
    // Opción 2: Redirigir con un mensaje para solicitudes normales
    else {
      res.redirect('/profile?message=تم تحديث الملف الشخصي بنجاح&type=success');
    }
  } catch (error) {
    console.error('Profile update error:', error);
    
    // Opción 1: Devolver JSON para solicitudes AJAX
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء تحديث الملف الشخصي. الرجاء المحاولة مرة أخرى.'
      });
    } 
    // Opción 2: Redirigir con un mensaje de error para solicitudes normales
    else {
      res.redirect('/profile?message=حدث خطأ أثناء تحديث الملف الشخصي&type=danger');
    }
  }
};

// حذف الحساب
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;
    
    // التحقق من إدخال كلمة المرور
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال كلمة المرور للتأكيد'
      });
    }
    
    // التحقق من صحة كلمة المرور
    const { rows } = await db.query(
      'SELECT password FROM users WHERE id = $1',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المستخدم'
      });
    }
    
    const isMatch = await bcrypt.compare(password, rows[0].password);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور غير صحيحة'
      });
    }
    
    // بدء عملية في قاعدة البيانات
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // تسجيل الخروج من WhatsApp وإزالة جلسة WhatsApp
      try {
        // تحقق من وجود جلسة WhatsApp
        const { rows: sessionRows } = await client.query(
          'SELECT id FROM whatsapp_sessions WHERE user_id = $1',
          [userId]
        );
        
        if (sessionRows.length > 0) {
          // محاولة تسجيل الخروج من جلسة WhatsApp
          try {
            await whatsappService.logout(userId);
          } catch (logoutError) {
            console.error('Error logging out of WhatsApp session:', logoutError);
            // استمر في حذف البيانات بغض النظر عن خطأ تسجيل الخروج
          }
          
          // حذف جلسة WhatsApp من قاعدة البيانات
          await client.query(
            'DELETE FROM whatsapp_sessions WHERE user_id = $1',
            [userId]
          );
        }
      } catch (whatsappError) {
        console.error('Error handling WhatsApp session:', whatsappError);
        // استمر في حذف البيانات بغض النظر عن خطأ WhatsApp
      }
      
      // حذف جميع بيانات المستخدم من جميع الجداول
      
      // حذف إعدادات الذكاء الاصطناعي
      await client.query(
        'DELETE FROM ai_settings WHERE user_id = $1',
        [userId]
      );
      
      // حذف محادثات الذكاء الاصطناعي
      await client.query(
        'DELETE FROM ai_conversations WHERE user_id = $1',
        [userId]
      );
      
      // حذف سجلات رسائل WhatsApp
      await client.query(
        'DELETE FROM whatsapp_messages WHERE user_id = $1',
        [userId]
      );
      
      // حذف جهات اتصال WhatsApp
      await client.query(
        'DELETE FROM whatsapp_contacts WHERE user_id = $1',
        [userId]
      );
      
      // حذف المستخدم نفسه (اختياري: يمكن وضع علامة "محذوف" بدلاً من الحذف الفعلي)
      await client.query(
        'DELETE FROM users WHERE id = $1',
        [userId]
      );
      
      // تأكيد العملية
      await client.query('COMMIT');
      
      // تسجيل الخروج من الجلسة (إذا كانت الوظيفة متاحة)
      if (typeof req.logout === 'function') {
        // تعامل مع الإصدارات الحديثة من Passport التي تتطلب وظيفة رد
        req.logout(function(err) {
          if (err) {
            console.error('Error logging out:', err);
          }
          
          // إرسال استجابة النجاح
          res.json({
            success: true,
            message: 'تم حذف الحساب بنجاح'
          });
        });
      } else {
        // إذا لم تكن وظيفة تسجيل الخروج متاحة، فقط قم بتدمير الجلسة
        if (req.session) {
          req.session.destroy(function(err) {
            if (err) {
              console.error('Error destroying session:', err);
            }
          });
        }
        
        // إرسال استجابة النجاح بغض النظر
        res.json({
          success: true,
          message: 'تم حذف الحساب بنجاح'
        });
      }
    } catch (error) {
      // التراجع عن العملية في حالة حدوث خطأ
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // إعادة العميل إلى المجمع
      client.release();
    }
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء محاولة حذف الحساب. الرجاء المحاولة مرة أخرى.'
    });
  }
};

module.exports = {
  getProfile: renderProfile,
  updateProfile,
  deleteAccount
}; 