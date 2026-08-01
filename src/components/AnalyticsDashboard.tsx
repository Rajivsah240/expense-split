import React, { useMemo, useState } from 'react';
import { Expense, UserProfile, ExpenseCategory } from '../types';
import { CATEGORIES } from '../utils/categories';
import { PieChart, TrendingUp, ShoppingBag, UserCheck, BarChart3, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface AnalyticsDashboardProps {
  expenses: Expense[];
  membersInfo: Record<string, UserProfile>;
}

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
      'Rent & Bills': 0,
      General: 0
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
          const cat = item.category || 'General';
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
        const cat = categorizeLegacyCategory(exp.item || '');
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-stone-800" />
            Spending Analytics
          </h2>
          <p className="text-xs text-stone-500">Visual breakdown of expenses, categories, and member shares</p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-stone-400" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-stone-50 border border-stone-200 text-stone-800 text-xs font-medium rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-400"
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
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-medium text-stone-400 uppercase tracking-wider block mb-1">Total Spending</span>
          <span className="text-2xl font-bold text-stone-900">₹{stats.totalSpending.toFixed(2)}</span>
          <span className="text-xs text-stone-500 block mt-1">Across {filteredExpenses.length} shopping sessions</span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-medium text-stone-400 uppercase tracking-wider block mb-1">Shared Expenses</span>
          <span className="text-2xl font-bold text-emerald-600">₹{stats.sharedSpending.toFixed(2)}</span>
          <span className="text-xs text-stone-500 block mt-1">
            {stats.totalSpending > 0 ? ((stats.sharedSpending / stats.totalSpending) * 100).toFixed(0) : 0}% of total
          </span>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <span className="text-xs font-medium text-stone-400 uppercase tracking-wider block mb-1">Personal Expenses</span>
          <span className="text-2xl font-bold text-amber-600">₹{stats.personalSpending.toFixed(2)}</span>
          <span className="text-xs text-stone-500 block mt-1">
            {stats.totalSpending > 0 ? ((stats.personalSpending / stats.totalSpending) * 100).toFixed(0) : 0}% of total
          </span>
        </div>
      </div>

      {/* Category Breakdown & Member Consumption */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-stone-600" />
            Category Breakdown
          </h3>

          <div className="space-y-3">
            {CATEGORIES.map(cat => {
              const amount = stats.categoryTotals[cat] || 0;
              const percentage = stats.totalSpending > 0 ? (amount / stats.totalSpending) * 100 : 0;

              if (amount === 0) return null;

              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-stone-700">{cat}</span>
                    <span className="text-stone-900 font-bold">
                      ₹{amount.toFixed(0)} ({percentage.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-stone-800 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {stats.totalSpending === 0 && (
              <p className="text-xs text-stone-400 text-center py-6">No category data recorded for this period.</p>
            )}
          </div>
        </div>

        {/* Member Breakdown: Paid vs Consumed */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-stone-600" />
            Member Shares (Paid vs Consumed)
          </h3>

          <div className="space-y-4">
            {memberUids.map(uid => {
              const paid = stats.memberPaid[uid] || 0;
              const consumed = stats.memberConsumed[uid] || 0;
              const memberName = membersInfo[uid]?.displayName || 'Unknown';

              return (
                <div key={uid} className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-stone-800">
                    <span>{memberName}</span>
                    <span className={paid >= consumed ? 'text-emerald-600' : 'text-red-500'}>
                      {paid >= consumed ? `+₹${(paid - consumed).toFixed(0)}` : `-₹${(consumed - paid).toFixed(0)}`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white p-2 rounded-lg border border-stone-200">
                      <span className="text-stone-400 block">Total Paid</span>
                      <span className="font-bold text-stone-800">₹{paid.toFixed(2)}</span>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-stone-200">
                      <span className="text-stone-400 block">Actual Share</span>
                      <span className="font-bold text-stone-800">₹{consumed.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Purchased Items */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-stone-800 mb-3 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-stone-600" />
          Top Purchased Items
        </h3>

        {stats.topItems.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {stats.topItems.map((item, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-stone-100 font-bold text-stone-600 flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-stone-800 capitalize">{item.name}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-stone-900 block">₹{item.total.toFixed(2)}</span>
                  <span className="text-stone-400 text-[10px]">{item.count} times purchased</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-stone-400 py-4 text-center">No top items recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function categorizeLegacyCategory(itemStr: string): ExpenseCategory {
  const name = itemStr.toLowerCase();
  if (/veg|tomato|potato|onion|chilli|sabzi/.test(name)) return 'Vegetables';
  if (/milk|paneer|butter|curd|cheese|dahi/.test(name)) return 'Dairy';
  if (/chip|chocolate|biscuit|cookie|snack/.test(name)) return 'Snacks';
  if (/coke|juice|drink|water|chai|coffee/.test(name)) return 'Beverages';
  if (/surf|vim|cleaner|detergent/.test(name)) return 'Household';
  if (/soap|shampoo|paste|brush/.test(name)) return 'Personal Care';
  return 'General';
}
