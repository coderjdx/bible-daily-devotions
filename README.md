# Daily Devotions: Bible Companion App (v1.0.0 Stable Reference)

A modern, distraction-free, 100% private, on-device Progressive Web Application (PWA) designed for daily Bible reading, journaling, verse highlighting, Sunday church service notes, and aesthetic scripture card sharing.

---

## 🌟 Key Features

### 📖 Scripture & Devotional Journey
* **Multi-Passage Daily Schedules**: Read Psalms, Old Testament, and New Testament passages side-by-side.
* **Multiple Translations**: Instant toggle between Berean Standard Bible (BSB) and Ang Biblia (Tagalog).
* **Calm Audio Read-Aloud (TTS)**: Clean, verse-by-verse and full-passage audio player with floating controls and background playback.

### 🎨 Verse Highlighting & Multi-Verse Selection
* **In-Text Color Highlighting**: 4 aesthetic colors (Gold, Emerald Green, Sky Blue, Royal Purple).
* **Multi-Verse Selection**: Tap multiple verses across a passage with a compact 2-tier mobile action bar.
* **Dedicated Highlights Journal**: Review all highlighted verses in the Journal tab with color filters, date links, and copy actions.

### 🖼️ Shareable Scripture Card Generator
* **Aesthetic Visual Themes**: Midnight, Dawn, Ocean, Garden, or custom background photo with smart vignette.
* **Native Aspect Ratios**: Portrait (4:5), Square (1:1), and Story (9:16 optimized for Instagram and Facebook Stories).
* **Dynamic Typography**: Inverse character scaling (up to 70px) so short and long passages look balanced.
* **Top-Center Branding**: Official Daily Devotions icon with squircle badge and theme-matching border.
* **Native Mobile Sharing**: Web Share API Level 2 to share directly to Instagram, Facebook, AirDrop, or Camera Roll.

### ✍️ Dual Journaling & Tagging
* **S.O.A.P. & Freeform Modes**: Structured (Scripture, Observation, Application, Prayer) or classic journal.
* **Universal Tagging System**: Tag daily reflections and filter entries by tags in the Journal tab.
* **Photo Journaling**: Attach high-res photos with a visual gallery grid and lightbox.

### ⛪ Sunday Church Service Notes
* **Dynamic Sunday Card**: Appears automatically on Sundays.
* **Attendance Tracking**: 1-tap confirmation ("Attended Sunday Service").
* **Sermon Notes**: Record Title, Speaker, and Sermon Notes, accessible in a dedicated Journal category.

### 📊 Monthly "Spiritual Walk with God" Infographics
* Canvas-rendered summary card displaying reading days completed, total scriptures read, streak consistency, and top tags.
* 1-tap download and shareable summary.

### 🛡️ 100% On-Device Privacy & Offline Readiness
* **Zero Cloud Tracking**: All notes, highlights, and photos stay in encrypted IndexedDB on your device.
* **Full Offline PWA**: Installable on iPhone, iPad, Android, macOS, and Windows. Fully functional without internet.

---

## 🚀 Quick Start & Installation

### Running Locally
```bash
# Start the local server
python3 server.py
# Open http://localhost:8080 in your browser
```

### Installing on Apple Devices (iOS / iPadOS)
1. Open the app URL in **Safari**.
2. Tap the **Share** button (box with upward arrow) in the bottom toolbar.
3. Scroll down and tap **Add to Home Screen** (⊞).
4. Tap **Add** in the top-right corner.
5. Launch from your Home Screen for a clean, full-screen native experience.

### Installing on Android
1. Open the app URL in **Google Chrome** or **Samsung Internet**.
2. Tap the **Install app** prompt or open the three-dot menu (⋮) and select **Install app** / **Add to Home screen**.
3. Tap **Install** on the confirmation dialog.

---

## 📁 Repository Structure
```
├── css/
│   └── app.css               # Application stylesheet & themes (Dark & Light)
├── js/
│   ├── app.js               # Application controllers, views, & card generator
│   ├── bible-service.js     # Scripture parsing & multi-version provider
│   ├── store.js             # IndexedDB local persistence engine
│   └── tts-service.js       # Speech synthesis & audio playback controller
├── data/
│   ├── preloaded_verses.json        # Fast offline scripture cache
│   ├── schedule_november_2026.json  # 30-day reading schedules
│   └── word_rolodex.json            # Daily inspirational memory verses
├── icons/                   # High-res PWA favicons & app icons
├── index.html               # Main application shell
├── manifest.json            # PWA web app manifest
├── server.py                # Local development server
└── sw.js                    # Service Worker with offline caching
```

---

## 📜 License
MIT License. Created for daily spiritual focus, reflection, and quiet time with God.
