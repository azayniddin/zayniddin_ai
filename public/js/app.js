/**
 * Main Application Logic
 * Chat tarixi boshqaruvi, SSE Streaming, Markdown parser va Sozlamalar
 */

window.appState = {
  activeChatId: null,
  chats: [],
  profile: {},
  apiKey: localStorage.getItem('personal_ai_key') || ''
};

// ================= Global Sidebar (Yon Panel) Boshqaruvi =================
let lastSidebarToggleTime = 0;

window.closeAppSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) {
    sidebar.classList.remove('mobile-open');
    if (window.innerWidth > 768) {
      sidebar.classList.add('collapsed');
      localStorage.setItem('sidebar_desktop_collapsed', 'true');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }
  if (overlay) {
    overlay.classList.remove('active');
  }
};

window.openAppSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) {
    sidebar.classList.remove('collapsed');
    if (window.innerWidth <= 768) {
      sidebar.classList.add('mobile-open');
      if (overlay) overlay.classList.add('active');
    } else {
      localStorage.setItem('sidebar_desktop_collapsed', 'false');
    }
  }
};

window.toggleAppSidebar = function() {
  const now = Date.now();
  if (now - lastSidebarToggleTime < 280) return;
  lastSidebarToggleTime = now;

  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    window.closeAppSidebar();
  } else if (sidebar && sidebar.classList.contains('collapsed')) {
    window.openAppSidebar();
  } else if (window.innerWidth <= 768) {
    window.openAppSidebar();
  } else {
    window.closeAppSidebar();
  }
};

// DOM elementlari
const chatsListEl = document.getElementById('chatsList');
const newChatBtn = document.getElementById('newChatBtn');
const activeChatTitleEl = document.getElementById('activeChatTitle');
const activeChatTimeEl = document.getElementById('activeChatTime');
const messagesContainerEl = document.getElementById('messagesContainer');
const messagesInnerEl = document.getElementById('messagesInner');
const welcomeHeroEl = document.getElementById('welcomeHero');
const messageInputEl = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');

// Sozlamalar modal elementlari
const settingsModalEl = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const topSettingsBtn = document.getElementById('topSettingsBtn');
const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const userNameInput = document.getElementById('userNameInput');
const assistantNameInput = document.getElementById('assistantNameInput');
const customRulesInput = document.getElementById('customRulesInput');
const sidebarUserNameEl = document.getElementById('sidebarUserName');
const brandAssistantNameEl = document.getElementById('brandAssistantName');
const userAvatarTextEl = document.getElementById('userAvatarText');

// marked.js sozlamalari
marked.setOptions({
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  breaks: true,
  gfm: true
});

// Yordamchi: Headers
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (window.appState.apiKey) {
    headers['x-api-key'] = window.appState.apiKey;
  }
  if (window.appState.user && window.appState.user.id) {
    headers['x-user-id'] = window.appState.user.id;
    headers['x-user-name'] = encodeURIComponent(window.appState.user.name || '');
    headers['x-user-surname'] = encodeURIComponent(window.appState.user.surname || '');
    headers['x-user-email'] = encodeURIComponent(window.appState.user.email || '');
  }
  return headers;
}

// ================= Foydalanuvchi Boshqaruvi (User Auth & Session) =================
function initUserSession() {
  let user = null;
  try {
    const stored = localStorage.getItem('zayniddin_ai_user');
    if (stored) user = JSON.parse(stored);
  } catch (e) {}

  if (user && user.id && user.name) {
    window.appState.user = user;
    updateUserUI(user);
    syncUserWithServer(user);
  } else {
    // Foydalanuvchi birinchi marta kirganda ro'yxatdan o'tish oynasini ko'rsatish
    setTimeout(() => openAuthModal(true), 350);
  }
}

