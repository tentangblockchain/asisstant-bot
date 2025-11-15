
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
}, 60000); // Every minute

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
    // SAFETY: Reload file sebelum save untuk detect concurrent modifications
    // Ini mencegah data loss jika 2 admin edit bersamaan
    if (file === FILTERS_FILE && fsSync.existsSync(file)) {
      const currentData = await loadJSON(file, {});
      // Merge dengan data terbaru untuk avoid overwrite
      // Data yang baru di-pass akan override yang lama (intended behavior)
      const mergedData = { ...currentData, ...data };
      await fs.writeFile(file, JSON.stringify(mergedData, null, 2));
    } else {
      await fs.writeFile(file, JSON.stringify(data, null, 2));
    }
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
      `🎯 *Filter Management:*\n` +
      `!add <nama> - Bikin filter baru (reply ke pesan)\n` +
      `!del <nama> - Hapus filter\n` +
      `!clone <dari> <ke> - Copy filter\n` +
      `!rename <lama> <baru> - Ganti nama filter\n\n` +
      `🔍 *Filter Info:*\n` +
      `!list - Lihat semua filter\n` +
      `!info <nama> - Detail filter\n` +
      `!search <kata> - Cari filter\n` +
      `!status - Status & statistik bot\n` +
      `${isOwner(userId) ? '!export - Backup semua filter\n' : ''}` +
      `\n💡 *Cara Pake Filter:*\n` +
      `Ketik \`!namafilter\` atau \`namafilter\`\n\n` +
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
    // CRITICAL: entities dan parse_mode TIDAK BISA digunakan bersamaan di Telegram API!
    // Jika ada entities -> gunakan entities saja, JANGAN tambahkan parse_mode
    // Jika tidak ada entities -> gunakan parse_mode untuk fallback Markdown

    const textOptions = {};
    if (filter.entities && filter.entities.length > 0) {
      // Ada entities -> gunakan entities ONLY, NO parse_mode
      textOptions.entities = filter.entities;
    } else if (filter.text) {
      // HANYA gunakan parse_mode jika TIDAK ADA entities sama sekali
      textOptions.parse_mode = 'Markdown';
    }

    const captionOptions = {};
    // CRITICAL FIX: Prioritize caption_entities untuk media dengan caption
    // JANGAN PERNAH campur entities dengan parse_mode - akan merusak offset!
    if (filter.text && filter.text.trim().length > 0) {
      // Ada text/caption yang tidak kosong
      if (filter.caption_entities && filter.caption_entities.length > 0) {
        // PRIORITY 1: Ada caption_entities -> gunakan ini untuk media caption
        captionOptions.caption_entities = filter.caption_entities;
      } else if (filter.entities && filter.entities.length > 0) {
        // PRIORITY 2: Fallback ke entities jika caption_entities tidak ada
        // (untuk backward compatibility dengan filter lama)
        captionOptions.caption_entities = filter.entities;
      } else {
        // PRIORITY 3: Plain text - gunakan parse_mode sebagai fallback
        captionOptions.parse_mode = 'Markdown';
      }
    }

    if (filter.photo) {
      const photoOptions = {};
      // CRITICAL: Hanya set caption options jika caption benar-benar ada dan tidak kosong
      if (filter.text && filter.text.trim().length > 0) {
        photoOptions.caption = filter.text;
        if (captionOptions.caption_entities && captionOptions.caption_entities.length > 0) {
          photoOptions.caption_entities = captionOptions.caption_entities;
        } else if (captionOptions.parse_mode) {
          photoOptions.parse_mode = captionOptions.parse_mode;
        }
      }

      await bot.sendPhoto(chatId, filter.photo, photoOptions);
    } else if (filter.video) {
      await bot.sendVideo(chatId, filter.video, {
        caption: filter.text || undefined,
        ...captionOptions
      });
    } else if (filter.animation) {
      await bot.sendAnimation(chatId, filter.animation, {
        caption: filter.text || undefined,
        ...captionOptions
      });
    } else if (filter.document) {
      await bot.sendDocument(chatId, filter.document, {
        caption: filter.text || undefined,
        ...captionOptions
      });
    } else if (filter.audio) {
      await bot.sendAudio(chatId, filter.audio, {
        caption: filter.text || undefined,
        ...captionOptions
      });
    } else if (filter.voice) {
      await bot.sendVoice(chatId, filter.voice, {
        caption: filter.text || undefined,
        ...captionOptions
      });
    } else if (filter.sticker) {
      await bot.sendSticker(chatId, filter.sticker);
      if (filter.text) {
        await bot.sendMessage(chatId, filter.text, textOptions);
      }
    } else if (filter.text) {
      await bot.sendMessage(chatId, filter.text, textOptions);
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
      bot.sendMessage(OWNER_ID, 
        `🚨 *Critical Filter Error*\n\n` +
        `Filter: \`${filterName}\`\n` +
        `Chat: ${chatId}\n` +
        `User: ${msg.from.id}\n` +
        `Error: \`${err.message}\``, 
        { parse_mode: 'Markdown' }
      ).catch(() => {});
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

// Initialize and start
initializeData().then(() => {
  console.log('🤖 Bot started anjir! 🚀');
  console.log(`📊 Loaded ${admins.length} admins and ${Object.keys(filters).length} filters`);
}).catch(err => {
  console.error('❌ Failed to initialize:', err);
  process.exit(1);
});
