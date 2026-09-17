import * as firebaseApp from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';

window.ALMOVE_FIREBASE_SDK = Object.freeze({ ...firebaseApp, ...firebaseAuth });
