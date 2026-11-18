/**
 * TTD Rematri Sulbar — Backend Google Apps Script
 * Database: Google Sheet (spreadsheet tempat script ini ditempel)
 *
 * Cara pasang singkat (lihat PANDUAN):
 *  1. Buat Google Sheet baru → Ekstensi → Apps Script → tempel file ini.
 *  2. Jalankan fungsi setup() satu kali (izinkan akses).
 *  3. Deploy → Deployment baru → Aplikasi web → Jalankan sebagai: Saya,
 *     Akses: Siapa saja → salin URL /exec ke config.js di PWA.
 *  Akun awal: adminprov / PIN 123456 (wajib diganti saat login pertama).
 */

var APP_NAME = 'TTD Rematri Sulbar';
var SESSION_DAYS = 60;

var SCHEMA = {
  Users:    ['username', 'nama', 'role', 'kab', 'pkmId', 'hash', 'salt', 'aktif', 'mustChange', 'updatedAt'],
  Sessions: ['token', 'username', 'expires'],
  Kab:      ['id', 'nama'],
  Pkm:      ['id', 'kab', 'nama', 'del', 'updatedAt'],
  Desa:     ['id', 'pkmId', 'nama', 'del', 'updatedAt'],
  Sekolah:  ['id', 'pkmId', 'desaId', 'nama', 'jenjang', 'del', 'updatedAt'],
  Kelas:    ['id', 'pkmId', 'sekolahId', 'ta', 'nama', 'tingkat', 'del', 'updatedAt'],
  Siswi:    ['id', 'pkmId', 'kelasId', 'ta', 'nama', 'nik', 'tglLahir', 'del', 'updatedAt'],
  TTD:      ['id', 'pkmId', 'siswiId', 'ta', 'bulan', 'w1', 'w2', 'w3', 'w4', 'w5', 'by', 'updatedAt'],
  Kalender: ['ta', 'bulan', 'aktif', 'minggu', 'libur'],
  Setting:  ['key', 'value']
};

var KAB_SULBAR = [
  ['majene', 'Kabupaten Majene'],
  ['polman', 'Kabupaten Polewali Mandar'],
  ['mamasa', 'Kabupaten Mamasa'],
  ['mamuju', 'Kabupaten Mamuju'],
  ['pasangkayu', 'Kabupaten Pasangkayu'],
  ['mateng', 'Kabupaten Mamuju Tengah']
];

// Tabel data puskesmas yang boleh ditulis petugas lewat sinkronisasi
var PKM_TABLES = ['Desa', 'Sekolah', 'Kelas', 'Siswi', 'TTD'];

/* ============================ SETUP ============================ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), SCHEMA[name].length).setNumberFormat('@');
    sh.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  if (readTable_('Kab').rows.length === 0) {
    appendRows_('Kab', KAB_SULBAR.map(function (k) { return { id: k[0], nama: k[1] }; }));
  }
  if (!getSetting_('taAktif')) setSetting_('taAktif', defaultTA_());
  if (!findUser_('adminprov')) {
    var salt = randomId_(12);
    appendRows_('Users', [{
      username: 'adminprov', nama: 'Admin Provinsi Sulawesi Barat', role: 'prov', kab: '', pkmId: '',
      hash: hashPin_('123456', salt), salt: salt, aktif: '1', mustChange: '1', updatedAt: nowIso_()
    }]);
  }
  return 'Setup selesai. Login awal: adminprov / 123456';
}

/* ============================ ROUTER ============================ */

