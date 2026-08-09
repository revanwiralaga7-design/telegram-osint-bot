const TelegramBotModule = require('node-telegram-bot-api');
const TelegramBot = typeof TelegramBotModule === 'function' ? TelegramBotModule : (TelegramBotModule.default || TelegramBotModule.TelegramBot || TelegramBotModule);
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
    const row = db.prepare('SELECT COUNT(*) as cnt FROM ' + table).get();
    stats.push({ label, count: row.cnt });
    total += row.cnt;
  }
  return { stats, total };
}

// ============ SEARCH FUNCTIONS ============

function searchByPhone(phone) {
  const results = [];
  phone = phone.replace(/[^0-9]/g, '');

  const phoneRows = db.prepare('SELECT * FROM phone_registry WHERE phone LIKE ? LIMIT ?').all('%' + phone + '%', MAX_RESULTS);
  for (const r of phoneRows) {
    results.push({ source: 'Phone Registry', nik: r.nik, phone: r.phone, provider: r.provider, date: r.date });
  }

  const memberRows = db.prepare('SELECT * FROM member_data WHERE phone_number LIKE ? LIMIT ?').all('%' + phone + '%', MAX_RESULTS);
  for (const r of memberRows) {
    results.push({ source: 'Data Anggota', nama: r.nama_lengkap, phone: r.phone_number, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir, alamat: r.alamat, program_studi: r.program_studi, fakultas: r.fakultas, gender: r.gender });
  }

  const ihRows = db.prepare('SELECT * FROM indihome_data WHERE mobile LIKE ? LIMIT ?').all('%' + phone + '%', MAX_RESULTS);
  for (const r of ihRows) {
    results.push({ source: 'IndiHome', email: r.email, mobile: r.mobile, indihomenum: r.indihomenum, source_ip: r.source_ip });
  }

  const simRows = db.prepare('SELECT * FROM sim_data WHERE no_peserta LIKE ? LIMIT ?').all('%' + phone + '%', MAX_RESULTS);
  for (const r of simRows) {
    results.push({ source: 'Data SIM', pencarian: r.pencarian, no_peserta: r.no_peserta, instansi: r.instansi, tanggal: r.tanggal });
  }

  const blRows = db.prepare('SELECT * FROM bukalapak_data WHERE phone LIKE ? LIMIT ?').all('%' + phone + '%', MAX_RESULTS);
  for (const r of blRows) {
    results.push({ source: 'Bukalapak', user_id: r.user_id, username: r.username, email: r.email, phone: r.phone });
  }

  return results;
}

function searchByNIK(nik) {
  const results = [];
  nik = nik.replace(/[^0-9]/g, '');

  const phoneRows = db.prepare('SELECT * FROM phone_registry WHERE nik LIKE ? LIMIT ?').all('%' + nik + '%', MAX_RESULTS);
  for (const r of phoneRows) {
    results.push({ source: 'Phone Registry', nik: r.nik, phone: r.phone, provider: r.provider, date: r.date });
  }

  const citRows = db.prepare('SELECT * FROM citizen_data WHERE nik LIKE ? LIMIT ?').all('%' + nik + '%', MAX_RESULTS);
  for (const r of citRows) {
    results.push({ source: 'Data Kependudukan (SIAK)', nik: r.nik, nama: r.nama, jenis_kelamin: r.jenis_kelamin, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir, agama: r.agama, pendidikan: r.pendidikan, pekerjaan: r.pekerjaan, nama_ibu: r.nama_ibu, nama_ayah: r.nama_ayah, no_kk: r.no_kk });
  }

  const vehRows = db.prepare('SELECT * FROM vehicle_data WHERE nik LIKE ? LIMIT ?').all('%' + nik + '%', MAX_RESULTS);
  for (const r of vehRows) {
    results.push({ source: 'Data Kendaraan', nik: r.nik, nama: r.name, plat_nomor: r.plate_number, alamat: r.address, merk: r.brand, tipe: r.type, vin: r.vin_number, no_mesin: r.engine_number, warna: r.color, tahun: r.year, bpkb: r.bpkb });
  }

  return results;
}

