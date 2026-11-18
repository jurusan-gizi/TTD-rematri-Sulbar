# TTD Rematri Sulbar — Panduan Pemasangan

Aplikasi PWA untuk mencatat dan merekap pemberian Tablet Tambah Darah (TTD) bagi remaja putri di sekolah, Provinsi Sulawesi Barat.
Database aplikasi ini adalah Google Sheet yang dihubungkan lewat Google Apps Script.

## Isi paket

| File/folder | Fungsi |
|---|---|
| `index.html`, `app.js`, `style.css` | Aplikasi PWA |
| `config.js` | **Tempat menempelkan URL server** (langkah B) |
| `sw.js`, `manifest.json` | Membuat aplikasi bisa dipasang di HP dan tetap jalan saat offline |
| `vendor/` | Pustaka Excel (ExcelJS) & Word (JSZip), disimpan lokal agar jalan offline |
| `assets/` | Logo Sulbar, logo Kemenkes Poltekkes Makassar, ikon aplikasi |
| `apps-script/Code.gs` | Backend (server) yang ditempel di Google Sheet |
| `Template_Upload_Siswi_TTD_Rematri.xlsx` | Template Excel untuk upload data siswi |

---

## A. Siapkan database (Google Sheet + Apps Script)

1. Login ke akun Google **milik dinas/institusi**. Akun ini akan menjadi pemilik data se-Sulbar.
2. Buat **Google Sheet baru**, beri nama mis. `DB TTD Rematri Sulbar`.
3. Pilih menu **Ekstensi → Apps Script**. Hapus isi `Code.gs` bawaan, lalu tempel seluruh isi `apps-script/Code.gs`. Klik **Simpan**.
4. Di daftar fungsi pada toolbar, pilih **`setup`**, lalu klik **Jalankan**.
   - Google akan meminta izin. Klik *Tinjau izin → pilih akun → Lanjutan → Buka (tidak aman) → Izinkan*. Ini wajar, karena script buatan sendiri belum diverifikasi Google.
   - Setelah selesai, Sheet akan berisi tab: Users, Sessions, Kab, Pkm, Desa, Sekolah, Kelas, Siswi, TTD, Kalender, Setting.
5. Klik **Terapkan (Deploy) → Deployment baru**:
   - Jenis: **Aplikasi web**
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja**
   - Klik **Terapkan**, lalu **salin URL Web App** (berakhiran `/exec`).

> **Keamanan:** File Sheet jangan dibagikan ke petugas. Semua akses lewat aplikasi, dan server hanya mengirim data puskesmas milik akun yang login.

## B. Pasang aplikasi (GitHub Pages)

1. Buka `config.js`, ganti `TEMPEL_URL_WEB_APP_DI_SINI` dengan URL `/exec` dari langkah A.5.
2. Upload seluruh isi folder ini ke repository GitHub, mis. `ttd-rematri-sulbar`.
3. Masuk ke **Settings → Pages**. Pada Source pilih *Deploy from a branch*, branch `main`, folder `/root`, lalu klik Save.
4. Aplikasi bisa dibuka di `https://<username>.github.io/ttd-rematri-sulbar/`.

Hosting lain (cPanel, Netlify, dll.) juga bisa, asalkan memakai **https**. PWA tidak bisa dipasang di HP kalau aplikasinya dibuka lewat http.

## C. Login pertama & pengaturan awal (Admin Provinsi)

1. Login dengan **`adminprov` / PIN `123456`**. Aplikasi akan langsung meminta PIN diganti.
2. Buka **Kalender & Tahun Ajaran**:
   - Pastikan tahun ajaran aktif sudah benar, mis. `2026/2027`.
   - Tandai bulan yang **5 minggu** dan **minggu libur** (misalnya libur semester). Pengaturan ini berlaku untuk semua sekolah.
