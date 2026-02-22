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
    updateDoc,
    setDoc,
    arrayUnion,
    getDoc
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  import { getStorage, ref, uploadBytes, getDownloadURL } 
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

  import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  import { db, auth } from "./firebase.js";

  import { supabase } from "./supabase.js";

  /* ===== GLOBAL STATE ===== */
  let currentUser = null;
  let currentChatId = null;
  let unsubscribeMessages = null;
  let currentChatUser = null;
  let searchMode = false;
  let contactsCache = {};
  let replyingTo = null;
  const storage = getStorage();
  export { db, auth, storage };

  /* ===== UTILS ===== */
  function generateChatId(user1, user2) {
    return [user1, user2].sort().join("_");
  }

  // Функция для открытия любого изображения на весь экран
  window.zoomImage = function(url) {
    if (!url || url.includes("default-avatar.png")) return; // Не зумим дефолтную или пустую
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("modalImage");
    modal.style.display = "flex";
    modalImg.src = url;
  };
  
  // Красивое отображение аватара (картинка или буква)
  function renderAvatar(container, url, letter) {
    if (url) {
      container.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; cursor:pointer;">`;
      container.onclick = () => zoomImage(url);
    } else {
      container.innerText = letter.charAt(0).toUpperCase();
      container.style.cursor = "default";
      container.onclick = null;
    }
  }
  
  /* ===== SAVE CONTACT ===== */

  window.saveContactName = async function () {
    const customName = document.getElementById("contactName").value.trim();
    if (!customName) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      await setDoc(
        doc(db, "users", user.uid, "contacts", currentChatUser),
        {
          username: currentChatUser,
          customName: customName
        }
      );
      loadChats();
      document.getElementById("profileModal").style.display = "none";
      document.getElementById("chatTitle").innerText = customName;
    } catch (error) {
      console.error("Ошибка сохранения контакта:", error);
    }
  };

  async function loadContacts() {
    const user = auth.currentUser;
    if (!user) return;

    contactsCache = {};

    const snapshot = await getDocs(
      collection(db, "users", user.uid, "contacts")
    );

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      contactsCache[data.username] = data.customName;
    });
  }

  /* ===== OPEN PROFILE ===== */
  window.openProfile = async function () {
    const modal = document.getElementById("profileModal");
    const avatarContainer = document.getElementById("profileAvatar"); // Тот, что мы добавили в HTML
    const nameDisplay = document.getElementById("profileUsername");
    const bioDisplay = document.getElementById("profileBio");

    modal.style.display = "flex";
    document.getElementById("deleteModal").style.display = "none";
    document.getElementById("chatMenu").style.display = "none";

    const displayName = contactsCache[currentChatUser] || "@" + currentChatUser;
    nameDisplay.innerText = displayName;

    const q = query(collection(db, "users"), where("username", "==", currentChatUser));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      // Ставим аватар собеседника
      renderAvatar(avatarContainer, data.avatarUrl, currentChatUser);
      bioDisplay.innerText = data.bio || "Нет описания";
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

  window.toggleMenu = function (event) {
    const menu = document.getElementById("chatMenu");

    const isOpen = menu.style.display === "flex";

    if (isOpen) {
      menu.style.display = "none";
      document.removeEventListener("click", handleOutsideClick);
    } else {
      menu.style.display = "flex";

      // Небольшая задержка чтобы клик по кнопке не закрыл меню сразу
      setTimeout(() => {
        document.addEventListener("click", handleOutsideClick);
      }, 0);
    }

    // Останавливаем всплытие чтобы клик по кнопке не считался "вне меню"
    event.stopPropagation();
  };

  function handleOutsideClick(event) {
    const menu = document.getElementById("chatMenu");

    if (!menu.contains(event.target)) {
      menu.style.display = "none";
      document.removeEventListener("click", handleOutsideClick);
    }
  }

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

      let avatarUrl = null; // Переменная для хранения ссылки на фото

      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        currentUser = userData.username;
        avatarUrl = userData.avatarUrl; // Берем URL аватарки из базы
      }

      // Настроим кнопку профиля (кружок в углу)
      const myBtn = document.getElementById("myProfileBtn");
      if (myBtn) {
        if (avatarUrl) {
          // Если аватарка есть, вставляем картинку
          myBtn.innerHTML = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        } else {
          // Если нет, как и раньше — первая буква
          myBtn.innerText = currentUser.charAt(0).toUpperCase();
        }
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
      
      const closeProfileBtn = document.getElementById("closeProfile");
      if (closeProfileBtn) closeProfileBtn.onclick = () => {
        document.getElementById("profileModal").style.display = "none";
      };

      loadChats();
    });

  });

  /* avatar */

  async function uploadAvatar(file) {

    const user = auth.currentUser;
    const fileName = user.uid + ".png";

    // удаляем старую если есть
    await supabase
      .storage
      .from("avatars")
      .remove([fileName]);

    const { data, error } = await supabase
      .storage
      .from("avatars")
      .upload(fileName, file, { upsert: true });

    if (error) {
      console.error(error);
      return null;
    }

    console.log(data);
    const publicUrl = supabase
      .storage
      .from("avatars")
      .getPublicUrl(fileName).data.publicUrl;
      
    // сохраняем в Firestore
    const q = query(collection(db, "users"), where("uid", "==", user.uid));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      await updateDoc(
        doc(db, "users", snapshot.docs[0].id),
        { avatarUrl: publicUrl }
      );
    }

    return publicUrl;
  }

  document.getElementById("avatarInput")
  .addEventListener("change", async function(e) {

    const file = e.target.files[0];
    if (!file) return;

    await uploadAvatar(file);
    location.reload();
  });



  /* ===== PROFILE MODAL ===== */
  async function openMyProfile() {
    const modal = document.getElementById("myProfileModal");
    const avatarContainer = document.getElementById("myProfileAvatar");
    const name = document.getElementById("myProfileUsername");
    const bioInput = document.getElementById("bioInput");

    const q = query(collection(db, "users"), where("uid", "==", auth.currentUser.uid));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      // Рендерим аватар: если есть ссылка - картинка, нет - буква
      renderAvatar(avatarContainer, data.avatarUrl, currentUser);
      
      if (name) name.innerText = "@" + currentUser;
      if (bioInput) bioInput.value = data.bio || "";
      if (modal) modal.style.display = "flex";
    }
  }
  window.openMyProfile = openMyProfile;


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

    await loadContacts(); // 🔥 грузим контакты

    const chatList = document.getElementById("chatList");
    chatList.innerHTML = "";

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

      const displayName = contactsCache[otherUser] || "@" + otherUser;

      div.innerText = displayName;
      div.onclick = () => openChat(data.chatId);

      chatList.appendChild(div);
    });
  }

  /* ===== OPEN / CLOSE CHAT ===== */
  async function openChat(chatId) {
    if (!currentUser) return;
    currentChatId = chatId;
    const friendUsername = chatId.split("_").find(u => u !== currentUser);
    currentChatUser = friendUsername;

    const avatarImg = document.getElementById("avatar-friend");
    const chatTitle = document.getElementById("chatTitle");
    
    // Сброс клика по аватарке в шапке
    avatarImg.onclick = null;

    try {
      const q = query(collection(db, "users"), where("username", "==", friendUsername));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        const url = userData.avatarUrl || "default-avatar.png";
        avatarImg.src = url;
        
        // Если это реальное фото, даем возможность увеличить
        if (userData.avatarUrl) {
            avatarImg.style.cursor = "pointer";
            avatarImg.onclick = () => zoomImage(userData.avatarUrl);
        }

        chatTitle.innerText = contactsCache[friendUsername] || "@" + friendUsername;
      }
    } catch (err) {
      avatarImg.src = "default-avatar.png";
    }

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
        
        if (data.deletedFor && data.deletedFor.includes(currentUser)) {
          return;
        }
        
        const msg = document.createElement("div");
        msg.id = "msg-" + docSnap.id;
        msg.classList.add("message");
        msg.classList.add(data.sender === currentUser ? "sent" : "received");
        
        if (data.replyTotext) {
          const replyDiv = document.createElement("div");
          replyDiv.className = "reply-box";
        
          const replyUser = document.createElement("div");
          replyUser.className = "reply-user";
          replyUser.innerText = data.replyfrom;
          console.log(data.replyfrom);
        
          const replyText = document.createElement("div");
          replyText.className = "reply-text";
          replyText.id = 'reply-text'
          replyText.innerText = data.replyTotext;
        
          replyDiv.appendChild(replyUser);
          replyDiv.appendChild(replyText);
        
          // 🔥 Клик по reply — переходим к сообщению
          replyDiv.addEventListener("click", () => {
            const target = document.getElementById("msg-" + data.replyToid);
            if (!target) return;
        
            highlightMessage(target);
          });
        
          msg.appendChild(replyDiv);
        }
        
        if (data.edited) {
          const editedSpan = document.createElement("span");
          editedSpan.className = "edited";
          editedSpan.innerText = " (изменено)";
          msg.appendChild(editedSpan);
        }
        
        // 🔥 Текст сообщения
        const textSpan = document.createElement("span");
        textSpan.innerText = data.text;

        if (data.fileUrl) {
          if (data.fileType.startsWith("image/")) {
            const img = document.createElement("img");
            img.src = data.fileUrl;
            img.style.maxWidth = "200px";
            img.style.cursor = "pointer";
      
            // Клик по картинке — открываем модалку
            img.addEventListener("click", () => {
              const modal = document.getElementById("imageModal");
              const modalImg = document.getElementById("modalImage");
              modal.style.display = "flex";
              modalImg.src = data.fileUrl;
            });
      
            msg.appendChild(img);
          } else {
            const link = document.createElement("a");
            link.href = data.fileUrl;
            link.target = "_blank";
            link.innerText = data.fileName;
            msg.appendChild(link);
          }
        }
        
        // 🔥 Время
        const timeSpan = document.createElement("span");
        timeSpan.className = "time";

        if (data.createdAt) {
          const date = data.createdAt.toDate();
          const hours = date.getHours().toString().padStart(2, "0");
          const minutes = date.getMinutes().toString().padStart(2, "0");
          timeSpan.innerText = `${hours}:${minutes}`;
        }
        
        msg.addEventListener("contextmenu", e => {
          e.preventDefault();
          openMessageMenu(e, docSnap.id, data);
        });
        
        msg.addEventListener("click", e => {
          openMessageMenu(e, docSnap.id, data);
        });

        msg.appendChild(textSpan);
        msg.appendChild(timeSpan);
        messagesDiv.appendChild(msg);
      });

      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }

  function highlightMessage(element) {

    const rect = element.getBoundingClientRect();
    const isVisible =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight;

    // Если не видно — скроллим
    if (!isVisible) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }

    // Подсветка
    element.classList.add("highlight");

    setTimeout(() => {
      element.classList.remove("highlight");
    }, 500);
  }

  let selectedMessageId = null;
  let selectedMessageData = null;

  function openMessageMenu(event, messageId, messageData) {
    const menu = document.getElementById("messageMenu");

    selectedMessageId = messageId;
    selectedMessageData = messageData;

    menu.style.display = "flex";
    menu.style.top = event.pageY + "px";
    menu.style.left = event.pageX + "px";

    // Показывать "Изменить" только если сообщение наше
    const editOption = document.getElementById("editOption");
    if (messageData.sender === currentUser) {
      editOption.style.display = "block";
    } else {
      editOption.style.display = "none";
    }
  }

  document.getElementById("imageModal").addEventListener("click", (e) => {
    if (e.target.id === "imageModal") {
      e.target.style.display = "none";
    }
  });

  document.addEventListener("click", function(e) {
    const menu = document.getElementById("messageMenu");
    if (!menu.contains(e.target)) {
      menu.style.display = "none";
    }
  });

  document.getElementById("editOption").onclick = async function() {
    const input = document.getElementById("messageInput");

    input.value = selectedMessageData.text;
    input.focus();

    document.getElementById("messageMenu").style.display = "none";

    window.editingMessageId = selectedMessageId;
  };

  document.getElementById("deleteOption").onclick = function() {
    document.getElementById("deleteMessageModal").style.display = "flex";
    document.getElementById("messageMenu").style.display = "none";
  };

  window.closeDeleteMessage = function() {
    document.getElementById("deleteMessageModal").style.display = "none";
  };

  window.confirmDeleteMessage = async function() {
    const deleteForAll = document.getElementById("deleteForAll").checked;

    if (deleteForAll) {

      if (selectedMessageData.fileUrl) {
        await deleteFileFromSupabase(
          selectedMessageData.fileUrl,
          "chat-files"
        );
      }

      await deleteDoc(doc(db, "messages", selectedMessageId));
    } else {
      await updateDoc(
        doc(db, "messages", selectedMessageId),
        {
          deletedFor: arrayUnion(currentUser)
        }
      );
    }

    document.getElementById("deleteMessageModal").style.display = "none";
  };

  document.getElementById("replyOption").onclick = function() {

    replyingTo = {
      id: selectedMessageId,
      text: selectedMessageData.text 
            ? selectedMessageData.text 
            : "Фотография",
      user: selectedMessageData.sender
    };

    const replyPreview = document.getElementById("replyPreview");
    replyPreview.style.display = "block";
    replyPreview.innerText = replyingTo.user + ":" + replyingTo.text;

    replyPreview.onclick = () => {
      const target = document.getElementById("msg-" + replyingTo.id);
      if (!target) return;

      highlightMessage(target);
    };

    document.getElementById("messageMenu").style.display = "none";
  };

  function sanitizeFileName(name) {
    return name
      .normalize("NFD")                  // убираем акценты
      .replace(/[\u0300-\u036f]/g, "")   // удаляем диакритические знаки
      .replace(/\s+/g, "_")              // заменяем пробелы на _
      .replace(/[^\w.-]/g, "");          // оставляем только буквы, цифры, точки, дефисы и _
  }

  document.getElementById("fileInput").addEventListener("change", async function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // безопасное имя
    const safeFileName = `${Date.now()}_${sanitizeFileName(file.name)}`;
    
    // 🔥 функция загрузки
    async function uploadFile(file) {
      const { data, error } = await supabase
        .storage
        .from("chat-files")
        .upload(`chat-files/${safeFileName}`, file);

      if (error) {
        console.error("Ошибка загрузки:", error);
        return null;
      }

      const { data: { publicUrl }, error: urlError } = supabase
      .storage
      .from("chat-files")
      .getPublicUrl(data.path);

      return publicUrl;
    }

    // 🔥 вызываем uploadFile и сохраняем URL
    const fileUrl = await uploadFile(file);

    if (!fileUrl) {
      alert("Не удалось загрузить файл");
      return;
    }

    // 🔥 теперь сохраняем сообщение с правильным fileUrl
    await addDoc(collection(db, "messages"), {
      chatId: currentChatId,
      sender: currentUser,
      createdAt: new Date(),
      deletedFor: [],
      fileUrl: fileUrl,
      fileName: file.name,
      fileType: file.type,
      text: null
    });
  });

  /* ===== DELETE CHAT ===== */
  window.confirmDeleteChat = function () {
    document.getElementById("deleteModal").style.display = "flex";
    document.getElementById("profileModal").style.display = "none";
    const menu = document.getElementById("chatMenu");
    menu.style.display = menu.style.display === "flex" ? "none" : "flex";
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
    document.getElementById("chatContainer").style.display = "none";
    document.getElementById("noChat").style.display = "flex";
    loadChats();
  };

  async function deleteFileFromSupabase(fileUrl, bucket) {
    if (!fileUrl) return;

    const url = new URL(fileUrl);
    const path = url.pathname.split(`/storage/v1/object/public/${bucket}/`)[1];

    if (!path) return;

    await supabase
      .storage
      .from(bucket)
      .remove([path]);
  }

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

    if (window.editingMessageId) {

      await updateDoc(
        doc(db, "messages", window.editingMessageId),
        {
          text: messageInput.value,
          edited: true
        }
      );
    
      window.editingMessageId = null;
      messageInput.value = "";
      return;
    }
    
    await addDoc(collection(db, "messages"), {
      chatId: currentChatId,
      text: text,
      sender: currentUser,
      createdAt: new Date(),
      deletedFor: [],
      edited: false,
      replyToid: replyingTo ? replyingTo.id : null,
      replyTotext: replyingTo ? replyingTo.text : null,
      replyfrom: replyingTo ? replyingTo.user : null
    });
    replyingTo = null; // после отправки сбрасываем
    document.getElementById("replyPreview").style.display = "none";

    input.value = "";
  };
