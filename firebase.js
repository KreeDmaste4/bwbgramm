import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAVDoD2DicUK4g12JjaM-thn8Pgg_2nycc",
    authDomain: "bwbgramm.firebaseapp.com",
    projectId: "bwbgramm",
    storageBucket: "bwbgramm.firebasestorage.app",
    messagingSenderId: "624367450649",
    appId: "1:624367450649:web:022a4d2c66c9b39becc888",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth(app);

export { db, auth };
