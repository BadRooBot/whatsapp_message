const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const encryption = require('../utils/encryption');

// Store active WhatsApp clients
const activeClients = new Map();

// Create directory for session data if it doesn't exist
const SESSION_DIR = path.join(__dirname, '../.wwebjs_auth');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Function to initialize a new WhatsApp client
const initializeClient = async (userId) => {
  try {
    // Check if client already exists
    if (activeClients.has(userId)) {
      return { 
        success: true, 
        client: activeClients.get(userId), 
        message: 'Client already initialized' 
      };
    }

    // Create a new client instance
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `user_${userId}`,
        dataPath: SESSION_DIR
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
      }
    });

    // Store reference to the browser when it's created
    client.on('puppeteer_browser_initialized', browser => {
      console.log(`Browser initialized for user ${userId}`);
      client.pupBrowser = browser;
    });

    // Store client reference
    activeClients.set(userId, client);

    // Generate QR code on first authentication
    let qrCodeData = null;
    
    client.on('qr', async (qr) => {
      console.log(`QR code generated for user ${userId}`);
      qrCodeData = await qrcode.toDataURL(qr);
      
      // Update database with QR data
      await db.query(
        'UPDATE whatsapp_sessions SET session_data = $1 WHERE user_id = $2',
        [JSON.stringify({ status: 'PENDING', qr: qrCodeData }), userId]
      );
    });

    // Handle authenticated event
    client.on('authenticated', async () => {
      console.log(`Client ${userId} authenticated successfully`);
      
      await db.query(
        'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
        [JSON.stringify({ status: 'AUTHENTICATED', timestamp: Date.now() }), true, userId]
      );
      
      // Set a timeout to check if we transition to ready state
      setTimeout(async () => {
        try {
          // If client still exists but isn't ready, try to force reconnect
          if (activeClients.has(userId)) {
            const currentClient = activeClients.get(userId);
            const { rows } = await db.query(
              'SELECT session_data FROM whatsapp_sessions WHERE user_id = $1',
              [userId]
            );
            
            if (rows.length > 0) {
              const sessionData = JSON.parse(rows[0].session_data);
              
              // If still in authenticated state but not ready after 30 seconds
              if (sessionData.status === 'AUTHENTICATED' && (!currentClient.info || !currentClient.pupPage)) {
                console.log(`Client ${userId} stuck in authenticated state, forcing reconnect`);
                // Force reconnection
                reconnectClient(userId).catch(e => console.error('Error during forced reconnect:', e));
              }
            }
          }
        } catch (error) {
          console.error(`Error in authentication timeout handler for user ${userId}:`, error);
        }
      }, 30000); // Check after 30 seconds
    });

    // Handle ready event
    client.on('ready', async () => {
      console.log(`Client ${userId} is ready and fully connected`);
      
      await db.query(
        'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
        [JSON.stringify({ status: 'READY', readyAt: new Date().toISOString() }), true, userId]
      );
    });

    // Handle auth failure event
    client.on('auth_failure', async (msg) => {
      console.error(`Auth failure for user ${userId}:`, msg);
      
      await db.query(
        'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
        [JSON.stringify({ status: 'AUTH_FAILURE', error: msg }), false, userId]
      );
      
      // Clean up and remove client
      try {
        if (client.pupBrowser) {
          await client.pupBrowser.close().catch(e => console.error('Error closing browser on auth failure:', e));
        }
      } catch (cleanupError) {
        console.error(`Error cleaning up resources for user ${userId}:`, cleanupError);
      }
      
      activeClients.delete(userId);
    });

    // Handle disconnected event
    client.on('disconnected', async (reason) => {
      console.log(`Client ${userId} disconnected:`, reason);
      
      await db.query(
        'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
        [JSON.stringify({ status: 'DISCONNECTED', reason }), false, userId]
      );
      
      // Clean up resources
      try {
        if (client.pupBrowser) {
          await client.pupBrowser.close().catch(e => console.error('Error closing browser on disconnect:', e));
        }
        
        if (typeof client.destroy === 'function') {
          await client.destroy().catch(e => console.error('Error destroying client on disconnect:', e));
        }
      } catch (cleanupError) {
        console.error(`Error cleaning up resources for user ${userId}:`, cleanupError);
      }
      
      // Remove client from active list
      activeClients.delete(userId);
    });

    // Initialize session in database
    const { rows } = await db.query(
      'SELECT * FROM whatsapp_sessions WHERE user_id = $1',
      [userId]
    );

    if (rows.length === 0) {
      // Create a new session
      await db.query(
        'INSERT INTO whatsapp_sessions (user_id, session_data, is_active) VALUES ($1, $2, $3)',
        [userId, JSON.stringify({ status: 'INITIALIZING', startTime: new Date().toISOString() }), false]
      );
    } else {
      // Update existing session
      await db.query(
        'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
        [JSON.stringify({ status: 'INITIALIZING', startTime: new Date().toISOString() }), false, userId]
      );
    }

    // Initialize the client with timeout
    console.log(`Starting initialization for user ${userId}`);
    const initPromise = client.initialize();
    
    // Add a timeout to the initialization process
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('WhatsApp client initialization timed out after 60 seconds'));
      }, 60000); // 60 second timeout
    });
    
    // Wait for either initialization to complete or timeout
    await Promise.race([initPromise, timeoutPromise]);
    
    return { success: true, client, message: 'Client initialized' };
  } catch (error) {
    console.error(`Error initializing WhatsApp client for user ${userId}:`, error);
    
    // Clean up if initialization fails
    if (activeClients.has(userId)) {
      const client = activeClients.get(userId);
      try {
        if (client.pupBrowser) {
          await client.pupBrowser.close().catch(e => console.error('Error closing browser after init failure:', e));
        }
        if (typeof client.destroy === 'function') {
          await client.destroy().catch(e => console.error('Error destroying client after init failure:', e));
        }
      } catch (cleanupError) {
        console.error(`Error cleaning up after failed initialization for user ${userId}:`, cleanupError);
      }
      activeClients.delete(userId);
    }
    
    // Update session with error
    await db.query(
      'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
      [JSON.stringify({ status: 'ERROR', error: error.message, timestamp: new Date().toISOString() }), false, userId]
    );
    
    return { success: false, error: error.message };
  }
};

