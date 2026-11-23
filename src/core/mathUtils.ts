import type { Vec3 } from '../types';

export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** 平滑包络:u=0 为 1,u=1 为 0,cos 型,用于挑压偏移在交叉点之间的过渡 */
export function envelope(u: number): number {
  const x = clamp(Math.abs(u), 0, 1);
  return 0.5 * (1 + Math.cos(Math.PI * x));
}

/** Hermite 插值 */
export function hermite(
  p0: number,
  m0: number,
  p1: number,
  m1: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * p1 +
    (t3 - t2) * m1
  );
}

export const vAdd = (a: Vec3, b: Vec3): Vec3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const vSub = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const vScale = (a: Vec3, s: number): Vec3 => [
  a[0] * s,
  a[1] * s,
  a[2] * s,
];
export const vDot = (a: Vec3, b: Vec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vLen = (a: Vec3): number =>
  Math.hypot(a[0], a[1], a[2]);
export const vNorm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * 三点弯曲半径,Menger 曲率法:
 * κ = 4·三角形面积 / (a·b·c),R = 1/κ。
 * 对密集采样的数值法向噪声不敏感(纯几何量,不依赖切向差分)。
 * 三点共线时面积为 0 → 返回 Infinity。
 */
export function bendRadius(
  prev: Vec3,
  cur: Vec3,
  next: Vec3,
): number {
  const a = Math.hypot(
    prev[0] - cur[0],
    prev[1] - cur[1],
    prev[2] - cur[2],
  );
  const b = Math.hypot(
    cur[0] - next[0],
    cur[1] - next[1],
    cur[2] - next[2],
  );
  const c = Math.hypot(
    prev[0] - next[0],
    prev[1] - next[1],
    prev[2] - next[2],
  );
  // Heron 公式求面积
  const s = (a + b + c) / 2;
  const areaSq = s * (s - a) * (s - b) * (s - c);
  if (areaSq <= 1e-12) return Infinity;
  const area = Math.sqrt(areaSq);
  const denom = a * b * c;
  if (denom < 1e-9) return Infinity;
  return denom / (4 * area);
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** 角度差(带符号),结果 -π~π */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