function searchByName(name) {
  const results = [];
  const upper = name.toUpperCase();

  const citRows = db.prepare('SELECT * FROM citizen_data WHERE nama LIKE ? LIMIT ?').all('%' + upper + '%', MAX_RESULTS);
  for (const r of citRows) {
    results.push({ source: 'Data Kependudukan (SIAK)', nik: r.nik, nama: r.nama, jenis_kelamin: r.jenis_kelamin, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir, no_kk: r.no_kk });
  }

  const memberRows = db.prepare('SELECT * FROM member_data WHERE nama_lengkap LIKE ? LIMIT ?').all('%' + upper + '%', MAX_RESULTS);
  for (const r of memberRows) {
    results.push({ source: 'Data Anggota', nama: r.nama_lengkap, phone: r.phone_number, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir, alamat: r.alamat, program_studi: r.program_studi, fakultas: r.fakultas, gender: r.gender });
  }

  const vehRows = db.prepare('SELECT * FROM vehicle_data WHERE name LIKE ? LIMIT ?').all('%' + upper + '%', MAX_RESULTS);
  for (const r of vehRows) {
    results.push({ source: 'Data Kendaraan', nik: r.nik, nama: r.name, plat_nomor: r.plate_number, alamat: r.address, merk: r.brand, tipe: r.type, warna: r.color, tahun: r.year });
  }

  return results;
}

function searchByEmail(email) {
  const results = [];

  const ihRows = db.prepare('SELECT * FROM indihome_data WHERE email LIKE ? LIMIT ?').all('%' + email + '%', MAX_RESULTS);
  for (const r of ihRows) {
    results.push({ source: 'IndiHome', email: r.email, mobile: r.mobile, indihomenum: r.indihomenum, source_ip: r.source_ip, service: r.service });
  }

  const blRows = db.prepare('SELECT * FROM bukalapak_data WHERE email LIKE ? LIMIT ?').all('%' + email + '%', MAX_RESULTS);
  for (const r of blRows) {
    results.push({ source: 'Bukalapak', user_id: r.user_id, email: r.email, username: r.username, phone: r.phone });
  }

  return results;
}

function searchByPlat(plat) {
  const results = [];
  const vehRows = db.prepare('SELECT * FROM vehicle_data WHERE plate_number LIKE ? LIMIT ?').all('%' + plat.toUpperCase() + '%', MAX_RESULTS);
  for (const r of vehRows) {
    results.push({ source: 'Data Kendaraan', plat_nomor: r.plate_number, nik: r.nik, nama: r.name, alamat: r.address, merk: r.brand, tipe: r.type, vin: r.vin_number, no_mesin: r.engine_number, warna: r.color, tahun: r.year, bpkb: r.bpkb });
  }
  return results;
}

function searchByNIP(nip) {
  const results = [];
  const govRows = db.prepare('SELECT * FROM government_letters WHERE nip LIKE ? LIMIT ?').all('%' + nip + '%', MAX_RESULTS);
  for (const r of govRows) {
    results.push({ source: 'Surat Pemerintah', nip: r.nip, pengirim: r.pengirim, judul: r.title, no_surat: r.no_surat, tanggal_surat: r.tgl_surat, isi: r.suggestion ? r.suggestion.substring(0, 200) : '' });
  }
  return results;
}

function searchByUsername(username) {
  const results = [];
  const blRows = db.prepare('SELECT * FROM bukalapak_data WHERE username LIKE ? LIMIT ?').all('%' + username + '%', MAX_RESULTS);
  for (const r of blRows) {
    results.push({ source: 'Bukalapak', user_id: r.user_id, username: r.username, email: r.email, phone: r.phone });
  }
  return results;
}

