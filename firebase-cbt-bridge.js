import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const BOOTSTRAPPED_ADMIN_EMAIL = 'kipaskoplak@gmail.com';

const FALLBACK_FIREBASE_CONFIG = {
  projectId: 'ethereal-elevator-bvxch',
  appId: '1:438767795761:web:bd5012d7502d47ac7adf10',
  apiKey: 'AIzaSyDjW-L1zW-eb99tVl1Jj5fCUhCs-GILh3Q',
  authDomain: 'ethereal-elevator-bvxch.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-cbtenterpriseper-4c9e1892-88a8-4473-9cd1-c945b959fff6',
  storageBucket: 'ethereal-elevator-bvxch.firebasestorage.app',
  messagingSenderId: '438767795761',
  measurementId: '',
  oAuthClientId: '438767795761-h3rqiforkhkddg92o5l8b7f106hm7r44.apps.googleusercontent.com',
  recaptchaSiteKey: '',
};

async function loadFirebaseConfig() {
  try {
    const res = await fetch('./firebase-applet-config.json', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.projectId && json.apiKey) return json;
    }
  } catch (e) {}
  return FALLBACK_FIREBASE_CONFIG;
}

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

let app;
let auth;
let db;
let googleProvider;
let initPromise = null;
const inspectedGFormCache = {};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: (auth?.currentUser?.providerData || []).map((p) => ({
        providerId: p.providerId,
        displayName: p.displayName,
        email: p.email,
        photoUrl: p.photoURL,
      })),
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      const cfg = await loadFirebaseConfig();
      app = initializeApp(cfg);
      auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      db = cfg.firestoreDatabaseId
        ? getFirestore(app, cfg.firestoreDatabaseId)
        : getFirestore(app);
      await auth.authStateReady();
      testConnection();
    })();
  }
  await initPromise;
}

function detectPageRole() {
  const p = (window.location.pathname || '').toLowerCase();
  if (p.includes('admin')) return 'admin';
  if (p.includes('proktor')) return 'proktor';
  return 'siswa';
}

function showGoogleAuthModal({ title, subtitle, warningText, allowSwitch }) {
  return new Promise((resolve) => {
    const existing = document.getElementById('cbt-firebase-auth-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cbt-firebase-auth-modal';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText =
      'background:#ffffff;color:#0f172a;max-width:420px;width:100%;border-radius:18px;padding:24px;box-shadow:0 24px 48px rgba(0,0,0,0.35);border:1px solid #e2e8f0;';

    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:42px;height:42px;border-radius:12px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;">F</div>
        <div>
          <h3 style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">${title}</h3>
          <p style="margin:2px 0 0;font-size:12px;color:#475569;">${subtitle}</p>
        </div>
      </div>
      ${
        warningText
          ? `<div style="background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;padding:10px 12px;border-radius:10px;font-size:12px;margin-bottom:14px;line-height:1.45;">${warningText}</div>`
          : ''
      }
      <button id="cbt-fb-signin-btn" type="button" style="width:100%;background:#4f46e5;color:#fff;border:none;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
        ${allowSwitch ? 'Ganti / Masuk Akun Google' : 'Masuk dengan Google (Firebase Cloud)'}
      </button>
      <button id="cbt-fb-cancel-btn" type="button" style="width:100%;margin-top:8px;background:#f8fafc;color:#475569;border:1px solid #cbd5e1;border-radius:10px;padding:9px 14px;font-size:12px;font-weight:600;cursor:pointer;">
        Tutup
      </button>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const errBox = document.createElement('div');
    errBox.style.cssText = 'margin-top:10px;font-size:11px;color:#b91c1c;display:none;line-height:1.4;';
    card.appendChild(errBox);

    card.querySelector('#cbt-fb-signin-btn').onclick = async () => {
      try {
        if (allowSwitch && auth.currentUser) {
          await signOut(auth).catch(() => {});
        }
        const cred = await signInWithPopup(auth, googleProvider);
        overlay.remove();
        resolve(cred.user || auth.currentUser);
      } catch (err) {
        errBox.style.display = 'block';
        errBox.textContent =
          'Login Google dibatalkan atau pop-up diblokir (' + (err?.message || 'error') + '). Izinkan pop-up browser lalu coba lagi.';
      }
    };

    card.querySelector('#cbt-fb-cancel-btn').onclick = () => {
      overlay.remove();
      resolve(null);
    };
  });
}

async function ensureSignedInUser({ interactivePrompt = false, roleLabel = 'CBT Cloud' } = {}) {
  await ensureInit();
  if (auth.currentUser && auth.currentUser.emailVerified) {
    return auth.currentUser;
  }
  if (!interactivePrompt) return null;
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    if (cred?.user) return cred.user;
  } catch (e) {
    // Popup failed/blocked, show explicit interactive button modal
  }
  return await showGoogleAuthModal({
    title: 'Verifikasi Akun Google',
    subtitle: `Masuk dengan akun Google Anda untuk mengakses ${roleLabel} di Firebase Firestore.`,
    warningText: '',
    allowSwitch: false,
  });
}

async function ensureAdminAuthorized() {
  await ensureInit();
  let user = auth.currentUser;
  if (!user || !user.emailVerified) {
    user = await showGoogleAuthModal({
      title: 'Autentikasi Admin Panel CBT',
      subtitle: 'Gunakan akun Google Admin resmi untuk membaca dan mengelola master data Firestore.',
      warningText: '',
      allowSwitch: false,
    });
    if (!user) throw new Error('Login Google Admin dibatalkan.');
  }

  let allowed = user.email === BOOTSTRAPPED_ADMIN_EMAIL;
  if (!allowed) {
    try {
      const admSnap = await getDoc(doc(db, 'admins', user.uid));
      allowed = admSnap.exists();
    } catch {
      allowed = false;
    }
  }

  if (!allowed) {
    const switched = await showGoogleAuthModal({
      title: 'Akses Admin Diperlukan',
      subtitle: `Akun saat ini (${user.email}) belum terdaftar sebagai Admin CBT.`,
      warningText: `Silakan masuk menggunakan akun Google Admin utama (${BOOTSTRAPPED_ADMIN_EMAIL}) atau UID admin terdaftar.`,
      allowSwitch: true,
    });
    if (!switched) throw new Error('Akun bukan Admin terdaftar.');
    return await ensureAdminAuthorized();
  }

  if (user.email === BOOTSTRAPPED_ADMIN_EMAIL) {
    try {
      const admRef = doc(db, 'admins', user.uid);
      const admSnap = await getDoc(admRef);
      if (!admSnap.exists()) {
        await setDoc(admRef, {
          uid: user.uid,
          email: user.email,
          name: user.displayName || 'Admin Utama CBT',
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      // ignore if already exists
    }
  }

  return user;
}

function sanitizeDocId(raw, fallbackPrefix = 'doc') {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleaned) return `${fallbackPrefix}_${Date.now()}`;
  return cleaned.slice(0, 128);
}

async function sha256Hex(raw) {
  const enc = new TextEncoder().encode(String(raw || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function coerceYaTidak(val, fallback = 'Tidak') {
  const s = String(val ?? '').trim().toLowerCase();
  if (s === 'ya' || s === 'true' || s === '1') return 'Ya';
  if (s === 'tidak' || s === 'false' || s === '0') return 'Tidak';
  return fallback;
}

function coerceStudentStatus(val) {
  const s = String(val ?? '').trim();
  if (s === 'Sedang Ujian' || s === 'Selesai' || s === 'Offline') return s;
  return 'Offline';
}

function coerceAppStatus(val) {
  const s = String(val ?? '').trim();
  if (s === 'Aktif' || s === 'Nonaktif' || s === 'Selesai') return s;
  return 'Aktif';
}

function normalizeRombel(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[-_.\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSingleKelasLevel(kelasSiswa, kelasTarget) {
  const tNorm = normalizeRombel(kelasTarget);
  if (!tNorm || tNorm === 'semua' || tNorm === 'umum' || tNorm === 'all') return true;
  const sNorm = normalizeRombel(kelasSiswa);
  if (!sNorm) return true;
  if (sNorm === tNorm) return true;

  const sTok = sNorm.split(' ')[0];
  const tTok = tNorm.split(' ')[0];
  const gradeMap = {
    x: '10', '10': '10',
    xi: '11', '11': '11',
    xii: '12', '12': '12',
    vii: '7', '7': '7',
    viii: '8', '8': '8',
    ix: '9', '9': '9',
    i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6',
  };
  if (gradeMap[sTok] && gradeMap[tTok] && gradeMap[sTok] === gradeMap[tTok]) {
    if (tNorm === tTok || tNorm === `kelas ${tTok}`) return true;
    if (sNorm.includes(tNorm) || tNorm.includes(sNorm)) return true;
  }
  return sNorm.includes(tNorm) || tNorm.includes(sNorm);
}

function matchKelasLevel(kelasSiswa, kelasTarget) {
  const rawTarget = String(kelasTarget || '').trim();
  if (!rawTarget) return true;
  const parts = rawTarget.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return matchSingleKelasLevel(kelasSiswa, rawTarget);
  return parts.some((part) => matchSingleKelasLevel(kelasSiswa, part));
}

function stripGFormLeadingNumber(text) {
  if (text === undefined || text === null) return '';
  let s = String(text).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ').trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/^\s*(?:(?:No\.?|Nomor|Nomer|Soal|Pertanyaan)\s*(?:No\.?|Nomor|#)?\s*\d{1,3}\s*[.:)\-–—]?\s+)/i, '')
      .replace(/^\s*[\(\[]\s*\d{1,3}\s*[\)\]]\s*[.:)\-–—]?\s*/, '')
      .replace(/^\s*\d{1,3}(?:\.\d{1,2})?\s*[.):\-–—]\s+(?=\S)/, '')
      .replace(/^\s*\d{1,3}[.)](?=[^\d\s.,])/, '')
      .replace(/^\s*\d{1,3}\s+(?=(?:Nama|Kelas|NIS|NISN|No\.?|Nomor|Nomer|Absen|Ruang|Sesi|Token|Mapel|Mata\s+Pelajaran|Tanggal|Hari|Sekolah|Asal|Identitas|Biodata|Pilih|Isilah|Bacalah|Perhatikan|Tentukan|Berapakah|Mengapa|Apa|Siapa|Dimana|Kapan|Bagaimana|Jelaskan)\b)/i, '')
      .trim();
  }
  return s || String(text).trim();
}

const CLOUD_GFORM_BASE_URLS = [
  '',
  'https://ais-pre-u5o76iacgjp55ikoxxxlpp-421532676370.asia-southeast1.run.app',
  'https://ais-dev-u5o76iacgjp55ikoxxxlpp-421532676370.asia-southeast1.run.app',
];

function sanitizeGFormItemsList(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    ...it,
    no: '',
    text: stripGFormLeadingNumber(it?.text || ''),
  }));
}

