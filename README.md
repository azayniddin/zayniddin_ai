# ⚡ Shaxsiy AI Yordamchi (Jarvis-darajasidagi Shaxsiy Assistent)

Siz uchun maxsus yaratilgan, o'ta kuchli va ko'p funksiyali shaxsiy sun'iy intellekt ilovasi. Unda hech qanday soxta (mock) ma'lumotlar yo'q — barcha funksiyalar real OpenAI API (GPT-4o, Vision, TTS/Whisper) orqali ishlaydi.

---

## 🌟 Asosiy Imkoniyatlar

1. **🧠 Shaxsiy Xarakter va Kontekst:**
   - Oddiy sovuq bot emas, balki aynan sizga yo'naltirilgan, o'zbek tilida samimiy, dono va chuqur bilimga ega Senior dasturchi va maslahatchi.
   - Sizning ismingiz, tajribangiz va istaklaringizni doimiy xotirada saqlaydi.

2. **🖥️ Jonli Ekran Tahlili (Screen Vision):**
   - Brauzer orqali ekranni (yoki VS Code, brauzer oynasini) ulashasiz.
   - Ekranning jonli kichik oynasi (PiP) ochiladi va **"Ekranni Tahlil Qil"** tugmasi orqali GPT-4o Vision ekrandagi kodni o'qiydi, terminaldagi xatolarni topadi va aniq yechim beradi.

3. **🎙️ Jonli Ovozli Rejim (Voice Orb):**
   - Futuristik interaktiv ovoz to'lqinlari sferasi (Canvas Audio Visualizer).
   - O'zbek tilida bevosita mikrofon orqali gaplashish va AI ning ovozli javobini eshitish imkoniyati.

4. **🗂️ To'liq Chat Tarixi:**
   - Barcha yozishmalar serverda va brauzerda avtomatik saqlanadi.
   - Yangi chat yaratish, eski yozishmalarni ko'rish va xohlagan paytda o'chirish.

5. **⚡ Qotmasdan Ishlovchi SSE Streaming:**
   - Matnlar harfma-harf, to'xtovsiz oqib keladi.
   - Dasturlash kodlari rangli sintaksis (Highlight.js) va bir tugma bilan nusxalash tugmasiga ega.

---

## 🚀 Mahalliy (Local) Kompyuterda Ishga Tushirish

1. Terminalda loyiha papkasiga kiring:
   ```bash
   cd /Users/macbookair/Desktop/zerikdim
   ```

2. `.env` faylini yarating va OpenAI API kalitingizni kiriting:
   ```bash
   cp .env.example .env
   ```
   `.env` fayliga o'z kalitingizni yozing:
   ```env
   OPENAI_API_KEY=sk-proj-sizning-kalitingiz
   PORT=3000
   USER_NAME=Do'stim
   ```
   *(Eslatma: Agar `.env` ga kalit qo'ymasangiz ham, saytning o'zidagi **Sozlamalar (⚙️)** bo'limidan OpenAI kalitingizni kiritib ishlatishingiz mumkin!)*

3. Serverni ishga tushiring:
   ```bash
   npm start
   ```

4. Brauzerda oching:
   👉 **http://localhost:3000**

---

## ☁️ Railway Platformasiga Deploy Qilish (100% Tayyor)

Loyihada Railway uchun barcha kerakli konfiguratsiyalar (`railway.json`, `Procfile`, `package.json`) kiritilgan.

### 1-usul: GitHub orqali (Eng oson)
1. Ushbu loyihani o'zingizning GitHub hisobingizga yuklang:
   ```bash
   git init
   git add .
   git commit -m "Shaxsiy AI Yordamchi dastlabki versiya"
   git branch -M main
   git remote add origin https://github.com/sizning-username/zerikdim.git
   git push -u origin main
   ```
2. [railway.app](https://railway.app) ga kiring va **"New Project"** -> **"Deploy from GitHub repo"** ni tanlang.
3. Loyihani tanlang.
4. Loyiha sozlamalarida **"Variables"** bo'limiga o'ting va quyidagi o'zgaruvchini qo'shing:
   - `OPENAI_API_KEY` = `sk-proj-sizning-kalitingiz`
5. Railway avtomatik tarzda loyihani quradi va sizga bepul HTTPS domen beradi (masalan: `https://zerikdim-production.up.railway.app`).

### 2-usul: Railway CLI orqali
```bash
npm i -g @railway/cli
railway login
railway init
railway up
railway variables --set OPENAI_API_KEY=sk-proj-sizning-kalitingiz
```

Tayyor! Endi sizning shaxsiy AI yordamchingiz dunyoning istalgan nuqtasidan, telefoningiz yoki kompyuteringizdan 24/7 ishlaydi.
