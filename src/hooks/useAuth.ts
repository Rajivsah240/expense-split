import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { isOfflineError, safeGetDoc } from '../lib/safeFirestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

const createBaseProfile = (firebaseUser: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): UserProfile => ({
  uid: firebaseUser.uid,
  displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
  email: firebaseUser.email || '',
  photoURL: firebaseUser.photoURL || undefined
});

const createUsernameBase = (profile: UserProfile) => {
  const rawBase = profile.displayName
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_]/g, '');
  return rawBase.length >= 3 ? rawBase.slice(0, 15) : `user_${Math.floor(100 + Math.random() * 900)}`;
};

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Authentication is enough to enter the app. Profile reads happen in
        // the background so an unavailable Firestore server cannot hold the
        // user on the sign-in spinner.
        const baseProfile = createBaseProfile(firebaseUser);
        setUser(baseProfile);
        setLoading(false);

        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await safeGetDoc(userDocRef);

          const existingData = userSnap.exists() ? userSnap.data() : null;
          let profile: UserProfile = {
            ...baseProfile,
            ...existingData,
            uid: firebaseUser.uid,
            displayName: existingData?.displayName || baseProfile.displayName,
            email: existingData?.email || baseProfile.email,
            photoURL: existingData?.photoURL || baseProfile.photoURL
          };
          let username = profile.username;
          let usernameLower = profile.usernameLower || username?.toLowerCase();

          // If no username exists yet, generate a default unique username
          if (!username) {
            const baseHandle = createUsernameBase(baseProfile);

            let candidate = baseHandle;
            let isAvailable = false;
            let attempt = 0;

            while (!isAvailable && attempt < 10) {
              const testLower = candidate.toLowerCase();
              const unameRef = doc(db, 'usernames', testLower);
              const candidateProfile: UserProfile = {
                ...profile,
                username: candidate,
                usernameLower: testLower
              };

              // The username mapping and user profile must be written together.
              // A transaction prevents two users from both claiming the same handle.
              isAvailable = await runTransaction(db, async transaction => {
                const unameSnap = await transaction.get(unameRef);
                if (unameSnap.exists() && unameSnap.data()?.uid !== firebaseUser.uid) {
                  return false;
                }

                transaction.set(unameRef, { uid: firebaseUser.uid, username: candidate });
                transaction.set(userDocRef, candidateProfile, { merge: true });
                return true;
              });

              if (isAvailable) {
                isAvailable = true;
                username = candidate;
                usernameLower = testLower;
              } else {
                attempt++;
                candidate = `${baseHandle}_${Math.floor(10 + Math.random() * 90)}`;
              }
            }

            profile = { ...profile, username: username || '', usernameLower: usernameLower || '' };
          }

          profile = { ...profile, username: username || '', usernameLower: usernameLower || '' };
          setUser(profile);
          await setDoc(userDocRef, profile, { merge: true });
        } catch (e) {
          // This is expected when a user authenticates before Firestore has a
          // connection. The base profile remains usable and a later reload or
          // listener reconnect will hydrate it from the cache/server.
          if (!isOfflineError(e)) {
            console.warn('Could not load user profile:', e);
          }
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/cancelled-popup-request' ||
        error?.code === 'auth/popup-blocked' ||
        error?.message?.includes('Pending promise was never set')
      ) {
        console.warn('Sign in popup closed or cancelled by user.');
      } else {
        console.error('Sign in failed:', error);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  const updateUsername = async (newUsername: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "Not logged in" };

    const trimmed = newUsername.trim().replace(/^@/, '');
    if (trimmed.length < 3 || trimmed.length > 20) {
      return { success: false, error: "Username must be between 3 and 20 characters." };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { success: false, error: "Username can only contain letters, numbers, and underscores." };
    }

    const newLower = trimmed.toLowerCase();
    const oldLower = user.usernameLower;

    if (newLower === oldLower) {
      return { success: true };
    }

    try {
      const unameRef = doc(db, 'usernames', newLower);
      const userRef = doc(db, 'users', user.uid);

      if (!navigator.onLine) {
        return { success: false, error: 'You need an internet connection to check and save a username.' };
      }

      const result = await runTransaction(db, async transaction => {
        const unameSnap = await transaction.get(unameRef);
        if (unameSnap.exists() && unameSnap.data()?.uid !== user.uid) {
          return { available: false };
        }

        const updatedProfile: UserProfile = {
          ...user,
          username: trimmed,
          usernameLower: newLower
        };

        transaction.set(unameRef, { uid: user.uid, username: trimmed });
        if (oldLower && oldLower !== newLower) {
          transaction.delete(doc(db, 'usernames', oldLower));
        }
        transaction.set(userRef, updatedProfile, { merge: true });
        return { available: true, updatedProfile };
      });

      if (!result.available) {
        return { success: false, error: `Username @${trimmed} is already taken by another user.` };
      }

      setUser(result.updatedProfile);

      return { success: true };
    } catch (err: any) {
      if (isOfflineError(err)) {
        return { success: false, error: 'Unable to reach the server. Please check your connection and try again.' };
      }
      console.error("Error updating username:", err);
      return { success: false, error: err.message || "Failed to update username." };
    }
  };

  return { user, loading, login, logout, updateUsername };
}
