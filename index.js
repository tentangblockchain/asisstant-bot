// 🔥 BOT TELEGRAM - ADMIN & FILTER MANAGEMENT (OPTIMIZED)
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');
const winston = require('winston'); // For structured logging

// ============ Logger Configuration ============
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'bot' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
// ==============================================

// ============ IPv4 FIX - FORCE IPv4 ONLY ============
// Force IPv4 untuk mengatasi masalah timeout IPv6
dns.setDefaultResultOrder('ipv4first');

const httpsAgent = new https.Agent({
  family: 4,  // Force IPv4 only
  keepAlive: true,
  keepAliveMsecs: 30000,
  timeout: 120000  // 2 minutes
});

logger.info('🌐 Menggunakan konfigurasi IPv4-only untuk koneksi Telegram API');
// =====================================================

// Validate environment variables
if (!process.env.BOT_TOKEN) {
  logger.error('❌ BOT_TOKEN tidak ditemukan di .env file!');
  process.exit(1);
}

if (!process.env.OWNER_ID) {
  logger.error('❌ OWNER_ID tidak ditemukan di .env file!');
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

// Multi-model cascade system (AI Hoki) - OPTIMIZED
const AI_MODELS = [
    {
        name: 'llama-3.3-70b-versatile',
        dailyLimit: 1000,           // Request per hari
        tokensPerDay: 100000,       // Token limit per hari
        tokensPerMin: 12000,        // Token per menit
        rpm: 30,                    // Request per menit
        quality: 10,                // Quality score (1-10)
        latency: 300,               // Average latency (ms)
        used: 0,                    // Daily counter
        rpmUsed: 0,                 // Per-minute counter
        lastReset: Date.now(),      // Last reset timestamp
        tier: 1,                    // Priority tier
        use: 'premium',
        description: 'Best quality - Admin priority, complex queries'
    },
    {
        name: 'llama-3.1-8b-instant',
        dailyLimit: 14400,
        tokensPerDay: 500000,
        tokensPerMin: 6000,
        rpm: 30,
        quality: 7,
        latency: 150,
        used: 0,
        rpmUsed: 0,
        lastReset: Date.now(),
        tier: 2,
        use: 'general',
        description: 'Fast & balanced - All users, simple queries'
    },
    {
        name: 'llama-3.1-70b-versatile',  // Changed from guard model
        dailyLimit: 1000,
        tokensPerDay: 100000,
        tokensPerMin: 12000,
        rpm: 30,
        quality: 9,
        latency: 250,
        used: 0,
        rpmUsed: 0,
        lastReset: Date.now(),
        tier: 3,
        use: 'fallback',
        description: 'Backup premium - When Tier 1 & 2 limited'
    }
];

// Separate content moderation model
const GUARD_MODEL = {
    name: 'meta-llama/llama-guard-3-8b',
    dailyLimit: 14400,
    tokensPerMin: 15000,
    rpm: 30,
    used: 0,
    rpmUsed: 0,
    lastReset: Date.now(),
    description: 'Content moderation - Filter harmful content'
};

// AI Model Router Class
class AIModelRouter {
    constructor() {
        this.models = AI_MODELS;
        this.guard = GUARD_MODEL;
    }

    // Reset RPM counters every minute
    resetMinuteCounters() {
        const now = Date.now();
        this.models.forEach(model => {
            if (now - model.lastReset > 60000) {
                model.rpmUsed = 0;
                model.lastReset = now;
                logger.info(`🔄 Reset RPM for ${model.name}`);
            }
        });

        if (now - this.guard.lastReset > 60000) {
            this.guard.rpmUsed = 0;
            this.guard.lastReset = now;
        }
    }

    // Reset daily counters (called from hourly interval)
    resetDailyCounters() {
        this.models.forEach(model => {
            const previousUsed = model.used;
            model.used = 0;
            if (previousUsed > 0) {
                logger.info(`🔄 Reset daily counter ${model.name}: ${previousUsed} -> 0`);
            }
        });
        this.guard.used = 0;
    }

    // Check if model is available
    isAvailable(model) {
        return (
            model.rpmUsed < model.rpm &&
            model.used < model.dailyLimit
        );
    }

    // Analyze query complexity
    analyzeComplexity(text) {
        let score = 0;

        // Length-based scoring
        if (text.length > 500) score += 0.3;
        if (text.split('\n').length > 5) score += 0.2;

        // Technical keywords
        if (/code|function|algorithm|technical|programming|debug/i.test(text)) score += 0.3;

        // Complex question keywords
        if (/explain|analyze|compare|detailed|why|how does|difference/i.test(text)) score += 0.2;

        if (score < 0.3) return 'simple';
        if (score < 0.7) return 'medium';
        return 'complex';
    }

    // Select best available model
    selectModel(userId, isAdmin = false, text = '') {
        this.resetMinuteCounters();

        const complexity = this.analyzeComplexity(text);
        logger.info(`🔍 Query complexity: ${complexity}`);

        // TIER 1: Admin + complex query → Premium
        if (isAdmin && complexity === 'complex') {
            const premium = this.models.find(m => m.tier === 1);
            if (this.isAvailable(premium)) {
                logger.info(`🎯 Selected Tier 1: ${premium.name}`);
                return premium;
            }
        }

        // TIER 2: General model for most queries
        const general = this.models.find(m => m.tier === 2);
        if (this.isAvailable(general)) {
            logger.info(`🎯 Selected Tier 2: ${general.name}`);
            return general;
        }

        // TIER 3: Fallback premium model
        const fallback = this.models.find(m => m.tier === 3);
        if (this.isAvailable(fallback)) {
            logger.info(`🎯 Selected Tier 3: ${fallback.name}`);
            return fallback;
        }

        // LAST RESORT: Try tier 1 again (might have reset)
        const premium = this.models.find(m => m.tier === 1);
        if (this.isAvailable(premium)) {
            logger.info(`🎯 Selected Tier 1 (last resort): ${premium.name}`);
            return premium;
        }

        throw new Error('⚠️ All AI models are rate limited! Try again in 1 minute.');
    }

    // Increment usage counters
    incrementUsage(model) {
        model.rpmUsed++;
        model.used++;

        logger.info(`📊 ${model.name}: RPM ${model.rpmUsed}/${model.rpm}, Daily ${model.used}/${model.dailyLimit}`);
    }

    // Get statistics
    getStats() {
        return {
            models: this.models.map(m => ({
                name: m.name,
                tier: m.tier,
                quality: m.quality,
                rpm: `${m.rpmUsed}/${m.rpm}`,
                daily: `${m.used}/${m.dailyLimit}`,
                available: this.isAvailable(m) ? '✅' : '❌',
                description: m.description
            })),
            guard: {
                name: this.guard.name,
                rpm: `${this.guard.rpmUsed}/${this.guard.rpm}`,
                daily: `${this.guard.used}/${this.guard.dailyLimit}`,
                available: this.isAvailable(this.guard) ? '✅' : '❌'
            }
        };
    }
}

// Initialize AI Router
const aiRouter = new AIModelRouter();

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
let AI_STATS = { // Renamed from aiStats for consistency with AI_MODELS
    totalRequests: 0,
    successfulResponses: 0,
    failedResponses: 0, // Renamed from failedResponses to avoid confusion with error handling
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
      logger.info(`🧹 Cleaned up long conversation for user ${userId}`);
    }
  }
}, 60000); // Every minute

