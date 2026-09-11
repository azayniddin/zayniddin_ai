/**
 * zayniddin_ai - Siri Style Voice & Wave Orb Controller
 * Haqiqiy Hands-Free Doimiy Ovozli Suhbat (Duplex Voice Mode)
 * Avtomatik javob berish va foydalanuvchi gapirganda AI gapini darhol to'xtatish (Barge-in / Interruption)
 */

class VoiceOrbController {
  constructor() {
    this.canvas = document.getElementById('voiceCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.modal = document.getElementById('voiceModal');
    this.statusText = document.getElementById('voiceStatusText');
    this.transcriptBox = document.getElementById('voiceTranscriptBox');
    this.micToggleBtn = document.getElementById('voiceMicToggleBtn');
    this.stopSpeechBtn = document.getElementById('voiceStopSpeechBtn');

    this.isListening = false;
    this.isSpeaking = false;
    this.isThinking = false;
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.micStream = null;
    this.dataArray = null;
    this.animationFrameId = null;
    this.currentAudio = null;
    this.silenceTimer = null;
    this.lastRecognizedText = '';
    this.abortController = null;

    // Siri Wave Parameters
    this.phase = 0;
    this.intensity = 0.2;
    this.targetIntensity = 0.2;
    this.audioLevel = 0;

    // Harmonic chromatic wave layers
    this.waves = [
      { color: 'rgba(6, 182, 212, 0.9)', freq: 2.5, speed: 0.05, ampMult: 1.0, width: 3.2 },   // Cyan
      { color: 'rgba(59, 130, 246, 0.95)', freq: 3.2, speed: -0.04, ampMult: 0.85, width: 2.8 },  // Electric Blue
      { color: 'rgba(168, 85, 247, 0.95)', freq: 2.0, speed: 0.06, ampMult: 0.9, width: 3.0 },   // Neon Purple
      { color: 'rgba(236, 72, 153, 0.95)', freq: 3.8, speed: -0.05, ampMult: 0.75, width: 2.5 }, // Hot Magenta
      { color: 'rgba(255, 255, 255, 0.98)', freq: 4.5, speed: 0.07, ampMult: 0.5, width: 2.0 }  // White Core
    ];

    this.particles = [];
    this.initParticles();
    this.initCanvas();
    this.initSpeechRecognition();
    this.initEvents();
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < 24; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        dist: 20 + Math.random() * 60,
        speed: 0.006 + Math.random() * 0.016,
        size: 1.2 + Math.random() * 2.2,
        color: i % 2 === 0 ? 'rgba(6, 182, 212, ' : 'rgba(236, 72, 153, ',
        alpha: 0.25 + Math.random() * 0.65
      });
    }
  }

  initCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const logicalW = rect.width > 0 ? rect.width : 360;
    const logicalH = 120;

    this.canvas.width = logicalW * dpr;
    this.canvas.height = logicalH * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.logicalW = logicalW;
    this.logicalH = logicalH;
  }

  async initMicrophoneAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (!this.micStream) {
        // Echo cancellation va shovqinni kamaytirish orqali mukammal ovoz tahlili
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        this.micStream = stream;
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.8;
        source.connect(this.analyser);
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }
    } catch (err) {
      console.warn('Mikrofon audio ulanmadi:', err);
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true; // Uzluksiz tinglash
      this.recognition.interimResults = true;
      this.recognition.lang = 'uz-UZ';

      this.recognition.onstart = () => {
        this.isListening = true;
        if (!this.isSpeaking && !this.isThinking) {
          this.updateStatus('Eshityapman... Gapiring!', '#06b6d4');
          this.targetIntensity = 0.55;
        }
        this.micToggleBtn?.classList.add('mic-active');
      };

      this.recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const part = res[0]?.transcript || '';
          if (res.isFinal) {
            finalText += part;
          } else {
            interimText += part;
          }
        }

        const currentText = (finalText || interimText).trim();

        // 1. ENG ASOSIY FUNKSIYA: FOYDALANUVCHI GAPIRSA, AI DARHOL GAPIRISHNI TO'XTATADI! (Barge-in / Interruption)
        if (currentText.length > 0 && (this.isSpeaking || this.isThinking)) {
          console.log('Foydalanuvchi gapira boshladi, AI darhol to‘xtatildi:', currentText);
          this.interruptAI();
        }

        if (currentText) {
          this.lastRecognizedText = currentText;
          if (this.transcriptBox) {
            this.transcriptBox.innerHTML = `<strong>Siz:</strong> "${this.escapeHtml(currentText)}"`;
          }

          // Jimlikni aniqlash: agar gapirib bo'lingan bo'lsa (1.0 soniya jimlik yoki isFinal)
          clearTimeout(this.silenceTimer);
          const silenceDelay = finalText.trim() ? 650 : 1100;
          this.silenceTimer = setTimeout(() => {
            if (this.lastRecognizedText.trim() && !this.isThinking && !this.isSpeaking) {
              const textToSend = this.lastRecognizedText.trim();
              this.lastRecognizedText = '';
              this.handleVoiceCommand(textToSend);
            }
          }, silenceDelay);
        }
      };

      this.recognition.onerror = (event) => {
        if (event.error === 'no-speech') {
          // Oddiy jimlik, hech narsa qilmaymiz
          return;
        }
        console.warn('Speech recognition xatosi:', event.error);
        if (event.error !== 'aborted') {
          this.updateStatus(`Ovoz xatosi: ${event.error}`, '#f43f5e');
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        // Agar modal ochiq bo'lsa va AI gapirmayotgan bo'lsa, avtomatik qayta yoqish
        if (this.modal?.classList.contains('active') && !this.isThinking && !this.isSpeaking) {
          try {
            this.recognition.start();
          } catch (e) {}
        }
      };
    } else {
      console.warn('Brauzerda Web Speech API qo‘llab-quvvatlanmaydi.');
      if (this.transcriptBox) {
        this.transcriptBox.innerHTML = `<em>Brauzeringizda ovozli nutqni aniqlash qo‘llab-quvvatlanmaydi (Chrome yoki Safari tavsiya etiladi).</em>`;
      }
    }
  }

  initEvents() {
    // Mikrofonni yoqish / o'chirish
    this.micToggleBtn?.addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
        this.updateStatus('Mikrofon o‘chirildi', '#94a3b8');
      } else {
        this.startListening();
      }
    });

    // AIni to'xtatish (Stop) tugmasi
    this.stopSpeechBtn?.addEventListener('click', () => {
      this.interruptAI();
      this.updateStatus('To‘xtatildi. Gapiring!', '#10b981');
    });

    // To'lqin kanvasiga bosganda ham to'xtatish
    this.canvas?.addEventListener('click', () => {
      if (this.isSpeaking || this.isThinking) {
        this.interruptAI();
      }
    });

    // Ovoz modalini ochish
    document.getElementById('openVoiceModalBtn')?.addEventListener('click', () => {
      this.openModal();
    });

    // Ovoz modalini yopish
    document.getElementById('closeVoiceModalBtn')?.addEventListener('click', () => {
      this.closeModal();
    });

    // Backdrop bosilganda yopish
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  openModal() {
    this.modal?.classList.add('active');
    setTimeout(() => {
      this.initCanvas();
    }, 60);

    this.initMicrophoneAudio();
    this.lastRecognizedText = '';
    if (this.transcriptBox) {
      this.transcriptBox.innerHTML = `"Salom! Sizni eshityapman, marhamat bemalol gapiring..."`;
    }
    this.updateStatus('Eshityapman... Gapiring!', '#06b6d4');
    this.startListening();
    this.startAnimationLoop();
  }

  closeModal() {
    this.modal?.classList.remove('active');
    this.stopListening();
    this.interruptAI();
    clearTimeout(this.silenceTimer);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  startListening() {
    if (this.recognition) {
      try {
        this.recognition.start();
        this.isListening = true;
        this.micToggleBtn?.classList.add('mic-active');
        if (!this.isSpeaking && !this.isThinking) {
          this.updateStatus('Eshityapman... Gapiring!', '#06b6d4');
          this.targetIntensity = 0.55;
        }
      } catch (err) {
        // Allaqachon ishlayotgan bo'lsa
      }
    }
  }

  stopListening() {
    clearTimeout(this.silenceTimer);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.isListening = false;
      this.micToggleBtn?.classList.remove('mic-active');
    }
  }

  // AI gapirayotganda yoki o'ylayotganda foydalanuvchi gapirsa yoki to'xtatish tugmasi bosilsa
  interruptAI() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.stopSpeaking();
    this.isThinking = false;
    this.targetIntensity = 0.55;
    this.updateStatus('Eshityapman... Gapiring!', '#06b6d4');
  }

  updateStatus(text, color = '#cbd5e1') {
    if (this.statusText) {
      this.statusText.textContent = text;
      this.statusText.style.color = color;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // Foydalanuvchi gapirib bo'lgach avtomatik javob berish jarayoni
  async handleVoiceCommand(userText) {
    if (!userText || !userText.trim()) return;

    this.isThinking = true;
    this.updateStatus('zayniddin_ai o‘ylamoqda...', '#a855f7');
    this.targetIntensity = 0.8;

    if (this.transcriptBox) {
      this.transcriptBox.innerHTML = `<strong>Siz:</strong> "${this.escapeHtml(userText)}"<br><span style="color:#94a3b8; font-size:0.8rem; font-style:italic;">AI javob tayyorlamoqda...</span>`;
    }

    try {
      this.abortController = new AbortController();
      const activeChatId = window.appState?.activeChatId;
      const apiKey = localStorage.getItem('personal_ai_key') || (window.appState ? window.appState.apiKey : '') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      let targetChatId = activeChatId;
      if (!targetChatId) {
        const newChatRes = await fetch('/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: userText.slice(0, 30) }),
          signal: this.abortController.signal
        });
        const newChat = await newChatRes.json();
        targetChatId = newChat.id;
        if (window.appState) {
          window.appState.activeChatId = newChat.id;
        }
        window.dispatchEvent(new CustomEvent('refresh-chats'));
      }

      const res = await fetch(`/api/chats/${targetChatId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: userText }),
        signal: this.abortController.signal
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server xatosi: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantReply = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.chunk) {
                assistantReply += data.chunk;
                if (this.transcriptBox) {
                  const preview = assistantReply.replace(/:::image-card[\s\S]*?:::/g, '[Rasm]').replace(/```[\s\S]*?```/g, '[Kod]').slice(0, 160);
                  this.transcriptBox.innerHTML = `<strong>AI:</strong> ${this.escapeHtml(preview)}${assistantReply.length > 160 ? '...' : ''}`;
                }
              }
            } catch (e) {}
          }
        }
      }

      window.dispatchEvent(new CustomEvent('refresh-active-chat'));

      this.isThinking = false;
      this.abortController = null;

      if (assistantReply.trim()) {
        await this.speakText(assistantReply);
      } else {
        this.updateStatus('Tinglashga tayyorman', '#10b981');
        this.targetIntensity = 0.3;
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Ovozli so‘rov foydalanuvchi tomonidan to‘xtatildi');
        return;
      }
      console.error('Ovozli suhbatda xatolik:', err);
      this.isThinking = false;
      this.abortController = null;
      this.updateStatus('Xatolik: ' + err.message, '#f43f5e');
      this.targetIntensity = 0.2;
      if (this.transcriptBox) {
        this.transcriptBox.innerHTML = `<span style="color:#f87171;">Xatolik: ${this.escapeHtml(err.message)}</span>`;
      }
    }
  }

  // AI javobini ovoz orqali o'qish (TTS)
  async speakText(text) {
    if (!text) return;
    this.stopSpeaking();
    this.isSpeaking = true;
    this.updateStatus('zayniddin_ai gapirmoqda...', '#38bdf8');
    this.targetIntensity = 0.95;

    // Matnni tozalash
    let cleanText = text
      .replace(/:::image-card[\s\S]*?:::/g, '')
      .replace(/```reminder[\s\S]*?```/g, 'Eslatmani tayyorladim.')
      .replace(/```[\s\S]*?```/g, 'Kodni chatda ko‘rishingiz mumkin.')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/[#*_`~>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      cleanText = "Javob tayyorlandi, chatda ko'rishingiz mumkin.";
    }

    if (this.transcriptBox) {
      this.transcriptBox.innerHTML = `<strong>AI:</strong> ${this.escapeHtml(cleanText.slice(0, 180))}${cleanText.length > 180 ? '...' : ''}`;
    }

    // AI gapirayotganda ham mikrofon orqali tinglab turamiz (foydalanuvchi bo'lsa darhol to'xtash uchun)
    if (!this.isListening) {
      this.startListening();
    }

    // 1. OpenAI TTS orqali tiniq, ravon va tabiiy o'zbek ovozi
    try {
      const apiKey = localStorage.getItem('personal_ai_key') || (window.appState ? window.appState.apiKey : '') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const res = await fetch('/api/speak', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: cleanText.slice(0, 1000), voice: 'nova' })
      });

      if (res.ok) {
        const audioBlob = await res.blob();
        // Agar audio kelguncha foydalanuvchi to'xtatgan bo'lsa
        if (!this.isSpeaking) return;

        const audioUrl = URL.createObjectURL(audioBlob);
        this.currentAudio = new Audio(audioUrl);

        const wavePulseInterval = setInterval(() => {
          if (this.isSpeaking) {
            this.targetIntensity = 0.65 + Math.random() * 0.35;
          } else {
            clearInterval(wavePulseInterval);
          }
        }, 100);

        this.currentAudio.onended = () => {
          clearInterval(wavePulseInterval);
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          this.isSpeaking = false;
          this.updateStatus('Tinglashga tayyorman... Gapiring!', '#10b981');
          this.targetIntensity = 0.45;
          // Audio tugagach mikrofon yana eshitishga to'liq tayyor
          this.startListening();
        };

        this.currentAudio.onerror = (e) => {
          clearInterval(wavePulseInterval);
          console.warn('Audio ijro xatosi, brauzer ovoziga o‘tilmoqda:', e);
          this.fallbackSpeechSynthesis(cleanText);
        };

        await this.currentAudio.play();
        return;
      }
    } catch (err) {
      console.warn('OpenAI TTS ulanishida xatolik, brauzer ovoziga o‘tilmoqda:', err);
    }

    // 2. Fallback: brauzer ovozi
    this.fallbackSpeechSynthesis(cleanText);
  }

  fallbackSpeechSynthesis(cleanText) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'uz-UZ';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const uzVoice = voices.find(v => v.lang.includes('uz') || v.lang.includes('tr'));
      if (uzVoice) utterance.voice = uzVoice;

      utterance.onend = () => {
        this.isSpeaking = false;
        this.updateStatus('Tinglashga tayyorman... Gapiring!', '#10b981');
        this.targetIntensity = 0.45;
        this.startListening();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.targetIntensity = 0.2;
        this.startListening();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      this.isSpeaking = false;
      this.updateStatus('Tinglashga tayyorman... Gapiring!', '#10b981');
      this.targetIntensity = 0.3;
      this.startListening();
    }
  }

  stopSpeaking() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.targetIntensity = 0.3;
  }

  // Siri Animation Loop
  startAnimationLoop() {
    if (this.animationFrameId) return;

    const render = (time) => {
      this.renderSiriVisuals(time);
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  renderSiriVisuals(time = 0) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const width = this.logicalW || 360;
    const height = this.logicalH || 120;
    const cx = width / 2;
    const cy = height / 2;

    // Mikrofon signallarini tahlil qilish
    if (this.analyser && this.dataArray && this.isListening) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < 28; i++) {
        sum += this.dataArray[i];
      }
      const avg = sum / 28;
      this.audioLevel = avg / 130;

      // Agar AI gapirayotganda foydalanuvchi mikrofonga qattiq gapirsa (VAD threshold)
      if (this.isSpeaking && this.audioLevel > 0.48) {
        console.log('Ovoz balandligi orqali AI to‘xtatildi (VAD)');
        this.interruptAI();
      }

      if (!this.isSpeaking && !this.isThinking) {
        this.targetIntensity = Math.max(0.25, Math.min(1.2, 0.25 + this.audioLevel * 1.2));
      }
    } else if (this.isSpeaking) {
      const vocalRhythm = Math.sin(time * 0.008) * 0.28 + Math.sin(time * 0.02) * 0.18;
      this.targetIntensity = 0.75 + vocalRhythm;
    } else if (this.isThinking) {
      this.targetIntensity = 0.55 + Math.sin(time * 0.009) * 0.25;
    } else {
      this.targetIntensity = 0.22 + Math.sin(time * 0.003) * 0.07;
    }

    this.intensity += (this.targetIntensity - this.intensity) * 0.14;
    this.phase += 0.035 + (this.intensity * 0.045);

    ctx.clearRect(0, 0, width, height);

    // 1. Markaziy Siri Core Glow
    const baseRadius = 26 + (this.intensity * 16);
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseRadius * 1.9);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    grad.addColorStop(0.25, 'rgba(6, 182, 212, 0.85)');
    grad.addColorStop(0.55, 'rgba(168, 85, 247, 0.65)');
    grad.addColorStop(0.85, 'rgba(236, 72, 153, 0.4)');
    grad.addColorStop(1, 'rgba(236, 72, 153, 0)');

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 2. Neon garmonik to'lqin chiziqlari
    const step = 4;
    for (const w of this.waves) {
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = w.width;
      ctx.strokeStyle = w.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = w.color;
      ctx.shadowBlur = 12;

      for (let x = 0; x <= width; x += step) {
        const normX = (x - cx) / (width / 2);
        const envelope = Math.max(0, 1 - Math.pow(normX, 2));
        const waveOffset = Math.sin(x * 0.025 * w.freq + this.phase * w.speed * 22) * (22 * this.intensity * w.ampMult) * envelope;
        const y = cy + waveOffset;

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Yonuvchi mikro-zarrachalar
    ctx.save();
    for (const p of this.particles) {
      p.angle += p.speed * (0.85 + this.intensity);
      const px = cx + Math.cos(p.angle) * (p.dist * (0.7 + this.intensity * 0.45));
      const py = cy + Math.sin(p.angle) * (p.dist * 0.45 * (0.7 + this.intensity * 0.45));

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color + (p.alpha * Math.min(1, this.intensity * 1.4)) + ')';
      ctx.fill();
    }
    ctx.restore();
  }
}

// Global instansiya
document.addEventListener('DOMContentLoaded', () => {
  window.voiceOrb = new VoiceOrbController();
});
