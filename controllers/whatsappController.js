const whatsappService = require('../services/whatsapp');
const aiService = require('../services/ai');
const db = require('../config/db');
const encryption = require('../utils/encryption');

// Render dashboard
const dashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get WhatsApp session status
    const sessionStatus = await whatsappService.getSessionStatus(userId);
    
    // Get contacts count - handle if table doesn't exist
    let contacts = [];
    try {
      const contactsResult = await db.query(
        'SELECT * FROM whatsapp_contacts WHERE user_id = $1',
        [userId]
      );
      // تطبيق منطق أكثر أمانًا للتعامل مع الأرقام المشفرة وغير المشفرة
      contacts = contactsResult.rows.map(contact => {
        // لا تحاول فك تشفير الرقم إذا كان فارغًا
        if (!contact.number) {
          return { ...contact, number: '' };
        }
        
        try {
          // محاولة فك تشفير الرقم
          return { ...contact, number: encryption.decrypt(contact.number) };
        } catch (decryptError) {
          // إذا فشل فك التشفير، يمكن أن يكون الرقم غير مشفر أصلاً
          console.error(`فشل فك تشفير رقم الهاتف: ${decryptError.message}`);
          return contact; // إرجاع الرقم كما هو
        }
      });
    } catch (err) {
      console.error('Error querying contacts:', err.message);
    }
    
    // Get AI conversations count - handle if table doesn't exist
    let aiConversations = [];
    try {
      const aiConversationsResult = await db.query(
        'SELECT * FROM ai_conversations WHERE user_id = $1',
        [userId]
      );
      aiConversations = aiConversationsResult.rows || [];
    } catch (err) {
      console.error('Error querying AI conversations:', err.message);
    }
    
    // Check if AI is configured - handle if table doesn't exist
    let isAIConfigured = false;
    try {
      const aiConfigResult = await db.query(
        'SELECT * FROM ai_settings WHERE user_id = $1',
        [userId]
      );
      isAIConfigured = aiConfigResult.rows.length > 0;
    } catch (err) {
      console.error('Error querying AI settings:', err.message);
    }
    
    res.render('dashboard/home', {
      user: req.user,
      sessionStatus,
      currentPage: 'dashboard',
      isWhatsAppConnected: sessionStatus && sessionStatus.status === 'READY',
      contacts,
      aiConversations,
      isAIConfigured
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading dashboard. Please try again.'
    });
  }
};

// Initialize WhatsApp client and show QR code
const initializeWhatsApp = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check current session status
    const currentStatus = await whatsappService.getSessionStatus(userId);
    
    // If already authenticated, redirect to contacts
    if (currentStatus.is_active && 
        (currentStatus.status === 'AUTHENTICATED' || currentStatus.status === 'READY')) {
      return res.redirect('/whatsapp/contacts');
    }
    
    // Initialize client
    const initResult = await whatsappService.initializeClient(userId);
    
    if (!initResult.success) {
      return res.status(500).render('partials/error', {
        error: `Error initializing WhatsApp: ${initResult.error}`
      });
    }
    
    // Setup AI message handler
    await whatsappService.setupMessageListener(userId, aiService.handleWhatsAppMessage);
    
    // Get contacts count - handle if table doesn't exist
    let contacts = [];
    try {
      const contactsResult = await db.query(
        'SELECT * FROM whatsapp_contacts WHERE user_id = $1',
        [userId]
      );
      // تطبيق منطق أكثر أمانًا للتعامل مع الأرقام المشفرة وغير المشفرة
      contacts = contactsResult.rows.map(contact => {
        // لا تحاول فك تشفير الرقم إذا كان فارغًا
        if (!contact.number) {
          return { ...contact, number: '' };
        }
        
        try {
          // محاولة فك تشفير الرقم
          return { ...contact, number: encryption.decrypt(contact.number) };
        } catch (decryptError) {
          // إذا فشل فك التشفير، يمكن أن يكون الرقم غير مشفر أصلاً
          console.error(`فشل فك تشفير رقم الهاتف: ${decryptError.message}`);
          return contact; // إرجاع الرقم كما هو
        }
      });
    } catch (err) {
      console.error('Error querying contacts:', err.message);
    }
    
    // Get AI conversations count - handle if table doesn't exist
    let aiConversations = [];
    try {
      const aiConversationsResult = await db.query(
        'SELECT * FROM ai_conversations WHERE user_id = $1',
        [userId]
      );
      aiConversations = aiConversationsResult.rows || [];
    } catch (err) {
      console.error('Error querying AI conversations:', err.message);
    }
    
    // Check if AI is configured - handle if table doesn't exist
    let isAIConfigured = false;
    try {
      const aiConfigResult = await db.query(
        'SELECT * FROM ai_settings WHERE user_id = $1',
        [userId]
      );
      isAIConfigured = aiConfigResult.rows.length > 0;
    } catch (err) {
      console.error('Error querying AI settings:', err.message);
    }
    
    // Show QR code page
    res.render('dashboard/whatsapp-auth', {
      user: req.user,
      currentPage: 'whatsapp-auth',
      isWhatsAppConnected: currentStatus.status === 'READY',
      contacts,
      aiConversations,
      isAIConfigured
    });
  } catch (error) {
    console.error('WhatsApp initialization error:', error);
    res.status(500).render('partials/error', {
      error: 'Error initializing WhatsApp. Please try again.'
    });
  }
};

