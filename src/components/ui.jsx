import { useEffect, useId, useRef } from 'react';
import { Icon } from './Icon.jsx';

export function Logo({ className = '' }) {
  return <img className={`logo ${className}`} src="/logo.png" alt="MDFlix" />;
}

export function Spinner({ small }) {
  return <span className={`spinner${small ? ' spinner--sm' : ''}`} role="status" aria-label="Memuat" />;
}

export function PageLoading({ label = 'Memuat' }) {
  return (
    <div className="page-loading" role="status">
      <Logo className="logo--splash" />
      <Spinner />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function EmptyState({ icon = 'film', title, text, children }) {
  return (
    <div className="state">
      <span className="state__icon"><Icon name={icon} /></span>
      <h2 className="state__title">{title}</h2>
      {text && <p className="state__text">{text}</p>}
      {children && <div className="state__actions">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Terjadi kesalahan', text = 'Coba lagi beberapa saat.', onRetry, children }) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon"><Icon name="alert" /></span>
      <h2 className="state__title">{title}</h2>
      <p className="state__text">{text}</p>
      <div className="state__actions">
        {onRetry && <button type="button" className="btn btn--primary" onClick={onRetry}><Icon name="refresh" /> Coba lagi</button>}
        {children}
      </div>
    </div>
  );
}

/** Dialog aksesibel: fokus masuk ke dalam, Esc menutup, fokus kembali ke pemicu. */
export function Modal({ open, onClose, title, children, wide, actions, labelledBy }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const el = ref.current;
    el?.querySelector('[data-autofocus], button, [href], input, select, textarea')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal__panel${wide ? ' modal__panel--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id}>
        {title && (
          <div className="modal__head">
            <h2 id={id} className="modal__title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="x" /></button>
          </div>
        )}
        {children}
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children, id }) {
  const gen = useId();
  const fid = id ?? gen;
  return (
    <div className="field">
      <label className="field__label" htmlFor={fid}>{label}</label>
      {typeof children === 'function' ? children({ id: fid, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': error ? `${fid}-e` : hint ? `${fid}-h` : undefined }) : children}
      {hint && !error && <span id={`${fid}-h`} className="field__hint">{hint}</span>}
      {error && <span id={`${fid}-e`} className="field__error" role="alert">{error}</span>}
    </div>
  );
}

export function StatusBadge({ status, tone }) {
  return <span className={`badge badge--${tone ?? 'default'}`}>{status}</span>;
}

export function WatchProgress({ value = 0, large }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className={`progress${large ? ' progress--lg' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label="Progres menonton">
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function Toggle({ pressed, onClick, children, ...rest }) {
  return <button type="button" className="chip" aria-pressed={pressed} onClick={onClick} {...rest}>{children}</button>;
}
