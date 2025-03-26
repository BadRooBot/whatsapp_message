const axios = require('axios');
const dotenv = require('dotenv');
const db = require('../config/db');
const encryption = require('../utils/encryption');

dotenv.config();

// دالة للحصول على قائمة النماذج المتاحة من OpenRouter API
const getAvailableModels = async () => {
  try {
    const response = await axios.get(
      'https://openrouter.ai/api/v1/models',
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      models: response.data.data
    };
  } catch (error) {
    console.error('Error fetching AI models from OpenRouter:', error);
    return {
      success: false,
      error: error.message || 'حدث خطأ أثناء جلب النماذج المتاحة'
    };
  }
};

// Function to generate response from OpenRouter API
const generateResponse = async (message, conversationHistory = [], aiSettings = {}) => {
  try {
    // Prepare messages array with system prompt and conversation history
    const messages = [
      { 
        role: 'system', 
        content: aiSettings.system_prompt || `أنت صديق حقيقي تتحدث بشكل طبيعي وليس كمساعد ذكاء اصطناعي. تجيب بشكل قصير ومباشر بدون تعريف أو شرح أو مقدمة. لا تستخدم عبارات رسمية أو مصطلحات تقنية.
        
تحدث بنفس لغة الرسالة المستلمة (عربي، إنجليزي، إلخ). إذا كانت الرسالة تحية مثل "أهلاً" أو "كيف حالك"، رد بتحية مماثلة وودية مثل "أهلاً! كيف حالك؟" أو "تمام الحمد لله، أنت عامل إيه؟".

لا تقدم نفسك كذكاء اصطناعي أو مساعد. لا تشرح ولا تقدم مقدمات طويلة. ردودك مختصرة وكأنها من صديق مقرب. استخدم الكلمات العامية المناسبة للغة المستخدمة.

أمثلة:
- إذا سألك شخص "كيف حالك؟"، لا تقل "أنا مساعد..." بل قل: "تمام الحمد لله، وأنت؟"
- إذا قال "صباح الخير"، قل: "صباح النور! يومك سعيد"
- إذا سأل "ماذا تفعل؟" قل: "بتكلم معاك دلوقتي، إنت عامل إيه؟"`
      }
    ];

    // Add conversation history if available
    if (conversationHistory && conversationHistory.length > 0) {
      messages.push(...conversationHistory);
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: aiSettings.model || 'deepseek/deepseek-chat:free',
        messages: messages,
        max_tokens: aiSettings.max_tokens || 500,
        temperature: aiSettings.temperature || 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      response: response.data.choices[0].message.content
    };
  } catch (error) {
    console.error('Error generating AI response:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// دالة مساعدة للتحقق مما إذا كان الرقم موجودًا في القائمة
const checkNumberInList = (number, list) => {
  if (!list || !Array.isArray(list) || list.length === 0) {
    return false;
  }
  
  return list.some(item => {
    // التحقق مما إذا كان العنصر كائنًا أو نصًا
    if (typeof item === 'object' && item.id) {
      return item.id === number;
    }
    return item === number;
  });
};

// معالجة رسائل الواتساب الواردة
const handleWhatsAppMessage = async (userId, client, message) => {
  try {
    // استبعاد الرسائل من المستخدم نفسه
    if (message.fromMe) {
      return;
    }
    
    // الاختيارات من قاعدة البيانات
    const { rows } = await db.query(
      'SELECT * FROM ai_settings WHERE user_id = $1',
      [userId]
    );
    
    // إذا لم تكن الإعدادات موجودة أو لم يتم تفعيل الرد التلقائي
    if (rows.length === 0 || !rows[0].auto_reply) {
      return;
    }
    
    const settings = rows[0];
    const sender = message.from;
    const messageContent = message.body;
    
    // التحقق من نمط الرد التلقائي (الكل، القائمة البيضاء، القائمة السوداء)
    const autoReplyMode = settings.auto_reply_mode || 'whitelist';
    
    // تحويل القوائم من JSONB إلى مصفوفات JavaScript
    let allowedNumbers = [];
    if (settings.allowed_numbers) {
      if (typeof settings.allowed_numbers === 'string') {
        allowedNumbers = JSON.parse(settings.allowed_numbers);
      } else if (Array.isArray(settings.allowed_numbers)) {
        allowedNumbers = settings.allowed_numbers;
      }
    }
    
    let blockedNumbers = [];
    if (settings.blocked_numbers) {
      if (typeof settings.blocked_numbers === 'string') {
        blockedNumbers = JSON.parse(settings.blocked_numbers);
      } else if (Array.isArray(settings.blocked_numbers)) {
        blockedNumbers = settings.blocked_numbers;
      }
    }
    
    // التحقق مما إذا كان المرسل في القائمة المناسبة
    const isAllowed = checkNumberInList(sender, allowedNumbers);
    const isBlocked = checkNumberInList(sender, blockedNumbers);
    
    let shouldReply = false;
    
    // تطبيق قواعد القوائم حسب النمط المحدد
    switch (autoReplyMode) {
      case 'all':
        // الرد على جميع الرسائل إلا المحظورة
        shouldReply = !isBlocked;
        break;
      case 'whitelist':
        // الرد فقط على الأرقام المسموح بها
        shouldReply = isAllowed;
        break;
      case 'blacklist':
        // الرد على الكل ماعدا المحظورين
        shouldReply = !isBlocked;
        break;
      default:
        // افتراضيًا: الرد فقط على الأرقام المسموح بها
        shouldReply = isAllowed;
    }
    
    // إذا كان المرسل مجموعة ولا يوجد تفعيل للرد على المجموعات
    const isGroup = sender.endsWith('@g.us');
    if (isGroup && !settings.group_reply) {
      shouldReply = false;
    }
    
    // إذا كانت المجموعة تتطلب كلمة مفتاحية للرد
    if (isGroup && settings.group_reply && settings.group_trigger) {
      const trigger = settings.group_trigger.trim().toLowerCase();
      if (trigger && !messageContent.toLowerCase().includes(trigger)) {
        shouldReply = false;
      }
    }
    
    if (!shouldReply) {
      return;
    }
    
    // الحصول على الرسائل السابقة لبناء ذاكرة للسياق
    let messages = [];
    if (settings.enable_memory) {
      messages = await getConversationHistory(userId, sender, settings.memory_window || 5);
    }
    
    // إنشاء محتوى الطلب مع الرسائل السابقة إذا كانت موجودة
    const chatHistory = messages.map(msg => ({
      role: msg.is_ai ? 'assistant' : 'user',
      content: msg.content
    }));
    
    // إضافة الرسالة الحالية
    chatHistory.push({
      role: 'user',
      content: messageContent
    });
    
    console.log('Preparing AI response with settings:', {
      model: settings.model || 'deepseek/deepseek-chat:free',
      temperature: parseFloat(settings.temperature) || 0.7,
      max_tokens: parseInt(settings.max_tokens) || 500,
      systemPrompt: (settings.system_prompt || '').substring(0, 20) + '...'
    });
    
    // إرسال الطلب إلى الذكاء الاصطناعي
    const aiSettings = {
      api_key: settings.api_key,
      model: settings.model || 'deepseek/deepseek-chat:free',
      temperature: parseFloat(settings.temperature) || 0.7,
      max_tokens: parseInt(settings.max_tokens) || 500,
      system_prompt: settings.system_prompt || ''
    };
    
    // الحصول على الرد من الذكاء الاصطناعي
    const result = await generateResponse(messageContent, chatHistory, aiSettings);
    
    if (!result.success) {
      console.error('Error generating AI response:', result.error);
      return;
    }
    
    // إرسال الرد إلى المرسل
    await client.sendMessage(sender, result.response);
    
    // تشفير الرسالة والرد قبل التخزين
    const encryptedMessage = encryption.encrypt(messageContent);
    const encryptedResponse = encryption.encrypt(result.response);
    
    // تخزين الرد في قاعدة البيانات
    await db.query(
      'INSERT INTO ai_responses (user_id, contact_id, message, response, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [userId, sender, encryptedMessage, encryptedResponse]
    );
    
    console.log('AI response sent and saved to database');
  } catch (error) {
    console.error('Error handling WhatsApp message:', error);
  }
};

// Helper function to store contact information
const storeContactInfo = async (userId, contact, isGroup) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM whatsapp_contacts WHERE user_id = $1 AND contact_id = $2',
      [userId, contact.id._serialized]
    );
    
    // تشفير رقم الهاتف إذا لم يكن فارغًا وغير مشفر بالفعل
    let encryptedNumber = '';
    if (contact.number && contact.number.trim() !== '') {
      encryptedNumber = encryption.encrypt(contact.number);
    }
    
    if (rows.length === 0) {
      // Contact doesn't exist, insert new one
      await db.query(
        'INSERT INTO whatsapp_contacts (user_id, contact_id, name, number, is_group) VALUES ($1, $2, $3, $4, $5)',
        [userId, contact.id._serialized, contact.name || contact.pushname || 'Unknown', encryptedNumber, isGroup]
      );
    } else {
      // Update existing contact
      await db.query(
        'UPDATE whatsapp_contacts SET name = $1, number = $2, is_group = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $4 AND contact_id = $5',
        [contact.name || contact.pushname || 'Unknown', encryptedNumber, isGroup, userId, contact.id._serialized]
      );
    }
  } catch (error) {
    console.error('Error storing contact info:', error);
  }
};

module.exports = {
  generateResponse,
  handleWhatsAppMessage,
  getAvailableModels
}; 