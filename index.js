// 🔥 BOT TELEGRAM - ADMIN & FILTER MANAGEMENT
// Install dependencies: npm install node-telegram-bot-api dotenv
// Buat file .env dan isi: BOT_TOKEN=token_bot_lu_anjir

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Initialize bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Admin utama dari ENV (gak bisa dihapus anjir!)
const OWNER_ID = parseInt(process.env.OWNER_ID);

// Data files
const ADMINS_FILE = path.join(__dirname, 'admins.json');
const FILTERS_FILE = path.join(__dirname, 'filters.json');

// Load data
let admins = loadJSON(ADMINS_FILE, []);
let filters = loadJSON(FILTERS_FILE, {});

// Pastikan owner selalu jadi admin
if (OWNER_ID && !admins.includes(OWNER_ID)) {
  admins.push(OWNER_ID);
  saveJSON(ADMINS_FILE, admins);
}

// Helper functions
function loadJSON(file, defaultValue) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Error loading ${file}:`, err);
  }
  return defaultValue;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error(`Error saving ${file}:`, err);
    return false;
  }
}

function isAdmin(userId) {
  return userId === OWNER_ID || admins.includes(userId);
}

function isOwner(userId) {
  return userId === OWNER_ID;
}

function getUserMention(user) {
  if (user.username) {
    return `@${user.username}`;
  }
  return `[${user.first_name}](tg://user?id=${user.id})`;
}

// Auto delete message after delay
async function autoDeleteMessage(chatId, messageId, delayMinutes = 3) {
  setTimeout(() => {
    bot.deleteMessage(chatId, messageId).catch(() => {});
  }, delayMinutes * 60 * 1000);
}

// Pagination helper
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
bot.onText(/\/addadmin(?:@\w+)?\s+@?(\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  // Auto delete command
  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  try {
    let targetUserId;

    if (msg.reply_to_message) {
      targetUserId = msg.reply_to_message.from.id;
    } else {
      const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan orangnya atau mention dia!');
      autoDeleteMessage(chatId, reply.message_id, 3);
      return;
    }

    if (admins.includes(targetUserId)) {
      const reply = await bot.sendMessage(chatId, '⚠️ Udah jadi admin cok!');
      autoDeleteMessage(chatId, reply.message_id, 3);
      return;
    }

    admins.push(targetUserId);
    saveJSON(ADMINS_FILE, admins);

    const reply = await bot.sendMessage(chatId, `✅ Admin ditambah!\n👤 User ID: ${targetUserId}`, {
      parse_mode: 'Markdown'
    });
    autoDeleteMessage(chatId, reply.message_id, 5);
  } catch (err) {
    const reply = await bot.sendMessage(chatId, '❌ Gagal tambah admin. Pastikan reply ke pesan orangnya!');
    autoDeleteMessage(chatId, reply.message_id, 3);
  }
});

bot.onText(/\/removeadmin(?:@\w+)?\s+@?(\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  // Auto delete command
  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  let targetUserId;

  if (msg.reply_to_message) {
    targetUserId = msg.reply_to_message.from.id;
  } else {
    const reply = await bot.sendMessage(chatId, '⚠️ Reply ke pesan admin yang mau ditendang!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  // Gak bisa hapus owner anjir!
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
  saveJSON(ADMINS_FILE, admins);

  const reply = await bot.sendMessage(chatId, `✅ Admin dihapus!\n👤 User ID: ${targetUserId}`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/\/listadmins/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  // Auto delete command
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

  // Auto delete command
  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
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
  saveJSON(FILTERS_FILE, filters);

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

  // Auto delete command
  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
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
  saveJSON(FILTERS_FILE, filters);

  const reply = await bot.sendMessage(chatId, `✅ Filter *${filterName}* berhasil dihapus!`, {
    parse_mode: 'Markdown'
  });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

bot.onText(/^!list/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  // Auto delete command
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

  // Pagination
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

// Handle pagination callback
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

// Handle filter trigger (dengan atau tanpa !)
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  // Skip commands
  if (text.startsWith('/')) return;
  if (text.startsWith('!add') || text.startsWith('!del') || text.startsWith('!list') || text.startsWith('!status')) return;

  let filterName;
  
  // Check dengan !
  if (text.startsWith('!')) {
    filterName = text.substring(1).trim().toLowerCase();
  } else {
    // Check tanpa !
    filterName = text.trim().toLowerCase();
  }

  const filter = filters[filterName];
  if (!filter) {
    return;
  }

  const options = {
    parse_mode: 'Markdown',
    entities: filter.entities
  };

  // Send media if exists
  if (filter.photo) {
    bot.sendPhoto(chatId, filter.photo, {
      caption: filter.text,
      caption_entities: filter.entities
    });
  } else if (filter.video) {
    bot.sendVideo(chatId, filter.video, {
      caption: filter.text,
      caption_entities: filter.entities
    });
  } else if (filter.animation) {
    bot.sendAnimation(chatId, filter.animation, {
      caption: filter.text,
      caption_entities: filter.entities
    });
  } else if (filter.document) {
    bot.sendDocument(chatId, filter.document, {
      caption: filter.text,
      caption_entities: filter.entities
    });
  } else if (filter.audio) {
    bot.sendAudio(chatId, filter.audio, {
      caption: filter.text,
      caption_entities: filter.entities
    });
  } else if (filter.voice) {
    bot.sendVoice(chatId, filter.voice, {
      caption: filter.text,
      caption_entities: filter.entities
    });
  } else if (filter.sticker) {
    bot.sendSticker(chatId, filter.sticker);
    if (filter.text) {
      bot.sendMessage(chatId, filter.text, options);
    }
  } else if (filter.text) {
    bot.sendMessage(chatId, filter.text, options);
  }
});

// 📊 STATUS COMMAND
bot.onText(/^!status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;

  // Auto delete command
  autoDeleteMessage(chatId, messageId, 3);

  if (!isAdmin(userId)) {
    const reply = await bot.sendMessage(chatId, '❌ Lu bukan admin anjir!');
    autoDeleteMessage(chatId, reply.message_id, 3);
    return;
  }

  const status = `📊 *Status Bot*\n\n` +
    `👑 Total Admin: *${admins.length}*\n` +
    `🎯 Total Filter: *${Object.keys(filters).length}*\n` +
    `✅ Status: *Online* 🚀`;

  const reply = await bot.sendMessage(chatId, status, { parse_mode: 'Markdown' });
  autoDeleteMessage(chatId, reply.message_id, 5);
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('🤖 Bot started anjir! 🚀');
