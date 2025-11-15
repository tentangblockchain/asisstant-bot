
// 🔥 BOT TELEGRAM - ADMIN & FILTER MANAGEMENT (OPTIMIZED)
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');

// ============ IPv4 FIX - FORCE IPv4 ONLY ============
// Force IPv4 untuk mengatasi masalah timeout IPv6
dns.setDefaultResultOrder('ipv4first');

const httpsAgent = new https.Agent({
  family: 4,  // Force IPv4 only
  keepAlive: true,
  keepAliveMsecs: 30000,
  timeout: 120000  // 2 minutes
});

console.log('🌐 Menggunakan konfigurasi IPv4-only untuk koneksi Telegram API');
// =====================================================

// Validate environment variables
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN tidak ditemukan di .env file!');
  process.exit(1);
}

if (!process.env.OWNER_ID) {
  console.error('❌ OWNER_ID tidak ditemukan di .env file!');
  process.exit(1);
}

// Initialize bot with optimized settings for slow internet + IPv4-only
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  polling: {
    interval: 10000, // Slower polling (10 seconds) untuk koneksi sangat lambat
    autoStart: false,
    params: {
      timeout: 180 // 3 minutes timeout untuk koneksi sangat lambat
    }
  },
  filepath: false,
  request: {
    agent: httpsAgent, // Use IPv4-only HTTPS agent
    agentOptions: {
      keepAlive: true,
      keepAliveMsecs: 60000, // 1 minute keepalive
      timeout: 180000, // 3 minutes timeout
      family: 4 // Force IPv4 only (0=both, 4=IPv4, 6=IPv6)
    },
    forever: true,
    timeout: 180000 // 3 minutes request timeout
  }
});

const OWNER_ID = parseInt(process.env.OWNER_ID);
const ADMINS_FILE = path.join(__dirname, 'admins.json');
const FILTERS_FILE = path.join(__dirname, 'filters.json');
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json');

// In-memory cache
let admins = [];
let filters = {};
let blacklist = []; // User IDs yang di-blacklist
let adminCache = new Set();
let deleteTimers = new Map();
let spamTimeouts = new Map(); // Track user timeouts

// AI Hoki Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const AI_ENABLED = GROQ_API_KEY.length > 0;

// Multi-model cascade system
const AI_MODELS = [
    {
        name: 'llama-3.3-70b-versatile',
        limit: 1000,
        used: 0,
        quality: 10,
        tokensPerMin: 12000,
        use: 'premium' // Admin priority (Tier 1)
    },
    {
        name: 'llama-3.1-8b-instant',
        limit: 14400,
        used: 0,
        quality: 7,
        tokensPerMin: 6000,
        use: 'general' // Untuk semua user (Tier 2)
    },
    {
        name: 'meta-llama/llama-guard-3-8b',
        limit: 14400,
        used: 0,
        quality: 6,
        tokensPerMin: 15000,
        use: 'fallback' // Emergency fallback (Tier 3)
    }
];

// Hoki AI Personality System
const HOKI_PERSONALITY = {
    name: 'Hoki',
    traits: ['ramah', 'helpful', 'natural', 'concise'],
    style: ['sih', 'nih', 'yaa', '~'],
    maxEmoji: 2,
    language: 'id-ID'
};

// Conversation tracking untuk analytics
let aiConversations = new Map(); // userId -> conversation history
let aiStats = {
    totalRequests: 0,
    successfulResponses: 0,
    failedResponses: 0,
    modelUsage: {}
};

// AI rate limiting per user (prevent API abuse)
const aiRateLimits = new Map(); // userId -> last request timestamp
const AI_COOLDOWN_MS = 3000; // 3 seconds between AI requests per user
const MAX_CONVERSATION_LENGTH = 10; // Max messages in conversation history

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS = 5;

// Periodic cleanup
setInterval(() => {
  // Clean up old rate limits
  const now = Date.now();
  for (const [userId, timestamps] of rateLimits.entries()) {
    const validTimestamps = timestamps.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (validTimestamps.length === 0) {
      rateLimits.delete(userId);
    } else {
      rateLimits.set(userId, validTimestamps);
    }
  }
  
  // Clean up stale AI conversations (older than 1 hour)
  for (const [userId, history] of aiConversations.entries()) {
    if (history.length > MAX_CONVERSATION_LENGTH * 2) {
      aiConversations.delete(userId);
      console.log(`🧹 Cleaned up long conversation for user ${userId}`);
    }
  }
}, 60000); // Every minute

// Reset model usage counters every hour (Groq limit resets hourly)
setInterval(() => {
  AI_MODELS.forEach(m => {
    const previousUsed = m.used;
    m.used = 0;
    if (previousUsed > 0) {
      console.log(`🔄 Reset ${m.name}: ${previousUsed} -> 0`);
    }
  });
  console.log('✅ AI model counters reset (hourly)');
}, 3600000); // Every hour

// Initialize data asynchronously
async function initializeData() {
  try {
    admins = await loadJSON(ADMINS_FILE, []);
    filters = await loadJSON(FILTERS_FILE, {});
    blacklist = await loadJSON(BLACKLIST_FILE, []);

    if (OWNER_ID && !admins.includes(OWNER_ID)) {
      admins.push(OWNER_ID);
      await saveJSON(ADMINS_FILE, admins);
    }

    // Build admin cache
    adminCache = new Set(admins);
    
    console.log('✅ Data initialized successfully');
    console.log(`🤖 AI Hoki: ${AI_ENABLED ? 'ENABLED ✅' : 'DISABLED (GROQ_API_KEY not set)'}`);
  } catch (err) {
    console.error('❌ Initialization error:', err);
  }
}

// Async JSON operations
async function loadJSON(file, defaultValue) {
  try {
    if (fsSync.existsSync(file)) {
      const data = await fs.readFile(file, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error loading ${file}:`, err);
  }
  return defaultValue;
}

async function saveJSON(file, data) {
  try {
    // IMPORTANT: Just write the data directly
    // The in-memory object (filters, admins) is already the source of truth
    // Merging with file would bring back deleted items - that's a bug!
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error saving ${file}:`, err);
    return false;
  }
}

// CRITICAL FIX: Convert entities to HTML format
// node-telegram-bot-api doesn't support caption_entities properly!
// We need to convert entities to HTML and use parse_mode instead
function entitiesToHTML(text, entities) {
  if (!entities || entities.length === 0) return text;
  
  // Build array of text segments with their formatting
  const segments = [];
  let lastOffset = 0;
  
  // Sort entities by offset (ascending)
  const sortedEntities = [...entities].sort((a, b) => a.offset - b.offset);
  
  for (const entity of sortedEntities) {
    const { offset, length, type, url } = entity;
    
    // Add plain text before this entity
    if (offset > lastOffset) {
      segments.push({
        text: text.substring(lastOffset, offset),
        type: 'plain'
      });
    }
    
    // Add formatted entity
    const content = text.substring(offset, offset + length);
    segments.push({
      text: content,
      type: type,
      url: url,
      user: entity.user
    });
    
    lastOffset = offset + length;
  }
  
  // Add remaining plain text
  if (lastOffset < text.length) {
    segments.push({
      text: text.substring(lastOffset),
      type: 'plain'
    });
  }
  
  // Helper to escape HTML special characters
  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }
  
  // Convert segments to HTML
  let result = '';
  for (const segment of segments) {
    const { text: segText, type, url, user } = segment;
    
    // Escape HTML in content for security
    const escapedText = escapeHTML(segText);
    
    switch (type) {
      case 'plain':
        result += escapedText;
        break;
      case 'bold':
        result += `<b>${escapedText}</b>`;
        break;
      case 'italic':
        result += `<i>${escapedText}</i>`;
        break;
      case 'underline':
        result += `<u>${escapedText}</u>`;
        break;
      case 'strikethrough':
        result += `<s>${escapedText}</s>`;
        break;
      case 'code':
        result += `<code>${escapedText}</code>`;
        break;
      case 'pre':
        result += `<pre>${escapedText}</pre>`;
        break;
      case 'text_link':
        result += `<a href="${escapeHTML(url)}">${escapedText}</a>`;
        break;
      case 'text_mention':
        result += `<a href="tg://user?id=${user.id}">${escapedText}</a>`;
        break;
      case 'spoiler':
        result += `<tg-spoiler>${escapedText}</tg-spoiler>`;
        break;
      case 'url':
      case 'mention':
      case 'hashtag':
      case 'cashtag':
      case 'bot_command':
      case 'email':
      case 'phone_number':
      default:
        // Auto-detected by Telegram, no special formatting needed
        result += escapedText;
        break;
    }
  }
  
  return result;
}