function updateUserUI(user) {
  if (!user) return;
  const name = user.name || 'Do‘stim';
  const firstLetter = name[0]?.toUpperCase() || 'U';

  // Asosiy sahifadagi shaxsiy salomlashish
  const welcomeGreeting = document.getElementById('welcomeGreeting');
  if (welcomeGreeting) {
    welcomeGreeting.innerHTML = `Salom, <span class="gradient-text">${escapeHtml(name)}</span>! Bugun nima ish qilamiz?`;
  }

  // Yuqori paneldagi profil tugmasi
  const topUserName = document.getElementById('topUserName');
  const topUserAvatar = document.getElementById('topUserAvatar');
  const topUserBtn = document.getElementById('topUserBtn');
  if (topUserName) topUserName.textContent = name;
  if (topUserAvatar) topUserAvatar.textContent = firstLetter;
  if (topUserBtn) {
    const rem = user.imageLimit !== undefined ? Math.max(0, user.imageLimit - (user.imageCount || 0)) : 5;
    topUserBtn.title = `${name} ${user.surname || ''} (Qolgan rasm limiti: ${rem} ta)`;
  }

  // Yon paneldagi profil ma'lumoti
  if (sidebarUserNameEl) sidebarUserNameEl.textContent = name;
  if (userAvatarTextEl) userAvatarTextEl.textContent = firstLetter;

  // Agar foydalanuvchi ma'muriyat tomonidan bloklangan bo'lsa
  if (user.isBlocked) {
    showBlockedModal();
  }
}

function showBlockedModal() {
  const modal = document.getElementById('blockedModal');
  if (modal) modal.classList.add('active');
  if (messageInputEl) messageInputEl.disabled = true;
  if (sendMessageBtn) sendMessageBtn.disabled = true;
}

async function syncUserWithServer(user) {
  try {
    const res = await fetch(`/api/auth/me?userId=${encodeURIComponent(user.id)}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        window.appState.user = data.user;
        localStorage.setItem('zayniddin_ai_user', JSON.stringify(data.user));
        updateUserUI(data.user);
      }
    } else if (res.status === 403) {
      showBlockedModal();
    }
  } catch (e) {
    console.warn('User sync ogohlantirish:', e.message);
  }
}

function openAuthModal(isFirstTime = false) {
  const modal = document.getElementById('authModal');
  const closeBtn = document.getElementById('closeAuthModalBtn');
  const modalTitle = document.getElementById('authModalTitle');
  const modalDesc = document.getElementById('authModalDesc');

  if (closeBtn) closeBtn.style.display = isFirstTime ? 'none' : 'flex';
  if (modalTitle) modalTitle.textContent = isFirstTime ? 'Xush Kelibsiz!' : 'Profil Sozlamalari';
  if (modalDesc) {
    modalDesc.textContent = isFirstTime 
      ? "AI Yordamchi sizga shaxsan ismingiz bilan murojaat qilishi va barcha imkoniyatlardan foydalanishingiz uchun ism-familiyangizni kiriting:" 
      : "Profil ma'lumotlaringizni yangilashingiz mumkin:";
  }

  if (window.appState.user) {
    const nameInput = document.getElementById('authNameInput');
    const surnameInput = document.getElementById('authSurnameInput');
    const emailInput = document.getElementById('authEmailInput');
    if (nameInput) nameInput.value = window.appState.user.name || '';
    if (surnameInput) surnameInput.value = window.appState.user.surname || '';
    if (emailInput) emailInput.value = window.appState.user.email || '';
  }

  if (modal) modal.classList.add('active');
  const firstInput = document.getElementById('authNameInput');
  if (firstInput) setTimeout(() => firstInput.focus(), 150);
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
}

async function handleSaveAuth() {
  const nameInput = document.getElementById('authNameInput');
  const surnameInput = document.getElementById('authSurnameInput');
  const emailInput = document.getElementById('authEmailInput');

  const name = nameInput?.value.trim();
  const surname = surnameInput?.value.trim();
  const email = emailInput?.value.trim();

  if (!name) {
    alert('Iltimos, ismingizni kiriting!');
    nameInput?.focus();
    return;
  }

  const existingId = window.appState.user?.id || 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const payload = {
    id: existingId,
    name,
    surname,
    email
  };

  const submitBtn = document.getElementById('submitAuthBtn');
  const origHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Saqlanmoqda...</span>';
  }

  try {
    const res = await fetch('/api/auth/login-or-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success && data.user) {
      window.appState.user = data.user;
      localStorage.setItem('zayniddin_ai_user', JSON.stringify(data.user));
      updateUserUI(data.user);
      closeAuthModal();
      loadChats();
    } else {
      alert('Kirishda xatolik: ' + (data.error || 'Noma‘lum xato'));
    }
  } catch (err) {
    console.error('Auth error:', err);
    // Offline / fallback rejim
    const fallbackUser = { id: existingId, name, surname, email, imageLimit: 5, imageCount: 0, isBlocked: false };
    window.appState.user = fallbackUser;
    localStorage.setItem('zayniddin_ai_user', JSON.stringify(fallbackUser));
    updateUserUI(fallbackUser);
    closeAuthModal();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origHtml;
      if (window.lucide) lucide.createIcons();
    }
  }
}

// Server holati va API kalitini tekshirish
async function checkServerStatus() {
  const badgeEl = document.getElementById('serverKeyBadge');
  const badgeText = document.getElementById('serverKeyBadgeText');
  const apiKeyInput = document.getElementById('apiKeyInput');

  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      window.appState.hasServerKey = data.hasServerKey;
      if (badgeEl && badgeText) {
        badgeEl.style.display = 'flex';
        if (data.hasServerKey) {
          badgeEl.className = 'server-key-badge';
          badgeText.innerHTML = '<span><strong>🟢 OpenAI API kaliti serverda sozlangan!</strong> Ilovada kalit kiritish shart emas.</span>';
          if (apiKeyInput && !window.appState.apiKey) {
            apiKeyInput.placeholder = 'Server kaliti faol (kiritish shart emas)';
          }
        } else {
          badgeEl.className = 'server-key-badge warning';
          badgeText.innerHTML = '<span><strong>⚠️ Serverda API kalit topilmadi.</strong> Railway / .env da sozlang yoki pastda kiriting.</span>';
          if (apiKeyInput) {
            apiKeyInput.placeholder = 'sk-proj-...';
          }
        }
      }
    }
  } catch (err) {
    console.warn('Status tekshirishda xatolik:', err);
  }
}

// 1. Profilni yuklash
async function loadProfile() {
  try {
    const res = await fetch('/api/profile');
    if (res.ok) {
      window.appState.profile = await res.json();
      updateProfileUI();
    }
  } catch (err) {
    console.warn('Profil yuklanmadi:', err);
  }
}

function updateProfileUI() {
  const p = window.appState.profile;
  if (p.userName) {
    sidebarUserNameEl.textContent = p.userName;
    userAvatarTextEl.textContent = p.userName.charAt(0).toUpperCase();
  }
  if (p.assistantName) {
    brandAssistantNameEl.textContent = p.assistantName;
  }
  if (userNameInput) userNameInput.value = p.userName || '';
  if (assistantNameInput) assistantNameInput.value = p.assistantName || '';
  if (customRulesInput) customRulesInput.value = p.customRules || '';
  if (apiKeyInput) apiKeyInput.value = window.appState.apiKey || '';
}

// 2. Chatlar ro'yxatini yuklash
async function loadChats() {
  try {
    const res = await fetch('/api/chats');
    if (res.ok) {
      window.appState.chats = await res.json();
      renderChatsList();

      // Agar chatlar mavjud bo'lsa va hech qaysi tanlanmagan bo'lsa, birinchisini ochish
      if (window.appState.chats.length > 0 && !window.appState.activeChatId) {
        selectChat(window.appState.chats[0].id);
      } else if (window.appState.chats.length === 0) {
        // Yangi suhbat yaratish
        createNewChat();
      }
    }
  } catch (err) {
    console.error('Chatlar yuklanmadi:', err);
  }
}

function renderChatsList() {
  chatsListEl.innerHTML = '';
  window.appState.chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = `chat-history-item ${chat.id === window.appState.activeChatId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="chat-title-text" title="${chat.title}">${chat.title}</div>
      <button class="chat-del-btn" data-id="${chat.id}" title="O‘chirish">
        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-del-btn')) {
        deleteChat(chat.id);
        return;
      }
      selectChat(chat.id);
    });

    chatsListEl.appendChild(item);
  });

  if (window.lucide) lucide.createIcons();
}

