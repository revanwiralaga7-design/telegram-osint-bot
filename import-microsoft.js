const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'osint.db');
const BASE_DIR = path.resolve(__dirname, 'microsoft_exfilsquad');
const BATCH_SIZE = 100;

const TABLE_DEFS = {
  ms_contacts: `CREATE TABLE IF NOT EXISTS ms_contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, name TEXT, phone TEXT, company TEXT, title TEXT, city TEXT, country TEXT, department TEXT, address TEXT, source TEXT)`,
  ms_leads: `CREATE TABLE IF NOT EXISTS ms_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, name TEXT, phone TEXT, company TEXT, title TEXT, city TEXT, country TEXT, industry TEXT, address TEXT, source TEXT)`,
  ms_users: `CREATE TABLE IF NOT EXISTS ms_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, name TEXT, username TEXT, phone TEXT, department TEXT, title TEXT, domain TEXT, source TEXT)`,
  ms_incidents: `CREATE TABLE IF NOT EXISTS ms_incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, email TEXT, contact TEXT, priority TEXT, status TEXT, category TEXT, created TEXT, source TEXT)`,
  ms_credentials: `CREATE TABLE IF NOT EXISTS ms_credentials (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, username TEXT, password_hash TEXT, name TEXT, domain TEXT, source TEXT)`,
};

const FIELDS = {
  ms_contacts: ['email','name','phone','company','title','city','country','department','address'],
  ms_leads: ['email','name','phone','company','title','city','country','industry','address'],
  ms_users: ['email','name','username','phone','department','title','domain'],
  ms_incidents: ['title','description','email','contact','priority','status','category','created'],
  ms_credentials: ['email','username','password_hash','name','domain'],
};

const FM = {
  email:['emailaddress1','emailaddress2','emailaddress3','email','internalemailaddress','primaryemail','emailaddr','workemail'],
  name:['fullname','full_name','name','displayname','contact_name','accountname','employee_name'],
  phone:['telephone1','telephone2','mobilephone','phone','phonenumber','mobile','businessphone','telephone'],
  company:['companyname','company','parentcustomeridname','organizationname','account_name','parentcustomerid'],
  title:['jobtitle','title','position','role','jobfunction','worktitle'],
  city:['address1_city','city','address_city','shipcity'],
  country:['address1_country','country','countryname','address1_countryname'],
  department:['department','departmentname','dept','division','businessunit'],
  address:['address1_composite','address','street','address1_line1','full_address'],
  username:['domainname','username','user_name','loginname','samaccountname','userprincipalname'],
  domain:['domain','emaildomain'],
  password_hash:['passwordhash','hash','credentialhash','hashedpassword','encryptedpassword'],
  industry:['industrycode','industry','industryname'],
  description:['description','details','summary','notes','body'],
  priority:['prioritycode','priority','urgency'],
  status:['statuscode','status','incidentstage'],
  category:['category','subject','incidenttype'],
  created:['createdon','created_at','opendate'],
  contact:['contact_name','customeridname','reportcontactidname'],
};

function resolve(obj, field) {
  const keys = FM[field] || [field];
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') {
      return (typeof v === 'object' ? JSON.stringify(v) : String(v)).substring(0, 200);
    }
  }
  return '';
}

function detectTable(fp) {
  const l = fp.toLowerCase();
  if (l.includes('contact')) return 'ms_contacts';
  if (l.includes('lead')) return 'ms_leads';
  if (l.includes('user')) return 'ms_users';
  if (l.includes('incident') || l.includes('ticket')) return 'ms_incidents';
  if (l.includes('credential') || l.includes('password') || l.includes('auth')) return 'ms_credentials';
  return 'ms_contacts';
}

function findFiles(dir) {
  const r = [];
  if (!fs.existsSync(dir)) return r;
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...findFiles(f));
    else if (e.name.endsWith('.jsonl') || e.name.endsWith('.json')) r.push(f);
  }
  return r;
}

// Manual streaming - no readline, no buffering whole lines
function streamJSONL(filePath, onLine) {
  return new Promise((resolve, reject) => {
    const CHUNK = 32 * 1024; // 32KB chunks
    let buffer = '';
    let bytesRead = 0;
    const fileSize = fs.statSync(filePath).size;
    
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK, encoding: 'utf-8' });
    
    stream.on('data', (chunk) => {
      buffer += chunk;
      bytesRead += chunk.length;
      
      // Process complete lines
      let nlIndex;
      while ((nlIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, nlIndex).trim();
        buffer = buffer.substring(nlIndex + 1);
        if (line) onLine(line, bytesRead, fileSize);
      }
    });
    
    stream.on('end', () => {
      if (buffer.trim()) onLine(buffer.trim(), fileSize, fileSize);
      resolve();
    });
    
    stream.on('error', reject);
  });
}

