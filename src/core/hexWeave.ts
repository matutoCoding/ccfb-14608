import type { HexIssue, RibbonMeshData } from '../types';
import type { BuildContext } from './weaveBuilder';
import { TAU, clamp, mod } from './mathUtils';
import { buildRibbonGeometry, type RibbonSample } from './ribbon';
import { SIDE_T0, SIDE_T1 } from './weaveBuilder';

/**
 * 六角孔编(回转体正确拓扑):
 * 在圆柱展开面用 (周向列 j, 高度行 i) 整数网格构造三组夹角 60° 的篾带,
 * 周向以列数 N 取模 → 每条篾环向闭合、无接缝回卷歧义、无孤立螺旋段。
 *
 * 三组篾(展开面内方向):
 *  A 竖直:列固定,沿高度走
 * B +60°:每升一行,列 +1
 * C -60°:每升一行,列 -1
 * 映射到曲面时周向按局部周长换算弧长,保证篾宽物理一致。
 */
export function buildHexWeave(ctx: BuildContext): {
  ribbons: RibbonMeshData[];
  hexIssues: HexIssue[];
  warpCount: number;
  weftCount: number;
} {
  const { vessel, weave, material } = ctx;
  const a = weave.stripWidth + weave.gapH; // 孔距
  const midT = (SIDE_T0 + SIDE_T1) / 2;
  const P = vessel.perimeterAt(midT); // 腰部周长,展开面宽
  // 周向列数:周长 / 孔距,取整保证环向闭合
  const Ncol = Math.max(12, Math.round(P / a));
  const colPitch = P / Ncol; // 展开面列距(mm)
  const rowPitch = colPitch * Math.sin(Math.PI / 3); // 行距 = 列距·sin60,正三角格
  const H = vessel.spec.height * (SIDE_T1 - SIDE_T0);
  const Nrow = Math.max(8, Math.round(H / rowPitch));

  // 展开 (u=弧长, v=高度) → 曲面标架
  const map = (u: number, v: number) => {
    const t = clamp(SIDE_T0 + (v / H) * (SIDE_T1 - SIDE_T0), 0, 1);
    const theta = TAU * mod(u / P, 1);
    return vessel.frame(t, theta);
  };

  const minR = material.bendFactor * weave.stripThickness;
  const ribbons: RibbonMeshData[] = [];
  let id = 0;

  // 交叉点上下关系:由 (族, 列, 行) 唯一决定,两篾严格互补 → 不穿模
  const overAt = (fam: number, col: number, row: number): boolean => {
    const idx = mod(fam * 7 + col * 3 + row * 5, weave.hexCycle.length);
    return weave.hexCycle[idx] === 1;
  };

  /** 沿一条篾的网格路径(col(row) 函数)采样成几何 */
  const emit = (
    fam: number,
    label: string,
    colAt: (row: number) => number,
    rowLo: number,
    rowHi: number,
  ) => {
    const samples: RibbonSample[] = [];
    const steps = Math.max(24, (rowHi - rowLo) * 6);
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const rowF = rowLo + (rowHi - rowLo) * f;
      const colF = colAt(rowF);
      const u = colF * colPitch;
      const v = rowF * rowPitch;
      const fr = map(u, v);

      // 挑压偏移:在整数行交叉点附近作用,包络过渡
      let offset = 0;
      const r0 = Math.floor(rowF);
      for (const rr of [r0 - 1, r0, r0 + 1]) {
        const d = Math.abs(rowF - rr) * rowPitch;
        const uu = d / (a / 2);
        if (uu >= 1) continue;
        const env = 0.5 * (1 + Math.cos(Math.PI * clamp(uu, 0, 1)));
        const col = Math.round(colAt(rr));
        const up = overAt(fam, mod(col, Ncol), rr);
        offset += (up ? 1 : -1) * env * weave.stripThickness * 0.7;
      }

      // 篾宽方向:展开面内垂直篾长的方向,取差分映回
      const du = (colAt(rowF + 0.01) - colAt(rowF - 0.01)) * colPitch;
      const dv = 0.02 * rowPitch;
      const wLen = Math.hypot(du, dv) || 1;
      const fPlus = map(u + (-dv / wLen), v + (du / wLen));
      const wd = [
        fPlus.center[0] - fr.center[0],
        fPlus.center[1] - fr.center[1],
        fPlus.center[2] - fr.center[2],
      ];
      const wl = Math.hypot(wd[0], wd[1], wd[2]) || 1;
      samples.push({
        center: fr.center,
        normal: fr.normal,
        widthDir: [wd[0] / wl, wd[1] / wl, wd[2] / wl],
        tangent: fr.tangent,
        offset,
      });
    }
    ribbons.push(
      buildRibbonGeometry({
        id: id++,
        order: id,
        role: 'hexStrip',
        label,
        width: weave.stripWidth,
        thickness: weave.stripThickness,
        samples,
        minAllowedRadius: minR,
      }),
    );
  };

  // A 族:竖直篾,每列一条,从底到口
  for (let j = 0; j < Ncol; j++) {
    emit(0, `六角竖篾 ${j + 1}`, () => j, 0, Nrow);
  }
  // B 族:+60°,col = row + b,每条按相位 b 编号,环绕 Ncol 取模
  for (let b = 0; b < Ncol; b++) {
    emit(
      1,
      `六角斜篾+ ${b + 1}`,
      (row) => row + b,
      -Nrow,
      Nrow,
    );
  }
  // C 族:-60°,col = -row + c
  for (let c = 0; c < Ncol; c++) {
    emit(
      2,
      `六角斜篾- ${c + 1}`,
      (row) => -row + c,
      -Nrow,
      Nrow,
    );
  }

  const hexIssues = detectHexIssues(ctx, Ncol, Nrow, colPitch, rowPitch, map);

  return {
    ribbons,
    hexIssues,
    warpCount: Ncol,
    weftCount: Nrow,
  };
}

