import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuildResult } from '../lib/engine';
import type { MaterialPreset, RimConfig, ShapeDesign } from '../types';
import { createBambooMaterial } from '../lib/material3d';
import { createRimGroup } from './rimBuilder';

interface BasketViewerProps {
  result: BuildResult | null;
  material: MaterialPreset;
  shape: ShapeDesign;
  rim: RimConfig;
  step: number;
  showDanger: boolean;
  backlight: boolean;
  autoRotate: boolean;
}

export function BasketViewer(props: BasketViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const basketRef = useRef<THREE.Group | null>(null);
  const backLightRef = useRef<THREE.DirectionalLight | null>(null);
  const bambooMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const highlightMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  // 初始化场景，只执行一次。
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setContextError(null);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f5f0e6');
    scene.fog = new THREE.Fog('#f5f0e6', 95, 190);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 400);
    camera.position.set(43, 31, 54);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setContextError(`当前浏览器无法创建 WebGL 上下文：${message}`);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 18;
    controls.maxDistance = 130;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotateSpeed = 0.7;
    controlsRef.current = controls;

    const hemi = new THREE.HemisphereLight('#fff8e8', '#8a765d', 1.25);
    scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff0d2', 2.4);
    key.position.set(34, 58, 38);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -38;
    key.shadow.camera.right = 38;
    key.shadow.camera.top = 38;
    key.shadow.camera.bottom = -38;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 150;
    key.shadow.bias = -0.00015;
    key.shadow.normalBias = 0.025;
    scene.add(key);

    const fill = new THREE.DirectionalLight('#dcecff', 0.65);
    fill.position.set(-38, 24, 22);
    scene.add(fill);

    const back = new THREE.DirectionalLight('#ffd79a', 3.4);
    back.position.set(-24, 42, -48);
    back.target.position.set(0, 4, 0);
    back.castShadow = true;
    back.shadow.mapSize.set(4096, 4096);
    back.shadow.camera.left = -34;
    back.shadow.camera.right = 34;
    back.shadow.camera.top = 34;
    back.shadow.camera.bottom = -34;
    back.shadow.camera.near = 1;
    back.shadow.camera.far = 150;
    back.shadow.bias = -0.00008;
    back.shadow.normalBias = 0.012;
    scene.add(back);
    scene.add(back.target);
    backLightRef.current = back;

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: '#d8c29f', roughness: 0.82, metalness: 0 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.16;
    table.receiveShadow = true;
    scene.add(table);

    const grid = new THREE.GridHelper(120, 60, '#b8a783', '#ded2b8');
    grid.position.y = -0.155;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    scene.add(grid);

    const basket = new THREE.Group();
    basket.name = 'basket-root';
    scene.add(basket);
    basketRef.current = basket;

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      setContextError('WebGL 上下文已丢失；请刷新页面，或减少连续切换预览。');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      try {
        renderer.render(scene, camera);
      } catch (err) {
        cancelAnimationFrame(frame);
        const message = err instanceof Error ? err.message : String(err);
        setContextError(`三维渲染失败，通常是 WebGL 上下文丢失：${message}`);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      scene.traverse((obj) => {
        const renderable = obj as THREE.Mesh;
        if (renderable.geometry) renderable.geometry.dispose();
        const material = (renderable as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const disposeMaterial = (m: THREE.Material) => {
          const textured = m as THREE.MeshStandardMaterial;
          textured.map?.dispose();
          textured.bumpMap?.dispose();
          m.dispose();
        };
        if (Array.isArray(material)) material.forEach(disposeMaterial);
        else if (material) disposeMaterial(material);
      });
      sceneRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      basketRef.current = null;
    };
  }, []);

  // 重新生成篾片和口沿。
  useEffect(() => {
    const basket = basketRef.current;
    if (!basket) return;

    for (const child of [...basket.children]) {
      basket.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) child.geometry?.dispose();
    }
    bambooMaterialRef.current?.dispose();
    highlightMaterialRef.current?.dispose();

    if (!props.result) return;

    const bamboo = createBambooMaterial(props.material);
    bamboo.vertexColors = props.showDanger;
    bambooMaterialRef.current = bamboo;
    const highlight = new THREE.MeshStandardMaterial({
      color: '#ffc46b',
      emissive: '#ff7a00',
      emissiveIntensity: 0.45,
      roughness: 0.38,
      metalness: 0,
    });
    highlightMaterialRef.current = highlight;

    for (const strip of props.result.strips) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(strip.geometry.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(strip.geometry.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(strip.geometry.uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(strip.geometry.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(strip.geometry.indices, 1));
      geometry.computeBoundingSphere();

      const mesh = new THREE.Mesh(geometry, bamboo);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.stripId = strip.id;
      mesh.userData.order = strip.order;
      basket.add(mesh);
    }

    if (props.result.hexMarkers.length > 0) {
      const markerGeometry = new THREE.OctahedronGeometry(0.42, 0);
      const markerMaterial = new THREE.MeshBasicMaterial({ vertexColors: false });
      const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, props.result.hexMarkers.length);
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      props.result.hexMarkers.forEach((m, i) => {
        dummy.position.set(m.position[0], m.position[1], m.position[2]);
        dummy.scale.setScalar(0.7 + m.severity * 0.8);
        dummy.updateMatrix();
        markers.setMatrixAt(i, dummy.matrix);
        color.set(m.severity > 0.72 ? '#e11d12' : '#f59e0b');
        markers.setColorAt(i, color);
      });
      markers.instanceMatrix.needsUpdate = true;
      if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
      markers.userData.isMarker = true;
      basket.add(markers);
    }

    const rimMaterial = bamboo.clone();
    rimMaterial.vertexColors = false;
    rimMaterial.needsUpdate = true;
    const rim = createRimGroup(props.shape, props.rim, rimMaterial);
    rim.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    basket.add(rim);

    if (controlsRef.current) {
      controlsRef.current.target.y = props.shape.heightCm * 0.48;
      controlsRef.current.update();
    }

    return () => {
      bamboo.dispose();
      highlight.dispose();
      rimMaterial.dispose();
    };
  }, [props.result, props.material, props.shape, props.rim]);

  // 回放显隐和当前根高亮。
  useEffect(() => {
    const basket = basketRef.current;
    const bamboo = bambooMaterialRef.current;
    const highlight = highlightMaterialRef.current;
    if (!basket || !bamboo || !highlight) return;

    basket.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.stripId) return;
      const order = Number(obj.userData.order ?? 0);
      obj.visible = order <= props.step;
      if (obj.visible) obj.material = order === props.step ? highlight : bamboo;
    });
  }, [props.step, props.result]);

  useEffect(() => {
    if (bambooMaterialRef.current) {
      bambooMaterialRef.current.vertexColors = props.showDanger;
      bambooMaterialRef.current.needsUpdate = true;
    }
  }, [props.showDanger]);

  useEffect(() => {
    if (backLightRef.current) backLightRef.current.intensity = props.backlight ? 3.6 : 0.35;
  }, [props.backlight]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = props.autoRotate;
  }, [props.autoRotate]);

  return (
    <div ref={hostRef} className="viewer-host" aria-label="竹编三维预览">
      {contextError && (
        <div style={{ position: 'absolute', inset: 16, display: 'grid', placeItems: 'center', zIndex: 5 }}>
          <div className="panel" style={{ maxWidth: 460, background: 'rgba(255,253,247,.96)' }}>
            <h3>三维预览暂不可用</h3>
            <p className="formula" style={{ marginBottom: 12 }}>{contextError}</p>
            <button className="btn primary" onClick={() => window.location.reload()}>刷新并重试</button>
          </div>
        </div>
      )}
    </div>
  );
}
