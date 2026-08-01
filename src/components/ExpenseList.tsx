import React, { useState, useMemo } from 'react';
import { Expense, ShoppingSession, UserProfile, SessionItem, ExpenseCategory } from '../types';
import { CATEGORIES } from '../utils/categories';
import { SessionEditModal } from './SessionEditModal';
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

export function ExpenseList({
  expenses,
  onRemove,
  onUpdateSession,
  currentUser,
  membersInfo
}: ExpenseListProps) {
  const memberUids = Object.keys(membersInfo);

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
        // also check if member is an owner in any item
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
      const sessionDateStr = format(exp.sessionDate || exp.createdAt || Date.now(), 'MMMM d yyyy').toLowerCase();

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
      <div className="text-center py-12 px-4 border border-dashed border-stone-200 rounded-2xl bg-white shadow-sm">
        <Receipt className="w-12 h-12 mx-auto text-stone-300 mb-3" />
        <p className="text-stone-600 font-semibold">No expenses recorded yet</p>
        <p className="text-stone-400 text-xs mt-1">Add your first shopping session above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filter Controls */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search items, shops, payers, or dates..."
            className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100 text-xs">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-stone-400 font-medium text-[11px] flex items-center gap-1">
              <Filter className="w-3 h-3" /> Category:
            </span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
              }`}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Member Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-stone-400 font-medium text-[11px] flex items-center gap-1">
              <User className="w-3 h-3" /> Payer:
            </span>
            <select
              value={selectedMember}
              onChange={e => setSelectedMember(e.target.value)}
              className="bg-stone-50 border border-stone-200 text-stone-700 font-medium rounded-lg px-2 py-1 text-xs focus:outline-none"
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
        <div className="text-xs text-stone-500 font-medium px-1 flex justify-between items-center">
          <span>
            Showing {filteredExpenses.length} of {expenses.length} sessions
          </span>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('all');
              setSelectedMember('all');
            }}
            className="text-stone-700 underline hover:text-stone-900"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Expenses / Sessions List */}
      <div className="space-y-3">
        {filteredExpenses.map(exp => {
          const isSettlement = exp.type === 'settlement';
          const isExpanded = Boolean(expandedSessions[exp.id]);
          const payerName = membersInfo[exp.paidBy]?.displayName || 'Unknown';
          const createdDate = exp.sessionDate || exp.createdAt || Date.now();

          // Settlement Document
          if (isSettlement) {
            const paidToUid = Object.keys(exp.shares || {})[0] || exp.paidTo;
            const receiverName = paidToUid ? membersInfo[paidToUid]?.displayName || 'Member' : 'Member';

            return (
              <div
                key={exp.id}
                className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-950 text-sm">
                      {payerName} settled with {receiverName}
                    </h4>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {format(createdDate, 'MMM d, yyyy • h:mm a')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg text-emerald-700">₹{exp.totalAmount.toFixed(2)}</span>
                  {(exp.paidBy === currentUser.uid || exp.createdBy === currentUser.uid) && (
                    <button
                      onClick={() => onRemove(exp.id)}
                      className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg transition-colors"
                      title="Delete Settlement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
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
                  category: 'General' as ExpenseCategory
                }
              ];

          const title = exp.shopName || (items.length === 1 ? items[0].item : `${items.length} Items Shopping`);

          return (
            <div
              key={exp.id}
              className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm hover:border-stone-300 transition-colors space-y-3"
            >
              {/* Session Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-stone-900 text-base truncate">{title}</span>

                    {exp.shopName && (
                      <span className="text-[11px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-stone-200">
                        <Store className="w-3 h-3" />
                        {exp.shopName}
                      </span>
                    )}

                    <span className="text-[11px] text-stone-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(createdDate, 'MMM d, yyyy')}
                    </span>
                  </div>

                  <div className="text-xs text-stone-500 mt-1 flex items-center gap-2">
                    <span>
                      Paid by <strong className="text-stone-800">{payerName}</strong>
                    </span>
                    <span className="text-stone-300">•</span>
                    <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
                  </div>
                </div>

                {/* Right Side Amount & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-lg font-bold text-stone-900 block">₹{exp.totalAmount.toFixed(2)}</span>
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
                    className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
                    title="Edit Session"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onRemove(exp.id)}
                    className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-stone-100 rounded-lg transition-colors"
                    title="Delete Session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => toggleExpand(exp.id)}
                    className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Item Preview Chips or Expanded Table */}
              <div className="border-t border-stone-100 pt-2.5">
                {!isExpanded ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {items.slice(0, 4).map((it, idx) => (
                      <span
                        key={idx}
                        className="bg-stone-50 border border-stone-200 text-stone-700 px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <span>{it.item}</span>
                        <span className="text-stone-900 font-bold">₹{it.totalAmount.toFixed(0)}</span>
                      </span>
                    ))}

                    {items.length > 4 && (
                      <button
                        onClick={() => toggleExpand(exp.id)}
                        className="text-xs text-stone-500 font-medium hover:text-stone-800 underline"
                      >
                        +{items.length - 4} more
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 mt-1">
                    <h5 className="text-xs font-bold text-stone-600 uppercase tracking-wider mb-2">Session Items</h5>
                    <div className="divide-y divide-stone-100 bg-stone-50 rounded-xl p-3 border border-stone-200">
                      {items.map((it, idx) => (
                        <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-stone-900">{it.item}</span>
                              <span className="text-[10px] bg-white border border-stone-200 text-stone-600 px-2 py-0.5 rounded font-medium">
                                {it.category || 'General'}
                              </span>
                            </div>
                            <div className="text-stone-500 text-[11px] mt-0.5">
                              Owners:{' '}
                              {it.owners
                                .map(uid => membersInfo[uid]?.displayName || 'Unknown')
                                .join(', ')}
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-stone-900 block">₹{it.totalAmount.toFixed(2)}</span>
                            <span className="text-stone-400 text-[10px]">
                              ₹{(it.totalAmount / Math.max(1, it.owners.length)).toFixed(2)} / person
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {exp.notes && (
                      <p className="text-xs text-stone-500 italic mt-2 px-1">
                        Note: {exp.notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
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
