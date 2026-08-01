import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeGetDoc } from '../lib/safeFirestore';
import { Team, UserProfile } from '../types';

export function useTeams(user: UserProfile | null) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'teams'),
      where('memberIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const teamsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Team[];
        setTeams(teamsData);
        setLoading(false);
      },
      (error) => {
        console.warn('Could not load teams:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const createTeam = async (name: string) => {
    if (!user) return;
    await addDoc(collection(db, 'teams'), {
      name,
      creatorId: user.uid,
      memberIds: [user.uid],
      membersInfo: {
        [user.uid]: user
      },
      createdAt: Date.now()
    });
  };

  const addMemberToTeam = async (teamId: string, usernameOrUid: string) => {
    if (!user) return;
    
    const cleanInput = usernameOrUid.trim().replace(/^@/, '');
    if (!cleanInput) {
      throw new Error("Please enter a valid username.");
    }

    let targetUid: string | null = null;
    let memberProfile: UserProfile | null = null;

    // 1. Try looking up by username in 'usernames' collection
    const usernameLower = cleanInput.toLowerCase();
    try {
      const unameDoc = await safeGetDoc(doc(db, 'usernames', usernameLower));

      if (unameDoc.exists()) {
        targetUid = unameDoc.data()?.uid || null;
        if (targetUid) {
          const userDoc = await safeGetDoc(doc(db, 'users', targetUid));
          if (userDoc.exists()) {
            memberProfile = userDoc.data() as UserProfile;
          }
        }
      }
    } catch (e) {
      console.warn("Error looking up username:", e);
    }

    // 2. Fallback: try raw UID lookup
    if (!memberProfile) {
      try {
        const userDoc = await safeGetDoc(doc(db, 'users', cleanInput));
        if (userDoc.exists()) {
          targetUid = cleanInput;
          memberProfile = userDoc.data() as UserProfile;
        }
      } catch (e) {
        console.warn("Error looking up raw UID:", e);
      }
    }

    if (!memberProfile || !targetUid) {
      throw new Error(`Username "@${cleanInput}" not found. Ask your flatmate to sign in and set their username.`);
    }

    const teamRef = doc(db, 'teams', teamId);
    const teamDoc = await safeGetDoc(teamRef);
    if (!teamDoc.exists()) throw new Error("Team not found.");
    
    const teamData = teamDoc.data() as Team;
    
    if (teamData.memberIds.includes(targetUid)) {
      throw new Error(`@${memberProfile.username || memberProfile.displayName} is already in this team.`);
    }

    await updateDoc(teamRef, {
      memberIds: [...teamData.memberIds, targetUid],
      [`membersInfo.${targetUid}`]: memberProfile
    });
  };

  const removeMemberFromTeam = async (teamId: string, memberUid: string) => {
    if (!user) return;
    
    const teamRef = doc(db, 'teams', teamId);
    const teamDoc = await safeGetDoc(teamRef);
    if (!teamDoc.exists()) return;
    
    const teamData = teamDoc.data() as Team;
    
    if (!teamData.memberIds.includes(memberUid)) return;
    
    const newMembersInfo = { ...teamData.membersInfo };
    delete newMembersInfo[memberUid];

    await updateDoc(teamRef, {
      memberIds: teamData.memberIds.filter(id => id !== memberUid),
      membersInfo: newMembersInfo
    });
  };

  return { teams, loading, createTeam, addMemberToTeam, removeMemberFromTeam };
}
