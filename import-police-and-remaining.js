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

console.log('[*] Creating new tables...');
db.exec(`
  CREATE TABLE IF NOT EXISTS police_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pangkat TEXT,
    nama TEXT,
    tugas TEXT,
    hp TEXT,
    email TEXT,
    source TEXT DEFAULT 'polri_341k'
  );
  CREATE TABLE IF NOT EXISTS shopee_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT, amount TEXT, seller_id TEXT, shipping TEXT,
    tracking_no TEXT, buyer_name TEXT, address TEXT, product TEXT,
    source TEXT DEFAULT 'shopee'
  );
  CREATE TABLE IF NOT EXISTS indo_store_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT, tanggal_lahir TEXT, email TEXT, telepon TEXT, alamat TEXT, pesanan TEXT,
    source TEXT DEFAULT 'indo_store'
  );
  CREATE TABLE IF NOT EXISTS bsi_bank_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT, name TEXT, phone TEXT, phone62 TEXT, active_account TEXT,
    activation_code TEXT, register_by TEXT, email TEXT,
    source TEXT DEFAULT 'bsi_bank'
  );
  CREATE TABLE IF NOT EXISTS shopping_indo_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT, first_name TEXT, last_name TEXT, gender TEXT, phone TEXT,
    active_phone TEXT, address TEXT, location TEXT, hometown TEXT, work TEXT,
    source TEXT DEFAULT 'shopping_indo'
  );
  CREATE TABLE IF NOT EXISTS sg_shopping_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_num TEXT, location_id TEXT, name TEXT, address TEXT, address2 TEXT,
    postal TEXT, home_phone TEXT, mobile TEXT,
    source TEXT DEFAULT 'sg_shopping'
  );
`);

// ===== IMPORT POLICE DATA (341K) =====
function importPolice() {
  return new Promise((resolve) => {
    const filePath = path.resolve(__dirname, '..', 'idnpolice.csv');
    if (!fs.existsSync(filePath)) { console.log('[!] idnpolice.csv not found'); resolve(); return; }
    console.log('[*] Importing 341K Indonesian Police data...');
    const insert = db.prepare('INSERT INTO police_data (pangkat, nama, tugas, hp, email) VALUES (?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const p = row['PANGKAT'] || '';
        const n = (row['NAMA'] || '').trim();
        const t = (row['TUGAS'] || '').trim();
        const h = (row['HP'] || '').trim();
        const e = (row['EMAIL'] || '').trim();
        if (n) {
          batch.push([p, n, t, h, e]);
          count++;
          if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 50000 === 0) console.log('  ... ' + count); }
        }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Police: ' + count + ' rows'); resolve(); })
      .on('error', (e) => { console.log('[!] Police error:', e.message); resolve(); });
  });
}

// ===== IMPORT SHOPEE (173K) =====
function importShopee() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, '173k shopee (2).xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    console.log('[*] Importing Shopee 173K...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 << 'EOF'
import openpyxl, csv
wb = openpyxl.load_workbook("${filePath}", read_only=True)
ws = wb.active
with open("/tmp/shopee_data.csv", "w", newline="") as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(c) if c is not None else "" for c in row])
wb.close()
EOF`);
    } catch(e) { console.log('[!] Shopee convert failed'); resolve(); return; }
    const insert = db.prepare('INSERT INTO shopee_data (tanggal, amount, seller_id, shipping, tracking_no, buyer_name, address, product) VALUES (?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    fs.createReadStream('/tmp/shopee_data.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const v = Object.values(row);
        batch.push(v.slice(0, 8).map(x => (x || '').substring(0, 500)));
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 50000 === 0) console.log('  ... ' + count); }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Shopee: ' + count + ' rows'); resolve(); })
      .on('error', () => { resolve(); });
  });
}

// ===== IMPORT INDO STORE (70K) =====
function importIndoStore() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, 'Indonesia Store .xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    console.log('[*] Importing Indonesia Store 70K...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 << 'EOF'
import openpyxl, csv
wb = openpyxl.load_workbook("${filePath}", read_only=True)
ws = wb.active
with open("/tmp/indo_store.csv", "w", newline="") as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(c) if c is not None else "" for c in row])
wb.close()
EOF`);
    } catch(e) { console.log('[!] IndoStore convert failed'); resolve(); return; }
    const insert = db.prepare('INSERT INTO indo_store_data (nama, tanggal_lahir, email, telepon, alamat, pesanan) VALUES (?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    fs.createReadStream('/tmp/indo_store.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const v = Object.values(row);
        batch.push(v.slice(0, 6).map(x => (x || '').substring(0, 500)));
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Indonesia Store: ' + count + ' rows'); resolve(); })
      .on('error', () => { resolve(); });
  });
}