// ============ REPLY KEYBOARD ============
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: '\u{1F4F1} Phone' }, { text: '\u{1F194} NIK' }, { text: '\u{1F464} Nama' }],
      [{ text: '\u{1F4E7} Email' }, { text: '\u{1F697} Plat' }, { text: '\u{1F3DB} NIP' }],
      [{ text: '\u{1F511} Username' }, { text: '\u{1F4CA} Stats' }, { text: '\u{2753} Help' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true
  }
};

const userStates = new Map();

// ============ FORMAT RESULTS (plain text, no markdown) ============
function formatResult(result, index) {
  let text = '\u2501\u2501\u2501 Result ' + (index + 1) + ' \u2501\u2501\u2501\n';
  text += '\u{1F4C1} Source: ' + result.source + '\n';
  for (const [key, value] of Object.entries(result)) {
    if (key === 'source') continue;
    if (!value || value === '' || value === null) continue;
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    text += '\u{1F4CC} ' + label + ': ' + value + '\n';
  }
  return text;
}

function sendResults(chatId, header, results, extraOpts) {
  let text = header + '\n' + '\u{1F4CA} Ditemukan: ' + results.length + ' hasil\n\n';
  for (let i = 0; i < results.length; i++) {
    text += formatResult(results[i], i) + '\n';
    if (text.length > 3800) {
      bot.sendMessage(chatId, text, extraOpts || {});
      text = '';
    }
  }

  // Build inline keyboard from results
  var inlineButtons = [];
  var hasNIK = false, hasPhone = false, hasName = false, hasEmail = false, hasPlat = false;
  var nikVal = '', phoneVal = '', nameVal = '', emailVal = '', platVal = '';

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (r.nik && !hasNIK) { hasNIK = true; nikVal = r.nik; }
    if (r.phone && !hasPhone) { hasPhone = true; phoneVal = r.phone; }
    if (r.mobile && !hasPhone) { hasPhone = true; phoneVal = r.mobile; }
    if (r.no_peserta && !hasPhone) { hasPhone = true; phoneVal = r.no_peserta; }
    if (r.nama && !hasName) { hasName = true; nameVal = r.nama; }
    if (r.email && !hasEmail) { hasEmail = true; emailVal = r.email; }
    if (r.plat_nomor && !hasPlat) { hasPlat = true; platVal = r.plat_nomor; }
    if (r.plate_number && !hasPlat) { hasPlat = true; platVal = r.plate_number; }
  }

  var row1 = [];
  var row2 = [];

  if (hasNIK) row1.push({ text: '\u{1F194} Cari dari NIK', callback_data: 'nik:' + nikVal.substring(0, 50) });
  if (hasPhone) row1.push({ text: '\u{1F4F1} Cari dari Phone', callback_data: 'phone:' + phoneVal.substring(0, 50) });
  if (hasName) row2.push({ text: '\u{1F464} Cari dari Nama', callback_data: 'name:' + nameVal.substring(0, 50) });
  if (hasEmail) row2.push({ text: '\u{1F4E7} Cari dari Email', callback_data: 'email:' + emailVal.substring(0, 50) });
  if (hasPlat) row1.push({ text: '\u{1F697} Cek Plat', callback_data: 'plat:' + platVal.substring(0, 50) });
  row2.push({ text: '\u{1F504} Cari Lagi', callback_data: 'menu' });

  var inlineKb = { reply_markup: { inline_keyboard: [] } };
  if (row1.length > 0) inlineKb.reply_markup.inline_keyboard.push(row1);
  if (row2.length > 0) inlineKb.reply_markup.inline_keyboard.push(row2);

  // Merge with main keyboard
  var mergedOpts = Object.assign({}, extraOpts || {}, inlineKb);
  // Keep reply keyboard
  if (extraOpts && extraOpts.reply_markup && extraOpts.reply_markup.keyboard) {
    mergedOpts.reply_markup.keyboard = extraOpts.reply_markup.keyboard;
    mergedOpts.reply_markup.resize_keyboard = extraOpts.reply_markup.resize_keyboard;
    mergedOpts.reply_markup.is_persistent = extraOpts.reply_markup.is_persistent;
  }

  if (text) bot.sendMessage(chatId, text, mergedOpts);
}

