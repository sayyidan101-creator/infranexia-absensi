"use client";

const PALET = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500", "bg-indigo-500"];

export default function Avatar({
  name, foto, size = 36, className = "",
}: { name: string; foto?: string; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt={name} style={style} className={`rounded-full object-cover shrink-0 ${className}`} />;
  }
  const bg = PALET[(name?.charCodeAt(0) || 0) % PALET.length];
  return (
    <span style={{ ...style, fontSize: size * 0.38 }}
      className={`rounded-full ${bg} text-white flex items-center justify-center font-bold shrink-0 ${className}`}>
      {(name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}