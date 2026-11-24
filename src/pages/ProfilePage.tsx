import { useMemo, useState } from 'react';
import type { CrossSection, VesselProfile } from '../types';
import { uid } from '../db/indexeddb';
import { useStore } from '../state/store';
import { Button, Card, Field, NumberInput, Select } from '../components/ui';

function blankProfile(): VesselProfile {
  const t = Date.now();
  return {
    id: uid('profile'),
    name: '新器型',
    mouthDiameter: 300,
    bellyDiameter: 320,
    baseDiameter: 160,
    height: 200,
    bellyTRatio: 0.55,
    mouthSuperN: 2,
    baseSuperN: 2,
    sections: [],
    createdAt: t,
    updatedAt: t,
  };
}

/** 子午轮廓 SVG:左右对称,画出 r(t) 曲线 */
function ProfileSvg({ p }: { p: VesselProfile }) {
  const W = 320;
  const H = 260;
  const pad = 24;
  const maxR = Math.max(p.mouthDiameter, p.bellyDiameter, p.baseDiameter) / 2;
  const sx = (W - pad * 2) / 2 / maxR;
  const sy = (H - pad * 2) / p.height;
  const sections = p.sections.length >= 2
    ? [...p.sections].sort((a, b) => a.t - b.t)
    : [
        { t: 0, diameter: p.baseDiameter, superN: p.baseSuperN },
        { t: p.bellyTRatio, diameter: p.bellyDiameter, superN: 2 },
        { t: 1, diameter: p.mouthDiameter, superN: p.mouthSuperN },
      ];
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const sec = sections;
      let d: number;
      if (t <= sec[0].t) d = sec[0].diameter;
      else if (t >= sec[sec.length - 1].t) d = sec[sec.length - 1].diameter;
      else {
        let k = 0;
        while (k < sec.length - 1 && sec[k + 1].t < t) k++;
        const a = sec[k];
        const b = sec[k + 1];
        d = a.diameter + ((t - a.t) / (b.t - a.t)) * (b.diameter - a.diameter);
      }
      const r = d / 2;
      const x = W / 2 + r * sx;
      const y = H - pad - t * p.height * sy;
      out.push([x, y]);
    }
    return out;
  }, [p, sections, sx, sy]);

  const path = pts.map((q, i) => `${i === 0 ? 'M' : 'L'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  const mirror = pts.map((q) => [W - q[0], q[1]] as [number, number]);
  const pathMirror = mirror.map((q, i) => `${i === 0 ? 'M' : 'L'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="profile-svg">
      <path d={path} fill="none" stroke="#8ab86b" strokeWidth={2.5} />
      <path d={pathMirror} fill="none" stroke="#8ab86b" strokeWidth={2.5} />
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#555" strokeDasharray="4 4" />
      {sections.map((s, i) => {
        const r = s.diameter / 2;
        const y = H - pad - s.t * p.height * sy;
        return (
          <g key={i}>
            <circle cx={W / 2 + r * sx} cy={y} r={3.5} fill="#e8c268" />
            <circle cx={W / 2 - r * sx} cy={y} r={3.5} fill="#e8c268" />
          </g>
        );
      })}
    </svg>
  );
}

