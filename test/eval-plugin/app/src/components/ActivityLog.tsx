import { connect } from 'react-redux';
import { selectVisibleActivity, type ActivityItem, type State } from '../store/activity';

const ActivityLog = ({ items }: { items: ActivityItem[] }) => (
  <ul className="activity" data-testid="activity">
    {items.slice(-4).map((item) => (
      <li key={item.id}>{item.text}</li>
    ))}
  </ul>
);

const mapState = (state: State) => ({ items: selectVisibleActivity(state) });

export default connect(mapState)(ActivityLog);
