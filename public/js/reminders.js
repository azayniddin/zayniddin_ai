/**
 * Device Reminders & Calendar Integration
 * Telefon ilovalari (Budilnik, Taqvim, Bildirishnomalar) bilan ishlash moduli
 */

class DeviceReminderManager {
  constructor() {
    this.scheduledTimeouts = new Map();
    this.audioAlert = null;
    this.initNotificationSound();
    this.checkPendingReminders();
  }

  initNotificationSound() {
    try {
      // Qisqa yoqimli bildirishnoma ohangi (Web Audio API)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio mavjud emas:', e);
    }
  }

  playChime() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const ctx = this.audioContext;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (err) {
      console.warn('Audio chime error:', err);
    }
  }

  // 1. Android Budilnik (Clock App) Intent yaratish
  setAndroidAlarm(title, timeStr) {
    if (!timeStr) return;
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] || '0', 10);

    const message = encodeURIComponent(title || 'Eslatma');

    // Android Intent for Alarm
    // android.intent.action.SET_ALARM
    const intentUrl = `intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.HOUR=${hour};i.android.intent.extra.MINUTES=${minutes};S.android.intent.extra.MESSAGE=${message};B.android.intent.extra.SKIP_UI=false;end`;

    // Intentni ochish
    window.location.href = intentUrl;
  }

  // 2. Google Calendar havolasi
  getGoogleCalendarUrl(title, dateStr, timeStr, details) {
    const startDateTime = this.buildDateTime(dateStr, timeStr);
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000); // 30 daqiqa

    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const text = encodeURIComponent(title || 'Eslatma');
    const detailsText = encodeURIComponent(details || "zayniddin_ai orqali yaratilgan eslatma");
    const dates = `${fmt(startDateTime)}/${fmt(endDateTime)}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${detailsText}`;
  }

  // 3. Apple / Samsung / Windows Native Taqvim uchun iCalendar (.ics) fayli
  downloadIcsCalendar(title, dateStr, timeStr, details) {
    const startDateTime = this.buildDateTime(dateStr, timeStr);
    const endDateTime = new Date(startDateTime.getTime() + 30 * 60 * 1000);

    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//zayniddin_ai//Uzbekistan//UZ',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:reminder-${Date.now()}@zayniddin.ai`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(startDateTime)}`,
      `DTEND:${fmt(endDateTime)}`,
      `SUMMARY:${title || 'Eslatma'}`,
      `DESCRIPTION:${details || 'zayniddin_ai orqali rejalashtirilgan'}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Eslatma vaqti keldi!',
      'TRIGGER:-PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${(title || 'eslatma').replace(/\s+/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 4. Telefonda / Brauzerda Push Notification (Mahalliy bildirishnoma)
  async scheduleLocalNotification(title, dateStr, timeStr, details) {
    if (!('Notification' in window)) {
      alert('Kechirasiz, ushbu brauzer bildirishnomalarni qo‘llab-quvvatlamaydi.');
      return false;
    }

    let permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      alert('Telefonda eslatma chiqarish uchun bildirishnomalarga ruxsat berishingiz kerak.');
      return false;
    }

    const targetTime = this.buildDateTime(dateStr, timeStr);
    const diffMs = targetTime.getTime() - Date.now();

    if (diffMs <= 0) {
      alert('Belgilangan vaqt o‘tib ketgan. Iltimos, kelajakdagi vaqtni kiriting.');
      return false;
    }

    const reminderId = 'rem_' + Date.now();
    const reminderItem = {
      id: reminderId,
      title: title || 'Eslatma',
      targetTimestamp: targetTime.getTime(),
      details: details || ''
    };

    // Saqlab qo'yish
    const stored = JSON.parse(localStorage.getItem('saved_reminders') || '[]');
    stored.push(reminderItem);
    localStorage.setItem('saved_reminders', JSON.stringify(stored));

    // Taymerni yoqish
    const timerId = setTimeout(() => {
      this.triggerDeviceAlert(reminderItem);
    }, diffMs);

    this.scheduledTimeouts.set(reminderId, timerId);

    // Qancha vaqt qolganini tushunarli aytish
    const minutesLeft = Math.round(diffMs / 60000);
    const hoursLeft = Math.floor(minutesLeft / 60);
    const remMins = minutesLeft % 60;
    let timeText = '';
    if (hoursLeft > 0) timeText += `${hoursLeft} soat `;
    timeText += `${remMins} daqiqadan so‘ng`;

    return { success: true, timeText };
  }

  triggerDeviceAlert(reminder) {
    this.playChime();

    // Mobil tebranish (Vibration API)
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 500]);
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(`🔔 ${reminder.title}`, {
          body: reminder.details || 'zayniddin_ai: Rejalashtirilgan vaqt keldi!',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon.svg',
          vibrate: [300, 150, 300],
          tag: reminder.id,
          renotify: true
        });
      });
    } else if (Notification.permission === 'granted') {
      new Notification(`🔔 ${reminder.title}`, {
        body: reminder.details || 'zayniddin_ai: Rejalashtirilgan vaqt keldi!',
        icon: '/icons/icon-192.png'
      });
    }

    // Saqlangan ro'yxatdan o'chirish
    const stored = JSON.parse(localStorage.getItem('saved_reminders') || '[]');
    const updated = stored.filter(r => r.id !== reminder.id);
    localStorage.setItem('saved_reminders', JSON.stringify(updated));
  }

  checkPendingReminders() {
    try {
      const stored = JSON.parse(localStorage.getItem('saved_reminders') || '[]');
      const now = Date.now();
      stored.forEach(r => {
        const diff = r.targetTimestamp - now;
        if (diff > 0 && diff < 86400000) { // Keyingi 24 soat ichida bo'lsa qayta rejalashtirish
          const timerId = setTimeout(() => this.triggerDeviceAlert(r), diff);
          this.scheduledTimeouts.set(r.id, timerId);
        }
      });
    } catch (e) {
      console.warn('Eslatmalarni tekshirishda xatolik:', e);
    }
  }

  buildDateTime(dateStr, timeStr) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();

    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      }
    }

    let hour = 12;
    let minute = 0;
    if (timeStr) {
      const tParts = timeStr.split(':');
      hour = parseInt(tParts[0], 10);
      minute = parseInt(tParts[1] || '0', 10);
    }

    const dt = new Date(year, month, day, hour, minute, 0);

    // Agar sana berilmagan bo'lsa va kiritilgan vaqt bugun o'tib ketgan bo'lsa, ertangi kunga belgilash
    if (!dateStr && dt.getTime() < now.getTime()) {
      dt.setDate(dt.getDate() + 1);
    }

    return dt;
  }

  handlePushSchedule(btn, title, dateStr, timeStr, details) {
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span>Rejalashtirilmoqda...</span>';

    this.scheduleLocalNotification(title, dateStr, timeStr, details).then(res => {
      if (res && res.success) {
        btn.innerHTML = `<i data-lucide="check-circle" style="width: 15px; height: 15px; color: #10b981;"></i> <span>Belgilandi (${res.timeText})</span>`;
        btn.classList.add('scheduled');
      } else {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
      if (window.lucide) lucide.createIcons();
    });
  }

  parseReminders(content) {
    if (!content) return content;
    const regex = /```reminder\s*([\s\S]*?)\s*```/g;
    return content.replace(regex, (match, jsonStr) => {
      try {
        const data = JSON.parse(jsonStr.trim());
        return this.renderReminderCardHtml(data);
      } catch (e) {
        console.warn('Reminder JSON parse error:', e);
        return match;
      }
    });
  }

  renderReminderCardHtml(data) {
    const title = data.title || 'Eslatma';
    const date = data.date || 'Bugun';
    const time = data.time || '12:00';
    const details = data.details || '';
    const googleUrl = this.getGoogleCalendarUrl(title, data.date, data.time, details);

    const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeDetails = (details || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safeDate = (data.date || '').replace(/'/g, "\\'");
    const safeTime = (data.time || '').replace(/'/g, "\\'");

    // Hech qanday boshlang'ich bo'shliqsiz (indentation), Markdown parser kod bloki deb hisoblamasligi uchun:
    return `<div class="reminder-action-card glass-card">` +
      `<div class="reminder-card-top">` +
        `<div class="reminder-icon-box">` +
          `<i data-lucide="clock" style="width: 22px; height: 22px; color: #38bdf8;"></i>` +
        `</div>` +
        `<div class="reminder-title-box">` +
          `<div class="reminder-badge-chip">📱 Telefon Eslatmasi</div>` +
          `<div class="reminder-title-text">${title}</div>` +
          `<div class="reminder-time-text">` +
            `<span>📅 ${date}</span> • <span>⏰ ${time}</span>` +
          `</div>` +
        `</div>` +
      `</div>` +
      (details ? `<div class="reminder-details-text">${details}</div>` : '') +
      `<div class="reminder-actions-row">` +
        `<button class="rem-btn rem-btn-alarm" onclick="window.deviceReminder.setAndroidAlarm('${safeTitle}', '${safeTime}')" title="Android Soat / Budilnik ilovasida ochish">` +
          `<i data-lucide="alarm-clock" style="width: 15px; height: 15px;"></i>` +
          `<span>Budilnik (Soat)</span>` +
        `</button>` +
        `<a href="${googleUrl}" target="_blank" rel="noopener noreferrer" class="rem-btn rem-btn-google" title="Google Taqvim ilovasida ochish">` +
          `<i data-lucide="calendar" style="width: 15px; height: 15px;"></i>` +
          `<span>Google Taqvim</span>` +
        `</a>` +
        `<button class="rem-btn rem-btn-ics" onclick="window.deviceReminder.downloadIcsCalendar('${safeTitle}', '${safeDate}', '${safeTime}', '${safeDetails}')" title="Apple / Samsung taqvimiga yuklash (.ics)">` +
          `<i data-lucide="calendar-plus" style="width: 15px; height: 15px;"></i>` +
          `<span>Telefon Taqvimi</span>` +
        `</button>` +
        `<button class="rem-btn rem-btn-notify" onclick="window.deviceReminder.handlePushSchedule(this, '${safeTitle}', '${safeDate}', '${safeTime}', '${safeDetails}')" title="Telefonda bildirishnoma chiqarish">` +
          `<i data-lucide="bell" style="width: 15px; height: 15px;"></i>` +
          `<span>Telefonda eslatish</span>` +
        `</button>` +
      `</div>` +
    `</div>`;
  }
}

window.deviceReminder = new DeviceReminderManager();
