
# 🤖 Telegram Bot - Admin & Filter Management

Bot Telegram untuk manajemen admin dan filter dengan fitur lengkap dan performa optimal.

## ✨ Fitur Utama

### 👑 Admin Management
- ➕ Tambah/hapus admin dengan mudah
- 📋 Lihat daftar semua admin
- 🔒 Owner memiliki akses penuh
- ⚡ Admin cache untuk performa optimal

### 🎯 Filter Management
- ✅ Buat filter dengan berbagai tipe media
- 🖼️ Support: Text, Photo, Video, Document, GIF, Audio, Voice, Sticker
- ✨ Mendukung formatting: Bold, Italic, Underline, Code, Link, Spoiler, dll
- 📋 Clone & rename filter
- 🔍 Search filter dengan keyword
- 💾 Export/backup semua filter (Owner only)
- 📊 Info detail setiap filter

### 🚀 Optimasi & Keamanan
- ⚡ Rate limiting untuk mencegah spam
- 🚫 Blacklist system untuk ban user
- ⏱️ Timeout system untuk spam users
- 🗑️ Auto-delete message untuk menjaga kebersihan chat
- 💾 In-memory cache untuk performa tinggi
- 🔄 Auto-recovery dari network errors
- 📊 Health monitoring & statistics

### 🤖 AI Assistant - Hoki
- 💬 Groq LLaMA 3.3 70B integration untuk conversational AI
- 🎯 Multi-model cascade system dengan automatic fallback
- 😊 Personality engine dengan natural Indonesian style
- 🛡️ Prompt injection prevention & output sanitization
- 📊 Conversation analytics & performance monitoring
- 🔔 Smart triggering (mention atau reply ke bot)

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

Edit file `.env` dan isi dengan data Anda:
```env
# Dapatkan token dari @BotFather di Telegram
BOT_TOKEN=your_telegram_bot_token_here

# Dapatkan User ID dari @userinfobot di Telegram
OWNER_ID=your_telegram_user_id_here
```

### 4. Jalankan Bot
```bash
npm start
```

## 📖 Cara Penggunaan

### Command Admin

#### Manajemen Admin
- `/addadmin` - Tambah admin (reply ke user yang ingin dijadikan admin)
- `/removeadmin` - Hapus admin (reply ke admin yang ingin dihapus)
- `/listadmins` - Lihat daftar semua admin

#### Keamanan
- `/blacklist` - Ban user (reply ke user yang mau di-ban)
- `/unblacklist` - Unban user (reply ke user yang mau di-unban)
- `/listblacklist` - Lihat daftar user yang di-blacklist
- `/timeout <menit>` - Timeout user sementara (reply ke user, max 1440 menit)

#### Manajemen Filter
- `!add <nama>` - Buat filter baru (reply ke pesan yang ingin dijadikan filter)
- `!del <nama>` - Hapus filter
- `!clone <dari> <ke>` - Copy filter ke nama baru
- `!rename <lama> <baru>` - Ganti nama filter
- `!list` - Lihat semua filter dengan pagination
- `!info <nama>` - Lihat detail filter
- `!search <keyword>` - Cari filter
- `!status` - Lihat statistik & status bot
- `!export` - Backup semua filter (Owner only)

#### AI Assistant (Hoki)
- `@botusername <pesan>` - Chat dengan AI Hoki
- Reply ke pesan bot - Lanjutkan percakapan
- `!aistats` - Lihat statistik AI (admin only)
- `!aireset` - Reset AI stats & conversations (owner only)

#### Command Umum
- `/start` - Mulai menggunakan bot
- `/help` - Lihat semua command yang tersedia

### Menggunakan Filter
Semua user (termasuk non-admin) bisa menggunakan filter:
```
!namafilter
```
atau
```
namafilter
```

## 🎨 Contoh Penggunaan

### Membuat Filter Text
1. Kirim pesan dengan format yang diinginkan (bold, italic, dll)
2. Reply ke pesan tersebut dengan: `!add welcome`
3. Filter "welcome" siap digunakan

### Membuat Filter Media
1. Kirim photo/video dengan caption
2. Reply ke media tersebut dengan: `!add promo`
3. Filter "promo" siap digunakan

