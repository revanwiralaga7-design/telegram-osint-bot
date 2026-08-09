const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.resolve(__dirname, '..', 'osint_data', 'osint_database ');
const DB_PATH = path.resolve(__dirname, 'osint.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');
db.pragma('cache_size = -64000');
db.pragma('temp_store = MEMORY');

// ============ CREATE NEW TABLES ============

console.log('[*] Creating new tables...');

db.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_number TEXT,
    bpkb TEXT,
    name TEXT,
    nik TEXT,
    address TEXT,
    brand TEXT,
    type TEXT,
    vin_number TEXT,
    engine_number TEXT,
    color TEXT,
    year TEXT,
    source TEXT DEFAULT 'car_owner'
  );

  CREATE TABLE IF NOT EXISTS government_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    pengirim TEXT,
    nip TEXT,
    suggestion TEXT,
    tgl_surat TEXT,
    no_surat TEXT,
    source TEXT DEFAULT 'jokowi_letters'
  );

  CREATE TABLE IF NOT EXISTS bukalapak_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    email TEXT,
    username TEXT,
    phone TEXT,
    password_hash TEXT,
    source TEXT DEFAULT 'bukalapak'
  );

  CREATE TABLE IF NOT EXISTS visa_card_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_data TEXT,
    source TEXT DEFAULT 'visa_mc'
  );
`);

// ============ IMPORT CAR OWNER DATA ============

function importCarOwnerData() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, '[Sample]-35M-Indonesia-Car-Owner-Nationwide-csv-2021.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] Car owner file not found'); resolve(); return; }

    console.log('[*] Importing Car Owner data (NIK + kendaraan)...');
    const insert = db.prepare(`INSERT INTO vehicle_data (plate_number, bpkb, name, nik, address, brand, type, vin_number, engine_number, color, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(
          r['Number'] || r.Number || '',
          r['BPKB'] || r.BPKB || '',
          (r['Name'] || r.Name || '').trim(),
          (r['NIK'] || r.NIK || '').trim(),
          r['Address'] || r.Address || '',
          (r['Brand'] || r.Brand || '').trim(),
          (r['Type'] || r.Type || '').trim(),
          (r['VIN Number'] || r['VIN Number'] || '').trim(),
          (r['Engine Number'] || r['Engine Number'] || '').trim(),
          r['Color'] || r.Color || '',
          r['Year'] || r.Year || ''
        );
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
          if (count % 100000 === 0) console.log(`  ... ${count} rows`);
        }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] Car Owner: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

// ============ IMPORT GOVERNMENT LETTERS ============

function importGovLetters() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'letters-to-jokowi.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] letters-to-jokowi.csv not found'); resolve(); return; }

    console.log('[*] Importing government letters data...');
    const insert = db.prepare(`INSERT INTO government_letters (title, pengirim, nip, suggestion, tgl_surat, no_surat) VALUES (?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(
          r.title || '',
          r.pengirim || '',
          r.member_nip || '',
          r.suggestion || '',
          r.tgl_surat || '',
          r.no_surat || ''
        );
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
          if (count % 100000 === 0) console.log(`  ... ${count} rows`);
        }
      })
      .on('end', () => {
        if (batch.length > 0) insertMany(batch);
        console.log(`[+] Gov Letters: ${count} rows imported`);
        resolve();
      })
      .on('error', reject);
  });
}

// ============ IMPORT BUKALAPAK DATA ============

function importBukalapakData() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, 'Bukalapak - 500K Partial Out Of 13 Million.txt');
    if (!fs.existsSync(filePath)) { console.log('[!] Bukalapak file not found'); resolve(); return; }

    console.log('[*] Importing Bukalapak data...');
    const insert = db.prepare(`INSERT INTO bukalapak_data (user_id, email, username, phone, password_hash) VALUES (?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) insert.run(r.user_id, r.email, r.username, r.phone, r.password_hash);
    });

    let count = 0;
    let batch = [];

    const lineReader = require('readline').createInterface({
      input: fs.createReadStream(filePath)
    });

    lineReader.on('line', (line) => {
      // CSV format: id,email,username,hash,salt,hash2,salt2,salt3,...
      const parts = line.split(',');
      if (parts.length < 3) return;

      // Extract user_id, email, username
      const user_id = parts[0] || '';
      const email = parts[1] || '';
      const username = parts[2] || '';
      const password_hash = parts[3] || '';

      // Try to find phone number in the line (Indonesian format: 62xxx or 08xxx)
      let phone = '';
      for (const part of parts) {
        const cleaned = part.trim();
        if (/^(62|0)8[0-9]{8,12}$/.test(cleaned)) {
          phone = cleaned;
          break;
        }
      }

      batch.push({ user_id, email, username, phone, password_hash });
      count++;

      if (batch.length >= 5000) {
        insertMany(batch);
        batch = [];
        if (count % 100000 === 0) console.log(`  ... ${count} rows`);
      }
    });

    lineReader.on('close', () => {
      if (batch.length > 0) insertMany(batch);
      console.log(`[+] Bukalapak: ${count} rows imported`);
      resolve();
    });

    lineReader.on('error', reject);
  });
}

