/**
 * Telegram Admin Bot Moduli
 * zayniddin_ai — Admin Nazorati va Foydalanuvchilar Boshqaruvi
 */

import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8724067443:AAGIkaR5_niOO3hFq2jMPm5ByfppZ9MAReE';
const ADMIN_ID = String(process.env.TELEGRAM_ADMIN_ID || '5744542264');
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

let isPolling = false;
let lastUpdateId = 0;
let dbHandlers = null; // { getUsers, saveUsers, getChats }

/**
 * Telegram API so'rov yuborish yordamchisi
 */
async function callTelegram(method, payload = {}) {
  try {
    const res = await fetch(`${API_URL}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`Telegram API xatoligi (${method}):`, err.message);
    return { ok: false, description: err.message };
  }
}

/**
 * Xabar yuborish
 */
export async function sendAdminMessage(text, replyMarkup = null) {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  const payload = {
    chat_id: ADMIN_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  return await callTelegram('sendMessage', payload);
}

/**
 * Rasm yuborish
 */
export async function sendAdminPhoto(photoUrl, caption = '') {
  if (!BOT_TOKEN || !ADMIN_ID) return;
  return await callTelegram('sendPhoto', {
    chat_id: ADMIN_ID,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML'
  });
}

/**
 * Yangi foydalanuvchi kirganda bildirishnoma
 */
export async function notifyAdminNewUser(user) {
  const text = `🎉 <b>Yangi foydalanuvchi ro'yxatdan o'tdi!</b>\n\n` +
    `👤 <b>Ism-familiya:</b> ${escapeHtml(user.name)} ${escapeHtml(user.surname || '')}\n` +
    `🆔 <b>ID:</b> <code>${user.id}</code>\n` +
    `📧 <b>Email:</b> ${user.email ? escapeHtml(user.email) : 'Mavjud emas'}\n` +
    `🎨 <b>Rasm limiti:</b> ${user.imageLimit || 5} ta\n` +
    `⏰ <b>Vaqt:</b> ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '👤 Profilni ko‘rish', callback_data: `user_${user.id}` },
        { text: '💬 Suhbatlari', callback_data: `chats_${user.id}` }
      ]
    ]
  };

  await sendAdminMessage(text, inlineKeyboard);
}

/**
 * Rasm chizdirganda bildirishnoma
 */
