
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// Validate environment
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found!');
  process.exit(1);
}

if (!process.env.WEBHOOK_URL) {
  console.error('❌ WEBHOOK_URL not set! Example: https://your-repl.replit.app');
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;
const port = process.env.PORT || 5000;

// Create bot WITHOUT polling (webhook mode)
const bot = new TelegramBot(token, {
  webHook: {
    port: port,
    host: '0.0.0.0'
  }
});

// Set webhook
bot.setWebHook(`${webhookUrl}/bot${token}`)
  .then(() => {
    console.log(`✅ Webhook set to: ${webhookUrl}/bot${token}`);
  })
  .catch(err => {
    console.error('❌ Failed to set webhook:', err.message);
    process.exit(1);
  });

// Create Express app
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'webhook',
    uptime: process.uptime()
  });
});

// Webhook endpoint
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Import all bot handlers from index.js
// (You'll need to refactor index.js to export handlers)
require('./bot-handlers')(bot);

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 Webhook server running on port ${port}`);
  console.log(`🤖 Bot ready in WEBHOOK mode! 🚀`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down webhook...');
  await bot.deleteWebHook();
  console.log('👋 Webhook deleted');
  process.exit(0);
});
