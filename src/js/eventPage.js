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

    let dlList = [];
    let dlRange = 10;
    let dlCounter = 0;
    let dlTimeout;
    let qDownload = new Queue(dlRange);
    let downloadsListenerRegistered = false;

    function onStateChangeCheck(downloadDelta) {
        if (downloadDelta.hasOwnProperty('state') &&
            downloadDelta.state.hasOwnProperty('current') &&
            downloadDelta.state.current === 'complete') {
            qDownload.remove(downloadDelta.id);
            // Silence connection errors by catching promise rejections
            chrome.runtime.sendMessage({ command: 'DL_COMPLETE', id: downloadDelta.id }).catch(() => {});
        }
    }

    function downloadManager() {
        clearTimeout(dlTimeout);
        if (dlCounter === dlList.length)
            return;
        if (!qDownload.isWorking() && !qDownload.isFull()) {
            const item = dlList[dlCounter++];
            if (typeof item === 'string') {
                chrome.downloads.download({ url: item, saveAs: false }, function (id) {
                    if (id) {
                        qDownload.add(id);
                    } else {
                        chrome.runtime.sendMessage({ command: 'DL_ERROR', url: item, error: chrome.runtime.lastError?.message || 'unknown' }).catch(() => {});
                    }
                });
            } else if (item && item.url) {
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
                        const parts = filename.split('/').map(sanitizeSegment).filter(Boolean);
                        filename = parts.join('/');
                        if (filename.length > 200) filename = filename.slice(0,200);
                        filename = ensureUnique(filename);
                    }
                    const opts = { url: url, saveAs: false };
                    if (filename) opts.filename = filename;
                    
                    chrome.downloads.download(opts, function (id) {
                        if (id) {
                            qDownload.add(id);
                            chrome.runtime.sendMessage({ command: 'DL_STARTED', id: id, url: url, filename: opts.filename }).catch(() => {});
                        } else {
                            chrome.runtime.sendMessage({ command: 'DL_ERROR', url: url, filename: opts.filename, error: chrome.runtime.lastError?.message || 'unknown' }).catch(() => {});
                        }
                    });

                    if (item.metadata) {
                        try {
                            const json = JSON.stringify(item.metadata, null, 2);
                            const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
                            const metaName = (filename ? filename.replace(/\.mp3$/i, '.json') : ('metadata_' + Date.now() + '.json'));
                            chrome.downloads.download({ url: dataUrl, filename: metaName, saveAs: false }, (mid) => {});
                        } catch (e) { }
                    }
                } catch (e) { }
            }
        }
        dlTimeout = setTimeout(downloadManager, 1000);
    }
	
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        switch (msg.command) {
            case Commands.Download:
                if (msg.data && msg.data.length) {
                    msg.data.forEach(d => {
                        const url = (typeof d === 'string') ? d : (d && d.url);
                        if (!url) return;
                        const index = dlList.findIndex(item => (typeof item === 'string' ? item : item.url) === url);
                        if (index === -1) {
                            dlList.push(d);
                        } else if (typeof d === 'object' && d.metadata && index >= dlCounter) {
                             dlList[index] = d;
                        }
                    });
                    if (!downloadsListenerRegistered) {
                        chrome.downloads.onChanged.addListener(onStateChangeCheck);
                        downloadsListenerRegistered = true;
                    }
                    downloadManager();
                }
                sendResponse({ status: 'success' });
                break;
            case Commands.Notify:
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'src/img/info-icon.png',
                    title: 'YouTube Audio Downloader',
                    message: msg.message
                });
                sendResponse({ status: 'success' });
                break;
        }
    });
})(Queue, Commands);
