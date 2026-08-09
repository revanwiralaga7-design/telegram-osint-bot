const Database = require('better-sqlite3');
const fs = require('fs');
const csv = require('csv-parser');

const db = new Database('osint.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');

db.exec(`
  CREATE TABLE IF NOT EXISTS kpu_data (id INTEGER PRIMARY KEY AUTOINCREMENT, provinsi TEXT, kabupaten TEXT, kecamatan TEXT, kelurahan TEXT, no_kk TEXT, no_nik TEXT, nama TEXT, tempat_lahir TEXT, tanggal_lahir TEXT, usia TEXT, jns_kelamin TEXT, alamat TEXT, source TEXT DEFAULT 'kpu_105m');
  CREATE TABLE IF NOT EXISTS pertamina_data (id INTEGER PRIMARY KEY AUTOINCREMENT, mobile_number TEXT, name TEXT, email TEXT, national_id TEXT, gender TEXT, pob TEXT, dob TEXT, province TEXT, amount TEXT, product TEXT, source TEXT DEFAULT 'mypertamina_45m');
  CREATE TABLE IF NOT EXISTS indihome_browse_data (id INTEGER PRIMARY KEY AUTOINCREMENT, hash_id TEXT, timestamp TEXT, domain TEXT, url TEXT, ip TEXT, city TEXT, name TEXT, nik TEXT, email TEXT, sex TEXT, source TEXT DEFAULT 'indihome_26m');
`);

// === KPU ===
console.log('[*] Importing KPU (105M DB sample)...');
let kpuC = 0, kpuR = [];
const kpuI = db.prepare('INSERT INTO kpu_data (provinsi,kabupaten,kecamatan,kelurahan,no_kk,no_nik,nama,tempat_lahir,tanggal_lahir,usia,jns_kelamin,alamat) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const kpuB = db.transaction(r => { for (const x of r) kpuI.run(...x); });

fs.createReadStream('/home/user/kpu_sample.csv')
  .pipe(csv())
  .on('data', r => {
    if (r.no_nik || r.nama) {
      kpuR.push([(r.provinsi||'').trim(),(r.kabupaten||'').trim(),(r.kecamatan||'').trim(),(r.kelurahan||'').trim(),(r.no_kk||'').trim(),(r.no_nik||'').trim(),(r.nama||'').trim(),(r.tempat_lahir||'').trim(),(r.tanggal_lahir||'').trim(),(r.usia||'').trim(),(r.jns_kelamin||'').trim(),(r.alamat||'').trim()]);
      kpuC++;
    }
  })
  .on('end', () => { if(kpuR.length) kpuB(kpuR); console.log('[+] KPU: '+kpuC+' rows'); importPertamina(); })
  .on('error', () => { importPertamina(); });

// === PERTAMINA ===
function importPertamina() {
  console.log('[*] Importing MyPertamina (45M DB sample)...');
  let pC = 0, pR = [];
  const pI = db.prepare('INSERT INTO pertamina_data (mobile_number,name,email,national_id,gender,pob,dob,province,amount,product) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const pB = db.transaction(r => { for (const x of r) pI.run(...x); });
  
  fs.createReadStream('/home/user/pertamina_sample.csv')
    .pipe(csv())
    .on('data', r => {
      if (r.mobileNumber) {
        let name='',email='',nik='',gender='',pob='',dob='',province='';
        const vals = Object.values(r).join('|');
        try {
          const nm=vals.match(/"name":"([^"]+)"/);if(nm)name=nm[1];
          const em=vals.match(/"email":"([^"]+)"/);if(em)email=em[1];
          const nk=vals.match(/"nationalityId":"([^"]+)"/);if(nk)nik=nk[1];
          const gn=vals.match(/"gender":"([^"]+)"/);if(gn)gender=gn[1];
          const pb=vals.match(/"pob":"([^"]+)"/);if(pb)pob=pb[1];
          const db2=vals.match(/"dob":"([^"]+)"/);if(db2)dob=db2[1];
          const pv=vals.match(/"province":"([^"]+)"/);if(pv)province=pv[1];
        } catch(e){}
        pR.push([r.mobileNumber||'',name,email,nik,gender,pob,dob,province,r.amount||'',r.items_productName||'']);
        pC++;
      }
    })
    .on('end', () => { if(pR.length) pB(pR); console.log('[+] Pertamina: '+pC+' rows'); importIndiBrowse(); })
    .on('error', () => { importIndiBrowse(); });
}

