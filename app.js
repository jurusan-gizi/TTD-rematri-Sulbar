/* TTD Rematri Sulbar — PWA petugas gizi puskesmas
 * Developed: Manjilala, S.Gz., M.Gizi
 * Database: Google Sheet via Apps Script (lihat apps-script/Code.gs)
 * Offline-first: semua perubahan disimpan di HP (IndexedDB) lalu dikirim saat online.
 */
'use strict';

/* ============================ UTIL ============================ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();
const ROMAWI = ['I', 'II', 'III', 'IV', 'V'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const blnLabel = b => { const [y, m] = b.split('-'); return NAMA_BULAN[+m - 1] + ' ' + y; };
const blnPendek = b => { const [y, m] = b.split('-'); return NAMA_BULAN[+m - 1].slice(0, 3) + ' ' + y.slice(2); };
const blnNama = b => NAMA_BULAN[+b.split('-')[1] - 1];
const ROLE_LABEL = { prov: 'Admin Provinsi', kab: 'Admin Kabupaten/Kota', pkm: 'Petugas Gizi Puskesmas' };
const JENJANG = ['SMP', 'MTs', 'SMA', 'SMK', 'MA', 'SLB', 'Lainnya'];
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
const byNama = (a, b) => String(a.nama).localeCompare(String(b.nama), 'id', { numeric: true });
const fmtWaktu = iso => { if (!iso) return '-'; const d = new Date(iso); return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); };

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 4500 : 2600);
}

const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.5 3.3-5.5 6.5-5.5s5.8 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.5.2 4 1.8 4.5 4.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v4h16v-4"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 21v-5h-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  hosp: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 7v6M9 10h6M9 21v-4h6v4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ============================ STORAGE (IndexedDB) ============================ */
const idb = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('ttd-rematri-sulbar', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    const db = await this.open();
    return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  },
  async set(k, v) {
    const db = await this.open();
    return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  },
  async del(k) {
    const db = await this.open();
    return new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); });
  }
};

/* ============================ LOGIKA HITUNG (sama dengan Code.gs) ============================ */
function bulanTA(ta) {
  const y = parseInt(String(ta).slice(0, 4), 10), out = [];
  for (let i = 0; i < 12; i++) {
    let m = 7 + i, yy = y;
    if (m > 12) { m -= 12; yy = y + 1; }
    out.push(yy + '-' + (m < 10 ? '0' : '') + m);
  }
  return out;
}
function kalenderMap(rows, ta) {
  const map = {};
  bulanTA(ta).forEach(b => { map[b] = { aktif: true, minggu: 4, libur: [] }; });
  (rows || []).forEach(r => {
    if (r.ta !== ta || !map[r.bulan]) return;
    map[r.bulan] = {
      aktif: r.aktif === '1' || r.aktif === true,
      minggu: String(r.minggu) === '5' ? 5 : 4,
      libur: String(r.libur || '').split(',').filter(String).map(Number)
    };
  });
  return map;
}
function hitungSiswi(ttdPerBulan, bulanAktif, kal) {
  let dk = 0, mk = 0;
  const out = {};
  bulanAktif.forEach(b => {
    const k = kal[b], t = ttdPerBulan[b] || {};
    let d = 0, m = 0, adaMinggu = 0, strip = 0;
    for (let w = 1; w <= k.minggu; w++) {
      if (k.libur.indexOf(w) >= 0) continue;
      adaMinggu++;
      const c = String(t['w' + w] || '');
      if (c === '1') { d++; m++; } else if (c === '0') { d++; } else if (c === '-') { strip++; }
    }
    dk += d; mk += m;
    out[b] = { d, dk, m, mk, terdaftar: !(adaMinggu > 0 && strip === adaMinggu) };
  });
  return out;
}
function rekapKosong(bulan) { const r = {}; bulan.forEach(b => { r[b] = { j: 0, dl: 0, dg: 0, ml: 0, mg: 0 }; }); return r; }
function tambahRekap(rekap, hs) {
  Object.keys(rekap).forEach(b => {
    const h = hs[b];
    if (!h || !h.terdaftar) return;
    const r = rekap[b];
    r.j++;
    if (h.dk >= 26) r.dg++; else r.dl++;
    if (h.mk >= 26) r.mg++; else r.ml++;
  });
}
function gabungRekap(target, src) {
  Object.keys(target).forEach(b => { const s = src[b]; if (!s) return; ['j', 'dl', 'dg', 'ml', 'mg'].forEach(k => { target[b][k] += s[k]; }); });
  return target;
}
function tingkatDari(nama) {
  const s = String(nama || '');
  const m = s.match(/(^|[^\d])(1[0-2]|[7-9])(?=[^\d]|$)/);
  if (m) return m[2];
  const r = s.toUpperCase().match(/\b(XII|XI|X|IX|VIII|VII)\b/);
  return r ? String({ VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 }[r[1]]) : '';
}

/* ============================ STATE ============================ */
const TABLES = ['Desa', 'Sekolah', 'Kelas', 'Siswi', 'TTD'];
const S = {
  token: '', user: null, kab: [], pkm: [], taAktif: '', kalender: [], pkmId: '',
  db: emptyDb(), queue: {}, lastSync: '', dataKey: '',
  syncing: false, online: navigator.onLine, ver: 0, ui: {}, wil: null, users: null
};
function emptyDb() { const d = {}; TABLES.forEach(t => { d[t] = {}; }); return d; }

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    idb.set('state', {
      token: S.token, user: S.user, kab: S.kab, pkm: S.pkm, taAktif: S.taAktif, kalender: S.kalender, pkmId: S.pkmId,
      db: S.db, queue: S.queue, lastSync: S.lastSync, dataKey: S.dataKey, ui: S.ui
    }).catch(e => console.error(e));
  }, 250);
}
async function loadState() {
  const st = await idb.get('state');
  if (st) Object.assign(S, st, { syncing: false, online: navigator.onLine });
  if (!S.db) S.db = emptyDb();
  TABLES.forEach(t => { S.db[t] = S.db[t] || {}; });
  S.ui = S.ui || {};
}
const isPkm = () => S.user && S.user.role === 'pkm';
const isProv = () => S.user && S.user.role === 'prov';
const pendingCount = () => Object.keys(S.queue).length;

/* -------- data getters -------- */
const live = t => Object.values(S.db[t]).filter(r => r.del !== '1');
const desaList = () => live('Desa').sort(byNama);
const sekolahList = desaId => live('Sekolah').filter(s => !desaId || s.desaId === desaId).sort(byNama);
const kelasList = sekolahId => live('Kelas').filter(k => k.ta === S.taAktif && (!sekolahId || k.sekolahId === sekolahId)).sort(byNama);
const siswiList = kelasId => live('Siswi').filter(s => s.ta === S.taAktif && (!kelasId || s.kelasId === kelasId)).sort(byNama);
const getRow = (t, id) => S.db[t][id];
const namaPkm = id => (S.pkm.find(p => p.id === id) || {}).nama || '-';
const namaKab = id => (S.kab.find(k => k.id === id) || {}).nama || '-';
const kalNow = () => kalenderMap(S.kalender, S.taAktif);
const bulanAktif = () => { const k = kalNow(); return bulanTA(S.taAktif).filter(b => k[b].aktif); };
function bulanBerjalan() {
  const list = bulanAktif();
  if (!list.length) return '';
  const d = new Date();
  const cur = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (list.indexOf(cur) >= 0) return cur;
  const lewat = list.filter(b => b <= cur);
  return lewat.length ? lewat[lewat.length - 1] : list[0];
}

let hitCache = { ver: -1 };
function hitungSemua() {
  if (hitCache.ver === S.ver && hitCache.ta === S.taAktif && hitCache.kalKey === JSON.stringify(S.kalender)) return hitCache;
  const kal = kalNow(), bulan = bulanAktif();
  const ttdBy = {};
  Object.values(S.db.TTD).forEach(t => { if (t.ta === S.taAktif) (ttdBy[t.siswiId] = ttdBy[t.siswiId] || {})[t.bulan] = t; });
  const hs = {};
  siswiList().forEach(s => { hs[s.id] = hitungSiswi(ttdBy[s.id] || {}, bulan, kal); });
  hitCache = { ver: S.ver, ta: S.taAktif, kalKey: JSON.stringify(S.kalender), kal, bulan, hs, ttdBy };
  return hitCache;
}
function rekapSiswi(list) {
  const h = hitungSemua();
  const r = rekapKosong(h.bulan);
  list.forEach(s => { if (h.hs[s.id]) tambahRekap(r, h.hs[s.id]); });
  return r;
}
const rekapKelas = kelasId => rekapSiswi(siswiList(kelasId));
const rekapSekolah = sekolahId => { const ids = new Set(kelasList(sekolahId).map(k => k.id)); return rekapSiswi(siswiList().filter(s => ids.has(s.kelasId))); };
const rekapDesa = desaId => { const sids = new Set(sekolahList(desaId).map(s => s.id)); const kids = new Set(kelasList().filter(k => sids.has(k.sekolahId)).map(k => k.id)); return rekapSiswi(siswiList().filter(s => kids.has(s.kelasId))); };

/* -------- perubahan data lokal -------- */
function simpanLokal(t, row) {
  row.updatedAt = nowIso();
  row.pkmId = S.user.pkmId;
  S.db[t][row.id] = row;
  S.queue[t + ':' + row.id] = row;
  S.ver++;
  persist();
  syncSoon();
}
function setKode(siswiId, bulan, w, kode) {
  const id = siswiId + '|' + bulan;
  const row = Object.assign({ id, siswiId, ta: S.taAktif, bulan, w1: '', w2: '', w3: '', w4: '', w5: '' }, S.db.TTD[id] || {});
  row['w' + w] = kode;
  simpanLokal('TTD', row);
}

/* ============================ API & SINKRON ============================ */
async function api(action, payload = {}, timeoutMs = 60000) {
  const url = (window.TTD_CONFIG || {}).API_URL || '';
  if (!/^https?:\/\//.test(url)) throw new Error('URL server belum diatur di config.js');
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: S.token }, payload)), signal: ctrl.signal, redirect: 'follow' });
  } catch (e) {
    const err = new Error('Tidak ada koneksi ke server'); err.net = true; throw err;
  } finally { clearTimeout(tm); }
  let data;
  try { data = await res.json(); } catch (e) { const err = new Error('Respons server tidak valid'); err.net = true; throw err; }
  if (!data.ok) {
    if (data.error === 'SESI_HABIS') { sesiHabis(); const err = new Error('Sesi login habis, silakan login ulang'); err.sesi = true; throw err; }
    throw new Error(data.error || 'Gagal');
  }
  return data;
}

let syncTimer = null;
function syncSoon(ms = 2500) { clearTimeout(syncTimer); syncTimer = setTimeout(() => sinkron(), ms); }

async function sinkron(opts = {}) {
  if (!S.token || S.syncing) return;
  if (!navigator.onLine) { S.online = false; renderSyncChip(); return; }
  S.syncing = true; renderSyncChip();
  try {
    // 1) kirim antrean
    if (isPkm() && pendingCount()) {
      const snap = {}, ops = {};
      Object.keys(S.queue).forEach(k => {
        const [t] = k.split(':');
        snap[k] = JSON.stringify(S.queue[k]);
        (ops[t] = ops[t] || []).push(S.queue[k]);
      });
      const order = ['Desa', 'Sekolah', 'Kelas', 'Siswi', 'TTD'];
      const opList = order.filter(t => ops[t]).map(t => ({ t, rows: ops[t] }));
      await api('push', { ops: opList }, 90000);
      Object.keys(snap).forEach(k => { if (S.queue[k] && JSON.stringify(S.queue[k]) === snap[k]) delete S.queue[k]; });
    }
    // 2) tarik data terbaru
    const target = isPkm() ? S.user.pkmId : S.pkmId;
    const key = (target || '-') + '@' + S.taAktif;
    const incremental = !opts.full && S.lastSync && S.dataKey === key;
    const r = await api('bootstrap', { pkmId: target, since: incremental ? S.lastSync : '' }, 120000);
    const taBerubah = S.taAktif && r.taAktif !== S.taAktif;
    Object.assign(S, { user: r.user, kab: r.kab, pkm: r.pkm, taAktif: r.taAktif, kalender: r.kalender });
    if (taBerubah && !opts.retry) { S.syncing = false; S.lastSync = ''; return sinkron({ full: true, retry: true }); }
    if (r.data) {
      if (r.full) S.db = emptyDb();
      TABLES.forEach(t => (r.data[t] || []).forEach(row => {
        if (!S.queue[t + ':' + row.id]) S.db[t][row.id] = row;
      }));
    } else if (!target) S.db = emptyDb();
    S.lastSync = r.serverTime;
    S.dataKey = (target || '-') + '@' + r.taAktif;
    S.online = true; S.ver++;
    persist();
    if (opts.notify) toast('Sinkronisasi berhasil');
    const shellKey = JSON.stringify([S.user, S.pkm.map(p => p.id + p.nama), S.taAktif, S.kab.length]);
    if (shellKey !== S._shellKey) { S._shellKey = shellKey; renderShell(); } else rerender();
  } catch (e) {
    if (e.net) S.online = false;
    if (opts.notify || (!e.net && !e.sesi)) toast(e.message, true);
  } finally {
    S.syncing = false; renderSyncChip();
  }
}

function sesiHabis() {
  S.token = '';
  persist();
  renderLogin('Sesi login berakhir. Silakan login kembali — data yang belum terkirim tetap aman di HP ini.');
}

window.addEventListener('online', () => { S.online = true; renderSyncChip(); sinkron(); });
window.addEventListener('offline', () => { S.online = false; renderSyncChip(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token) syncSoon(500); });
setInterval(() => { if (S.token && pendingCount()) sinkron(); }, 60000);

