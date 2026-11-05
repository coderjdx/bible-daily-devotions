/**
 * tts-service.js - Google Text-To-Speech (TTS) Service
 * Reads Bible scriptures aloud in a calm, soothing voice without verse numbers or commentary.
 *
 * Features:
 * 1. Native Google TTS Voices: Leverages built-in Google TTS voices (Google US English, Google Filipino, etc.)
 *    via Web Speech API with ZERO API keys, ZERO costs, and 100% offline capability.
 * 2. Sentence-by-Sentence Queue: Overcomes browser character limits (e.g. Chrome 200-word buffer bug) by chunking
 *    multi-chapter scripture into calm, bite-sized sentence utterances with peaceful natural pauses.
 * 3. GC Retention: Keeps active utterances referenced in memory to prevent Chrome's garbage collector from cutting off audio mid-passage.
 * 4. Optional Cloud TTS Key: Allows users/churches with an optional Google Cloud API key to synthesize Neural2 MP3s directly.
 * 5. Persistent Storage & Offline Download: Caches reading audio/transcripts in IndexedDB and provides audio/script download.
 */

class TTSService {
  constructor() {
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.currentTrack = null;
    this.isPlayingState = false;
    this.isPausedState = false;
    
    // Pacing & Pitch: Default to Solemn & Slow (rate: 0.85) for reverent, contemplative scripture reading
    const storedRate = window.devotionStore ? window.devotionStore.getSetting('tts_rate', 0.85) : 0.85;
    this.rate = Number(storedRate) || 0.85;
    this.pitch = 1.0; // Standard unaltered pitch to prevent acoustic distortion

    // Preferred voice override (stored by URI or name)
    this.preferredVoiceURI = window.devotionStore ? window.devotionStore.getSetting('tts_voice_uri', '') : '';

    this.onStateChangeCallbacks = [];
    
    // Sentence Queue Management
    this.queue = [];
    this.queueIndex = 0;
    this.activeUtterances = []; // Prevents Chromium garbage-collection bug!
    this.voices = [];
    this.currentLang = 'en';

    // Initialize voices
    this.initVoices();

    // Bind HTML5 Audio Element events (for MP3 playback when API key or stored audio is used)
    this.audioElement.addEventListener('ended', () => {
      this.isPlayingState = false;
      this.isPausedState = false;
      this.currentTrack = null;
      this.notifyStateChange();
    });

    this.audioElement.addEventListener('pause', () => {
      if (!this.audioElement.ended && this.isPlayingState) {
        this.isPausedState = true;
        this.isPlayingState = false;
        this.notifyStateChange();
      }
    });

    this.audioElement.addEventListener('play', () => {
      this.isPlayingState = true;
      this.isPausedState = false;
      this.notifyStateChange();
    });

    this.audioElement.addEventListener('error', (err) => {
      if (!this.audioElement.currentSrc) return; // Ignore intentional source clear
      console.warn('Audio element error, checking queue fallback:', err);
      this.isPlayingState = false;
      this.notifyStateChange();
    });
  }

