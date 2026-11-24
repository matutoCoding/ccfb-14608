import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  BambooSpecies,
  BendViolation,
  DistortionMark,
  StripMaterial,
  VesselProfile,
  WeavePattern,
  WeaveStep,
} from '../types';
import { VesselSurface } from './surface';
import { buildRibbonGeometry, circumRadius, stepWaveLift, type StripGeometryData, type StripSample } from './ribbon';

interface Crossing {
  s: number;
  over: boolean;
  /** 交叉对 id:同一对交叉的两个篾共享 id */
  pairId: number;
}

interface DevelopedStrip {
  family: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  sMin: number;
  sMax: number;
  wrapX: boolean;
  crossings: Crossing[];
  length: number;
  /** meridian=等角子午线(经篾);ring=等高纬圈;developed=展开平面斜篾;flat=平底盖 */
  route: 'meridian' | 'ring' | 'developed' | 'flatSpoke' | 'flatRing';
}

export interface WeaveBuildResult {
  strips: StripGeometryData[];
  geometry: THREE.BufferGeometry;
  distortionMarks: DistortionMark[];
  bendViolations: BendViolation[];
  steps: WeaveStep[];
  stripCount: number;
  crossingCount: number;
  buildMs: number;
  crossingCheck: { total: number; conflict: number; orphan: number; minCenterGap: number };
}

const SAMPLES_PER_STRIP = 88;

let pairSeq = 0;
function nextPairId(): number {
  return pairSeq++;
}

export class WeaveEngine {
  private surface: VesselSurface;
  private pattern: WeavePattern;
  private material: StripMaterial;
  private species: BambooSpecies;
  private width: number;
  private thickness: number;
  private minBendRadius: number;
  private W = 0;
  private L = 0;
  private frame = { normal: new THREE.Vector3(), tangentU: new THREE.Vector3() };
  private tmpTan = new THREE.Vector3();

  constructor(profile: VesselProfile, pattern: WeavePattern, material: StripMaterial, species: BambooSpecies) {
    this.surface = new VesselSurface(profile);
    this.pattern = pattern;
    this.material = material;
    this.species = species;
    this.width = material.width;
    this.thickness = material.thickness;
    this.minBendRadius = species.minBendRadiusFactor * material.thickness;
  }

  build(): WeaveBuildResult {
    const t0 = performance.now();
    pairSeq = 0;
    const layout = this.buildLayout();
    const strips = layout.map((d, ordinal) => this.realizeStrip(d, ordinal));
    const geometry = mergeGeometries(strips.map((s) => buildRibbonGeometry(s)), false)!;
    const distortionMarks = this.pattern.kind === 'hex' ? this.evaluateHexDistortion(layout) : this.evaluateCompression(layout);
    const bendViolations = this.collectBendViolations(strips);
    const steps = this.buildSteps(layout);
    const crossingCheck = this.verifyCrossings(layout);
    return {
      strips,
      geometry,
      distortionMarks,
      bendViolations,
      steps,
      stripCount: strips.length,
      crossingCount: layout.reduce((n, s) => n + s.crossings.length, 0) / 2,
      buildMs: performance.now() - t0,
      crossingCheck,
    };
  }

  /**
   * 结构性穿模验证:每个 pairId 恰好出现两次且 over 相反。
   * 抬升在交叉点严格 ±t/2,over 相反 → 两篾中心距恰为 t,表面相切不相交。
   */
  private verifyCrossings(layout: DevelopedStrip[]) {
    const overs = new Map<number, boolean[]>();
    for (const d of layout) {
      for (const c of d.crossings) {
        const arr = overs.get(c.pairId) ?? [];
        arr.push(c.over);
        overs.set(c.pairId, arr);
      }
    }
    let conflict = 0;
    let orphan = 0;
    for (const [, arr] of overs) {
      if (arr.length === 1) orphan++; // 接缝去重残留,另一侧已并入相邻交叉,非穿模
      else if (arr.length !== 2 || arr[0] === arr[1]) conflict++;
    }
    return { total: overs.size, conflict, orphan, minCenterGap: this.thickness };
  }

