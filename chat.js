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
    let currentMode = "voice"; // "voice", "video" или "text"
    export { db, auth, storage };

    const loader = document.getElementById('loader-overlay');

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // Если не авторизован — отправляем на главную
            window.location.href = "index.html";
        } else {
            // Если всё ок — скрываем загрузку и показываем интерфейс чата
            loader.style.display = 'none';
            
            // Тут можно вызвать функцию инициализации данных чата
            // loadMessages(); 
        }
    });
      
  // Функция установки статуса
  async function setOnlineStatus(status) {
    if (!auth.currentUser) return;
    
    // Ищем документ пользователя
    const q = query(collection(db, "users"), where("uid", "==", auth.currentUser.uid));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
        const userDocRef = doc(db, "users", snapshot.docs[0].id);
        try {
            await updateDoc(userDocRef, {
                isOnline: status,
                lastSeen: new Date()
            });
        } catch (e) {
            console.error("Ошибка обновления статуса:", e);
        }
    }
  }

  // 1. Когда пользователь закрывает вкладку или переходит по ссылке
  window.addEventListener("beforeunload", () => {
    // Важно: в современных браузерах async/await в beforeunload может не успеть
    // Поэтому статус может зависнуть. 
    setOnlineStatus(false);
  });

  // 2. Самый надежный способ для мобилок и современных браузеров
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'hidden') {
        setOnlineStatus(false);
    } else {
        setOnlineStatus(true);
    }
  });

  // 3. Обновляем статус "онлайн" раз в минуту, чтобы подтвердить, что мы тут
  setInterval(() => {
    if (document.visibilityState === 'visible') {
        setOnlineStatus(true);
    }
  }, 60000);
        
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

      const messageInput = document.getElementById("messageInput");
      if (messageInput) {
          messageInput.addEventListener("input", updateButtonUI);
      }
      
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
        
        // В loadChats, когда создаешь div чата:
        const statusDot = document.createElement("span");
        const qUser = query(collection(db, "users"), where("username", "==", otherUser));
        onSnapshot(qUser, (snap) => {
            if (!snap.empty && snap.docs[0].data().isOnline) {
                div.innerHTML = `${displayName} <span class="online-label">в сети</span>`;
            } else {
                div.innerText = displayName;
            }
        });

        const displayName = contactsCache[otherUser] || "@" + otherUser;

        div.innerText = displayName;
        div.onclick = () => openChat(data.chatId);

        chatList.appendChild(div);
      });
    }

    /* ===== OPEN / CLOSE CHAT ===== */
    async function openChat(chatId) {
      if (!currentUser) return;
      let unsubscribeStatus = null;
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

      // Подписка на статус друга
      const qStatus = query(collection(db, "users"), where("username", "==", friendUsername));
      unsubscribeStatus = onSnapshot(qStatus, (snapshot) => {
          const statusDiv = document.getElementById("chatStatus");
          if (!snapshot.empty) {
              const data = snapshot.docs[0].data();
              if (data.isOnline) {
                  statusDiv.innerText = "в сети";
                  statusDiv.classList.add("online");
              } else {
                  statusDiv.innerText = "был(а) недавно";
                  statusDiv.classList.remove("online");
              }
          }
      });
      
      const messagesQuery = query(
        collection(db, "messages"),
        where("chatId", "==", chatId),
        orderBy("createdAt")
      );

      unsubscribeMessages = onSnapshot(messagesQuery, snapshot => {
        messagesDiv.innerHTML = "";

        // Внутри onSnapshot(messagesQuery, ...)
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
              const data = change.doc.data();
              // Если сообщение прислали МНЕ и оно не прочитано — помечаем прочитанным
              if (data.sender !== currentUser && !data.read) {
                  updateDoc(doc(db, "messages", change.doc.id), { read: true });
              }
          } 
        });
        
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
            }else if (data.fileType === "voice") {
              const audio = document.createElement("audio");
              audio.src = data.fileUrl;
              audio.controls = true;
              audio.className = "voice-msg";
              msg.appendChild(audio);
            }else if (data.fileType === "video") {
                const video = document.createElement("video");
                video.src = data.fileUrl;
                video.className = "video-note"; // "кружок"
                video.onclick = () => video.paused ? video.play() : video.pause();
                msg.appendChild(video);
            }else if (data.fileType && data.fileType.startsWith("image/")) {
                // Твой старый код для картинок...
            }else {
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
          
          // Где-то рядом с timeSpan
          if (data.sender === currentUser) {
            const statusSpan = document.createElement("span");
            statusSpan.className = "msg-status";
            statusSpan.innerText = data.read ? "✓✓" : "✓"; // Одна или две галочки
            msg.appendChild(statusSpan);
          }
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
  
/* ===== ЛОГИКА КНОПКИ: ЗАЖАТИЕ ДЛЯ ЗАПИСИ / КЛИК ДЛЯ СМЕНЫ ИЛИ ОТПРАВКИ ===== */

const mainBtn = document.getElementById("mainActionBtn");
const messageInput = document.getElementById("messageInput");

/* ===== БЛОК ЗАПИСИ И УПРАВЛЕНИЯ КНОПКОЙ (ПОЛНЫЙ) ===== */

let pressTimer;
let isLongPress = false;
let isRecording = false;
let isSending = false;
let mediaRecorder = null;
let audioChunks = [];

// 1. Умное обновление интерфейса кнопки
function updateButtonUI() {
    const mainBtn = document.getElementById("mainActionBtn");
    const messageInput = document.getElementById("messageInput");
    
    if (isSending) return; // Не менять иконку, пока идет отправка текста

    if (isRecording) {
        mainBtn.innerText = "🛑";
        mainBtn.style.background = "red";
        mainBtn.style.color = "white";
        return;
    }

    // Сброс стилей, если запись не идет
    mainBtn.style.background = "";
    mainBtn.style.color = "";

    if (messageInput.value.trim().length > 0) {
        currentMode = "text";
        mainBtn.innerText = "🤙";
    } else {
        const savedMode = localStorage.getItem("lastMediaMode") || "voice";
        currentMode = savedMode;
        mainBtn.innerText = currentMode === "voice" ? "🎤" : "📷";
    }
}

// 2. Логика нажатий (Pointer Events — лучшее для мобилок и ТГ)
mainBtn.onpointerdown = (e) => {
    // Если есть текст в поле — запись не начинаем, просто ждем клика для отправки
    if (messageInput.value.trim().length > 0 || isRecording) return;
    
    isLongPress = false;
    pressTimer = setTimeout(() => {
        isLongPress = true;
        startRecording(); 
    }, 1500); // Зажать на 1.5 секунды для старта
};

mainBtn.onpointerup = (e) => {
    clearTimeout(pressTimer);
    
    // Если запись уже идет — нажатие её НЕ останавливает здесь (остановит onclick)
    if (isRecording) return;

    // Если это был короткий клик
    if (!isLongPress) {
        if (messageInput.value.trim().length > 0) {
            window.sendMessage(); // Отправка текста
        } else {
            // Переключение режима 🎤 / 📷
            currentMode = (currentMode === "voice") ? "video" : "voice";
            localStorage.setItem("lastMediaMode", currentMode);
            updateButtonUI();
        }
    }
};

// Если палец соскочил с кнопки — отменяем таймер старта
mainBtn.onpointerleave = () => clearTimeout(pressTimer);

// 3. Клик для остановки уже идущей записи
mainBtn.onclick = (e) => {
    if (isRecording) {
        stopRecording();
    }
};

/* ===== ЛОГИКА СМЕНЫ КАМЕРЫ ===== */

/* ===== ЛОГИКА СМЕНЫ КАМЕРЫ ===== */

let currentFacingMode = "user"; 
let currentStream = null;

const switchBtn = document.getElementById("switchCameraBtn");

switchBtn.onclick = async (e) => {
    e.stopPropagation(); 
    
    // Меняем режим
    currentFacingMode = (currentFacingMode === "user") ? "environment" : "user";
    
    // Если запись идет или превью открыто — меняем камеру на лету
    if (currentStream && currentMode === "video") {
        await switchCameraTracks();
    }
};

async function switchCameraTracks() {
    try {
        // Получаем поток с новой камеры
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 400 }, 
                height: { ideal: 400 }, 
                facingMode: currentFacingMode 
            },
            audio: true // Оставляем звук
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = currentStream.getVideoTracks()[0];

        // 1. Останавливаем старую камеру
        oldVideoTrack.stop();

        // 2. УДАЛЯЕМ старый трек и ДОБАВЛЯЕМ новый в текущий поток
        currentStream.removeTrack(oldVideoTrack);
        currentStream.addTrack(newVideoTrack);

        // 3. Обновляем визуальное превью (кружок)
        const videoPrev = document.getElementById("videoRecordPreview");
        videoPrev.srcObject = currentStream; 
        
        // Зеркалим только переднюю камеру
        videoPrev.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";

        // 4. ГЛАВНОЕ: Сообщаем MediaRecorder-у, что трек сменился (для некоторых браузеров)
        // В большинстве современных браузеров MediaRecorder подхватит изменение в currentStream автоматически
        
    } catch (err) {
        console.error("Не удалось сменить камеру:", err);
    }
}

