import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/izin/route";
import { wadah } from "./bantu/wadah";

const PESERTA = "peserta-1";
const LAIN = "peserta-2";
const PEMBINA = "pembimbing-1";

function panggil(body: any, token?: string) {
  return POST(
    new Request("http://uji/api/izin", {
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

let tPeserta = "", tLain = "", tPembina = "";

beforeEach(() => {
  wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${LAIN}`, { name: "Siti", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${PEMBINA}`, { name: "Bu Sari", role: "pembimbing" });
  tPeserta = wadah.auth.masuk(PESERTA);
  tLain = wadah.auth.masuk(LAIN);
  tPembina = wadah.auth.masuk(PEMBINA);
});

/** Data URL gambar palsu; isinya tidak dibaca, hanya bentuk dan panjangnya. */
const FOTO = "data:image/jpeg;base64," + "A".repeat(400);

async function ajukanContoh(hari = ["2026-07-29"], tambahan: any = {}) {
  // Sakit dua hari ke atas wajib bersurat, jadi contohnya ikut melampirkan
  const perluSurat = hari.length >= 2;
  const { body } = await isi(
    await panggil(
      {
        aksi: "ajukan", jenis: "sakit", alasan: "Demam sejak semalam.",
        tanggalMulai: hari[0], tanggalSelesai: hari[hari.length - 1],
        ...(perluSurat ? { bukti: FOTO } : {}),
        ...tambahan,
      },
      tPeserta
    )
  );
  return body.id as string;
}

describe("pengajuan izin", () => {
  it("menghitung jumlah hari dari rentang tanggal", async () => {
    const { status, body } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "izin", alasan: "Mengurus berkas kampus.",
          tanggalMulai: "2026-07-29", tanggalSelesai: "2026-07-31",
        },
        tPeserta
      )
    );
    expect(status).toBe(200);
    expect(body.jumlahHari).toBe(3);
  });

  it("menolak alasan yang terlalu pendek", async () => {
    const { status, body } = await isi(
      await panggil(
        { aksi: "ajukan", jenis: "izin", alasan: "abc", tanggalMulai: "2026-07-29" },
        tPeserta
      )
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("minimal 5 karakter");
  });

  it("menolak tanggal selesai yang mendahului tanggal mulai", async () => {
    const { status } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "izin", alasan: "Keperluan keluarga.",
          tanggalMulai: "2026-07-31", tanggalSelesai: "2026-07-29",
        },
        tPeserta
      )
    );
    expect(status).toBe(400);
  });

  it("membatasi rentang agar tidak dipakai memblokir berbulan-bulan", async () => {
    const { status, body } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "izin", alasan: "Cuti panjang.",
          tanggalMulai: "2026-07-01", tanggalSelesai: "2026-09-30",
        },
        tPeserta
      )
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("maksimal 30 hari");
  });

  it("menolak pengajuan bertabrakan pada tanggal yang sama", async () => {
    await ajukanContoh(["2026-07-29"]);
    const { status, body } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "izin", alasan: "Alasan lain lagi.",
          tanggalMulai: "2026-07-29", tanggalSelesai: "2026-07-30",
        },
        tPeserta
      )
    );
    expect(status).toBe(409);
    expect(body.pesan).toContain("tanggal yang sama");
  });

  it("pembimbing tidak mengajukan izin untuk dirinya", async () => {
    const { status } = await isi(
      await panggil(
        { aksi: "ajukan", jenis: "izin", alasan: "Ada keperluan.", tanggalMulai: "2026-07-29" },
        tPembina
      )
    );
    expect(status).toBe(403);
  });
});

