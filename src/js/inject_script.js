/**
 * inject_script.js - front-end logic for extension
 */

// Global state
window.ytalCounter = window.ytalCounter || 1;
const uniqueGenres = new Set();
const uniqueMoods = new Set();
const processedUrls = new Set();
let jsonSaveTimeout = null;

function createDownloadLink() {
    let elAudioLibraryContent = document.querySelector('#audio-library-content');
    let elAudioLibraryBrowser = elAudioLibraryContent && elAudioLibraryContent.querySelector('.audio-library-browser');
    let elAudioLibraryTrackList = elAudioLibraryBrowser && elAudioLibraryBrowser.querySelector('.track-list');
    let elAudioLibraryTrackFooter = elAudioLibraryContent && elAudioLibraryContent.querySelector('#audio-library-track-footer');

    if (!elAudioLibraryTrackList || !elAudioLibraryTrackFooter)
        return false;
    if (document.querySelector('.ytal-download'))
        return true;

    let elYTALContainer = document.createElement('span');
    elYTALContainer.classList.add('ytal-download');
    let elYTALLink = document.createElement('a');
    elYTALLink.href = 'javascript:void(0)';
    elYTALLink.innerText = chrome.i18n.getMessage('lblDownloadAllTracks');
    elYTALLink.title = chrome.i18n.getMessage('lblDownloadAllTracksNote');
    elYTALContainer.appendChild(elYTALLink);
    elAudioLibraryTrackFooter.appendChild(elYTALContainer);
    elYTALLink.addEventListener('click', onClickDownloadTracks);

    return true;
}

function waitForDownloadLink() {
    if (!createDownloadLink())
        setTimeout(waitForDownloadLink, 500);
}

waitForDownloadLink();

function onClickDownloadTracks(e) {
    let elAudioLibraryContent = document.querySelector('#audio-library-content');
    let elAudioLibraryBrowser = elAudioLibraryContent && elAudioLibraryContent.querySelector('.audio-library-browser');
    let elAudioLibraryTrackList = elAudioLibraryBrowser && elAudioLibraryBrowser.querySelector('.track-list');
    let audioTracks = [];

    if (elAudioLibraryTrackList) {
        audioTracks = Array.from(elAudioLibraryTrackList.querySelectorAll('div.audiolibrary-column.audiolibrary-column-download a'))
            .map(link => link.href)
            .filter((link, i, a) => i === a.lastIndexOf(link));
    }

    e.preventDefault();
    if (audioTracks.length === 0) {
        chrome.runtime.sendMessage({ command: 2, message: chrome.i18n.getMessage('msgAudioTracksNotFound') });
        return false;
    }
    chrome.runtime.sendMessage({
        command: 0,
        data: audioTracks.map(url => ({ url, filename: 'downloads/' + url.split('/').pop() }))
    });
    return false;
}

