import { useRef } from 'react';
import { NumberInput } from '../components/NumberInput';
import { db, saveProjectPatch } from '../db';
import { defaultCells } from '../lib/defaults';
import { uid } from '../lib/vec';
import type { ProjectDoc, WeaveDesign, WeaveKind } from '../types';

interface WeavePageProps {
  weaves: WeaveDesign[];
  current: WeaveDesign;
  project: ProjectDoc;
}

const KIND_INFO: Array<{ key: WeaveKind; name: string; desc: string }> = [
  { key: 'cross', name: '十字编', desc: '经篾与圈篾正交，适合果篮、收纳筐身。' },
  { key: 'herringbone', name: '人字编', desc: '斜纹 2/2 挑压并镜像成人字。' },
  { key: 'hex', name: '六角孔编', desc: '三向 60° 格线，漏光孔随 hexHoleMm 改变。' },
  { key: 'chrysanthemum', name: '菊花底', desc: '通长放射篾过中心，配同心圆起底。' },
];

async function putWeave(w: WeaveDesign) {
  await db.weaves.put({ ...w, updatedAt: Date.now() });
}

function resizeCells(cells: boolean[][], rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cells[r]?.[c] ?? ((r + c) % 2 === 0)));
}

function GridEditor({ weave, onChange }: { weave: WeaveDesign; onChange: (cells: boolean[][]) => void }) {
  const paintValue = useRef<boolean | null>(null);

  function setCell(r: number, c: number, value: boolean) {
    if (weave.cells[r]?.[c] === value) return;
    onChange(weave.cells.map((row, ri) => row.map((cell, ci) => (ri === r && ci === c ? value : cell))));
  }

  return (
    <div
      className="grid-editor"
      style={{ gridTemplateColumns: `repeat(${weave.cols}, 27px)` }}
      onPointerUp={() => { paintValue.current = null; }}
      onPointerLeave={() => { paintValue.current = null; }}
    >
      {weave.cells.map((row, r) =>
        row.map((cell, c) => (
          <button
            key={`${r}-${c}`}
            className={`grid-cell ${cell ? 'over' : ''}`}
            aria-label={`第 ${r + 1} 行第 ${c + 1} 列，${cell ? '第一族在上' : '第二族在上'}`}
            onPointerDown={(e) => {
              e.preventDefault();
              paintValue.current = !cell;
              setCell(r, c, !cell);
            }}
            onPointerEnter={() => {
              if (paintValue.current !== null) setCell(r, c, paintValue.current);
            }}
          />
        )),
      )}
    </div>
  );
}

