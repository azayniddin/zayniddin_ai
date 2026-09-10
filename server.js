import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import https from 'https';
import OpenAI from 'openai';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Muhitni aniqlash (Vercel serverless yoki Railway/Docker)
const isVercel = !!process.env.VERCEL;

// Vercel serverlessda yagona yozish mumkin bo'lgan papka bu /tmp
const DATA_DIR = isVercel ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');
const UPLOADS_DIR = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, 'public', 'uploads');
const UPLOADS_FILES = path.join(UPLOADS_DIR, 'files');
const UPLOADS_IMAGES = path.join(UPLOADS_DIR, 'images');
const UPLOADS_DOCS = path.join(UPLOADS_DIR, 'docs');
const UPLOADS_GENERATED = path.join(UPLOADS_DIR, 'generated');

// Papkalarni xavfsiz yaratish (xatolik bo'lsa server qulab tushmaydi)
[DATA_DIR, UPLOADS_DIR, UPLOADS_FILES, UPLOADS_IMAGES, UPLOADS_DOCS, UPLOADS_GENERATED].forEach(dir => {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`Papka yaratishda ogohlantirish (${dir}):`, err.message);
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
if (isVercel) {
  app.use('/uploads', express.static(path.join('/tmp', 'uploads')));
}

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
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    await fs.writeFile(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf8');
  } catch (err) {
    console.error('Chats saqlashda xatolik:', err.message);
  }
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
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
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
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    await fs.writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf8');
  } catch (err) {
    console.error('Profile saqlashda xatolik:', err.message);
  }
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
3. Rasmlar, PDF Hujjatlar va Fayllarni Tahlil Qilish:
   - Foydalanuvchi senga turli rasmlar, skrinshotlar, PDF kitob yoki hisobotlar, dasturlash kodlari yoki matnli fayllar biriktirib yuborishi mumkin.
   - Biriktirilgan har qanday fayl va PDF hujjatni sinchkovlik bilan o'rgan, undagi ma'lumotlarni tahlil qil, savollarga to'liq javob ber va koddagi xatolarni aniq ko'rsat.
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

// ================= Fayllar, PDF va Rasmlarni Qayta Ishlash Yordamchilari =================

async function extractTextFromPdf(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const info = await parser.getInfo().catch(() => ({}));
    await parser.destroy().catch(() => {});
    return {
      text: typeof textResult === 'string' ? textResult : (textResult?.text || ''),
      pages: textResult?.total || info?.numPages || 1
    };
  } catch (err) {
    console.error('PDF tahlilida xatolik:', err);
    return { text: '', pages: 0, error: err.message };
  }
}

async function saveUploadedFile(fileData) {
  const { name, dataUrl, type } = fileData;
  const isPdf = type === 'application/pdf' || (name || '').toLowerCase().endsWith('.pdf');
  const isImage = type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name || '');

  let targetSubdir = 'files';
  if (isPdf) targetSubdir = 'docs';
  else if (isImage) targetSubdir = 'images';

  const ext = (name || '').split('.').pop() || (isPdf ? 'pdf' : (isImage ? 'jpg' : 'bin'));
  const targetDir = path.join(UPLOADS_DIR, targetSubdir);
  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Upload papkasini yaratishda ogohlantirish:', e.message);
  }
  const filePath = path.join(targetDir, fileName);

  let buffer;
  if (dataUrl && dataUrl.includes(';base64,')) {
    const base64Str = dataUrl.split(';base64,')[1];
    buffer = Buffer.from(base64Str, 'base64');
  } else if (fileData.rawText) {
    buffer = Buffer.from(fileData.rawText, 'utf8');
  } else {
    buffer = Buffer.from('');
  }

  try {
    await fs.writeFile(filePath, buffer);
  } catch (err) {
    console.warn('Faylni saqlashda xatolik:', err.message);
  }
  const publicUrl = `/uploads/${targetSubdir}/${fileName}`;

  return {
    name: name || fileName,
    url: publicUrl,
    type: type || 'application/octet-stream',
    size: buffer.length,
    isPdf,
    isImage,
    buffer
  };
}

// ================= AI Tasvir Yaratish (Image Generation) Yordamchilari =================

function isImageRequest(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  if (t.includes('qanday chiziladi') || t.includes('chizishni o\'rganish')) return false;

  const patterns = [
    /rasm\s*(chiz|yarat|qil|chiqar)/i,
    /chizib\s*ber/i,
    /rasmini\s*chiz/i,
    /surat\s*(chiz|yarat)/i,
    /tasvirlab\s*ber/i,
    /generate\s*(an?\s*)?image/i,
    /draw\s*(an?\s*)?(picture|image|photo)/i,
    /paint\s*(an?\s*)?(picture|image)/i,
    /illyustratsiya\s*(chiz|yarat)/i,
    /bitta\s*rasm\s*chiz/i,
    /tasvir\s*(chiz|yarat)/i
  ];
  return patterns.some(p => p.test(t));
}

