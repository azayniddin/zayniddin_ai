import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createWriteStream } from 'fs';
import https from 'https';
import OpenAI from 'openai';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel, AlignmentType } from 'docx';
import PDFDocument from 'pdfkit';
import { startTelegramBot, notifyAdminNewUser } from './telegramBot.js';

dotenv.config();

// Agar hosting muhitida (masalan, Railway) Variables bo'sh bo'lsa, avtomatik standart konfiguratsiya ishlaydi:
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = Buffer.from(
    'c2stcHJvai1CczFGR1RSVmkzSmNBUVBpVTl3bUNDckt0ZUw0SGpFSjU1RUR1N0ZxcDk0dEd1YmNNUmJKbjkwT0RLbWVleFZZOTNWa3pPeE1Td1QzQmxia0ZKZHp1cElBQllhOVd5cnF0NmRvVnRrd3JKLW4zZVZReE13U0sxbXF5LVA4SV9qaXQ5cXdNd3NuWDNVWE5JYzVua2NJUC13cVFYa0E=',
    'base64'
  ).toString('utf8');
}
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8724067443:AAGIkaR5_niOO3hFq2jMPm5ByfppZ9MAReE';
process.env.TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID || '5744542264';
process.env.USER_NAME = process.env.USER_NAME || 'Hojiakbar';
process.env.DEFAULT_IMAGE_LIMIT = process.env.DEFAULT_IMAGE_LIMIT || '5';


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
const USERS_FILE = path.join(DATA_DIR, 'users.json');
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

// Foydalanuvchilar (Users) bilan ishlash
async function getUsersData() {
  try {
    if (!existsSync(USERS_FILE)) {
      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }
      await fs.writeFile(USERS_FILE, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Users faylini o‘qishda xatolik:', err);
    return [];
  }
}

async function saveUsersData(users) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('Users saqlashda xatolik:', err.message);
  }
}

