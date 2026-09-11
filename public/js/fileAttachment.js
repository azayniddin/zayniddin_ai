/**
 * File Attachment Manager
 * Rasmlar, PDF hujjatlar va fayllarni yuklash, oldindan ko'rish va boshqarish
 */

class FileAttachmentManager {
  constructor() {
    this.attachments = [];
    this.attachBtn = document.getElementById('attachFileBtn');
    this.fileInput = document.getElementById('fileUploadInput');
    this.previewContainer = document.getElementById('attachmentPreviewContainer');
    this.attachmentList = document.getElementById('attachmentList');

    this.init();
  }

  init() {
    if (this.attachBtn && this.fileInput) {
      this.attachBtn.addEventListener('click', () => {
        this.fileInput.click();
      });

      this.fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
          this.handleFiles(files);
        }
        this.fileInput.value = ''; // Reset input to allow selecting same file again
      });
    }

    // Drag & Drop hodisalari
    const dropZone = document.querySelector('.chat-input-area') || document.body;
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = Array.from(dt?.files || []);
      if (files.length > 0) {
        this.handleFiles(files);
      }
    });

    // Clipboard Paste (Ctrl+V / Cmd+V orqali skrinshot yoki rasm qo'shish)
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1 || items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length > 0) {
        this.handleFiles(pastedFiles);
      }
    });
  }

  async handleFiles(files) {
    for (const file of files) {
      // 25 MB gacha hajm chegarasi
      if (file.size > 25 * 1024 * 1024) {
        alert(`"${file.name}" hajmi juda katta (maksimal 25MB).`);
        continue;
      }

      const id = 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
      const isWord = /\.(docx|doc)$/i.test(file.name);
      const isText = file.type.startsWith('text/') || /\.(txt|md|json|js|ts|py|html|css|log|sql|xml|yaml|yml)$/i.test(file.name);

      try {
        const dataUrl = await this.readFileAsDataURL(file);
        let rawText = '';
        if (isText) {
          rawText = await this.readFileAsText(file);
        }

        this.attachments.push({
          id,
          file,
          name: file.name,
          type: file.type || (isPdf ? 'application/pdf' : (isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : (isWord ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream'))),
          size: file.size,
          isImage,
          isPdf,
          isExcel,
          isWord,
          isText,
          dataUrl,
          rawText
        });
      } catch (err) {
        console.error('Faylni o‘qishda xatolik:', err);
      }
    }

    this.renderPreviews();
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  removeAttachment(id) {
    this.attachments = this.attachments.filter(a => a.id !== id);
    this.renderPreviews();
  }

  clear() {
    this.attachments = [];
    this.renderPreviews();
  }

  hasFiles() {
    return this.attachments.length > 0;
  }

  getAttachments() {
    return this.attachments;
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  renderPreviews() {
    if (!this.previewContainer || !this.attachmentList) return;

    if (this.attachments.length === 0) {
      this.previewContainer.style.display = 'none';
      this.attachmentList.innerHTML = '';
      return;
    }

    this.previewContainer.style.display = 'flex';
    this.attachmentList.innerHTML = '';

    this.attachments.forEach(att => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      chip.dataset.id = att.id;

      let iconHtml = '';
      if (att.isImage) {
        iconHtml = `<img src="${att.dataUrl}" class="attachment-chip-thumb" alt="Preview">`;
      } else if (att.isPdf) {
        iconHtml = `<div class="attachment-chip-badge pdf"><i data-lucide="file-text" style="width: 14px; height: 14px;"></i> <span>PDF</span></div>`;
      } else if (att.isExcel) {
        iconHtml = `<div class="attachment-chip-badge excel"><i data-lucide="table" style="width: 14px; height: 14px;"></i> <span>XLSX</span></div>`;
      } else if (att.isWord) {
        iconHtml = `<div class="attachment-chip-badge word"><i data-lucide="file-text" style="width: 14px; height: 14px;"></i> <span>DOCX</span></div>`;
      } else {
        const ext = att.name.split('.').pop()?.toUpperCase() || 'FILE';
        iconHtml = `<div class="attachment-chip-badge generic"><i data-lucide="file-code" style="width: 14px; height: 14px;"></i> <span>${ext}</span></div>`;
      }

      chip.innerHTML = `
        <div class="attachment-chip-content">
          ${iconHtml}
          <div class="attachment-chip-info">
            <span class="attachment-chip-name" title="${att.name}">${att.name}</span>
            <span class="attachment-chip-size">${this.formatBytes(att.size)}</span>
          </div>
        </div>
        <button class="attachment-chip-remove" title="Olib tashlash">
          <i data-lucide="x" style="width: 13px; height: 13px;"></i>
        </button>
      `;

      chip.querySelector('.attachment-chip-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeAttachment(att.id);
      });

      this.attachmentList.appendChild(chip);
    });

    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

// Global instansiya
document.addEventListener('DOMContentLoaded', () => {
  window.fileAttachmentManager = new FileAttachmentManager();
});
