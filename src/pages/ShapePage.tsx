import { useMemo, useRef } from 'react';
import { NumberInput } from '../components/NumberInput';
import { db, saveProjectPatch } from '../db';
import { uid } from '../lib/vec';
import { BambooSurface } from '../lib/shape';
import type { ProfilePoint, ProjectDoc, ShapeDesign } from '../types';

interface ShapePageProps {
  shapes: ShapeDesign[];
  current: ShapeDesign;
  project: ProjectDoc;
}

function updateShape(current: ShapeDesign, patch: Partial<ShapeDesign>): ShapeDesign {
  return { ...current, ...patch, updatedAt: Date.now() };
}

async function putShape(shape: ShapeDesign): Promise<void> {
  await db.shapes.put(shape);
}

function roleDiameter(shape: ShapeDesign, role: ProfilePoint['role']): number {
  const p = shape.points.find((x) => x.role === role);
  return (p?.radiusCm ?? 0) * 2;
}

function setRoleDiameter(shape: ShapeDesign, role: ProfilePoint['role'], diameterCm: number): ShapeDesign {
  return updateShape(shape, {
    points: shape.points.map((p) => (p.role === role ? { ...p, radiusCm: Math.max(0.2, diameterCm / 2) } : p)),
  });
}

function ProfileEditor({ shape, onChange }: { shape: ShapeDesign; onChange: (s: ShapeDesign) => void }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragId = useRef<string | null>(null);
  const W = 460;
  const H = 340;
  const padL = 46;
  const padR = 30;
  const padT = 24;
  const padB = 44;
  const axisX = 218;
  const plotH = H - padT - padB;
  const maxR = Math.max(24, ...shape.points.map((p) => p.radiusCm * 1.18));
  const radiusScale = Math.min(axisX - padL, W - padR - axisX) / maxR;
  const x = (r: number) => axisX + r * radiusScale;
  const y = (v: number) => padT + (1 - v) * plotH;
  const sorted = [...shape.points].sort((a, b) => a.v - b.v || a.radiusCm - b.radiusCm);
  const linePath = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.radiusCm).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const areaPath = first && last
    ? `${linePath} L ${axisX} ${y(last.v).toFixed(1)} L ${axisX} ${y(first.v).toFixed(1)} Z`
    : linePath;

  function eventPoint(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    const loc = ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
    return loc;
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragId.current) return;
    const loc = eventPoint(e);
    const r = Math.max(0.2, Math.min(maxR, (loc.x - axisX) / radiusScale));
    let v = Math.max(0, Math.min(1, 1 - (loc.y - padT) / plotH));
    onChange(updateShape(shape, {
      points: shape.points.map((p) => {
        if (p.id !== dragId.current) return p;
        if (p.role === 'bottom') v = 0;
        if (p.role === 'mouth') v = 1;
        return { ...p, radiusCm: r, v };
      }),
    }));
  }

  return (
    <svg
      ref={svgRef}
      className="shape-editor"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={handleMove}
      onPointerUp={() => { dragId.current = null; }}
      onPointerLeave={() => { dragId.current = null; }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <g key={g}>
          <line className="axis" x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} strokeDasharray="4 5" />
          <text x={12} y={y(g) + 4}>v={g}</text>
        </g>
      ))}
      <line className="axis" x1={axisX} x2={axisX} y1={padT} y2={padT + plotH} />
      <line className="axis" x1={x(20)} x2={x(20)} y1={padT} y2={padT + plotH} strokeDasharray="4 5" />
      <text x={x(20) - 16} y={H - 16}>r=20cm</text>
      <path d={areaPath} className="profile" />
      <path d={areaPath} className="profile" transform={`translate(${2 * axisX},0) scale(-1,1)`} />
      <path d={linePath} fill="none" stroke="#2f4a1b" strokeWidth="3" />
      {sorted.map((p) => (
        <circle
          key={p.id}
          className={`handle ${p.role ? 'role' : ''}`}
          cx={x(p.radiusCm)}
          cy={y(p.v)}
          r={p.role === 'extra' ? 6 : 7}
          onPointerDown={(e) => {
            dragId.current = p.id;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onDoubleClick={() => {
            if (p.role === 'extra') {
              onChange(updateShape(shape, { points: shape.points.filter((q) => q.id !== p.id) }));
            }
          }}
        >
          <title>{p.role ?? '可编辑点'}：拖动改半径/高度，双击额外点删除</title>
        </circle>
      ))}
      <text x={padL} y={H - 30}>底径</text>
      <text x={W - padR - 34} y={padT - 8}>口径</text>
    </svg>
  );
}

