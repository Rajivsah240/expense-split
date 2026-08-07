import { motion } from 'motion/react';
import { Check, HandCoins, Receipt, TrendingUp } from 'lucide-react';
import { Avatar, Button } from '../components/ui';
import { formatMoney } from '../lib/format';
import type { GroupStateApi } from '../hooks/useGroupState';

interface HomeTabProps {
  state: GroupStateApi;
  currentUserId: string;
  onSettle: () => void;
}

export function HomeTab({ state, currentUserId, onSettle }: HomeTabProps) {
  const { transfers, totals, nameOf } = state;

  // Every transfer stays between the person who owes and the person who paid.
  // The app never routes a payment through another flatmate.
  const myTransfers = transfers.filter(
    transfer => transfer.from === currentUserId || transfer.to === currentUserId
  );
  const toPay = myTransfers
    .filter(transfer => transfer.from === currentUserId)
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const toCollect = myTransfers
    .filter(transfer => transfer.to === currentUserId)
    .reduce((sum, transfer) => sum + transfer.amount, 0);
  const headlineAmount = toPay || toCollect;
  const headlineLabel = toPay > 0 ? 'You need to pay' : toCollect > 0 ? 'You need to collect' : 'Your balance';

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
          <p className="text-[12.5px] font-bold uppercase tracking-[0.07em] text-faint">{headlineLabel}</p>
          <p
            className={`mt-1 text-[34px] font-extrabold leading-none tracking-[-0.03em] tnum ${
              toPay > 0 ? 'text-negative' : toCollect > 0 ? 'text-positive' : 'text-ink'
            }`}
          >
            {formatMoney(headlineAmount)}
          </p>
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

    </div>
  );
}