// ============ IMPORT VISA/MC DATA ============

function importVisaData() {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, '210,726 TDC VISA AND MASTERCARD.txt');
    if (!fs.existsSync(filePath)) { console.log('[!] Visa/MC file not found'); resolve(); return; }

    console.log('[*] Importing Visa/Mastercard data...');
    const insert = db.prepare(`INSERT INTO visa_card_data (raw_data) VALUES (?)`);
    const insertMany = db.transaction((rows) => {
      for (const r of rows) insert.run(r);
    });

    let count = 0;
    let batch = [];

    const lineReader = require('readline').createInterface({
      input: fs.createReadStream(filePath)
    });

    lineReader.on('line', (line) => {
      if (!line.trim()) return;
      batch.push(line.trim());
      count++;

      if (batch.length >= 5000) {
        insertMany(batch);
        batch = [];
        if (count % 50000 === 0) console.log(`  ... ${count} rows`);
      }
    });

    lineReader.on('close', () => {
      if (batch.length > 0) insertMany(batch);
      console.log(`[+] Visa/MC: ${count} rows imported`);
      resolve();
    });

    lineReader.on('error', reject);
  });
}

// ============ CREATE NEW INDEXES ============

function createNewIndexes() {
  console.log('[*] Creating new indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vehicle_nik ON vehicle_data(nik);
    CREATE INDEX IF NOT EXISTS idx_vehicle_name ON vehicle_data(name);
    CREATE INDEX IF NOT EXISTS idx_vehicle_plate ON vehicle_data(plate_number);
    CREATE INDEX IF NOT EXISTS idx_gov_nip ON government_letters(nip);
    CREATE INDEX IF NOT EXISTS idx_gov_pengirim ON government_letters(pengirim);
    CREATE INDEX IF NOT EXISTS idx_bl_email ON bukalapak_data(email);
    CREATE INDEX IF NOT EXISTS idx_bl_username ON bukalapak_data(username);
    CREATE INDEX IF NOT EXISTS idx_bl_phone ON bukalapak_data(phone);
    CREATE INDEX IF NOT EXISTS idx_visa_raw ON visa_card_data(raw_data);
  `);
  console.log('[+] New indexes created');
}

// ============ MAIN ============

async function main() {
  console.log('=== OSINT Database Import - Additional Data ===\n');

  await importCarOwnerData();
  await importGovLetters();
  await importBukalapakData();
  await importVisaData();

  createNewIndexes();

  // Print updated stats
  console.log('\n=== Updated Database Stats ===');
  const tables = ['phone_registry', 'citizen_data', 'member_data', 'indihome_data', 'sim_data', 'vehicle_data', 'government_letters', 'bukalapak_data', 'visa_card_data'];
  for (const t of tables) {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get();
    console.log(`  ${t}: ${row.cnt.toLocaleString()} rows`);
  }

  const dbSize = fs.statSync(DB_PATH).size;
  console.log(`\n  Database size: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('\n[+] Import complete!');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
