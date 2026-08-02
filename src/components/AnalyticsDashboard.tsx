import React, { useMemo, useState } from 'react';
import { Expense, UserProfile, ExpenseCategory } from '../types';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_COLORS, categorizeItem } from '../utils/categories';
import { motion } from 'motion/react';
import { PieChart, TrendingUp, ShoppingBag, UserCheck, BarChart3, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface AnalyticsDashboardProps {
  expenses: Expense[];
  membersInfo: Record<string, UserProfile>;
}

const BAR_COLORS: string[] = [
  'bg-brand-500',
  'bg-accent-green',
  'bg-accent-amber',
  'bg-accent-cyan',
  'bg-accent-pink',
  'bg-purple-500',
  'bg-teal-500',
  'bg-orange-500'
];

export function AnalyticsDashboard({ expenses, membersInfo }: AnalyticsDashboardProps) {
  const memberUids = useMemo(() => Object.keys(membersInfo), [membersInfo]);
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'yyyy-MM'

  // Extract list of months available in expenses
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    expenses.forEach(exp => {
      const ts = exp.sessionDate || exp.createdAt;
      if (ts) {
        monthSet.add(format(ts, 'yyyy-MM'));
      }
    });
    return Array.from(monthSet).sort().reverse();
  }, [expenses]);

  // Filter expenses by selected month
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (exp.type === 'settlement') return false; // exclude settlements from spending analytics
      if (selectedMonth === 'all') return true;
      const ts = exp.sessionDate || exp.createdAt;
      return ts ? format(ts, 'yyyy-MM') === selectedMonth : true;
    });
  }, [expenses, selectedMonth]);

  // Calculations
  const stats = useMemo(() => {
    let totalSpending = 0;
    let personalSpending = 0;
    let sharedSpending = 0;

    const categoryTotals: Record<ExpenseCategory, number> = {
      Vegetables: 0,
      Dairy: 0,
      Snacks: 0,
      Beverages: 0,
      Household: 0,
      'Personal Care': 0,
      Cleaning: 0,
      Miscellaneous: 0
    };

    const memberPaid: Record<string, number> = {};
    const memberConsumed: Record<string, number> = {};
    const itemFrequency: Record<string, { count: number; total: number }> = {};

    memberUids.forEach(uid => {
      memberPaid[uid] = 0;
      memberConsumed[uid] = 0;
    });

    filteredExpenses.forEach(exp => {
      // If session with items
      if (exp.items && exp.items.length > 0) {
        exp.items.forEach(item => {
          totalSpending += item.totalAmount;

          // Category
          const cat = item.category || 'Miscellaneous';
          categoryTotals[cat] = (categoryTotals[cat] || 0) + item.totalAmount;

          // Shared vs Personal
          if (item.owners.length === 1) {
            personalSpending += item.totalAmount;
          } else {
            sharedSpending += item.totalAmount;
          }

          // Member consumed
          Object.entries(item.shares || {}).forEach(([uid, shareAmt]) => {
            const amt = Number(shareAmt) || 0;
            if (memberConsumed[uid] === undefined) memberConsumed[uid] = 0;
            memberConsumed[uid] = (memberConsumed[uid] || 0) + amt;
          });

          // Item Frequency
          const nameClean = item.item.trim().toLowerCase();
          if (!itemFrequency[nameClean]) {
            itemFrequency[nameClean] = { count: 0, total: 0 };
          }
          itemFrequency[nameClean].count += 1;
          itemFrequency[nameClean].total += item.totalAmount;
        });

        // Member paid
        if (memberPaid[exp.paidBy] === undefined) memberPaid[exp.paidBy] = 0;
        memberPaid[exp.paidBy] += exp.totalAmount;
      } else {
        // Legacy single item expense
        totalSpending += exp.totalAmount;
        const cat = categorizeItem(exp.item || '');
        categoryTotals[cat] = (categoryTotals[cat] || 0) + exp.totalAmount;

        const owners = Object.keys(exp.shares || {});
        if (owners.length === 1) {
          personalSpending += exp.totalAmount;
        } else {
          sharedSpending += exp.totalAmount;
        }

        if (memberPaid[exp.paidBy] === undefined) memberPaid[exp.paidBy] = 0;
        memberPaid[exp.paidBy] += exp.totalAmount;

        Object.entries(exp.shares || {}).forEach(([uid, shareAmt]) => {
          const amt = Number(shareAmt) || 0;
          if (memberConsumed[uid] === undefined) memberConsumed[uid] = 0;
          memberConsumed[uid] = (memberConsumed[uid] || 0) + amt;
        });

        if (exp.item) {
          const nameClean = exp.item.trim().toLowerCase();
          if (!itemFrequency[nameClean]) {
            itemFrequency[nameClean] = { count: 0, total: 0 };
          }
          itemFrequency[nameClean].count += 1;
          itemFrequency[nameClean].total += exp.totalAmount;
        }
      }
    });

    // Top items
    const topItems = Object.entries(itemFrequency)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      totalSpending,
      personalSpending,
      sharedSpending,
      categoryTotals,
      memberPaid,
      memberConsumed,
      topItems
    };
  }, [filteredExpenses, memberUids]);

  return (
    <div className="space-y-6">
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-400" />
            Spending Analytics
          </h2>
          <p className="text-xs text-brand-300/50">Visual breakdown of expenses, categories, and member shares</p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-400/50" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="input-dark text-xs font-medium rounded-xl px-3 py-2"
          >
            <option value="all">All Time</option>
            {availableMonths.map(m => {
              const [y, mo] = m.split('-').map(Number);
              return (
                <option key={m} value={m}>
                  {format(new Date(y, mo - 1, 1), 'MMMM yyyy')}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5"
        >
          <span className="text-xs font-medium text-brand-300/50 uppercase tracking-wider block mb-1">Total Spending</span>
          <span className="text-2xl font-bold text-white">₹{stats.totalSpending.toFixed(2)}</span>
          <span className="text-xs text-brand-300/40 block mt-1">Across {filteredExpenses.length} shopping sessions</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-2xl p-5"
        >
          <span className="text-xs font-medium text-brand-300/50 uppercase tracking-wider block mb-1">Shared Expenses</span>
          <span className="text-2xl font-bold text-accent-green">₹{stats.sharedSpending.toFixed(2)}</span>
          <span className="text-xs text-brand-300/40 block mt-1">
            {stats.totalSpending > 0 ? ((stats.sharedSpending / stats.totalSpending) * 100).toFixed(0) : 0}% of total
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-5"
        >
          <span className="text-xs font-medium text-brand-300/50 uppercase tracking-wider block mb-1">Personal Expenses</span>
          <span className="text-2xl font-bold text-accent-amber">₹{stats.personalSpending.toFixed(2)}</span>
          <span className="text-xs text-brand-300/40 block mt-1">
            {stats.totalSpending > 0 ? ((stats.personalSpending / stats.totalSpending) * 100).toFixed(0) : 0}% of total
          </span>
        </motion.div>
      </div>

      {/* Category Breakdown & Member Consumption */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-brand-400" />
            Category Breakdown
          </h3>

          <div className="space-y-3">
            {CATEGORIES.map((cat, catIdx) => {
              const amount = stats.categoryTotals[cat] || 0;
              const percentage = stats.totalSpending > 0 ? (amount / stats.totalSpending) * 100 : 0;

              if (amount === 0) return null;

              return (
                <motion.div
                  key={cat}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: catIdx * 0.04 }}
                  className="space-y-1.5"
                >
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-brand-200/80 flex items-center gap-1.5">
                      {CATEGORY_ICONS[cat]} {cat}
                    </span>
                    <span className="text-white font-bold">
                      ₹{amount.toFixed(0)} ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: catIdx * 0.05 }}
                      className={`h-full rounded-full ${BAR_COLORS[catIdx % BAR_COLORS.length]}`}
                    />
                  </div>
                </motion.div>
              );
            })}

            {stats.totalSpending === 0 && (
              <p className="text-xs text-brand-300/30 text-center py-6">No category data recorded for this period.</p>
            )}
          </div>
        </div>

        {/* Member Breakdown: Paid vs Consumed */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-brand-400" />
            Member Shares (Paid vs Consumed)
          </h3>

          <div className="space-y-4">
            {memberUids.map((uid, idx) => {
              const paid = stats.memberPaid[uid] || 0;
              const consumed = stats.memberConsumed[uid] || 0;
              const memberName = membersInfo[uid]?.displayName || 'Unknown';
              const isPositive = paid >= consumed;

              return (
                <motion.div
                  key={uid}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="glass-light rounded-xl p-3 space-y-2"
                >
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-white">{memberName}</span>
                    <span className={isPositive ? 'text-accent-green' : 'text-accent-red'}>
                      {isPositive ? `+₹${(paid - consumed).toFixed(0)}` : `-₹${(consumed - paid).toFixed(0)}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <span className="text-brand-300/40 block">Total Paid</span>
                      <span className="font-bold text-white">₹{paid.toFixed(2)}</span>
                    </div>

                    <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                      <span className="text-brand-300/40 block">Actual Share</span>
                      <span className="font-bold text-white">₹{consumed.toFixed(2)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Purchased Items */}
      <div className="glass-card rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-brand-400" />
          Top Purchased Items
        </h3>

        {stats.topItems.length > 0 ? (
          <div className="divide-y divide-white/5">
            {stats.topItems.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="py-3 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-gradient-brand font-bold text-white flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-white capitalize">{item.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-white block">₹{item.total.toFixed(2)}</span>
                  <span className="text-brand-300/30 text-[10px]">{item.count} times purchased</span>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-brand-300/30 py-4 text-center">No top items recorded yet.</p>
        )}
      </div>
    </div>
  );
}