// Function to get all contacts for a user
const getContacts = async (userId) => {
  try {
    const client = activeClients.get(userId);
    if (!client) {
      console.error(`WhatsApp client not initialized for user ${userId}`);
      return { success: false, error: 'WhatsApp client not initialized' };
    }
    
    // Safer check if the client is ready
    if (!client.info) {
      console.error(`WhatsApp client not fully initialized for user ${userId}`);
      return { success: false, error: 'WhatsApp client not ready - please authenticate again' };
    }
    
    // If we got here, the client should be ready - wrap in try/catch to handle any potential issues
    try {
      const contacts = await client.getContacts();
      return { success: true, contacts };
    } catch (clientError) {
      console.error(`Error while retrieving contacts for user ${userId}:`, clientError);
      // If there was an error getting contacts, the session might be invalid
      return { success: false, error: 'Error retrieving WhatsApp contacts - please reauthenticate' };
    }
  } catch (error) {
    console.error(`Error fetching contacts for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

// Function to get all chats for a user
const getChats = async (userId) => {
  try {
    const client = activeClients.get(userId);
    
    if (!client) {
      console.error(`WhatsApp client not initialized for user ${userId}`);
      return { success: false, error: 'WhatsApp client not initialized' };
    }
    
    // Safer check if the client is ready
    if (!client.info) {
      console.error(`WhatsApp client not fully initialized for user ${userId}`);
      return { success: false, error: 'WhatsApp client not ready - please authenticate again' };
    }
    
    // If we got here, the client should be ready - wrap in try/catch to handle any potential issues
    try {
      const chats = await client.getChats();
      return { success: true, chats };
    } catch (clientError) {
      console.error(`Error while retrieving chats for user ${userId}:`, clientError);
      // If there was an error getting chats, the session might be invalid
      return { success: false, error: 'Error retrieving WhatsApp chats - please reauthenticate' };
    }
  } catch (error) {
    console.error(`Error fetching chats for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

// Function to send a message to a contact
const sendMessage = async (userId, to, message) => {
  try {
    const client = activeClients.get(userId);
    
    if (!client) {
      console.error(`WhatsApp client not initialized for user ${userId} when trying to send to ${to}`);
      return { success: false, error: 'WhatsApp client not initialized' };
    }
    
    // تأكد من أن العميل جاهز تمامًا
    if (!client.info) {
      console.error(`WhatsApp client not fully ready for user ${userId}`);
      
      // تحقق من حالة الجلسة في قاعدة البيانات
      const { rows } = await db.query(
        'SELECT session_data, is_active FROM whatsapp_sessions WHERE user_id = $1',
        [userId]
      );
      
      if (rows.length > 0) {
        const sessionData = JSON.parse(rows[0].session_data);
        console.error(`Current session status: ${sessionData.status}`);
        
        if (sessionData.status !== 'READY') {
          return { 
            success: false, 
            error: 'جلسة WhatsApp غير جاهزة. يرجى إعادة تسجيل الدخول من صفحة المصادقة.',
            sessionStatus: sessionData.status
          };
        }
      }
      
      // إذا وصلنا هنا، فقد يكون هناك تناقض بين الحالة في قاعدة البيانات وحالة العميل الفعلية
      return { 
        success: false, 
        error: 'حدث خطأ في اتصال WhatsApp. يرجى إعادة تسجيل الدخول.' 
      };
    }
    
    const msg = await client.sendMessage(to, message);
    
    // تشفير الرسالة قبل تخزينها في قاعدة البيانات
    const encryptedMessage = encryption.encrypt(message);
    
    // Store message in database
    await db.query(
      'INSERT INTO whatsapp_messages (user_id, contact_id, message, message_id, status) VALUES ($1, $2, $3, $4, $5)',
      [userId, to, encryptedMessage, msg.id._serialized, 'SENT']
    );
    
    return { success: true, messageId: msg.id._serialized };
  } catch (error) {
    console.error(`Error sending message for user ${userId}:`, error);
    
    // تحقق مما إذا كان الخطأ يتعلق بفقدان الاتصال
    if (error.message.includes('not connected') || 
        error.message.includes('connection closed') || 
        error.message.includes('not found') ||
        error.message.includes('ECONNREFUSED')) {
      console.log(`Connection issue detected, client might be disconnected`);
      return { 
        success: false, 
        error: 'فقدان الاتصال بـ WhatsApp. يرجى إعادة تسجيل الدخول.',
        requireReconnect: true
      };
    }
    
    return { success: false, error: error.message };
  }
};

// Function to send a message to a phone number not in contacts
const sendMessageToNumber = async (userId, phoneNumber, message) => {
  try {
    const client = activeClients.get(userId);
    
    if (!client) {
      console.error(`WhatsApp client not initialized for user ${userId} when trying to send to ${phoneNumber}`);
      return { success: false, error: 'WhatsApp client not initialized' };
    }
    
    // تأكد من أن العميل جاهز تمامًا
    if (!client.info) {
      console.error(`WhatsApp client not fully ready for user ${userId}`);
      
      // تحقق من حالة الجلسة في قاعدة البيانات
      const { rows } = await db.query(
        'SELECT session_data, is_active FROM whatsapp_sessions WHERE user_id = $1',
        [userId]
      );
      
      if (rows.length > 0) {
        const sessionData = JSON.parse(rows[0].session_data);
        console.error(`Current session status: ${sessionData.status}`);
        
        if (sessionData.status !== 'READY') {
          return { 
            success: false, 
            error: 'جلسة WhatsApp غير جاهزة. يرجى إعادة تسجيل الدخول من صفحة المصادقة.',
            sessionStatus: sessionData.status
          };
        }
      }
      
      // إذا وصلنا هنا، فقد يكون هناك تناقض بين الحالة في قاعدة البيانات وحالة العميل الفعلية
      return { 
        success: false, 
        error: 'حدث خطأ في اتصال WhatsApp. يرجى إعادة تسجيل الدخول.' 
      };
    }
    
    // تنظيف الرقم من أي أحرف غير رقمية
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // التحقق من صحة الرقم
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
      return { success: false, error: 'رقم هاتف غير صالح' };
    }
    
    // تحويل الرقم إلى صيغة WhatsApp (رقم@c.us)
    const chatId = `${cleanNumber}@c.us`;
    
    // التحقق مما إذا كان الرقم موجودًا على WhatsApp
    try {
      const isRegistered = await client.isRegisteredUser(chatId);
      if (!isRegistered) {
        return { success: false, error: 'رقم الهاتف غير مسجل على WhatsApp' };
      }
    } catch (checkError) {
      console.error(`Error checking if number is registered: ${checkError.message}`);
      // استمر في المحاولة حتى لو فشل الفحص
    }
    
    // إرسال الرسالة
    const msg = await client.sendMessage(chatId, message);
    
    // تشفير الرسالة قبل تخزينها في قاعدة البيانات
    const encryptedMessage = encryption.encrypt(message);
    
    // حفظ الرسالة في قاعدة البيانات
    await db.query(
      'INSERT INTO whatsapp_messages (user_id, contact_id, message, message_id, status) VALUES ($1, $2, $3, $4, $5)',
      [userId, chatId, encryptedMessage, msg.id._serialized, 'SENT']
    );
    
    return { 
      success: true, 
      messageId: msg.id._serialized,
      chatId: chatId
    };
  } catch (error) {
    console.error(`Error sending message to number ${phoneNumber} for user ${userId}:`, error);
    
    // تحقق مما إذا كان الخطأ يتعلق بفقدان الاتصال
    if (error.message.includes('not connected') || 
        error.message.includes('connection closed') || 
        error.message.includes('not found') ||
        error.message.includes('ECONNREFUSED')) {
      console.log(`Connection issue detected, client might be disconnected`);
      return { 
        success: false, 
        error: 'فقدان الاتصال بـ WhatsApp. يرجى إعادة تسجيل الدخول.',
        requireReconnect: true
      };
    }
    
    return { success: false, error: error.message };
  }
};

// Function to logout from WhatsApp
const logout = async (userId) => {
  try {
    const client = activeClients.get(userId);
    
    if (!client) {
      return { success: false, error: 'WhatsApp client not initialized' };
    }
    
    await client.logout();
    activeClients.delete(userId);
    
    // Update database
    await db.query(
      'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
      [JSON.stringify({ status: 'LOGGED_OUT' }), false, userId]
    );
    
    return { success: true, message: 'Logged out successfully' };
  } catch (error) {
    console.error(`Error logging out for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

// Function to get session status
const getSessionStatus = async (userId) => {
  try {
    const { rows } = await db.query(
      'SELECT session_data, is_active, created_at, updated_at FROM whatsapp_sessions WHERE user_id = $1',
      [userId]
    );
    
    if (rows.length === 0) {
      return { status: 'NOT_INITIALIZED' };
    }
    
    const sessionData = rows[0].session_data ? JSON.parse(rows[0].session_data) : { status: 'UNKNOWN' };
    sessionData.is_active = rows[0].is_active;
    
    // Add time information
    const now = new Date();
    sessionData.current_time = now.toISOString();
    
    // If client exists, add client info
    if (activeClients.has(userId)) {
      sessionData.client_exists = true;
      const client = activeClients.get(userId);
      sessionData.client_ready = !!client.info;
      
      // Add more client diagnostics if needed
      try {
        sessionData.client_info = client.info ? {
          wid: client.info.wid ? client.info.wid.toString() : null,
          platform: client.info.platform,
          connected: !!client.pupPage
        } : null;
      } catch (infoError) {
        console.error('Error getting client info:', infoError);
        sessionData.client_info_error = infoError.message;
      }
    } else {
      sessionData.client_exists = false;
    }
    
    // Check for stuck state
    if (sessionData.status === 'AUTHENTICATED' || sessionData.status === 'INITIALIZING') {
      if (sessionData.timestamp) {
        const stuckTime = now.getTime() - sessionData.timestamp;
        sessionData.stuck_time_seconds = Math.floor(stuckTime / 1000);
        
        // If stuck for more than 2 minutes in authenticated or initializing state
        if (sessionData.stuck_time_seconds > 120) {
          sessionData.may_be_stuck = true;
        }
      }
    }
    
    return sessionData;
  } catch (error) {
    console.error(`Error getting session status for user ${userId}:`, error);
    return { status: 'ERROR', error: error.message };
  }
};

// Function to setup message listener for AI responses
const setupMessageListener = async (userId, aiHandler) => {
  try {
    const client = activeClients.get(userId);
    
    if (!client) {
      return { success: false, error: 'WhatsApp client not initialized' };
    }
    
    client.on('message', async (message) => {
      // Process incoming message with AI
      await aiHandler(userId, client, message);
    });
    
    return { success: true, message: 'Message listener set up' };
  } catch (error) {
    console.error(`Error setting up message listener for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

// Function to reconnect client if needed
const reconnectClient = async (userId) => {
  try {
    // If client exists, destroy it properly to prevent protocol errors
    if (activeClients.has(userId)) {
      console.log(`Removing existing client for user ${userId} before creating a new one`);
      const oldClient = activeClients.get(userId);
      
      try {
        // Try to close browser if it exists
        if (oldClient.pupBrowser) {
          await oldClient.pupBrowser.close().catch(e => console.error('Error closing browser:', e));
        }
        
        // If client has a destroy method, call it
        if (typeof oldClient.destroy === 'function') {
          await oldClient.destroy().catch(e => console.error('Error destroying client:', e));
        }
      } catch (closeError) {
        console.error(`Error while closing old client for user ${userId}:`, closeError);
      }
      
      // Remove the client from the map
      activeClients.delete(userId);
      
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Update database to show we're reinitializing
    await db.query(
      'UPDATE whatsapp_sessions SET session_data = $1, is_active = $2 WHERE user_id = $3',
      [JSON.stringify({ status: 'REINITIALIZING' }), false, userId]
    );
    
    // Always create a new client instance
    console.log(`Creating new client for user ${userId}`);
    const initResult = await initializeClient(userId);
    
    if (initResult.success) {
      // Reinitialize message handler
      const aiService = require('./ai');
      await setupMessageListener(userId, aiService.handleWhatsAppMessage);
      console.log(`Message handler reinitialized for user ${userId}`);
    }
    
    return initResult;
  } catch (error) {
    console.error(`Error in reconnectClient for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  initializeClient,
  getContacts,
  getChats,
  sendMessage,
  sendMessageToNumber,
  logout,
  getSessionStatus,
  setupMessageListener,
  reconnectClient,
  activeClients
}; 