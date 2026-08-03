/**
 * The app's UI primitives. Everything here is mobile-first: 44px minimum touch
 * targets, bottom sheets rather than centre modals on phones, and safe-area
 * padding wherever the layout meets the edge of the screen.
 */

import { AnimatePresence, motion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react';
import { avatarColors, initialsOf } from '../lib/format';

/* ── Button ───────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white border border-transparent shadow-[var(--shadow-brand)] hover:bg-brand-dark active:scale-[0.985]',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-strong active:scale-[0.985]',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-negative text-white border border-transparent hover:brightness-95 active:scale-[0.985]',
  soft: 'bg-brand-soft text-brand-dark border border-brand-line hover:bg-brand-line/60',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-[52px] px-5 text-[15px] gap-2 rounded-[14px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin shrink-0" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`tap rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-3 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pb-2">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-faint">{children}</h2>
      {action}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`size-5 animate-spin text-faint ${className}`} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-flat flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-faint">
        {icon}
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}

/* ── Chips & pills ────────────────────────────────────────────────────────── */

export function Chip({
  active = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold transition-colors ${
        active
          ? 'border-brand bg-brand text-white'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Tag({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'positive' | 'negative' | 'warn';
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    brand: 'bg-brand-soft text-brand-dark border-brand-line',
    positive: 'bg-positive-soft text-positive border-positive/20',
    negative: 'bg-negative-soft text-negative border-negative/20',
    warn: 'bg-warn-soft text-warn border-warn-line',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] font-bold leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ── Segmented control ────────────────────────────────────────────────────── */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="inset flex gap-1 p-1">
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[13px] font-semibold transition-all ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────────────── */

export function Avatar({
  name,
  userId,
  size = 32,
  className = '',
}: {
  name: string;
  userId: string;
  size?: number;
  className?: string;
}) {
  const { bg, fg } = avatarColors(userId || name);
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  size = 22,
  max = 4,
}: {
  people: { userId: string; displayName: string }[];
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((person, index) => (
        <Avatar
          key={person.userId}
          name={person.displayName}
          userId={person.userId}
          size={size}
          className={index > 0 ? '-ml-1.5 ring-2 ring-white' : 'ring-2 ring-white'}
        />
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-3 font-bold text-muted ring-2 ring-white"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

/* ── Field wrapper ────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1.5 block pl-0.5 text-[13px] font-semibold text-ink">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1.5 block pl-0.5 text-[12px] font-medium text-negative">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block pl-0.5 text-[12px] leading-snug text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

/* ── Sheet ────────────────────────────────────────────────────────────────── */

/** Prevent the page behind a sheet from scrolling, without losing scroll position. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'auto',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'tall';
}) {
  useScrollLock(open);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-ink/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-t-[26px] bg-surface shadow-[var(--shadow-raised)] sm:rounded-[22px] ${
              size === 'tall' ? 'h-[92dvh] sm:h-[86dvh]' : 'max-h-[92dvh]'
            }`}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.7 }}
          >
            <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-3.5">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-bold leading-tight text-ink">{title}</h2>
                {subtitle && <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-1 -mt-1 shrink-0">
                <X className="size-5" />
              </IconButton>
            </div>

            <div className="scroll-y flex-1 px-4 py-4">{children}</div>

            {footer && (
              <div className="border-t border-line bg-surface px-4 pt-3 [padding-bottom:calc(12px+env(safe-area-inset-bottom,0px))]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ── Toasts ───────────────────────────────────────────────────────────────── */

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});
export const useToast = () => useContext(ToastContext);

const TOAST_ICON: Record<ToastTone, ReactNode> = {
  success: <Check className="size-4 shrink-0 text-positive" />,
  error: <AlertTriangle className="size-4 shrink-0 text-negative" />,
  info: <Info className="size-4 shrink-0 text-brand" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setToasts(current => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts(current => current.filter(toast => toast.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(12px+env(safe-area-inset-top,0px))]">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.96 }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                className="pointer-events-auto flex w-full max-w-[420px] items-start gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-[var(--shadow-raised)]"
              >
                {TOAST_ICON[toast.tone]}
                <span className="clip text-[13px] font-medium leading-snug text-ink">{toast.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/* ── Confirm dialog ───────────────────────────────────────────────────────── */

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

const ConfirmContext = createContext<(request: ConfirmRequest) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<(value: boolean) => void>(() => {});
  const titleId = useId();

  const confirm = useCallback((next: ConfirmRequest) => {
    setRequest(next);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current(value);
    setRequest(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {createPortal(
        <AnimatePresence>
          {request && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div
                className="absolute inset-0 bg-ink/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => settle(false)}
              />
              <motion.div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: 'spring', damping: 28, stiffness: 380 }}
                className="relative w-full max-w-[380px] rounded-[20px] bg-surface p-5 shadow-[var(--shadow-raised)]"
              >
                <h2 id={titleId} className="text-[17px] font-bold text-ink">
                  {request.title}
                </h2>
                {request.body && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{request.body}</p>
                )}
                <div className="mt-5 flex gap-2.5">
                  <Button variant="secondary" block onClick={() => settle(false)}>
                    {request.cancelLabel ?? 'Cancel'}
                  </Button>
                  <Button
                    variant={request.tone === 'danger' ? 'danger' : 'primary'}
                    block
                    onClick={() => settle(true)}
                  >
                    {request.confirmLabel ?? 'Confirm'}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
}
