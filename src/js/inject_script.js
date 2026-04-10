/**
 * inject_script.js - front-end logic for extension
 *
 */

function createDownloadLink() {
    let elAudioLibraryContent = document.querySelector('#audio-library-content');
    let elAudioLibraryBrowser = elAudioLibraryContent && elAudioLibraryContent.querySelector('.audio-library-browser');
    let elAudioLibraryTrackList = elAudioLibraryBrowser && elAudioLibraryBrowser.querySelector('.track-list');
    let elAudioLibraryTrackFooter = elAudioLibraryContent && elAudioLibraryContent.querySelector('#audio-library-track-footer');

    if (!elAudioLibraryTrackList || !elAudioLibraryTrackFooter)
        return false;
    if (document.querySelector('.ytal-download'))
        return true;

    // Generating "Download All Tracks" link and its container
    let elYTALContainer = document.createElement('span');
    elYTALContainer.classList.add('ytal-download');
    let elYTALLink = document.createElement('a');
    elYTALLink.href = 'javascript:void(0)';
    elYTALLink.innerText = chrome.i18n.getMessage('lblDownloadAllTracks');
    elYTALLink.title = chrome.i18n.getMessage('lblDownloadAllTracksNote');
    elYTALContainer.appendChild(elYTALLink);
    elAudioLibraryTrackFooter.appendChild(elYTALContainer);

    // Registering the click action for generated link
    elYTALLink.addEventListener('click', onClickDownloadTracks);

    return true;
}

function waitForDownloadLink() {
    if (!createDownloadLink())
        setTimeout(waitForDownloadLink, 500);
}

