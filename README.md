# YouTube Audio Library Downloader

This project is a Chrome extension designed to batch download audio and sound effect tracks from the YouTube Audio Library. It has been extensively modified and improved to suit specific needs, including better filename handling, metadata creation, and genre/mood categorization.

### Features

- Batch download audio tracks with sanitized filenames.
- Automatically generate metadata files for each track.
- Categorize tracks by genre and mood dynamically.
- Manage concurrent downloads to prevent bandwidth saturation.

### How to Use

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Build the Extension**:
   ```bash
   npm run build
   ```
3. **Load the Extension**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable "Developer mode".
   - Click "Load unpacked" and select the `dist` folder.

### How It Works

The extension injects a script into the YouTube Audio Library page, adding a "Download All Tracks" button. This button queues all visible tracks for download. To use it:

1. Set your desired filters (e.g., genre, mood) in the YouTube Audio Library.
2. Scroll down to load all tracks.
3. Click the "Download All Tracks" button.
4. Wait for the downloads to complete.

### Notes

- This project was heavily modified to improve functionality and usability.
- It is designed for personal use and works effectively for its intended purpose.

### Disclaimer

This project is not affiliated with or endorsed by YouTube. Use it responsibly and ensure compliance with YouTube's terms of service.
