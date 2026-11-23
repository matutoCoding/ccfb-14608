import type { RibbonMeshData } from '../types';
import type { BuildContext } from './weaveBuilder';
import { TAU, envelope } from './mathUtils';
import { buildRibbonGeometry, type RibbonSample } from './ribbon';
import { SIDE_T0 } from './weaveBuilder';

/**
 * 菊花底:偶数根辐条(经篾)从中心放射,中心处逐根挑压形成菊花纹,
 * 外圈用若干底圈(纬环)锁住。辐条到侧壁后并入经篾。
 */
export function buildChrysanthemumBase(
  ctx: BuildContext,
  sideWarpCount: number,
): RibbonMeshData[] {
  const { vessel, weave, material } = ctx;
  const spokes = Math.max(
    weave.baseSpokes,
    sideWarpCount || weave.baseSpokes,
  );
  const minR = material.bendFactor * weave.stripThickness;
  const ribbons: RibbonMeshData[] = [];
  const rBottom = vessel.radiusAt(0);
  const hubR = Math.max(weave.stripWidth * 0.9, 4);

  // 辐条:从中心略偏外起,沿底径到侧壁再上一小段
  let id = 10000;
  for (let i = 0; i < spokes; i++) {
    const theta = (i / spokes) * TAU;
    const samples: RibbonSample[] = [];
    const Nrad = 28;
    const Nside = 10;
    // 径向篮底段为 0..Nrad(含),翻折过渡在 Nrad 附近
    const foldIdx = Nrad;
    for (let k = 0; k <= Nrad; k++) {
      const radial = hubR / rBottom + (1 - hubR / rBottom) * (k / Nrad);
      const center = vessel.bottomPoint(radial, theta);
      // 菊花心挑压:中心区相邻辐条一上一下,向外用包络衰减
      const hubEnv = envelope(
        (radial * rBottom - hubR) / (weave.stripWidth * 2),
      );
      const offset =
        (i % 2 === 0 ? 1 : -1) * hubEnv * weave.stripThickness * 0.75;
      const w: [number, number, number] = [
        -Math.sin(theta),
        0,
        Math.cos(theta),
      ];
      samples.push({
        center,
        normal: vessel.bottomNormal(),
        widthDir: w,
        tangent: [Math.cos(theta), 0, Math.sin(theta)],
        offset,
      });
    }
    // 折上侧壁
    for (let k = 1; k <= Nside; k++) {
      const t = SIDE_T0 * (k / Nside);
      const f = vessel.frame(t, theta);
      samples.push({ ...f, offset: 0 });
    }
    ribbons.push(
      buildRibbonGeometry({
        id: id++,
        order: i,
        role: 'spoke',
        label: `菊花底辐条 ${i + 1}`,
        width: weave.stripWidth,
        thickness: weave.stripThickness,
        samples,
        minAllowedRadius: minR,
        // 豁免两段工艺结构:中心汇聚区与篮底翻上侧壁的折角。
        // 区间按曲率评估窗口(约 24mm / 数个采样)放宽,避免窗口越过豁免边界误判。
        exemptRanges: [
          [0, 8],
          [Math.max(8, foldIdx - 6), foldIdx + 8],
        ],
      }),
    );
  }

  // 底圈纬环:在底平面上绕圈,与辐条挑压
  const ringSamples = Math.max(72, vessel.spec.radialSegments);
  for (let j = 0; j < weave.baseRingCount; j++) {
    const radial =
      0.35 + (0.6 * (j + 1)) / (weave.baseRingCount + 1);
    const samples: RibbonSample[] = [];
    for (let k = 0; k <= ringSamples; k++) {
      const theta = TAU * (k / ringSamples);
      const center = vessel.bottomPoint(radial, theta);
      const spokeIdx = Math.round((theta / TAU) * spokes);
      const over = (spokeIdx + j) % 2 === 0; // 与辐条交替
      const env = envelope(0); // 环始终位于交叉高度,靠奇偶定上下
      const offset = (over ? 1 : -1) * env * weave.stripThickness * 0.75;
      // 环篾宽沿径向(垂直于环的切向)
      const widthDir: [number, number, number] = [
        Math.cos(theta),
        0,
        Math.sin(theta),
      ];
      samples.push({
        center,
        normal: vessel.bottomNormal(),
        widthDir,
        tangent: [-Math.sin(theta), 0, Math.cos(theta)],
        offset,
      });
    }
    ribbons.push(
      buildRibbonGeometry({
        id: id++,
        order: spokes + j,
        role: 'baseRing',
        label: `底圈 ${j + 1}`,
        width: weave.stripWidth,
        thickness: weave.stripThickness,
        samples,
        minAllowedRadius: minR,
      }),
    );
  }
  return ribbons;
}
