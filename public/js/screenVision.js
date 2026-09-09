/**
 * Screen Vision Controller
 * Ekranni ulashish (getDisplayMedia), snapshot olish va GPT-4o Vision bilan tahlil qilish
 */

class ScreenVisionController {
  constructor() {
    this.mediaStream = null;
    this.currentSnapshot = null;

    this.visionBtn = document.getElementById('toggleVisionBtn');
    this.visionBtnText = document.getElementById('visionBtnText');
    this.pipPanel = document.getElementById('screenPipPanel');
    this.pipVideo = document.getElementById('screenPipVideo');
    this.closePipBtn = document.getElementById('closeScreenPipBtn');
    this.analyzePipBtn = document.getElementById('analyzePipScreenBtn');
    this.attachPipBtn = document.getElementById('attachPipToInputBtn');
    this.directCaptureBtn = document.getElementById('captureScreenDirectBtn');

    this.attachmentBadge = document.getElementById('screenAttachmentBadge');
    this.attachedScreenImg = document.getElementById('attachedScreenImg');
    this.removeAttachmentBtn = document.getElementById('removeAttachedScreenBtn');

    this.initEvents();
  }

  initEvents() {
    // Navbardagi "Ekranni Ko'rish" tugmasi
    this.visionBtn?.addEventListener('click', () => {
      if (this.mediaStream) {
        this.stopScreenShare();
      } else {
        this.startScreenShare();
      }
    });

    // PiP oynasini yopish
    this.closePipBtn?.addEventListener('click', () => {
      this.stopScreenShare();
    });

    // PiP dagi "Ekranni Tahlil Qil" tugmasi
    this.analyzePipBtn?.addEventListener('click', () => {
      this.analyzeCurrentScreenDirectly();
    });

    // PiP dagi "Chatga Biriktir" tugmasi
    this.attachPipBtn?.addEventListener('click', () => {
      const snap = this.captureSnapshot();
      if (snap) {
        this.attachSnapshotToInput(snap);
      }
    });

    // Input maydonidagi kamera tugmasi (tezkor snapshot yoki rasm yuklash)
    const mobileFileInput = document.getElementById('mobileImageUploadInput');
    
    // Foydalanuvchi fayl/rasm tanlaganda
    mobileFileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Image = event.target.result;
        this.attachSnapshotToInput(base64Image);
      };
      reader.readAsDataURL(file);
    });

    this.directCaptureBtn?.addEventListener('click', async () => {
      // Agar mobil qurilma bo'lsa yoki ekran ulashish mavjud bo'lmasa, to'g'ridan-to'g'ri fayl/kamera tanlashni ochamiz
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      if (isMobile) {
        mobileFileInput?.click();
      } else {
        if (!this.mediaStream) {
          const started = await this.startScreenShare();
          if (!started) return;
          setTimeout(() => {
            const snap = this.captureSnapshot();
            if (snap) this.attachSnapshotToInput(snap);
          }, 500);
        } else {
          const snap = this.captureSnapshot();
          if (snap) this.attachSnapshotToInput(snap);
        }
      }
    });

    // Navbardagi "Ko'rish" tugmasi ham mobilda rasm/kamera yuklashni taklif qiladi
    this.visionBtn?.addEventListener('click', () => {
      const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && !navigator.mediaDevices?.getDisplayMedia) {
        mobileFileInput?.click();
        return;
      }

      if (this.mediaStream) {
        this.stopScreenShare();
      } else {
        this.startScreenShare();
      }
    });

    // Biriktirilgan rasmni olib tashlash
    this.removeAttachmentBtn?.addEventListener('click', () => {
      this.clearAttachedSnapshot();
    });
  }

  async startScreenShare() {
    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          cursor: 'always'
        },
        audio: false
      });

      if (this.pipVideo) {
        this.pipVideo.srcObject = this.mediaStream;
      }

      this.pipPanel?.classList.add('active');
      this.visionBtn?.classList.add('active');
      if (this.visionBtnText) this.visionBtnText.textContent = 'Ekran Faol';

      // Foydalanuvchi tizim paneli orqali ulashishni to'xtatsa
      this.mediaStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      return true;
    } catch (err) {
      console.warn('Ekran ulashish bekor qilindi yoki xatolik:', err);
      return false;
    }
  }

  stopScreenShare() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.pipVideo) {
      this.pipVideo.srcObject = null;
    }

    this.pipPanel?.classList.remove('active');
    this.visionBtn?.classList.remove('active');
    if (this.visionBtnText) this.visionBtnText.textContent = 'Ekranni Ko‘rish';
  }

  captureSnapshot() {
    if (!this.pipVideo || !this.mediaStream) {
      alert('Iltimos, avval ekranni ulashing!');
      return null;
    }

    const video = this.pipVideo;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Image = canvas.toDataURL('image/jpeg', 0.85);
    return base64Image;
  }

  attachSnapshotToInput(base64Image) {
    this.currentSnapshot = base64Image;
    if (this.attachedScreenImg) {
      this.attachedScreenImg.src = base64Image;
    }
    if (this.attachmentBadge) {
      this.attachmentBadge.style.display = 'flex';
    }
    document.getElementById('messageInput')?.focus();
  }

  clearAttachedSnapshot() {
    this.currentSnapshot = null;
    if (this.attachmentBadge) {
      this.attachmentBadge.style.display = 'none';
    }
    if (this.attachedScreenImg) {
      this.attachedScreenImg.src = '';
    }
  }

  async analyzeCurrentScreenDirectly() {
    const snap = this.captureSnapshot();
    if (!snap) return;

    const promptText = 'Iltimos, hozirgi ekranimga qarang. Unda qanday kod, xato yoki interfeys ko‘rinmoqda? Nima xato bo‘lishi mumkin va qanday tuzatishni tavsiya qilasiz?';
    
    // Chatga xabar sifatida jo'natish
    window.dispatchEvent(new CustomEvent('send-screen-message', {
      detail: {
        content: promptText,
        image: snap
      }
    }));
  }
}

// Global obyekt sifatida eksport
window.screenVision = new ScreenVisionController();
