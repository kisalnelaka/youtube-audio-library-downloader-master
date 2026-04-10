(function(){
    // simple in-page hook to capture fetch and XHR responses that contain download URLs
    function post(payload){
        try{ 
            console.debug('ytal-hook: posting payload', payload && payload.type);
            window.postMessage({ source: 'ytal-hook', payload: payload }, '*');
        }catch(e){}
    }

    // helper to extract probable audio urls from arbitrary text/JSON
    function extractUrlsFromText(text){
        const urls = [];
        try{
            // JSON-safe search
            const json = JSON.parse(text);
            const found = new Set();
            (function traverse(o){
                if(!o) return;
                if(typeof o === 'string'){
                    if(/https?:\/\//.test(o) && /(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/.+?)/i.test(o)) found.add(o);
                } else if(Array.isArray(o)) o.forEach(traverse);
                else if(typeof o === 'object') Object.values(o).forEach(traverse);
            })(json);
            for(const u of found) urls.push(u);
        }catch(e){
            // fallback: regex search
            const re = /https?:\/\/[\w\-./?=&%:,]+?(?:googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)[\w\-./?=&%:,]*/gi;
            const m = text.match(re);
            if(m) m.forEach(u=>urls.push(u));
        }
        return urls;
    }

    // wrap fetch
    const _fetch = window.fetch;
    window.fetch = function(input, init){
        return _fetch.apply(this, arguments).then(function(resp){
            try{
                const url = (typeof input === 'string')? input : (input && input.url) || resp.url;
                if(/creator_music\/get_tracks|videoplayback|youtubei\/v1\/creator_music/i.test(url)){
                    resp.clone().text().then(function(text){
                        const urls = extractUrlsFromText(text);
                        if(urls && urls.length) post({ type: 'tracks', urls: Array.from(new Set(urls)) });
                    }).catch(()=>{});
                }
            }catch(e){}
            return resp;
        });
    };

    // wrap XHR via prototype methods
    try{
        const OriginalXHR = window.XMLHttpRequest;
        const origOpen = OriginalXHR.prototype.open;
        const origSend = OriginalXHR.prototype.send;
        OriginalXHR.prototype.open = function(method, url){
            this._ytal_url = url;
            return origOpen.apply(this, arguments);
        };
        OriginalXHR.prototype.send = function(){
            this.addEventListener('readystatechange', function(){
                try{
                    if(this.readyState === 4){
                        const url = this._ytal_url || '';
                        if(/creator_music\/get_tracks|videoplayback|youtubei\/v1\/creator_music/i.test(url)){
                            let text = this.responseText || '';
                            const urls = extractUrlsFromText(text);
                            if(urls && urls.length) post({ type: 'tracks', urls: Array.from(new Set(urls)) });
                        }
                    }
                }catch(e){}
            });
            return origSend.apply(this, arguments);
        };
    }catch(e){}

    // Capture clicks on the page to find download URLs that are revealed only on interaction
    try{
        document.addEventListener('click', function (ev) {
            try{
                const t = ev.target || ev.srcElement;
                if(!t) return;
                // check target and ancestors for href or data-download attributes
                let el = t;
                while(el && el !== document.body) {
                    if (el.href && /(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(el.href)) {
                        try{ ev.preventDefault(); ev.stopImmediatePropagation(); }catch(e){}
                        try{
                            const url = el.href;
                            // try to gather row metadata
                            const row = el.closest('div#row-container') || el.closest('div');
                            const titleEl = row && row.querySelector && row.querySelector('#title');
                            const genreEl = row && row.querySelector && row.querySelector('#genre');
                            const moodEl = row && row.querySelector && row.querySelector('#mood');
                            const txt = row ? (row.textContent||'') : '';
                            let duration = 0; const m = txt.match(/(\d{1,2}:\d{2})/);
                            if (m) { const parts = m[1].split(':').map(Number); duration = parts[0]*60 + parts[1]; }
                            const title = titleEl ? titleEl.textContent.trim() : '';
                            const genre = genreEl ? genreEl.textContent.trim() : '';
                            const mood = moodEl ? moodEl.textContent.trim() : '';
                            const slug = (s=> (s||'').toString().trim().toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'_'))(title).slice(0,40);
                            const gk = (genre||'').toLowerCase().split(/[^a-z0-9]+/)[0] || 'cinematic';
                            const mk = (mood||'').toLowerCase().split(/[^a-z0-9]+/)[0] || 'calm';
                            const seq = String(Math.floor(Math.random()*90)+10);
                            const filenameBase = `${gk}_${mk}_${slug}_${seq}`;
                            const mp3name = `assets/music/${gk}/${mk}/${filenameBase}.mp3`;
                            const metadata = { title: title || filenameBase, genre: gk, mood: mk, duration: duration };
                            console.debug('ytal-hook: click-capture found href', url);
                            post({ type: 'tracks', urls: [url], items: [{ url: url, filename: mp3name, metadata: metadata }] });
                        }catch(ex){
                            console.debug('ytal-hook: click-capture href fallback', el.href);
                            post({ type: 'tracks', urls: [el.href] });
                        }
                        return;
                    }
                    const data = el.getAttribute && (el.getAttribute('data-download-url') || el.getAttribute('data-src') || el.getAttribute('data-url') || el.getAttribute('data-href'));
                    if (data && /(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(data)) {
                        try{ ev.preventDefault(); ev.stopImmediatePropagation(); }catch(e){}
                        try{
                            const url = data;
                            const row = el.closest('div#row-container') || el.closest('div');
                            const titleEl = row && row.querySelector && row.querySelector('#title');
                            const genreEl = row && row.querySelector && row.querySelector('#genre');
                            const moodEl = row && row.querySelector && row.querySelector('#mood');
                            const txt = row ? (row.textContent||'') : '';
                            let duration = 0; const m = txt.match(/(\d{1,2}:\d{2})/);
                            if (m) { const parts = m[1].split(':').map(Number); duration = parts[0]*60 + parts[1]; }
                            const title = titleEl ? titleEl.textContent.trim() : '';
                            const genre = genreEl ? genreEl.textContent.trim() : '';
                            const mood = moodEl ? moodEl.textContent.trim() : '';
                            const slug = (s=> (s||'').toString().trim().toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'_'))(title).slice(0,40);
                            const gk = (genre||'').toLowerCase().split(/[^a-z0-9]+/)[0] || 'cinematic';
                            const mk = (mood||'').toLowerCase().split(/[^a-z0-9]+/)[0] || 'calm';
                            const seq = String(Math.floor(Math.random()*90)+10);
                            const filenameBase = `${gk}_${mk}_${slug}_${seq}`;
                            const mp3name = `assets/music/${gk}/${mk}/${filenameBase}.mp3`;
                            const metadata = { title: title || filenameBase, genre: gk, mood: mk, duration: duration };
                            console.debug('ytal-hook: click-capture found data attr', url);
                            post({ type: 'tracks', urls: [url], items: [{ url: url, filename: mp3name, metadata: metadata }] });
                        }catch(ex){
                            post({ type: 'tracks', urls: [data] });
                        }
                        return;
                    }
                    el = el.parentElement;
                }
            }catch(e){}
        }, true);
    }catch(e){}

    // respond to messages from the content script (e.g., "request-tracks")
    try{
        window.addEventListener('message', function (e) {
            try{
                if (!e.data || e.data.source !== 'ytal-extension') return;
                if (e.data.action === 'request-tracks') {
                    console.debug('ytal-hook: received request-tracks from content script');
                    const found = new Set();

                    // 1) scan anchors
                    Array.from(document.querySelectorAll('a[href]')).forEach(a => {
                        const h = a.href || '';
                        if (/(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(h)) found.add(h);
                    });

                    // 2) scan common data attributes and buttons that might hold URLs
                    Array.from(document.querySelectorAll('[data-src],[data-download-url],[data-url],[data-href]')).forEach(el => {
                        const h = el.getAttribute('data-download-url') || el.getAttribute('data-src') || el.getAttribute('data-url') || el.getAttribute('data-href') || '';
                        if (/(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(h)) found.add(h);
                    });
                    Array.from(document.querySelectorAll('button, a')).forEach(el => {
                        const txt = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
                        if (/download|download track|download audio/i.test(txt)) {
                            // try to find nearby href
                            const a = el.closest('div') && el.closest('div').querySelector('a[href]');
                            if (a && a.href) {
                                if (/(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(a.href)) found.add(a.href);
                            }
                        }
                    });

                    // 3) use PerformanceResourceTiming to find any recent resource requests
                    try{
                        const resources = performance.getEntriesByType('resource') || [];
                        resources.forEach(r => {
                            const n = r.name || '';
                            if (/(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(n)) found.add(n);
                        });
                    }catch(err){}

                    // 4) scan body text as fallback
                    const textUrls = extractUrlsFromText(document.body ? document.body.innerText : '');
                    textUrls.forEach(u => found.add(u));

                    // 5) observe DOM mutations for a short period to catch dynamically-inserted links
                    const urlsBefore = found.size;
                    const obs = new MutationObserver(function (mutations, observer) {
                        Array.from(document.querySelectorAll('a[href]')).forEach(a => {
                            const h = a.href || '';
                            if (/(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(h)) found.add(h);
                        });
                        Array.from(document.querySelectorAll('[data-download-url]')).forEach(el => {
                            const h = el.getAttribute('data-download-url') || '';
                            if (/(googlevideo|redirector|\.mp3|\.m4a|\.ogg|audio\/)/i.test(h)) found.add(h);
                        });
                        if (found.size > urlsBefore) {
                            // found something early, disconnect
                            observer.disconnect();
                            const urlsNow = Array.from(found);
                            console.debug('ytal-hook: mutation found urls', urlsNow.length);
                            post({ type: 'tracks', urls: urlsNow });
                        }
                    });
                    try{
                        obs.observe(document.body, { childList: true, subtree: true });
                        // stop observing after 3000ms and post whatever we have
                        setTimeout(function(){
                            try{ obs.disconnect(); }catch(e){}
                            const urls = Array.from(found);
                            console.debug('ytal-hook: final found urls after timeout', urls.length);
                            if (urls.length) post({ type: 'tracks', urls: urls });
                        }, 3000);
                    }catch(err){
                        const urls = Array.from(found);
                        console.debug('ytal-hook: observer failed, urls', urls.length);
                        if (urls.length) post({ type: 'tracks', urls: urls });
                    }
                }
            }catch(err){}
        }, false);
    }catch(e){}

})();
