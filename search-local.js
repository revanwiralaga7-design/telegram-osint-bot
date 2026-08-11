// Local OSINT Search - No API needed
// Run directly: node search-local.js phone 081234567890

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'osint.db');
const db = new Database(DB_PATH, { readonly: true });
db.pragma('cache_size = -32000');

const MAX_RESULTS = 10;

function searchPhone(phone) {
  const p = phone.replace(/[^0-9]/g, '');
  const results = [];
  try { const rows = db.prepare('SELECT * FROM phone_registry WHERE phone LIKE ? LIMIT ?').all('%'+p+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'Phone Registry', nik: r.nik, phone: r.phone, provider: r.provider, date: r.date }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM member_data WHERE phone_number LIKE ? LIMIT ?').all('%'+p+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'Data Anggota', nama: r.nama_lengkap, phone: r.phone_number, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir, alamat: r.alamat, fakultas: r.fakultas }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM indihome_data WHERE mobile LIKE ? LIMIT ?').all('%'+p+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'IndiHome', email: r.email, mobile: r.mobile, indihomenum: r.indihomenum, source_ip: r.source_ip }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM police_data WHERE hp LIKE ? LIMIT ?').all('%'+p+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'POLRI', pangkat: r.pangkat, nama: r.nama, tugas: r.tugas, hp: r.hp, email: r.email }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM ms_contacts WHERE phone LIKE ? LIMIT ?').all('%'+p+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'MS Contacts', name: r.name, phone: r.phone, email: r.email, company: r.company }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM ms_users WHERE phone LIKE ? LIMIT ?').all('%'+p+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'MS Users', name: r.name, phone: r.phone, email: r.email, department: r.department }); } catch(e) {}
  return results;
}

function searchNIK(nik) {
  const n = nik.replace(/[^0-9]/g, '');
  const results = [];
  try { const rows = db.prepare('SELECT * FROM phone_registry WHERE nik LIKE ? LIMIT ?').all('%'+n+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'Phone Registry', nik: r.nik, phone: r.phone, provider: r.provider }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM citizen_data WHERE nik LIKE ? LIMIT ?').all('%'+n+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'SIAK', nik: r.nik, nama: r.nama, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir, no_kk: r.no_kk }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM vehicle_data WHERE nik LIKE ? LIMIT ?').all('%'+n+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'Kendaraan', nik: r.nik, nama: r.name, plat_nomor: r.plate_number, merk: r.brand, warna: r.color, tahun: r.year }); } catch(e) {}
  return results;
}

function searchName(name) {
  const upper = name.toUpperCase();
  const results = [];
  try { const rows = db.prepare('SELECT * FROM citizen_data WHERE nama LIKE ? LIMIT ?').all('%'+upper+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'SIAK', nik: r.nik, nama: r.nama, tempat_lahir: r.tempat_lahir, tanggal_lahir: r.tanggal_lahir }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM police_data WHERE nama LIKE ? LIMIT ?').all('%'+upper+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'POLRI', pangkat: r.pangkat, nama: r.nama, tugas: r.tugas, hp: r.hp, email: r.email }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM ms_contacts WHERE name LIKE ? LIMIT ?').all('%'+upper+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'MS Contacts', name: r.name, email: r.email, phone: r.phone, company: r.company }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM ms_users WHERE name LIKE ? LIMIT ?').all('%'+upper+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'MS Users', name: r.name, email: r.email, username: r.username, department: r.department }); } catch(e) {}
  return results;
}

function searchEmail(email) {
  const results = [];
  try { const rows = db.prepare('SELECT * FROM bukalapak_data WHERE email LIKE ? LIMIT ?').all('%'+email+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'Bukalapak', username: r.username, email: r.email, phone: r.phone }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM ms_contacts WHERE email LIKE ? LIMIT ?').all('%'+email+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'MS Contacts', name: r.name, email: r.email, phone: r.phone, company: r.company }); } catch(e) {}
  try { const rows = db.prepare('SELECT * FROM ms_users WHERE email LIKE ? LIMIT ?').all('%'+email+'%', MAX_RESULTS); for (const r of rows) results.push({ source: 'MS Users', name: r.name, email: r.email, username: r.username, department: r.department }); } catch(e) {}
  return results;
}

// CLI interface
const args = process.argv.slice(2);
const type = args[0];
const query = args[1];

if (!type || !query) {
  console.log('Usage: node search-local.js <type> <query>');
  console.log('');
  console.log('Types:');
  console.log('  phone  - Search by phone number');
  console.log('  nik    - Search by NIK');
  console.log('  name   - Search by name');
  console.log('  email  - Search by email');
  console.log('');
  console.log('Examples:');
  console.log('  node search-local.js phone 081234567890');
  console.log('  node search-local.js nik 3175070604891001');
  console.log('  node search-local.js name "Budi Santoso"');
  console.log('  node search-local.js email user@example.com');
  process.exit(1);
}

console.log(`\n🔍 Searching ${type}: ${query}\n`);

let results = [];
switch(type) {
  case 'phone': results = searchPhone(query); break;
  case 'nik': results = searchNIK(query); break;
  case 'name': results = searchName(query); break;
  case 'email': results = searchEmail(query); break;
  default: console.log('❌ Unknown type:', type); process.exit(1);
}

if (results.length === 0) {
  console.log('❌ No results found\n');
} else {
  console.log(`✅ Found ${results.length} results\n`);
  results.forEach((r, i) => {
    console.log(`━━━ Result ${i + 1} ━━━`);
    console.log(`📁 Source: ${r.source}`);
    Object.entries(r).forEach(([key, value]) => {
      if (key === 'source') return;
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      console.log(`📌 ${label}: ${value}`);
    });
    console.log('');
  });
}

db.close();