// Get current QR code or session status
const getSessionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionStatus = await whatsappService.getSessionStatus(userId);
    
    res.json(sessionStatus);
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({
      error: 'Error getting session status'
    });
  }
};

// Get all contacts and chats
const getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if client is ready
    const sessionStatus = await whatsappService.getSessionStatus(userId);
    
    if (!sessionStatus.is_active || sessionStatus.status !== 'READY') {
      return res.redirect('/whatsapp/auth');
    }
    
    // Check if client exists in active clients map
    if (!whatsappService.activeClients.has(userId)) {
      console.log("Client not found in active clients map, attempting to reinitialize...");
      // Try to reconnect the client
      const reconnectResult = await whatsappService.reconnectClient(userId);
      
      if (!reconnectResult.success) {
        return res.status(500).render('partials/error', {
          error: `Failed to initialize WhatsApp client: ${reconnectResult.error}`
        });
      }
      
      console.log("Client reinitialized successfully, waiting for initialization to complete...");
      // Wait for client to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Get contacts from WhatsApp
    const contactsResult = await whatsappService.getContacts(userId);
    const chatsResult = await whatsappService.getChats(userId);
    
    if (!contactsResult.success || !chatsResult.success) {
      const errorMsg = contactsResult.error || chatsResult.error;
      console.error(`Error getting contacts or chats: ${errorMsg}`);
      
      // If the error indicates the client is not ready, try to reconnect
      if (errorMsg.includes('not ready') || errorMsg.includes('not initialized')) {
        console.log("Client not ready, attempting to reconnect...");
        await whatsappService.reconnectClient(userId);
        
        return res.status(500).render('partials/error', {
          error: 'WhatsApp needs to be reauthorized. Please go to <a href="/whatsapp/auth">WhatsApp Authentication</a> page.'
        });
      }
      
      return res.status(500).render('partials/error', {
        error: `Error fetching contacts or chats: ${errorMsg}`
      });
    }
    
    // Process and organize contacts and chats
    const contacts = contactsResult.contacts
      .filter(contact => !contact.isMe && contact.name)
      .map(contact => ({
        id: contact.id._serialized,
        name: contact.name || contact.pushname || 'Unknown',
        number: contact.number,
        isGroup: false
      }));
    
    const groups = chatsResult.chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: true
      }));
    
    // Save contacts to database if not already saved
    await saveContactsToDatabase(userId, [...contacts, ...groups]);
    
    // Get saved contacts from database
    const { rows } = await db.query(
      'SELECT * FROM whatsapp_contacts WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    
    // فك تشفير أرقام الهواتف قبل إرسالها للعرض
    const decryptedContacts = rows.map(contact => {
      // لا تحاول فك تشفير الرقم إذا كان فارغًا
      if (!contact.number) {
        return { ...contact, number: '' };
      }
      
      try {
        // محاولة فك تشفير الرقم
        return { ...contact, number: encryption.decrypt(contact.number) };
      } catch (decryptError) {
        // إذا فشل فك التشفير، يمكن أن يكون الرقم غير مشفر أصلاً
        return contact; // إرجاع الرقم كما هو
      }
    });
    
    // Get AI conversations count - handle if table doesn't exist
    let aiConversations = [];
    try {
      const aiConversationsResult = await db.query(
        'SELECT * FROM ai_conversations WHERE user_id = $1',
        [userId]
      );
      aiConversations = aiConversationsResult.rows || [];
    } catch (err) {
      console.error('Error querying AI conversations:', err.message);
    }
    
    // Check if AI is configured - handle if table doesn't exist
    let isAIConfigured = false;
    try {
      const aiConfigResult = await db.query(
        'SELECT * FROM ai_settings WHERE user_id = $1',
        [userId]
      );
      isAIConfigured = aiConfigResult.rows.length > 0;
    } catch (err) {
      console.error('Error querying AI settings:', err.message);
    }
    
    res.render('dashboard/contacts', {
      user: req.user,
      contacts: decryptedContacts,
      currentPage: 'contacts',
      isWhatsAppConnected: sessionStatus.status === 'READY',
      aiConversations,
      isAIConfigured
    });
  } catch (error) {
    console.error('Contacts error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading contacts. Please try again.'
    });
  }
};

