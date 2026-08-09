const TelegramBot = require('node-telegram-bot-api');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ============ CONFIG ============
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const DB_PATH = path.resolve(__dirname, 'osint.db');
const MAX_RESULTS = 10;

// ============ INIT ============
const db = new Database(DB_PATH, { readonly: true });
db.pragma('cache_size = -32000');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ============ STATS ============
function getStats() {
  const tables = {
    phone_registry: 'Phone Registry (NIK + Nomor)',
    vehicle_data: 'Data Kendaraan (NIK + Plat)',
    government_letters: 'Surat Pemerintah (NIP)',
    bukalapak_data: 'Bukalapak Users',
    sim_data: 'Data SIM',
    visa_card_data: 'Visa/Mastercard',
    member_data: 'Data Anggota/Mahasiswa',
    indihome_data: 'Data IndiHome',
    citizen_data: 'Data Kependudukan (SIAK)'
  };
  let stats = [];
  let total = 0;
  for (const [table, label] of Object.entries(tables)) {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
    stats.push({ label, count: row.cnt });
    total += row.cnt;
  }
  return { stats, total };
}

// ============ SEARCH FUNCTIONS ============

function searchByEmail(email) {
  const results = [];

  // Search indihome_data
  const ihRows = db.prepare(`SELECT * FROM indihome_data WHERE email LIKE ? LIMIT ?`).all(`%${email}%`, MAX_RESULTS);
  for (const r of ihRows) {
    results.push({
      source: 'IndiHome',
      email: r.email,
      mobile: r.mobile,
      indihomenum: r.indihomenum,
      source_ip: r.source_ip,
      service: r.service
    });
  }

  // Search bukalapak_data
  const blRows = db.prepare(`SELECT * FROM bukalapak_data WHERE email LIKE ? LIMIT ?`).all(`%${email}%`, MAX_RESULTS);
  for (const r of blRows) {
    results.push({
      source: 'Bukalapak',
      user_id: r.user_id,
      email: r.email,
      username: r.username,
      phone: r.phone
    });
  }

  return results;
}

// ============ NEW SEARCH FUNCTIONS ============

function searchByPlat(plat) {
  const results = [];
  const vehRows = db.prepare(`SELECT * FROM vehicle_data WHERE plate_number LIKE ? LIMIT ?`).all(`%${plat.toUpperCase()}%`, MAX_RESULTS);
  for (const r of vehRows) {
    results.push({
      source: 'Data Kendaraan',
      plat_nomor: r.plate_number,
      nik: r.nik,
      nama: r.name,
      alamat: r.address,
      merk: r.brand,
      tipe: r.type,
      vin: r.vin_number,
      no_mesin: r.engine_number,
      warna: r.color,
      tahun: r.year,
      bpkb: r.bpkb
    });
  }
  return results;
}

function searchByNIP(nip) {
  const results = [];
  const govRows = db.prepare(`SELECT * FROM government_letters WHERE nip LIKE ? LIMIT ?`).all(`%${nip}%`, MAX_RESULTS);
  for (const r of govRows) {
    results.push({
      source: 'Surat Pemerintah',
      nip: r.nip,
      pengirim: r.pengirim,
      judul: r.title,
      no_surat: r.no_surat,
      tanggal_surat: r.tgl_surat,
      isi: r.suggestion ? r.suggestion.substring(0, 200) : ''
    });
  }
  return results;
}

function searchByUsername(username) {
  const results = [];
  const blRows = db.prepare(`SELECT * FROM bukalapak_data WHERE username LIKE ? LIMIT ?`).all(`%${username}%`, MAX_RESULTS);
  for (const r of blRows) {
    results.push({
      source: 'Bukalapak',
      user_id: r.user_id,
      username: r.username,
      email: r.email,
      phone: r.phone
    });
  }
  return results;
}

