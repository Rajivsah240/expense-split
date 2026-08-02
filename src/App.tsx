/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { BalanceSummary } from './components/BalanceSummary';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { EditProfileModal } from './components/EditProfileModal';
import { useExpenses } from './hooks/useExpenses';
import { useAuth } from './hooks/useAuth';
import { useTeams } from './hooks/useTeams';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  LogOut,
  Users,
  Plus,
  ArrowLeft,
  Trash2,
  UserPlus,
  ShoppingBag,
  BarChart3,
  Receipt,
  AtSign,
  Edit2,
  Mail,
  KeyRound,
  User,
  Sparkles,
  Wallet,
  ChevronRight,
  Shield
} from 'lucide-react';

export default function App() {
  const { user, loading: authLoading, requestOtp, verifyOtp, logout, updateUsername, updateProfile } = useAuth();
  const { teams, loading: teamsLoading, createTeam, addMemberToTeam, removeMemberFromTeam } = useTeams(user);

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'expenses' | 'analytics'>('expenses');

  const [newTeamName, setNewTeamName] = useState('');
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Check if user needs onboarding (display name is still auto-generated from email)
  useEffect(() => {
    if (user && user.displayName && user.email) {
      const emailPrefix = user.email.split('@')[0] || '';
      if (user.displayName === emailPrefix || user.displayName === 'User') {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    setOtpSent(false);
    setOtp('');
    setEmail('');
    setSignInError(null);
    setActiveTeamId(null);
  };

  const activeTeam = teams.find(t => t.id === activeTeamId) || null;
  const {
    expenses,
    loading: expensesLoading,
    addSession,
    updateSession,
    addSettlement,
    removeExpense
  } = useExpenses(activeTeamId);

  // ─── Loading Screen ───
  if (authLoading) {
    return (
      <div className="min-h-dvh bg-mesh flex justify-center items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-brand flex items-center justify-center glow-brand">
            <Wallet className="w-7 h-7 text-white" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </motion.div>
      </div>
    );
  }

  // ─── Login Screen ───
  if (!user) {
    const handleRequestOtp = async (event: React.FormEvent) => {
      event.preventDefault();
      setIsSigningIn(true);
      setSignInError(null);
      try {
        await requestOtp(email);
        setOtpSent(true);
      } catch (error: any) {
        setSignInError(error.message || 'Could not send a sign-in code.');
      } finally {
        setIsSigningIn(false);
      }
    };

    const handleVerifyOtp = async (event: React.FormEvent) => {
      event.preventDefault();
      setIsSigningIn(true);
      setSignInError(null);
      try {
        await verifyOtp(email, otp);
      } catch (error: any) {
        setSignInError(error.message || 'Could not verify the sign-in code.');
      } finally {
        setIsSigningIn(false);
      }
    };

    return (
      <div className="min-h-dvh bg-mesh flex justify-center items-center p-4">
        {/* Background decorative blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-600/10 rounded-full blur-[128px] animate-float" />
          <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-purple-600/10 rounded-full blur-[128px] animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-[200px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass-card rounded-3xl p-8 sm:p-10 max-w-md w-full text-center relative z-10"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="flex justify-center mb-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center glow-brand">
              <Wallet className="w-8 h-8 text-white" />
            </div>
          </motion.div>

          <h1 className="text-3xl font-extrabold text-white mb-1 tracking-tight">Expense Split</h1>
          <p className="text-brand-300/70 text-sm mb-8">AI-powered expense sharing for flatmates</p>

          <form onSubmit={otpSent ? handleVerifyOtp : handleRequestOtp} className="space-y-4 text-left">
            <div>
              <label className="text-xs font-semibold text-brand-200/80 block mb-1.5 pl-1">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400/50" />
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="input-dark w-full pl-10 pr-4 py-3 text-sm"
                  required
                  disabled={otpSent || isSigningIn}
                />
              </div>
            </div>

            <AnimatePresence>
              {otpSent && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <div>
                    <label className="text-xs font-semibold text-brand-200/80 block mb-1.5 pl-1">Six-digit code</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400/50" />
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={otp}
                        onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        className="input-dark w-full pl-10 pr-4 py-3 text-sm tracking-[0.3em] font-mono font-semibold"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setOtpSent(false); setOtp(''); setSignInError(null); }}
                    className="text-xs text-brand-400/60 hover:text-brand-300 transition-colors pl-1"
                  >
                    ← Use a different email
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {signInError && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-xl px-4 py-3"
              >
                {signInError}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isSigningIn || !email || (otpSent && otp.length !== 6)}
              className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2"
            >
              {isSigningIn ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Please wait...</>
              ) : otpSent ? (
                <><Shield className="w-4 h-4" /> Verify & Sign In</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Send Sign-in Code</>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Onboarding Modal ───
  if (showOnboarding) {
    return (
      <OnboardingScreen
        user={user}
        onComplete={async (displayName, username) => {
          await updateProfile({ displayName, username });
          setShowOnboarding(false);
        }}
      />
    );
  }

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName) return;
    setIsCreatingTeam(true);
    await createTeam(newTeamName);
    setNewTeamName('');
    setIsCreatingTeam(false);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberUsername || !activeTeamId) return;
    setIsAddingMember(true);
    try {
      await addMemberToTeam(activeTeamId, newMemberUsername);
      setNewMemberUsername('');
    } catch (err: any) {
      alert(err.message || "Failed to add member.");
    } finally {
      setIsAddingMember(false);
    }
  };

  // ─── Team Selection Screen ───
  if (!activeTeam) {
    return (
      <div className="min-h-dvh bg-mesh">
        {showEditProfile && (
          <EditProfileModal
            currentUser={user}
            onClose={() => setShowEditProfile(false)}
            onUpdateProfile={updateProfile}
          />
        )}

        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 flex items-center justify-between"
          >
            <div>
              <h1 className="text-2xl font-extrabold flex items-center gap-3 text-white">
                <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                Expense Split
              </h1>
              <p className="text-brand-300/50 mt-1.5 text-sm flex items-center gap-2">
                Welcome, <span className="font-semibold text-white">{user.displayName}</span>
                {user.username && (
                  <span className="pill pill-brand text-[10px]">@{user.username}</span>
                )}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="btn-ghost p-2.5 rounded-xl"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </motion.header>

          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-2xl p-5 mb-8"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-300/60 uppercase tracking-wider">
                  <AtSign className="w-3.5 h-3.5 text-brand-400" /> Your Unique Username
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-bold text-white bg-white/5 px-4 py-1.5 rounded-xl border border-white/10 inline-block">
                    @{user.username || 'not_set'}
                  </span>
                  <button
                    onClick={() => setShowEditProfile(true)}
                    className="btn-ghost px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 rounded-lg"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit Profile
                  </button>
                </div>
                <p className="text-xs text-brand-300/40 pt-0.5">
                  Share this @username with your team leader to join their group.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Teams Section */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-400" />
              Your Groups
            </h2>

            {teamsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
              </div>
            ) : teams.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 px-6 border border-dashed border-white/10 rounded-2xl glass-light"
              >
                <Users className="w-12 h-12 mx-auto text-brand-400/30 mb-3" />
                <p className="text-white/70 font-semibold">You don't belong to any groups yet.</p>
                <p className="text-brand-300/40 text-xs mt-1">Create a group below or share your @username with your flatmates.</p>
              </motion.div>
            ) : (
              <div className="grid gap-3">
                {teams.map((team, i) => (
                  <motion.button
                    key={team.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setActiveTeamId(team.id)}
                    className="w-full text-left glass-card rounded-2xl p-4 transition-all hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 flex justify-between items-center group"
                  >
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-brand-200 transition-colors">{team.name}</h3>
                      <p className="text-sm text-brand-300/50 flex items-center gap-1.5 mt-0.5">
                        <Users className="w-3.5 h-3.5" />
                        {team.memberIds.length} members
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-brand-400/30 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" />
                  </motion.button>
                ))}
              </div>
            )}

            {/* Create Team */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card rounded-2xl p-5 mt-8"
            >
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-400" />
                Create a New Group
              </h3>
              <form onSubmit={handleCreateTeam} className="flex gap-3">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="Group Name (e.g. Flat 302, Goa Trip)"
                  className="input-dark flex-1 px-4 py-2.5 text-sm"
                  required
                />
                <button
                  type="submit"
                  disabled={isCreatingTeam || !newTeamName}
                  className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Team Detail View ───
  const isLeader = activeTeam.creatorId === user.uid;

  return (
    <div className="min-h-dvh bg-mesh">
      {showEditProfile && (
        <EditProfileModal
          currentUser={user}
          onClose={() => setShowEditProfile(false)}
          onUpdateProfile={updateProfile}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {/* Header Bar */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setActiveTeamId(null)}
              className="btn-ghost p-2 rounded-xl"
              title="Back to Groups"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-extrabold text-white truncate flex-1">{activeTeam.name}</h1>

            <button
              onClick={() => setShowEditProfile(true)}
              className="btn-ghost px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              title="Edit Profile"
            >
              <User className="w-3.5 h-3.5" />
              @{user.username || 'username'}
            </button>

            <button
              onClick={handleLogout}
              className="btn-ghost p-2.5 rounded-xl"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Members Bar */}
          <div className="glass-card rounded-2xl p-4 mb-4">
            <h3 className="text-xs font-bold text-brand-300/60 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-brand-400" /> Team Members ({activeTeam.memberIds.length})
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {activeTeam.memberIds.map(uid => {
                const member = activeTeam.membersInfo[uid];
                return (
                  <div key={uid} className="glass-light rounded-xl px-3 py-1.5 text-xs flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {member?.displayName || 'Unknown'}
                    </span>
                    {member?.username && (
                      <span className="font-mono text-[11px] text-brand-300/50">
                        @{member.username}
                      </span>
                    )}
                    {uid === activeTeam.creatorId && (
                      <span className="text-[9px] uppercase bg-gradient-brand text-white px-1.5 py-0.5 rounded font-bold">Leader</span>
                    )}
                    {isLeader && uid !== user.uid && (
                      <button
                        onClick={() => removeMemberFromTeam(activeTeam.id, uid)}
                        className="text-brand-300/30 hover:text-accent-red transition-colors ml-1"
                        title="Remove Member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {isLeader && (
              <form onSubmit={handleAddMember} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400/40 font-mono text-xs font-bold">@</span>
                  <input
                    type="text"
                    value={newMemberUsername}
                    onChange={e => setNewMemberUsername(e.target.value.replace(/^@/, ''))}
                    placeholder="Enter Flatmate's Username"
                    className="input-dark w-full pl-7 pr-3 py-2 text-xs font-mono font-medium"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAddingMember || !newMemberUsername.trim()}
                  className="btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {isAddingMember ? 'Adding...' : 'Add'}
                </button>
              </form>
            )}
          </div>

          {/* Navigation View Switcher */}
          <div className="flex glass-light p-1 rounded-2xl w-fit">
            <button
              onClick={() => setActiveView('expenses')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeView === 'expenses'
                  ? 'bg-gradient-brand text-white shadow-lg shadow-brand-500/20'
                  : 'text-brand-300/60 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Expenses & Sessions
            </button>

            <button
              onClick={() => setActiveView('analytics')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeView === 'analytics'
                  ? 'bg-gradient-brand text-white shadow-lg shadow-brand-500/20'
                  : 'text-brand-300/60 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Analytics & Stats
            </button>
          </div>
        </motion.header>

        {/* Main View Area */}
        {expensesLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          </div>
        ) : activeView === 'expenses' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <ExpenseForm
                onAddSession={addSession}
                currentUser={user}
                membersInfo={activeTeam.membersInfo}
              />

              <div className="block lg:hidden">
                <BalanceSummary
                  expenses={expenses}
                  onSettle={addSettlement}
                  currentUser={user}
                  membersInfo={activeTeam.membersInfo}
                />
              </div>

              <div className="space-y-3">
                <h2 className="font-bold text-white text-lg px-1 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-brand-400" />
                  Shopping Sessions History
                </h2>
                <ExpenseList
                  expenses={expenses}
                  onRemove={removeExpense}
                  onUpdateSession={updateSession}
                  currentUser={user}
                  membersInfo={activeTeam.membersInfo}
                />
              </div>
            </div>

            <div className="hidden lg:block lg:col-span-5 sticky top-6">
              <BalanceSummary
                expenses={expenses}
                onSettle={addSettlement}
                currentUser={user}
                membersInfo={activeTeam.membersInfo}
              />
            </div>
          </div>
        ) : (
          <AnalyticsDashboard
            expenses={expenses}
            membersInfo={activeTeam.membersInfo}
          />
        )}
      </div>
    </div>
  );
}

// ─── Onboarding Screen Component ───
function OnboardingScreen({ user, onComplete }: { user: { displayName: string; username?: string; email: string }; onComplete: (displayName: string, username: string) => Promise<void> }) {
  const [displayName, setDisplayName] = useState(user.displayName === user.email.split('@')[0] ? '' : user.displayName);
  const [username, setUsername] = useState(user.username || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !username.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onComplete(displayName.trim(), username.trim().replace(/^@/, ''));
    } catch (err: any) {
      setError(err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-mesh flex justify-center items-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 -left-20 w-80 h-80 bg-brand-600/10 rounded-full blur-[128px] animate-float" />
        <div className="absolute bottom-1/3 -right-20 w-72 h-72 bg-accent-green/8 rounded-full blur-[128px] animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass-card rounded-3xl p-8 sm:p-10 max-w-md w-full relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center glow-brand mx-auto mb-4"
          >
            <User className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-2xl font-extrabold text-white">Complete Your Profile</h2>
          <p className="text-brand-300/50 text-sm mt-1">Set your name and username to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs font-semibold text-brand-200/80 block mb-1.5 pl-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Rajiv, Ashutosh, Bastav"
              className="input-dark w-full px-4 py-3 text-sm"
              maxLength={50}
              required
            />
            <p className="text-[11px] text-brand-300/40 mt-1 pl-1">This name appears everywhere in the app.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-brand-200/80 block mb-1.5 pl-1">Username</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400/40 font-mono font-bold text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
                placeholder="rajiv_sah"
                className="input-dark w-full pl-8 pr-4 py-3 text-sm font-mono"
                maxLength={20}
                required
              />
            </div>
            <p className="text-[11px] text-brand-300/40 mt-1 pl-1">3-20 characters. Letters, numbers, underscores only.</p>
          </div>

          {error && (
            <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !displayName.trim() || !username.trim()}
            className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Get Started</>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