function doGet() {
  return json_({ ok: true, app: APP_NAME, time: nowIso_() });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Permintaan tidak valid' });
  }
  try {
    var out = handle_(req);
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handle_(req) {
  var a = req.action;
  if (a === 'login') return login_(req.username, req.pin);
  if (a === 'ping') return { time: nowIso_() };

  var user = auth_(req.token);
  switch (a) {
    case 'logout': return logout_(req.token);
    case 'changePin': return changePin_(user, req.oldPin, req.newPin);
    case 'bootstrap': return bootstrap_(user, req.pkmId, req.since);
    case 'push': return push_(user, req.ops || []);
    case 'listUsers': return listUsers_(user);
    case 'saveUser': return saveUser_(user, req.user);
    case 'savePkm': return savePkm_(user, req.pkm);
    case 'saveKalender': return saveKalender_(user, req.ta, req.rows);
    case 'setTA': return setTA_(user, req.ta);
    case 'rekapWilayah': return rekapWilayah_(user, req.ta, req.kab);
    case 'naikKelas': return naikKelas_(user, req.fromTa, req.toTa);
    case 'arsipTA': return arsipTA_(user, req.ta);
  }
  throw new Error('Aksi tidak dikenal: ' + a);
}

/* ============================ AUTH ============================ */

function login_(username, pin) {
  username = String(username || '').trim().toLowerCase();
  var u = findUser_(username);
  if (!u || u.aktif !== '1' || hashPin_(String(pin || ''), u.salt) !== u.hash) {
    Utilities.sleep(600);
    throw new Error('Username atau PIN salah');
  }
  var token = randomId_(32);
  var exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  appendRows_('Sessions', [{ token: token, username: username, expires: exp }]);
  CacheService.getScriptCache().put('s_' + token, username, 21600);
  return { token: token, user: publicUser_(u) };
}

function auth_(token) {
  if (!token) throw new Error('SESI_HABIS');
  var cache = CacheService.getScriptCache();
  var username = cache.get('s_' + token);
  if (!username) {
    var t = readTable_('Sessions');
    var now = nowIso_();
    var s = null;
    for (var i = 0; i < t.rows.length; i++) {
      if (t.rows[i].token === token) { s = t.rows[i]; break; }
    }
    if (!s || s.expires < now) throw new Error('SESI_HABIS');
    username = s.username;
    cache.put('s_' + token, username, 21600);
  }
  var u = findUser_(username);
  if (!u || u.aktif !== '1') throw new Error('SESI_HABIS');
  return u;
}

function logout_(token) {
  CacheService.getScriptCache().remove('s_' + token);
  withLock_(function () {
    var sh = sheet_('Sessions');
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]) === token || String(vals[i][2]) < nowIso_()) sh.deleteRow(i + 1);
    }
  });
  return {};
}

function changePin_(user, oldPin, newPin) {
  if (hashPin_(String(oldPin || ''), user.salt) !== user.hash) throw new Error('PIN lama salah');
  newPin = String(newPin || '');
  if (!/^\d{6,}$/.test(newPin)) throw new Error('PIN baru minimal 6 angka');
  var salt = randomId_(12);
  updateUserFields_(user.username, { hash: hashPin_(newPin, salt), salt: salt, mustChange: '' });
  return { user: publicUser_(findUser_(user.username)) };
}

function publicUser_(u) {
  return { username: u.username, nama: u.nama, role: u.role, kab: u.kab, pkmId: u.pkmId, mustChange: u.mustChange === '1' };
}

/* ============================ DATA ============================ */

function bootstrap_(user, pkmId, since) {
  var serverTime = nowIso_();
  var kab = readTable_('Kab').rows;
  var pkmAll = readTable_('Pkm').rows.filter(function (p) { return p.del !== '1'; });
  var pkmScope = pkmAll.filter(function (p) { return canSeePkm_(user, p); });
  var taAktif = getSetting_('taAktif') || defaultTA_();
  var kalender = readTable_('Kalender').rows;

  var target = user.role === 'pkm' ? user.pkmId : (pkmId || '');
  var data = null;
  if (target) {
    var p = pkmAll.filter(function (x) { return x.id === target; })[0];
    if (!p || !canSeePkm_(user, p)) throw new Error('Tidak berhak mengakses puskesmas ini');
    data = {};
    PKM_TABLES.forEach(function (name) {
      data[name] = readTable_(name).rows.filter(function (r) {
        if (r.pkmId !== target) return false;
        if (since && String(r.updatedAt || '') <= since) return false;
        if ((name === 'Kelas' || name === 'Siswi' || name === 'TTD') && r.ta !== taAktif) return false;
        return true;
      });
    });
  }
  return {
    serverTime: serverTime, user: publicUser_(user), kab: kab, pkm: pkmScope,
    taAktif: taAktif, kalender: kalender, pkmId: target, data: data, full: !since
  };
}