function searchByPhone(phone) {
  const results = [];
  phone = phone.replace(/[^0-9]/g, '');

  // Search phone_registry
  const phoneRows = db.prepare(`SELECT * FROM phone_registry WHERE phone LIKE ? LIMIT ?`).all(`%${phone}%`, MAX_RESULTS);
  for (const r of phoneRows) {
    results.push({
      source: 'Phone Registry',
      nik: r.nik,
      phone: r.phone,
      provider: r.provider,
      date: r.date
    });
  }

  // Search member_data
  const memberRows = db.prepare(`SELECT * FROM member_data WHERE phone_number LIKE ? LIMIT ?`).all(`%${phone}%`, MAX_RESULTS);
  for (const r of memberRows) {
    results.push({
      source: 'Data Anggota',
      nama: r.nama_lengkap,
      phone: r.phone_number,
      tempat_lahir: r.tempat_lahir,
      tanggal_lahir: r.tanggal_lahir,
      alamat: r.alamat,
      program_studi: r.program_studi,
      fakultas: r.fakultas,
      gender: r.gender
    });
  }

  // Search indihome_data
  const ihRows = db.prepare(`SELECT * FROM indihome_data WHERE mobile LIKE ? LIMIT ?`).all(`%${phone}%`, MAX_RESULTS);
  for (const r of ihRows) {
    results.push({
      source: 'IndiHome',
      email: r.email,
      mobile: r.mobile,
      indihomenum: r.indihomenum,
      source_ip: r.source_ip
    });
  }

  // Search sim_data
  const simRows = db.prepare(`SELECT * FROM sim_data WHERE no_peserta LIKE ? LIMIT ?`).all(`%${phone}%`, MAX_RESULTS);
  for (const r of simRows) {
    results.push({
      source: 'Data SIM',
      pencarian: r.pencarian,
      no_peserta: r.no_peserta,
      instansi: r.instansi,
      tanggal: r.tanggal
    });
  }

  // Search bukalapak_data
  const blRows = db.prepare(`SELECT * FROM bukalapak_data WHERE phone LIKE ? LIMIT ?`).all(`%${phone}%`, MAX_RESULTS);
  for (const r of blRows) {
    results.push({
      source: 'Bukalapak',
      user_id: r.user_id,
      username: r.username,
      email: r.email,
      phone: r.phone
    });
  }

  return results;
}

function searchByNIK(nik) {
  const results = [];
  nik = nik.replace(/[^0-9]/g, '');

  // Search phone_registry
  const phoneRows = db.prepare(`SELECT * FROM phone_registry WHERE nik LIKE ? LIMIT ?`).all(`%${nik}%`, MAX_RESULTS);
  for (const r of phoneRows) {
    results.push({
      source: 'Phone Registry',
      nik: r.nik,
      phone: r.phone,
      provider: r.provider,
      date: r.date
    });
  }

  // Search citizen_data
  const citRows = db.prepare(`SELECT * FROM citizen_data WHERE nik LIKE ? LIMIT ?`).all(`%${nik}%`, MAX_RESULTS);
  for (const r of citRows) {
    results.push({
      source: 'Data Kependudukan (SIAK)',
      nik: r.nik,
      nama: r.nama,
      jenis_kelamin: r.jenis_kelamin,
      tempat_lahir: r.tempat_lahir,
      tanggal_lahir: r.tanggal_lahir,
      agama: r.agama,
      pendidikan: r.pendidikan,
      pekerjaan: r.pekerjaan,
      nama_ibu: r.nama_ibu,
      nama_ayah: r.nama_ayah,
      no_kk: r.no_kk
    });
  }

  // Search vehicle_data
  const vehRows = db.prepare(`SELECT * FROM vehicle_data WHERE nik LIKE ? LIMIT ?`).all(`%${nik}%`, MAX_RESULTS);
  for (const r of vehRows) {
    results.push({
      source: 'Data Kendaraan',
      nik: r.nik,
      nama: r.name,
      plat_nomor: r.plate_number,
      alamat: r.address,
      merk: r.brand,
      tipe: r.type,
      vin: r.vin_number,
      no_mesin: r.engine_number,
      warna: r.color,
      tahun: r.year,
      bpkb: r.bpkb
    });
  }

  return results;
}

