import type { Vec3, VesselSpec } from '../types';
import { TAU, clamp, hermite, lerp, vNorm, vCross } from './mathUtils';

/**
 * 器型曲面:参数 (t, θ),t∈[0,1] 从底到口,θ∈[0,2π)。
 * 半径由 底径/腹径/口径 三点 Hermite 插值;截面为超椭圆,
 * 指数从底到口平滑过渡 → 方底圆口等变截面。
 */
export class VesselSurface {
  readonly spec: VesselSpec;
  private perimeterCache = new Map<number, number>();

  constructor(spec: VesselSpec) {
    this.spec = spec;
  }

  /** 某高度比例处的水平轮廓半径 r(t) */
  radiusAt(t: number): number {
    const s = this.spec;
    const tb = clamp(s.bellyT, 0.02, 0.98);
    const r0 = s.bottomDiameter / 2;
    const rb = s.bellyDiameter / 2;
    const r1 = s.mouthDiameter / 2;
    if (t <= tb) {
      const u = t / tb;
      // 底、腹两端水平切线(斜率 0),中间段 secant
      const m1 = (rb - r0) / tb;
      return hermite(r0, 0, rb, m1, u);
    }
    const u = (t - tb) / (1 - tb);
    const m1 = (r1 - rb) / (1 - tb);
    return hermite(rb, (rb - r0) / tb, r1, 0, u);
  }

  /** 超椭圆指数 n(t):底 → 口 */
  exponentAt(t: number): number {
    return lerp(this.spec.bottomExponent, this.spec.mouthExponent, t);
  }

  /** 超椭圆截面点(单位方向),n 越大越方 */
  private superellipse(theta: number, n: number): [number, number] {
    const e = 2 / n;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    return [
      Math.sign(ct) * Math.pow(Math.abs(ct), e),
      Math.sign(st) * Math.pow(Math.abs(st), e),
    ];
  }

  /** 曲面位置 P(t, θ) */
  point(t: number, theta: number): Vec3 {
    const r = this.radiusAt(t);
    const n = this.exponentAt(t);
    const [sx, sz] = this.superellipse(theta, n);
    return [r * sx, t * this.spec.height, r * sz];
  }

  /** 数值法向:对 t、θ 求偏导叉积,朝外 */
  normal(t: number, theta: number): Vec3 {
    const e = 1e-4;
    const t0 = clamp(t - e, 0, 1);
    const t1 = clamp(t + e, 0, 1);
    const pt = [
      (this.point(t1, theta)[0] - this.point(t0, theta)[0]) / (t1 - t0 || 1),
      (this.point(t1, theta)[1] - this.point(t0, theta)[1]) / (t1 - t0 || 1),
      (this.point(t1, theta)[2] - this.point(t0, theta)[2]) / (t1 - t0 || 1),
    ] as Vec3;
    const pth0 = this.point(t, theta - e);
    const pth1 = this.point(t, theta + e);
    const pth = [
      (pth1[0] - pth0[0]) / (2 * e),
      (pth1[1] - pth1[1]) / (2 * e) || 0,
      (pth1[2] - pth0[2]) / (2 * e),
    ] as Vec3;
    return vNorm(vCross(pth, pt));
  }

  /** 超椭圆截面周长(数值积分,按 t 缓存) */
  perimeterAt(t: number): number {
    const key = Math.round(t * 200);
    const hit = this.perimeterCache.get(key);
    if (hit !== undefined) return hit;
    const n = this.exponentAt(t);
    const r = this.radiusAt(t);
    const N = 128;
    let len = 0;
    let prev = this.superellipse(0, n);
    for (let i = 1; i <= N; i++) {
      const cur = this.superellipse((i / N) * TAU, n);
      len += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      prev = cur;
    }
    const p = len * r;
    this.perimeterCache.set(key, p);
    return p;
  }

  /**
   * 展开平面(θ→周向弧长 u,t→高度弧长 v)映回曲面。
   * u: 距某 θ 起点的弧长;v: 高度比例 t。
   */
  mapFromDeveloped(u: number, t: number, theta0 = 0): {
    p: Vec3;
    n: Vec3;
    theta: number;
  } {
    const p = this.perimeterAt(t);
    const theta = theta0 + TAU * (u / p);
    return { p: this.point(t, theta), n: this.normal(t, theta), theta };
  }

  /** 沿 t 方向(高度)走弧长,返回新的 t;dt 以高度 mm 计 */
  tFromHeight(dy: number): number {
    return clamp(dy / this.spec.height, 0, 1);
  }

  /** 给中心线点配篾片局部标架:widthDir=沿 θ 切向,tangent=沿 t,normal=面法向 */
  frame(t: number, theta: number): {
    center: Vec3;
    normal: Vec3;
    widthDir: Vec3;
    tangent: Vec3;
  } {
    const e = 1e-4;
    const a = this.point(t, theta - e);
    const b = this.point(t, theta + e);
    const widthDir = vNorm([b[0] - a[0], 0, b[2] - a[2]]);
    const normal = this.normal(t, theta);
    const tangent = vNorm([
      widthDir[2] * normal[1] - widthDir[1] * normal[2],
      widthDir[0] * normal[2] - widthDir[2] * normal[0],
      widthDir[1] * normal[0] - widthDir[0] * normal[1],
    ]);
    return { center: this.point(t, theta), normal, widthDir, tangent };
  }

  /** 底平面上的点(用于菊花底),radial∈[0,1],theta 角度 */
  bottomPoint(radial: number, theta: number): Vec3 {
    const r = this.radiusAt(0) * radial;
    const n = this.exponentAt(0);
    const [sx, sz] = this.superellipse(theta, n);
    return [r * sx, 0, r * sz];
  }

  bottomNormal(): Vec3 {
    return [0, 1, 0];
  }
}
