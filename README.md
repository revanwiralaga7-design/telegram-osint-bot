# 🔍 Telegram OSINT Bot

Bot Telegram untuk pencarian informasi OSINT dari database lokal.

## 📊 Database

Database SQLite berisi **2.66 juta+ records** dari berbagai sumber:

| Sumber | Records | Deskripsi |
|--------|---------|-----------|
| Phone Registry | 2,000,006 | NIK + Nomor telepon + Provider |
| Data Anggota | 148,200 | Data mahasiswa/anggota (nama, alamat, phone) |
| Data SIM | 500,000 | Data SIM Indonesia |
| IndiHome | 10,000 | Data pelanggan IndiHome |
| SIAK | 2,000 | Data kependudukan |

## 🚀 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Import Database
```bash
node import-data.js
```

### 3. Set Bot Token
Dapatkan token dari [@BotFather](https://t.me/BotFather) di Telegram, lalu:

```bash
export BOT_TOKEN="your_token_here"
```

Atau edit file `bot.js` dan ganti `YOUR_BOT_TOKEN_HERE`

### 4. Run Bot
```bash
node bot.js
```

## 🔧 Commands

| Command | Deskripsi |
|---------|-----------|
| `/start` | Welcome & info bot |
| `/help` | Daftar command |
| `/phone <nomor>` | Cari by nomor telepon |
| `/nik <nomor>` | Cari by NIK |
| `/nama <nama>` | Cari by nama |
| `/email <email>` | Cari by email |
| `/stats` | Statistik database |

## 📝 Contoh Penggunaan

```
/phone 081234567890
/nik 3175070604891001
/nama Budi Santoso
/email user@gmail.com
```

## 🏗️ Struktur File

```
telegram-osint-bot/
├── bot.js              # Main bot script
├── import-data.js      # Script import data ke SQLite
├── osint.db            # Database SQLite (generated)
├── package.json
├── .env.example
└── README.md
```

## 🔍 Fitur Pencarian

- **Phone Lookup**: Cari info dari nomor telepon (cross-reference semua sumber)
- **NIK Lookup**: Cari data kependudukan dari NIK
- **Name Search**: Cari berdasarkan nama (case insensitive)
- **Email Search**: Cari berdasarkan email
- Maksimal 10 hasil per pencarian per sumber

## ⚡ Tech Stack

- **Runtime**: Node.js
- **Bot Framework**: node-telegram-bot-api
- **Database**: SQLite (better-sqlite3)
- **Parser**: csv-parser
