import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { BambooSpecies, StripMaterial, VesselProfile, WeavePattern } from '../types';
import { WeaveEngine, type WeaveBuildResult } from '../geometry/weave';
import { VesselSurface } from '../geometry/surface';
import { buildRimGeometry } from '../geometry/rim';
import { buildBambooMaterial } from '../geometry/materials';
import { useStore } from '../state/store';

interface Props {
  profile: VesselProfile;
  pattern: WeavePattern;
  material: StripMaterial;
  species: BambooSpecies;
  rim: { kind: 'rolled' | 'wrapped' | 'socket'; size: number; wrapSpacing: number };
  playStep: number | null;
  onBuilt: (r: WeaveBuildResult) => void;
}

export function ViewerCanvas({ profile, pattern, material, species, rim, playStep, onBuilt }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const backlight = useStore((s) => s.backlight);
  const [stats, setStats] = useState({ ms: 0, strips: 0, crossings: 0 });
  const engineRef = useRef<WeaveEngine | null>(null);
  const bambooRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  const ctx = useMemo(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1d2126);
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    camera.position.set(420, 320, 520);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff3dd, 1.1);
    key.position.set(300, 500, 250);
    scene.add(key);

    const back = new THREE.SpotLight(0xfff0d0, 0, 1200, Math.PI / 5, 0.45, 1.2);
    back.position.set(0, 700, -350);
    back.castShadow = true;
    back.shadow.mapSize.set(2048, 2048);
    back.shadow.camera.near = 50;
    back.shadow.camera.far = 1400;
    back.shadow.bias = -0.0004;
    const target = new THREE.Object3D();
    target.position.set(0, 60, 0);
    scene.add(target);
    back.target = target;
    scene.add(back);

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.85 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -2;
    table.receiveShadow = true;
    scene.add(table);

    return { scene, camera, back };
  }, []);

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(ctx.camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, profile.height * 0.45, 0);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      ctx.camera.aspect = w / h;
      ctx.camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(ctx.scene, ctx.camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    ctx.back.intensity = backlight ? 600 : 0;
  }, [backlight, ctx]);

  // 完整重建(参数变化)
  useEffect(() => {
    const scene = ctx.scene;
    const old = scene.getObjectByName('weaveGroup');
    if (old) {
      scene.remove(old);
      old.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    }
    bambooRef.current?.dispose();

    const engine = new WeaveEngine(profile, pattern, material, species);
    engineRef.current = engine;
    const result = engine.build();
    onBuilt(result);
    setStats({ ms: result.buildMs, strips: result.stripCount, crossings: result.crossingCount });

    const group = new THREE.Group();
    group.name = 'weaveGroup';
    const bamboo = buildBambooMaterial(material);
    bambooRef.current = bamboo;
    const weaveMesh = new THREE.Mesh(result.geometry, bamboo);
    weaveMesh.name = 'weaveMesh';
    weaveMesh.castShadow = true;
    weaveMesh.receiveShadow = true;
    group.add(weaveMesh);

    const surface = new VesselSurface(profile);
    const rimMesh = new THREE.Mesh(buildRimGeometry(surface, rim, material.thickness), bamboo);
    rimMesh.name = 'rimMesh';
    rimMesh.castShadow = true;
    group.add(rimMesh);

    for (const m of result.distortionMarks) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(3.2, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffc020 }),
      );
      ball.position.set(...m.position);
      group.add(ball);
    }
    for (const v of result.bendViolations) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(3.6, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }),
      );
      ball.position.set(...v.position);
      group.add(ball);
    }
    scene.add(group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, pattern, material, species, rim, ctx]);

  // 回放:按步序替换编织几何
  useEffect(() => {
    const group = ctx.scene.getObjectByName('weaveGroup');
    const engine = engineRef.current;
    if (!group || !engine) return;
    const mesh = group.getObjectByName('weaveMesh') as THREE.Mesh;
    if (!mesh) return;
    if (playStep === null) {
      const full = engine.build();
      mesh.geometry.dispose();
      mesh.geometry = full.geometry;
      mesh.visible = true;
      return;
    }
    const { geometry } = engine.buildStepGeometry(playStep);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }, [playStep, ctx]);

  return (
    <div className="viewer-wrap">
      <div ref={mountRef} className="viewer-canvas" />
      <div className="viewer-stats">
        重建 {stats.ms.toFixed(0)} ms · {stats.strips} 根篾 · {stats.crossings} 个交叉点
      </div>
    </div>
  );
}