// === INDIHOME BROWSE ===
function importIndiBrowse() {
  console.log('[*] Importing Indihome Browse (26M DB sample)...');
  let iC = 0, iR = [];
  const iI = db.prepare('INSERT INTO indihome_browse_data (hash_id,timestamp,domain,url,ip,city,name,nik,email,sex) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const iB = db.transaction(r => { for (const x of r) iI.run(...x); });
  
  const lines = fs.readFileSync('/home/user/indihome_sample.csv','utf-8').split('\n');
  for (const line of lines) {
    if (!line.trim() || line.length < 50) continue;
    let name='',nik='',email='',sex='',city='';
    try {
      const nm=line.match(/""name"":""([^""]+)""/);if(nm)name=nm[1];
      const nk=line.match(/""nik"":(\d+)/);if(nk)nik=nk[1];
      const em=line.match(/""email"":""([^""]+)""/);if(em)email=em[1];
      const sx=line.match(/""sex"":""([^""]+)""/);if(sx)sex=sx[1];
      const ct=line.match(/""city"":""([^""]+)""/);if(ct)city=ct[1];
    } catch(e){}
    const p=line.split(',');
    iR.push([p[0]||'',p[1]||'',p[4]||'',p[7]||'',p[9]||'',city,name,nik,email,sex]);
    iC++;
  }
  if (iR.length) iB(iR);
  console.log('[+] Indihome Browse: '+iC+' rows');
  
  finish();
}

function finish() {
  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kpu_nik ON kpu_data(no_nik);
    CREATE INDEX IF NOT EXISTS idx_kpu_nama ON kpu_data(nama);
    CREATE INDEX IF NOT EXISTS idx_kpu_kk ON kpu_data(no_kk);
    CREATE INDEX IF NOT EXISTS idx_pert_mobile ON pertamina_data(mobile_number);
    CREATE INDEX IF NOT EXISTS idx_pert_name ON pertamina_data(name);
    CREATE INDEX IF NOT EXISTS idx_pert_email ON pertamina_data(email);
    CREATE INDEX IF NOT EXISTS idx_indb_name ON indihome_browse_data(name);
    CREATE INDEX IF NOT EXISTS idx_indb_nik ON indihome_browse_data(nik);
  `);

  // Stats
  console.log('\n=== COMPLETE DATABASE STATS ===\n');
  const tables = [
    ['police_data','🆕 Data POLRI (Pangkat+Nama+HP)'],['phone_registry','Phone Registry (NIK+Nomor)'],
    ['sim_data','Data SIM (500K)'],['vehicle_data','Data Kendaraan (NIK+Plat)'],
    ['government_letters','Surat Pemerintah (NIP)'],['bukalapak_data','Bukalapak Users'],
    ['visa_card_data','Visa/Mastercard (210K)'],['member_data','Data Anggota (148K)'],
    ['kpu_data','🆕 KPU - Pemilih (105M DB)'],['pertamina_data','🆕 MyPertamina (45M DB)'],
    ['indihome_browse_data','🆕 Indihome Browse (26M DB)'],
    ['shopee_data','🆕 Shopee (173K)'],['indo_store_data','🆕 Indonesia Store (70K)'],
    ['sg_shopping_data','🆕 SG Shopping (103K)'],['shopping_indo_data','🆕 Shopping Indo (3.3K)'],
    ['bsi_bank_data','🆕 BSI Bank (510)'],['indihome_data','IndiHome (10K)'],
    ['citizen_data','SIAK/Dukcapil (1K)']
  ];
  let total = 0;
  for (const [t,label] of tables) {
    try {
      const r = db.prepare('SELECT COUNT(*) as cnt FROM '+t).get();
      if (r.cnt > 0) { console.log('  ✓ '+label+': '+r.cnt.toLocaleString()); total += r.cnt; }
    } catch(e) {}
  }
  console.log('\n  💾 TOTAL: '+total.toLocaleString()+' records');
  console.log('  📦 DB Size: '+(fs.statSync('osint.db').size/1024/1024).toFixed(1)+' MB');
  db.close();
  console.log('\n[+] DONE!');
}