waitForDownloadLink();
// Studio support: inject in-page hook and listen for captured URLs
if (location.hostname === 'studio.youtube.com') {
    try {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('src/js/in_page_hook.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    } catch (e) { }

    function createStudioButton() {
        if (document.getElementById('ytal-download-studio')) return true;
        const actions = document.querySelector('.audio-library-header, .toolbar, .ytmus-page-header, #audio-library-header');
        const container = actions || document.querySelector('body');
        if (!container) return false;
        const btn = document.createElement('button');
        btn.id = 'ytal-download-studio';
        btn.className = 'ytal-download-studio';
        btn.innerText = chrome.i18n.getMessage('lblDownloadAllTracks') || 'Download All Tracks';
        btn.style.margin = '8px';
        btn.style.padding = '6px 12px';
        btn.style.cursor = 'pointer';
        // make it persistent and visible above other elements
        btn.style.position = 'fixed';
        btn.style.top = '84px';
        btn.style.right = '16px';
        btn.style.zIndex = '99999';
        btn.style.background = '#ffcc00';
        btn.style.border = '1px solid #333';
        btn.style.borderRadius = '4px';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        btn.addEventListener('click', onStudioDownloadAll);
        container.insertBefore(btn, container.firstChild);
        return true;
    }

    function onStudioDownloadAll() {
        console.debug('ytal-cs: Download All clicked — attempting per-row click harvest');
        // Try to click each row's Download button to force the page to reveal the per-track URL.
        const rows = Array.from(document.querySelectorAll('div#row-container'));
        if (!rows.length) {
            // fallback: attempt a single request scan
            window.postMessage({ source: 'ytal-extension', action: 'request-tracks' }, '*');
            return;
        }
        let delay = 0;
        rows.forEach((r, i) => {
            setTimeout(() => {
                try {
                    // try to find a download control inside the row
                    const btn = Array.from(r.querySelectorAll('button, a')).find(el => {
                        const txt = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
                        return txt.includes('download') || txt.includes('download track') || txt.includes('download audio');
                    });
                    if (btn) {
                        // dispatch real mouse events to trigger any handlers
                        const ev1 = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
                        const ev2 = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
                        btn.dispatchEvent(ev1);
                        btn.dispatchEvent(ev2);
                        btn.click();
                        console.debug('ytal-cs: clicked row', i);
                    } else {
                        // try to open contextual actions or send a scan for this row
                        window.postMessage({ source: 'ytal-extension', action: 'request-tracks' }, '*');
                    }
                } catch (e) {}
            }, delay);
            delay += 300; // stagger clicks to let the page render per-row controls
        });
    }

    // Create a small debug overlay in the page to show messages when console is unreliable
    function createDebugOverlay() {
        if (document.getElementById('ytal-debug')) return;
        const panel = document.createElement('div');
        panel.id = 'ytal-debug';
        panel.style.position = 'fixed';
        panel.style.right = '16px';
        panel.style.bottom = '16px';
        panel.style.width = '360px';
        panel.style.maxHeight = '40vh';
        panel.style.overflow = 'auto';
        panel.style.background = 'rgba(0,0,0,0.85)';
        panel.style.color = '#fff';
        panel.style.fontSize = '12px';
        panel.style.padding = '8px';
        panel.style.zIndex = '2147483647';
        panel.style.borderRadius = '6px';
        panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';
        panel.innerHTML = '<div style="font-weight:bold;margin-bottom:6px;">YTAL Debug</div>';
        document.body.appendChild(panel);
    }
    try { createDebugOverlay(); } catch (e) {}

    window.addEventListener('message', function (e) {
        if (!e.data || e.data.source !== 'ytal-hook') return;
        const payload = e.data.payload || {};
        // append debug overlay messages
        try{
            const panel = document.getElementById('ytal-debug');
            if(panel){
                const line = document.createElement('div');
                line.style.marginBottom = '6px';
                line.textContent = '[' + (payload.type||'msg') + '] ' + (payload.urls ? payload.urls.length + ' urls' : JSON.stringify(payload).slice(0,120));
                panel.appendChild(line);
                panel.scrollTop = panel.scrollHeight;
            }
        }catch(e){}
            if (payload.type === 'tracks' && ((Array.isArray(payload.items) && payload.items.length) || (Array.isArray(payload.urls) && payload.urls.length))) {
                if (Array.isArray(payload.items) && payload.items.length) {
                    console.log('ytal-cs: received structured items payload', payload.items.length);
                    chrome.runtime.sendMessage({ command: Commands.Download, data: payload.items }, function(response){
                        if (chrome.runtime.lastError) console.error('ytal-cs: sendMessage error', chrome.runtime.lastError.message);
                    });
                    return;
                }
                console.log('ytal-cs: received tracks payload', payload.urls.length);
            // Build a map of visible rows keyed by normalized title
            function norm(s){ return (s||'').toString().trim().toLowerCase().replace(/\s+/g,' '); }
            function slug(s){ return (s||'').toString().trim().toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'_'); }

            const rows = Array.from(document.querySelectorAll('div#row-container'));
            const rowsMap = {};
            rows.forEach(r => {
                const titleEl = r.querySelector('#title');
                const genreEl = r.querySelector('#genre');
                const moodEl = r.querySelector('#mood');
                // try to find duration by pattern mm:ss in text nodes
                let duration = 0;
                const txt = r.textContent || '';
                const m = txt.match(/(\d{1,2}:\d{2})/);
                if (m) {
                    const parts = m[1].split(':').map(Number);
                    duration = parts[0]*60 + parts[1];
                }
                const title = titleEl ? titleEl.textContent.trim() : '';
                const genre = genreEl ? genreEl.textContent.trim() : '';
                const mood = moodEl ? moodEl.textContent.trim() : '';
                if (title) rowsMap[ norm(title) ] = { title, genre, mood, duration };
            });

            // mapping helpers
            function mapGenre(g){
                if (!g) return 'cinematic';
                g = g.toLowerCase();
                if(/dance|electronic|edm|electro/.test(g)) return 'electronic';
                if(/ambient|chill|downtempo/.test(g)) return 'ambient';
                if(/orchestral|classical|score|cinematic|epic/.test(g)) return /cinematic|epic/.test(g) ? 'cinematic' : 'orchestral';
                if(/lo-?fi|lo fi|lofi/.test(g)) return 'lo-fi';
                if(/jazz|blues|folk|country/.test(g)) return 'ambient';
                return 'electronic';
            }
            function mapMood(m){
                if(!m) return 'calm';
                m = m.toLowerCase();
                if(/inspir|motiva|energi|bright|upbeat/.test(m)) return 'motivation';
                if(/calm|soft|relax|ambient|chill/.test(m)) return 'calm';
                if(/sad|emotional|melanchol|slow/.test(m)) return 'emotional';
                if(/dark|angry|tense|dramatic/.test(m)) return 'dark';
                if(/energi|fast|upbeat|bright/.test(m)) return 'energetic';
                return 'calm';
            }

            // build download items by matching title inside url (title= param)
            const items = [];
            const counters = {};
            let fallbackSeq = 0;
            payload.urls.forEach(url => {
                try{
                    const u = new URL(url);
                    let t = u.searchParams.get('title') || u.searchParams.get('name') || '';
                    if(!t){
                        // try to extract title from path
                        const p = u.pathname || '';
                        t = decodeURIComponent((p.split('/').pop()||'').replace(/\.[a-z0-9]+$/i,''));
                    }
                    const normt = norm(t);
                    const row = rowsMap[normt];
                    if(row) {
                        // duration check
                        if(row.duration && row.duration < 30) return;
                        // heuristic skip vocals: title contains feat or ft.
                        if(/\bfeat\b|\bft\b|\bvocal\b|\blyrics\b/i.test(row.title)) return;

                        const genreKey = mapGenre(row.genre);
                        const moodKey = mapMood(row.mood);
                        // base name
                        const short = slug(row.title).slice(0,40);
                        counters[genreKey] = counters[genreKey] || {};
                        counters[genreKey][moodKey] = (counters[genreKey][moodKey] || 0) + 1;
                        const seq = String(counters[genreKey][moodKey]).padStart(2,'0');
                        const filenameBase = `${genreKey}_${moodKey}_${short}_${seq}`;
                        const mp3name = `assets/music/${genreKey}/${moodKey}/${filenameBase}.mp3`;
                        const metadata = {
                            genre: genreKey,
                            mood: moodKey,
                            energy: 'unknown',
                            bpm: 'unknown',
                            usage: [moodKey]
                        };
                        items.push({ url: url, filename: mp3name, metadata: metadata });
                    } else {
                        // fallback: no row match, but still construct a structured filename
                        fallbackSeq++;
                        const shortTitle = t ? slug(t).slice(0, 50) : 'track';
                        const fallbackName = `assets/music/electronic/calm/fallback_${String(fallbackSeq).padStart(3, '0')}_${shortTitle || 'unknown'}.mp3`;
                        const fallbackMetadata = processRow({ genre: 'electronic', mood: 'calm' }, { title: t, url });
                        console.log('ytal-cs: Using fallback filename and metadata:', fallbackName, fallbackMetadata);
                        items.push(fallbackMetadata);
                    }
                }catch(e){
                    // total fallback if anything fails
                    fallbackSeq++;
                    const fallbackName = `assets/music/electronic/calm/fallback_${String(fallbackSeq).padStart(3,'0')}_error.mp3`;
                    items.push({ url: url, filename: fallbackName });
                }
            });

            if(items.length) {
                console.log('ytal-cs: sending', items.length, 'download items to background');
                // Add logging to trace message sending and errors
                console.log('ytal-cs: sending message to background script', { command: Commands.Download, data: items });
                chrome.runtime.sendMessage({ command: Commands.Download, data: items }, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error('ytal-cs: sendMessage error', chrome.runtime.lastError.message);
                    } else {
                        console.log('ytal-cs: message sent successfully', response);
                    }
                });
            }
        }
    }, false);

    // Listen for messages from the background (download started/completed)
    try{
        chrome.runtime.onMessage.addListener(function (msg) {
            try{
                const panel = document.getElementById('ytal-debug');
                if (!panel) return;
                if (msg && msg.command === 'DL_STARTED') {
                    const line = document.createElement('div');
                    line.style.color = '#9f9';
                    line.textContent = 'STARTED: ' + (msg.filename || msg.url || msg.id || '');
                    panel.appendChild(line);
                    panel.scrollTop = panel.scrollHeight;
                } else if (msg && msg.command === 'DL_COMPLETE') {
                    const line = document.createElement('div');
                    line.style.color = '#6cf';
                    line.textContent = 'COMPLETE: ' + (msg.id || '');
                    panel.appendChild(line);
                    panel.scrollTop = panel.scrollHeight;
                } else if (msg && msg.command === 'DL_ERROR') {
                    const line = document.createElement('div');
                    line.style.color = '#f66';
                    line.textContent = 'ERROR: ' + (msg.filename || msg.url || '') + ' - ' + (msg.error || 'unknown');
                    panel.appendChild(line);
                    panel.scrollTop = panel.scrollHeight;
                }
            }catch(e){}
        });
    }catch(e){}

    (function waitStudio() { if (!createStudioButton()) setTimeout(waitStudio, 800); })();
    // Ensure the studio button persists across dynamic DOM updates
    try {
        const observer = new MutationObserver(function () {
            if (!document.getElementById('ytal-download-studio')) createStudioButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        // also ensure it's present when visibility changes
        document.addEventListener('visibilitychange', function () { if (!document.getElementById('ytal-download-studio')) createStudioButton(); });
    } catch (e) { }
}

/**
 * Send download message to the eventPage.
 *
 * @param {Event} e
 * @returns {boolean}
 *
 * @callback
 *
 */
function onClickDownloadTracks(e) {
    let elAudioLibraryContent = document.querySelector('#audio-library-content');
    let elAudioLibraryBrowser = elAudioLibraryContent && elAudioLibraryContent.querySelector('.audio-library-browser');
    let elAudioLibraryTrackList = elAudioLibraryBrowser && elAudioLibraryBrowser.querySelector('.track-list');
    let audioTracks = [];

    if (elAudioLibraryTrackList) {
        audioTracks = Array
            .from(elAudioLibraryTrackList.querySelectorAll('div.audiolibrary-column.audiolibrary-column-download a'))
            .map(function (link) { return link.href; })
            .filter(function (link, i, a) { return i === a.lastIndexOf(link); });
    }

    e.preventDefault();

    if (audioTracks.length === 0) {
        chrome.runtime.sendMessage({
            command: Commands.Notify,
            message: chrome.i18n.getMessage('msgAudioTracksNotFound')
        });
        return false;
    }
    if (audioTracks.length === 1) {
        chrome.runtime.sendMessage({
            command: Commands.Notify,
            message: chrome.i18n.getMessage('msgAudioTrackFound')
        });
    }
    else {
        chrome.runtime.sendMessage({
            command: Commands.Notify,
            message: chrome.i18n.getMessage('msgAudioTracksFound', [audioTracks.length])
        });
    }
    chrome.runtime.sendMessage({
        command: Commands.Download,
        data: audioTracks
    });
    return false;
}

// Global sets to store unique genres and moods
const uniqueGenres = new Set();
const uniqueMoods = new Set();

// Update mapGenre to collect unique genres
function mapGenre(g) {
    console.log('ytal-cs: mapping genre for', g);
    if (!g) return 'cinematic';
    g = g.toLowerCase();
    if (/dance|electronic|edm|electro/.test(g)) {
        uniqueGenres.add('electronic');
        return 'electronic';
    }
    if (/ambient|chill|downtempo/.test(g)) {
        uniqueGenres.add('ambient');
        return 'ambient';
    }
    if (/orchestral|classical|score|cinematic|epic/.test(g)) {
        const genre = /cinematic|epic/.test(g) ? 'cinematic' : 'orchestral';
        uniqueGenres.add(genre);
        return genre;
    }
    if (/lo-?fi|lo fi|lofi/.test(g)) {
        uniqueGenres.add('lo-fi');
        return 'lo-fi';
    }
    if (/jazz|blues|folk|country/.test(g)) {
        uniqueGenres.add('ambient');
        return 'ambient';
    }
    uniqueGenres.add('electronic');
    return 'electronic';
}

// Update mapMood to collect unique moods
function mapMood(m) {
    console.log('ytal-cs: mapping mood for', m);
    if (!m) return 'calm';
    m = m.toLowerCase();
    if (/inspir|motiva|energi|bright|upbeat/.test(m)) {
        uniqueMoods.add('motivation');
        return 'motivation';
    }
    if (/calm|soft|relax|ambient|chill/.test(m)) {
        uniqueMoods.add('calm');
        return 'calm';
    }
    if (/sad|emotional|melanchol|slow/.test(m)) {
        uniqueMoods.add('emotional');
        return 'emotional';
    }
    if (/dark|angry|tense|dramatic/.test(m)) {
        uniqueMoods.add('dark');
        return 'dark';
    }
    if (/energi|fast|upbeat|bright/.test(m)) {
        uniqueMoods.add('energetic');
        return 'energetic';
    }
    uniqueMoods.add('calm');
    return 'calm';
}

// Write unique genres and moods to a JSON file
function writeGenresAndMoodsToFile() {
    const data = {
        genres: Array.from(uniqueGenres),
        moods: Array.from(uniqueMoods)
    };
    const json = JSON.stringify(data, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    const filename = 'assets/music/genres_and_moods.json';
    console.debug('ytal-cs: saving genres and moods as', filename);
    chrome.runtime.sendMessage({
        command: Commands.Download,
        data: [{ url: dataUrl, filename: filename }]
    }, function (response) {
        if (chrome.runtime.lastError) {
            console.error('ytal-cs: sendMessage error while saving genres and moods', chrome.runtime.lastError.message);
        } else {
            console.log('ytal-cs: genres and moods saved successfully');
        }
    });
}

// Call writeGenresAndMoodsToFile after processing all tracks
if (items.length) {
    console.log('ytal-cs: sending', items.length, 'download items to background');
    chrome.runtime.sendMessage({ command: Commands.Download, data: items }, function(response) {
        if (chrome.runtime.lastError) {
            console.error('ytal-cs: sendMessage error', chrome.runtime.lastError.message);
        }
    });
    writeGenresAndMoodsToFile();
}

// Update logic to extract genre and mood from row data
function processRow(row, track) {
    console.log('ytal-cs: Processing row:', row);

    const genre = row.genre ? row.genre : 'unknown';
    const mood = row.mood ? row.mood : 'unknown';

    console.log('ytal-cs: Extracted genre:', genre, 'Extracted mood:', mood);

    const mappedGenre = mapGenre(genre);
    const mappedMood = mapMood(mood);

    console.log('ytal-cs: Mapped genre:', mappedGenre, 'Mapped mood:', mappedMood);

    const metadata = {
        genre: mappedGenre,
        mood: mappedMood,
        energy: track.energy || 'unknown',
        bpm: track.bpm || 'unknown',
        usage: [mappedMood],
        title: track.title || 'Unknown'
    };

    const filename = `assets/music/${mappedGenre}/${mappedMood}/${slug(track.title).slice(0, 50)}.mp3`;

    console.log('ytal-cs: Final filename:', filename, 'Metadata:', metadata);

    return { url: track.url, filename, metadata };
}
