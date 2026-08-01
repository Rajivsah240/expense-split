import React, { useState } from 'react';
import { UserProfile } from '../types';
import { X, Check, AtSign, Copy, AlertCircle, Sparkles } from 'lucide-react';

interface EditUsernameModalProps {
  currentUser: UserProfile;
  onClose: () => void;
  onUpdateUsername: (newUsername: string) => Promise<{ success: boolean; error?: string }>;
}

export function EditUsernameModal({ currentUser, onClose, onUpdateUsername }: EditUsernameModalProps) {
  const [usernameInput, setUsernameInput] = useState(currentUser.username || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCopy = () => {
    if (!currentUser.username) return;
    navigator.clipboard.writeText(`@${currentUser.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const clean = usernameInput.trim().replace(/^@/, '');
    if (!clean) {
      setErrorMsg("Please enter a username.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onUpdateUsername(clean);
      if (res.success) {
        setSuccessMsg(`Username updated to @${clean}`);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.error || "Failed to update username.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-stone-900 text-white rounded-xl">
            <AtSign className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-900">Your Unique Username</h2>
            <p className="text-xs text-stone-500">Flatmates use this handle to add you to teams</p>
          </div>
        </div>

        {currentUser.username && (
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider block">Current Handle</span>
              <span className="text-base font-bold text-stone-900 font-mono">@{currentUser.username}</span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-stone-500" />
                  Copy Handle
                </>
              )}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">Choose / Change Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono font-bold text-sm">@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={e => {
                  setUsernameInput(e.target.value.replace(/^@/, ''));
                  setErrorMsg(null);
                }}
                placeholder="alex_302"
                className="w-full pl-8 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white transition-colors"
                maxLength={20}
                required
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-1.5">
              3-20 characters long. Letters, numbers, and underscores only.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-stone-200 text-stone-600 rounded-xl text-xs font-medium hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !usernameInput.trim()}
              className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Checking & Saving...' : 'Save Username'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
