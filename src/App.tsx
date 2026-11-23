import { useCallback, useMemo, useState } from 'react';
import { DataProvider, useStore } from './data/store';
import { useWeaveBuild } from './hooks/useWeaveBuild';
import { WeavePreview } from './components/WeavePreview';
import { VesselPage } from './components/VesselPage';
import { WeavePage } from './components/WeavePage';
import { MaterialPage } from './components/MaterialPage';
import { BillPage } from './components/BillPage';
import { PlaybackPlayer } from './components/PlaybackPlayer';
import type { SceneOptions } from './three/WeaveScene';

type Tab = 'vessel' | 'weave' | 'material' | 'preview' | 'bill';

const TABS: { key: Tab; label: string }[] = [
  { key: 'vessel', label: '器型' },
  { key: 'weave', label: '编法' },
  { key: 'material', label: '篾料' },
  { key: 'preview', label: '三维预览' },
  { key: 'bill', label: '备料单' },
];

function Studio() {
  const { vessels, weaves, materials, activeProject, ready } = useStore();
  const [tab, setTab] = useState<Tab>('preview');
  const [opts, setOpts] = useState<SceneOptions>({
    backlight: true,
    showMarkers: true,
    groundShadow: true,
  });
  const [step, setStep] = useState<number | null>(null);
  const [materialVersion, setMaterialVersion] = useState(0);
  const [prevMaterialId, setPrevMaterialId] = useState<string | null>(null);

  const vessel = vessels.find((v) => v.id === activeProject?.vesselId);
  const weave = weaves.find((w) => w.id === activeProject?.weaveId);
  const material = materials.find((m) => m.id === activeProject?.materialId);

  const { result, building } = useWeaveBuild(vessel, weave, material);

  if (material && material.id !== prevMaterialId) {
    setPrevMaterialId(material.id);
    setMaterialVersion((v) => v + 1);
  }

  const onStep = useCallback((s: number | null) => setStep(s), []);

  const warnings = result?.warnings ?? [];
  const bendCount = useMemo(
    () => result?.ribbons.filter((r) => r.bendViolations > 0).length ?? 0,
    [result],
  );

  if (!ready) return <div className="empty">正在打开本地数据库…</div>;

  return (
    <div className="app">
      <header className="app-head">
        <span className="logo">竹编器型编法设计系统</span>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => {
                setTab(t.key);
                if (t.key !== 'preview') setStep(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className="head-meta">
          {vessel?.name} · {weave?.name} · {material?.name}
        </span>
      </header>

      <div className="app-body">
        {tab === 'vessel' && <VesselPage />}
        {tab === 'weave' && <WeavePage />}
        {tab === 'material' && <MaterialPage />}

        {tab === 'bill' ? (
          <BillPage />
        ) : (
          <main className="main">
            <WeavePreview
              result={result}
              material={material}
              options={opts}
              step={step}
              materialVersion={materialVersion}
            />
            <div className="preview-tools">
              <label className="tool-chip">
                <input
                  type="checkbox"
                  checked={opts.backlight}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, backlight: e.target.checked }))
                  }
                />
                逆光(孔光斑)
              </label>
              <label className="tool-chip">
                <input
                  type="checkbox"
                  checked={opts.groundShadow}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, groundShadow: e.target.checked }))
                  }
                />
                桌面投影
              </label>
              <label className="tool-chip">
                <input
                  type="checkbox"
                  checked={opts.showMarkers}
                  onChange={(e) =>
                    setOpts((o) => ({ ...o, showMarkers: e.target.checked }))
                  }
                />
                折弯标红/畸变标记
              </label>
              {building && <span className="tool-chip">重新生成中…</span>}
            </div>

            {warnings.map((w, i) => (
              <div
                key={i}
                className={`warn-box ${w.level}`}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 12 + i * 58,
                  maxWidth: 340,
                }}
              >
                <span>{w.level === 'error' ? '●' : w.level === 'warn' ? '▲' : 'ℹ'}</span>
                <span>{w.message}</span>
              </div>
            ))}

            {result && tab === 'preview' && (
              <PlaybackPlayer result={result} onStep={onStep} />
            )}

            <footer className="status-bar">
              <span>
                篾片 <b>{result?.ribbons.length ?? 0}</b> 根
              </span>
              <span>
                经篾 <b>{result?.warpCount ?? 0}</b> / 纬圈{' '}
                <b>{result?.weftCount ?? 0}</b>
              </span>
              <span>
                折弯超限 <b style={{ color: bendCount ? '#d96a5a' : undefined }}>
                  {bendCount}
                </b>{' '}
                根
              </span>
              <span>
                六角畸变点 <b>{result?.hexIssues.length ?? 0}</b>
              </span>
              <span>
                几何耗时 <b>{result?.timingMs.toFixed(0) ?? 0}ms</b>
              </span>
              <span>拖拽旋转 · 滚轮缩放</span>
            </footer>
          </main>
        )}
      </div>
    </div>
  );
}

export function App() {
  return (
    <DataProvider>
      <Studio />
    </DataProvider>
  );
}
