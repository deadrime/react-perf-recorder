import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { Icon, type IconName } from './Icon';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: IconName;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, className, children, disabled, ...rest },
  ref
) {
  return (
    <button ref={ref} className={cx('btn', `btn-${variant}`, `btn-${size}`, className)} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner spinner-sm" /> : icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
});

export function IconButton({ icon, label, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
