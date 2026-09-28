import { Avatar } from '../../components/ui/Avatar';
import { ProgressBar } from '../../components/ui/Misc';
import { useMembers } from '../../queries/members';
import { useAppSelector } from '../../store';
import { selectWorkload } from '../../store/selectors';

const CAPACITY = 80; // points a person can carry in a quarter

export function WorkloadTable() {
  const workload = useAppSelector(selectWorkload);
  const { data: members = [] } = useMembers();
  const rows = members
    .map((m) => ({ member: m, ...(workload[m.id] ?? { open: 0, inProgress: 0, points: 0, overdue: 0 }) }))
    .sort((a, b) => b.points - a.points);
  return (
    <section className="panel" data-testid="workload">
      <h3>Workload</h3>
      <table className="grid">
        <thead>
          <tr>
            <th>Person</th>
            <th>Open</th>
            <th>Active</th>
            <th>Overdue</th>
            <th className="wide">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.member.id}>
              <td>
                <span className="row gap-sm">
                  <Avatar id={r.member.id} size="xs" showPresence /> {r.member.name}
                </span>
              </td>
              <td>{r.open}</td>
              <td>{r.inProgress}</td>
              <td className={r.overdue ? 'danger' : undefined}>{r.overdue}</td>
              <td className="wide">
                <span className="row gap-sm">
                  <ProgressBar value={r.points / CAPACITY} color={r.points > CAPACITY ? '#e5484d' : undefined} />
                  <span className="small muted">{r.points}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
