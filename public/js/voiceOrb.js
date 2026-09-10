/**
 * zayniddin_ai - Siri Style Voice & Wave Orb Controller
 * iOS 18 Siri uslubidagi ko'p qatlamli, neon nurlanuvchi va ovozga sezgir to'lqin animatsiyasi
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

    // Siri Wave Parameters
    this.phase = 0;
    this.intensity = 0.2;
    this.targetIntensity = 0.2;
    this.audioLevel = 0;

    // Siri Wave Configuration (Layers of chromatic harmonic waves)
    this.waves = [
      { color: 'rgba(6, 182, 212, 0.75)', freq: 2.5, speed: 0.05, ampMult: 1.0, width: 3.5 },   // Cyan
      { color: 'rgba(59, 130, 246, 0.8)', freq: 3.2, speed: -0.04, ampMult: 0.85, width: 3.0 },  // Electric Blue
      { color: 'rgba(168, 85, 247, 0.8)', freq: 2.0, speed: 0.06, ampMult: 0.9, width: 3.5 },   // Neon Purple
      { color: 'rgba(236, 72, 153, 0.85)', freq: 3.8, speed: -0.05, ampMult: 0.75, width: 2.8 }, // Hot Magenta
      { color: 'rgba(255, 255, 255, 0.9)', freq: 4.5, speed: 0.07, ampMult: 0.5, width: 2.0 }   // White / Core Glow
    ];

    // Floating particles
    this.particles = [];
    this.initParticles();

    this.initCanvas();
    this.initSpeechRecognition();
    this.initEvents();
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < 28; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        dist: 40 + Math.random() * 80,
        speed: 0.005 + Math.random() * 0.015,
        size: 1.2 + Math.random() * 2.4,
        color: i % 2 === 0 ? 'rgba(6, 182, 212, ' : 'rgba(236, 72, 153, ',
        alpha: 0.2 + Math.random() * 0.6
      });
    }
  }

  initCanvas() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const logicalW = rect.width > 0 ? rect.width : 360;
    const logicalH = 320;

    this.canvas.width = logicalW * dpr;
    this.canvas.height = logicalH * dpr;
    this.ctx.scale(dpr, dpr);
    this.logicalW = logicalW;
    this.logicalH = logicalH;
  }

  async initMicrophoneAudio() {
    if (this.audioContext) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioContext = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    } catch (err) {
      console.warn('Mikrofon audio analizatoriga ulanmadi (ixtiyoriy):', err);
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'uz-UZ';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.isThinking = false;
        this.updateStatus('Eshityapman... Marhamat, gapiring!', '#06b6d4');
        this.micToggleBtn?.classList.add('mic-active');
        this.targetIntensity = 0.6;
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (this.transcriptBox) {
          this.transcriptBox.textContent = `"${transcript}"`;
        }

        // Nutq tugagach avtomatik yuborish
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
        this.targetIntensity = 0.2;
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.micToggleBtn?.classList.remove('mic-active');
        if (!this.isSpeaking && !this.isThinking) {
          this.targetIntensity = 0.2;
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
    this.initCanvas();
    this.initMicrophoneAudio();
    this.startListening();
    this.startAnimationLoop();
  }

  closeModal() {
    this.modal?.classList.remove('active');
    this.stopListening();
    this.stopSpeaking();
    this.isThinking = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  startListening() {
    if (this.recognition && !this.isListening) {
      try {
        this.stopSpeaking();
        this.isThinking = false;
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
    this.isThinking = true;
    this.updateStatus('zayniddin_ai o‘ylamoqda...', '#a855f7');
    this.targetIntensity = 0.7;

    try {
      const activeChatId = window.appState?.activeChatId;
      const apiKey = localStorage.getItem('personal_ai_key') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      let targetChatId = activeChatId;
      if (!targetChatId) {
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

      const res = await fetch(`/api/chats/${targetChatId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: userText })
      });

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

      window.dispatchEvent(new CustomEvent('refresh-active-chat'));

      this.isThinking = false;
      this.speakText(assistantReply);

    } catch (err) {
      console.error('Ovozli suhbatda xatolik:', err);
      this.isThinking = false;
      this.updateStatus('Xatolik: ' + err.message, '#f43f5e');
      this.targetIntensity = 0.2;
    }
  }

  async speakText(text) {
    if (!text) return;
    this.stopSpeaking();
    this.isSpeaking = true;
    this.updateStatus('zayniddin_ai javob bermoqda...', '#38bdf8');
    this.targetIntensity = 0.95;

    const cleanText = text.replace(/```[\s\S]*?```/g, 'Mana bu kod blokini chatda ko‘rishingiz mumkin.')
                          .replace(/[#*_`]/g, '')
                          .trim();

    // 1. OpenAI TTS orqali tiniq, ravon va tabiiy o'zbek ovozi
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (window.appState && window.appState.apiKey) {
        headers['x-api-key'] = window.appState.apiKey;
      }

      const res = await fetch('/api/speak', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: cleanText, voice: 'nova' })
      });

      if (res.ok) {
        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        this.currentAudio = new Audio(audioUrl);

        // Ovoz to'lqinlari dinamik harakati (Siri animatsiyasi)
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
          this.updateStatus('Tinglashga tayyorman', '#10b981');
          this.targetIntensity = 0.2;
          setTimeout(() => {
            if (this.modal?.classList.contains('active')) {
              this.startListening();
            }
          }, 400);
        };

        this.currentAudio.onerror = (e) => {
          clearInterval(wavePulseInterval);
          console.warn('Audio ijro xatoligi:', e);
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
        this.updateStatus('Tinglashga tayyorman', '#10b981');
        this.targetIntensity = 0.2;
        setTimeout(() => {
          if (this.modal?.classList.contains('active')) {
            this.startListening();
          }
        }, 600);
      };

      utterance.onerror = (e) => {
        console.warn('TTS xatoligi:', e);
        this.isSpeaking = false;
        this.targetIntensity = 0.2;
      };

      window.speechSynthesis.speak(utterance);
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
    this.targetIntensity = 0.2;
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
    const height = this.logicalH || 320;
    const cx = width / 2;
    const cy = height / 2;

    // Real audio frequency check
    if (this.analyser && this.dataArray && this.isListening) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < 32; i++) {
        sum += this.dataArray[i];
      }
      const avg = sum / 32;
      this.audioLevel = avg / 140; // normalized 0..1
      this.targetIntensity = Math.max(0.25, Math.min(1.2, 0.2 + this.audioLevel * 1.1));
    } else if (this.isSpeaking) {
      // Dynamic vocal cadence for AI speech
      const vocalRhythm = Math.sin(time * 0.007) * 0.3 + Math.sin(time * 0.018) * 0.2;
      this.targetIntensity = 0.75 + vocalRhythm;
    } else if (this.isThinking) {
      // Hypnotic rotating pulse for thinking
      this.targetIntensity = 0.55 + Math.sin(time * 0.009) * 0.25;
    } else {
      // Idle breathing
      this.targetIntensity = 0.22 + Math.sin(time * 0.003) * 0.08;
    }

    // Smooth lerp intensity
    this.intensity += (this.targetIntensity - this.intensity) * 0.12;
    this.phase += 0.035 + (this.intensity * 0.04);

    ctx.clearRect(0, 0, width, height);

    // 1. Siri Core Radial Iris Plasma Glow
    const baseRadius = 55 + (this.intensity * 25);
    const auraGradient = ctx.createRadialGradient(cx, cy, 5, cx, cy, baseRadius * 1.9);
    
    if (this.isThinking) {
      auraGradient.addColorStop(0, `rgba(168, 85, 247, ${0.85 * this.intensity})`);
      auraGradient.addColorStop(0.5, `rgba(236, 72, 153, ${0.45 * this.intensity})`);
    } else if (this.isSpeaking) {
      auraGradient.addColorStop(0, `rgba(6, 182, 212, ${0.9 * this.intensity})`);
      auraGradient.addColorStop(0.5, `rgba(99, 102, 241, ${0.5 * this.intensity})`);
    } else {
      auraGradient.addColorStop(0, `rgba(59, 130, 246, ${0.75 * this.intensity})`);
      auraGradient.addColorStop(0.5, `rgba(147, 51, 234, ${0.4 * this.intensity})`);
    }
    auraGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.save();
    ctx.fillStyle = auraGradient;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Rotating Orbital Particles
    ctx.save();
    for (let p of this.particles) {
      p.angle += p.speed * (1 + this.intensity * 1.5);
      const px = cx + Math.cos(p.angle) * (p.dist + this.intensity * 15);
      const py = cy + Math.sin(p.angle) * (p.dist * 0.65);
      ctx.fillStyle = `${p.color}${p.alpha * Math.min(1, this.intensity * 1.4)})`;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Apple Siri Multi-Layered Undulating Chromatic Waves
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // Generates glowing Siri light blend

    const step = 2;
    const maxAmp = 42 * this.intensity;

    this.waves.forEach((w, index) => {
      ctx.beginPath();
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const wavePhase = this.phase * (w.speed * 28) + (index * 1.3);
      let started = false;

      for (let x = 0; x <= width; x += step) {
        // Normalized x (-1 to 1)
        const nx = (x / width) * 2 - 1;
        // Quartic bell curve envelope: tapers to 0 at edges, peaks at center
        const envelope = Math.pow(Math.max(0, 1 - nx * nx), 2.2);

        // Sinusoidal harmonics
        const harmonic1 = Math.sin(nx * w.freq * 2.4 + wavePhase);
        const harmonic2 = Math.cos(nx * (w.freq * 1.7) - wavePhase * 0.8) * 0.4;
        const harmonic3 = Math.sin(nx * (w.freq * 3.1) + wavePhase * 1.2) * 0.2;

        const y = cy + envelope * maxAmp * w.ampMult * (harmonic1 + harmonic2 + harmonic3);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });

    // 4. Center Glowing Bright Iris Core
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.7);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    coreGrad.addColorStop(0.3, 'rgba(6, 182, 212, 0.7)');
    coreGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.35)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// Global obyekt sifatida eksport
window.voiceOrb = new VoiceOrbController();