// 3. Yangi chat yaratish
let isCreatingChat = false;
async function createNewChat() {
  if (isCreatingChat) return;
  isCreatingChat = true;

  // Mobilda sidebar ochiq bo'lsa darhol yopish
  if (window.closeAppSidebar) {
    window.closeAppSidebar();
  } else {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
  }

  // Optimistik UI: Foydalanuvchiga darhol yangi suhbat maydonini ko'rsatish
  activeChatTitleEl.textContent = 'Yangi suhbat';
  activeChatTimeEl.textContent = 'Bugun';
  renderMessages([]);
  messageInputEl.value = '';

  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title: 'Yangi suhbat' })
    });
    if (res.ok) {
      const newChat = await res.json();
      window.appState.chats.unshift(newChat);
      window.appState.activeChatId = newChat.id;
      renderChatsList();
    } else {
      const fallbackChat = {
        id: 'chat_' + Date.now(),
        title: 'Yangi suhbat',
        createdAt: new Date().toISOString(),
        messages: []
      };
      window.appState.chats.unshift(fallbackChat);
      window.appState.activeChatId = fallbackChat.id;
      renderChatsList();
    }
  } catch (err) {
    console.error('Yangi chat yaratishda xatolik:', err);
    const fallbackChat = {
      id: 'chat_' + Date.now(),
      title: 'Yangi suhbat',
      createdAt: new Date().toISOString(),
      messages: []
    };
    window.appState.chats.unshift(fallbackChat);
    window.appState.activeChatId = fallbackChat.id;
    renderChatsList();
  } finally {
    isCreatingChat = false;
    setTimeout(() => {
      if (window.innerWidth > 768) {
        messageInputEl.focus();
      }
    }, 100);
  }
}