function searchByName(name) {
  const results = [];

  // Search citizen_data
  const citRows = db.prepare(`SELECT * FROM citizen_data WHERE nama LIKE ? LIMIT ?`).all(`%${name.toUpperCase()}%`, MAX_RESULTS);
  for (const r of citRows) {
    results.push({
      source: 'Data Kependudukan (SIAK)',
      nik: r.nik,
      nama: r.nama,
      jenis_kelamin: r.jenis_kelamin,
      tempat_lahir: r.tempat_lahir,
      tanggal_lahir: r.tanggal_lahir,
      no_kk: r.no_kk
    });
  }

  // Search member_data
  const memberRows = db.prepare(`SELECT * FROM member_data WHERE nama_lengkap LIKE ? LIMIT ?`).all(`%${name.toUpperCase()}%`, MAX_RESULTS);
  for (const r of memberRows) {
    results.push({
      source: 'Data Anggota',
      nama: r.nama_lengkap,
      phone: r.phone_number,
      tempat_lahir: r.tempat_lahir,
      tanggal_lahir: r.tanggal_lahir,
      alamat: r.alamat,
      program_studi: r.program_studi,
      fakultas: r.fakultas,
      gender: r.gender
    });
  }

  // Search vehicle_data
  const vehRows = db.prepare(`SELECT * FROM vehicle_data WHERE name LIKE ? LIMIT ?`).all(`%${name.toUpperCase()}%`, MAX_RESULTS);
  for (const r of vehRows) {
    results.push({
      source: 'Data Kendaraan',
      nik: r.nik,
      nama: r.name,
      plat_nomor: r.plate_number,
      alamat: r.address,
      merk: r.brand,
      tipe: r.type,
      warna: r.color,
      tahun: r.year
    });
  }

  return results;
}

// ============ REPLY KEYBOARD ============
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [
        { text: '📱 Phone' },
        { text: '🆔 NIK' },
        { text: '👤 Nama' }
      ],
      [
        { text: '📧 Email' },
        { text: '🚗 Plat' },
        { text: '🏛 NIP' }
      ],
      [
        { text: '🔑 Username' },
        { text: '📊 Stats' },
        { text: '❓ Help' }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true
  }
};

// User state tracking
const userStates = new Map();

// ============ FORMAT RESULTS ============

function formatResult(result, index) {
  let text = `━━━ Result ${index + 1} ━━━\n`;
  text += `📁 Source: ${result.source}\n`;

  for (const [key, value] of Object.entries(result)) {
    if (key === 'source') continue;
    if (!value || value === '' || value === null) continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    text += `📌 ${label}: ${value}\n`;
  }

  return text;
}

// ============ BOT COMMANDS ============

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const text = `
🔍 *OSINT Intelligence Bot*

Selamat datang! Bot ini menyediakan akses ke database OSINT untuk pencarian informasi.

📊 *Database Stats:*
`;
  const { stats, total } = getStats();
  let statsText = '';
  for (const s of stats) {
    statsText += `  • ${s.label}: *${s.count.toLocaleString()}* records\n`;
  }
  statsText += `\n  💾 Total: *${total.toLocaleString()}* records`;

  const helpText = `

🔧 *Commands:*
/phone \`<nomor>\` - Cari by nomor telepon
/nik \`<nomor>\` - Cari by NIK (termasuk kendaraan)
/nama \`<nama>\` - Cari by nama
/email \`<email>\` - Cari by email
/plat \`<nomor>\` - Cari by plat nomor
/nip \`<nomor>\` - Cari by NIP pegawai
/username \`<username>\` - Cari by username
/stats - Lihat statistik database
/help - Bantuan

📝 *Contoh:*
/phone 081234567890
/nik 3175070604891001
/nama Budi Santoso
/plat B1234XYZ
/nip 196202131986031001
/username john_doe
`;

  bot.sendMessage(chatId, text + statsText + helpText, { parse_mode: 'Markdown', ...mainKeyboard });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const text = `
🔧 *Daftar Command OSINT Bot*

📱 *Pencarian Nomor Telepon*
/phone \`081234567890\`
Cari di: Phone Registry, Anggota, IndiHome, SIM, Bukalapak

🆔 *Pencarian NIK*
/nik \`3175070604891001\`
Cari di: Phone Registry, SIAK, Data Kendaraan

👤 *Pencarian Nama*
/nama \`Budi Santoso\`
Cari di: SIAK, Anggota, Data Kendaraan

📧 *Pencarian Email*
/email \`user@gmail.com\`
Cari di: IndiHome, Bukalapak

🚗 *Pencarian Plat Nomor*
/plat \`B1234XYZ\`
Cari: NIK, nama, alamat, merk, tipe, VIN, no mesin, BPKB

🏛 *Pencarian NIP Pegawai*
/nip \`196202131986031001\`
Cari: Data surat pemerintah (pengirim, judul, tanggal)

🔑 *Pencarian Username*
/username \`john_doe\`
Cari di: Bukalapak (email, phone)

📊 *Statistik*
/stats - Lihat jumlah data per sumber

💡 *Tips:*
• Pencarian bersifat partial (mengandung kata yang dicari)
• Maksimal ${MAX_RESULTS} hasil per sumber data
• Data cross-reference otomatis antar sumber
`;
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
});

bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  const { stats, total } = getStats();
  const dbSize = fs.statSync(DB_PATH).size;

  let text = `📊 *Database Statistics*\n\n`;
  for (const s of stats) {
    const bar = '█'.repeat(Math.min(20, Math.round((s.count / total) * 100)));
    text += `*${s.label}*\n`;
    text += `  ${s.count.toLocaleString()} records\n`;
    text += `  ${bar}\n\n`;
  }
  text += `━━━━━━━━━━━━━━━\n`;
  text += `💾 Total: *${total.toLocaleString()}* records\n`;
  text += `📦 DB Size: *${(dbSize / 1024 / 1024).toFixed(1)} MB*\n`;

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
});

bot.onText(/\/phone\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();

  bot.sendMessage(chatId, `🔍 Mencari nomor: \`${query}\`...`, { parse_mode: 'Markdown' });

  try {
    const results = searchByPhone(query);

    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk nomor: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }

    let text = `📱 *Hasil Pencarian: ${query}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;

    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';

      // Telegram message limit
      if (text.length > 3800) {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        text = '';
      }
    }

    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, `⚠️ Error: ${e.message}`);
  }
});

bot.onText(/\/nik\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();

  bot.sendMessage(chatId, `🔍 Mencari NIK: \`${query}\`...`, { parse_mode: 'Markdown' });

  try {
    const results = searchByNIK(query);

    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk NIK: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }

    let text = `🆔 *Hasil Pencarian NIK: ${query}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;

    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';
      if (text.length > 3800) {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        text = '';
      }
    }

    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, `⚠️ Error: ${e.message}`);
  }
});

bot.onText(/\/nama\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();

  bot.sendMessage(chatId, `🔍 Mencari nama: \`${query}\`...`, { parse_mode: 'Markdown' });

  try {
    const results = searchByName(query);

    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk nama: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }

    let text = `👤 *Hasil Pencarian Nama: ${query}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;

    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';
      if (text.length > 3800) {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        text = '';
      }
    }

    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, `⚠️ Error: ${e.message}`);
  }
});

bot.onText(/\/email\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();

  bot.sendMessage(chatId, `🔍 Mencari email: \`${query}\`...`, { parse_mode: 'Markdown' });

  try {
    const results = searchByEmail(query);

    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk email: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }

    let text = `📧 *Hasil Pencarian Email: ${query}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;

    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';
      if (text.length > 3800) {
        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        text = '';
      }
    }

    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) {
    bot.sendMessage(chatId, `⚠️ Error: ${e.message}`);
  }
});

// Handle inline queries (optional)
bot.on('inline_query', (query) => {
  // Can be extended for inline mode
});

// ============ NEW COMMANDS ============

bot.onText(/\/plat\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();
  bot.sendMessage(chatId, `🔍 Mencari plat: \`${query.toUpperCase()}\`...`, { parse_mode: 'Markdown' });
  try {
    const results = searchByPlat(query);
    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk plat: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }
    let text = `🚗 *Hasil Pencarian Plat: ${query.toUpperCase()}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;
    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';
      if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
    }
    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
});

bot.onText(/\/nip\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();
  bot.sendMessage(chatId, `🔍 Mencari NIP: \`${query}\`...`, { parse_mode: 'Markdown' });
  try {
    const results = searchByNIP(query);
    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk NIP: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }
    let text = `🏛 *Hasil Pencarian NIP: ${query}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;
    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';
      if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
    }
    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
});

bot.onText(/\/username\s+(.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1].trim();
  bot.sendMessage(chatId, `🔍 Mencari username: \`${query}\`...`, { parse_mode: 'Markdown' });
  try {
    const results = searchByUsername(query);
    if (results.length === 0) {
      bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk username: \`${query}\``, { parse_mode: 'Markdown' });
      return;
    }
    let text = `👤 *Hasil Pencarian Username: ${query}*\n`;
    text += `📊 Ditemukan: ${results.length} hasil\n\n`;
    for (let i = 0; i < results.length; i++) {
      text += formatResult(results[i], i) + '\n';
      if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
    }
    if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
});

