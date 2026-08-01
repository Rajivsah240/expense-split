import React, { useState, useRef } from 'react';
import { UserProfile, SessionItem, ExpenseCategory } from '../types';
import { CATEGORIES, categorizeItem } from '../utils/categories';
import { parseExpensesHybrid } from '../utils/hybridParser';
import {
  Plus,
  ListPlus,
  TextSelect,
  Image as ImageIcon,
  Camera,
  X,
  Store,
  Calendar,
  User,
  AlertTriangle,
  Check,
  Sparkles,
  Trash2,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';

interface ExpenseFormProps {
  onAddSession: (sessionData: {
    shopName?: string;
    notes?: string;
    sessionDate: number;
    paidBy: string;
    createdBy: string;
    items: SessionItem[];
  }) => Promise<void>;
  currentUser: UserProfile;
  membersInfo: Record<string, UserProfile>;
}

export function ExpenseForm({ onAddSession, currentUser, membersInfo }: ExpenseFormProps) {
  const memberUids = Object.keys(membersInfo);

  const [activeTab, setActiveTab] = useState<'quick' | 'text' | 'receipt'>('quick');

  // Quick mode state
  const [quickItem, setQuickItem] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickCategory, setQuickCategory] = useState<ExpenseCategory>('General');
  const [quickPaidBy, setQuickPaidBy] = useState(currentUser.uid);
  const [quickOwners, setQuickOwners] = useState<string[]>(memberUids);

  // Text / Receipt mode input state
  const [inputText, setInputText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Parsing & Session Preview State
  const [isParsing, setIsParsing] = useState(false);
  const [parsedSession, setParsedSession] = useState<{
    shopName: string;
    notes: string;
    sessionDate: string; // yyyy-MM-dd
    paidBy: string;
    items: SessionItem[];
    usedAi: boolean;
    hasAmbiguous: boolean;
  } | null>(null);

  const [isSavingSession, setIsSavingSession] = useState(false);

  // Single / Quick Add handler
  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickItem || !quickPrice || quickOwners.length === 0) return;

    const price = parseFloat(quickPrice);
    if (isNaN(price) || price <= 0) return;

    setIsSavingSession(true);
    try {
      const item: SessionItem = {
        id: `item-quick-${Date.now()}`,
        item: quickItem.trim(),
        totalAmount: price,
        owners: quickOwners,
        shares: {},
        category: quickCategory || categorizeItem(quickItem)
      };

      await onAddSession({
        paidBy: quickPaidBy,
        createdBy: currentUser.uid,
        sessionDate: Date.now(),
        items: [item]
      });

      // Reset
      setQuickItem('');
      setQuickPrice('');
      setQuickCategory('General');
      setQuickOwners(memberUids);
    } catch (err) {
      console.error(err);
      alert('Failed to add expense');
    } finally {
      setIsSavingSession(false);
    }
  };

  // Handle Receipt Image
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Hybrid Parse Trigger
  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText && !imagePreview) return;

    setIsParsing(true);
    try {
      const result = await parseExpensesHybrid({
        text: inputText,
        imageBase64: imagePreview || undefined,
        imageMimeType: imageFile?.type || undefined,
        paidByUid: currentUser.uid,
        membersInfo
      });

      if (result.items.length === 0) {
        alert("Could not extract any items. Please check text or image quality.");
        return;
      }

      setParsedSession({
        shopName: result.shopName || '',
        notes: '',
        sessionDate: format(Date.now(), 'yyyy-MM-dd'),
        paidBy: currentUser.uid,
        items: result.items,
        usedAi: result.usedAi,
        hasAmbiguous: result.hasAmbiguous
      });
    } catch (err) {
      console.error(err);
      alert("Error parsing expenses");
    } finally {
      setIsParsing(false);
    }
  };

  // Session Preview Item Modifications
  const updatePreviewItem = (index: number, field: keyof SessionItem, value: any) => {
    if (!parsedSession) return;
    const updatedItems = [...parsedSession.items];
    const cur = { ...updatedItems[index], [field]: value };

    if (field === 'item' && typeof value === 'string') {
      cur.category = categorizeItem(value);
    }

    updatedItems[index] = cur;

    const anyAmbiguous = updatedItems.some(i => i.isAmbiguous);
    setParsedSession({
      ...parsedSession,
      items: updatedItems,
      hasAmbiguous: anyAmbiguous
    });
  };

  const togglePreviewOwner = (itemIndex: number, ownerUid: string) => {
    if (!parsedSession) return;
    const updatedItems = [...parsedSession.items];
    const item = { ...updatedItems[itemIndex] };

    const newOwners = item.owners.includes(ownerUid)
      ? item.owners.filter(u => u !== ownerUid)
      : [...item.owners, ownerUid];

    if (newOwners.length === 0) return; // Prevent empty owners

    item.owners = newOwners;
    item.isAmbiguous = false;
    updatedItems[itemIndex] = item;

    const anyAmbiguous = updatedItems.some(i => i.isAmbiguous);
    setParsedSession({
      ...parsedSession,
      items: updatedItems,
      hasAmbiguous: anyAmbiguous
    });
  };

  const addPreviewItem = () => {
    if (!parsedSession) return;
    setParsedSession({
      ...parsedSession,
      items: [
        ...parsedSession.items,
        {
          id: `item-${Date.now()}`,
          item: 'New Item',
          totalAmount: 0,
          owners: [...memberUids],
          shares: {},
          category: 'General'
        }
      ]
    });
  };

  const removePreviewItem = (index: number) => {
    if (!parsedSession) return;
    if (parsedSession.items.length <= 1) {
      alert("Session must have at least one item.");
      return;
    }
    const updated = parsedSession.items.filter((_, i) => i !== index);
    setParsedSession({ ...parsedSession, items: updated });
  };

  // Save Shopping Session to Firestore
  const handleSaveParsedSession = async () => {
    if (!parsedSession || isSavingSession) return;

    for (const item of parsedSession.items) {
      if (!item.item.trim()) {
        alert("All items must have a description.");
        return;
      }
      if (item.totalAmount <= 0) {
        alert(`Please enter a valid amount for "${item.item}".`);
        return;
      }
      if (item.owners.length === 0) {
        alert(`Please assign at least one owner for "${item.item}".`);
        return;
      }
    }

    setIsSavingSession(true);
    try {
      const parsedDate = new Date(parsedSession.sessionDate).getTime();

      await onAddSession({
        shopName: parsedSession.shopName.trim(),
        notes: parsedSession.notes.trim(),
        sessionDate: isNaN(parsedDate) ? Date.now() : parsedDate,
        paidBy: parsedSession.paidBy,
        createdBy: currentUser.uid,
        items: parsedSession.items
      });

      // Reset
      setParsedSession(null);
      setInputText('');
      removeImage();
    } catch (err) {
      console.error(err);
      alert("Failed to save shopping session.");
    } finally {
      setIsSavingSession(false);
    }
  };

  const grandTotal = parsedSession
    ? parsedSession.items.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0)
    : 0;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <h2 className="font-semibold text-stone-800 text-lg">Add Shopping Session</h2>

        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('quick');
              setParsedSession(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'quick' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Quick Add
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('text');
              setParsedSession(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'text' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <TextSelect className="w-3.5 h-3.5" /> WhatsApp / Text
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('receipt');
              setParsedSession(null);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'receipt' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Receipt Scan
          </button>
        </div>
      </div>

      {/* QUICK ADD MODE */}
      {activeTab === 'quick' && (
        <form onSubmit={handleQuickSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-semibold text-stone-600 block">Item Name</label>
              <input
                type="text"
                value={quickItem}
                onChange={e => {
                  setQuickItem(e.target.value);
                  setQuickCategory(categorizeItem(e.target.value));
                }}
                placeholder="e.g. Milk & Eggs"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-600 block">Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quickPrice}
                onChange={e => setQuickPrice(e.target.value)}
                placeholder="180.00"
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-stone-600 block">Category</label>
              <select
                value={quickCategory}
                onChange={e => setQuickCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 font-medium"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1">Who Paid?</label>
              <select
                value={quickPaidBy}
                onChange={e => setQuickPaidBy(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 font-medium"
              >
                {memberUids.map(uid => (
                  <option key={uid} value={uid}>
                    {membersInfo[uid]?.displayName || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1">Split Among</label>
              <div className="flex gap-1.5 flex-wrap">
                {memberUids.map(uid => {
                  const isOwner = quickOwners.includes(uid);
                  return (
                    <button
                      key={uid}
                      type="button"
                      onClick={() =>
                        setQuickOwners(prev =>
                          isOwner ? prev.filter(u => u !== uid) : [...prev, uid]
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                        isOwner
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isOwner ? 'bg-emerald-400' : 'bg-stone-300'}`} />
                      {membersInfo[uid]?.displayName || 'User'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSavingSession || !quickItem || !quickPrice || quickOwners.length === 0}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {isSavingSession ? 'Saving...' : 'Save Quick Expense'}
          </button>
        </form>
      )}

      {/* WHATSAPP / TEXT PARSER MODE */}
      {activeTab === 'text' && !parsedSession && (
        <form onSubmit={handleParse} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-stone-700">Paste WhatsApp List</label>
              <button
                type="button"
                onClick={() =>
                  setInputText(
                    `Reliance Fresh\nVegetables - 130/3\nMilk - 100/3\nChicken - 420 AR\nPaneer - 180 A,R\nSoap - 40 (B)\nJuice - 20 Ashutosh`
                  )
                }
                className="text-stone-500 hover:text-stone-800 flex items-center gap-1 bg-stone-100 px-2.5 py-1 rounded-md text-[11px]"
              >
                <Sparkles className="w-3 h-3 text-amber-500" /> Fill Example
              </button>
            </div>

            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Vegetables - 130/3\nMilk - 100/3\nChicken - 420 AR\nPaneer - 180 A,R\nSoap - 40 (B)`}
              rows={5}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 text-sm font-mono"
            />

            <p className="text-[11px] text-stone-500">
              Supports: initials (<code>A</code>, <code>R</code>, <code>B</code>), combinations (<code>AR</code>, <code>A,R</code>), <code>/3</code>, <code>all</code>, <code>me</code>, <code>(B)</code>.
            </p>
          </div>

          <button
            type="submit"
            disabled={isParsing || !inputText.trim()}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            {isParsing ? 'Parsing with Smart Engine...' : 'Parse & Preview Session'}
          </button>
        </form>
      )}

      {/* RECEIPT SCANNER MODE */}
      {activeTab === 'receipt' && !parsedSession && (
        <form onSubmit={handleParse} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-700 block">Upload or Capture Receipt Photo</label>

            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Receipt preview" className="h-44 rounded-xl border border-stone-200 object-cover shadow-sm" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-white text-stone-500 hover:text-red-500 rounded-full p-1 border border-stone-200 shadow"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  ref={fileInputRef}
                  className="hidden"
                  id="receipt-file-input"
                />
                <label
                  htmlFor="receipt-file-input"
                  className="p-4 border-2 border-dashed border-stone-200 hover:border-stone-400 rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 text-stone-600 hover:bg-stone-50 transition-colors"
                >
                  <ImageIcon className="w-6 h-6 text-stone-400" />
                  <span className="text-xs font-medium">Upload Receipt Image</span>
                </label>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageChange}
                  ref={cameraInputRef}
                  className="hidden"
                  id="receipt-camera-input"
                />
                <label
                  htmlFor="receipt-camera-input"
                  className="p-4 border-2 border-dashed border-stone-200 hover:border-stone-400 rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 text-stone-600 hover:bg-stone-50 transition-colors"
                >
                  <Camera className="w-6 h-6 text-stone-400" />
                  <span className="text-xs font-medium">Take Photo with Camera</span>
                </label>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isParsing || !imagePreview}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            {isParsing ? 'Scanning Receipt with AI OCR...' : 'Scan Receipt & Preview'}
          </button>
        </form>
      )}

      {/* PARSED SHOPPING SESSION INTERACTIVE PREVIEW TABLE */}
      {parsedSession && (
        <div className="space-y-5 pt-2">
          {/* Ambiguity Alert Banner */}
          {parsedSession.hasAmbiguous && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Ambiguous Owners Detected!</span> Please verify and select the correct owners for highlighted items before saving.
              </div>
            </div>
          )}

          {/* Session Header Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1 flex items-center gap-1">
                <Store className="w-3.5 h-3.5" /> Shop / Store Name
              </label>
              <input
                type="text"
                value={parsedSession.shopName}
                onChange={e => setParsedSession({ ...parsedSession, shopName: e.target.value })}
                placeholder="e.g. Reliance Fresh"
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Paid By
              </label>
              <select
                value={parsedSession.paidBy}
                onChange={e => setParsedSession({ ...parsedSession, paidBy: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-400"
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
                <Calendar className="w-3.5 h-3.5" /> Date
              </label>
              <input
                type="date"
                value={parsedSession.sessionDate}
                onChange={e => setParsedSession({ ...parsedSession, sessionDate: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
          </div>

          {/* Itemized Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-800">Parsed Items ({parsedSession.items.length})</h3>
              <button
                type="button"
                onClick={addPreviewItem}
                className="text-xs bg-stone-800 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-stone-700 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {parsedSession.items.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className={`bg-white border rounded-xl p-3 text-xs flex flex-col gap-2 shadow-sm ${
                    item.isAmbiguous ? 'border-amber-400 bg-amber-50/30' : 'border-stone-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.item}
                      onChange={e => updatePreviewItem(idx, 'item', e.target.value)}
                      className="flex-1 font-semibold text-stone-900 border border-stone-200 px-2 py-1 rounded-md focus:outline-none"
                    />

                    <div className="relative w-24">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-400">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={item.totalAmount || ''}
                        onChange={e => updatePreviewItem(idx, 'totalAmount', parseFloat(e.target.value) || 0)}
                        className="w-full pl-5 pr-2 py-1 font-bold border border-stone-200 rounded-md focus:outline-none"
                      />
                    </div>

                    <select
                      value={item.category}
                      onChange={e => updatePreviewItem(idx, 'category', e.target.value as ExpenseCategory)}
                      className="border border-stone-200 rounded-md px-1.5 py-1 bg-stone-50 font-medium"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => removePreviewItem(idx)}
                      className="p-1 text-stone-400 hover:text-red-500 rounded hover:bg-stone-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Owner Pill Multi-Select */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-stone-100">
                    <span className="text-stone-400 font-medium text-[11px]">Owners:</span>
                    {memberUids.map(uid => {
                      const isOwner = item.owners.includes(uid);
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => togglePreviewOwner(idx, uid)}
                          className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors ${
                            isOwner
                              ? 'bg-stone-800 text-white border-stone-800'
                              : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100'
                          }`}
                        >
                          {membersInfo[uid]?.displayName || 'User'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-stone-200">
            <div>
              <span className="text-xs text-stone-500 block">Grand Total</span>
              <span className="text-lg font-bold text-stone-900">₹{grandTotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setParsedSession(null)}
                className="px-3.5 py-2 border border-stone-200 text-stone-600 rounded-xl text-xs font-medium hover:bg-stone-100"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSaveParsedSession}
                disabled={isSavingSession}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isSavingSession ? 'Saving Session...' : 'Save Shopping Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
