# YouTube Audio Library Downloader

Look, I didn't want to write a stiff, corporate README, okay? Writing buzzwords takes up way too much energy, and I have the latest issue of Jump to read.

I've been dealing with code for 8+ years. I build massive, scalable systems, enterprise SaaS platforms, and AI tools—usually because someone paid me enough to buy more strawberry milk. I’ve got a Cybersecurity Degree, which basically means I know how to break your stuff and then complain about having to fix it.

I built this Chrome extension because I got tired of the manual slog of the YouTube Audio Library. It doesn't just download files; it cleans up the mess so you don't have to.

### 🍓 What it actually does
- **Download All Tracks:** One button to rule them all. No more manual clicking.
- **Strict Classification:** It detects your existing folder structure (`/assets/music/<genre>/<mood>/`) and saves files ONLY there. No new category clutter.
- **Fuzzy Metadata Matching:** It scans the page for metadata (Genre, Mood, Artist) and matches it to network requests even when YouTube decides to change the title format halfway through.
- **Mandatory JSONs:** Every MP3 gets a matching `.json` with title, artist, duration, energy (1-10), and usage rights.
- **Sanitized Naming:** `<genre>_<mood>_<descriptor>_<id>.mp3`. Lowercase, clean, and unique.

### 📦 Installation
1. `npm install` (because you have to)
2. `npm run build`
3. Go to `chrome://extensions/`, enable Developer Mode, and "Load Unpacked" the `dist` folder.

### 🛠️ How it works
It injects a script into the YouTube Studio page, hijacks the network hook to steal the high-quality download URLs, and then uses a fuzzy pattern-matching engine to map those URLs back to the Genre/Mood columns you see on your screen. 

I might complain a lot about the code, but it works. It's production-ready, secure, and ready to save you hours of your vida.

### Disclaimer
Not affiliated with YouTube. Don't be a jerk with it.

---
Built by [Kisal Nelaka](https://github.com/kisalnelaka). Powered by strawberry milk and probably too much sugar.