export function ShapePage({ shapes, current, project }: ShapePageProps) {
  const metrics = useMemo(() => {
    const surface = new BambooSurface(current);
    let minP = Infinity;
    let maxP = 0;
    for (let i = 0; i <= 30; i += 1) {
      const p = surface.perimeterAtS((i / 30) * surface.lengthCm);
      minP = Math.min(minP, p);
      maxP = Math.max(maxP, p);
    }
    return { profile: surface.lengthCm, minP, maxP };
  }, [current]);

  function edit(patch: Partial<ShapeDesign>) {
    void putShape(updateShape(current, patch));
  }

  function editWithPoints(mutator: (s: ShapeDesign) => ShapeDesign) {
    void putShape(mutator(current));
  }

  async function createShape() {
    const copy: ShapeDesign = {
      ...current,
      id: uid('shape'),
      name: `${current.name} 副本`,
      points: current.points.map((p) => ({ ...p, id: uid('p') })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.shapes.put(copy);
    await saveProjectPatch({ shapeId: copy.id });
  }

  async function removeShape() {
    if (shapes.length <= 1) return;
    if (!window.confirm(`确定删除器型“${current.name}”？`)) return;
    await db.shapes.delete(current.id);
    const next = shapes.find((s) => s.id !== current.id);
    if (next) await saveProjectPatch({ shapeId: next.id });
  }

  const bottomSquare = current.points.find((p) => p.role === 'bottom')?.square ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>器型轮廓</h2>
          <p>按回转体半径—高度曲线生成曲面；截面超椭圆指数从圆到方连续变化，支持方底圆口。所有尺寸改动会实时重算篾片根数与间距。</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={createShape}>复制为新器型</button>
          <button className="btn danger" onClick={removeShape} disabled={shapes.length <= 1}>删除</button>
        </div>
      </div>

      <div className="layout-grid">
        <div>
          <section className="panel">
            <h3>已存器型 <span className="tag">IndexedDB</span></h3>
            <div className="saved-list">
              {shapes.map((s) => (
                <button key={s.id} className={`saved-item ${s.id === current.id ? 'active' : ''}`} onClick={() => void saveProjectPatch({ shapeId: s.id })}>
                  <span><strong>{s.name}</strong><span>{s.heightCm}cm 高 · 口 {roleDiameter(s, 'mouth').toFixed(1)} · 腹 {roleDiameter(s, 'belly').toFixed(1)} · 底 {roleDiameter(s, 'bottom').toFixed(1)}</span></span>
                  <span>{s.kind === 'variable' ? '变截面' : '回转体'}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h3>直接输入尺寸</h3>
            <div className="form-grid">
              <div className="field full">
                <label>器型名称</label>
                <input value={current.name} onChange={(e) => edit({ name: e.target.value })} />
              </div>
              <NumberField label="口径 cm" value={roleDiameter(current, 'mouth')} min={4} max={120} step={0.5}
                onChange={(v) => editWithPoints((s) => setRoleDiameter(s, 'mouth', v))} />
              <NumberField label="腹径 cm" value={roleDiameter(current, 'belly')} min={4} max={140} step={0.5}
                onChange={(v) => editWithPoints((s) => setRoleDiameter(s, 'belly', v))} />
              <NumberField label="底径 cm" value={roleDiameter(current, 'bottom')} min={2} max={100} step={0.5}
                onChange={(v) => editWithPoints((s) => setRoleDiameter(s, 'bottom', v))} />
              <NumberField label="高度 cm" value={current.heightCm} min={3} max={80} step={0.5}
                onChange={(v) => edit({ heightCm: v })} />
              <div className="field">
                <label>腹位高度 {Math.round(current.bellyV * 100)}%</label>
                <input type="range" min={0.2} max={0.8} step={0.01} value={current.bellyV}
                  onChange={(e) => {
                    const bellyV = Number(e.target.value);
                    editWithPoints((s) => updateShape({ ...s, bellyV }, {
                      points: s.points.map((p) => (p.role === 'belly' ? { ...p, v: bellyV } : p)),
                    }));
                  }} />
              </div>
              <div className="field">
                <label>方底程度 {Math.round(bottomSquare * 100)}%</label>
                <input type="range" min={0} max={1} step={0.01} value={bottomSquare}
                  onChange={(e) => {
                    const square = Number(e.target.value);
                    edit({
                      kind: square > 0.02 ? 'variable' : 'revolved',
                      points: current.points.map((p) => (p.role === 'bottom' ? { ...p, square } : p)),
                    });
                  }} />
              </div>
              <div className="field full">
                <div className="btn-row">
                  <button className="btn small" onClick={() => edit({ kind: 'revolved', points: current.points.map((p) => ({ ...p, square: 0 })) })}>全圆回转体</button>
                  <button className="btn small primary" onClick={() => edit({ kind: 'variable', points: current.points.map((p) => ({ ...p, square: p.role === 'bottom' ? 1 : p.role === 'extra' && p.v < 0.3 ? 0.65 : 0 })) })}>方底圆口</button>
                  <button className="btn small" onClick={() => editWithPoints((s) => updateShape(s, { points: [...s.points, { id: uid('p'), v: 0.34, radiusCm: 16, square: 0.2, role: 'extra' }] }))}>添加轮廓点</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div>
          <section className="panel">
            <h3>轮廓线编辑 <span className="tag">横向半径 / 纵向高度比例</span></h3>
            <ProfileEditor shape={current} onChange={(s) => void putShape(s)} />
          </section>
          <section className="panel">
            <h3>曲面测算</h3>
            <div className="stat-grid">
              <div className="stat"><b>{metrics.profile.toFixed(1)}cm</b><span>母线弧长（决定经/篾长度）</span></div>
              <div className="stat"><b>{metrics.minP.toFixed(1)}cm</b><span>最小截面周长（决定根数）</span></div>
              <div className="stat"><b>{metrics.maxP.toFixed(1)}cm</b><span>最大截面周长</span></div>
              <div className="stat"><b>{project.lossRate * 100}%</b><span>备料损耗余量（备料单可改）</span></div>
            </div>
            <p className="formula" style={{ marginTop: 12 }}>
              均布根数以最小周长为控制边界：N = floor(Pmin /（篾宽 + 净距）)，避免底部篾片相邻重叠；口腹位置间距随截面周长自然增大。
              六角编另按口腹周长取整三向种子数，再反算有效间距以保持晶格不错位。
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function NumberField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <NumberInput value={value} min={min} max={max} step={step} onCommit={onChange} />
    </div>
  );
}