describe("persetujuan izin", () => {
  it("yang disetujui langsung tercatat di riwayat kehadiran", async () => {
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);

    const { status, body } = await isi(
      await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPembina)
    );
    expect(status).toBe(200);
    expect(body.dicatat).toBe(2);

    for (const t of ["2026-07-29", "2026-07-30"]) {
      const a = wadah.db.ambil(`absensi/${PESERTA}_${t}`);
      expect(a.status).toBe("sakit");
      expect(a.sumber).toBe("izin");
      expect(a.izinId).toBe(id);
    }
  });

  it("tidak menimpa kehadiran yang sudah tercatat sungguhan", async () => {
    // Peserta ternyata tetap masuk pada salah satu tanggal yang diajukan
    wadah.db.taruh(`absensi/${PESERTA}_2026-07-29`, {
      userId: PESERTA, tanggal: "2026-07-29", status: "hadir", jamMasuk: { ms: 1 },
    });
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);
    const { body } = await isi(
      await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPembina)
    );

    expect(body.dicatat).toBe(1);
    expect(wadah.db.ambil(`absensi/${PESERTA}_2026-07-29`).status).toBe("hadir");
    expect(wadah.db.ambil(`absensi/${PESERTA}_2026-07-30`).status).toBe("sakit");
  });

  it("penolakan tidak menulis catatan kehadiran apa pun", async () => {
    const id = await ajukanContoh(["2026-07-29"]);
    const { body } = await isi(
      await panggil({ aksi: "proses", id, keputusan: "ditolak" }, tPembina)
    );
    expect(body.dicatat).toBe(0);
    expect(wadah.db.ambil(`absensi/${PESERTA}_2026-07-29`)).toBeUndefined();
  });

  it("peserta tidak bisa menyetujui pengajuannya sendiri", async () => {
    const id = await ajukanContoh();
    const { status, body } = await isi(
      await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPeserta)
    );
    expect(status).toBe(403);
    expect(body.pesan).toContain("Hanya admin atau pembimbing");
  });

  it("pengajuan yang sudah diputus tidak bisa diputus ulang", async () => {
    const id = await ajukanContoh();
    await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPembina);
    const { status, body } = await isi(
      await panggil({ aksi: "proses", id, keputusan: "ditolak" }, tPembina)
    );
    expect(status).toBe(409);
    expect(body.pesan).toContain("sudah disetujui");
  });

  it("mencatat siapa yang memproses", async () => {
    const id = await ajukanContoh();
    await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPembina);
    const izin = wadah.db.ambil(`izin/${id}`);
    expect(izin.diprosesOleh).toBe(PEMBINA);
    expect(izin.namaPemroses).toBe("Bu Sari");
  });
});

// ============================ Surat dokter ============================

describe("surat dokter wajib untuk sakit panjang", () => {
  const sakit = (hari: string[], bukti?: string) =>
    panggil(
      {
        aksi: "ajukan", jenis: "sakit", alasan: "Demam tinggi, disuruh istirahat.",
        tanggalMulai: hari[0], tanggalSelesai: hari[hari.length - 1],
        ...(bukti ? { bukti } : {}),
      },
      tPeserta
    );

  it("sakit dua hari tanpa surat ditolak", async () => {
    const { status, body } = await isi(await sakit(["2026-07-29", "2026-07-30"]));
    expect(status).toBe(412);
    expect(body.pesan).toContain("surat dokter");
    // Dan tidak menyisakan pengajuan setengah jadi
    expect(wadah.db.data.get("izin")?.size || 0).toBe(0);
  });

  it("sakit sehari tanpa surat tetap diterima", async () => {
    const { status } = await isi(await sakit(["2026-07-29"]));
    expect(status).toBe(200);
  });

  it("izin biasa berapa hari pun tidak diminta surat", async () => {
    const { status } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "izin", alasan: "Mengurus berkas wisuda.",
          tanggalMulai: "2026-07-29", tanggalSelesai: "2026-08-02",
        },
        tPeserta
      )
    );
    expect(status).toBe(200);
  });

  it("sakit panjang dengan surat diterima dan ditandai", async () => {
    const { status, body } = await isi(await sakit(["2026-07-29", "2026-07-30"], FOTO));
    expect(status).toBe(200);
    expect(body.adaBukti).toBe(true);
    expect(wadah.db.ambil(`izin/${body.id}`).adaBukti).toBe(true);
  });
});

describe("penyimpanan surat", () => {
  it("foto disimpan di koleksi terpisah, bukan menempel di pengajuannya", async () => {
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);

    const izin = wadah.db.ambil(`izin/${id}`);
    // Daftar izin dibaca utuh setiap halaman dibuka; foto di dalamnya berarti
    // mengunduh berpuluh megabita gambar yang belum tentu dilihat.
    expect(izin.foto).toBeUndefined();
    expect(izin.bukti).toBeUndefined();
    expect(JSON.stringify(izin)).not.toContain("data:image");

    const berkas = wadah.db.ambil(`izinBukti/${id}`);
    expect(berkas.foto).toBe(FOTO);
    expect(berkas.userId).toBe(PESERTA);
  });

  it("menolak berkas yang bukan gambar", async () => {
    const { status, body } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "sakit", alasan: "Demam sejak semalam.",
          tanggalMulai: "2026-07-29", tanggalSelesai: "2026-07-30",
          bukti: "data:application/pdf;base64,JVBERi0xLjQ=",
        },
        tPeserta
      )
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("foto");
  });

  it("menolak foto yang terlalu besar", async () => {
    const { status, body } = await isi(
      await panggil(
        {
          aksi: "ajukan", jenis: "sakit", alasan: "Demam sejak semalam.",
          tanggalMulai: "2026-07-29", tanggalSelesai: "2026-07-30",
          bukti: "data:image/jpeg;base64," + "A".repeat(300_000),
        },
        tPeserta
      )
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("terlalu besar");
    expect(wadah.db.data.get("izinBukti")?.size || 0).toBe(0);
  });
});

