import type { ShapeDesign } from '../types';
import { clamp, cross, lerp, mod, normalize, sub, type Vec3 } from './vec';

interface ProfileState {
  v: number;
  y: number;
  r: number;
  square: number;
  s: number;
}

interface SectionTable {
  theta: number[];
  cum: number[];
  perimeter: number;
}

const PROFILE_SAMPLES = 220;
const SECTION_SAMPLES = 160;

/** 分段 PCHIP，保证腹径极值附近不过冲。 */
function makePchip(points: Array<{ x: number; y: number }>) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const n = points.length;
  if (n === 1) return () => ys[0];

  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    h[i] = xs[i + 1] - xs[i] || 1e-6;
    delta[i] = (ys[i + 1] - ys[i]) / h[i];
  }

  const d = new Array<number>(n).fill(0);
  d[0] = delta[0];
  d[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    if (delta[i - 1] * delta[i] <= 0) {
      d[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    }
  }

  return (x: number): number => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i += 1;
    const t = clamp((x - xs[i]) / h[i], 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[i] + h10 * h[i] * d[i] + h01 * ys[i + 1] + h11 * h[i] * d[i + 1];
  };
}

export class BambooSurface {
  readonly shape: ShapeDesign;
  readonly heightCm: number;
  readonly lengthCm: number;
  private readonly profiles: ProfileState[] = [];
  private readonly tables = new Map<number, SectionTable>();
  private readonly radiusAt: (v: number) => number;
  private readonly squareAt: (v: number) => number;

  constructor(shape: ShapeDesign) {
    this.shape = shape;
    this.heightCm = shape.heightCm;
    const sorted = [...shape.points].sort((a, b) => a.v - b.v);
    this.radiusAt = makePchip(sorted.map((p) => ({ x: p.v, y: Math.max(0.05, p.radiusCm) })));
    this.squareAt = makePchip(sorted.map((p) => ({ x: p.v, y: clamp(p.square, 0, 1) })));

    let s = 0;
    let prev: ProfileState | null = null;
    for (let i = 0; i <= PROFILE_SAMPLES; i += 1) {
      const v = i / PROFILE_SAMPLES;
      const y = v * this.heightCm;
      const r = Math.max(0.05, this.radiusAt(v));
      const square = clamp(this.squareAt(v), 0, 1);
      if (prev) s += Math.hypot(y - prev.y, r - prev.r);
      const state: ProfileState = { v, y, r, square, s };
      this.profiles.push(state);
      prev = state;
    }
    this.lengthCm = s;
  }