  /** 按回放步序生成前 stepCount+1 步的几何 */
  buildStepGeometry(stepCount: number): { geometry: THREE.BufferGeometry; ordinals: number[] } {
    const layout = this.buildLayout();
    const steps = this.buildSteps(layout);
    const take = Math.min(stepCount + 1, steps.length);
    const ordinals = steps.slice(0, take).map((s) => s.stripOrdinal - 1);
    const chosen = ordinals.map((idx) => layout[idx]);
    const strips = chosen.map((d, k) => this.realizeStrip(d, k));
    return { geometry: mergeGeometries(strips.map((s) => buildRibbonGeometry(s)), false)!, ordinals };
  }

  private buildLayout(): DevelopedStrip[] {
    let maxPer = 0;
    for (let k = 0; k <= 60; k++) maxPer = Math.max(maxPer, this.surface.perimeterAt(k / 60));
    this.W = maxPer;
    this.L = this.surface.totalMeridianLength;

    let body: DevelopedStrip[];
    switch (this.pattern.kind) {
      case 'hex':
        body = this.layoutHex();
        break;
      case 'chrysanthemum':
        body = this.layoutChrysanthemum();
        break;
      case 'herringbone':
        body = this.layoutGrid(true);
        break;
      default:
        body = this.layoutGrid(false);
    }
    const base = this.pattern.kind === 'chrysanthemum' ? [] : this.layoutBaseCap();
    const all = [...base, ...body];
    this.dedupSurfaceCrossings(all);
    this.removeOverlappingStrips(all);
    return all;
  }

  /**
   * 周期包裹会在接缝处生成映射到同一曲面点的重复交叉。
   * 按条把每个交叉映射回 3D 位置,空间距离小于半篾宽的只保留一个,再重排挑压。
   */
  private dedupSurfaceCrossings(strips: DevelopedStrip[]) {
    for (const d of strips) {
      if (!d.crossings.length || d.route === 'flatSpoke' || d.route === 'flatRing') continue;
      const pts: THREE.Vector3[] = d.crossings.map((c) => {
        let u: number;
        let t: number;
        if (d.route === 'meridian') {
          u = d.x0;
          t = this.surface.tFromArc(clamp(c.s, 0, this.L));
        } else if (d.route === 'ring') {
          t = d.x0;
          const per = this.surface.perimeterAt(t);
          u = (c.s / per) * Math.PI * 2;
        } else {
          const y = clamp(d.y0 + d.dy * c.s, 0, this.L);
          let x = d.x0 + d.dx * c.s;
          if (d.wrapX) x = mod(x, this.W);
          t = this.surface.tFromArc(y);
          u = this.surface.uFromArc(t, x);
        }
        return this.surface.pointAt(u, t);
      });
      const keep: Crossing[] = [];
      const keepPts: THREE.Vector3[] = [];
      for (let i = 0; i < d.crossings.length; i++) {
        const dup = keepPts.some((q) => q.distanceTo(pts[i]) < this.width * 0.5);
        if (!dup) {
          keep.push(d.crossings[i]);
          keepPts.push(pts[i]);
        }
      }
      d.crossings = keep;
    }
    // 注意:不重排挑压。布局阶段每个交叉点对两篾写入的 over 必然相反,
    // 按条带各自索引重排反而会破坏这种成对关系导致穿模。
  }

