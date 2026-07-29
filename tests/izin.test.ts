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

async function ajukanContoh(hari = ["2026-07-29"]) {
  const { body } = await isi(
    await panggil(
      {
        aksi: "ajukan", jenis: "sakit", alasan: "Demam sejak semalam.",
        tanggalMulai: hari[0], tanggalSelesai: hari[hari.length - 1],
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

describe("pembatalan", () => {
  it("peserta boleh membatalkan pengajuannya yang masih menunggu", async () => {
    const id = await ajukanContoh();
    const { status } = await isi(await panggil({ aksi: "batal", id }, tPeserta));
    expect(status).toBe(200);
    expect(wadah.db.ambil(`izin/${id}`)).toBeUndefined();
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