async function getOrCreateUser(req) {
  const userId = req.headers['x-user-id'] || req.body?.userId || req.query?.userId;
  if (!userId) return null;

  const users = await getUsersData();
  let user = users.find(u => u.id === userId);
  const now = new Date().toISOString();

  if (!user) {
    const defaultLimit = parseInt(process.env.DEFAULT_IMAGE_LIMIT, 10) || 5;
    user = {
      id: userId,
      name: req.headers['x-user-name'] || req.body?.userName || 'Foydalanuvchi',
      surname: req.headers['x-user-surname'] || req.body?.userSurname || '',
      email: req.headers['x-user-email'] || req.body?.userEmail || '',
      avatar: req.body?.userAvatar || '',
      imageCount: 0,
      imageLimit: defaultLimit,
      isBlocked: false,
      registeredAt: now,
      lastActive: now
    };
    users.push(user);
    await saveUsersData(users);
    notifyAdminNewUser(user).catch(() => {});
  } else {
    user.lastActive = now;
    if (req.headers['x-user-name'] && req.headers['x-user-name'] !== user.name) {
      user.name = req.headers['x-user-name'];
    }
    await saveUsersData(users);
  }
  return user;
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
async function buildSystemPrompt(user = null) {
  const profile = await getProfileData();
  const effectiveUserName = user?.name ? `${user.name}${user.surname ? ' ' + user.surname : ''}` : profile.userName;
  const now = new Date();
  const uzbekDate = now.toLocaleDateString('uz-UZ', { timeZone: 'Asia/Tashkent', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const uzbekTime = now.toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });
  const isoDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }); // YYYY-MM-DD

  return `Sen foydalanuvchining (${effectiveUserName}) eng ishonchli, shaxsiy va yuqori intellektga ega AI yordamchisisan. Isming: ${profile.assistantName}.
Oddiy, sovuq chatbotlardan farqli o'laroq, sen faqatgina ${effectiveUserName} uchun xizmat qilasan va uning eng yaqin maslahatdoshi, Senior dasturchi mentori, muammolarni aniq yechuvchi va hayotiy tayanchisan.

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
     Javobingizda chiroyli tasdiqlang va xabar oxirida quyidagi maxsus JSON blokini qo'shing (hech qanday HTML kod yozmang, faqat shu maxsus blok):
\`\`\`reminder
{
  "title": "Eslatma mavzusi (qisqa va aniq)",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "type": "alarm" | "calendar" | "reminder",
  "details": "Qisqacha izoh"
}
\`\`\`
   - Ushbu blok orqali dastur avtomatik ravishda foydalanuvchining telefoniga (Android Soat / Budilnik ilovasi, Google / Apple Taqvim yoki Push bildirishnoma) 1 ta tugma bilan ulanish interfeysini chiqaradi!
5. Professional Office va Hujjatlar Dvigateli (PDF, Word, Excel):
   - Foydalanuvchi yuklagan PDF, Word (.docx), Excel (.xlsx/.xls/.csv) fayllarni chuqur tahlil qilasan va savollariga to'liq, mukammal javob berasan.
   - AGAR foydalanuvchi Excel jadvali, ma'lumotlar ro'yxati, hisobot, shartnoma yoki reja yaratib berishni so'rasa (masalan: "xodimlar ro'yxati excel qilib ber", "shartnoma word qilib ber", "reja pdf qilib ber"):
     Javobingizda chiroyli tushuntiring va xabar oxirida quyidagi maxsus JSON blokini qo'shing:
\`\`\`document
{
  "type": "excel" | "word" | "pdf",
  "title": "Hujjat sarlavhasi (masalan: Xodimlar Ro'yxati)",
  "filename": "xodimlar_royxati.xlsx",
  "data": [
    ["Ism", "Lavozim", "Maosh (so'm)", "Telefon"],
    ["Aliyev Vali", "Senior Dasturchi", "25,000,000", "+998 90 123-45-67"],
    ["Karimov Sardor", "Frontend Dasturchi", "18,000,000", "+998 93 987-65-43"]
  ]
}
\`\`\`
     (Eslatma: Excel uchun "data" 2D array jadval bo'ladi. Word va PDF uchun esa "data" to'liq matn yoki paragraflar arrayi bo'ladi).
     Ushbu blok orqali tizim avtomatik ravishda haqiqiy yuklab olinadigan .xlsx, .docx yoki .pdf fayl yaratib beradi!
   - Tizimda rasm chizish (Image generation) o'chirilgan. Agar rasm so'ralsa, tasvir chizish o'chirilganini va hujjatlar, kod va matn bilan yordam bera olishingizni ayting.
6. Foydalanuvchi Profili:
   - Ismi: ${profile.userName}
   - Kasbi/Tajribasi: ${profile.codingExperience}
   - Maxsus istaklari: ${profile.customRules}

Doimo qotmasdan, aniq, mantiqiy va maksimal darajada foydali javob ber!`;
}

// ================= Fayllar, PDF va Rasmlarni Qayta Ishlash Yordamchilari =================

let PDFParseClass = null;
async function getPDFParser() {
  if (PDFParseClass) return PDFParseClass;
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const pdfModule = req('pdf-parse');
    PDFParseClass = pdfModule.PDFParse || pdfModule;
    return PDFParseClass;
  } catch (err) {
    console.warn('PDF parser yuklanmadi (serverless yoki muhit cheklovi):', err.message);
    return null;
  }
}

async function extractTextFromPdf(buffer) {
  try {
    const Parser = await getPDFParser();
    if (!Parser) {
      return { text: '(PDF matni serverless muhitida ajratilmadi)', pages: 1 };
    }
    const parser = new Parser({ data: buffer });
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function saveUploadedFile(fileData) {
  const { name, dataUrl, type } = fileData;
  const isPdf = type === 'application/pdf' || (name || '').toLowerCase().endsWith('.pdf');
  const isDocx = (name || '').toLowerCase().endsWith('.docx');
  const isExcel = /\.(xlsx|xls|csv)$/i.test(name || '');
  const isImage = type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name || '');

  let targetSubdir = 'files';
  if (isPdf || isDocx || isExcel) targetSubdir = 'docs';
  else if (isImage) targetSubdir = 'images';

  const ext = (name || '').split('.').pop() || (isPdf ? 'pdf' : (isDocx ? 'docx' : (isExcel ? 'xlsx' : (isImage ? 'jpg' : 'bin'))));
  const targetDir = path.join(UPLOADS_DIR, targetSubdir);
  try {
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Upload papkasini yaratishda ogohlantirish:', e.message);
  }

  const fileName = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
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
    isDocx,
    isExcel,
    isImage,
    buffer
  };
}

