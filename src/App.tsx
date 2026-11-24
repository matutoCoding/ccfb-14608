import { useDeferredValue, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { generateWeave } from './lib/engine';
import { ShapePage } from './pages/ShapePage';
import { WeavePage } from './pages/WeavePage';
import { MaterialPage } from './pages/MaterialPage';
import { PreviewPage } from './pages/PreviewPage';
import { CutListPage } from './pages/CutListPage';
import type { PageKey } from './types';

const NAV: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: 'shape', label: '器型', icon: '🏺' },
  { key: 'weave', label: '编法', icon: '▦' },
  { key: 'material', label: '篾料', icon: '🎋' },
  { key: 'preview', label: '三维预览', icon: '🧺' },
  { key: 'cutlist', label: '备料单', icon: '📋' },
];

export default function App() {
  const [page, setPage] = useState<PageKey>('shape');
  const shapes = useLiveQuery(() => db.shapes.orderBy('updatedAt').reverse().toArray(), []);
  const weaves = useLiveQuery(() => db.weaves.toArray(), []);
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const project = useLiveQuery(() => db.project.get('current'), []);

  const currentShape = shapes?.find((s) => s.id === project?.shapeId) ?? shapes?.[0];
  const currentWeave = weaves?.find((w) => w.id === project?.weaveId) ?? weaves?.[0];
  const currentMaterial = materials?.find((m) => m.id === project?.materialId) ?? materials?.[0];

  const request = useMemo(() => {
    if (!currentShape || !currentWeave || !currentMaterial || !project) return null;
    return { shape: currentShape, weave: currentWeave, material: currentMaterial, lossRate: project.lossRate };
  }, [currentShape, currentWeave, currentMaterial, project]);

  const deferredRequest = useDeferredValue(request);
  const result = useMemo(() => (deferredRequest ? generateWeave(deferredRequest) : null), [deferredRequest]);

  if (!shapes || !weaves || !materials || !project || !currentShape || !currentWeave || !currentMaterial) {
    return <div className="loading">正在打开本地竹编设计库 IndexedDB…</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <h1>竹编器型<br />编法设计系统</h1>
            <p>Bamboo Weave Studio</p>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button key={item.key} className={page === item.key ? 'active' : ''} onClick={() => setPage(item.key)}>
              <span className="ico">{item.icon}</span>
              <span className="label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-note">
          数据仅存于本机 IndexedDB。<br />
          几何单位：cm；篾料输入：mm。<br />
          交叉让位与弯曲半径均实时校验。
        </div>
      </aside>

      <main className="main">
        {page === 'shape' && <ShapePage shapes={shapes} current={currentShape} project={project} />}
        {page === 'weave' && <WeavePage weaves={weaves} current={currentWeave} project={project} />}
        {page === 'material' && <MaterialPage materials={materials} current={currentMaterial} project={project} />}
        {page === 'preview' && (
          <PreviewPage
            project={project}
            shape={currentShape}
            weave={currentWeave}
            material={currentMaterial}
            result={result}
            shapes={shapes}
            weaves={weaves}
            materials={materials}
          />
        )}
        {page === 'cutlist' && (
          <CutListPage project={project} shape={currentShape} material={currentMaterial} result={result} />
        )}
      </main>
    </div>
  );
}
