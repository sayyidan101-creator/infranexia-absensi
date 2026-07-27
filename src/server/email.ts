import "server-only";
import nodemailer, { Transporter } from "nodemailer";

/**
 * Pengiriman email akun baru lewat SMTP (paling mudah: Gmail + App Password).
 * Bersifat OPSIONAL — kalau variabel SMTP belum diisi, pembuatan akun tetap
 * berhasil, hanya emailnya yang tidak terkirim.
 */
export function emailAktif(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let pengangkut: Transporter | null = null;

function transporter(): Transporter {
  if (pengangkut) return pengangkut;
  const port = Number(process.env.SMTP_PORT || 465);
  pengangkut = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = SSL, 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return pengangkut;
}

interface DataEmailAkun {
  nama: string;
  email: string;
  password: string;
  peran: string;
  urlApp: string;
}

export async function kirimEmailAkun(d: DataEmailAkun): Promise<void> {
  const dari = process.env.SMTP_FROM || `InfraNexia <${process.env.SMTP_USER}>`;

  await transporter().sendMail({
    from: dari,
    to: d.email,
    subject: "Akun Absensi Magang InfraNexia",
    text: teksPolos(d),
    html: templateHtml(d),
  });
}

function teksPolos(d: DataEmailAkun): string {
  return [
    `Halo ${d.nama},`,
    "",
    `Akun absensi magang InfraNexia kamu sudah dibuat sebagai ${d.peran}.`,
    "",
    `Alamat aplikasi : ${d.urlApp}`,
    `Email           : ${d.email}`,
    `Password        : ${d.password}`,
    "",
    "Langkah pertama setelah login:",
    "1. Buka menu Edit Profil dan ganti password di atas dengan milikmu sendiri.",
    "2. Buka menu Daftar Wajah dan ambil 3 sampel wajah.",
    "3. Setelah itu kamu sudah bisa melakukan absensi harian.",
    "",
    "Jangan bagikan password ini kepada siapa pun.",
    "",
    "— Tim InfraNexia",
  ].join("\n");
}

function templateHtml(d: DataEmailAkun): string {
  return `<!doctype html>
<html lang="id">
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <tr>
      <td style="background:linear-gradient(90deg,#0a1f44,#1a3a6b);padding:24px 28px">
        <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.2px">InfraNexia</div>
        <div style="color:#cbd5e1;font-size:13px;margin-top:2px">Sistem Absensi Anak Magang</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px">
        <p style="margin:0 0 16px;font-size:15px">Halo <strong>${lolos(d.nama)}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
          Akun absensi magang kamu sudah dibuat sebagai <strong>${lolos(d.peran)}</strong>.
          Gunakan data berikut untuk masuk.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:4px 0">
          <tr>
            <td style="padding:12px 16px;font-size:12px;color:#64748b;width:88px">Email</td>
            <td style="padding:12px 16px;font-size:14px;font-weight:600">${lolos(d.email)}</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0">Password</td>
            <td style="padding:12px 16px;font-size:14px;font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace;border-top:1px solid #e2e8f0">${lolos(d.password)}</td>
          </tr>
        </table>

        <div style="text-align:center;margin:24px 0 8px">
          <a href="${lolos(d.urlApp)}" style="display:inline-block;background:#e60012;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px">
            Masuk ke Aplikasi
          </a>
        </div>
        <p style="margin:0 0 24px;text-align:center;font-size:12px;color:#94a3b8;word-break:break-all">${lolos(d.urlApp)}</p>

        <div style="border-top:1px solid #e2e8f0;padding-top:20px">
          <p style="margin:0 0 10px;font-size:13px;font-weight:600">Langkah pertama setelah login</p>
          <ol style="margin:0;padding-left:18px;font-size:13px;color:#475569;line-height:1.9">
            <li>Buka <strong>Edit Profil</strong>, ganti password di atas dengan milikmu sendiri.</li>
            <li>Buka <strong>Daftar Wajah</strong>, ambil 3 sampel wajah.</li>
            <li>Setelah itu kamu sudah bisa absen harian lewat menu <strong>Absensi</strong>.</li>
          </ol>
        </div>

        <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
          Jangan bagikan password ini kepada siapa pun. Jika kamu merasa tidak mendaftar,
          abaikan email ini dan beri tahu admin.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:16px 28px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
        InfraNexia · PT Telkom Indonesia · Regional Sumbagsel
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Cegah karakter HTML pada data pengguna merusak/menyisip ke template. */
function lolos(teks: string): string {
  return String(teks)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
