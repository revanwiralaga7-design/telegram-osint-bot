const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const readline = require('readline');

const DATA_DIR = path.resolve(__dirname, '..', 'osint_data', 'osint_database ');
const DB_PATH = path.resolve(__dirname, 'osint.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');
db.pragma('cache_size = -64000');

// Create all tables
db.exec(`
  CREATE TABLE IF NOT EXISTS phone_registry (id INTEGER PRIMARY KEY AUTOINCREMENT, nik TEXT, phone TEXT, provider TEXT, date TEXT, source TEXT DEFAULT 'phone2m');
  CREATE TABLE IF NOT EXISTS citizen_data (id INTEGER PRIMARY KEY AUTOINCREMENT, nik TEXT, nama TEXT, jenis_kelamin TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, agama TEXT, status_kawin TEXT, pendidikan TEXT, pekerjaan TEXT, nama_ibu TEXT, nama_ayah TEXT, no_kk TEXT, source TEXT DEFAULT 'siak');
  CREATE TABLE IF NOT EXISTS member_data (id INTEGER PRIMARY KEY AUTOINCREMENT, nama_lengkap TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, alamat TEXT, phone_number TEXT, jurusan TEXT, program_studi TEXT, fakultas TEXT, tahun_ajaran TEXT, gender TEXT, source TEXT DEFAULT 'anggota');
  CREATE TABLE IF NOT EXISTS indihome_data (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, mobile TEXT, indihomenum TEXT, source_ip TEXT, service TEXT, payload TEXT, source TEXT DEFAULT 'indihome');
  CREATE TABLE IF NOT EXISTS sim_data (id INTEGER PRIMARY KEY AUTOINCREMENT, pencarian TEXT, no_peserta TEXT, instansi TEXT, tanggal TEXT, source TEXT DEFAULT 'sim');
  CREATE TABLE IF NOT EXISTS visa_card_data (id INTEGER PRIMARY KEY AUTOINCREMENT, raw_data TEXT, source TEXT DEFAULT 'visa_mc');
  CREATE TABLE IF NOT EXISTS police_data (id INTEGER PRIMARY KEY AUTOINCREMENT, pangkat TEXT, nama TEXT, tugas TEXT, hp TEXT, email TEXT, source TEXT DEFAULT 'polri_341k');
  CREATE TABLE IF NOT EXISTS shopee_data (id INTEGER PRIMARY KEY AUTOINCREMENT, tanggal TEXT, amount TEXT, seller_id TEXT, shipping TEXT, tracking_no TEXT, buyer_name TEXT, address TEXT, product TEXT, source TEXT DEFAULT 'shopee');
  CREATE TABLE IF NOT EXISTS indo_store_data (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT, tanggal_lahir TEXT, email TEXT, telepon TEXT, alamat TEXT, pesanan TEXT, source TEXT DEFAULT 'indo_store');
  CREATE TABLE IF NOT EXISTS bsi_bank_data (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT, name TEXT, phone TEXT, phone62 TEXT, active_account TEXT, activation_code TEXT, register_by TEXT, email TEXT, source TEXT DEFAULT 'bsi_bank');
  CREATE TABLE IF NOT EXISTS shopping_indo_data (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, first_name TEXT, last_name TEXT, gender TEXT, phone TEXT, active_phone TEXT, address TEXT, location TEXT, hometown TEXT, work TEXT, source TEXT DEFAULT 'shopping_indo');
  CREATE TABLE IF NOT EXISTS sg_shopping_data (id INTEGER PRIMARY KEY AUTOINCREMENT, id_num TEXT, location_id TEXT, name TEXT, address TEXT, address2 TEXT, postal TEXT, home_phone TEXT, mobile TEXT, source TEXT DEFAULT 'sg_shopping');
  CREATE TABLE IF NOT EXISTS vehicle_data (id INTEGER PRIMARY KEY AUTOINCREMENT, plate_number TEXT, bpkb TEXT, name TEXT, nik TEXT, address TEXT, brand TEXT, type TEXT, vin_number TEXT, engine_number TEXT, color TEXT, year TEXT, source TEXT DEFAULT 'car_owner');
  CREATE TABLE IF NOT EXISTS government_letters (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, pengirim TEXT, nip TEXT, suggestion TEXT, tgl_surat TEXT, no_surat TEXT, source TEXT DEFAULT 'jokowi_letters');
  CREATE TABLE IF NOT EXISTS bukalapak_data (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, email TEXT, username TEXT, phone TEXT, password_hash TEXT, source TEXT DEFAULT 'bukalapak');
`);

const cleanHeader = (h) => h.trim().replace(/^"|"$/g, '');

