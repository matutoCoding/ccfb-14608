import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  MaterialSpec,
  ProjectSpec,
  VesselSpec,
  WeaveSpec,
} from '../types';
import {
  idbBulkPut,
  idbDelete,
  idbGetAll,
  idbPut,
  STORES,
  type StoreName,
} from './db';
import {
  defaultMaterials,
  defaultVessel,
  defaultWeave,
  squareBottomVessel,
  uid,
} from './defaults';

interface DataState {
  vessels: VesselSpec[];
  weaves: WeaveSpec[];
  materials: MaterialSpec[];
  projects: ProjectSpec[];
  activeProject: ProjectSpec | null;
  ready: boolean;
}

interface StoreActions {
  saveVessel: (v: VesselSpec) => Promise<void>;
  saveWeave: (w: WeaveSpec) => Promise<void>;
  saveMaterial: (m: MaterialSpec) => Promise<void>;
  remove: (store: StoreName, id: string) => Promise<void>;
  createVessel: () => Promise<VesselSpec>;
  createWeave: (family?: WeaveSpec['family']) => Promise<WeaveSpec>;
  createMaterial: () => Promise<MaterialSpec>;
  setActiveProject: (p: ProjectSpec) => void;
  touchProject: () => void;
}

type Store = DataState & StoreActions;

const Ctx = createContext<Store | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    vessels: [],
    weaves: [],
    materials: [],
    projects: [],
    activeProject: null,
    ready: false,
  });
  const saveTimer = useRef<number | null>(null);
  const initLock = useRef(false);

  useEffect(() => {
    if (initLock.current) return;
    initLock.current = true;
    (async () => {
      let vessels = await idbGetAll<VesselSpec>('vessels');
      let weaves = await idbGetAll<WeaveSpec>('weaves');
      let materials = await idbGetAll<MaterialSpec>('materials');
      let projects = await idbGetAll<ProjectSpec>('projects');

      // 按名称去重兜底(清理早期版本 StrictMode 双调用产生的重复种子)
      const dedup = <T extends { id: string; name: string }>(arr: T[]): T[] => {
        const seen = new Set<string>();
        return arr.filter((x) => {
          if (seen.has(x.name)) return false;
          seen.add(x.name);
          return true;
        });
      };
      vessels = dedup(vessels);
      weaves = dedup(weaves);
      materials = dedup(materials);

      if (vessels.length === 0) {
        vessels = [defaultVessel(), squareBottomVessel()];
        await idbBulkPut('vessels', vessels);
      }
      if (weaves.length === 0) {
        weaves = [
          defaultWeave('plain'),
          defaultWeave('herringbone'),
          defaultWeave('hex'),
        ];
        await idbBulkPut('weaves', weaves);
      }
      if (materials.length === 0) {
        materials = defaultMaterials();
        await idbBulkPut('materials', materials);
      }
      if (projects.length === 0) {
        const p: ProjectSpec = {
          id: uid('p'),
          name: '当前项目',
          vesselId: vessels[0].id,
          weaveId: weaves.find((w) => w.family === 'hex')?.id ?? weaves[0].id,
          materialId: materials[0].id,
          updatedAt: Date.now(),
        };
        projects = [p];
        await idbBulkPut('projects', projects);
      }
      setState({
        vessels,
        weaves,
        materials,
        projects,
        activeProject: projects[0],
        ready: true,
      });
    })();
  }, []);

  const persistProject = useCallback((p: ProjectSpec) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void idbPut('projects', { ...p, updatedAt: Date.now() });
    }, 400);
  }, []);

  const saveVessel = useCallback(async (v: VesselSpec) => {
    await idbPut('vessels', v);
    setState((s) => ({
      ...s,
      vessels: s.vessels.map((x) => (x.id === v.id ? v : x)),
    }));
  }, []);

  const saveWeave = useCallback(async (w: WeaveSpec) => {
    await idbPut('weaves', w);
    setState((s) => ({
      ...s,
      weaves: s.weaves.map((x) => (x.id === w.id ? w : x)),
    }));
  }, []);

  const saveMaterial = useCallback(async (m: MaterialSpec) => {
    await idbPut('materials', m);
    setState((s) => ({
      ...s,
      materials: s.materials.map((x) => (x.id === m.id ? m : x)),
    }));
  }, []);

  const remove = useCallback(async (store: StoreName, id: string) => {
    await idbDelete(store, id);
    setState((s) => ({
      ...s,
      [store]: (s[store] as { id: string }[]).filter((x) => x.id !== id),
    }));
  }, []);

  const createVessel = useCallback(async () => {
    const v = defaultVessel();
    v.name = `器型 ${Date.now().toString().slice(-4)}`;
    await idbPut('vessels', v);
    setState((s) => ({ ...s, vessels: [...s.vessels, v] }));
    return v;
  }, []);

  const createWeave = useCallback(async (family?: WeaveSpec['family']) => {
    const w = defaultWeave(family ?? 'plain');
    await idbPut('weaves', w);
    setState((s) => ({ ...s, weaves: [...s.weaves, w] }));
    return w;
  }, []);

  const createMaterial = useCallback(async () => {
    const m = defaultMaterials()[0];
    m.name = `篾料 ${Date.now().toString().slice(-4)}`;
    await idbPut('materials', m);
    setState((s) => ({ ...s, materials: [...s.materials, m] }));
    return m;
  }, []);

  const setActiveProject = useCallback(
    (p: ProjectSpec) => {
      setState((s) => ({ ...s, activeProject: p }));
      persistProject(p);
    },
    [persistProject],
  );

  const touchProject = useCallback(() => {
    setState((s) => {
      if (!s.activeProject) return s;
      const p = { ...s.activeProject, updatedAt: Date.now() };
      persistProject(p);
      return { ...s, activeProject: p };
    });
  }, [persistProject]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      saveVessel,
      saveWeave,
      saveMaterial,
      remove,
      createVessel,
      createWeave,
      createMaterial,
      setActiveProject,
      touchProject,
    }),
    [
      state,
      saveVessel,
      saveWeave,
      saveMaterial,
      remove,
      createVessel,
      createWeave,
      createMaterial,
      setActiveProject,
      touchProject,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore 必须在 DataProvider 内使用');
  return ctx;
}

export { STORES };
