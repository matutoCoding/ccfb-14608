import { minBendRadiusCm } from './defaults';
import { BambooSurface } from './shape';
import { CLEARANCE_CM, buildStripGeometry, createOffsetEvaluator, holdLengthCm, type StripDraft, type StripResult } from './ribbon';
import type { MaterialPreset, ShapeDesign, WeaveDesign } from '../types';
import { cross, dot, length, mod, normalize, sub, type Vec3 } from './vec';

export interface CrossingReport {
  id: string;
  aId: string;
  bId: string;
  kind: string;
  position: Vec3;
  angleDeg: number;
  centerSeparationCm: number;
  requiredSeparationCm: number;
  clearanceCm: number;
  over: string;
}

export interface HexMarker {
  position: Vec3;
  severity: number;
  angleErrorDeg: number;
  scaleErrorPct: number;
  message: string;
}

export interface BuildWarning {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface BuildStats {
  stripCount: number;
  crossingCount: number;
  triangleCount: number;
  vertexCount: number;
  buildMs: number;
  minClearanceCm: number;
  minPatchClearanceCm: number;
  checkedPatches: number;
  dangerStripCount: number;
  dangerLengthCm: number;
  hexMarkerCount: number;
  hexMaxAngleErrorDeg: number;
  rootCount: number;
}

export interface PlayStep {
  index: number;
  title: string;
  detail: string;
  stripId: string;
  rootNo: number;
  circle: string;
}

export interface BuildResult {
  strips: StripResult[];
  crossings: CrossingReport[];
  hexMarkers: HexMarker[];
  steps: PlayStep[];
  stats: BuildStats;
  warnings: BuildWarning[];
  minBendRadiusCm: number;
  surfaceLengthCm: number;
}

export interface BuildRequest {
  shape: ShapeDesign;
  weave: WeaveDesign;
  material: MaterialPreset;
  lossRate: number;
}

function patternAt(weave: WeaveDesign, row: number, col: number): boolean {
  const r = mod(Math.floor(row), weave.rows);
  const c = mod(Math.floor(col), weave.cols);
  return weave.cells[r]?.[c] ?? ((r + c) % 2 === 0);
}

function crossingAngleFromTangents(a: Vec3, b: Vec3): { angleRad: number; sin: number } {
  const ua = normalize(a);
  const ub = normalize(b);
  const sin = length(cross(ua, ub));
  const cos = Math.abs(dot(ua, ub));
  return { angleRad: Math.atan2(Math.min(1, sin), Math.min(1, cos)), sin: Math.max(0.42, sin) };
}

class FrameTrack {
  frames: Array<{ p: Vec3; normal: Vec3 }> = [];
  cum: number[] = [];

  push(p: Vec3, normal: Vec3): number {
    const prev = this.frames[this.frames.length - 1];
    const d = prev ? this.cum[this.cum.length - 1] + Math.hypot(...sub(p, prev.p)) : 0;
    this.frames.push({ p, normal: normalize(normal) });
    this.cum.push(d);
    return this.frames.length - 1;
  }

  get total(): number {
    return this.cum[this.cum.length - 1] ?? 0;
  }

  tAt(index: number): number {
    return this.total > 0 ? this.cum[index] / this.total : 0;
  }

  frameAt = (t: number): { p: Vec3; normal: Vec3 } => {
    const target = Math.min(this.total, Math.max(0, t * this.total));
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < target) i += 1;
    const d0 = this.cum[i];
    const d1 = this.cum[i + 1] ?? d0;
    const k = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    const a = this.frames[i];
    const b = this.frames[i + 1] ?? a;
    return {
      p: [
        a.p[0] + (b.p[0] - a.p[0]) * k,
        a.p[1] + (b.p[1] - a.p[1]) * k,
        a.p[2] + (b.p[2] - a.p[2]) * k,
      ],
      normal: normalize([
        a.normal[0] + (b.normal[0] - a.normal[0]) * k,
        a.normal[1] + (b.normal[1] - a.normal[1]) * k,
        a.normal[2] + (b.normal[2] - a.normal[2]) * k,
      ]),
    };
  };

