import { useEffect, useState } from 'react';
import { BasketViewer } from '../three/BasketViewer';
import { saveProjectPatch } from '../db';
import type { BuildResult } from '../lib/engine';
import type { MaterialPreset, ProjectDoc, RimKind, ShapeDesign, WeaveDesign } from '../types';

interface PreviewPageProps {
  project: ProjectDoc;
  shape: ShapeDesign;
  weave: WeaveDesign;
  material: MaterialPreset;
  result: BuildResult | null;
  shapes: ShapeDesign[];
  weaves: WeaveDesign[];
  materials: MaterialPreset[];
}

export function PreviewPage({ project, shape, material, result, shapes, weaves, materials }: PreviewPageProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const maxStep = Math.max(0, (result?.steps.length ?? 1) - 1);
  useEffect(() => {
    setStep(maxStep);
  }, [result, maxStep]);

  useEffect(() => {
    if (!playing || !result) return;
    const timer = window.setInterval(() => {
      setStep((s) => {
        if (s >= maxStep) {
          setPlaying(false);
          return maxStep;
        }
        return s + 1;
      });
    }, 240);
    return () => window.clearInterval(timer);
  }, [playing, maxStep, result]);

  const current = result?.steps[Math.min(step, maxStep)];
  const stats = result?.stats;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>三维预览与编织回放</h2>
          <p>带状实体几何、交叉上下让位、弯曲标红、六角畸变标记和 4096 阴影逆光投影。拖动旋转，滚轮缩放。</p>
        </div>
        <div className="save-pill">● 自动保存到 IndexedDB</div>
      </div>

      <div className="viewer-layout">
        <section className="viewer-card">
          {result && (
            <BasketViewer
              result={result}
              material={material}
              shape={shape}
              rim={project.rim}
              step={step}
              showDanger={project.showDanger}
              backlight={project.backlight}
              autoRotate={autoRotate}
            />
          )}
          <div className="viewer-overlay">
            <span className="glass-pill">{stats?.crossingCount.toLocaleString() ?? 0} 交叉</span>
            <span className="glass-pill">{stats?.buildMs.toFixed(0) ?? '--'} ms</span>
            <span className="glass-pill">{stats ? (stats.vertexCount / 1000).toFixed(1) : '--'}k 顶点</span>
            {project.backlight && <span className="glass-pill">逆光投影中</span>}
          </div>
          <div className="playback no-print">
            <div className="row">
              <button className="btn small primary" onClick={() => { setStep(0); setPlaying(true); }}>从第一步回放</button>
              <button className="btn small" onClick={() => setPlaying((p) => !p)}>{playing ? '暂停' : '播放'}</button>
              <input type="range" min={0} max={maxStep} value={Math.min(step, maxStep)}
                onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }} />
              <strong style={{ minWidth: 74, textAlign: 'right' }}>{Math.min(step + 1, maxStep + 1)}/{maxStep + 1}</strong>
            </div>
            <div className="step-text">
              {current ? <><b>{current.title}</b> — {current.detail}</> : '正在生成编织步骤…'}
            </div>
          </div>
        </section>

        <aside className="side-scroll">
          <section className="panel">
            <h3>当前设计</h3>
            <div className="form-grid">
              <div className="field full">
                <label>器型</label>
                <select value={project.shapeId} onChange={(e) => void saveProjectPatch({ shapeId: e.target.value })}>
                  {shapes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>编法</label>
                <select value={project.weaveId} onChange={(e) => void saveProjectPatch({ weaveId: e.target.value })}>
                  {weaves.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>篾料</label>
                <select value={project.materialId} onChange={(e) => void saveProjectPatch({ materialId: e.target.value })}>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>口沿锁边</h3>
            <div className="form-grid">
              <div className="field full">
                <label>结构</label>
                <select value={project.rim.kind} onChange={(e) => void saveProjectPatch({ rim: { ...project.rim, kind: e.target.value as RimKind } })}>
                  <option value="roll">卷口（圆芯 + 螺旋锁扎）</option>
                  <option value="bind">包边（内外双带 + 锁扎）</option>
                  <option value="insert">插口（宽篾插口 + 插片）</option>
                </select>
              </div>
              <div className="field">
                <label>主径/带宽 {project.rim.coreMm}mm</label>
                <input type="range" min={5} max={16} step={0.5} value={project.rim.coreMm}
                  onChange={(e) => void saveProjectPatch({ rim: { ...project.rim, coreMm: Number(e.target.value) } })} />
              </div>
              <div className="field">
                <label>扎篾宽 {project.rim.wrappingWidthMm}mm</label>
                <input type="range" min={2} max={8} step={0.5} value={project.rim.wrappingWidthMm}
                  onChange={(e) => void saveProjectPatch({ rim: { ...project.rim, wrappingWidthMm: Number(e.target.value) } })} />
              </div>
              <div className="field full">
                <label>锁扎间距 {project.rim.wrappingGapMm}mm</label>
                <input type="range" min={2} max={12} step={0.5} value={project.rim.wrappingGapMm}
                  onChange={(e) => void saveProjectPatch({ rim: { ...project.rim, wrappingGapMm: Number(e.target.value) } })} />
              </div>
            </div>
          </section>

          <section className="panel">
            <h3>显示与校验</h3>
            <div className="toggle-grid">
              <label className="toggle"><span>逆光/桌面漏光投影</span><input type="checkbox" checked={project.backlight} onChange={(e) => void saveProjectPatch({ backlight: e.target.checked })} /></label>
              <label className="toggle"><span>弯曲超限段标红</span><input type="checkbox" checked={project.showDanger} onChange={(e) => void saveProjectPatch({ showDanger: e.target.checked })} /></label>
              <label className="toggle"><span>自动旋转</span><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /></label>
            </div>
            <div className="stat-grid" style={{ marginTop: 12 }}>
              <div className="stat"><b>{stats?.stripCount ?? 0}</b><span>篾条/根数</span></div>
              <div className="stat"><b>{stats?.triangleCount ? Math.round(stats.triangleCount / 1000) : 0}k</b><span>三角面</span></div>
              <div className="stat"><b>{stats?.minPatchClearanceCm.toFixed(2) ?? '--'}</b><span>重叠面额外间隙 cm</span></div>
              <div className="stat"><b>{stats?.dangerLengthCm.toFixed(1) ?? 0}</b><span>标红长度 cm</span></div>
              <div className="stat"><b>{stats?.hexMarkerCount ?? 0}</b><span>六角畸变标记</span></div>
              <div className="stat"><b>{result?.minBendRadiusCm.toFixed(2) ?? '--'}</b><span>最小允许 R cm</span></div>
            </div>
            <ul className="warning-list" style={{ marginTop: 12 }}>
              {(result?.warnings ?? []).map((w, i) => <li key={i} className={w.level}>{w.message}</li>)}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