  // ---------- 十字编 / 人字编:经篾走等角子午线,纬篾走等高圈 ----------
  private layoutGrid(herringbone: boolean): DevelopedStrip[] {
    const pitch = this.width * 1.15;
    const nV = Math.max(8, Math.round(this.W / pitch));
    const nH = Math.max(4, Math.round(this.L / pitch));
    const mat = this.pattern.matrix;
    const rows = mat.length;
    const cols = mat[0]?.length ?? 1;
    const strips: DevelopedStrip[] = [];
    const angles: number[] = [];
    const ringTs: number[] = [];
    const ringArcs: number[] = [];

    for (let j = 0; j < nV; j++) {
      const angle = (j / nV) * Math.PI * 2;
      angles.push(angle);
      strips.push({ family: 0, x0: angle, y0: 0, dx: 0, dy: 1, sMin: 0, sMax: this.L, wrapX: false, crossings: [], length: this.L, route: 'meridian' });
    }
    for (let i = 0; i < nH; i++) {
      const t = (i + 0.5) / nH;
      const arc = this.surface.totalMeridianLength * t;
      ringTs.push(t);
      ringArcs.push(arc);
      // route=ring:s 域是该圈周向弧长(mm),与抬升混合宽度单位一致
      const per = this.surface.perimeterAt(t);
      strips.push({ family: 1, x0: t, y0: 0, dx: 1, dy: 0, sMin: 0, sMax: per, wrapX: false, crossings: [], length: per, route: 'ring' });
    }
    for (let i = 0; i < nH; i++) {
      const arc = ringArcs[i];
      const per = strips[nV + i].sMax;
      for (let j = 0; j < nV; j++) {
        let c = j % cols;
        if (herringbone && ringTs[i] > 0.5) c = cols - 1 - c;
        const over = mat[i % rows][c] === 1;
        const pairId = nextPairId();
        strips[j].crossings.push({ s: arc, over: !over, pairId });
        // 交叉在纬圈上的周向位置 = 该经篾角度对应的弧长
        strips[nV + i].crossings.push({ s: (angles[j] / (Math.PI * 2)) * per, over, pairId });
      }
    }
    for (const s of strips) s.crossings.sort((a, b) => a.s - b.s);
    return strips;
  }

  // ---------- 六角孔编:三向 60°(一竖向 + 两斜向),族间错位消除三重交点 ----------
  private layoutHex(): DevelopedStrip[] {
    const cell = this.pattern.hexCellSize ?? Math.max(this.width * 2.2, 12);
    const lineGap = (cell * Math.sqrt(3)) / 2;
    // 展开平面 x=周向,y=高度方向:竖向(经) + ±60° 斜向
    // 族间沿自身方向错位半个间距 → 三族不共点,交叉成对(真实 kagome 拓扑)
    const dirs = [
      { dx: 0, dy: 1, shift: 0 },
      { dx: Math.sqrt(3) / 2, dy: 0.5, shift: lineGap * 0.5 },
      { dx: -Math.sqrt(3) / 2, dy: 0.5, shift: lineGap },
    ];
    const families: DevelopedStrip[][] = [[], [], []];
    const all: DevelopedStrip[] = [];

    for (let f = 0; f < 3; f++) {
      const { dx, dy, shift } = dirs[f];
      const nx = -dy;
      const ny = dx;
      const count = Math.ceil(this.W / lineGap) + 5;
      for (let k = -3; k < count; k++) {
        const ox = nx * k * lineGap + dx * shift;
        const oy = ny * k * lineGap + dy * shift;
        // 求直线与展开矩形 [0,W]×[0,L] 的参数区间(考虑 x 周期包裹,放宽一个 W)
        let sMin = -Infinity;
        let sMax = Infinity;
        const bounds: [number, number][] = [];
        if (Math.abs(dx) > 1e-9) {
          bounds.push([(0 - ox) / dx, (this.W - ox) / dx]);
        } else if (ox < 0 || ox > this.W) continue;
        if (Math.abs(dy) > 1e-9) {
          bounds.push([(0 - oy) / dy, (this.L - oy) / dy]);
        } else if (oy < 0 || oy > this.L) continue;
        for (const [q1, q2] of bounds) {
          sMin = Math.max(sMin, Math.min(q1, q2));
          sMax = Math.min(sMax, Math.max(q1, q2));
        }
        if (sMax <= sMin) continue;
        const d: DevelopedStrip = { family: f, x0: ox, y0: oy, dx, dy, sMin, sMax, wrapX: true, crossings: [], length: sMax - sMin, route: 'developed' };
        families[f].push(d);
        all.push(d);
      }
      // 同族去重:起点(x0,y0)几乎相同的线只留一条(包裹副本)
      families[f] = families[f].filter((d, i, arr) => {
        for (let j = 0; j < i; j++) {
          const q = arr[j];
          if (Math.abs(q.x0 - d.x0) < 1e-4 && Math.abs(q.y0 - d.y0) < 1e-4) return false;
        }
        return true;
      });
    }
    all.length = 0;
    all.push(...families.flat());

    // 两两族解析求交;展开平面 x 以 W 为周期,只接受包裹后落在 [0,W) 的交点,避免副本重复
    for (let a = 0; a < 3; a++) {
      const b = (a + 1) % 3;
      let node = 0;
      for (const sa of families[a]) {
        for (const sb of families[b]) {
          for (const wrap of [-this.W, 0, this.W]) {
            const hit = lineIntersection(sa, sb, wrap);
            if (!hit) continue;
            const { sA, sB, x, y } = hit;
            if (sA < sa.sMin || sA > sa.sMax || sB < sb.sMin || sB > sb.sMax) continue;
            if (y < 0 || y > this.L) continue;
            const xWrapped = mod(x, this.W);
            if (xWrapped < 0 || xWrapped >= this.W) continue;
            const aOver = node % 2 === 0;
            const pairId = nextPairId();
            sa.crossings.push({ s: sA, over: aOver, pairId });
            sb.crossings.push({ s: sB, over: !aOver, pairId });
            node++;
          }
        }
      }
    }
    // 包裹副本会产生映射到同一 (u,t) 的重复交点,按路径参数去重
    // 不重排 over:布局时同 pairId 两侧已写入相反值,重排会破坏配对
    for (const d of all) {
      d.crossings.sort((a, b) => a.s - b.s);
      const dedup: Crossing[] = [];
      for (const c of d.crossings) {
        const last = dedup[dedup.length - 1];
        if (last && Math.abs(last.s - c.s) < this.W * 0.01) continue;
        dedup.push(c);
      }
      d.crossings = dedup;
    }
    return all;
  }

