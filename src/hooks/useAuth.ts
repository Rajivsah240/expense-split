import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { safeGetDoc } from '../lib/safeFirestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await safeGetDoc(userDocRef);

          let existingData = userSnap.exists() ? userSnap.data() : null;
          let username = existingData?.username;
          let usernameLower = existingData?.usernameLower;

          // If no username exists yet, generate a default unique username
          if (!username) {
            const rawBase = (firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'user')
              .toLowerCase()
              .replace(/[^a-zA-Z0-9_]/g, '');
            const baseHandle = rawBase.length >= 3 ? rawBase.slice(0, 15) : `user_${Math.floor(100 + Math.random() * 900)}`;

            let candidate = baseHandle;
            let isAvailable = false;
            let attempt = 0;

            while (!isAvailable && attempt < 10) {
              const testLower = candidate.toLowerCase();
              const unameRef = doc(db, 'usernames', testLower);
              const unameSnap = await safeGetDoc(unameRef);

              if (!unameSnap.exists() || unameSnap.data()?.uid === firebaseUser.uid) {
                isAvailable = true;
                username = candidate;
                usernameLower = testLower;
              } else {
                attempt++;
                candidate = `${baseHandle}_${Math.floor(10 + Math.random() * 90)}`;
              }
            }

            if (username && usernameLower) {
              try {
                await setDoc(doc(db, 'usernames', usernameLower), {
                  uid: firebaseUser.uid,
                  username: username
                });
              } catch (e) {
                console.warn("Could not write username record immediately:", e);
              }
            }
          }

          const userProfile: UserProfile = {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
            username: username || '',
            usernameLower: usernameLower || '',
            email: firebaseUser.email || '',
            photoURL: firebaseUser.photoURL || undefined
          };

          setUser(userProfile);
          try {
            await setDoc(userDocRef, userProfile, { merge: true });
          } catch (e) {
            console.warn("Could not update user doc in Firestore:", e);
          }
        } catch (e) {
          console.error("Error loading user profile:", e);
          setUser({
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Unknown',
            email: firebaseUser.email || ''
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
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
      // Check if username is taken by someone else using safeGetDoc
      const unameRef = doc(db, 'usernames', newLower);
      const unameSnap = await safeGetDoc(unameRef);

      if (unameSnap.exists() && unameSnap.data()?.uid !== user.uid) {
        return { success: false, error: `Username @${trimmed} is already taken by another user.` };
      }

      // Reserve new username
      await setDoc(unameRef, {
        uid: user.uid,
        username: trimmed
      });

      // Remove old username mapping if present
      if (oldLower && oldLower !== newLower) {
        try {
          await deleteDoc(doc(db, 'usernames', oldLower));
        } catch (err) {
          console.warn("Could not delete old username record:", err);
        }
      }

      // Update user document
      const updatedProfile: UserProfile = {
        ...user,
        username: trimmed,
        usernameLower: newLower
      };

      await setDoc(doc(db, 'users', user.uid), updatedProfile, { merge: true });
      setUser(updatedProfile);

      return { success: true };
    } catch (err: any) {
      console.error("Error updating username:", err);
      const isOfflineErr = err?.message?.includes('offline') || err?.code === 'unavailable';
      if (isOfflineErr) {
        return { success: false, error: "Connection to server is taking a moment. Please check your internet and try again." };
      }
      return { success: false, error: err.message || "Failed to update username." };
    }
  };

  return { user, loading, login, logout, updateUsername };
}
