import type { Vec3 } from './vec';
import { cross, distance, length, lerp, normalize, sub } from './vec';

export interface PathFrame {
  p: Vec3;
  normal: Vec3;
}

export interface KeyT {
  t: number;
  sign: 1 | -1;
  /** 交叉对方篾宽在本篾中心线上需要保持全高让位的半长 */
  holdCm: number;
  crossingId: string;
}

export interface StripDraft {
  id: string;
  label: string;
  family: 'warp' | 'weft' | 'radial' | 'diagonal-a' | 'diagonal-b' | 'rim';
  group: string;
  rootNo: number;
  order: number;
  widthCm: number;
  thicknessCm: number;
  frameAt: (t: number) => PathFrame;
  keys: KeyT[];
  closed?: boolean;
  maxStepCm?: number;
}

export interface GeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface StripResult {
  id: string;
  label: string;
  family: StripDraft['family'];
  group: string;
  rootNo: number;
  order: number;
  widthCm: number;
  thicknessCm: number;
  lengthCm: number;
  cutLengthCm: number;
  danger: boolean;
  dangerLengthCm: number;
  minRadiusFoundCm: number;
  minTransitionCm: number;
  closed: boolean;
  offsetKeys: OffsetKeyInfo[];
  geometry: GeometryData;
}

interface DistKey {
  d: number;
  value: number;
  hold: number;
  crossingId: string;
}

export const CLEARANCE_CM = 0.045;

export interface OffsetKeyInfo {
  d: number;
  value: number;
  holdCm: number;
  crossingId: string;
}

export function offsetAtDistance(d: number, keys: DistKey[]): number {
  if (keys.length === 0) return 0;
  if (d <= keys[0].d) return keys[0].value;
  if (d >= keys[keys.length - 1].d) return keys[keys.length - 1].value;

  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].d < d) i += 1;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.d - a.d;
  if (span <= 1e-8) return b.value;
  const t = (d - a.d) / span;
  // 余弦过渡在交叉点处一阶导数为 0，篾片保持贴服；整个交叉重叠区的
  // 实际最小法向间隙由引擎中的重叠面采样校验，而不是只看中心点。
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
  return lerp(a.value, b.value, ease);
}

export function createOffsetEvaluator(strip: StripResult): (distanceCm: number) => number {
  const base: DistKey[] = strip.offsetKeys.map((k) => ({
    d: k.d,
    value: k.value,
    crossingId: k.crossingId,
    hold: k.holdCm,
  })).sort((a, b) => a.d - b.d);
  if (base.length === 0) return () => 0;
  let keys = base;
  if (strip.closed) {
    const l = strip.lengthCm;
    keys = [
      ...base.map((k) => ({ ...k, d: k.d - l })),
      ...base,
      ...base.map((k) => ({ ...k, d: k.d + l })),
    ].sort((a, b) => a.d - b.d);
  }
  return (d: number) => offsetAtDistance(d, keys);
}

export function evaluateStripOffset(strip: StripResult, distanceCm: number): number {
  return createOffsetEvaluator(strip)(distanceCm);
}

function estimateLength(draft: StripDraft): number {
  const N = 42;
  let total = 0;
  let prev = draft.frameAt(0).p;
  for (let i = 1; i <= N; i += 1) {
    const p = draft.frameAt(i / N).p;
    total += distance(prev, p);
    prev = p;
  }
  return total;
}