// Word (.docx) fayllaridan matnni o'qish (mammoth)
async function extractTextFromDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value ? result.value.trim() : '' };
  } catch (err) {
    console.error('Word (.docx) o‘qishda xatolik:', err);
    return { text: '' };
  }
}

// Excel (.xlsx, .xls, .csv) fayllaridan jadvallarni o'qish (SheetJS)
function extractTextFromExcel(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv && csv.trim()) {
        text += `\n--- Sahifa (Sheet): "${sheetName}" ---\n${csv.trim()}\n`;
      }
    });
    return { text: text.trim() };
  } catch (err) {
    console.error('Excel (.xlsx) o‘qishda xatolik:', err);
    return { text: '' };
  }
}

// ================= Office Hujjatlarini Yaratish (Document Generators) =================

// Helper to normalize document generator parameters
function normalizeDocArgs(arg1, arg2, arg3) {
  let filename = '';
  let title = '';
  let data = null;

  const isExt = str => typeof str === 'string' && /\.(xlsx|xls|docx|doc|pdf)$/i.test(str);

  if (isExt(arg1)) {
    filename = arg1;
    title = typeof arg2 === 'string' ? arg2 : '';
    data = arg3 !== undefined ? arg3 : arg2;
  } else if (isExt(arg3)) {
    filename = arg3;
    title = typeof arg1 === 'string' ? arg1 : '';
    data = arg2;
  } else {
    title = typeof arg1 === 'string' ? arg1 : '';
    data = arg2;
    filename = typeof arg3 === 'string' ? arg3 : '';
  }

  return { filename, title, data };
}

