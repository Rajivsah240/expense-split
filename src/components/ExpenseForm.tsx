import React, { useState, useRef, useMemo, useEffect } from 'react';
import { UserProfile, SessionItem, ExpenseCategory } from '../types';
import { CATEGORIES, CATEGORY_ICONS, categorizeItem } from '../utils/categories';
import { parseExpensesHybrid } from '../utils/hybridParser';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
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
  Loader2
} from 'lucide-react';
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
  const memberUids = useMemo(() => Object.keys(membersInfo), [membersInfo]);

  const [activeTab, setActiveTab] = useState<'quick' | 'text' | 'receipt'>('quick');

  // Quick mode state
  const [quickItem, setQuickItem] = useState('');
  const [quickPrice, setQuickPrice] = useState('');
  const [quickCategory, setQuickCategory] = useState<ExpenseCategory>('Miscellaneous');
  const [quickPaidBy, setQuickPaidBy] = useState(currentUser.uid);
  const [quickOwners, setQuickOwners] = useState<string[]>(memberUids);

  useEffect(() => {
    setQuickOwners(memberUids);
  }, [memberUids]);

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
      setQuickCategory('Miscellaneous');
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
          category: 'Miscellaneous'
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

  // Save the shopping session to the application API.
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
      const parsedDate = parseLocalDate(parsedSession.sessionDate);

      await onAddSession({
        shopName: parsedSession.shopName.trim(),
        notes: parsedSession.notes.trim(),
        sessionDate: parsedDate,
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
    <div className="glass-card rounded-2xl p-5 space-y-4">
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <h2 className="font-bold text-white text-lg">Add Shopping Session</h2>

        <div className="flex glass-light p-1 rounded-xl">
          <button
            type="button"
            onClick={() => { setActiveTab('quick'); setParsedSession(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'quick' ? 'bg-gradient-brand text-white shadow-md' : 'text-brand-300/60 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Quick Add
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('text'); setParsedSession(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'text' ? 'bg-gradient-brand text-white shadow-md' : 'text-brand-300/60 hover:text-white'
            }`}
          >
            <TextSelect className="w-3.5 h-3.5" /> WhatsApp / Text
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('receipt'); setParsedSession(null); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'receipt' ? 'bg-gradient-brand text-white shadow-md' : 'text-brand-300/60 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Receipt
          </button>
        </div>
      </div>

      {/* QUICK ADD MODE */}
      {activeTab === 'quick' && (
        <form onSubmit={handleQuickSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="text-xs font-semibold text-brand-200/70 block pl-0.5">Item Name</label>
              <input
                type="text"
                value={quickItem}
                onChange={e => {
                  setQuickItem(e.target.value);
                  setQuickCategory(categorizeItem(e.target.value));
                }}
                placeholder="e.g. Milk & Eggs"
                className="input-dark w-full px-3.5 py-2.5 text-sm"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-200/70 block pl-0.5">Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={quickPrice}
                onChange={e => setQuickPrice(e.target.value)}
                placeholder="180.00"
                className="input-dark w-full px-3.5 py-2.5 text-sm font-semibold"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-200/70 block pl-0.5">Category</label>
              <select
                value={quickCategory}
                onChange={e => setQuickCategory(e.target.value as ExpenseCategory)}
                className="input-dark w-full px-3.5 py-2.5 text-sm font-medium"
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {CATEGORY_ICONS[c]} {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-brand-200/70 block mb-1.5 pl-0.5">Who Paid?</label>
              <select
                value={quickPaidBy}
                onChange={e => setQuickPaidBy(e.target.value)}
                className="input-dark w-full px-3.5 py-2.5 text-sm font-medium"
              >
                {memberUids.map(uid => (
                  <option key={uid} value={uid}>
                    {membersInfo[uid]?.displayName || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-200/70 block mb-1.5 pl-0.5">Split Among</label>
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
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${
                        isOwner
                          ? 'bg-gradient-brand text-white border-brand-500/30 shadow-md shadow-brand-500/10'
                          : 'glass-light text-brand-300/60 border-white/5 hover:border-white/15'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isOwner ? 'bg-accent-green' : 'bg-white/20'}`} />
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
            className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
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
              <label className="font-semibold text-brand-200/70 pl-0.5">Paste WhatsApp List</label>
              <button
                type="button"
                onClick={() =>
                  setInputText(
                    `Reliance Fresh\nVegetables - 130/3\nMilk - 100/3\nChicken - 420 AR\nPaneer - 180 A,R\nSoap - 40 (B)\nJuice - 20 Ashutosh`
                  )
                }
                className="btn-ghost px-2.5 py-1 rounded-md text-[11px] flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-accent-amber" /> Fill Example
              </button>
            </div>

            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Vegetables - 130/3\nMilk - 100/3\nChicken - 420 AR\nPaneer - 180 A,R\nSoap - 40 (B)`}
              rows={5}
              className="input-dark w-full px-3.5 py-3 text-sm font-mono resize-none"
            />

            <p className="text-[11px] text-brand-300/40 pl-0.5">
              Supports: initials (<code className="text-brand-300/60">A</code>, <code className="text-brand-300/60">R</code>, <code className="text-brand-300/60">B</code>), combos (<code className="text-brand-300/60">AR</code>, <code className="text-brand-300/60">A,R</code>), <code className="text-brand-300/60">/3</code>, <code className="text-brand-300/60">all</code>, <code className="text-brand-300/60">me</code>, <code className="text-brand-300/60">(B)</code>.
            </p>
          </div>

          <button
            type="submit"
            disabled={isParsing || !inputText.trim()}
            className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
          >
            {isParsing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Parsing with Smart Engine...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Parse & Preview Session</>
            )}
          </button>
        </form>
      )}

      {/* RECEIPT SCANNER MODE */}
      {activeTab === 'receipt' && !parsedSession && (
        <form onSubmit={handleParse} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-200/70 block pl-0.5">Upload or Capture Receipt Photo</label>

            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Receipt preview" className="h-44 rounded-xl border border-white/10 object-cover shadow-lg" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-surface-100 text-brand-300/60 hover:text-accent-red rounded-full p-1 border border-white/10 shadow-lg transition-colors"
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
                  className="p-6 border-2 border-dashed border-white/10 hover:border-brand-500/30 rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 text-brand-300/60 hover:text-white transition-all hover:bg-white/5"
                >
                  <ImageIcon className="w-6 h-6" />
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
                  className="p-6 border-2 border-dashed border-white/10 hover:border-brand-500/30 rounded-xl cursor-pointer flex flex-col items-center justify-center gap-2 text-brand-300/60 hover:text-white transition-all hover:bg-white/5"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-xs font-medium">Take Photo with Camera</span>
                </label>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isParsing || !imagePreview}
            className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
          >
            {isParsing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Scanning Receipt with AI OCR...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Scan Receipt & Preview</>
            )}
          </button>
        </form>
      )}

      {/* PARSED SHOPPING SESSION INTERACTIVE PREVIEW TABLE */}
      <AnimatePresence>
        {parsedSession && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5 pt-2"
          >
            {/* Ambiguity Alert Banner */}
            {parsedSession.hasAmbiguous && (
              <div className="bg-accent-amber/10 border border-accent-amber/20 text-accent-amber p-3.5 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div>
                  <span className="font-bold">Ambiguous Owners Detected!</span> Please verify and select the correct owners for highlighted items before saving.
                </div>
              </div>
            )}

            {/* Session Header Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 glass-light p-4 rounded-xl">
              <div>
                <label className="text-xs font-semibold text-brand-200/70 block mb-1 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> Shop / Store Name
                </label>
                <input
                  type="text"
                  value={parsedSession.shopName}
                  onChange={e => setParsedSession({ ...parsedSession, shopName: e.target.value })}
                  placeholder="e.g. Reliance Fresh"
                  className="input-dark w-full px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-200/70 block mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Paid By
                </label>
                <select
                  value={parsedSession.paidBy}
                  onChange={e => setParsedSession({ ...parsedSession, paidBy: e.target.value })}
                  className="input-dark w-full px-3 py-1.5 text-xs font-medium"
                >
                  {memberUids.map(uid => (
                    <option key={uid} value={uid}>
                      {membersInfo[uid]?.displayName || 'Unknown'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-200/70 block mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </label>
                <input
                  type="date"
                  value={parsedSession.sessionDate}
                  onChange={e => setParsedSession({ ...parsedSession, sessionDate: e.target.value })}
                  className="input-dark w-full px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Itemized Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Parsed Items ({parsedSession.items.length})</h3>
                <button
                  type="button"
                  onClick={addPreviewItem}
                  className="btn-primary px-2.5 py-1 text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>

              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {parsedSession.items.map((item, idx) => (
                  <motion.div
                    key={item.id || idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`glass-light rounded-xl p-3 text-xs flex flex-col gap-2 ${
                      item.isAmbiguous ? 'border-accent-amber/30 bg-accent-amber/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.item}
                        onChange={e => updatePreviewItem(idx, 'item', e.target.value)}
                        className="input-dark flex-1 font-semibold text-white px-2.5 py-1 text-xs"
                      />

                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-brand-300/40 text-xs">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.totalAmount || ''}
                          onChange={e => updatePreviewItem(idx, 'totalAmount', parseFloat(e.target.value) || 0)}
                          className="input-dark w-full pl-5 pr-2 py-1 font-bold text-xs"
                        />
                      </div>

                      <select
                        value={item.category}
                        onChange={e => updatePreviewItem(idx, 'category', e.target.value as ExpenseCategory)}
                        className="input-dark px-1.5 py-1 text-[11px] font-medium"
                      >
                        {CATEGORIES.map(c => (
                          <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => removePreviewItem(idx)}
                        className="p-1 text-brand-300/30 hover:text-accent-red rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Owner Pill Multi-Select */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
                      <span className="text-brand-300/40 font-medium text-[11px]">Owners:</span>
                      {memberUids.map(uid => {
                        const isOwner = item.owners.includes(uid);
                        return (
                          <button
                            key={uid}
                            type="button"
                            onClick={() => togglePreviewOwner(idx, uid)}
                            className={`px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all ${
                              isOwner
                                ? 'bg-brand-600/30 text-brand-200 border-brand-500/30'
                                : 'bg-white/5 text-brand-300/40 border-white/5 hover:border-white/15'
                            }`}
                          >
                            {membersInfo[uid]?.displayName || 'User'}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Action Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-white/5">
              <div>
                <span className="text-xs text-brand-300/50 block">Grand Total</span>
                <span className="text-lg font-bold text-white">₹{grandTotal.toFixed(2)}</span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setParsedSession(null)}
                  className="btn-ghost px-3.5 py-2 rounded-xl text-xs font-medium"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleSaveParsedSession}
                  disabled={isSavingSession}
                  className="btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {isSavingSession ? 'Saving Session...' : 'Save Shopping Session'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