export function WeavePage({ weaves, current, project }: WeavePageProps) {
  function patch(p: Partial<WeaveDesign>) {
    void putWeave({ ...current, ...p });
  }

  async function createWeave() {
    const copy: WeaveDesign = { ...current, id: uid('weave'), name: `${current.name} 副本`, updatedAt: Date.now() };
    await db.weaves.put(copy);
    await saveProjectPatch({ weaveId: copy.id });
  }

  async function removeWeave() {
    if (weaves.length <= 1) return;
    if (!window.confirm(`删除编法“${current.name}”？`)) return;
    await db.weaves.delete(current.id);
    const next = weaves.find((w) => w.id !== current.id);
    if (next) await saveProjectPatch({ weaveId: next.id });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>编法与挑压格子</h2>
          <p>黑格表示第一族篾在该交叉点在上，白格表示在下。格子按行列循环映射到整器；修改会直接驱动三维篾片的上下让位。</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={createWeave}>复制编法</button>
          <button className="btn danger" disabled={weaves.length <= 1} onClick={removeWeave}>删除</button>
        </div>
      </div>

      <div className="weave-kind-grid" style={{ marginBottom: 16 }}>
        {KIND_INFO.map((k) => (
          <button key={k.key} className={`kind-card ${current.kind === k.key ? 'active' : ''}`}
            onClick={() => {
              const rows = k.key === 'chrysanthemum' ? 12 : current.rows;
              const cols = k.key === 'chrysanthemum' ? 16 : current.cols;
              patch({ kind: k.key, rows, cols, cells: defaultCells(k.key, rows, cols) });
            }}>
            <strong>{k.name}</strong>
            <span>{k.desc}</span>
          </button>
        ))}
      </div>

      <div className="layout-grid three-two">
        <section className="panel">
          <h3>格子图编辑器 <span className="tag">点击/拖动批量挑压</span></h3>
          <GridEditor weave={current} onChange={(cells) => patch({ cells })} />
          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="field">
              <label>循环行数 {current.rows}</label>
              <input type="range" min={2} max={16} value={current.rows}
                onChange={(e) => {
                  const rows = Number(e.target.value);
                  patch({ rows, cells: resizeCells(current.cells, rows, current.cols) });
                }} />
            </div>
            <div className="field">
              <label>循环列数 {current.cols}</label>
              <input type="range" min={2} max={24} value={current.cols}
                onChange={(e) => {
                  const cols = Number(e.target.value);
                  patch({ cols, cells: resizeCells(current.cells, current.rows, cols) });
                }} />
            </div>
            <div className="field">
              <label>篾间净距 {current.gapMm} mm</label>
              <input type="range" min={1} max={14} step={0.5} value={current.gapMm}
                onChange={(e) => patch({ gapMm: Number(e.target.value) })} />
            </div>
            {current.kind === 'hex' ? (
              <div className="field">
                <label>六角孔对边 {current.hexHoleMm} mm</label>
                <input type="range" min={8} max={38} step={1} value={current.hexHoleMm}
                  onChange={(e) => patch({ hexHoleMm: Number(e.target.value) })} />
              </div>
            ) : current.kind === 'chrysanthemum' ? (
              <div className="field">
                <label>花瓣/放射数 {current.petalCount ?? 16}</label>
                <input type="range" min={8} max={32} step={2} value={current.petalCount ?? 16}
                  onChange={(e) => patch({ petalCount: Number(e.target.value) })} />
              </div>
            ) : (
              <div className="field">
                <label>六角孔参数（仅六角编）</label>
                <NumberInput min={8} max={38} step={1} value={current.hexHoleMm}
                  onCommit={(hexHoleMm) => patch({ hexHoleMm })} />
              </div>
            )}
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn small" onClick={() => patch({ cells: defaultCells('cross', current.rows, current.cols) })}>平编交替</button>
            <button className="btn small" onClick={() => patch({ cells: defaultCells('herringbone', current.rows, current.cols) })}>人字斜纹</button>
            <button className="btn small" onClick={() => patch({ cells: defaultCells('hex', current.rows, current.cols) })}>三向循环</button>
            <button className="btn small" onClick={() => patch({ cells: current.cells.map((r) => r.map(() => true)) })}>全部在上</button>
          </div>
        </section>

        <div>
          <section className="panel">
            <h3>已存编法</h3>
            <div className="saved-list">
              {weaves.map((w) => (
                <button key={w.id} className={`saved-item ${w.id === current.id ? 'active' : ''}`} onClick={() => void saveProjectPatch({ weaveId: w.id })}>
                  <span><strong>{w.name}</strong><span>{KIND_INFO.find((k) => k.key === w.kind)?.name} · {w.rows}×{w.cols} · 净距 {w.gapMm}mm</span></span>
                  <span>{project.weaveId === w.id ? '当前' : '切换'}</span>
                </button>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={createWeave}>新建/复制当前编法</button>
            </div>
          </section>
          <section className="panel">
            <h3>规则如何作用到器型</h3>
            <p className="formula">
              1. 格子按实际经/圈篾序号取模，因此放大器型、增加根数后挑压规律不会丢失。<br />
              2. 每个交叉点按对方篾宽和交叉角计算保护区间；中心上下错开 <b>篾厚 + 0.9mm</b>。<br />
              3. 两交叉之间用余弦柔性过渡，避免硬折；真实曲率半径小于竹种最小半径时模型标红。<br />
              4. 六角编使用三向格线，圆周长先整数化再反算有效间距；曲面周长变化过大的孔位会橙色标记。
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
