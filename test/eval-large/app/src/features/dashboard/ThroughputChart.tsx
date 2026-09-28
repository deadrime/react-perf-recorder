import { useMemo, useState } from 'react';
import { Tabs } from '../../components/ui/Misc';
import { buildThroughput, type DayPoint } from '../../lib/metrics';
import { formatDate } from '../../lib/time';
import { useProjects } from '../../queries/workspace';
import { useAppSelector } from '../../store';
import { selectAllIssues } from '../../store/selectors';

const W = 720;
const H = 200;
const PAD = 24;

type Range = '30' | '90';

function Tooltip({ point, x, colors }: { point: DayPoint; x: number; colors: Record<string, string> }) {
  return (
    <div className="chart-tip" style={{ left: `${Math.min(75, (x / W) * 100)}%` }}>
      <strong>{formatDate(point.day)}</strong>
      <div>{point.total} completed</div>
      {Object.entries(point.byProject)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => (
          <div key={id} className="row gap-sm small">
            <span className="dot" style={{ background: colors[id] }} /> {n}
          </div>
        ))}
      {point.cycleDays !== null && <div className="muted small">cycle time {point.cycleDays.toFixed(1)} d</div>}
      <div className="muted small">{point.open} open at the end of the day</div>
    </div>
  );
}

export function ThroughputChart() {
  const issues = useAppSelector(selectAllIssues);
  const { data: projects = [] } = useProjects();
  const [range, setRange] = useState<Range>('90');
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(() => buildThroughput(issues, projects, Number(range)), [issues, projects, range]);
  const colors = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.color])), [projects]);

  const max = Math.max(1, ...points.map((p) => p.total));
  const bar = (W - PAD * 2) / points.length;
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${PAD + i * bar + bar / 2},${y(p.rolling)}`).join('');
  const maxOpen = Math.max(1, ...points.map((p) => p.open));
  const backlog = points.map((p, i) => `${i ? 'L' : 'M'}${PAD + i * bar + bar / 2},${H - PAD - (p.open / maxOpen) * (H - PAD * 2)}`).join('');

  return (
    <section className="panel chart" data-testid="throughput">
      <div className="row between">
        <h3>Throughput</h3>
        <Tabs<Range>
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>
      <div className="chart-box" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          {points.map((p, i) => {
            let offset = 0;
            return (
              <g key={p.day} onPointerEnter={() => setHover(i)} data-testid="bar">
                <rect x={PAD + i * bar} y={PAD} width={bar} height={H - PAD * 2} fill="transparent" />
                {projects.map((project) => {
                  const n = p.byProject[project.id];
                  if (!n) return null;
                  const top = y(offset + n);
                  const rect = (
                    <rect
                      key={project.id}
                      x={PAD + i * bar + 1}
                      y={top}
                      width={Math.max(1, bar - 2)}
                      height={y(offset) - top}
                      fill={project.color}
                      opacity={hover === null || hover === i ? 1 : 0.4}
                    />
                  );
                  offset += n;
                  return rect;
                })}
              </g>
            );
          })}
          <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} opacity={0.7} />
          <path d={backlog} fill="none" stroke="#f5a524" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
          <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="currentColor" opacity={0.2} />
        </svg>
        {hover !== null && points[hover] && <Tooltip point={points[hover]} x={PAD + hover * bar} colors={colors} />}
      </div>
    </section>
  );
}
