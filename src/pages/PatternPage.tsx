import { useState } from 'react';
import type { WeaveKind, WeavePattern } from '../types';
import { uid } from '../db/indexeddb';
import { useStore } from '../state/store';
import { Button, Card, Field, NumberInput, Select } from '../components/ui';

const KIND_LABEL: Record<WeaveKind, string> = {
  cross: '十字编',
  herringbone: '人字编',
  hex: '六角孔编',
  chrysanthemum: '菊花底起底',
};

function blankPattern(kind: WeaveKind): WeavePattern {
  const t = Date.now();
  return {
    id: uid('pattern'),
    name: `新${KIND_LABEL[kind]}`,
    kind,
    matrix: [
      [1, 0],
      [0, 1],
    ],
    hexCellSize: 24,
    chrysanthemumSpokes: 16,
    note: '',
    createdAt: t,
    updatedAt: t,
  };
}

export function PatternPage() {
  const { patterns, savePattern, removePattern, select, selectedPatternId } = useStore();
  const selected = patterns.find((x) => x.id === selectedPatternId) ?? patterns[0];
  const [draft, setDraft] = useState<WeavePattern | null>(null);
  const p = draft ?? selected;
  if (!p) return <div className="empty">暂无编法</div>;

  const update = (patch: Partial<WeavePattern>) => setDraft({ ...p, ...patch });
  const toggleCell = (r: number, c: number) => {
    const matrix = p.matrix.map((row) => [...row]);
    matrix[r][c] = matrix[r][c] === 1 ? 0 : 1;
    update({ matrix });
  };
  const resize = (rows: number, cols: number) => {
    const matrix = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => p.matrix[r % p.matrix.length]?.[c % p.matrix[0].length] ?? ((r + c) % 2)),
    );
    update({ matrix });
  };

  return (
    <div className="page-grid">
      <Card title="编法库">
        <div className="item-list">
          {patterns.map((x) => (
            <div
              key={x.id}
              className={`item ${x.id === p.id ? 'active' : ''}`}
              onClick={() => {
                setDraft(null);
                select('pattern', x.id);
              }}
            >
              <span>{x.name}</span>
              <button
                className="link-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  removePattern(x.id);
                }}
              >
                删
              </button>
            </div>
          ))}
        </div>
        <div className="btn-row">
          {(['cross', 'herringbone', 'hex', 'chrysanthemum'] as WeaveKind[]).map((k) => (
            <Button key={k} onClick={() => {
              const v = blankPattern(k);
              savePattern(v);
              setDraft(v);
              select('pattern', v.id);
            }}>
              新建{KIND_LABEL[k]}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="挑压规律格子图">
        <Field label="名称">
          <input className="select" value={p.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="编法类型">
          <Select
            value={p.kind}
            onChange={(kind) => update({ kind })}
            options={(Object.keys(KIND_LABEL) as WeaveKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
        </Field>

        <div className="matrix-block">
          <div className="matrix-axis">行=纬向周期,列=经向周期(挑=亮/1,压=暗/0)</div>
          <div
            className="matrix"
            style={{ gridTemplateColumns: `repeat(${p.matrix[0].length}, 44px)` }}
          >
            {p.matrix.map((row, r) =>
              row.map((cell, c) => (
                <button
                  key={`${r}-${c}`}
                  className={`matrix-cell ${cell === 1 ? 'over' : 'under'}`}
                  onClick={() => toggleCell(r, c)}
                  title={`[${r},${c}] ${cell === 1 ? '挑' : '压'}`}
                >
                  {cell}
                </button>
              )),
            )}
          </div>
          <div className="btn-row">
            <span className="hint">周期:</span>
            {[2, 3, 4].map((n) => (
              <Button key={n} onClick={() => resize(n, n)}>
                {n}×{n}
              </Button>
            ))}
            <Button onClick={() => resize(p.matrix.length + 1, p.matrix[0].length)}>+行</Button>
            <Button onClick={() => resize(p.matrix.length, p.matrix[0].length + 1)}>+列</Button>
          </div>
        </div>

        {p.kind === 'hex' && (
          <Field label="六角孔对边距(孔心间距)" hint="改孔径 → 漏光光斑同步变化">
            <NumberInput value={p.hexCellSize ?? 24} min={8} max={80} onChange={(v) => update({ hexCellSize: v })} unit="mm" />
          </Field>
        )}
        {p.kind === 'chrysanthemum' && (
          <Field label="放射篾根数(偶数)">
            <NumberInput
              value={p.chrysanthemumSpokes ?? 16}
              min={8}
              max={48}
              step={2}
              onChange={(v) => update({ chrysanthemumSpokes: v })}
            />
          </Field>
        )}

        <Field label="备注">
          <input className="select" value={p.note} onChange={(e) => update({ note: e.target.value })} />
        </Field>
        <div className="btn-row end">
          <Button
            primary
            onClick={async () => {
              await savePattern(p);
              setDraft(null);
              select('pattern', p.id);
            }}
          >
            保存并作用到器型
          </Button>
        </div>
      </Card>

      <Card title="挑压说明">
        <ul className="note-list">
          <li>格子值 1 = 本纬篾在经篾上方(挑),0 = 压在下方。</li>
          <li>矩阵是一个周期单元,编织时按行列取模铺满整个器型。</li>
          <li>人字编在器型中线自动镜像列序,形成人字形斜纹。</li>
          <li>六角孔编由三向篾 60° 交织,格子决定相邻交叉点的上下轮换。</li>
          <li>每次修改保存后,三维预览立即按新规律重算所有交叉点。</li>
        </ul>
      </Card>
    </div>
  );
}
