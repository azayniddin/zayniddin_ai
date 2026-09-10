import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Ma'lumotlar papkasi
const DATA_DIR = path.join(__dirname, 'data');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Fayllardan o'qish / yozish yordamchi funksiyalari
async function getChatsData() {
  try {
    if (!existsSync(CHATS_FILE)) {
      await fs.writeFile(CHATS_FILE, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const data = await fs.readFile(CHATS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Chats faylini o‘qishda xatolik:', err);
    return [];
  }
}

async function saveChatsData(chats) {
  await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf8');
}

async function getProfileData() {
  const defaultProfile = {
    userName: process.env.USER_NAME || 'Do‘stim',
    assistantName: 'zayniddin_ai',
    language: 'uz',
    codingExperience: 'Fullstack / Muhandis',
    bio: 'Men o‘z oldiga ulkan maqsadlar qo‘ygan dasturchi va yaratuvchiman.',
    customRules: 'Menga tushuntirayotganda qisqa, tushunarli, hayotiy misollar va toza kod bilan javob ber. Hech qachon chala qoldirma.'
  };
  try {
    if (!existsSync(PROFILE_FILE)) {
      await fs.writeFile(PROFILE_FILE, JSON.stringify(defaultProfile, null, 2), 'utf8');
      return defaultProfile;
    }
    const data = await fs.readFile(PROFILE_FILE, 'utf8');
    return JSON.parse(data || JSON.stringify(defaultProfile));
  } catch (err) {
    console.error('Profile faylini o‘qishda xatolik:', err);
    return defaultProfile;
  }
}

async function saveProfileData(profile) {
  await fs.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf8');
}

// OpenAI mijozini olish (Server ENV yoki Request Header orqali)
function getOpenAIClient(req) {
  const clientKey = req.headers['x-api-key'] || process.env.OPENAI_API_KEY;
  if (!clientKey) {
    return null;
  }
  return new OpenAI({ apiKey: clientKey });
}

// Shaxsiy Tizim Promtini shakllantirish
async function buildSystemPrompt() {
  const profile = await getProfileData();
  const now = new Date();
  const uzbekDate = now.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const uzbekTime = now.toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });
  const isoDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }); // YYYY-MM-DD

  return `Sen foydalanuvchining (${profile.userName}) eng ishonchli, shaxsiy va yuqori intellektga ega AI yordamchisisan. Isming: ${profile.assistantName}.
Oddiy, sovuq chatbotlardan farqli o'laroq, sen faqatgina ${profile.userName} uchun xizmat qilasan va uning eng yaqin maslahatdoshi, Senior dasturchi mentori, muammolarni aniq yechuvchi va hayotiy tayanchisan.

ASOSIY QOIDALAR VA FAZILATLARING:
1. Til va Muomala:
   - Javoblaringni ravon, toza, zamonaviy va samimiy o'zbek tilida ber.
   - Foydalanuvchiga samimiy hurmat va do'stona kayfiyatda murojaat qil.
   - O'zbek tili bilan birga IT terminlarini o'z o'rnida, to'g'ri ishlating (masalan: frontend, backend, state, asynchronous va h.k.).
2. Dasturlash va Muhandislik bo'yicha Maslahatlar:
   - Har doim eng yaxshi amaliyotlar (Best Practices), toza arxitektura, xavfsizlik va optimal tezlikka e'tibor ber.
   - Kod yozganda hech qachon chala yoki "..." bilan qoldirma, to'liq ishlaydigan kod ber.
   - Xatoliklarni (bug) sababini chuqur tushuntir va hayotiy/tushunarli analogiyalar bilan o'rgat.
3. Ekran Ko'rish (Screen Vision):
   - Foydalanuvchi senga ekran rasmini (screenshot) yuborganida, ekrandagi har bir tafsilotni (kodlar, terminaldagi qizil xatolar, brauzerdagi dizayn yoki konsol xabarlarini) sinchkovlik bilan tahlil qil va darhol xatoni tuzatish yo'lini ko'rsat.
4. Telefon Ilovalari (Eslatma, Budilnik, Taqvim Integratsiyasi):
   - Hozirgi aniq vaqt: ${uzbekDate}, soat ${uzbekTime} (O'zbekiston, Toshkent vaqti). Bugungi sana: ${isoDate}.
   - Agar foydalanuvchi vaqt bilan bog'liq eslatma qo'yishni, budilnik o'rnatishni yoki taqvimga reja kiritishni so'rasa (masalan: "soat 15:00 ga eslatma qo'y", "ertaga 10:00 da uchrashuv bor", "budilnik qo'y", "darsni eslatib qo'y"):
     Javobingizda chiroyli tasdiqlang va xabar oxirida quyidagi maxsus JSON blokini qo'shing:
\`\`\`reminder
{
  "title": "Eslatma mavzusi (qisqa va aniq)",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "type": "alarm" | "calendar" | "reminder",
  "details": "Qisqacha izoh"
}
\`\`\`
   - Ushbu blok orqali dastur avtomatik ravishda foydalanuvchining telefoniga (Android Soat / Budilnik ilovasi, Google / Apple Taqvim yoki Push bildirishnoma) 1 ta tugma bilan ulanish interfeysini chiqaradi!
5. Foydalanuvchi Profili:
   - Ismi: ${profile.userName}
   - Kasbi/Tajribasi: ${profile.codingExperience}
   - Maxsus istaklari: ${profile.customRules}

Doimo qotmasdan, aniq, mantiqiy va maksimal darajada foydali javob ber!`;
}

