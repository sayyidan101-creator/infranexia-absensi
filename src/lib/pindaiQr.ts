"use client";

/**
 * Pemindai QR lewat kamera.
 *
 * Dua jalur, dipilih otomatis:
 *
 * 1. `BarcodeDetector` — dekoder bawaan browser, dikerjakan di luar thread
 *    utama sehingga jauh lebih hemat baterai. Ada di Chrome (Android dan
 *    desktop), belum ada di Safari maupun Firefox.
 * 2. `jsQR` — dekoder murni JavaScript sebagai cadangan. Lebih berat, tapi
 *    jalan di mana saja termasuk Safari di iPhone. Dimuat hanya saat
 *    dibutuhkan supaya tidak menambah beban halaman lain.
 *
 * Kamera hanya bisa diakses lewat HTTPS (atau localhost). Di Vercel ini sudah
 * otomatis.
 */

export type SumberDekoder = "bawaan" | "javascript";

export interface PemindaiQr {
  hentikan: () => void;
  sumber: SumberDekoder;
  /** Ganti ke kamera berikutnya bila perangkat punya lebih dari satu. */
  gantiKamera: () => Promise<void>;
}

/** Berapa lama jeda antar-percobaan dekode. 100 ms ≈ 10 kali per detik. */
const JEDA_MS = 100;

export function kameraTersedia(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

async function buatDetektorBawaan(): Promise<any | null> {
  const Detektor = (globalThis as any).BarcodeDetector;
  if (!Detektor) return null;
  try {
    const didukung: string[] = await Detektor.getSupportedFormats();
    if (!didukung.includes("qr_code")) return null;
    return new Detektor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function pesanKamera(e: any): string {
  const nama = e?.name || "";
  if (nama === "NotAllowedError" || nama === "SecurityError") {
    return "Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser, lalu coba lagi.";
  }
  if (nama === "NotFoundError" || nama === "OverconstrainedError") {
    return "Tidak ada kamera yang bisa dipakai di perangkat ini.";
  }
  if (nama === "NotReadableError") {
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.";
  }
  return e?.message || "Gagal menyalakan kamera.";
}

/**
 * Nyalakan kamera pada elemen video, lalu panggil `saatKode` setiap kali QR
 * terbaca. Penyaringan pindaian berulang dilakukan pemanggil, bukan di sini.
 */
export async function mulaiPindaiQr(
  video: HTMLVideoElement,
  saatKode: (isi: string) => void,
  saatGalat?: (pesan: string) => void
): Promise<PemindaiQr> {
  if (!kameraTersedia()) {
    throw new Error(
      "Browser ini tidak bisa mengakses kamera. Pastikan halaman dibuka lewat HTTPS."
    );
  }

  let aliran: MediaStream | null = null;
  let berhenti = false;
  let timer: any = null;
  let indeksKamera = 0;
  let daftarKamera: MediaDeviceInfo[] = [];

  const detektor = await buatDetektorBawaan();
  const jsQR = detektor ? null : (await import("jsqr")).default;
  const sumber: SumberDekoder = detektor ? "bawaan" : "javascript";

  // Kanvas hanya dipakai jalur cadangan — BarcodeDetector membaca video langsung.
  const kanvas = document.createElement("canvas");
  const konteks = kanvas.getContext("2d", { willReadFrequently: true });

  const matikanAliran = () => {
    aliran?.getTracks().forEach((t) => t.stop());
    aliran = null;
  };

  const nyalakan = async (deviceId?: string) => {
    matikanAliran();
    aliran = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = aliran;
    video.setAttribute("playsinline", "true"); // tanpa ini iOS membuka video layar penuh
    video.muted = true;
    await video.play().catch(() => undefined);
  };

  try {
    await nyalakan();
  } catch (e: any) {
    throw new Error(pesanKamera(e));
  }

  // Daftar kamera baru terisi nama-namanya setelah izin diberikan
  daftarKamera = await navigator.mediaDevices
    .enumerateDevices()
    .then((d) => d.filter((x) => x.kind === "videoinput"))
    .catch(() => []);

  const bacaSekali = async () => {
    if (berhenti || video.readyState < 2 || !video.videoWidth) return;
    try {
      if (detektor) {
        const temuan = await detektor.detect(video);
        const isi = temuan?.[0]?.rawValue;
        if (isi) saatKode(String(isi));
        return;
      }
      if (!konteks || !jsQR) return;
      // Turunkan resolusi kerja: dekode JS berbanding lurus dengan jumlah piksel,
      // dan QR sebesar kartu tetap terbaca jelas di lebar 480 px.
      const skala = Math.min(1, 480 / video.videoWidth);
      kanvas.width = Math.round(video.videoWidth * skala);
      kanvas.height = Math.round(video.videoHeight * skala);
      konteks.drawImage(video, 0, 0, kanvas.width, kanvas.height);
      const gambar = konteks.getImageData(0, 0, kanvas.width, kanvas.height);
      const temuan = jsQR(gambar.data, gambar.width, gambar.height, {
        inversionAttempts: "dontInvert",
      });
      if (temuan?.data) saatKode(temuan.data);
    } catch (e: any) {
      saatGalat?.(e?.message || "Gagal membaca gambar dari kamera.");
    }
  };

  const putar = async () => {
    if (berhenti) return;
    await bacaSekali();
    if (!berhenti) timer = setTimeout(putar, JEDA_MS);
  };
  putar();

  return {
    sumber,
    hentikan: () => {
      berhenti = true;
      clearTimeout(timer);
      matikanAliran();
      video.srcObject = null;
    },
    gantiKamera: async () => {
      if (daftarKamera.length < 2) return;
      indeksKamera = (indeksKamera + 1) % daftarKamera.length;
      try {
        await nyalakan(daftarKamera[indeksKamera].deviceId);
      } catch (e: any) {
        saatGalat?.(pesanKamera(e));
      }
    },
  };
}

/** Ubah kode kartu menjadi gambar QR berupa data URL. */
export async function gambarQr(muatan: string, ukuran = 320): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(muatan, {
    width: ukuran,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0B1F3A", light: "#FFFFFF" },
  });
}
