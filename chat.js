import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  deleteDoc,
  updateDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "./firebase.js";

/* ===== GLOBAL STATE ===== */
let currentUser = null;
let currentChatId = null;
let unsubscribeMessages = null;
let currentChatUser = null;
let searchMode = false;

/* ===== UTILS ===== */
function generateChatId(user1, user2) {
  return [user1, user2].sort().join("_");
}

/* ===== SAVE CONTACT ===== */

window.saveContactName = function () {
  const customName = document.getElementById("contactName").value.trim();

  if (!customName) return;

  let contacts = JSON.parse(localStorage.getItem("contacts") || "{}");
  contacts[currentChatUser] = customName;

  localStorage.setItem("contacts", JSON.stringify(contacts));

  loadChats();
};

/* ===== OPEN PROFILE ===== */

window.openProfile = async function () {
  document.getElementById("profileModal").style.display = "flex";

  const contacts = JSON.parse(localStorage.getItem("contacts") || "{}");
  const displayName = contacts[currentChatUser] || "@" + currentChatUser;

  const q = query(
    collection(db, "users"),
    where("username", "==", currentChatUser)
  );

  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    const data = snapshot.docs[0].data();

    document.getElementById("profileUsername").innerText = displayName;
    document.getElementById("profileBio").innerText =
      data.bio && data.bio.trim() !== ""
        ? data.bio
        : "Нет информации";
  }
};

window.closeProfile = function () {
  document.getElementById("profileModal").style.display = "none";
};

/* ===== BIO =====*/
window.saveBio = async function () {
  const bio = document.getElementById("bioInput").value.trim();

  if (bio.length > 100) {
    alert("Максимум 100 символов");
    return;
  }

  const user = auth.currentUser;
  if (!user) return;

  const q = query(collection(db, "users"), where("uid", "==", user.uid));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    const docId = snapshot.docs[0].id;
    await updateDoc(doc(db, "users", docId), {
      bio: bio
    });
  }
};

/* ===== CHAT-MENU ===== */

window.toggleMenu = function () {
  const menu = document.getElementById("chatMenu");
  menu.style.display = menu.style.display === "flex" ? "none" : "flex";
};

/* ===== SEARCH ===== */
window.handleSearch = async function () {
  const input = document.getElementById("searchInput");
  const value = input.value.trim().toLowerCase();
  const chatList = document.getElementById("chatList");
  if (!chatList || !value) return;

  chatList.innerHTML = "";
  searchMode = true;
  document.getElementById("searchBtn").innerText = "❌";
  document.getElementById("sidebarTitle").innerText = "Результаты";

  const q = query(collection(db, "users"), where("username", "==", value));
  const snapshot = await getDocs(q);

  snapshot.forEach(docSnap => {
    const user = docSnap.data().username;
    if (user === currentUser) return;

    const div = document.createElement("div");
    div.className = "chat-item";
    div.innerText = "@" + user;
    div.onclick = () => createOrOpenChat(user);
    chatList.appendChild(div);
  });
};

/* ===== AUTH & DOM READY ===== */
document.addEventListener("DOMContentLoaded", () => {

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      currentUser = snapshot.docs[0].data().username;
    }
    // Настроим кнопку профиля
    const myBtn = document.getElementById("myProfileBtn");
    if (myBtn) {
      myBtn.innerText = currentUser.charAt(0).toUpperCase();
      myBtn.onclick = () => openMyProfile();
    }

    // Кнопка поиска
    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.onclick = () => {
      if (!searchMode) handleSearch();
      else resetSearch();
    };

    // Кнопка выхода
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = logout;

    // Модалки закрытия
    const closeMyProfile = document.getElementById("closeMyProfile");
    if (closeMyProfile) closeMyProfile.onclick = () => {
      document.getElementById("myProfileModal").style.display = "none";
    };
    const closeProfile = document.getElementById("closeProfile");
    if (closeProfile) closeProfile.onclick = () => {
      document.getElementById("profileModal").style.display = "none";
    };

    loadChats();
  });

});

/* ===== PROFILE MODAL ===== */
async function openMyProfile() {
  const modal = document.getElementById("myProfileModal");
  const avatar = document.getElementById("myProfileAvatar");
  const name = document.getElementById("myProfileUsername");
  const bio = document.getElementById("bioInput")

  const q = query(collection(db, "users"), where("uid", "==", auth.currentUser.uid));
  const snapshot = await getDocs(q);  
  console.log(snapshot.docs[0].data());
  
  if (avatar) avatar.innerText = currentUser.charAt(0).toUpperCase();
  if (name) name.innerText = "@" + currentUser;
  if (modal) modal.style.display = "flex";
  if (bio) bio.innerText = snapshot.docs[0].data().bio;
}

function openProfile(username) {
  const modal = document.getElementById("profileModal");
  const avatar = document.getElementById("profileAvatar");
  const name = document.getElementById("profileUsername");

  if (avatar) avatar.innerText = username.charAt(0).toUpperCase();
  if (name) name.innerText = "@" + username;
  if (modal) modal.style.display = "flex";
}

