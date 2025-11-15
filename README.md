# 🤖 Telegram Bot - Admin & Filter Management + AI Assistant

Bot Telegram profesional untuk manajemen admin dan filter dengan AI Assistant (Hoki) berbasis Groq LLaMA 3.3 70B. Dioptimalkan untuk koneksi lambat dan production-ready.

## ✨ Fitur Utama

### 👑 Admin Management
- ➕ **Tambah/hapus admin** dengan mudah (reply-based)
- 📋 **Lihat daftar admin** dengan owner marking
- 🔒 **Owner protection** - Owner tidak bisa dihapus
- ⚡ **Admin cache** untuk performa optimal (Set-based lookup)
- 🛡️ **Role-based access control** - Owner > Admin > User

### 🎯 Filter Management
#### Media Support
- 📝 **Text** - Plain text atau dengan formatting
- 🖼️ **Photo** - Images dengan optional caption
- 🎥 **Video** - Videos dengan optional caption
- 📄 **Document** - Files (PDF, DOCX, etc)
- 🎞️ **GIF/Animation** - Animated GIFs
- 🎵 **Audio** - Music files
- 🎤 **Voice** - Voice messages
- 🎨 **Sticker** - Telegram stickers
- 🔘 **Inline Buttons** - Support reply markup/keyboard buttons

#### Formatting Support
- **Bold**, *Italic*, __Underline__, ~~Strikethrough~~
- `Code`, ```Pre-formatted```
- [Links](url), @Mentions, #Hashtags
- ||Spoiler text||
- HTML entities → Auto-converted untuk compatibility

#### Filter Operations
- ✅ **Create** (`!add <nama>`) - Reply ke pesan
- 🗑️ **Delete** (`!del <nama>`)
- 📋 **Clone** (`!clone <dari> <ke>`)
- ✏️ **Rename** (`!rename <lama> <baru>`)
- 📊 **List** (`!list`) - Auto-pagination untuk >15 filters
- 🔍 **Search** (`!search <keyword>`)
- ℹ️ **Info** (`!info <nama>`) - Detail filter
- 💾 **Export** (`!export`) - JSON backup (Owner only)

#### Smart Filter Triggering
**3-level Priority System:**
1. **Exact match dengan !** - `!welcome` (highest priority)
2. **Exact match tanpa !** - `welcome` (seluruh pesan)
3. **Keyword detection** - "halo ada update nih" → trigger filter "update" (earliest match)

### 🤖 AI Assistant - Hoki

#### Core Features
- 💬 **Conversational AI** - Groq LLaMA 3.3 70B Versatile
- 🎯 **Multi-model Cascade** - Automatic fallback (Premium → General → Emergency)
- 🧠 **Context-Aware** - Conversation history (max 10 messages)
- 🌐 **Language Detection** - Auto Indonesian/English
- 😊 **Personality Engine** - Natural, ramah, concise responses
- 🛡️ **Security** - Prompt injection prevention & output sanitization
- 📊 **Analytics** - Request tracking, success rate, model usage stats

#### Model Tiers
1. **Tier 1 (Premium)** - `llama-3.3-70b-versatile` 
- Quality: 10/10
- Limit: 1,000 req/hour
- Access: Admin priority

2. **Tier 2 (General)** - `llama-3.1-8b-instant`
- Quality: 7/10
- Limit: 14,400 req/hour
- Access: All users

3. **Tier 3 (Fallback)** - `llama-guard-3-8b`
- Quality: 6/10
- Limit: 14,400 req/hour
- Access: Emergency backup

#### Smart Triggering
- **Private Chat** - AI responds to ALL messages
- **Group Chat** - AI responds ONLY when replied to bot
- **Cooldown** - 3 seconds per user (anti-spam)

#### Role-Based Context
- **Owner** - Full bot management context
- **Admin** - Filter & user management context
- **User** - Basic filter usage context

#### Filter Knowledge Integration
AI has access to:
- Filter names & types (text/media)
- Filter content preview
- Usage instructions

### 🚀 Security & Optimization

#### Security Features
- 🚫 **Blacklist System** - Permanent ban users
- ⏱️ **Timeout System** - Temporary ban (1-1440 minutes)
- ⚡ **Rate Limiting** - Max 5 requests/second per user
- 🛡️ **HTML Escape** - XSS prevention
- 🔒 **Input Validation** - All commands validated
- 🚨 **Prompt Injection Prevention** - AI input sanitization