window.createNewChat = createNewChat;

// 4. Muayyan chatni tanlash
async function selectChat(chatId) {
  window.appState.activeChatId = chatId;
  renderChatsList();

  // Mobilda sidebar ochiq bo'lsa uni yopish
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');

  try {
    const res = await fetch(`/api/chats/${chatId}`);
    if (res.ok) {
      const chat = await res.json();
      activeChatTitleEl.textContent = chat.title || 'Yangi suhbat';
      activeChatTimeEl.textContent = new Date(chat.updatedAt || chat.createdAt).toLocaleDateString('uz-UZ', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      renderMessages(chat.messages || []);
    }
  } catch (err) {
    console.error('Chat yuklanmadi:', err);
  }
}

// 5. Chatni o'chirish
async function deleteChat(chatId) {
  if (!confirm('Ushbu suhbatni o‘chirishni tasdiqlaysizmi?')) return;

  try {
    const res = await fetch(`/api/chats/${chatId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (res.ok) {
      window.appState.chats = window.appState.chats.filter(c => c.id !== chatId);
      if (window.appState.activeChatId === chatId) {
        if (window.appState.chats.length > 0) {
          selectChat(window.appState.chats[0].id);
        } else {
          createNewChat();
        }
      } else {
        renderChatsList();
      }
    }
  } catch (err) {
    console.error('Chatni o‘chirishda xatolik:', err);
  }
}

// 6. Xabarlarni ko'rsatish
function renderMessages(messages) {
  messagesInnerEl.innerHTML = '';

  if (!messages || messages.length === 0) {
    messagesInnerEl.appendChild(welcomeHeroEl);
    welcomeHeroEl.style.display = 'block';
    return;
  }

  welcomeHeroEl.style.display = 'none';

  messages.forEach(msg => {
    appendMessageToUI(msg);
  });

  scrollToBottom();
}

function appendMessageToUI(msg) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  row.id = msg.id || 'msg_' + Date.now();

  let formattedContent = '';
  if (msg.role === 'assistant') {
    formattedContent = formatAssistantMessage(msg.content || '');
  } else {
    // Xavfsiz user matni
    formattedContent = `<p>${escapeHtml(msg.content || '')}</p>`;
  }

  // Biriktirilgan fayllar (Rasmlar, PDF, Kod/Matn)
  let attachmentsHtml = '';
  const filesList = Array.isArray(msg.files) ? [...msg.files] : [];
  if (msg.image && !filesList.some(f => f.dataUrl === msg.image || f.url === msg.image)) {
    filesList.unshift({ isImage: true, url: msg.image, name: 'Tasvir' });
  }

  if (filesList.length > 0) {
    let itemsHtml = '';
    filesList.forEach(file => {
      const isImg = file.isImage || file.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(file.name || '');
      const isPdf = file.isPdf || file.type === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf');
      const fileUrl = file.url || file.dataUrl || '#';
      const fileName = file.name || (isPdf ? 'Hujjat.pdf' : (isImg ? 'Rasm' : 'Fayl'));

      if (isImg) {
        itemsHtml += `
          <div class="msg-image-attachment">
            <img src="${fileUrl}" class="msg-bubble-image clickable-zoom" alt="${escapeHtml(fileName)}" onclick="window.artGenerator?.openLightbox('${fileUrl}', '${escapeHtml(fileName)}')">
          </div>
        `;
      } else if (isPdf) {
        const sizeStr = file.size ? formatFileSize(file.size) : 'PDF Hujjat';
        itemsHtml += `
          <div class="msg-file-attachment">
            <div class="file-attachment-left">
              <div class="file-icon-badge pdf">
                <i data-lucide="file-text" style="width: 18px; height: 18px;"></i>
              </div>
              <div class="file-attachment-info">
                <span class="file-attachment-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
                <span class="file-attachment-meta">PDF · ${sizeStr}</span>
              </div>
            </div>
            <a href="${fileUrl}" download="${escapeHtml(fileName)}" class="file-download-btn" title="Yuklab olish">
              <i data-lucide="download" style="width: 15px; height: 15px;"></i>
            </a>
          </div>
        `;
      } else {
        const ext = fileName.split('.').pop()?.toUpperCase() || 'FAYL';
        const sizeStr = file.size ? formatFileSize(file.size) : ext;
        itemsHtml += `
          <div class="msg-file-attachment">
            <div class="file-attachment-left">
              <div class="file-icon-badge generic">
                <i data-lucide="file-code" style="width: 18px; height: 18px;"></i>
              </div>
              <div class="file-attachment-info">
                <span class="file-attachment-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
                <span class="file-attachment-meta">${ext} · ${sizeStr}</span>
              </div>
            </div>
            <a href="${fileUrl}" download="${escapeHtml(fileName)}" class="file-download-btn" title="Yuklab olish">
              <i data-lucide="download" style="width: 15px; height: 15px;"></i>
            </a>
          </div>
        `;
      }
    });

    attachmentsHtml = `<div class="msg-attachments-container">${itemsHtml}</div>`;
  }

  if (msg.role === 'user') {
    row.innerHTML = `
      <div class="msg-bubble">
        ${attachmentsHtml}
        ${formattedContent}
      </div>
    `;
  } else {
    row.innerHTML = `
      <div class="msg-avatar ai">
        <i data-lucide="bot" style="width: 20px; height: 20px; color: #fff;"></i>
      </div>
      <div class="msg-bubble">
        ${attachmentsHtml}
        <div class="markdown-body">${formattedContent}</div>
      </div>
    `;
  }

  messagesInnerEl.appendChild(row);

  // Kod bloklariga sarlavha va nusxalash tugmasi qo'shish
  setupCodeBlocks(row);

  if (window.lucide) lucide.createIcons();
  scrollToBottom();
  return row;
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// AI xabarlarini Markdown, Tasvirlar va Eslatmalarni to'g'ri render qilish
function formatAssistantMessage(content) {
  if (!content) return '';
  let text = content;

  // 1. Agar image-card tokenlari bo'lsa, marked.parse ularni kodga aylantirib yubormasligi uchun vaqtincha xavfsiz token bilan saqlaymiz
  const imageCards = [];
  text = text.replace(/:::image-card\s*([\s\S]*?)\s*:::/g, (match, jsonStr) => {
    const placeholder = `__IMG_CARD_PH_${imageCards.length}__`;
    imageCards.push(jsonStr.trim());
    return `\n\n${placeholder}\n\n`;
  });

  // 2. Eslatmalarni (reminders) tayyorlash
  if (window.deviceReminder) {
    text = window.deviceReminder.parseReminders(text);
  }

  // 3. Markdown parse
  let html = marked.parse(text);

  // 4. image-card placeholderlarini toza HTML kartochkaga almashtirish
  imageCards.forEach((jsonStr, idx) => {
    let cardHtml = '';
    try {
      let cleanJson = jsonStr.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const data = JSON.parse(cleanJson);
      if (window.artGenerator) {
        cardHtml = window.artGenerator.renderImageCardHtml(data);
      }
    } catch (e) {
      console.warn('Image-card JSON parse xatosi:', e);
    }
    const ph = `__IMG_CARD_PH_${idx}__`;
    // Marked uni <p>__IMG_CARD_PH_0__</p> qilib qo'ygan bo'lishi mumkin
    html = html.replace(new RegExp(`<p>\\s*${ph}\\s*<\\/p>`, 'g'), cardHtml);
    html = html.replace(new RegExp(ph, 'g'), cardHtml);
  });

  // 5. Agar matnda to'g'ridan-to'g'ri :::image-card qolgan bo'lsa (masalan qisman streamingda)
  if (window.artGenerator) {
    html = window.artGenerator.parseImageCards(html);
  }

  return html;
}

// Kod bloklariga Nusxalash tugmalarini o'rnatish
function setupCodeBlocks(container) {
  // Agar tasodifan rasm HTML kartochkasi pre/code ichiga tushib qolgan bo'lsa, uni chiqarib haqiqiy rasmga aylantirish (Skrinshotdagi kabi holatlarni tuzatish)
  const codeBlocks = container.querySelectorAll('pre');
  codeBlocks.forEach(pre => {
    const rawText = pre.innerText || pre.textContent || '';
    if (rawText.includes('ai-image-showcase') || rawText.includes('ai-image-wrapper') || rawText.includes('/uploads/generated/')) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = rawText;
      if (tempDiv.querySelector('.ai-image-showcase') || tempDiv.querySelector('img')) {
        pre.replaceWith(tempDiv.firstElementChild || tempDiv);
        return;
      }
    }

    if (pre.querySelector('.code-header')) return; // agar allaqachon bo'lsa

    const code = pre.querySelector('code');
    let lang = 'kod';
    if (code) {
      const classes = code.className.split(' ');
      const langClass = classes.find(c => c.startsWith('language-'));
      if (langClass) lang = langClass.replace('language-', '');
    }

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span>${lang.toUpperCase()}</span>
      <button class="copy-code-btn">
        <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
        <span>Nusxalash</span>
      </button>
    `;

    const copyBtn = header.querySelector('.copy-code-btn');
    copyBtn.addEventListener('click', () => {
      const textToCopy = code ? code.innerText : pre.innerText;
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `
          <i data-lucide="check" style="width: 12px; height: 12px; color: #10b981;"></i>
          <span style="color: #10b981;">Nusxalandi!</span>
        `;
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
          copyBtn.innerHTML = `
            <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
            <span>Nusxalash</span>
          `;
          if (window.lucide) lucide.createIcons();
        }, 2000);
      });
    });

    pre.insertBefore(header, pre.firstChild);
  });
}

