import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { GateColor } from "../lib/types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ title, children, extra }: { title?: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="card">
      {title ? (
        <div className="between">
          <h2>{title}</h2>
          {extra}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="btn" {...props} />;
}

export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="btn-ghost" {...props} />;
}

export function WarnButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="btn-warn" {...props} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

const GATE_LABEL: Record<GateColor, string> = {
  unset: "未評",
  green: "綠",
  yellow: "黃",
  red: "紅",
};

export function gateLabel(color: GateColor): string {
  return GATE_LABEL[color];
}

export function nextGate(color: GateColor): GateColor {
  const order: GateColor[] = ["unset", "green", "yellow", "red"];
  return order[(order.indexOf(color) + 1) % order.length];
}

export function LineChart({ points, label }: { points: { date: string; value: number }[]; label: string }) {
  if (points.length < 2) return <p className="muted">資料未夠畫線。</p>;
  const width = 320;
  const height = 150;
  const pad = 10;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((point.value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" points={coords.join(" ")} />
    </svg>
  );
}

export function Icon({ name }: { name: "portfolio" | "risk" | "score" | "journal" | "settings" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "portfolio") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 18V8M10 18V5M16 18v-6M22 18H2" />
      </svg>
    );
  }
  if (name === "risk") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3 5 6v6c0 4.5 3 7 7 9 4-2 7-4.5 7-9V6l-7-3Z" />
      </svg>
    );
  }
  if (name === "score") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="m12 3 2.4 5.2L20 9l-4 3.8.9 5.7L12 16.8 7.1 18.5 8 12.8 4 9l5.6-.8L12 3Z" />
      </svg>
    );
  }
  if (name === "journal") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M7 3h11v18H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path {...common} d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...common} cx="12" cy="12" r="3" />
      <path {...common} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function thinPoints<T>(rows: T[], max = 180): T[] {
  if (rows.length <= max) return rows;
  const out: T[] = [];
  const step = (rows.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) out.push(rows[Math.round(i * step)]);
  return out;
}
