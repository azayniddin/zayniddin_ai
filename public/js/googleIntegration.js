/**
 * Google Workspace & Ecosystem Integration
 * zerikdim_ai - Google Vositalari (Calendar, Drive, Docs, Sheets, Keep, Gmail) Hub
 */

class GoogleIntegrationManager {
  constructor() {
    this.modal = null;
    this.connectedEmail = localStorage.getItem('zerikdim_google_email') || '';
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.modal = document.getElementById('googleModal');
      this.setupEventListeners();
      this.renderAccountStatus();
    });
  }

  setupEventListeners() {
    const openBtn = document.getElementById('openGoogleModalBtn');
    const closeBtn = document.getElementById('closeGoogleModalBtn');
    const saveEmailBtn = document.getElementById('saveGoogleEmailBtn');
    const emailInput = document.getElementById('googleEmailInput');

    openBtn?.addEventListener('click', () => this.openModal());
    closeBtn?.addEventListener('click', () => this.closeModal());
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    saveEmailBtn?.addEventListener('click', () => {
      const email = emailInput ? emailInput.value.trim() : '';
      if (email) {
        this.connectedEmail = email;
        localStorage.setItem('zerikdim_google_email', email);
        this.renderAccountStatus();
      }
    });

    // Tezkor AI so'rov chiplari
    document.querySelectorAll('.google-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt && window.sendMessage) {
          this.closeModal();
          const messageInput = document.getElementById('messageInput');
          if (messageInput) {
            messageInput.value = prompt;
          }
          window.sendMessage(prompt);
        }
      });
    });
  }

  openModal() {
    if (!this.modal) return;
    this.modal.classList.add('active');
    const emailInput = document.getElementById('googleEmailInput');
    if (emailInput) {
      emailInput.value = this.connectedEmail;
    }
    this.renderAccountStatus();
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.remove('active');
  }

  renderAccountStatus() {
    const statusText = document.getElementById('googleAccountStatusText');
    const statusDot = document.getElementById('googleAccountStatusDot');
    if (this.connectedEmail) {
      if (statusText) statusText.innerHTML = `Ulangan: <strong>${this.escapeHtml(this.connectedEmail)}</strong>`;
      if (statusDot) {
        statusDot.style.background = '#10b981';
        statusDot.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.6)';
      }
    } else {
      if (statusText) statusText.textContent = 'Google hisobi ulanmagan';
      if (statusDot) {
        statusDot.style.background = '#94a3b8';
        statusDot.style.boxShadow = 'none';
      }
    }
  }

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }
}

// Global yuklash
window.googleIntegration = new GoogleIntegrationManager();