function scrollToBottom() {
  setTimeout(() => {
    messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
  }, 50);
}

function escapeHtml(string) {
  const entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(string).replace(/[&<>"']/g, s => entityMap[s]);
}

// 7. Xabar yuborish (Streaming)
async function sendMessage(customContent = null, customImage = null, customFiles = null) {
  const content = customContent !== null ? customContent : messageInputEl.value.trim();
  const image = customImage !== null ? customImage : null;
  const attachedFiles = customFiles !== null 
    ? customFiles 
    : (window.fileAttachmentManager ? window.fileAttachmentManager.getAttachments() : []);

  if (!content && !image && attachedFiles.length === 0) return;

  if (!window.appState.activeChatId) {
    await createNewChat();
  }

  const chatId = window.appState.activeChatId;

  // Foydalanuvchi xabarini ekranga chiqarish
  welcomeHeroEl.style.display = 'none';
  appendMessageToUI({
    role: 'user',
    content: content,
    image: image,
    files: attachedFiles.map(f => ({
      name: f.name,
      type: f.type,
      size: f.size,
      dataUrl: f.dataUrl,
      isImage: f.isImage,
      isPdf: f.isPdf
    }))
  });

  // Input va biriktirilgan fayllarni tozalash
  if (customContent === null) {
    messageInputEl.value = '';
    messageInputEl.style.height = 'auto';
  }
  if (window.fileAttachmentManager) {
    window.fileAttachmentManager.clear();
  }

  // AI javobi uchun konteyner yaratish
  const aiRow = document.createElement('div');
  aiRow.className = 'message-row assistant';
  aiRow.innerHTML = `
    <div class="msg-avatar ai">
      <i data-lucide="bot" style="width: 20px; height: 20px; color: #fff;"></i>
    </div>
    <div class="msg-bubble">
      <div class="markdown-body">
        <span class="typing-indicator" style="display: inline-block; animation: pulse 1s infinite;">Javob tayyorlanmoqda...</span>
      </div>
    </div>
  `;
  messagesInnerEl.appendChild(aiRow);
  if (window.lucide) lucide.createIcons();
  scrollToBottom();

  const markdownBody = aiRow.querySelector('.markdown-body');
  sendMessageBtn.disabled = true;

  try {
    const payloadFiles = attachedFiles.map(f => ({
      name: f.name,
      type: f.type,
      size: f.size,
      dataUrl: f.dataUrl,
      rawText: f.rawText || ''
    }));

    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content, image, files: payloadFiles })
    });

    if (!res.ok) {
      if (res.status === 403) {
        showBlockedModal();
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server xatosi: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    markdownBody.innerHTML = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.error) {
              markdownBody.innerHTML = `<div style="color: #f43f5e;">Xatolik: ${data.error}</div>`;
              break;
            }
            if (data.chunk) {
              accumulatedText += data.chunk;
              markdownBody.innerHTML = formatAssistantMessage(accumulatedText);
              setupCodeBlocks(aiRow);
              if (window.lucide) lucide.createIcons();
              scrollToBottom();
            }
            if (data.done) {
              // Tugallandi
            }
          } catch (e) {
            // JSON parse xatosi
          }
        }
      }
    }

    // Chatlar ro'yxatidagi sarlavha yangilanishi uchun
    loadChats();

  } catch (err) {
    console.error('Xabar yuborishda xatolik:', err);
    markdownBody.innerHTML = `<div style="color: #f43f5e; padding: 6px 0;">⚠️ ${err.message}</div>`;
  } finally {
    sendMessageBtn.disabled = false;
  }
}

