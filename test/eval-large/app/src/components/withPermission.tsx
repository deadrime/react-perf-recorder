import type { ComponentType } from 'react';
import { useAuth, type Permission } from '../context/AuthContext';

/** Renders the component only for people allowed to do `permission`, and `fallback` for the others. */
export function withPermission<P extends object>(Component: ComponentType<P>, permission: Permission, Fallback: ComponentType<P> | null = null) {
  function Guarded(props: P) {
    const { can } = useAuth();
    if (can(permission)) return <Component {...props} />;
    return Fallback ? <Fallback {...props} /> : null;
  }
  Guarded.displayName = `withPermission(${Component.displayName ?? Component.name})`;
  return Guarded;
}