#### Performance Optimization
- 💾 **In-Memory Cache** - Set-based admin lookup
- 🔄 **Auto-delete Messages** - Chat cleanup (3-5 minutes)
- 📊 **Pagination** - 15 items per page
- 🧹 **Periodic Cleanup** - Rate limits & stale data
- ⚡ **Batch Processing** - Efficient data operations

#### Network Resilience
- 🌐 **IPv4-Only Mode** - Force IPv4 untuk koneksi stabil
- 🔄 **Retry with Backoff** - Exponential backoff (5s → 30s max)
- ⏱️ **Extended Timeouts** - 2-3 minutes untuk slow internet
- 📡 **Keep-Alive** - Persistent connections
- 🔁 **Auto-Recovery** - Polling restart on errors

### 🔔 Notification System

#### Auto Notifications
- 👋 **Welcome Messages** - Greet new group members
- 📊 **Daily Stats** - Auto-send to owner (9 AM daily)
- 🚨 **Critical Alerts** - Error notifications to owner
- 📈 **Statistics Tracking** - Welcomes, stats sent, alerts

#### Manual Stats
- `!notifstats` - Notification system stats
- `!aistats` - AI performance metrics
- `!status` - Bot health & filter breakdown

## 📦 Instalasi

### 1. Clone Repository
```bash
git clone https://github.com/tentangblockchain/asisstant-bot.git
cd asisstant-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Konfigurasi Environment
Buat file `.env` dari template:
```bash
cp .env.example .env
```

Edit file `.env`:
```env
# REQUIRED: Dapatkan dari @BotFather
BOT_TOKEN=your_telegram_bot_token_here

# REQUIRED: Dapatkan dari @userinfobot
OWNER_ID=your_telegram_user_id_here

# OPTIONAL: Dapatkan dari https://console.groq.com
# AI Hoki akan aktif otomatis jika di-set
GROQ_API_KEY=your_groq_api_key_here

# OPTIONAL: Untuk webhook mode (production)
# WEBHOOK_URL=https://your-domain.com
# PORT=5000
```

### 4. Jalankan Bot

#### Mode Polling (Development)
```bash
npm start
```

#### Mode Webhook (Production)
```bash
# Set WEBHOOK_URL di .env terlebih dahulu
node webhook.js
```

## 📖 Command Reference

### 👥 User Commands
```
/start              - Mulai bot & lihat intro
/help               - Daftar lengkap commands
!namafilter         - Trigger filter (dengan !)
namafilter          - Trigger filter (tanpa !)
```

### 👑 Admin Commands

#### Admin Management
```
/addadmin           - Tambah admin (reply ke user)
/removeadmin        - Hapus admin (reply ke admin)
/listadmins         - Lihat semua admin
```

#### Security
```
/blacklist          - Ban user permanent (reply)
/unblacklist        - Unban user (reply)
/listblacklist      - Lihat banned users
/timeout <menit>    - Timeout user (1-1440 menit)
```

#### Filter Management
```
!add <nama>         - Buat filter (reply ke pesan)
!del <nama>         - Hapus filter
!clone <dari> <ke>  - Copy filter
!rename <old> <new> - Rename filter
!list               - Lihat semua filter (paginated)
!info <nama>        - Detail filter
!search <keyword>   - Cari filter
!status             - Bot stats & filter breakdown
```

#### Notifications
```
!notifstats         - Notification system stats
```

### 🤖 AI Commands
```
@botusername <msg>  - Chat dengan Hoki (groups)
Reply ke bot        - Lanjut conversation
!aistats            - AI performance (admin)
!aireset            - Reset AI stats (owner)
```

### 🔧 Owner Only Commands
```
!export             - Backup semua filter (JSON)
!aireset            - Reset AI stats & conversations
!health             - Health check (JSON stats)
```

## 🎨 Contoh Penggunaan

### 1. Setup Initial Admin
```
Bot otomatis set OWNER_ID sebagai admin pertama
/addadmin (reply ke user lain untuk tambah admin)
```

### 2. Buat Filter Text
```
1. Kirim pesan: "Selamat datang di grup! 👋"
2. Tambah formatting (bold/italic) jika perlu
3. Reply dengan: !add welcome
4. Test: !welcome atau welcome
```

### 3. Buat Filter Media
```
1. Kirim photo/video dengan caption
2. Reply dengan: !add promo
3. Test: !promo
```

### 4. Buat Filter dengan Buttons
```
1. Forward pesan dengan inline buttons
2. Reply dengan: !add menu
3. Buttons akan tersimpan & terkirim ulang
```

### 5. Clone & Customize Filter
```
!clone welcome welcome_v2
!info welcome_v2
!del welcome_v2  (jika tidak perlu)
```

### 6. Chat dengan AI Hoki
**Private Chat:**
```
User: Halo Hoki, apa itu blockchain?
Hoki: Blockchain itu teknologi database terdistribusi...
```

**Group Chat:**
```
User: @hokibot jelaskan tentang Bitcoin
Hoki: Bitcoin adalah cryptocurrency pertama...