// Reset model counters every hour (Groq limit resets hourly)
setInterval(() => {
  if (AI_ENABLED) {
    aiRouter.resetDailyCounters();
    logger.info('✅ AI model counters reset (hourly)');
  }
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

    logger.info('✅ Data initialized successfully');
    logger.info(`🤖 AI Hoki: ${AI_ENABLED ? 'ENABLED ✅' : 'DISABLED (GROQ_API_KEY not set)'}`);
  } catch (err) {
    logger.error('❌ Initialization error:', err);
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
    logger.error(`Error loading ${file}:`, err);
  }
  return defaultValue;
}

async function saveJSON(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    logger.error(`Error saving ${file}:`, err);
    return false;
  }
}

// CRITICAL FIX: Convert entities to HTML format
// node-telegram-bot-api doesn't support caption_entities properly!
// We need to convert entities to HTML and use parse_mode instead
function entitiesToHTML(text, entities) {
  if (!entities || entities.length === 0) return text;

  const segments = [];
  let lastOffset = 0;

  const sortedEntities = [...entities].sort((a, b) => a.offset - b.offset);

  for (const entity of sortedEntities) {
    const { offset, length, type, url, user } = entity;

    if (offset > lastOffset) {
      segments.push({
        text: text.substring(lastOffset, offset),
        type: 'plain'
      });
    }

    const content = text.substring(offset, offset + length);
    segments.push({
      text: content,
      type: type,
      url: url,
      user: user
    });

    lastOffset = offset + length;
  }

  if (lastOffset < text.length) {
    segments.push({
      text: text.substring(lastOffset),
      type: 'plain'
    });
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
  }

  let result = '';
  for (const segment of segments) {
    const { text: segText, type, url, user } = segment;
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
// This function is now replaced by aiRouter.selectModel() in the AI chat handler
// function getBestModel(userId) { ... }

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
  // Select best available model
  let selectedModel;
  try {
    selectedModel = aiRouter.selectModel(userId, isAdmin(userId), userMessage);
  } catch (err) {
    throw err; // Re-throw to be caught by the message handler
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
        model: selectedModel.name,
        messages: messages,
        temperature: 0.8,
        max_tokens: 300, // Concise responses
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Increment model usage
    aiRouter.incrementUsage(selectedModel);
    AI_STATS.totalRequests++;
    AI_STATS.successfulResponses++;
    AI_STATS.modelUsage[selectedModel.name] = (AI_STATS.modelUsage[selectedModel.name] || 0) + 1;

    // Save conversation history (limit to MAX_CONVERSATION_LENGTH pairs)
    history.push({ role: 'user', content: sanitizedMessage });
    history.push({ role: 'assistant', content: aiResponse });

    // Keep only recent conversation (prevent memory bloat)
    const trimmedHistory = history.slice(-MAX_CONVERSATION_LENGTH * 2);
    aiConversations.set(userId, trimmedHistory);

    return {
      response: aiResponse,
      model: selectedModel.name,
      tokensUsed: data.usage?.total_tokens || 0
    };

  } catch (err) {
    AI_STATS.failedResponses++;
    logger.error(`AI Call Failed: ${err.message}`);
    throw err;
  }
}

// Rate limiting check
function checkRateLimit(userId) {
  const now = Date.now();
  const userLimits = rateLimits.get(userId) || [];
  const validLimits = userLimits.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (validLimits.length >= MAX_REQUESTS) {
    return false; // Exceeded limit
  }

  validLimits.push(now);
  rateLimits.set(userId, validLimits);
  return true; // Within limit
}

// Optimized auto-delete with cleanup
function autoDeleteMessage(chatId, messageId, delayMinutes = 3) {
  const key = `${chatId}_${messageId}`;

  if (deleteTimers.has(key)) {
    clearTimeout(deleteTimers.get(key));
  }

  const timer = setTimeout(async () => {
    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (err) {
      // Ignore errors (message might be already deleted or bot lacks permissions)
      if (err.code !== 400 && err.code !== 403) { // Log non-common errors
        logger.warn(`Failed to delete message ${messageId} in chat ${chatId}: ${err.message}`);
      }
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

  buttons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'noop' }); // No operation

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

  if (targetUserId === OWNER_ID) {
    const reply = await bot.sendMessage(chatId, '❌ Gak bisa jadikan owner admin lagi, dia udah owner! 👑');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

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
      logger.info(`👋 Welcome message sent to ${firstName} (${member.id})`);
    } catch (err) {
      logger.error('❌ Failed to send welcome message:', err.message);
    }
  }
});

