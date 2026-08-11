const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const DB_PATH = path.resolve(__dirname, 'osint.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');
db.pragma('cache_size = -64000');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => { f.close(); resolve(); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ============ CREATE TABLES ============
console.log('[*] Creating tables...');
db.exec(`
  CREATE TABLE IF NOT EXISTS police_data (id INTEGER PRIMARY KEY AUTOINCREMENT, pangkat TEXT, nama TEXT, tugas TEXT, hp TEXT, email TEXT, source TEXT DEFAULT 'polri_341k');
  CREATE TABLE IF NOT EXISTS shopee_data (id INTEGER PRIMARY KEY AUTOINCREMENT, tanggal TEXT, amount TEXT, seller_id TEXT, shipping TEXT, tracking_no TEXT, buyer_name TEXT, address TEXT, product TEXT, source TEXT DEFAULT 'shopee');
  CREATE TABLE IF NOT EXISTS indo_store_data (id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT, tanggal_lahir TEXT, email TEXT, telepon TEXT, alamat TEXT, pesanan TEXT, source TEXT DEFAULT 'indo_store');
  CREATE TABLE IF NOT EXISTS bsi_bank_data (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id TEXT, name TEXT, phone TEXT, phone62 TEXT, active_account TEXT, activation_code TEXT, register_by TEXT, email TEXT, source TEXT DEFAULT 'bsi_bank');
  CREATE TABLE IF NOT EXISTS shopping_indo_data (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, first_name TEXT, last_name TEXT, gender TEXT, phone TEXT, active_phone TEXT, address TEXT, location TEXT, hometown TEXT, work TEXT, source TEXT DEFAULT 'shopping_indo');
  CREATE TABLE IF NOT EXISTS sg_shopping_data (id INTEGER PRIMARY KEY AUTOINCREMENT, id_num TEXT, location_id TEXT, name TEXT, address TEXT, address2 TEXT, postal TEXT, home_phone TEXT, mobile TEXT, source TEXT DEFAULT 'sg_shopping');
  CREATE TABLE IF NOT EXISTS kpu_data (id INTEGER PRIMARY KEY AUTOINCREMENT, provinsi TEXT, kabupaten TEXT, kecamatan TEXT, no_kk TEXT, no_nik TEXT, nama TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, usia TEXT, jns_kelamin TEXT, alamat TEXT, source TEXT DEFAULT 'kpu_105m');
  CREATE TABLE IF NOT EXISTS pertamina_data (id INTEGER PRIMARY KEY AUTOINCREMENT, mobile_number TEXT, name TEXT, email TEXT, national_id TEXT, gender TEXT, pob TEXT, dob TEXT, province TEXT, amount TEXT, product TEXT, source TEXT DEFAULT 'mypertamina_45m');
  CREATE TABLE IF NOT EXISTS indihome_browse_data (id INTEGER PRIMARY KEY AUTOINCREMENT, hash_id TEXT, timestamp TEXT, domain TEXT, url TEXT, ip TEXT, city TEXT, name TEXT, nik TEXT, email TEXT, sex TEXT, source TEXT DEFAULT 'indihome_26m');
`);

// ============ STEP 1: Download & Import Police 341K ============
async function importPolice() {
  const existing = db.prepare('SELECT COUNT(*) as c FROM police_data').get().c;
  if (existing > 0) { console.log('[~] Police: already ' + existing.toLocaleString() + ' rows, skip'); return; }

  const zipPath = path.join(__dirname, 'idnpolice.zip');
  const csvPath = path.join(__dirname, 'idnpolice.csv');

  if (!fs.existsSync(csvPath)) {
    console.log('[*] Downloading 341K Police data from netleaks.net...');
    try {
      await download('https://netleaks.net/idnpolice.zip', zipPath);
      console.log('[+] Downloaded idnpolice.zip');
      execSync('unzip -o ' + zipPath + ' -d ' + __dirname, { stdio: 'pipe' });
      console.log('[+] Extracted idnpolice.csv');
    } catch (e) {
      console.log('[!] Failed to download police data: ' + e.message);
      return;
    }
  }

  if (!fs.existsSync(csvPath)) { console.log('[!] idnpolice.csv not found after extract'); return; }

  console.log('[*] Importing 341K Police data...');
  const insert = db.prepare('INSERT INTO police_data (pangkat,nama,tugas,hp,email) VALUES (?,?,?,?,?)');
  const batch = db.transaction(rows => { for (const r of rows) insert.run(...r); });
  let count = 0, rows = [];

  return new Promise(resolve => {
    fs.createReadStream(csvPath).pipe(csv())
      .on('data', r => {
        const n = (r.NAMA || '').trim();
        if (n) { rows.push([(r.PANGKAT||'').trim(), n, (r.TUGAS||'').trim(), (r.HP||'').trim(), (r.EMAIL||'').trim()]); count++; }
        if (rows.length >= 5000) { batch(rows); rows = []; if (count % 50000 === 0) console.log('  ... ' + count); }
      })
      .on('end', () => { if (rows.length) batch(rows); console.log('[+] Police: ' + count + ' rows'); resolve(); })
      .on('error', () => resolve());
  });
}

// ============ STEP 2: Download & Import samples from netleaks.net ============
async function fetchPage(url) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { timeout: 15000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

async function importNetleaksSamples() {
  // KPU
  const kpuExist = db.prepare('SELECT COUNT(*) as c FROM kpu_data').get().c;
  if (kpuExist === 0) {
    console.log('[*] Downloading KPU sample from netleaks.net...');
    const html = await fetchPage('https://netleaks.net/blog/kpu');
    const blocks = html.match(/<code[^>]*>([\s\S]*?)<\/code>/g) || [];
    let kpuRows = [];
    for (const block of blocks) {
      const clean = block.replace(/<[^>]+>/g, '');
      if (clean.includes('id_prov') || clean.includes('no_nik')) {
        const lines = clean.split('\n');
        for (const line of lines) {
          if (line.startsWith('"id_prov') || line.startsWith('id_prov')) continue;
          const parts = []; let cur = '', inQ = false;
          for (const ch of line) {
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          parts.push(cur.trim());
          if (parts.length >= 12 && parts[10]) {
            kpuRows.push([parts[4]||'', parts[5]||'', parts[6]||'', parts[9]||'', parts[10]||'', parts[11]||'', parts[12]||'', parts[13]||'', parts[14]||'', parts[15]||'', parts[16]||'']);
          }
        }
      }
    }
    if (kpuRows.length) {
      const ins = db.prepare('INSERT INTO kpu_data (provinsi,kabupaten,kecamatan,no_kk,no_nik,nama,tempat_lahir,tanggal_lahir,usia,jns_kelamin,alamat) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      db.transaction(rows => { for (const r of rows) ins.run(...r); })(kpuRows);
      console.log('[+] KPU: ' + kpuRows.length + ' rows');
    } else { console.log('[!] KPU: no data parsed'); }
  } else { console.log('[~] KPU: already ' + kpuExist + ' rows'); }

  // MyPertamina
  const pertExist = db.prepare('SELECT COUNT(*) as c FROM pertamina_data').get().c;
  if (pertExist === 0) {
    console.log('[*] Downloading MyPertamina sample from netleaks.net...');
    const html = await fetchPage('https://netleaks.net/blog/mypertamina');
    const csvPath = path.join(__dirname, '_pertamina_temp.csv');
    const blocks = html.match(/<code[^>]*>([\s\S]*?)<\/code>/g) || [];
    for (const block of blocks) {
      const clean = block.replace(/<[^>]+>/g, '');
      if (clean.includes('agentNumber') || clean.includes('mobileNumber')) {
        fs.writeFileSync(csvPath, clean);
        break;
      }
    }
    if (fs.existsSync(csvPath)) {
      const ins = db.prepare('INSERT INTO pertamina_data (mobile_number,name,email,national_id,gender,amount,product) VALUES (?,?,?,?,?,?,?)');
      const batchFn = db.transaction(rows => { for (const r of rows) ins.run(...r); });
      let pCount = 0, pRows = [];
      await new Promise(resolve => {
        fs.createReadStream(csvPath).pipe(csv())
          .on('data', r => {
            if (r.mobileNumber) {
              let name='', email='', nik='', gender='';
              const vals = Object.values(r).join('|');
              try { const m=vals.match(/"name":"([^"]+)"/); if(m)name=m[1]; } catch(e){}
              try { const m=vals.match(/"email":"([^"]+)"/); if(m)email=m[1]; } catch(e){}
              try { const m=vals.match(/"nationalityId":"([^"]+)"/); if(m)nik=m[1]; } catch(e){}
              try { const m=vals.match(/"gender":"([^"]+)"/); if(m)gender=m[1]; } catch(e){}
              pRows.push([r.mobileNumber||'', name, email, nik, gender, r.amount||'', r.items_productName||'']);
              pCount++;
            }
          })
          .on('end', () => { if (pRows.length) batchFn(pRows); resolve(); })
          .on('error', () => resolve());
      });
      fs.unlinkSync(csvPath);
      console.log('[+] MyPertamina: ' + pCount + ' rows');
    } else { console.log('[!] MyPertamina: no data found'); }
  } else { console.log('[~] MyPertamina: already ' + pertExist + ' rows'); }

  // Indihome Browse
  const indExist = db.prepare('SELECT COUNT(*) as c FROM indihome_browse_data').get().c;
  if (indExist === 0) {
    console.log('[*] Downloading Indihome Browse sample from netleaks.net...');
    const html = await fetchPage('https://netleaks.net/blog/indihome');
    const blocks = html.match(/<code[^>]*>([\s\S]*?)<\/code>/g) || [];
    let iCount = 0, iRows = [];
    const ins = db.prepare('INSERT INTO indihome_browse_data (hash_id,timestamp,domain,url,ip,city,name,nik,email,sex) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const block of blocks) {
      const clean = block.replace(/<[^>]+>/g, '');
      if (clean.includes('telkom.net') || clean.includes('"nik"')) {
        const lines = clean.split('\n');
        for (const line of lines) {
          if (line.length < 50) continue;
          let name='', nik='', email='', sex='', city='';
          try { const m=line.match(/""name"":""([^""]+)""/); if(m)name=m[1]; } catch(e){}
          try { const m=line.match(/""nik"":(\d+)/); if(m)nik=m[1]; } catch(e){}
          try { const m=line.match(/""email"":""([^""]+)""/); if(m)email=m[1]; } catch(e){}
          try { const m=line.match(/""sex"":""([^""]+)""/); if(m)sex=m[1]; } catch(e){}
          try { const m=line.match(/""city"":""([^""]+)""/); if(m)city=m[1]; } catch(e){}
          const p = line.split(',');
          iRows.push([p[0]||'', p[1]||'', p[4]||'', p[7]||'', p[9]||'', city, name, nik, email, sex]);
          iCount++;
        }
      }
    }
    if (iRows.length) { db.transaction(rows => { for (const r of rows) ins.run(...r); })(iRows); }
    console.log('[+] Indihome Browse: ' + iCount + ' rows');
  } else { console.log('[~] Indihome Browse: already ' + indExist + ' rows'); }
}

// ============ STEP 3: Import XLSX from osint_data (if exists) ============
function importXlsxFiles() {
  return new Promise(async (resolve) => {
    // Try to find osint_data directory
    const possiblePaths = [
      path.resolve(__dirname, '..', 'osint_data', 'osint_database '),
      path.resolve(__dirname, '..', 'osint_data', 'osint_database'),
      path.resolve(__dirname, 'osint_data', 'osint_database '),
      '/home/Justice/osint_data/osint_database ',
    ];

    let dataDir = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) { dataDir = p; break; }
    }

    if (!dataDir) {
      console.log('[~] osint_data folder not found on VPS, skipping XLSX imports');
      console.log('    (Shopee, Indo Store, BSI Bank, Shopping Indo, SG Shopping)');
      resolve();
      return;
    }

    console.log('[*] Found osint_data at: ' + dataDir);

    const xlsxFiles = [
      { file: '173k shopee (2).xlsx', table: 'shopee_data', label: 'Shopee 173K',
        check: () => db.prepare('SELECT COUNT(*) as c FROM shopee_data').get().c,
        convert: '/tmp/shopee_conv.csv',
        columns: 'tanggal,amount,seller_id,shipping,tracking_no,buyer_name,address,product',
        insertSql: 'INSERT INTO shopee_data (tanggal,amount,seller_id,shipping,tracking_no,buyer_name,address,product) VALUES (?,?,?,?,?,?,?,?)' },
      { file: 'Indonesia Store .xlsx', table: 'indo_store_data', label: 'Indonesia Store 70K',
        check: () => db.prepare('SELECT COUNT(*) as c FROM indo_store_data').get().c,
        convert: '/tmp/indostore_conv.csv',
        columns: 'nama,tanggal_lahir,email,telepon,alamat,pesanan',
        insertSql: 'INSERT INTO indo_store_data (nama,tanggal_lahir,email,telepon,alamat,pesanan) VALUES (?,?,?,?,?,?)' },
      { file: '印度尼西亚Indonesia_www_bankbsi_co_id_银行ID_AppUser_银行储户姓名_银行客户电话_邮箱E.xlsx', table: 'bsi_bank_data', label: 'BSI Bank 510',
        check: () => db.prepare('SELECT COUNT(*) as c FROM bsi_bank_data').get().c,
        convert: '/tmp/bsi_conv.csv',
        columns: 'app_id,name,phone,phone62,active_account,activation_code,register_by,email',
        insertSql: 'INSERT INTO bsi_bank_data (app_id,name,phone,phone62,active_account,activation_code,register_by,email) VALUES (?,?,?,?,?,?,?,?)' },
      { file: '印度尼西亚（Indonesia）_购物Shopping_女_WS已筛选活跃账号_3336条_2.xlsx', table: 'shopping_indo_data', label: 'Shopping Indo 3.3K',
        check: () => db.prepare('SELECT COUNT(*) as c FROM shopping_indo_data').get().c,
        convert: '/tmp/shopindo_conv.csv',
        columns: 'uid,first_name,last_name,gender,phone,active_phone,address,location,hometown,work',
        insertSql: 'INSERT INTO shopping_indo_data (uid,first_name,last_name,gender,phone,active_phone,address,location,hometown,work) VALUES (?,?,?,?,?,?,?,?,?,?)' },
      { file: 'sg shopping .csv', table: 'sg_shopping_data', label: 'SG Shopping',
        check: () => db.prepare('SELECT COUNT(*) as c FROM sg_shopping_data').get().c,
        isCsv: true,
        insertSql: 'INSERT INTO sg_shopping_data (id_num,location_id,name,address,address2,postal,home_phone,mobile) VALUES (?,?,?,?,?,?,?,?)' },
    ];

    for (const f of xlsxFiles) {
      const filePath = path.join(dataDir, f.file);
      if (!fs.existsSync(filePath)) { console.log('[~] ' + f.label + ': file not found, skip'); continue; }
      if (f.check() > 0) { console.log('[~] ' + f.label + ': already imported, skip'); continue; }

      console.log('[*] Importing ' + f.label + '...');

      if (f.isCsv) {
        // Direct CSV import
        const ins = db.prepare(f.insertSql);
        const batchFn = db.transaction(rows => { for (const r of rows) ins.run(...r); });
        let cnt = 0, rows = [];
        await new Promise(resolve2 => {
          fs.createReadStream(filePath).pipe(csv())
            .on('data', r => {
              rows.push([r.id||'', r.locationid||'', r.lastname||'', r.address1||'', r.address2||'', r.postal||'', r.home||'', r.mobile||'']);
              cnt++;
              if (rows.length >= 5000) { batchFn(rows); rows = []; }
            })
            .on('end', () => { if (rows.length) batchFn(rows); console.log('[+] ' + f.label + ': ' + cnt + ' rows'); resolve2(); })
            .on('error', () => resolve2());
        });
      } else {
        // XLSX -> CSV conversion via python
        try {
          execSync(`python3 -c "
import openpyxl, csv
wb = openpyxl.load_workbook('${filePath.replace(/'/g, "\\'")}', read_only=True)
ws = wb.active
with open('${f.convert}', 'w', newline='') as fout:
    writer = csv.writer(fout)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(c) if c is not None else '' for c in row])
wb.close()
"`, { stdio: 'pipe' });

          const ins = db.prepare(f.insertSql);
          const batchFn = db.transaction(rows => { for (const r of rows) ins.run(...r); });
          let cnt = 0, rows = [], first = true;
          await new Promise(resolve2 => {
            fs.createReadStream(f.convert).pipe(csv())
              .on('data', r => {
                if (first) { first = false; return; }
                const v = Object.values(r);
                const numCols = f.columns.split(',').length;
                rows.push(v.slice(0, numCols).map(x => (x || '').substring(0, 500)));
                cnt++;
                if (rows.length >= 5000) { batchFn(rows); rows = []; }
              })
              .on('end', () => { if (rows.length) batchFn(rows); console.log('[+] ' + f.label + ': ' + cnt + ' rows'); resolve2(); })
              .on('error', () => resolve2());
          });
          try { fs.unlinkSync(f.convert); } catch(e) {}
        } catch (e) {
          console.log('[!] ' + f.label + ' failed: ' + e.message);
        }
      }
    }
    resolve();
  });
}

// ============ STEP 3: Download & Import Extra CSV Data ============
async function importExtraCSV() {
  const extraDir = path.join(__dirname, 'extra_data');
  const extraZip = path.join(__dirname, 'extra_data.zip');

  // Check if any extra tables already have data
  let needsDownload = false;
  for (const t of ['shopee_data', 'indo_store_data', 'sg_shopping_data', 'shopping_indo_data', 'bsi_bank_data']) {
    try { if (db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c === 0) needsDownload = true; } catch(e) { needsDownload = true; }
  }

  if (!needsDownload) { console.log('[~] Extra data already imported, skip'); return; }

  // Check if we actually have the CSV files
  const hasCsv = fs.existsSync(path.join(extraDir, 'shopee.csv'));
  
  if (!hasCsv) {
    // Clean up any bad files
    try { fs.unlinkSync(extraZip); } catch(e) {}
    try { fs.rmSync(extraDir, { recursive: true }); } catch(e) {}

    console.log('[*] Downloading extra CSV data (29MB)...');
    try {
      execSync('curl -sL -o ' + extraZip + ' "https://github.com/revanwiralaga7-design/telegram-osint-bot/releases/download/extra-data-v1/extra_data.zip"', { stdio: 'pipe', timeout: 120000 });
      const stat = fs.statSync(extraZip);
      if (stat.size < 1000000) {
        console.log('[!] Downloaded file too small (' + stat.size + ' bytes), likely failed');
        fs.unlinkSync(extraZip);
        return;
      }
      console.log('[+] Downloaded extra_data.zip (' + (stat.size / 1024 / 1024).toFixed(1) + 'MB)');
    } catch (e) {
      console.log('[!] Failed to download extra data: ' + e.message);
      try { fs.unlinkSync(extraZip); } catch(e2) {}
      return;
    }
  }

  // Extract if needed
  if (fs.existsSync(extraZip) && !hasCsv) {
    try {
      fs.mkdirSync(extraDir, { recursive: true });
      execSync('unzip -o ' + extraZip + ' -d ' + extraDir, { stdio: 'pipe' });
      console.log('[+] Extracted extra_data.zip');
    } catch (e) { console.log('[!] Extract failed: ' + e.message); return; }
  }

  if (!fs.existsSync(path.join(extraDir, 'shopee.csv'))) { console.log('[!] CSV files not found after extract'); return; }

  const csvImports = [
    { file: 'shopee.csv', table: 'shopee_data', label: 'Shopee 173K',
      sql: 'INSERT INTO shopee_data (tanggal,amount,seller_id,shipping,tracking_no,buyer_name,address,product) VALUES (?,?,?,?,?,?,?,?)',
      cols: 8 },
    { file: 'indo_store.csv', table: 'indo_store_data', label: 'Indonesia Store 70K',
      sql: 'INSERT INTO indo_store_data (nama,tanggal_lahir,email,telepon,alamat,pesanan) VALUES (?,?,?,?,?,?)',
      cols: 6 },
    { file: 'sg_shopping.csv', table: 'sg_shopping_data', label: 'SG Shopping 103K',
      sql: 'INSERT INTO sg_shopping_data (id_num,location_id,name,address,address2,postal,home_phone,mobile) VALUES (?,?,?,?,?,?,?,?)',
      cols: 8, isSG: true },
    { file: 'shopping_indo.csv', table: 'shopping_indo_data', label: 'Shopping Indo 3.3K',
      sql: 'INSERT INTO shopping_indo_data (uid,first_name,last_name,gender,phone,active_phone,address,location,hometown,work) VALUES (?,?,?,?,?,?,?,?,?,?)',
      cols: 10 },
    { file: 'bsi_bank.csv', table: 'bsi_bank_data', label: 'BSI Bank 510',
      sql: 'INSERT INTO bsi_bank_data (app_id,name,phone,phone62,active_account,activation_code,register_by,email) VALUES (?,?,?,?,?,?,?,?)',
      cols: 8, isBSI: true },
  ];

  for (const imp of csvImports) {
    const fp = path.join(extraDir, imp.file);
    if (!fs.existsSync(fp)) continue;
    try { if (db.prepare('SELECT COUNT(*) as c FROM ' + imp.table).get().c > 0) { console.log('[~] ' + imp.label + ': already imported'); continue; } } catch(e) {}

    console.log('[*] Importing ' + imp.label + '...');
    const ins = db.prepare(imp.sql);
    const batchFn = db.transaction(rows => { for (const r of rows) ins.run(...r); });
    let cnt = 0, rows = [], first = true;

    await new Promise(resolve => {
      fs.createReadStream(fp).pipe(csv())
        .on('data', r => {
          if (first) { first = false; return; }
          const v = Object.values(r);
          let mapped;
          if (imp.isSG) {
            mapped = [r.id||'', r.locationid||'', r.lastname||'', r.address1||'', r.address2||'', r.postal||'', r.home||'', r.mobile||''];
          } else if (imp.isBSI) {
            mapped = [v[0]||'', v[4]||'', v[5]||'', v[6]||'', v[7]||'', v[8]||'', v[9]||'', v[10]||''];
          } else {
            mapped = v.slice(0, imp.cols).map(x => (x || '').substring(0, 500));
          }
          rows.push(mapped);
          cnt++;
          if (rows.length >= 5000) { batchFn(rows); rows = []; if (cnt % 50000 === 0) console.log('  ... ' + cnt); }
        })
        .on('end', () => { if (rows.length) batchFn(rows); console.log('[+] ' + imp.label + ': ' + cnt + ' rows'); resolve(); })
        .on('error', () => resolve());
    });
  }
}

// ============ MAIN ============
async function main() {
  console.log('=== OSINT Bot - Master Data Importer ===\n');

  await importPolice();
  await importNetleaksSamples();
  await importXlsxFiles();
  await importExtraCSV();

  // Create indexes
  console.log('\n[*] Creating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_police_nama ON police_data(nama);
    CREATE INDEX IF NOT EXISTS idx_police_hp ON police_data(hp);
    CREATE INDEX IF NOT EXISTS idx_police_email ON police_data(email);
    CREATE INDEX IF NOT EXISTS idx_police_tugas ON police_data(tugas);
    CREATE INDEX IF NOT EXISTS idx_kpu_nik ON kpu_data(no_nik);
    CREATE INDEX IF NOT EXISTS idx_kpu_nama ON kpu_data(nama);
    CREATE INDEX IF NOT EXISTS idx_pert_mobile ON pertamina_data(mobile_number);
    CREATE INDEX IF NOT EXISTS idx_pert_name ON pertamina_data(name);
    CREATE INDEX IF NOT EXISTS idx_indb_name ON indihome_browse_data(name);
    CREATE INDEX IF NOT EXISTS idx_indb_nik ON indihome_browse_data(nik);
    CREATE INDEX IF NOT EXISTS idx_shopee_buyer ON shopee_data(buyer_name);
    CREATE INDEX IF NOT EXISTS idx_indostore_nama ON indo_store_data(nama);
    CREATE INDEX IF NOT EXISTS idx_indostore_email ON indo_store_data(email);
    CREATE INDEX IF NOT EXISTS idx_bsi_name ON bsi_bank_data(name);
    CREATE INDEX IF NOT EXISTS idx_bsi_phone ON bsi_bank_data(phone);
    CREATE INDEX IF NOT EXISTS idx_shopindo_phone ON shopping_indo_data(phone);
    CREATE INDEX IF NOT EXISTS idx_sgshop_mobile ON sg_shopping_data(mobile);
  `);

  // Final stats
  console.log('\n=== FINAL DATABASE STATS ===\n');
  const tables = [
    ['phone_registry','Phone Registry (NIK+Nomor)'],['police_data','🆕 Data POLRI (Pangkat+HP)'],
    ['vehicle_data','Data Kendaraan (NIK+Plat)'],['government_letters','Surat Pemerintah (NIP)'],
    ['bukalapak_data','Bukalapak Users'],['sim_data','Data SIM'],
    ['visa_card_data','Visa/Mastercard'],['member_data','Data Anggota'],
    ['shopee_data','🆕 Shopee'],['indo_store_data','🆕 Indonesia Store'],
    ['sg_shopping_data','🆕 SG Shopping'],['shopping_indo_data','🆕 Shopping Indo'],
    ['bsi_bank_data','🆕 BSI Bank'],['kpu_data','🆕 KPU (sample)'],
    ['pertamina_data','🆕 MyPertamina (sample)'],['indihome_browse_data','🆕 Indihome Browse (sample)'],
    ['indihome_data','IndiHome'],['citizen_data','SIAK/Dukcapil']
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
  console.log('\n[+] DONE!');
}

main().catch(e => { console.error(e); process.exit(1); });
