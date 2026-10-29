import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedDriveAccessToken: string | null = null;

export const connectGoogleDrive = async (): Promise<{ user: User; accessToken: string }> => {
  const result = await signInWithPopup(auth, googleAuthProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Google Drive access token was not returned.');
  }
  cachedDriveAccessToken = credential.accessToken;
  return { user: result.user, accessToken: cachedDriveAccessToken };
};

export const getDriveAccessToken = (): string | null => {
  return cachedDriveAccessToken;
};

export const setDriveAccessToken = (token: string | null) => {
  cachedDriveAccessToken = token;
};
