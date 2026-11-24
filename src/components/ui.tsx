import type { ReactNode } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="field-hint">{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export function NumberInput(props: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="number-input">
      <input
        type="number"
        value={Number.isFinite(props.value) ? props.value : 0}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.unit && <span className="unit">{props.unit}</span>}
    </div>
  );
}

export function Select<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select className="select" value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Card({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h3>{title}</h3>
        {extra}
      </header>
      {children}
    </section>
  );
}

export function Button(props: { children: ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      className={`btn ${props.primary ? 'btn-primary' : ''} ${props.danger ? 'btn-danger' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