// ============ HANDLER: generic search ============
function handleSearch(chatId, query, searchFn, emoji, label) {
  bot.sendMessage(chatId, '\u{1F50D} Mencari ' + label + ': ' + query + '...');
  try {
    const results = searchFn(query);
    if (results.length === 0) {
      bot.sendMessage(chatId, '\u274C Tidak ditemukan hasil untuk ' + label + ': ' + query, mainKeyboard);
      return;
    }
    sendResults(chatId, emoji + ' Hasil Pencarian ' + label + ': ' + query, results, mainKeyboard);
  } catch (e) {
    bot.sendMessage(chatId, '\u26A0\uFE0F Error: ' + e.message);
  }
}

// ============ BOT COMMANDS ============

bot.onText(/\/start/, function(msg) {
  var chatId = msg.chat.id;
  var statsData = getStats();
  var lines = [];
  lines.push('\u{1F50D} OSINT Intelligence Bot');
  lines.push('');
  lines.push('Selamat datang! Bot ini menyediakan akses ke database OSINT untuk pencarian informasi.');
  lines.push('');
  lines.push('\u{1F4CA} Database Stats:');
  for (var i = 0; i < statsData.stats.length; i++) {
    var s = statsData.stats[i];
    lines.push('  \u2022 ' + s.label + ': ' + s.count.toLocaleString() + ' records');
  }
  lines.push('');
  lines.push('  \u{1F4BE} Total: ' + statsData.total.toLocaleString() + ' records');
  lines.push('');
  lines.push('\u{1F527} Commands:');
  lines.push('/phone <nomor> - Cari by nomor telepon');
  lines.push('/nik <nomor> - Cari by NIK (termasuk kendaraan)');
  lines.push('/nama <nama> - Cari by nama');
  lines.push('/email <email> - Cari by email');
  lines.push('/plat <nomor> - Cari by plat nomor');
  lines.push('/nip <nomor> - Cari by NIP pegawai');
  lines.push('/username <user> - Cari by username');
  lines.push('/stats - Lihat statistik database');
  lines.push('/help - Bantuan');
  lines.push('');
  lines.push('\u{1F4DD} Contoh:');
  lines.push('/phone 081234567890');
  lines.push('/nik 3175070604891001');
  lines.push('/nama Budi Santoso');
  lines.push('/plat B1234XYZ');
  lines.push('/nip 196202131986031001');
  lines.push('/username john_doe');

  bot.sendMessage(chatId, lines.join('\n'), mainKeyboard);
});