async function importOneFile(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  
  const table = detectTable(filePath);
  const fields = FIELDS[table];
  const src = path.relative(BASE_DIR, filePath).replace(/\//g, '_');
  const rel = path.relative(BASE_DIR, filePath);
  const fsize = fs.statSync(filePath).size;
  const sizeStr = fsize > 1e9 ? (fsize/1e9).toFixed(1)+'GB' : (fsize/1e6).toFixed(0)+'MB';
  
  console.log(`\n[*] ${rel} (${sizeStr}) → ${table}`);
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -2000'); // 2MB only!
  db.pragma('temp_store = FILE');
  db.exec(TABLE_DEFS[table]);
  
  const cols = [...fields, 'source'];
  const ph = cols.map(() => '?').join(',');
  const ins = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})`);
  let batch = [];
  const flush = db.transaction((rows) => { for (const r of rows) ins.run(...r); });
  
  let count = 0, lastPct = -10;
  
  await streamJSONL(filePath, (line, read, total) => {
    const pct = Math.floor((read / total) * 100);
    if (pct >= lastPct + 5) {
      process.stdout.write(`\r  ${pct}% (${count.toLocaleString()} rows)  `);
      lastPct = pct;
    }
    
    try {
      const obj = JSON.parse(line);
      const row = fields.map(f => resolve(obj, f));
      if (row.every(v => v === '')) return;
      row.push(src);
      batch.push(row);
      count++;
      
      if (batch.length >= BATCH_SIZE) {
        flush(batch);
        batch.length = 0; // Clear array without reallocating
      }
    } catch(e) {}
  });
  
  if (batch.length > 0) { flush(batch); batch.length = 0; }
  
  process.stdout.write('\r');
  console.log(`  ✓ ${count.toLocaleString()} rows`);
  db.close();
  return count;
}

async function main() {
  console.log('=== Microsoft Import (Ultra Low Memory) ===');
  console.log('cache=2MB, batch=100, stream=32KB, no readline\n');
  
  const files = findFiles(BASE_DIR).map(f => ({p:f, s:fs.statSync(f).size}))
    .sort((a,b) => a.s - b.s);
  
  if (!files.length) { console.log('❌ No files found in ' + BASE_DIR); return; }
  
  console.log(`Found ${files.length} files:`);
  for (const f of files) {
    const s = f.s > 1e9 ? (f.s/1e9).toFixed(1)+'GB' : (f.s/1e6).toFixed(0)+'MB';
    console.log(`  [${s.padStart(6)}] ${path.relative(BASE_DIR, f.p)}`);
  }
  
  let total = 0;
  for (const f of files) total += await importOneFile(f.p);
  
  console.log('\n[*] Creating indexes...');
  const db = new Database(DB_PATH);
  db.pragma('cache_size = -2000');
  for (const idx of [
    'CREATE INDEX IF NOT EXISTS idx_msc_email ON ms_contacts(email)',
    'CREATE INDEX IF NOT EXISTS idx_msc_name ON ms_contacts(name)',
    'CREATE INDEX IF NOT EXISTS idx_msc_phone ON ms_contacts(phone)',
    'CREATE INDEX IF NOT EXISTS idx_msl_email ON ms_leads(email)',
    'CREATE INDEX IF NOT EXISTS idx_msl_name ON ms_leads(name)',
    'CREATE INDEX IF NOT EXISTS idx_msl_phone ON ms_leads(phone)',
    'CREATE INDEX IF NOT EXISTS idx_msu_email ON ms_users(email)',
    'CREATE INDEX IF NOT EXISTS idx_msu_name ON ms_users(name)',
    'CREATE INDEX IF NOT EXISTS idx_msu_username ON ms_users(username)',
    'CREATE INDEX IF NOT EXISTS idx_msi_email ON ms_incidents(email)',
    'CREATE INDEX IF NOT EXISTS idx_mscr_email ON ms_credentials(email)',
  ]) { try { db.exec(idx); } catch(e) {} }
  db.close();
  
  console.log(`\n=== DONE: ${total.toLocaleString()} rows ===`);
  console.log(`DB: ${(fs.statSync(DB_PATH).size/1024/1024).toFixed(1)} MB`);
}

main().catch(e => { console.error(e); process.exit(1); });