export async function notifyAdminImageGenerated(user, prompt, imageUrl, model = 'FLUX.1') {
  const text = `🎨 <b>Foydalanuvchi rasm chizdirdi!</b>\n\n` +
    `👤 <b>Foydalanuvchi:</b> ${escapeHtml(user.name)} (${user.imageCount}/${user.imageLimit || 5} ta ishlatildi)\n` +
    `🤖 <b>Model:</b> ${model}\n` +
    `📝 <b>Prompt:</b> <i>"${escapeHtml(prompt)}"</i>\n` +
    `⏰ <b>Vaqt:</b> ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '🎨 +5 Limit qo‘shish', callback_data: `limit_${user.id}_add5` },
        { text: '🚫 Bloklash', callback_data: `block_${user.id}` }
      ]
    ]
  };

  if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
    await sendAdminPhoto(imageUrl, text);
  } else {
    await sendAdminMessage(text, inlineKeyboard);
  }
}

/**
 * Asosiy klaviatura
 */
function getMainKeyboard() {
  return {
    keyboard: [
      [{ text: '📊 Statistika' }, { text: '👥 Foydalanuvchilar' }],
      [{ text: '🎨 Rasm Nazorati' }, { text: '💬 So‘nggi Suhbatlar' }],
      [{ text: '⚙️ Yordam va Buyruqlar' }]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

/**
 * Xabarlarni qabul qilish va buyruqlarga javob berish
 */
async function handleAdminMessage(message) {
  const chatId = String(message.chat.id);
  const text = (message.text || '').trim();

  // Begona odamlarga kirish yopiq
  if (chatId !== ADMIN_ID) {
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '⛔ <b>Kirish taqiqlangan!</b>\nUshbu bot faqat zayniddin_ai platformasi ma\'muri (Admin) uchun xizmat qiladi.',
      parse_mode: 'HTML'
    });
    return;
  }

  if (text === '/start' || text === '/menu') {
    const welcome = `👋 <b>Assalomu alaykum, Hurmatli Admin!</b>\n\n` +
      `Siz <b>zayniddin_ai</b> boshqaruv panelidasiz.\n` +
      `Bu yerda sayt foydalanuvchilarini to'liq nazorat qilishingiz, kim nima qilayotganini ko'rishingiz, rasm limitlarini o'zgartirishingiz va bloklashingiz mumkin.\n\n` +
      `Quyidagi tugmalardan birini tanlang:`;
    await sendAdminMessage(welcome, getMainKeyboard());
    return;
  }

  if (text === '📊 Statistika' || text === '/stats') {
    await showStats();
    return;
  }

  if (text === '👥 Foydalanuvchilar' || text === '/users') {
    await showUsersList();
    return;
  }

  if (text === '🎨 Rasm Nazorati' || text === '/images') {
    await showImagesControl();
    return;
  }

  if (text === '💬 So‘nggi Suhbatlar' || text === '/chats') {
    await showRecentChats();
    return;
  }

  if (text === '⚙️ Yordam va Buyruqlar' || text === '/help') {
    const help = `🛠 <b>Admin Buyruqlari:</b>\n\n` +
      `• /stats - Umumiy statistika\n` +
      `• /users - Barcha foydalanuvchilar\n` +
      `• /block &lt;user_id&gt; - Foydalanuvchini bloklash\n` +
      `• /unblock &lt;user_id&gt; - Blokdan ochish\n` +
      `• /limit &lt;user_id&gt; &lt;soni&gt; - Rasm limiti belgilash\n` +
      `• /chats &lt;user_id&gt; - Foydalanuvchi yozishmalarini ko'rish\n\n` +
      `<i>Har bir foydalanuvchi kartochkasida qulay inline tugmalar mavjud!</i>`;
    await sendAdminMessage(help, getMainKeyboard());
    return;
  }

  // /block <user_id>
  if (text.startsWith('/block ')) {
    const userId = text.split(' ')[1]?.trim();
    if (userId) await toggleBlockUser(userId, true);
    return;
  }

  // /unblock <user_id>
  if (text.startsWith('/unblock ')) {
    const userId = text.split(' ')[1]?.trim();
    if (userId) await toggleBlockUser(userId, false);
    return;
  }

  // /limit <user_id> <soni>
  if (text.startsWith('/limit ')) {
    const parts = text.split(' ');
    const userId = parts[1]?.trim();
    const limit = parseInt(parts[2], 10);
    if (userId && !isNaN(limit)) {
      await setUserLimit(userId, limit);
    } else {
      await sendAdminMessage('⚠️ Format xato. Misol: <code>/limit user_123 10</code>');
    }
    return;
  }

  // Boshqa har qanday matn uchun menyu
  await sendAdminMessage('Buyruqni tushunmadim. Marhamat, quyidagi tugmalardan foydalaning:', getMainKeyboard());
}

/**
 * Statistika ko'rsatish
 */
async function showStats() {
  if (!dbHandlers) return;
  const users = await dbHandlers.getUsers();
  const chats = await dbHandlers.getChats();

  const totalUsers = users.length;
  const blockedUsers = users.filter(u => u.isBlocked).length;
  const activeUsers = totalUsers - blockedUsers;
  const totalImages = users.reduce((acc, u) => acc + (u.imageCount || 0), 0);
  const totalChats = chats.length;

  const now = Date.now();
  const activeToday = users.filter(u => u.lastActive && (now - new Date(u.lastActive).getTime() < 24 * 60 * 60 * 1000)).length;

  const text = `📊 <b>Platforma Statistikasi:</b>\n\n` +
    `👥 <b>Jami foydalanuvchilar:</b> ${totalUsers} ta\n` +
    `⚡ <b>Bugun faol bo'lganlar:</b> ${activeToday} ta\n` +
    `✅ <b>Faol holatdagi:</b> ${activeUsers} ta\n` +
    `🚫 <b>Bloklangan:</b> ${blockedUsers} ta\n\n` +
    `🎨 <b>Jami chizilgan rasmlar:</b> ${totalImages} ta\n` +
    `💬 <b>Jami suhbatlar soni:</b> ${totalChats} ta\n` +
    `🕒 <b>Vaqt:</b> ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`;

  await sendAdminMessage(text);
}

/**
 * Foydalanuvchilar ro'yxati
 */
async function showUsersList() {
  if (!dbHandlers) return;
  const users = await dbHandlers.getUsers();

  if (users.length === 0) {
    await sendAdminMessage('👥 Hozircha saytda ro\'yxatdan o\'tgan foydalanuvchilar yo\'q.');
    return;
  }

  for (const user of users.slice(-10)) { // Oxirgi 10 ta foydalanuvchi
    await sendUserCard(user);
  }
}

/**
 * Bitta foydalanuvchi kartochkasi
 */
