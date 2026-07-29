import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/aktivitas/route";
import { wadah } from "./bantu/wadah";

const PESERTA = "peserta-1";
const LAIN = "peserta-2";
const PEMBINA = "pembimbing-1";
const HARI = "2026-07-28";           // jam uji dibekukan pada tanggal ini

const URAIAN = "Membantu konfigurasi perangkat jaringan di ruang server.";
// Data URL gambar terkecil yang sah — cukup untuk menguji jalur penyimpanannya
const FOTO = "data:image/jpeg;base64," + "A".repeat(400);

function panggil(body: any, token?: string) {
  return POST(
    new Request("http://uji/api/aktivitas", {
      method: "POST",
      headers: token
        ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
        : { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}
async function isi(res: Response) {
  return { status: res.status, body: await res.json() };
}

const catatan = (uid = PESERTA, tanggal = HARI) => wadah.db.ambil(`aktivitas/${uid}_${tanggal}`);
const foto = (uid = PESERTA, tanggal = HARI) => wadah.db.ambil(`aktivitasFoto/${uid}_${tanggal}`);

let tPeserta = "", tLain = "", tPembina = "";

beforeEach(() => {
  wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${LAIN}`, { name: "Siti", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${PEMBINA}`, { name: "Bu Sari", role: "pembimbing" });
  tPeserta = wadah.auth.masuk(PESERTA);
  tLain = wadah.auth.masuk(LAIN);
  tPembina = wadah.auth.masuk(PEMBINA);
});

describe("menulis catatan kegiatan", () => {
  it("menyimpan catatan hari ini beserta nama penulisnya", async () => {
    const { status } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN }, tPeserta)
    );
    expect(status).toBe(200);

    const c = catatan();
    expect(c.kegiatan).toBe(URAIAN);
    expect(c.nama).toBe("Naufal");
    expect(c.status).toBe("dikirim");
    expect(c.adaFoto).toBe(false);
  });

  it("memakai tanggal hari ini bila tidak disebutkan", async () => {
    await panggil({ aksi: "simpan", kegiatan: URAIAN }, tPeserta);
    expect(catatan(PESERTA, HARI)).toBeTruthy();
  });

  it("menolak uraian yang terlalu pendek", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: "kerja" }, tPeserta)
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("minimal 10 karakter");
  });

  it("menolak tanggal yang belum tiba", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "simpan", tanggal: "2026-07-30", kegiatan: URAIAN }, tPeserta)
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("belum tiba");
  });

  it("mengizinkan menulis mundur sampai tujuh hari", async () => {
    const { status } = await isi(
      await panggil({ aksi: "simpan", tanggal: "2026-07-21", kegiatan: URAIAN }, tPeserta)
    );
    expect(status).toBe(200);
  });

  it("mengunci tanggal yang sudah lewat lebih dari tujuh hari", async () => {
    // Inilah yang mencegah logbook sebulan dikarang dalam satu malam
    const { status, body } = await isi(
      await panggil({ aksi: "simpan", tanggal: "2026-07-10", kegiatan: URAIAN }, tPeserta)
    );
    expect(status).toBe(412);
    expect(body.pesan).toContain("7 hari terakhir");
    expect(catatan(PESERTA, "2026-07-10")).toBeUndefined();
  });

  it("pembimbing tidak menulis catatan kegiatan", async () => {
    const { status } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN }, tPembina)
    );
    expect(status).toBe(403);
  });

  it("catatan bisa diperbaiki selama belum diperiksa", async () => {
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN }, tPeserta);
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: "Uraian yang sudah diperbaiki." }, tPeserta);
    expect(catatan().kegiatan).toBe("Uraian yang sudah diperbaiki.");
  });
});

