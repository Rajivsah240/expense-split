import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Expense, ExpenseCategory, SessionItem } from '../types';
import { categorizeItem } from '../utils/categories';

export function useExpenses(teamId: string | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExpenses = useCallback(async () => {
    if (!teamId) return;
    const result = await api<{ expenses: Expense[] }>(`teams/${teamId}/expenses`);
    setExpenses(result.expenses);
  }, [teamId]);

  useEffect(() => {
    if (!teamId) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadExpenses().catch(error => console.warn('Could not load expenses:', error)).finally(() => setLoading(false));
  }, [teamId, loadExpenses]);

  const saveExpense = async (payload: Record<string, unknown>) => {
    if (!teamId) return;
    const { expense } = await api<{ expense: Expense }>(`teams/${teamId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setExpenses(current => [expense, ...current]);
  };

  const addSession = async (sessionData: {
    shopName?: string;
    notes?: string;
    sessionDate: number;
    paidBy: string;
    createdBy: string;
    items: SessionItem[];
  }) => {
    const items = sessionData.items.map(item => {
      const share = Math.round((item.totalAmount / Math.max(1, item.owners.length)) * 100) / 100;
      return { ...item, shares: Object.fromEntries(item.owners.map(owner => [owner, share])), category: item.category || categorizeItem(item.item) };
    });
    const shares: Record<string, number> = {};
    items.forEach(item => Object.entries(item.shares).forEach(([memberId, amount]) => {
      shares[memberId] = (shares[memberId] || 0) + amount;
    }));
    await saveExpense({ ...sessionData, items, shares, totalAmount: items.reduce((total, item) => total + item.totalAmount, 0), type: 'session', createdAt: Date.now() });
  };

  const updateSession = async (expenseId: string, sessionData: { shopName?: string; notes?: string; sessionDate?: number; paidBy?: string; items?: SessionItem[] }) => {
    if (!teamId) return;
    const { expense } = await api<{ expense: Expense }>(`teams/${teamId}/expenses/${expenseId}`, {
      method: 'PATCH',
      body: JSON.stringify(sessionData)
    });
    setExpenses(current => current.map(item => item.id === expenseId ? expense : item));
  };

  const addSettlement = async (from: string, to: string, amount: number, notes?: string) => {
    await saveExpense({ type: 'settlement', paidBy: from, paidTo: to, shares: { [to]: amount }, totalAmount: amount, notes: notes || `Settlement from ${from} to ${to}`, createdAt: Date.now() });
  };

  const removeExpense = async (expenseId: string) => {
    if (!teamId) return;
    await api(`teams/${teamId}/expenses/${expenseId}`, { method: 'DELETE' });
    setExpenses(current => current.filter(item => item.id !== expenseId));
  };

  return { expenses, loading, addSession, updateSession, addSettlement, removeExpense };
}