// Helper function to save contacts to database
const saveContactsToDatabase = async (userId, contacts) => {
  try {
    for (const contact of contacts) {
      const { rows } = await db.query(
        'SELECT * FROM whatsapp_contacts WHERE user_id = $1 AND contact_id = $2',
        [userId, contact.id]
      );
      
      // تشفير رقم الهاتف إذا لم يكن فارغًا وغير مشفر بالفعل
      let encryptedNumber = '';
      if (contact.number && contact.number.trim() !== '') {
        encryptedNumber = encryption.encrypt(contact.number);
      }
      
      if (rows.length === 0) {
        // Insert new contact
        await db.query(
          'INSERT INTO whatsapp_contacts (user_id, contact_id, name, number, is_group) VALUES ($1, $2, $3, $4, $5)',
          [userId, contact.id, contact.name, encryptedNumber, contact.id.endsWith('@g.us')]
        );
      } else {
        // Update existing contact
        await db.query(
          'UPDATE whatsapp_contacts SET name = $1, number = $2, is_group = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4 AND contact_id = $5',
          [contact.name, encryptedNumber, contact.id.endsWith('@g.us'), userId, contact.id]
        );
      }
    }
  } catch (error) {
    console.error('Error saving contacts to database:', error);
    throw error;
  }
};

// Render send message page
const renderSendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get contacts from database
    let rows = [];
    try {
      const result = await db.query(
        'SELECT * FROM whatsapp_contacts WHERE user_id = $1 ORDER BY name',
        [userId]
      );
      rows = result.rows;
      
      // فك تشفير أرقام الهواتف قبل إرسالها للعرض
      rows = rows.map(contact => {
        // لا تحاول فك تشفير الرقم إذا كان فارغًا
        if (!contact.number) {
          return { ...contact, number: '' };
        }
        
        try {
          // محاولة فك تشفير الرقم
          return { ...contact, number: encryption.decrypt(contact.number) };
        } catch (decryptError) {
          // إذا فشل فك التشفير، يمكن أن يكون الرقم غير مشفر أصلاً
          return contact; // إرجاع الرقم كما هو
        }
      });
    } catch (err) {
      console.error('Error querying contacts:', err.message);
    }
    
    // Get WhatsApp session status
    const sessionStatus = await whatsappService.getSessionStatus(userId);
    
    // Get AI conversations count - handle if table doesn't exist
    let aiConversations = [];
    try {
      const aiConversationsResult = await db.query(
        'SELECT * FROM ai_conversations WHERE user_id = $1',
        [userId]
      );
      aiConversations = aiConversationsResult.rows || [];
    } catch (err) {
      console.error('Error querying AI conversations:', err.message);
    }
    
    // Check if AI is configured - handle if table doesn't exist
    let isAIConfigured = false;
    try {
      const aiConfigResult = await db.query(
        'SELECT * FROM ai_settings WHERE user_id = $1',
        [userId]
      );
      isAIConfigured = aiConfigResult.rows.length > 0;
    } catch (err) {
      console.error('Error querying AI settings:', err.message);
    }
    
    res.render('dashboard/send-message', {
      user: req.user,
      contacts: rows,
      currentPage: 'send-message',
      isWhatsAppConnected: sessionStatus && sessionStatus.status === 'READY',
      aiConversations,
      isAIConfigured
    });
  } catch (error) {
    console.error('Send message page error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading send message page. Please try again.'
    });
  }
};