bot.onText(/\/help/, function(msg) {
  var chatId = msg.chat.id;
  var lines = [];
  lines.push('\u{1F527} Daftar Command OSINT Bot');
  lines.push('');
  lines.push('\u{1F4F1} Pencarian Nomor Telepon');
  lines.push('/phone 081234567890');
  lines.push('Cari di: Phone Registry, Anggota, IndiHome, SIM, Bukalapak');
  lines.push('');
  lines.push('\u{1F194} Pencarian NIK');
  lines.push('/nik 3175070604891001');
  lines.push('Cari di: Phone Registry, SIAK, Data Kendaraan');
  lines.push('');
  lines.push('\u{1F464} Pencarian Nama');
  lines.push('/nama Budi Santoso');
  lines.push('Cari di: SIAK, Anggota, Data Kendaraan');
  lines.push('');
  lines.push('\u{1F4E7} Pencarian Email');
  lines.push('/email user@gmail.com');
  lines.push('Cari di: IndiHome, Bukalapak');
  lines.push('');
  lines.push('\u{1F697} Pencarian Plat Nomor');
  lines.push('/plat B1234XYZ');
  lines.push('Cari: NIK, nama, alamat, merk, tipe, VIN, no mesin, BPKB');
  lines.push('');
  lines.push('\u{1F3DB} Pencarian NIP Pegawai');
  lines.push('/nip 196202131986031001');
  lines.push('Cari: Data surat pemerintah (pengirim, judul, tanggal)');
  lines.push('');
  lines.push('\u{1F511} Pencarian Username');
  lines.push('/username john_doe');
  lines.push('Cari di: Bukalapak (email, phone)');
  lines.push('');
  lines.push('\u{1F4CA} Statistik');
  lines.push('/stats - Lihat jumlah data per sumber');
  lines.push('');
  lines.push('\u{1F4A1} Tips:');
  lines.push('\u2022 Pencarian bersifat partial (mengandung kata yang dicari)');
  lines.push('\u2022 Maksimal ' + MAX_RESULTS + ' hasil per sumber data');
  lines.push('\u2022 Data cross-reference otomatis antar sumber');
  lines.push('\u2022 Gunakan keyboard di bawah untuk akses cepat!');

  bot.sendMessage(chatId, lines.join('\n'), mainKeyboard);
});

bot.onText(/\/stats/, function(msg) {
  var chatId = msg.chat.id;
  var statsData = getStats();
  var dbSize = fs.statSync(DB_PATH).size;
  var lines = [];
  lines.push('\u{1F4CA} Database Statistics');
  lines.push('');
  for (var i = 0; i < statsData.stats.length; i++) {
    var s = statsData.stats[i];
    var pct = Math.round((s.count / statsData.total) * 100);
    var bar = '\u2588'.repeat(Math.min(20, pct));
    lines.push(s.label);
    lines.push('  ' + s.count.toLocaleString() + ' records');
    lines.push('  ' + bar);
    lines.push('');
  }
  lines.push('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501');
  lines.push('\u{1F4BE} Total: ' + statsData.total.toLocaleString() + ' records');
  lines.push('\u{1F4E6} DB Size: ' + (dbSize / 1024 / 1024).toFixed(1) + ' MB');

  bot.sendMessage(chatId, lines.join('\n'), mainKeyboard);
});

// ============ COMMAND HANDLERS ============
bot.onText(/\/phone\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByPhone, '\u{1F4F1}', 'Nomor'); });
bot.onText(/\/nik\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByNIK, '\u{1F194}', 'NIK'); });
bot.onText(/\/nama\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByName, '\u{1F464}', 'Nama'); });
bot.onText(/\/email\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByEmail, '\u{1F4E7}', 'Email'); });
bot.onText(/\/plat\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByPlat, '\u{1F697}', 'Plat'); });
bot.onText(/\/nip\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByNIP, '\u{1F3DB}', 'NIP'); });
bot.onText(/\/username\s+(.+)/, function(msg, match) { handleSearch(msg.chat.id, match[1].trim(), searchByUsername, '\u{1F511}', 'Username'); });