  profileAtS(s: number): { a: ProfileState; b: ProfileState; t: number } {
    const target = clamp(s, 0, this.lengthCm);
    let lo = 0;
    let hi = this.profiles.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.profiles[mid].s <= target) lo = mid;
      else hi = mid;
    }
    const a = this.profiles[lo];
    const b = this.profiles[Math.min(lo + 1, this.profiles.length - 1)];
    const span = Math.max(1e-8, b.s - a.s);
    return { a, b, t: clamp((target - a.s) / span, 0, 1) };
  }

  stateAtS(s: number): ProfileState {
    const { a, b, t } = this.profileAtS(s);
    return {
      v: lerp(a.v, b.v, t),
      y: lerp(a.y, b.y, t),
      r: lerp(a.r, b.r, t),
      square: lerp(a.square, b.square, t),
      s,
    };
  }

  /** 超椭圆截面：square=0 正圆，square=1 接近方截面。theta 为真实极角。 */
  private superPoint(r: number, square: number, theta: number, y: number): Vec3 {
    const exponent = 2 + square * 4.5;
    const c = Math.cos(theta);
    const z = Math.sin(theta);
    const radial = r / Math.max(1e-6, Math.pow(Math.pow(Math.abs(c), exponent) + Math.pow(Math.abs(z), exponent), 1 / exponent));
    return [radial * c, y, radial * z];
  }

  private sectionTable(index: number): SectionTable {
    const key = clamp(index, 0, PROFILE_SAMPLES);
    const cached = this.tables.get(key);
    if (cached) return cached;

    const p = this.profiles[key];
    const theta: number[] = [];
    const cum: number[] = [];
    let perimeter = 0;
    let prev: Vec3 | null = null;
    for (let i = 0; i <= SECTION_SAMPLES; i += 1) {
      const th = (i / SECTION_SAMPLES) * Math.PI * 2;
      theta.push(th);
      const pt = this.superPoint(p.r, p.square, th, p.y);
      if (prev) perimeter += Math.hypot(pt[0] - prev[0], pt[2] - prev[2]);
      cum.push(perimeter);
      prev = pt;
    }
    const table = { theta, cum, perimeter };
    this.tables.set(key, table);
    return table;
  }

  perimeterAtS(s: number): number {
    const { a, b, t } = this.profileAtS(s);
    return lerp(this.sectionTable(this.profiles.indexOf(a)).perimeter, this.sectionTable(this.profiles.indexOf(b)).perimeter, t);
  }

  private thetaForFractionInTable(table: SectionTable, fraction: number): number {
    const f = mod(fraction, 1);
    const target = f * table.perimeter;
    let lo = 0;
    let hi = SECTION_SAMPLES;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (table.cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const c0 = table.cum[lo];
    const c1 = table.cum[lo + 1] ?? table.perimeter;
    const t = clamp((target - c0) / Math.max(1e-8, c1 - c0), 0, 1);
    return lerp(table.theta[lo], table.theta[lo + 1] ?? Math.PI * 2, t);
  }

  /**
   * @param u 截面周长比例，0..1 循环。用周长比例而不是固定 θ，
   * 方底/圆口变化时每一圈的篾片仍按真实周长均布。
   */
  pointSU(s: number, u: number): Vec3 {
    const { a, b, t } = this.profileAtS(s);
    const ia = this.profiles.indexOf(a);
    const ib = Math.min(ia + 1, PROFILE_SAMPLES);
    const ta = this.thetaForFractionInTable(this.sectionTable(ia), u);
    const tb = this.thetaForFractionInTable(this.sectionTable(ib), u);
    const theta = lerp(ta, tb, t);
    const r = lerp(a.r, b.r, t);
    const square = lerp(a.square, b.square, t);
    const y = lerp(a.y, b.y, t);
    return this.superPoint(r, square, theta, y);
  }

  pointSTheta(s: number, theta: number): Vec3 {
    const p = this.stateAtS(s);
    return this.superPoint(p.r, p.square, theta, p.y);
  }

  frameSTheta(s: number, theta: number): { p: Vec3; normal: Vec3; tangentS: Vec3; tangentTheta: Vec3 } {
    const epsS = 0.025;
    const epsT = 0.002;
    const p = this.pointSTheta(s, theta);
    const s0 = clamp(s - epsS, 0, this.lengthCm);
    const s1 = clamp(s + epsS, 0, this.lengthCm);
    const tangentS = normalize(sub(this.pointSTheta(s1, theta), this.pointSTheta(s0, theta)));
    const tangentTheta = normalize(sub(this.pointSTheta(s, theta + epsT), this.pointSTheta(s, theta - epsT)));
    let normal = normalize(cross(tangentS, tangentTheta));
    const radial: Vec3 = [p[0], 0, p[2]];
    if (radial[0] !== 0 || radial[2] !== 0) {
      if (normal[0] * radial[0] + normal[2] * radial[2] < 0) normal = [-normal[0], normal[1], -normal[2]];
    } else if (normal[1] < 0) {
      normal = [0, 1, 0];
    }
    return { p, normal, tangentS, tangentTheta };
  }

  frameSU(s: number, u: number): { p: Vec3; normal: Vec3; tangentS: Vec3; tangentU: Vec3 } {
    const epsS = 0.025;
    const epsU = 0.0015;
    const p = this.pointSU(s, u);
    const s0 = clamp(s - epsS, 0, this.lengthCm);
    const s1 = clamp(s + epsS, 0, this.lengthCm);
    const tangentS = normalize(sub(this.pointSU(s1, u), this.pointSU(s0, u)));
    const tangentU = normalize(sub(this.pointSU(s, u + epsU), this.pointSU(s, u - epsU)));
    let normal = normalize(cross(tangentS, tangentU));
    const radial: Vec3 = [p[0], 0, p[2]];
    if (radial[0] !== 0 || radial[2] !== 0) {
      if (normal[0] * radial[0] + normal[2] * radial[2] < 0) normal = [-normal[0], normal[1], -normal[2]];
    } else if (normal[1] < 0) {
      normal = [0, 1, 0];
    }
    return { p, normal, tangentS, tangentU };
  }

  /** 底部平面（菊花底）使用的点，y=0。 */
  bottomPoint(radiusCm: number, theta: number, yOffset = 0): Vec3 {
    const bottom = this.profiles[0];
    return this.superPoint(Math.max(0, radiusCm), bottom.square, theta, yOffset);
  }

  get bottomRadiusCm(): number {
    return this.profiles[0].r;
  }

  get mouthState(): ProfileState {
    return this.profiles[this.profiles.length - 1];
  }
}
