/**
 * Document Engine Manager (PDF, Excel, Word)
 * zerikdim_ai - Hujjatlar bilan ishlash, yuklab olish va Google Vositalariga uzatish dvigateli
 */

class DocumentEngineManager {
  constructor() {
    this.init();
  }

  init() {
    // Window obyektiga biriktirish
    window.documentEngine = this;
  }

  /**
   * Hujjat kartochkasi HTML shablonini generatsiya qilish
   * DIQQAT: CommonMark 4-space qoidasi sababli, har bir qatorda ortiqcha probel bo'lmasligi SHART!
   */
  renderDocumentCardHtml(data) {
    if (!data) return '';

    const type = (data.type || '').toLowerCase();
    const filename = data.filename || 'hujjat';
    const title = data.title || filename;
    const fileUrl = data.fileUrl || '#';
    const sizeText = data.sizeText || 'Hujjat';

    let iconSvg = '';
    let badgeClass = 'doc-badge-generic';
    let typeName = 'Hujjat';
    let googleAction = '';

    if (type === 'excel' || filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.csv')) {
      badgeClass = 'doc-badge-excel';
      typeName = 'Excel Jadval';
      iconSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M8 13h8"></path><path d="M8 17h8"></path><path d="M10 9h1"></path></svg>`;
      googleAction = `<a href="https://sheets.google.com" target="_blank" class="doc-btn doc-btn-google" title="Google Sheetsda ochish"><svg viewBox="0 0 24 24" width="14" height="14" fill="#34A853"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg><span>Google Sheets</span></a>`;
    } else if (type === 'word' || filename.endsWith('.docx') || filename.endsWith('.doc')) {
      badgeClass = 'doc-badge-word';
      typeName = 'Word Hujjat';
      iconSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
      googleAction = `<a href="https://docs.google.com" target="_blank" class="doc-btn doc-btn-google" title="Google Docsda ochish"><svg viewBox="0 0 24 24" width="14" height="14" fill="#4285F4"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg><span>Google Docs</span></a>`;
    } else if (type === 'pdf' || filename.endsWith('.pdf')) {
      badgeClass = 'doc-badge-pdf';
      typeName = 'PDF Hujjat';
      iconSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15v-6h2a2 2 0 0 1 0 4H9"></path><path d="M15 15h-2v-6h2a2 2 0 0 1 0 4h-2"></path></svg>`;
      googleAction = `<a href="https://drive.google.com" target="_blank" class="doc-btn doc-btn-google" title="Google Drive"><svg viewBox="0 0 24 24" width="14" height="14" fill="#FBBC05"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg><span>Google Drive</span></a>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    }

    const downloadAttr = fileUrl !== '#' ? `download="${filename}"` : '';

    return `<div class="document-file-card glass-card">
<div class="doc-card-header">
<div class="doc-icon-badge ${badgeClass}">${iconSvg}</div>
<div class="doc-card-info">
<div class="doc-card-title">${this.escapeHtml(title)}</div>
<div class="doc-card-meta">
<span class="doc-type-pill">${typeName}</span>
<span class="doc-filename-text">${this.escapeHtml(filename)}</span>
<span class="doc-size-text">• ${sizeText}</span>
</div>
</div>
</div>
<div class="doc-card-actions">
<a href="${fileUrl}" ${downloadAttr} class="doc-btn doc-btn-download" target="_blank">
<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
<span>Yuklab Olish</span>
</a>
${googleAction}
</div>
</div>`;
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Serverdan to'g'ridan-to'g'ri hujjat yaratishni so'rash
   */
  async createDocument(type, title, filename, data) {
    try {
      const res = await fetch('/api/create-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, filename, data })
      });
      return await res.json();
    } catch (e) {
      console.error('Hujjat yaratishda so‘rov xatosi:', e);
      return { error: e.message };
    }
  }
}

// Global yuklash
window.documentEngine = new DocumentEngineManager();
