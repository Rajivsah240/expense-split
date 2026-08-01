/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { BalanceSummary } from './components/BalanceSummary';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { EditUsernameModal } from './components/EditUsernameModal';
import { useExpenses } from './hooks/useExpenses';
import { useAuth } from './hooks/useAuth';
import { useTeams } from './hooks/useTeams';
import {
  Loader2,
  Calculator,
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
  Edit2
} from 'lucide-react';

export default function App() {
  const { user, loading: authLoading, login, logout, updateUsername } = useAuth();
  const { teams, loading: teamsLoading, createTeam, addMemberToTeam, removeMemberFromTeam } = useTeams(user);

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'expenses' | 'analytics'>('expenses');

  const [newTeamName, setNewTeamName] = useState('');
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [showEditUsername, setShowEditUsername] = useState(false);

  const activeTeam = teams.find(t => t.id === activeTeamId) || null;
  const {
    expenses,
    loading: expensesLoading,
    addSession,
    updateSession,
    addSettlement,
    removeExpense
  } = useExpenses(activeTeamId);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex justify-center items-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-200 max-w-sm w-full text-center">
          <div className="flex justify-center mb-6">
            <Calculator className="w-12 h-12 text-stone-800" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Expense Split</h1>
          <p className="text-stone-500 mb-8">Sign in to manage shared shopping sessions and expenses.</p>
          <button
            onClick={login}
            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-xl transition-colors shadow-sm"
          >
            Sign in with Google
          </button>
        </div>
      </div>
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

  if (!activeTeam) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-stone-200">
        {showEditUsername && (
          <EditUsernameModal
            currentUser={user}
            onClose={() => setShowEditUsername(false)}
            onUpdateUsername={updateUsername}
          />
        )}

        <div className="max-w-2xl mx-auto px-4 py-8 md:py-12">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Calculator className="w-7 h-7 text-stone-800" />
                Expense Split
              </h1>
              <p className="text-stone-500 mt-1 text-sm flex items-center gap-1.5">
                Welcome, <span className="font-semibold text-stone-800">{user.displayName}</span>
                {user.username && (
                  <span className="font-mono text-xs bg-stone-200 text-stone-700 px-2 py-0.5 rounded-full font-bold">
                    @{user.username}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={logout}
              className="text-stone-500 hover:text-stone-800 p-2 rounded-full hover:bg-stone-200 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </header>

          <div className="bg-white border border-stone-200 p-5 rounded-2xl shadow-sm mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-500 uppercase tracking-wider">
                <AtSign className="w-3.5 h-3.5 text-stone-700" /> Your Unique Username
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-stone-900 bg-stone-100 px-3 py-1 rounded-xl border border-stone-200 inline-block">
                  @{user.username || 'not_set'}
                </span>
                <button
                  onClick={() => setShowEditUsername(true)}
                  className="px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100 border border-stone-200 rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit Handle
                </button>
              </div>
              <p className="text-xs text-stone-500 pt-1">
                Share this @username with your team leader to join their flatmate expense group.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-stone-800 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Your Teams
            </h2>

            {teamsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-stone-300 rounded-2xl bg-white shadow-sm">
                <p className="text-stone-500 font-medium">You don't belong to any teams yet.</p>
                <p className="text-stone-400 text-xs mt-1">Create a team below or share your @username with your flatmates.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {teams.map(team => (
                  <button
                    key={team.id}
                    onClick={() => setActiveTeamId(team.id)}
                    className="w-full text-left bg-white border border-stone-200 hover:border-stone-400 rounded-xl p-4 transition-colors flex justify-between items-center group shadow-sm"
                  >
                    <div>
                      <h3 className="font-medium text-stone-900">{team.name}</h3>
                      <p className="text-sm text-stone-500">{team.memberIds.length} members</p>
                    </div>
                    <ArrowLeft className="w-5 h-5 rotate-180 text-stone-300 group-hover:text-stone-600 transition-colors" />
                  </button>
                ))}
              </div>
            )}

            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm mt-8">
              <h3 className="font-semibold text-stone-800 mb-4">Create a New Team</h3>
              <form onSubmit={handleCreateTeam} className="flex gap-3">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="Team Name (e.g. Flat 302, Goa Trip)"
                  className="flex-1 px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 focus:bg-white transition-colors"
                  required
                />
                <button
                  type="submit"
                  disabled={isCreatingTeam || !newTeamName}
                  className="bg-stone-900 hover:bg-stone-800 text-white font-medium px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLeader = activeTeam.creatorId === user.uid;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-stone-200">
      {showEditUsername && (
        <EditUsernameModal
          currentUser={user}
          onClose={() => setShowEditUsername(false)}
          onUpdateUsername={updateUsername}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        {/* Header Bar */}
        <header className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setActiveTeamId(null)}
              className="p-2 -ml-2 text-stone-500 hover:bg-stone-200 rounded-full transition-colors"
              title="Back to Teams"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold truncate flex-1">{activeTeam.name}</h1>

            <button
              onClick={() => setShowEditUsername(true)}
              className="text-stone-600 hover:text-stone-900 px-3 py-1.5 text-xs font-semibold border border-stone-200 bg-white rounded-xl shadow-sm flex items-center gap-1.5 transition-colors"
              title="Edit Username"
            >
              <AtSign className="w-3.5 h-3.5" />
              @{user.username || 'username'}
            </button>

            <button
              onClick={logout}
              className="text-stone-500 hover:text-stone-800 p-2 rounded-full hover:bg-stone-200 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          {/* Members Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm mb-4">
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Team Members ({activeTeam.memberIds.length})
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {activeTeam.memberIds.map(uid => {
                const member = activeTeam.membersInfo[uid];
                return (
                  <div key={uid} className="bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-xl text-xs flex items-center gap-2">
                    <span className="font-semibold text-stone-800">
                      {member?.displayName || 'Unknown'}
                    </span>
                    {member?.username && (
                      <span className="font-mono text-[11px] text-stone-500">
                        @{member.username}
                      </span>
                    )}
                    {uid === activeTeam.creatorId && (
                      <span className="text-[9px] uppercase bg-stone-900 text-white px-1.5 py-0.5 rounded font-bold">Leader</span>
                    )}
                    {isLeader && uid !== user.uid && (
                      <button
                        onClick={() => removeMemberFromTeam(activeTeam.id, uid)}
                        className="text-stone-400 hover:text-red-500 transition-colors ml-1"
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
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono text-xs font-bold">@</span>
                  <input
                    type="text"
                    value={newMemberUsername}
                    onChange={e => setNewMemberUsername(e.target.value.replace(/^@/, ''))}
                    placeholder="Enter Flatmate's Username (e.g. alex)"
                    className="w-full pl-7 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-400 font-mono font-medium"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAddingMember || !newMemberUsername.trim()}
                  className="bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {isAddingMember ? 'Adding...' : 'Add Member'}
                </button>
              </form>
            )}
          </div>

          {/* Navigation View Switcher */}
          <div className="flex bg-stone-200/60 p-1 rounded-2xl w-fit">
            <button
              onClick={() => setActiveView('expenses')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeView === 'expenses'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Expenses & Sessions
            </button>

            <button
              onClick={() => setActiveView('analytics')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeView === 'analytics'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Analytics & Stats
            </button>
          </div>
        </header>

        {/* Main View Area */}
        {expensesLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
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
                <h2 className="font-bold text-stone-800 text-lg px-1 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-stone-700" />
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