async function sendUserCard(user) {
  const statusEmoji = user.isBlocked ? '🚫 Bloklangan' : '✅ Faol';
  const lastActiveStr = user.lastActive ? new Date(user.lastActive).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) : 'Noma\'lum';
  const registeredStr = user.registeredAt ? new Date(user.registeredAt).toLocaleDateString('uz-UZ') : 'Noma\'lum';

  const text = `👤 <b>${escapeHtml(user.name)} ${escapeHtml(user.surname || '')}</b>\n` +
    `🆔 <code>${user.id}</code>\n` +
    `📧 ${user.email ? escapeHtml(user.email) : 'Email yo‘q'}\n` +
    `Holat: <b>${statusEmoji}</b>\n` +
    `🎨 Rasmlar: <b>${user.imageCount || 0} / ${user.imageLimit || 5} ta</b>\n` +
    `🕒 Oxirgi faollik: ${lastActiveStr}\n` +
    `📅 Ro'yxatdan o'tgan: ${registeredStr}`;

  const blockBtnText = user.isBlocked ? '✅ Blokdan ochish' : '🚫 Bloklash';
  const blockAction = user.isBlocked ? `unblock_${user.id}` : `block_${user.id}`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: blockBtnText, callback_data: blockAction },
        { text: '💬 Suhbatlar', callback_data: `chats_${user.id}` }
      ],
      [
        { text: '🎨 +5 Limit', callback_data: `limit_${user.id}_add5` },
        { text: '🎨 +10 Limit', callback_data: `limit_${user.id}_add10` },
        { text: '♾️ Cheksiz', callback_data: `limit_${user.id}_inf` }
      ]
    ]
  };

  await sendAdminMessage(text, inlineKeyboard);
}

/**
 * Rasm chizish nazorati
 */
async function showImagesControl() {
  if (!dbHandlers) return;
  const users = await dbHandlers.getUsers();
  const activeImageUsers = users.filter(u => (u.imageCount || 0) > 0).sort((a, b) => (b.imageCount || 0) - (a.imageCount || 0));

  if (activeImageUsers.length === 0) {
    await sendAdminMessage('🎨 Hozircha hech qaysi foydalanuvchi rasm chizdirmagan.');
    return;
  }

  let text = `🎨 <b>Rasm chizdirgan eng faol foydalanuvchilar:</b>\n\n`;
  activeImageUsers.slice(0, 10).forEach((u, i) => {
    text += `${i + 1}. <b>${escapeHtml(u.name)}</b>: ${u.imageCount} / ${u.imageLimit || 5} ta (ID: <code>${u.id}</code>)\n`;
  });

  await sendAdminMessage(text);
}

/**
 * So'nggi suhbatlarni ko'rsatish
 */
async function showRecentChats() {
  if (!dbHandlers) return;
  const chats = await dbHandlers.getChats();

  if (chats.length === 0) {
    await sendAdminMessage('💬 Hozircha hech qanday suhbat mavjud emas.');
    return;
  }

  let text = `💬 <b>Eng so‘nggi 5 ta faol suhbat:</b>\n\n`;
  const recentChats = [...chats].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)).slice(0, 5);

  recentChats.forEach((c, idx) => {
    const msgCount = c.messages ? c.messages.length : 0;
    const lastMsg = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1].content.slice(0, 60) : 'Xabar yo\'q';
    text += `${idx + 1}. <b>${escapeHtml(c.title || 'Yangi suhbat')}</b> (${msgCount} xabar)\n` +
      `   <i>Oxirgi: "${escapeHtml(lastMsg)}..."</i>\n\n`;
  });

  await sendAdminMessage(text);
}

/**
 * Bloklash / Blokdan ochish
 */
async function toggleBlockUser(userId, blockStatus) {
  if (!dbHandlers) return;
  const users = await dbHandlers.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    await sendAdminMessage(`⚠️ Foydalanuvchi topilmadi (ID: <code>${userId}</code>)`);
    return;
  }

  user.isBlocked = blockStatus;
  await dbHandlers.saveUsers(users);

  const statusText = blockStatus ? '🚫 <b>BLOKLANDI!</b> Endi saytda xabar yoza olmaydi.' : '✅ <b>BLOKDAN OCHILDI!</b> Endi platformadan foydalanishi mumkin.';
  await sendAdminMessage(`👤 <b>${escapeHtml(user.name)}</b> ${statusText}`);
}

/**
 * Limit belgilash
 */
