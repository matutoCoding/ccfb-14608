import type {
  BuildResult,
  HexIssue,
  MaterialSpec,
  RibbonMeshData,
  VesselSpec,
  WeaveSpec,
} from '../types';
import { TAU, clamp, envelope, mod } from './mathUtils';
import { VesselSurface } from './vessel';
import { buildRibbonGeometry, type RibbonSample } from './ribbon';
import { patternAt } from './patterns';
import { buildHexWeave } from './hexWeave';
import { buildChrysanthemumBase } from './chrysanthemum';
import { buildRim } from './rim';

const SIDE_T0 = 0.06; // 侧壁起编位置(留出底)
const SIDE_T1 = 0.96; // 侧壁止编(留出收口)

export interface BuildContext {
  vessel: VesselSurface;
  weave: WeaveSpec;
  material: MaterialSpec;
}

/** 根数重算:周长 / (篾宽+间隙),取偶并向格子周期对齐 */
export function recalcWarpCount(ctx: BuildContext): number {
  const { vessel, weave } = ctx;
  const pitch = weave.stripWidth + weave.gapH;
  const raw = vessel.perimeterAt(0.5) / pitch;
  let n = Math.max(weave.patternCols * 2, Math.round(raw / 2) * 2);
  n += mod(n, weave.patternCols);
  return n;
}

/** 纬圈根数:有效高度 / (篾宽+间隙) */
export function recalcWeftCount(ctx: BuildContext): number {
  const { vessel, weave } = ctx;
  const usableH = vessel.spec.height * (SIDE_T1 - SIDE_T0);
  const pitch = weave.stripWidth + weave.gapV;
  return Math.max(weave.patternRows, Math.round(usableH / pitch));
}

/** 经篾 i 在高度 t 的挑压偏移 */
function warpOffset(
  ctx: BuildContext,
  i: number,
  t: number,
  weftCount: number,
  ringTs: number[],
): number {
  const { weave } = ctx;
  const pitchT = weave.stripWidth + weave.gapV;
  let acc = 0;
  for (let j = 0; j < weftCount; j++) {
    const dist = (t - ringTs[j]) * ctx.vessel.spec.height;
    const u = dist / (pitchT / 2);
    if (Math.abs(u) >= 1) continue;
    const over = patternAt(weave, j, i); // 1=纬在上
    // 纬在上 → 经在下(-);经压纬 → 经在上(+)
    acc += (over === 1 ? -1 : 1) * envelope(u);
  }
  return acc * weave.stripThickness * 0.75;
}

/** 纬圈 j 在角度 θ 的挑压偏移 */
function weftOffset(
  ctx: BuildContext,
  j: number,
  theta: number,
  warpCount: number,
): number {
  const { vessel, weave } = ctx;
  const perimeter = vessel.perimeterAt(ringTFor(j));
  const pitchA = TAU / warpCount;
  const pitchArc = perimeter / warpCount;
  let acc = 0;
  for (let i = 0; i < warpCount; i++) {
    const thetaI = (i / warpCount) * TAU;
    let dth = theta - thetaI;
    while (dth > Math.PI) dth -= TAU;
    while (dth < -Math.PI) dth += TAU;
    const dist = (dth / pitchA) * pitchArc;
    const u = dist / ((weave.stripWidth + weave.gapH) / 2);
    if (Math.abs(u) >= 1) continue;
    const over = patternAt(weave, j, i);
    acc += (over === 1 ? 1 : -1) * envelope(u);
  }
  return acc * weave.stripThickness * 0.75;
}

// 模块内临时缓存,避免 weftOffset 重复求根数
let recalcWeftCountMemo = 1;
function ringTFor(j: number): number {
  return SIDE_T0 + ((SIDE_T1 - SIDE_T0) * (j + 0.5)) / recalcWeftCountMemo;
}

