import { useEffect, useRef, useState } from 'react';

interface NumberInputProps {
  value: number | null | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 小数录入必须保留 "0."、"" 等中间态，不能在每次 onChange 时用父级数值反向覆盖。
 * 聚焦期间以本地文本为准，失焦/回车后规范化并提交。
 */
export function NumberInput({ value, onCommit, min, max, step, placeholder, disabled }: NumberInputProps) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);

  function resetText() {
    setText(value == null ? '' : String(value));
  }

  function commit(raw: string) {
    if (raw.trim() === '') {
      resetText();
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      resetText();
      return;
    }
    const clampedMin = min ?? -Infinity;
    const clampedMax = max ?? Infinity;
    const next = Math.min(clampedMax, Math.max(clampedMin, n));
    onCommit(next);
    setText(String(next));
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw !== '' && raw !== '-' && raw.endsWith('.') === false) {
          const n = Number(raw);
          if (Number.isFinite(n)) onCommit(n);
        }
      }}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
