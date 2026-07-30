/**
 * Firestore dan Firebase Auth tiruan, seluruhnya di dalam memori.
 *
 * Tujuannya supaya API route bisa diuji apa adanya — kode yang dijalankan uji
 * persis kode yang berjalan di produksi, hanya lapisan penyimpanannya yang
 * diganti. Tanpa ini setiap uji butuh jaringan, kredensial, dan basis data
 * sungguhan, dan pada praktiknya berarti tidak akan pernah dijalankan.
 *
 * Yang ditiru hanya bagian yang benar-benar dipakai kode ini. Bukan Firestore
 * lengkap, dan memang tidak perlu.
 */

export class StempelPalsu {
  constructor(public ms: number) {}
  toDate() {
    return new Date(this.ms);
  }
  toMillis() {
    return this.ms;
  }
}

const HAPUS = Symbol("hapus-field");
const STEMPEL = Symbol("stempel-server");

/** Padanan `Timestamp` dari firebase-admin, secukupnya untuk kode ini. */
export const TimestampPalsu = {
  fromDate: (d: Date) => new StempelPalsu(d.getTime()),
  fromMillis: (ms: number) => new StempelPalsu(ms),
  now: () => new StempelPalsu(Date.now()),
};

export const FieldValuePalsu = {
  serverTimestamp: () => STEMPEL as any,
  delete: () => HAPUS as any,
  increment: (n: number) => ({ __tambah: n }) as any,
};

/** Salin nilai sambil menerjemahkan penanda khusus Firestore. */
function terapkan(tujuan: any, sumber: any, jam: () => number) {
  for (const [k, v] of Object.entries(sumber)) {
    if (v === HAPUS) delete tujuan[k];
    else if (v === STEMPEL) tujuan[k] = new StempelPalsu(jam());
    else if (v && typeof v === "object" && "__tambah" in (v as any)) {
      tujuan[k] = (Number(tujuan[k]) || 0) + (v as any).__tambah;
    } else tujuan[k] = v;
  }
}

function cocok(nilai: any, op: string, banding: any): boolean {
  const n = nilai instanceof StempelPalsu ? nilai.ms : nilai;
  switch (op) {
    case "==": return n === banding;
    case "!=": return n !== banding;
    case ">": return n > banding;
    case ">=": return n >= banding;
    case "<": return n < banding;
    case "<=": return n <= banding;
    case "in": return Array.isArray(banding) && banding.includes(n);
    case "array-contains": return Array.isArray(n) && n.includes(banding);
    case "array-contains-any":
      return Array.isArray(n) && Array.isArray(banding) && n.some((x) => banding.includes(x));
    default: throw new Error(`Operator ${op} belum ditiru.`);
  }
}

export class FirestorePalsu {
  /** koleksi -> id dokumen -> isi */
  data = new Map<string, Map<string, any>>();

  /**
   * Stempel server mengikuti `Date.now()`, yang dikendalikan uji lewat
   * `vi.setSystemTime`. Dengan begitu jam yang tercatat di dokumen dan jam
   * yang dibaca kode aplikasi selalu bercerita hal yang sama.
   */
  jam = () => Date.now();

  bersihkan() { this.data.clear(); penghitungOtomatis = 0; }

  private koleksi(nama: string) {
    if (!this.data.has(nama)) this.data.set(nama, new Map());
    return this.data.get(nama)!;
  }

  /** Isi awal tanpa lewat API, untuk menyiapkan keadaan uji. */
  taruh(jalur: string, isi: any) {
    const [k, id] = pisah(jalur);
    this.koleksi(k).set(id, { ...isi });
  }

  ambil(jalur: string) {
    const [k, id] = pisah(jalur);
    return this.koleksi(k).get(id);
  }

  doc(jalur: string) {
    const [namaKoleksi, id] = pisah(jalur);
    const kol = this.koleksi(namaKoleksi);
    const ref: any = {
      id,
      path: jalur,
      get: async () => bungkus(id, kol.get(id), ref),
      set: async (isi: any, opsi?: { merge?: boolean }) => {
        const lama = opsi?.merge ? { ...(kol.get(id) || {}) } : {};
        terapkan(lama, isi, this.jam);
        kol.set(id, lama);
      },
      update: async (isi: any) => {
        if (!kol.has(id)) throw new Error("Dokumen tidak ada.");
        const lama = { ...kol.get(id) };
        terapkan(lama, isi, this.jam);
        kol.set(id, lama);
      },
      delete: async () => { kol.delete(id); },
    };
    return ref;
  }