function push_(user, ops) {
  if (user.role !== 'pkm') throw new Error('Hanya petugas puskesmas yang dapat mengubah data');
  var saved = {};
  withLock_(function () {
    ops.forEach(function (op) {
      if (PKM_TABLES.indexOf(op.t) < 0) throw new Error('Tabel tidak valid');
      var rows = (op.rows || []).map(function (r) {
        var o = {};
        SCHEMA[op.t].forEach(function (k) { o[k] = r[k] == null ? '' : String(r[k]); });
        o.pkmId = user.pkmId;
        o.updatedAt = nowIso_();
        if (op.t === 'TTD') {
          o.by = user.username;
          o.id = o.siswiId + '|' + o.bulan;
          ['w1', 'w2', 'w3', 'w4', 'w5'].forEach(function (w) {
            if (['1', '0', 'X', '-', ''].indexOf(o[w]) < 0) o[w] = '';
          });
        }
        if (!o.id) throw new Error('Data tanpa id');
        return o;
      });
      upsert_(op.t, rows, function (existing) { return existing.pkmId === user.pkmId; });
      saved[op.t] = (saved[op.t] || []).concat(rows);
    });
  });
  return { saved: saved, serverTime: nowIso_() };
}

/* ============================ ADMIN ============================ */

function listUsers_(user) {
  if (user.role === 'pkm') throw new Error('Tidak berhak');
  var pkm = readTable_('Pkm').rows;
  var users = readTable_('Users').rows.filter(function (u) {
    if (user.role === 'prov') return true;
    if (u.role === 'pkm') {
      var p = pkm.filter(function (x) { return x.id === u.pkmId; })[0];
      return p && p.kab === user.kab;
    }
    return u.username === user.username;
  });
  return { users: users.map(function (u) { var o = publicUser_(u); o.aktif = u.aktif === '1'; return o; }) };
}

function saveUser_(user, data) {
  if (user.role === 'pkm') throw new Error('Tidak berhak');
  var username = String(data.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{4,30}$/.test(username)) throw new Error('Username 4–30 karakter: huruf kecil, angka, titik, minus');
  var role = data.role;
  if (user.role === 'kab' && role !== 'pkm') throw new Error('Admin kabupaten hanya dapat membuat akun petugas puskesmas');
  if (['prov', 'kab', 'pkm'].indexOf(role) < 0) throw new Error('Peran tidak valid');
  var kab = '', pkmId = '';
  if (role === 'kab') {
    kab = data.kab;
    if (!readTable_('Kab').rows.some(function (k) { return k.id === kab; })) throw new Error('Kabupaten tidak valid');
  }
  if (role === 'pkm') {
    pkmId = data.pkmId;
    var p = readTable_('Pkm').rows.filter(function (x) { return x.id === pkmId && x.del !== '1'; })[0];
    if (!p || !canSeePkm_(user, p)) throw new Error('Puskesmas tidak valid');
    kab = p.kab;
  }
  var existing = findUser_(username);
  if (existing && user.role === 'kab' && (existing.role !== 'pkm' || existing.kab !== user.kab)) {
    throw new Error('Username sudah dipakai');
  }
  if (existing && existing.role === 'prov' && existing.username === user.username && data.aktif === false) {
    throw new Error('Tidak dapat menonaktifkan akun sendiri');
  }
  var fields = { nama: String(data.nama || '').trim(), role: role, kab: kab, pkmId: pkmId, aktif: data.aktif === false ? '' : '1', updatedAt: nowIso_() };
  if (!fields.nama) throw new Error('Nama wajib diisi');
  withLock_(function () {
    if (existing) {
      if (data.resetPin) {
        if (!/^\d{6,}$/.test(String(data.resetPin))) throw new Error('PIN minimal 6 angka');
        fields.salt = randomId_(12); fields.hash = hashPin_(String(data.resetPin), fields.salt); fields.mustChange = '1';
      }
      updateUserFields_(username, fields);
    } else {
      if (!/^\d{6,}$/.test(String(data.resetPin || ''))) throw new Error('PIN awal minimal 6 angka');
      fields.username = username; fields.salt = randomId_(12);
      fields.hash = hashPin_(String(data.resetPin), fields.salt); fields.mustChange = '1';
      appendRows_('Users', [fields]);
    }
  });
  if (data.aktif === false) clearUserSessions_(username);
  return listUsers_(user);
}

