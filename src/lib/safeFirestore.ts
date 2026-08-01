import { getDoc, getDocFromCache, DocumentReference, DocumentSnapshot } from 'firebase/firestore';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function safeGetDoc(docRef: DocumentReference, retries = 3): Promise<DocumentSnapshot> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getDoc(docRef);
    } catch (err: any) {
      lastError = err;
      const isOffline = err?.message?.includes('offline') || err?.code === 'unavailable';

      if (isOffline) {
        // First try to check cache if available
        try {
          const cacheSnap = await getDocFromCache(docRef);
          if (cacheSnap.exists()) {
            return cacheSnap;
          }
        } catch {
          // Cache miss, proceed to retry delay
        }

        if (attempt < retries) {
          await delay(400 * Math.pow(1.5, attempt));
          continue;
        }
      } else {
        throw err;
      }
    }
  }

  // Final cache attempt if network retries failed
  try {
    const cacheSnap = await getDocFromCache(docRef);
    return cacheSnap;
  } catch {
    // Return original error if cache is also unavailable
  }

  throw lastError;
}