// 1. Excel (.xlsx) fayl yaratish
async function generateExcelFile(arg1, arg2, arg3) {
  try {
    const { filename, title, data: rows } = normalizeDocArgs(arg1, arg2, arg3);
    const wb = XLSX.utils.book_new();
    let ws;
    if (Array.isArray(rows) && rows.length > 0) {
      if (Array.isArray(rows[0])) {
        ws = XLSX.utils.aoa_to_sheet(rows);
      } else {
        ws = XLSX.utils.json_to_sheet(rows);
      }
    } else {
      ws = XLSX.utils.aoa_to_sheet([['Sarlavha', 'Izoh'], [title || 'Ma\'lumot', 'Tayyorlandi']]);
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Hisobot');
    const outBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const safeBase = (filename || title || 'hisobot').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const finalName = safeBase.toLowerCase().endsWith('.xlsx') ? safeBase : `${safeBase}_${Date.now()}.xlsx`;
    const filePath = path.join(UPLOADS_DOCS, finalName);
    await fs.writeFile(filePath, outBuffer);

    return {
      type: 'excel',
      title: title || 'Excel Jadval',
      filename: finalName,
      fileUrl: `/uploads/docs/${finalName}`,
      sizeText: formatBytes(outBuffer.length)
    };
  } catch (e) {
    console.error('Excel yaratishda xatolik:', e);
    throw e;
  }
}

// 2. Word (.docx) fayl yaratish
async function generateWordFile(arg1, arg2, arg3) {
  try {
    const { filename, title, data: contentOrSections } = normalizeDocArgs(arg1, arg2, arg3);
    const paragraphs = [
      new Paragraph({
        text: title || 'Hujjat',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER
      }),
      new Paragraph({ text: '' })
    ];

    if (Array.isArray(contentOrSections)) {
      contentOrSections.forEach(sec => {
        if (typeof sec === 'string') {
          paragraphs.push(new Paragraph({ text: sec }));
          paragraphs.push(new Paragraph({ text: '' }));
        } else if (sec && typeof sec === 'object') {
          if (sec.heading) paragraphs.push(new Paragraph({ text: sec.heading, heading: HeadingLevel.HEADING_2 }));
          if (sec.text) paragraphs.push(new Paragraph({ text: sec.text }));
          paragraphs.push(new Paragraph({ text: '' }));
        }
      });
    } else if (typeof contentOrSections === 'string') {
      contentOrSections.split('\n\n').forEach(pText => {
        if (pText.trim()) {
          paragraphs.push(new Paragraph({ text: pText.trim() }));
          paragraphs.push(new Paragraph({ text: '' }));
        }
      });
    }

    const doc = new DocxDocument({
      sections: [{
        properties: {},
        children: paragraphs
      }]
    });

    const outBuffer = await Packer.toBuffer(doc);
    const safeBase = (filename || title || 'hujjat').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const finalName = safeBase.toLowerCase().endsWith('.docx') ? safeBase : `${safeBase}_${Date.now()}.docx`;
    const filePath = path.join(UPLOADS_DOCS, finalName);
    await fs.writeFile(filePath, outBuffer);

    return {
      type: 'word',
      title: title || 'Word Hujjati',
      filename: finalName,
      fileUrl: `/uploads/docs/${finalName}`,
      sizeText: formatBytes(outBuffer.length)
    };
  } catch (e) {
    console.error('Word yaratishda xatolik:', e);
    throw e;
  }
}

// 3. PDF (.pdf) fayl yaratish
async function generatePdfFile(arg1, arg2, arg3) {
  return new Promise((resolve, reject) => {
    try {
      const { filename, title, data: content } = normalizeDocArgs(arg1, arg2, arg3);
      const doc = new PDFDocument({ margin: 50 });
      const safeBase = (filename || title || 'hujjat').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const finalName = safeBase.toLowerCase().endsWith('.pdf') ? safeBase : `${safeBase}_${Date.now()}.pdf`;
      const filePath = path.join(UPLOADS_DOCS, finalName);
      const writeStream = createWriteStream(filePath);

      doc.pipe(writeStream);

      doc.fontSize(22).fillColor('#1e293b').text(title || 'Hujjat', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#64748b').text(`Yaratilgan sana: ${new Date().toLocaleDateString('uz-UZ')}`, { align: 'center' });
      doc.moveDown(1.5);

      const textStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      doc.fontSize(12).fillColor('#334155').text(textStr, { lineGap: 6 });

      doc.end();

      writeStream.on('finish', async () => {
        const stats = await fs.stat(filePath).catch(() => ({ size: 0 }));
        resolve({
          type: 'pdf',
          title: title || 'PDF Hujjati',
          filename: finalName,
          fileUrl: `/uploads/docs/${finalName}`,
          sizeText: formatBytes(stats.size)
        });
      });

      writeStream.on('error', reject);
    } catch (e) {
      reject(e);
    }
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

// ================= AUTH & USER MANAGEMENT ROUTES =================

// Foydalanuvchi tizimga kirishi yoki ro'yxatdan o'tishi
app.post('/api/auth/login-or-register', async (req, res) => {
  try {
    const { id, name, surname, email, avatar } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'ID va Ism talab qilinadi' });
    }

    const users = await getUsersData();
    let user = users.find(u => u.id === id);
    const now = new Date().toISOString();
    let isNew = false;

    if (!user) {
      const defaultLimit = parseInt(process.env.DEFAULT_IMAGE_LIMIT, 10) || 5;
      user = {
        id,
        name: name.trim(),
        surname: (surname || '').trim(),
        email: (email || '').trim(),
        avatar: avatar || '',
        imageCount: 0,
        imageLimit: defaultLimit,
        isBlocked: false,
        registeredAt: now,
        lastActive: now
      };
      users.push(user);
      isNew = true;
    } else {
      user.name = name.trim();
      if (surname !== undefined) user.surname = (surname || '').trim();
      if (email !== undefined) user.email = (email || '').trim();
      if (avatar !== undefined) user.avatar = avatar;
      user.lastActive = now;
    }

    await saveUsersData(users);

    if (isNew) {
      notifyAdminNewUser(user).catch(() => {});
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Joriy foydalanuvchi ma'lumotlarini olish
app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Foydalanuvchi IDsi berilmagan' });
    }
    const users = await getUsersData();
    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }
    user.lastActive = new Date().toISOString();
    await saveUsersData(users);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// Barcha chatlar ro'yxati (Faqat joriy foydalanuvchiga tegishlilari)
app.get('/api/chats', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    const chats = await getChatsData();
    const userChats = userId ? chats.filter(c => c.userId === userId || !c.userId) : chats;
    
    // Xabarlar tanasini qisqartirib, faqat metadata qaytaramiz
    const summaries = userChats.map(c => ({
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
    const userId = req.headers['x-user-id'] || req.body.userId;
    const chats = await getChatsData();
    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId: userId || null,
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

  const user = await getOrCreateUser(req);
  if (user && user.isBlocked) {
    return res.status(403).json({ error: "Sizning profilingiz ma'muriyat tomonidan bloklangan." });
  }

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
    const systemPrompt = await buildSystemPrompt(user);

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

    // 2. Avtomatik Hujjat (Excel / Word / PDF) yaratish va kartochkaga almashtirish
    const docBlockRegex = /```document\s*([\s\S]*?)\s*```/g;
    let docMatch;
    while ((docMatch = docBlockRegex.exec(fullAssistantResponse)) !== null) {
      try {
        const docPayload = JSON.parse(docMatch[1].trim());
        let generated = null;
        const lowerType = (docPayload.type || '').toLowerCase();
        const lowerName = (docPayload.filename || '').toLowerCase();

        if (lowerType === 'excel' || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
          generated = await generateExcelFile(docPayload.filename, docPayload.title, docPayload.data);
        } else if (lowerType === 'word' || lowerName.endsWith('.docx')) {
          generated = await generateWordFile(docPayload.filename, docPayload.title, docPayload.data);
        } else if (lowerType === 'pdf' || lowerName.endsWith('.pdf')) {
          generated = await generatePdfFile(docPayload.filename, docPayload.title, docPayload.data);
        }

        if (generated) {
          const docCardBlock = `\n\n:::document-file\n${JSON.stringify(generated)}\n:::\n\n`;
          fullAssistantResponse = fullAssistantResponse.replace(docMatch[0], docCardBlock);
          res.write(`data: ${JSON.stringify({ documentCreated: generated, replacedBlock: docCardBlock })}\n\n`);
        }
      } catch (docErr) {
        console.warn('Avtomatik hujjat yaratishda ogohlantirish:', docErr.message);
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

// To'g'ridan-to'g'ri Hujjat (Excel / Word / PDF) Yaratish API
app.post('/api/create-document', async (req, res) => {
  const { type, title, filename, data } = req.body;
  if (!type && !filename) {
    return res.status(400).json({ error: 'Hujjat turi yoki fayl nomi kiritilmagan' });
  }

  try {
    let result = null;
    const lowerType = (type || '').toLowerCase();
    const lowerName = (filename || '').toLowerCase();

    if (lowerType === 'excel' || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      result = await generateExcelFile(filename || 'jadval.xlsx', title || 'Excel Jadvali', data || []);
    } else if (lowerType === 'word' || lowerName.endsWith('.docx')) {
      result = await generateWordFile(filename || 'hujjat.docx', title || 'Word Hujjati', data || '');
    } else if (lowerType === 'pdf' || lowerName.endsWith('.pdf')) {
      result = await generatePdfFile(filename || 'hujjat.pdf', title || 'PDF Hujjati', data || '');
    } else {
      return res.status(400).json({ error: "Noma'lum hujjat formati. Faqat excel, word, pdf qo'llab-quvvatlanadi" });
    }

    res.json({ success: true, file: result });
  } catch (err) {
    console.error('Hujjat yaratishda xatolik:', err);
    res.status(500).json({ error: err.message || 'Hujjat yaratilmadi' });
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
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.redirect('/');
});

// Serverni ishga tushirish (Railway, Docker yoki mahalliy muhitda)
const HOST = '0.0.0.0';
if (!process.env.VERCEL) {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Shaxsiy AI Assistent serveri ishga tushdi: http://${HOST}:${PORT}`);
    console.log(`📡 OpenAI Key: ${process.env.OPENAI_API_KEY ? 'Mavjud (Server ENV)' : 'Mavjud emas (Foydalanuvchi UI orqali kiritishi mumkin)'}`);
    
    // Telegram Admin Botni ishga tushirish
    startTelegramBot({
      getUsers: getUsersData,
      saveUsers: saveUsersData,
      getChats: getChatsData
    });
  });
}

export { generateExcelFile, generateWordFile, generatePdfFile };
export default app;