describe("foto bukti", () => {
  it("disimpan di koleksi terpisah, bukan menempel di catatannya", async () => {
    // Pemisahan ini yang menjaga daftar kegiatan tetap ringan dibuka
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN, foto: FOTO }, tPeserta);

    expect(catatan().adaFoto).toBe(true);
    expect(catatan().foto).toBeUndefined();
    expect(foto().foto).toBe(FOTO);
  });

  it("menolak berkas yang bukan gambar", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN, foto: "halo" }, tPeserta)
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("tidak dikenali");
  });

  it("menolak foto yang terlalu besar", async () => {
    const besar = "data:image/jpeg;base64," + "A".repeat(300_000);
    const { status, body } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN, foto: besar }, tPeserta)
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("terlalu besar");
  });

  it("menyimpan ulang tanpa foto tidak menghapus foto yang sudah ada", async () => {
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN, foto: FOTO }, tPeserta);
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: "Uraian diperbarui lagi." }, tPeserta);

    expect(catatan().adaFoto).toBe(true);
    expect(foto().foto).toBe(FOTO);
  });

  it("bisa dihapus peserta sendiri", async () => {
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN, foto: FOTO }, tPeserta);
    const { status } = await isi(await panggil({ aksi: "hapusFoto", tanggal: HARI }, tPeserta));

    expect(status).toBe(200);
    expect(catatan().adaFoto).toBe(false);
    expect(foto()).toBeUndefined();
  });
});

describe("pemeriksaan pembimbing", () => {
  beforeEach(async () => {
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: URAIAN }, tPeserta);
  });

  it("menandai diperiksa beserta nama pemeriksanya", async () => {
    const { status } = await isi(
      await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI, catatan: "Sudah bagus." }, tPembina)
    );
    expect(status).toBe(200);

    const c = catatan();
    expect(c.status).toBe("diperiksa");
    expect(c.namaPemeriksa).toBe("Bu Sari");
    expect(c.catatanPembimbing).toBe("Sudah bagus.");
  });

  it("catatan terkunci setelah diperiksa", async () => {
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI }, tPembina);

    const { status, body } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: "Diam-diam diubah." }, tPeserta)
    );
    expect(status).toBe(409);
    expect(body.pesan).toContain("sudah diperiksa");
    expect(catatan().kegiatan).toBe(URAIAN);
  });

  it("fotonya juga ikut terkunci", async () => {
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI }, tPembina);
    const { status } = await isi(await panggil({ aksi: "hapusFoto", tanggal: HARI }, tPeserta));
    expect(status).toBe(409);
  });

  it("tanda periksa bisa dicabut kembali", async () => {
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI }, tPembina);
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI, batal: true }, tPembina);

    expect(catatan().status).toBe("dikirim");
    // Setelah dicabut, peserta bisa memperbaiki lagi
    const { status } = await isi(
      await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: "Sudah diperbaiki." }, tPeserta)
    );
    expect(status).toBe(200);
  });

  it("peserta tidak bisa memeriksa catatannya sendiri", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI }, tPeserta)
    );
    expect(status).toBe(403);
    expect(body.pesan).toContain("Hanya admin atau pembimbing");
  });

  it("peserta lain tidak bisa memeriksa", async () => {
    const { status } = await isi(
      await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI }, tLain)
    );
    expect(status).toBe(403);
  });

  it("memperbaiki uraian tidak menghapus catatan pembimbing", async () => {
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI, catatan: "Tambahkan rinciannya." }, tPembina);
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI, catatan: "Tambahkan rinciannya.", batal: true }, tPembina);
    await panggil({ aksi: "simpan", tanggal: HARI, kegiatan: "Uraian dengan rincian lebih lengkap." }, tPeserta);

    expect(catatan().catatanPembimbing).toBe("Tambahkan rinciannya.");
  });

  it("meninggalkan jejak audit", async () => {
    await panggil({ aksi: "periksa", uid: PESERTA, tanggal: HARI }, tPembina);
    const jejak = [...((wadah.db as any).data.get("jejak")?.values() || [])] as any[];
    expect(jejak.at(-1)?.aksi).toBe("kegiatan.periksa");
    expect(jejak.at(-1)?.namaSasaran).toBe("Naufal");
  });
});

describe("tanpa sesi", () => {
  it("ditolak", async () => {
    const { status } = await isi(await panggil({ aksi: "simpan", kegiatan: URAIAN }));
    expect(status).toBe(401);
  });
});
