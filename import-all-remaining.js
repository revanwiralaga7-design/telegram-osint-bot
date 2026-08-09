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

// Create new tables
console.log('[*] Creating tables...');
db.exec(`
  CREATE TABLE IF NOT EXISTS shopee_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tanggal TEXT,
    amount TEXT,
    seller_id TEXT,
    shipping TEXT,
    tracking_no TEXT,
    buyer_name TEXT,
    address TEXT,
    product TEXT,
    source TEXT DEFAULT 'shopee'
  );

  CREATE TABLE IF NOT EXISTS indo_store_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT,
    tanggal_lahir TEXT,
    email TEXT,
    telepon TEXT,
    alamat TEXT,
    pesanan TEXT,
    source TEXT DEFAULT 'indo_store'
  );

  CREATE TABLE IF NOT EXISTS bsi_bank_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT,
    name TEXT,
    phone TEXT,
    phone62 TEXT,
    active_account TEXT,
    activation_code TEXT,
    register_by TEXT,
    email TEXT,
    source TEXT DEFAULT 'bsi_bank'
  );

  CREATE TABLE IF NOT EXISTS shopping_indo_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT,
    first_name TEXT,
    last_name TEXT,
    gender TEXT,
    phone TEXT,
    active_phone TEXT,
    address TEXT,
    location TEXT,
    hometown TEXT,
    work TEXT,
    source TEXT DEFAULT 'shopping_indo'
  );

  CREATE TABLE IF NOT EXISTS sg_shopping_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_num TEXT,
    location_id TEXT,
    name TEXT,
    address TEXT,
    address2 TEXT,
    postal TEXT,
    home_phone TEXT,
    mobile TEXT,
    source TEXT DEFAULT 'sg_shopping'
  );
`);

// Import Shopee data (XLSX -> already parsed as CSV via openpyxl earlier)
function importShopee() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, '173k shopee (2).xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    
    console.log('[*] Importing Shopee data (173K)...');
    const openpyxl = require('child_process');
    
    // Use python to convert xlsx to csv first
    const { execSync } = require('child_process');
    try {
      execSync(`python3 -c "
import openpyxl, csv, sys
wb = openpyxl.load_workbook('${filePath}', read_only=True)
ws = wb.active
with open('/tmp/shopee_data.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow(row)
wb.close()
" 2>/dev/null`);
    } catch(e) { console.log('[!] Failed to convert Shopee xlsx'); resolve(); return; }

    const insert = db.prepare('INSERT INTO shopee_data (tanggal, amount, seller_id, shipping, tracking_no, buyer_name, address, product) VALUES (?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    
    fs.createReadStream('/tmp/shopee_data.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; } // skip header
        const vals = Object.values(row);
        batch.push(vals.slice(0, 8).map(v => v ? String(v).substring(0, 500) : ''));
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 50000 === 0) console.log('  ... ' + count); }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Shopee: ' + count + ' rows'); resolve(); })
      .on('error', () => { console.log('[!] Shopee import error'); resolve(); });
  });
}

// Import Indonesia Store
function importIndoStore() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, 'Indonesia Store .xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    
    console.log('[*] Importing Indonesia Store data (70K)...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 -c "
import openpyxl, csv
wb = openpyxl.load_workbook('${filePath}', read_only=True)
ws = wb.active
with open('/tmp/indo_store.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow(row)
wb.close()
" 2>/dev/null`);
    } catch(e) { console.log('[!] Failed to convert'); resolve(); return; }

    const insert = db.prepare('INSERT INTO indo_store_data (nama, tanggal_lahir, email, telepon, alamat, pesanan) VALUES (?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    
    fs.createReadStream('/tmp/indo_store.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const vals = Object.values(row);
        batch.push(vals.slice(0, 6).map(v => v ? String(v).substring(0, 500) : ''));
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Indonesia Store: ' + count + ' rows'); resolve(); })
      .on('error', () => { console.log('[!] Import error'); resolve(); });
  });
}

// Import BSI Bank
function importBSI() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, '印度尼西亚Indonesia_www_bankbsi_co_id_银行ID_AppUser_银行储户姓名_银行客户电话_邮箱E.xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    
    console.log('[*] Importing BSI Bank data (510)...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 -c "
import openpyxl, csv
wb = openpyxl.load_workbook('${filePath}', read_only=True)
ws = wb.active
with open('/tmp/bsi_bank.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow(row)
wb.close()
" 2>/dev/null`);
    } catch(e) { console.log('[!] Failed to convert'); resolve(); return; }

    const insert = db.prepare('INSERT INTO bsi_bank_data (app_id, name, phone, phone62, active_account, activation_code, register_by, email) VALUES (?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    
    fs.createReadStream('/tmp/bsi_bank.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const vals = Object.values(row);
        // Map: ID, App\\User, App\\Pos, Created, Bank Savings Name, Bank reserved phone, Bank reserved phone 62+, WS活跃账号, ActivationCode, RegisterBy, E-Mail
        batch.push([
          vals[0] ? String(vals[0]) : '',  // ID
          vals[4] ? String(vals[4]) : '',  // Bank Savings Name
          vals[5] ? String(vals[5]) : '',  // Bank reserved phone
          vals[6] ? String(vals[6]) : '',  // Bank reserved phone 62+
          vals[7] ? String(vals[7]) : '',  // WS active account
          vals[8] ? String(vals[8]) : '',  // ActivationCode
          vals[9] ? String(vals[9]) : '',  // RegisterBy
          vals[10] ? String(vals[10]) : ''  // E-Mail
        ]);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] BSI Bank: ' + count + ' rows'); resolve(); })
      .on('error', () => { console.log('[!] Import error'); resolve(); });
  });
}

