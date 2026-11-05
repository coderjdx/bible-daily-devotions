/**
 * bible-service.js
 * Handles fetching, parsing, and caching Bible translations, monthly reading plans,
 * and BSB Scripture rolodex using the HelloAO Bible API (https://bible.helloao.org/docs/)
 */

class BibleService {
  constructor() {
    this.apiBase = 'https://bible.helloao.org/api';
    this.scheduleRegistry = [];
    this.activeMonthKey = window.devotionStore.getSetting('active_month_key', '2026-11');
    this.schedulesByMonth = new Map();
    this.schedule = null;
    this.rolodex = [];
    this.preloadedVerses = null;
    this.memoryCache = new Map();

    // Supported translations
    this.translations = [
      {
        id: 'BSB',
        name: 'Berean Standard Bible',
        lang: 'eng',
        langLabel: 'English',
        description: 'Clear, modern, faithful & highly readable',
        easyToRead: true,
        isDefaultEnglish: true
      },
      {
        id: 'tgl_bib',
        name: 'Ang Salita ng Diyos',
        lang: 'tgl',
        langLabel: 'Filipino (Tagalog)',
        description: 'Contemporary Filipino, madaling intindihin',
        easyToRead: true,
        isDefaultTagalog: true
      },
      {
        id: 'ENGWEBP',
        name: 'World English Bible',
        lang: 'eng',
        langLabel: 'English',
        description: 'Modern public domain English',
        easyToRead: true
      },
      {
        id: 'eng_kjv',
        name: 'King James Version',
        lang: 'eng',
        langLabel: 'English',
        description: 'Traditional classic English',
        easyToRead: false
      },
      {
        id: 'tgl_ulb',
        name: 'Banal na Bibliya',
        lang: 'tgl',
        langLabel: 'Filipino (Tagalog)',
        description: 'Tagalog literal Bible translation',
        easyToRead: false
      }
    ];

    // Default translation
    this.activeTranslation = window.devotionStore.getSetting('selected_translation', 'BSB');
  }

  getActiveTranslation() {
    return this.translations.find(t => t.id === this.activeTranslation) || this.translations[0];
  }

  setTranslation(transId) {
    if (this.translations.some(t => t.id === transId)) {
      this.activeTranslation = transId;
      window.devotionStore.setSetting('selected_translation', transId);
      return true;
    }
    return false;
  }