function savePkm_(user, data) {
  if (user.role === 'pkm') throw new Error('Tidak berhak');
  var kab = user.role === 'kab' ? user.kab : data.kab;
  if (!readTable_('Kab').rows.some(function (k) { return k.id === kab; })) throw new Error('Kabupaten tidak valid');
  var nama = String(data.nama || '').trim();
  if (!nama && !data.del) throw new Error('Nama puskesmas wajib diisi');
  var row = { id: data.id || ('pkm_' + randomId_(8)), kab: kab, nama: nama, del: data.del ? '1' : '', updatedAt: nowIso_() };
  withLock_(function () {
    upsert_('Pkm', [row], function (ex) { return user.role === 'prov' || ex.kab === user.kab; });
  });
  return { pkm: readTable_('Pkm').rows.filter(function (p) { return p.del !== '1' && canSeePkm_(user, p); }) };
}

function saveKalender_(user, ta, rows) {
  if (user.role !== 'prov') throw new Error('Hanya admin provinsi');
  withLock_(function () {
    var sh = sheet_('Kalender');
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) if (String(vals[i][0]) === ta) sh.deleteRow(i + 1);
    appendRows_('Kalender', rows.map(function (r) {
      return { ta: ta, bulan: r.bulan, aktif: r.aktif ? '1' : '', minggu: r.minggu === 5 || r.minggu === '5' ? '5' : '4', libur: (r.libur || []).join(',') };
    }));
  });
  return { kalender: readTable_('Kalender').rows };
}

function setTA_(user, ta) {
  if (user.role !== 'prov') throw new Error('Hanya admin provinsi');
  if (!/^\d{4}\/\d{4}$/.test(ta)) throw new Error('Format tahun ajaran: 2026/2027');
  setSetting_('taAktif', ta);
  return { taAktif: ta };
}

/* ============================ REKAP WILAYAH ============================ */

function rekapWilayah_(user, ta, kab) {
  if (user.role === 'pkm') throw new Error('Tidak berhak');
  ta = ta || getSetting_('taAktif');
  if (user.role === 'kab') kab = user.kab;
  var pkm = readTable_('Pkm').rows.filter(function (p) {
    return p.del !== '1' && canSeePkm_(user, p) && (!kab || p.kab === kab);
  });
  var pkmIds = {};
  pkm.forEach(function (p) { pkmIds[p.id] = true; });
  var kal = kalenderMap(readTable_('Kalender').rows, ta);
  var bulan = bulanTA(ta).filter(function (b) { return kal[b].aktif; });

  var siswi = readTable_('Siswi').rows.filter(function (s) { return s.ta === ta && s.del !== '1' && pkmIds[s.pkmId]; });
  var ttdBySiswi = {};
  readTable_('TTD').rows.forEach(function (t) {
    if (t.ta !== ta || !pkmIds[t.pkmId]) return;
    (ttdBySiswi[t.siswiId] = ttdBySiswi[t.siswiId] || {})[t.bulan] = t;
  });
  var hasil = {};
  pkm.forEach(function (p) { hasil[p.id] = rekapKosong(bulan); });
  siswi.forEach(function (s) {
    tambahRekap(hasil[s.pkmId], hitungSiswi(ttdBySiswi[s.id] || {}, bulan, kal));
  });
  return {
    ta: ta, bulan: bulan,
    rows: pkm.map(function (p) { return { id: p.id, nama: p.nama, kab: p.kab, rekap: hasil[p.id] }; })
  };
}

/* ============================ TAHUN AJARAN ============================ */

function naikKelas_(user, fromTa, toTa) {
  if (user.role !== 'pkm') throw new Error('Hanya petugas puskesmas');
  if (toTa !== getSetting_('taAktif')) throw new Error('Tahun ajaran tujuan harus tahun ajaran aktif');
  var kelasLama = readTable_('Kelas').rows.filter(function (k) { return k.pkmId === user.pkmId && k.ta === fromTa && k.del !== '1'; });
  var kelasBaruAda = readTable_('Kelas').rows.filter(function (k) { return k.pkmId === user.pkmId && k.ta === toTa && k.del !== '1'; });
  var siswiLama = readTable_('Siswi').rows.filter(function (s) { return s.pkmId === user.pkmId && s.ta === fromTa && s.del !== '1'; });
  var now = nowIso_();
  var kelasBaru = [], siswiBaru = [], lulus = 0;
  kelasLama.forEach(function (k) {
    var t = parseInt(k.tingkat, 10);
    var anak = siswiLama.filter(function (s) { return s.kelasId === k.id; });
    if (t === 9 || t === 12 || !t) { lulus += anak.length; return; }
    var namaBaru = naikNamaKelas(k.nama, t);
    var sudah = kelasBaruAda.concat(kelasBaru).filter(function (x) { return x.sekolahId === k.sekolahId && x.nama === namaBaru; })[0];
    var target = sudah || { id: 'kls_' + randomId_(10), pkmId: user.pkmId, sekolahId: k.sekolahId, ta: toTa, nama: namaBaru, tingkat: String(t + 1), del: '', updatedAt: now };
    if (!sudah) kelasBaru.push(target);
    anak.forEach(function (s) {
      siswiBaru.push({ id: 'sw_' + randomId_(12), pkmId: user.pkmId, kelasId: target.id, ta: toTa, nama: s.nama, nik: s.nik, tglLahir: s.tglLahir, del: '', updatedAt: now });
    });
  });
  withLock_(function () {
    appendRows_('Kelas', kelasBaru);
    appendRows_('Siswi', siswiBaru);
  });
  return { kelas: kelasBaru.length, siswi: siswiBaru.length, lulus: lulus };
}

