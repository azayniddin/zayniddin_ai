/**
 * AI Art / Image Generator & Lightbox Viewer
 * FLUX.1 orqali rasm chizish, to'liq ekranda ko'rish va telefonga yuklab olish
 */

class ArtGeneratorManager {
  constructor() {
    this.modal = null;
    this.lightbox = null;
    this.selectedStyle = 'Fotorealistik';
    this.selectedRatio = '1:1';
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.modal = document.getElementById('drawModal');
      this.lightbox = document.getElementById('imageLightbox');
      this.setupEventListeners();
    });
  }

  setupEventListeners() {
    const openDrawModalBtn = document.getElementById('openDrawModalBtn');
    const closeDrawModalBtn = document.getElementById('closeDrawModalBtn');
    const cancelDrawBtn = document.getElementById('cancelDrawBtn');
    const submitDrawBtn = document.getElementById('submitDrawBtn');

    openDrawModalBtn?.addEventListener('click', () => this.openModal());
    closeDrawModalBtn?.addEventListener('click', () => this.closeModal());
    cancelDrawBtn?.addEventListener('click', () => this.closeModal());
    submitDrawBtn?.addEventListener('click', () => this.handleGenerate());

    // Uslub (Style) tugmalari
    document.querySelectorAll('.draw-style-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.draw-style-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedStyle = chip.getAttribute('data-style');
      });
    });

    // Nisbat (Aspect ratio) tugmalari
    document.querySelectorAll('.draw-ratio-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.draw-ratio-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedRatio = chip.getAttribute('data-ratio');
      });
    });

    // Lightbox yopish
    const closeLightboxBtn = document.getElementById('closeLightboxBtn');
    closeLightboxBtn?.addEventListener('click', () => this.closeLightbox());
    this.lightbox?.addEventListener('click', (e) => {
      if (e.target === this.lightbox) this.closeLightbox();
    });
  }

  openModal() {
    if (this.modal) {
      this.modal.classList.add('active');
      const input = document.getElementById('drawPromptInput');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 150);
      }
    }
  }

  closeModal() {
    this.modal?.classList.remove('active');
  }

  async handleGenerate() {
    const input = document.getElementById('drawPromptInput');
    const prompt = input?.value.trim();
    if (!prompt) {
      alert('Iltimos, qanday rasm chizish kerakligini yozing!');
      return;
    }

    const submitBtn = document.getElementById('submitDrawBtn');
    const origHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> <span>Chizilmoqda...</span>';
    if (window.lucide) lucide.createIcons();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (window.appState && window.appState.apiKey) {
        headers['x-api-key'] = window.appState.apiKey;
      }

      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          style: this.selectedStyle,
          aspectRatio: this.selectedRatio,
          chatId: window.appState?.activeChatId
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server xatosi: ${res.status}`);
      }

      const data = await res.json();
      this.closeModal();

      // Agar chat mavjud bo'lsa chatni yangilash
      if (window.appState?.activeChatId) {
        window.dispatchEvent(new CustomEvent('refresh-active-chat'));
      }

      // Rasmni darhol to'liq ekranda ko'rsatish
      this.openLightbox(data.imageUrl, prompt);

    } catch (err) {
      alert('Rasm chizishda xatolik: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origHtml;
      if (window.lucide) lucide.createIcons();
    }
  }

  // Markdown ichidagi :::image-card ::: bloklarini interaktiv kartochkaga aylantirish
  parseImageCards(content) {
    if (!content) return content;
    const regex = /:::image-card\s*([\s\S]*?)\s*:::/g;
    return content.replace(regex, (match, jsonStr) => {
      try {
        const data = JSON.parse(jsonStr.trim());
        return this.renderImageCardHtml(data);
      } catch (e) {
        console.warn('Image-card JSON parse error:', e);
        return '';
      }
    });
  }

  renderImageCardHtml(data) {
    const imageUrl = data.imageUrl || '';
    const prompt = data.prompt || 'AI Tasvir';
    const safePrompt = prompt.replace(/'/g, "\\'");
    const filename = `zayniddin_ai_${Date.now()}.jpg`;

    return `
      <div class="ai-image-showcase glass-card">
        <div class="ai-image-wrapper" onclick="window.artGenerator.openLightbox('${imageUrl}', '${safePrompt}')">
          <img src="${imageUrl}" alt="${prompt}" class="ai-generated-img" loading="lazy" />
          <div class="ai-image-overlay">
            <span class="ai-image-zoom-badge"><i data-lucide="maximize-2" style="width: 16px; height: 16px;"></i> Kattalashtirish</span>
          </div>
        </div>
        <div class="ai-image-meta">
          <div class="ai-image-prompt-text">🎨 ${prompt}</div>
          <div class="ai-image-actions">
            <button class="ai-img-btn download-btn" onclick="window.artGenerator.downloadImage('${imageUrl}', '${filename}')" title="Telefonga yuklab olish">
              <i data-lucide="download" style="width: 15px; height: 15px;"></i>
              <span>Yuklab olish</span>
            </button>
            <button class="ai-img-btn view-btn" onclick="window.artGenerator.openLightbox('${imageUrl}', '${safePrompt}')" title="To'liq ekranda ko'rish">
              <i data-lucide="expand" style="width: 15px; height: 15px;"></i>
              <span>Ko‘rish</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  openLightbox(imageUrl, title) {
    if (!this.lightbox) return;
    const imgEl = document.getElementById('lightboxImg');
    const titleEl = document.getElementById('lightboxTitle');
    const dlBtn = document.getElementById('lightboxDownloadBtn');

    if (imgEl) imgEl.src = imageUrl;
    if (titleEl) titleEl.textContent = title || 'AI Tasvir';
    if (dlBtn) {
      dlBtn.onclick = () => this.downloadImage(imageUrl, `zayniddin_ai_${Date.now()}.jpg`);
    }

    this.lightbox.classList.add('active');
  }

  closeLightbox() {
    this.lightbox?.classList.remove('active');
  }

  async downloadImage(imageUrl, filename) {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'zayniddin_ai_art.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      // Fallback: yangi oynada ochish
      window.open(imageUrl, '_blank');
    }
  }
}

window.artGenerator = new ArtGeneratorManager();
