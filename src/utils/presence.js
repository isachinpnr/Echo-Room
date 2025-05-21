import { db } from '../firebase';
import { doc, setDoc, onSnapshot, collection, deleteDoc, Timestamp } from 'firebase/firestore';
import { getUsername } from './users';

export const updatePresence = async (roomId, userId, status, displayName) => {
  try {
    if (!roomId || !userId) throw new Error('Room ID or User ID missing');
    const presenceRef = doc(db, 'rooms', roomId, 'presence', userId);
    await setDoc(presenceRef, {
      userId,
      status,
      displayName: displayName || 'Anonymous',
      lastUpdated: Timestamp.fromDate(new Date()),
    }, { merge: true });
    console.log(`Presence updated: ${userId} is ${status} in room ${roomId}`);
  } catch (err) {
    console.error('Update Presence Error:', err.message, { roomId, userId, status });
    throw err;
  }
};

export const listenForPresence = (roomId, callback) => {
  try {
    if (!roomId) throw new Error('Room ID missing');
    const presenceRef = collection(db, 'rooms', roomId, 'presence');
    const unsubscribe = onSnapshot(presenceRef, async (snapshot) => {
      const presenceData = {};
      const now = Date.now();
      const cleanupPromises = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const lastUpdated = data.lastUpdated?.toDate().getTime() || 0;
        // Consider user offline if last update > 30 seconds ago
        if (data.status === 'online' && now - lastUpdated > 30 * 1000) {
          cleanupPromises.push(deleteDoc(doc(db, 'rooms', roomId, 'presence', docSnap.id)));
        } else {
          presenceData[docSnap.id] = data;
        }
      }

      // Clean up stale presence entries
      if (cleanupPromises.length > 0) {
        await Promise.all(cleanupPromises);
        console.log(`Cleaned up ${cleanupPromises.length} stale presence entries`);
      }

      console.log('Fetched presence data:', presenceData);
      callback(presenceData);
    }, (err) => {
      console.error('Listen Presence Error:', err.message, { roomId });
      callback({});
    });
    return unsubscribe;
  } catch (err) {
    console.error('Listen Presence Setup Error:', err.message, { roomId });
    callback({});
    return () => {};
  }
};

// Clean up presence on disconnect
export const cleanupPresence = async (roomId, userId) => {
  try {
    const presenceRef = doc(db, 'rooms', roomId, 'presence', userId);
    await deleteDoc(presenceRef);
    console.log(`Presence cleaned up for user ${userId} in room ${roomId}`);
  } catch (err) {
    console.error('Cleanup Presence Error:', err.message);
  }
};