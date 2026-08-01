export interface UserProfile {
  uid: string;
  displayName: string;
  username?: string;
  usernameLower?: string;
  email: string;
  photoURL?: string;
}

export interface Team {
  id: string;
  name: string;
  creatorId: string;
  memberIds: string[];
  membersInfo: Record<string, UserProfile>;
  createdAt: number;
}

export type ExpenseCategory = 
  | 'Vegetables' 
  | 'Dairy' 
  | 'Snacks' 
  | 'Beverages' 
  | 'Household' 
  | 'Personal Care' 
  | 'Rent & Bills'
  | 'General';

export interface SessionItem {
  id: string;
  item: string;
  totalAmount: number;
  owners: string[]; // array of user UIDs
  shares: Record<string, number>; // map of user UID -> split amount
  category: ExpenseCategory;
  isAmbiguous?: boolean;
  ambiguityReason?: string;
}

export interface ShoppingSession {
  id: string;
  type?: 'session' | 'expense' | 'settlement';
  shopName?: string;
  notes?: string;
  sessionDate: number; // timestamp
  paidBy: string; // user UID
  createdBy: string; // user UID
  items: SessionItem[];
  totalAmount: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Settlement {
  id: string;
  type: 'settlement';
  paidBy: string; // user UID who paid
  paidTo?: string; // user UID who received
  shares: Record<string, number>; // { [paidToUid]: amount }
  totalAmount: number;
  notes?: string;
  createdAt: number;
}

// For legacy/backward compatibility
export interface Expense {
  id: string;
  item?: string;
  totalAmount: number;
  paidBy: string;
  shares: Record<string, number>;
  createdAt: number;
  type?: 'session' | 'expense' | 'settlement';
  shopName?: string;
  notes?: string;
  sessionDate?: number;
  createdBy?: string;
  items?: SessionItem[];
}

