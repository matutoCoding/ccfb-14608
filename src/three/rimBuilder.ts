import * as THREE from 'three';
import { BambooSurface } from '../lib/shape';
import { buildStripGeometry, type StripDraft } from '../lib/ribbon';
import type { RimConfig, ShapeDesign } from '../types';
import type { Vec3 } from '../lib/vec';

class MouthCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly surface: BambooSurface, private readonly yOffset = 0.04) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const p = this.surface.pointSTheta(this.surface.lengthCm, t * Math.PI * 2);
    return target.set(p[0], p[1] + this.yOffset, p[2]);
  }
}

class WrapCurve extends THREE.Curve<THREE.Vector3> {
  private readonly turns: number;
  private readonly coilRadiusCm: number;

  constructor(
    private readonly surface: BambooSurface,
    turns: number,
    coilRadiusCm: number,
  ) {
    super();
    this.turns = turns;
    this.coilRadiusCm = coilRadiusCm;
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const theta = t * Math.PI * 2;
    const p = this.surface.pointSTheta(this.surface.lengthCm, theta);
    const radial = new THREE.Vector3(p[0], 0, p[2]);
    if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0);
    radial.normalize();
    const a = t * this.turns * Math.PI * 2;
    const r = this.coilRadiusCm;
    return target.set(
      p[0] + radial.x * Math.cos(a) * r,
      p[1] + 0.04 + Math.sin(a) * r,
      p[2] + radial.z * Math.cos(a) * r,
    );
  }
}

function bandGeometry(
  surface: BambooSurface,
  id: string,
  centerSCm: number,
  normalOffsetCm: number,
  widthCm: number,
  thicknessCm: number,
): THREE.BufferGeometry {
  const draft: StripDraft = {
    id,
    label: id,
    family: 'rim',
    group: '口沿',
    rootNo: 0,
    order: 0,
    widthCm,
    thicknessCm,
    closed: true,
    keys: [],
    frameAt: (t) => {
      const f = surface.frameSTheta(Math.max(0, Math.min(surface.lengthCm, centerSCm)), t * Math.PI * 2);
      const p: Vec3 = [
        f.p[0] + f.normal[0] * normalOffsetCm,
        f.p[1] + f.normal[1] * normalOffsetCm,
        f.p[2] + f.normal[2] * normalOffsetCm,
      ];
      return { p, normal: f.normal };
    },
  };
  const built = buildStripGeometry(draft, 0, 9999);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(built.geometry.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(built.geometry.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(built.geometry.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(built.geometry.colors, 3));
  g.setIndex(new THREE.BufferAttribute(built.geometry.indices, 1));
  return g;
}

export function createRimGroup(shape: ShapeDesign, rim: RimConfig, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'separate-rim-structure';
  const surface = new BambooSurface(shape);
  const perimeter = surface.perimeterAtS(surface.lengthCm);
  const coreRadius = rim.coreMm / 20;
  const wrapRadius = Math.max(0.08, rim.wrappingWidthMm / 20);
  const turns = Math.max(12, Math.round(perimeter / Math.max(0.25, rim.wrappingGapMm / 10 + wrapRadius)));

  const addMesh = (geometry: THREE.BufferGeometry): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  if (rim.kind === 'roll') {
    addMesh(new THREE.TubeGeometry(new MouthCurve(surface), 240, coreRadius, 12, true));
    addMesh(new THREE.TubeGeometry(new WrapCurve(surface, turns, coreRadius + wrapRadius * 0.55), Math.min(2600, turns * 8), wrapRadius, 6, true));
  } else if (rim.kind === 'bind') {
    const width = rim.coreMm / 10;
    addMesh(bandGeometry(surface, 'bind_outer', surface.lengthCm - width * 0.45, 0.09, width, 0.07));
    addMesh(bandGeometry(surface, 'bind_inner', surface.lengthCm - width * 0.45, -0.09, width, 0.07));
    addMesh(new THREE.TubeGeometry(new WrapCurve(surface, turns, width * 0.58), Math.min(2600, turns * 8), wrapRadius, 6, true));
  } else {
    const width = (rim.coreMm + 4) / 10;
    addMesh(bandGeometry(surface, 'insert_outer', surface.lengthCm - width * 0.55, 0.08, width, 0.08));
    addMesh(bandGeometry(surface, 'insert_tongue', surface.lengthCm - 2.2, -0.05, Math.max(0.55, rim.coreMm / 10), 0.06));

    const tabCount = Math.max(16, Math.round(perimeter / 2.2));
    const tab = new THREE.InstancedMesh(new THREE.BoxGeometry(Math.max(0.35, rim.wrappingWidthMm / 10), 2.5, 0.12), material, tabCount);
    const dummy = new THREE.Object3D();
    const mouth = surface.mouthState;
    for (let i = 0; i < tabCount; i += 1) {
      const theta = (i / tabCount) * Math.PI * 2;
      const r = mouth.r + 0.12;
      dummy.position.set(r * Math.cos(theta), shape.heightCm - 1.25, r * Math.sin(theta));
      dummy.rotation.set(0, Math.PI / 2 - theta, 0);
      dummy.updateMatrix();
      tab.setMatrixAt(i, dummy.matrix);
    }
    tab.castShadow = true;
    tab.receiveShadow = true;
    group.add(tab);
  }

  return group;
}