// Send message to contacts
const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contacts, manualNumbers, message } = req.body;
    
    if ((!contacts || contacts.length === 0) && (!manualNumbers || manualNumbers.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'يجب تحديد جهة اتصال واحدة على الأقل أو إدخال رقم هاتف'
      });
    }
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'الرسالة مطلوبة'
      });
    }
    
    // التحقق من حالة العميل وإعادة الاتصال إذا لزم الأمر
    if (!whatsappService.activeClients.has(userId)) {
      console.log("Client not found in active clients map when sending message, attempting to reconnect...");
      // محاولة إعادة الاتصال
      const reconnectResult = await whatsappService.reconnectClient(userId);
      
      if (!reconnectResult.success) {
        return res.status(500).json({
          success: false,
          error: 'فشل الاتصال بـ WhatsApp. يرجى إعادة تسجيل الدخول أولاً.',
          details: reconnectResult.error
        });
      }
      
      console.log("Client reconnected successfully, waiting for initialization to complete...");
      // انتظار اكتمال التهيئة
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // التحقق من أن العميل جاهز بعد إعادة الاتصال
      const sessionStatus = await whatsappService.getSessionStatus(userId);
      if (!sessionStatus.is_active || sessionStatus.status !== 'READY') {
        return res.status(500).json({
          success: false,
          error: 'خطأ في اتصال WhatsApp. يرجى إعادة تسجيل الدخول من صفحة المصادقة.',
          redirect: '/whatsapp/auth'
        });
      }
    }
    
    // جمع كل الوجهات (جهات الاتصال والأرقام المدخلة يدويًا)
    const destinations = [];
    
    // إضافة جهات الاتصال المحددة
    if (contacts && contacts.length > 0) {
      const contactIds = Array.isArray(contacts) ? contacts : [contacts];
      contactIds.forEach(id => {
        destinations.push({ type: 'contact', id });
      });
    }
    
    // إضافة الأرقام المدخلة يدويًا
    if (manualNumbers && (Array.isArray(manualNumbers) ? manualNumbers.length > 0 : manualNumbers.trim() !== '')) {
      // التأكد من أن manualNumbers هو مصفوفة
      let phoneNumbers = [];
      
      if (Array.isArray(manualNumbers)) {
        phoneNumbers = manualNumbers;
      } else if (typeof manualNumbers === 'string') {
        // تقسيم النص على الفواصل إذا كان نصًا
        phoneNumbers = manualNumbers.split(',').map(num => num.trim()).filter(num => num !== '');
      } else {
        phoneNumbers = [manualNumbers.toString()];
      }
      
      // معالجة كل رقم
      phoneNumbers.forEach(number => {
        // تنظيف الرقم من أي أحرف غير رقمية
        const cleanNumber = String(number).replace(/\D/g, '');
        if (cleanNumber.length >= 10 && cleanNumber.length <= 15) {
          destinations.push({ type: 'number', number: cleanNumber });
        } else {
          console.log(`تم تجاهل رقم غير صالح: ${number}`);
        }
      });
    }
    
    // إرسال الرسالة إلى كل وجهة
    const results = [];
    
    for (const destination of destinations) {
      let result;
      
      if (destination.type === 'contact') {
        // إرسال إلى جهة اتصال موجودة
        result = await whatsappService.sendMessage(userId, destination.id, message);
        results.push({
          contactId: destination.id,
          success: result.success,
          error: result.error,
          messageId: result.messageId
        });
      } else {
        // إرسال إلى رقم جديد
        result = await whatsappService.sendMessageToNumber(userId, destination.number, message);
        results.push({
          number: destination.number,
          success: result.success,
          error: result.error,
          messageId: result.messageId
        });
        
        // حفظ الرقم في قاعدة البيانات إذا نجح الإرسال
        if (result.success) {
          try {
            // تشفير الرقم قبل التخزين إذا كان غير فارغ
            const encryptedNumber = destination.number ? encryption.encrypt(destination.number) : '';
            
            // التحقق مما إذا كان الرقم موجودًا بالفعل (نبحث بالرقم المشفر)
            const checkResult = await db.query(
              'SELECT * FROM whatsapp_contacts WHERE user_id = $1 AND number = $2',
              [userId, encryptedNumber]
            );
            
            if (checkResult.rows.length === 0) {
              // إضافة الرقم إلى جهات الاتصال مع علامة أنه تمت إضافته يدويًا
              await db.query(
                'INSERT INTO whatsapp_contacts (user_id, contact_id, name, number, is_group, is_manual) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, result.chatId || `${destination.number}@c.us`, `رقم ${destination.number}`, encryptedNumber, false, true]
              );
            }
          } catch (dbError) {
            console.error('Error saving manual number to contacts:', dbError);
            // لا نوقف العملية إذا فشل الحفظ في قاعدة البيانات
          }
        }
      }
      
      // إذا فشل الإرسال بسبب عدم تهيئة العميل، حاول إعادة الاتصال ثم أعد المحاولة مرة واحدة
      if (!result.success && result.error === 'WhatsApp client not initialized') {
        console.log(`Attempting to reconnect client for user ${userId} after send failure`);
        
        const reconnectResult = await whatsappService.reconnectClient(userId);
        if (reconnectResult.success) {
          console.log(`Successfully reconnected client, trying to send message again`);
          
          // انتظار اكتمال التهيئة
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // إعادة محاولة الإرسال
          if (destination.type === 'contact') {
            result = await whatsappService.sendMessage(userId, destination.id, message);
            // تحديث النتيجة
            const resultIndex = results.findIndex(r => r.contactId === destination.id);
            if (resultIndex !== -1) {
              results[resultIndex] = {
                contactId: destination.id,
                success: result.success,
                error: result.error,
                messageId: result.messageId,
                reconnected: true
              };
            }
          } else {
            result = await whatsappService.sendMessageToNumber(userId, destination.number, message);
            // تحديث النتيجة
            const resultIndex = results.findIndex(r => r.number === destination.number);
            if (resultIndex !== -1) {
              results[resultIndex] = {
                number: destination.number,
                success: result.success,
                error: result.error,
                messageId: result.messageId,
                reconnected: true
              };
            }
            
            // حفظ الرقم في قاعدة البيانات إذا نجح الإرسال بعد إعادة الاتصال
            if (result.success) {
              try {
                // تشفير الرقم قبل التخزين إذا كان غير فارغ
                const encryptedNumber = destination.number ? encryption.encrypt(destination.number) : '';
                
                // نبحث بالرقم المشفر
                const checkResult = await db.query(
                  'SELECT * FROM whatsapp_contacts WHERE user_id = $1 AND number = $2',
                  [userId, encryptedNumber]
                );
                
                if (checkResult.rows.length === 0) {
                  await db.query(
                    'INSERT INTO whatsapp_contacts (user_id, contact_id, name, number, is_group, is_manual) VALUES ($1, $2, $3, $4, $5, $6)',
                    [userId, result.chatId || `${destination.number}@c.us`, `رقم ${destination.number}`, encryptedNumber, false, true]
                  );
                }
              } catch (dbError) {
                console.error('Error saving manual number to contacts after reconnect:', dbError);
              }
            }
          }
        }
      }
    }
    
    // إعادة النتائج
    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء إرسال الرسالة. يرجى المحاولة مرة أخرى.'
    });
  }
};

