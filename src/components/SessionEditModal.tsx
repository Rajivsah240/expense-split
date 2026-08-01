import React, { useState, useMemo } from 'react';
import { ShoppingSession, Expense, SessionItem, UserProfile, ExpenseCategory } from '../types';
import { CATEGORIES, categorizeItem } from '../utils/categories';
import { X, Plus, Trash2, Calendar, Store, User, FileText, Check, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

function parseLocalDate(dateStr: string): number {
  if (!dateStr) return Date.now();
  const parts = dateStr.split('-');
  if (parts.length !== 3) return Date.now();
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day, 12, 0, 0);
  return isNaN(date.getTime()) ? Date.now() : date.getTime();
}

interface SessionEditModalProps {
  session: ShoppingSession | Expense;
  membersInfo: Record<string, UserProfile>;
  onClose: () => void;
  onSave: (
    sessionId: string,
    data: {
      shopName?: string;
      notes?: string;
      sessionDate?: number;
      paidBy?: string;
      items?: SessionItem[];
    }
  ) => Promise<void>;
}

export function SessionEditModal({ session, membersInfo, onClose, onSave }: SessionEditModalProps) {
  const memberUids = useMemo(() => Object.keys(membersInfo), [membersInfo]);

  const [shopName, setShopName] = useState(session.shopName || '');
  const [notes, setNotes] = useState(session.notes || '');
  const [sessionDate, setSessionDate] = useState(
    format(session.sessionDate || session.createdAt || Date.now(), 'yyyy-MM-dd')
  );
  const [paidBy, setPaidBy] = useState(session.paidBy);

  // Initialize items array
  const [items, setItems] = useState<SessionItem[]>(() => {
    if (session.items && session.items.length > 0) {
      return session.items.map(i => ({ ...i }));
    }
    // Fallback if legacy expense document
    const legacySession = session as Expense;
    const legacyOwners = Object.keys(legacySession.shares || {});
    const legacyItemName = legacySession.item || 'Expense Item';
    return [
      {
        id: `item-0`,
        item: legacyItemName,
        totalAmount: legacySession.totalAmount || 0,
        owners: legacyOwners.length > 0 ? legacyOwners : memberUids,
        shares: legacySession.shares || {},
        category: categorizeItem(legacyItemName)
      }
    ];
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: `item-new-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        item: 'New Item',
        totalAmount: 0,
        owners: [...memberUids],
        shares: {},
        category: 'General'
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      alert("A session must have at least one item.");
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof SessionItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const cur = { ...updated[index], [field]: value };

      if (field === 'item' && typeof value === 'string') {
        cur.category = categorizeItem(value);
      }

      updated[index] = cur;
      return updated;
    });
  };

  const toggleOwner = (itemIndex: number, ownerUid: string) => {
    setItems(prev => {
      const updated = [...prev];
      const curItem = { ...updated[itemIndex] };
      const curOwners = curItem.owners.includes(ownerUid)
        ? curItem.owners.filter(u => u !== ownerUid)
        : [...curItem.owners, ownerUid];

      // Don't allow 0 owners
      if (curOwners.length === 0) return prev;

      curItem.owners = curOwners;
      curItem.isAmbiguous = false;
      updated[itemIndex] = curItem;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    // Validate prices
    for (const item of items) {
      if (!item.item.trim()) {
        alert("All items must have a name.");
        return;
      }
      if (item.totalAmount <= 0) {
        alert(`Please enter a valid price for "${item.item}".`);
        return;
      }
      if (item.owners.length === 0) {
        alert(`Please select at least one owner for "${item.item}".`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const parsedDate = parseLocalDate(sessionDate);
      await onSave(session.id, {
        shopName: shopName.trim(),
        notes: notes.trim(),
        sessionDate: parsedDate,
        paidBy,
        items
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to update session");
    } finally {
      setIsSaving(false);
    }
  };

  const grandTotal = items.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-stone-200 overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-stone-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold">Edit Shopping Session</h2>
            <p className="text-xs text-stone-400">Update items, prices, owners, or buyer</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
            {/* Session Metadata Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> Shop / Store Name
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={e => setShopName(e.target.value)}
                  placeholder="e.g. Reliance Fresh"
                  className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Paid By
                </label>
                <select
                  value={paidBy}
                  onChange={e => setPaidBy(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 font-medium"
                >
                  {memberUids.map(uid => (
                    <option key={uid} value={uid}>
                      {membersInfo[uid]?.displayName || 'Unknown'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-stone-600 block mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Session Date
                </label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={e => setSessionDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
              </div>
            </div>

            {/* Items Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-800">Items ({items.length})</h3>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-xs bg-stone-800 hover:bg-stone-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>

              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className={`bg-white border rounded-xl p-3 shadow-sm flex flex-col gap-3 ${
                      item.isAmbiguous ? 'border-amber-300 bg-amber-50/20' : 'border-stone-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      <input
                        type="text"
                        value={item.item}
                        onChange={e => handleItemChange(idx, 'item', e.target.value)}
                        placeholder="Item name"
                        className="flex-1 font-medium text-sm px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
                      />

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 text-xs">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.totalAmount || ''}
                            onChange={e => handleItemChange(idx, 'totalAmount', parseFloat(e.target.value) || 0)}
                            placeholder="Price"
                            className="w-full pl-6 pr-2 py-1.5 text-sm font-semibold border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
                          />
                        </div>

                        <select
                          value={item.category}
                          onChange={e => handleItemChange(idx, 'category', e.target.value as ExpenseCategory)}
                          className="text-xs border border-stone-200 rounded-lg px-2 py-1.5 bg-stone-50 font-medium"
                        >
                          {CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg hover:bg-stone-100 transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Owner Pills */}
                    <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-stone-100">
                      <span className="text-stone-400 font-medium">Owners:</span>
                      {memberUids.map(uid => {
                        const isOwner = item.owners.includes(uid);
                        return (
                          <button
                            key={uid}
                            type="button"
                            onClick={() => toggleOwner(idx, uid)}
                            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors flex items-center gap-1 ${
                              isOwner
                                ? 'bg-stone-800 text-white border-stone-800'
                                : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isOwner ? 'bg-emerald-400' : 'bg-stone-300'}`} />
                            {membersInfo[uid]?.displayName || 'Member'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Grocery list for weekend party"
                className="w-full px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
          </div>

          {/* Footer Bar */}
          <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between shrink-0">
            <div>
              <span className="text-xs text-stone-500 block">Session Total</span>
              <span className="text-lg font-bold text-stone-900">₹{grandTotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-stone-200 text-stone-600 hover:bg-stone-100 font-medium rounded-xl text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