// 8. Event Listenerlar
function setupEventListeners() {
  // Input autosize va Enter
  messageInputEl.addEventListener('input', () => {
    messageInputEl.style.height = 'auto';
    messageInputEl.style.height = Math.min(messageInputEl.scrollHeight, 180) + 'px';
  });

  messageInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendMessageBtn.addEventListener('click', () => {
    sendMessage();
  });

  newChatBtn.addEventListener('click', () => {
    createNewChat();
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar')?.classList.remove('mobile-open');
      document.getElementById('sidebarOverlay')?.classList.remove('active');
    }
  });

  // Tezkor prompt kartalari
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        messageInputEl.value = prompt;
        sendMessage();
      }
    });
  });

  // Sozlamalar modalini ochish / yopish
  const openSettings = () => {
    updateProfileUI();
    checkServerStatus();
    settingsModalEl.classList.add('active');
  };
  const closeSettings = () => {
    settingsModalEl.classList.remove('active');
  };

  openSettingsBtn?.addEventListener('click', openSettings);
  topSettingsBtn?.addEventListener('click', openSettings);
  closeSettingsModalBtn?.addEventListener('click', closeSettings);
  cancelSettingsBtn?.addEventListener('click', closeSettings);

  // Sozlamalarni saqlash
  saveSettingsBtn?.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem('personal_ai_key', key);
      window.appState.apiKey = key;
    } else {
      localStorage.removeItem('personal_ai_key');
      window.appState.apiKey = '';
    }

    const updatedProfile = {
      userName: userNameInput.value.trim() || 'Do‘stim',
      assistantName: assistantNameInput.value.trim() || 'zayniddin_ai',
      customRules: customRulesInput.value.trim()
    };

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedProfile)
      });
      if (res.ok) {
        window.appState.profile = await res.json().then(d => d.profile || updatedProfile);
        updateProfileUI();
        closeSettings();
      }
    } catch (err) {
      alert('Sozlamalarni saqlashda xatolik: ' + err.message);
    }
  });

  // ================= Foydalanuvchi Profili / Auth Modal Hodisalari =================
  const topUserBtn = document.getElementById('topUserBtn');
  const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
  const submitAuthBtn = document.getElementById('submitAuthBtn');
  const authModal = document.getElementById('authModal');
  const authNameInput = document.getElementById('authNameInput');
  const authSurnameInput = document.getElementById('authSurnameInput');

  topUserBtn?.addEventListener('click', () => openAuthModal(false));
  closeAuthModalBtn?.addEventListener('click', closeAuthModal);
  submitAuthBtn?.addEventListener('click', handleSaveAuth);

  authNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (authSurnameInput) authSurnameInput.focus();
      else handleSaveAuth();
    }
  });

  authSurnameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveAuth();
    }
  });

  authModal?.addEventListener('click', (e) => {
    if (e.target === authModal && window.appState.user) {
      closeAuthModal();
    }
  });

  // ================= Sidebar (Yon Panel) Boshqaruvi =================
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebarEl = document.getElementById('sidebar');
  const sidebarOverlayEl = document.getElementById('sidebarOverlay');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const quickVoiceInputBtn = document.getElementById('quickVoiceInputBtn');
  const topNewChatBtn = document.getElementById('topNewChatBtn');

  let lastToggleTime = 0;

  // Saqlangan desktop holatini tiklash
  if (window.innerWidth > 768 && localStorage.getItem('sidebar_desktop_collapsed') === 'true') {
    sidebarEl?.classList.add('collapsed');
  }

  // Click va Touch hodisalari
  mobileMenuBtn?.addEventListener('click', (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (e) e.stopPropagation();
    window.toggleAppSidebar();
  });

  const handleCloseSidebar = (e) => {
    if (e && e.cancelable) e.preventDefault();
    if (e) e.stopPropagation();
    window.closeAppSidebar();
  };

  toggleSidebarBtn?.addEventListener('click', handleCloseSidebar);
  toggleSidebarBtn?.addEventListener('touchend', handleCloseSidebar);
  sidebarOverlayEl?.addEventListener('click', handleCloseSidebar);
  sidebarOverlayEl?.addEventListener('touchend', handleCloseSidebar);

  // Top navdagi to'g'ridan-to'g'ri Yangi Suhbat tugmasi
  topNewChatBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    createNewChat();
  });

  // Mobilda barmoq bilan chapga surib yopish (Swipe to Close)
  let touchStartX = 0;
  let touchStartY = 0;

  sidebarEl?.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  sidebarEl?.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchStartX - touchEndX;
    const diffY = Math.abs(touchStartY - touchEndY);

    // Gorizontal chapga surish > 45px bo'lsa
    if (diffX > 45 && diffY < 90) {
      window.closeAppSidebar();
    }
  }, { passive: true });

  // Pastki input baridagi tezkor mikrofon (Voice Modalni ochadi)
  quickVoiceInputBtn?.addEventListener('click', () => {
    if (window.voiceOrb) {
      window.voiceOrb.openModal();
    }
  });

  // Ekran tahlilidan xabar qabul qilish hodisasi
  window.addEventListener('send-screen-message', (e) => {
    const { content, image } = e.detail;
    sendMessage(content, image);
  });

  // Ovozli rejim orqali chatni yangilash hodisasi
  window.addEventListener('refresh-chats', () => {
    loadChats();
  });
  window.addEventListener('refresh-active-chat', () => {
    if (window.appState.activeChatId) {
      selectChat(window.appState.activeChatId);
    }
  });
}