// ===== IMPORT BSI BANK (510) =====
function importBSI() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, '印度尼西亚Indonesia_www_bankbsi_co_id_银行ID_AppUser_银行储户姓名_银行客户电话_邮箱E.xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    console.log('[*] Importing BSI Bank 510...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 << 'EOF'
import openpyxl, csv
wb = openpyxl.load_workbook("${filePath}", read_only=True)
ws = wb.active
with open("/tmp/bsi_bank.csv", "w", newline="") as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(c) if c is not None else "" for c in row])
wb.close()
EOF`);
    } catch(e) { console.log('[!] BSI convert failed'); resolve(); return; }
    const insert = db.prepare('INSERT INTO bsi_bank_data (app_id, name, phone, phone62, active_account, activation_code, register_by, email) VALUES (?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    fs.createReadStream('/tmp/bsi_bank.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const v = Object.values(row);
        batch.push([v[0]||'', v[4]||'', v[5]||'', v[6]||'', v[7]||'', v[8]||'', v[9]||'', v[10]||'']);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] BSI Bank: ' + count + ' rows'); resolve(); })
      .on('error', () => { resolve(); });
  });
}

// ===== IMPORT SHOPPING INDO (3.3K) =====
function importShoppingIndo() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, '印度尼西亚（Indonesia）_购物Shopping_女_WS已筛选活跃账号_3336条_2.xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    console.log('[*] Importing Shopping Indo 3.3K...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 << 'EOF'
import openpyxl, csv
wb = openpyxl.load_workbook("${filePath}", read_only=True)
ws = wb.active
with open("/tmp/shopping_indo.csv", "w", newline="") as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(c) if c is not None else "" for c in row])
wb.close()
EOF`);
    } catch(e) { console.log('[!] ShoppingIndo convert failed'); resolve(); return; }
    const insert = db.prepare('INSERT INTO shopping_indo_data (uid, first_name, last_name, gender, phone, active_phone, address, location, hometown, work) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    fs.createReadStream('/tmp/shopping_indo.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const v = Object.values(row);
        batch.push(v.slice(0, 10).map(x => (x || '').substring(0, 500)));
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Shopping Indo: ' + count + ' rows'); resolve(); })
      .on('error', () => { resolve(); });
  });
}

// ===== IMPORT SG SHOPPING =====
function importSGShopping() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, 'sg shopping .csv');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    console.log('[*] Importing SG Shopping...');
    const insert = db.prepare('INSERT INTO sg_shopping_data (id_num, location_id, name, address, address2, postal, home_phone, mobile) VALUES (?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push([row.id||'', row.locationid||'', row.lastname||'', row.address1||'', row.address2||'', row.postal||'', row.home||'', row.mobile||'']);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 50000 === 0) console.log('  ... ' + count); }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] SG Shopping: ' + count + ' rows'); resolve(); })
      .on('error', () => { resolve(); });
  });
}

function createIndexes() {
  console.log('[*] Creating indexes...');
  db.exec(`
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
  `);
  console.log('[+] All indexes created');
}

async function main() {
  console.log('=== IMPORT ALL REMAINING DATA ===\n');
  await importPolice();
  await importShopee();
  await importIndoStore();
  await importBSI();
  await importShoppingIndo();
  await importSGShopping();
  createIndexes();

  console.log('\n=== FINAL DATABASE STATS ===\n');
  const tables = {
    phone_registry: 'Phone Registry (NIK+Nomor)',
    police_data: '🆕 Data POLRI (Pangkat+Nama+HP+Email)',
    vehicle_data: 'Data Kendaraan (NIK+Plat)',
    government_letters: 'Surat Pemerintah (NIP)',
    bukalapak_data: 'Bukalapak Users',
    sim_data: 'Data SIM',
    visa_card_data: 'Visa/Mastercard',
    member_data: 'Data Anggota/Mahasiswa',
    shopee_data: '🆕 Shopee (173K)',
    indo_store_data: '🆕 Indonesia Store (70K)',
    sg_shopping_data: '🆕 SG Shopping',
    shopping_indo_data: '🆕 Shopping Indo (3.3K)',
    bsi_bank_data: '🆕 BSI Bank (510)',
    indihome_data: 'IndiHome',
    citizen_data: 'SIAK/Kependudukan'
  };
  let total = 0;
  for (const [t, label] of Object.entries(tables)) {
    try {
      const r = db.prepare('SELECT COUNT(*) as cnt FROM ' + t).get();
      if (r.cnt > 0) {
        console.log('  ' + label + ': ' + r.cnt.toLocaleString());
        total += r.cnt;
      }
    } catch(e) {}
  }
  console.log('\n  TOTAL: ' + total.toLocaleString() + ' records');
  console.log('  DB Size: ' + (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1) + ' MB');
  db.close();
  console.log('\n[+] DONE!');
}
main().catch(e => { console.error(e); process.exit(1); });