// Optimized admin check with cache
function isAdmin(userId) {
  return userId === OWNER_ID || adminCache.has(userId);
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

function isBlacklisted(userId) {
  return blacklist.includes(userId);
}

function isTimedOut(userId) {
  const timeout = spamTimeouts.get(userId);
  if (!timeout) return false;
  
  if (Date.now() > timeout.until) {
    spamTimeouts.delete(userId);
    return false;
  }
  return true;
}

function getTimeoutRemaining(userId) {
  const timeout = spamTimeouts.get(userId);
  if (!timeout) return 0;
  return Math.ceil((timeout.until - Date.now()) / 1000);
}

// AI Helper: Get best available model based on user type
function getBestModel(userId) {
  const userIsAdmin = isAdmin(userId);
  
  // Admin gets priority access to premium model
  if (userIsAdmin) {
    const premiumModel = AI_MODELS.find(m => m.use === 'premium' && m.used < m.limit);
    if (premiumModel) return premiumModel;
  }
  
  // General users get general model
  const generalModel = AI_MODELS.find(m => m.use === 'general' && m.used < m.limit);
  if (generalModel) return generalModel;
  
  // Fallback to emergency model
  const fallbackModel = AI_MODELS.find(m => m.use === 'fallback' && m.used < m.limit);
  return fallbackModel || null;
}

// Language detection helper
function detectLanguage(text) {
  const indonesianWords = ['apa', 'yang', 'ini', 'itu', 'dan', 'atau', 'saya', 'kamu', 'dia', 'kami', 'mereka', 'dengan', 'untuk', 'dari'];
  const englishWords = ['what', 'that', 'this', 'and', 'or', 'the', 'you', 'they', 'with', 'for', 'from'];
  
  const lowerText = text.toLowerCase();
  const idCount = indonesianWords.filter(word => lowerText.includes(word)).length;
  const enCount = englishWords.filter(word => lowerText.includes(word)).length;
  
  if (idCount > enCount) return 'id-ID';
  if (enCount > idCount) return 'en-US';
  return 'id-ID'; // Default to Indonesian
}

// AI Helper: Call Groq API with context-aware responses
async function callGroqAPI(userMessage, userId) {
  const model = getBestModel(userId);
  if (!model) {
    throw new Error('Semua model AI lagi penuh nih~ Coba lagi nanti yaa 🙏');
  }
  
  // Get conversation history (limit to MAX_CONVERSATION_LENGTH)
  const history = aiConversations.get(userId) || [];
  const recentHistory = history.slice(-Math.min(5, MAX_CONVERSATION_LENGTH));
  
  // Detect user language
  const detectedLang = detectLanguage(userMessage);
  
  // Context-aware: User role detection
  const userRole = isOwner(userId) ? 'Owner' : isAdmin(userId) ? 'Admin' : 'User';
  const roleContext = userRole === 'Owner' 
    ? 'User ini adalah OWNER bot (pemilik utama), punya akses penuh ke semua fitur termasuk export, reset AI, dll.'
    : userRole === 'Admin'
    ? 'User ini adalah ADMIN, bisa manage filters, ban user, lihat stats, dll.'
    : 'User ini adalah user biasa, cuma bisa pakai filters yang udah ada.';
  
  // Build filter knowledge base untuk AI
  const filterCount = Object.keys(filters).length;
  let filterKnowledge = '';
  
  if (filterCount > 0) {
    const filterNames = Object.keys(filters).slice(0, 20); // Max 20 filters untuk context
    const filterList = filterNames.map(name => {
      const filter = filters[name];
      const hasMedia = filter.photo || filter.video || filter.document || filter.animation;
      const mediaType = filter.photo ? 'foto' : filter.video ? 'video' : filter.document ? 'dokumen' : filter.animation ? 'GIF' : 'teks';
      const preview = filter.text ? filter.text.substring(0, 100) : '';
      return `- !${name}: ${hasMedia ? `[${mediaType}]` : ''} ${preview}`;
    }).join('\n');
    
    filterKnowledge = `\n\nFILTER KNOWLEDGE BASE (${filterCount} total filters):
Bot ini punya ${filterCount} filters yang bisa dipakai user dengan mengetik !namafilter
${filterList}
${filterCount > 20 ? '\n(dan ' + (filterCount - 20) + ' filters lainnya...)' : ''}

Kamu bisa referensikan filters ini kalau user tanya tentang fitur bot atau minta bantuan.`;
  }
  
  // Build messages with personality + filter knowledge + context
  const languageInstruction = detectedLang === 'en-US' 
    ? `LANGUAGE: Respond in English (detected from user's message).
- Use natural, friendly English
- Use "~" for soft tone
- Max 1-2 emojis per response`
    : `LANGUAGE: Respond in Indonesian (detected from user's message).
- Natural Indonesian sehari-hari
- Pakai "sih", "nih", "yaa" biar natural
- Max 1-2 emoji per response
- Pakai "~" untuk nada lembut`;

  const messages = [
    {
      role: 'system',
      content: `Kamu adalah Hoki, AI assistant yang ramah dan helpful di Telegram bot.

USER CONTEXT:
${roleContext}

PERSONALITY:
- Ramah kayak teman baik
- Helpful dan concise (langsung to the point)
- Aware of user's role dan adjust response accordingly
${languageInstruction}

RULES:
- Jangan bahas politik/agama/hal sensitif
- Jangan kasih info yang berbahaya
- Kalau gak tau, bilang jujur
- Jawaban singkat tapi jelas (2-3 kalimat max kalau bisa)
- Fokus bantu user dengan pertanyaannya
- Untuk Admin/Owner: Bisa kasih info lebih detail tentang command management
- Untuk User biasa: Fokus ke cara pakai filters aja

Contoh gaya chat (Indonesian):
- "Iya nih, aku bisa bantu! 😊"
- "Hmm gini sih~ kamu bisa coba..."
- "Oh itu maksudnya kayak gini yaa..."

Contoh gaya chat (English):
- "Sure, I can help! 😊"
- "Hmm, here's what you can do~"
- "Oh I see what you mean!"${filterKnowledge}

Respond in the detected language and adjust your helpfulness based on user role!`
    },
    ...recentHistory,
    {
      role: 'user',
      content: userMessage
    }
  ];
  
  try {
    // Sanitize input (prompt injection prevention)
    const sanitizedMessage = userMessage.replace(/```/g, '').substring(0, 1000);
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.name,
        messages: messages,
        temperature: 0.8,
        max_tokens: 300, // Concise responses
        top_p: 0.9
      })
    });
    
    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }
    
    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Update model usage
    model.used++;
    
    // Save conversation history (limit to MAX_CONVERSATION_LENGTH pairs)
    history.push({ role: 'user', content: sanitizedMessage });
    history.push({ role: 'assistant', content: aiResponse });
    
    // Keep only recent conversation (prevent memory bloat)
    const trimmedHistory = history.slice(-MAX_CONVERSATION_LENGTH * 2);
    aiConversations.set(userId, trimmedHistory);
    
    // Update stats
    aiStats.totalRequests++;
    aiStats.successfulResponses++;
    aiStats.modelUsage[model.name] = (aiStats.modelUsage[model.name] || 0) + 1;
    
    return {
      response: aiResponse,
      model: model.name,
      tokensUsed: data.usage?.total_tokens || 0
    };
    
  } catch (err) {
    aiStats.failedResponses++;
    throw err;
  }
}

// Rate limiting
function checkRateLimit(userId) {
  const now = Date.now();
  const userLimits = rateLimits.get(userId) || [];

  // Remove old entries
  const validLimits = userLimits.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (validLimits.length >= MAX_REQUESTS) {
    return false;
  }

  validLimits.push(now);
  rateLimits.set(userId, validLimits);
  return true;
}

// Optimized auto-delete with cleanup
function autoDeleteMessage(chatId, messageId, delayMinutes = 3) {
  const key = `${chatId}_${messageId}`;

  // Clear existing timer if any
  if (deleteTimers.has(key)) {
    clearTimeout(deleteTimers.get(key));
  }

  const timer = setTimeout(async () => {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (err) {
      // Ignore errors (message might be already deleted)
    } finally {
      deleteTimers.delete(key);
    }
  }, delayMinutes * 60 * 1000);

  deleteTimers.set(key, timer);
}

// Pagination (no change needed, already efficient)
function createPagination(items, page, itemsPerPage = 10) {
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = items.slice(start, end);

  return { pageItems, totalPages, currentPage: page };
}

function createPaginationKeyboard(currentPage, totalPages, prefix) {
  const keyboard = [];
  const buttons = [];

  if (currentPage > 1) {
    buttons.push({ text: '⬅️ Prev', callback_data: `${prefix}_${currentPage - 1}` });
  }

  buttons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'noop' });

  if (currentPage < totalPages) {
    buttons.push({ text: 'Next ➡️', callback_data: `${prefix}_${currentPage + 1}` });
  }

  if (buttons.length > 0) {
    keyboard.push(buttons);
  }

  return { inline_keyboard: keyboard };
}

// 📖 HELP & START COMMANDS
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const firstName = msg.from.first_name || 'User';

  autoDeleteMessage(chatId, messageId, 3);

  const welcomeMsg = `👋 Halo *${firstName}*!\n\n` +
    `Gua bot admin & filter management.\n\n` +
    `🔹 Ketik /help untuk lihat semua command\n` +
    `${isAdmin(userId) ? '🔹 Lu admin, bisa pake semua fitur! 👑' : '🔹 Lu bukan admin, cuma bisa pake filter'}`;

  const reply = await bot.sendMessage(chatId, welcomeMsg, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  let helpMsg = `📖 *Daftar Command Bot*\n\n`;

  if (isAdmin(userId)) {
    helpMsg += `👑 *Admin Commands:*\n` +
      `/addadmin - Tambah admin (reply ke orangnya)\n` +
      `/removeadmin - Hapus admin (reply ke orangnya)\n` +
      `/listadmins - Lihat semua admin\n\n` +
      `🚫 *Security Commands:*\n` +
      `/blacklist - Ban user (reply ke orangnya)\n` +
      `/unblacklist - Unban user (reply ke orangnya)\n` +
      `/listblacklist - Lihat user yang di-ban\n` +
      `/timeout <menit> - Timeout user (reply)\n\n` +
      `🎯 *Filter Management:*\n` +
      `\`!add\` <nama> - Bikin filter baru (reply ke pesan)\n` +
      `\`!del\` <nama> - Hapus filter\n` +
      `\`!clone\` <dari> <ke> - Copy filter\n` +
      `\`!rename\` <lama> <baru> - Ganti nama filter\n\n` +
      `🔍 *Filter Info:*\n` +
      `\`!list\` - Lihat semua filter\n` +
      `\`!info\` <nama> - Detail filter\n` +
      `\`!search\` <kata> - Cari filter\n` +
      `\`!status\` - Status & statistik bot\n` +
      `${isOwner(userId) ? '!export - Backup semua filter\n' : ''}` +
      `\n💡 *Cara Pake Filter:*\n` +
      `Ketik \`!namafilter\` atau \`namafilter\`\n\n` +
      `${AI_ENABLED ? '🤖 *AI Hoki:*\nReply ke pesan bot untuk chat dengan Hoki!\n\n' : ''}` +
      `🔔 *Notification System:*\n` +
      `\`!notifstats\` - Lihat notification stats\n` +
      `Auto welcome untuk member baru\n` +
      `Daily stats dikirim ke owner setiap hari\n` +
      `Alert otomatis untuk critical errors\n\n` +
      `📌 *Media Support:*\n` +
      `Text, Photo, Video, Document, GIF, Audio, Voice, Sticker\n\n` +
      `✨ *Format Support:*\n` +
      `Bold, Italic, Underline, Code, Link, dll`;
  } else {
    helpMsg += `💡 *Cara Pake Filter:*\n` +
      `Ketik \`!namafilter\` atau \`namafilter\`\n\n` +
      `📌 Lu bukan admin, cuma bisa pake filter yang udah ada.`;
  }

  const reply = await bot.sendMessage(chatId, helpMsg, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/addadmin(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!checkRateLimit(userId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Slow down! Terlalu banyak request!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan orangnya!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const targetUserId = msg.reply_to_message.from.id;

  if (adminCache.has(targetUserId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Udah jadi admin cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  admins.push(targetUserId);
  adminCache.add(targetUserId);
  await saveJSON(ADMINS_FILE, admins);

  const reply = await bot.sendMessage(chatId, `✅ Admin ditambah!\n👤 User ID: ${targetUserId}`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});


// 🔔 NOTIFICATION SYSTEM
const notificationStats = {
  welcomesSent: 0,
  dailyStatsSent: 0,
  alertsSent: 0
};

// Welcome message for new members
bot.on('new_chat_members', async (msg) => {
  const chatId = msg.chat.id;
  const newMembers = msg.new_chat_members;
  
  for (const member of newMembers) {
    if (member.is_bot) continue; // Skip bots
    
    const firstName = member.first_name || 'User';
    const welcomeMsg = `👋 Selamat datang *${firstName}*!\n\n` +
      `🤖 Gua bot filter management. Ketik /help untuk lihat command!\n` +
      `💡 Lu bisa pakai filter dengan ketik \`!namafilter\`\n\n` +
      `${AI_ENABLED ? '🎯 Chat sama gua dengan reply ke pesan gua!\n\n' : ''}` +
      `Enjoy! 🚀`;
    
    try {
      await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
      notificationStats.welcomesSent++;
      console.log(`👋 Welcome message sent to ${firstName} (${member.id})`);
    } catch (err) {
      console.error('❌ Failed to send welcome message:', err.message);
    }
  }
});

// Daily stats notification (runs every 24 hours)
let dailyStatsInterval = null;

function startDailyStats() {
  // Send daily stats at 9 AM (adjust as needed)
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(9, 0, 0, 0);
  
  if (scheduledTime <= now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }
  
  const timeUntilFirstRun = scheduledTime - now;
  
  setTimeout(() => {
    sendDailyStats();
    // Then run every 24 hours
    dailyStatsInterval = setInterval(sendDailyStats, 24 * 60 * 60 * 1000);
  }, timeUntilFirstRun);
  
  console.log(`📊 Daily stats scheduled for ${scheduledTime.toLocaleString('id-ID')}`);
}

async function sendDailyStats() {
  if (!OWNER_ID) return;
  
  const filterCount = Object.keys(filters).length;
  const adminCount = admins.length;
  const blacklistCount = blacklist.length;
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeDays = Math.floor(uptimeHours / 24);
  
  const statsMsg = `📊 *Daily Bot Stats*\n\n` +
    `📅 Date: ${new Date().toLocaleDateString('id-ID')}\n\n` +
    `🎯 Total Filters: ${filterCount}\n` +
    `👥 Total Admins: ${adminCount}\n` +
    `🚫 Blacklisted Users: ${blacklistCount}\n` +
    `⏱️ Uptime: ${uptimeDays}d ${uptimeHours % 24}h\n\n` +
    `${AI_ENABLED ? `🤖 *AI Stats:*\n` +
    `Total Requests: ${aiStats.totalRequests}\n` +
    `Success Rate: ${aiStats.totalRequests > 0 ? ((aiStats.successfulResponses / aiStats.totalRequests) * 100).toFixed(1) : 0}%\n` +
    `Active Conversations: ${aiConversations.size}\n\n` : ''}` +
    `🔔 *Notifications:*\n` +
    `Welcomes Sent: ${notificationStats.welcomesSent}\n` +
    `Alerts Sent: ${notificationStats.alertsSent}\n\n` +
    `✅ Bot Status: Online 🚀`;
  
  try {
    await bot.sendMessage(OWNER_ID, statsMsg, { parse_mode: 'Markdown' });
    notificationStats.dailyStatsSent++;
    console.log('📊 Daily stats sent to owner');
  } catch (err) {
    console.error('❌ Failed to send daily stats:', err.message);
  }
}

// Critical error notification
function notifyCriticalError(errorMsg, context = {}) {
  if (!OWNER_ID) return;
  
  const alertMsg = `🚨 *Critical Error Alert*\n\n` +
    `⏰ Time: ${new Date().toLocaleString('id-ID')}\n` +
    `❌ Error: \`${errorMsg}\`\n` +
    `${context.chatId ? `💬 Chat ID: ${context.chatId}\n` : ''}` +
    `${context.userId ? `👤 User ID: ${context.userId}\n` : ''}` +
    `${context.filterName ? `🎯 Filter: ${context.filterName}\n` : ''}` +
    `\nPlease check the logs for more details.`;
  
  bot.sendMessage(OWNER_ID, alertMsg, { parse_mode: 'Markdown' })
    .then(() => {
      notificationStats.alertsSent++;
      console.log('🚨 Critical error notification sent to owner');
    })
    .catch(err => console.error('Failed to send error notification:', err.message));
}

// Start daily stats on bot initialization
startDailyStats();


bot.onText(/\/removeadmin(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!checkRateLimit(userId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Slow down! Terlalu banyak request!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan admin yang mau ditendang!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const targetUserId = msg.reply_to_message.from.id;

  if (targetUserId === OWNER_ID) {
    const reply = await bot.sendMessage(chatId, '❌ Gak bisa hapus owner anjir! Dia admin utama! 👑');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const index = admins.indexOf(targetUserId);
  if (index === -1) {
    const reply = await bot.sendMessage(chatId, '⚠️ Dia bukan admin cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  admins.splice(index, 1);
  adminCache.delete(targetUserId);
  await saveJSON(ADMINS_FILE, admins);

  const reply = await bot.sendMessage(chatId, `✅ Admin dihapus!\n👤 User ID: ${targetUserId}`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// 🚫 BLACKLIST COMMANDS
bot.onText(/\/blacklist(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan user yang mau di-ban!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const targetUserId = msg.reply_to_message.from.id;

  if (targetUserId === OWNER_ID || isAdmin(targetUserId)) {
    const reply = await bot.sendMessage(chatId, '❌ Gak bisa ban admin/owner cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (blacklist.includes(targetUserId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ User ini udah di-blacklist!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  blacklist.push(targetUserId);
  await saveJSON(BLACKLIST_FILE, blacklist);

  const reply = await bot.sendMessage(chatId, `🚫 User banned!\n👤 User ID: ${targetUserId}`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/unblacklist(?:@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan user yang mau di-unban!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const targetUserId = msg.reply_to_message.from.id;
  const index = blacklist.indexOf(targetUserId);

  if (index === -1) {
    const reply = await bot.sendMessage(chatId, '⚠️ User ini gak ada di blacklist!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  blacklist.splice(index, 1);
  await saveJSON(BLACKLIST_FILE, blacklist);

  const reply = await bot.sendMessage(chatId, `✅ User unbanned!\n👤 User ID: ${targetUserId}`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/listblacklist/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (blacklist.length === 0) {
    const reply = await bot.sendMessage(chatId, '✅ Belum ada user yang di-blacklist!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const blacklistStr = blacklist.map((id, i) => `${i + 1}. User ID: \`${id}\``).join('\n');
  const reply = await bot.sendMessage(chatId, `🚫 *Blacklisted Users (${blacklist.length}):*\n\n${blacklistStr}`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/timeout(?:@\w+)?\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const minutes = parseInt(match[1]);

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan user yang mau di-timeout!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (minutes < 1 || minutes > 1440) {
    const reply = await bot.sendMessage(chatId, '⚠️ Timeout harus 1-1440 menit (max 24 jam)!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const targetUserId = msg.reply_to_message.from.id;

  if (targetUserId === OWNER_ID || isAdmin(targetUserId)) {
    const reply = await bot.sendMessage(chatId, '❌ Gak bisa timeout admin/owner cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const until = Date.now() + (minutes * 60 * 1000);
  spamTimeouts.set(targetUserId, { until, reason: 'spam' });

  const reply = await bot.sendMessage(chatId, 
    `⏱️ User di-timeout!\n` +
    `👤 User ID: ${targetUserId}\n` +
    `⏰ Durasi: ${minutes} menit`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/listadmins/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (admins.length === 0) {
    const reply = await bot.sendMessage(chatId, '⚠️ Belum ada admin cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const ownerInfo = `👑 *Owner (Admin Utama):*\nUser ID: \`${OWNER_ID}\`\n\n`;
  const otherAdmins = admins.filter(id => id !== OWNER_ID);

  let adminList = ownerInfo;
  if (otherAdmins.length > 0) {
    adminList += `👥 *Admin Lainnya:*\n`;
    adminList += otherAdmins.map((id, i) => `${i + 1}. User ID: \`${id}\``).join('\n');
  }

  const reply = await bot.sendMessage(chatId, adminList, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// 🎯 FILTER COMMANDS
bot.onText(/^!add\s+(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const filterName = match[1].toLowerCase();

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!checkRateLimit(userId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Slow down! Terlalu banyak request!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Validasi filter name
  if (filterName.length < 2 || filterName.length > 50) {
    const reply = await bot.sendMessage(chatId, '⚠️ Nama filter harus 2-50 karakter!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan yang mau dijadiin filter cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const replyMsg = msg.reply_to_message;

  // Validasi: harus ada minimal text atau media
  const hasMedia = replyMsg.photo || replyMsg.video || replyMsg.document || 
                   replyMsg.animation || replyMsg.audio || replyMsg.voice || replyMsg.sticker;
  const hasText = (replyMsg.text && replyMsg.text.trim()) || (replyMsg.caption && replyMsg.caption.trim());

  if (!hasMedia && !hasText) {
    const reply = await bot.sendMessage(chatId, '⚠️ Message harus ada text atau media!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Simpan entities HANYA jika ada, dan dalam format yang benar
  const filterData = {
    text: replyMsg.text || replyMsg.caption || '',
    photo: replyMsg.photo ? replyMsg.photo[replyMsg.photo.length - 1].file_id : null,
    video: replyMsg.video ? replyMsg.video.file_id : null,
    document: replyMsg.document ? replyMsg.document.file_id : null,
    animation: replyMsg.animation ? replyMsg.animation.file_id : null,
    audio: replyMsg.audio ? replyMsg.audio.file_id : null,
    voice: replyMsg.voice ? replyMsg.voice.file_id : null,
    sticker: replyMsg.sticker ? replyMsg.sticker.file_id : null,
    created_at: new Date().toISOString(),
    created_by: userId
  };

  // CRITICAL FIX: Simpan entities DAN caption_entities secara TERPISAH (bukan else-if!)
  // Untuk text messages: gunakan entities
  // Untuk media dengan caption: gunakan caption_entities
  // Beberapa cases bisa punya keduanya, jadi simpan keduanya jika ada
  if (replyMsg.entities && replyMsg.entities.length > 0) {
    filterData.entities = replyMsg.entities;
  }
  if (replyMsg.caption_entities && replyMsg.caption_entities.length > 0) {
    filterData.caption_entities = replyMsg.caption_entities;
  }

  // 💬 FITUR BARU: Simpan inline keyboard/buttons jika ada
  if (replyMsg.reply_markup && replyMsg.reply_markup.inline_keyboard) {
    filterData.buttons = replyMsg.reply_markup.inline_keyboard;
    console.log(`✅ Filter ${filterName} menyimpan ${replyMsg.reply_markup.inline_keyboard.length} baris button`);
  }

  filters[filterName] = filterData;
  const saved = await saveJSON(FILTERS_FILE, filters);

  if (!saved) {
    const reply = await bot.sendMessage(chatId, '❌ Gagal save filter! Check logs.');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const reply = await bot.sendMessage(chatId, `✅ Filter *${filterName}* berhasil ditambah anjir! 🚀`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/^!del\s+(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const filterName = match[1].toLowerCase();

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!checkRateLimit(userId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Slow down! Terlalu banyak request!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!filters[filterName]) {
    const reply = await bot.sendMessage(chatId, `⚠️ Filter *${filterName}* gak ada cok!`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  delete filters[filterName];
  await saveJSON(FILTERS_FILE, filters);

  const reply = await bot.sendMessage(chatId, `✅ Filter *${filterName}* berhasil dihapus!`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/^!list/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const filterNames = Object.keys(filters);

  if (filterNames.length === 0) {
    const reply = await bot.sendMessage(chatId, '⚠️ Belum ada filter cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const { pageItems, totalPages, currentPage } = createPagination(filterNames, 1, 15);
  const filterList = pageItems.map((name, i) => `${i + 1}. \`!${name}\` atau \`${name}\``).join('\n');

  let message = `🎯 *Daftar Filter (${filterNames.length} total):*\n\n${filterList}`;

  const keyboard = totalPages > 1 ? createPaginationKeyboard(currentPage, totalPages, 'filters') : null;

  const reply = await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });

  autoDeleteMessage(chatId, reply.message_id, 5);
});

// 🔍 INFO FILTER COMMAND
bot.onText(/^!info\s+(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const filterName = match[1].toLowerCase();

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const filter = filters[filterName];
  if (!filter) {
    const reply = await bot.sendMessage(chatId, `⚠️ Filter *${filterName}* gak ada cok!`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Determine media type
  let mediaType = '📝 Teks';
  if (filter.photo) mediaType = '🖼️ Photo';
  else if (filter.video) mediaType = '🎥 Video';
  else if (filter.document) mediaType = '📄 Document';
  else if (filter.animation) mediaType = '🎞️ GIF/Animation';
  else if (filter.audio) mediaType = '🎵 Audio';
  else if (filter.voice) mediaType = '🎤 Voice';
  else if (filter.sticker) mediaType = '🎨 Sticker';

  const hasText = filter.text && filter.text.length > 0;
  const hasEntities = (filter.entities && filter.entities.length > 0) || 
                      (filter.caption_entities && filter.caption_entities.length > 0);
  const textLength = filter.text ? filter.text.length : 0;

  const infoMsg = `ℹ️ *Info Filter: ${filterName}*\n\n` +
    `📦 Tipe: ${mediaType}\n` +
    `${hasText ? `📝 Teks: ${textLength} karakter\n` : ''}` +
    `✨ Format: ${hasEntities ? 'Ada (Bold/Italic/dll)' : 'Plain text'}\n` +
    `🔖 Trigger: \`!${filterName}\` atau \`${filterName}\``;

  const reply = await bot.sendMessage(chatId, infoMsg, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// 🤖 AI HOKI HANDLER
bot.on('message', async (msg) => {
  if (!AI_ENABLED) return;
  if (!msg.text) return;
  if (msg.text.startsWith('/') || msg.text.startsWith('!')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Security checks
  if (isBlacklisted(userId)) return;
  if (isTimedOut(userId)) return;
  
  // Deteksi tipe chat: private (DM) atau group
  const isPrivateChat = msg.chat.type === 'private';
  const isGroupChat = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
  
  // Smart triggering berdasarkan tipe chat:
  // - Private chat: AI respon SEMUA pesan
  // - Group chat: AI cuma respon kalau di-reply ke bot
  const botInfo = await bot.getMe();
  const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from.id === botInfo.id;
  
  if (isGroupChat && !isReplyToBot) return; // Di grup, HARUS reply ke bot
  // Di private chat, langsung lanjut (respon semua pesan)
  
  // Get user message
  let userMessage = msg.text.trim();
  if (!userMessage || userMessage.length < 2) return;
  
  // AI-specific rate limiting (cooldown per user)
  const lastAIRequest = aiRateLimits.get(userId) || 0;
  const timeSinceLastRequest = Date.now() - lastAIRequest;
  
  if (timeSinceLastRequest < AI_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((AI_COOLDOWN_MS - timeSinceLastRequest) / 1000);
    const reply = await bot.sendMessage(chatId, `⏱️ Tunggu ${remainingSeconds} detik lagi yaa~ 😊`);
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }
  
  // Update AI rate limit timestamp
  aiRateLimits.set(userId, Date.now());
  
  try {
    // Show typing indicator repeatedly while processing (Telegram typing lasts 5 seconds)
    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);
    
    try {
      // Initial typing indicator
      await bot.sendChatAction(chatId, 'typing');
      
      // Call AI
      const { response, model } = await callGroqAPI(userMessage, userId);
      
      // Stop typing indicator
      clearInterval(typingInterval);
      
      // Send response
      const reply = await bot.sendMessage(chatId, response, {
        reply_to_message_id: msg.message_id
      });
      
      console.log(`🤖 Hoki responded using ${model}`);
    } finally {
      // Always clear the typing interval
      clearInterval(typingInterval);
    }
    
  } catch (err) {
    console.error('❌ AI Error:', err.message);
    
    let errorMsg = 'Maaf nih~ Lagi error. Coba lagi yaa 🙏';
    if (err.message.includes('penuh')) {
      errorMsg = err.message;
    }
    
    const reply = await bot.sendMessage(chatId, errorMsg, {
      reply_to_message_id: msg.message_id
    });
    autoDeleteMessage(chatId, reply.message_id, 5);
  }
});

// 🔔 NOTIFICATION STATS COMMAND
bot.onText(/^!notifstats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const statsMsg = `🔔 *Notification System Stats*\n\n` +
    `👋 Welcomes Sent: ${notificationStats.welcomesSent}\n` +
    `📊 Daily Stats Sent: ${notificationStats.dailyStatsSent}\n` +
    `🚨 Critical Alerts Sent: ${notificationStats.alertsSent}\n\n` +
    `✅ System: Active`;

  const reply = await bot.sendMessage(chatId, statsMsg, { parse_mode: 'Markdown' });
  autoDeleteMessage(chatId, reply.message_id, 10);
});

// 📊 AI STATS COMMAND
bot.onText(/^!aistats/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!AI_ENABLED) {
    const reply = await bot.sendMessage(chatId, '⚠️ AI Hoki belum diaktifkan! Set GROQ_API_KEY di .env');
    autoDeleteMessage(chatId, reply.message_id, 5);
    return;
  }

  const modelStats = AI_MODELS.map(m => 
    `${m.name}:\n  Used: ${m.used}/${m.limit}\n  Quality: ${m.quality}/10\n  Use: ${m.use}`
  ).join('\n\n');

  const statsMsg = `🤖 *AI Hoki Statistics*\n\n` +
    `📊 *Overall:*\n` +
    `Total Requests: ${aiStats.totalRequests}\n` +
    `Successful: ${aiStats.successfulResponses}\n` +
    `Failed: ${aiStats.failedResponses}\n` +
    `Success Rate: ${aiStats.totalRequests > 0 ? ((aiStats.successfulResponses / aiStats.totalRequests) * 100).toFixed(1) : 0}%\n\n` +
    `🎯 *Model Usage:*\n${modelStats}\n\n` +
    `💬 *Active Conversations:* ${aiConversations.size}`;

  const reply = await bot.sendMessage(chatId, statsMsg, { parse_mode: 'Markdown' });
  autoDeleteMessage(chatId, reply.message_id, 10);
});

// 🔄 AI RESET COMMAND (Owner only)
bot.onText(/^!aireset/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isOwner(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Cuma owner yang bisa reset AI stats!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Reset model usage counters
  AI_MODELS.forEach(m => m.used = 0);
  
  // Clear conversation history
  aiConversations.clear();
  
  // Reset stats
  aiStats = {
    totalRequests: 0,
    successfulResponses: 0,
    failedResponses: 0,
    modelUsage: {}
  };

  const reply = await bot.sendMessage(chatId, '✅ AI stats & conversations berhasil di-reset!');
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// 🔎 SEARCH FILTER COMMAND
bot.onText(/^!search\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const searchTerm = match[1].toLowerCase();

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const filterNames = Object.keys(filters);
  const results = filterNames.filter(name => name.includes(searchTerm));

  if (results.length === 0) {
    const reply = await bot.sendMessage(chatId, `🔍 Gak ada filter yang match dengan *${searchTerm}*`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const resultList = results.map((name, i) => `${i + 1}. \`!${name}\` atau \`${name}\``).join('\n');
  const message = `🔍 *Hasil Pencarian "${searchTerm}" (${results.length} hasil):*\n\n${resultList}`;

  const reply = await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// 💾 EXPORT FILTERS (Owner only)
bot.onText(/^!export/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isOwner(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Cuma owner yang bisa export filters!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  try {
    // Show typing while preparing export
    await bot.sendChatAction(chatId, 'upload_document');
    
    const exportData = {
      exported_at: new Date().toISOString(),
      filter_count: Object.keys(filters).length,
      filters: filters
    };

    const exportJson = JSON.stringify(exportData, null, 2);
    const filename = `filters_backup_${Date.now()}.json`;

    await bot.sendDocument(chatId, Buffer.from(exportJson), {
      caption: `✅ *Backup Filters*\n\n` +
        `📦 Total: ${Object.keys(filters).length} filters\n` +
        `📅 Tanggal: ${new Date().toLocaleString('id-ID')}`,
      parse_mode: 'Markdown'
    }, {
      filename: filename,
      contentType: 'application/json'
    });
  } catch (err) {
    console.error('Export error:', err);
    const reply = await bot.sendMessage(chatId, '❌ Gagal export filters!');
    autoDeleteMessage(chatId, reply.message_id, 3);
  }
});

// 📋 CLONE FILTER
bot.onText(/^!clone\s+(\w+)\s+(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const sourceFilter = match[1].toLowerCase();
  const targetFilter = match[2].toLowerCase();

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!checkRateLimit(userId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Slow down! Terlalu banyak request!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!filters[sourceFilter]) {
    const reply = await bot.sendMessage(chatId, `⚠️ Filter *${sourceFilter}* gak ada cok!`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (filters[targetFilter]) {
    const reply = await bot.sendMessage(chatId, `⚠️ Filter *${targetFilter}* udah ada! Hapus dulu atau pake nama lain.`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Deep copy filter
  filters[targetFilter] = JSON.parse(JSON.stringify(filters[sourceFilter]));
  await saveJSON(FILTERS_FILE, filters);

  const reply = await bot.sendMessage(chatId, `✅ Filter *${sourceFilter}* berhasil di-clone ke *${targetFilter}*! 🎉`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// ✏️ RENAME FILTER
bot.onText(/^!rename\s+(\w+)\s+(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const oldName = match[1].toLowerCase();
  const newName = match[2].toLowerCase();

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!checkRateLimit(userId)) {
    const reply = await bot.sendMessage(chatId, '⚠️ Slow down! Terlalu banyak request!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (!filters[oldName]) {
    const reply = await bot.sendMessage(chatId, `⚠️ Filter *${oldName}* gak ada cok!`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  if (filters[newName]) {
    const reply = await bot.sendMessage(chatId, `⚠️ Filter *${newName}* udah ada! Pake nama lain.`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Rename
  filters[newName] = filters[oldName];
  delete filters[oldName];
  await saveJSON(FILTERS_FILE, filters);

  const reply = await bot.sendMessage(chatId, `✅ Filter *${oldName}* berhasil di-rename jadi *${newName}*! ✨`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data === 'noop') {
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith('filters_')) {
    const page = parseInt(data.split('_')[1]);
    const filterNames = Object.keys(filters);

    const { pageItems, totalPages, currentPage } = createPagination(filterNames, page, 15);
    const filterList = pageItems.map((name, i) => {
      const num = (page - 1) * 15 + i + 1;
      return `${num}. \`!${name}\` atau \`${name}\``;
    }).join('\n');

    const message = `🎯 *Daftar Filter (${filterNames.length} total):*\n\n${filterList}`;
    const keyboard = createPaginationKeyboard(currentPage, totalPages, 'filters');

    bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }).catch(() => {});

    bot.answerCallbackQuery(query.id);
  }
});

// Optimized filter trigger handler with keyword detection
bot.on('message', async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;
  if (msg.text.startsWith('!add') || msg.text.startsWith('!del') || 
      msg.text.startsWith('!list') || msg.text.startsWith('!status')) return;

  const chatId = msg.chat.id;
  const lowerText = msg.text.toLowerCase();
  let filterName = null;
  let filter = null;

  // Priority 1: Exact match dengan ! prefix (command style)
  if (msg.text.startsWith('!')) {
    const exactName = msg.text.substring(1).trim().toLowerCase();
    if (filters[exactName]) {
      filterName = exactName;
      filter = filters[exactName];
    }
  }
  
  // Priority 2: Exact match tanpa ! (jika seluruh pesan adalah nama filter)
  if (!filter) {
    const exactName = msg.text.trim().toLowerCase();
    if (filters[exactName]) {
      filterName = exactName;
      filter = filters[exactName];
    }
  }
  
  // Priority 3: Keyword detection dalam pesan panjang (cari filter pertama yang match)
  if (!filter) {
    // Dapatkan semua filter names
    const allFilterNames = Object.keys(filters);
    
    // Cari filter pertama yang muncul di text (by position)
    let earliestPosition = Infinity;
    let earliestFilter = null;
    
    for (const fname of allFilterNames) {
      const position = lowerText.indexOf(fname);
      if (position !== -1 && position < earliestPosition) {
        earliestPosition = position;
        earliestFilter = fname;
      }
    }
    
    if (earliestFilter) {
      filterName = earliestFilter;
      filter = filters[earliestFilter];
    }
  }

  // Jika tidak ada filter yang match, skip
  if (!filter) return;

  // Security: Check blacklist dan timeout
  if (isBlacklisted(msg.from.id)) {
    console.log(`🚫 Blacklisted user ${msg.from.id} tried to use filter`);
    return;
  }

  if (isTimedOut(msg.from.id)) {
    const remaining = getTimeoutRemaining(msg.from.id);
    const reply = await bot.sendMessage(chatId, 
      `⏱️ Kamu masih timeout ${remaining} detik lagi~`
    );
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // DEBUG: Log filter trigger
  console.log(`🔍 Filter triggered: "${filterName}"`);
  console.log('Filter data:', JSON.stringify(filter, null, 2));

  // Prepare reply button if filter has buttons
  let replyMarkup = null;
  if (filter.buttons && filter.buttons.length > 0) {
    replyMarkup = {
      inline_keyboard: filter.buttons.map(row => 
        row.map(btn => ({
          text: btn.text,
          url: btn.url,
          callback_data: btn.callback_data
        }))
      )
    };
  }

  try {
    // CRITICAL: entities dan parse_mode TIDAK BISA digunakan bersamaan di Telegram API!
    // Jika ada entities -> gunakan entities saja, JANGAN tambahkan parse_mode
    // Jika tidak ada entities -> gunakan parse_mode untuk fallback Markdown

    // CRITICAL FIX: Convert entities to HTML for text messages too
    let formattedText = filter.text;
    let textParseMode = null;
    
    if (filter.entities && filter.entities.length > 0) {
      // Convert entities to HTML format
      formattedText = entitiesToHTML(filter.text, filter.entities);
      textParseMode = 'HTML';
      console.log('✅ Converted text entities to HTML');
    }
    // NO FALLBACK to Markdown for plain text - send as-is without parse_mode
    // Markdown fallback would break text with special chars like _, *, [, etc

    // CRITICAL FIX: Convert entities to HTML since caption_entities doesn't work in node-telegram-bot-api
    let formattedCaption = filter.text;
    let captionParseMode = null;
    
    if (filter.text && filter.text.trim().length > 0) {
      // Ada text/caption yang tidak kosong
      if (filter.caption_entities && filter.caption_entities.length > 0) {
        // PRIORITY 1: Convert caption_entities to HTML format
        formattedCaption = entitiesToHTML(filter.text, filter.caption_entities);
        captionParseMode = 'HTML';
        console.log('✅ Converted caption_entities to HTML');
        console.log('Original:', filter.text);
        console.log('Formatted:', formattedCaption);
      } else if (filter.entities && filter.entities.length > 0) {
        // PRIORITY 2: Fallback ke entities untuk backward compatibility
        formattedCaption = entitiesToHTML(filter.text, filter.entities);
        captionParseMode = 'HTML';
        console.log('⚠️ Converted entities to HTML (fallback)');
      }
      // NO FALLBACK to Markdown for plain text - send as-is without parse_mode
      // Markdown fallback would break text with special chars like _, *, [, etc
      // captionParseMode remains null for plain text
    }

    if (filter.photo) {
      const photoOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        photoOptions.caption = formattedCaption;
        if (captionParseMode) {
          photoOptions.parse_mode = captionParseMode;
        }
      }
      if (replyMarkup) photoOptions.reply_markup = replyMarkup;
      console.log('📸 Sending photo with HTML caption:', photoOptions.caption);
      await bot.sendPhoto(chatId, filter.photo, photoOptions);
      
    } else if (filter.video) {
      const videoOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        videoOptions.caption = formattedCaption;
        if (captionParseMode) {
          videoOptions.parse_mode = captionParseMode;
        }
      }
      if (replyMarkup) videoOptions.reply_markup = replyMarkup;
      console.log('🎥 Sending video with HTML caption:', videoOptions.caption);
      await bot.sendVideo(chatId, filter.video, videoOptions);
      
    } else if (filter.animation) {
      const animOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        animOptions.caption = formattedCaption;
        if (captionParseMode) {
          animOptions.parse_mode = captionParseMode;
        }
      }
      console.log('🎞️ Sending animation with HTML caption');
      await bot.sendAnimation(chatId, filter.animation, animOptions);
      
    } else if (filter.document) {
      const docOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        docOptions.caption = formattedCaption;
        if (captionParseMode) {
          docOptions.parse_mode = captionParseMode;
        }
      }
      console.log('📄 Sending document with HTML caption');
      await bot.sendDocument(chatId, filter.document, docOptions);
      
    } else if (filter.audio) {
      const audioOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        audioOptions.caption = formattedCaption;
        if (captionParseMode) {
          audioOptions.parse_mode = captionParseMode;
        }
      }
      console.log('🎵 Sending audio with HTML caption');
      await bot.sendAudio(chatId, filter.audio, audioOptions);
      
    } else if (filter.voice) {
      const voiceOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        voiceOptions.caption = formattedCaption;
        if (captionParseMode) {
          voiceOptions.parse_mode = captionParseMode;
        }
      }
      console.log('🎤 Sending voice with HTML caption');
      await bot.sendVoice(chatId, filter.voice, voiceOptions);
    } else if (filter.sticker) {
      await bot.sendSticker(chatId, filter.sticker);
      if (formattedText && formattedText.trim().length > 0) {
        const msgOptions = {};
        if (textParseMode) msgOptions.parse_mode = textParseMode;
        await bot.sendMessage(chatId, formattedText, msgOptions);
      }
    } else if (formattedText && formattedText.trim().length > 0) {
      const msgOptions = {};
      if (textParseMode) msgOptions.parse_mode = textParseMode;
      console.log('💬 Sending text message with HTML formatting');
      await bot.sendMessage(chatId, formattedText, msgOptions);
    }
  } catch (err) {
    console.error('❌ Filter send error:', err.message);
    console.error('Filter name:', filterName);
    console.error('Error code:', err.code);
    
    // Detailed logging untuk debugging
    if (err.response && err.response.body) {
      console.error('API Response:', JSON.stringify(err.response.body, null, 2));
    }
    
    // IMPROVED: Kirim notification ke admin yang trigger, dan juga ke owner untuk critical errors
    if (isAdmin(msg.from.id)) {
      bot.sendMessage(chatId, `⚠️ Error sending filter *${filterName}*:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      }).catch(() => {});
    }
    
    // Notify owner untuk critical errors (kecuali owner yang trigger sendiri)
    if (msg.from.id !== OWNER_ID && (err.code === 'EFATAL' || err.message.includes('parse'))) {
      notifyCriticalError(err.message, {
        chatId: chatId,
        userId: msg.from.id,
        filterName: filterName
      });
    }
  }
});

bot.onText(/^!status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Show typing while calculating stats
  await bot.sendChatAction(chatId, 'typing');

  // Filter statistics
  const filterStats = {
    text: 0,
    photo: 0,
    video: 0,
    document: 0,
    animation: 0,
    audio: 0,
    voice: 0,
    sticker: 0
  };

  Object.values(filters).forEach(filter => {
    if (filter.photo) filterStats.photo++;
    else if (filter.video) filterStats.video++;
    else if (filter.document) filterStats.document++;
    else if (filter.animation) filterStats.animation++;
    else if (filter.audio) filterStats.audio++;
    else if (filter.voice) filterStats.voice++;
    else if (filter.sticker) filterStats.sticker++;
    else if (filter.text) filterStats.text++;
  });

  const memUsage = process.memoryUsage();
  const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);

  // Calculate oldest filter
  let oldestFilter = null;
  let oldestDate = null;
  Object.entries(filters).forEach(([name, data]) => {
    if (data.created_at) {
      const date = new Date(data.created_at);
      if (!oldestDate || date < oldestDate) {
        oldestDate = date;
        oldestFilter = name;
      }
    }
  });

  const status = `📊 *Status Bot*\n\n` +
    `👑 Total Admin: *${admins.length}*\n` +
    `🎯 Total Filter: *${Object.keys(filters).length}*\n` +
    `⚡ Active Timers: *${deleteTimers.size}*\n` +
    `🗑️ Rate Limits Tracked: *${rateLimits.size}*\n` +
    `💾 Memory: *${memMB} MB*\n` +
    `⏱️ Uptime: *${uptimeHours}h ${uptimeMinutes}m*\n\n` +
    `📦 *Filter Breakdown:*\n` +
    `📝 Text: ${filterStats.text}\n` +
    `🖼️ Photo: ${filterStats.photo}\n` +
    `🎥 Video: ${filterStats.video}\n` +
    `📄 Document: ${filterStats.document}\n` +
    `🎞️ GIF: ${filterStats.animation}\n` +
    `🎵 Audio: ${filterStats.audio}\n` +
    `🎤 Voice: ${filterStats.voice}\n` +
    `🎨 Sticker: ${filterStats.sticker}\n\n` +
    (oldestFilter ? `📅 Oldest Filter: \`${oldestFilter}\`\n\n` : '') +
    `✅ Status: *Online* 🚀`;

  const reply = await bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// Enhanced error handling for slow internet
let pollingErrorCount = 0;
let lastErrorTime = 0;
const MAX_RETRY_ATTEMPTS = 10; // More attempts for slow internet

bot.on('polling_error', (error) => {
  const now = Date.now();
  
  console.error('⚠️ Polling error:', error.code, error.message);
  
  // Reset counter if last error was more than 2 minutes ago
  if (now - lastErrorTime > 120000) {
    pollingErrorCount = 0;
  }
  
  lastErrorTime = now;
  pollingErrorCount++;
  
  // Don't exit immediately on network errors for slow connections
  const isNetworkError = error.code === 'EFATAL' || 
                         error.code === 'ETELEGRAM' || 
                         error.code === 'ETIMEDOUT' ||
                         error.message.includes('getUpdates');
  
  if (pollingErrorCount >= MAX_RETRY_ATTEMPTS && !isNetworkError) {
    console.error('❌ Max retry attempts reached. Possible issues:');
    console.error('   1. BOT_TOKEN tidak valid');
    console.error('   2. Bot instance lain menggunakan token yang sama');
    console.error('\n💡 Solusi:');
    console.error('   - Cek BOT_TOKEN di .env');
    console.error('   - Stop bot instance lain yang menggunakan token ini');
    process.exit(1);
  }
  
  // Longer backoff for slow internet: 5s, 10s, 15s, 20s, max 30s
  const backoffDelay = Math.min(5000 * Math.min(pollingErrorCount, 6), 30000);
  
  console.log(`🔄 Retry ${pollingErrorCount}/${MAX_RETRY_ATTEMPTS} in ${backoffDelay/1000}s (slow internet mode)...`);
  
  setTimeout(() => {
    bot.stopPolling().then(() => {
      bot.startPolling({ restart: true });
    }).catch(err => {
      console.error('Failed to restart polling:', err.message);
    });
  }, backoffDelay);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');

  // Clear all timers
  deleteTimers.forEach(timer => clearTimeout(timer));
  deleteTimers.clear();

  // Stop polling
  await bot.stopPolling();

  console.log('👋 Bot stopped');
  process.exit(0);
});

// Health check command untuk monitoring
bot.onText(/^!health/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!isOwner(userId)) return;

  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    filters: Object.keys(filters).length,
    admins: admins.length,
    active_timers: deleteTimers.size,
    rate_limits: rateLimits.size
  };

  await bot.sendMessage(chatId, `\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``, {
    parse_mode: 'Markdown'
  });
});

// Retry helper for slow connections
async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      const delay = initialDelay * Math.pow(2, i);
      console.log(`⏳ Retry ${i + 1}/${maxRetries} in ${delay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Validate bot token and delete webhook before polling
async function validateBotToken() {
  try {
    console.log('🔍 Validating bot token...');
    
    // Try to delete webhook with retries (not critical if fails)
    try {
      await retryWithBackoff(async () => {
        await bot.deleteWebHook();
      }, 3, 3000);
      console.log('✅ Webhook deleted (polling mode)');
    } catch (err) {
      console.log('⚠️ Could not delete webhook (will continue anyway):', err.code || err.message);
      console.log('💡 Bot will still work, but may have slower startup');
    }
    
    // Validate token with retries for slow connection
    const me = await retryWithBackoff(async () => {
      return await bot.getMe();
    }, 5, 3000);
    
    console.log(`✅ Bot token valid! Connected as: @${me.username}`);
    return true;
  } catch (err) {
    console.error('❌ Bot token validation failed:', err.code || err.message);
    console.error('\n💡 Possible issues:');
    console.error('   1. BOT_TOKEN tidak valid - cek di .env file');
    console.error('   2. Koneksi internet terlalu lambat/tidak stabil');
    console.error('   3. Telegram API unreachable dari network kamu');
    console.error('\n🔧 Solusi:');
    console.error('   - Pastikan BOT_TOKEN benar (@BotFather)');
    console.error('   - Coba gunakan koneksi internet yang lebih stabil');
    console.error('   - Tunggu beberapa saat dan coba lagi');
    return false;
  }
}

// Initialize and start
initializeData().then(async () => {
  console.log('📦 Data initialized');
  console.log(`📊 Loaded ${admins.length} admins and ${Object.keys(filters).length} filters`);
  
  // Validate token before starting polling
  const isValid = await validateBotToken();
  if (!isValid) {
    process.exit(1);
  }
  
  // Start polling only after validation
  await bot.startPolling();
  console.log('🤖 Bot started successfully! 🚀');
}).catch(err => {
  console.error('❌ Failed to initialize:', err);
  process.exit(1);
});
