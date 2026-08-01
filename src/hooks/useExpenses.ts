import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ShoppingSession, Expense, SessionItem, ExpenseCategory } from '../types';
import { categorizeItem } from '../utils/categories';

export function useExpenses(teamId: string | null) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    const expensesRef = collection(db, 'teams', teamId, 'expenses');
    const q = query(expensesRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const expenseData = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data
          } as Expense;
        });
        setExpenses(expenseData);
        setLoading(false);
      },
      (error) => {
        console.warn('Could not load expenses:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [teamId]);

  // Add a complete Shopping Session with multiple items
  const addSession = async (sessionData: {
    shopName?: string;
    notes?: string;
    sessionDate: number;
    paidBy: string;
    createdBy: string;
    items: SessionItem[];
  }) => {
    if (!teamId) return;

    // Compute total sum and item shares
    let grandTotal = 0;
    const processedItems = sessionData.items.map(item => {
      const numOwners = Math.max(1, item.owners.length);
      const splitAmount = Math.round((item.totalAmount / numOwners) * 100) / 100;
      const shares: Record<string, number> = {};
      item.owners.forEach(uid => {
        shares[uid] = splitAmount;
      });
      grandTotal += item.totalAmount;

      return {
        ...item,
        shares,
        category: item.category || categorizeItem(item.item)
      };
    });

    // Create primary combined shares map for balance calculation across session
    const sessionShares: Record<string, number> = {};
    processedItems.forEach(item => {
      Object.entries(item.shares).forEach(([uid, amt]) => {
        sessionShares[uid] = (sessionShares[uid] || 0) + amt;
      });
    });

    await addDoc(collection(db, 'teams', teamId, 'expenses'), {
      type: 'session',
      shopName: sessionData.shopName || '',
      notes: sessionData.notes || '',
      sessionDate: sessionData.sessionDate || Date.now(),
      paidBy: sessionData.paidBy,
      createdBy: sessionData.createdBy,
      items: processedItems,
      totalAmount: grandTotal,
      shares: sessionShares, // combined shares for fast balance querying
      createdAt: Date.now()
    });
  };

  // Update an existing Shopping Session
  const updateSession = async (
    sessionId: string,
    sessionData: {
      shopName?: string;
      notes?: string;
      sessionDate?: number;
      paidBy?: string;
      items?: SessionItem[];
    }
  ) => {
    if (!teamId) return;

    const docRef = doc(db, 'teams', teamId, 'expenses', sessionId);

    if (sessionData.items) {
      let grandTotal = 0;
      const processedItems = sessionData.items.map(item => {
        const numOwners = Math.max(1, item.owners.length);
        const splitAmount = Math.round((item.totalAmount / numOwners) * 100) / 100;
        const shares: Record<string, number> = {};
        item.owners.forEach(uid => {
          shares[uid] = splitAmount;
        });
        grandTotal += item.totalAmount;

        return {
          ...item,
          shares,
          category: item.category || categorizeItem(item.item)
        };
      });

      const sessionShares: Record<string, number> = {};
      processedItems.forEach(item => {
        Object.entries(item.shares).forEach(([uid, amt]) => {
          sessionShares[uid] = (sessionShares[uid] || 0) + amt;
        });
      });

      await updateDoc(docRef, {
        ...sessionData,
        items: processedItems,
        totalAmount: grandTotal,
        shares: sessionShares,
        updatedAt: Date.now()
      });
    } else {
      await updateDoc(docRef, {
        ...sessionData,
        updatedAt: Date.now()
      });
    }
  };

  // Add single expense (backward compatibility wrapper around addSession)
  const addExpense = async (expense: {
    item: string;
    totalAmount: number;
    paidBy: string;
    shares: Record<string, number>;
    category?: ExpenseCategory;
  }) => {
    if (!teamId) return;

    const owners = Object.keys(expense.shares);
    const item: SessionItem = {
      id: `item-${Date.now()}`,
      item: expense.item,
      totalAmount: expense.totalAmount,
      owners,
      shares: expense.shares,
      category: expense.category || categorizeItem(expense.item)
    };

    await addSession({
      paidBy: expense.paidBy,
      createdBy: expense.paidBy,
      sessionDate: Date.now(),
      items: [item]
    });
  };

  const addMultipleExpenses = async (
    newExpenses: { item: string; totalAmount: number; paidBy: string; shares: Record<string, number> }[]
  ) => {
    if (!teamId || newExpenses.length === 0) return;

    const paidBy = newExpenses[0].paidBy;
    const items: SessionItem[] = newExpenses.map((e, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      item: e.item,
      totalAmount: e.totalAmount,
      owners: Object.keys(e.shares),
      shares: e.shares,
      category: categorizeItem(e.item)
    }));

    await addSession({
      paidBy,
      createdBy: paidBy,
      sessionDate: Date.now(),
      items
    });
  };

  const addSettlement = async (from: string, to: string, amount: number, notes?: string) => {
    if (!teamId) return;
    await addDoc(collection(db, 'teams', teamId, 'expenses'), {
      type: 'settlement',
      paidBy: from,
      paidTo: to,
      shares: { [to]: amount },
      totalAmount: amount,
      notes: notes || `Settlement from ${from} to ${to}`,
      createdAt: Date.now()
    });
  };

  const removeExpense = async (id: string) => {
    if (!teamId) return;
    await deleteDoc(doc(db, 'teams', teamId, 'expenses', id));
  };

  return {
    expenses,
    loading,
    addSession,
    updateSession,
    addExpense,
    addMultipleExpenses,
    addSettlement,
    removeExpense
  };
}
