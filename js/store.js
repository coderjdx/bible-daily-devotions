/**
 * store.js - IndexedDB & Local Storage Manager
 * Handles persistent offline storage for devotions, notes, images, offline scriptures, and settings.
 */

class DevotionStore {
  constructor() {
    this.dbName = 'DailyDevotionsDB';
    this.dbVersion = 4;
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

        // Store for Sunday church services: key is date string YYYY-MM-DD
        if (!db.objectStoreNames.contains('sunday_services')) {
          db.createObjectStore('sunday_services', { keyPath: 'date' });
        }

        // Store for verse highlights & bookmarks: key is id e.g. `${bookId}_${chapter}_${verse}`
        if (!db.objectStoreNames.contains('highlights')) {
          db.createObjectStore('highlights', { keyPath: 'id' });
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

  async saveNote(dateStr, noteText, tags = []) {
    const updatedAt = new Date().toISOString();
    const tagList = Array.isArray(tags) ? tags : [];
    try {
      const store = await this.getStore('notes', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.put({ date: dateStr, note: noteText, tags: tagList, updatedAt });
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback saveNote', e);
    }
    localStorage.setItem(`note_${dateStr}`, noteText);
    localStorage.setItem(`note_tags_${dateStr}`, JSON.stringify(tagList));
    return true;
  }

  async getNoteRecord(dateStr) {
    try {
      const store = await this.getStore('notes');
      if (store) {
        return new Promise((res) => {
          const req = store.get(dateStr);
          req.onsuccess = () => {
            if (req.result) {
              res({
                date: req.result.date || dateStr,
                note: req.result.note || '',
                tags: Array.isArray(req.result.tags) ? req.result.tags : [],
                updatedAt: req.result.updatedAt || ''
              });
            } else {
              res(null);
            }
          };
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getNoteRecord', e);
    }
    const val = localStorage.getItem(`note_${dateStr}`);
    if (!val) return null;
    let tags = [];
    try {
      tags = JSON.parse(localStorage.getItem(`note_tags_${dateStr}`) || '[]');
    } catch (e) {}
    return { date: dateStr, note: val, tags, updatedAt: '' };
  }

  async removeNote(dateStr) {
    try {
      const store = await this.getStore('notes', 'readwrite');
      if (store) {
        await new Promise((res) => {
          const req = store.delete(dateStr);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback removeNote', e);
    }
    try {
      localStorage.removeItem(`note_${dateStr}`);
      localStorage.removeItem(`note_tags_${dateStr}`);
    } catch (e) {}
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
          req.onsuccess = () => {
            const list = (req.result || []).map(r => ({
              ...r,
              tags: Array.isArray(r.tags) ? r.tags : []
            }));
            res(list);
          };
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      console.warn('Fallback getAllNotes', e);
    }
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('note_') && !key.startsWith('note_tags_')) {
        const date = key.replace('note_', '');
        let tags = [];
        try {
          tags = JSON.parse(localStorage.getItem(`note_tags_${date}`) || '[]');
        } catch (e) {}
        list.push({ date, note: localStorage.getItem(key), tags, updatedAt: new Date().toISOString() });
      }
    }
    return list;
  }

  // --- Sunday Church Services ---
  async getSundayService(dateStr) {
    try {
      const store = await this.getStore('sunday_services');
      if (store) {
        return new Promise((res) => {
          const req = store.get(dateStr);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getSundayService', e);
    }
    const val = localStorage.getItem(`sunday_service_${dateStr}`);
    return val ? JSON.parse(val) : null;
  }

  async saveSundayService(dateStr, data) {
    const updatedAt = new Date().toISOString();
    const record = {
      date: dateStr,
      attended: Boolean(data.attended),
      title: (data.title || '').trim(),
      speaker: (data.speaker || '').trim(),
      notes: (data.notes || '').trim(),
      tags: Array.isArray(data.tags) ? data.tags : [],
      updatedAt
    };
    try {
      const store = await this.getStore('sunday_services', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.put(record);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback saveSundayService', e);
    }
    localStorage.setItem(`sunday_service_${dateStr}`, JSON.stringify(record));
    return true;
  }

  async deleteSundayService(dateStr) {
    try {
      const store = await this.getStore('sunday_services', 'readwrite');
      if (store) {
        await new Promise((res) => {
          const req = store.delete(dateStr);
          req.onsuccess = req.onerror = () => res(true);
        });
      }
    } catch (e) {
      console.warn('Fallback deleteSundayService', e);
    }
    try {
      localStorage.removeItem(`sunday_service_${dateStr}`);
    } catch (e) {}
    return true;
  }

  async getAllSundayServices() {
    try {
      const store = await this.getStore('sunday_services');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      console.warn('Fallback getAllSundayServices', e);
    }
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sunday_service_')) {
        try {
          list.push(JSON.parse(localStorage.getItem(key)));
        } catch (e) {}
      }
    }
    return list;
  }

  // --- Aggregate Tags Query (Devotions + Sunday Services) ---
  async getAllTags() {
    const tagSet = new Set();
    const notes = await this.getAllNotes();
    notes.forEach(n => {
      if (Array.isArray(n.tags)) {
        n.tags.forEach(t => {
          const clean = t.trim().replace(/^#+/, '');
          if (clean) tagSet.add(clean);
        });
      }
      if (n.note && typeof n.note === 'string') {
        try {
          const parsed = JSON.parse(n.note);
          if (parsed && Array.isArray(parsed.tags)) {
            parsed.tags.forEach(t => {
              const clean = t.trim().replace(/^#+/, '');
              if (clean) tagSet.add(clean);
            });
          }
        } catch (e) {}
      }
    });

    const services = await this.getAllSundayServices();
    services.forEach(s => {
      if (Array.isArray(s.tags)) {
        s.tags.forEach(t => {
          const clean = t.trim().replace(/^#+/, '');
          if (clean) tagSet.add(clean);
        });
      }
    });

    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }

  // --- Verse Highlights & Bookmarks ---
  async getHighlight(id) {
    try {
      const store = await this.getStore('highlights');
      if (store) {
        return new Promise((res) => {
          const req = store.get(id);
          req.onsuccess = () => res(req.result || null);
          req.onerror = () => res(null);
        });
      }
    } catch (e) {
      console.warn('Fallback getHighlight', e);
    }
    const val = localStorage.getItem(`highlight_${id}`);
    return val ? JSON.parse(val) : null;
  }

  async saveHighlight(data) {
    if (!data || !data.id) return false;
    const updatedAt = new Date().toISOString();
    const record = {
      id: data.id,
      reference: data.reference || '',
      bookId: data.bookId || '',
      bookName: data.bookName || '',
      chapter: Number(data.chapter) || 1,
      verse: Number(data.verse) || 1,
      color: data.color || 'gold',
      text: (data.text || '').trim(),
      translation: data.translation || 'BSB',
      isBookmarked: Boolean(data.isBookmarked),
      dayNum: data.dayNum ? Number(data.dayNum) : null,
      dateStr: data.dateStr || '',
      updatedAt
    };
    try {
      const store = await this.getStore('highlights', 'readwrite');
      if (store) {
        return new Promise((res) => {
          const req = store.put(record);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback saveHighlight', e);
    }
    localStorage.setItem(`highlight_${data.id}`, JSON.stringify(record));
    return true;
  }

  async deleteHighlight(id) {
    try {
      const store = await this.getStore('highlights', 'readwrite');
      if (store) {
        await new Promise((res) => {
          const req = store.delete(id);
          req.onsuccess = req.onerror = () => res(true);
        });
      }
    } catch (e) {
      console.warn('Fallback deleteHighlight', e);
    }
    try {
      localStorage.removeItem(`highlight_${id}`);
    } catch (e) {}
    return true;
  }

  async getAllHighlights() {
    try {
      const store = await this.getStore('highlights');
      if (store) {
        return new Promise((res) => {
          const req = store.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res([]);
        });
      }
    } catch (e) {
      console.warn('Fallback getAllHighlights', e);
    }
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('highlight_')) {
        try {
          list.push(JSON.parse(localStorage.getItem(key)));
        } catch (e) {}
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
        await new Promise((res) => {
          const req = store.delete(dateStr);
          req.onsuccess = () => res(true);
          req.onerror = () => res(false);
        });
      }
    } catch (e) {
      console.warn('Fallback removeImage', e);
    }
    try {
      localStorage.removeItem(`img_${dateStr}`);
    } catch (e) {}
    return true;
  }

  async deleteImage(dateStr) {
    return this.removeImage(dateStr);
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
    let datesToDelete = [];
    if (scopeMonth) {
      const allNotes = await this.getAllNotes();
      datesToDelete = allNotes.filter(n => n.date && n.date.startsWith(scopeMonth)).map(n => n.date);
    }

    try {
      const store = await this.getStore('notes', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else if (datesToDelete.length > 0) {
          await new Promise((res) => {
            let pending = datesToDelete.length;
            datesToDelete.forEach(d => {
              const req = store.delete(d);
              req.onsuccess = req.onerror = () => {
                pending--;
                if (pending <= 0) res(true);
              };
            });
          });
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
    let datesToDelete = [];
    if (scopeMonth) {
      const allImgs = await this.getAllImages();
      datesToDelete = allImgs.filter(img => img.date && img.date.startsWith(scopeMonth)).map(img => img.date);
    }

    try {
      const store = await this.getStore('images', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else if (datesToDelete.length > 0) {
          await new Promise((res) => {
            let pending = datesToDelete.length;
            datesToDelete.forEach(d => {
              const req = store.delete(d);
              req.onsuccess = req.onerror = () => {
                pending--;
                if (pending <= 0) res(true);
              };
            });
          });
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
            await new Promise((res) => {
              const keys = [];
              for (const d of sched.days) {
                for (const p of d.passages) {
                  keys.push(`BSB_${p.bookId}_${p.chapter}`);
                  keys.push(`tgl_bib_${p.bookId}_${p.chapter}`);
                  keys.push(`ENGWEBP_${p.bookId}_${p.chapter}`);
                  keys.push(`eng_kjv_${p.bookId}_${p.chapter}`);
                  keys.push(`tgl_ulb_${p.bookId}_${p.chapter}`);
                }
              }
              let pending = keys.length;
              if (pending === 0) return res(true);
              keys.forEach(k => {
                const req = store.delete(k);
                req.onsuccess = req.onerror = () => {
                  pending--;
                  if (pending <= 0) res(true);
                };
              });
            });
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
    let idsToDelete = [];
    if (scopeMonth) {
      const all = await this.getAllTTSAudio();
      idsToDelete = all.filter(item => item.id && item.id.includes(scopeMonth)).map(item => item.id);
    }

    try {
      const store = await this.getStore('tts_audio_cache', 'readwrite');
      if (store) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = store.clear();
            req.onsuccess = () => res(true);
            req.onerror = () => res(false);
          });
        } else if (idsToDelete.length > 0) {
          await new Promise((res) => {
            let pending = idsToDelete.length;
            idsToDelete.forEach(id => {
              const req = store.delete(id);
              req.onsuccess = req.onerror = () => {
                pending--;
                if (pending <= 0) res(true);
              };
            });
          });
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
    let datesToDelete = [];
    if (scopeMonth) {
      const allComp = await this.getAllCompletions();
      datesToDelete = allComp.filter(c => c.date && c.date.startsWith(scopeMonth)).map(c => c.date);
    }

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
        } else if (datesToDelete.length > 0) {
          await new Promise((res) => {
            let pending = datesToDelete.length;
            datesToDelete.forEach(d => {
              const req = compStore.delete(d);
              req.onsuccess = req.onerror = () => {
                pending--;
                if (pending <= 0) res(true);
              };
            });
          });
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

    // B. Also delete journal entries, images, and Sunday services as required!
    await this.deleteJournalEntries(scopeMonth);
    await this.deleteImages(scopeMonth);

    try {
      const sunStore = await this.getStore('sunday_services', 'readwrite');
      if (sunStore) {
        if (!scopeMonth) {
          await new Promise((res) => {
            const req = sunStore.clear();
            req.onsuccess = req.onerror = () => res(true);
          });
        } else {
          const allServices = await this.getAllSundayServices();
          for (const s of allServices) {
            if (s.date && s.date.startsWith(scopeMonth)) {
              await this.deleteSundayService(s.date);
            }
          }
        }
      }
    } catch (e) {}

    return true;
  }

  /**
   * 6. Delete All Data (Complete Factory Wipe)
   */
  async deleteAllData() {
    await this.resetDevotionProgress(null);
    await this.deleteScriptureData(null);
    await this.deleteTTSData(null);

    // Clear highlights from IDB
    try {
      const hlStore = await this.getStore('highlights', 'readwrite');
      if (hlStore) {
        await new Promise((res) => {
          const req = hlStore.clear();
          req.onsuccess = req.onerror = () => res(true);
        });
      }
    } catch (e) {}

    // Clear settings from IDB if present
    try {
      const settingsStore = await this.getStore('settings', 'readwrite');
      if (settingsStore) {
        await new Promise((res) => {
          const req = settingsStore.clear();
          req.onsuccess = req.onerror = () => res(true);
        });
      }
    } catch (e) {}

    // Clear all localStorage
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('setting_') || k.startsWith('note_') || k.startsWith('img_') || k.startsWith('completion_') || k.startsWith('tts_') || k.startsWith('sunday_service_') || k.startsWith('highlight_'))) {
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
    const allHighlights = await this.getAllHighlights();
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
      highlightsCount: allHighlights.length,
      offlineChaptersCount: offlineChapters,
      ttsAudioCount: ttsAudioCount
    };
  }

  async exportAllData() {
    const completions = await this.getAllCompletions();
    const notes = await this.getAllNotes();
    const images = await this.getAllImages();
    const sundayServices = await this.getAllSundayServices();
    const highlights = await this.getAllHighlights();
    const settings = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('setting_')) {
        settings[k.replace('setting_', '')] = this.getSetting(k.replace('setting_', ''));
      }
    }

    return {
      version: 4,
      appName: 'Daily Devotions',
      exportedAt: new Date().toISOString(),
      completions,
      notes,
      images,
      sundayServices,
      highlights,
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
          await this.saveNote(n.date, n.note, n.tags || []);
        }
      }
    }

    // 3. Import sundayServices
    if (Array.isArray(imported.sundayServices)) {
      for (const s of imported.sundayServices) {
        if (s.date) {
          await this.saveSundayService(s.date, s);
        }
      }
    }

    // 4. Import images
    if (Array.isArray(imported.images)) {
      for (const img of imported.images) {
        if (img.date && img.dataUrl) {
          await this.saveImage(img.date, img.dataUrl, img.filename);
        }
      }
    }

    // 5. Import highlights
    if (Array.isArray(imported.highlights)) {
      for (const h of imported.highlights) {
        if (h.id) {
          await this.saveHighlight(h);
        }
      }
    }

    // 6. Import settings
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