function arsipTA_(user, ta) {
  if (user.role !== 'prov') throw new Error('Hanya admin provinsi');
  if (ta === getSetting_('taAktif')) throw new Error('Tahun ajaran aktif tidak dapat diarsipkan');
  var arsip = SpreadsheetApp.create('Arsip ' + APP_NAME + ' TA ' + ta);
  var jumlah = {};
  withLock_(function () {
    ['Kelas', 'Siswi', 'TTD'].forEach(function (name) {
      var sh = sheet_(name);
      var vals = sh.getDataRange().getValues();
      var head = vals[0];
      var taCol = head.indexOf('ta');
      var keep = [head], move = [head];
      for (var i = 1; i < vals.length; i++) (String(vals[i][taCol]) === ta ? move : keep).push(vals[i]);
      jumlah[name] = move.length - 1;
      var tgt = arsip.insertSheet(name);
      tgt.getRange(1, 1, move.length, head.length).setNumberFormat('@').setValues(move);
      sh.clearContents();
      sh.getRange(1, 1, keep.length, head.length).setValues(keep);
    });
    var d = arsip.getSheetByName('Sheet1') || arsip.getSheetByName('Lembar1');
    if (d) arsip.deleteSheet(d);
  });
  return { url: arsip.getUrl(), jumlah: jumlah };
}

/* ============================ LOGIKA HITUNG (sama dengan PWA) ============================ */

function bulanTA(ta) {
  var y = parseInt(String(ta).slice(0, 4), 10), out = [];
  for (var i = 0; i < 12; i++) {
    var m = 7 + i, yy = y;
    if (m > 12) { m -= 12; yy = y + 1; }
    out.push(yy + '-' + (m < 10 ? '0' : '') + m);
  }
  return out;
}

function kalenderMap(rows, ta) {
  var map = {};
  bulanTA(ta).forEach(function (b) { map[b] = { aktif: true, minggu: 4, libur: [] }; });
  rows.forEach(function (r) {
    if (r.ta !== ta || !map[r.bulan]) return;
    map[r.bulan] = {
      aktif: r.aktif === '1' || r.aktif === true,
      minggu: String(r.minggu) === '5' ? 5 : 4,
      libur: String(r.libur || '').split(',').filter(String).map(Number)
    };
  });
  return map;
}

/** Hitung per bulan: dapat/minum bulan ini + kumulatif sejak Juli. */
function hitungSiswi(ttdPerBulan, bulanAktif, kal) {
  var dk = 0, mk = 0, out = {};
  bulanAktif.forEach(function (b) {
    var k = kal[b], t = ttdPerBulan[b] || {}, d = 0, m = 0, adaMinggu = 0, strip = 0;
    for (var w = 1; w <= k.minggu; w++) {
      if (k.libur.indexOf(w) >= 0) continue;
      adaMinggu++;
      var c = String(t['w' + w] || '');
      if (c === '1') { d++; m++; } else if (c === '0') { d++; } else if (c === '-') { strip++; }
    }
    dk += d; mk += m;
    out[b] = { d: d, dk: dk, m: m, mk: mk, terdaftar: !(adaMinggu > 0 && strip === adaMinggu) };
  });
  return out;
}

function rekapKosong(bulan) {
  var r = {};
  bulan.forEach(function (b) { r[b] = { j: 0, dl: 0, dg: 0, ml: 0, mg: 0 }; });
  return r;
}