  collection(nama: string) {
    return buatQuery(this, nama, []);
  }

  batch() {
    const antrean: (() => Promise<void>)[] = [];
    return {
      set: (ref: any, isi: any, opsi?: any) => { antrean.push(() => ref.set(isi, opsi)); },
      update: (ref: any, isi: any) => { antrean.push(() => ref.update(isi)); },
      delete: (ref: any) => { antrean.push(() => ref.delete()); },
      commit: async () => { for (const t of antrean) await t(); },
    };
  }

  async getAll(...refs: any[]) {
    return Promise.all(refs.map((r) => r.get()));
  }
}

/** Penghasil id dokumen otomatis; berurutan supaya hasil uji dapat diramalkan. */
let penghitungOtomatis = 0;

function pisah(jalur: string): [string, string] {
  const bagian = jalur.split("/").filter(Boolean);
  if (bagian.length !== 2) throw new Error(`Jalur dokumen tidak didukung: ${jalur}`);
  return [bagian[0], bagian[1]];
}

function bungkus(id: string, isi: any, ref: any) {
  return {
    id,
    ref,
    exists: isi !== undefined,
    data: () => (isi === undefined ? undefined : { ...isi }),
  };
}

function buatQuery(db: FirestorePalsu, nama: string, syarat: [string, string, any][], batas?: number) {
  const q: any = {
    where: (f: string, op: string, v: any) => buatQuery(db, nama, [...syarat, [f, op, v]], batas),
    orderBy: () => q,                       // urutan tidak diuji, cukup diabaikan
    limit: (n: number) => buatQuery(db, nama, syarat, n),
    doc: (id?: string) => db.doc(`${nama}/${id ?? "auto-" + (++penghitungOtomatis)}`),
    add: async (isi: any) => {
      const ref = db.doc(`${nama}/auto-${++penghitungOtomatis}`);
      await ref.set(isi);
      return ref;
    },
    get: async () => {
      const kol = (db as any).data.get(nama) as Map<string, any> | undefined;
      let isi = [...(kol?.entries() || [])].filter(([, v]) =>
        syarat.every(([f, op, b]) => cocok(v[f], op, b))
      );
      if (batas != null) isi = isi.slice(0, batas);
      const docs = isi.map(([id, v]) => bungkus(id, v, db.doc(`${nama}/${id}`)));
      return { empty: docs.length === 0, size: docs.length, docs, forEach: (f: any) => docs.forEach(f) };
    },
  };
  return q;
}

// ============================ Auth tiruan ============================

export class AuthPalsu {
  /** token -> uid */
  token = new Map<string, string>();
  akun = new Map<string, any>();

  masuk(uid: string, email = `${uid}@contoh.com`) {
    this.token.set(`token-${uid}`, uid);
    this.akun.set(uid, { uid, email });
    return `token-${uid}`;
  }

  async verifyIdToken(token: string) {
    const uid = this.token.get(token);
    if (!uid) {
      const e: any = new Error("Decoding Firebase ID token failed.");
      e.code = "auth/argument-error";
      throw e;
    }
    return { uid };
  }

  async createUser({ email, password, displayName }: any) {
    const uid = `uid-${this.akun.size + 1}`;
    this.akun.set(uid, { uid, email, password, displayName });
    return { uid, email, displayName };
  }
  async updateUser(uid: string, data: any) {
    this.akun.set(uid, { ...this.akun.get(uid), ...data });
    return this.akun.get(uid);
  }
  async deleteUser(uid: string) { this.akun.delete(uid); }
  async getUserByEmail(email: string) {
    const u = [...this.akun.values()].find((x) => x.email === email);
    if (!u) { const e: any = new Error("no user"); e.code = "auth/user-not-found"; throw e; }
    return u;
  }
  async listUsers() { return { users: [...this.akun.values()] }; }
}
