import { motion } from 'motion/react';
import { ArrowRight, Check, HandCoins, Receipt, TrendingUp } from 'lucide-react';
import type { Session } from '@shared/types';
import { SessionCard } from '../components/SessionCard';
import { Avatar, Button, EmptyState, SectionTitle } from '../components/ui';
import { formatMoney } from '../lib/format';
import type { GroupStateApi } from '../hooks/useGroupState';

interface HomeTabProps {
  state: GroupStateApi;
  currentUserId: string;
  onOpenSession: (session: Session) => void;
  onSettle: () => void;
  onAdd: () => void;
  onSeeAll: () => void;
}

export function HomeTab({ state, currentUserId, onOpenSession, onSettle, onAdd, onSeeAll }: HomeTabProps) {
  const { balances, transfers, totals, sessions, nameOf } = state;
  const mine = balances.find(entry => entry.userId === currentUserId);
  const net = mine?.net ?? 0;

  // Every transfer stays between the person who owes and the person who paid.
  // The app never routes a payment through another flatmate.
  const myTransfers = transfers.filter(
    transfer => transfer.from === currentUserId || transfer.to === currentUserId
  );

  return (
    <div className="space-y-5">
      {/* Headline balance ─ the one number that matters when you open the app. */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card overflow-hidden p-0"
      >
        <div className="px-4 pb-4 pt-4">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.07em] text-faint">
            {net > 0 ? 'You are owed in total' : net < 0 ? 'You owe in total' : 'Your balance'}
          </p>
          <p
            className={`mt-1 text-[34px] font-extrabold leading-none tracking-[-0.03em] tnum ${
              net > 0 ? 'text-positive' : net < 0 ? 'text-negative' : 'text-ink'
            }`}
          >
            {formatMoney(Math.abs(net))}
          </p>

          {/*
            Every term that feeds the headline is listed, so the arithmetic can be
            checked on screen: paid − share + paid-back − received = the number above.
            Leaving the settlement terms out made correct balances look wrong.
          */}
          {mine && (mine.paid > 0 || mine.owed > 0) && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted tnum">
              You paid {formatMoney(mine.paid)} · your share {formatMoney(mine.owed)}
              {mine.settledOut > 0 && ` · you paid back ${formatMoney(mine.settledOut)}`}
              {mine.settledIn > 0 && ` · you received ${formatMoney(mine.settledIn)}`}
            </p>
          )}
        </div>

        {myTransfers.length > 0 ? (
          <div className="space-y-2 border-t border-line bg-surface-2/60 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-faint">Direct payments</p>
            {myTransfers.map((transfer, index) => {
              const iPay = transfer.from === currentUserId;
              return (
                <div key={`${transfer.from}-${transfer.to}-${index}`} className="flex items-center gap-2">
                  <Avatar
                    name={nameOf(iPay ? transfer.to : transfer.from)}
                    userId={iPay ? transfer.to : transfer.from}
                    size={24}
                  />
                  <p className="clip flex-1 text-[13px] font-medium text-ink">
                    {iPay ? 'Pay' : 'Collect from'}{' '}
                    <span className="font-bold">{nameOf(iPay ? transfer.to : transfer.from)}</span>
                  </p>
                  <span className="text-[13.5px] font-bold text-ink tnum">{formatMoney(transfer.amount)}</span>
                </div>
              );
            })}
            <Button size="sm" block onClick={onSettle} icon={<HandCoins className="size-4" />} className="mt-1">
              Settle up
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-line bg-positive-soft px-4 py-3">
            <Check className="size-4 shrink-0 text-positive" />
            <p className="text-[13px] font-semibold text-positive">
              {totals.sessionCount === 0
                ? 'Nothing recorded yet.'
                : transfers.length === 0
                  ? 'Everyone is fully settled.'
                  : 'You have no direct payments due.'}
            </p>
          </div>
        )}
      </motion.section>

      {/* Group totals */}
      {totals.sessionCount > 0 && (
        <section className="grid grid-cols-2 gap-2.5">
          <div className="card-flat p-3.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-faint">
              <TrendingUp className="size-3.5" />
              This month
            </p>
            <p className="mt-1 text-[19px] font-extrabold text-ink tnum">
              {formatMoney(totals.monthTotal)}
            </p>
          </div>
          <div className="card-flat p-3.5">
            <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-faint">
              <Receipt className="size-3.5" />
              All time
            </p>
            <p className="mt-1 text-[19px] font-extrabold text-ink tnum">{formatMoney(totals.groupTotal)}</p>
            <p className="mt-0.5 text-[11.5px] text-faint">
              {totals.sessionCount} session{totals.sessionCount === 1 ? '' : 's'} · {totals.itemCount} items
            </p>
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <SectionTitle
          action={
            sessions.length > 0 ? (
              <button
                type="button"
                onClick={onSeeAll}
                className="flex items-center gap-0.5 text-[12.5px] font-bold text-brand"
              >
                See all
                <ArrowRight className="size-3.5" />
              </button>
            ) : undefined
          }
        >
          Recent
        </SectionTitle>

        {sessions.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6" />}
            title="No expenses yet"
            body="Add the first one the way you'd write it in WhatsApp — the app works out everyone's share."
            action={<Button onClick={onAdd}>Add an expense</Button>}
          />
        ) : (
          <ul className="space-y-2.5">
            {sessions.slice(0, 6).map(session => (
              <li key={session.id}>
                <SessionCard
                  session={session}
                  currentUserId={currentUserId}
                  onOpen={onOpenSession}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
