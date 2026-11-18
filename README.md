# CBT Enterprise — Versi GitHub Pages + Firebase Firestore

Paket ini adalah versi statis **CBT Enterprise (Siswa, Proktor, dan Admin)** yang menyimpan seluruh master data dan progres ujian secara **real-time & persisten ke Firebase Firestore**.

## Isi Paket File (`CBT-Firebase-GitHub.zip`)

- `index.html` — Halaman **CBT Siswa** (Login NIS + Password, pilih Ruang, CBT Bank Soal & Google Form tanpa nomor soal, Alarm Anti-Curang, Scan QR Code, Lanjutkan jawaban lintas perangkat).
- `Proktor.html` — Halaman **Panel Proktor / Pengawas** (Monitoring real-time status siswa, ruang, progres jawaban, foto webcam, pelanggaran, reset kunci perangkat, force selesai, token ujian, LJK Hybrid).
- `Admin.html` — Halaman **Panel Admin CBT** (Master Siswa, Bank Soal Word/Excel/Google Form, Jadwal, Akun Proktor, Kartu Peserta, Rapor IRT, Arsip Semester, Konfigurasi Ujian).
- `firebase-cbt-bridge.js` — Penghubung database **Firebase Firestore & Firebase Authentication (Google Sign-In)**.
- `firebase-applet-config.json` — Konfigurasi proyek Firebase Anda (`ethereal-elevator-bvxch`).
- `firestore.rules` — Aturan keamanan Firebase Firestore yang sudah divalidasi (`email_verified`, pembatasan sesi siswa/proktor, proteksi anti-tamper & anti-replay).
- `firebase-blueprint.json` — Dokumentasi skema koleksi Firestore.

---

## Cara Upload & Aktifkan di GitHub Pages

1. **Ekstrak** file `CBT-Firebase-GitHub.zip` ke sebuah folder di komputer/HP Anda.
2. Buka repository GitHub Anda -> klik **Add file > Upload files** -> unggah **semua file** di atas ke root repository (branch `main`).
3. Aktifkan **GitHub Pages**:
   - Buka tab **Settings > Pages**.
   - Pada bagian **Build and deployment > Source**, pilih **Deploy from a branch**.
   - Pilih branch **`main`** dan folder **`/ (root)`**, lalu klik **Save**.
4. Tunggu 1–2 menit hingga GitHub memberikan link situs Anda, misalnya:
   - CBT Siswa: `https://<username>.github.io/<nama-repo>/`
   - Panel Proktor: `https://<username>.github.io/<nama-repo>/Proktor.html`
   - Panel Admin: `https://<username>.github.io/<nama-repo>/Admin.html`
5. **WAJIB — Daftarkan Domain GitHub Pages ke Firebase Auth**:
   - Buka **Firebase Console** (`console.firebase.google.com`) -> pilih proyek `ethereal-elevator-bvxch`.
   - Masuk ke **Authentication > Settings > Authorized domains > Add domain**.
   - Tambahkan domain GitHub Pages Anda: `<username>.github.io` -> klik **Add**.
   - Tanpa langkah ini, tombol **Masuk dengan Google** di GitHub Pages akan ditolak oleh Firebase (`auth/unauthorized-domain`).

---

## Keunggulan Penyimpanan Firebase Firestore

- **Tahan Reload & Ganti Perangkat**: Saat siswa me-refresh halaman atau berpindah ke HP/laptop lain lalu login ulang dengan NIS + Password yang sama, jawaban sementara (`answers`), `ruang`, dan sisa waktu (`timeLeft`) otomatis dipulihkan dari koleksi Firestore `exam_sessions`.
- **Aturan Keamanan Aktif (`firestore.rules`)**: Data siswa, soal belum terbit, kunci jawaban, serta sesi ujian hanya dapat diakses oleh akun Google terverifikasi sesuai perannya (`Admin`, `Proktor`, atau `Siswa` pemilik sesi).
- **Catatan Google Form Link**: Karena pembatasan CORS browser di domain statis GitHub, jika ingin menambahkan/mem-parsing Link Google Form baru yang belum pernah disimpan, lakukan inspeksi/simpan Link Google Form melalui **Panel Admin versi AI Studio** (yang terhubung ke database Firestore yang sama), maka seluruh butir soal Google Form akan langsung tersedia bagi siswa di GitHub Pages.
