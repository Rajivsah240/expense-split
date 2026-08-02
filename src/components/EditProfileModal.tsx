import React, { useState } from 'react';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, AtSign, Copy, AlertCircle, Sparkles, User } from 'lucide-react';

interface EditProfileModalProps {
  currentUser: UserProfile;
  onClose: () => void;
  onUpdateProfile: (data: { displayName?: string; username?: string }) => Promise<{ success: boolean; error?: string }>;
}

export function EditProfileModal({ currentUser, onClose, onUpdateProfile }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
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

    const cleanName = displayName.trim();
    const cleanUsername = usernameInput.trim().replace(/^@/, '');

    if (!cleanName && !cleanUsername) {
      setErrorMsg("Please enter a display name or username.");
      return;
    }

    const updateData: { displayName?: string; username?: string } = {};
    if (cleanName && cleanName !== currentUser.displayName) {
      updateData.displayName = cleanName;
    }
    if (cleanUsername && cleanUsername !== currentUser.username) {
      updateData.username = cleanUsername;
    }

    if (Object.keys(updateData).length === 0) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onUpdateProfile(updateData);
      if (res.success) {
        setSuccessMsg('Profile updated successfully!');
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setErrorMsg(res.error || "Failed to update profile.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="glass-card rounded-3xl max-w-md w-full p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-brand-300/40 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-brand rounded-xl glow-brand">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Edit Profile</h2>
            <p className="text-xs text-brand-300/50">Update your display name and username</p>
          </div>
        </div>

        {currentUser.username && (
          <div className="glass-light rounded-xl p-3 mb-5 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-brand-300/50 uppercase tracking-wider block">Current Handle</span>
              <span className="text-base font-bold text-white font-mono">@{currentUser.username}</span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-ghost px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              {copied ? (
                <><Check className="w-3.5 h-3.5 text-accent-green" /> Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy</>
              )}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-brand-200/70 block mb-1.5 pl-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setErrorMsg(null); }}
              placeholder="e.g. Rajiv"
              className="input-dark w-full px-4 py-2.5 text-sm"
              maxLength={50}
            />
            <p className="text-[11px] text-brand-300/40 mt-1 pl-1">This name shows in expense records and settlements.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-200/70 block mb-1.5 pl-1">Username</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400/40 font-mono font-bold text-sm">@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={e => {
                  setUsernameInput(e.target.value.replace(/^@/, ''));
                  setErrorMsg(null);
                }}
                placeholder="rajiv_sah"
                className="input-dark w-full pl-8 pr-4 py-2.5 text-sm font-mono font-semibold"
                maxLength={20}
              />
            </div>
            <p className="text-[11px] text-brand-300/40 mt-1 pl-1">
              3-20 characters. Letters, numbers, and underscores only.
            </p>
          </div>

          <AnimatePresence>
            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="p-3 bg-accent-red/10 border border-accent-red/20 rounded-xl text-xs text-accent-red flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </motion.div>
            )}

            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="p-3 bg-accent-green/10 border border-accent-green/20 rounded-xl text-xs text-accent-green flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost px-4 py-2 rounded-xl text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!displayName.trim() && !usernameInput.trim())}
              className="btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
