import * as THREE from 'three';
import type {
  BuildResult,
  HexIssue,
  MaterialSpec,
  RibbonMeshData,
} from '../types';
import { bambooLook, makeFiberTexture } from '../core/materials';

export interface SceneOptions {
  backlight: boolean;
  showMarkers: boolean; // 弯曲标红 + 六角畸变
  groundShadow: boolean;
}

/**
 * three.js 场景封装:命令式管理,React 只负责挂载/更新参数。
 * 所有篾片各自一个 Mesh(数量百级,draw call 可接受,且便于按 order 回放)。
 */
export class WeaveScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private ribbonGroup = new THREE.Group();
  private markerGroup = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private keyLight: THREE.DirectionalLight;
  private backLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ground: THREE.Mesh;
  private orbit: { az: number; el: number; dist: number; target: THREE.Vector3 };
  private dragging = false;
  private lastXY: [number, number] = [0, 0];
  private texture: THREE.Texture | null = null;
  private material: THREE.MeshPhysicalMaterial | null = null;
  private container: HTMLElement;
  private resizeObs: ResizeObserver;
  private raf = 0;
  private opts: SceneOptions = {
    backlight: true,
    showMarkers: true,
    groundShadow: true,
  };

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141614);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 5000);

    this.hemi = new THREE.HemisphereLight(0xdfe8d8, 0x2a2118, 0.55);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(0xfff2dd, 2.2);
    this.keyLight.position.set(260, 420, 300);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    const d = 420;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.far = 1600;
    this.keyLight.shadow.bias = -0.0006;
    this.scene.add(this.keyLight);

    // 逆光:从后下方打向器型,光穿过六角孔在桌面投光斑
    this.backLight = new THREE.DirectionalLight(0xffe9c4, 3.4);
    this.backLight.position.set(-180, 120, -360);
    this.backLight.castShadow = true;
    this.backLight.shadow.mapSize.set(2048, 2048);
    this.backLight.shadow.camera.left = -d;
    this.backLight.shadow.camera.right = d;
    this.backLight.shadow.camera.top = d;
    this.backLight.shadow.camera.bottom = -d;
    this.backLight.shadow.camera.far = 1600;
    this.backLight.shadow.bias = -0.0004;
    this.scene.add(this.backLight);

    // 桌面:接收孔斑
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a2f24,
      roughness: 0.85,
    });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -4;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.scene.add(this.ribbonGroup);
    this.scene.add(this.markerGroup);

    this.orbit = { az: 0.7, el: 0.42, dist: 720, target: new THREE.Vector3(0, 90, 0) };
    this.bindControls();
    this.applyCamera();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.loop();
  }

  private bindControls() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastXY = [e.clientX, e.clientY];
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const [x0, y0] = this.lastXY;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      this.lastXY = [e.clientX, e.clientY];
      this.orbit.az -= dx * 0.006;
      this.orbit.el = Math.max(0.08, Math.min(1.45, this.orbit.el - dy * 0.006));
      this.applyCamera();
    });
    el.addEventListener('pointerup', () => (this.dragging = false));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.dist = Math.max(
        180,
        Math.min(1800, this.orbit.dist * (1 + e.deltaY * 0.001)),
      );
      this.applyCamera();
    }, { passive: false });
  }

  private applyCamera() {
    const { az, el, dist, target } = this.orbit;
    this.camera.position.set(
      target.x + dist * Math.cos(el) * Math.cos(az),
      target.y + dist * Math.sin(el),
      target.z + dist * Math.cos(el) * Math.sin(az),
    );
    this.camera.lookAt(target);
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.renderer.render(this.scene, this.camera);
  };

  setOptions(opts: Partial<SceneOptions>) {
    Object.assign(this.opts, opts);
    this.backLight.visible = this.opts.backlight;
    this.ground.visible = this.opts.groundShadow;
    this.markerGroup.visible = this.opts.showMarkers;
    this.meshes.forEach((m) => {
      const mat = m.material as THREE.MeshPhysicalMaterial;
      mat.vertexColors = this.opts.showMarkers;
    });
  }

  /** 重建篾片几何。核心热路径:仅替换 BufferGeometry,材质/纹理复用。 */
  setBuild(result: BuildResult, materialSpec: MaterialSpec) {
    this.disposeRibbons();
    this.disposeMarkers();
    if (!this.texture) {
      const url = makeFiberTexture(materialSpec);
      this.texture = new THREE.TextureLoader().load(url);
      this.texture.wrapS = THREE.RepeatWrapping;
      this.texture.wrapT = THREE.RepeatWrapping;
      this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const look = bambooLook(materialSpec);
      this.material = new THREE.MeshPhysicalMaterial({
        map: this.texture,
        vertexColors: true,
        roughness: look.roughness,
        clearcoat: look.clearcoat,
        clearcoatRoughness: 0.35,
        sheen: look.sheen,
        sheenColor: new THREE.Color(look.base[0], look.base[1], look.base[2]),
        side: THREE.DoubleSide,
      });
    }

    for (const data of result.ribbons) {
      const geo = this.toGeometry(data);
      const mesh = new THREE.Mesh(geo, this.material!);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.order = data.order;
      mesh.userData.label = data.label;
      this.ribbonGroup.add(mesh);
      this.meshes.push(mesh);
    }
    this.addHexMarkers(result.hexIssues);
    this.setOptions(this.opts);
  }

  private toGeometry(data: RibbonMeshData): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  private addHexMarkers(issues: HexIssue[]) {
    const geo = new THREE.SphereGeometry(1.8, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a1e });
    for (const iss of issues.slice(0, 60)) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(iss.center[0], iss.center[1], iss.center[2]);
      this.markerGroup.add(m);
    }
  }

  /** 回放:只显示 order ≤ step 的篾片,并高亮当前根 */
  setStep(step: number) {
    for (const mesh of this.meshes) {
      const order = mesh.userData.order as number;
      mesh.visible = order <= step;
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      mat.emissive = new THREE.Color(order === step ? 0x35421f : 0x000000);
      mat.emissiveIntensity = order === step ? 0.9 : 0;
    }
  }

  maxStep(): number {
    return this.meshes.reduce((m, x) => Math.max(m, x.userData.order as number), 0);
  }

  private disposeRibbons() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      this.ribbonGroup.remove(m);
    }
    this.meshes = [];
  }

  private disposeMarkers() {
    this.markerGroup.clear();
  }

  /** 换篾料时刷新纹理与材质参数 */
  refreshMaterial(spec: MaterialSpec) {
    this.texture?.dispose();
    this.material?.dispose();
    this.texture = null;
    this.material = null;
    const prev = this.meshes.length;
    void prev;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.disposeRibbons();
    this.disposeMarkers();
    this.texture?.dispose();
    this.material?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
