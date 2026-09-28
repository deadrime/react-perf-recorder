import { usePresenceStore } from '../../store/presence';
import { AvatarStack } from '../ui/Avatar';

export function PresenceStack() {
  const online = usePresenceStore((s) => s.online);
  return (
    <span className="presence" title={`${online.length} teammates online`} data-testid="presence">
      <AvatarStack ids={online} max={5} />
    </span>
  );
}
