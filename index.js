
// 🔥 BOT TELEGRAM - ADMIN & FILTER MANAGEMENT (OPTIMIZED)
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Initialize bot with optimized settings
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

const OWNER_ID = parseInt(process.env.OWNER_ID);
const ADMINS_FILE = path.join(__dirname, 'admins.json');
const FILTERS_FILE = path.join(__dirname, 'filters.json');

// In-memory cache
let admins = [];
let filters = {};
let adminCache = new Set();
let deleteTimers = new Map();

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS = 5;

// Initialize data asynchronously
async function initializeData() {
  try {
    admins = await loadJSON(ADMINS_FILE, []);
    filters = await loadJSON(FILTERS_FILE, {});
    
    if (OWNER_ID && !admins.includes(OWNER_ID)) {
      admins.push(OWNER_ID);
      await saveJSON(ADMINS_FILE, admins);
    }
    
    // Build admin cache
    adminCache = new Set(admins);
    console.log('✅ Data initialized successfully');
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
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error saving ${file}:`, err);
    return false;
  }
}

// Optimized admin check with cache
function isAdmin(userId) {
  return userId === OWNER_ID || adminCache.has(userId);
}

function isOwner(userId) {
  return userId === OWNER_ID;
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
  
  const timer = setTimeout(() => {
    bot.deleteMessage(chatId, messageId).catch(() => {});
    deleteTimers.delete(key);
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

// 👑 ADMIN COMMANDS
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

  if (!msg.reply_to_message) {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan yang mau dijadiin filter cok!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const replyMsg = msg.reply_to_message;
  const filterData = {
    text: replyMsg.text || replyMsg.caption || '',
    entities: replyMsg.entities || replyMsg.caption_entities || [],
    photo: replyMsg.photo ? replyMsg.photo[replyMsg.photo.length - 1].file_id : null,
    video: replyMsg.video ? replyMsg.video.file_id : null,
    document: replyMsg.document ? replyMsg.document.file_id : null,
    animation: replyMsg.animation ? replyMsg.animation.file_id : null,
    audio: replyMsg.audio ? replyMsg.audio.file_id : null,
    voice: replyMsg.voice ? replyMsg.voice.file_id : null,
    sticker: replyMsg.sticker ? replyMsg.sticker.file_id : null
  };

  filters[filterName] = filterData;
  await saveJSON(FILTERS_FILE, filters);

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

// Optimized filter trigger handler
bot.on('message', async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;
  if (msg.text.startsWith('!add') || msg.text.startsWith('!del') || 
      msg.text.startsWith('!list') || msg.text.startsWith('!status')) return;

  const chatId = msg.chat.id;
  let filterName;
  
  if (msg.text.startsWith('!')) {
    filterName = msg.text.substring(1).trim().toLowerCase();
  } else {
    filterName = msg.text.trim().toLowerCase();
  }

  const filter = filters[filterName];
  if (!filter) return;

  try {
    const options = {
      parse_mode: 'Markdown',
      entities: filter.entities
    };

    if (filter.photo) {
      await bot.sendPhoto(chatId, filter.photo, {
        caption: filter.text,
        caption_entities: filter.entities
      });
    } else if (filter.video) {
      await bot.sendVideo(chatId, filter.video, {
        caption: filter.text,
        caption_entities: filter.entities
      });
    } else if (filter.animation) {
      await bot.sendAnimation(chatId, filter.animation, {
        caption: filter.text,
        caption_entities: filter.entities
      });
    } else if (filter.document) {
      await bot.sendDocument(chatId, filter.document, {
        caption: filter.text,
        caption_entities: filter.entities
      });
    } else if (filter.audio) {
      await bot.sendAudio(chatId, filter.audio, {
        caption: filter.text,
        caption_entities: filter.entities
      });
    } else if (filter.voice) {
      await bot.sendVoice(chatId, filter.voice, {
        caption: filter.text,
        caption_entities: filter.entities
      });
    } else if (filter.sticker) {
      await bot.sendSticker(chatId, filter.sticker);
      if (filter.text) {
        await bot.sendMessage(chatId, filter.text, options);
      }
    } else if (filter.text) {
      await bot.sendMessage(chatId, filter.text, options);
    }
  } catch (err) {
    console.error('Filter send error:', err);
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

  const status = `📊 *Status Bot*\n\n` +
    `👑 Total Admin: *${admins.length}*\n` +
    `🎯 Total Filter: *${Object.keys(filters).length}*\n` +
    `⚡ Active Timers: *${deleteTimers.size}*\n` +
    `✅ Status: *Online* 🚀`;

  const reply = await bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// Enhanced error handling
bot.on('polling_error', (error) => {
  console.error('⚠️ Polling error:', error.code, error.message);
  
  // Auto-recovery untuk network errors
  if (error.code === 'EFATAL' || error.code === 'ETELEGRAM') {
    console.log('🔄 Attempting to recover...');
    setTimeout(() => {
      bot.startPolling({ restart: true });
    }, 5000);
  }
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

// Initialize and start
initializeData().then(() => {
  console.log('🤖 Bot started anjir! 🚀');
  console.log(`📊 Loaded ${admins.length} admins and ${Object.keys(filters).length} filters`);
});