function importCSV(filePath, table, columns, mapper, label) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) { resolve(0); return; }
    const existing = db.prepare('SELECT COUNT(*) as c FROM ' + table).get().c;
    if (existing > 0) { console.log('[~] ' + label + ': already ' + existing.toLocaleString() + ' rows, skip'); resolve(existing); return; }
    console.log('[*] Importing ' + label + '...');
    const placeholders = columns.map(() => '?').join(',');
    const insert = db.prepare('INSERT INTO ' + table + ' (' + columns.join(',') + ') VALUES (' + placeholders + ')');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [];
    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => cleanHeader(header), mapValues: ({ value }) => (value || '').trim() }))
      .on('data', (row) => {
        const mapped = mapper(row);
        if (mapped) { batch.push(mapped); count++; }
        if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 100000 === 0) console.log('  ... ' + count.toLocaleString()); }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] ' + label + ': ' + count.toLocaleString() + ' rows'); resolve(count); })
      .on('error', (e) => { console.log('[!] ' + label + ' error: ' + e.message); resolve(count); });
  });
}

function importLines(filePath, table, mapper, label) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) { resolve(0); return; }
    const existing = db.prepare('SELECT COUNT(*) as c FROM ' + table).get().c;
    if (existing > 0) { console.log('[~] ' + label + ': already ' + existing.toLocaleString() + ' rows, skip'); resolve(existing); return; }
    console.log('[*] Importing ' + label + '...');
    const columns = mapper.columns;
    const placeholders = columns.map(() => '?').join(',');
    const insert = db.prepare('INSERT INTO ' + table + ' (' + columns.join(',') + ') VALUES (' + placeholders + ')');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      const mapped = mapper(line);
      if (mapped) { batch.push(mapped); count++; }
      if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 50000 === 0) console.log('  ... ' + count.toLocaleString()); }
    });
    rl.on('close', () => { if (batch.length) insertMany(batch); console.log('[+] ' + label + ': ' + count.toLocaleString() + ' rows'); resolve(count); });
    rl.on('error', () => { resolve(count); });
  });
}

