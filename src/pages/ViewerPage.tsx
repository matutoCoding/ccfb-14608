import { useEffect, useRef, useState } from 'react';
import type { RimKind } from '../types';
import type { WeaveBuildResult } from '../geometry/weave';
import { useSelectedDesign, useStore } from '../state/store';
import { ViewerCanvas } from '../components/ViewerCanvas';
import { Button, Card, Field, NumberInput, Select } from '../components/ui';

export function ViewerPage() {
  const { profile, pattern, material, species, rim } = useSelectedDesign();
  const { patterns, profiles, materials, setRim, backlight, setBacklight, select } = useStore();
  const [built, setBuilt] = useState<WeaveBuildResult | null>(null);
  const [playStep, setPlayStep] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setPlayStep(null);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [profile?.id, pattern?.id, material?.id]);

  if (!profile || !pattern || !material || !species) {
    return <div className="empty">请先在各页面创建器型、编法和篾料</div>;
  }

  const totalSteps = built?.steps.length ?? 0;
  const play = () => {
    if (playStep !== null) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setPlayStep(null);
      return;
    }
    setPlayStep(0);
    timerRef.current = window.setInterval(() => {
      setPlayStep((s) => {
        if (s === null) return 0;
        if (s + 1 >= totalSteps) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          return null;
        }
        return s + 1;
      });
    }, 350);
  };

  const currentStep = playStep !== null ? built?.steps[playStep] : null;

  return (
    <div className="viewer-page">
      <Card title="设计方案">
        <Field label="器型">
          <Select
            value={profile.id}
            onChange={(id) => select('profile', id)}
            options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="编法">
          <Select
            value={pattern.id}
            onChange={(id) => select('pattern', id)}
            options={patterns.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="篾料">
          <Select
            value={material.id}
            onChange={(id) => select('material', id)}
            options={materials.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>

        <Field label="收口锁边">
          <Select<RimKind>
            value={rim.kind}
            onChange={(kind) => setRim({ ...rim, kind })}
            options={[
              { value: 'rolled', label: '卷口(圆管箍)' },
              { value: 'wrapped', label: '包边(缠扎篾)' },
              { value: 'socket', label: '插口(U 形套)' },
            ]}
          />
        </Field>
        <Field label={rim.kind === 'wrapped' ? '包边宽度' : rim.kind === 'socket' ? '插口口径' : '卷口直径'}>
          <NumberInput value={rim.size} min={3} max={40} step={0.5} onChange={(size) => setRim({ ...rim, size })} unit="mm" />
        </Field>
        {rim.kind === 'wrapped' && (
          <Field label="扎篾间距">
            <NumberInput value={rim.wrapSpacing} min={6} max={60} onChange={(wrapSpacing) => setRim({ ...rim, wrapSpacing })} unit="mm" />
          </Field>
        )}

        <Field label="逆光漏光">
          <label className="switch">
            <input type="checkbox" checked={backlight} onChange={(e) => setBacklight(e.target.checked)} />
            <span>{backlight ? '逆光开:六角孔光斑投在桌面' : '逆光关'}</span>
          </label>
        </Field>
      </Card>

      <div className="viewer-main">
        <ViewerCanvas
          profile={profile}
          pattern={pattern}
          material={material}
          species={species}
          rim={rim}
          playStep={playStep}
          onBuilt={setBuilt}
        />
        <Card title={`编织顺序回放(共 ${totalSteps} 步)`}>
          <div className="btn-row">
            <Button primary onClick={play}>
              {playStep !== null ? '停止回放' : '开始逐圈回放'}
            </Button>
            <Button disabled={playStep === null} onClick={() => setPlayStep(Math.max(0, (playStep ?? 0) - 1))}>
              上一步
            </Button>
            <Button disabled={playStep === null} onClick={() => setPlayStep(Math.min(totalSteps - 1, (playStep ?? 0) + 1))}>
              下一步
            </Button>
            <Button onClick={() => setPlayStep(null)}>显示完整器型</Button>
          </div>
          {currentStep && (
            <div className="step-banner">
              {currentStep.label}
              <div className="progress">
                <div className="progress-bar" style={{ width: `${((playStep! + 1) / totalSteps) * 100}%` }} />
              </div>
            </div>
          )}
          <div className="check-list">
            <h4>质检标记</h4>
            <p>
              <i className="dot dot-yellow" /> 六角孔失真/篾片挤压点:{built?.distortionMarks.length ?? 0} 处
            </p>
            <p>
              <i className="dot dot-red" /> 弯曲超最小半径段:{built?.bendViolations.length ?? 0} 处(篾段同步标红)
            </p>
            {built && built.distortionMarks.length > 0 && (
              <ul className="mark-detail">
                {built.distortionMarks.slice(0, 6).map((m, i) => (
                  <li key={i}>
                    高度 {m.position[1].toFixed(0)}mm · 长宽比 {m.aspectRatio}
                    {m.angleErrorDeg ? ` · 角度偏差 ${m.angleErrorDeg}°` : ''}
                  </li>
                ))}
              </ul>
            )}
            {built && built.bendViolations.length > 0 && (
              <ul className="mark-detail">
                {built.bendViolations.slice(0, 6).map((v, i) => (
                  <li key={i}>
                    第 {v.stripIndex + 1} 根篾 · 高度 {v.position[1].toFixed(0)}mm · 允许 R≥{v.minRadius}mm
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
