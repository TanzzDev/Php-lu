import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon.jsx';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const push = useCallback((message, { type = 'info', ms = 4200 } = {}) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, message, type }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), ms);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <Icon name={t.type === 'error' ? 'alert' : t.type === 'ok' ? 'check' : 'info'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
