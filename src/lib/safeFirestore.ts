import { getDoc, getDocFromCache, DocumentReference, DocumentSnapshot } from 'firebase/firestore';

export function isOfflineError(error: unknown) {
  const firebaseError = error as { code?: string; message?: string };
  const message = firebaseError?.message?.toLowerCase() || '';
  return (
    firebaseError?.code === 'unavailable' ||
    firebaseError?.code === 'failed-precondition' ||
    message.includes('offline') ||
    message.includes('network')
  );
}

/**
 * Prefer Firestore's normal read, but fall back to its local cache immediately.
 * Retrying here made a single failed read block sign-in and username updates for
 * several seconds while the Firestore client was offline.
 */
export async function safeGetDoc(docRef: DocumentReference): Promise<DocumentSnapshot> {
  try {
    return await getDoc(docRef);
  } catch (error) {
    if (!isOfflineError(error)) throw error;

    try {
      return await getDocFromCache(docRef);
    } catch {
      throw error;
    }
  }
}
