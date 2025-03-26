const aiService = require('../services/ai');
const db = require('../config/db');
const encryption = require('../utils/encryption');

// Configure AI settings
const configureAI = async (req, res) => {
  try {
    const { 
      apiKey, 
      model,
      temperature,
      maxTokens,
      systemPrompt,
      autoReply, 
      autoReplyMode,
      allowedNumbers, 
      blockedNumbers,
      groupReply,
      allowedGroups,
      groupTrigger,
      memoryEnabled,
      memoryWindow
    } = req.body;
    
    // التحقق من وجود مفتاح API
    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'مفتاح API مطلوب' });
    }
    
    const userId = req.user.id;
    
    // التحقق من وجود إعدادات للمستخدم
    const { rows } = await db.query('SELECT * FROM ai_settings WHERE user_id = $1', [userId]);
    
    if (rows.length > 0) {
      // تحديث الإعدادات الموجودة
      await db.query(
        `UPDATE ai_settings SET 
          api_key = $1, 
          model = $2,
          temperature = $3,
          max_tokens = $4,
          system_prompt = $5,
          auto_reply = $6, 
          auto_reply_mode = $7,
          allowed_numbers = $8,
          blocked_numbers = $9,
          group_reply = $10,
          allowed_groups = $11,
          group_trigger = $12,
          enable_memory = $13,
          memory_window = $14,
          updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $15`,
        [
          apiKey,
          model || 'deepseek/deepseek-chat:free',
          parseFloat(temperature) || 0.7,
          parseInt(maxTokens) || 500,
          systemPrompt || '',
          autoReply ? true : false,
          autoReplyMode || 'whitelist',
          allowedNumbers ? JSON.stringify(allowedNumbers) : '[]',
          blockedNumbers ? JSON.stringify(blockedNumbers) : '[]',
          groupReply ? true : false,
          allowedGroups ? JSON.stringify(allowedGroups) : '[]',
          groupTrigger || '',
          memoryEnabled ? true : false,
          parseInt(memoryWindow) || 5,
          userId
        ]
      );
    } else {
      // إنشاء إعدادات جديدة
      await db.query(
        `INSERT INTO ai_settings (
          user_id, 
          api_key,
          model,
          temperature,
          max_tokens,
          system_prompt,
          auto_reply, 
          auto_reply_mode,
          allowed_numbers,
          blocked_numbers,
          group_reply,
          allowed_groups,
          group_trigger,
          enable_memory,
          memory_window,
          created_at, 
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId, 
          apiKey,
          model || 'deepseek/deepseek-chat:free',
          parseFloat(temperature) || 0.7,
          parseInt(maxTokens) || 500,
          systemPrompt || '',
          autoReply ? true : false,
          autoReplyMode || 'whitelist',
          allowedNumbers ? JSON.stringify(allowedNumbers) : '[]',
          blockedNumbers ? JSON.stringify(blockedNumbers) : '[]',
          groupReply ? true : false,
          allowedGroups ? JSON.stringify(allowedGroups) : '[]',
          groupTrigger || '',
          memoryEnabled ? true : false,
          parseInt(memoryWindow) || 5
        ]
      );
    }
    
    res.json({ success: true, message: 'تم حفظ إعدادات الذكاء الاصطناعي بنجاح' });
  } catch (error) {
    console.error('Error configuring AI:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء حفظ الإعدادات' });
  }
};

// Get AI conversation history
const getAIHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get history from database
    const { rows } = await db.query(
      `SELECT ar.*, wc.name as contact_name
       FROM ai_responses ar
       JOIN whatsapp_contacts wc ON ar.contact_id = wc.contact_id AND ar.user_id = wc.user_id
       WHERE ar.user_id = $1
       ORDER BY ar.created_at DESC
       LIMIT 100`,
      [userId]
    );
    
    // فك تشفير الرسائل والردود قبل إرسالها للعرض
    const decryptedRows = rows.map(row => {
      let message = row.message;
      let response = row.response;
      
      try {
        // محاولة فك تشفير الرسالة
        message = encryption.decrypt(row.message);
      } catch (error) {
        console.log(`خطأ فك تشفير رسالة في سجل المحادثات: ${error.message}`);
        // استخدام النص الأصلي في حالة الفشل
      }
      
      try {
        // محاولة فك تشفير الرد
        response = encryption.decrypt(row.response);
      } catch (error) {
        console.log(`خطأ فك تشفير رد في سجل المحادثات: ${error.message}`);
        // استخدام النص الأصلي في حالة الفشل
      }
      
      return { 
        ...row, 
        message: message, 
        response: response 
      };
    });
    
    res.render('dashboard/ai-history', {
      user: req.user,
      history: decryptedRows
    });
  } catch (error) {
    console.error('AI history error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading AI conversation history. Please try again.'
    });
  }
};

// Test AI response
const testAIResponse = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    // Generate response
    const result = await aiService.generateResponse(message);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
    res.json({
      success: true,
      response: result.response
    });
  } catch (error) {
    console.error('AI test error:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating AI response. Please try again.'
    });
  }
};

// Render AI dashboard page
const renderAIDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get AI settings from database
    const { rows: settingsRows } = await db.query(
      'SELECT * FROM ai_settings WHERE user_id = $1',
      [userId]
    );
    
    // استخراج الإعدادات من قاعدة البيانات أو استخدام القيم الافتراضية إذا لم تكن موجودة
    let aiSettings = {
      enabled: false,
      auto_reply: false,
      model: 'deepseek/deepseek-chat:free',
      temperature: 0.7,
      max_tokens: 500,
      system_prompt: '',
      enable_memory: false,
      memory_window: 10,
      group_reply: false,
      group_trigger: '',
      allowed_groups: [],
      allowed_numbers: []
    };
    
    if (settingsRows.length > 0) {
      aiSettings = settingsRows[0];
      
      // تحويل الأرقام المسموح بها من JSONB إلى JavaScript Array
      if (typeof aiSettings.allowed_numbers === 'string') {
        try {
          aiSettings.allowed_numbers = JSON.parse(aiSettings.allowed_numbers);
        } catch (e) {
          console.error('Error parsing allowed_numbers JSON:', e);
          aiSettings.allowed_numbers = [];
        }
      }
      
      // تأكد من أن allowed_numbers هو مصفوفة
      if (!Array.isArray(aiSettings.allowed_numbers)) {
        aiSettings.allowed_numbers = [];
      }
      
      console.log('Loaded AI settings from database:', {
        autoReply: aiSettings.auto_reply,
        allowedNumbersType: typeof aiSettings.allowed_numbers,
        allowedNumbers: aiSettings.allowed_numbers
      });
    }
    
    // الحصول على النماذج المتاحة من OpenRouter API
    const modelsResult = await aiService.getAvailableModels();
    const availableModels = modelsResult.success ? modelsResult.models : [];
    
    // Get recent AI interactions
    const { rows } = await db.query(
      `SELECT ar.*, wc.name as contact_name
       FROM ai_responses ar
       JOIN whatsapp_contacts wc ON ar.contact_id = wc.contact_id AND ar.user_id = wc.user_id
       WHERE ar.user_id = $1
       ORDER BY ar.created_at DESC
       LIMIT 10`,
      [userId]
    );
    
    // فك تشفير الرسائل والردود الأخيرة قبل عرضها
    const decryptedInteractions = rows.map(row => {
      let message = row.message;
      let response = row.response;
      
      try {
        // محاولة فك تشفير الرسالة
        message = encryption.decrypt(row.message);
      } catch (error) {
        console.log(`خطأ فك تشفير رسالة في لوحة التحكم: ${error.message}`);
        // استخدام النص الأصلي في حالة الفشل
      }
      
      try {
        // محاولة فك تشفير الرد
        response = encryption.decrypt(row.response);
      } catch (error) {
        console.log(`خطأ فك تشفير رد في لوحة التحكم: ${error.message}`);
        // استخدام النص الأصلي في حالة الفشل
      }
      
      return { 
        ...row, 
        message: message, 
        response: response 
      };
    });
    
    res.render('dashboard/ai-dashboard', {
      user: req.user,
      aiSettings,
      recentInteractions: decryptedInteractions,
      availableModels: availableModels
    });
  } catch (error) {
    console.error('AI dashboard error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading AI dashboard. Please try again.'
    });
  }
};

// Get detailed conversation history for a specific contact
const getConversationDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.contactId;
    
    if (!contactId) {
      return res.status(400).render('partials/error', {
        error: 'Contact ID is required'
      });
    }
    
    // Get contact information
    const { rows: contactRows } = await db.query(
      'SELECT * FROM whatsapp_contacts WHERE user_id = $1 AND contact_id = $2',
      [userId, contactId]
    );
    
    if (contactRows.length === 0) {
      return res.status(404).render('partials/error', {
        error: 'Contact not found'
      });
    }
    
    const contact = contactRows[0];
    
    // فك تشفير رقم الهاتف إذا كان موجودًا
    let decryptedNumber = '';
    if (contact.number) {
      try {
        decryptedNumber = encryption.decrypt(contact.number);
      } catch (e) {
        console.error('Error decrypting phone number:', e);
        decryptedNumber = contact.number; // استخدم الرقم كما هو إذا فشل فك التشفير
      }
    }
    
    // Get conversation messages - sent messages from user
    const { rows: sentMessages } = await db.query(
      `SELECT 'user' as role, message as content, created_at 
       FROM whatsapp_messages 
       WHERE user_id = $1 AND contact_id = $2 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId, contactId]
    );
    
    // Get AI responses
    const { rows: aiResponses } = await db.query(
      `SELECT 'assistant' as role, message as user_message, response as content, created_at 
       FROM ai_responses 
       WHERE user_id = $1 AND contact_id = $2 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId, contactId]
    );
    
    // فك تشفير جميع الرسائل
    const decryptedSentMessages = sentMessages.map(msg => {
      let content = msg.content;
      try {
        // محاولة فك تشفير المحتوى
        content = encryption.decrypt(msg.content);
      } catch (error) {
        console.log(`خطأ فك تشفير رسالة: ${error.message}`);
        // استخدام المحتوى الأصلي في حالة الفشل
      }
      return {
        ...msg,
        content: content,
        timestamp: msg.created_at
      };
    });
    
    const decryptedAiResponses = aiResponses.map(msg => {
      let content = msg.content;
      let userMessage = msg.user_message;
      try {
        // محاولة فك تشفير المحتوى
        content = encryption.decrypt(msg.content);
      } catch (error) {
        console.log(`خطأ فك تشفير رد الذكاء الاصطناعي: ${error.message}`);
        // استخدام المحتوى الأصلي في حالة الفشل
      }
      
      try {
        // محاولة فك تشفير رسالة المستخدم
        userMessage = encryption.decrypt(msg.user_message);
      } catch (error) {
        console.log(`خطأ فك تشفير رسالة المستخدم: ${error.message}`);
        // استخدام المحتوى الأصلي في حالة الفشل
      }
      
      return {
        ...msg,
        content: content,
        user_message: userMessage,
        timestamp: msg.created_at
      };
    });
    
    // دمج الرسائل وترتيبها حسب التاريخ (الأحدث أولاً)
    const allMessages = [...decryptedSentMessages, ...decryptedAiResponses]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.render('dashboard/conversation-details', {
      user: req.user,
      contact: {
        ...contact,
        number: decryptedNumber
      },
      messages: allMessages,
      currentPage: 'ai-history'
    });
  } catch (error) {
    console.error('Conversation details error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading conversation details. Please try again.'
    });
  }
};

// الحصول على النماذج المتاحة من OpenRouter API
const getAvailableModels = async (req, res) => {
  try {
    const modelsResult = await aiService.getAvailableModels();
    
    if (!modelsResult.success) {
      return res.status(500).json({
        success: false,
        error: modelsResult.error || 'حدث خطأ أثناء جلب النماذج المتاحة'
      });
    }
    
    res.json({
      success: true,
      models: modelsResult.models
    });
  } catch (error) {
    console.error('Error fetching AI models:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء جلب النماذج المتاحة'
    });
  }
};

// دالة جديدة للبحث في جهات الاتصال
const searchContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;
    
    if (!query) {
      return res.json({ success: true, contacts: [] });
    }
    
    // البحث في قاعدة البيانات
    let contacts = [];
    
    // الحصول على جهات الاتصال من قاعدة البيانات
    const { rows } = await db.query(
      'SELECT * FROM whatsapp_contacts WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    
    // فك تشفير أرقام الهواتف
    const decryptedContacts = rows.map(contact => {
      // عدم محاولة فك تشفير إذا كان الرقم فارغًا
      if (!contact.number) {
        return { ...contact, number: '' };
      }
      
      try {
        // محاولة فك تشفير الرقم
        return { ...contact, number: encryption.decrypt(contact.number) };
      } catch (decryptError) {
        // إذا فشل فك التشفير، قد يكون الرقم غير مشفر أصلاً
        return contact; // إرجاع الرقم كما هو
      }
    });
    
    // البحث في جهات الاتصال المفكوكة التشفير
    contacts = decryptedContacts.filter(contact => {
      // تحويل النص إلى أحرف صغيرة للمقارنة وإزالة المسافات
      const searchQuery = query.toLowerCase().replace(/\s/g, '');
      
      // التحقق مما إذا كان النص المدخل رقمًا أم نصًا
      const isNumber = /^\d+$/.test(searchQuery);
      
      if (isNumber) {
        // البحث في الرقم
        return contact.number && contact.number.replace(/\D/g, '').includes(searchQuery);
      } else {
        // البحث في الاسم
        const contactName = (contact.name || '').toLowerCase().replace(/\s/g, '');
        return contactName.includes(searchQuery);
      }
    });
    
    // إعادة نتائج البحث
    res.json({
      success: true,
      contacts: contacts.map(contact => ({
        id: contact.contact_id,
        name: contact.name,
        number: contact.number,
        isGroup: contact.is_group
      }))
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء البحث في جهات الاتصال'
    });
  }
};

// دالة إضافة جميع المجموعات إلى قائمة المحظورة
const addAllGroupsToBlocked = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // الحصول على إعدادات AI الحالية
    const { rows: settingsRows } = await db.query(
      'SELECT * FROM ai_settings WHERE user_id = $1',
      [userId]
    );
    
    if (settingsRows.length === 0) {
      return res.json({
        success: false,
        error: 'لم يتم العثور على إعدادات الذكاء الاصطناعي'
      });
    }
    
    const aiSettings = settingsRows[0];
    
    // تحويل الأرقام المحظورة من JSONB إلى JavaScript Array
    let blockedNumbers = [];
    if (typeof aiSettings.blocked_numbers === 'string') {
      try {
        blockedNumbers = JSON.parse(aiSettings.blocked_numbers);
      } catch (e) {
        console.error('Error parsing blocked_numbers JSON:', e);
        blockedNumbers = [];
      }
    } else if (Array.isArray(aiSettings.blocked_numbers)) {
      blockedNumbers = [...aiSettings.blocked_numbers];
    }
    
    // الحصول على جميع المجموعات من قاعدة البيانات
    const { rows: groupsRows } = await db.query(
      'SELECT * FROM whatsapp_contacts WHERE user_id = $1 AND is_group = true AND contact_id LIKE \'%@g.us\'',
      [userId]
    );
    
    if (groupsRows.length === 0) {
      return res.json({
        success: false,
        error: 'لم يتم العثور على مجموعات'
      });
    }
    
    let groupsAdded = 0;
    
    // إضافة المجموعات إلى القائمة المحظورة إذا لم تكن موجودة بالفعل
    for (const group of groupsRows) {
      // التحقق مما إذا كانت المجموعة موجودة بالفعل
      const existingIndex = blockedNumbers.findIndex(item => {
        // التحقق إذا كان العنصر كائنًا أم نصًا
        if (typeof item === 'object' && item.id) {
          return item.id === group.contact_id;
        } else {
          return item === group.contact_id;
        }
      });
      
      // إذا لم تكن المجموعة موجودة، أضفها إلى القائمة
      if (existingIndex === -1) {
        // إضافة المجموعة كعنصر كائن مع الاسم والمعرف
        blockedNumbers.push({
          id: group.contact_id,
          name: group.name,
          isGroup: true
        });
        
        groupsAdded++;
      }
    }
    
    if (groupsAdded === 0) {
      return res.json({
        success: true,
        message: 'جميع المجموعات موجودة بالفعل في القائمة المحظورة'
      });
    }
    
    // تحديث الإعدادات في قاعدة البيانات
    await db.query(
      'UPDATE ai_settings SET blocked_numbers = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [JSON.stringify(blockedNumbers), userId]
    );
    
    res.json({
      success: true,
      message: `تمت إضافة ${groupsAdded} مجموعة إلى القائمة المحظورة`
    });
  } catch (error) {
    console.error('Error adding all groups to blocked list:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء إضافة المجموعات إلى القائمة المحظورة'
    });
  }
};

module.exports = {
  configureAI,
  getAIHistory,
  testAIResponse,
  renderAIDashboard,
  getConversationDetails,
  getAvailableModels,
  searchContacts,
  addAllGroupsToBlocked
}; 