export function buildStripGeometry(draft: StripDraft, lossRate: number, minBendRadiusCm: number): StripResult {
  const estimated = estimateLength(draft);
  const step = draft.maxStepCm ?? 0.24;
  const uniformCount = Math.max(28, Math.min(430, Math.ceil(estimated / step)));
  const rawParams = new Set<number>();
  for (let i = 0; i <= uniformCount; i += 1) rawParams.add(i / uniformCount);
  for (const k of draft.keys) rawParams.add(Math.min(1, Math.max(0, k.t)));
  const sortedRaw = [...rawParams].sort((a, b) => a - b);
  const params: number[] = [];
  for (const t of sortedRaw) {
    if (params.length === 0 || t - params[params.length - 1] > 1e-4) params.push(t);
  }
  if (params[params.length - 1] < 1) params.push(1);
  const count = params.length;

  const frames = params.map((t) => {
    const f = draft.frameAt(t);
    return { p: f.p, normal: normalize(f.normal) };
  });

  const cumulative = new Array<number>(count).fill(0);
  for (let i = 1; i < count; i += 1) {
    cumulative[i] = cumulative[i - 1] + distance(frames[i - 1].p, frames[i].p);
  }
  const totalLength = cumulative[count - 1];
  const lift = draft.thicknessCm / 2 + CLEARANCE_CM;

  const distanceAtT = (t: number): number => {
    let i = 0;
    while (i < params.length - 2 && params[i + 1] < t) i += 1;
    const t0 = params[i];
    const t1 = params[i + 1] ?? t0;
    const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return lerp(cumulative[i], cumulative[i + 1] ?? cumulative[i], k);
  };

  const rawKeys: DistKey[] = draft.keys.map((k) => ({
    d: distanceAtT(Math.min(1, Math.max(0, k.t))),
    value: k.sign * lift,
    hold: k.holdCm,
    crossingId: k.crossingId,
  })).sort((a, b) => a.d - b.d);

  let minTransitionCm = Infinity;
  for (let i = 0; i < rawKeys.length - 1; i += 1) {
    const gap = rawKeys[i + 1].d - rawKeys[i].d - rawKeys[i].hold - rawKeys[i + 1].hold;
    minTransitionCm = Math.min(minTransitionCm, gap);
  }

  let keys = rawKeys;
  if (draft.closed && rawKeys.length > 0) {
    keys = [
      ...rawKeys.map((k) => ({ ...k, d: k.d - totalLength })),
      ...rawKeys,
      ...rawKeys.map((k) => ({ ...k, d: k.d + totalLength })),
    ].sort((a, b) => a.d - b.d);
  }

  const offsets = cumulative.map((d) => offsetAtDistance(d, keys));
  const centers = frames.map((f, i) => {
    const n = f.normal;
    const o = offsets[i];
    return [f.p[0] + n[0] * o, f.p[1] + n[1] * o, f.p[2] + n[2] * o] as Vec3;
  });

  const tangents: Vec3[] = centers.map((_, i) => {
    if (i === 0) return normalize(sub(centers[1], centers[0]));
    if (i === count - 1) return normalize(sub(centers[i], centers[i - 1]));
    return normalize(sub(centers[i + 1], centers[i - 1]));
  });

  const sides: Vec3[] = tangents.map((t, i) => {
    let s = cross(frames[i].normal, t);
    if (length(s) < 1e-5) {
      s = cross(Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], t);
    }
    return normalize(s);
  });

  const normals: Vec3[] = tangents.map((t, i) => normalize(cross(t, sides[i])));

  const danger = new Array<boolean>(count).fill(false);
  let minRadiusFound = Infinity;
  for (let i = 1; i < count - 1; i += 1) {
    const a = centers[i - 1];
    const b = centers[i];
    const c = centers[i + 1];
    const ab = distance(a, b);
    const bc = distance(b, c);
    const ac = distance(a, c);
    const areaCross = cross(sub(b, a), sub(c, a));
    const crossMag = length(areaCross);
    if (crossMag > 1e-8 && ab > 1e-6 && bc > 1e-6 && ac > 1e-6) {
      const radius = (ab * bc * ac) / (2 * crossMag);
      minRadiusFound = Math.min(minRadiusFound, radius);
      if (radius < minBendRadiusCm) danger[i] = true;
    }
  }
  if (!Number.isFinite(minRadiusFound)) minRadiusFound = 999;

  let dangerLengthCm = 0;
  for (let i = 0; i < count - 1; i += 1) {
    if (danger[i] || danger[i + 1]) dangerLengthCm += cumulative[i + 1] - cumulative[i];
  }

  const hw = draft.widthCm / 2;
  const ht = draft.thicknessCm / 2;
  const vertexCount = count * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normalAttr = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  const textureRepeatCm = 5.5;

  // 0 左上, 1 右上, 2 右下, 3 左下
  const cornerSigns = [
    { side: -1, normal: 1 },
    { side: 1, normal: 1 },
    { side: 1, normal: -1 },
    { side: -1, normal: -1 },
  ];

  for (let i = 0; i < count; i += 1) {
    const c = centers[i];
    const sDir = sides[i];
    const nDir = normals[i];
    const u = cumulative[i] / textureRepeatCm;
    const isDanger = danger[i];
    for (let k = 0; k < 4; k += 1) {
      const idx = i * 4 + k;
      const sg = cornerSigns[k];
      const px = c[0] + sDir[0] * hw * sg.side + nDir[0] * ht * sg.normal;
      const py = c[1] + sDir[1] * hw * sg.side + nDir[1] * ht * sg.normal;
      const pz = c[2] + sDir[2] * hw * sg.side + nDir[2] * ht * sg.normal;
      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;

      const rn = normalize([
        sDir[0] * sg.side * 0.72 + nDir[0] * sg.normal,
        sDir[1] * sg.side * 0.72 + nDir[1] * sg.normal,
        sDir[2] * sg.side * 0.72 + nDir[2] * sg.normal,
      ]);
      normalAttr[idx * 3] = rn[0];
      normalAttr[idx * 3 + 1] = rn[1];
      normalAttr[idx * 3 + 2] = rn[2];

      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = sg.side > 0 ? 1 : 0;

      if (isDanger) {
        colors[idx * 3] = 1;
        colors[idx * 3 + 1] = 0.08;
        colors[idx * 3 + 2] = 0.04;
      } else {
        colors[idx * 3] = 1;
        colors[idx * 3 + 1] = 1;
        colors[idx * 3 + 2] = 1;
      }
    }
  }

  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // 上表面
    indices.push(a + 0, a + 1, b + 1, a + 0, b + 1, b + 0);
    // 右侧面
    indices.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
    // 下表面
    indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
    // 左侧面
    indices.push(a + 3, a + 0, b + 0, a + 3, b + 0, b + 3);
  }

  if (!draft.closed) {
    indices.push(0, 2, 1, 0, 3, 2);
    const last = (count - 1) * 4;
    indices.push(last, last + 1, last + 2, last, last + 2, last + 3);
  }

  return {
    id: draft.id,
    label: draft.label,
    family: draft.family,
    group: draft.group,
    rootNo: draft.rootNo,
    order: draft.order,
    widthCm: draft.widthCm,
    thicknessCm: draft.thicknessCm,
    lengthCm: totalLength,
    cutLengthCm: totalLength * (1 + lossRate),
    danger: danger.some(Boolean),
    dangerLengthCm,
    minRadiusFoundCm: minRadiusFound,
    minTransitionCm: Number.isFinite(minTransitionCm) ? minTransitionCm : 999,
    closed: Boolean(draft.closed),
    offsetKeys: rawKeys.map((k) => ({ d: k.d, value: k.value, holdCm: k.hold, crossingId: k.crossingId })),
    geometry: {
      positions,
      normals: normalAttr,
      uvs,
      colors,
      indices: new Uint32Array(indices),
    },
  };
}

/** 交叉角对应的全高让位保护半长：对方宽度在本篾中心线上的投影。 */
export function holdLengthCm(otherWidthCm: number, angleRad: number): number {
  const sin = Math.max(0.42, Math.abs(Math.sin(angleRad)));
  return otherWidthCm / (2 * sin) + CLEARANCE_CM * 0.6;
}
