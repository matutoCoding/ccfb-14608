import { useEffect, useMemo, useRef, useState } from 'react';
import type { BuildResult } from '../types';
import { Button, Slider } from './controls';

/**
 * 编织顺序回放:按 order 逐步显示篾片,当前根高亮。
 * 自动播放用 requestAnimationFilter 计时,可暂停、单步、拖动。
 */
export function PlaybackPlayer({
  result,
  onStep,
}: {
  result: BuildResult;
  onStep: (step: number | null) => void;
}) {
  const maxStep = useMemo(
    () => result.ribbons.reduce((m, r) => Math.max(m, r.order), 0),
    [result],
  );
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8); // 每秒步数
  const timer = useRef<number | null>(null);
  const last = useRef(0);
  const acc = useRef(0);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [result]);

  useEffect(() => {
    onStep(step);
    return () => onStep(null);
  }, [step, onStep]);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      acc.current += dt * speed;
      if (acc.current >= 1) {
        const inc = Math.floor(acc.current);
        acc.current -= inc;
        setStep((s) => {
          const n = s + inc;
          if (n >= maxStep) {
            setPlaying(false);
            return maxStep;
          }
          return n;
        });
      }
      timer.current = requestAnimationFrame(tick);
    };
    timer.current = requestAnimationFrame(tick);
    return () => {
      if (timer.current) cancelAnimationFrame(timer.current);
    };
  }, [playing, speed, maxStep]);

  const current = result.ribbons.find((r) => r.order === step);

  return (
    <div className="player">
      <div className="player-top">
        <Button
          variant="primary"
          onClick={() => {
            if (step >= maxStep) setStep(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? '暂停' : step >= maxStep ? '重新播放' : '播放'}
        </Button>
        <Button onClick={() => setStep((s) => Math.max(0, s - 1))}>上一步</Button>
        <Button onClick={() => setStep((s) => Math.min(maxStep, s + 1))}>
          下一步
        </Button>
        <Slider
          value={step}
          min={0}
          max={maxStep}
          onChange={(v) => {
            setPlaying(false);
            setStep(v);
          }}
        />
        <span className="step-label">
          第 {step + 1}/{maxStep + 1} 根
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--muted)',
          fontSize: 12,
        }}
      >
        <span>
          当前篾:
          <b style={{ color: 'var(--accent)' }}>
            {current?.label ?? '—'}
          </b>
          {current
            ? `(长 ${current.length.toFixed(0)}mm${
                current.bendViolations > 0
                  ? ` · ${current.bendViolations} 处折弯超限`
                  : ''
              })`
            : ''}
        </span>
        <label className="tool-chip">
          速度
          <select
            className="input"
            style={{ width: 80, padding: '2px 6px' }}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[2, 4, 8, 16, 32].map((s) => (
              <option key={s} value={s}>
                {s}根/秒
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
