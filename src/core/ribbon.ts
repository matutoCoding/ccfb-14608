import type { RibbonMeshData, RibbonRole, Vec3 } from '../types';
import { TAU, bendRadius, vAdd, vScale } from './mathUtils';

export interface RibbonSample {
  center: Vec3; // 曲面中心
  normal: Vec3; // 面外法向
  widthDir: Vec3; // 篾宽方向
  tangent: Vec3; // 篾长方向
  offset: number; // 挑压法向偏移(mm,沿 normal)
  bendBad?: boolean; // 该采样点弯曲超限
}

export interface BuildRibbonOptions {
  id: number;
  order: number;
  role: RibbonRole;
  label: string;
  width: number;
  thickness: number;
  samples: RibbonSample[];
  minAllowedRadius: number;
  /** 豁免折弯判定的采样索引区间(如菊花底中心汇聚、翻折工艺区),[起,止) */
  exemptRanges?: [number, number][];
}

/**
 * 把中心线采样生成封闭带状盒:每环 8 顶点
 * (宽向 2 × 厚向 2,四角),共 6 面,可正确投影、不会单面穿帮。
 */
export function buildRibbonGeometry(opts: BuildRibbonOptions): RibbonMeshData {
  const { samples, width, thickness } = opts;
  const N = samples.length;
  const ring = 8;
  const positions = new Float32Array(N * ring * 3);
  const normals = new Float32Array(N * ring * 3);
  const uvs = new Float32Array(N * ring * 2);
  const colors = new Float32Array(N * ring * 3);
  const indices: number[] = [];

  let totalLen = 0;
  let minRadius = Infinity;
  let violations = 0;

  // 累计弧长(先算,供曲率与 UV 共用)
  const arc = new Array<number>(N).fill(0);
  for (let i = 1; i < N; i++) {
    arc[i] =
      arc[i - 1] +
      Math.hypot(
        samples[i].center[0] - samples[i - 1].center[0],
        samples[i].center[1] - samples[i - 1].center[1],
        samples[i].center[2] - samples[i - 1].center[2],
      );
  }
  totalLen = arc[N - 1];

  // 折弯判定:在固定物理窗口(≈3 个篾宽)上算 Menger 半径。
  // 这是师傅沿篾条手感判断的尺度——窗口随篾宽走,与采样密度无关,
  // 避免密集采样把贴曲面的宏观曲率误判成急弯。
  const windowLen = Math.max(width * 3, thickness * 12);
  const radiusAt = (i: number): number => {
    const targetLo = arc[i] - windowLen / 2;
    let lo = i;
    while (lo > 0 && arc[lo] > targetLo) lo--;
    const targetHi = arc[i] + windowLen / 2;
    let hi = i;
    while (hi < N - 1 && arc[hi] < targetHi) hi++;
    if (hi - lo < 2) return Infinity;
    return bendRadius(samples[lo].center, samples[i].center, samples[hi].center);
  };
  // 环形篾(纬圈/收口/底圈)的周向曲率是设计形态(贴器型环绕),
  // 用自然环绕半径豁免,只惩罚比环绕更急的弯。
  const circumferential =
    opts.role === 'weft' || opts.role === 'rim' || opts.role === 'baseRing';
  const naturalRadius = circumferential && totalLen > 0 ? totalLen / TAU : Infinity;
  // 经篾/辐条/六角篾沿厚度面贴服曲面,竹篾薄而柔,贴服弯允许小半径;
  // 硬折弯(非贴服)才用竹种系数阈值。
  const conforming =
    opts.role === 'warp' || opts.role === 'spoke' || opts.role === 'hexStrip';
  const conformFactor = 8; // 贴服弯最小半径 ≈ 8 × 篾厚(薄篾贴曲面的实测下限)
  const baseLimit = conforming
    ? thickness * conformFactor
    : opts.minAllowedRadius;
  const effectiveLimit = circumferential
    ? Math.min(baseLimit, naturalRadius * 0.9)
    : baseLimit;
  const violationsAt: boolean[] = new Array(N).fill(false);
  const ranges = opts.exemptRanges ?? [];
  const isExempt = (i: number) =>
    ranges.some(([lo, hi]) => i >= lo && i < hi);
  for (let i = 1; i < N - 1; i++) {
    if (isExempt(i)) continue; // 工艺豁免区
    const rMin = radiusAt(i);
    if (rMin < minRadius) minRadius = rMin;
    if (rMin < effectiveLimit) {
      violationsAt[i] = true;
      violations++;
    }
  }
  for (let i = 0; i < N; i++) samples[i].bendBad = violationsAt[i];

  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const c = vAdd(s.center, vScale(s.normal, s.offset));
    const hw = width / 2;
    const ht = thickness / 2;
    // 8 角点:0-3 下表面(贴器型),4-7 上表面
    const corners: Vec3[] = [
      vAdd(vAdd(c, vScale(s.widthDir, -hw)), vScale(s.normal, -ht)),
      vAdd(vAdd(c, vScale(s.widthDir, hw)), vScale(s.normal, -ht)),
      vAdd(vAdd(c, vScale(s.widthDir, hw)), vScale(s.normal, ht)),
      vAdd(vAdd(c, vScale(s.widthDir, -hw)), vScale(s.normal, ht)),
      vAdd(vAdd(c, vScale(s.widthDir, -hw)), vScale(s.normal, -ht)),
      vAdd(vAdd(c, vScale(s.widthDir, hw)), vScale(s.normal, -ht)),
      vAdd(vAdd(c, vScale(s.widthDir, hw)), vScale(s.normal, ht)),
      vAdd(vAdd(c, vScale(s.widthDir, -hw)), vScale(s.normal, ht)),
    ];
    const base = i * ring;
    for (let k = 0; k < ring; k++) {
      positions[(base + k) * 3] = corners[k][0];
      positions[(base + k) * 3 + 1] = corners[k][1];
      positions[(base + k) * 3 + 2] = corners[k][2];
      // 法向:按角点所在面取 widthDir / normal
      let n: Vec3;
      if (k === 0 || k === 4) n = vScale(s.widthDir, -1);
      else if (k === 1 || k === 5) n = s.widthDir;
      else if (k === 2 || k === 6) n = s.normal;
      else n = vScale(s.normal, -1);
      normals[(base + k) * 3] = n[0];
      normals[(base + k) * 3 + 1] = n[1];
      normals[(base + k) * 3 + 2] = n[2];
      const u = k % 2 === 0 ? 0 : 1;
      uvs[(base + k) * 2] = u;
      uvs[(base + k) * 2 + 1] = totalLen / 50; // 每 50mm 一个纹理周期,纤维顺篾长
      const bad = !!s.bendBad;
      colors[(base + k) * 3] = bad ? 0.85 : 1;
      colors[(base + k) * 3 + 1] = bad ? 0.12 : 1;
      colors[(base + k) * 3 + 2] = bad ? 0.08 : 1;
    }
  }

  // 面连接:相邻环之间的 4 个侧面
  for (let i = 0; i < N - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % 4);
      const c = (i + 1) * ring + ((k + 1) % 4);
      const d = (i + 1) * ring + k;
      indices.push(a, b, d, b, c, d);
      const a2 = a + 4;
      const b2 = b + 4;
      const c2 = c + 4;
      const d2 = d + 4;
      indices.push(a2, d2, b2, b2, d2, c2);
    }
  }
  // 两端封口
  const end = (N - 1) * ring;
  indices.push(0, 2, 1, 0, 3, 2);
  indices.push(end, end + 1, end + 2, end, end + 2, end + 3);

  return {
    id: opts.id,
    order: opts.order,
    role: opts.role,
    label: opts.label,
    stripWidth: width,
    stripThickness: thickness,
    length: totalLen,
    minBendRadius: minRadius,
    bendViolations: violations,
    positions,
    normals,
    uvs,
    colors,
    indices: Uint32Array.from(indices),
  };
}