3. Buka **Puskesmas** dan tambahkan semua puskesmas per kabupaten/kota.
4. Buka **Akun Pengguna** dan buat akun:
   - **Admin Kabupaten/Kota**: satu akun per Dinkes kabupaten/kota.
   - **Petugas Gizi Puskesmas**: satu akun atau lebih per puskesmas.
   - Berikan username dan PIN awal ke masing-masing. PIN awal wajib mereka ganti saat login pertama.

Admin Kabupaten/Kota juga bisa menambah puskesmas dan akun petugas, tetapi hanya untuk kabupatennya sendiri.

## D. Alur kerja petugas gizi

1. **Desa, Sekolah & Kelas**: daftarkan desa/kelurahan, lalu sekolah-sekolah di tiap desa.
2. **Data Siswi**: upload daftar siswi lewat Excel (.xlsx), CSV, Word (.docx berisi tabel), atau salin–tempel.
   - Kelas yang belum ada akan dibuat otomatis.
   - NIK boleh kosong.
   - Data ganda dan usia di luar 12–18 tahun ditandai sebelum disimpan.
3. **Input TTD Mingguan**: pilih sekolah, kelas, bulan, dan minggu, lalu ketuk kode **1 / 0 / X / –** untuk tiap siswi.
4. **Register Kelas / Rekap Sekolah / Rekap Desa / Rekap Puskesmas**: semua angka dihitung otomatis dan bisa diunduh sebagai Excel. Excel register berisi rumus yang tetap hidup.
5. Angka dari **Rekap Desa/Kelurahan** dientri ke **SIGIZI KESGA**.

## E. Hak akses

| Peran | Bisa melihat | Bisa mengubah |
|---|---|---|
| Admin Provinsi | Semua kabupaten/kota & puskesmas | Puskesmas, semua akun, kalender, tahun ajaran, arsip |
| Admin Kabupaten/Kota | Puskesmas di kabupatennya | Puskesmas & akun petugas di kabupatennya |
| Petugas Gizi Puskesmas | Hanya puskesmasnya | Data sekolah, siswi, dan TTD puskesmasnya |

Penyaringan data dilakukan di server, sehingga data puskesmas lain tidak pernah terkirim ke HP petugas.

## F. Offline & sinkronisasi

- Setiap isian langsung tersimpan di HP.
- Status di pojok kanan atas aplikasi:
  - **Tersinkron**: semua data sudah terkirim.
  - **n belum terkirim**: masih ada data yang menunggu dikirim.
  - **Offline**: HP sedang tidak terhubung ke internet.
- Begitu ada sinyal, data terkirim otomatis. Bisa juga dikirim manual lewat menu **Sinkronisasi**.
- **Jangan hapus data browser** sebelum status menunjukkan "Tersinkron".

## G. Pergantian tahun ajaran (setiap Juli)

1. Admin Provinsi membuka **Kalender & Tahun Ajaran** dan mengganti tahun ajaran aktif, mis. `2027/2028`. Kumulatif TTD otomatis kembali ke nol.
2. Admin Provinsi mengatur kalender tahun ajaran baru.
3. Tiap petugas membuka **Desa, Sekolah & Kelas** lalu menekan **Naik kelas**:
   - Kelas 7→8, 8→9, 10→11, dan 11→12 disalin beserta siswinya.
   - Kelas 9 dan 12 dianggap lulus.
4. Petugas meng-upload siswi baru kelas 7 dan 10.
5. Setelah laporan tahun lalu selesai, Admin Provinsi dapat **mengarsipkan** tahun ajaran lama ke file Sheet terpisah agar database tetap ringan.

## H. Memperbarui aplikasi

- **Perubahan `Code.gs`**: buka *Deploy → Kelola deployment → ikon pensil → Versi: Versi baru → Terapkan*. Dengan cara ini URL tidak berubah.
- **Perubahan file PWA**: naikkan angka versi di `sw.js` (`ttd-rematri-sulbar-v1` → `v2`) supaya HP pengguna mengambil versi terbaru.

---

Dikembangkan untuk Jurusan Gizi, Poltekkes Kemenkes Makassar.