// Atau reply ke pesan bot
User: (reply) Bedanya sama Ethereum apa?
Hoki: Ethereum punya smart contracts...
```

### 7. Ban User yang Spam
```
1. Reply ke pesan spammer
2. /timeout 30  (timeout 30 menit)
   atau
   /blacklist  (permanent ban)
```

### 8. Export Backup
```
!export
// Bot akan kirim file JSON berisi semua filters
```

## 🚀 Deployment

### Replit (Recommended)
1. Fork repository ke Replit
2. Tambahkan Secrets:
   - `BOT_TOKEN` = token dari @BotFather
   - `OWNER_ID` = user ID dari @userinfobot
   - `GROQ_API_KEY` = API key dari console.groq.com (optional)
3. Klik Run
4. Bot akan jalan 24/7 di polling mode

### VPS/Dedicated Server (Production)

#### Polling Mode (Simple)
```bash
git clone https://github.com/tentangblockchain/asisstant-bot.git
cd asisstant-bot
npm install
cp .env.example .env
nano .env  # Edit BOT_TOKEN & OWNER_ID
npm start
```

#### Webhook Mode (Recommended for Production)
```bash
# Setup sama seperti polling, tapi:
nano .env
# Tambahkan:
# WEBHOOK_URL=https://your-domain.com
# PORT=5000

node webhook.js

# Untuk production, gunakan PM2:
npm install -g pm2
pm2 start webhook.js --name telegram-bot
pm2 startup
pm2 save
```

#### Nginx Reverse Proxy (Optional)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### STB/Armbian (Low-Resource Devices)
Bot sudah dioptimasi untuk koneksi lambat:
```bash
# IPv4-only mode otomatis aktif
# Extended timeouts (2-3 minutes)
# Retry with backoff (5s → 30s)
# Slower polling interval (10s)

# Jalankan:
npm start

# Monitor:
tail -f /var/log/syslog  # atau journalctl -fu telegram-bot
```

## 🔧 Teknologi Stack

### Core
- **Node.js 20.x** - JavaScript runtime
- **node-telegram-bot-api** - Telegram Bot API wrapper
- **Express** - Web framework (webhook mode)
- **dotenv** - Environment variables

### AI/ML
- **Groq API** - LLaMA 3.3 70B inference
- **Multi-model Cascade** - Automatic fallback system
- **Conversation Memory** - Context-aware responses

### Networking
- **IPv4-only Agent** - Stable connections
- **Retry Logic** - Exponential backoff
- **Keep-Alive** - Persistent connections

## 📊 Struktur File

```
asisstant-bot/
├── index.js              # Main bot (polling mode)
├── webhook.js            # Webhook mode server
├── package.json          # Dependencies
├── .env.example          # Environment template
├── .env                  # Your config (git-ignored)
├── .replit               # Replit config
├── README.md             # This file
├── admins.json           # Admin data (auto-generated)
├── filters.json          # Filter data (auto-generated)
└── blacklist.json        # Banned users (auto-generated)
```

## 🛡️ Security Best Practices

1. **Never commit `.env`** - Use `.env.example` as template
2. **Rotate API keys** - Regularly change BOT_TOKEN & GROQ_API_KEY
3. **Monitor blacklist** - Review banned users periodically
4. **Backup filters** - Use `!export` weekly
5. **Review admin list** - Remove inactive admins
6. **Check AI stats** - Monitor for abuse with `!aistats`
7. **Rate limit awareness** - Don't spam commands

## 📈 Performance Metrics

### Optimizations Applied
- ⚡ **Set-based admin cache** - O(1) lookup vs O(n)
- 🧹 **Periodic cleanup** - Prevent memory leaks
- 📦 **Pagination** - Handle 1000+ filters efficiently
- 💾 **In-memory operations** - Minimal disk I/O
- 🔄 **Batch processing** - Reduced API calls

### Benchmarks (Tested on Replit)
- Admin check: ~0.1ms (cached)
- Filter trigger: ~50ms (text), ~200ms (media)
- AI response: ~2-5s (depends on model)
- Memory usage: ~80-120 MB (idle)
- Handles: 100+ concurrent users

## 🐛 Troubleshooting

### Bot tidak merespon
```bash
# Check 1: Token valid?
node -e "require('dotenv').config(); console.log(process.env.BOT_TOKEN)"

