"use client";
import { useEffect, useState } from "react";

/**
 * Cincin persentase.
 *
 * Angka besar saja tidak memberi rasa "seberapa jauh dari penuh"; cincin
 * memberi itu dalam sekali lihat. Digambar dengan SVG supaya tajam di layar
 * kepadatan berapa pun dan tidak perlu pustaka grafik.
 */
export default function CincinProgres({
  nilai,
  ukuran = 108,
  tebal = 9,
  warna = "#10b981",
  warnaLatar = "rgba(255,255,255,0.18)",
  label,
  anak,
}: {
  nilai: number;                 // 0–100
  ukuran?: number;
  tebal?: number;
  warna?: string;
  warnaLatar?: string;
  label?: string;
  anak?: React.ReactNode;
}) {
  const aman = Math.max(0, Math.min(100, Number.isFinite(nilai) ? nilai : 0));
  const [tampil, setTampil] = useState(0);

  // Digambar dari nol setiap kali nilainya berubah, bukan melompat ke posisi
  useEffect(() => {
    const id = requestAnimationFrame(() => setTampil(aman));
    return () => cancelAnimationFrame(id);
  }, [aman]);

  const r = (ukuran - tebal) / 2;
  const keliling = 2 * Math.PI * r;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: ukuran, height: ukuran }}>
      <svg width={ukuran} height={ukuran} className="-rotate-90">
        <circle cx={ukuran / 2} cy={ukuran / 2} r={r} fill="none" stroke={warnaLatar} strokeWidth={tebal} />
        <circle
          cx={ukuran / 2} cy={ukuran / 2} r={r}
          fill="none" stroke={warna} strokeWidth={tebal} strokeLinecap="round"
          strokeDasharray={keliling}
          strokeDashoffset={keliling - (tampil / 100) * keliling}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {anak ?? (
          <>
            <span className="text-2xl font-bold tabular-nums">{Math.round(aman)}%</span>
            {label && <span className="text-[10px] uppercase tracking-wide opacity-70 mt-1">{label}</span>}
          </>
        )}
      </div>
    </div>
  );
}
