import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from 'lucide-react';
import { Button, Field } from '../components/ui';
import { AppMark } from '../components/AppMark';

interface AuthScreenProps {
  onRequestOtp: (email: string) => Promise<void>;
  onVerifyOtp: (email: string, code: string) => Promise<unknown>;
}

const RESEND_SECONDS = 45;

export function AuthScreen({ onRequestOtp, onVerifyOtp }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (stage === 'code') codeRef.current?.focus();
  }, [stage]);

  const sendCode = async () => {
    setBusy(true);
    setError('');
    try {
      await onRequestOtp(email.trim());
      setStage('code');
      setCooldown(RESEND_SECONDS);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      await onVerifyOtp(email.trim(), code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not verify that code.');
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  // Six digits in, submit automatically — one less tap than a button press.
  useEffect(() => {
    if (stage === 'code' && code.length === 6 && !busy) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, stage]);

  return (
    <div className="flex min-h-dvh flex-col justify-center pb-safe pt-safe">
      <div className="shell py-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <AppMark size={62} className="mb-5" />
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              Expense Split
            </h1>
            <p className="mt-1.5 max-w-[30ch] text-[14px] leading-relaxed text-muted">
              Shared groceries, sorted. Paste what you'd send on WhatsApp and let it do the maths.
            </p>
          </div>

          <div className="card p-5">
            <AnimatePresence mode="wait" initial={false}>
              {stage === 'email' ? (
                <motion.form
                  key="email"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={requestSubmit(sendCode)}
                  className="space-y-4"
                >
                  <Field label="Email address" hint="We'll email you a six-digit code — no password to remember.">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-faint" />
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        className="field pl-11"
                        required
                        disabled={busy}
                      />
                    </div>
                  </Field>

                  {error && <ErrorNote>{error}</ErrorNote>}

                  <Button
                    type="submit"
                    size="lg"
                    block
                    loading={busy}
                    disabled={!email.includes('@')}
                    icon={<ArrowRight className="size-[18px]" />}
                  >
                    Send me a code
                  </Button>
                </motion.form>
              ) : (
                <motion.form
                  key="code"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={requestSubmit(verify)}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5">
                    <ShieldCheck className="size-4 shrink-0 text-brand-dark" />
                    <p className="clip text-[12.5px] font-medium text-brand-dark">
                      Code sent to <span className="font-bold">{email}</span>
                    </p>
                  </div>

                  <Field label="Six-digit code">
                    <input
                      ref={codeRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      className="field text-center text-[22px] font-bold tracking-[0.5em] tnum"
                      required
                      disabled={busy}
                    />
                  </Field>

                  {error && <ErrorNote>{error}</ErrorNote>}

                  <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6}>
                    Verify and continue
                  </Button>

                  <div className="flex items-center justify-between pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setStage('email');
                        setCode('');
                        setError('');
                      }}
                      className="tap -ml-2 gap-1 px-2 text-[13px] font-semibold text-muted hover:text-ink"
                    >
                      <ArrowLeft className="size-3.5" />
                      Change email
                    </button>
                    <button
                      type="button"
                      disabled={cooldown > 0 || busy}
                      onClick={() => void sendCode()}
                      className="tap px-2 text-[13px] font-semibold text-brand disabled:text-faint"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          <p className="mt-6 text-center text-[12px] leading-relaxed text-faint">
            Add this to your home screen after signing in for a full-screen, app-like experience.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-negative/20 bg-negative-soft px-3.5 py-2.5 text-[12.5px] font-medium text-negative"
    >
      {children}
    </motion.p>
  );
}

/** Small helper so forms can share one submit-guard shape. */
function requestSubmit(action: () => void | Promise<void>) {
  return (event: React.FormEvent) => {
    event.preventDefault();
    void action();
  };
}
