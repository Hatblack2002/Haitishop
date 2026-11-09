"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCi4lFiD3QhjnqAO9gJQ1g6PfjNw_eywHQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "haitishop.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "haitishop",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "haitishop.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "366912084421",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:366912222405:web:c254c695bb93e67eaf93ac"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseReady = true;
export const auth = getAuth(app);
export const db = getFirestore(app);
