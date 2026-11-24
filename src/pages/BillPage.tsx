import { useMemo } from 'react';
import { WeaveEngine } from '../geometry/weave';
import { buildMaterialBill } from '../geometry/materialBill';
import { useSelectedDesign, useStore } from '../state/store';
import { Card } from '../components/ui';

const FAMILY_LABEL = ['经篾', '纬篾', '底筋', '底圈'];

export function BillPage() {
  const { profile, pattern, material, species } = useSelectedDesign();
  const rim = useStore((s) => s.rim);

  const bill = useMemo(() => {
    if (!profile || !pattern || !material || !species) return null;
    const engine = new WeaveEngine(profile, pattern, material, species);
    const result = engine.build();
    return buildMaterialBill(result.strips, material, species);
  }, [profile, pattern, material, species]);

  if (!bill || !material) return <div className="empty">请先选择完整的设计方案</div>;

  const totalCutLength = bill.lines.reduce((n, l) => n + l.cutLength * l.quantity, 0);

  return (
    <div className="page-grid">
      <Card title="备料单(按根计算)">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>篾种</th>
              <th>长 mm</th>
              <th>宽 mm</th>
              <th>厚 mm</th>
              <th>数量</th>
              <th>含损耗下料长 mm</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={l.index}>
                <td>{l.index + 1}</td>
                <td>{FAMILY_LABEL[l.family] ?? `第${l.family + 1}向`}</td>
                <td>{l.length}</td>
                <td>{l.width}</td>
                <td>{l.thickness}</td>
                <td>{l.quantity}</td>
                <td>{l.cutLength}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="info-box">
          合计 <strong>{bill.totalStrips}</strong> 根篾 · 总下料长度 {(totalCutLength / 1000).toFixed(2)} m ·
          损耗已加 {bill.wastePercent}%
        </div>
      </Card>

      <Card title="竹子出材计算">
        <dl className="spec-list">
          <div>
            <dt>竹种</dt>
            <dd>{bill.species.name}</dd>
          </div>
          <div>
            <dt>竹杆直径 / 节距</dt>
            <dd>
              {bill.species.culmDiameter} mm / {bill.species.nodeSpacing} mm
            </dd>
          </div>
          <div>
            <dt>圆周可剖篾数(刮青留 15%)</dt>
            <dd>{Math.floor((bill.species.culmDiameter * Math.PI * 0.85) / material.width)} 根/圈</dd>
          </div>
          <div>
            <dt>单根竹可用节段</dt>
            <dd>{Math.floor(bill.species.culmLength / bill.species.nodeSpacing)} 段</dd>
          </div>
          <div>
            <dt>一根竹子出篾</dt>
            <dd>
              <strong>{bill.stripsPerCulm}</strong> 根
            </dd>
          </div>
          <div>
            <dt>本单需竹子</dt>
            <dd>
              <strong className="accent">{bill.culmsNeeded}</strong> 根
            </dd>
          </div>
        </dl>
        <p className="hint">
          提示:下料长超过节距({bill.species.nodeSpacing}mm)的篾需跨节,要先刨平节疤;备料时优先把长篾排在竹杆上段,
          短篾用节间余料。收口「{rim.kind === 'rolled' ? '卷口' : rim.kind === 'wrapped' ? '包边' : '插口'}」另备
          {rim.size}mm 口沿篾一圈。
        </p>
      </Card>
    </div>
  );
}