function tambahRekap(rekap, hs) {
  Object.keys(rekap).forEach(function (b) {
    var h = hs[b];
    if (!h || !h.terdaftar) return;
    var r = rekap[b];
    r.j++;
    if (h.dk >= 26) r.dg++; else r.dl++;
    if (h.mk >= 26) r.mg++; else r.ml++;
  });
}

function naikNamaKelas(nama, t) {
  var romawi = { 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' };
  if (String(nama).indexOf(String(t)) >= 0) return String(nama).replace(String(t), String(t + 1));
  var re = new RegExp('\\b' + romawi[t] + '(?![IVX])');
  if (re.test(nama)) return String(nama).replace(re, romawi[t + 1]);
  return String(nama) + ' (naik ' + (t + 1) + ')';
}

/* ============================ UTIL SHEET ============================ */

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet ' + name + ' belum ada. Jalankan setup().');
  return sh;
}

function readTable_(name) {
  var sh = sheet_(name);
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(String);
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    if (vals[i].join('') === '') continue;
    var o = {};
    for (var j = 0; j < head.length; j++) o[head[j]] = vals[i][j] == null ? '' : String(vals[i][j]);
    rows.push(o);
  }
  return { head: head, rows: rows };
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var head = SCHEMA[name];
  var data = objs.map(function (o) { return head.map(function (k) { return o[k] == null ? '' : String(o[k]); }); });
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, data.length, head.length).setNumberFormat('@').setValues(data);
}

/** Upsert berdasarkan kolom pertama (id). allowFn(existing) menentukan boleh menimpa baris lama. */
function upsert_(name, objs, allowFn) {
  if (!objs.length) return;
  var sh = sheet_(name);
  var head = SCHEMA[name];
  var last = sh.getLastRow();
  var idx = {};
  // Cukup baca 2 kolom pertama (id + pemilik: pkmId/kab) agar tetap cepat walau data besar
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  existing.forEach(function (r, i) { idx[String(r[0])] = i; });
  var appends = [];
  objs.forEach(function (o) {
    var arr = head.map(function (k) { return o[k] == null ? '' : String(o[k]); });
    var i = idx[arr[0]];
    if (i == null) { appends.push(arr); idx[arr[0]] = -1; return; }
    if (i === -1) return;
    var ex = {};
    ex[head[0]] = String(existing[i][0]);
    ex[head[1]] = String(existing[i][1]);
    if (allowFn && !allowFn(ex)) throw new Error('Tidak berhak mengubah data milik pihak lain');
    sh.getRange(i + 2, 1, 1, head.length).setNumberFormat('@').setValues([arr]);
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, head.length).setNumberFormat('@').setValues(appends);
}

function findUser_(username) {
  return readTable_('Users').rows.filter(function (u) { return u.username === username; })[0] || null;
}

function updateUserFields_(username, fields) {
  var sh = sheet_('Users');
  var vals = sh.getDataRange().getValues();
  var head = vals[0].map(String);
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) !== username) continue;
    Object.keys(fields).forEach(function (k) {
      var j = head.indexOf(k);
      if (j >= 0) vals[i][j] = fields[k];
    });
    sh.getRange(i + 1, 1, 1, head.length).setNumberFormat('@').setValues([vals[i].map(String)]);
    return;
  }
}

function clearUserSessions_(username) {
  var sh = sheet_('Sessions');
  var vals = sh.getDataRange().getValues();
  var cache = CacheService.getScriptCache();
  for (var i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][1]) === username) { cache.remove('s_' + vals[i][0]); sh.deleteRow(i + 1); }
  }
}

function canSeePkm_(user, p) {
  if (user.role === 'prov') return true;
  if (user.role === 'kab') return p.kab === user.kab;
  return p.id === user.pkmId;
}

function getSetting_(key) {
  var r = readTable_('Setting').rows.filter(function (x) { return x.key === key; })[0];
  return r ? r.value : '';
}

function setSetting_(key, value) {
  withLock_(function () {
    upsert_('Setting', [{ key: key, value: value }]);
  });
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function hashPin_(pin, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randomId_(n) {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
  var raw = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  for (var i = 0; i < n; i++) s += chars[parseInt(raw.substr((i * 2) % 60, 2), 16) % chars.length];
  return s;
}

function nowIso_() { return new Date().toISOString(); }

function defaultTA_() {
  var d = new Date(), y = d.getFullYear();
  return d.getMonth() >= 6 ? y + '/' + (y + 1) : (y - 1) + '/' + y;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