/* ===== LOGOUT ===== */
async function logout() {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
  }
}

/* ===== CREATE / OPEN CHAT ===== */
async function createOrOpenChat(username) {
  const chatId = generateChatId(currentUser, username);
  const q = query(collection(db, "chats"), where("chatId", "==", chatId));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    await addDoc(collection(db, "chats"), {
      chatId,
      participants: [currentUser, username]
    });
  }

  searchMode = false;
  document.getElementById("searchBtn").innerText = "🔍";
  document.getElementById("searchInput").value = "";
  document.getElementById("sidebarTitle").innerText = "Диалоги";

  loadChats();
  openChat(chatId);
}

/* ===== LOAD CHATS ===== */
async function loadChats() {
  if (!currentUser) return;

  const chatList = document.getElementById("chatList");
  if (!chatList) return;

  chatList.innerHTML = "";

  // 🔥 Берём локально сохранённые контакты
  const contacts = JSON.parse(localStorage.getItem("contacts") || "{}");

  const q = query(
    collection(db, "chats"),
    where("participants", "array-contains", currentUser)
  );

  const snapshot = await getDocs(q);

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const otherUser = data.participants.find(u => u !== currentUser);

    const div = document.createElement("div");
    div.className = "chat-item";

    // 🔥 Если сохранён локально — показываем его имя
    const displayName = contacts[otherUser] || "@" + otherUser;

    div.innerText = displayName;
    div.onclick = () => openChat(data.chatId);

    chatList.appendChild(div);
  });
}

/* ===== OPEN / CLOSE CHAT ===== */
function openChat(chatId) {
  if (!currentUser) return;

  currentChatId = chatId;

  const chatDoc = chatId.split("_");
  currentChatUser = chatDoc.find(u => u !== currentUser);

  // 🔥 Локальные контакты
  const contacts = JSON.parse(localStorage.getItem("contacts") || "{}");
  const displayName = contacts[currentChatUser] || "@" + currentChatUser;

  document.getElementById("chatTitle").innerText = displayName;

  document.getElementById("chatContainer").style.display = "flex";
  document.getElementById("messages").style.display = "flex";
  document.getElementById("inputArea").style.display = "flex";
  document.getElementById("noChat").style.display = "none";

  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";

  if (unsubscribeMessages) unsubscribeMessages();

  const messagesQuery = query(
    collection(db, "messages"),
    where("chatId", "==", chatId),
    orderBy("createdAt")
  );

  unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
    messagesDiv.innerHTML = "";

    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      const msg = document.createElement("div");
      msg.classList.add("message");
      msg.classList.add(data.sender === currentUser ? "sent" : "received");

      // 🔥 Текст сообщения
      const textSpan = document.createElement("span");
      textSpan.innerText = data.text;

      // 🔥 Время
      const timeSpan = document.createElement("span");
      timeSpan.className = "time";

      if (data.createdAt) {
        const date = data.createdAt.toDate();
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        timeSpan.innerText = `${hours}:${minutes}`;
      }

      msg.appendChild(textSpan);
      msg.appendChild(timeSpan);

      messagesDiv.appendChild(msg);
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });
}

/* ===== DELETE CHAT ===== */
window.confirmDeleteChat = function () {
  document.getElementById("deleteModal").style.display = "block";
};

window.closeDelete = function () {
  document.getElementById("deleteModal").style.display = "none";
};

window.deleteChat = async function () {
  const q = query(collection(db, "messages"), where("chatId", "==", currentChatId));
  const snapshot = await getDocs(q);

  snapshot.forEach(async (docItem) => {
    await deleteDoc(doc(db, "messages", docItem.id));
  });

  document.getElementById("deleteModal").style.display = "none";
  
  
  if (!currentChatId) return;
  const confirmDelete = confirm("Удалить чат?");
  if (!confirmDelete) return;

  const qc = query(collection(db, "chats"), where("chatId", "==", currentChatId));
  const snapshotc = await getDocs(qc);

  snapshotc.forEach(async d => {
    await deleteDoc(doc(db, "chats", d.id));
  });

  currentChatId = null;
  loadChats();
  document.getElementById("messages").style.display = "none";
  document.getElementById("inputArea").style.display = "none";
  document.getElementById("noChat").style.display = "flex";
  window.location.reload();
};

/* ===== RESET SEARCH ===== */
function resetSearch() {
  searchMode = false;
  document.getElementById("searchBtn").innerText = "🔍";
  document.getElementById("searchInput").value = "";
  document.getElementById("sidebarTitle").innerText = "Диалоги";
  loadChats();
}

/* ===== SEND MESSAGE ===== */
window.sendMessage = async function () {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!currentChatId || !text) return;

  await addDoc(collection(db, "messages"), {  
    chatId: currentChatId,
    text: text,
    sender: currentUser,
    createdAt: new Date()
  });  

  input.value = "";
};