function buildPlainFamily(ctx: BuildContext): {
  ribbons: RibbonMeshData[];
  warpCount: number;
  weftCount: number;
} {
  const { vessel, weave, material } = ctx;
  const warpCount = recalcWarpCount(ctx);
  const weftCount = recalcWeftCount(ctx);
  recalcWeftCountMemo = weftCount;
  const ribbons: RibbonMeshData[] = [];
  const minR = material.bendFactor * weave.stripThickness;
  const ringTs = Array.from(
    { length: weftCount },
    (_, j) => SIDE_T0 + ((SIDE_T1 - SIDE_T0) * (j + 0.5)) / weftCount,
  );

  // 经篾:沿高度走的竖篾
  const warpSamples = Math.max(48, vessel.spec.heightSegments);
  let id = 0;
  for (let i = 0; i < warpCount; i++) {
    const theta = (i / warpCount) * TAU;
    const samples: RibbonSample[] = [];
    for (let k = 0; k <= warpSamples; k++) {
      const t = SIDE_T0 + (SIDE_T1 - SIDE_T0) * (k / warpSamples);
      const f = vessel.frame(t, theta);
      samples.push({ ...f, offset: warpOffset(ctx, i, t, weftCount, ringTs) });
    }
    ribbons.push(
      buildRibbonGeometry({
        id: id++,
        order: i,
        role: 'warp',
        label: `经篾 ${i + 1}`,
        width: weave.stripWidth,
        thickness: weave.stripThickness,
        samples,
        minAllowedRadius: minR,
      }),
    );
  }

  // 纬圈:沿周向走的横篾
  const weftSamples = Math.max(96, vessel.spec.radialSegments);
  for (let j = 0; j < weftCount; j++) {
    const t = ringTs[j];
    const samples: RibbonSample[] = [];
    for (let k = 0; k <= weftSamples; k++) {
      const theta = TAU * (k / weftSamples);
      const f = vessel.frame(t, theta);
      samples.push({ ...f, offset: weftOffset(ctx, j, theta, warpCount) });
    }
    ribbons.push(
      buildRibbonGeometry({
        id: id++,
        order: warpCount + j,
        role: 'weft',
        label: `纬圈 ${j + 1}`,
        width: weave.stripWidth,
        thickness: weave.stripThickness,
        samples,
        minAllowedRadius: minR,
      }),
    );
  }
  return { ribbons, warpCount, weftCount };
}

/** 主入口:按编法族装配全部篾片 */
export function buildWeave(
  vesselSpec: VesselSpec,
  weave: WeaveSpec,
  material: MaterialSpec,
): BuildResult {
  const t0 = performance.now();
  const vessel = new VesselSurface(vesselSpec);
  const ctx: BuildContext = { vessel, weave, material };
  const ribbons: RibbonMeshData[] = [];
  const hexIssues: HexIssue[] = [];
  const warnings: BuildResult['warnings'] = [];

  let warpCount = 0;
  let weftCount = 0;

  if (weave.family === 'hex') {
    const r = buildHexWeave(ctx);
    ribbons.push(...r.ribbons);
    hexIssues.push(...r.hexIssues);
    warpCount = r.warpCount;
    weftCount = r.weftCount;
    if (hexIssues.length > 0) {
      warnings.push({
        level: 'warn',
        message: `${hexIssues.length} 处六角孔无法保持正六边形(容差 ${(weave.hexTolerance * 100).toFixed(0)}%),已在模型上以橙色标记`,
      });
    }
  } else {
    const r = buildPlainFamily(ctx);
    ribbons.push(...r.ribbons);
    warpCount = r.warpCount;
    weftCount = r.weftCount;
  }

  // 菊花底
  if (weave.baseStyle === 'chrysanthemum') {
    const base = buildChrysanthemumBase(ctx, warpCount);
    ribbons.push(...base);
  }

  // 收口
  if (weave.rimType !== 'none') {
    const rim = buildRim(ctx);
    ribbons.push(...rim);
  }

  // 统一重排编织顺序(回放用),消除各模块 order 撞号:
  // 菊花底辐条 → 底圈 → 侧壁经篾/六角篾 → 纬圈自下而上 → 收口
  const roleRank: Record<string, number> = {
    spoke: 0,
    baseRing: 1,
    warp: 2,
    hexStrip: 2,
    weft: 3,
    rim: 9,
  };
  const indexed = ribbons.map((r, idx) => ({ r, idx }));
  indexed.sort((a, b) => {
    const ra = roleRank[a.r.role] ?? 5;
    const rb = roleRank[b.r.role] ?? 5;
    if (ra !== rb) return ra - rb;
    return a.r.order - b.r.order || a.idx - b.idx;
  });
  indexed.forEach((x, i) => {
    x.r.order = i;
  });

  const violated = ribbons.filter((r) => r.bendViolations > 0);
  if (violated.length > 0) {
    warnings.push({
      level: 'error',
      message: `${violated.length} 根篾片存在弯曲半径小于最小值的段(竹种 ${material.species}、篾厚 ${weave.stripThickness}mm),模型上已标红,建议加厚或改缓轮廓`,
    });
  }

  return {
    ribbons,
    hexIssues,
    warnings,
    warpCount,
    weftCount,
    timingMs: performance.now() - t0,
  };
}

export { SIDE_T0, SIDE_T1, clamp };