/** 检测正六边形畸变:在整数网格点周围取六个邻点,量边长/角度偏差 */
function detectHexIssues(
  ctx: BuildContext,
  Ncol: number,
  Nrow: number,
  colPitch: number,
  rowPitch: number,
  map: (u: number, v: number) => ReturnType<BuildContext['vessel']['frame']>,
): HexIssue[] {
  const { weave } = ctx;
  const tol = weave.hexTolerance;
  const issues: HexIssue[] = [];
  const P = colPitch * Ncol;

  for (let i = 0; i < Nrow; i += 2) {
    for (let j = 0; j < Ncol; j += 2) {
      // 正三角格上一个六边形的六个顶点(列,行)
      const ring: [number, number][] = [
        [j + 1, i],
        [j + 2, i + 1],
        [j + 1, i + 2],
        [j - 1, i + 2],
        [j - 2, i + 1],
        [j - 1, i],
      ];
      const pts = ring.map(([c, r]) =>
        map(mod(c, Ncol) * colPitch, r * rowPitch).center,
      );
      const center = map(mod(j, Ncol) * colPitch, (i + 1) * rowPitch).center;
      const edges = pts.map((p, k) => {
        const q = pts[(k + 1) % pts.length];
        return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      });
      const meanEdge = edges.reduce((s, x) => s + x, 0) / edges.length;
      const edgeDev =
        Math.max(...edges.map((e) => Math.abs(e - meanEdge) / meanEdge));
      const angles = pts.map((p, k) => {
        const q = pts[(k + 1) % pts.length];
        const v1 = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
        const v2 = [q[0] - center[0], q[1] - center[1], q[2] - center[2]];
        const l1 = Math.hypot(...v1) || 1;
        const l2 = Math.hypot(...v2) || 1;
        const cosA =
          (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (l1 * l2);
        return (Math.acos(clamp(cosA, -1, 1)) * 180) / Math.PI;
      });
      const angleDev =
        Math.max(...angles.map((g) => Math.abs(g - 120))) / 120;
      if (edgeDev > tol || angleDev > tol) {
        issues.push({
          center,
          edgeDeviation: edgeDev,
          angleDeviation: angleDev,
          strain: Math.abs(colPitch / (P / Ncol) - 1),
        });
      }
    }
  }
  issues.sort(
    (x, y) =>
      Math.max(y.edgeDeviation, y.angleDeviation) -
      Math.max(x.edgeDeviation, x.angleDeviation),
  );
  return issues.slice(0, 60);
}