// ============ KEYBOARD BUTTON HANDLERS ============
bot.on('message', function(msg) {
  if (!msg.text || msg.text.startsWith('/')) return;

  var chatId = msg.chat.id;
  var text = msg.text.trim();
  var userId = msg.from.id;

  // If user is waiting for input
  if (userStates.has(userId)) {
    var state = userStates.get(userId);
    userStates.delete(userId);

    var searchMap = {
      phone: { fn: searchByPhone, emoji: '\u{1F4F1}', label: 'Nomor' },
      nik: { fn: searchByNIK, emoji: '\u{1F194}', label: 'NIK' },
      nama: { fn: searchByName, emoji: '\u{1F464}', label: 'Nama' },
      email: { fn: searchByEmail, emoji: '\u{1F4E7}', label: 'Email' },
      plat: { fn: searchByPlat, emoji: '\u{1F697}', label: 'Plat' },
      nip: { fn: searchByNIP, emoji: '\u{1F3DB}', label: 'NIP' },
      username: { fn: searchByUsername, emoji: '\u{1F511}', label: 'Username' }
    };

    if (searchMap[state]) {
      handleSearch(chatId, text, searchMap[state].fn, searchMap[state].emoji, searchMap[state].label);
    }
    return;
  }

  // Button clicks
  var buttons = {
    '\u{1F4F1} Phone': { state: 'phone', msg: '\u{1F4F1} Pencarian Nomor Telepon\n\nKirim nomor telepon yang ingin dicari:\n\nContoh: 081234567890' },
    '\u{1F194} NIK': { state: 'nik', msg: '\u{1F194} Pencarian NIK\n\nKirim NIK yang ingin dicari:\n\nContoh: 3175070604891001' },
    '\u{1F464} Nama': { state: 'nama', msg: '\u{1F464} Pencarian Nama\n\nKirim nama yang ingin dicari:\n\nContoh: Budi Santoso' },
    '\u{1F4E7} Email': { state: 'email', msg: '\u{1F4E7} Pencarian Email\n\nKirim email yang ingin dicari:\n\nContoh: user@gmail.com' },
    '\u{1F697} Plat': { state: 'plat', msg: '\u{1F697} Pencarian Plat Nomor\n\nKirim plat nomor yang ingin dicari:\n\nContoh: B1234XYZ' },
    '\u{1F3DB} NIP': { state: 'nip', msg: '\u{1F3DB} Pencarian NIP Pegawai\n\nKirim NIP yang ingin dicari:\n\nContoh: 196202131986031001' },
    '\u{1F511} Username': { state: 'username', msg: '\u{1F511} Pencarian Username\n\nKirim username yang ingin dicari:\n\nContoh: john_doe' }
  };

  if (buttons[text]) {
    userStates.set(userId, buttons[text].state);
    bot.sendMessage(chatId, buttons[text].msg);
  }
});

// ============ INLINE KEYBOARD CALLBACK HANDLER ============
bot.on('callback_query', function(query) {
  var chatId = query.message.chat.id;
  var data = query.data;

  try {
    if (data === 'menu') {
      bot.answerCallbackQuery(query.id, { text: 'Menu utama' });
      bot.sendMessage(chatId, '\u{1F50D} OSINT Bot - Pilih pencarian:', mainKeyboard);
      return;
    }

    var parts = data.split(':');
    var action = parts[0];
    var value = parts.slice(1).join(':');

    var searchMap = {
      nik: { fn: searchByNIK, emoji: '\u{1F194}', label: 'NIK' },
      phone: { fn: searchByPhone, emoji: '\u{1F4F1}', label: 'Nomor' },
      name: { fn: searchByName, emoji: '\u{1F464}', label: 'Nama' },
      email: { fn: searchByEmail, emoji: '\u{1F4E7}', label: 'Email' },
      plat: { fn: searchByPlat, emoji: '\u{1F697}', label: 'Plat' }
    };

    if (searchMap[action]) {
      bot.answerCallbackQuery(query.id, { text: 'Mencari ' + searchMap[action].label + ': ' + value });
      handleSearch(chatId, value, searchMap[action].fn, searchMap[action].emoji, searchMap[action].label);
    } else {
      bot.answerCallbackQuery(query.id, { text: 'Action tidak dikenali' });
    }
  } catch (e) {
    bot.answerCallbackQuery(query.id, { text: 'Error: ' + e.message });
  }
});

// ============ START ============
console.log('\u{1F916} OSINT Bot is running...');
console.log('\u{1F4CA} Database: ' + DB_PATH);
var statsData = getStats();
console.log('\u{1F4E6} Total records: ' + statsData.total.toLocaleString());
for (var i = 0; i < statsData.stats.length; i++) {
  console.log('   ' + statsData.stats[i].label + ': ' + statsData.stats[i].count.toLocaleString());
}