### Clone Filter
```
!clone welcome welcome2
```

### Rename Filter
```
!rename welcome2 hello
```

### Chat dengan AI Hoki
```
@botusername Halo Hoki, apa kabar?
```
atau reply ke pesan bot untuk lanjutkan percakapan.

### Ban User yang Spam
1. Reply ke pesan spammer
2. Kirim: `/blacklist`
3. User tidak bisa gunakan bot lagi

### Timeout User Sementara
1. Reply ke pesan user
2. Kirim: `/timeout 30` (timeout 30 menit)
3. User tidak bisa gunakan bot selama 30 menit

## 🔧 Teknologi

- **Node.js** - Runtime JavaScript
- **node-telegram-bot-api** - Library untuk Telegram Bot API
- **dotenv** - Environment variable management

## 📊 Struktur File

```
├── index.js          # File utama bot
├── package.json      # Dependencies & scripts
├── .env             # Environment variables (jangan di-commit!)
├── .env.example     # Template environment variables
├── admins.json      # Data admin (auto-generated)
└── filters.json     # Data filter (auto-generated)
```

## 🛡️ Keamanan

- ✅ Rate limiting untuk mencegah spam
- ✅ Owner protection (tidak bisa dihapus)
- ✅ HTML escape untuk mencegah injection
- ✅ Validasi input untuk semua command
- ✅ Error handling yang komprehensif

## 🚀 Deploy di Replit

Bot ini sudah dikonfigurasi untuk running di Replit:

1. Fork repository ini ke Replit
2. Tambahkan Secrets (BOT_TOKEN & OWNER_ID) di Replit Secrets
3. Klik tombol Run
4. Bot akan berjalan 24/7 di Replit

## 💡 Tips & Tricks

1. **Auto-delete**: Pesan command akan auto-delete setelah 3 menit
2. **Pagination**: List filter otomatis ter-pagination untuk filter >15 items
3. **Formatting**: Support semua Telegram formatting (HTML entities)
4. **Media Support**: Bisa save semua tipe media yang didukung Telegram
5. **Backup**: Gunakan `!export` untuk backup filter secara berkala

## 🐛 Troubleshooting

### Bot tidak merespon
- ✅ Pastikan BOT_TOKEN benar
- ✅ Pastikan bot sudah di-start dengan `/start`
- ✅ Check console untuk error messages

### Filter tidak terkirim
- ✅ Pastikan nama filter benar (case-insensitive)
- ✅ Check apakah ada special characters yang break parsing
- ✅ Lihat error message di console

### Media tidak terkirim
- ✅ Pastikan file_id masih valid (tidak expired)
- ✅ Check ukuran file tidak melebihi limit Telegram

## 📝 Changelog

### v1.0.0 (Current)
- ✅ Initial release
- ✅ Admin & filter management
- ✅ Support semua media types
- ✅ HTML entities conversion untuk formatting
- ✅ Rate limiting & auto-delete
- ✅ Export/backup filters
- ✅ Search & pagination

## 🤝 Kontribusi

Kontribusi selalu welcome! Silakan:
1. Fork repository
2. Buat branch baru (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

## 💰 Donasi

Jika bot ini bermanfaat, dukung development dengan donasi:

### ⚡ IDR (Rupiah)
- **[https://trakteer.id/garapanairdrop/tip](https://trakteer.id/garapanairdrop/tip)**

---

### ⚡ USD BNB ETH (EVM)
```
0x77bFeEa5Dd20C4Cf3B716A7CEf39E29897797aEC
```

## 📄 License

ISC License - Bebas digunakan untuk keperluan apapun.

## 👨‍💻 Author

**TentangBlockchain**
- GitHub: [@tentangblockchain](https://github.com/tentangblockchain)
- Bot Repository: [asisstant-bot](https://github.com/tentangblockchain/asisstant-bot)

## 🙏 Credits

- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) - Telegram Bot API wrapper
- [Telegram Bot API](https://core.telegram.org/bots/api) - Official Telegram Bot API

---

⭐ **Star repository ini jika bermanfaat!**

💬 **Butuh bantuan?** Buka issue di GitHub!
