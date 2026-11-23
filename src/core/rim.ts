import type { RibbonMeshData, RimType, Vec3 } from '../types';
import type { BuildContext } from './weaveBuilder';
import { TAU, vAdd, vNorm, vScale } from './mathUtils';
import { buildRibbonGeometry, type RibbonSample } from './ribbon';

/**
 * 口沿收口单独建模,三种结构几何不同:
 * - roll 卷口:篾片沿口沿外翻卷成圆环管(中心线在 meridian 面内绕一圈)
 * - wrap 包边:宽篾在口沿外侧竖直包裹,上下出头
 * - socket 插口:U 形槽,沿外法向抬离口沿一圈
 */
export function buildRim(ctx: BuildContext): RibbonMeshData[] {
  const { vessel, weave } = ctx;
  const type: RimType = weave.rimType;
  const w = weave.rimWidth;
  const th = weave.rimThickness;
  const minR = ctx.material.bendFactor * th;
  const Ncirc = Math.max(120, vessel.spec.radialSegments + 24);
  const tRim = 0.985;

  if (type === 'roll') {
    // 卷口:一条篾绕口沿走,同时在 meridian 面内螺旋卷 360°
    const rollR = Math.max(w * 0.42, th * 2.2);
    const Nturn = 40; // 卷管截面采样
    const samples: RibbonSample[] = [];
    for (let k = 0; k <= Ncirc; k++) {
      const theta = TAU * (k / Ncirc);
      const f = vessel.frame(tRim, theta);
      const phi = TAU * (k / Ncirc) * 1.0; // 一整圈周向对应一卷
      // meridian 面内的卷管中心轴:沿周向;截面在 normal/tangent 平面
      const meridian: Vec3 = f.tangent; // 经向(竖直为主)
      const c = vAdd(
        f.center,
        vAdd(
          vScale(f.normal, rollR * (1 + Math.cos(phi)) * 0.5),
          vScale(meridian, rollR * Math.sin(phi) * 0.5 + w * 0.2),
        ),
      );
      const normal = vNorm(
        vAdd(vScale(f.normal, Math.cos(phi)), vScale(meridian, Math.sin(phi))),
      );
      samples.push({
        center: c,
        normal,
        widthDir: f.widthDir,
        tangent: f.tangent,
        offset: 0,
      });
    }
    void Nturn;
    return [
      buildRibbonGeometry({
        id: 20000,
        order: 9999,
        role: 'rim',
        label: '卷口收口',
        width: w * 0.55,
        thickness: th,
        samples,
        minAllowedRadius: minR,
      }),
    ];
  }

  const samples: RibbonSample[] = [];
  for (let k = 0; k <= Ncirc; k++) {
    const theta = TAU * (k / Ncirc);
    const f = vessel.frame(tRim, theta);
    let center = f.center;
    let normal = f.normal;
    const widthDir: Vec3 = [0, 1, 0]; // 包边/插口的篾宽竖直

    if (type === 'wrap') {
      // 包边:贴口沿外侧,中心略高于口沿,宽篾上下包住
      center = vAdd(
        f.center,
        vAdd(vScale(f.normal, th * 0.6), [0, w * 0.22, 0]),
      );
    } else {
      // 插口:向外抬出一个 U 槽的距离
      center = vAdd(f.center, vScale(f.normal, th * 1.6 + w * 0.18));
      normal = f.normal;
    }
    samples.push({
      center,
      normal,
      widthDir,
      tangent: f.tangent,
      offset: 0,
    });
  }

  return [
    buildRibbonGeometry({
      id: 20000,
      order: 9999,
      role: 'rim',
      label: type === 'wrap' ? '包边收口' : '插口收口',
      width: w,
      thickness: th,
      samples,
      minAllowedRadius: minR,
    }),
  ];
}
