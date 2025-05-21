// src/utils/users.js
import { db } from '../firebase';
import { doc, setDoc, getDoc, query, collection, where, getDocs } from 'firebase/firestore';

// Save username for a user
export const saveUsername = async (userId, username) => {
  try {
    if (!userId || !username) throw new Error('User ID or username missing');
    
    // Check if username is already taken
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', username));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      throw new Error('Username already taken');
    }

    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      userId,
      username,
      createdAt: new Date(),
    }, { merge: true });
    console.log(`Username saved: ${username} for user ${userId}`);
    return username;
  } catch (err) {
    console.error('Save Username Error:', err.message);
    throw err;
  }
};

// Get username for a user
export const getUsername = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data().username;
    }
    return null;
  } catch (err) {
    console.error('Get Username Error:', err.message);
    return null;
  }
};