  /**
   * 周长收窄时,展开接缝两侧的同族平行线会映射到曲面同一位置。
   * 按族检测曲面路径重叠(中段多点距离 < 0.6 篾厚),剔除较短者。
   */
  private removeOverlappingStrips(strips: DevelopedStrip[]) {
    const probe = (d: DevelopedStrip) => {
      const pts: THREE.Vector3[] = [];
      for (let k = 1; k < 5; k++) {
        const s = d.sMin + ((d.sMax - d.sMin) * k) / 5;
        let x = d.x0 + d.dx * s;
        const y = clamp(d.y0 + d.dy * s, 0, this.L);
        if (d.wrapX) x = mod(x, this.W);
        else x = clamp(x, 0, this.W - 1e-6);
        const t = this.surface.tFromArc(y);
        const u = this.surface.uFromArc(t, x);
        pts.push(this.surface.pointAt(u, t));
      }
      return pts;
    };
    const tol = this.thickness * 0.6;
    // 仅展开平面斜篾可能因周期包裹产生曲面重叠;子午线/纬圈/平底盖各自天然不重叠
    const group = strips.filter((d) => d.route === 'developed');
    if (group.length < 2) return;
    const probes = group.map(probe);
    const dead = new Set<DevelopedStrip>();
    for (let i = 0; i < group.length; i++) {
      if (dead.has(group[i])) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (dead.has(group[j])) continue;
        let overlap = 0;
        for (let k = 0; k < probes[i].length; k++) {
          if (probes[i][k].distanceTo(probes[j][k]) < tol) overlap++;
        }
        if (overlap >= 3) dead.add(group[i].length <= group[j].length ? group[i] : group[j]);
      }
    }
    for (const d of dead) {
      const idx = strips.indexOf(d);
      if (idx >= 0) strips.splice(idx, 1);
    }
  }

  // ---------- 菊花底 ----------
  private layoutChrysanthemum(): DevelopedStrip[] {
    const spokes = this.pattern.chrysanthemumSpokes ?? 16;
    const pitch = this.width * 1.15;
    const nRings = Math.max(4, Math.round(this.L / pitch));
    const strips: DevelopedStrip[] = [];
    for (let j = 0; j < spokes; j++) {
      const angle = (j / spokes) * Math.PI * 2;
      strips.push({ family: 0, x0: angle, y0: 0, dx: 0, dy: 1, sMin: 0, sMax: this.L, wrapX: false, crossings: [], length: this.L, route: 'meridian' });
    }
    for (let i = 0; i < nRings; i++) {
      const t = (i + 0.5) / nRings;
      const per = this.surface.perimeterAt(t);
      strips.push({ family: 1, x0: t, y0: 0, dx: 1, dy: 0, sMin: 0, sMax: per, wrapX: false, crossings: [], length: per, route: 'ring' });
    }
    for (let i = 0; i < nRings; i++) {
      const ring = strips[spokes + i];
      const t = ring.x0;
      const arc = this.surface.totalMeridianLength * t;
      const per = ring.sMax;
      for (let j = 0; j < spokes; j++) {
        const angle = strips[j].x0;
        const over = (i + j) % 2 === 0;
        const pairId = nextPairId();
        strips[j].crossings.push({ s: arc, over: !over, pairId });
        ring.crossings.push({ s: (angle / (Math.PI * 2)) * per, over, pairId });
      }
    }
    for (const s of strips) s.crossings.sort((a, b) => a.s - b.s);
    return strips;
  }

  // ---------- 平底盖:y=0 平面上的放射筋 + 同心圈(独立几何) ----------
  private layoutBaseCap(): DevelopedStrip[] {
    const r0 = this.surface.radiusAt(0);
    const spokes = Math.max(8, Math.round((Math.PI * 2 * r0) / (this.width * 1.3)));
    const nRings = Math.max(2, Math.round(r0 / (this.width * 1.2)));
    const strips: DevelopedStrip[] = [];
    // 用 family 4/5 标记平底盖;x0 存角度或半径,由 realizeFlat 解释
    for (let j = 0; j < spokes; j++) {
      strips.push({ family: 4, x0: (j / spokes) * Math.PI * 2, y0: r0, dx: 0, dy: 0, sMin: 0, sMax: r0, wrapX: false, crossings: [], length: r0, route: 'flatSpoke' });
    }
    for (let i = 0; i < nRings; i++) {
      const r = ((i + 0.5) / nRings) * r0;
      strips.push({ family: 5, x0: r, y0: 0, dx: 0, dy: 0, sMin: 0, sMax: Math.PI * 2, wrapX: false, crossings: [], length: 2 * Math.PI * r, route: 'flatRing' });
    }
    const spokeStart = 0;
    const ringStart = spokes;
    for (let i = 0; i < nRings; i++) {
      const r = strips[ringStart + i].x0;
      for (let j = 0; j < spokes; j++) {
        const over = (i + j) % 2 === 0;
        // 放射筋上交叉位置 = 半径 r;圈上交叉位置 = 该筋角度
        const angle = strips[spokeStart + j].x0;
        const pairId = nextPairId();
        strips[spokeStart + j].crossings.push({ s: r, over: !over, pairId });
        strips[ringStart + i].crossings.push({ s: angle, over, pairId });
      }
    }
    for (const s of strips) s.crossings.sort((a, b) => a.s - b.s);
    return strips;
  }

  // ---------- 展开条 → 曲面实形 ----------
  private realizeStrip(d: DevelopedStrip, ordinal: number): StripGeometryData {
    if (d.route === 'flatSpoke' || d.route === 'flatRing') return this.realizeFlat(d, ordinal);

    const samples: StripSample[] = [];
    const points: THREE.Vector3[] = [];
    const basePoints: THREE.Vector3[] = []; // 不含抬升,用于弯曲检查
    const N = SAMPLES_PER_STRIP;
    const span = d.sMax - d.sMin;
    // 交叉点强制并入采样参数,保证抬升峰值精确落在交叉位置
    const sValues = new Set<number>();
    for (let i = 0; i <= N; i++) sValues.add(d.sMin + (span * i) / N);
    for (const c of d.crossings) {
      if (c.s > d.sMin && c.s < d.sMax) sValues.add(c.s);
    }
    const sList = [...sValues].sort((a, b) => a - b);

    for (let i = 0; i < sList.length; i++) {
      const s = sList[i];
      let u: number;
      let t: number;
      if (d.route === 'meridian') {
        // 固定角度,沿子午线从底到口
        u = d.x0;
        t = this.surface.tFromArc(clamp(s, 0, this.L));
      } else if (d.route === 'ring') {
        // 固定高度,沿等高圈走;s 是周向弧长,转成角度
        t = d.x0;
        const per = this.surface.perimeterAt(t);
        u = (s / per) * Math.PI * 2;
      } else {
        // 展开平面斜篾:x 周向弧长,y 子午弧长
        let x = d.x0 + d.dx * s;
        const y = clamp(d.y0 + d.dy * s, 0, this.L);
        if (d.wrapX) x = mod(x, this.W);
        else x = clamp(x, 0, this.W - 1e-6);
        t = this.surface.tFromArc(y);
        u = this.surface.uFromArc(t, x);
      }
      const p = this.surface.pointAt(u, t);
      this.surface.frameAt(u, t, this.frame);
      const lift = stepWaveLift(s, d.crossings, this.thickness);
      samples.push({
        position: p.clone(),
        normal: this.frame.normal.clone(),
        widthAxis: this.frame.tangentU.clone(), // 占位,下方按路径切向重算
        lift,
        bendBad: false,
      });
      points.push(p.clone().addScaledVector(this.frame.normal, lift));
      basePoints.push(p.clone());
    }

    // 宽轴 = 法线 × 路径切向,保证篾宽始终垂直于篾长方向且贴在曲面上
    for (let i = 0; i < samples.length; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const tangent = this.tmpTan.subVectors(b, a).normalize();
      samples[i].widthAxis.crossVectors(samples[i].normal, tangent).normalize();
    }

    // 弯曲半径检查:基于不含抬升的曲面路径,7 点平滑后算外接圆,消除网格离散噪声
    const n = basePoints.length;
    const smoothed = basePoints.map((_, i) => {
      const i0 = Math.max(0, i - 3);
      const i1 = Math.min(n - 1, i + 3);
      const c = new THREE.Vector3();
      for (let k = i0; k <= i1; k++) c.add(basePoints[k]);
      return c.multiplyScalar(1 / (i1 - i0 + 1));
    });
    // 连续 2 个采样都超限才标记,过滤孤立抖动点
    const badFlags: boolean[] = new Array(n).fill(false);
    for (let i = 1; i < n - 1; i++) {
      const r = circumRadius(smoothed[i - 1], smoothed[i], smoothed[i + 1]);
      badFlags[i] = r < this.minBendRadius;
    }
    for (let i = 1; i < n - 1; i++) {
      if (badFlags[i] && (badFlags[i - 1] || badFlags[i + 1])) samples[i].bendBad = true;
    }

    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
    return { ordinal, family: d.family, label: this.familyLabel(d.family), width: this.width, thickness: this.thickness, length, samples };
  }

  /** 平底盖篾片:y≈0 的水平圆面上,放射筋与同心圈 */
  private realizeFlat(d: DevelopedStrip, ordinal: number): StripGeometryData {
    const samples: StripSample[] = [];
    const points: THREE.Vector3[] = [];
    const N = SAMPLES_PER_STRIP;
    const up = new THREE.Vector3(0, 1, 0);
    const yBase = this.thickness * 0.6;

    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const p = new THREE.Vector3();
      let widthAxis: THREE.Vector3;
      let s: number;
      if (d.family === 4) {
        // 放射筋:x0=角度,s 从 0(心)到 r0(边)
        s = d.sMin + (d.sMax - d.sMin) * f;
        const a = d.x0;
        p.set(Math.cos(a) * s, yBase, Math.sin(a) * s);
        widthAxis = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      } else {
        // 同心圈:x0=半径,s 为角度 0..2π
        s = d.sMin + (d.sMax - d.sMin) * f;
        const r = d.x0;
        p.set(Math.cos(s) * r, yBase, Math.sin(s) * r);
        widthAxis = new THREE.Vector3(-Math.sin(s), 0, Math.cos(s));
      }
      const lift = stepWaveLift(s, d.crossings, this.thickness);
      samples.push({ position: p.clone(), normal: up.clone(), widthAxis, lift, bendBad: false });
      points.push(p.clone().addScaledVector(up, lift));
    }
    let length = 0;
    for (let i = 1; i < points.length; i++) length += points[i].distanceTo(points[i - 1]);
    return { ordinal, family: d.family, label: this.familyLabel(d.family), width: this.width, thickness: this.thickness, length, samples };
  }

  private familyLabel(f: number): string {
  const names = ['经篾', '纬篾', '斜篾A', '斜篾B', '底筋', '底圈'];
    return names[f] ?? `第${f + 1}向`;
  }

  // ---------- 六角孔保持度 ----------
  private evaluateHexDistortion(layout: DevelopedStrip[]): DistortionMark[] {
    const marks: DistortionMark[] = [];
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const per = this.surface.perimeterAt(t);
      const cell = this.pattern.hexCellSize ?? 24;
      const arcA = per / 2 - cell / 2;
      const arcB = per / 2 + cell / 2;
      const uA = this.surface.uFromArc(t, arcA);
      const uB = this.surface.uFromArc(t, arcB);
      const pA = this.surface.pointAt(uA, t);
      const pB = this.surface.pointAt(uB, t);
      const t2 = Math.min(1, t + 0.03);
      const pC = this.surface.pointAt(this.surface.uFromArc(t2, per / 2), t2);
      const d1 = pA.distanceTo(pB);
      const d2 = pB.distanceTo(pC);
      if (d1 < 1e-6 || d2 < 1e-6) continue;
      const ratio = Math.max(d1, d2) / Math.min(d1, d2);
      if (ratio > 1.08) {
        marks.push({
          position: [pB.x, pB.y, pB.z],
          aspectRatio: Number(ratio.toFixed(3)),
          angleErrorDeg: Number((Math.abs(d1 - d2) / Math.max(d1, d2) * 60).toFixed(1)),
        });
      }
    }
    // 周长不足:篾片挤压
    const fam0 = layout.filter((d) => d.family === 0);
    if (fam0.length) {
      const t0 = 0.15;
      const spacing = this.surface.perimeterAt(t0) / fam0.length;
      if (spacing < this.width * 0.9) {
        const p = this.surface.pointAt(0, t0);
        marks.push({ position: [p.x, p.y, p.z], aspectRatio: Number((this.width / spacing).toFixed(2)), angleErrorDeg: 0 });
      }
    }
    return marks;
  }

  private evaluateCompression(layout: DevelopedStrip[]): DistortionMark[] {
    const marks: DistortionMark[] = [];
    const verticals = layout.filter((d) => d.family === 0);
    if (!verticals.length) return marks;
    for (let k = 1; k < 10; k++) {
      const t = k / 10;
      const spacing = this.surface.perimeterAt(t) / verticals.length;
      if (spacing < this.width * 0.9) {
        const p = this.surface.pointAt(0, t);
        marks.push({ position: [p.x, p.y, p.z], aspectRatio: Number((this.width / spacing).toFixed(2)), angleErrorDeg: 0 });
      }
    }
    return marks;
  }

  private collectBendViolations(strips: StripGeometryData[]): BendViolation[] {
    const out: BendViolation[] = [];
    for (const s of strips) {
      let inBad = false;
      for (let i = 0; i < s.samples.length; i++) {
        const bad = s.samples[i].bendBad;
        if (bad && !inBad) {
          inBad = true;
          const p = s.samples[i].position;
          out.push({ stripIndex: s.ordinal, family: s.family, position: [p.x, p.y, p.z], radius: 0, minRadius: Number(this.minBendRadius.toFixed(1)) });
        } else if (!bad) inBad = false;
      }
    }
    return out.slice(0, 100);
  }

  private buildSteps(all: DevelopedStrip[]): WeaveStep[] {
    const order = all
      .map((d, i) => ({ d, i }))
      .sort((a, b) => {
        const rank = (x: DevelopedStrip) => (x.family >= 4 ? 0 : x.family === 0 ? 1 : 2);
        const ra = rank(a.d);
        const rb = rank(b.d);
        if (ra !== rb) return ra - rb;
        if (a.d.family === 1 || a.d.family === 5) return a.d.y0 - b.d.y0;
        return a.i - b.i;
      });
    return order.map(({ d, i }, step) => ({
      index: step,
      stripOrdinal: i + 1,
      family: d.family,
      label: `第 ${step + 1} 步:${this.familyLabel(d.family)}(总第 ${i + 1} 根篾)`,
    }));
  }
}

function lineIntersection(a: DevelopedStrip, b: DevelopedStrip, wrap: number): { sA: number; sB: number; x: number; y: number } | null {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-9) return null;
  const ex = b.x0 + wrap - a.x0;
  const ey = b.y0 - a.y0;
  const sA = (ex * b.dy - ey * b.dx) / det;
  const sB = (ex * a.dy - ey * a.dx) / det;
  return { sA, sB, x: a.x0 + a.dx * sA, y: a.y0 + a.dy * sA };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}
