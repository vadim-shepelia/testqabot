// ==UserScript==
// @name         API Monitor (Fetch + XHR + Base64 Decode)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Full API monitor with request/response decoding
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- Inject code into PAGE CONTEXT ---
    function inject(fn) {
        const script = document.createElement('script');
        script.textContent = `(${fn})();`;
        document.documentElement.appendChild(script);
        script.remove();
    }

    // --- ENTER PAGE CONTEXT ---
    inject(() => {

        console.log("🚀 API Monitor (Fetch + XHR) loaded in PAGE CONTEXT");

        const config = {
            monitoredPatterns: [
                'stored-requisites',
                'api/depo/payment',
                '/payment/',
'previous-payment-form',
                '/requisites/'
            ],
            excludePatterns: [
                'api/depo/payment-form'
            ],
            base64Fields: ['req_', 'payment_', 'eyJ', 'data', 'token', 'payload']
        };

        // ------------------ BASE64 DECODE ------------------

        function decodeBase64Object(obj) {
            if (!obj || typeof obj !== 'object') return obj;

            const result = JSON.parse(JSON.stringify(obj));

            const isBase64 = str =>
                typeof str === "string" &&
                /^[A-Za-z0-9+/]+={0,2}$/.test(str) &&
                str.length % 4 === 0;

            function decodeField(str) {
                try {
                    const text = atob(str);
                    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
                        try { return JSON.parse(text); } catch {}
                    }
                    return text;
                } catch {
                    return str;
                }
            }

            function walk(o) {
                for (let k in o) {
                    if (typeof o[k] === "string") {
                        const need =
                            config.base64Fields.some(f => k.includes(f)) ||
                            o[k].includes("eyJ");

                        if (need && isBase64(o[k])) {
                            o[k] = decodeField(o[k]);
                        }
                    } else if (typeof o[k] === "object" && o[k] !== null) {
                        walk(o[k]);
                    }
                }
            }

            walk(result);
            return result;
        }

        // ------------------ REQUEST DECODER ------------------

        function decodeRequestBody(body) {
            if (!body) return null;

            if (typeof body === 'string') {
                try {
                    const parsed = JSON.parse(body);
                    return decodeBase64Object(parsed);
                } catch {
                    return body;
                }
            }

            if (typeof body === 'object') {
                try {
                    return decodeBase64Object(body);
                } catch {
                    return body;
                }
            }

            if (body instanceof FormData) {
                const res = {};
                body.forEach((v, k) => res[k] = v);
                return decodeBase64Object(res);
            }

            return body;
        }

        // ------------------ URL MATCHING ------------------

        const utils = {
            shouldMonitor(url) {
                return config.monitoredPatterns.some(p => url.includes(p));
            },
            shouldExclude(url) {
                return config.excludePatterns.some(p => url.includes(p));
            }
        };

        // ------------------ FETCH PATCH ------------------

        const originalFetch = window.fetch;

        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string'
                ? args[0]
                : args[0].url || '';

            if (!utils.shouldMonitor(url) || utils.shouldExclude(url))
                return originalFetch.apply(this, args);

            console.group(`🎯 MONITORED FETCH: ${url}`);

            const options = args[1] || {};
            const decodedReq = decodeRequestBody(options.body);


           // console.log("📤 DECODING REQUEST:", decodedReq);
            console.log("📤 DECODING REQUEST:", JSON.stringify(decodedReq, null, 2));


            const response = await originalFetch.apply(this, args);
            const clone = response.clone();

            let text = "";
            try { text = await clone.text(); } catch {}

            let decodedRes = null;
            try {
                decodedRes = JSON.parse(text);
                decodedRes = decodeBase64Object(decodedRes);
            } catch {}

            //console.log("📥 DECODING RESPONSE:", decodedRes);
            console.log("📥 DECODING RESPONSE JSON:", JSON.stringify(decodedRes, null, 2));

            console.groupEnd();
            return response;
        };

        // ------------------ XHR PATCH ------------------

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            this._reqInfo = { method, url, body: null };
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(body) {
            const url = this._reqInfo.url;

            if (utils.shouldMonitor(url) && !utils.shouldExclude(url)) {

                this._reqInfo.body = decodeRequestBody(body);

                console.group(`🎯 MONITORED XHR: ${url}`);
                console.log("📤 DECODING REQUEST:", this._reqInfo.body);

                this.addEventListener("load", () => {
                    let decodedRes = null;

                    try { decodedRes = JSON.parse(this.responseText); } catch {}
                    decodedRes = decodeBase64Object(decodedRes);

                    //console.log("📥 DECODING RESPONSE:", decodedRes);
                     console.log("📥 DECODING RESPONSE json:", JSON.stringify(decodedRes, null, 2));
                    console.groupEnd();
                });
            }

            return originalSend.apply(this, arguments);
        };

        console.log("✅ API Monitor READY");

    });

})();
