/**
 * store.js - IndexedDB & Local Storage Manager
 * Handles persistent offline storage for devotions, notes, images, offline scriptures, and settings.
 */

class DevotionStore {
  constructor() {
    this.dbName = 'DailyDevotionsDB';
    this.dbVersion = 2;
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store for completions: key is date string YYYY-MM-DD
        if (!db.objectStoreNames.contains('completions')) {
          db.createObjectStore('completions', { keyPath: 'date' });
        }

        // Store for notes: key is date string YYYY-MM-DD
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'date' });
        }

        // Store for journal images: key is date string YYYY-MM-DD
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'date' });
        }

        // Store for offline bible chapters: key is `${trans}_${bookId}_${chapter}`
        if (!db.objectStoreNames.contains('offline_chapters')) {
          db.createObjectStore('offline_chapters', { keyPath: 'id' });
        }

        // Store for settings: key is setting key
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Store for Text-To-Speech audio cache: key is TTS ID
        if (!db.objectStoreNames.contains('tts_audio_cache')) {
          db.createObjectStore('tts_audio_cache', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        resolve(null); // fallback gracefully to localStorage
      };
    });
  }

  // Generic IDB helper
  async getStore(storeName, mode = 'readonly') {
    await this.initPromise;
    if (!this.db) return null;
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // --- Completions ---
  async getCompletion(dateStr) {
    try {
      const store = await this.getStore('completions');
      if (store) {
        return new Promise((res) => {
          const req = store.get(dateStr);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getCompletion', e);
    }
    const val = localStorage.getItem(`completion_${dateStr}`);
    return val ? JSON.parse(val) : null;
  }

  async getAllCompletions() {
    try {
      const store = await this.getStore('completions');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      console.warn('Fallback getAllCompletions', e);
    }
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('completion_')) {
        list.push(JSON.parse(localStorage.getItem(key)));
      }
    }
    return list;
  }

  async setCompletion(dateStr, completionData) {
    try {
      const store = await this.getStore('completions', 'readwrite');
      if (store) {
        return new Promise((res, rej) => {
          const req = store.put({ date: dateStr, ...completionData });
          req.onsuccess = () => res(true);
          req.onerror = (e) => rej(e);
        });
      }
    } catch (e) {
      console.warn('Fallback setCompletion', e);
    }
    localStorage.setItem(`completion_${dateStr}`, JSON.stringify({ date: dateStr, ...completionData }));
    return true;
  }

  async removeCompletion(dateStr) {
    try {
      const store = await this.getStore('completions', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.delete(dateStr);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback removeCompletion', e);
    }
    localStorage.removeItem(`completion_${dateStr}`);
    return true;
  }

  // --- Notes ---
  async getNote(dateStr) {
    try {
      const store = await this.getStore('notes');
      if (store) {
        return new Promise((res) => {
          const req = store.get(dateStr);
          req.onsuccess = () => res(req.result ? req.result.note : '');
          req.onerror = () => res('');
        });
      }
    } catch (e) {
      console.warn('Fallback getNote', e);
    }
    return localStorage.getItem(`note_${dateStr}`) || '';
  }

  async saveNote(dateStr, noteText) {
    const updatedAt = new Date().toISOString();
    try {
      const store = await this.getStore('notes', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.put({ date: dateStr, note: noteText, updatedAt });
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback saveNote', e);
    }
    localStorage.setItem(`note_${dateStr}`, noteText);
    return true;
  }

  async removeNote(dateStr) {
    try {
      const store = await this.getStore('notes', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.delete(dateStr);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback removeNote', e);
    }
    localStorage.removeItem(`note_${dateStr}`);
    return true;
  }

  async deleteNote(dateStr) {
    return this.removeNote(dateStr);
  }

  async getAllNotes() {
    try {
      const store = await this.getStore('notes');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      console.warn('Fallback getAllNotes', e);
    }
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('note_')) {
        const date = key.replace('note_', '');
        list.push({ date, note: localStorage.getItem(key), updatedAt: new Date().toISOString() });
      }
    }
    return list;
  }

  // --- Images ---
  async getImage(dateStr) {
    try {
      const store = await this.getStore('images');
      if (store) {
        return new Promise((res) => {
          const req = store.get(dateStr);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getImage', e);
    }
    const val = localStorage.getItem(`img_${dateStr}`);
    return val ? JSON.parse(val) : null;
  }

  async saveImage(dateStr, dataUrl, filename) {
    const record = {
      date: dateStr,
      dataUrl,
      filename: filename || `devotion_${dateStr}.jpg`,
      timestamp: new Date().toISOString()
    };
    try {
      const store = await this.getStore('images', 'readwrite');
      if (store) {
        return new Promise((res, rej) => {
          const req = store.put(record);
          req.onsuccess = () => res(true);
          req.onerror = (e) => rej(e);
        });
      }
    } catch (e) {
      console.warn('Fallback saveImage', e);
    }
    try {
      localStorage.setItem(`img_${dateStr}`, JSON.stringify(record));
    } catch (err) {
      console.warn('Image too large for localStorage fallback');
    }
    return true;
  }

  async removeImage(dateStr) {
    try {
      const store = await this.getStore('images', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.delete(dateStr);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback removeImage', e);
    }
    localStorage.removeItem(`img_${dateStr}`);
    return true;
  }

  async getAllImages() {
    try {
      const store = await this.getStore('images');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      console.warn('Fallback getAllImages', e);
    }
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('img_')) {
        list.push(JSON.parse(localStorage.getItem(key)));
      }
    }
    return list;
  }

  // --- Offline Bible Chapters ---
  async getOfflineChapter(trans, bookId, chapter) {
    const id = `${trans}_${bookId}_${chapter}`;
    try {
      const store = await this.getStore('offline_chapters');
      if (store) {
        return new Promise((res) => {
          const req = store.get(id);
          req.onsuccess = () => res(req.result ? req.result.data : null);
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getOfflineChapter', e);
    }
    return null;
  }

  async saveOfflineChapter(trans, bookId, chapter, chapterData) {
    const id = `${trans}_${bookId}_${chapter}`;
    try {
      const store = await this.getStore('offline_chapters', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.put({ id, trans, bookId, chapter, data: chapterData, savedAt: Date.now() });
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback saveOfflineChapter', e);
    }
    return false;
  }

  async countOfflineChapters(trans = null) {
    try {
      const store = await this.getStore('offline_chapters');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => {
            const list = req.result || [];
            if (!trans) res(list.length);
            else res(list.filter(x => x.trans === trans).length);
          };
          req.onerror = () => res(0);
        });
      }
    } catch (e) {
      return 0;
    }
    return 0;
  }

  async clearOfflineChapters() {
    try {
      const store = await this.getStore('offline_chapters', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.clear();
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback clearOfflineChapters', e);
    }
    return false;
  }

  // --- Text-To-Speech (TTS) Audio Cache ---
  async getTTSAudio(id) {
    try {
      const store = await this.getStore('tts_audio_cache');
      if (store) {
        return new Promise((res) => {
          const req = store.get(id);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getTTSAudio', e);
    }
    return null;
  }

  async saveTTSAudio(id, audioDataUrl, metadata = {}) {
    const record = {
      id,
      audioDataUrl,
      timestamp: Date.now(),
      ...metadata
    };
    try {
      const store = await this.getStore('tts_audio_cache', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.put(record);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback saveTTSAudio', e);
    }
    return false;
  }

  async getAllTTSAudio() {
    try {
      const store = await this.getStore('tts_audio_cache');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      return [];
    }
    return [];
  }

  async countTTSAudio(scopeMonth = null) {
    const all = await this.getAllTTSAudio();
    if (!scopeMonth) return all.length;
    return all.filter(item => item.id && item.id.includes(scopeMonth)).length;
  }

  // --- Specific Scoped Deletion Operations (Requirement 5) ---

  /**
   * 1. Delete All Journal Entries
   * @param {string|null} scopeMonth - e.g. "2026-11" or null for all months
   */
  async deleteJournalEntries(scopeMonth = null) {
    try {
      const store = await this.getStore('notes', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else {
          const allNotes = await this.getAllNotes();
          for (const n of allNotes) {
            if (n.date && n.date.startsWith(scopeMonth)) {
              store.delete(n.date);
            }
          }
        }
      }
    } catch (e) {
      console.warn('deleteJournalEntries error', e);
    }

    // Clean localStorage fallback
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('note_')) {
        const dStr = k.replace('note_', '');
        if (!scopeMonth || dStr.startsWith(scopeMonth)) {
          localStorage.removeItem(k);
        }
      }
    }
    return true;
  }

  /**
   * 2. Delete All Images
   * @param {string|null} scopeMonth - e.g. "2026-11" or null for all months
   */
  async deleteImages(scopeMonth = null) {
    try {
      const store = await this.getStore('images', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else {
          const allImgs = await this.getAllImages();
          for (const img of allImgs) {
            if (img.date && img.date.startsWith(scopeMonth)) {
              store.delete(img.date);
            }
          }
        }
      }
    } catch (e) {
      console.warn('deleteImages error', e);
    }

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('img_')) {
        const dStr = k.replace('img_', '');
        if (!scopeMonth || dStr.startsWith(scopeMonth)) {
          localStorage.removeItem(k);
        }
      }
    }
    return true;
  }

  /**
   * 3. Delete Scripture Data
   * @param {string|null} scopeMonth - e.g. "2026-11" or null for all months
   */
  async deleteScriptureData(scopeMonth = null) {
    try {
      const store = await this.getStore('offline_chapters', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else {
          // If month specified, delete chapters that belong to that month schedule
          const sched = window.bibleService ? window.bibleService.getMonthSchedule(scopeMonth) : null;
          if (sched && sched.days) {
            for (const d of sched.days) {
              for (const p of d.passages) {
                store.delete(`BSB_${p.bookId}_${p.chapter}`);
                store.delete(`tgl_bib_${p.bookId}_${p.chapter}`);
                store.delete(`ENGWEBP_${p.bookId}_${p.chapter}`);
                store.delete(`eng_kjv_${p.bookId}_${p.chapter}`);
                store.delete(`tgl_ulb_${p.bookId}_${p.chapter}`);
              }
            }
          } else {
            await new Promise((res) => {
              const req = store.clear();
              req.onsuccess = () => res(true);
              req.onerror = () => res(false);
            });
          }
        }
      }
    } catch (e) {
      console.warn('deleteScriptureData error', e);
    }
    return true;
  }

  /**
   * 4. Delete Text-to-speech Data
   * @param {string|null} scopeMonth - e.g. "2026-11" or null for all months
   */
  async deleteTTSData(scopeMonth = null) {
    try {
      const store = await this.getStore('tts_audio_cache', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else {
          const all = await this.getAllTTSAudio();
          for (const item of all) {
            if (item.id && item.id.includes(scopeMonth)) {
              store.delete(item.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn('deleteTTSData error', e);
    }
    return true;
  }

  /**
   * 5. Reset Devotion Progress (will delete journal entries and images as well)
   * @param {string|null} scopeMonth - e.g. "2026-11" or null for all months
   */
  async resetDevotionProgress(scopeMonth = null) {
    try {
      // A. Delete completions
      const compStore = await this.getStore('completions', 'readwrite');
      if (compStore) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = compStore.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else {
          const allComp = await this.getAllCompletions();
          for (const c of allComp) {
            if (c.date && c.date.startsWith(scopeMonth)) {
              compStore.delete(c.date);
            }
          }
        }
      }
    } catch (e) {
      console.warn('resetDevotionProgress completions error', e);
    }

    // Clean localStorage completions
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('completion_')) {
        const dStr = k.replace('completion_', '');
        if (!scopeMonth || dStr.startsWith(scopeMonth)) {
          localStorage.removeItem(k);
        }
      }
    }

    // B. Also delete journal entries and images as required!
    await this.deleteJournalEntries(scopeMonth);
    await this.deleteImages(scopeMonth);

    return true;
  }

  /**
   * 6. Delete All Data (Complete Factory Wipe)
   */
  async deleteAllData() {
    await this.resetDevotionProgress(null);
    await this.deleteScriptureData(null);
    await this.deleteTTSData(null);

    // Clear all settings
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('setting_')) {
        localStorage.removeItem(k);
      }
    }
    return true;
  }

  // --- Data Management & Counts ---
  async getDataCounts(scopeMonth = null) {
    const allCompletions = await this.getAllCompletions();
    const allNotes = await this.getAllNotes();
    const allImages = await this.getAllImages();
    const offlineChapters = await this.countOfflineChapters();
    const ttsAudioCount = await this.countTTSAudio(scopeMonth);

    const filterMonth = (list, dateKey = 'date') => {
      if (!scopeMonth) return list;
      return list.filter(item => item[dateKey] && item[dateKey].startsWith(scopeMonth));
    };

    const completions = filterMonth(allCompletions);
    const notes = filterMonth(allNotes).filter(n => n.note && n.note.trim().length > 0);
    const images = filterMonth(allImages);

    return {
      completionsCount: completions.length,
      notesCount: notes.length,
      imagesCount: images.length,
      offlineChaptersCount: offlineChapters,
      ttsAudioCount: ttsAudioCount
    };
  }

  async exportAllData() {
    const completions = await this.getAllCompletions();
    const notes = await this.getAllNotes();
    const images = await this.getAllImages();
    const settings = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('setting_')) {
        settings[k.replace('setting_', '')] = this.getSetting(k.replace('setting_', ''));
      }
    }

    return {
      version: 2,
      appName: 'Daily Devotions',
      exportedAt: new Date().toISOString(),
      completions,
      notes,
      images,
      settings
    };
  }

  async importData(imported) {
    if (!imported || typeof imported !== 'object') {
      throw new Error('Invalid backup file format');
    }

    // 1. Import completions
    if (Array.isArray(imported.completions)) {
      for (const c of imported.completions) {
        if (c.date) {
          await this.setCompletion(c.date, c);
        }
      }
    }

    // 2. Import notes
    if (Array.isArray(imported.notes)) {
      for (const n of imported.notes) {
        if (n.date && n.note) {
          await this.saveNote(n.date, n.note);
        }
      }
    }

    // 3. Import images
    if (Array.isArray(imported.images)) {
      for (const img of imported.images) {
        if (img.date && img.dataUrl) {
          await this.saveImage(img.date, img.dataUrl, img.filename);
        }
      }
    }

    // 4. Import settings
    if (imported.settings && typeof imported.settings === 'object') {
      for (const [key, val] of Object.entries(imported.settings)) {
        this.setSetting(key, val);
      }
    }

    return true;
  }

  async factoryReset() {
    return this.deleteAllData();
  }

  // --- Settings ---
  getSetting(key, defaultValue = null) {
    const val = localStorage.getItem(`setting_${key}`);
    if (val === null) return defaultValue;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  setSetting(key, value) {
    localStorage.setItem(`setting_${key}`, JSON.stringify(value));
  }
}

window.devotionStore = new DevotionStore();
