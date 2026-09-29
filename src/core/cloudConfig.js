// Online accounts (Firebase). Paste your project's config here to turn
// accounts on.
//
// Where to find it: Firebase console -> your project -> Project settings
// (gear icon) -> General -> "Your apps" -> the web app (</>) -> "SDK setup
// and configuration" -> Config. Copy the values of the `firebaseConfig`
// object into the one below.
//
// These values are SAFE to put in the game's code: Firebase web config is
// designed to be public. What protects each player's save is the Firestore
// security rules (see the setup steps in README.md): a player can only ever
// read or change their own save.
//
// Leave apiKey empty and the game works exactly as before, saving only in
// this browser.

export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
