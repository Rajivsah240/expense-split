import React, { useState, useMemo } from 'react';
import { Expense, ShoppingSession, UserProfile, SessionItem, ExpenseCategory } from '../types';
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_COLORS } from '../utils/categories';
import { SessionEditModal } from './SessionEditModal';
import { motion, AnimatePresence } from 'motion/react';
import {
  Receipt,
  Search,
  Filter,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Store,
  Calendar,
  ArrowRightLeft,
  User
} from 'lucide-react';
import { format } from 'date-fns';

interface ExpenseListProps {
  expenses: Expense[];
  onRemove: (id: string) => Promise<void>;
  onUpdateSession: (
    sessionId: string,
    data: {
      shopName?: string;
      notes?: string;
      sessionDate?: number;
      paidBy?: string;
      items?: SessionItem[];
    }
  ) => Promise<void>;
  currentUser: UserProfile;
  membersInfo: Record<string, UserProfile>;
}

function safeFormatDate(ts: any): string {
  try {
    const num = Number(ts);
    if (!isNaN(num) && num > 0) return format(num, 'MMMM d yyyy').toLowerCase();
    return '';
  } catch {
    return '';
  }
}

export function ExpenseList({
  expenses,
  onRemove,
  onUpdateSession,
  currentUser,
  membersInfo
}: ExpenseListProps) {
  const memberUids = useMemo(() => Object.keys(membersInfo), [membersInfo]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMember, setSelectedMember] = useState<string>('all');

  // Expanded session cards
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  // Editing session modal state
  const [editingSession, setEditingSession] = useState<ShoppingSession | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedSessions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return expenses.filter(exp => {
      // Member Filter
      if (selectedMember !== 'all' && exp.paidBy !== selectedMember) {
        const isOwnerInSession =
          exp.items?.some(i => i.owners.includes(selectedMember)) ||
          Object.keys(exp.shares || {}).includes(selectedMember);

        if (exp.paidBy !== selectedMember && !isOwnerInSession) return false;
      }

      // Category Filter
      if (selectedCategory !== 'all') {
        if (exp.items && exp.items.length > 0) {
          const hasCat = exp.items.some(i => i.category === selectedCategory);
          if (!hasCat) return false;
        } else if (exp.type === 'settlement') {
          return false;
        }
      }

      // Search Term Filter
      if (!term) return true;

      const payerName = (membersInfo[exp.paidBy]?.displayName || '').toLowerCase();
      const shopName = (exp.shopName || '').toLowerCase();
      const sessionDateStr = safeFormatDate(exp.sessionDate || exp.createdAt);

      if (payerName.includes(term) || shopName.includes(term) || sessionDateStr.includes(term)) {
        return true;
      }

      // Check items
      if (exp.items && exp.items.length > 0) {
        const itemMatch = exp.items.some(
          i =>
            i.item.toLowerCase().includes(term) ||
            (i.category || '').toLowerCase().includes(term)
        );
        if (itemMatch) return true;
      } else if (exp.item) {
        if (exp.item.toLowerCase().includes(term)) return true;
      }

      return false;
    });
  }, [expenses, searchTerm, selectedCategory, selectedMember, membersInfo]);

  if (expenses.length === 0) {
    return (
      <div className="text-center py-16 px-6 border border-dashed border-white/10 rounded-2xl glass-light">
        <Receipt className="w-12 h-12 mx-auto text-brand-400/30 mb-3" />
        <p className="text-white/70 font-semibold">No expenses recorded yet</p>
        <p className="text-brand-300/40 text-xs mt-1">Add your first shopping session above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Controls */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400/40" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search items, shops, payers, or dates..."
            className="input-dark w-full pl-10 pr-3 py-2.5 text-xs font-medium"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-brand-300/40 font-medium text-[11px] flex items-center gap-1">
              <Filter className="w-3 h-3" /> Category:
            </span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg border font-medium transition-all ${
                selectedCategory === 'all'
                  ? 'bg-gradient-brand text-white border-brand-500/30 shadow-md'
                  : 'glass-light text-brand-300/60 border-white/5 hover:border-white/15'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-gradient-brand text-white border-brand-500/30 shadow-md'
                    : 'glass-light text-brand-300/60 border-white/5 hover:border-white/15'
                }`}
              >
                {CATEGORY_ICONS[cat]} {cat}
              </button>
            ))}
          </div>

          {/* Member Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-brand-300/40 font-medium text-[11px] flex items-center gap-1">
              <User className="w-3 h-3" /> Payer:
            </span>
            <select
              value={selectedMember}
              onChange={e => setSelectedMember(e.target.value)}
              className="input-dark text-xs font-medium rounded-lg px-2.5 py-1"
            >
              <option value="all">Everyone</option>
              {memberUids.map(uid => (
                <option key={uid} value={uid}>
                  {membersInfo[uid]?.displayName || 'Unknown'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Filtered Expenses Count Indicator */}
      {filteredExpenses.length !== expenses.length && (
        <div className="text-xs text-brand-300/50 font-medium px-1 flex justify-between items-center">
          <span>
            Showing {filteredExpenses.length} of {expenses.length} sessions
          </span>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('all');
              setSelectedMember('all');
            }}
            className="text-brand-400 hover:text-brand-300 underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Expenses / Sessions List */}
      <div className="space-y-3">
        {filteredExpenses.map((exp, i) => {
          const isSettlement = exp.type === 'settlement';
          const isExpanded = Boolean(expandedSessions[exp.id]);
          const payerName = membersInfo[exp.paidBy]?.displayName || 'Unknown';
          const createdDate = exp.sessionDate || exp.createdAt || Date.now();

          // Settlement Document
          if (isSettlement) {
            const paidToUid = Object.keys(exp.shares || {})[0] || exp.paidTo;
            const receiverName = paidToUid ? membersInfo[paidToUid]?.displayName || 'Member' : 'Member';

            return (
              <motion.div
                key={exp.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="bg-accent-green/5 border border-accent-green/15 rounded-2xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent-green/15 text-accent-green rounded-xl">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      {payerName} settled with {receiverName}
                    </h4>
                    <p className="text-xs text-accent-green/60 mt-0.5">
                      {format(createdDate, 'MMM d, yyyy • h:mm a')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg text-accent-green">₹{exp.totalAmount.toFixed(2)}</span>
                  {(exp.paidBy === currentUser.uid || exp.createdBy === currentUser.uid) && (
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this settlement?')) {
                          onRemove(exp.id);
                        }
                      }}
                      className="p-1.5 text-brand-300/30 hover:text-accent-red rounded-lg transition-colors"
                      title="Delete Settlement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          }

          // Shopping Session Document
          const items = exp.items && exp.items.length > 0
            ? exp.items
            : [
                {
                  id: 'item-0',
                  item: exp.item || 'Expense Item',
                  totalAmount: exp.totalAmount,
                  owners: Object.keys(exp.shares || {}),
                  shares: exp.shares || {},
                  category: 'Miscellaneous' as ExpenseCategory
                }
              ];

          const title = items.length === 1 ? items[0].item : `${items.length} Items Shopping`;

          return (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-card rounded-2xl p-4 hover:border-brand-500/20 transition-all space-y-3"
            >
              {/* Session Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base truncate">{title}</span>

                    {exp.shopName && (
                      <span className="pill pill-brand text-[10px]">
                        <Store className="w-3 h-3" />
                        {exp.shopName}
                      </span>
                    )}

                    <span className="text-[11px] text-brand-300/40 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(createdDate, 'MMM d, yyyy')}
                    </span>
                  </div>

                  <div className="text-xs text-brand-300/50 mt-1 flex items-center gap-2">
                    <span>
                      Paid by <strong className="text-white">{payerName}</strong>
                    </span>
                    <span className="text-brand-300/20">•</span>
                    <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                  </div>
                </div>

                {/* Right Side Amount & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-lg font-bold text-white block">₹{exp.totalAmount.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() =>
                      setEditingSession({
                        id: exp.id,
                        shopName: exp.shopName,
                        notes: exp.notes,
                        sessionDate: exp.sessionDate || exp.createdAt,
                        paidBy: exp.paidBy,
                        createdBy: exp.createdBy || exp.paidBy,
                        items,
                        totalAmount: exp.totalAmount,
                        createdAt: exp.createdAt
                      })
                    }
                    className="p-1.5 text-brand-300/30 hover:text-brand-200 hover:bg-white/5 rounded-lg transition-colors"
                    title="Edit Session"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this shopping session?')) {
                        onRemove(exp.id);
                      }
                    }}
                    className="p-1.5 text-brand-300/30 hover:text-accent-red hover:bg-white/5 rounded-lg transition-colors"
                    title="Delete Session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => toggleExpand(exp.id)}
                    className="p-1.5 text-brand-300/30 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Item Preview Chips or Expanded Table */}
              <div className="border-t border-white/5 pt-2.5">
                {!isExpanded ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {items.slice(0, 4).map((it, idx) => (
                      <span
                        key={idx}
                        className="glass-light px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <span className="text-brand-200">{it.item}</span>
                        <span className="text-white font-bold">₹{it.totalAmount.toFixed(0)}</span>
                      </span>
                    ))}

                    {items.length > 4 && (
                      <button
                        onClick={() => toggleExpand(exp.id)}
                        className="text-xs text-brand-400 font-medium hover:text-brand-300 underline"
                      >
                        +{items.length - 4} more
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 mt-1">
                    <h5 className="text-xs font-bold text-brand-300/60 uppercase tracking-wider mb-2">Session Items</h5>
                    <div className="divide-y divide-white/5 glass-light rounded-xl p-3">
                      {items.map((it, idx) => (
                        <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{it.item}</span>
                              <span className={`pill text-[10px] ${CATEGORY_COLORS[it.category] || CATEGORY_COLORS['Miscellaneous']}`}>
                                {CATEGORY_ICONS[it.category] || '📦'} {it.category || 'Miscellaneous'}
                              </span>
                            </div>
                            <div className="text-brand-300/40 text-[11px] mt-0.5">
                              Owners:{' '}
                              {it.owners
                                .map(uid => membersInfo[uid]?.displayName || 'Unknown')
                                .join(', ')}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-white block">₹{it.totalAmount.toFixed(2)}</span>
                            <span className="text-brand-300/30 text-[10px]">
                              ₹{(it.totalAmount / Math.max(1, it.owners.length)).toFixed(2)} / person
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {exp.notes && (
                      <p className="text-xs text-brand-300/40 italic mt-2 px-1">
                        Note: {exp.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Edit Session Modal */}
      {editingSession && (
        <SessionEditModal
          session={editingSession}
          membersInfo={membersInfo}
          onClose={() => setEditingSession(null)}
          onSave={onUpdateSession}
        />
      )}
    </div>
  );
}
