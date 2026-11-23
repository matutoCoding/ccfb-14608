import { useStore } from '../data/store';
import type { WeaveFamily, WeaveSpec } from '../types';
import {
  WEAVE_PRESETS,
  defaultPatternFor,
  resizePattern,
} from '../core/patterns';
import { recalcWarpCount, recalcWeftCount } from '../core/weaveBuilder';
import { VesselSurface } from '../core/vessel';
import { Button, Card, Field, NumberInput, Select, Slider, TextInput } from './controls';
import { PatternGrid } from './PatternGrid';

const FAMILY_LABEL: Record<WeaveFamily, string> = {
  plain: '十字编',
  twill: '斜纹编',
  herringbone: '人字编',
  hex: '六角孔编',
};
const BASE_LABEL = { chrysanthemum: '菊花底起底', plain: '平编底' } as const;
const RIM_LABEL = {
  roll: '卷口',
  wrap: '包边',
  socket: '插口',
  none: '不收口',
} as const;

export function WeavePage() {
  const {
    weaves,
    vessels,
    materials,
    activeProject,
    saveWeave,
    createWeave,
    remove,
    setActiveProject,
  } = useStore();
  const weave = weaves.find((w) => w.id === activeProject?.weaveId);
  const vessel = vessels.find((v) => v.id === activeProject?.vesselId);
  const material = materials.find((m) => m.id === activeProject?.materialId);

  if (!weave || !vessel || !material)
    return <div className="empty">请先完善器型与篾料</div>;

  const update = (patch: Partial<WeaveSpec>) =>
    void saveWeave({ ...weave, ...patch });

  const switchFamily = (family: WeaveFamily) => {
    const p = defaultPatternFor(family);
    update({
      family,
      patternRows: p.rows,
      patternCols: p.cols,
      pattern: p.pattern,
      gapH: family === 'hex' ? 10 : 1.5,
    });
  };

  const surface = new VesselSurface(vessel);
  const ctx = { vessel: surface, weave, material };
  const warpCount = recalcWarpCount(ctx);
  const weftCount = recalcWeftCount(ctx);

  return (
    <div className="sidebar">
      <Card title="编法库">
        <div className="entity-list">
          {weaves.map((w) => (
            <div
              key={w.id}
              className={`entity-item ${w.id === weave.id ? 'active' : ''}`}
              onClick={() =>
                activeProject &&
                setActiveProject({ ...activeProject, weaveId: w.id })
              }
            >
              <div>
                <div className="name">{w.name}</div>
                <div className="sub">
                  {FAMILY_LABEL[w.family]} · 篾宽{w.stripWidth}mm
                </div>
              </div>
              <Button
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  if (weaves.length > 1) void remove('weaves', w.id);
                }}
              >
                删
              </Button>
            </div>
          ))}
        </div>
        <Button
          onClick={async () => {
            const w = await createWeave(weave.family);
            if (activeProject) setActiveProject({ ...activeProject, weaveId: w.id });
          }}
        >
          新建编法
        </Button>
      </Card>

      <Card title="编法类型">
        <Field label="名称">
          <TextInput value={weave.name} onChange={(name) => update({ name })} />
        </Field>
        <div className="row2">
          <Field label="主编法">
            <Select
              value={weave.family}
              options={(Object.keys(FAMILY_LABEL) as WeaveFamily[]).map((f) => ({
                value: f,
                label: FAMILY_LABEL[f],
              }))}
              onChange={switchFamily}
            />
          </Field>
          <Field label="起底">
            <Select
              value={weave.baseStyle}
              options={Object.entries(BASE_LABEL).map(([value, label]) => ({
                value: value as WeaveSpec['baseStyle'],
                label,
              }))}
              onChange={(baseStyle) => update({ baseStyle })}
            />
          </Field>
        </div>
        <Field label="收口锁边">
          <Select
            value={weave.rimType}
            options={Object.entries(RIM_LABEL).map(([value, label]) => ({
              value: value as WeaveSpec['rimType'],
              label,
            }))}
            onChange={(rimType) => update({ rimType })}
          />
        </Field>
        <div className="kpi">
          <div className="item">
            <div className="num">{warpCount}</div>
            <div className="lbl">重算经篾根数</div>
          </div>
          <div className="item">
            <div className="num">{weftCount}</div>
            <div className="lbl">重算纬圈根数</div>
          </div>
        </div>
      </Card>

      <Card title="篾片规格">
        <div className="row2">
          <Field label="篾宽" unit="mm">
            <NumberInput
              value={weave.stripWidth}
              min={1}
              step={0.1}
              onChange={(stripWidth) => update({ stripWidth })}
            />
          </Field>
          <Field label="篾厚" unit="mm">
            <NumberInput
              value={weave.stripThickness}
              min={0.3}
              step={0.1}
              onChange={(stripThickness) => update({ stripThickness })}
            />
          </Field>
        </div>
        <div className="row2">
          <Field label="周向间隙" unit="mm">
            <NumberInput
              value={weave.gapH}
              min={0}
              step={0.5}
              onChange={(gapH) => update({ gapH })}
            />
          </Field>
          <Field label="高度间隙" unit="mm">
            <NumberInput
              value={weave.gapV}
              min={0}
              step={0.5}
              onChange={(gapV) => update({ gapV })}
            />
          </Field>
        </div>
      </Card>

      {weave.family === 'hex' ? (
        <Card title="六角孔规则">
          <Field label="挑压循环(三组共用,1=上挑)">
            <div
              className="grid-editor"
              style={{ gridTemplateColumns: `repeat(${weave.hexCycle.length}, 1fr)` }}
            >
              {weave.hexCycle.map((v, i) => (
                <div
                  key={i}
                  className={`cell ${v === 1 ? 'on' : 'off'}`}
                  onClick={() =>
                    update({
                      hexCycle: weave.hexCycle.map((x, j) =>
                        j === i ? (x === 1 ? 0 : 1) : x,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <div className="row2">
            <Field label="循环节长度">
              <NumberInput
                value={weave.hexCycle.length}
                min={2}
                max={12}
                onChange={(n) => {
                  const arr = Array.from({ length: n }, (_, i) => i % 2);
                  update({ hexCycle: arr });
                }}
              />
            </Field>
            <Field label="畸变容差" unit="%">
              <NumberInput
                value={Math.round(weave.hexTolerance * 100)}
                min={2}
                max={30}
                onChange={(p) => update({ hexTolerance: p / 100 })}
              />
            </Field>
          </div>
          <Field label={`容差 ${(weave.hexTolerance * 100).toFixed(0)}%`}>
            <Slider
              value={weave.hexTolerance}
              min={0.02}
              max={0.3}
              step={0.01}
              onChange={(hexTolerance) => update({ hexTolerance })}
            />
          </Field>
        </Card>
      ) : (
        <Card
          title={`挑压格子图(${WEAVE_PRESETS[weave.family].label})`}
          extra={
            <Button
              onClick={() => {
                const p = defaultPatternFor(weave.family);
                update({
                  patternRows: p.rows,
                  patternCols: p.cols,
                  pattern: p.pattern,
                });
              }}
            >
              复位{WEAVE_PRESETS[weave.family].label}
            </Button>
          }
        >
          <PatternGrid
            weave={weave}
            onChange={(pattern) => update({ pattern })}
          />
          <div className="row2">
            <Field label="行数(纬周期)">
              <NumberInput
                value={weave.patternRows}
                min={2}
                max={16}
                onChange={(rows) =>
                  update({
                    patternRows: rows,
                    pattern: resizePattern(weave.pattern, rows, weave.patternCols),
                  })
                }
              />
            </Field>
            <Field label="列数(经周期)">
              <NumberInput
                value={weave.patternCols}
                min={2}
                max={16}
                onChange={(cols) =>
                  update({
                    patternCols: cols,
                    pattern: resizePattern(weave.pattern, weave.patternRows, cols),
                  })
                }
              />
            </Field>
          </div>
        </Card>
      )}

      <Card title="起底与收口参数">
        <div className="row2">
          <Field label="菊花底辐条数">
            <NumberInput
              value={weave.baseSpokes}
              min={8}
              step={2}
              onChange={(baseSpokes) => update({ baseSpokes })}
            />
          </Field>
          <Field label="底圈数">
            <NumberInput
              value={weave.baseRingCount}
              min={1}
              max={8}
              onChange={(baseRingCount) => update({ baseRingCount })}
            />
          </Field>
        </div>
        <div className="row2">
          <Field label="收口篾宽" unit="mm">
            <NumberInput
              value={weave.rimWidth}
              min={4}
              onChange={(rimWidth) => update({ rimWidth })}
            />
          </Field>
          <Field label="收口篾厚" unit="mm">
            <NumberInput
              value={weave.rimThickness}
              min={0.5}
              step={0.1}
              onChange={(rimThickness) => update({ rimThickness })}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}
