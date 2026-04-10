/**
 * eventPage.js - background logics for front end extension.
 */

try{
    importScripts(
        chrome.runtime.getURL('src/js/commons.js'),
        chrome.runtime.getURL('src/js/Mutex.js'),
        chrome.runtime.getURL('src/js/Queue.js')
    );
}catch(e){
    console.error('ytal-bg: importScripts failed', e);
}

(function (Queue, Commands) {
    "use strict";


    /**
     * Buffer for URLs to download
     * @type {string[]}
     */
    let dlList;
    /**
     * Amount of concurrent downloads (and size of the used mutex queue).
     * @type {number}
     */
    let dlRange = 10;
    /**
     * Index used to retrieve the URLs to download.
     * @type {number}
     */
    let dlCounter = 0;
    /**
     * Timer handle for async downloading
     * @type {Timer|object}
     */
    let dlTimeout;
    /**
     * Mutex Queue used to keep track of downloading states.
     * @type {Queue}
     */
    let qDownload = new Queue(dlRange);
    let downloadsListenerRegistered = false;
    /**
     * Callback function called on download state change, which checks if the
     * passed download has completed.
     *
     * @callback chrome.downloads.onChanged~onStateChangeCheck
     * @param {downloadDelta} downloadDelta data retrieved from the current download
     */
    function onStateChangeCheck(downloadDelta) {
        if (downloadDelta.hasOwnProperty('state') &&
            downloadDelta.state.hasOwnProperty('current') &&
            downloadDelta.state.current === 'complete') {
            qDownload.remove(downloadDelta.id);
            try { chrome.runtime.sendMessage({ command: 'DL_COMPLETE', id: downloadDelta.id }); } catch (e) { }
        }
    }
    /**
     * Downloads retrieved URLs using a mutex limited queue do handle the amount of
     * concurrent downloads to prevent the bandwidth saturation.
     */
    function downloadManager() {
        clearTimeout(dlTimeout);
        if (dlCounter === dlList.length)
            return;
        if (!qDownload.isWorking() && !qDownload.isFull()) {
            const item = dlList[dlCounter++];
            if (typeof item === 'string') {
                console.log('ytal-bg: downloading raw url', item);
                chrome.downloads.download({ url: item, saveAs: false }, function (id) {
                    if (id) {
                        qDownload.add(id);
                    } else {
                        console.error('ytal-bg: download failed for raw url', item, chrome.runtime.lastError && chrome.runtime.lastError.message);
                        try { chrome.runtime.sendMessage({ command: 'DL_ERROR', url: item, error: chrome.runtime.lastError && chrome.runtime.lastError.message || 'unknown' }); } catch (e) {}
                    }
                });
            } else if (item && item.url) {
                // sanitize and enforce filename
                function sanitizeSegment(s){
                    return s.replace(/[\\/:*?"<>|\n\r\t]+/g,'').replace(/\s+/g,' ').trim();
                }
                function ensureUnique(base){
                    const map = ensureUnique.map = ensureUnique.map || {};
                    const key = base.toLowerCase();
                    map[key] = (map[key] || 0) + 1;
                    if (map[key] === 1) return base;
                    const dot = base.lastIndexOf('.');
                    if (dot > 0) return base.slice(0,dot) + '_' + String(map[key]).padStart(2,'0') + base.slice(dot);
                    return base + '_' + String(map[key]).padStart(2,'0');
                }

                try {
                    const url = item.url;
                    let filename = item.filename || '';
                    if (filename) {
                        // split path, sanitize each segment
                        const parts = filename.split('/').map(sanitizeSegment).filter(Boolean);
                        filename = parts.join('/');
                        // limit filename length
                        if (filename.length > 200) filename = filename.slice(0,200);
                        filename = ensureUnique(filename);
                    }
                    const opts = { url: url, saveAs: false };
                    if (filename) opts.filename = filename;
                    console.log('ytal-bg: downloading', url, 'as', opts.filename || '(no-filename)');
                    chrome.downloads.download(opts, function (id) {
                        if (id) {
                            qDownload.add(id);
                            try { chrome.runtime.sendMessage({ command: 'DL_STARTED', id: id, url: url, filename: opts.filename }); } catch (e) {}
                        } else {
                            console.error('ytal-bg: download failed for', url, 'as', opts.filename, chrome.runtime.lastError && chrome.runtime.lastError.message);
                            try { chrome.runtime.sendMessage({ command: 'DL_ERROR', url: url, filename: opts.filename, error: chrome.runtime.lastError && chrome.runtime.lastError.message || 'unknown' }); } catch (e) {}
                        }
                    });

                    if (item.metadata) {
                        try {
                            const json = JSON.stringify(item.metadata, null, 2);
                            const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
                            const metaName = (filename ? filename.replace(/\.mp3$/i, '.json') : ('metadata_' + Date.now() + '.json'));
                            console.debug('ytal-bg: saving metadata as', metaName);
                            chrome.downloads.download({ url: dataUrl, filename: metaName, saveAs: false }, function (mid) { if (!mid) console.debug('ytal-bg: metadata download failed for', metaName); });
                        } catch (e) { console.debug('ytal-bg: metadata error', e && e.message); }
                    }
                } catch (e) { console.debug('ytal-bg: exception preparing download', e && e.message); }
            }
        }
        dlTimeout = setTimeout(downloadManager, 1000);
    }
	
    // Listen for a messages coming from the injected script on web the web page
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        console.log('ytal-bg: received message', msg);
        switch (msg.command) {
            case Commands.Download:
                console.log('ytal-bg: processing download command with data:', msg.data);
                // Start to download the URLs or structured items
                if (msg.data && msg.data.length) {
                    console.log('ytal-bg: received download command, items:', msg.data.length);
                    // dedupe incoming urls by url
                    const seen = new Set();
                    const items = [];
                    msg.data.forEach(d => {
                        const url = (typeof d === 'string') ? d : (d && d.url);
                        if (!url) return;
                        if (seen.has(url)) return;
                        seen.add(url);
                        items.push(d);
                    });
                    dlList = items;
                    dlCounter = 0;
                    if (!downloadsListenerRegistered) {
                        chrome.downloads.onChanged.addListener(onStateChangeCheck);
                        downloadsListenerRegistered = true;
                    }
                    downloadManager();
                }
                sendResponse({ status: 'success', message: 'Download command received' });
                break;
            case Commands.Notify:
                console.log('ytal-bg: processing notify command with message:', msg.message);
                // Shows a notifications
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'src/img/info-icon.png',
                    title: 'YouTube Audio Library Downloader',
                    message: msg.message
                });
                sendResponse({ status: 'success', message: 'Notification command received' });
                break;
        }
    });
})(Queue, Commands);
