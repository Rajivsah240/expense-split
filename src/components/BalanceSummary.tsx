import React, { useMemo, useState } from 'react';
import { Expense, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Wallet, Check, History, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface BalanceSummaryProps {
  expenses: Expense[];
  onSettle: (from: string, to: string, amount: number) => Promise<void>;
  currentUser: UserProfile;
  membersInfo: Record<string, UserProfile>;
}

export function BalanceSummary({ expenses, onSettle, currentUser, membersInfo }: BalanceSummaryProps) {
  const [settling, setSettling] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const memberUids = useMemo(() => Object.keys(membersInfo), [membersInfo]);

  const { balances, settlements, pastSettlements } = useMemo(() => {
    // 1. Calculate net balances
    const netBalances: Record<string, number> = {};

    // Initialize balances to 0 for all known members
    memberUids.forEach(uid => {
      netBalances[uid] = 0;
    });

    const pastSettlementList: Expense[] = [];

    expenses.forEach(exp => {
      if (exp.type === 'settlement') {
        pastSettlementList.push(exp);
      }

      // The person who paid gets positive balance for the amount they paid
      if (netBalances[exp.paidBy] === undefined) netBalances[exp.paidBy] = 0;
      netBalances[exp.paidBy] += exp.totalAmount;

      // Everyone who shares the expense gets negative balance for their share
      Object.entries(exp.shares || {}).forEach(([uid, amount]) => {
        if (netBalances[uid] === undefined) netBalances[uid] = 0;
        netBalances[uid] -= amount;
      });
    });

    const allUsersWithBalance = Object.keys(netBalances);

    // 2. Minimum Cash Flow Algorithm for optimal settlements
    const debtors = allUsersWithBalance
      .filter(u => netBalances[u] < -0.01)
      .map(u => ({ uid: u, amount: -netBalances[u] }));

    const creditors = allUsersWithBalance
      .filter(u => netBalances[u] > 0.01)
      .map(u => ({ uid: u, amount: netBalances[u] }));

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlementsList: { from: string; to: string; amount: number }[] = [];

    let d = 0;
    let c = 0;

    while (d < debtors.length && c < creditors.length) {
      const debtor = debtors[d];
      const creditor = creditors[c];

      const settledAmount = Math.min(debtor.amount, creditor.amount);

      if (settledAmount > 0.01) {
        settlementsList.push({
          from: debtor.uid,
          to: creditor.uid,
          amount: settledAmount
        });
      }

      debtor.amount -= settledAmount;
      creditor.amount -= settledAmount;

      if (debtor.amount < 0.01) d++;
      if (creditor.amount < 0.01) c++;
    }

    return {
      balances: netBalances,
      settlements: settlementsList,
      pastSettlements: pastSettlementList
    };
  }, [expenses, memberUids]);

  const handleSettle = async (index: number, from: string, to: string, amount: number) => {
    setSettling(index);
    try {
      await onSettle(from, to, amount);
    } finally {
      setSettling(null);
    }
  };

  if (expenses.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-brand rounded-lg">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-bold text-white text-base">Suggested Settlements</h2>
        </div>

        {pastSettlements.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-brand-300/50 hover:text-white flex items-center gap-1 btn-ghost px-2.5 py-1 rounded-lg"
          >
            <History className="w-3.5 h-3.5" />
            History ({pastSettlements.length})
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Suggested Minimal Settlements */}
      {settlements.length === 0 ? (
        <div className="text-accent-green text-xs font-semibold bg-accent-green/10 border border-accent-green/15 p-3.5 rounded-xl">
          🎉 All team balances are fully settled!
        </div>
      ) : (
        <div className="space-y-2.5">
          {settlements.map((s, i) => {
            const canSettle = s.from === currentUser.uid || s.to === currentUser.uid;
            const fromName = membersInfo[s.from]?.displayName || 'Unknown';
            const toName = membersInfo[s.to]?.displayName || 'Unknown';

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between glass-light rounded-xl p-3 gap-3"
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-white">{fromName}</span>
                  <span className="text-brand-300/40">pays</span>
                  <ArrowRight className="w-3.5 h-3.5 text-brand-400/40" />
                  <span className="font-bold text-white">{toName}</span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                  <span className="font-bold text-accent-green text-sm">₹{s.amount.toFixed(2)}</span>

                  {canSettle && (
                    <button
                      onClick={() => handleSettle(i, s.from, s.to, s.amount)}
                      disabled={settling !== null}
                      className="btn-primary px-3 py-1.5 text-xs font-bold flex items-center gap-1 bg-accent-green/20 border-accent-green/30 shadow-none hover:bg-accent-green/30"
                      style={{
                        background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.25) 0%, rgba(52, 211, 153, 0.15) 100%)',
                        boxShadow: '0 4px 14px rgba(52, 211, 153, 0.15)'
                      }}
                    >
                      {settling === i ? (
                        'Settling...'
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Mark Settle
                        </>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Past Settlement History Drawer */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-light rounded-xl p-3 space-y-2 text-xs overflow-hidden"
          >
            <h4 className="font-bold text-brand-300/60 text-[11px] uppercase tracking-wider">Completed Settlement History</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {pastSettlements.map(ps => {
                const payerName = membersInfo[ps.paidBy]?.displayName || 'Unknown';
                const paidToUid = Object.keys(ps.shares || {})[0] || ps.paidTo;
                const receiverName = paidToUid ? membersInfo[paidToUid]?.displayName || 'Member' : 'Member';

                return (
                  <div key={ps.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-none">
                    <span className="text-brand-200/60">
                      <strong className="text-white">{payerName}</strong> → <strong className="text-white">{receiverName}</strong>
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-accent-green block">₹{ps.totalAmount.toFixed(2)}</span>
                      <span className="text-[10px] text-brand-300/30">{format(ps.createdAt, 'MMM d, h:mm a')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Net Balances Section */}
      <div className="pt-3 border-t border-white/5">
        <h3 className="text-[10px] font-bold text-brand-300/50 uppercase tracking-wider mb-2">Net Balances</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Object.entries(balances).map(([uid, balValue]) => {
            const bal = balValue as number;
            if (!memberUids.includes(uid) && Math.abs(bal) < 0.01) return null;

            const name = membersInfo[uid]?.displayName || 'Unknown';

            return (
              <div key={uid} className="glass-light rounded-xl p-2.5 text-center">
                <span className="text-[11px] font-medium text-brand-300/50 block truncate">{name}</span>
                <span className={`text-xs font-bold ${bal > 0 ? 'text-accent-green' : bal < 0 ? 'text-accent-red' : 'text-brand-300/30'}`}>
                  {bal > 0 ? `+₹${bal.toFixed(0)}` : bal < 0 ? `-₹${Math.abs(bal).toFixed(0)}` : '₹0'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
