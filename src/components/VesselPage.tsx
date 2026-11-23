import { useState } from 'react';
import type { VesselSpec } from '../types';
import { useStore } from '../data/store';
import { Button, Card, Field, NumberInput, Slider, TextInput } from './controls';

export function VesselPage() {
  const { vessels, activeProject, saveVessel, createVessel, remove, setActiveProject } =
    useStore();
  const vessel = vessels.find((v) => v.id === activeProject?.vesselId);
  const [creating, setCreating] = useState(false);

  if (!vessel) return <div className="empty">暂无器型</div>;

  const update = (patch: Partial<VesselSpec>) => {
    void saveVessel({ ...vessel, ...patch });
  };

  return (
    <>
      <div className="sidebar">
        <Card title="器型库">
          <div className="entity-list">
            {vessels.map((v) => (
              <div
                key={v.id}
                className={`entity-item ${v.id === vessel.id ? 'active' : ''}`}
                onClick={() =>
                  activeProject &&
                  setActiveProject({ ...activeProject, vesselId: v.id })
                }
              >
                <div>
                  <div className="name">{v.name}</div>
                  <div className="sub">
                    口{v.mouthDiameter} / 腹{v.bellyDiameter} / 底
                    {v.bottomDiameter} · 高{v.height}mm
                  </div>
                </div>
                <Button
                  variant="danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (vessels.length > 1) void remove('vessels', v.id);
                  }}
                >
                  删
                </Button>
              </div>
            ))}
          </div>
          <Button
            onClick={async () => {
              setCreating(true);
              const v = await createVessel();
              if (activeProject)
                setActiveProject({ ...activeProject, vesselId: v.id });
              setCreating(false);
            }}
            disabled={creating}
          >
            新建器型
          </Button>
        </Card>

        <Card title="轮廓参数(回转体)">
          <Field label="名称">
            <TextInput value={vessel.name} onChange={(name) => update({ name })} />
          </Field>
          <div className="row2">
            <Field label="口径" unit="mm">
              <NumberInput
                value={vessel.mouthDiameter}
                min={40}
                onChange={(mouthDiameter) => update({ mouthDiameter })}
              />
            </Field>
            <Field label="腹径" unit="mm">
              <NumberInput
                value={vessel.bellyDiameter}
                min={40}
                onChange={(bellyDiameter) => update({ bellyDiameter })}
              />
            </Field>
          </div>
          <div className="row2">
            <Field label="底径" unit="mm">
              <NumberInput
                value={vessel.bottomDiameter}
                min={30}
                onChange={(bottomDiameter) => update({ bottomDiameter })}
              />
            </Field>
            <Field label="高度" unit="mm">
              <NumberInput
                value={vessel.height}
                min={40}
                onChange={(height) => update({ height })}
              />
            </Field>
          </div>
          <Field label={`腹径位置(高度 ${(vessel.bellyT * 100).toFixed(0)}%)`}>
            <Slider
              value={vessel.bellyT}
              min={0.05}
              max={0.95}
              step={0.01}
              onChange={(bellyT) => update({ bellyT })}
            />
          </Field>
        </Card>

        <Card title="变截面(方底圆口)">
          <Field
            label={`底部截面指数 ${vessel.bottomExponent.toFixed(1)}(2=圆,≥4=方)`}
          >
            <Slider
              value={vessel.bottomExponent}
              min={2}
              max={6}
              step={0.1}
              onChange={(bottomExponent) => update({ bottomExponent })}
            />
          </Field>
          <Field label={`口部截面指数 ${vessel.mouthExponent.toFixed(1)}`}>
            <Slider
              value={vessel.mouthExponent}
              min={2}
              max={6}
              step={0.1}
              onChange={(mouthExponent) => update({ mouthExponent })}
            />
          </Field>
          <div className="legend">
            <span>指数 2:圆</span>
            <span>指数 4:近方</span>
            <span>指数 6:偏方</span>
          </div>
        </Card>

        <Card title="采样精度">
          <div className="row2">
            <Field label="周向段数">
              <NumberInput
                value={vessel.radialSegments}
                min={48}
                max={256}
                onChange={(radialSegments) => update({ radialSegments })}
              />
            </Field>
            <Field label="高度段数">
              <NumberInput
                value={vessel.heightSegments}
                min={32}
                max={160}
                onChange={(heightSegments) => update({ heightSegments })}
              />
            </Field>
          </div>
        </Card>
      </div>
    </>
  );
}