/* ============================ LOGIN ============================ */
function logos(cls = '') {
  return `<img class="sulbar ${cls}" src="assets/logo-sulbar.png" alt="Logo Provinsi Sulawesi Barat"><img class="poltekkes ${cls}" src="assets/logo-poltekkes.png" alt="Logo Kemenkes Poltekkes Makassar">`;
}
function renderLogin(msg) {
  $('#root').innerHTML = `
  <div class="login-wrap"><form class="login-card" id="fLogin" autocomplete="on">
    <div class="login-logos">${logos()}</div>
    <h1>TTD Rematri Sulbar</h1>
    <p class="sub">Pencatatan &amp; rekap Tablet Tambah Darah remaja putri di sekolah<br>Provinsi Sulawesi Barat</p>
    ${msg ? `<div class="alert info">${esc(msg)}</div>` : ''}
    <label class="f"><span>Username</span><input class="inp" name="username" autocomplete="username" autocapitalize="none" required value="${esc(S.user ? S.user.username : '')}"></label>
    <label class="f"><span>PIN</span><input class="inp" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>
    <div id="loginErr"></div>
    <button class="btn block" type="submit">Masuk</button>
    <p class="login-foot">Petugas Gizi Puskesmas · Admin Kabupaten/Kota · Admin Provinsi</p>
    <p class="login-foot dev">Developed: <b>Manjilala, S.Gz., M.Gizi</b></p>
  </form></div>`;
  $('#fLogin').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('button', f);
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Memeriksa…';
    try {
      const r = await api('login', { username: f.username.value, pin: f.pin.value });
      const ganti = !S.user || S.user.username !== r.user.username;
      if (ganti) {
        if (pendingCount() && !confirm('Ada ' + pendingCount() + ' data belum terkirim milik akun sebelumnya. Data itu akan dihapus dari HP ini. Lanjutkan?')) { btn.disabled = false; btn.textContent = 'Masuk'; return; }
        Object.assign(S, { db: emptyDb(), queue: {}, lastSync: '', dataKey: '', pkmId: '', ui: {} });
      }
      S.token = r.token; S.user = r.user;
      persist();
      renderShell();
      await sinkron({ full: ganti });
      if (S.user.mustChange) modalGantiPin(true);
    } catch (err) {
      $('#loginErr').innerHTML = `<div class="alert err">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Masuk';
    }
  };
}

/* ============================ SHELL ============================ */
function navItems() {
  const r = S.user.role;
  if (r === 'pkm') return [
    ['beranda', 'Beranda', 'home'],
    ['#Pencatatan'], ['input', 'Input TTD Mingguan', 'check'], ['register', 'Register Kelas', 'grid'],
    ['#Laporan'], ['rekap-sekolah', 'Rekap Sekolah', 'chart'], ['rekap-desa', 'Rekap Desa/Kelurahan', 'map'], ['rekap-pkm', 'Rekap Puskesmas', 'hosp'],
    ['#Data Master'], ['sekolah', 'Desa, Sekolah & Kelas', 'school'], ['siswi', 'Data Siswi', 'users'],
    ['#Lainnya'], ['sinkron', 'Sinkronisasi', 'sync'], ['panduan', 'Panduan', 'book'], ['akun', 'Akun & PIN', 'user']
  ];
  const items = [
    ['beranda', 'Beranda', 'home'],
    ['wilayah', r === 'prov' ? 'Rekap Provinsi' : 'Rekap Kabupaten/Kota', 'layers'],
    ['#Data Puskesmas'], ['register', 'Register Kelas', 'grid'], ['rekap-sekolah', 'Rekap Sekolah', 'chart'], ['rekap-desa', 'Rekap Desa/Kelurahan', 'map'], ['rekap-pkm', 'Rekap Puskesmas', 'hosp'],
    ['#Pengelolaan'], ['puskesmas', 'Puskesmas', 'hosp'], ['pengguna', 'Akun Pengguna', 'users']
  ];
  if (r === 'prov') items.push(['kalender', 'Kalender & Tahun Ajaran', 'cal']);
  items.push(['#Lainnya'], ['panduan', 'Panduan', 'book'], ['akun', 'Akun & PIN', 'user']);
  return items;
}
const PAGE_TITLE = {
  beranda: 'Beranda', input: 'Input TTD Mingguan', register: 'Register Kelas', 'rekap-sekolah': 'Rekap Sekolah', 'rekap-desa': 'Rekap Desa/Kelurahan',
  'rekap-pkm': 'Rekap Puskesmas', sekolah: 'Desa, Sekolah & Kelas', siswi: 'Data Siswi', sinkron: 'Sinkronisasi', panduan: 'Panduan', akun: 'Akun & PIN',
  wilayah: 'Rekap Wilayah', puskesmas: 'Puskesmas', pengguna: 'Akun Pengguna', kalender: 'Kalender & Tahun Ajaran'
};
const curPage = () => (location.hash.replace('#', '') || 'beranda');

function renderShell() {
  const u = S.user;
  S._shellKey = JSON.stringify([S.user, S.pkm.map(p => p.id + p.nama), S.taAktif, S.kab.length]);
  const wilayah = u.role === 'pkm' ? namaPkm(u.pkmId) : u.role === 'kab' ? namaKab(u.kab) : 'Provinsi Sulawesi Barat';
  const pkmPilihan = u.role === 'pkm' ? '' : `<select id="pkmPick" title="Lihat data puskesmas"><option value="">— pilih puskesmas —</option>${S.pkm.slice().sort(byNama).map(p => `<option value="${esc(p.id)}" ${p.id === S.pkmId ? 'selected' : ''}>${esc(p.nama)}${u.role === 'prov' ? ' · ' + esc(namaKab(p.kab).replace('Kabupaten ', '')) : ''}</option>`).join('')}</select>`;
  $('#root').innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar">
      <div class="brand">${logos()}</div>
      <div class="app-title"><b>TTD Rematri Sulbar</b><small>Tablet Tambah Darah Remaja Putri · TA ${esc(S.taAktif || '-')}</small></div>
      <div class="who"><b>${esc(u.nama)}</b>${esc(wilayah)}<br><span class="role">${ROLE_LABEL[u.role]}</span>${pkmPilihan}</div>
      <nav class="nav" id="nav">${navItems().map(n => n[0][0] === '#' ? `<div class="grp">${esc(n[0].slice(1))}</div>` :
        `<a href="#${n[0]}" data-p="${n[0]}">${ic(n[2])}<span>${esc(n[1])}</span>${n[0] === 'sinkron' ? '<span class="badge hidden" id="navPend"></span>' : ''}</a>`).join('')}
        <a href="#" id="btnLogout">${ic('logout')}<span>Keluar</span></a>
      </nav>
      <div class="side-foot">Developed: <b>Manjilala, S.Gz., M.Gizi</b><br>Jurusan Gizi · Poltekkes Kemenkes Makassar</div>
    </aside>
    <div class="overlay" id="ovl"></div>
    <div class="main">
      <header class="topbar">
        <button class="hamb" id="hamb" aria-label="Menu">${ic('menu')}</button>
        <h2 id="pgTitle"></h2>
        <button class="sync-chip" id="syncChip" title="Sinkronkan"><span class="dot"></span><span id="syncTxt"></span></button>
      </header>
      <section class="view" id="view"></section>
    </div>
  </div>`;
  $('#hamb').onclick = () => $('#shell').classList.toggle('nav-open');
  $('#ovl').onclick = () => $('#shell').classList.remove('nav-open');
  $('#nav').addEventListener('click', e => { if (e.target.closest('a')) $('#shell').classList.remove('nav-open'); });
  $('#syncChip').onclick = () => sinkron({ notify: true });
  $('#btnLogout').onclick = e => { e.preventDefault(); keluar(); };
  const pick = $('#pkmPick');
  if (pick) pick.onchange = async () => {
    S.pkmId = pick.value; S.db = emptyDb(); S.lastSync = ''; S.ver++; S.ui = {};
    persist(); rerender();
    if (S.pkmId) { $('#view').innerHTML = '<div class="loading"><span class="spinner dark"></span> Memuat data puskesmas…</div>'; await sinkron({ full: true }); }
  };
  renderSyncChip();
  rerender();
}

function renderSyncChip() {
  const chip = $('#syncChip');
  if (!chip) return;
  const n = pendingCount();
  chip.className = 'sync-chip' + (!S.online ? ' off' : n ? ' pend' : '') + (S.syncing ? ' busy' : '');
  $('#syncTxt').textContent = S.syncing ? 'Menyinkron…' : !S.online ? (n ? `Offline · ${n} antre` : 'Offline') : n ? `${n} belum terkirim` : 'Tersinkron';
  const b = $('#navPend');
  if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
}

async function keluar() {
  if (pendingCount() && !confirm(`Masih ada ${pendingCount()} data yang belum terkirim ke server. Jika keluar, data tetap tersimpan di HP ini dan akan dikirim setelah Anda login lagi dengan akun yang sama. Keluar sekarang?`)) return;
  try { if (navigator.onLine) await api('logout', {}, 8000); } catch (e) { /* abaikan */ }
  S.token = '';
  persist();
  renderLogin();
}

function rerender() {
  if (!S.token || !$('#view')) return;
  let p = curPage();
  const allowed = navItems().filter(n => n[0][0] !== '#').map(n => n[0]);
  if (allowed.indexOf(p) < 0) p = 'beranda';
  $$('#nav a[data-p]').forEach(a => a.classList.toggle('active', a.dataset.p === p));
  $('#pgTitle').textContent = p === 'wilayah' ? (isProv() ? 'Rekap Provinsi Sulawesi Barat' : 'Rekap ' + namaKab(S.user.kab)) : PAGE_TITLE[p];
  const v = $('#view');
  try { PAGES[p](v); } catch (e) { console.error(e); v.innerHTML = `<div class="alert err">Terjadi kesalahan: ${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', () => { rerender(); window.scrollTo(0, 0); });

/* ============================ KOMPONEN PILIHAN ============================ */
function opsi(list, val, ph, labelFn = x => x.nama) {
  return (ph ? `<option value="">${esc(ph)}</option>` : '') + list.map(x => `<option value="${esc(x.id)}" ${x.id === val ? 'selected' : ''}>${esc(labelFn(x))}</option>`).join('');
}
function pilihSekolahKelas(prefix, withKelas = true) {
  const sek = sekolahList();
  let sid = S.ui[prefix + 'Sek'];
  if (!sek.find(s => s.id === sid)) sid = sek[0] ? sek[0].id : '';
  S.ui[prefix + 'Sek'] = sid;
  let kid = '';
  let kel = [];
  if (withKelas) {
    kel = kelasList(sid);
    kid = S.ui[prefix + 'Kel'];
    if (!kel.find(k => k.id === kid)) kid = kel[0] ? kel[0].id : '';
    S.ui[prefix + 'Kel'] = kid;
  }
  const html = `<label class="f"><span>Sekolah</span><select class="inp" data-ui="${prefix}Sek">${opsi(sek, sid, sek.length ? '' : '— belum ada sekolah —', s => s.nama + (s.desaId ? ' · ' + ((getRow('Desa', s.desaId) || {}).nama || '') : ''))}</select></label>` +
    (withKelas ? `<label class="f"><span>Kelas</span><select class="inp" data-ui="${prefix}Kel">${opsi(kel, kid, kel.length ? '' : '— belum ada kelas —')}</select></label>` : '');
  return { sid, kid, html };
}
function bindUi(root) {
  $$('[data-ui]', root).forEach(el => {
    el.onchange = () => { S.ui[el.dataset.ui] = el.value; persist(); rerender(); };
  });
}
function butuhPkm(v) {
  if (isPkm()) return false;
  if (S.pkmId) return false;
  v.innerHTML = `<div class="card"><div class="empty">${ic('hosp')}<p>Pilih puskesmas pada panel kiri (di bawah nama Anda) untuk melihat register dan rekapnya.</p></div></div>`;
  return true;
}
function bulanSelect(key, withAll) {
  const list = bulanAktif();
  let val = S.ui[key];
  if (val !== 'all' && list.indexOf(val) < 0) val = bulanBerjalan();
  if (val === 'all' && !withAll) val = bulanBerjalan();
  S.ui[key] = val;
  return { val, html: `<label class="f"><span>Bulan</span><select class="inp" data-ui="${key}">${withAll ? `<option value="all" ${val === 'all' ? 'selected' : ''}>Semua bulan</option>` : ''}${list.map(b => `<option value="${b}" ${b === val ? 'selected' : ''}>${blnLabel(b)}</option>`).join('')}</select></label>` };
}

/* ============================ HALAMAN ============================ */
const PAGES = {};

/* ---------- BERANDA ---------- */
PAGES.beranda = v => {
  if (!isPkm()) return berandaAdmin(v);
  const b = bulanBerjalan();
  const sek = sekolahList(), kel = kelasList(), sw = siswiList();
  const h = hitungSemua();
  const rk = rekapSiswi(sw)[b] || { j: 0, dg: 0, mg: 0 };
  const jam = new Date().getHours();
  const salam = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
  // progres input minggu ini
  const kal = h.kal[b];
  const d = new Date();
  const curB = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  let mg = curB === b && kal ? Math.min(Math.ceil(d.getDate() / 7), kal.minggu) : 1;
  while (kal && kal.libur.indexOf(mg) >= 0 && mg > 1) mg--;
  const statusKelas = kel.map(k => {
    const ss = siswiList(k.id);
    const isi = ss.filter(s => { const t = S.db.TTD[s.id + '|' + b]; return t && t['w' + mg]; }).length;
    return { k, total: ss.length, isi };
  });
  const kelasLengkap = statusKelas.filter(x => x.total && x.isi === x.total).length;
  // perlu perhatian
  const perhatian = [];
  sw.forEach(s => {
    const x = (h.hs[s.id] || {})[b];
    if (!x || !x.terdaftar) return;
    if (x.dk >= 4 && x.mk / x.dk < 0.5) perhatian.push({ s, x, alasan: `Diminum ${x.mk} dari ${x.dk} tablet` });
    else if (x.dk === 0 && h.bulan.indexOf(b) > 0) perhatian.push({ s, x, alasan: 'Belum pernah mendapat TTD' });
  });
  const kelasNama = id => { const k = getRow('Kelas', id); if (!k) return ''; const sk = getRow('Sekolah', k.sekolahId); return k.nama + ' · ' + (sk ? sk.nama : ''); };

  v.innerHTML = `
  <div class="hero"><h1>${salam}, ${esc(S.user.nama.split(' ')[0])} 👋</h1><p>${esc(namaPkm(S.user.pkmId))} · Tahun Ajaran ${esc(S.taAktif)} · posisi ${b ? blnLabel(b) : '-'}</p></div>
  ${!sek.length ? `<div class="alert warn">Belum ada data sekolah. Mulai dari menu <a href="#sekolah">Desa, Sekolah &amp; Kelas</a>, lalu upload daftar siswi di <a href="#siswi">Data Siswi</a>.</div>` : ''}
  <div class="stats">
    <div class="stat"><small>Sekolah binaan</small><b>${sek.length}</b><span>${desaList().length} desa/kelurahan</span></div>
    <div class="stat"><small>Kelas</small><b>${kel.length}</b><span>TA ${esc(S.taAktif)}</span></div>
    <div class="stat"><small>Remaja putri</small><b>${sw.length}</b><span>terdaftar aktif</span></div>
    <div class="stat"><small>Belum terkirim</small><b>${pendingCount()}</b><span>${S.lastSync ? 'sinkron ' + fmtWaktu(S.lastSync) : 'belum pernah sinkron'}</span></div>
  </div>
  <div class="grid2">
    <div class="card"><h3>${ic('chart')} Capaian s.d. ${b ? blnLabel(b) : '-'}</h3>
      <div class="kv"><span>Rematri <b>mendapat</b> ≥ 26 tablet</span><b>${rk.dg} / ${rk.j} (${pct(rk.dg, rk.j)}%)</b></div>
      <div class="bar"><i style="width:${pct(rk.dg, rk.j)}%"></i></div>
      <div class="kv"><span>Rematri <b>minum</b> ≥ 26 tablet</span><b>${rk.mg} / ${rk.j} (${pct(rk.mg, rk.j)}%)</b></div>
      <div class="bar lime"><i style="width:${pct(rk.mg, rk.j)}%"></i></div>
      <p class="small muted" style="margin:12px 0 0">Kumulatif dihitung sejak Juli (awal tahun ajaran). Angka ini sama dengan yang dientri ke SIGIZI KESGA.</p>
    </div>
    <div class="card"><h3>${ic('check')} Input minggu ${ROMAWI[mg - 1]} · ${b ? blnNama(b) : ''}<span class="right pill">${kelasLengkap}/${kel.length} kelas lengkap</span></h3>
      ${statusKelas.length ? `<div class="tbl-wrap" style="max-height:230px"><table class="t list"><tbody>${statusKelas.map(x => `<tr><td>${esc(kelasNama(x.k.id))}</td><td class="act">${x.total ? (x.isi === x.total ? '<span class="pill">Lengkap</span>' : `<span class="pill warn">${x.isi}/${x.total}</span>`) : '<span class="pill grey">Tanpa siswi</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Belum ada kelas.</div>'}
      <div style="margin-top:10px"><a class="btn sm" href="#input">${ic('check')} Isi sekarang</a></div>
    </div>
  </div>
  <div class="card"><h3>Menu cepat</h3><div class="quick">
    <a href="#input">${ic('check')}Input TTD Mingguan</a><a href="#siswi">${ic('upload')}Upload Data Siswi</a><a href="#register">${ic('grid')}Register Kelas</a><a href="#rekap-pkm">${ic('download')}Rekap &amp; Unduh Excel</a>
  </div></div>
  <div class="card"><h3>${ic('users')} Perlu perhatian <span class="right pill warn">${perhatian.length}</span></h3>
    ${perhatian.length ? `<div class="tbl-wrap" style="max-height:300px"><table class="t list"><thead><tr><th class="l">Nama</th><th class="l">Kelas</th><th class="l">Keterangan</th></tr></thead><tbody>${perhatian.slice(0, 50).map(p => `<tr><td>${esc(p.s.nama)}</td><td>${esc(kelasNama(p.s.kelasId))}</td><td>${esc(p.alasan)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Tidak ada catatan. Kepatuhan minum TTD baik 👍</div>'}
    <p class="small muted" style="margin:10px 0 0">Daftar ini memuat rematri yang meminum kurang dari separuh tablet yang diterimanya, atau yang belum pernah menerima TTD. Bisa dijadikan sasaran konseling.</p>
  </div>`;
};

async function muatWilayah(force) {
  if (!force && S.wil && S.wil.ta === S.taAktif && S.wil.kabKey === (S.user.role === 'kab' ? S.user.kab : '')) return S.wil;
  const r = await api('rekapWilayah', { ta: S.taAktif });
  S.wil = Object.assign(r, { kabKey: S.user.role === 'kab' ? S.user.kab : '', at: nowIso() });
  return S.wil;
}

function berandaAdmin(v) {
  const wil = S.user.role === 'prov' ? 'Provinsi Sulawesi Barat' : namaKab(S.user.kab);
  v.innerHTML = `<div class="hero"><h1>Halo, ${esc(S.user.nama)}</h1><p>${ROLE_LABEL[S.user.role]} · ${esc(wil)} · TA ${esc(S.taAktif)}</p></div><div id="admBox"><div class="loading"><span class="spinner dark"></span> Memuat ringkasan wilayah…</div></div>`;
  muatWilayah().then(w => {
    const b = w.bulan.indexOf(bulanBerjalan()) >= 0 ? bulanBerjalan() : w.bulan[w.bulan.length - 1];
    const tot = rekapKosong(w.bulan);
    w.rows.forEach(r => gabungRekap(tot, r.rekap));
    const t = tot[b] || { j: 0, dg: 0, mg: 0 };
    if (!$('#admBox')) return;
    const terisi = w.rows.filter(r => r.rekap[b] && r.rekap[b].j).length;
    $('#admBox').innerHTML = `
      <div class="stats">
        <div class="stat"><small>Puskesmas</small><b>${w.rows.length}</b><span>${terisi} sudah ada data</span></div>
        <div class="stat"><small>Remaja putri terdaftar</small><b>${t.j}</b><span>${b ? blnLabel(b) : ''}</span></div>
        <div class="stat"><small>Mendapat ≥ 26 tablet</small><b>${pct(t.dg, t.j)}%</b><span>${t.dg} rematri</span></div>
        <div class="stat"><small>Minum ≥ 26 tablet</small><b>${pct(t.mg, t.j)}%</b><span>${t.mg} rematri</span></div>
      </div>
      <div class="card"><h3>${ic('layers')} Capaian per puskesmas · ${b ? blnLabel(b) : ''}<a class="btn sm ghost right" href="#wilayah">Lihat rekap lengkap</a></h3>
      ${tabelWilayahHtml(w.rows.map(r => ({ label: r.nama, sub: S.user.role === 'prov' ? namaKab(r.kab) : '', rekap: r.rekap })), b, 'Puskesmas')}</div>
      <p class="small muted">Data per ${fmtWaktu(w.at)}. Untuk melihat register dan rekap detail, pilih puskesmas di panel kiri.</p>`;
  }).catch(e => { if ($('#admBox')) $('#admBox').innerHTML = `<div class="alert ${e.net ? 'warn' : 'err'}">${e.net ? 'Sedang offline — ringkasan wilayah memerlukan internet.' : esc(e.message)}</div>`; });
}

/* ---------- INPUT MINGGUAN ---------- */
PAGES.input = v => {
  const sk = pilihSekolahKelas('in');
  const bs = bulanSelect('inBln');
  const b = bs.val;
  const kal = kalNow()[b];
  let w = +S.ui.inMg || 0;
  const d = new Date();
  const curB = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (!w || !kal || w > kal.minggu || kal.libur.indexOf(w) >= 0) {
    w = curB === b && kal ? Math.min(Math.ceil(d.getDate() / 7), kal.minggu) : 1;
    while (kal && kal.libur.indexOf(w) >= 0 && w < kal.minggu) w++;
  }
  S.ui.inMg = w;
  const sw = sk.kid ? siswiList(sk.kid) : [];
  const libur = kal && kal.libur.indexOf(w) >= 0;
  const kode = s => ((S.db.TTD[s.id + '|' + b] || {})['w' + w] || '');
  const terisi = sw.filter(s => kode(s)).length;

  v.innerHTML = `
  <div class="card">
    <div class="row">${sk.html}${bs.html}</div>
    ${kal ? `<div class="weektabs">${Array.from({ length: kal.minggu }, (_, i) => i + 1).map(n => `<button data-w="${n}" class="${n === w ? 'on' : ''}" ${kal.libur.indexOf(n) >= 0 ? 'disabled' : ''}>Minggu ${ROMAWI[n - 1]}<small>${kal.libur.indexOf(n) >= 0 ? 'libur' : n === w ? 'dipilih' : '&nbsp;'}</small></button>`).join('')}</div>` : '<div class="alert warn">Tidak ada bulan aktif pada kalender tahun ajaran ini.</div>'}
    <div class="legend"><span><b class="k1">1</b>Dapat &amp; diminum</span><span><b class="k0">0</b>Dapat, tidak diminum</span><span><b class="kX">X</b>Tidak dapat</span><span><b class="kS">–</b>Belum terdaftar / di luar usia 12–18 th</span></div>
  </div>
  ${!kal ? '' : !sk.kid ? `<div class="card"><div class="empty">Belum ada kelas. Tambahkan sekolah &amp; kelas di menu <a href="#sekolah">Desa, Sekolah &amp; Kelas</a>.</div></div>` :
    !sw.length ? `<div class="card"><div class="empty">Kelas ini belum punya siswi. <a href="#siswi">Upload / tambah siswi</a>.</div></div>` :
    libur ? '<div class="card"><div class="empty">Minggu ini ditandai libur pada kalender sekolah.</div></div>' : `
  <div class="slist" id="slist">${sw.map((s, i) => { const c = kode(s); return `
    <div class="srow" data-id="${esc(s.id)}"><div class="no">${i + 1}</div><div class="nm"><b>${esc(s.nama)}</b><small>${s.nik ? 'NIK ' + esc(s.nik) : 'NIK -'}${usiaInfo(s)}</small></div>
    <div class="seg">${[['1', 'v1'], ['0', 'v0'], ['X', 'vX'], ['-', 'vS']].map(([k, cl]) => `<button data-k="${k}" class="${cl} ${c === k ? 'on' : ''}" aria-label="${k}">${k === '-' ? '–' : k}</button>`).join('')}</div></div>`; }).join('')}</div>
  <div class="savebar"><div class="info" id="isiInfo">${terisi}/${sw.length} siswi sudah diisi · tersimpan otomatis di HP</div>
    <button class="btn ghost sm" id="btnKosong">Kosongkan</button><button class="btn lime sm" id="btnSemua1">Semua = 1</button></div>`}`;
  bindUi(v);
  $$('.weektabs button', v).forEach(bt => { bt.onclick = () => { S.ui.inMg = +bt.dataset.w; persist(); rerender(); }; });
  const list = $('#slist', v);
  if (!list) return;
  const updInfo = () => { $('#isiInfo').textContent = `${sw.filter(s => kode(s)).length}/${sw.length} siswi sudah diisi · tersimpan otomatis di HP`; };
  list.addEventListener('click', e => {
    const bt = e.target.closest('button[data-k]');
    if (!bt) return;
    const row = bt.closest('.srow');
    const cur = kode({ id: row.dataset.id });
    const k = cur === bt.dataset.k ? '' : bt.dataset.k;
    setKode(row.dataset.id, b, w, k);
    $$('button', row).forEach(x => x.classList.toggle('on', x.dataset.k === k));
    updInfo(); renderSyncChip();
  });
  $('#btnSemua1').onclick = () => {
    sw.forEach(s => { if (!kode(s)) setKode(s.id, b, w, '1'); });
    toast('Yang masih kosong diisi 1. Ubah siswi yang berbeda.'); rerender(); renderSyncChip();
  };
  $('#btnKosong').onclick = () => {
    if (!confirm('Kosongkan semua isian minggu ini untuk kelas ini?')) return;
    sw.forEach(s => { if (kode(s)) setKode(s.id, b, w, ''); });
    rerender(); renderSyncChip();
  };
};
function hitungUsia(tgl) {
  if (!tgl) return null;
  const d = new Date(tgl + 'T00:00:00');
  if (isNaN(d)) return null;
  const n = new Date();
  let u = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) u--;
  return u;
}
function usiaInfo(s) {
  const u = hitungUsia(s.tglLahir);
  if (u == null) return '';
  return ` · ${u} th` + (u < 12 || u > 18 ? ' <span class="pill warn">di luar 12–18 th</span>' : '');
}

/* ---------- REGISTER KELAS ---------- */
PAGES.register = v => {
  if (butuhPkm(v)) return;
  const sk = pilihSekolahKelas('rg');
  const h = hitungSemua();
  const sw = sk.kid ? siswiList(sk.kid) : [];
  const bulan = h.bulan;
  const kelas = getRow('Kelas', sk.kid);
  const cellKode = (s, b, w) => {
    const k = h.kal[b];
    if (k.libur.indexOf(w) >= 0) return '<td class="cL">L</td>';
    const c = ((h.ttdBy[s.id] || {})[b] || {})['w' + w] || '';
    return `<td class="${c === '1' ? 'c1' : c === '0' ? 'c0' : c === 'X' ? 'cX' : c === '-' ? 'cS' : ''}">${c === '-' ? '–' : esc(c)}</td>`;
  };
  v.innerHTML = `
  <div class="card"><div class="row">${sk.html}<div class="shrink" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn ghost" id="xKelas" ${sk.kid ? '' : 'disabled'}>${ic('download')} Excel kelas ini</button>
    <button class="btn" id="xSekolah" ${sk.sid ? '' : 'disabled'}>${ic('download')} Excel sekolah (rekap + semua kelas)</button></div></div>
    <div class="legend"><span><b class="k1">1</b>Dapat &amp; diminum</span><span><b class="k0">0</b>Dapat, tidak diminum</span><span><b class="kX">X</b>Tidak dapat</span><span><b class="kS">–</b>Belum terdaftar/di luar usia</span><span><b style="background:#e6eaea;color:#888">L</b>Minggu libur</span></div>
  </div>
  ${!sk.kid ? '<div class="card"><div class="empty">Belum ada kelas.</div></div>' : `
  <div class="card"><h3>${ic('grid')} Register ${esc(kelas.nama)} · ${esc((getRow('Sekolah', sk.sid) || {}).nama)}<span class="right pill">${sw.length} siswi</span></h3>
  <div class="tbl-wrap"><table class="t">
    <thead><tr><th rowspan="2" class="stick">No</th><th rowspan="2" class="stick2 l">Nama Remaja Putri</th><th rowspan="2">NIK</th>${bulan.map(b => `<th colspan="${h.kal[b].minggu + 4}">${blnLabel(b).toUpperCase()}</th>`).join('')}</tr>
    <tr>${bulan.map(b => Array.from({ length: h.kal[b].minggu }, (_, i) => `<th>${ROMAWI[i]}</th>`).join('') + '<th title="Jumlah TTD didapat bulan ini (simbol 0 dan 1)">Dapat</th><th title="Jumlah dapat sampai dengan bulan ini">Dapat s.d.</th><th title="Jumlah TTD diminum bulan ini (simbol 1)">Minum</th><th title="Jumlah minum sampai dengan bulan ini">Minum s.d.</th>').join('')}</tr></thead>
    <tbody>${sw.length ? sw.map((s, i) => { const x = h.hs[s.id] || {}; return `<tr><td class="stick">${i + 1}</td><td class="stick2 l">${esc(s.nama)}</td><td>${esc(s.nik)}</td>${bulan.map(b => {
      const r = x[b] || {};
      return Array.from({ length: h.kal[b].minggu }, (_, j) => cellKode(s, b, j + 1)).join('') + `<td class="calc">${r.d || 0}</td><td class="calc ${r.dk >= 26 ? 'ok' : ''}">${r.dk || 0}</td><td class="calc">${r.m || 0}</td><td class="calc ${r.mk >= 26 ? 'ok' : ''}">${r.mk || 0}</td>`;
    }).join('')}</tr>`; }).join('') : `<tr><td colspan="99" class="l muted">Belum ada siswi.</td></tr>`}</tbody>
  </table></div>
  <p class="small muted" style="margin:10px 0 0">Angka kumulatif berwarna hijau artinya sudah mencapai ≥ 26 tablet.</p></div>`}`;
  bindUi(v);
  const xk = $('#xKelas'), xs = $('#xSekolah');
  if (xk) xk.onclick = () => runExport(() => exportRegister([sk.kid], null));
  if (xs) xs.onclick = () => runExport(() => exportRegister(kelasList(sk.sid).map(k => k.id), sk.sid));
};

/* ---------- REKAP ---------- */
function tabelRekapHtml(items, bulanTampil, labelHead, totalLabel) {
  const h = hitungSemua();
  const bulan = bulanTampil === 'all' ? h.bulan : [bulanTampil];
  const tot = rekapKosong(h.bulan);
  items.forEach(it => gabungRekap(tot, it.rekap));
  const cells = r => `<td>${r.j}</td><td>${r.dl}</td><td class="${r.dg ? 'ok' : ''}">${r.dg}</td><td>${r.ml}</td><td class="${r.mg ? 'ok' : ''}">${r.mg}</td>`;
  return `<div class="tbl-wrap"><table class="t">
  <thead><tr><th rowspan="3" class="stick">No</th><th rowspan="3" class="stick2 l">${esc(labelHead)}</th>${bulan.map(b => `<th colspan="5">${blnLabel(b).toUpperCase()}</th>`).join('')}</tr>
  <tr>${bulan.map(() => '<th rowspan="2">Jumlah<br>rematri</th><th colspan="2">Jumlah dapat<br>s.d. bulan ini</th><th colspan="2">Jumlah minum<br>s.d. bulan ini</th>').join('')}</tr>
  <tr>${bulan.map(() => '<th>&lt; 26</th><th>≥ 26</th><th>&lt; 26</th><th>≥ 26</th>').join('')}</tr></thead>
  <tbody>${items.length ? items.map((it, i) => `<tr><td class="stick">${i + 1}</td><td class="stick2 l">${esc(it.label)}</td>${bulan.map(b => cells(it.rekap[b])).join('')}</tr>`).join('') : `<tr><td colspan="99" class="l muted">Belum ada data.</td></tr>`}
  ${items.length ? `<tr class="tot"><td class="stick"></td><td class="stick2 l">${esc(totalLabel)}</td>${bulan.map(b => cells(tot[b])).join('')}</tr>` : ''}</tbody></table></div>
  ${bulan.length === 1 && tot[bulan[0]].j ? `<p class="small muted" style="margin:10px 0 0">Total ${esc(totalLabel)}: mendapat ≥ 26 tablet <b>${pct(tot[bulan[0]].dg, tot[bulan[0]].j)}%</b> · minum ≥ 26 tablet <b>${pct(tot[bulan[0]].mg, tot[bulan[0]].j)}%</b>.</p>` : ''}`;
}

PAGES['rekap-sekolah'] = v => {
  if (butuhPkm(v)) return;
  const sk = pilihSekolahKelas('rs', false);
  const bs = bulanSelect('rsBln', true);
  const sek = getRow('Sekolah', sk.sid);
  const items = kelasList(sk.sid).map(k => ({ label: k.nama, rekap: rekapKelas(k.id) }));
  v.innerHTML = `<div class="card"><div class="row">${sk.html}${bs.html}<div class="shrink" style="margin-bottom:12px"><button class="btn" id="xBtn" ${sk.sid ? '' : 'disabled'}>${ic('download')} Unduh Excel</button></div></div></div>
  <div class="card"><h3>${ic('chart')} Rekap ${esc(sek ? sek.nama : '')}</h3>${tabelRekapHtml(items, bs.val, 'Kelas', sek ? sek.nama : 'Total')}
  <p class="small muted">Dihitung otomatis dari register kelas: jumlah rematri yang kumulatif TTD-nya &lt; 26 dan ≥ 26 tablet.</p></div>`;
  bindUi(v);
  $('#xBtn').onclick = () => runExport(() => exportRegister(kelasList(sk.sid).map(k => k.id), sk.sid));
};

PAGES['rekap-desa'] = v => {
  if (butuhPkm(v)) return;
  const ds = desaList();
  let did = S.ui.rdDesa;
  if (!ds.find(d => d.id === did)) did = ds[0] ? ds[0].id : '';
  S.ui.rdDesa = did;
  const bs = bulanSelect('rdBln', true);
  const desa = getRow('Desa', did);
  const items = sekolahList(did).map(s => ({ label: s.nama, rekap: rekapSekolah(s.id) }));
  v.innerHTML = `<div class="card"><div class="row"><label class="f"><span>Desa/Kelurahan</span><select class="inp" data-ui="rdDesa">${opsi(ds, did, ds.length ? '' : '— belum ada desa —')}</select></label>${bs.html}
    <div class="shrink" style="margin-bottom:12px"><button class="btn" id="xBtn" ${did ? '' : 'disabled'}>${ic('download')} Unduh Excel</button></div></div></div>
  <div class="card"><h3>${ic('map')} Rekap Distribusi &amp; Konsumsi TTD Rematri · ${esc(desa ? desa.nama : '')}</h3>${tabelRekapHtml(items, bs.val, 'Sekolah', desa ? desa.nama : 'Total')}
  <div class="alert info" style="margin-top:12px">Data rekap desa/kelurahan ini yang dientri ke laporan bulanan <b>SIGIZI KESGA</b>.</div></div>`;
  bindUi(v);
  $('#xBtn').onclick = () => runExport(() => exportRekapDesa(did));
};

PAGES['rekap-pkm'] = v => {
  if (butuhPkm(v)) return;
  const bs = bulanSelect('rpBln', true);
  const pid = isPkm() ? S.user.pkmId : S.pkmId;
  const items = desaList().map(d => ({ label: d.nama, rekap: rekapDesa(d.id) }));
  v.innerHTML = `<div class="card"><div class="row">${bs.html}<div class="shrink" style="margin-bottom:12px"><button class="btn" id="xBtn">${ic('download')} Unduh Excel</button></div></div></div>
  <div class="card"><h3>${ic('hosp')} Rekap ${esc(namaPkm(pid))} per Desa/Kelurahan</h3>${tabelRekapHtml(items, bs.val, 'Desa/Kelurahan', namaPkm(pid))}</div>`;
  bindUi(v);
  $('#xBtn').onclick = () => runExport(() => exportRekapPkm());
};

/* ---------- REKAP WILAYAH (admin) ---------- */
function tabelWilayahHtml(items, b, labelHead) {
  const tot = { j: 0, dl: 0, dg: 0, ml: 0, mg: 0 };
  items.forEach(it => { const r = it.rekap[b]; if (r) Object.keys(tot).forEach(k => { tot[k] += r[k]; }); });
  const row = (r, lbl, sub, i, cls) => `<tr class="${cls || ''}"><td>${i}</td><td class="l">${esc(lbl)}${sub ? `<br><small class="muted">${esc(sub)}</small>` : ''}</td><td>${r.j}</td><td>${r.dl}</td><td>${r.dg}</td><td><b>${pct(r.dg, r.j)}%</b></td><td>${r.ml}</td><td>${r.mg}</td><td><b>${pct(r.mg, r.j)}%</b></td></tr>`;
  return `<div class="tbl-wrap"><table class="t"><thead>
    <tr><th rowspan="2">No</th><th rowspan="2" class="l">${esc(labelHead)}</th><th rowspan="2">Jumlah<br>rematri</th><th colspan="3">Dapat s.d. bulan ini</th><th colspan="3">Minum s.d. bulan ini</th></tr>
    <tr><th>&lt; 26</th><th>≥ 26</th><th>% ≥ 26</th><th>&lt; 26</th><th>≥ 26</th><th>% ≥ 26</th></tr></thead>
    <tbody>${items.length ? items.map((it, i) => row(it.rekap[b] || { j: 0, dl: 0, dg: 0, ml: 0, mg: 0 }, it.label, it.sub, i + 1)).join('') + row(tot, 'TOTAL', '', '', 'tot') : '<tr><td colspan="9" class="l muted">Belum ada puskesmas.</td></tr>'}</tbody></table></div>`;
}

PAGES.wilayah = v => {
  v.innerHTML = '<div class="loading"><span class="spinner dark"></span> Memuat rekap wilayah…</div>';
  const go = force => muatWilayah(force).then(w => {
    const bs = bulanSelect('wlBln', false);
    let b = bs.val;
    if (w.bulan.indexOf(b) < 0) b = w.bulan[w.bulan.length - 1];
    let kabF = S.user.role === 'kab' ? S.user.kab : (S.ui.wlKab || '');
    let items, labelHead;
    if (S.user.role === 'prov' && !kabF) {
      labelHead = 'Kabupaten/Kota';
      items = S.kab.map(k => {
        const r = rekapKosong(w.bulan);
        w.rows.filter(x => x.kab === k.id).forEach(x => gabungRekap(r, x.rekap));
        return { label: k.nama, sub: w.rows.filter(x => x.kab === k.id).length + ' puskesmas', rekap: r, kab: k.id };
      });
    } else {
      labelHead = 'Puskesmas';
      items = w.rows.filter(x => x.kab === kabF).sort(byNama).map(x => ({ label: x.nama, rekap: x.rekap }));
    }
    v.innerHTML = `<div class="card"><div class="row">
      ${S.user.role === 'prov' ? `<label class="f"><span>Wilayah</span><select class="inp" data-ui="wlKab"><option value="">Semua kabupaten/kota (per kabupaten)</option>${S.kab.map(k => `<option value="${k.id}" ${k.id === kabF ? 'selected' : ''}>${esc(k.nama)} (per puskesmas)</option>`).join('')}</select></label>` : ''}
      ${bs.html}<div class="shrink" style="margin-bottom:12px;display:flex;gap:8px"><button class="btn ghost" id="rf">${ic('sync')} Muat ulang</button><button class="btn" id="xBtn">${ic('download')} Unduh Excel</button></div></div>
      <p class="small muted" style="margin:0">Data per ${fmtWaktu(w.at)} · TA ${esc(w.ta)}</p></div>
      <div class="card"><h3>${ic('layers')} ${esc(labelHead === 'Puskesmas' ? 'Rekap per puskesmas · ' + namaKab(kabF) : 'Rekap per kabupaten/kota · Provinsi Sulawesi Barat')}</h3>${tabelWilayahHtml(items, b, labelHead)}
      ${S.user.role === 'prov' && !kabF ? '<p class="small muted">Pilih kabupaten/kota pada filter Wilayah untuk melihat rincian per puskesmas.</p>' : ''}</div>`;
    bindUi(v);
    $('#rf').onclick = () => { v.innerHTML = '<div class="loading"><span class="spinner dark"></span> Memuat…</div>'; go(true); };
    $('#xBtn').onclick = () => runExport(() => exportWilayah(items, w.bulan, labelHead, labelHead === 'Puskesmas' ? namaKab(kabF) : 'Provinsi Sulawesi Barat'));
  }).catch(e => { v.innerHTML = `<div class="alert ${e.net ? 'warn' : 'err'}">${e.net ? 'Rekap wilayah memerlukan koneksi internet.' : esc(e.message)}</div>`; });
  go(false);
};

/* ---------- DESA, SEKOLAH & KELAS ---------- */
PAGES.sekolah = v => {
  const ds = desaList();
  const sek = sekolahList();
  const sk = pilihSekolahKelas('mk', false);
  const kel = kelasList(sk.sid);
  const jmlKelas = sid => kelasList(sid).length;
  const jmlSiswi = kid => siswiList(kid).length;
  v.innerHTML = `
  <div class="card"><h3>${ic('map')} Desa/Kelurahan wilayah kerja<button class="btn sm right" id="addDesa">${ic('plus')} Tambah</button></h3>
    ${ds.length ? `<div class="tbl-wrap"><table class="t list"><thead><tr><th class="l">Nama desa/kelurahan</th><th class="l">Jumlah sekolah</th><th></th></tr></thead><tbody>${ds.map(d => `<tr><td>${esc(d.nama)}</td><td>${sekolahList(d.id).length}</td><td class="act"><button class="btn sm ghost" data-ed="Desa:${esc(d.id)}">Ubah</button> <button class="btn sm danger" data-del="Desa:${esc(d.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Belum ada desa/kelurahan.</div>'}
  </div>
  <div class="card"><h3>${ic('school')} Sekolah<button class="btn sm right" id="addSek" ${ds.length ? '' : 'disabled'}>${ic('plus')} Tambah</button></h3>
    ${sek.length ? `<div class="tbl-wrap"><table class="t list"><thead><tr><th class="l">Nama sekolah</th><th class="l">Jenjang</th><th class="l">Desa/Kelurahan</th><th class="l">Kelas</th><th></th></tr></thead><tbody>${sek.map(s => `<tr><td>${esc(s.nama)}</td><td>${esc(s.jenjang)}</td><td>${esc((getRow('Desa', s.desaId) || {}).nama || '-')}</td><td>${jmlKelas(s.id)}</td><td class="act"><button class="btn sm ghost" data-ed="Sekolah:${esc(s.id)}">Ubah</button> <button class="btn sm danger" data-del="Sekolah:${esc(s.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${ds.length ? 'Belum ada sekolah.' : 'Tambahkan desa/kelurahan terlebih dahulu.'}</div>`}
  </div>
  <div class="card"><h3>${ic('grid')} Kelas · TA ${esc(S.taAktif)}<button class="btn sm right" id="addKel" ${sk.sid ? '' : 'disabled'}>${ic('plus')} Tambah</button></h3>
    <div class="row">${sk.html}</div>
    ${kel.length ? `<div class="tbl-wrap"><table class="t list"><thead><tr><th class="l">Kelas</th><th class="l">Tingkat</th><th class="l">Jumlah siswi</th><th></th></tr></thead><tbody>${kel.map(k => `<tr><td>${esc(k.nama)}</td><td>${esc(k.tingkat || '-')}</td><td>${jmlSiswi(k.id)}</td><td class="act"><button class="btn sm ghost" data-ed="Kelas:${esc(k.id)}">Ubah</button> <button class="btn sm danger" data-del="Kelas:${esc(k.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Belum ada kelas di sekolah ini. Kelas juga dibuat otomatis saat upload data siswi.</div>'}
  </div>
  <div class="card"><h3>${ic('cal')} Tahun ajaran baru</h3>
    <p class="small muted" style="margin-top:0">Di awal tahun ajaran (Juli), salin kelas &amp; siswi dari tahun ajaran sebelumnya: kelas 7→8, 8→9, 10→11, 11→12. Kelas 9 dan 12 dianggap lulus. Siswi baru kelas 7/10 tinggal di-upload.</p>
    <button class="btn ghost" id="btnNaik">${ic('layers')} Naik kelas dari TA ${esc(taSebelum(S.taAktif))}</button>
  </div>`;
  bindUi(v);
  $('#addDesa').onclick = () => formDesa();
  $('#addSek').onclick = () => formSekolah();
  $('#addKel').onclick = () => formKelas(null, sk.sid);
  $$('[data-ed]', v).forEach(b => b.onclick = () => { const [t, id] = b.dataset.ed.split(':'); ({ Desa: formDesa, Sekolah: formSekolah, Kelas: formKelas })[t](getRow(t, id)); });
  $$('[data-del]', v).forEach(b => b.onclick = () => { const [t, id] = b.dataset.del.split(':'); hapusMaster(t, id); });
  $('#btnNaik').onclick = naikKelas;
};
function taSebelum(ta) { const y = parseInt(ta, 10); return (y - 1) + '/' + y; }

function formDesa(row) {
  const m = modal({
    title: row ? 'Ubah Desa/Kelurahan' : 'Tambah Desa/Kelurahan',
    body: `<label class="f"><span>Nama desa/kelurahan</span><input class="inp" name="nama" value="${esc(row ? row.nama : '')}" placeholder="mis. Desa Tommo" required></label>`,
    ok: 'Simpan',
    onOk: f => {
      const nama = f.nama.value.trim();
      if (!nama) throw new Error('Nama wajib diisi');
      if (desaList().some(d => d.nama.toLowerCase() === nama.toLowerCase() && (!row || d.id !== row.id))) throw new Error('Nama desa sudah ada');
      simpanLokal('Desa', Object.assign({}, row || { id: uid('ds'), del: '' }, { nama }));
    }
  });
  $('input', m).focus();
}
function formSekolah(row) {
  const ds = desaList();
  modal({
    title: row ? 'Ubah Sekolah' : 'Tambah Sekolah',
    body: `<label class="f"><span>Nama sekolah</span><input class="inp" name="nama" value="${esc(row ? row.nama : '')}" placeholder="mis. SMP Negeri 1 Tommo" required></label>
      <div class="row"><label class="f"><span>Jenjang</span><select class="inp" name="jenjang">${JENJANG.map(j => `<option ${row && row.jenjang === j ? 'selected' : ''}>${j}</option>`).join('')}</select></label>
      <label class="f"><span>Desa/Kelurahan</span><select class="inp" name="desaId">${opsi(ds, row ? row.desaId : '')}</select></label></div>`,
    ok: 'Simpan',
    onOk: f => {
      const nama = f.nama.value.trim();
      if (!nama) throw new Error('Nama sekolah wajib diisi');
      simpanLokal('Sekolah', Object.assign({}, row || { id: uid('sk'), del: '' }, { nama, jenjang: f.jenjang.value, desaId: f.desaId.value }));
    }
  });
}
function formKelas(row, sekolahId) {
  const sek = sekolahList();
  modal({
    title: row ? 'Ubah Kelas' : 'Tambah Kelas',
    body: `<div class="row"><label class="f"><span>Nama kelas</span><input class="inp" name="nama" value="${esc(row ? row.nama : '')}" placeholder="mis. 7.1 atau VII A" required></label>
      <label class="f"><span>Tingkat</span><select class="inp" name="tingkat">${['7', '8', '9', '10', '11', '12'].map(t => `<option ${row && row.tingkat === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <label class="f"><span>Sekolah</span><select class="inp" name="sekolahId">${opsi(sek, row ? row.sekolahId : sekolahId)}</select></label>`,
    ok: 'Simpan',
    onOpen: m => { const n = $('[name=nama]', m), t = $('[name=tingkat]', m); n.oninput = () => { const x = tingkatDari(n.value); if (x) t.value = x; }; },
    onOk: f => {
      const nama = f.nama.value.trim();
      if (!nama) throw new Error('Nama kelas wajib diisi');
      if (kelasList(f.sekolahId.value).some(k => k.nama.toLowerCase() === nama.toLowerCase() && (!row || k.id !== row.id))) throw new Error('Kelas dengan nama ini sudah ada di sekolah tersebut');
      simpanLokal('Kelas', Object.assign({}, row || { id: uid('kl'), del: '', ta: S.taAktif }, { nama, tingkat: f.tingkat.value, sekolahId: f.sekolahId.value }));
    }
  });
}
function hapusMaster(t, id) {
  const row = getRow(t, id);
  if (t === 'Desa' && sekolahList(id).length) return toast('Desa ini masih memiliki sekolah. Pindahkan/hapus sekolahnya dulu.', true);
  if (t === 'Sekolah' && kelasList(id).length) return toast('Sekolah ini masih memiliki kelas. Hapus kelasnya dulu.', true);
  if (t === 'Kelas') {
    const sw = siswiList(id);
    if (!confirm(`Hapus kelas ${row.nama}${sw.length ? ` beserta ${sw.length} siswi dan catatan TTD-nya` : ''}?`)) return;
    sw.forEach(s => simpanLokal('Siswi', Object.assign({}, s, { del: '1' })));
  } else if (!confirm(`Hapus ${row.nama}?`)) return;
  simpanLokal(t, Object.assign({}, row, { del: '1' }));
  rerender();
}
async function naikKelas() {
  const dari = taSebelum(S.taAktif);
  if (kelasList().length && !confirm(`Sudah ada ${kelasList().length} kelas di TA ${S.taAktif}. Kelas hasil naik kelas akan ditambahkan (kelas bernama sama dipakai ulang). Lanjutkan?`)) return;
  if (!navigator.onLine) return toast('Fitur ini memerlukan internet', true);
  try {
    if (pendingCount()) await sinkron();
    const r = await api('naikKelas', { fromTa: dari, toTa: S.taAktif });
    toast(`Selesai: ${r.kelas} kelas baru, ${r.siswi} siswi dipindahkan, ${r.lulus} siswi lulus`);
    await sinkron({ full: true });
  } catch (e) { toast(e.message, true); }
}

/* ---------- DATA SISWI ---------- */
PAGES.siswi = v => {
  const sk = pilihSekolahKelas('sw');
  const q = (S.ui.swQ || '').toLowerCase();
  const sw = sk.kid ? siswiList(sk.kid).filter(s => !q || s.nama.toLowerCase().includes(q) || String(s.nik).includes(q)) : [];
  v.innerHTML = `
  <div class="card"><h3>${ic('upload')} Tambah data siswi</h3>
    <p class="small muted" style="margin-top:0">Upload file <b>Excel (.xlsx)</b>, <b>CSV</b>, atau <b>Word (.docx) berisi tabel</b>. Bisa juga salin–tempel dari Excel/Word/WhatsApp. Satu file boleh berisi banyak kelas — kelas dibuat otomatis.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="btnUp" ${sekolahList().length ? '' : 'disabled'}>${ic('upload')} Upload / tempel data</button>
      <button class="btn ghost" id="btnTpl">${ic('download')} Unduh template Excel</button>
      <button class="btn ghost" id="btnAdd" ${sk.kid ? '' : 'disabled'}>${ic('plus')} Tambah satu siswi</button>
    </div>
    ${sekolahList().length ? '' : '<div class="alert warn">Tambahkan sekolah terlebih dahulu di menu <a href="#sekolah">Desa, Sekolah &amp; Kelas</a>.</div>'}
  </div>
  <div class="card"><div class="row">${sk.html}<label class="f"><span>Cari</span><input class="inp" id="swQ" value="${esc(S.ui.swQ || '')}" placeholder="nama atau NIK"></label></div>
    ${sk.kid ? `<div class="tbl-wrap"><table class="t list"><thead><tr><th>No</th><th class="l">Nama</th><th class="l">NIK</th><th class="l">Tgl lahir</th><th></th></tr></thead><tbody>
    ${sw.length ? sw.map((s, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(s.nama)}</td><td>${esc(s.nik || '-')}</td><td>${s.tglLahir ? esc(s.tglLahir.split('-').reverse().join('/')) + usiaInfo(s) : '-'}</td><td class="act"><button class="btn sm ghost" data-ed="${esc(s.id)}">Ubah</button> <button class="btn sm danger" data-del="${esc(s.id)}">Hapus</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">Belum ada siswi.</td></tr>'}
    </tbody></table></div><p class="small muted">${siswiList(sk.kid).length} siswi di kelas ini.</p>` : '<div class="empty">Belum ada kelas.</div>'}
  </div>`;
  bindUi(v);
  const qi = $('#swQ');
  qi.oninput = () => { S.ui.swQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { rerender(); const n = $('#swQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); };
  $('#btnUp').onclick = () => wizardUpload(sk.sid);
  $('#btnTpl').onclick = () => runExport(exportTemplate);
  $('#btnAdd').onclick = () => formSiswi(null, sk.kid);
  $$('[data-ed]', v).forEach(b => b.onclick = () => formSiswi(getRow('Siswi', b.dataset.ed)));
  $$('[data-del]', v).forEach(b => b.onclick = () => {
    const s = getRow('Siswi', b.dataset.del);
    if (confirm(`Hapus ${s.nama} dari daftar? (mis. pindah sekolah)`)) { simpanLokal('Siswi', Object.assign({}, s, { del: '1' })); rerender(); }
  });
};
function formSiswi(row, kelasId) {
  const kel = kelasList();
  const lbl = k => k.nama + ' · ' + ((getRow('Sekolah', k.sekolahId) || {}).nama || '');
  modal({
    title: row ? 'Ubah Data Siswi' : 'Tambah Siswi',
    body: `<label class="f"><span>Nama remaja putri</span><input class="inp" name="nama" value="${esc(row ? row.nama : '')}" required></label>
      <div class="row"><label class="f"><span>NIK (opsional)</span><input class="inp" name="nik" inputmode="numeric" maxlength="16" value="${esc(row ? row.nik : '')}"></label>
      <label class="f"><span>Tanggal lahir (opsional)</span><input class="inp" type="date" name="tgl" value="${esc(row ? row.tglLahir : '')}"></label></div>
      <label class="f"><span>Kelas</span><select class="inp" name="kelasId">${opsi(kel, row ? row.kelasId : kelasId, '', lbl)}</select></label>`,
    ok: 'Simpan',
    onOk: f => {
      const nama = f.nama.value.trim().replace(/\s+/g, ' ');
      const nik = f.nik.value.replace(/\D/g, '');
      if (!nama) throw new Error('Nama wajib diisi');
      if (nik && nik.length !== 16) throw new Error('NIK harus 16 digit (atau kosongkan)');
      if (nik && siswiList().some(s => s.nik === nik && (!row || s.id !== row.id))) throw new Error('NIK sudah terdaftar pada siswi lain');
      simpanLokal('Siswi', Object.assign({}, row || { id: uid('sw'), del: '', ta: S.taAktif }, { nama, nik, tglLahir: f.tgl.value, kelasId: f.kelasId.value }));
    }
  });
}

/* ---------- SINKRON ---------- */
PAGES.sinkron = v => {
  const per = {};
  Object.keys(S.queue).forEach(k => { const t = k.split(':')[0]; per[t] = (per[t] || 0) + 1; });
  const LBL = { TTD: 'Catatan TTD mingguan', Siswi: 'Data siswi', Kelas: 'Kelas', Sekolah: 'Sekolah', Desa: 'Desa/kelurahan' };
  v.innerHTML = `<div class="card"><h3>${ic('sync')} Status sinkronisasi</h3>
    <div class="stats" style="margin-bottom:6px">
      <div class="stat"><small>Koneksi</small><b style="font-size:20px">${S.online ? 'Online' : 'Offline'}</b><span>${S.online ? 'terhubung ke server' : 'data disimpan di HP'}</span></div>
      <div class="stat"><small>Belum terkirim</small><b>${pendingCount()}</b><span>baris data</span></div>
      <div class="stat"><small>Sinkron terakhir</small><b style="font-size:16px">${fmtWaktu(S.lastSync)}</b><span>&nbsp;</span></div>
    </div>
    ${pendingCount() ? `<table class="t list" style="margin:10px 0">${Object.keys(per).map(t => `<tr><td>${LBL[t] || t}</td><td class="act"><b>${per[t]}</b></td></tr>`).join('')}</table>` : '<p class="muted">Semua data sudah terkirim ke server. ✅</p>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="sNow">${ic('sync')} Sinkron sekarang</button><button class="btn ghost" id="sFull">Unduh ulang semua data</button></div>
    <div class="alert info" style="margin-top:14px">Saat offline, setiap isian langsung tersimpan di HP. Begitu ada sinyal, data terkirim otomatis. Jangan menghapus data browser/aplikasi sebelum semua data terkirim.</div></div>`;
  $('#sNow').onclick = () => sinkron({ notify: true });
  $('#sFull').onclick = () => { if (pendingCount()) return toast('Kirim dulu data yang tertunda', true); sinkron({ full: true, notify: true }); };
};

/* ---------- AKUN ---------- */
PAGES.akun = v => {
  const u = S.user;
  v.innerHTML = `<div class="card"><h3>${ic('user')} Akun</h3>
    <table class="t list"><tbody>
    <tr><td>Nama</td><td><b>${esc(u.nama)}</b></td></tr><tr><td>Username</td><td>${esc(u.username)}</td></tr>
    <tr><td>Peran</td><td>${ROLE_LABEL[u.role]}</td></tr>
    <tr><td>Wilayah</td><td>${esc(u.role === 'pkm' ? namaPkm(u.pkmId) + ' · ' + namaKab(u.kab) : u.role === 'kab' ? namaKab(u.kab) : 'Provinsi Sulawesi Barat')}</td></tr>
    <tr><td>Tahun ajaran aktif</td><td>${esc(S.taAktif)}</td></tr></tbody></table>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="gp">Ganti PIN</button><button class="btn danger" id="lo">${ic('logout')} Keluar</button></div></div>`;
  $('#gp').onclick = () => modalGantiPin(false);
  $('#lo').onclick = keluar;
};
function modalGantiPin(wajib) {
  modal({
    title: wajib ? 'Ganti PIN awal Anda' : 'Ganti PIN',
    closable: !wajib,
    body: `${wajib ? '<div class="alert warn">Demi keamanan, PIN awal wajib diganti sebelum melanjutkan.</div>' : ''}
      <label class="f"><span>PIN lama</span><input class="inp" type="password" inputmode="numeric" name="old" required></label>
      <label class="f"><span>PIN baru (minimal 6 angka)</span><input class="inp" type="password" inputmode="numeric" name="n1" required></label>
      <label class="f"><span>Ulangi PIN baru</span><input class="inp" type="password" inputmode="numeric" name="n2" required></label>`,
    ok: 'Simpan PIN',
    onOk: async f => {
      if (!/^\d{6,}$/.test(f.n1.value)) throw new Error('PIN baru minimal 6 angka');
      if (f.n1.value !== f.n2.value) throw new Error('Ulangan PIN tidak sama');
      const r = await api('changePin', { oldPin: f.old.value, newPin: f.n1.value });
      S.user = r.user; persist(); toast('PIN berhasil diganti');
    }
  });
}

/* ---------- PANDUAN ---------- */
PAGES.panduan = v => {
  v.innerHTML = `<div class="card"><h3>${ic('book')} Alur kerja petugas gizi</h3><ol style="line-height:1.75;margin:0;padding-left:20px">
    <li><b>Desa, Sekolah &amp; Kelas</b> — daftarkan desa/kelurahan wilayah kerja, lalu semua SMP/MTs/SMA/SMK/MA di tiap desa.</li>
    <li><b>Data Siswi</b> — upload daftar remaja putri per sekolah (Excel/Word/CSV/tempel). Kelas dibuat otomatis. NIK boleh kosong.</li>
    <li><b>Input TTD Mingguan</b> — setiap minggu pilih sekolah, kelas, bulan &amp; minggu, lalu ketuk kode tiap siswi.</li>
    <li><b>Register &amp; Rekap</b> — semua jumlah, kumulatif, dan klasifikasi &lt; 26 / ≥ 26 tablet dihitung otomatis. Unduh Excel untuk arsip atau laporan.</li>
    <li><b>SIGIZI KESGA</b> — entri angka dari <a href="#rekap-desa">Rekap Desa/Kelurahan</a> ke laporan bulanan.</li></ol></div>
  <div class="card"><h3>Arti kode mingguan</h3><table class="t list"><tbody>
    <tr><td style="width:60px"><b class="k1" style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px">1</b></td><td>Remaja putri <b>mendapat dan meminum</b> TTD</td></tr>
    <tr><td><b class="k0" style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px">0</b></td><td><b>Mendapat</b> TTD tetapi <b>tidak meminum</b></td></tr>
    <tr><td><b class="kX" style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px">X</b></td><td><b>Tidak mendapat</b> TTD</td></tr>
    <tr><td><b class="kS" style="display:inline-grid;place-items:center;width:28px;height:28px;border-radius:7px">–</b></td><td>Belum terdaftar di sekolah tersebut, atau tidak menerima TTD karena di luar rentang usia 12–18 tahun (tidak dihitung dalam jumlah rematri bulan itu)</td></tr>
  </tbody></table></div>
  <div class="card"><h3>Rumus yang dipakai</h3><ul style="line-height:1.75;margin:0;padding-left:20px">
    <li>Jumlah TTD <b>didapat</b> bulan ini = banyaknya kode <b>1</b> dan <b>0</b> pada minggu aktif.</li>
    <li>Jumlah TTD <b>diminum</b> bulan ini = banyaknya kode <b>1</b>.</li>
    <li>Kumulatif s.d. bulan ini = kumulatif bulan lalu + bulan ini. Dihitung mulai <b>Juli</b> dan kembali ke nol setiap tahun ajaran baru.</li>
    <li>Rekap: jumlah rematri yang kumulatifnya <b>&lt; 26</b> dan <b>≥ 26</b> tablet, untuk "dapat" dan "minum".</li>
    <li>Minggu yang ditandai <b>libur</b> pada kalender sekolah tidak dihitung. Minggu V hanya muncul pada bulan yang diatur 5 minggu.</li></ul></div>
  <div class="card"><h3>Tentang aplikasi</h3><p style="margin:0">TTD Rematri Sulbar · Developed: <b>Manjilala, S.Gz., M.Gizi</b> · Jurusan Gizi, Poltekkes Kemenkes Makassar.</p></div>
  <div class="card"><h3>Pasang di HP</h3><p style="margin:0">Buka aplikasi ini di Chrome → menu ⋮ → <b>Tambahkan ke layar utama / Instal aplikasi</b>. Setelah itu aplikasi bisa dibuka tanpa internet.</p></div>`;
};

/* ---------- ADMIN: PUSKESMAS ---------- */
PAGES.puskesmas = v => {
  const kabF = S.user.role === 'kab' ? S.user.kab : (S.ui.pkKab || '');
  const list = S.pkm.filter(p => !kabF || p.kab === kabF).sort((a, b) => (a.kab + a.nama).localeCompare(b.kab + b.nama));
  v.innerHTML = `<div class="card"><h3>${ic('upload')} Import sekaligus dari Excel</h3>
    <p class="small muted" style="margin-top:0">Upload file Excel/CSV berisi daftar puskesmas${S.user.role === 'prov' ? ' per kabupaten/kota' : ''}. Kolom minimal: <b>${S.user.role === 'prov' ? 'Kabupaten/Kota dan ' : ''}Nama Puskesmas</b>. Opsional: Username, Nama Petugas, PIN. Akun petugas bisa dibuatkan otomatis.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="impPk">${ic('upload')} Import dari Excel</button><button class="btn ghost" id="tplPk">${ic('download')} Unduh template</button></div></div>
  <div class="card"><h3>${ic('hosp')} Daftar puskesmas<button class="btn sm right" id="addPk">${ic('plus')} Tambah</button></h3>
    ${S.user.role === 'prov' ? `<div class="row"><label class="f"><span>Kabupaten/Kota</span><select class="inp" data-ui="pkKab"><option value="">Semua</option>${S.kab.map(k => `<option value="${k.id}" ${k.id === kabF ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label></div>` : ''}
    ${list.length ? `<div class="tbl-wrap"><table class="t list"><thead><tr><th class="l">Puskesmas</th><th class="l">Kabupaten/Kota</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td>${esc(p.nama)}</td><td>${esc(namaKab(p.kab))}</td><td class="act"><button class="btn sm ghost" data-ed="${esc(p.id)}">Ubah</button> <button class="btn sm danger" data-del="${esc(p.id)}">Hapus</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Belum ada puskesmas.</div>'}
    <p class="small muted">${list.length} puskesmas. Setelah puskesmas dibuat, buatkan akun petugasnya di menu <a href="#pengguna">Akun Pengguna</a>.</p></div>`;
  bindUi(v);
  $('#addPk').onclick = () => formPkm();
  $('#impPk').onclick = () => wizardImportPkm();
  $('#tplPk').onclick = () => runExport(exportTemplatePkm);
  $$('[data-ed]', v).forEach(b => b.onclick = () => formPkm(S.pkm.find(p => p.id === b.dataset.ed)));
  $$('[data-del]', v).forEach(b => b.onclick = async () => {
    const p = S.pkm.find(x => x.id === b.dataset.del);
    if (!confirm(`Hapus ${p.nama}? Data pencatatannya tetap tersimpan di Google Sheet, tetapi puskesmas ini tidak tampil lagi.`)) return;
    try { const r = await api('savePkm', { pkm: { id: p.id, kab: p.kab, nama: p.nama, del: true } }); S.pkm = r.pkm; S.wil = null; persist(); rerender(); renderShell(); } catch (e) { toast(e.message, true); }
  });
};
function formPkm(row) {
  modal({
    title: row ? 'Ubah Puskesmas' : 'Tambah Puskesmas',
    body: `<label class="f"><span>Nama puskesmas</span><input class="inp" name="nama" value="${esc(row ? row.nama : '')}" placeholder="mis. Puskesmas Tommo" required></label>
      ${S.user.role === 'prov' ? `<label class="f"><span>Kabupaten/Kota</span><select class="inp" name="kab">${S.kab.map(k => `<option value="${k.id}" ${(row ? row.kab : S.ui.pkKab) === k.id ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>` : ''}`,
    ok: 'Simpan',
    onOk: async f => {
      const r = await api('savePkm', { pkm: { id: row ? row.id : '', nama: f.nama.value, kab: f.kab ? f.kab.value : S.user.kab } });
      S.pkm = r.pkm; S.wil = null; persist(); toast('Tersimpan'); renderShell();
    }
  });
}

/* ---------- IMPORT PUSKESMAS MASSAL ---------- */
function cocokKab(teksKab) {
  const t = String(teksKab || '').toLowerCase().replace(/kabupaten|kab\.?|kota/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (/tengah|mateng/.test(t)) return 'mateng';
  if (/polewali|polman|mandar/.test(t)) return 'polman';
  if (/pasangkayu|utara|matra/.test(t)) return 'pasangkayu';
  if (/majene/.test(t)) return 'majene';
  if (/mamasa/.test(t)) return 'mamasa';
  if (/mamuju/.test(t)) return 'mamuju';
  const k = S.kab.find(x => x.id === t || x.nama.toLowerCase().includes(t));
  return k ? k.id : '';
}
function wizardImportPkm() {
  const prov = S.user.role === 'prov';
  const st = { tables: null, ti: 0, hdr: 0, map: {}, kabTetap: prov ? '' : S.user.kab, buatAkun: true };
  const m = modal({
    title: 'Import Puskesmas dari Excel', wide: true, ok: '', onOk: () => {},
    body: `<div class="steps"><span class="on">1. Pilih file</span><span>2. Cocokkan kolom</span><span>3. Periksa &amp; simpan</span></div><div id="wz"></div>`
  });
  const wz = $('#wz', m), foot = $('.modal-f', m);
  const steps = $$('.steps span', m);
  const setStep = n => steps.forEach((s, i) => s.classList.toggle('on', i === n));
  const tutup = () => m.parentNode.remove();

  function step1() {
    setStep(0);
    foot.innerHTML = '<button type="button" class="btn ghost" id="bt">Batal</button>';
    $('#bt', foot).onclick = tutup;
    wz.innerHTML = `<label class="drop">${ic('upload')}<div><b>Pilih file Excel / CSV</b></div><div class="small muted">Satu baris = satu puskesmas. Satu file boleh berisi beberapa sheet (mis. per kabupaten).</div>
      <input type="file" id="fileIn" accept=".xlsx,.xlsm,.csv,.txt,.docx,.xls" hidden></label>
      <p class="small muted" style="text-align:center;margin:12px 0">— atau —</p>
      <label class="f"><span>Tempel tabel dari Excel</span><textarea class="inp" id="paste" placeholder="Kabupaten/Kota&#9;Nama Puskesmas&#10;Mamuju&#9;Puskesmas Tommo"></textarea></label>
      <button type="button" class="btn ghost" id="usePaste">Gunakan teks tempelan</button><div id="e1"></div>`;
    $('#fileIn', wz).onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      $('#e1', wz).innerHTML = '<div class="loading"><span class="spinner dark"></span> Membaca file…</div>';
      try { st.tables = await bacaFile(f); st.ti = 0; deteksi(); step2(); } catch (err) { $('#e1', wz).innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
    };
    $('#usePaste', wz).onclick = () => {
      const rows = parseDelimited($('#paste', wz).value);
      if (!rows.length) return ($('#e1', wz).innerHTML = '<div class="alert err">Teks tempelan masih kosong.</div>');
      st.tables = [{ name: 'Teks tempelan', rows }]; st.ti = 0; deteksi(); step2();
    };
  }
  function deteksi() {
    const rows = st.tables[st.ti].rows;
    st.hdr = -1;
    st.hdr = barisJudul(rows, /puskesmas|pkm|nama|kab|kota|^no\.?$|user|pin|petugas|tpg/i);
    const head = st.hdr >= 0 ? rows[st.hdr].map(teks) : [];
    const find = (re, not) => head.findIndex(h => re.test(h) && !(not && not.test(h)));
    st.map = {
      kab: find(/kab|kota|wilayah/i),
      nama: (() => { const a = find(/puskesmas|pkm|faskes/i, /user|petugas|kode|kepala|alamat/i); return a >= 0 ? a : find(/nama/i, /petugas|kepala|user/i); })(),
      username: find(/user/i),
      namaPetugas: find(/petugas|nutrisionis|tpg|pengelola/i, /user/i),
      pin: find(/\bpin\b|password|sandi/i)
    };
    if (st.hdr < 0) st.map = { kab: prov ? 0 : -1, nama: prov ? 1 : 0, username: -1, namaPetugas: -1, pin: -1 };
    if (st.map.nama < 0) st.map.nama = 0;
  }
  function step2() {
    setStep(1);
    const rows = st.tables[st.ti].rows;
    const ncol = Math.max(...rows.slice(0, 50).map(r => r.length));
    const head = st.hdr >= 0 ? rows[st.hdr].map(teks) : [];
    const colOpt = (sel, wajib) => (wajib ? '' : '<option value="-1">— tidak ada —</option>') + Array.from({ length: ncol }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>Kolom ${String.fromCharCode(65 + i)}${head[i] ? ': ' + esc(head[i].slice(0, 30)) : ''}</option>`).join('');
    const contoh = rows.slice(st.hdr + 1, st.hdr + 6);
    wz.innerHTML = `
      ${st.tables.length > 1 ? `<label class="f"><span>Sumber data</span><select class="inp" id="tSel">${st.tables.map((t, i) => `<option value="${i}" ${i === st.ti ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label><p class="small muted" style="margin-top:-6px">File ini punya beberapa sheet. Import satu per satu, atau gabungkan dulu dalam satu sheet.</p>` : ''}
      <label class="f"><span>Baris judul kolom</span><select class="inp" id="hSel"><option value="-1">Tidak ada judul</option>${rows.slice(0, 15).map((r, i) => `<option value="${i}" ${i === st.hdr ? 'selected' : ''}>Baris ${i + 1}: ${esc(r.map(teks).filter(Boolean).join(' | ').slice(0, 70))}</option>`).join('')}</select></label>
      <div class="row">
        <label class="f"><span>Nama puskesmas *</span><select class="inp" data-m="nama">${colOpt(st.map.nama, true)}</select></label>
        ${prov ? `<label class="f"><span>Kabupaten/Kota</span><select class="inp" data-m="kab">${colOpt(st.map.kab)}</select></label>` : ''}
      </div>
      ${prov && st.map.kab < 0 ? `<label class="f"><span>Semua baris masuk ke kabupaten/kota</span><select class="inp" id="kabT"><option value="">— pilih —</option>${S.kab.map(k => `<option value="${k.id}" ${k.id === st.kabTetap ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>` : ''}
      <div class="row">
        <label class="f"><span>Username petugas</span><select class="inp" data-m="username">${colOpt(st.map.username)}</select></label>
        <label class="f"><span>Nama petugas</span><select class="inp" data-m="namaPetugas">${colOpt(st.map.namaPetugas)}</select></label>
        <label class="f"><span>PIN awal</span><select class="inp" data-m="pin">${colOpt(st.map.pin)}</select></label>
      </div>
      <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="ba" ${st.buatAkun ? 'checked' : ''}> Buatkan akun petugas otomatis bila username kosong (mis. <b>gizi.tommo</b>, PIN acak 6 angka)</label>
      <p class="small muted" style="margin-bottom:6px">Contoh data:</p>
      <div class="tbl-wrap" style="max-height:190px"><table class="t"><tbody>${contoh.map(r => `<tr>${Array.from({ length: ncol }, (_, i) => `<td class="l">${esc(teks(r[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div id="e2"></div>`;
    foot.innerHTML = '<button type="button" class="btn ghost" id="bk">Kembali</button><button type="button" class="btn" id="nx">Lanjut: periksa</button>';
    $('#bk', foot).onclick = step1;
    if ($('#tSel', wz)) $('#tSel', wz).onchange = e => { st.ti = +e.target.value; deteksi(); step2(); };
    $('#hSel', wz).onchange = e => { st.hdr = +e.target.value; step2(); };
    $$('[data-m]', wz).forEach(sl => sl.onchange = () => { st.map[sl.dataset.m] = +sl.value; if (sl.dataset.m === 'kab') step2(); });
    if ($('#kabT', wz)) $('#kabT', wz).onchange = e => { st.kabTetap = e.target.value; };
    $('#ba', wz).onchange = e => { st.buatAkun = e.target.checked; };
    $('#nx', foot).onclick = () => {
      if (prov && st.map.kab < 0 && !st.kabTetap) return ($('#e2', wz).innerHTML = '<div class="alert err">Tentukan kolom kabupaten/kota, atau pilih satu kabupaten untuk semua baris.</div>');
      step3();
    };
  }
  function step3() {
    setStep(2);
    const rows = st.tables[st.ti].rows.slice(st.hdr + 1);
    const items = [];
    const seen = new Set();
    rows.forEach((r, i) => {
      const nama = teks(r[st.map.nama]).replace(/\s+/g, ' ');
      if (!nama || /^\d+$/.test(nama) || /^(jumlah|total)/i.test(nama)) return;
      const kabTeks = prov && st.map.kab >= 0 ? teks(r[st.map.kab]) : '';
      const kab = prov ? (st.map.kab >= 0 ? cocokKab(kabTeks) : st.kabTetap) : S.user.kab;
      const it = {
        baris: st.hdr + 2 + i, nama, kab, kabTeks,
        username: st.map.username >= 0 ? teks(r[st.map.username]).toLowerCase() : '',
        namaPetugas: st.map.namaPetugas >= 0 ? teks(r[st.map.namaPetugas]) : '',
        pin: st.map.pin >= 0 ? teks(r[st.map.pin]).replace(/\D/g, '') : '', warn: [], skip: false
      };
      if (!kab) { it.warn.push(`kabupaten "${kabTeks || '-'}" tidak dikenali`); it.skip = true; }
      const key = kab + '|' + nama.toLowerCase();
      if (seen.has(key)) { it.warn.push('ganda di file'); it.skip = true; }
      if (S.pkm.some(p => p.kab === kab && p.nama.toLowerCase() === nama.toLowerCase())) it.warn.push('sudah terdaftar (hanya akun yang dibuat)');
      if (it.pin && it.pin.length < 6) { it.warn.push('PIN < 6 angka, dibuat acak'); it.pin = ''; }
      seen.add(key);
      items.push(it);
    });
    const ok = items.filter(x => !x.skip);
    const perKab = {};
    ok.forEach(x => { perKab[x.kab] = (perKab[x.kab] || 0) + 1; });
    wz.innerHTML = `
      <div class="stats"><div class="stat"><small>Siap diimport</small><b>${ok.length}</b><span>${Object.keys(perKab).map(k => esc(namaKab(k).replace('Kabupaten ', '')) + ': ' + perKab[k]).join(' · ')}</span></div>
      <div class="stat"><small>Dilewati</small><b>${items.length - ok.length}</b></div>
      <div class="stat"><small>Akun petugas</small><b>${ok.filter(x => x.username || st.buatAkun).length}</b><span>${st.buatAkun ? 'termasuk yang dibuat otomatis' : ''}</span></div></div>
      <div class="tbl-wrap" style="max-height:330px"><table class="t list"><thead><tr><th>Baris</th><th class="l">Puskesmas</th><th class="l">Kabupaten/Kota</th><th class="l">Username</th><th class="l">Catatan</th></tr></thead><tbody>
      ${items.map(x => `<tr style="${x.skip ? 'opacity:.55' : ''}"><td>${x.baris}</td><td>${esc(x.nama)}</td><td>${esc(x.kab ? namaKab(x.kab) : x.kabTeks)}</td><td>${esc(x.username || (st.buatAkun ? '(otomatis)' : '-'))}</td><td>${x.skip ? '<span class="pill err">dilewati</span> ' : ''}${x.warn.map(w => `<span class="pill warn">${esc(w)}</span>`).join(' ')}</td></tr>`).join('')}
      </tbody></table></div><div id="e3"></div>`;
    foot.innerHTML = `<button type="button" class="btn ghost" id="bk">Kembali</button><button type="button" class="btn" id="sv" ${ok.length ? '' : 'disabled'}>Import ${ok.length} puskesmas</button>`;
    $('#bk', foot).onclick = step2;
    $('#sv', foot).onclick = async () => {
      const b = $('#sv', foot); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Menyimpan…';
      try {
        const r = await api('importPkm', { rows: ok.map(x => ({ kab: x.kab, nama: x.nama, username: x.username, namaPetugas: x.namaPetugas, pin: x.pin })), buatAkun: st.buatAkun }, 180000);
        S.pkm = r.pkm; S.wil = null; persist();
        hasil(r.hasil);
      } catch (e) { $('#e3', wz).innerHTML = `<div class="alert err">${esc(e.message)}</div>`; b.disabled = false; b.textContent = 'Coba lagi'; }
    };
  }
  function hasil(rows) {
    const akun = rows.filter(x => x.pin);
    wz.innerHTML = `<div class="alert info">Import selesai: <b>${rows.filter(x => /baru/.test(x.status)).length}</b> puskesmas baru, <b>${akun.length}</b> akun petugas dibuat.</div>
      ${akun.length ? '<div class="alert warn"><b>Penting:</b> PIN awal hanya ditampilkan sekali ini. Unduh daftar akun sekarang, lalu bagikan ke masing-masing petugas. PIN wajib diganti saat login pertama.</div>' : ''}
      <div class="tbl-wrap" style="max-height:330px"><table class="t list"><thead><tr><th class="l">Puskesmas</th><th class="l">Kabupaten/Kota</th><th class="l">Username</th><th class="l">PIN awal</th><th class="l">Status</th></tr></thead><tbody>
      ${rows.map(x => `<tr><td>${esc(x.nama)}</td><td>${esc(namaKab(x.kab))}</td><td><b>${esc(x.username || '-')}</b></td><td>${esc(x.pin || '-')}</td><td class="small">${esc(x.status)}</td></tr>`).join('')}</tbody></table></div>`;
    foot.innerHTML = `${akun.length ? `<button type="button" class="btn" id="dlAk">${ic('download')} Unduh daftar akun (Excel)</button>` : ''}<button type="button" class="btn ghost" id="sl">Selesai</button>`;
    if ($('#dlAk', foot)) $('#dlAk', foot).onclick = () => runExport(() => exportDaftarAkun(rows));
    $('#sl', foot).onclick = () => { tutup(); renderShell(); };
  }
  step1();
}

/* ---------- ADMIN: PENGGUNA ---------- */
PAGES.pengguna = v => {
  v.innerHTML = '<div class="loading"><span class="spinner dark"></span> Memuat akun…</div>';
  api('listUsers').then(r => {
    S.users = r.users;
    const urut = { prov: 0, kab: 1, pkm: 2 };
    const list = r.users.slice().sort((a, b) => urut[a.role] - urut[b.role] || a.username.localeCompare(b.username));
    v.innerHTML = `<div class="card"><h3>${ic('users')} Akun pengguna<button class="btn sm right" id="addU">${ic('plus')} Tambah akun</button></h3>
      <div class="tbl-wrap"><table class="t list"><thead><tr><th class="l">Username</th><th class="l">Nama</th><th class="l">Peran</th><th class="l">Wilayah</th><th class="l">Status</th><th></th></tr></thead><tbody>
      ${list.map(u => `<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.nama)}</td><td>${ROLE_LABEL[u.role]}</td><td>${esc(u.role === 'pkm' ? namaPkm(u.pkmId) : u.role === 'kab' ? namaKab(u.kab) : 'Provinsi')}</td>
      <td>${u.aktif ? '<span class="pill">Aktif</span>' : '<span class="pill grey">Nonaktif</span>'}${u.mustChange ? ' <span class="pill warn">PIN awal</span>' : ''}</td>
      <td class="act">${u.username === S.user.username ? '' : `<button class="btn sm ghost" data-u="${esc(u.username)}">Ubah / reset PIN</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Berikan username dan PIN awal kepada petugas. Saat login pertama, petugas wajib mengganti PIN.</p></div>`;
    $('#addU').onclick = () => formUser();
    $$('[data-u]', v).forEach(b => b.onclick = () => formUser(S.users.find(u => u.username === b.dataset.u)));
  }).catch(e => { v.innerHTML = `<div class="alert ${e.net ? 'warn' : 'err'}">${e.net ? 'Pengelolaan akun memerlukan internet.' : esc(e.message)}</div>`; });
};
function formUser(u) {
  const roles = S.user.role === 'prov' ? ['pkm', 'kab', 'prov'] : ['pkm'];
  const pkmOpt = S.pkm.slice().sort(byNama).map(p => `<option value="${p.id}" data-kab="${p.kab}" ${u && u.pkmId === p.id ? 'selected' : ''}>${esc(p.nama)}${S.user.role === 'prov' ? ' · ' + esc(namaKab(p.kab)) : ''}</option>`).join('');
  modal({
    title: u ? 'Ubah Akun ' + u.username : 'Tambah Akun',
    body: `<div class="row"><label class="f"><span>Username</span><input class="inp" name="username" value="${esc(u ? u.username : '')}" ${u ? 'readonly' : ''} autocapitalize="none" placeholder="mis. gizi.tommo"></label>
      <label class="f"><span>Nama lengkap</span><input class="inp" name="nama" value="${esc(u ? u.nama : '')}"></label></div>
      <label class="f"><span>Peran</span><select class="inp" name="role">${roles.map(r => `<option value="${r}" ${u && u.role === r ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></label>
      <label class="f" data-for="kab"><span>Kabupaten/Kota</span><select class="inp" name="kab">${S.kab.map(k => `<option value="${k.id}" ${u && u.kab === k.id ? 'selected' : ''}>${esc(k.nama)}</option>`).join('')}</select></label>
      <label class="f" data-for="pkm"><span>Puskesmas</span><select class="inp" name="pkmId">${pkmOpt || '<option value="">— buat puskesmas dulu —</option>'}</select></label>
      <label class="f"><span>${u ? 'Reset PIN (kosongkan jika tidak diubah)' : 'PIN awal (minimal 6 angka)'}</span><input class="inp" name="pin" inputmode="numeric" placeholder="mis. 246810"></label>
      ${u ? `<label class="chk"><input type="checkbox" name="aktif" ${u.aktif ? 'checked' : ''}> Akun aktif</label>` : ''}`,
    ok: 'Simpan',
    onOpen: m => {
      const role = $('[name=role]', m);
      const upd = () => { $('[data-for=kab]', m).classList.toggle('hidden', role.value !== 'kab'); $('[data-for=pkm]', m).classList.toggle('hidden', role.value !== 'pkm'); };
      role.onchange = upd; upd();
    },
    onOk: async f => {
      const r = await api('saveUser', { user: { username: f.username.value, nama: f.nama.value, role: f.role.value, kab: f.kab.value, pkmId: f.pkmId.value, resetPin: f.pin.value, aktif: f.aktif ? f.aktif.checked : true } });
      S.users = r.users; toast('Akun tersimpan'); rerender();
    }
  });
}

/* ---------- ADMIN PROVINSI: KALENDER ---------- */
PAGES.kalender = v => {
  let ta = S.ui.klTa || S.taAktif;
  S.ui.klTa = ta;
  const kal = kalenderMap(S.kalender, ta);
  v.innerHTML = `<div class="card"><h3>${ic('cal')} Tahun ajaran aktif</h3>
    <div class="row"><label class="f"><span>Tahun ajaran aktif saat ini</span><input class="inp" id="taAkt" value="${esc(S.taAktif)}" placeholder="2026/2027"></label>
    <div class="shrink" style="margin-bottom:12px"><button class="btn" id="setTa">Simpan tahun ajaran aktif</button></div></div>
    <p class="small muted" style="margin:0">Ganti di awal Juli. Semua puskesmas otomatis berpindah ke tahun ajaran baru, kumulatif kembali nol, lalu petugas menjalankan "Naik kelas".</p></div>
  <div class="card"><h3>${ic('cal')} Kalender sekolah (berlaku untuk semua sekolah)</h3>
    <div class="row"><label class="f"><span>Tahun ajaran</span><input class="inp" id="klTa" value="${esc(ta)}"></label><div class="shrink" style="margin-bottom:12px"><button class="btn ghost" id="lihat">Tampilkan</button></div></div>
    <div class="tbl-wrap"><table class="t cal-grid"><thead><tr><th class="l">Bulan</th><th>Aktif</th><th>5 minggu</th><th colspan="5">Minggu libur</th></tr></thead><tbody>
    ${bulanTA(ta).map(b => `<tr data-b="${b}"><td class="l"><b>${blnLabel(b)}</b><br><small class="muted">Semester ${+b.split('-')[1] >= 7 ? 1 : 2}</small></td>
      <td><input type="checkbox" class="ak" ${kal[b].aktif ? 'checked' : ''}></td><td><input type="checkbox" class="m5" ${kal[b].minggu === 5 ? 'checked' : ''}></td>
      ${[1, 2, 3, 4, 5].map(w => `<td><label class="chk small">${ROMAWI[w - 1]}<input type="checkbox" class="lb" data-w="${w}" ${kal[b].libur.indexOf(w) >= 0 ? 'checked' : ''}></label></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p class="small muted">Bulan tidak aktif (mis. libur semester penuh) tidak tampil di input, register, maupun rekap. Minggu libur tidak dihitung dalam jumlah tablet.</p>
    <button class="btn" id="saveKal">Simpan kalender</button></div>
  <div class="card"><h3>${ic('file')} Arsip tahun ajaran lama</h3>
    <p class="small muted" style="margin-top:0">Pindahkan data kelas, siswi, dan TTD tahun ajaran lama ke file Google Sheet arsip terpisah, agar database utama tetap ringan. Lakukan setelah semua laporan tahun itu selesai.</p>
    <div class="row"><label class="f"><span>Tahun ajaran yang diarsipkan</span><input class="inp" id="arsTa" placeholder="${esc(taSebelum(S.taAktif))}"></label><div class="shrink" style="margin-bottom:12px"><button class="btn danger" id="ars">Arsipkan</button></div></div></div>`;
  $('#lihat').onclick = () => { S.ui.klTa = $('#klTa').value.trim(); rerender(); };
  $('#setTa').onclick = async () => {
    const t = $('#taAkt').value.trim();
    if (!confirm(`Jadikan ${t} sebagai tahun ajaran aktif untuk semua puskesmas?`)) return;
    try { await api('setTA', { ta: t }); S.ui.klTa = t; S.wil = null; toast('Tahun ajaran aktif: ' + t); await sinkron({ full: true }); renderShell(); } catch (e) { toast(e.message, true); }
  };
  $('#saveKal').onclick = async () => {
    const rows = $$('tr[data-b]', v).map(tr => ({ bulan: tr.dataset.b, aktif: $('.ak', tr).checked, minggu: $('.m5', tr).checked ? 5 : 4, libur: $$('.lb', tr).filter(c => c.checked).map(c => +c.dataset.w).filter(w => w <= ($('.m5', tr).checked ? 5 : 4)) }));
    try { const r = await api('saveKalender', { ta, rows }); S.kalender = r.kalender; S.wil = null; S.ver++; persist(); toast('Kalender tersimpan'); rerender(); } catch (e) { toast(e.message, true); }
  };
  $('#ars').onclick = async () => {
    const t = $('#arsTa').value.trim();
    if (!t || !confirm(`Arsipkan semua data TA ${t}? Data akan dipindah ke file arsip terpisah.`)) return;
    try { const r = await api('arsipTA', { ta: t }, 300000); modal({ title: 'Arsip selesai', body: `<p>${r.jumlah.Kelas} kelas, ${r.jumlah.Siswi} siswi, ${r.jumlah.TTD} baris TTD dipindahkan.</p><p><a href="${esc(r.url)}" target="_blank" rel="noopener">Buka file arsip</a></p>`, ok: 'Tutup', onOk: () => {} }); } catch (e) { toast(e.message, true); }
  };
};

/* ============================ MODAL ============================ */
function modal({ title, body, ok, onOk, onOpen, wide, closable = true, foot }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate><div class="modal-h"><b>${esc(title)}</b>${closable ? '<button type="button" data-x aria-label="Tutup">×</button>' : ''}</div>
    <div class="modal-b">${body}<div class="m-err"></div></div>
    <div class="modal-f">${foot || ''}${closable ? '<button type="button" class="btn ghost" data-x>Batal</button>' : ''}${ok ? `<button class="btn" type="submit">${esc(ok)}</button>` : ''}</div></form>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  $$('[data-x]', bg).forEach(b => b.onclick = close);
  const f = $('form', bg);
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', f);
    btn.disabled = true;
    try {
      await onOk(f);
      close();
      rerender();
    } catch (err) {
      $('.m-err', f).innerHTML = `<div class="alert err">${esc(err.message)}</div>`;
      btn.disabled = false;
    }
  };
  if (onOpen) onOpen(f, close);
  return f;
}

/* ============================ UPLOAD SISWI ============================ */
function parseDelimited(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const first = lines[0];
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  return lines.map(line => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  });
}
function cellVal(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.result !== undefined) return cellVal(v.result);
    if (v.text !== undefined) return cellVal(v.text);
    if (v.error) return '';
    return '';
  }
  return v;
}
async function bacaFile(file) {
  const name = file.name.toLowerCase();
  if (/\.xls$/.test(name)) throw new Error('File .xls (Excel lama) belum didukung. Buka di Excel lalu "Simpan Sebagai" .xlsx.');
  if (/\.doc$/.test(name)) throw new Error('File .doc (Word lama) belum didukung. Buka di Word lalu "Simpan Sebagai" .docx.');
  const buf = await file.arrayBuffer();
  if (/\.(xlsx|xlsm)$/.test(name)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const tables = [];
    wb.eachSheet(ws => {
      const rows = [];
      ws.eachRow({ includeEmpty: false }, row => {
        const arr = [];
        for (let c = 1; c <= ws.columnCount; c++) arr.push(cellVal(row.getCell(c).value));
        rows.push(arr);
      });
      if (rows.length) tables.push({ name: 'Sheet: ' + ws.name, rows });
    });
    return tables;
  }
  if (/\.docx$/.test(name)) {
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const tables = [];
    Array.from(doc.getElementsByTagNameNS(W, 'tbl')).forEach((tbl, i) => {
      if (tbl.parentNode && tbl.parentNode.localName === 'tc') return; // lewati tabel bersarang
      const rows = Array.from(tbl.childNodes).filter(n => n.localName === 'tr').map(tr =>
        Array.from(tr.childNodes).filter(n => n.localName === 'tc').map(tc =>
          Array.from(tc.getElementsByTagNameNS(W, 'p')).map(p => Array.from(p.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join('')).join(' ').trim()));
      if (rows.length) tables.push({ name: 'Tabel ' + (i + 1) + ' (' + rows.length + ' baris)', rows });
    });
    if (!tables.length) throw new Error('Tidak ditemukan tabel di file Word. Pastikan daftar siswi berbentuk tabel.');
    return tables;
  }
  if (/\.(csv|txt|tsv)$/.test(name)) {
    return [{ name: file.name, rows: parseDelimited(new TextDecoder().decode(buf)) }];
  }
  throw new Error('Format file belum didukung. Gunakan .xlsx, .csv, atau .docx');
}
const BLN_ID = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agus: 8, agustus: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, nop: 11, november: 11, nopember: 11, des: 12, desember: 12 };
function parseTanggal(v) {
  const f = (y, m, d) => { y = +y; m = +m; d = +d; if (y < 100) y += y > 40 ? 1900 : 2000; if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2030) return ''; return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
  if (v instanceof Date && !isNaN(v)) return f(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number' && v > 20000 && v < 60000) { const d = new Date(Math.round((v - 25569) * 864e5)); return f(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  let s = String(v || '').trim();
  if (!s) return '';
  if (s.includes(',')) s = s.split(',').pop().trim(); // "Mamuju, 12-03-2012"
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return f(m[1], m[2], m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return f(m[3], m[2], m[1]);
  m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m && BLN_ID[m[2].toLowerCase()]) return f(m[3], BLN_ID[m[2].toLowerCase()], m[1]);
  return '';
}
const teks = v => (v instanceof Date ? '' : String(v == null ? '' : v)).trim();

/** Cari baris judul kolom: baris (≤15 pertama) dengan sel terisi ≥2 dan paling banyak kata kunci. */
function barisJudul(rows, re) {
  let best = -1, skor = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const isi = rows[i].map(teks).filter(Boolean);
    if (isi.length < 2) continue;
    const n = isi.filter(c => re.test(c)).length;
    if (n > skor) { skor = n; best = i; }
  }
  return best;
}
function wizardUpload(defaultSek) {
  const st = { tables: null, ti: 0, hdr: 0, map: {}, sek: defaultSek, kelasTetap: '', preview: null };
  const m = modal({
    title: 'Upload Data Siswi', wide: true, ok: '', onOk: () => {},
    body: `<div class="steps"><span class="on">1. Pilih sumber</span><span>2. Cocokkan kolom</span><span>3. Periksa &amp; simpan</span></div><div id="wz"></div>`
  });
  const wz = $('#wz', m);
  const steps = $$('.steps span', m);
  const setStep = n => steps.forEach((s, i) => s.classList.toggle('on', i === n));
  const foot = $('.modal-f', m);

  function step1() {
    setStep(0);
    foot.innerHTML = '<button type="button" class="btn ghost" data-x>Batal</button>';
    $('[data-x]', foot).onclick = () => m.parentNode.remove();
    wz.innerHTML = `
      <label class="drop" id="drop">${ic('upload')}<div><b>Pilih file</b> atau seret ke sini</div><div class="small muted">Excel (.xlsx), CSV, atau Word (.docx) berisi tabel</div>
      <input type="file" id="fileIn" accept=".xlsx,.xlsm,.csv,.txt,.tsv,.docx,.xls,.doc" hidden></label>
      <p class="small muted" style="text-align:center;margin:12px 0">— atau —</p>
      <label class="f"><span>Tempel tabel (salin dari Excel/Word/WhatsApp, satu siswi per baris)</span><textarea class="inp" id="paste" placeholder="Nama&#9;NIK&#9;Tanggal Lahir&#9;Kelas&#10;Ani Lestari&#9;7601xxxxxxxxxxxx&#9;12/03/2012&#9;7.1"></textarea></label>
      <button type="button" class="btn ghost" id="usePaste">Gunakan teks tempelan</button><div id="e1"></div>`;
    const fi = $('#fileIn', wz), drop = $('#drop', wz);
    const proses = async file => {
      $('#e1', wz).innerHTML = '<div class="loading"><span class="spinner dark"></span> Membaca file…</div>';
      try { st.tables = await bacaFile(file); st.ti = 0; step2(); } catch (e) { $('#e1', wz).innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
    };
    fi.onchange = () => fi.files[0] && proses(fi.files[0]);
    drop.ondragover = e => { e.preventDefault(); };
    drop.ondrop = e => { e.preventDefault(); if (e.dataTransfer.files[0]) proses(e.dataTransfer.files[0]); };
    $('#usePaste', wz).onclick = () => {
      const rows = parseDelimited($('#paste', wz).value);
      if (!rows.length) return ($('#e1', wz).innerHTML = '<div class="alert err">Teks tempelan masih kosong.</div>');
      st.tables = [{ name: 'Teks tempelan', rows }]; st.ti = 0; step2();
    };
  }

  function deteksi() {
    const rows = st.tables[st.ti].rows;
    st.hdr = -1;
    st.hdr = barisJudul(rows, /nama|nik|lahir|kelas|^no\.?$|rombel/i);
    const head = st.hdr >= 0 ? rows[st.hdr].map(teks) : [];
    const find = (re, not) => head.findIndex(h => re.test(h) && !(not && not.test(h)));
    st.map = {
      nama: find(/nama/i, /sekolah|kelas|ibu|ayah|wali|orang/i),
      nik: find(/\bnik\b|kependudukan/i),
      tgl: (() => { const a = find(/lahir/i, /tempat(?!.*tanggal)/i); return a >= 0 ? a : find(/tgl|tanggal/i); })(),
      kelas: find(/kelas|rombel|rombongan/i)
    };
    if (st.hdr < 0) { st.map = { nama: 0, nik: -1, tgl: -1, kelas: -1 }; }
  }

  function step2() {
    setStep(1);
    deteksi();
    render2();
  }
  function render2() {
    const rows = st.tables[st.ti].rows;
    const ncol = Math.max(...rows.slice(0, 50).map(r => r.length));
    const head = st.hdr >= 0 ? rows[st.hdr].map(teks) : [];
    const colOpt = (sel, wajib) => (wajib ? '' : '<option value="-1">— tidak ada —</option>') + Array.from({ length: ncol }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>Kolom ${String.fromCharCode(65 + i)}${head[i] ? ': ' + esc(head[i].slice(0, 30)) : ''}</option>`).join('');
    const sek = sekolahList();
    const kelS = kelasList(st.sek);
    const contoh = rows.slice(st.hdr + 1, st.hdr + 6);
    wz.innerHTML = `
      ${st.tables.length > 1 ? `<label class="f"><span>Sumber data</span><select class="inp" id="tSel">${st.tables.map((t, i) => `<option value="${i}" ${i === st.ti ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      <div class="row">
        <label class="f"><span>Baris judul kolom</span><select class="inp" id="hSel"><option value="-1">Tidak ada judul (data mulai baris 1)</option>${rows.slice(0, 15).map((r, i) => `<option value="${i}" ${i === st.hdr ? 'selected' : ''}>Baris ${i + 1}: ${esc(r.map(teks).filter(Boolean).join(' | ').slice(0, 60))}</option>`).join('')}</select></label>
        <label class="f"><span>Masuk ke sekolah</span><select class="inp" id="sSel">${opsi(sek, st.sek)}</select></label>
      </div>
      <div class="row">
        <label class="f"><span>Nama siswi *</span><select class="inp" data-m="nama">${colOpt(st.map.nama, true)}</select></label>
        <label class="f"><span>NIK</span><select class="inp" data-m="nik">${colOpt(st.map.nik)}</select></label>
        <label class="f"><span>Tanggal lahir</span><select class="inp" data-m="tgl">${colOpt(st.map.tgl)}</select></label>
        <label class="f"><span>Kelas</span><select class="inp" data-m="kelas">${colOpt(st.map.kelas)}</select></label>
      </div>
      ${st.map.kelas < 0 ? `<label class="f"><span>Kelas tujuan (karena file tidak punya kolom kelas)</span><select class="inp" id="kSel">${opsi(kelS, st.kelasTetap, kelS.length ? '— pilih kelas —' : '— buat kelas dulu di menu Sekolah & Kelas —')}</select></label>` : '<p class="small muted">Kelas yang belum ada akan dibuat otomatis di sekolah terpilih.</p>'}
      <p class="small muted" style="margin-bottom:6px">Contoh data:</p>
      <div class="tbl-wrap" style="max-height:200px"><table class="t"><tbody>${contoh.map(r => `<tr>${Array.from({ length: ncol }, (_, i) => `<td class="l">${esc(r[i] instanceof Date ? parseTanggal(r[i]) : teks(r[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div id="e2"></div>`;
    foot.innerHTML = '<button type="button" class="btn ghost" id="bk">Kembali</button><button type="button" class="btn" id="nx">Lanjut: periksa data</button>';
    $('#bk', foot).onclick = step1;
    if ($('#tSel', wz)) $('#tSel', wz).onchange = e => { st.ti = +e.target.value; deteksi(); render2(); };
    $('#hSel', wz).onchange = e => { st.hdr = +e.target.value; render2(); };
    $('#sSel', wz).onchange = e => { st.sek = e.target.value; st.kelasTetap = ''; render2(); };
    $$('[data-m]', wz).forEach(s => s.onchange = () => { st.map[s.dataset.m] = +s.value; if (s.dataset.m === 'kelas') render2(); });
    if ($('#kSel', wz)) $('#kSel', wz).onchange = e => { st.kelasTetap = e.target.value; };
    $('#nx', foot).onclick = () => {
      if (!st.sek) return ($('#e2', wz).innerHTML = '<div class="alert err">Pilih sekolah tujuan.</div>');
      if (st.map.kelas < 0 && !st.kelasTetap) return ($('#e2', wz).innerHTML = '<div class="alert err">Pilih kelas tujuan, atau tentukan kolom kelas.</div>');
      step3();
    };
  }

  function step3() {
    setStep(2);
    const rows = st.tables[st.ti].rows.slice(st.hdr + 1);
    const kelasAda = kelasList(st.sek);
    const nikAda = new Set(siswiList().map(s => s.nik).filter(Boolean));
    const namaKelasAda = new Set(siswiList().filter(s => kelasAda.some(k => k.id === s.kelasId)).map(s => s.nama.toLowerCase() + '|' + s.kelasId));
    const nikFile = new Set(), namaFile = new Set();
    const kelasByNama = {};
    kelasAda.forEach(k => { kelasByNama[k.nama.toLowerCase()] = k; });
    const items = [];
    rows.forEach((r, i) => {
      const nama = teks(r[st.map.nama]).replace(/\s+/g, ' ');
      if (!nama || /^\d+$/.test(nama)) return;
      let nik = st.map.nik >= 0 ? teks(typeof r[st.map.nik] === 'number' ? BigInt(Math.round(r[st.map.nik])).toString() : r[st.map.nik]).replace(/\D/g, '') : '';
      const tgl = st.map.tgl >= 0 ? parseTanggal(r[st.map.tgl]) : '';
      let kelasNama = st.map.kelas >= 0 ? teks(r[st.map.kelas]) : '';
      if (typeof r[st.map.kelas] === 'number') kelasNama = String(r[st.map.kelas]);
      const it = { baris: st.hdr + 2 + i, nama, nik, tgl, kelasNama, warn: [], skip: false };
      if (st.map.kelas >= 0 && !kelasNama) { it.warn.push('kelas kosong'); it.skip = true; }
      if (nik && nik.length !== 16) { it.warn.push(`NIK ${nik.length} digit (dikosongkan)`); it.nik = ''; nik = ''; }
      if (nik && (nikAda.has(nik) || nikFile.has(nik))) { it.warn.push('NIK sudah terdaftar'); it.skip = true; }
      const kid = st.map.kelas < 0 ? st.kelasTetap : (kelasByNama[kelasNama.toLowerCase()] || {}).id;
      const keyNama = nama.toLowerCase() + '|' + (kid || kelasNama.toLowerCase());
      if (namaKelasAda.has(keyNama) || namaFile.has(keyNama)) { it.warn.push('nama sudah ada di kelas ini'); it.skip = true; }
      const u = hitungUsia(tgl);
      if (st.map.tgl >= 0 && teks(r[st.map.tgl]) && !tgl && !(r[st.map.tgl] instanceof Date)) it.warn.push('tanggal lahir tidak terbaca');
      if (u != null && (u < 12 || u > 18)) it.warn.push(`usia ${u} th (di luar 12–18)`);
      if (nik) nikFile.add(nik);
      namaFile.add(keyNama);
      items.push(it);
    });
    st.preview = items;
    const kelasBaru = st.map.kelas >= 0 ? [...new Set(items.filter(x => !x.skip && x.kelasNama && !kelasByNama[x.kelasNama.toLowerCase()]).map(x => x.kelasNama))] : [];
    const ok = items.filter(x => !x.skip).length;
    wz.innerHTML = `
      <div class="stats"><div class="stat"><small>Siap disimpan</small><b>${ok}</b></div><div class="stat"><small>Dilewati</small><b>${items.length - ok}</b></div><div class="stat"><small>Kelas baru</small><b>${kelasBaru.length}</b><span>${esc(kelasBaru.join(', '))}</span></div></div>
      <div class="tbl-wrap" style="max-height:340px"><table class="t list"><thead><tr><th>Baris</th><th class="l">Nama</th><th class="l">NIK</th><th class="l">Tgl lahir</th><th class="l">Kelas</th><th class="l">Catatan</th></tr></thead><tbody>
      ${items.map(x => `<tr style="${x.skip ? 'opacity:.55' : ''}"><td>${x.baris}</td><td>${esc(x.nama)}</td><td>${esc(x.nik || '-')}</td><td>${x.tgl ? esc(x.tgl.split('-').reverse().join('/')) : '-'}</td><td>${esc(st.map.kelas >= 0 ? x.kelasNama : (getRow('Kelas', st.kelasTetap) || {}).nama)}</td><td>${x.skip ? '<span class="pill err">dilewati</span> ' : ''}${x.warn.map(w => `<span class="pill warn">${esc(w)}</span>`).join(' ')}</td></tr>`).join('')}
      </tbody></table></div>`;
    foot.innerHTML = `<button type="button" class="btn ghost" id="bk">Kembali</button><button type="button" class="btn" id="sv" ${ok ? '' : 'disabled'}>Simpan ${ok} siswi</button>`;
    $('#bk', foot).onclick = render2;
    $('#sv', foot).onclick = () => {
      const kmap = {};
      kelasAda.forEach(k => { kmap[k.nama.toLowerCase()] = k.id; });
      kelasBaru.forEach(n => {
        const k = { id: uid('kl'), sekolahId: st.sek, ta: S.taAktif, nama: n, tingkat: tingkatDari(n), del: '' };
        simpanLokal('Kelas', k);
        kmap[n.toLowerCase()] = k.id;
      });
      let n = 0;
      items.filter(x => !x.skip).forEach(x => {
        const kelasId = st.map.kelas >= 0 ? kmap[x.kelasNama.toLowerCase()] : st.kelasTetap;
        simpanLokal('Siswi', { id: uid('sw'), kelasId, ta: S.taAktif, nama: x.nama, nik: x.nik, tglLahir: x.tgl, del: '' });
        n++;
      });
      m.parentNode.remove();
      if (kelasBaru.length && kelasBaru.some(k => !tingkatDari(k))) toast('Beberapa kelas baru belum terdeteksi tingkatnya — lengkapi di menu Sekolah & Kelas', true);
      else toast(`${n} siswi tersimpan`);
      if (st.map.kelas < 0) S.ui.swKel = st.kelasTetap;
      S.ui.swSek = st.sek;
      rerender();
    };
  }
  step1();
}

/* ============================ EXPORT EXCEL ============================ */
const TEAL = 'FF00A8A1', TEAL_SOFT = 'FFE3F6F4', LIME_SOFT = 'FFF6F9D8';
const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
function hdr(cell, fill = TEAL_SOFT) {
  cell.font = { bold: true, size: 10 };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.border = border;
}
function boxCell(cell, center = true) { cell.border = border; cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle' }; cell.font = { size: 10 }; }
const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sheetName = (wb, s) => { let n = String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim(); let base = n, i = 2; while (wb.getWorksheet(n)) { n = base.slice(0, 27) + ' (' + i++ + ')'; } return n; };
const fileSafe = s => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');

async function runExport(fn) {
  if (!window.ExcelJS) return toast('Pustaka Excel belum termuat, coba lagi sebentar', true);
  try { toast('Menyiapkan file Excel…'); await fn(); } catch (e) { console.error(e); toast('Gagal membuat Excel: ' + e.message, true); }
}
async function unduhWb(wb, name) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function infoWilayah() {
  const pid = isPkm() ? S.user.pkmId : S.pkmId;
  const p = S.pkm.find(x => x.id === pid) || {};
  return { pkm: p.nama || '-', kab: namaKab(p.kab) };
}

function addRegisterSheet(wb, kelasId) {
  const h = hitungSemua();
  const k = getRow('Kelas', kelasId), sek = getRow('Sekolah', k.sekolahId) || {}, desa = getRow('Desa', sek.desaId) || {};
  const iw = infoWilayah();
  const ws = wb.addWorksheet(sheetName(wb, 'Register ' + k.nama), { views: [{ state: 'frozen', xSplit: 3, ySplit: 12 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const sw = siswiList(kelasId);
  let col = 4;
  const blokBulan = h.bulan.map(b => { const n = h.kal[b].minggu; const o = { b, start: col, n }; col += n + 4; return o; });
  const lastCol = col - 1;
  ws.mergeCells(1, 1, 1, Math.max(lastCol, 12));
  ws.getCell(1, 1).value = 'FORMULIR PEMANTAUAN PROGRAM TTD REMAJA PUTRI DI SEKOLAH';
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };
  [['Kelas', k.nama], ['Nama Sekolah', sek.nama], ['Desa/Kelurahan', desa.nama || '-'], ['Nama Puskesmas Pembina', iw.pkm], ['Kabupaten', iw.kab], ['Tahun Ajaran', S.taAktif], ['Jumlah siswi kelas', sw.length]]
    .forEach(([a, b], i) => { ws.getCell(3 + i, 1).value = a; ws.getCell(3 + i, 3).value = ': ' + b; ws.getCell(3 + i, 1).font = { size: 10 }; ws.getCell(3 + i, 3).font = { bold: true, size: 10 }; });
  const R1 = 11, R2 = 12;
  [['No', 1], ['Nama Remaja Putri', 2], ['NIK', 3]].forEach(([t, c]) => { ws.mergeCells(R1, c, R2, c); ws.getCell(R1, c).value = t; hdr(ws.getCell(R1, c)); hdr(ws.getCell(R2, c)); });
  blokBulan.forEach(bl => {
    ws.mergeCells(R1, bl.start, R1, bl.start + bl.n + 3);
    ws.getCell(R1, bl.start).value = blnNama(bl.b).toUpperCase() + ' ' + bl.b.slice(0, 4);
    for (let c = bl.start; c <= bl.start + bl.n + 3; c++) hdr(ws.getCell(R1, c));
    for (let w = 0; w < bl.n; w++) { ws.getCell(R2, bl.start + w).value = ROMAWI[w]; hdr(ws.getCell(R2, bl.start + w)); }
    ['Jumlah TTD didapat bulan ini (simbol 0 dan 1)', 'Jumlah dapat s.d. bulan ini (kumulatif)', 'Jumlah TTD diminum bulan ini (simbol 1)', 'Jumlah minum s.d. bulan ini (kumulatif)']
      .forEach((t, j) => { const c = ws.getCell(R2, bl.start + bl.n + j); c.value = t; hdr(c, LIME_SOFT); });
  });
  ws.getRow(R2).height = 66;
  sw.forEach((s, i) => {
    const r = R2 + 1 + i;
    const x = h.hs[s.id] || {};
    ws.getCell(r, 1).value = i + 1; boxCell(ws.getCell(r, 1));
    ws.getCell(r, 2).value = s.nama; boxCell(ws.getCell(r, 2), false);
    ws.getCell(r, 3).value = s.nik || ''; ws.getCell(r, 3).numFmt = '@'; boxCell(ws.getCell(r, 3));
    blokBulan.forEach((bl, bi) => {
      const t = (h.ttdBy[s.id] || {})[bl.b] || {};
      const kal = h.kal[bl.b];
      for (let w = 1; w <= bl.n; w++) {
        const c = ws.getCell(r, bl.start + w - 1);
        if (kal.libur.indexOf(w) >= 0) { c.value = 'L'; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EAEA' } }; }
        else { const v = t['w' + w] || ''; c.value = v === '1' ? 1 : v === '0' ? 0 : v || null; }
        boxCell(c);
      }
      const rg = `${colL(bl.start)}${r}:${colL(bl.start + bl.n - 1)}${r}`;
      const cD = bl.start + bl.n, cDK = cD + 1, cM = cD + 2, cMK = cD + 3;
      const hb = x[bl.b] || { d: 0, dk: 0, m: 0, mk: 0 };
      const prev = bi > 0 ? blokBulan[bi - 1] : null;
      ws.getCell(r, cD).value = { formula: `COUNTIF(${rg},1)+COUNTIF(${rg},0)`, result: hb.d };
      ws.getCell(r, cDK).value = { formula: prev ? `${colL(prev.start + prev.n + 1)}${r}+${colL(cD)}${r}` : `${colL(cD)}${r}`, result: hb.dk };
      ws.getCell(r, cM).value = { formula: `COUNTIF(${rg},1)`, result: hb.m };
      ws.getCell(r, cMK).value = { formula: prev ? `${colL(prev.start + prev.n + 3)}${r}+${colL(cM)}${r}` : `${colL(cM)}${r}`, result: hb.mk };
      [cD, cDK, cM, cMK].forEach(c => { boxCell(ws.getCell(r, c)); ws.getCell(r, c).font = { bold: true, size: 10 }; });
    });
  });
  let r = R2 + sw.length + 3;
  ['Keterangan pengisian kolom minggu:', '1 = remaja putri mendapat dan minum TTD', '0 = remaja putri mendapat tetapi tidak minum TTD', 'X = remaja putri tidak mendapat TTD',
    '- = belum terdaftar di sekolah tersebut / tidak menerima TTD karena di luar rentang umur 12–18 tahun', 'L = minggu libur sesuai kalender sekolah (tidak dihitung)']
    .forEach((t, i) => { ws.getCell(r + i, 2).value = t; ws.getCell(r + i, 2).font = { size: 9, bold: i === 0, italic: i > 0 }; });
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 28; ws.getColumn(3).width = 19;
  blokBulan.forEach(bl => { for (let w = 0; w < bl.n; w++) ws.getColumn(bl.start + w).width = 4.5; for (let j = 0; j < 4; j++) ws.getColumn(bl.start + bl.n + j).width = 10.5; });
}

function addRekapSheet(wb, nama, judul, labelHead, items, totalLabel, catatan) {
  const h = hitungSemua();
  return addRekapSheetRaw(wb, nama, judul, labelHead, items, totalLabel, catatan, h.bulan);
}
function addRekapSheetRaw(wb, nama, judul, labelHead, items, totalLabel, catatan, bulan, opsiTambahan) {
  const ws = wb.addWorksheet(sheetName(wb, nama), { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const last = 2 + bulan.length * 5;
  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = judul;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  ws.getCell(1, 1).alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(1).height = 34;
  [['No', 1], [labelHead, 2]].forEach(([t, c]) => { ws.mergeCells(2, c, 4, c); ws.getCell(2, c).value = t; for (let r = 2; r <= 4; r++) hdr(ws.getCell(r, c)); });
  bulan.forEach((b, i) => {
    const c = 3 + i * 5;
    ws.mergeCells(2, c, 2, c + 4); ws.getCell(2, c).value = blnNama(b).toUpperCase() + ' ' + b.slice(0, 4);
    ws.mergeCells(3, c, 4, c); ws.getCell(3, c).value = 'Jumlah rematri';
    ws.mergeCells(3, c + 1, 3, c + 2); ws.getCell(3, c + 1).value = 'Jumlah dapat s.d. bulan ini';
    ws.mergeCells(3, c + 3, 3, c + 4); ws.getCell(3, c + 3).value = 'Jumlah minum s.d. bulan ini';
    ['< 26 Tablet', '≥ 26 Tablet', '< 26 Tablet', '≥ 26 Tablet'].forEach((t, j) => { ws.getCell(4, c + 1 + j).value = t; });
    for (let r = 2; r <= 4; r++) for (let j = 0; j < 5; j++) hdr(ws.getCell(r, c + j), r === 2 ? TEAL_SOFT : LIME_SOFT);
  });
  ws.getRow(3).height = 30;
  items.forEach((it, i) => {
    const r = 5 + i;
    ws.getCell(r, 1).value = i + 1; boxCell(ws.getCell(r, 1));
    ws.getCell(r, 2).value = it.label; boxCell(ws.getCell(r, 2), false);
    bulan.forEach((b, bi) => {
      const x = it.rekap[b] || { j: 0, dl: 0, dg: 0, ml: 0, mg: 0 };
      [x.j, x.dl, x.dg, x.ml, x.mg].forEach((v, j) => { const c = ws.getCell(r, 3 + bi * 5 + j); c.value = v; boxCell(c); });
    });
  });
  const rt = 5 + items.length;
  ws.getCell(rt, 2).value = totalLabel;
  hdr(ws.getCell(rt, 1)); hdr(ws.getCell(rt, 2));
  for (let c = 3; c <= last; c++) {
    const cell = ws.getCell(rt, c);
    let sum = 0;
    items.forEach((it, i) => { sum += ws.getCell(5 + i, c).value || 0; });
    cell.value = items.length ? { formula: `SUM(${colL(c)}5:${colL(c)}${rt - 1})`, result: sum } : 0;
    hdr(cell, LIME_SOFT);
  }
  (catatan || []).forEach((t, i) => { ws.getCell(rt + 2 + i, 2).value = t; ws.getCell(rt + 2 + i, 2).font = { size: 9, italic: i > 0, bold: i === 0 }; });
  ws.getColumn(1).width = 5; ws.getColumn(2).width = 30;
  for (let c = 3; c <= last; c++) ws.getColumn(c).width = 9.5;
  if (opsiTambahan) opsiTambahan(ws);
  return ws;
}

const CATATAN_SEKOLAH = ['Keterangan', 'Tabel ini dihitung otomatis dari register kelas: jumlah rematri yang mendapat dan minum TTD dengan kumulatif < 26 tablet dan ≥ 26 tablet.'];
const CATATAN_DESA = ['Keterangan', '1. Rekap desa/kelurahan memuat seluruh sekolah dalam wilayah desa/kelurahan tersebut.', '2. Diisi dari hasil rekap sekolah (lihat register sekolah).', '3. Data rekap desa/kelurahan dientrikan ke dalam pelaporan bulanan SIGIZI KESGA.'];

async function exportRegister(kelasIds, sekolahId) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TTD Rematri Sulbar';
  let nama;
  if (sekolahId) {
    const sek = getRow('Sekolah', sekolahId);
    addRekapSheet(wb, 'Rekap ' + sek.nama, 'REKAP DISTRIBUSI DAN KONSUMSI TTD REMATRI ' + sek.nama.toUpperCase() + ' — TA ' + S.taAktif, 'Kelas',
      kelasList(sekolahId).map(k => ({ label: k.nama, rekap: rekapKelas(k.id) })), sek.nama, CATATAN_SEKOLAH);
    nama = `Register_TTD_${fileSafe(sek.nama)}_TA_${S.taAktif.replace('/', '-')}.xlsx`;
  } else {
    const k = getRow('Kelas', kelasIds[0]);
    nama = `Register_TTD_${fileSafe((getRow('Sekolah', k.sekolahId) || {}).nama)}_Kelas_${fileSafe(k.nama)}_TA_${S.taAktif.replace('/', '-')}.xlsx`;
  }
  kelasIds.forEach(id => addRegisterSheet(wb, id));
  await unduhWb(wb, nama);
}
async function exportRekapDesa(desaId) {
  const desa = getRow('Desa', desaId);
  const wb = new ExcelJS.Workbook();
  addRekapSheet(wb, 'Rekap ' + desa.nama, 'REKAP DISTRIBUSI DAN KONSUMSI TTD REMATRI ' + desa.nama.toUpperCase() + ' — TA ' + S.taAktif, 'Sekolah',
    sekolahList(desaId).map(s => ({ label: s.nama, rekap: rekapSekolah(s.id) })), desa.nama, CATATAN_DESA);
  sekolahList(desaId).forEach(s => addRekapSheet(wb, 'Rekap ' + s.nama, 'REKAP TTD REMATRI ' + s.nama.toUpperCase() + ' — TA ' + S.taAktif, 'Kelas',
    kelasList(s.id).map(k => ({ label: k.nama, rekap: rekapKelas(k.id) })), s.nama, CATATAN_SEKOLAH));
  await unduhWb(wb, `Rekap_TTD_Rematri_${fileSafe(desa.nama)}_TA_${S.taAktif.replace('/', '-')}.xlsx`);
}
async function exportRekapPkm() {
  const iw = infoWilayah();
  const wb = new ExcelJS.Workbook();
  addRekapSheet(wb, 'Rekap Puskesmas', 'REKAP DISTRIBUSI DAN KONSUMSI TTD REMATRI ' + iw.pkm.toUpperCase() + ' — ' + iw.kab.toUpperCase() + ' — TA ' + S.taAktif, 'Desa/Kelurahan',
    desaList().map(d => ({ label: d.nama, rekap: rekapDesa(d.id) })), iw.pkm, ['Keterangan', 'Gabungan seluruh desa/kelurahan wilayah kerja puskesmas.']);
  desaList().forEach(d => addRekapSheet(wb, 'Desa ' + d.nama, 'REKAP DISTRIBUSI DAN KONSUMSI TTD REMATRI ' + d.nama.toUpperCase() + ' — TA ' + S.taAktif, 'Sekolah',
    sekolahList(d.id).map(s => ({ label: s.nama, rekap: rekapSekolah(s.id) })), d.nama, CATATAN_DESA));
  await unduhWb(wb, `Rekap_TTD_Rematri_${fileSafe(iw.pkm)}_TA_${S.taAktif.replace('/', '-')}.xlsx`);
}
async function exportWilayah(items, bulan, labelHead, wilayah) {
  const wb = new ExcelJS.Workbook();
  addRekapSheetRaw(wb, 'Rekap ' + wilayah, 'REKAP DISTRIBUSI DAN KONSUMSI TTD REMATRI ' + wilayah.toUpperCase() + ' — TA ' + S.taAktif, labelHead, items, 'TOTAL ' + wilayah.toUpperCase(), ['Keterangan', 'Rekap per ' + labelHead.toLowerCase() + ' dari data seluruh sekolah.'], bulan);
  await unduhWb(wb, `Rekap_TTD_Rematri_${fileSafe(wilayah)}_TA_${S.taAktif.replace('/', '-')}.xlsx`);
}
async function exportTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data Siswi');
  ws.columns = [{ header: 'No', width: 5 }, { header: 'Nama Siswi', width: 30 }, { header: 'NIK', width: 20 }, { header: 'Tanggal Lahir', width: 15 }, { header: 'Kelas', width: 10 }];
  ws.getRow(1).eachCell(c => hdr(c));
  ws.getColumn(3).numFmt = '@';
  [[1, 'Contoh: Ani Lestari', '7601010101120001', '12/03/2012', '7.1'], [2, 'Contoh: Rina Putri', '', '05/11/2011', '8.1']].forEach(r => { const row = ws.addRow(r); row.eachCell(c => boxCell(c, false)); row.font = { italic: true, color: { argb: 'FF888888' } }; });
  const p = wb.addWorksheet('Petunjuk');
  ['PETUNJUK PENGISIAN', '1. Satu baris untuk satu remaja putri. Hapus 2 baris contoh sebelum upload.', '2. Kolom Nama wajib diisi. NIK dan Tanggal Lahir boleh dikosongkan.',
    '3. NIK diketik 16 digit (kolom sudah berformat teks agar tidak berubah).', '4. Tanggal lahir format hari/bulan/tahun, mis. 12/03/2012.',
    '5. Kolom Kelas diisi nama kelas, mis. 7.1, 8.2, 10.1, atau VII A. Kelas yang belum ada dibuat otomatis.', '6. Satu file boleh berisi beberapa kelas dalam satu sekolah.']
    .forEach((t, i) => { p.getCell(i + 1, 1).value = t; p.getCell(i + 1, 1).font = { bold: i === 0, size: i === 0 ? 12 : 11 }; });
  p.getColumn(1).width = 100;
  await unduhWb(wb, 'Template_Upload_Siswi_TTD_Rematri.xlsx');
}

async function exportTemplatePkm() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data Puskesmas');
  ws.columns = [{ header: 'No', width: 5 }, { header: 'Kabupaten/Kota', width: 24 }, { header: 'Nama Puskesmas', width: 30 }, { header: 'Nama Petugas Gizi', width: 28 }, { header: 'Username (opsional)', width: 20 }, { header: 'PIN awal (opsional)', width: 18 }];
  ws.getRow(1).eachCell(c => hdr(c));
  ws.getColumn(6).numFmt = '@';
  [[1, 'Mamuju', 'Puskesmas Tommo', 'Hasni, S.Gz', '', ''], [2, 'Majene', 'Puskesmas Banggae I', '', 'gizi.banggae1', '246810'], [3, 'Polewali Mandar', 'Puskesmas Wonomulyo', '', '', '']]
    .forEach(r => { const row = ws.addRow(r); row.eachCell(c => boxCell(c, false)); row.font = { italic: true, color: { argb: 'FF888888' } }; });
  const p = wb.addWorksheet('Petunjuk');
  ['PETUNJUK', '1. Satu baris untuk satu puskesmas. Hapus baris contoh sebelum upload.', '2. Kabupaten/Kota cukup ditulis Majene, Polewali Mandar (Polman), Mamasa, Mamuju, Pasangkayu, atau Mamuju Tengah.',
    '3. Username & PIN boleh dikosongkan — aplikasi bisa membuatkan otomatis (mis. gizi.tommo) dengan PIN acak 6 angka.', '4. Username: huruf kecil/angka/titik, 4–30 karakter. PIN minimal 6 angka.',
    '5. Puskesmas yang sudah terdaftar tidak akan dobel.'].forEach((t, i) => { p.getCell(i + 1, 1).value = t; p.getCell(i + 1, 1).font = { bold: i === 0 }; });
  p.getColumn(1).width = 110;
  await unduhWb(wb, 'Template_Import_Puskesmas_TTD_Rematri.xlsx');
}
async function exportDaftarAkun(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Akun Petugas');
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'DAFTAR AKUN PETUGAS GIZI PUSKESMAS — TTD REMATRI SULBAR';
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'Alamat aplikasi: ' + location.href.split('#')[0] + '   ·   PIN awal wajib diganti saat login pertama.';
  ws.getCell('A2').font = { italic: true, size: 10 };
  const head = ['No', 'Kabupaten/Kota', 'Puskesmas', 'Nama Petugas', 'Username', 'PIN awal'];
  head.forEach((h, i) => { ws.getCell(4, i + 1).value = h; hdr(ws.getCell(4, i + 1)); });
  rows.filter(x => x.username).forEach((x, i) => {
    [i + 1, namaKab(x.kab), x.nama, x.namaPetugas || '', x.username, x.pin || '(sudah ada sebelumnya)'].forEach((v, j) => { const c = ws.getCell(5 + i, j + 1); c.value = v; boxCell(c, j > 0); });
    ws.getCell(5 + i, 6).numFmt = '@';
  });
  [5, 24, 30, 26, 20, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  await unduhWb(wb, 'Daftar_Akun_Petugas_TTD_Rematri_Sulbar.xlsx');
}

/* ============================ INIT ============================ */
(async function init() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  try { await loadState(); } catch (e) { console.error(e); }
  if (S.token && S.user) {
    renderShell();
    sinkron();
  } else renderLogin();
})();