# Check 2: Bot started?
curl https://api.telegram.org/bot<TOKEN>/getMe

# Check 3: Webhook conflict?
curl https://api.telegram.org/bot<TOKEN>/deleteWebhook

# Check 4: Logs
npm start  # Check console output
```

### AI tidak respon
```bash
# Check GROQ_API_KEY set?
node -e "require('dotenv').config(); console.log(process.env.GROQ_API_KEY ? 'OK' : 'NOT SET')"

# Check quota
!aistats  # Lihat model usage

# Reset jika perlu
!aireset  (owner only)
```

### Filter tidak terkirim
```bash
# Check filter exists
!list

# Check filter content
!info namafilter

# Check logs untuk error
# Format entities might be corrupted
```

### Slow internet timeout
```bash
# Bot sudah handle ini otomatis:
# - Extended timeout (3 minutes)
# - Retry dengan backoff (5s-30s)
# - IPv4-only mode

# Jika masih gagal, cek:
ping 8.8.8.8  # Internet OK?
curl -I https://api.telegram.org  # Telegram reachable?
```

### Memory leak
```bash
# Check memory
node -e "console.log(process.memoryUsage())"

# Restart bot if needed
pm2 restart telegram-bot

# Check for stale data
!status  # Review active timers
```

## 📝 Changelog

### v1.0.0 (Current - Nov 2025)
#### Features
- ✅ Full admin & filter management
- ✅ AI Assistant (Hoki) dengan Groq LLaMA 3.3 70B
- ✅ Multi-model cascade system
- ✅ Notification system (welcome, daily stats, alerts)
- ✅ Smart filter triggering (priority + keyword detection)
- ✅ Inline button support
- ✅ HTML entities conversion
- ✅ IPv4-only optimization
- ✅ Retry logic untuk slow internet
- ✅ Conversation memory (AI context)
- ✅ Role-based AI responses
- ✅ Language auto-detection (ID/EN)

#### Performance
- ✅ Set-based admin cache
- ✅ Periodic cleanup
- ✅ Pagination system
- ✅ Rate limiting
- ✅ Auto-delete messages

#### Security
- ✅ Blacklist system
- ✅ Timeout system
- ✅ HTML escape
- ✅ Prompt injection prevention
- ✅ Input validation

## 🤝 Kontribusi

Kontribusi welcome! Steps:

1. **Fork** repository
2. **Create branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit changes** (`git commit -m 'Add: AmazingFeature'`)
4. **Push branch** (`git push origin feature/AmazingFeature`)
5. **Open Pull Request**

### Contribution Guidelines
- Follow existing code style
- Add comments untuk logic kompleks
- Test semua fitur sebelum PR
- Update README jika tambah fitur baru

## 💰 Donasi

Support development:

### ⚡ IDR (Rupiah)
**Trakteer:** https://trakteer.id/garapanairdrop/tip

### ⚡ Crypto (EVM)
```
Address: 0x77bFeEa5Dd20C4Cf3B716A7CEf39E29897797aEC
Networks: BNB, ETH, Polygon, Arbitrum, Optimism
```

## 📄 License

**ISC License** - Free untuk personal & commercial use.

## 👨‍💻 Author

**TentangBlockchain**
- 🐙 GitHub: [@tentangblockchain](https://github.com/tentangblockchain)
- 📦 Repository: [asisstant-bot](https://github.com/tentangblockchain/asisstant-bot)
- 💬 Issues: [Report bugs](https://github.com/tentangblockchain/asisstant-bot/issues)

## 🙏 Credits & Thanks

- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) - Awesome Telegram wrapper
- [Telegram Bot API](https://core.telegram.org/bots/api) - Official API docs
- [Groq](https://groq.com) - Lightning-fast LLM inference
- [Replit](https://replit.com) - Free hosting platform

## 🔗 Useful Links

- 📖 [Telegram Bot API Docs](https://core.telegram.org/bots/api)
- 🤖 [Create Bot with @BotFather](https://t.me/BotFather)
- 🆔 [Get User ID with @userinfobot](https://t.me/userinfobot)
- 🧠 [Groq Console](https://console.groq.com)
- 🐙 [GitHub Repository](https://github.com/tentangblockchain/asisstant-bot)

---

⭐ **Star this repo if helpful!**  
🐛 **Found a bug?** [Open an issue](https://github.com/tentangblockchain/asisstant-bot/issues)  
💬 **Need help?** Check [Troubleshooting](#-troubleshooting) or open a discussion!

**Happy Botting! 🤖🚀**