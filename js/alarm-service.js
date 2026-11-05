/**
 * alarm-service.js
 * Manages daily devotion alarms, snooze options, Web Audio tone synthesizers,
 * and automatic 7:00 PM & 9:00 PM reminder push notifications.
 */

class AlarmService {
  constructor() {
    this.audioCtx = null;
    this.timerInterval = null;
    this.alarmActive = false;
    this.onAlarmTriggeredCallback = null;
    this.onReminderTriggeredCallback = null;

    // Load preferences
    this.enabled = window.devotionStore.getSetting('alarm_enabled', true);
    this.alarmTime = window.devotionStore.getSetting('alarm_time', '07:00');
    this.alarmTone = window.devotionStore.getSetting('alarm_tone', 'cathedral');
    this.snoozeMinutes = window.devotionStore.getSetting('snooze_minutes', 10);
    this.snoozeUntil = window.devotionStore.getSetting('snooze_until', null);

    // Evening reminders: default enabled
    this.eveningRemindersEnabled = window.devotionStore.getSetting('evening_reminders_enabled', true);

    // Track reminders fired today
    this.lastFiredAlarmDate = window.devotionStore.getSetting('last_fired_alarm_date', null);
    this.last7pmDate = window.devotionStore.getSetting('last_7pm_date', null);
    this.last9pmDate = window.devotionStore.getSetting('last_9pm_date', null);

    this.init();
  }

  init() {
    this.requestNotificationPermissionQuietly();

    // Start background checker every 10 seconds
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.checkSchedule(), 10000);

    // Also check on visibility change (when user returns to app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkSchedule();
      }
    });
  }

  async requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch (e) {
      return 'denied';
    }
  }

  requestNotificationPermissionQuietly() {
    if ('Notification' in window && Notification.permission === 'default') {
      // Don't pop up immediately, wait for user gesture or settings button
    }
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Synthesize beautiful chime, harp, bell, or fanfare via Web Audio API
   */
  playTone(toneName = null, durationSec = 3.5) {
    const tone = toneName || this.alarmTone;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (tone === 'cathedral' || tone === 'chime') {
      // Resonant Cathedral Bell Chime (C4 - G4 - E4 - C5 progression)
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.45);

        gain.gain.setValueAtTime(0, now + idx * 0.45);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.45 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.45 + 2.0);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.45);
        osc.stop(now + idx * 0.45 + 2.1);
      });
    } else if (tone === 'harp') {
      // Arpeggiated morning harp
      const freqs = [392.0, 523.25, 659.25, 783.99, 987.77, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);

        gain.gain.setValueAtTime(0, now + idx * 0.18);
        gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.18 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 1.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 1.7);
      });
    } else if (tone === 'gentle') {
      // Gentle meditation bowl harmonic
      const baseFreq = 432; // A=432Hz warmth
      [1, 2, 3, 4.2].forEach((mult, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * mult, now);

        const amp = 0.28 / (idx + 1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amp, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 3.1);
      });
    } else {
      // Default warm chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.0);
    }
  }

  showNotification(title, body, tag = 'devotion-alert') {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            body
          });
        } else {
          new Notification(title, {
            body,
            icon: './icons/icon-192.png',
            tag
          });
        }
      } catch (e) {
        console.warn('System notification error:', e);
      }
    }
  }

  /**
   * Main scheduler check loop
   */
  async checkSchedule() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    // 1. Check Snooze
    if (this.snoozeUntil && Date.now() >= this.snoozeUntil) {
      this.clearSnooze();
      this.triggerAlarm('Snoozed Devotion Alarm', 'Your snoozed time is up! Ready to spend time in God’s Word?');
      return;
    }

    // 2. Check Daily Preferred Alarm
    if (this.enabled && this.alarmTime === timeStr && this.lastFiredAlarmDate !== dateStr) {
      this.lastFiredAlarmDate = dateStr;
      window.devotionStore.setSetting('last_fired_alarm_date', dateStr);
      this.triggerAlarm('Daily Devotion Alarm', 'Good morning! It is time for today’s scripture reading.');
      return;
    }

    // 3. Check 7:00 PM Automatic Reminder (19:00)
    // Requirement 5: "automatic push notification reminders set at 7:00 PM and 9:00 PM if the daily devotion for the day has not been completed yet."
    if (this.eveningRemindersEnabled && hours === 19 && this.last7pmDate !== dateStr) {
      const todayCompletion = await window.devotionStore.getCompletion(dateStr);
      if (!todayCompletion || !todayCompletion.completed) {
        this.last7pmDate = dateStr;
        window.devotionStore.setSetting('last_7pm_date', dateStr);
        this.triggerReminder(
          '7:00 PM Devotion Reminder',
          'You haven’t completed today’s devotion yet! Take 10 minutes to reflect on Scripture tonight.',
          '7pm'
        );
      }
    }

    // 4. Check 9:00 PM Automatic Reminder (21:00)
    if (this.eveningRemindersEnabled && hours === 21 && this.last9pmDate !== dateStr) {
      const todayCompletion = await window.devotionStore.getCompletion(dateStr);
      if (!todayCompletion || !todayCompletion.completed) {
        this.last9pmDate = dateStr;
        window.devotionStore.setSetting('last_9pm_date', dateStr);
        this.triggerReminder(
          '9:00 PM Night Reminder',
          'Keep your devotion streak alive! Complete today’s reading before winding down for sleep.',
          '9pm'
        );
      }
    }
  }

  triggerAlarm(title, message) {
    this.alarmActive = true;
    this.playTone();
    this.showNotification(title, message, 'alarm');

    if (this.onAlarmTriggeredCallback) {
      this.onAlarmTriggeredCallback({ title, message });
    }
  }

  triggerReminder(title, message, reminderType) {
    this.playTone('gentle');
    this.showNotification(title, message, `reminder-${reminderType}`);

    if (this.onReminderTriggeredCallback) {
      this.onReminderTriggeredCallback({ title, message, reminderType });
    }
  }

  /**
   * Snooze the alarm for given minutes or to a custom time
   */
  snooze(minutes = null, customDate = null) {
    let targetMs;
    if (customDate instanceof Date) {
      targetMs = customDate.getTime();
    } else {
      const mins = minutes || this.snoozeMinutes || 10;
      targetMs = Date.now() + (mins * 60 * 1000);
    }

    this.snoozeUntil = targetMs;
    this.alarmActive = false;
    window.devotionStore.setSetting('snooze_until', targetMs);

    const untilTime = new Date(targetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return untilTime;
  }

  isSnoozed() {
    return Boolean(this.snoozeUntil && Date.now() < this.snoozeUntil);
  }

  getFormattedSnoozeTime() {
    if (!this.isSnoozed()) return null;
    return new Date(this.snoozeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  clearSnooze() {
    this.snoozeUntil = null;
    window.devotionStore.setSetting('snooze_until', null);
  }

  dismissAlarm() {
    this.alarmActive = false;
    this.clearSnooze();
  }

  setAlarmSettings(enabled, time, tone, snoozeMins, eveningReminders) {
    this.enabled = enabled;
    this.alarmTime = time;
    this.alarmTone = tone;
    this.snoozeMinutes = snoozeMins;
    this.eveningRemindersEnabled = eveningReminders;

    window.devotionStore.setSetting('alarm_enabled', enabled);
    window.devotionStore.setSetting('alarm_time', time);
    window.devotionStore.setSetting('alarm_tone', tone);
    window.devotionStore.setSetting('snooze_minutes', snoozeMins);
    window.devotionStore.setSetting('evening_reminders_enabled', eveningReminders);
  }
}

window.alarmService = new AlarmService();
