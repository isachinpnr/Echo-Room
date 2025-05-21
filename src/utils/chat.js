import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { getUsername } from './users';

// Send a message to a room
export const sendMessage = async (roomDocId, user, text) => {
  if (!roomDocId || typeof roomDocId !== 'string') {
    throw new Error('Invalid room ID');
  }
  if (!user?.uid || !user?.email) {
    throw new Error('Invalid user data: UID and email are required');
  }
  if (!text || !text.trim()) {
    throw new Error('Message text cannot be empty');
  }

  try {
    // Get username from Firestore or use displayName
    const username = (await getUsername(user.uid)) || user.displayName || user.email.split('@')[0] || 'Anonymous';
    const messagesRef = collection(db, 'rooms', roomDocId, 'messages');
    const messageDoc = await addDoc(messagesRef, {
      text: text.trim(),
      senderId: user.uid,
      senderName: username,
      createdAt: new Date(), // Firestore will convert to Timestamp
    });
    console.log('Message sent successfully:', { id: messageDoc.id, text, senderId: user.uid, senderName: username });
    return { id: messageDoc.id };
  } catch (error) {
    console.error('Send Message Error:', error.message, { code: error.code, roomDocId, user, text });
    throw new Error(`Failed to send message: ${error.message} (${error.code || 'unknown'})`);
  }
};

// Listen for messages in a room
export const listenForMessages = (roomDocId, callback) => {
  if (!roomDocId || typeof roomDocId !== 'string') {
    console.error('Invalid room ID:', roomDocId);
    callback([]);
    return () => {};
  }

  try {
    const messagesRef = collection(db, 'rooms', roomDocId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text || '[Blank Message]',
          senderId: data.senderId,
          senderName: data.senderName,
          createdAt: data.createdAt,
        };
      });
      console.log('Fetched messages:', messages);
      callback(messages);
    }, (error) => {
      console.error('Listen Messages Error:', error.message, { code: error.code, roomDocId });
      callback([]);
    });
    return unsubscribe;
  } catch (error) {
    console.error('Listen Messages Setup Error:', error.message);
    callback([]);
    return () => {};
  }
};