async function main() {
  console.log('=== FULL DATABASE REBUILD ===\n');

  // 1. SIM Data (500K)
  await importCSV(path.join(DATA_DIR, 'Indonesian sim data 500k sample.csv'), 'sim_data',
    ['pencarian','no_peserta','instansi','tanggal'],
    (r) => [r.PENCARIAN||'', r.NO_PESERTA||'', r.INSTANSI||'', r.TANGGAL||''],
    'SIM Data (500K)');

  // 2. SIAK Clean
  await importCSV(path.join(DATA_DIR, 'siak_clean_sample_1k.csv'), 'citizen_data',
    ['nik','nama','jenis_kelamin','tempat_lahir','tanggal_lahir','agama','status_kawin','pendidikan','pekerjaan','nama_ibu','nama_ayah','no_kk','source'],
    (r) => [r.NIK||'', r.NAMA_LGKP||'', r.JENIS_KLMIN==='1'?'Laki-laki':'Perempuan', r.TMPT_LHR||'', r.TGL_LHR||'', r.AGAMA||'', r.STAT_KWN||'', r.PDDK_AKH||'', r.JENIS_PKRJN||'', r.NAMA_LGKP_IBU||'', r.NAMA_LGKP_AYAH||'', r.NO_KK||'', 'siak'],
    'SIAK Clean (1K)');

  // 3. SIAK Full
  await importCSV(path.join(DATA_DIR, 'siak_full_sample_1k.csv'), 'citizen_data',
    ['nik','nama','jenis_kelamin','tempat_lahir','tanggal_lahir','agama','status_kawin','pendidikan','pekerjaan','nama_ibu','nama_ayah','no_kk','source'],
    (r) => [r.NIK||'', r.NAMA_LGKP||'', r.JENIS_KLMIN==='1'?'Laki-laki':'Perempuan', r.TMPT_LHR||'', r.TGL_LHR||'', r.AGAMA||'', r.STAT_KWN||'', r.PDDK_AKH||'', r.JENIS_PKRJN||'', r.NAMA_LGKP_IBU||'', r.NAMA_LGKP_AYAH||'', r.NO_KK||'', 'siak_full'],
    'SIAK Full (1K)');

  // 4. MyIndiHome (10K)
  await importCSV(path.join(DATA_DIR, 'myindihome_sample.csv'), 'indihome_data',
    ['email','mobile','indihomenum','source_ip','service','payload'],
    (r) => [r.email||'', r.mobile||'', r.indihomenum||'', r.sourceip||'', r.service||'', r.requestpayload||''],
    'IndiHome (10K)');

  // 5. Visa/Mastercard (210K)
  const visaMapper = (line) => [line.trim()];
  visaMapper.columns = ['raw_data'];
  await importLines(path.join(DATA_DIR, '210,726 TDC VISA AND MASTERCARD.txt'), 'visa_card_data', visaMapper, 'Visa/MC (210K)');

  // 6. Dukcapil samples from netleaks
  await importCSV(path.resolve(__dirname, '..', 'siak_clean_sample_1k.csv'), 'citizen_data',
    ['nik','nama','jenis_kelamin','tempat_lahir','tanggal_lahir','agama','status_kawin','pendidikan','pekerjaan','nama_ibu','nama_ayah','no_kk','source'],
    (r) => [r.NIK||'', r.NAMA_LGKP||'', r.JENIS_KLMIN==='1'?'Laki-laki':'Perempuan', r.TMPT_LHR||'', r.TGL_LHR||'', r.AGAMA||'', r.STAT_KWN||'', r.PDDK_AKH||'', r.JENIS_PKRJN||'', r.NAMA_LGKP_IBU||'', r.NAMA_LGKP_AYAH||'', r.NO_KK||'', 'dukcapil_netleaks'],
    'Dukcapil Sample (1K from netleaks)');

  // Create all indexes
  console.log('\n[*] Creating all indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_phone_nik ON phone_registry(nik);
    CREATE INDEX IF NOT EXISTS idx_phone_phone ON phone_registry(phone);
    CREATE INDEX IF NOT EXISTS idx_citizen_nik ON citizen_data(nik);
    CREATE INDEX IF NOT EXISTS idx_citizen_nama ON citizen_data(nama);
    CREATE INDEX IF NOT EXISTS idx_member_nama ON member_data(nama_lengkap);
    CREATE INDEX IF NOT EXISTS idx_member_phone ON member_data(phone_number);
    CREATE INDEX IF NOT EXISTS idx_indihome_email ON indihome_data(email);
    CREATE INDEX IF NOT EXISTS idx_indihome_mobile ON indihome_data(mobile);
    CREATE INDEX IF NOT EXISTS idx_sim_peserta ON sim_data(no_peserta);
    CREATE INDEX IF NOT EXISTS idx_vehicle_nik ON vehicle_data(nik);
    CREATE INDEX IF NOT EXISTS idx_vehicle_name ON vehicle_data(name);
    CREATE INDEX IF NOT EXISTS idx_vehicle_plate ON vehicle_data(plate_number);
    CREATE INDEX IF NOT EXISTS idx_gov_nip ON government_letters(nip);
    CREATE INDEX IF NOT EXISTS idx_bl_email ON bukalapak_data(email);
    CREATE INDEX IF NOT EXISTS idx_bl_username ON bukalapak_data(username);
    CREATE INDEX IF NOT EXISTS idx_bl_phone ON bukalapak_data(phone);
    CREATE INDEX IF NOT EXISTS idx_police_nama ON police_data(nama);
    CREATE INDEX IF NOT EXISTS idx_police_hp ON police_data(hp);
    CREATE INDEX IF NOT EXISTS idx_police_email ON police_data(email);
    CREATE INDEX IF NOT EXISTS idx_police_pangkat ON police_data(pangkat);
    CREATE INDEX IF NOT EXISTS idx_police_tugas ON police_data(tugas);
    CREATE INDEX IF NOT EXISTS idx_shopee_buyer ON shopee_data(buyer_name);
    CREATE INDEX IF NOT EXISTS idx_indostore_nama ON indo_store_data(nama);
    CREATE INDEX IF NOT EXISTS idx_indostore_email ON indo_store_data(email);
    CREATE INDEX IF NOT EXISTS idx_indostore_telp ON indo_store_data(telepon);
    CREATE INDEX IF NOT EXISTS idx_bsi_name ON bsi_bank_data(name);
    CREATE INDEX IF NOT EXISTS idx_bsi_phone ON bsi_bank_data(phone);
    CREATE INDEX IF NOT EXISTS idx_bsi_email ON bsi_bank_data(email);
    CREATE INDEX IF NOT EXISTS idx_shopindo_phone ON shopping_indo_data(phone);
    CREATE INDEX IF NOT EXISTS idx_sgshop_mobile ON sg_shopping_data(mobile);
    CREATE INDEX IF NOT EXISTS idx_sgshop_name ON sg_shopping_data(name);
  `);
  console.log('[+] All indexes created');

  // Print stats
  console.log('\n=== FINAL DATABASE STATS ===\n');
  const tables = [
    ['phone_registry', 'Phone Registry (NIK+Nomor)'],
    ['police_data', '🆕 Data POLRI'],
    ['vehicle_data', 'Data Kendaraan'],
    ['government_letters', 'Surat Pemerintah'],
    ['bukalapak_data', 'Bukalapak Users'],
    ['sim_data', 'Data SIM'],
    ['visa_card_data', 'Visa/Mastercard'],
    ['member_data', 'Data Anggota'],
    ['shopee_data', '🆕 Shopee'],
    ['indo_store_data', '🆕 Indonesia Store'],
    ['sg_shopping_data', '🆕 SG Shopping'],
    ['shopping_indo_data', '🆕 Shopping Indo'],
    ['bsi_bank_data', '🆕 BSI Bank'],
    ['indihome_data', 'IndiHome'],
    ['citizen_data', 'SIAK/Dukcapil']
  ];
  let total = 0;
  for (const [t, label] of tables) {
    try {
      const r = db.prepare('SELECT COUNT(*) as cnt FROM ' + t).get();
      if (r.cnt > 0) { console.log('  ✓ ' + label + ': ' + r.cnt.toLocaleString()); total += r.cnt; }
    } catch(e) {}
  }
  console.log('\n  💾 TOTAL: ' + total.toLocaleString() + ' records');
  console.log('  📦 DB Size: ' + (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1) + ' MB');
  db.close();
}
main().catch(e => { console.error(e); process.exit(1); });
