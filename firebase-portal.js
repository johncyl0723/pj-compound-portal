import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-functions.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyD7ss5Sl96ARk89d6qg7P9iNu0aCIhlMXk',
  authDomain: 'pnj-compound-company-limited.firebaseapp.com',
  projectId: 'pnj-compound-company-limited',
  storageBucket: 'pnj-compound-company-limited.firebasestorage.app',
  messagingSenderId: '93394725731',
  appId: '1:93394725731:web:c072729bd7f54403464156',
  measurementId: 'G-H38TFSV9L4'
};

export const app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'asia-east1');

export function shareholderEmail(code) {
  return `${String(code).trim().toLowerCase()}@pjcompound.internal`;
}