function sanitizeGFormSectionsList(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map((sec, idx) => ({
    ...sec,
    title: idx === 0 ? (sec?.title || '') : stripGFormLeadingNumber(sec?.title || ''),
  }));
}

function normalizeRuangCanonical(val) {
  const raw = String(val || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(?:ruang|ruangan)\s*[-_.]?\s*0*(\d{1,2})$/i);
  if (m) return 'Ruang ' + parseInt(m[1], 10);
  if (/^0*\d{1,2}$/.test(raw)) return 'Ruang ' + parseInt(raw, 10);
  return raw;
}

function extractGFormIdAndUrl(input) {
  const clean = String(input || '').trim();
  const isShortUrl = /forms\.gle\//i.test(clean);
  const pubMatch = clean.match(/\/forms\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]{15,})/i);
  const editMatch = clean.match(/\/forms\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{15,})/i);
  const idParamMatch = clean.match(/[?&]id=([a-zA-Z0-9_-]{15,})/i);
  let formId = clean;
  let isPublishedId = false;
  if (pubMatch) {
    formId = pubMatch[1];
    isPublishedId = true;
  } else if (editMatch) {
    formId = editMatch[1];
  } else if (idParamMatch) {
    formId = idParamMatch[1];
  } else if (/^1FAIpQL[a-zA-Z0-9_-]+$/.test(clean)) {
    isPublishedId = true;
  }
  return { clean, formId, isPublishedId, isShortUrl };
}

async function commitBatchedOps(ops) {
  const chunkSize = 400;
  for (let i = 0; i < ops.length; i += chunkSize) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + chunkSize);
    for (const op of slice) {
      if (op.type === 'set') batch.set(op.ref, op.data);
      else if (op.type === 'update') batch.update(op.ref, op.data);
      else if (op.type === 'delete') batch.delete(op.ref);
    }
    await batch.commit();
  }
}

async function readAppSettingsPublicAndSecrets({ includeSecrets = false } = {}) {
  await ensureInit();
  const defaults = {
    nama_instansi: 'KEMENTERIAN PENDIDIKAN',
    kementerian_header: 'KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI',
    nama_sekolah: 'SATUAN PENDIDIKAN CBT',
    logo_sekolah: '',
    logo_kementerian: '',
    nama_ujian: 'ASESMEN SUMATIF CBT',
    durasi: '60',
    status_ujian: 'Aktif',
    acak_soal: 'Tidak',
    ujian_ketat: 'Ya',
    kiosk_mode: 'Tidak',
    exambro_only: 'Tidak',
    device_lock: 'Tidak',
    kalkulator: 'Ya',
    coretan: 'Ya',
    adaptif_cat: 'Tidak',
    ai_face_liveness: 'Ya',
    ai_gaze: 'Ya',
    audio_monitoring: 'Tidak',
    audio_limit: '2',
    token: 'ABC12',
    notif_email: 'Tidak',
    email_wali: '',
    kepsek_nama: '',
    kepsek_nip: '',
  };

  let pubData = {};
  try {
    const pubSnap = await getDoc(doc(db, 'app_config', 'public'));
    if (pubSnap.exists()) pubData = pubSnap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'app_config/public');
  }

  let secData = {};
  if (includeSecrets) {
    try {
      const secSnap = await getDoc(doc(db, 'app_secrets', 'private'));
      if (secSnap.exists()) secData = secSnap.data();
    } catch (err) {
      // Only readable by admin/proctor
    }
  }

  return {
    ...defaults,
    ...pubData,
    ...secData,
    token: secData.token !== undefined ? secData.token : defaults.token,
  };
}

async function ensureDefaultConfigDocsIfAdmin() {
  const cfgRef = doc(db, 'app_config', 'public');
  const secRef = doc(db, 'app_secrets', 'private');
  const [cfgSnap, secSnap] = await Promise.all([getDoc(cfgRef), getDoc(secRef)]);
  const defaultToken = 'ABC12';
  const tokenHash = await sha256Hex('token:' + defaultToken);

  if (!cfgSnap.exists()) {
    await setDoc(cfgRef, {
      nama_instansi: 'KEMENTERIAN PENDIDIKAN',
      kementerian_header: 'KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI',
      nama_sekolah: 'SATUAN PENDIDIKAN CBT',
      logo_sekolah: '',
      logo_kementerian: '',
      nama_ujian: 'ASESMEN SUMATIF CBT',
      durasi: '60',
      status_ujian: 'Aktif',
      acak_soal: 'Tidak',
      ujian_ketat: 'Ya',
      kiosk_mode: 'Tidak',
      exambro_only: 'Tidak',
      device_lock: 'Tidak',
      kalkulator: 'Ya',
      coretan: 'Ya',
      adaptif_cat: 'Tidak',
      ai_face_liveness: 'Ya',
      ai_gaze: 'Ya',
      audio_monitoring: 'Tidak',
      audio_limit: '2',
      tokenHash,
      tokenRequired: false,
      updatedAt: serverTimestamp(),
    });
  }
  if (!secSnap.exists()) {
    await setDoc(secRef, {
      token: defaultToken,
      notif_email: 'Tidak',
      email_wali: '',
      kepsek_nama: '',
      kepsek_nip: '',
      updatedAt: serverTimestamp(),
    });
  }
}

async function findStudentSessionForUid(uid) {
  try {
    const sessSnap = await getDoc(doc(db, 'student_sessions', uid));
    return sessSnap.exists() ? sessSnap.data() : null;
  } catch {
    return null;
  }
}