// Import Shopping Indonesia
function importShoppingIndo() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, '印度尼西亚（Indonesia）_购物Shopping_女_WS已筛选活跃账号_3336条_2.xlsx');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    
    console.log('[*] Importing Shopping Indonesia data (3.3K)...');
    const { execSync } = require('child_process');
    try {
      execSync(`python3 -c "
import openpyxl, csv
wb = openpyxl.load_workbook('${filePath}', read_only=True)
ws = wb.active
with open('/tmp/shopping_indo.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow(row)
wb.close()
" 2>/dev/null`);
    } catch(e) { console.log('[!] Failed to convert'); resolve(); return; }

    const insert = db.prepare('INSERT INTO shopping_indo_data (uid, first_name, last_name, gender, phone, active_phone, address, location, hometown, work) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [], first = true;
    
    fs.createReadStream('/tmp/shopping_indo.csv')
      .pipe(csv())
      .on('data', (row) => {
        if (first) { first = false; return; }
        const vals = Object.values(row);
        batch.push(vals.slice(0, 10).map(v => v ? String(v).substring(0, 500) : ''));
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] Shopping Indonesia: ' + count + ' rows'); resolve(); })
      .on('error', () => { console.log('[!] Import error'); resolve(); });
  });
}

// Import SG Shopping
function importSGShopping() {
  return new Promise((resolve) => {
    const filePath = path.join(DATA_DIR, 'sg shopping .csv');
    if (!fs.existsSync(filePath)) { resolve(); return; }
    
    console.log('[*] Importing SG Shopping data...');
    const insert = db.prepare('INSERT INTO sg_shopping_data (id_num, location_id, name, address, address2, postal, home_phone, mobile) VALUES (?,?,?,?,?,?,?,?)');
    const insertMany = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
    let count = 0, batch = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        batch.push([
          row.id || '', row.locationid || '', row.lastname || '',
          row.address1 || '', row.address2 || '', row.postal || '',
          row.home || '', row.mobile || ''
        ]);
        count++;
        if (batch.length >= 5000) { insertMany(batch); batch = []; if (count % 50000 === 0) console.log('  ... ' + count); }
      })
      .on('end', () => { if (batch.length) insertMany(batch); console.log('[+] SG Shopping: ' + count + ' rows'); resolve(); })
      .on('error', () => { console.log('[!] Import error'); resolve(); });
  });
}

function createNewIndexes() {
  console.log('[*] Creating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_shopee_buyer ON shopee_data(buyer_name);
    CREATE INDEX IF NOT EXISTS idx_shopee_tracking ON shopee_data(tracking_no);
    CREATE INDEX IF NOT EXISTS idx_indostore_nama ON indo_store_data(nama);
    CREATE INDEX IF NOT EXISTS idx_indostore_email ON indo_store_data(email);
    CREATE INDEX IF NOT EXISTS idx_indostore_telp ON indo_store_data(telepon);
    CREATE INDEX IF NOT EXISTS idx_bsi_name ON bsi_bank_data(name);
    CREATE INDEX IF NOT EXISTS idx_bsi_phone ON bsi_bank_data(phone);
    CREATE INDEX IF NOT EXISTS idx_bsi_email ON bsi_bank_data(email);
    CREATE INDEX IF NOT EXISTS idx_shopindo_phone ON shopping_indo_data(phone);
    CREATE INDEX IF NOT EXISTS idx_shopindo_name ON shopping_indo_data(first_name);
    CREATE INDEX IF NOT EXISTS idx_sgshop_mobile ON sg_shopping_data(mobile);
    CREATE INDEX IF NOT EXISTS idx_sgshop_name ON sg_shopping_data(name);
  `);
  console.log('[+] Indexes created');
}

async function main() {
  console.log('=== Import All Remaining Data ===\n');
  await importShopee();
  await importIndoStore();
  await importBSI();
  await importShoppingIndo();
  await importSGShopping();
  createNewIndexes();
  
  console.log('\n=== Updated Database Stats ===');
  const tables = ['phone_registry','vehicle_data','government_letters','bukalapak_data','sim_data','visa_card_data','member_data','indihome_data','citizen_data','shopee_data','indo_store_data','bsi_bank_data','shopping_indo_data','sg_shopping_data'];
  let total = 0;
  for (const t of tables) {
    try {
      const r = db.prepare('SELECT COUNT(*) as cnt FROM ' + t).get();
      console.log('  ' + t + ': ' + r.cnt.toLocaleString());
      total += r.cnt;
    } catch(e) {}
  }
  console.log('\n  TOTAL: ' + total.toLocaleString() + ' records');
  console.log('  DB Size: ' + (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1) + ' MB');
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
