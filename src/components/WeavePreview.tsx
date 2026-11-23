import { useEffect, useRef } from 'react';
import type { BuildResult, MaterialSpec } from '../types';
import { WeaveScene, type SceneOptions } from '../three/WeaveScene';

interface Props {
  result: BuildResult | null;
  material: MaterialSpec | undefined;
  options: SceneOptions;
  step: number | null; // null=显示全部
  materialVersion: number; // 篾料变更计数,强制刷新纹理
  onSceneReady?: (scene: WeaveScene) => void;
}

export function WeavePreview({
  result,
  material,
  options,
  step,
  materialVersion,
  onSceneReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<WeaveScene | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!hostRef.current || readyRef.current) return;
    const scene = new WeaveScene(hostRef.current);
    sceneRef.current = scene;
    readyRef.current = true;
    onSceneReady?.(scene);
    return () => {
      scene.dispose();
      sceneRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !result || !material) return;
    scene.setBuild(result, material);
    scene.setOptions(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.refreshMaterial(material!);
    if (result && material) scene.setBuild(result, material);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialVersion]);

  useEffect(() => {
    sceneRef.current?.setOptions(options);
  }, [options]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (step === null) scene.setStep(Number.MAX_SAFE_INTEGER);
    else scene.setStep(step);
  }, [step]);

  return <div ref={hostRef} className="preview-host" />;
}
