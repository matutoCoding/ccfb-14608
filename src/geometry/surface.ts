import * as THREE from 'three';
import type { CrossSection, VesselProfile } from '../types';

const U_GRID = 96;
const T_GRID = 120;

/**
 * 器型曲面:以 (u, t) 参数化的超椭圆回转体,带规则网格预计算。
 * u: 周向角 0..2π;t: 高度方向 0(底)..1(口)
 * 超椭圆指数 n=2 为圆,n→1 为圆角方形,可沿高度渐变 → 方底圆口
 */
export class VesselSurface {
  readonly profile: VesselProfile;
  readonly sections: CrossSection[];
  /** 位置网格 [t][u] → Vector3 */
  private grid: THREE.Vector3[][] = [];
  /** 各 t 行周长 */
  private perimeters: number[] = [];
  /** 子午线累积弧长(按 t 网格) */
  private meridianArc: number[] = [];
  /** u 网格的单位角度步长 */
  private du = (Math.PI * 2) / U_GRID;

  constructor(profile: VesselProfile) {
    this.profile = profile;
    this.sections = profile.sections.length >= 2
      ? [...profile.sections].sort((a, b) => a.t - b.t)
      : this.defaultSections(profile);
    this.buildGrid();
  }

  private defaultSections(p: VesselProfile): CrossSection[] {
    return [
      { t: 0, diameter: p.baseDiameter, superN: p.baseSuperN },
      { t: p.bellyTRatio, diameter: p.bellyDiameter, superN: 2 },
      { t: 1, diameter: p.mouthDiameter, superN: p.mouthSuperN },
    ];
  }

  private interp(t: number, key: 'diameter' | 'superN'): number {
    const s = this.sections;
    if (t <= s[0].t) return s[0][key];
    const last = s[s.length - 1];
    if (t >= last.t) return last[key];
    let i = 0;
    while (i < s.length - 1 && s[i + 1].t < t) i++;
    const a = s[i];
    const b = s[i + 1];
    const span = Math.max(1e-9, b.t - a.t);
    const x = (t - a.t) / span;
    const p0 = s[Math.max(0, i - 1)][key];
    const p1 = a[key];
    const p2 = b[key];
    const p3 = s[Math.min(s.length - 1, i + 2)][key];
    const m1 = (p2 - p0) / 2;
    const m2 = (p3 - p1) / 2;
    const h00 = 2 * x ** 3 - 3 * x ** 2 + 1;
    const h10 = x ** 3 - 2 * x ** 2 + x;
    const h01 = -2 * x ** 3 + 3 * x ** 2;
    const h11 = x ** 3 - x ** 2;
    return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
  }

  radiusAt(t: number): number {
    return Math.max(0.5, this.interp(t, 'diameter') / 2);
  }

  get height(): number {
    return this.profile.height;
  }

  /** 精确曲面点(用于网格构建) */
  pointExact(u: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const r = Math.max(0.5, this.interp(t, 'diameter') / 2);
    const n = this.interp(t, 'superN');
    const e = 2 / n;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const x = r * Math.sign(cu) * Math.pow(Math.abs(cu), e);
    const z = r * Math.sign(su) * Math.pow(Math.abs(su), e);
    return out.set(x, t * this.height, z);
  }

  private buildGrid() {
    for (let j = 0; j <= T_GRID; j++) {
      const t = j / T_GRID;
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= U_GRID; i++) {
        row.push(this.pointExact((i / U_GRID) * Math.PI * 2, t));
      }
      this.grid.push(row);
      // 周长由网格边累加
      let len = 0;
      for (let i = 0; i < U_GRID; i++) len += row[i].distanceTo(row[i + 1]);
      this.perimeters.push(len);
    }
    // 子午线弧长(u=0 列)
    this.meridianArc = [0];
    for (let j = 1; j <= T_GRID; j++) {
      this.meridianArc[j] = this.meridianArc[j - 1] + this.grid[j][0].distanceTo(this.grid[j - 1][0]);
    }
  }

  /** 网格插值取点(热路径,无二分、无三角函数) */
  pointAt(u: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const fi = THREE.MathUtils.clamp(u / this.du, 0, U_GRID - 1e-6);
    const fj = THREE.MathUtils.clamp(t * T_GRID, 0, T_GRID - 1e-6);
    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const a = fi - i0;
    const b = fj - j0;
    const p00 = this.grid[j0][i0];
    const p10 = this.grid[j0][i0 + 1];
    const p01 = this.grid[j0 + 1][i0];
    const p11 = this.grid[j0 + 1][i0 + 1];
    out.set(
      lerp4(p00.x, p10.x, p01.x, p11.x, a, b),
      lerp4(p00.y, p10.y, p01.y, p11.y, a, b),
      lerp4(p00.z, p10.z, p01.z, p11.z, a, b),
    );
    return out;
  }

  /** 网格差分标架:法线 / 周向切向(宽向) */
  frameAt(u: number, t: number, out: { normal: THREE.Vector3; tangentU: THREE.Vector3 }): void {
    const fi = THREE.MathUtils.clamp(u / this.du, 1, U_GRID - 1.001);
    const fj = THREE.MathUtils.clamp(t * T_GRID, 1, T_GRID - 1.001);
    const i0 = Math.floor(fi);
    const j0 = Math.floor(fj);
    const pU0 = this.grid[j0][i0 - 1];
    const pU1 = this.grid[j0][i0 + 1];
    const pT0 = this.grid[j0 - 1][i0];
    const pT1 = this.grid[j0 + 1][i0];
    const du = tmp1.set(pU1.x - pU0.x, pU1.y - pU0.y, pU1.z - pU0.z);
    const dt = tmp2.set(pT1.x - pT0.x, pT1.y - pT0.y, pT1.z - pT0.z);
    out.normal.crossVectors(du, dt).normalize();
    out.tangentU.copy(du).normalize();
  }

  perimeterAt(t: number): number {
    const fj = THREE.MathUtils.clamp(t, 0, 1) * T_GRID;
    const j0 = Math.min(T_GRID - 1, Math.floor(fj));
    const b = fj - j0;
    return this.perimeters[j0] * (1 - b) + this.perimeters[j0 + 1] * b;
  }

  get totalMeridianLength(): number {
    return this.meridianArc[T_GRID];
  }

  /** 子午弧长 → t(线性扫描 + 插值,无二分) */
  tFromArc(arc: number): number {
    const arr = this.meridianArc;
    let j = 1;
    while (j < T_GRID && arr[j] < arc) j++;
    const span = arr[j] - arr[j - 1] || 1e-9;
    const b = (arc - arr[j - 1]) / span;
    return (j - 1 + b) / T_GRID;
  }

  /** 周向弧长 → 角度 u(按行周长线性映射) */
  uFromArc(t: number, arc: number): number {
    const per = this.perimeterAt(t);
    const frac = ((arc % per) + per) % per / per;
    return frac * Math.PI * 2;
  }

  mouthPoint(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.pointAt(u, 1, out);
  }

  mouthFrame(u: number, out: { normal: THREE.Vector3; tangentU: THREE.Vector3 }): void {
    this.frameAt(u, 1, out);
  }
}

const tmp1 = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function lerp4(x00: number, x10: number, x01: number, x11: number, a: number, b: number): number {
  return x00 * (1 - a) * (1 - b) + x10 * a * (1 - b) + x01 * (1 - a) * b + x11 * a * b;
}