const api = {
  async getAppSettings() {
    const settings = await readAppSettingsPublicAndSecrets({ includeSecrets: false });
    // Hydrate cross-device state on reload if user is signed in with student session
    try {
      if (auth.currentUser && auth.currentUser.emailVerified && detectPageRole() === 'siswa') {
        const sess = await findStudentSessionForUid(auth.currentUser.uid);
        if (sess && sess.nis) {
          const exSnap = await getDoc(doc(db, 'exam_sessions', sess.nis));
          if (exSnap.exists()) {
            const ex = exSnap.data();
            if (ex.status === 'Sedang Ujian') {
              try {
                localStorage.setItem(
                  `cbt_state_${sess.nis}`,
                  JSON.stringify({ jawaban: ex.answers || {}, timeLeft: ex.timeLeft || 0 })
                );
                if (ex.ruang) localStorage.setItem(`cbt_ruang_${sess.nis}`, ex.ruang);
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {}
    return { success: true, data: settings };
  },

  async saveSettingUjian(settings) {
    await ensureAdminAuthorized();
    const cleanToken = String(settings.token || '').trim().slice(0, 32);
    const tokenHash = await sha256Hex('token:' + cleanToken);

    const publicPayload = {
      nama_instansi: String(settings.nama_instansi || 'KEMENTERIAN PENDIDIKAN').slice(0, 200),
      kementerian_header: String(
        settings.kementerian_header || 'KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI'
      ).slice(0, 250),
      nama_sekolah: String(settings.nama_sekolah || 'SATUAN PENDIDIKAN CBT').slice(0, 200),
      logo_sekolah: String(settings.logo_sekolah || '').slice(0, 118000),
      logo_kementerian: String(settings.logo_kementerian || '').slice(0, 118000),
      nama_ujian: String(settings.nama_ujian || 'ASESMEN SUMATIF CBT').slice(0, 160),
      durasi: String(settings.durasi || '60').slice(0, 16),
      status_ujian: coerceAppStatus(settings.status_ujian),
      acak_soal: coerceYaTidak(settings.acak_soal, 'Tidak'),
      ujian_ketat: coerceYaTidak(settings.ujian_ketat, 'Ya'),
      kiosk_mode: coerceYaTidak(settings.kiosk_mode, 'Tidak'),
      exambro_only: coerceYaTidak(settings.exambro_only, 'Tidak'),
      device_lock: coerceYaTidak(settings.device_lock, 'Tidak'),
      kalkulator: coerceYaTidak(settings.kalkulator, 'Ya'),
      coretan: coerceYaTidak(settings.coretan, 'Ya'),
      adaptif_cat: coerceYaTidak(settings.adaptif_cat, 'Tidak'),
      ai_face_liveness: coerceYaTidak(settings.ai_face_liveness, 'Ya'),
      ai_gaze: coerceYaTidak(settings.ai_gaze, 'Ya'),
      audio_monitoring: coerceYaTidak(settings.audio_monitoring, 'Tidak'),
      audio_limit: String(settings.audio_limit || '2').slice(0, 32),
      tokenHash,
      tokenRequired: false,
      updatedAt: serverTimestamp(),
    };

    const secretPayload = {
      token: cleanToken,
      notif_email: coerceYaTidak(settings.notif_email, 'Tidak'),
      email_wali: String(settings.email_wali || '').slice(0, 200),
      kepsek_nama: String(settings.kepsek_nama || '').slice(0, 150),
      kepsek_nip: String(settings.kepsek_nip || '').slice(0, 64),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'app_config', 'public'), publicPayload);
      await setDoc(doc(db, 'app_secrets', 'private'), secretPayload);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'app_config/public');
    }
  },

  async updateTokenUjian(newToken) {
    await ensureInit();
    const cleanToken = String(newToken || '').trim().slice(0, 32);
    const tokenHash = await sha256Hex('token:' + cleanToken);
    try {
      const pubRef = doc(db, 'app_config', 'public');
      const secRef = doc(db, 'app_secrets', 'private');
      await updateDoc(pubRef, {
        tokenHash,
        tokenRequired: false,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(secRef, {
        token: cleanToken,
        updatedAt: serverTimestamp(),
      });
      // If admin, also sync token on schedules
      if (auth.currentUser?.email === BOOTSTRAPPED_ADMIN_EMAIL) {
        const schedSnap = await getDocs(collection(db, 'schedules'));
        const ops = [];
        schedSnap.forEach((d) => {
          ops.push({ type: 'update', ref: d.ref, data: { token: cleanToken, updatedAt: serverTimestamp() } });
        });
        if (ops.length > 0) await commitBatchedOps(ops);
      }
      return { success: true, message: 'Token diperbarui: ' + cleanToken };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'app_config/public');
    }
  },

  async getAdminDashboardData() {
    await ensureAdminAuthorized();
    try {
      await ensureDefaultConfigDocsIfAdmin();
      const [
        settings,
        studentsSnap,
        studCredsSnap,
        questionsSnap,
        proctorsSnap,
        procCredsSnap,
        schedulesSnap,
        gformSnap,
        sessionsSnap,
        photosSnap,
      ] = await Promise.all([
        readAppSettingsPublicAndSecrets({ includeSecrets: true }),
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'student_credentials')),
        getDocs(collection(db, 'questions')),
        getDocs(collection(db, 'proctors')),
        getDocs(collection(db, 'proctor_credentials')),
        getDocs(collection(db, 'schedules')),
        getDocs(collection(db, 'gform_links')),
        getDocs(collection(db, 'exam_sessions')),
        getDocs(collection(db, 'photos')),
      ]);

      const studPassMap = {};
      studCredsSnap.forEach((d) => {
        studPassMap[d.id] = d.data().password || '';
      });

      const procPassMap = {};
      procCredsSnap.forEach((d) => {
        procPassMap[d.id] = d.data().password || '';
      });

      const siswaRows = [['NIS', 'Nama', 'Kelas', 'Sesi', 'Password', 'Status']];
      const sortedStudents = studentsSnap.docs
        .map((d) => d.data())
        .sort((a, b) => String(a.nis).localeCompare(String(b.nis)));
      for (const s of sortedStudents) {
        siswaRows.push([
          s.nis || '',
          s.nama || '',
          s.kelas || 'Umum',
          s.sesi || '1',
          studPassMap[s.nis] || '123456',
          s.status || 'Offline',
        ]);
      }

      const soalRows = [
        ['Mapel', 'Kelas', 'No', 'Soal', 'A', 'B', 'C', 'D', 'E', 'Kunci', 'Tipe_Soal', 'Bobot_Kesulitan', 'Data_AKM'],
      ];
      const sortedQuestions = questionsSnap.docs
        .map((d) => d.data())
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      for (const q of sortedQuestions) {
        soalRows.push([
          q.mapel || 'Umum',
          q.kelas || 'Semua',
          q.no || '',
          q.soal || '',
          q.a || '',
          q.b || '',
          q.c || '',
          q.d || '',
          q.e || '',
          q.kunci || 'A',
          q.tipe_soal || 'PG',
          q.kesulitan || 'SEDANG',
          q.data_akm || '',
        ]);
      }

      const proktorRows = [['Username', 'Password', 'Nama']];
      proctorsSnap.forEach((d) => {
        const p = d.data();
        proktorRows.push([p.username || d.id, procPassMap[d.id] || '123456', p.nama || '']);
      });

      const jadwalRows = [
        ['Tanggal', 'Mata Pelajaran', 'Kelas', 'Ruang', 'Sesi', 'Jam Mulai', 'Jam Selesai', 'Token', 'Status', 'Proktor', 'Pengawas', 'Banyak Soal', 'Jenis Ujian'],
      ];
      schedulesSnap.forEach((d) => {
        const j = d.data();
        jadwalRows.push([
          j.tanggal || '',
          j.mapel || '',
          j.kelas || 'Semua',
          j.ruang || '',
          j.sesi || '1',
          j.jam_mulai || '',
          j.jam_selesai || '',
          j.token || settings.token || '',
          j.status || 'Aktif',
          j.proktor || '',
          j.pengawas || '',
          j.banyak_soal || '',
          j.jenis_ujian || 'CBT',
        ]);
      });

      const gformRows = [['Mapel', 'Kelas', 'FormUrl', 'FormId', 'Status', 'JudulForm', 'Timestamp']];
      gformSnap.forEach((d) => {
        const g = d.data();
        gformRows.push([
          g.mapel || '',
          g.kelas || 'Semua',
          g.formUrl || '',
          g.formId || g.id || '',
          g.status || 'Aktif',
          g.judulForm || g.mapel || '',
          g.timestampText || '',
        ]);
      });

      const hasilRows = [['Timestamp', 'NIS', 'Nama', 'Token', 'Skor', 'Status']];
      const analisaRows = [['NIS', 'Nama', 'Token', 'Jawaban', 'Detail_Analisa']];
      sessionsSnap.forEach((d) => {
        const ex = d.data();
        if (ex.status === 'Selesai' || ex.status === 'Selesai (OMR Kertas)') {
          hasilRows.push([
            ex.submittedAtText || new Date().toLocaleString('id-ID'),
            ex.nis || d.id,
            ex.nama || '',
            ex.tokenUsed || '',
            String(ex.score ?? 0),
            ex.status || 'Selesai',
          ]);
          const analisaStr =
            Array.isArray(ex.detailAnalisa) && ex.detailAnalisa.length > 0
              ? JSON.stringify(ex.detailAnalisa) + (ex.hashSig ? '|HASH:' + ex.hashSig : '')
              : '';
          analisaRows.push([
            ex.nis || d.id,
            ex.nama || '',
            ex.tokenUsed || '',
            JSON.stringify(ex.answers || {}),
            analisaStr,
          ]);
        }
      });

      const fotoRows = [['Timestamp', 'NIS', 'Nama', 'FotoBase64', 'TokenSesi']];
      photosSnap.forEach((d) => {
        const f = d.data();
        fotoRows.push([
          f.timestampText || '',
          f.nis || d.id,
          f.nama || '',
          f.fotoBase64 || '',
          f.tokenSesi || '',
        ]);
      });

      return {
        success: true,
        data: {
          siswa: siswaRows,
          soal: soalRows,
          hasil: hasilRows,
          proktor: proktorRows,
          analisa: analisaRows,
          jadwal: jadwalRows,
          settings,
          foto: fotoRows,
          gformLinks: gformRows,
        },
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'admin_dashboard');
    }
  },

  async saveSiswaMasal(dataArray) {
    await ensureAdminAuthorized();
    try {
      const [existingStudentsSnap, existingCredsSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'student_credentials')),
      ]);
      const existingMap = {};
      existingStudentsSnap.forEach((d) => {
        existingMap[d.id] = d.data();
      });

      const keepIds = new Set();
      const ops = [];
      const rows = Array.isArray(dataArray) ? dataArray : [];

      for (const row of rows) {
        if (!row || !String(row[0] || '').trim()) continue;
        const nisId = sanitizeDocId(row[0]);
        keepIds.add(nisId);
        const rawPass = String(row[4] || '123456').trim();
        const passHash = await sha256Hex('cbt:' + rawPass);
        const prev = existingMap[nisId];

        const payload = {
          nis: nisId,
          nama: String(row[1] || 'Siswa').trim().slice(0, 160),
          kelas: String(row[2] || 'Umum').trim().slice(0, 64),
          sesi: String(row[3] || '1').trim().slice(0, 32),
          ruang: prev?.ruang || '',
          passHash,
          status: coerceStudentStatus(row[5]),
          activeDeviceId: prev?.activeDeviceId || '',
          boundOwnerUid: prev?.boundOwnerUid || '',
          createdAt: prev?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        ops.push({ type: 'set', ref: doc(db, 'students', nisId), data: payload });
        ops.push({
          type: 'set',
          ref: doc(db, 'student_credentials', nisId),
          data: {
            nis: nisId,
            password: rawPass.slice(0, 128),
            updatedAt: serverTimestamp(),
          },
        });
      }

      existingStudentsSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });
      existingCredsSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });

      await commitBatchedOps(ops);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'students');
    }
  },

  async saveSoalMasal(dataArray) {
    await ensureAdminAuthorized();
    try {
      const existingSnap = await getDocs(collection(db, 'questions'));
      const existingMap = {};
      existingSnap.forEach((d) => {
        existingMap[d.id] = d.data();
      });

      const keepIds = new Set();
      const ops = [];
      let rows = Array.isArray(dataArray) ? dataArray : [];
      if (typeof dataArray === 'string') {
        try {
          rows = JSON.parse(dataArray);
        } catch {
          rows = [];
        }
      }

      let runMapel = 'Umum';
      let runKelas = 'Semua';

      for (let idx = 0; idx < rows.length; idx++) {
        const row = Array.isArray(rows[idx]) ? rows[idx] : [];
        if (row.every((c) => !String(c || '').trim())) continue;
        if (String(row[0] || '').trim()) runMapel = String(row[0]).trim();
        if (String(row[1] || '').trim()) runKelas = String(row[1]).trim();
        const noStr = String(row[2] || idx + 1).trim();
        const docId = sanitizeDocId(`q_${idx + 1}_${runMapel.slice(0, 24)}_${noStr}`);
        keepIds.add(docId);
        const prev = existingMap[docId];

        const payload = {
          id: docId,
          mapel: runMapel.slice(0, 120),
          kelas: runKelas.slice(0, 80),
          no: noStr.slice(0, 16),
          soal: String(row[3] || '').slice(0, 19500),
          a: String(row[4] || '').slice(0, 4900),
          b: String(row[5] || '').slice(0, 4900),
          c: String(row[6] || '').slice(0, 4900),
          d: String(row[7] || '').slice(0, 4900),
          e: String(row[8] || '').slice(0, 4900),
          kunci: String(row[9] || 'A').slice(0, 500),
          tipe_soal: String(row[10] || 'PG').slice(0, 40),
          kesulitan: String(row[11] || 'SEDANG').slice(0, 32),
          data_akm: String(row[12] || '').slice(0, 19500),
          sortOrder: idx + 1,
          isPublished: true,
          createdAt: prev?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        ops.push({ type: 'set', ref: doc(db, 'questions', docId), data: payload });
      }

      existingSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });

      await commitBatchedOps(ops);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'questions');
    }
  },

  async saveProktorMasal(dataArray) {
    await ensureAdminAuthorized();
    try {
      const [existingSnap, existingCredsSnap] = await Promise.all([
        getDocs(collection(db, 'proctors')),
        getDocs(collection(db, 'proctor_credentials')),
      ]);
      const existingMap = {};
      existingSnap.forEach((d) => {
        existingMap[d.id] = d.data();
      });

      const keepIds = new Set();
      const ops = [];
      const rows = Array.isArray(dataArray) ? dataArray : [];

      for (const row of rows) {
        if (!row || !String(row[0] || '').trim()) continue;
        const usernameId = sanitizeDocId(String(row[0]).trim().toLowerCase());
        keepIds.add(usernameId);
        const rawPass = String(row[1] || '123456').trim();
        const passHash = await sha256Hex('cbt:' + rawPass);
        const prev = existingMap[usernameId];

        ops.push({
          type: 'set',
          ref: doc(db, 'proctors', usernameId),
          data: {
            username: usernameId,
            nama: String(row[2] || usernameId).trim().slice(0, 160),
            passHash,
            createdAt: prev?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
        ops.push({
          type: 'set',
          ref: doc(db, 'proctor_credentials', usernameId),
          data: {
            username: usernameId,
            password: rawPass.slice(0, 128),
            updatedAt: serverTimestamp(),
          },
        });
      }

      existingSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });
      existingCredsSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });

      await commitBatchedOps(ops);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'proctors');
    }
  },

  async saveJadwalMasal(dataArray) {
    await ensureAdminAuthorized();
    try {
      const existingSnap = await getDocs(collection(db, 'schedules'));
      const existingMap = {};
      existingSnap.forEach((d) => {
        existingMap[d.id] = d.data();
      });

      const keepIds = new Set();
      const ops = [];
      const rows = Array.isArray(dataArray) ? dataArray : [];

      for (let i = 0; i < rows.length; i++) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        if (row.every((c) => !String(c || '').trim())) continue;
        const schedId = sanitizeDocId(`sched_${i + 1}`);
        keepIds.add(schedId);
        const prev = existingMap[schedId];
        const statusStr = String(row[8] || 'Aktif').trim().slice(0, 32);

        ops.push({
          type: 'set',
          ref: doc(db, 'schedules', schedId),
          data: {
            id: schedId,
            tanggal: String(row[0] || '').slice(0, 40),
            mapel: String(row[1] || 'Umum').slice(0, 120),
            kelas: String(row[2] || 'Semua').slice(0, 80),
            ruang: String(row[3] || 'Ruang 1').slice(0, 64),
            sesi: String(row[4] || 'Semua').slice(0, 32),
            jam_mulai: String(row[5] || '').slice(0, 24),
            jam_selesai: String(row[6] || '').slice(0, 24),
            token: String(row[7] || '').slice(0, 32),
            status: statusStr,
            proktor: String(row[9] || '').slice(0, 120),
            pengawas: String(row[10] || '').slice(0, 120),
            banyak_soal: String(row[11] || '').slice(0, 16),
            jenis_ujian: String(row[12] || 'CBT').slice(0, 64),
            isPublished: statusStr.toLowerCase() === 'aktif' || statusStr === '',
            createdAt: prev?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      }

      existingSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });

      await commitBatchedOps(ops);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'schedules');
    }
  },

  async inspectGoogleFormLink(formUrlOrId) {
    const clean = String(formUrlOrId || '').trim();
    if (!clean) return { success: false, message: 'URL Google Form kosong.' };

    // 1. Try local Express /api/parse-gform, then cloud backend URLs (for GitHub Pages usage)
    for (const base of CLOUD_GFORM_BASE_URLS) {
      try {
        const resp = await fetch(`${base}/api/parse-gform`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urlOrId: clean }),
        });
        const contentType = resp.headers.get('content-type') || '';
        if (resp.ok && contentType.includes('application/json')) {
          const parsed = await resp.json();
          if (parsed && parsed.success) {
            const cleanItems = sanitizeGFormItemsList(parsed.items);
            const cleanSections = sanitizeGFormSectionsList(parsed.sections);
            if (cleanSections[0] && parsed.fbzx) cleanSections[0].fbzx = parsed.fbzx;
            const normalized = {
              success: true,
              formId: parsed.formId,
              title: parsed.formTitle,
              description: parsed.formDescription,
              itemCount: parsed.itemCount,
              submitMode: parsed.submitMode || 'HTTP_POST',
              publishedUrl: parsed.formUrl,
              sections: cleanSections,
              items: cleanItems,
              formResponseUrl: parsed.formResponseUrl || '',
              fbzx: parsed.fbzx || '',
            };
            inspectedGFormCache[clean] = normalized;
            if (parsed.formId) inspectedGFormCache[parsed.formId] = normalized;
            return normalized;
          }
          if (parsed && parsed.message && base === '') {
            // Remember descriptive error from Google Form (e.g., locked form)
            inspectedGFormCache['__err_' + clean] = parsed.message;
          }
        }
      } catch (e) {}
    }

    // 2. Fallback: check existing Firestore cached gform_links
    try {
      await ensureInit();
      const parsedId = extractGFormIdAndUrl(clean).formId;
      const gSnap = await getDocs(collection(db, 'gform_links'));
      for (const d of gSnap.docs) {
        const g = d.data();
        if (
          (g.formId === parsedId || g.formUrl === clean || d.id === sanitizeDocId(parsedId)) &&
          Array.isArray(g.items) &&
          g.items.length > 0
        ) {
          const cleanItems = sanitizeGFormItemsList(g.items);
          const cleanSections = sanitizeGFormSectionsList(g.sections);
          const itemCount = cleanItems.filter((it) => !['SECTION_HEADER', 'IMAGE', 'VIDEO'].includes(it.tipe)).length;
          return {
            success: true,
            formId: g.formId || d.id,
            title: g.judulForm || g.mapel,
            description: g.formDescription || '',
            itemCount,
            submitMode: g.submitMode || 'HTTP_POST',
            publishedUrl: g.formUrl,
            sections: cleanSections,
            items: cleanItems,
            formResponseUrl: g.formResponseUrl || '',
            fbzx: (cleanSections[0] && cleanSections[0].fbzx) || '',
          };
        }
      }
    } catch (e) {}

    const idInfo = extractGFormIdAndUrl(clean);
    return {
      success: false,
      message:
        inspectedGFormCache['__err_' + clean] ||
        ('ID Form (' +
          idInfo.formId +
          ') terdeteksi, namun parsing langsung dari domain GitHub terblokir CORS Google. Untuk mengimpor soal Google Form baru, simpan link lewat Panel Admin versi AI Studio (terhubung ke Firestore yang sama) agar butir soal & formResponseUrl otomatis tersimpan di Firestore.'),
    };
  },

  async saveGoogleFormLinks(dataArray) {
    await ensureAdminAuthorized();
    try {
      const existingSnap = await getDocs(collection(db, 'gform_links'));
      const existingById = {};
      const existingByUrl = {};
      existingSnap.forEach((d) => {
        const g = d.data();
        existingById[d.id] = g;
        if (g.formId) existingById[g.formId] = g;
        if (g.formUrl) existingByUrl[g.formUrl] = g;
      });

      const keepIds = new Set();
      const ops = [];
      const rows = Array.isArray(dataArray) ? dataArray : [];

      for (let i = 0; i < rows.length; i++) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const mapel = String(row[0] || '').trim();
        const formUrl = String(row[2] || '').trim();
        if (!mapel && !formUrl) continue;

        const formId = String(row[3] || extractGFormIdAndUrl(formUrl).formId || `gf_${i + 1}`).trim();
        let linkId = sanitizeDocId(formId || `gf_${i + 1}`);
        if (keepIds.has(linkId)) {
          linkId = sanitizeDocId(`${formId || 'gf'}_${i + 1}`);
        }
        keepIds.add(linkId);

        let cached =
          inspectedGFormCache[formUrl] ||
          inspectedGFormCache[formId] ||
          existingByUrl[formUrl] ||
          existingById[linkId] ||
          existingById[formId] ||
          null;

        const cachedFormId = cached ? extractGFormIdAndUrl(cached.publishedUrl || cached.formUrl || '').formId : '';
        const hasValidHttpItems =
          cached &&
          (!cachedFormId || cachedFormId === formId || cached.formId === formId) &&
          Array.isArray(cached.items) &&
          cached.items.length > 0 &&
          Boolean(cached.formResponseUrl) &&
          cached.items.some((it) => it.entryId || (Array.isArray(it.entryIds) && it.entryIds.length > 0));

        if (!hasValidHttpItems) {
          try {
            const fetched = await api.inspectGoogleFormLink(formUrl || formId);
            if (fetched && fetched.success) cached = fetched;
          } catch (e) {}
        }

        const statusStr = String(row[4] || 'Aktif').trim() === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
        const prev = existingById[linkId];
        const fallbackRespUrl =
          cached?.formResponseUrl ||
          (formUrl
            ? String(formUrl).split('?')[0].replace(/\/(?:viewform|edit)?(?:\/)?$/i, '/formResponse')
            : '');

        const payload = {
          id: linkId,
          mapel: mapel.slice(0, 120) || 'Umum',
          kelas: String(row[1] || 'Semua').trim().slice(0, 80),
          formUrl: formUrl.slice(0, 1000),
          formId: formId.slice(0, 256),
          formResponseUrl: String(fallbackRespUrl || '').slice(0, 1000),
          status: statusStr,
          judulForm: String(row[5] || cached?.title || cached?.formTitle || mapel).slice(0, 300),
          formDescription: String(cached?.description || cached?.formDescription || '').slice(0, 4900),
          submitMode: String(cached?.submitMode || 'HTTP_POST').slice(0, 32),
          sections: sanitizeGFormSectionsList(Array.isArray(cached?.sections) ? cached.sections.slice(0, 50) : []),
          items: sanitizeGFormItemsList(Array.isArray(cached?.items) ? cached.items.slice(0, 200) : []),
          isPublished: statusStr === 'Aktif',
          timestampText: String(row[6] || new Date().toLocaleString('id-ID')).slice(0, 64),
          createdAt: prev?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        ops.push({ type: 'set', ref: doc(db, 'gform_links', linkId), data: payload });
      }

      existingSnap.forEach((d) => {
        if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });

      await commitBatchedOps(ops);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'gform_links');
    }
  },

  async importSoalFromGoogleForm(formUrlOrId, targetMapel, targetKelas) {
    const inspected = await api.inspectGoogleFormLink(formUrlOrId);
    if (!inspected.success || !Array.isArray(inspected.items) || inspected.items.length === 0) {
      return {
        success: false,
        message:
          inspected.message ||
          'Gagal membaca Google Form. Pastikan link form publik atau sudah disimpan lewat AI Studio.',
      };
    }

    const finalMapel = (targetMapel || inspected.title || 'Umum').trim();
    const finalKelas = (targetKelas || 'Semua').trim();
    const soalArray = [];
    let noCounter = 1;

    for (const it of inspected.items) {
      if (['SECTION_HEADER', 'IMAGE', 'VIDEO'].includes(it.tipe)) continue;
      const opts = Array.isArray(it.opsi) ? it.opsi : [];
      let tipe = 'PG';
      let kunci = 'A';
      let dataAkm = '';
      if (it.tipe === 'PG_KOMPLEKS') {
        tipe = 'PG_KOMPLEKS';
        kunci = 'A,B';
      } else if (it.tipe === 'ISIAN') {
        tipe = 'ISIAN';
        kunci = 'KUNCI';
      } else if (it.tipe === 'ESAI') {
        tipe = 'ESAI';
        kunci = 'kata kunci';
      } else if (it.tipe === 'GRID_PG' || it.tipe === 'GRID_CB') {
        tipe = 'MENJODOHKAN';
        dataAkm = (it.rows || []).map((r, i) => `${i + 1}. ${r}`).join('\n');
      }
      soalArray.push([
        finalMapel,
        finalKelas,
        String(noCounter++),
        it.text || '',
        opts[0] || '',
        opts[1] || '',
        opts[2] || '',
        opts[3] || '',
        opts[4] || '',
        kunci,
        tipe,
        'SEDANG',
        dataAkm,
      ]);
    }

    return { success: true, title: inspected.title || finalMapel, total: soalArray.length, soal: soalArray };
  },

  async importSoalFromGoogleDrive() {
    return {
      success: false,
      message:
        'Akses file privat Google Drive memerlukan backend Google Apps Script. Pada versi GitHub Firestore, unggah file Excel/Word langsung di menu Bank Soal.',
    };
  },

  async listGoogleFormsFromDrive() {
    await ensureAdminAuthorized();
    try {
      const snap = await getDocs(collection(db, 'gform_links'));
      const forms = snap.docs.map((d) => {
        const g = d.data();
        return {
          id: g.formId || d.id,
          name: g.judulForm || g.mapel || 'Google Form',
          url: g.formUrl || '',
          lastUpdated: g.timestampText || '',
          owner: 'Firestore',
        };
      });
      return {
        success: forms.length > 0,
        forms,
        message:
          forms.length === 0
            ? 'Belum ada Link Google Form tersimpan di Firestore. Tempel langsung URL Google Form pada kolom di bawah.'
            : '',
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'gform_links');
    }
  },

  async saveFotoSiswaAdmin(nis, nama, fotoBase64) {
    const user = await ensureAdminAuthorized();
    const nisId = sanitizeDocId(nis);
    try {
      await setDoc(doc(db, 'photos', nisId), {
        nis: nisId,
        nama: String(nama || 'Siswa').slice(0, 160),
        fotoBase64: String(fotoBase64 || '').slice(0, 340000),
        tokenSesi: 'ADMIN',
        ownerUid: user.uid,
        timestampText: new Date().toLocaleString('id-ID').slice(0, 64),
        updatedAt: serverTimestamp(),
      });
      return { success: true, message: `Pasfoto ${nama} (${nisId}) berhasil disimpan ke Firestore!` };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `photos/${nisId}`);
    }
  },

  async autoAlokasiRuangSesi(kapasitasRuang, maxSesi) {
    await ensureAdminAuthorized();
    try {
      const cap = Math.max(1, parseInt(kapasitasRuang, 10) || 20);
      const sesLimit = Math.max(1, parseInt(maxSesi, 10) || 2);
      const snap = await getDocs(collection(db, 'students'));
      const docs = snap.docs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const ops = [];
      let ruangIdx = 1;
      let sesiIdx = 1;
      let countInRoom = 0;

      for (const d of docs) {
        const ruangName = 'Ruang ' + ruangIdx;
        ops.push({
          type: 'update',
          ref: d.ref,
          data: {
            ruang: ruangName,
            sesi: String(sesiIdx),
            updatedAt: serverTimestamp(),
          },
        });
        countInRoom++;
        if (countInRoom >= cap) {
          countInRoom = 0;
          sesiIdx++;
          if (sesiIdx > sesLimit) {
            sesiIdx = 1;
            ruangIdx++;
          }
        }
      }
      await commitBatchedOps(ops);
      return {
        success: true,
        message: `Berhasil mengalokasikan ${docs.length} siswa ke Ruang 1 s/d Ruang ${ruangIdx} (${sesLimit} sesi/ruang) di Firestore.`,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'students');
    }
  },

  async clearHasilUjian() {
    await ensureAdminAuthorized();
    try {
      const [sessSnap, violSnap, studentsSnap] = await Promise.all([
        getDocs(collection(db, 'exam_sessions')),
        getDocs(collection(db, 'violations')),
        getDocs(collection(db, 'students')),
      ]);
      const ops = [];
      sessSnap.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
      violSnap.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
      studentsSnap.forEach((d) => {
        ops.push({
          type: 'update',
          ref: d.ref,
          data: { status: 'Offline', activeDeviceId: '', boundOwnerUid: '', updatedAt: serverTimestamp() },
        });
      });
      await commitBatchedOps(ops);
      return { success: true };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'exam_sessions');
    }
  },

  async arsipDanResetSemester(namaArsip) {
    const user = await ensureAdminAuthorized();
    try {
      const [sessSnap, violSnap, studentsSnap] = await Promise.all([
        getDocs(collection(db, 'exam_sessions')),
        getDocs(collection(db, 'violations')),
        getDocs(collection(db, 'students')),
      ]);

      const hasilList = [];
      const analisaList = [];
      let sumScore = 0;
      let countFinished = 0;

      sessSnap.forEach((d) => {
        const ex = d.data();
        if (ex.status === 'Selesai' || ex.status === 'Selesai (OMR Kertas)') {
          countFinished++;
          sumScore += Number(ex.score || 0);
          hasilList.push({
            timestamp: ex.submittedAtText || '',
            nis: ex.nis,
            nama: ex.nama,
            token: ex.tokenUsed || '',
            score: ex.score || 0,
            status: ex.status,
          });
          analisaList.push({
            nis: ex.nis,
            nama: ex.nama,
            mapel: ex.mapel || '',
            score: ex.score || 0,
            answers: ex.answers || {},
          });
        }
      });

      const archiveId = sanitizeDocId(`arsip_${Date.now()}_${namaArsip || 'semester'}`);
      await setDoc(doc(db, 'archives', archiveId), {
        id: archiveId,
        namaArsip: String(namaArsip || 'Arsip_Semester').slice(0, 120),
        totalHasil: countFinished,
        rataRata: countFinished > 0 ? Math.round((sumScore / countFinished) * 10) / 10 : 0,
        hasilList: hasilList.slice(0, 500),
        analisaList: analisaList.slice(0, 500),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });

      const ops = [];
      sessSnap.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
      violSnap.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
      studentsSnap.forEach((d) => {
        ops.push({
          type: 'update',
          ref: d.ref,
          data: { status: 'Offline', activeDeviceId: '', boundOwnerUid: '', updatedAt: serverTimestamp() },
        });
      });
      await commitBatchedOps(ops);

      return {
        success: true,
        message: `Arsip "${namaArsip}" (${countFinished} hasil) tersimpan ke Firestore & sesi ujian berhasil di-reset.`,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'archives');
    }
  },

  async getDaftarArsip() {
    await ensureAdminAuthorized();
    try {
      const snap = await getDocs(collection(db, 'archives'));
      const list = snap.docs.map((d) => {
        const a = d.data();
        return { id: d.id, nama: a.namaArsip, totalHasil: a.totalHasil, rataRata: a.rataRata };
      });
      return { success: true, data: list };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'archives');
    }
  },

  async loadDataArsip(archiveId) {
    await ensureAdminAuthorized();
    try {
      const snap = await getDoc(doc(db, 'archives', sanitizeDocId(archiveId)));
      if (!snap.exists()) return { success: false, message: 'Arsip tidak ditemukan.' };
      return { success: true, data: snap.data() };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `archives/${archiveId}`);
    }
  },

  async hapusArsip(archiveId) {
    await ensureAdminAuthorized();
    try {
      await deleteDoc(doc(db, 'archives', sanitizeDocId(archiveId)));
      return { success: true, message: 'Arsip berhasil dihapus dari Firestore.' };
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `archives/${archiveId}`);
    }
  },

  async kirimEmailLaporanHasil(nis, nama, skor, status, emailTujuan) {
    return {
      success: true,
      message: `Catatan pengiriman laporan untuk ${nama} (${nis}, Skor: ${skor}) menuju ${emailTujuan || 'Wali'} dicatat. Pengiriman email otomatis memerlukan Google Apps Script MailApp.`,
    };
  },

  // ================= STUDENT FLOWS =================
  async loginSiswa(nis, password, token, deviceId, deviceDesc) {
    const cleanNis = sanitizeDocId(nis);
    if (!cleanNis || !String(nis || '').trim()) {
      return { success: false, message: 'NIS tidak boleh kosong!' };
    }

    const fbUser = await ensureSignedInUser({
      interactivePrompt: true,
      roleLabel: 'Ujian CBT Siswa',
    });
    if (!fbUser) {
      return { success: false, message: 'Login Google diperlukan untuk sinkronisasi jawaban ke Firebase Firestore.' };
    }

    const passHash = await sha256Hex('cbt:' + String(password || '').trim());
    const devId = String(deviceId || 'web-client').slice(0, 128);
    const devDesc = String(deviceDesc || navigator.userAgent || '').slice(0, 200);

    // 1. Validate password against students/{nis}.passHash server-side via student_sessions/{uid}
    const sessRef = doc(db, 'student_sessions', fbUser.uid);
    try {
      const existingSess = await getDoc(sessRef);
      if (existingSess.exists()) {
        await updateDoc(sessRef, {
          nis: cleanNis,
          passHash,
          deviceId: devId,
          deviceDesc: devDesc,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(sessRef, {
          uid: fbUser.uid,
          nis: cleanNis,
          passHash,
          deviceId: devId,
          deviceDesc: devDesc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
        return { success: false, message: 'NIS atau Password salah!' };
      }
      handleFirestoreError(err, OperationType.WRITE, `student_sessions/${fbUser.uid}`);
    }

    // 2. Read student doc, app settings, existing exam session, schedules, gform_links
    let studentData;
    try {
      const studSnap = await getDoc(doc(db, 'students', cleanNis));
      if (!studSnap.exists()) {
        return { success: false, message: 'Data siswa tidak ditemukan di Firestore.' };
      }
      studentData = studSnap.data();
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `students/${cleanNis}`);
    }

    const settings = await readAppSettingsPublicAndSecrets({ includeSecrets: false });

    // Strict device lock only when explicitly enabled by admin (default 'Tidak' allows seamless cross-device switching)
    if (
      settings.device_lock === 'Ya' &&
      studentData.activeDeviceId &&
      studentData.activeDeviceId !== devId
    ) {
      return {
        success: false,
        message: 'Kunci Perangkat Aktif! Akun ini terikat pada perangkat lain. Minta Proktor untuk reset akun Anda.',
      };
    }

    let existingExam = null;
    try {
      const exSnap = await getDoc(doc(db, 'exam_sessions', cleanNis));
      if (exSnap.exists()) existingExam = exSnap.data();
    } catch (err) {
      // May not exist yet
    }

    if (
      studentData.status === 'Selesai' ||
      (existingExam && (existingExam.status === 'Selesai' || existingExam.status === 'Selesai (OMR Kertas)'))
    ) {
      return {
        success: false,
        message: `Anda sudah menyelesaikan ujian ini (Skor: ${existingExam?.score ?? 0}). Hubungi Proktor untuk membuka sesi jika diizinkan mengulang.`,
      };
    }

    const riwayat = [];
    if (existingExam && (existingExam.status === 'Selesai' || existingExam.status === 'Selesai (OMR Kertas)')) {
      riwayat.push({
        tanggal: existingExam.submittedAtText || '',
        token: existingExam.tokenUsed || '',
        skor: String(existingExam.score ?? 0),
        status: existingExam.status,
      });
    }

    // Find active published schedule
    let activeMapel = '';
    let activeRuang = studentData.ruang || 'Ruang 1';
    let activeJenisUjian = 'CBT';
    try {
      const qSched = query(collection(db, 'schedules'), where('isPublished', '==', true));
      const schedSnap = await getDocs(qSched);
      for (const d of schedSnap.docs) {
        const j = d.data();
        const sesiMatch =
          !j.sesi ||
          j.sesi.toLowerCase() === 'semua' ||
          String(j.sesi).trim() === String(studentData.sesi || '').trim();
        if (sesiMatch && matchKelasLevel(studentData.kelas, j.kelas)) {
          activeMapel = j.mapel || '';
          activeRuang = studentData.ruang || j.ruang || 'Ruang 1';
          activeJenisUjian = j.jenis_ujian || 'CBT';
          break;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'schedules');
    }

    // Find matching published Google Form link
    let matchedGForm = null;
    try {
      const qGf = query(collection(db, 'gform_links'), where('isPublished', '==', true));
      const gfSnap = await getDocs(qGf);
      const fallbackSettingsMapel =
        settings.nama_ujian && !/^(?:asesmen sumatif cbt|ujian akhir semester|umum|semua)$/i.test(String(settings.nama_ujian).trim())
          ? settings.nama_ujian
          : '';
      const targetM = String(activeMapel || fallbackSettingsMapel || '').toLowerCase().trim();
      const candidates = [];
      gfSnap.forEach((d) => {
        const g = d.data();
        if (matchKelasLevel(studentData.kelas, g.kelas)) {
          const gM = String(g.mapel || '').toLowerCase().trim();
          const mapelMatch = targetM && targetM !== 'umum' && (gM === targetM || gM.includes(targetM) || targetM.includes(gM));
          const kNorm = normalizeRombel(g.kelas);
          const isGeneral = !kNorm || kNorm === 'semua' || kNorm === 'umum' || kNorm === 'all';
          candidates.push({
            linkId: d.id,
            mapel: g.mapel || 'Umum',
            kelas: g.kelas || 'Semua',
            formUrl: g.formUrl || '',
            formId: g.formId || d.id,
            formResponseUrl: g.formResponseUrl || '',
            judulForm: g.judulForm || g.mapel || '',
            priority: (mapelMatch ? 10 : 0) + (!isGeneral ? 5 : 1),
          });
        }
      });
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.priority - a.priority);
        matchedGForm = candidates[0];
        if (!activeMapel || activeMapel === 'Umum') activeMapel = matchedGForm.mapel;
        activeJenisUjian = 'Google Form CBT';
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'gform_links');
    }

    // Restore cross-device progress from Firestore exam_sessions/{nis}
    let tempState = null;
    if (existingExam && existingExam.status === 'Sedang Ujian') {
      tempState = {
        answers: JSON.stringify(existingExam.answers || {}),
        timeLeft: Number(existingExam.timeLeft || 0),
      };
    }

    // Update student active status in Firestore (only if not yet finished)
    if (studentData.status !== 'Selesai') {
      try {
        await updateDoc(doc(db, 'students', cleanNis), {
          status: 'Sedang Ujian',
          activeDeviceId: devId,
          boundOwnerUid: fbUser.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        // Non-fatal if student rule rejects
      }
    }

    // Log login activity
    try {
      const logId = sanitizeDocId(`log_${cleanNis}_${Date.now()}`);
      await setDoc(doc(db, 'violations', logId), {
        id: logId,
        nis: cleanNis,
        nama: studentData.nama,
        aktivitas: 'Login',
        detail: 'Siswa berhasil login / memulihkan sesi Firestore',
        ownerUid: fbUser.uid,
        timestampText: new Date().toLocaleString('id-ID').slice(0, 64),
        createdAt: serverTimestamp(),
      });
    } catch (e) {}

    return {
      success: true,
      data: {
        nis: cleanNis,
        nama: studentData.nama,
        kelas: studentData.kelas,
        sesi: studentData.sesi,
        statusLogin: studentData.status,
        riwayat,
        tempState,
        mapel: activeMapel || settings.nama_ujian || 'Umum',
        ruang: activeRuang,
        selectedRuang: (existingExam && existingExam.ruang) || studentData.ruang || '',
        jenis_ujian: activeJenisUjian,
        gformLink: matchedGForm,
      },
    };
  },

  async getSoalUjian(kelasSiswa, mapelAktif, gformOverrideUrl) {
    await ensureInit();
    if (!auth.currentUser) {
      return { success: false, message: 'Silakan masuk menggunakan Akun Google terlebih dahulu.' };
    }

    // 1. Check matching published Google Form link in Firestore
    try {
      const qGf = query(collection(db, 'gform_links'), where('isPublished', '==', true));
      const gfSnap = await getDocs(qGf);
      const overrideId = gformOverrideUrl ? extractGFormIdAndUrl(gformOverrideUrl).formId : '';
      const targetM = String(mapelAktif || '').toLowerCase().trim();
      const matchedList = [];

      gfSnap.forEach((d) => {
        const g = d.data();
        const isOverrideMatch =
          overrideId &&
          (d.id === sanitizeDocId(overrideId) ||
            g.formId === overrideId ||
            g.formUrl === gformOverrideUrl);
        if (isOverrideMatch || matchKelasLevel(kelasSiswa, g.kelas)) {
          const gM = String(g.mapel || '').toLowerCase().trim();
          const mapelMatch = targetM && targetM !== 'umum' && (gM === targetM || gM.includes(targetM) || targetM.includes(gM));
          matchedList.push({
            doc: g,
            priority: (isOverrideMatch ? 100 : 0) + (mapelMatch ? 10 : 0),
          });
        }
      });

      if (matchedList.length > 0) {
        matchedList.sort((a, b) => b.priority - a.priority);
        const top = matchedList[0].doc;
        let items = sanitizeGFormItemsList(top.items);
        let sections = sanitizeGFormSectionsList(top.sections);
        let formResponseUrl = top.formResponseUrl || '';
        let fbzx = (sections[0] && sections[0].fbzx) || '';
        const hasEntries = items.some((it) => it.entryId || (Array.isArray(it.entryIds) && it.entryIds.length > 0));

        // If admin didn't inspect/cache items/entries/formResponseUrl yet, fetch live
        if ((items.length === 0 || !formResponseUrl || !hasEntries) && (top.formUrl || top.formId)) {
          const live = await api.inspectGoogleFormLink(top.formUrl || top.formId);
          if (live.success && Array.isArray(live.items) && live.items.length > 0) {
            items = sanitizeGFormItemsList(live.items);
            sections = sanitizeGFormSectionsList(live.sections);
            formResponseUrl = live.formResponseUrl || formResponseUrl;
            fbzx = live.fbzx || (sections[0] && sections[0].fbzx) || fbzx;
          }
        }

        if (!formResponseUrl && (top.formUrl || top.formId)) {
          formResponseUrl = top.formUrl
            ? String(top.formUrl).split('?')[0].replace(/\/(?:viewform|edit)?(?:\/)?$/i, '/formResponse')
            : (/^1FAIpQL/.test(top.formId)
              ? `https://docs.google.com/forms/d/e/${top.formId}/formResponse`
              : `https://docs.google.com/forms/d/${top.formId}/formResponse`);
        }

        if (items.length > 0) {
          return {
            success: true,
            source: 'GOOGLE_FORM',
            mapel: top.mapel || mapelAktif || top.judulForm,
            gformMeta: {
              submitMode: top.submitMode || 'HTTP_POST',
              formId: top.formId || top.id,
              formUrl: top.formUrl,
              formResponseUrl,
              fbzx,
              formTitle: top.judulForm || top.mapel,
              formDescription: top.formDescription || '',
              isQuiz: false,
              sections,
            },
            items,
            data: [],
          };
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'gform_links');
    }

    // 2. Fallback to Firestore questions bank
    try {
      const qQuestions = query(collection(db, 'questions'), where('isPublished', '==', true));
      const snap = await getDocs(qQuestions);
      const allQ = snap.docs
        .map((d) => d.data())
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      if (allQ.length === 0) {
        return { success: true, source: 'BANK_SOAL', data: [] };
      }

      const targetMapel = String(mapelAktif || '').toLowerCase().trim();
      let mapelFiltered = [];
      if (targetMapel && targetMapel !== 'umum' && targetMapel !== 'semua') {
        mapelFiltered = allQ.filter((q) => {
          const m = String(q.mapel || '').toLowerCase().trim();
          return m === targetMapel || m.includes(targetMapel) || targetMapel.includes(m);
        });
      }
      if (mapelFiltered.length === 0) mapelFiltered = allQ;

      const classFiltered = mapelFiltered.filter((q) => matchKelasLevel(kelasSiswa, q.kelas));
      const finalQ = classFiltered.length > 0 ? classFiltered : mapelFiltered;

      const formatted = finalQ.map((q) => [
        q.no || '',
        q.soal || '',
        q.a || '',
        q.b || '',
        q.c || '',
        q.d || '',
        q.e || '',
        q.kunci || 'A',
        q.tipe_soal || 'PG',
        q.kesulitan || 'SEDANG',
        q.data_akm || '',
      ]);

      return {
        success: true,
        source: 'BANK_SOAL',
        data: formatted,
        mapel: finalQ[0]?.mapel || mapelAktif,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'questions');
    }
  },

  async saveRuangSiswa(nis, ruangSiswa) {
    await ensureInit();
    if (!auth.currentUser) return { success: false };
    const cleanNis = sanitizeDocId(nis);
    const normRuang = normalizeRuangCanonical(ruangSiswa).slice(0, 64);

    try {
      const studSnap = await getDoc(doc(db, 'students', cleanNis));
      if (studSnap.exists() && studSnap.data().status !== 'Selesai') {
        await updateDoc(doc(db, 'students', cleanNis), {
          ruang: normRuang,
          updatedAt: serverTimestamp(),
        });
      }
      const exRef = doc(db, 'exam_sessions', cleanNis);
      const exSnap = await getDoc(exRef);
      if (exSnap.exists() && exSnap.data().status === 'Sedang Ujian') {
        await updateDoc(exRef, {
          ownerUid: auth.currentUser.uid,
          ruang: normRuang,
          updatedAt: serverTimestamp(),
        });
      }
      return { success: true, ruang: normRuang };
    } catch (err) {
      return { success: false, message: err?.message || 'Gagal simpan ruang' };
    }
  },

  async saveJawabanSementara(nis, answersString, timeLeft, ruangSiswa, totalSoal) {
    await ensureInit();
    if (!auth.currentUser) return { success: false };
    const cleanNis = sanitizeDocId(nis);

    let answersMap = {};
    try {
      const parsed = typeof answersString === 'string' ? JSON.parse(answersString) : answersString;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        answersMap = parsed;
      }
    } catch (e) {
      answersMap = {};
    }

    const answeredCount = Math.min(
      500,
      Object.keys(answersMap).filter((k) => {
        const v = answersMap[k];
        if (v === null || v === undefined) return false;
        if (typeof v === 'string') return v.trim() !== '' && v !== '{}';
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
      }).length
    );

    const clampedTime = Math.max(0, Math.min(86400, parseInt(timeLeft, 10) || 0));
    const clampedTotal = Math.max(0, Math.min(500, parseInt(totalSoal, 10) || 0));
    const normRuang = normalizeRuangCanonical(ruangSiswa).slice(0, 64);

    const exRef = doc(db, 'exam_sessions', cleanNis);
    try {
      const existingSnap = await getDoc(exRef);
      if (existingSnap.exists()) {
        const existing = existingSnap.data();
        if (existing.status === 'Selesai' || existing.status === 'Selesai (OMR Kertas)') {
          return { success: false, forceStopped: true };
        }
        await updateDoc(exRef, {
          ownerUid: auth.currentUser.uid,
          answers: answersMap,
          timeLeft: clampedTime,
          totalSoal: clampedTotal,
          answeredCount,
          ruang: normRuang || existing.ruang || '',
          updatedAt: serverTimestamp(),
        });
        return { success: true, forceStopped: Boolean(existing.forceStopped) };
      } else {
        const studSnap = await getDoc(doc(db, 'students', cleanNis));
        const stud = studSnap.exists() ? studSnap.data() : {};
        await setDoc(exRef, {
          nis: cleanNis,
          nama: String(stud.nama || cleanNis).slice(0, 160),
          kelas: String(stud.kelas || 'Umum').slice(0, 64),
          mapel: 'CBT',
          ruang: normRuang || stud.ruang || '',
          ownerUid: auth.currentUser.uid,
          deviceId: String(stud.activeDeviceId || 'web').slice(0, 128),
          status: 'Sedang Ujian',
          forceStopped: false,
          answers: answersMap,
          timeLeft: clampedTime,
          totalSoal: clampedTotal,
          answeredCount,
          score: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return { success: true, forceStopped: false };
      }
    } catch (err) {
      // Do not crash exam timer on transient conflict, log error context cleanly
      console.warn('saveJawabanSementara warning:', err);
      return { success: false };
    }
  },

  async uploadWebcamLog(nis, nama, fotoBase64, token) {
    await ensureInit();
    if (!auth.currentUser) return { success: false };
    const cleanNis = sanitizeDocId(nis);
    try {
      await setDoc(doc(db, 'photos', cleanNis), {
        nis: cleanNis,
        nama: String(nama || 'Siswa').slice(0, 160),
        fotoBase64: String(fotoBase64 || '').slice(0, 340000),
        tokenSesi: String(token || '').slice(0, 64),
        ownerUid: auth.currentUser.uid,
        timestampText: new Date().toLocaleString('id-ID').slice(0, 64),
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  },

  async laporKecurangan(nis, nama, alasan) {
    await ensureInit();
    if (!auth.currentUser) return { success: false };
    const cleanNis = sanitizeDocId(nis);
    const id = sanitizeDocId(`viol_${cleanNis}_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
    const detailStr = String(alasan || 'Siswa keluar dari jendela / tab ujian').slice(0, 500);
    let aktivitas = 'Pelanggaran';
    if (/fullscreen/i.test(detailStr)) aktivitas = 'Pelanggaran Fullscreen';
    else if (/wajah/i.test(detailStr)) aktivitas = 'Anomali Wajah';
    else if (/pandang|kepala|lirik/i.test(detailStr)) aktivitas = 'Anomali Arah Pandang / Kepala';

    try {
      await setDoc(doc(db, 'violations', id), {
        id,
        nis: cleanNis,
        nama: String(nama || 'Siswa').slice(0, 160),
        aktivitas,
        detail: detailStr,
        ownerUid: auth.currentUser.uid,
        timestampText: new Date().toLocaleString('id-ID').slice(0, 64),
        createdAt: serverTimestamp(),
      });
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  },

  async laporSuaraMencurigakan(nis, nama) {
    await ensureInit();
    if (!auth.currentUser) return { success: false };
    const cleanNis = sanitizeDocId(nis);
    const id = sanitizeDocId(`voice_${cleanNis}_${Date.now()}`);
    try {
      await setDoc(doc(db, 'violations', id), {
        id,
        nis: cleanNis,
        nama: String(nama || 'Siswa').slice(0, 160),
        aktivitas: 'Pelanggaran Suara',
        detail: 'Deteksi suara / percakapan melebihi ambang batas mikrofon',
        ownerUid: auth.currentUser.uid,
        timestampText: new Date().toLocaleString('id-ID').slice(0, 64),
        createdAt: serverTimestamp(),
      });
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  },

  async submitUjian(nis, nama, token, score, status, answersString, detailAnalisaStr, hashSig, gformPayloadJson, ruangSiswa) {
    await ensureInit();
    if (!auth.currentUser) {
      return { success: false, message: 'Sesi Google berakhir. Masuk kembali dengan Google.' };
    }
    const cleanNis = sanitizeDocId(nis);

    // 1. Submit answers to the linked Google Form for this Mapel (server-verified + direct no-cors fallback)
    let gformSubmitted = false;
    let submittedMapel = '';
    if (gformPayloadJson) {
      try {
        const gf = typeof gformPayloadJson === 'string' ? JSON.parse(gformPayloadJson) : gformPayloadJson;
        if (gf && gf.mapel) submittedMapel = String(gf.mapel).slice(0, 120);

        let targetResponseUrl = String(gf?.formResponseUrl || '').trim();
        if (!targetResponseUrl && gf?.formUrl) {
          targetResponseUrl = String(gf.formUrl).split('?')[0].replace(/\/(?:viewform|edit)?(?:\/)?$/i, '/formResponse');
        } else if (!targetResponseUrl && gf?.formId) {
          targetResponseUrl = /^1FAIpQL/.test(gf.formId)
            ? `https://docs.google.com/forms/d/e/${gf.formId}/formResponse`
            : `https://docs.google.com/forms/d/${gf.formId}/formResponse`;
        }

        if (targetResponseUrl && gf?.httpEntries && Object.keys(gf.httpEntries).length > 0) {
          const secCount = parseInt(gf.sectionCount || 1, 10) || 1;
          const fbzx = String(gf.fbzx || '').trim();

          // 1a. Try server-side /api/submit-gform first (returns real HTTP 200 verification when reachable)
          for (const base of CLOUD_GFORM_BASE_URLS) {
            try {
              const sResp = await fetch(`${base}/api/submit-gform`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  formResponseUrl: targetResponseUrl,
                  httpEntries: gf.httpEntries,
                  sectionCount: secCount,
                  fbzx,
                }),
              });
              const cType = sResp.headers.get('content-type') || '';
              if (sResp.ok && cType.includes('application/json')) {
                const sJson = await sResp.json();
                if (sJson && sJson.gformSubmitted) {
                  gformSubmitted = true;
                  break;
                }
              }
            } catch (e) {}
          }

          // 1b. Direct browser POST (mode: 'no-cors') so GitHub Pages offline/cloud-independent submit also writes directly to Google Form
          if (!gformSubmitted) {
            const params = new URLSearchParams();
            Object.entries(gf.httpEntries).forEach(([k, v]) => {
              if (Array.isArray(v)) {
                v.forEach((sub) => {
                  if (sub !== undefined && sub !== null && String(sub) !== '') params.append(k, String(sub));
                });
              } else if (v !== undefined && v !== null && String(v) !== '') {
                params.append(k, String(v));
              }
            });
            params.append('fvv', '1');
            if (secCount > 1) {
              const pages = Array.from({ length: secCount }, (_, idx) => idx).join(',');
              params.append('pageHistory', pages);
            }
            if (fbzx) params.append('fbzx', fbzx);

            await fetch(targetResponseUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
              body: params.toString(),
            });
            gformSubmitted = true;
          }
        }
      } catch (e) {
        console.warn('Google Form submit warning:', e);
      }
    }

    let answersMap = {};
    try {
      const parsed = typeof answersString === 'string' ? JSON.parse(answersString) : answersString;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) answersMap = parsed;
    } catch (e) {}

    let detailList = [];
    try {
      const parsedDetail = typeof detailAnalisaStr === 'string' ? JSON.parse(detailAnalisaStr) : detailAnalisaStr;
      if (Array.isArray(parsedDetail)) detailList = parsedDetail.slice(0, 200);
    } catch (e) {}

    const numericScore = Math.max(0, Math.min(100, Number(score) || 0));
    const normRuang = normalizeRuangCanonical(ruangSiswa).slice(0, 64);
    const nowText = new Date().toLocaleString('id-ID').slice(0, 64);
    const exRef = doc(db, 'exam_sessions', cleanNis);

    try {
      const existingSnap = await getDoc(exRef);
      if (existingSnap.exists()) {
        await updateDoc(exRef, {
          ownerUid: auth.currentUser.uid,
          status: 'Selesai',
          mapel: submittedMapel || existingSnap.data().mapel || 'CBT',
          answers: answersMap,
          score: numericScore,
          tokenUsed: String(token || '').slice(0, 64),
          hashSig: String(hashSig || '').slice(0, 128),
          detailAnalisa: detailList,
          ruang: normRuang || existingSnap.data().ruang || '',
          submittedAtText: nowText,
          updatedAt: serverTimestamp(),
        });
      } else {
        const studSnap = await getDoc(doc(db, 'students', cleanNis));
        const stud = studSnap.exists() ? studSnap.data() : {};
        await setDoc(exRef, {
          nis: cleanNis,
          nama: String(nama || stud.nama || cleanNis).slice(0, 160),
          kelas: String(stud.kelas || 'Umum').slice(0, 64),
          mapel: submittedMapel || 'CBT',
          ruang: normRuang || stud.ruang || '',
          ownerUid: auth.currentUser.uid,
          status: 'Selesai',
          answers: answersMap,
          timeLeft: 0,
          totalSoal: detailList.length,
          answeredCount: Object.keys(answersMap).length,
          score: numericScore,
          tokenUsed: String(token || '').slice(0, 64),
          hashSig: String(hashSig || '').slice(0, 128),
          detailAnalisa: detailList,
          submittedAtText: nowText,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      try {
        await updateDoc(doc(db, 'students', cleanNis), {
          status: 'Selesai',
          ruang: normRuang || '',
          updatedAt: serverTimestamp(),
        });
      } catch (e) {}

      const logId = sanitizeDocId(`done_${cleanNis}_${Date.now()}`);
      await setDoc(doc(db, 'violations', logId), {
        id: logId,
        nis: cleanNis,
        nama: String(nama || 'Siswa').slice(0, 160),
        aktivitas: 'Selesai',
        detail: `Ujian Selesai (Skor: ${numericScore})${gformSubmitted ? ' [GForm+Firestore]' : ' [Firestore]'}`,
        ownerUid: auth.currentUser.uid,
        timestampText: nowText,
        createdAt: serverTimestamp(),
      });

      return { success: true, score: numericScore, gformSubmitted };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `exam_sessions/${cleanNis}`);
    }
  },

  // ================= PROCTOR FLOWS =================
  async loginProktor(username, password) {
    const cleanUsername = sanitizeDocId(String(username || '').trim().toLowerCase());
    if (!cleanUsername) return { success: false, message: 'Username tidak boleh kosong!' };

    const fbUser = await ensureSignedInUser({
      interactivePrompt: true,
      roleLabel: 'Panel Proktor CBT',
    });
    if (!fbUser) {
      return { success: false, message: 'Autentikasi Google diperlukan untuk Panel Proktor.' };
    }

    const passHash = await sha256Hex('cbt:' + String(password || '').trim());
    const sessRef = doc(db, 'proctor_sessions', fbUser.uid);

    try {
      const existing = await getDoc(sessRef);
      if (existing.exists()) {
        await updateDoc(sessRef, {
          proctorUsername: cleanUsername,
          passHash,
          nama: String(username || cleanUsername).slice(0, 160),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(sessRef, {
          uid: fbUser.uid,
          proctorUsername: cleanUsername,
          passHash,
          nama: String(username || cleanUsername).slice(0, 160),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return { success: true, nama: String(username || cleanUsername) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
        return { success: false, message: 'Username atau Password Proktor salah!' };
      }
      handleFirestoreError(err, OperationType.WRITE, `proctor_sessions/${fbUser.uid}`);
    }
  },

  async getProktorDashboardData() {
    await ensureInit();
    let fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      fbUser = await ensureSignedInUser({ interactivePrompt: true, roleLabel: 'Panel Proktor CBT' });
      if (!fbUser) return { success: false, message: 'Autentikasi Google diperlukan.' };
    }

    try {
      const [settings, studentsSnap, logsSnap, schedulesSnap, photosSnap, sessionsSnap] =
        await Promise.all([
          readAppSettingsPublicAndSecrets({ includeSecrets: true }),
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'violations')),
          getDocs(collection(db, 'schedules')),
          getDocs(collection(db, 'photos')),
          getDocs(collection(db, 'exam_sessions')),
        ]);

      const dataSiswa = [];
      const ruangMap = {};
      studentsSnap.forEach((d) => {
        const s = d.data();
        dataSiswa.push([s.nis || d.id, s.nama || '', s.kelas || 'Umum', s.sesi || '1', '******', s.status || 'Offline']);
        if (s.ruang) ruangMap[s.nis || d.id] = normalizeRuangCanonical(s.ruang);
      });

      const dataLog = logsSnap.docs
        .map((d) => d.data())
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
        .map((l) => [l.timestampText || '', l.nis || '', l.nama || '', l.aktivitas || '', l.detail || '', 'Firestore', 'Web']);

      const dataJadwal = schedulesSnap.docs.map((d) => {
        const j = d.data();
        return [
          j.tanggal || '', j.mapel || '', j.kelas || '', j.ruang || '', j.sesi || '',
          j.jam_mulai || '', j.jam_selesai || '', j.token || settings.token || '', j.status || 'Aktif',
          j.proktor || '', j.pengawas || '', j.banyak_soal || '', j.jenis_ujian || 'CBT',
        ];
      });

      const dataFoto = photosSnap.docs.map((d) => {
        const f = d.data();
        return [f.timestampText || '', f.nis || d.id, f.nama || '', f.fotoBase64 || '', f.tokenSesi || ''];
      });

      const progressMap = {};
      sessionsSnap.forEach((d) => {
        const ex = d.data();
        const nisKey = ex.nis || d.id;
        if (ex.ruang && !ruangMap[nisKey]) {
          ruangMap[nisKey] = normalizeRuangCanonical(ex.ruang);
        }
        progressMap[nisKey] = {
          answeredCount: Number(ex.answeredCount || 0),
          timeLeft: Number(ex.timeLeft || 0),
          totalSoal: Number(ex.totalSoal || 0),
        };
      });

      return {
        success: true,
        data: {
          siswa: dataSiswa,
          log: dataLog,
          settings,
          jadwal: dataJadwal,
          foto: dataFoto,
          ruangMap,
          progressMap,
        },
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'proktor_dashboard');
    }
  },

  async unlockSiswa(nis) {
    await ensureInit();
    const cleanNis = sanitizeDocId(nis);
    try {
      await updateDoc(doc(db, 'students', cleanNis), {
        status: 'Offline',
        activeDeviceId: '',
        boundOwnerUid: '',
        updatedAt: serverTimestamp(),
      });
      try {
        const exRef = doc(db, 'exam_sessions', cleanNis);
        const exSnap = await getDoc(exRef);
        if (exSnap.exists()) {
          await updateDoc(exRef, {
            status: 'Offline',
            forceStopped: false,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {}
      if (auth.currentUser) {
        const logId = sanitizeDocId(`reset_${cleanNis}_${Date.now()}`);
        await setDoc(doc(db, 'violations', logId), {
          id: logId,
          nis: cleanNis,
          nama: 'Siswa',
          aktivitas: 'Reset',
          detail: 'Proktor mereset kunci login & perangkat peserta',
          ownerUid: auth.currentUser.uid,
          timestampText: new Date().toLocaleString('id-ID').slice(0, 64),
          createdAt: serverTimestamp(),
        });
      }
      return { success: true, message: `Sesi login & kunci perangkat NIS ${cleanNis} berhasil di-reset.` };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${cleanNis}`);
    }
  },

  async forceSelesaiUjian(nis) {
    await ensureInit();
    const cleanNis = sanitizeDocId(nis);
    const nowText = new Date().toLocaleString('id-ID').slice(0, 64);
    try {
      await updateDoc(doc(db, 'students', cleanNis), {
        status: 'Selesai',
        updatedAt: serverTimestamp(),
      });
      const exRef = doc(db, 'exam_sessions', cleanNis);
      const exSnap = await getDoc(exRef);
      if (exSnap.exists()) {
        await updateDoc(exRef, {
          status: 'Selesai',
          forceStopped: true,
          submittedAtText: nowText,
          updatedAt: serverTimestamp(),
        });
      }
      if (auth.currentUser) {
        const logId = sanitizeDocId(`force_${cleanNis}_${Date.now()}`);
        await setDoc(doc(db, 'violations', logId), {
          id: logId,
          nis: cleanNis,
          nama: 'Siswa',
          aktivitas: 'Force Stop',
          detail: 'Ujian dihentikan paksa oleh Proktor',
          ownerUid: auth.currentUser.uid,
          timestampText: nowText,
          createdAt: serverTimestamp(),
        });
      }
      return { success: true, message: `Ujian peserta NIS ${cleanNis} berhasil dihentikan.` };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `exam_sessions/${cleanNis}`);
    }
  },

  async submitJawabanHybridLJK(nis, nama, token, score, status, ansString, detailAnalisaStr) {
    await ensureInit();
    const cleanNis = sanitizeDocId(nis);
    const numericScore = Math.max(0, Math.min(100, Number(score) || 0));
    const nowText = new Date().toLocaleString('id-ID').slice(0, 64);
    try {
      await setDoc(doc(db, 'exam_sessions', cleanNis), {
        nis: cleanNis,
        nama: String(nama || 'Siswa Hybrid').slice(0, 160),
        kelas: 'Hybrid',
        mapel: 'OMR Kertas',
        ruang: 'Hybrid',
        ownerUid: auth.currentUser?.uid || 'proctor',
        status: 'Selesai (OMR Kertas)',
        answers: {},
        timeLeft: 0,
        totalSoal: 0,
        answeredCount: 0,
        score: numericScore,
        tokenUsed: String(token || 'HYBRID-OMR').slice(0, 64),
        submittedAtText: nowText,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await updateDoc(doc(db, 'students', cleanNis), {
          status: 'Selesai',
          updatedAt: serverTimestamp(),
        });
      } catch (e) {}
      return { success: true, message: `Nilai LJK Hybrid untuk ${nama} (${numericScore}) tersimpan di Firestore.` };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `exam_sessions/${cleanNis}`);
    }
  },
};

// Expose runner compatible with window.google.script.run
function createFirestoreRunner(successCb, failureCb) {
  const runner = {
    withSuccessHandler(fn) {
      return createFirestoreRunner(fn, failureCb);
    },
    withFailureHandler(fn) {
      return createFirestoreRunner(successCb, fn);
    },
  };

  Object.keys(api).forEach((methodName) => {
    runner[methodName] = (...args) => {
      Promise.resolve()
        .then(() => api[methodName](...args))
        .then((res) => {
          if (typeof successCb === 'function') successCb(res);
        })
        .catch((err) => {
          console.error(`CBT Firestore Bridge error in ${methodName}:`, err);
          if (typeof failureCb === 'function') {
            failureCb(err instanceof Error ? err : new Error(String(err)));
          }
        });
    };
  });

  return runner;
}

const rootRunner = createFirestoreRunner(null, null);
window.google = { script: { run: rootRunner } };
if (typeof window.__resolveCbtBridge === 'function') {
  window.__resolveCbtBridge(rootRunner);
}