describe("lampiran susulan", () => {
  it("peserta bisa melampirkan surat setelah pengajuan terkirim", async () => {
    const id = await ajukanContoh(["2026-07-29"]);
    expect(wadah.db.ambil(`izin/${id}`).adaBukti).toBe(false);

    const { status } = await isi(await panggil({ aksi: "lampirkan", id, bukti: FOTO }, tPeserta));
    expect(status).toBe(200);
    expect(wadah.db.ambil(`izin/${id}`).adaBukti).toBe(true);
    expect(wadah.db.ambil(`izinBukti/${id}`).foto).toBe(FOTO);
  });

  it("mengganti surat menimpa yang lama, tidak menumpuk", async () => {
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);
    const baru = "data:image/png;base64," + "B".repeat(400);
    await panggil({ aksi: "lampirkan", id, bukti: baru }, tPeserta);

    expect(wadah.db.ambil(`izinBukti/${id}`).foto).toBe(baru);
    expect(wadah.db.data.get("izinBukti")!.size).toBe(1);
  });

  it("tidak bisa melampirkan ke pengajuan orang lain", async () => {
    const id = await ajukanContoh(["2026-07-29"]);
    const { status, body } = await isi(await panggil({ aksi: "lampirkan", id, bukti: FOTO }, tLain));
    expect(status).toBe(403);
    expect(body.pesan).toContain("bukan pengajuanmu");
    expect(wadah.db.ambil(`izinBukti/${id}`)).toBeUndefined();
  });

  it("pengajuan yang sudah diputus terkunci dari lampiran baru", async () => {
    // Kalau masih bisa diganti setelah diputus, keputusan pembimbing berdiri
    // di atas dokumen yang berbeda dari yang ia lihat
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);
    await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPembina);

    const lain = "data:image/png;base64," + "C".repeat(400);
    const { status } = await isi(await panggil({ aksi: "lampirkan", id, bukti: lain }, tPeserta));
    expect(status).toBe(409);
    expect(wadah.db.ambil(`izinBukti/${id}`).foto).toBe(FOTO);
  });

  it("surat boleh dihapus bila memang tidak diwajibkan", async () => {
    const id = await ajukanContoh(["2026-07-29"], { bukti: FOTO });
    const { status } = await isi(await panggil({ aksi: "hapusBukti", id }, tPeserta));
    expect(status).toBe(200);
    expect(wadah.db.ambil(`izinBukti/${id}`)).toBeUndefined();
    expect(wadah.db.ambil(`izin/${id}`).adaBukti).toBe(false);
  });

  it("surat yang diwajibkan tidak bisa dihapus begitu saja", async () => {
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);
    const { status, body } = await isi(await panggil({ aksi: "hapusBukti", id }, tPeserta));
    expect(status).toBe(412);
    expect(body.pesan).toContain("Ganti fotonya");
    expect(wadah.db.ambil(`izinBukti/${id}`).foto).toBe(FOTO);
  });
});

describe("pembatalan", () => {
  it("peserta boleh membatalkan pengajuannya yang masih menunggu", async () => {
    const id = await ajukanContoh();
    const { status } = await isi(await panggil({ aksi: "batal", id }, tPeserta));
    expect(status).toBe(200);
    expect(wadah.db.ambil(`izin/${id}`)).toBeUndefined();
  });

  it("membatalkan ikut membuang surat dokternya", async () => {
    // Ini data kesehatan orang, bukan sisa berkas biasa — tidak boleh
    // tertinggal tanpa pemilik setelah pengajuannya hilang
    const id = await ajukanContoh(["2026-07-29", "2026-07-30"]);
    expect(wadah.db.ambil(`izinBukti/${id}`)).toBeTruthy();

    await panggil({ aksi: "batal", id }, tPeserta);
    expect(wadah.db.ambil(`izinBukti/${id}`)).toBeUndefined();
  });

  it("tidak bisa membatalkan pengajuan milik orang lain", async () => {
    const id = await ajukanContoh();
    const { status, body } = await isi(await panggil({ aksi: "batal", id }, tLain));
    expect(status).toBe(403);
    expect(body.pesan).toContain("bukan pengajuanmu");
    expect(wadah.db.ambil(`izin/${id}`)).toBeTruthy();
  });

  it("tidak bisa membatalkan yang sudah disetujui", async () => {
    const id = await ajukanContoh();
    await panggil({ aksi: "proses", id, keputusan: "disetujui" }, tPembina);
    const { status } = await isi(await panggil({ aksi: "batal", id }, tPeserta));
    expect(status).toBe(409);
  });
});