// ================= API ROUTES =================

// Health check (Railway va cloud platformalar monitoringi uchun)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Status tekshiruvi
app.get('/api/status', (req, res) => {
  const hasServerKey = Boolean(process.env.OPENAI_API_KEY);
  res.json({
    status: 'online',
    hasServerKey,
    defaultModel: 'gpt-4o',
    timestamp: new Date().toISOString()
  });
});

// Profilni olish va yangilash
app.get('/api/profile', async (req, res) => {
  const profile = await getProfileData();
  res.json(profile);
});

app.post('/api/profile', async (req, res) => {
  try {
    const updated = req.body;
    await saveProfileData(updated);
    res.json({ success: true, profile: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Barcha chatlar ro'yxati
app.get('/api/chats', async (req, res) => {
  try {
    const chats = await getChatsData();
    // Xabarlar tanasini qisqartirib, faqat metadata qaytaramiz
    const summaries = chats.map(c => ({
      id: c.id,
      title: c.title || 'Yangi suhbat',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages ? c.messages.length : 0
    })).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Yangi chat ochish
app.post('/api/chats', async (req, res) => {
  try {
    const chats = await getChatsData();
    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: req.body.title || 'Yangi suhbat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };
    chats.unshift(newChat);
    await saveChatsData(chats);
    res.status(201).json(newChat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Muayyan chatni olish
app.get('/api/chats/:id', async (req, res) => {
  try {
    const chats = await getChatsData();
    const chat = chats.find(c => c.id === req.params.id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat topilmadi' });
    }
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chatni o'chirish
app.delete('/api/chats/:id', async (req, res) => {
  try {
    let chats = await getChatsData();
    const prevLen = chats.length;
    chats = chats.filter(c => c.id !== req.params.id);
    if (chats.length === prevLen) {
      return res.status(404).json({ error: 'Chat topilmadi' });
    }
    await saveChatsData(chats);
    res.json({ success: true, message: 'Chat muvaffaqiyatli o‘chirildi' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chatga xabar yuborish (Server-Sent Events - Streaming javob)
app.post('/api/chats/:id/messages', async (req, res) => {
  const openai = getOpenAIClient(req);
  if (!openai) {
    return res.status(401).json({
      error: 'OpenAI API kaliti topilmadi! Iltimos, sozlamalarda o‘z API kalitingizni kiriting yoki server .env fayliga joylashtiring.'
    });
  }

  const { id } = req.params;
  const { content, image } = req.body;

  if (!content && !image) {
    return res.status(400).json({ error: 'Xabar matni yoki rasm talab qilinadi' });
  }

  const chats = await getChatsData();
  const chatIndex = chats.findIndex(c => c.id === id);
  if (chatIndex === -1) {
    return res.status(404).json({ error: 'Chat topilmadi' });
  }

  const chat = chats[chatIndex];

  // Foydalanuvchi xabari
  const userMsgObj = {
    id: 'msg_' + Date.now(),
    role: 'user',
    content: content || '',
    image: image || null,
    timestamp: new Date().toISOString()
  };

  chat.messages.push(userMsgObj);

  // Agar bu birinchi xabar bo'lsa, chat nomini sarlavha qilib o'zgartirish
  if (chat.messages.length === 1 && content) {
    chat.title = content.slice(0, 32).trim() + (content.length > 32 ? '...' : '');
  }
  chat.updatedAt = new Date().toISOString();

  // SSE ulanishini tayyorlash
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const systemPrompt = await buildSystemPrompt();

    // OpenAI formatiga moslashtirish (oxirgi 15 ta xabarni kontekst uchun olamiz)
    const recentMessages = chat.messages.slice(-15).map(m => {
      if (m.role === 'user' && m.image) {
        return {
          role: 'user',
          content: [
            { type: 'text', text: m.content || 'Ushbu ekranga qarang va tahlil qiling:' },
            { type: 'image_url', image_url: { url: m.image, detail: 'high' } }
          ]
        };
      }
      return {
        role: m.role,
        content: m.content
      };
    });

    const messagesToSend = [
      { role: 'system', content: systemPrompt },
      ...recentMessages
    ];

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messagesToSend,
      stream: true,
      temperature: 0.7,
      max_tokens: 3500
    });

    let fullAssistantResponse = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullAssistantResponse += delta;
        res.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
      }
    }

    // Yordamchi xabarini bazada saqlash
    const assistantMsgObj = {
      id: 'msg_' + Date.now() + '_ai',
      role: 'assistant',
      content: fullAssistantResponse,
      timestamp: new Date().toISOString()
    };
    chat.messages.push(assistantMsgObj);
    chat.updatedAt = new Date().toISOString();
    await saveChatsData(chats);

    res.write(`data: ${JSON.stringify({ done: true, messageId: assistantMsgObj.id })}\n\n`);
    res.end();
  } catch (err) {
    console.error('OpenAI Stream Xatosi:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'AI javob berishda xatolik yuz berdi' })}\n\n`);
    res.end();
  }
});

// Ekran tahlili (Screen Vision AI) to'g'ridan-to'g'ri tahlil API
app.post('/api/screen-analyze', async (req, res) => {
  const openai = getOpenAIClient(req);
  if (!openai) {
    return res.status(401).json({
      error: 'OpenAI API kaliti kiritilmagan!'
    });
  }

  const { image, prompt, chatId } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Ekran tasviri topilmadi' });
  }

  try {
    const systemPrompt = await buildSystemPrompt();
    const userPromptText = prompt || 'Ushbu ekranga qarang. Ekranda qanday kod yoki muammo ko‘rinmoqda? Nima xato va uni qanday to‘g‘rilash mumkin? Aniq va qadamma-qadam tushuntirib bering.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPromptText },
            { type: 'image_url', image_url: { url: image, detail: 'high' } }
          ]
        }
      ],
      max_tokens: 2000
    });

    const reply = response.choices[0]?.message?.content || 'Tahlil yakunlandi, ammo javob olinmadi.';

    // Agar chat ID berilgan bo'lsa, chat tarixiga ham saqlaymiz
    if (chatId) {
      const chats = await getChatsData();
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        chat.messages.push({
          id: 'msg_' + Date.now(),
          role: 'user',
          content: userPromptText,
          image: image,
          timestamp: new Date().toISOString()
        });
        chat.messages.push({
          id: 'msg_' + Date.now() + '_ai',
          role: 'assistant',
          content: reply,
          timestamp: new Date().toISOString()
        });
        chat.updatedAt = new Date().toISOString();
        await saveChatsData(chats);
      }
    }

    res.json({ success: true, analysis: reply });
  } catch (err) {
    console.error('Screen Vision xatoligi:', err);
    res.status(500).json({ error: err.message });
  }
});

// Ovozli javob (OpenAI TTS)
app.post('/api/speak', async (req, res) => {
  const openai = getOpenAIClient(req);
  if (!openai) {
    return res.status(401).json({ error: 'OpenAI API kaliti yo‘q' });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Matn kiritilmagan' });
  }

  try {
    // OpenAI TTS modelidan foydalanish (nova - juda tiniq, ravon va tabiiy o'zbekcha talaffuz)
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: req.body.voice || 'nova',
      input: text.slice(0, 1000)
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length
    });
    res.send(buffer);
  } catch (err) {
    console.error('TTS xatoligi:', err);
    res.status(500).json({ error: err.message });
  }
});

// Har qanday boshqa yo'nalishlarni asosiy sahifaga yo'naltirish (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serverni ishga tushirish (0.0.0.0 orqali Railway va bulutli platformalarda to'g'ri bog'lanadi)
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 Shaxsiy AI Assistent serveri ishga tushdi: http://${HOST}:${PORT}`);
  console.log(`📡 OpenAI Key: ${process.env.OPENAI_API_KEY ? 'Mavjud (Server ENV)' : 'Mavjud emas (Foydalanuvchi UI orqali kiritishi mumkin)'}`);
});
