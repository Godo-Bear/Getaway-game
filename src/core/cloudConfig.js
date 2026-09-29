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
// With apiKey empty the game saves only in the browser (no accounts).

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyASrSnGhf01fhEGmLy-hUGuMSdr7w7lP7o',
  authDomain: 'getaway-game-50249.firebaseapp.com',
  projectId: 'getaway-game-50249',
  storageBucket: 'getaway-game-50249.firebasestorage.app',
  messagingSenderId: '545033776644',
  appId: '1:545033776644:web:22bc2674ffb54ebe0c8f51',
};
