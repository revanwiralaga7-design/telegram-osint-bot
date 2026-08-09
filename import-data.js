const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.resolve(__dirname, '..', 'osint_data', 'osint_database ');
const DB_PATH = path.resolve(__dirname, 'osint.db');

// Remove old db if exists
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new Database(DB_PATH);

// Performance tuning
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

// ============ CREATE TABLES ============

console.log('[*] Creating tables...');

db.exec(`
  CREATE TABLE IF NOT EXISTS phone_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nik TEXT,
    phone TEXT,
    provider TEXT,
    date TEXT,
    source TEXT DEFAULT 'phone2m'
  );

  CREATE TABLE IF NOT EXISTS citizen_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nik TEXT,
    nama TEXT,
    jenis_kelamin TEXT,
    tempat_lahir TEXT,
    tanggal_lahir TEXT,
    agama TEXT,
    status_kawin TEXT,
    pendidikan TEXT,
    pekerjaan TEXT,
    nama_ibu TEXT,
    nama_ayah TEXT,
    no_kk TEXT,
    source TEXT DEFAULT 'siak'
  );

  CREATE TABLE IF NOT EXISTS member_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_lengkap TEXT,
    tempat_lahir TEXT,
    tanggal_lahir TEXT,
    alamat TEXT,
    phone_number TEXT,
    jurusan TEXT,
    program_studi TEXT,
    fakultas TEXT,
    tahun_ajaran TEXT,
    gender TEXT,
    source TEXT DEFAULT 'anggota'
  );

  CREATE TABLE IF NOT EXISTS indihome_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    mobile TEXT,
    indihomenum TEXT,
    source_ip TEXT,
    service TEXT,
    payload TEXT,
    source TEXT DEFAULT 'indihome'
  );

  CREATE TABLE IF NOT EXISTS sim_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pencarian TEXT,
    no_peserta TEXT,
    instansi TEXT,
    tanggal TEXT,
    source TEXT DEFAULT 'sim'
  );
`);

// ============ IMPORT FUNCTIONS ============

function importPhoneCSV() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'phone2Monly.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] phone2Monly.csv not found'); resolve(); return; }

    console.log('[*] Importing phone2Monly.csv...');
    const insert = db.prepare(`INSERT INTO phone_registry (nik, phone, provider, date) VALUES (?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) insert.run(r.nik, r.phone, r.provider, r.date);
    });

    let count = 0;
    let batch = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push(row);
        count++;
        if (batch.length >= 5000) {
          insertMany(batch);
          batch = [];
          if (count % 100000 === 0) console.log(`  ... ${count} rows`);
        }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] phone2Monly: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

function importSIAKData() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'siak_clean_sample_1k.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] siak_clean_sample_1k.csv not found'); resolve(); return; }

    console.log('[*] Importing siak_clean_sample_1k.csv...');
    const insert = db.prepare(`INSERT INTO citizen_data (nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, agama, status_kawin, pendidikan, pekerjaan, nama_ibu, nama_ayah, no_kk) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.NIK, r.NAMA_LGKP, r.JENIS_KLMIN === '1' ? 'Laki-laki' : 'Perempuan',
          r.TMPT_LHR, r.TGL_LHR, r.AGAMA, r.STAT_KWN, r.PDDK_AKH, r.JENIS_PKRJN,
          r.NAMA_LGKP_IBU, r.NAMA_LGKP_AYAH, r.NO_KK);
      }
    });

    let count = 0;
    let batch = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push(row);
        count++;
        if (batch.length >= 5000) {
          insertMany(batch);
          batch = [];
        }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] SIAK: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

function importSIAKFull() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'siak_full_sample_1k.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] siak_full_sample_1k.csv not found'); resolve(); return; }

    console.log('[*] Importing siak_full_sample_1k.csv...');
    const insert = db.prepare(`INSERT INTO citizen_data (nik, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, agama, status_kawin, pendidikan, pekerjaan, nama_ibu, nama_ayah, no_kk, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'siak_full')`);

    let count = 0;
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.NIK, r.NAMA_LGKP, r.JENIS_KLMIN === '1' ? 'Laki-laki' : 'Perempuan',
          r.TMPT_LHR, r.TGL_LHR, r.AGAMA, r.STAT_KWN, r.PDDK_AKH, r.JENIS_PKRJN,
          r.NAMA_LGKP_IBU, r.NAMA_LGKP_AYAH, r.NO_KK);
      }
    });

    let batch = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push(row);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] SIAK Full: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

function importMemberData() {
  return new Promise((resolve, reject) => {
    const dumpDir = path.join(DATA_DIR, 'dumped-data');
    if (!fs.existsSync(dumpDir)) { console.log('[!] dumped-data dir not found'); resolve(); return; }

    const files = fs.readdirSync(dumpDir).filter(f => f.endsWith('.json'));
    console.log(`[*] Importing ${files.length} member JSON files...`);

    const insert = db.prepare(`INSERT INTO member_data (nama_lengkap, tempat_lahir, tanggal_lahir, alamat, phone_number, jurusan, program_studi, fakultas, tahun_ajaran, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.nama_lengkap, r.tempat_lahir, r.tanggal_lahir, r.alamat, r.phone_number,
          r.jurusan, r.program_studi, r.fakultas, r.tahun_ajaran, r.gender);
      }
    });

    let totalCount = 0;
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dumpDir, file), 'utf-8'));
        if (Array.isArray(data)) {
          insertMany(data);
          totalCount += data.length;
        }
      } catch (e) {
        console.log(`  [!] Error parsing ${file}: ${e.message}`);
      }
    }
    console.log(`[+] Members: ${totalCount} rows imported`);
    resolve();
  });
}

function importIndihomeData() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'myindihome_sample.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] myindihome_sample.csv not found'); resolve(); return; }

    console.log('[*] Importing myindihome_sample.csv...');
    const insert = db.prepare(`INSERT INTO indihome_data (email, mobile, indihomenum, source_ip, service, payload) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.email, r.mobile, r.indihomenum, r.sourceip, r.service, r.requestpayload);
      }
    });

    let count = 0;
    let batch = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push(row);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] IndiHome: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

function importSIMData() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'Indonesian sim data 500k sample.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] Indonesian sim data not found'); resolve(); return; }

    console.log('[*] Importing Indonesian SIM data...');
    const insert = db.prepare(`INSERT INTO sim_data (pencarian, no_peserta, instansi, tanggal) VALUES (?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.PENCARIAN, r.NO_PESERTA, r.INSTANSI, r.TANGGAL);
      }
    });

    let count = 0;
    let batch = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push(row);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 100000 === 0) console.log(`  ... ${count} rows`); }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] SIM Data: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

// ============ CREATE INDEXES ============

function createIndexes() {
  console.log('[*] Creating indexes...');
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
    CREATE INDEX IF NOT EXISTS idx_sim_pencarian ON sim_data(pencarian);
  `);
  console.log('[+] Indexes created');
}

// ============ MAIN ============

async function main() {
  console.log('=== OSINT Database Import ===');
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`DB path: ${DB_PATH}\n`);

  await importPhoneCSV();
  await importSIAKData();
  await importSIAKFull();
  await importMemberData();
  await importIndihomeData();
  await importSIMData();

  createIndexes();

  // Print stats
  console.log('\n=== Database Stats ===');
  const tables = ['phone_registry', 'citizen_data', 'member_data', 'indihome_data', 'sim_data'];
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get();
    console.log(`  ${t}: ${row.cnt} rows`);
  }

  const dbSize = fs.statSync(DB_PATH).size;
  console.log(`\n  Database size: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('\n[+] Import complete!');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