  async init() {
    // 1. Load BSB Word Rolodex (Requirement 3)
    try {
      const res = await fetch('./data/word_rolodex.json');
      if (res.ok) {
        this.rolodex = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load word rolodex, using fallback:', e);
      this.rolodex = [
        {
          reference: 'Psalm 119:105',
          text: 'Your word is a lamp to my feet and a light to my path.'
        }
      ];
    }

    // 2. Load schedule registry for easy multi-month management (Requirement 5)
    try {
      const regRes = await fetch('./data/schedules/registry.json');
      if (regRes.ok) {
        this.scheduleRegistry = await regRes.json();
      }
    } catch (e) {
      this.scheduleRegistry = [
        { key: '2026-11', name: 'November 2026', path: './data/schedules/2026-11.json', daysCount: 30, isDefault: true }
      ];
    }

    // 3. Load active month schedule
    await this.loadMonthSchedule(this.activeMonthKey);

    // 4. Load preloaded verses bundle in the background (non-blocking)
    fetch('./data/preloaded_verses.json')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          this.preloadedVerses = data;
          this.seedPreloadedToIndexedDB();
        }
      })
      .catch(e => console.warn('Preloaded verses background notice:', e));
  }

  getRandomRolodexVerse() {
    if (!this.rolodex || this.rolodex.length === 0) {
      return {
        reference: 'Psalm 119:105',
        text: 'Your word is a lamp to my feet and a light to my path.'
      };
    }
    const idx = Math.floor(Math.random() * this.rolodex.length);
    return this.rolodex[idx];
  }

  getAvailableMonths() {
    return this.scheduleRegistry;
  }

  getMonthSchedule(monthKey) {
    return this.schedulesByMonth.get(monthKey) || this.schedule;
  }

  async loadMonthSchedule(monthKey) {
    if (this.schedulesByMonth.has(monthKey)) {
      this.schedule = this.schedulesByMonth.get(monthKey);
      this.activeMonthKey = monthKey;
      return this.schedule;
    }

    const regEntry = this.scheduleRegistry.find(m => m.key === monthKey);
    const path = regEntry ? regEntry.path : `./data/schedules/${monthKey}.json`;

    try {
      const res = await fetch(path);
      if (res.ok) {
        const data = await res.json();
        this.schedulesByMonth.set(monthKey, data);
        this.schedule = data;
        this.activeMonthKey = monthKey;
        window.devotionStore.setSetting('active_month_key', monthKey);
        return data;
      }
    } catch (e) {
      console.warn(`Could not load schedule for ${monthKey}:`, e);
    }

    // Fallback: load November 2026
    if (!this.schedule) {
      try {
        const fb = await fetch('./data/schedules/2026-11.json');
        if (fb.ok) {
          this.schedule = await fb.json();
          this.activeMonthKey = '2026-11';
        }
      } catch (err) {}
    }
    return this.schedule;
  }

  async seedPreloadedToIndexedDB() {
    if (!this.preloadedVerses) return;
    try {
      const keys = Object.keys(this.preloadedVerses);
      for (const k of keys) {
        const parts = k.split('_');
        if (parts.length >= 3) {
          const trans = parts[0];
          const book = parts[1];
          const ch = parts[2];
          window.devotionStore.saveOfflineChapter(trans, book, ch, this.preloadedVerses[k]);
        }
      }
    } catch (err) {
      console.warn('Seeding notice:', err);
    }
  }

  getDaySchedule(dayNumber) {
    if (!this.schedule || !this.schedule.days) return null;
    return this.schedule.days.find(d => d.day === Number(dayNumber)) || null;
  }

  getDayScheduleByDate(dateStr) {
    if (!this.schedule || !this.schedule.days) return null;
    return this.schedule.days.find(d => d.date === dateStr) || null;
  }

  /**
   * Fetches full chapter JSON for a given translation, bookId, and chapter
   */
  async getChapter(transId, bookId, chapter) {
    const cacheKey = `${transId}_${bookId}_${chapter}`;

    // 1. In-memory cache
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    // 2. Preloaded bundle in memory
    if (this.preloadedVerses && this.preloadedVerses[cacheKey]) {
      const data = this.preloadedVerses[cacheKey];
      this.memoryCache.set(cacheKey, data);
      return data;
    }

    // 3. IndexedDB offline store
    try {
      const idbData = await window.devotionStore.getOfflineChapter(transId, bookId, chapter);
      if (idbData) {
        this.memoryCache.set(cacheKey, idbData);
        return idbData;
      }
    } catch (e) {
      console.warn('IDB lookup warning:', e);
    }

    // 4. Live API fetch from HelloAO
    try {
      const url = `${this.apiBase}/${transId}/${bookId}/${chapter}.simple.json`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.memoryCache.set(cacheKey, data);
        window.devotionStore.saveOfflineChapter(transId, bookId, chapter, data);
        return data;
      }
    } catch (e) {
      console.warn(`HelloAO fetch failed for ${cacheKey}:`, e);
    }

    // 5. Fallback translation
    if (transId !== 'BSB') {
      const fallbackKey = `BSB_${bookId}_${chapter}`;
      if (this.preloadedVerses && this.preloadedVerses[fallbackKey]) {
        return this.preloadedVerses[fallbackKey];
      }
      try {
        const idbData = await window.devotionStore.getOfflineChapter('BSB', bookId, chapter);
        if (idbData) return idbData;
      } catch (e) {}
    }

    return null;
  }

  /**
   * Process a single passage requirement:
   * passage: { bookId: 'PSA', bookName: 'Psalms', chapter: 119, fromVerse: 137, toVerse: 144, label: 'Psalms 119:137-144', section: 'Wisdom' }
   */
  async getPassageVerses(transId, passage) {
    const rawChapter = await this.getChapter(transId, passage.bookId, passage.chapter);
    if (!rawChapter || !rawChapter.chapter || !rawChapter.chapter.content) {
      return {
        passage,
        bookName: passage.bookName,
        chapterNumber: passage.chapter,
        verses: [
          {
            type: 'verse',
            number: 1,
            text: `[Passage temporarily unavailable offline for ${transId}. Connect to network to view.]`
          }
        ],
        label: passage.label,
        section: passage.section
      };
    }

    const bookName = (rawChapter.book && rawChapter.book.name) ? rawChapter.book.name : passage.bookName;
    const allContent = rawChapter.chapter.content;

    // Filter verses based on fromVerse & toVerse
    const filteredContent = [];
    let headingCandidate = null;

    for (const item of allContent) {
      if (item.type === 'heading') {
        headingCandidate = item;
      } else if (item.type === 'verse') {
        const vNum = item.number;
        const inRange = (!passage.fromVerse || vNum >= passage.fromVerse) &&
                        (!passage.toVerse || vNum <= passage.toVerse);

        if (inRange) {
          if (headingCandidate) {
            filteredContent.push(headingCandidate);
            headingCandidate = null;
          }
          filteredContent.push(item);
        } else {
          headingCandidate = null;
        }
      }
    }

    return {
      passage,
      bookName,
      chapterNumber: rawChapter.chapter.number,
      content: filteredContent,
      label: passage.label,
      section: passage.section
    };
  }

  /**
   * Downloads all chapters for the active month for offline use
   */
  async downloadMonthForOffline(transId, onProgress) {
    if (!this.schedule || !this.schedule.days) return { success: false, count: 0 };

    const uniqueItems = new Map();
    for (const day of this.schedule.days) {
      for (const p of day.passages) {
        const key = `${p.bookId}_${p.chapter}`;
        if (!uniqueItems.has(key)) {
          uniqueItems.set(key, { bookId: p.bookId, chapter: p.chapter });
        }
      }
    }

    const items = Array.from(uniqueItems.values());
    const total = items.length;
    let completed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const data = await this.getChapter(transId, item.bookId, item.chapter);
        if (data) {
          await window.devotionStore.saveOfflineChapter(transId, item.bookId, item.chapter, data);
          completed++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }

      if (onProgress) {
        onProgress({
          completed,
          failed,
          total,
          percent: Math.round(((completed + failed) / total) * 100),
          currentItem: `${item.bookId} ${item.chapter}`
        });
      }
    }

    return { success: true, completed, failed, total };
  }
}

window.bibleService = new BibleService();