  /**
   * Initializes and detects voices, ensuring Google TTS voices are prioritized
   */
  initVoices() {
    if (!('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis not supported on this browser.');
      return;
    }

    const loadVoices = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
      };
    }
  }

  getAvailableVoices(langCode = 'en') {
    if (!this.voices || this.voices.length === 0) {
      this.voices = window.speechSynthesis.getVoices() || [];
    }
    const isTagalog = (langCode === 'tl' || langCode.startsWith('fil') || langCode.toLowerCase().includes('tag'));
    const targetPrefix = isTagalog ? 'fil' : 'en';

    // Return matching language voices first, then all voices
    let matching = this.voices.filter(v => v.lang && (v.lang.toLowerCase().startsWith(targetPrefix) || (isTagalog && v.lang.toLowerCase().startsWith('tl'))));
    
    // Sort with Google UK English Male and solemn male voices at the top
    const topKeywords = [
      'google uk english male',
      'daniel',
      'oliver',
      'guy natural',
      'david',
      'mark',
      'alex',
      'samantha',
      'google uk english female',
      'google filipino',
      'karen',
      'google us english'
    ];

    matching.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aIdx = topKeywords.findIndex(k => aName.includes(k));
      const bIdx = topKeywords.findIndex(k => bName.includes(k));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return aName.localeCompare(bName);
    });

    return matching.length > 0 ? matching : this.voices;
  }

  /**
   * Chooses the calmest, highest quality voice available on the device
   * Prioritizes solemn, natural male voices for reverent scripture reading.
   */
  pickCalmVoice(langCode = 'en') {
    if (!this.voices || this.voices.length === 0) {
      this.voices = window.speechSynthesis.getVoices() || [];
    }

    // 1. User preferred voice if configured
    if (this.preferredVoiceURI) {
      const userVoice = this.voices.find(v => v.voiceURI === this.preferredVoiceURI || v.name === this.preferredVoiceURI);
      if (userVoice) return userVoice;
    }

    const isTagalog = (langCode === 'tl' || langCode.startsWith('fil') || langCode.toLowerCase().includes('tag'));

    if (isTagalog) {
      // Look for Google Filipino or Tagalog voice
      const googleFil = this.voices.find(v => v.name.toLowerCase().includes('google') && (v.lang.toLowerCase().includes('fil') || v.lang.toLowerCase().includes('tl')));
      if (googleFil) return googleFil;

      const anyFil = this.voices.find(v => v.lang.toLowerCase().startsWith('fil') || v.lang.toLowerCase().startsWith('tl') || v.name.toLowerCase().includes('tagalog') || v.name.toLowerCase().includes('filipino'));
      if (anyFil) return anyFil;
    }

    // English Voices: Prioritize Google UK English Male first, followed by solemn natural voices
    const priorityNames = [
      'google uk english male',  // Google UK Male: solemn baritone, natural and reverent
      'daniel',                  // British formal baritone: solemn, reverent, and natural
      'oliver',                  // British natural male
      'guy natural',             // Microsoft Natural male
      'david',                   // Microsoft David male
      'mark',                    // Windows male
      'alex',                    // Apple Alex male
      'samantha',                // Natural female fallback
      'google uk english female',// Google UK Female
      'karen',                   // Australian natural
      'google us english'        // Fallback
    ];

    for (const name of priorityNames) {
      const match = this.voices.find(v => v.name.toLowerCase().includes(name));
      if (match) return match;
    }

    // Fallback: any voice matching target language
    const langMatch = this.voices.find(v => v.lang && v.lang.toLowerCase().startsWith(isTagalog ? 'fil' : 'en'));
    if (langMatch) return langMatch;

    // Default voice
    return this.voices.find(v => v.default) || this.voices[0] || null;
  }

  onStateChange(cb) {
    this.onStateChangeCallbacks.push(cb);
  }

  notifyStateChange(extra = {}) {
    const info = {
      isPlaying: this.isPlayingState,
      isPaused: this.isPausedState,
      track: this.currentTrack,
      queueIndex: this.queueIndex,
      queueTotal: this.queue.length,
      rate: this.rate,
      ...extra
    };
    this.onStateChangeCallbacks.forEach(cb => {
      try {
        cb(info);
      } catch (e) {
        console.error('Error in tts state change callback:', e);
      }
    });
  }

  /**
   * Sanitizes scripture text:
   * Strips verse numbers, commentary, footnote markers, and chapter numbers
   * so it reads smoothly and peacefully like a meditative scripture audio track.
   */
  sanitizeScriptureText(textOrContent) {
    if (!textOrContent) return '';

    let raw = '';
    if (typeof textOrContent === 'string') {
      raw = textOrContent;
    } else if (Array.isArray(textOrContent)) {
      raw = textOrContent
        .filter(item => item.type === 'verse')
        .map(item => item.text || '')
        .join(' ');
    }

    // 1. Remove HTML tags if present
    let cleaned = raw.replace(/<[^>]*>/g, ' ');

    // 2. Remove footnote caller symbols like [a], [1], (notes), cross-references
    cleaned = cleaned.replace(/\[\w+\]/g, ' ');
    cleaned = cleaned.replace(/\(\w+\)/g, ' ');
    cleaned = cleaned.replace(/[\+\*\†\‡\#]/g, '');

    // 3. Remove standalone verse numbers (e.g. " 153 ", " 14 ", " 1 ")
    cleaned = cleaned.replace(/^\s*\d+\s+/gm, ' ');
    cleaned = cleaned.replace(/([.!?])\s*\d+\s+/g, '$1 ');
    cleaned = cleaned.replace(/\s\d+\s/g, ' ');

    // 4. Normalize spaces and ensure natural breathing pauses at punctuation
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s*([,;:.!?])\s*/g, '$1 ');

    return cleaned;
  }

  /**
   * Splits text into natural sentence chunks preserving natural punctuation and prosody.
   * Keeps complete grammatical sentences intact (up to maxLen ~350 chars)
   * so speech synthesis engines speak with their native, undistorted human cadence.
   */
  splitIntoSentenceChunks(text, maxLen = 350) {
    if (!text) return [];

    // Split on actual sentence endings: full stops, question marks, exclamation marks, or semicolons
    const rawSentences = text.match(/[^.!?;\n]+[.!?;\n]+|[^.!?;\n]+$/g) || [text];
    const chunks = [];

    for (const raw of rawSentences) {
      const sentence = raw.trim();
      if (!sentence) continue;

      if (sentence.length <= maxLen) {
        chunks.push(sentence);
      } else {
        // If a single sentence exceeds maxLen, break at natural commas preserving punctuation
        const commaParts = sentence.split(/,\s*/);
        let accumulated = '';
        for (let i = 0; i < commaParts.length; i++) {
          const piece = commaParts[i].trim();
          if (!piece) continue;

          const isLast = (i === commaParts.length - 1);
          const pieceWithPunct = isLast ? piece : (piece + ',');

          if ((accumulated + ' ' + pieceWithPunct).trim().length <= maxLen) {
            accumulated = accumulated ? (accumulated + ' ' + pieceWithPunct) : pieceWithPunct;
          } else {
            if (accumulated) chunks.push(accumulated.trim());
            accumulated = pieceWithPunct;
          }
        }
        if (accumulated) chunks.push(accumulated.trim());
      }
    }

    return chunks.filter(c => c && c.replace(/[^\w]/g, '').length > 0);
  }

  /**
   * Main entry point to play scripture audio.
   * Works immediately within the user's click gesture context to ensure audio autoplay permissions.
   */
  async playScripture(cacheKey, rawText, lang = 'en', label = 'Scripture') {
    // 1. Immediately resume Web Speech API to satisfy mobile & desktop browser user activation
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }

    this.stop();

    this.currentTrack = {
      cacheKey,
      label,
      lang,
      loading: true
    };
    this.notifyStateChange();

    // 2. Check if cached audio MP3 exists in IndexedDB
    let cached = null;
    if (window.devotionStore) {
      cached = await window.devotionStore.getTTSAudio(cacheKey);
    }

    if (cached && cached.audioDataUrl) {
      try {
        this.audioElement.src = cached.audioDataUrl;
        this.audioElement.playbackRate = this.rate;
        await this.audioElement.play();
        this.currentTrack.loading = false;
        this.isPlayingState = true;
        this.isPausedState = false;
        this.notifyStateChange();
        return;
      } catch (playErr) {
        console.warn('Cached MP3 audio play failed, falling back to speech queue:', playErr);
      }
    }

    // 3. Prepare sanitized calm text chunks
    const cleanText = this.sanitizeScriptureText(rawText);
    if (!cleanText || cleanText.length < 2) {
      this.stop();
      throw new Error('No readable scripture text found.');
    }

    const langCode = (lang.startsWith('tgl') || lang.startsWith('fil') || lang === 'tl') ? 'tl' : 'en';
    this.currentLang = langCode;

    const chunks = this.splitIntoSentenceChunks(cleanText, 300);
    if (chunks.length === 0) {
      this.stop();
      throw new Error('Could not parse scripture into sentences.');
    }

    // 4. Check if user configured an optional Google Cloud TTS API Key in settings
    const googleApiKey = window.devotionStore ? window.devotionStore.getSetting('google_tts_api_key', '') : '';
    if (googleApiKey && googleApiKey.trim().length > 10) {
      try {
        const cloudMp3Url = await this.synthesizeWithGoogleCloudKey(cleanText, langCode, googleApiKey.trim());
        if (cloudMp3Url) {
          // Save synthesized audio to IndexedDB cache
          if (window.devotionStore) {
            await window.devotionStore.saveTTSAudio(cacheKey, cloudMp3Url, {
              label,
              lang: langCode,
              textPreview: cleanText.slice(0, 120),
              isCloudSynthesis: true
            });
          }
          this.audioElement.src = cloudMp3Url;
          this.audioElement.playbackRate = this.rate;
          await this.audioElement.play();
          this.currentTrack.loading = false;
          this.isPlayingState = true;
          this.isPausedState = false;
          this.notifyStateChange();
          return;
        }
      } catch (cloudErr) {
        console.warn('Google Cloud API synthesis failed, falling back to built-in speech engine:', cloudErr);
      }
    }

    // 5. Store reading record in IndexedDB for offline tracking & data management
    if (window.devotionStore) {
      await window.devotionStore.saveTTSAudio(cacheKey, null, {
        label,
        lang: langCode,
        textPreview: cleanText.slice(0, 120),
        sentenceCount: chunks.length,
        isWebSpeech: true
      });
    }

    // 6. Start peaceful sentence-by-sentence Web Speech queue
    this.startSentenceQueue(chunks, cacheKey, label, langCode);
  }

  /**
   * Starts reading the sentence queue calmly with natural breath pauses
   */
  startSentenceQueue(chunks, cacheKey, label, langCode) {
    if (!('speechSynthesis' in window)) {
      this.stop();
      throw new Error('Web Speech API is not supported in this browser.');
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    this.queue = chunks;
    this.queueIndex = 0;
    this.activeUtterances = [];
    this.currentTrack = {
      cacheKey,
      label,
      lang: langCode,
      loading: false
    };
    this.isPlayingState = true;
    this.isPausedState = false;

    this.notifyStateChange({
      progressText: `Sentence 1 of ${this.queue.length}`
    });

    this.speakCurrentChunk();
  }

  speakCurrentChunk() {
    if (!this.isPlayingState || this.isPausedState) return;

    if (this.queueIndex >= this.queue.length) {
      // Completed reading the whole devotion!
      this.isPlayingState = false;
      this.isPausedState = false;
      this.currentTrack = null;
      this.queue = [];
      this.queueIndex = 0;
      this.activeUtterances = [];
      this.notifyStateChange();
      return;
    }

    const chunkText = this.queue[this.queueIndex];
    const utter = new SpeechSynthesisUtterance(chunkText);
    utter.rate = this.rate;
    utter.pitch = 1.0; // Standard pristine pitch: no warping or acoustic distortion
    utter.lang = (this.currentLang === 'tl') ? 'fil-PH' : 'en-US';

    const voice = this.pickCalmVoice(this.currentLang);
    if (voice) {
      utter.voice = voice;
    }

    utter.onstart = () => {
      this.notifyStateChange({
        progressText: `Sentence ${this.queueIndex + 1} of ${this.queue.length}`,
        currentSentence: chunkText
      });
    };

    utter.onend = () => {
      // Clean up finished utterance to manage memory
      const uIdx = this.activeUtterances.indexOf(utter);
      if (uIdx !== -1) this.activeUtterances.splice(uIdx, 1);

      if (this.isPlayingState && !this.isPausedState) {
        this.queueIndex++;
        // Natural soothing breath pause (150ms) between verses
        setTimeout(() => {
          this.speakCurrentChunk();
        }, 150);
      }
    };

    utter.onerror = (err) => {
      const uIdx = this.activeUtterances.indexOf(utter);
      if (uIdx !== -1) this.activeUtterances.splice(uIdx, 1);

      if (err.error === 'canceled' || err.error === 'interrupted') {
        // User stopped or paused; do not advance automatically
        return;
      }
      console.warn('Speech chunk error, advancing to next sentence:', err.error);
      if (this.isPlayingState && !this.isPausedState) {
        this.queueIndex++;
        setTimeout(() => {
          this.speakCurrentChunk();
        }, 100);
      }
    };

    // Keep utterance referenced in activeUtterances so Chromium V8 doesn't garbage collect it!
    this.activeUtterances.push(utter);

    window.speechSynthesis.speak(utter);
    window.speechSynthesis.resume();
  }

  pause() {
    this.isPausedState = true;
    this.isPlayingState = false;

    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    this.notifyStateChange();
  }

  resume() {
    this.isPausedState = false;
    this.isPlayingState = true;

    if (this.audioElement && this.audioElement.src && this.audioElement.paused) {
      this.audioElement.play();
      this.notifyStateChange();
    } else if ('speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else if (this.queue.length > 0 && this.queueIndex < this.queue.length) {
        this.speakCurrentChunk();
      }
      this.notifyStateChange();
    }
  }

  stop() {
    this.isPlayingState = false;
    this.isPausedState = false;
    this.queue = [];
    this.queueIndex = 0;
    this.currentTrack = null;
    this.activeUtterances = [];

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.removeAttribute('src');
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.notifyStateChange();
  }

  setRate(newRate) {
    this.rate = Math.max(0.6, Math.min(1.4, Number(newRate) || 0.85));
    if (window.devotionStore) {
      window.devotionStore.setSetting('tts_rate', this.rate);
    }
    if (this.audioElement) {
      this.audioElement.playbackRate = this.rate;
    }
  }

  setPreferredVoice(voiceURI) {
    this.preferredVoiceURI = voiceURI || '';
    if (window.devotionStore) {
      window.devotionStore.setSetting('tts_voice_uri', this.preferredVoiceURI);
    }
  }

  setPitch(newPitch) {
    this.pitch = Math.max(0.7, Math.min(1.3, Number(newPitch) || 0.94));
    if (window.devotionStore) {
      window.devotionStore.setSetting('tts_pitch', this.pitch);
    }
  }

  /**
   * Quick voice preview test with pristine default pitch and pacing
   */
  testVoice(sampleText = 'The Lord is my shepherd, I shall not want. He makes me lie down in green pastures; He leads me beside quiet waters, He restores my soul.') {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const utter = new SpeechSynthesisUtterance(sampleText);
      utter.rate = this.rate;
      utter.pitch = 1.0; // Clean, undistorted native pitch
      const voice = this.pickCalmVoice(this.currentLang);
      if (voice) utter.voice = voice;
      window.speechSynthesis.speak(utter);
      window.speechSynthesis.resume();
    }
  }

  /**
   * Optional Google Cloud Text-to-Speech API integration
   * Only used if the user provides their own Google Cloud API key in Settings.
   */
  async synthesizeWithGoogleCloudKey(text, langCode, apiKey) {
    const isTagalog = (langCode === 'tl' || langCode.startsWith('fil'));
    const body = {
      input: { text: text.slice(0, 4800) },
      voice: {
        languageCode: isTagalog ? 'fil-PH' : 'en-US',
        name: isTagalog ? 'fil-PH-Wavenet-A' : 'en-US-Neural2-F',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: this.rate,
        pitch: 0.0
      }
    };

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(`Google Cloud TTS API Error (${res.status}): ${errJson.error?.message || res.statusText}`);
    }

    const data = await res.json();
    if (data.audioContent) {
      return `data:audio/mp3;base64,${data.audioContent}`;
    }
    return null;
  }

  /**
   * Downloads the audio reading or meditation script for offline listening
   */
  async downloadStoredAudio(cacheKey, filename = 'scripture_reading.mp3') {
    let cached = null;
    if (window.devotionStore) {
      cached = await window.devotionStore.getTTSAudio(cacheKey);
    }

    if (cached && cached.audioDataUrl) {
      const a = document.createElement('a');
      a.href = cached.audioDataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }

    // If no MP3 audio file is cached, export the cleaned devotional meditation audio script
    const currentTrack = this.currentTrack;
    const title = currentTrack?.label || 'Daily Scripture Reading';
    const textContent = this.queue.length > 0 ? this.queue.join('\n\n') : 'Scripture meditation ready for prayerful reflection.';
    const fileHeader = `DAILY DEVOTIONS - SCRIPTURE AUDIO MEDITATION SCRIPT\nTitle: ${title}\nPacing: Calm & Soothing (Rate: ${this.rate}x)\nGenerated: ${new Date().toLocaleString()}\n\n---\n\n`;

    const blob = new Blob([fileHeader + textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.mp3$/i, '_meditation_script.txt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }
}

window.ttsService = new TTSService();