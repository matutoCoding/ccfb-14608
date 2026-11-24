import { useStore, type PageKey } from './state/store';

const NAV: { key: PageKey; label: string; icon: string }[] = [
  { key: 'profile', label: '器型', icon: '🏺' },
  { key: 'pattern', label: '编法', icon: '🧩' },
  { key: 'material', label: '篾料', icon: '🎋' },
  { key: 'viewer', label: '三维预览', icon: '🧊' },
  { key: 'bill', label: '备料单', icon: '📋' },
];

export function App() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const ready = useStore((s) => s.ready);

  if (!ready) {
    return <div className="boot">正在从 IndexedDB 载入本地数据…</div>;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">竹</div>
          <div>
            <h1>竹编设计系统</h1>
            <p>器型 · 编法 · 篾料</p>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <footer className="side-foot">数据保存在本机浏览器 IndexedDB,不上传服务器</footer>
      </aside>
      <main className="content">
        {page === 'profile' && <ProfileLazy />}
        {page === 'pattern' && <PatternLazy />}
        {page === 'material' && <MaterialLazy />}
        {page === 'viewer' && <ViewerLazy />}
        {page === 'bill' && <BillLazy />}
      </main>
    </div>
  );
}

import { lazy, Suspense } from 'react';
const ProfileLazy = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const PatternLazy = lazy(() => import('./pages/PatternPage').then((m) => ({ default: m.PatternPage })));
const MaterialLazy = lazy(() => import('./pages/MaterialPage').then((m) => ({ default: m.MaterialPage })));
const ViewerLazy = lazy(() => import('./pages/ViewerPage').then((m) => ({ default: m.ViewerPage })));
const BillLazy = lazy(() => import('./pages/BillPage').then((m) => ({ default: m.BillPage })));

export function AppWithSuspense() {
  return (
    <Suspense fallback={<div className="boot">加载页面…</div>}>
      <App />
    </Suspense>
  );
}