async function setUserLimit(userId, newLimit) {
  if (!dbHandlers) return;
  const users = await dbHandlers.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    await sendAdminMessage(`⚠️ Foydalanuvchi topilmadi (ID: <code>${userId}</code>)`);
    return;
  }

  user.imageLimit = newLimit;
  await dbHandlers.saveUsers(users);

  await sendAdminMessage(`🎨 <b>${escapeHtml(user.name)}</b> uchun rasm chizish limiti <b>${newLimit === 99999 ? '♾️ Cheksiz' : newLimit + ' ta'}</b> qilib belgilandi!`);
}

/**
 * Foydalanuvchining chatlarini ko'rsatish
 */
async function showUserChats(userId) {
  if (!dbHandlers) return;
  const users = await dbHandlers.getUsers();
  const user = users.find(u => u.id === userId);
  const chats = await dbHandlers.getChats();

  const userChats = chats.filter(c => c.userId === userId || (!c.userId && chats.indexOf(c) === 0));

  if (userChats.length === 0) {
    await sendAdminMessage(`💬 <b>${escapeHtml(user?.name || 'Foydalanuvchi')}</b> hali hech qanday suhbat yaratmagan.`);
    return;
  }

  let text = `💬 <b>${escapeHtml(user?.name || 'Foydalanuvchi')}</b> suhbatlari:\n\n`;
  userChats.slice(0, 5).forEach((c, idx) => {
    text += `<b>${idx + 1}. ${escapeHtml(c.title || 'Suhbat')}</b> (${c.messages?.length || 0} ta xabar):\n`;
    if (c.messages && c.messages.length > 0) {
      const recent = c.messages.slice(-3);
      recent.forEach(m => {
        const prefix = m.role === 'user' ? '👤' : '🤖';
        const msgText = (m.content || '').replace(/:::[\s\S]*?:::/g, '').slice(0, 100);
        text += `${prefix} <i>${escapeHtml(msgText)}</i>\n`;
      });
    }
    text += `\n`;
  });

  await sendAdminMessage(text);
}

/**
 * Inline tugmalar callback handler
 */
async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  const chatId = callbackQuery.message.chat.id;

  // Callbackni yopish (soat belgisi to'xtashi uchun)
  await callTelegram('answerCallbackQuery', {
    callback_query_id: callbackQuery.id
  });

  if (data.startsWith('block_')) {
    const userId = data.replace('block_', '');
    await toggleBlockUser(userId, true);
  } else if (data.startsWith('unblock_')) {
    const userId = data.replace('unblock_', '');
    await toggleBlockUser(userId, false);
  } else if (data.startsWith('limit_')) {
    const parts = data.split('_');
    const userId = parts[1];
    const action = parts[2];
    const users = await dbHandlers.getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      if (action === 'add5') {
        user.imageLimit = (user.imageLimit || 5) + 5;
      } else if (action === 'add10') {
        user.imageLimit = (user.imageLimit || 5) + 10;
      } else if (action === 'inf') {
        user.imageLimit = 99999;
      }
      await dbHandlers.saveUsers(users);
      await sendAdminMessage(`🎨 <b>${escapeHtml(user.name)}</b> ning yangi limiti: <b>${user.imageLimit >= 99999 ? '♾️ Cheksiz' : user.imageLimit + ' ta'}</b>`);
    }
  } else if (data.startsWith('chats_')) {
    const userId = data.replace('chats_', '');
    await showUserChats(userId);
  } else if (data.startsWith('user_')) {
    const userId = data.replace('user_', '');
    const users = await dbHandlers.getUsers();
    const user = users.find(u => u.id === userId);
    if (user) await sendUserCard(user);
  }
}

/**
 * Long-polling orqali yangiliklarni olish
 */
async function pollUpdates() {
  if (!BOT_TOKEN) return;

  while (isPolling) {
    try {
      const res = await fetch(`${API_URL}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`, {
        method: 'GET'
      });
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          if (update.message) {
            await handleAdminMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      // Tarmoq uzilishi bo'lsa 3 soniya kutib qayta ulanadi
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

/**
 * Botni ishga tushirish
 */
export function startTelegramBot(handlers) {
  if (!BOT_TOKEN) {
    console.log('⚠️ TELEGRAM_BOT_TOKEN topilmadi, bot ishga tushmadi.');
    return;
  }
  dbHandlers = handlers;
  isPolling = true;
  console.log(`🤖 Telegram Admin Bot ishga tushirildi (Admin: ${ADMIN_ID})`);
  
  // Start xabari adminga
  sendAdminMessage(
    `🚀 <b>zayniddin_ai tizimi serverda ishga tushdi!</b>\n` +
    `Boshqaruv menyusini ochish uchun /start ni bosing.`,
    getMainKeyboard()
  ).catch(() => {});

  pollUpdates().catch(err => {
    console.warn('Bot polling xatoligi:', err.message);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
