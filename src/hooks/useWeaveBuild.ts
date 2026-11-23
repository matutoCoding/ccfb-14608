import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BuildResult,
  MaterialSpec,
  VesselSpec,
  WeaveSpec,
} from '../types';
import { buildWeave } from '../core/weaveBuilder';

/**
 * 篾片几何热路径:useMemo 缓存,只在器型/编法/篾料变更时重算。
 * 目标:40cm 六角孔果篮千级交叉点,2 秒内完成。
 */
export function useWeaveBuild(
  vessel: VesselSpec | undefined,
  weave: WeaveSpec | undefined,
  material: MaterialSpec | undefined,
): { result: BuildResult | null; building: boolean } {
  const [result, setResult] = useState<BuildResult | null>(null);
  const [building, setBuilding] = useState(false);
  const seq = useRef(0);

  const key = useMemo(
    () => JSON.stringify({ vessel, weave, material }),
    [vessel, weave, material],
  );

  useEffect(() => {
    if (!vessel || !weave || !material) return;
    const my = ++seq.current;
    setBuilding(true);
    // 让输入事件先渲染,再同步计算(几何引擎本身为纯 CPU 同步)
    const handle = window.setTimeout(() => {
      const r = buildWeave(vessel, weave, material);
      if (my === seq.current) {
        setResult(r);
        setBuilding(false);
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, [key, vessel, weave, material]);

  return { result, building };
}