async function enrichImagePrompt(openai, userPrompt, style = '') {
  try {
    const styleInstruction = style ? `Artistic style: ${style}.` : '';
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert master AI prompt engineer for high-end digital art (FLUX.1). Convert the user prompt (which may be in Uzbek) into an ultra-detailed, photorealistic, cinematic English prompt with vibrant lighting, textures, 8k resolution details, and artistic composition. Output ONLY the English prompt, no other text.'
        },
        {
          role: 'user',
          content: `${userPrompt}. ${styleInstruction}`
        }
      ],
      max_tokens: 300,
      temperature: 0.7
    });
    return res.choices[0]?.message?.content?.trim() || userPrompt;
  } catch (err) {
    console.warn('Prompt enrichment error:', err);
    return userPrompt;
  }
}

async function generateImageWithFlux(enhancedPrompt, width = 1024, height = 1024) {
  const seed = Math.floor(Math.random() * 10000000);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

  const filename = `ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
  const uploadDir = path.join(__dirname, 'public', 'uploads', 'generated');
  if (!existsSync(uploadDir)) {
    await fs.mkdir(uploadDir, { recursive: true });
  }
  const filePath = path.join(uploadDir, filename);

  return new Promise((resolve, reject) => {
    const file = createWriteStream(filePath);
    
    function makeRequest(targetUrl) {
      https.get(targetUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          makeRequest(response.headers.location);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve(`/uploads/generated/${filename}`));
          });
        } else {
          reject(new Error(`Tasvir yaratishda server javobi: ${response.statusCode}`));
        }
      }).on('error', (err) => {
        reject(err);
      });
    }

    makeRequest(imageUrl);
  });
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
  const { content, image, files = [] } = req.body;

  if (!content && !image && files.length === 0) {
    return res.status(400).json({ error: 'Xabar matni, rasm yoki fayl talab qilinadi' });
  }

  const chats = await getChatsData();
  const chatIndex = chats.findIndex(c => c.id === id);
  if (chatIndex === -1) {
    return res.status(404).json({ error: 'Chat topilmadi' });
  }

  const chat = chats[chatIndex];

  // Biriktirilgan fayllarni saqlash va tahlil qilish
  const processedFiles = [];
  let additionalPromptText = '';
  const currentVisionImages = [];

  if (image) {
    currentVisionImages.push(image);
  }

  for (const file of files) {
    try {
      const saved = await saveUploadedFile(file);
      processedFiles.push({
        name: saved.name,
        url: saved.url,
        type: saved.type,
        size: saved.size,
        isPdf: saved.isPdf,
        isImage: saved.isImage
      });

      if (saved.isImage) {
        currentVisionImages.push(file.dataUrl);
      } else if (saved.isPdf) {
        const pdfResult = await extractTextFromPdf(saved.buffer);
        if (pdfResult.text) {
          additionalPromptText += `\n\n📄 [Biriktirilgan PDF hujjat: "${saved.name}" (${pdfResult.pages} sahifa)]:\n"""\n${pdfResult.text.slice(0, 35000)}\n"""\n`;
        } else {
          additionalPromptText += `\n\n📄 [Biriktirilgan PDF: "${saved.name}" (matn ajratib bo'lmadi, ehtimol skan tasvir).]\n`;
        }
      } else {
        const textContent = file.rawText || saved.buffer.toString('utf8');
        const ext = saved.name.split('.').pop() || '';
        additionalPromptText += `\n\n📝 [Biriktirilgan fayl: "${saved.name}"]:\n\`\`\`${ext}\n${textContent.slice(0, 25000)}\n\`\`\`\n`;
      }
    } catch (fErr) {
      console.error('Faylni qayta ishlashda xatolik:', fErr);
    }
  }

  // Foydalanuvchi xabari
  const userMsgObj = {
    id: 'msg_' + Date.now(),
    role: 'user',
    content: content || '',
    image: image || null,
    files: processedFiles,
    timestamp: new Date().toISOString()
  };

  chat.messages.push(userMsgObj);

  // Agar bu birinchi xabar bo'lsa, chat nomini sarlavha qilib o'zgartirish
  if (chat.messages.length === 1) {
    const firstTitle = content || (processedFiles[0] ? `Fayl: ${processedFiles[0].name}` : 'Yangi suhbat');
    chat.title = firstTitle.slice(0, 32).trim() + (firstTitle.length > 32 ? '...' : '');
  }
  chat.updatedAt = new Date().toISOString();

  // SSE ulanishini tayyorlash
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const systemPrompt = await buildSystemPrompt();

    // OpenAI formatiga moslashtirish (oxirgi 15 ta xabarni kontekst uchun olamiz)
    const recentMessages = chat.messages.slice(-15).map((m, idx, arr) => {
      const isLatest = idx === arr.length - 1;
      let textContent = m.content || '';
      if (isLatest && additionalPromptText) {
        textContent += additionalPromptText;
      }

      if (m.role === 'user') {
        const imagesToInclude = isLatest ? currentVisionImages : (m.image ? [m.image] : []);
        if (imagesToInclude.length > 0) {
          return {
            role: 'user',
            content: [
              { type: 'text', text: textContent || 'Ushbu biriktirilgan tasvir yoki faylni tahlil qilib bering:' },
              ...imagesToInclude.map(url => ({
                type: 'image_url',
                image_url: { url, detail: 'high' }
              }))
            ]
          };
        }
      }
      return {
        role: m.role,
        content: textContent
      };
    });

    const messagesToSend = [
      { role: 'system', content: systemPrompt },
      ...recentMessages
    ];

    // 1. Agar foydalanuvchi rasm chizishni so'ragan bo'lsa
    if (content && isImageRequest(content)) {
      res.write(`data: ${JSON.stringify({ chunk: `🎨 **Siz so‘ragan tasvir yaratilmoqda...**\n\nAI tasvir g‘oyasini ishlab chiqmoqda va chizmoqda, bir necha soniya kuting...\n\n` })}\n\n`);

      try {
        const enhancedPrompt = await enrichImagePrompt(openai, content);
        const imageUrl = await generateImageWithFlux(enhancedPrompt, 1024, 1024);

        const cardData = JSON.stringify({
          imageUrl,
          prompt: content,
          enhancedPrompt
        });

        const imageChunk = `Mana, siz so‘ragan mukammal tasvir tayyor bo‘ldi!\n\n![${content}](${imageUrl})\n\n:::image-card\n${cardData}\n:::\n\n*Tasvir FLUX.1 AI modeli orqali 1024x1024 HD sifatda chizildi.*`;
        
        res.write(`data: ${JSON.stringify({ chunk: imageChunk })}\n\n`);

        const assistantMsgObj = {
          id: 'msg_' + Date.now() + '_ai',
          role: 'assistant',
          content: imageChunk,
          timestamp: new Date().toISOString()
        };
        chat.messages.push(assistantMsgObj);
        chat.updatedAt = new Date().toISOString();
        await saveChatsData(chats);

        res.write(`data: ${JSON.stringify({ done: true, messageId: assistantMsgObj.id })}\n\n`);
        return res.end();
      } catch (imgErr) {
        console.error('Tasvir chizishda xatolik:', imgErr);
        res.write(`data: ${JSON.stringify({ chunk: `\n\n*(Tasvir yaratishda vaqtinchalik uzilish: ${imgErr.message}. Odatiy javobga o'tilmoqda...)*\n\n` })}\n\n`);
      }
    }

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

// To'g'ridan-to'g'ri Rasm Chizish API (Modal va Quick Tool uchun)
app.post('/api/generate-image', async (req, res) => {
  const openai = getOpenAIClient(req);
  if (!openai) {
    return res.status(401).json({ error: 'OpenAI API kaliti topilmadi' });
  }

  const { prompt, style, aspectRatio = '1:1', chatId } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Rasm tavsifi (prompt) kiritilmagan' });
  }

  try {
    let width = 1024, height = 1024;
    if (aspectRatio === '16:9') { width = 1024; height = 576; }
    else if (aspectRatio === '9:16') { width = 576; height = 1024; }

    const enhancedPrompt = await enrichImagePrompt(openai, prompt, style);
    const imageUrl = await generateImageWithFlux(enhancedPrompt, width, height);

    if (chatId) {
      const chats = await getChatsData();
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        chat.messages.push({
          id: 'msg_' + Date.now(),
          role: 'user',
          content: `🎨 Rasm: ${prompt} (${style || 'Standard'})`,
          timestamp: new Date().toISOString()
        });
        const cardData = JSON.stringify({ imageUrl, prompt, enhancedPrompt });
        chat.messages.push({
          id: 'msg_' + Date.now() + '_ai',
          role: 'assistant',
          content: `Mana, siz so‘ragan mukammal tasvir!\n\n![${prompt}](${imageUrl})\n\n:::image-card\n${cardData}\n:::\n\n*Tasvir FLUX.1 modeli orqali HD sifatda chizildi.*`,
          timestamp: new Date().toISOString()
        });
        chat.updatedAt = new Date().toISOString();
        await saveChatsData(chats);
      }
    }

    res.json({ success: true, imageUrl, prompt, enhancedPrompt });
  } catch (err) {
    console.error('Tasvir yaratishda xatolik:', err);
    res.status(500).json({ error: err.message });
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

// Serverni ishga tushirish (Railway, Docker yoki mahalliy muhitda)
const HOST = '0.0.0.0';
if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Shaxsiy AI Assistent serveri ishga tushdi: http://${HOST}:${PORT}`);
    console.log(`📡 OpenAI Key: ${process.env.OPENAI_API_KEY ? 'Mavjud (Server ENV)' : 'Mavjud emas (Foydalanuvchi UI orqali kiritishi mumkin)'}`);
  });
}

export default app;

