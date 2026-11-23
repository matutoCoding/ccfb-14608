import type { WeaveSpec } from '../types';

/** 挑压格子图:绿=纬压经(1),褐=经压纬(0)。点击翻转,可拖拽连续绘制 */
export function PatternGrid({
  weave,
  onChange,
}: {
  weave: WeaveSpec;
  onChange: (pattern: number[][]) => void;
}) {
  const flip = (j: number, i: number, value?: number) => {
    const next = weave.pattern.map((row) => row.slice());
    next[j][i] = value ?? (next[j][i] === 1 ? 0 : 1);
    onChange(next);
  };

  return (
    <div>
      <div
        className="grid-editor"
        style={{
          gridTemplateColumns: `repeat(${weave.patternCols}, 1fr)`,
        }}
        onPointerLeave={() => (painting.current = null)}
        onPointerUp={() => (painting.current = null)}
      >
        {weave.pattern.map((row, j) =>
          row.map((cell, i) => (
            <div
              key={`${j}-${i}`}
              className={`cell ${cell === 1 ? 'on' : 'off'}`}
              title={`第${j + 1}纬 × 第${i + 1}经:${
                cell === 1 ? '纬压经' : '经压纬'
              }`}
              onPointerDown={(e) => {
                e.preventDefault();
                const v = cell === 1 ? 0 : 1;
                painting.current = v;
                flip(j, i, v);
              }}
              onPointerEnter={() => {
                if (painting.current !== null) flip(j, i, painting.current);
              }}
            />
          )),
        )}
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        <span>
          <i className="sw" style={{ background: '#7fa05a' }} />
          纬压经(纬在上)
        </span>
        <span>
          <i className="sw" style={{ background: '#4a4438' }} />
          经压纬(经在上)
        </span>
      </div>
    </div>
  );
}

const painting: { current: number | null } = { current: null };
