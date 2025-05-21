// src/utils/auth.js.......
import { auth } from '../firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { saveUsername } from './users';

// Google Login
export const loginWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    // Ensure displayName is set
    if (!user.displayName) {
      await updateProfile(user, {
        displayName: user.email.split('@')[0] || 'User_' + user.uid.slice(0, 8),
      });
    }
    return user;
  } catch (error) {
    console.error('Google Login Error:', error.message);
    throw error;
  }
};

// Email/Password Sign Up....
export const signUpWithEmail = async (email, password, username) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    // Save username to Firestore and update profile
    await saveUsername(user.uid, username);
    await updateProfile(user, { displayName: username });
    return user;
  } catch (error) {
    console.error('Sign Up Error:', error.message);
    throw error;
  }
};

// Email/Password Login
export const loginWithEmail = async (email, password) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error('Login Error:', error.message);
    throw error;
  }
};

// Logout
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout Error:', error.message);
    throw error;
  }
};