  findT(p: Vec3): number {
    let best = 0;
    let bestD = Infinity;
    this.frames.forEach((f, i) => {
      const d = (f.p[0] - p[0]) ** 2 + (f.p[1] - p[1]) ** 2 + (f.p[2] - p[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return this.tAt(best);
  }
}

function generateOrthogonal(
  surface: BambooSurface,
  req: BuildRequest,
): { drafts: StripDraft[]; crossings: CrossingReport[] } {
  const { weave, material } = req;
  const drafts: StripDraft[] = [];
  const crossings: CrossingReport[] = [];
  const widthCm = material.widthMm / 10;
  const thicknessCm = material.thicknessMm / 10;
  const pitchCm = (material.widthMm + weave.gapMm) / 10;

  let minPerimeter = Infinity;
  for (let i = 0; i <= 24; i += 1) {
    minPerimeter = Math.min(minPerimeter, surface.perimeterAtS((i / 24) * surface.lengthCm));
  }
  const warpCount = Math.max(12, Math.min(150, Math.floor(minPerimeter / pitchCm)));
  const margin = 0.85;
  const weftCount = Math.max(6, Math.min(80, Math.floor((surface.lengthCm - margin * 2) / pitchCm) + 1));
  const sValues = Array.from({ length: weftCount }, (_, j) => margin + j * pitchCm);

  const warps: StripDraft[] = [];
  for (let i = 0; i < warpCount; i += 1) {
    const u = (i + 0.5) / warpCount;
    const draft: StripDraft = {
      id: `warp_${i + 1}`,
      label: `经篾 ${i + 1}`,
      family: 'warp',
      group: '经篾',
      rootNo: i + 1,
      order: i,
      widthCm,
      thicknessCm,
      frameAt: (t) => surface.frameSU(t * surface.lengthCm, u),
      keys: [],
    };
    warps.push(draft);
    drafts.push(draft);
  }

  const wefts: StripDraft[] = [];
  sValues.forEach((s, j) => {
    const draft: StripDraft = {
      id: `weft_${j + 1}`,
      label: `第 ${j + 1} 圈纬篾`,
      family: 'weft',
      group: `第 ${j + 1} 圈`,
      rootNo: warpCount + j + 1,
      order: warpCount + j,
      widthCm,
      thicknessCm,
      closed: true,
      frameAt: (t) => surface.frameSU(s, t),
      keys: [],
    };
    wefts.push(draft);
    drafts.push(draft);
  });

  for (let j = 0; j < weftCount; j += 1) {
    const s = sValues[j];
    for (let i = 0; i < warpCount; i += 1) {
      const u = (i + 0.5) / warpCount;
      const f = surface.frameSU(s, u);
      const angle = crossingAngleFromTangents(f.tangentS, f.tangentU);
      const aOver = patternAt(weave, j, i);
      const id = `x_cross_${j + 1}_${i + 1}`;
      warps[i].keys.push({
        t: s / surface.lengthCm,
        sign: aOver ? 1 : -1,
        holdCm: holdLengthCm(widthCm, angle.angleRad),
        crossingId: id,
      });
      wefts[j].keys.push({
        t: u,
        sign: aOver ? -1 : 1,
        holdCm: holdLengthCm(widthCm, angle.angleRad),
        crossingId: id,
      });
      const lift = thicknessCm / 2 + CLEARANCE_CM;
      crossings.push({
        id,
        aId: warps[i].id,
        bId: wefts[j].id,
        kind: weave.kind,
        position: f.p,
        angleDeg: (angle.angleRad * 180) / Math.PI,
        centerSeparationCm: lift * 2,
        requiredSeparationCm: thicknessCm,
        clearanceCm: lift * 2 - thicknessCm,
        over: aOver ? warps[i].id : wefts[j].id,
      });
    }
  }

  return { drafts, crossings };
}

function generateChrysanthemum(
  surface: BambooSurface,
  req: BuildRequest,
): { drafts: StripDraft[]; crossings: CrossingReport[] } {
  const { weave, material } = req;
  const drafts: StripDraft[] = [];
  const crossings: CrossingReport[] = [];
  const widthCm = material.widthMm / 10;
  const thicknessCm = material.thicknessMm / 10;
  const pitchCm = (material.widthMm + weave.gapMm) / 10;
  const arms = Math.max(8, weave.petalCount ?? 16);
  const fullStrips = arms / 2;
  const R = surface.bottomRadiusCm;

  const radialTracks: FrameTrack[] = [];
  for (let k = 0; k < fullStrips; k += 1) {
    const theta = (2 * Math.PI * k) / arms;
    const thetaOpp = theta + Math.PI;
    const track = new FrameTrack();
    const sideSteps = 54;
    for (let q = 0; q <= sideSteps; q += 1) {
      const s = surface.lengthCm * (1 - q / sideSteps);
      const f = surface.frameSTheta(s, thetaOpp);
      track.push(f.p, f.normal);
    }
    const edgeOpp = surface.bottomPoint(R, thetaOpp);
    const edgeThis = surface.bottomPoint(R, theta);
    const bottomSteps = 34;
    for (let q = 1; q <= bottomSteps; q += 1) {
      const t = q / bottomSteps;
      track.push(
        [
          edgeOpp[0] + (edgeThis[0] - edgeOpp[0]) * t,
          0.015,
          edgeOpp[2] + (edgeThis[2] - edgeOpp[2]) * t,
        ],
        [0, 1, 0],
      );
    }
    for (let q = 1; q <= sideSteps; q += 1) {
      const s = (q / sideSteps) * surface.lengthCm;
      const f = surface.frameSTheta(s, theta);
      track.push(f.p, f.normal);
    }
    radialTracks.push(track);
    drafts.push({
      id: `petal_strip_${k + 1}`,
      label: `菊花底通长篾 ${k + 1}`,
      family: 'radial',
      group: '菊花底放射',
      rootNo: k + 1,
      order: k,
      widthCm,
      thicknessCm,
      frameAt: track.frameAt,
      keys: [],
      maxStepCm: 0.28,
    });
  }

  const bottomRingCount = Math.max(5, Math.min(18, Math.floor((R - 1.2) / pitchCm)));
  const bottomRValues = Array.from({ length: bottomRingCount }, (_, j) => 1.1 + (j * (R - 1.8)) / Math.max(1, bottomRingCount - 1));
  const ringDrafts: StripDraft[] = [];
  bottomRValues.forEach((r, j) => {
    const draft: StripDraft = {
      id: `bottom_ring_${j + 1}`,
      label: `菊花底第 ${j + 1} 圈`,
      family: 'weft',
      group: `底圈 ${j + 1}`,
      rootNo: fullStrips + j + 1,
      order: fullStrips + j,
      widthCm,
      thicknessCm,
      closed: true,
      frameAt: (t) => ({ p: surface.bottomPoint(r, t * Math.PI * 2, 0.02), normal: [0, 1, 0] }),
      keys: [],
    };
    ringDrafts.push(draft);
    drafts.push(draft);
  });

  const margin = 0.9;
  const bodyCount = Math.max(5, Math.floor((surface.lengthCm - margin * 2) / pitchCm));
  const bodySValues = Array.from({ length: bodyCount }, (_, j) => margin + j * pitchCm);
  bodySValues.forEach((s, j) => {
    const rootNo = fullStrips + bottomRingCount + j + 1;
    const draft: StripDraft = {
      id: `body_ring_chrys_${j + 1}`,
      label: `器身第 ${j + 1} 圈`,
      family: 'weft',
      group: `器身第 ${j + 1} 圈`,
      rootNo,
      order: fullStrips + bottomRingCount + j,
      widthCm,
      thicknessCm,
      closed: true,
      frameAt: (t) => surface.frameSTheta(s, t * Math.PI * 2),
      keys: [],
    };
    ringDrafts.push(draft);
    drafts.push(draft);
  });

  function addRadialRingCrossing(
    ring: StripDraft,
    ringIndex: number,
    radiusOrS: number,
    onBottom: boolean,
    row: number,
  ): void {
    for (let c = 0; c < arms; c += 1) {
      const theta = (2 * Math.PI * c) / arms;
      const k = c % fullStrips;
      const track = radialTracks[k];
      const radial = drafts[k];
      const position = onBottom ? surface.bottomPoint(radiusOrS, theta, 0.02) : surface.pointSTheta(radiusOrS, theta);
      const tRadial = track.findT(position);
      const tRing = theta / (Math.PI * 2);
      const aOver = patternAt(weave, row, c);
      const id = `x_chrys_${onBottom ? 'b' : 's'}_${ringIndex}_${c}`;
      const angle = Math.PI / 2;
      radial.keys.push({ t: tRadial, sign: aOver ? 1 : -1, holdCm: holdLengthCm(widthCm, angle), crossingId: id });
      ring.keys.push({ t: tRing, sign: aOver ? -1 : 1, holdCm: holdLengthCm(widthCm, angle), crossingId: id });
      crossings.push({
        id,
        aId: radial.id,
        bId: ring.id,
        kind: 'chrysanthemum',
        position,
        angleDeg: 90,
        centerSeparationCm: thicknessCm + CLEARANCE_CM * 2,
        requiredSeparationCm: thicknessCm,
        clearanceCm: CLEARANCE_CM * 2,
        over: aOver ? radial.id : ring.id,
      });
    }
  }

  bottomRValues.forEach((r, j) => addRadialRingCrossing(ringDrafts[j], j, r, true, j));
  bodySValues.forEach((s, j) => addRadialRingCrossing(ringDrafts[bottomRingCount + j], bottomRingCount + j, s, false, bottomRingCount + j));

  return { drafts, crossings };
}

interface HexLine {
  draft: StripDraft;
  x0: number;
  sign: 1 | -1;
}

function generateHex(
  surface: BambooSurface,
  req: BuildRequest,
): { drafts: StripDraft[]; crossings: CrossingReport[]; markers: HexMarker[] } {
  const { weave, material } = req;
  const drafts: StripDraft[] = [];
  const crossings: CrossingReport[] = [];
  const markers: HexMarker[] = [];
  const widthCm = material.widthMm / 10;
  const thicknessCm = material.thicknessMm / 10;
  const targetPitchCm = (weave.hexHoleMm + material.widthMm) / 10;
  const refS = surface.lengthCm * surface.shape.bellyV;
  const pRef = surface.perimeterAtS(refS);

  // 圆周长必须是种子间距的整数倍。先取整 N，再反算有效间距，
  // 水平圈和两斜向的交叉点才能始终落在半格位置，不会逐渐相位漂移。
  const seedCount = Math.max(18, Math.min(96, Math.round(pRef / ((2 * targetPitchCm) / Math.sqrt(3)))));
  const pitchCm = (Math.sqrt(3) * pRef) / (2 * seedCount);

  const hCount = Math.max(5, Math.min(42, Math.floor((surface.lengthCm - 0.15) / pitchCm) + 1));
  const sValues = Array.from({ length: hCount }, (_, k) => k * pitchCm);
  const hDrafts: StripDraft[] = sValues.map((s, k) => {
    const d: StripDraft = {
      id: `hex_h_${k + 1}`,
      label: `六角环篾 ${k + 1}`,
      family: 'weft',
      group: `第 ${k + 1} 水平向`,
      rootNo: k + 1,
      order: k,
      widthCm,
      thicknessCm,
      closed: true,
      frameAt: (t) => surface.frameSU(s, t),
      keys: [],
    };
    drafts.push(d);
    return d;
  });

  const diagonalA: HexLine[] = [];
  const diagonalB: HexLine[] = [];

  for (let i = 0; i < seedCount; i += 1) {
    const x0 = (i / seedCount) * pRef;
    const orderA = hCount + i;
    const draftA: StripDraft = {
      id: `hex_a_${i + 1}`,
      label: `右斜篾 ${i + 1}`,
      family: 'diagonal-a',
      group: '右斜向',
      rootNo: hCount + i + 1,
      order: orderA,
      widthCm,
      thicknessCm,
      frameAt: (t) => {
        const y = t * surface.lengthCm;
        const x = x0 + y / Math.sqrt(3);
        return surface.frameSU(y, mod(x / pRef, 1));
      },
      keys: [],
    };
    diagonalA.push({ draft: draftA, x0, sign: 1 });
    drafts.push(draftA);

    const x0b = ((i + 0.5) / seedCount) * pRef;
    const orderB = hCount + seedCount + i;
    const draftB: StripDraft = {
      id: `hex_b_${i + 1}`,
      label: `左斜篾 ${i + 1}`,
      family: 'diagonal-b',
      group: '左斜向',
      rootNo: hCount + seedCount + i + 1,
      order: orderB,
      widthCm,
      thicknessCm,
      frameAt: (t) => {
        const y = t * surface.lengthCm;
        const x = x0b - y / Math.sqrt(3);
        return surface.frameSU(y, mod(x / pRef, 1));
      },
      keys: [],
    };
    diagonalB.push({ draft: draftB, x0: x0b, sign: -1 });
    drafts.push(draftB);
  }

  function tangentAtY(draft: StripDraft, y: number): Vec3 {
    const t = y / surface.lengthCm;
    const a = draft.frameAt(clampNum(t - 0.004, 0, 1)).p;
    const b = draft.frameAt(clampNum(t + 0.004, 0, 1)).p;
    return normalize(sub(b, a));
  }

  function reportPair(args: {
    a: StripDraft;
    b: StripDraft;
    tA: number;
    tB: number;
    position: Vec3;
    tangentA: Vec3;
    tangentB: Vec3;
    aOver: boolean;
    kind: string;
    id: string;
  }): void {
    const angle = crossingAngleFromTangents(args.tangentA, args.tangentB);
    args.a.keys.push({ t: args.tA, sign: args.aOver ? 1 : -1, holdCm: holdLengthCm(widthCm, angle.angleRad), crossingId: args.id });
    args.b.keys.push({ t: args.tB, sign: args.aOver ? -1 : 1, holdCm: holdLengthCm(widthCm, angle.angleRad), crossingId: args.id });
    crossings.push({
      id: args.id,
      aId: args.a.id,
      bId: args.b.id,
      kind: args.kind,
      position: args.position,
      angleDeg: (angle.angleRad * 180) / Math.PI,
      centerSeparationCm: thicknessCm + CLEARANCE_CM * 2,
      requiredSeparationCm: thicknessCm,
      clearanceCm: CLEARANCE_CM * 2,
      over: args.aOver ? args.a.id : args.b.id,
    });
  }

  // 水平向与两斜向的交叉
  sValues.forEach((y, k) => {
    diagonalA.forEach((line, i) => {
      const x = line.x0 + y / Math.sqrt(3);
      const u = mod(x / pRef, 1);
      const f = surface.frameSU(y, u);
      const aOver = patternAt(weave, k, i);
      reportPair({
        a: line.draft,
        b: hDrafts[k],
        tA: y / surface.lengthCm,
        tB: u,
        position: f.p,
        tangentA: tangentAtY(line.draft, y),
        tangentB: f.tangentU,
        aOver,
        kind: 'hex-h-a',
        id: `x_ha_${k}_${i}`,
      });
    });
    diagonalB.forEach((line, j) => {
      const x = line.x0 - y / Math.sqrt(3);
      const u = mod(x / pRef, 1);
      const f = surface.frameSU(y, u);
      const aOver = patternAt(weave, k + 2, j + 3);
      reportPair({
        a: line.draft,
        b: hDrafts[k],
        tA: y / surface.lengthCm,
        tB: u,
        position: f.p,
        tangentA: tangentAtY(line.draft, y),
        tangentB: f.tangentU,
        aOver,
        kind: 'hex-h-b',
        id: `x_hb_${k}_${j}`,
      });
    });
  });

  // 两斜向在展开面上的交叉；考虑圆柱周长取模，枚举可能的 nPRef。
  diagonalA.forEach((la, i) => {
    diagonalB.forEach((lb, j) => {
      const low = la.x0 - lb.x0;
      const high = low + (2 * surface.lengthCm) / Math.sqrt(3);
      const n0 = Math.floor(low / pRef) - 1;
      const n1 = Math.ceil(high / pRef) + 1;
      for (let n = n0; n <= n1; n += 1) {
        const y = (Math.sqrt(3) / 2) * (n * pRef - la.x0 + lb.x0);
        if (y < 0 || y > surface.lengthCm) continue;
        const x = la.x0 + y / Math.sqrt(3);
        const u = mod(x / pRef, 1);
        const f = surface.frameSU(y, u);
        const aOver = patternAt(weave, Math.round(y / pitchCm), i + j);
        reportPair({
          a: la.draft,
          b: lb.draft,
          tA: y / surface.lengthCm,
          tB: y / surface.lengthCm,
          position: f.p,
          tangentA: tangentAtY(la.draft, y),
          tangentB: tangentAtY(lb.draft, y),
          aOver,
          kind: 'hex-a-b',
          id: `x_ab_${i}_${j}_${n}`,
        });
      }
    });
  });

  // 局部度量检查：三个 60° 方向映射到曲面后是否仍等长、等角。
  let maxAngleError = 0;
  for (let yi = 1; yi <= 8; yi += 1) {
    const y = (yi / 9) * surface.lengthCm;
    const p = surface.perimeterAtS(y);
    const scaleX = p / pRef;
    for (let ui = 0; ui < 20; ui += 1) {
      const u = ui / 20;
      const f = surface.frameSU(y, u);
      const dirs = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) =>
        normalize(addScaled(f.tangentU, Math.cos(a) * scaleX, scaleVec(f.tangentS, Math.sin(a)))),
      );
      const angles = [
        angleBetweenDeg(dirs[0], dirs[1]),
        angleBetweenDeg(dirs[1], dirs[2]),
        angleBetweenDeg(dirs[2], dirs[0]),
      ].map((a) => Math.min(a, 180 - a));
      const angleError = Math.max(...angles.map((a) => Math.abs(a - 60)));
      const scaleError = Math.abs(scaleX - 1) * 100;
      maxAngleError = Math.max(maxAngleError, angleError, scaleError * 0.45);
      if (angleError > 7 || scaleError > 13) {
        const severity = Math.min(1, Math.max(angleError / 24, scaleError / 34));
        markers.push({
          position: f.p,
          severity,
          angleErrorDeg: angleError,
          scaleErrorPct: scaleError,
          message: `六角畸变 ${angleError.toFixed(1)}° / 周长尺度 ${scaleError.toFixed(0)}%，建议调整根数或分段`,
        });
      }
    }
  }

  return { drafts, crossings, markers };
}

function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function addScaled(a: Vec3, sa: number, b: Vec3): Vec3 {
  return [a[0] * sa + b[0], a[1] * sa + b[1], a[2] * sa + b[2]];
}

function angleBetweenDeg(a: Vec3, b: Vec3): number {
  return (Math.acos(clampNum(dot(normalize(a), normalize(b)), -1, 1)) * 180) / Math.PI;
}

export function generateWeave(req: BuildRequest): BuildResult {
  const started = performance.now();
  const surface = new BambooSurface(req.shape);
  const minBend = minBendRadiusCm(req.material);

  let generated: { drafts: StripDraft[]; crossings: CrossingReport[]; markers?: HexMarker[] };
  if (req.weave.kind === 'hex') {
    generated = generateHex(surface, req);
  } else if (req.weave.kind === 'chrysanthemum') {
    generated = generateChrysanthemum(surface, req);
  } else {
    generated = generateOrthogonal(surface, req);
  }

  const strips = generated.drafts
    .map((d) => buildStripGeometry(d, req.lossRate, minBend))
    .sort((a, b) => a.order - b.order);

  const stripById = new Map(strips.map((s) => [s.id, s]));
  const offsetFns = new Map(strips.map((s) => [s.id, createOffsetEvaluator(s)]));
  let minPatchClearanceCm = Infinity;
  let checkedPatches = 0;
  for (const x of generated.crossings) {
    const a = stripById.get(x.aId);
    const b = stripById.get(x.bId);
    const evalA = offsetFns.get(x.aId);
    const evalB = offsetFns.get(x.bId);
    const keyA = a?.offsetKeys.find((k) => k.crossingId === x.id);
    const keyB = b?.offsetKeys.find((k) => k.crossingId === x.id);
    if (!a || !b || !evalA || !evalB || !keyA || !keyB) continue;
    const sinAngle = Math.max(0.42, Math.sin((x.angleDeg * Math.PI) / 180));
    const xMax = b.widthCm / (2 * sinAngle);
    const yMax = a.widthCm / (2 * sinAngle);
    const required = (a.thicknessCm + b.thicknessCm) / 2 + 0.004;
    for (let ix = 0; ix <= 6; ix += 1) {
      const dx = -xMax + (2 * xMax * ix) / 6;
      for (let iy = 0; iy <= 6; iy += 1) {
        const dy = -yMax + (2 * yMax * iy) / 6;
        const oa = evalA(keyA.d + dx);
        const ob = evalB(keyB.d + dy);
        const separation = x.over === x.aId ? oa - ob : ob - oa;
        minPatchClearanceCm = Math.min(minPatchClearanceCm, separation - required);
        checkedPatches += 1;
      }
    }
  }
  if (!Number.isFinite(minPatchClearanceCm)) minPatchClearanceCm = 0;

  const steps: PlayStep[] = strips.map((s) => ({
    index: s.order,
    title: s.group,
    detail: `${s.label}：当前使用全局第 ${s.rootNo} 根篾，净长 ${s.lengthCm.toFixed(1)}cm`,
    stripId: s.id,
    rootNo: s.rootNo,
    circle: s.group,
  }));

  const triangleCount = strips.reduce((sum, s) => sum + s.geometry.indices.length / 3, 0);
  const vertexCount = strips.reduce((sum, s) => sum + s.geometry.positions.length / 3, 0);
  const minClearanceCm = generated.crossings.reduce((m, x) => Math.min(m, x.clearanceCm), Infinity);
  const dangerStripCount = strips.filter((s) => s.danger).length;
  const dangerLengthCm = strips.reduce((sum, s) => sum + s.dangerLengthCm, 0);
  const buildMs = performance.now() - started;
  const hexMarkers = generated.markers ?? [];

  const warnings: BuildWarning[] = [];
  if (generated.crossings.length > 0 && minPatchClearanceCm <= 0) {
    warnings.push({ level: 'error', message: `交叉重叠面采样发现 ${(-minPatchClearanceCm).toFixed(3)}cm 穿透量；请加大净距或减小篾宽/篾厚` });
  } else if (generated.crossings.length > 0) {
    warnings.push({
      level: 'info',
      message: `${generated.crossings.length} 个交叉、${checkedPatches.toLocaleString()} 个重叠面采样通过：最小额外间隙 ${minPatchClearanceCm.toFixed(3)}cm`,
    });
  }
  if (dangerStripCount > 0) {
    warnings.push({ level: 'warn', message: `${dangerStripCount} 根篾有曲率半径小于 ${minBend.toFixed(2)}cm 的区段，已在模型上标红` });
  }
  if (hexMarkers.length > 0) {
    warnings.push({ level: 'warn', message: `${hexMarkers.length} 个六角孔位无法同时保持等边/等角，已用橙色标记` });
  }
  if (buildMs > 2000) {
    warnings.push({ level: 'warn', message: `重新生成耗时 ${buildMs.toFixed(0)}ms，超过 2 秒目标` });
  }

  return {
    strips,
    crossings: generated.crossings,
    hexMarkers,
    steps,
    minBendRadiusCm: minBend,
    surfaceLengthCm: surface.lengthCm,
    stats: {
      stripCount: strips.length,
      crossingCount: generated.crossings.length,
      triangleCount,
      vertexCount,
      buildMs,
      minClearanceCm: Number.isFinite(minClearanceCm) ? minClearanceCm : CLEARANCE_CM * 2,
      minPatchClearanceCm,
      checkedPatches,
      dangerStripCount,
      dangerLengthCm,
      hexMarkerCount: hexMarkers.length,
      hexMaxAngleErrorDeg: hexMarkers.reduce((m, x) => Math.max(m, x.angleErrorDeg, x.severity * 20), 0),
      rootCount: strips.length,
    },
    warnings,
  };
}