async function restartStream() {
    if (!currentStream) return;

    // Останавливаем старые треки
    currentStream.getTracks().forEach(track => track.stop());

    try {
        const constraints = {
            audio: true,
            video: { 
                width: { ideal: 400 }, 
                height: { ideal: 400 }, 
                facingMode: currentFacingMode 
            }
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = newStream;

        // Обновляем превью
        const videoPrev = document.getElementById("videoRecordPreview");
        videoPrev.srcObject = newStream;
        
        // Зеркалим только переднюю камеру
        videoPrev.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";

        // ВАЖНО: Если MediaRecorder уже запущен, его нельзя просто переподключить.
        // Поэтому для "бесшовной" смены камеры во время одного видео нужен сложный Canvas.
        // Самый стабильный вариант для браузеров — остановить и начать заново или просто менять ДО старта.
        
        // Но мы обновим превью, чтобы пользователь видел, что он снимает.
    } catch (err) {
        console.error("Ошибка при смене камеры:", err);
    }
}

// 4. ФУНКЦИЯ СТАРТА ЗАПИСИ
async function startRecording() {
  if (isRecording) return;
  
  try {
      const constraints = {
          audio: true,
          video: currentMode === "video" ? { 
              width: { ideal: 400 }, 
              height: { ideal: 400 }, 
              facingMode: currentFacingMode 
          } : false
      };

      // Запрашиваем доступ
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (currentMode === "video") {
          const videoPrev = document.getElementById("videoRecordPreview");
          const container = document.getElementById("videoContainer");
          
          // Сначала показываем контейнер, потом цепляем поток
          container.style.display = "block";
          videoPrev.srcObject = currentStream;
          
          // Ждем, пока видео реально начнет проигрываться в превью
          await videoPrev.play(); 

          videoPrev.style.transform = (currentFacingMode === "user") ? "scaleX(-1)" : "scaleX(1)";
      }

      // Создаем рекордер на базе currentStream
      mediaRecorder = new MediaRecorder(currentStream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
          const blob = new Blob(audioChunks, { 
              type: currentMode === "voice" ? 'audio/ogg' : 'video/mp4' 
          });
          const ext = currentMode === "voice" ? 'ogg' : 'mp4';
          const file = new File([blob], `rec_${Date.now()}.${ext}`, { type: blob.type });
          
          // Полная остановка всех камер
          if (currentStream) {
              currentStream.getTracks().forEach(t => t.stop());
          }
          document.getElementById("videoContainer").style.display = "none";
          
          await uploadMediaMessage(file, currentMode);
          updateButtonUI();
      };

      mediaRecorder.start(100); // Сохраняем данные каждые 100мс для надежности
      isRecording = true;
      
      if (navigator.vibrate) navigator.vibrate(100);
      updateButtonUI();

  } catch (err) {
      console.error("Ошибка при старте записи:", err);
      isRecording = false;
      updateButtonUI();
      alert("Доступ к камере/микрофону отклонен или невозможен.");
  }
}

// 5. ФУНКЦИЯ ОСТАНОВКИ
function stopRecording() {
    if (!isRecording || !mediaRecorder) return;

    if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    
    isRecording = false;
    mainBtn.classList.remove("recording-active");
    updateButtonUI();
}

// 4. ЗАГРУЗКА
async function uploadMediaMessage(file, type) {
    const fileName = `${Date.now()}_${file.name}`;
    
    const { data, error } = await supabase.storage
        .from("chat-files")
        .upload(`media/${fileName}`, file);

    if (error) return console.error("Supabase error:", error);

    const publicUrl = supabase.storage.from("chat-files").getPublicUrl(`media/${fileName}`).data.publicUrl;

    await addDoc(collection(db, "messages"), {
        chatId: currentChatId,
        sender: currentUser,
        createdAt: new Date(),
        fileUrl: publicUrl,
        fileType: type, 
        text: null,
        deletedFor: []
    });
}
  
  /* ===== SEND MESSAGE ===== */

  window.sendMessage = async function () {
      const input = document.getElementById("messageInput");
      const text = input.value.trim();
      const btn = document.getElementById("mainActionBtn");
  
      // 1. ЗАЩИТА: Если уже идет отправка, или нет чата, или пусто — выходим
      if (isSending || !currentChatId || !text) return;
  
      try {
          isSending = true; // Блокируем повторные вызовы
          btn.disabled = true; // Делаем кнопку неактивной (чтобы не спамили)
  
          if (window.editingMessageId) {
              await updateDoc(
                  doc(db, "messages", window.editingMessageId),
                  {
                      text: text, // Используем уже обрезанный text
                      edited: true
                  }
              );
              window.editingMessageId = null;
          } else {
              // Обычная отправка
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
  
              // Сброс реплая после успешной отправки
              replyingTo = null; 
              document.getElementById("replyPreview").style.display = "none";
          }
  
          // Очищаем поле только после успеха
          input.value = "";
  
      } catch (error) {
          console.error("Ошибка при отправке:", error);
          alert("Не удалось отправить сообщение");
      } finally {
          // ВАЖНО: Разблокируем всё обратно
          isSending = false;
          btn.disabled = false;
          updateButtonUI(); // Возвращаем иконку (микрофон/камеру)
      }
  };