export function ProfilePage() {
  const { profiles, saveProfile, removeProfile, select, selectedProfileId } = useStore();
  const selected = profiles.find((p) => p.id === selectedProfileId) ?? profiles[0];
  const [draft, setDraft] = useState<VesselProfile | null>(null);
  const p = draft ?? selected;

  if (!p) return <div className="empty">暂无器型,点击「新建器型」</div>;
  const update = (patch: Partial<VesselProfile>) => {
    const next = { ...p, ...patch };
    setDraft(next);
  };
  const updateSection = (i: number, patch: Partial<CrossSection>) => {
    const sections = p.sections.map((s, k) => (k === i ? { ...s, ...patch } : s));
    update({ sections });
  };

  return (
    <div className="page-grid">
      <Card title="器型库">
        <div className="item-list">
          {profiles.map((x) => (
            <div
              key={x.id}
              className={`item ${x.id === p.id ? 'active' : ''}`}
              onClick={() => {
                setDraft(null);
                select('profile', x.id);
              }}
            >
              <span>{x.name}</span>
              <button
                className="link-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  removeProfile(x.id);
                }}
              >
                删
              </button>
            </div>
          ))}
        </div>
        <Button
          primary
          onClick={() => {
            const v = blankProfile();
            saveProfile(v);
            setDraft(v);
            select('profile', v.id);
          }}
        >
          新建器型
        </Button>
      </Card>

      <Card title="轮廓参数(mm)">
        <div className="form-grid">
          <Field label="名称">
            <input className="select" value={p.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="口径">
            <NumberInput value={p.mouthDiameter} min={20} onChange={(v) => update({ mouthDiameter: v })} unit="mm" />
          </Field>
          <Field label="腹径">
            <NumberInput value={p.bellyDiameter} min={20} onChange={(v) => update({ bellyDiameter: v })} unit="mm" />
          </Field>
          <Field label="底径">
            <NumberInput value={p.baseDiameter} min={10} onChange={(v) => update({ baseDiameter: v })} unit="mm" />
          </Field>
          <Field label="高度">
            <NumberInput value={p.height} min={20} onChange={(v) => update({ height: v })} unit="mm" />
          </Field>
          <Field label="腹径高度位置" hint="0=底 1=口">
            <NumberInput value={p.bellyTRatio} min={0.05} max={0.95} step={0.05} onChange={(v) => update({ bellyTRatio: v })} />
          </Field>
          <Field label="口部截面" hint="2=圆,1.2=偏方">
            <NumberInput value={p.mouthSuperN} min={1} max={4} step={0.1} onChange={(v) => update({ mouthSuperN: v })} />
          </Field>
          <Field label="底部截面" hint="方底取 1.1~1.4">
            <NumberInput value={p.baseSuperN} min={1} max={4} step={0.1} onChange={(v) => update({ baseSuperN: v })} />
          </Field>
        </div>

        <div className="section-editor">
          <div className="row-between">
            <h4>变截面控制点({p.sections.length ? '自定义' : '默认口/腹/底三点'})</h4>
            <div className="btn-row">
              <Button
                onClick={() =>
                  update({
                    sections: [
                      { t: 0, diameter: p.baseDiameter, superN: p.baseSuperN },
                      { t: p.bellyTRatio, diameter: p.bellyDiameter, superN: 2 },
                      { t: 1, diameter: p.mouthDiameter, superN: p.mouthSuperN },
                    ],
                  })
                }
              >
                转为可编辑
              </Button>
              {p.sections.length > 0 && <Button onClick={() => update({ sections: [] })}>恢复默认</Button>}
            </div>
          </div>
          {p.sections.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>高度位置 t</th>
                  <th>直径 mm</th>
                  <th>截面指数 n</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {p.sections.map((s, i) => (
                  <tr key={i}>
                    <td>
                      <NumberInput value={s.t} min={0} max={1} step={0.05} onChange={(v) => updateSection(i, { t: v })} />
                    </td>
                    <td>
                      <NumberInput value={s.diameter} min={10} onChange={(v) => updateSection(i, { diameter: v })} />
                    </td>
                    <td>
                      <NumberInput value={s.superN} min={1} max={4} step={0.1} onChange={(v) => updateSection(i, { superN: v })} />
                    </td>
                    <td>
                      <Button danger onClick={() => update({ sections: p.sections.filter((_, k) => k !== i) })}>
                        删
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.sections.length > 0 && (
            <Button
              onClick={() =>
                update({
                  sections: [...p.sections, { t: 0.5, diameter: p.bellyDiameter, superN: 1.6 }].sort((a, b) => a.t - b.t),
                })
              }
            >
              增加控制点
            </Button>
          )}
        </div>

        <div className="btn-row end">
          <Button
            primary
            onClick={async () => {
              await saveProfile(p);
              setDraft(null);
              select('profile', p.id);
            }}
          >
            保存到本地
          </Button>
        </div>
      </Card>

      <Card title="子午轮廓预览">
        <ProfileSvg p={p} />
        <p className="hint">黄点为截面控制点;底部 n 取 1.1~1.4 即方底,口部 n=2 为圆口。</p>
        <Field label="快速缩放口径(联动重算篾数)">
          <div className="btn-row">
            {[0.8, 1, 1.25, 1.5].map((k) => (
              <Button
                key={k}
                onClick={() =>
                  update({
                    mouthDiameter: Math.round(selected.mouthDiameter * k),
                    bellyDiameter: Math.round(selected.bellyDiameter * k),
                    baseDiameter: Math.round(selected.baseDiameter * k),
                    height: Math.round(selected.height * k),
                  })
                }
              >
                ×{k}
              </Button>
            ))}
          </div>
        </Field>
      </Card>
    </div>
  );
}