if (location.hostname === 'studio.youtube.com') {
    try {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('src/js/in_page_hook.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    } catch (e) { }

    const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9\s]/g, '');
    const slug = (s) => (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s&]+/g, '_').slice(0, 30);

    function createStudioButton() {
        if (document.getElementById('ytal-download-studio')) return true;
        const actions = document.querySelector('.audio-library-header, .toolbar, .ytmus-page-header, #audio-library-header');
        const container = actions || document.querySelector('body');
        if (!container) return false;
        const btn = document.createElement('button');
        btn.id = 'ytal-download-studio';
        btn.innerText = 'Download All Tracks';
        btn.style = 'position:fixed;top:84px;right:16px;z-index:99999;background:#ffcc00;border:1px solid #333;border-radius:4px;padding:8px 16px;cursor:pointer;font-weight:bold;';
        btn.addEventListener('click', onStudioDownloadAll);
        container.insertBefore(btn, container.firstChild);
        return true;
    }

    function onStudioDownloadAll() {
        console.debug('ytal-cs: Download All clicked');
        const rows = document.querySelectorAll('ytmus-audio-library-track-row, .track-row, div#row-container, [role="row"]');
        if (!rows.length) {
            window.postMessage({ source: 'ytal-extension', action: 'request-tracks' }, '*');
            return;
        }
        let delay = 0;
        rows.forEach((r) => {
            setTimeout(() => {
                try {
                    const btn = r.querySelector('button[aria-label*="Download"], a[aria-label*="Download"], .download-icon');
                    if (btn) btn.click();
                    else window.postMessage({ source: 'ytal-extension', action: 'request-tracks' }, '*');
                } catch (e) {}
            }, delay);
            delay += 250;
        });
    }

    // Now using RAW data from the row, just slugified for clean folder paths
    function mapToRaw(val, fallback) {
        if (!val) return fallback;
        return slug(val);
    }

    window.addEventListener('message', async function (e) {
        if (!e.data || e.data.source !== 'ytal-hook') return;
        const payload = e.data.payload || {};
        if (payload.type !== 'tracks') return;

        const rawUrls = payload.urls || [];
        const rawItems = payload.items || [];
        const candidates = [...rawItems];
        rawUrls.forEach(url => { if (!candidates.find(c => c.url === url)) candidates.push({ url }); });

        const rows = document.querySelectorAll('ytmus-audio-library-track-row, .track-row, div#row-container, [role="row"]');
        const rowsMap = new Map();
        const YT_GENRES = ['dance', 'electronic', 'ambient', 'cinematic', 'classical', 'country', 'folk', 'hip hop', 'rap', 'jazz', 'blues', 'kids', 'pop', 'reggae', 'rock', 'soul', 'r&b', 'world'];
        const YT_MOODS = ['angry', 'bright', 'calm', 'dark', 'dramatic', 'funky', 'happy', 'inspirational', 'romantic', 'sad'];

        rows.forEach(r => {
            const cells = Array.from(r.querySelectorAll('div, span, a')).map(c => c.textContent.trim()).filter(t => t.length > 2);
            let title = '', genre = '', mood = '', artist = '', duration = 0;
            const titleEl = r.querySelector('#title, .title, [id*="title"], [aria-label*="title"]');
            if (titleEl) title = titleEl.textContent.trim();
            const artistEl = r.querySelector('#artist, .artist, [id*="artist"]');
            if (artistEl) artist = artistEl.textContent.trim();
            cells.forEach(c => {
                const low = c.toLowerCase();
                if (!genre && YT_GENRES.some(g => low.includes(g))) genre = c;
                else if (!mood && YT_MOODS.some(m => low.includes(m))) mood = c;
            });
            const m = r.textContent.match(/(\d{1,2}:\d{2})/);
            if (m) { const p = m[1].split(':').map(Number); duration = p[0] * 60 + p[1]; }
            if (title) {
                const data = { title, artist, genre, mood, duration };
                rowsMap.set(norm(title), data);
                rowsMap.set(norm(title + ' ' + artist), data);
            }
        });

        const tracksToProcess = [];
        for (const cand of candidates) {
            if (processedUrls.has(cand.url)) continue;
            processedUrls.add(cand.url);

            const u = new URL(cand.url);
            let urlTitle = u.searchParams.get('title') || u.searchParams.get('name') || '';
            if (!urlTitle) urlTitle = decodeURIComponent((u.pathname.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, ''));
            
            const lookupKey = norm(cand.metadata ? cand.metadata.title : urlTitle);
            let row = rowsMap.get(lookupKey);
            if (!row && lookupKey) {
                for (const [rk, rv] of rowsMap.entries()) { if (lookupKey.includes(rk) || rk.includes(lookupKey)) { row = rv; break; } }
            }

            const title = (row && row.title) || urlTitle || 'track';
            const artist = (row && row.artist) || '';
            const genre = (row && row.genre) || 'cinematic';
            const mood = (row && row.mood) || 'calm';
            const duration = (row && row.duration) || 0;

            if (duration > 0 && duration < 10) continue;

            const gKey = mapToRaw(genre, 'cinematic');
            const mKey = mapToRaw(mood, 'calm');
            const desc = slug(title);
            const id = String(window.ytalCounter++).padStart(2, '0');
            const filename = `${gKey}_${mKey}_${desc}_${id}.mp3`;
            const path = `assets/music/${gKey}/${mKey}/${filename}`;

            tracksToProcess.push({
                url: cand.url, filename: path,
                metadata: {
                    title, artist, genre: gKey, mood: mKey, duration,
                    energy: (/energi|heavy|bright|motivation/.test(mood.toLowerCase())) ? 8 : 4,
                    usage: 'allow'
                }
            });
            uniqueGenres.add(gKey);
            uniqueMoods.add(mKey);
        }

        if (tracksToProcess.length > 0) {
            console.log(`ytal-cs: queuing ${tracksToProcess.length} unique tracks...`);
            for (let i = 0; i < tracksToProcess.length; i++) {
                chrome.runtime.sendMessage({ command: 0, data: [tracksToProcess[i]] });
                await new Promise(r => setTimeout(r, 300));
            }

            if (jsonSaveTimeout) clearTimeout(jsonSaveTimeout);
            jsonSaveTimeout = setTimeout(() => {
                chrome.runtime.sendMessage({
                    command: 0,
                    data: [{
                        url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({
                            genres: Array.from(uniqueGenres).sort(), moods: Array.from(uniqueMoods).sort()
                        }, null, 2)),
                        filename: 'assets/music/genres_and_moods.json',
                        isMetadata: true
                    }]
                });
            }, 1800);
        }
    });

    (function waitStudio() { if (!createStudioButton()) setTimeout(waitStudio, 800); })();
    const observer = new MutationObserver(() => { if (!document.getElementById('ytal-download-studio')) createStudioButton(); });
    const target = document.body || document.documentElement;
    if (target) observer.observe(target, { childList: true, subtree: true });
}
