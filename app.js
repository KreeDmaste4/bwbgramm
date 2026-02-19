import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  
// Инициализация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAVDoD2DicUK4g12JjaM-thn8Pgg_2nycc",
  authDomain: "bwbgramm.firebaseapp.com",
  projectId: "bwbgramm",
  storageBucket: "bwbgramm.firebasestorage.app",
  messagingSenderId: "624367450649",
  appId: "1:624367450649:web:022a4d2c66c9b39becc888"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.showLogin = function () {
  document.getElementById("registerBox").style.display = "none";
  document.getElementById("loginBox").style.display = "flex";
};

window.showRegister = function () {
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("registerBox").style.display = "flex";
};

// Если пользователь уже вошел — отправляем в чат
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "chat.html";
  }
});

window.register = async function() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  let username = document.getElementById("username").value.trim();

  if (!email || !password || !username) {
    alert("Заполни все поля");
    return;
  }

  if (username.startsWith("@")) username = username.slice(1);
  username = username.toLowerCase();

  // Проверяем, нет ли уже такого username в Firestore
  const q = query(collection(db, "users"), where("username", "==", username));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    alert("Username уже занят!");
    return;
  }

  try {
    // 1️⃣ Создаём пользователя в Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2️⃣ Сохраняем в Firestore
    await addDoc(collection(db, "users"), {
      uid: user.uid,
      email: email,
      username: username,
      bio: "",
      createdAt: new Date()
    });

    // 3️⃣ Перенаправление
    localStorage.setItem("username", username); // Можно использовать для UI
    window.location.href = "chat.html";

  } catch (error) {
    alert(error.message);
  }
};

window.login = async function() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!email || !password) {
    alert("Заполни все поля");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    window.location.href = "chat.html";

  } catch (error) {
    alert("Неверный email или пароль");
  }
};