// Daily stats notification (runs every 24 hours)
let dailyStatsInterval = null;

function startDailyStats() {
  const now = new Date();
  const scheduledTime = new Date();
  scheduledTime.setHours(9, 0, 0, 0); // 9 AM

  if (scheduledTime <= now) {
    scheduledTime.setDate(scheduledTime.getDate() + 1);
  }

  const timeUntilFirstRun = scheduledTime - now;

  setTimeout(() => {
    sendDailyStats();
    dailyStatsInterval = setInterval(sendDailyStats, 24 * 60 * 60 * 1000);
  }, timeUntilFirstRun);

  logger.info(`📊 Daily stats scheduled for ${scheduledTime.toLocaleString('id-ID')}`);
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
    `Total Requests: ${AI_STATS.totalRequests}\n` +
    `Success Rate: ${AI_STATS.totalRequests > 0 ? ((AI_STATS.successfulResponses / AI_STATS.totalRequests) * 100).toFixed(1) : 0}%\n` +
    `Active Conversations: ${aiConversations.size}\n\n` : ''}` +
    `🔔 *Notifications:*\n` +
    `Welcomes Sent: ${notificationStats.welcomesSent}\n` +
    `Alerts Sent: ${notificationStats.alertsSent}\n\n` +
    `✅ Bot Status: Online 🚀`;

  try {
    await bot.sendMessage(OWNER_ID, statsMsg, { parse_mode: 'Markdown' });
    notificationStats.dailyStatsSent++;
    logger.info('📊 Daily stats sent to owner');
  } catch (err) {
    logger.error('❌ Failed to send daily stats:', err.message);
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
      logger.info('🚨 Critical error notification sent to owner');
    })
    .catch(err => logger.error('Failed to send error notification:', err.message));
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

  const hasMedia = replyMsg.photo || replyMsg.video || replyMsg.document ||
                   replyMsg.animation || replyMsg.audio || replyMsg.voice || replyMsg.sticker;
  const hasText = (replyMsg.text && replyMsg.text.trim()) || (replyMsg.caption && replyMsg.caption.trim());

  if (!hasMedia && !hasText) {
    const reply = await bot.sendMessage(chatId, '⚠️ Message harus ada text atau media!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

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

  if (replyMsg.entities && replyMsg.entities.length > 0) {
    filterData.entities = replyMsg.entities;
  }
  if (replyMsg.caption_entities && replyMsg.caption_entities.length > 0) {
    filterData.caption_entities = replyMsg.caption_entities;
  }

  if (replyMsg.reply_markup && replyMsg.reply_markup.inline_keyboard) {
    filterData.buttons = replyMsg.reply_markup.inline_keyboard;
    logger.info(`✅ Filter ${filterName} menyimpan ${replyMsg.reply_markup.inline_keyboard.length} baris button`);
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

  if (isBlacklisted(userId)) return;
  if (isTimedOut(userId)) return;

  const isPrivateChat = msg.chat.type === 'private';
  const isGroupChat = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  const botInfo = await bot.getMe();
  const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from.id === botInfo.id;

  if (isGroupChat && !isReplyToBot) return;

  let userMessage = msg.text.trim();
  if (!userMessage || userMessage.length < 2) return;

  const lastAIRequest = aiRateLimits.get(userId) || 0;
  const timeSinceLastRequest = Date.now() - lastAIRequest;

  if (timeSinceLastRequest < AI_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((AI_COOLDOWN_MS - timeSinceLastRequest) / 1000);
    const reply = await bot.sendMessage(chatId, `⏱️ Tunggu ${remainingSeconds} detik lagi yaa~ 😊`);
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  aiRateLimits.set(userId, Date.now());

  try {
    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);

    try {
      await bot.sendChatAction(chatId, 'typing');
      const { response, model } = await callGroqAPI(userMessage, userId);
      clearInterval(typingInterval);

      const reply = await bot.sendMessage(chatId, response, {
        reply_to_message_id: msg.message_id
      });

      logger.info(`🤖 Hoki responded using ${model}`);
    } finally {
      clearInterval(typingInterval);
    }

  } catch (err) {
    logger.error('❌ AI Error:', err.message);

    let errorMsg = 'Maaf nih~ Lagi error. Coba lagi yaa 🙏';
    if (err.message.includes('rate limited') || err.message.includes('overload')) {
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

  const routerStats = aiRouter.getStats();

  const modelStats = routerStats.models.map(m =>
    `${m.available} Tier ${m.tier}: \`${m.name.split('/').pop()}\`\n` +
    `   Quality: ${m.quality}/10\n` +
    `   RPM: ${m.rpm} | Daily: ${m.daily}\n` +
    `   ${m.description}`
  ).join('\n\n');

  const statsMsg = `🤖 *AI Hoki Statistics*\n\n` +
    `📊 *Overall Stats:*\n` +
    `Total Requests: ${AI_STATS.totalRequests}\n` +
    `Successful: ${AI_STATS.successfulResponses}\n` +
    `Failed: ${AI_STATS.failedResponses}\n` +
    `Success Rate: ${AI_STATS.totalRequests > 0 ?
      ((AI_STATS.successfulResponses / AI_STATS.totalRequests) * 100).toFixed(1) : 0}%\n\n` +
    `🤖 *Models Status:*\n${modelStats}\n\n` +
    `🛡️ *Guard Model:*\n` +
    `${routerStats.guard.available} \`${routerStats.guard.name}\`\n` +
    `RPM: ${routerStats.guard.rpm} | Daily: ${routerStats.guard.daily}\n\n` +
    `📈 *Model Usage:*\n` +
    Object.entries(AI_STATS.modelUsage)
      .map(([model, count]) => `${model.split('/').pop()}: ${count}`)
      .join('\n');

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

  // Reset model usage counters via router
  aiRouter.resetDailyCounters();

  // Clear conversation history
  aiConversations.clear();

  // Reset stats
  AI_STATS = {
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
    logger.error('Export error:', err);
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
    }).catch((err) => logger.warn(`Failed to edit message: ${err.message}`));

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

  if (msg.text.startsWith('!')) {
    const exactName = msg.text.substring(1).trim().toLowerCase();
    if (filters[exactName]) {
      filterName = exactName;
      filter = filters[exactName];
    }
  }

  if (!filter) {
    const exactName = msg.text.trim().toLowerCase();
    if (filters[exactName]) {
      filterName = exactName;
      filter = filters[exactName];
    }
  }

  if (!filter) {
    const allFilterNames = Object.keys(filters);
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

  if (!filter) return;

  if (isBlacklisted(msg.from.id)) {
    logger.info(`🚫 Blacklisted user ${msg.from.id} tried to use filter`);
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

  logger.info(`🔍 Filter triggered: "${filterName}"`);

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
    let formattedText = filter.text;
    let textParseMode = null;

    if (filter.entities && filter.entities.length > 0) {
      formattedText = entitiesToHTML(filter.text, filter.entities);
      textParseMode = 'HTML';
      logger.debug('✅ Converted text entities to HTML');
    }

    let formattedCaption = filter.text;
    let captionParseMode = null;

    if (filter.text && filter.text.trim().length > 0) {
      if (filter.caption_entities && filter.caption_entities.length > 0) {
        formattedCaption = entitiesToHTML(filter.text, filter.caption_entities);
        captionParseMode = 'HTML';
        logger.debug('✅ Converted caption_entities to HTML');
      } else if (filter.entities && filter.entities.length > 0) {
        formattedCaption = entitiesToHTML(filter.text, filter.entities);
        captionParseMode = 'HTML';
        logger.debug('⚠️ Converted entities to HTML (fallback)');
      }
    }

    if (filter.photo) {
      const photoOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        photoOptions.caption = formattedCaption;
        if (captionParseMode) photoOptions.parse_mode = captionParseMode;
      }
      if (replyMarkup) photoOptions.reply_markup = replyMarkup;
      await bot.sendPhoto(chatId, filter.photo, photoOptions);

    } else if (filter.video) {
      const videoOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        videoOptions.caption = formattedCaption;
        if (captionParseMode) videoOptions.parse_mode = captionParseMode;
      }
      if (replyMarkup) videoOptions.reply_markup = replyMarkup;
      await bot.sendVideo(chatId, filter.video, videoOptions);

    } else if (filter.animation) {
      const animOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        animOptions.caption = formattedCaption;
        if (captionParseMode) animOptions.parse_mode = captionParseMode;
      }
      await bot.sendAnimation(chatId, filter.animation, animOptions);

    } else if (filter.document) {
      const docOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        docOptions.caption = formattedCaption;
        if (captionParseMode) docOptions.parse_mode = captionParseMode;
      }
      await bot.sendDocument(chatId, filter.document, docOptions);

    } else if (filter.audio) {
      const audioOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        audioOptions.caption = formattedCaption;
        if (captionParseMode) audioOptions.parse_mode = captionParseMode;
      }
      await bot.sendAudio(chatId, filter.audio, audioOptions);

    } else if (filter.voice) {
      const voiceOptions = {};
      if (formattedCaption && formattedCaption.trim().length > 0) {
        voiceOptions.caption = formattedCaption;
        if (captionParseMode) voiceOptions.parse_mode = captionParseMode;
      }
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
      await bot.sendMessage(chatId, formattedText, msgOptions);
    }
  } catch (err) {
    logger.error(`Filter send error: ${err.message}`, { filterName, code: err.code });

    if (isAdmin(msg.from.id)) {
      bot.sendMessage(chatId, `⚠️ Error sending filter *${filterName}*:\n\`${err.message}\``, {
        parse_mode: 'Markdown'
      }).catch(() => {});
    }

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

  await bot.sendChatAction(chatId, 'typing');

  const filterStats = {
    text: 0, photo: 0, video: 0, document: 0, animation: 0, audio: 0, voice: 0, sticker: 0
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
  const uptimeDays = Math.floor(uptimeHours / 24);

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
    `⏱️ Uptime: *${uptimeDays}d ${uptimeHours % 24}h ${Math.floor((uptime % 3600) / 60)}m*\n\n` +
    `📦 *Filter Breakdown:*\n` +
    `📝 Text: ${filterStats.text}\n` +
    `🖼️ Photo: ${filterStats.photo}\n` +
    `🎥 Video: ${filterStats.video}\n` +
    `📄 Document: ${filterStats.document}\n` +
    `🎞️ GIF: ${filterStats.animation}\n` +
    `🎵 Audio: ${filterStats.audio}\n` +
    `🎤 Voice: ${filterStats.voice}\n` +
    `🎨 Sticker: ${filterStats.sticker}\n\n` +
    (oldestFilter ? `📅 Oldest Filter: \`${oldestFilter}\` (${oldestDate.toLocaleDateString('id-ID')})\n\n` : '') +
    `✅ Status: *Online* 🚀`;

  const reply = await bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// Enhanced error handling for slow internet
let pollingErrorCount = 0;
let lastErrorTime = 0;
const MAX_RETRY_ATTEMPTS = 10;

bot.on('polling_error', (error) => {
  const now = Date.now();
  logger.error('⚠️ Polling error:', { code: error.code, message: error.message });

  if (now - lastErrorTime > 120000) {
    pollingErrorCount = 0;
  }

  lastErrorTime = now;
  pollingErrorCount++;

  const isNetworkError = error.code === 'EFATAL' ||
                         error.code === 'ETELEGRAM' ||
                         error.code === 'ETIMEDOUT' ||
                         error.message.includes('getUpdates');

  if (pollingErrorCount >= MAX_RETRY_ATTEMPTS && !isNetworkError) {
    logger.error('❌ Max retry attempts reached. Possible issues:', {
      token_valid: process.env.BOT_TOKEN ? 'present' : 'missing',
      other_instance: 'check if another instance is running with the same token'
    });
    process.exit(1);
  }

  const backoffDelay = Math.min(5000 * Math.min(pollingErrorCount, 6), 30000);
  logger.info(`🔄 Retry ${pollingErrorCount}/${MAX_RETRY_ATTEMPTS} in ${backoffDelay/1000}s (slow internet mode)...`);

  setTimeout(() => {
    bot.stopPolling().then(() => {
      bot.startPolling({ restart: true });
    }).catch(err => {
      logger.error('Failed to restart polling:', err.message);
    });
  }, backoffDelay);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Shutting down gracefully...');
  deleteTimers.forEach(timer => clearTimeout(timer));
  deleteTimers.clear();
  await bot.stopPolling();
  logger.info('👋 Bot stopped');
  process.exit(0);
});

// Health check command for monitoring
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
    rate_limits: rateLimits.size,
    ai_enabled: AI_ENABLED,
    ai_stats: AI_STATS
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
      logger.warn(`⏳ Retry ${i + 1}/${maxRetries} in ${delay/1000}s...`, { error: err.message });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Validate bot token and delete webhook before polling
async function validateBotToken() {
  try {
    logger.info('🔍 Validating bot token...');

    try {
      await retryWithBackoff(async () => { await bot.deleteWebHook(); });
      logger.info('✅ Webhook deleted (polling mode)');
    } catch (err) {
      logger.warn('⚠️ Could not delete webhook (will continue anyway):', { code: err.code, message: err.message });
    }

    const me = await retryWithBackoff(async () => { return await bot.getMe(); });
    logger.info(`✅ Bot token valid! Connected as: @${me.username}`);
    return true;
  } catch (err) {
    logger.error('❌ Bot token validation failed:', { code: err.code, message: err.message });
    logger.error('💡 Possible issues:', {
      token_invalid: 'check BOT_TOKEN in .env',
      network_issue: 'check internet connection stability',
      api_unreachable: 'Telegram API might be unreachable'
    });
    return false;
  }
}

// Initialize and start
initializeData().then(async () => {
  logger.info('📦 Data initialized');
  logger.info(`📊 Loaded ${admins.length} admins and ${Object.keys(filters).length} filters`);

  const isValid = await validateBotToken();
  if (!isValid) {
    process.exit(1);
  }

  await bot.startPolling();
  logger.info('🤖 Bot started successfully! 🚀');
}).catch(err => {
  logger.error('❌ Failed to initialize:', err);
  process.exit(1);
});