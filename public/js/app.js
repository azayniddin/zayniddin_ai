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
  return headers;
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
    let rawContent = msg.content || '';
    if (window.deviceReminder) {
      rawContent = window.deviceReminder.parseReminders(rawContent);
    }
    if (window.artGenerator) {
      rawContent = window.artGenerator.parseImageCards(rawContent);
    }
    formattedContent = marked.parse(rawContent);
  } else {
    // Xavfsiz user matni
    formattedContent = `<p>${escapeHtml(msg.content || '')}</p>`;
  }

  let imageHtml = '';
  if (msg.image) {
    imageHtml = `<img src="${msg.image}" class="msg-bubble-image" alt="Ekran tasviri">`;
  }

  if (msg.role === 'user') {
    row.innerHTML = `
      <div class="msg-bubble">
        ${imageHtml}
        ${formattedContent}
      </div>
    `;
  } else {
    row.innerHTML = `
      <div class="msg-avatar ai">
        <i data-lucide="bot" style="width: 20px; height: 20px; color: #fff;"></i>
      </div>
      <div class="msg-bubble">
        ${imageHtml}
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

// Kod bloklariga Nusxalash tugmalarini o'rnatish
function setupCodeBlocks(container) {
  const codeBlocks = container.querySelectorAll('pre');
  codeBlocks.forEach(pre => {
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
async function sendMessage(customContent = null, customImage = null) {
  const content = customContent !== null ? customContent : messageInputEl.value.trim();
  const image = customImage !== null ? customImage : window.screenVision?.currentSnapshot;

  if (!content && !image) return;

  if (!window.appState.activeChatId) {
    await createNewChat();
  }

  const chatId = window.appState.activeChatId;

  // Foydalanuvchi xabarini ekranga chiqarish
  welcomeHeroEl.style.display = 'none';
  appendMessageToUI({
    role: 'user',
    content: content,
    image: image
  });

  // Inputni tozalash
  if (customContent === null) {
    messageInputEl.value = '';
    messageInputEl.style.height = 'auto';
  }
  if (customImage === null && window.screenVision) {
    window.screenVision.clearAttachedSnapshot();
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
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content, image })
    });

    if (!res.ok) {
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
              let contentToRender = accumulatedText;
              if (window.deviceReminder) {
                contentToRender = window.deviceReminder.parseReminders(contentToRender);
              }
              if (window.artGenerator) {
                contentToRender = window.artGenerator.parseImageCards(contentToRender);
              }
              markdownBody.innerHTML = marked.parse(contentToRender);
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
