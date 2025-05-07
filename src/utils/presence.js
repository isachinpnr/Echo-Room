// src/utils/presence.js
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';

// Update user presence
export const updatePresence = async (roomDocId, userId, status) => {
  try {
    const roomRef = doc(db, 'rooms', roomDocId);
    await updateDoc(roomRef, {
      [`userPresence.${userId}`]: {
        status,
        lastUpdated: new Date(),
      },
    });
    console.log('Presence updated:', userId, status, 'in room:', roomDocId); // Debug log
  } catch (error) {
    console.error('Update Presence Error:', error.message);
    throw error;
  }
};

// Listen for presence updates
export const listenForPresence = (roomDocId, callback) => {
  try {
    const roomRef = doc(db, 'rooms', roomDocId);
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const presence = data.userPresence || {};
        console.log('Presence state updated for room:', roomDocId, presence); // Debug log
        callback(presence);
      } else {
        console.error('Room not found:', roomDocId);
        callback({});
      }
    }, (error) => {
      console.error('Listen Presence Error:', error.message);
      callback({});
    });
    return unsubscribe;
  } catch (error) {
    console.error('Listen Presence Setup Error:', error.message);
    callback({});
    return () => {};
  }
};