// Logout from WhatsApp
const logoutWhatsApp = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Logout
    await whatsappService.logout(userId);
    
    res.redirect('/whatsapp/dashboard');
  } catch (error) {
    console.error('WhatsApp logout error:', error);
    res.status(500).render('partials/error', {
      error: 'Error during WhatsApp logout. Please try again.'
    });
  }
};

// Reconnect WhatsApp client
const reconnectWhatsApp = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`Reconnect request received for user ${userId}`);
    
    // Force client reconnection
    const reconnectResult = await whatsappService.reconnectClient(userId);
    
    if (!reconnectResult.success) {
      console.error(`Failed to reconnect WhatsApp client for user ${userId}:`, reconnectResult.error);
      return res.status(500).json({
        success: false,
        error: reconnectResult.error
      });
    }
    
    console.log(`Successfully reconnected WhatsApp client for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Reconnection initiated'
    });
  } catch (error) {
    console.error('WhatsApp reconnect error:', error);
    res.status(500).json({
      success: false,
      error: 'Error during reconnection. Please try again.'
    });
  }
};

module.exports = {
  dashboard,
  initializeWhatsApp,
  getSessionStatus,
  getContacts,
  renderSendMessage,
  sendMessage,
  logoutWhatsApp,
  reconnectWhatsApp
}; 