// PWA O'rnatishni boshqarish (Android & Desktop)
let deferredInstallPrompt = null;

function setupPWAInstall() {
  const pwaInstallBanner = document.getElementById('pwaInstallBanner');
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');
  const pwaDismissBtn = document.getElementById('pwaDismissBtn');
  const sidebarInstallBtn = document.getElementById('sidebarInstallBtn');

  // Service Worker ro'yxatdan o'tkazish
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('PWA Service Worker ro‘yxatdan o‘tdi:', reg.scope))
      .catch((err) => console.warn('Service Worker ogohlantirishi:', err));
  }

  // Standalone rejimda tekshirish (o'rnatilgan bo'lsa bannerni ko'rsatmaymiz)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) {
    console.log('zayniddin_ai standalone ilova rejimida ishlamoqda');
    return;
  }

  // Android va Chromium brauzerlarida o'rnatish hodisasi
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    if (sidebarInstallBtn) sidebarInstallBtn.style.display = 'flex';

    // Agar oldin yopilmagan bo'lsa, avtomatik bannerni chiqarish
    const dismissed = sessionStorage.getItem('pwa_dismissed');
    if (!dismissed && pwaInstallBanner) {
      setTimeout(() => {
        pwaInstallBanner.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
      }, 1500);
    }
  });

  const triggerInstall = async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log('O‘rnatish tanlovi:', outcome);
      deferredInstallPrompt = null;
      if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
      if (sidebarInstallBtn) sidebarInstallBtn.style.display = 'none';
    } else {
      alert("Ilovani o'rnatish uchun brauzer menyusidagi (3 nuqta) 'Bosh ekranga qo'shish' (Add to Home Screen) tugmasini bosing.");
    }
  };

  pwaInstallBtn?.addEventListener('click', triggerInstall);
  sidebarInstallBtn?.addEventListener('click', triggerInstall);

  pwaDismissBtn?.addEventListener('click', () => {
    if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
    sessionStorage.setItem('pwa_dismissed', 'true');
  });

  window.addEventListener('appinstalled', () => {
    console.log('zayniddin_ai telefonga muvaffaqiyatli o‘rnatildi!');
    if (pwaInstallBanner) pwaInstallBanner.style.display = 'none';
    if (sidebarInstallBtn) sidebarInstallBtn.style.display = 'none';
    deferredInstallPrompt = null;
  });
}

// Dasturni initsializatsiya qilish
async function initApp() {
  // 1. Voqea tinglovchilari (Event Listenerlar) va piktogrammalarni birinchi bo'lib DARHOL yoqish
  setupEventListeners();
  if (window.lucide) lucide.createIcons();
  setupPWAInstall();
  initUserSession();

  // 2. Serverdan ma'lumotlarni asinxron yuklash (UI qotib qolmasligi uchun)
  try {
    checkServerStatus();
    loadProfile();
    await loadChats();
  } catch (err) {
    console.warn('Init yuklashda ogohlantirish:', err);
  }
}

document.addEventListener('DOMContentLoaded', initApp);
