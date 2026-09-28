import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAppSelector } from '../../store';
import { selectIssuesReady } from '../../store/selectors';
import { Spinner } from '../../components/ui/Misc';
import { ActivityFeed } from './ActivityFeed';
import { StatCards } from './StatCards';
import { ThroughputChart } from './ThroughputChart';
import { WorkloadTable } from './WorkloadTable';

export function DashboardPage() {
  const ready = useAppSelector(selectIssuesReady);
  useDocumentTitle('Dashboard');
  if (!ready) return <Spinner label="Loading dashboard" />;
  return (
    <div className="page page-dashboard" data-testid="dashboard-page">
      <StatCards />
      <ThroughputChart />
      <div className="columns-2">
        <WorkloadTable />
        <ActivityFeed />
      </div>
    </div>
  );
}