// ============ KEYBOARD BUTTON HANDLERS ============

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userId = msg.from.id;

  // Check if user is in a state (waiting for input)
  if (userStates.has(userId)) {
    const state = userStates.get(userId);
    userStates.delete(userId);
    
    const query = text;
    
    // Process based on state
    if (state === 'phone') {
      bot.sendMessage(chatId, `🔍 Mencari nomor: \`${query}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByPhone(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk nomor: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `📱 *Hasil Pencarian: ${query}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    else if (state === 'nik') {
      bot.sendMessage(chatId, `🔍 Mencari NIK: \`${query}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByNIK(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk NIK: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `🆔 *Hasil Pencarian NIK: ${query}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    else if (state === 'nama') {
      bot.sendMessage(chatId, `🔍 Mencari nama: \`${query}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByName(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk nama: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `👤 *Hasil Pencarian Nama: ${query}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    else if (state === 'email') {
      bot.sendMessage(chatId, `🔍 Mencari email: \`${query}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByEmail(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk email: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `📧 *Hasil Pencarian Email: ${query}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    else if (state === 'plat') {
      bot.sendMessage(chatId, `🔍 Mencari plat: \`${query.toUpperCase()}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByPlat(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk plat: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `🚗 *Hasil Pencarian Plat: ${query.toUpperCase()}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    else if (state === 'nip') {
      bot.sendMessage(chatId, `🔍 Mencari NIP: \`${query}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByNIP(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk NIP: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `🏛 *Hasil Pencarian NIP: ${query}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    else if (state === 'username') {
      bot.sendMessage(chatId, `🔍 Mencari username: \`${query}\`...`, { parse_mode: 'Markdown' });
      try {
        const results = searchByUsername(query);
        if (results.length === 0) {
          bot.sendMessage(chatId, `❌ Tidak ditemukan hasil untuk username: \`${query}\``, { parse_mode: 'Markdown', ...mainKeyboard });
          return;
        }
        let text = `👤 *Hasil Pencarian Username: ${query}*\n📊 Ditemukan: ${results.length} hasil\n\n`;
        for (let i = 0; i < results.length; i++) {
          text += formatResult(results[i], i) + '\n';
          if (text.length > 3800) { bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); text = ''; }
        }
        if (text) bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...mainKeyboard });
      } catch (e) { bot.sendMessage(chatId, `⚠️ Error: ${e.message}`); }
    }
    return;
  }

  // Handle button clicks
  if (text === '📱 Phone') {
    userStates.set(userId, 'phone');
    bot.sendMessage(chatId, '📱 *Pencarian Nomor Telepon*\n\nKirim nomor telepon yang ingin dicari:\n\nContoh: `081234567890`', { parse_mode: 'Markdown' });
  }
  else if (text === '🆔 NIK') {
    userStates.set(userId, 'nik');
    bot.sendMessage(chatId, '🆔 *Pencarian NIK*\n\nKirim NIK yang ingin dicari:\n\nContoh: `3175070604891001`', { parse_mode: 'Markdown' });
  }
  else if (text === '👤 Nama') {
    userStates.set(userId, 'nama');
    bot.sendMessage(chatId, '👤 *Pencarian Nama*\n\nKirim nama yang ingin dicari:\n\nContoh: `Budi Santoso`', { parse_mode: 'Markdown' });
  }
  else if (text === '📧 Email') {
    userStates.set(userId, 'email');
    bot.sendMessage(chatId, '📧 *Pencarian Email*\n\nKirim email yang ingin dicari:\n\nContoh: `user@gmail.com`', { parse_mode: 'Markdown' });
  }
  else if (text === '🚗 Plat') {
    userStates.set(userId, 'plat');
    bot.sendMessage(chatId, '🚗 *Pencarian Plat Nomor*\n\nKirim plat nomor yang ingin dicari:\n\nContoh: `B1234XYZ`', { parse_mode: 'Markdown' });
  }
  else if (text === '🏛 NIP') {
    userStates.set(userId, 'nip');
    bot.sendMessage(chatId, '🏛 *Pencarian NIP Pegawai*\n\nKirim NIP yang ingin dicari:\n\nContoh: `196202131986031001`', { parse_mode: 'Markdown' });
  }
  else if (text === '🔑 Username') {
    userStates.set(userId, 'username');
    bot.sendMessage(chatId, '🔑 *Pencarian Username*\n\nKirim username yang ingin dicari:\n\nContoh: `john_doe`', { parse_mode: 'Markdown' });
  }
});

console.log('🤖 OSINT Bot is running...');
console.log(`📊 Database: ${DB_PATH}`);
const { stats, total } = getStats();
console.log(`📦 Total records: ${total.toLocaleString()}`);
for (const s of stats) {
  console.log(`   ${s.label}: ${s.count.toLocaleString()}`);
}
