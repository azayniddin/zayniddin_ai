/**
 * Voice Orb & Audio Speech Controller
 * Canvas orqali futuristik ovoz to'lqinlari sferasi va O'zbekcha jonli so'zlashuv
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
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.animationFrameId = null;

    this.orbRadius = 75;
    this.baseHue = 240; // Neon Indigo / Cyan / Purple
    this.intensity = 0.2;

    this.initCanvas();
    this.initSpeechRecognition();
    this.initEvents();
  }

  initCanvas() {
    if (!this.canvas) return;
    this.canvas.width = 300;
    this.canvas.height = 300;
    this.renderOrb();
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'uz-UZ'; // O'zbek tili

      this.recognition.onstart = () => {
        this.isListening = true;
        this.updateStatus('Eshityapman... Marhamat, gapiring!', '#10b981');
        this.micToggleBtn?.classList.add('mic-active');
        this.intensity = 0.6;
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (this.transcriptBox) {
          this.transcriptBox.textContent = `"${transcript}"`;
        }

        // Agar nutq tugagan bo'lsa (isFinal)
        if (event.results[0].isFinal) {
          this.handleVoiceCommand(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          this.updateStatus(`Ovoz xatosi: ${event.error}`, '#f43f5e');
        }
        this.isListening = false;
        this.micToggleBtn?.classList.remove('mic-active');
        this.intensity = 0.2;
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.micToggleBtn?.classList.remove('mic-active');
        if (!this.isSpeaking) {
          this.intensity = 0.2;
        }
      };
    } else {
      console.warn('Brauzerda Web Speech API qo‘llab-quvvatlanmaydi.');
    }
  }

  initEvents() {
    this.micToggleBtn?.addEventListener('click', () => {
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });

    this.stopSpeechBtn?.addEventListener('click', () => {
      this.stopSpeaking();
    });

    document.getElementById('openVoiceModalBtn')?.addEventListener('click', () => {
      this.openModal();
    });

    document.getElementById('closeVoiceModalBtn')?.addEventListener('click', () => {
      this.closeModal();
    });
  }

  openModal() {
    this.modal?.classList.add('active');
    this.startListening();
    this.startAudioVisualization();
  }

  closeModal() {
    this.modal?.classList.remove('active');
    this.stopListening();
    this.stopSpeaking();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  startListening() {
    if (this.recognition && !this.isListening) {
      try {
        this.stopSpeaking();
        this.recognition.start();
      } catch (err) {
        console.warn('Recognition start xatoligi:', err);
      }
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      this.micToggleBtn?.classList.remove('mic-active');
    }
  }

  updateStatus(text, color = '#cbd5e1') {
    if (this.statusText) {
      this.statusText.textContent = text;
      this.statusText.style.color = color;
    }
  }

  async handleVoiceCommand(userText) {
    if (!userText.trim()) return;

    this.stopListening();
    this.updateStatus('AI javob tayyorlamoqda...', '#38bdf8');
    this.intensity = 0.4;

    try {
      // Agar chat mavjud bo'lmasa yoki aktiv chatni olamiz
      const activeChatId = window.appState?.activeChatId;
      const apiKey = localStorage.getItem('personal_ai_key') || '';

      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      // Server orqali tezkor javob olish
      let targetChatId = activeChatId;
      if (!targetChatId) {
        // Yangi chat yaratish
        const newChatRes = await fetch('/api/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title: userText.slice(0, 30) })
        });
        const newChat = await newChatRes.json();
        targetChatId = newChat.id;
        window.appState.activeChatId = newChat.id;
        window.dispatchEvent(new CustomEvent('refresh-chats'));
      }

      // Xabarni chat oqimiga ham qo'shamiz
      const res = await fetch(`/api/chats/${targetChatId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: userText })
      });

      // Streamni o'qib matn yig'amiz
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              if (data.chunk) assistantReply += data.chunk;
            } catch (e) {}
          }
        }
      }

      if (this.transcriptBox) {
        this.transcriptBox.textContent = assistantReply;
      }

      // Chat oynasini yangilash
      window.dispatchEvent(new CustomEvent('refresh-active-chat'));

      // AI ning o'zbek tilida gapirishi
      this.speakText(assistantReply);

    } catch (err) {
      console.error('Ovozli suhbatda xatolik:', err);
      this.updateStatus('Xatolik yuz berdi: ' + err.message, '#f43f5e');
    }
  }

  speakText(text) {
    if (!text) return;
    this.stopSpeaking();
    this.isSpeaking = true;
    this.updateStatus('AI gapirmoqda...', '#a855f7');
    this.intensity = 0.9;

    // Toza matn (kod bloklari yoki belgilarni tozalash)
    const cleanText = text.replace(/```[\s\S]*?```/g, 'Mana bu kod blokini chatda ko‘rishingiz mumkin.')
                          .replace(/[#*_`]/g, '');

    // Web Speech Synthesis (brauzer ovozi)
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'uz-UZ';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Mavjud o'zbekcha yoki turkiy/ruscha yaxshi ovozni topish
      const voices = window.speechSynthesis.getVoices();
      const uzVoice = voices.find(v => v.lang.includes('uz') || v.lang.includes('tr'));
      if (uzVoice) utterance.voice = uzVoice;

      utterance.onend = () => {
        this.isSpeaking = false;
        this.updateStatus('Tinglashga tayyorman', '#10b981');
        this.intensity = 0.2;
        // Avtomatik qayta tinglashni yoqish
        setTimeout(() => {
          if (this.modal?.classList.contains('active')) {
            this.startListening();
          }
        }, 600);
      };

      utterance.onerror = (e) => {
        console.warn('TTS xatoligi:', e);
        this.isSpeaking = false;
        this.intensity = 0.2;
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.intensity = 0.2;
  }

  // Canvas Orb Visualization Loop
  startAudioVisualization() {
    const render = (time) => {
      this.renderOrb(time);
      this.animationFrameId = requestAnimationFrame(render);
    };
    this.animationFrameId = requestAnimationFrame(render);
  }

  renderOrb(time = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    const pulse = Math.sin(time * 0.003) * 6;
    const dynamicRadius = this.orbRadius + (this.intensity * 25) + pulse;

    // Orqa fon nurlanishi (Ambient Glow)
    const glowGradient = ctx.createRadialGradient(cx, cy, dynamicRadius * 0.2, cx, cy, dynamicRadius * 1.8);
    glowGradient.addColorStop(0, `rgba(99, 102, 241, ${0.4 * this.intensity})`);
    glowGradient.addColorStop(0.5, `rgba(168, 85, 247, ${0.25 * this.intensity})`);
    glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, dynamicRadius * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Asosiy Orb sferasi
    const orbGradient = ctx.createRadialGradient(
      cx - dynamicRadius * 0.3, 
      cy - dynamicRadius * 0.3, 
      dynamicRadius * 0.1, 
      cx, 
      cy, 
      dynamicRadius
    );
    orbGradient.addColorStop(0, '#38bdf8');
    orbGradient.addColorStop(0.4, '#6366f1');
    orbGradient.addColorStop(0.8, '#a855f7');
    orbGradient.addColorStop(1, '#3b0764');

    ctx.fillStyle = orbGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, dynamicRadius, 0, Math.PI * 2);
    ctx.fill();

    // To'lqinli qatlamlar (Wave Rings)
    const wavesCount = 3;
    for (let i = 0; i < wavesCount; i++) {
      const ringRadius = dynamicRadius + (i * 14) + (Math.sin(time * 0.004 + i) * 6);
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 / (i + 1)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

// Global obyekt sifatida eksport
window.voiceOrb = new VoiceOrbController();
