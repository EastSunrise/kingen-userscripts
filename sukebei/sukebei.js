// ==UserScript==
// @name         Sukebei Helper
// @namespace    https://github.com/EastSunrise/kingen-userscripts
// @version      1.0.3
// @description  Add Sukebei search links to local study work pages
// @include      /^https?:\/\/kingen\.my(?::\d+)?\/.*$/
// @updateURL    https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/sukebei/sukebei.js
// @downloadURL  https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/sukebei/sukebei.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const SUKEBEI_URL = 'https://sukebei.nyaa.si/';
    const REF_CLASS = 'kingen-sukebei-ref';
    const LINK_CLASS = 'kingen-sukebei-link';
    let scanTimer = 0;

    function isSupportedHost() {
        return (window.location.protocol === 'http:' || window.location.protocol === 'https:') &&
            window.location.hostname === 'kingen.my';
    }

    function isStudyPage() {
        return isSupportedHost() && window.location.pathname.startsWith('/study/');
    }

    function getRoute() {
        const pathname = window.location.pathname;
        if (pathname.includes('/work/list')) {
            return 'list';
        }
        if (pathname.includes('/work/detail')) {
            return 'detail';
        }
        return '';
    }

    function buildSearchUrl(title) {
        const url = new URL(SUKEBEI_URL);
        url.searchParams.set('f', '0');
        url.searchParams.set('c', '0_0');
        url.searchParams.set('q', title);
        url.searchParams.set('s', 'size');
        url.searchParams.set('o', 'desc');
        return url.href;
    }

    function ensureHostPosition(host) {
        if (!host || !host.style) {
            return;
        }
        const computed = window.getComputedStyle(host);
        if (computed && computed.position === 'static') {
            host.style.position = 'relative';
        }
    }

    function getOrCreateRef(host, top, right) {
        if (!host || typeof host.appendChild !== 'function') {
            return null;
        }

        let ref = Array.from(host.children).find((child) => child.classList.contains(REF_CLASS));
        if (!ref) {
            ensureHostPosition(host);
            ref = document.createElement('div');
            ref.className = REF_CLASS;
            ref.style.position = 'absolute';
            ref.style.right = `${right}px`;
            ref.style.top = `${top}px`;
            ref.style.display = 'grid';
            ref.style.gap = '10px';
            ref.style.padding = '5px';
            ref.style.zIndex = '999';

            const link = document.createElement('a');
            link.className = LINK_CLASS;
            link.textContent = 'Sukebei';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            ref.appendChild(link);
            host.appendChild(ref);
        }
        return ref;
    }

    function updateRef(host, title, top, right) {
        const normalizedTitle = typeof title === 'string' ? title.trim() : '';
        if (!normalizedTitle) {
            return null;
        }

        const ref = getOrCreateRef(host, top, right);
        if (!ref) {
            return null;
        }

        const link = ref.querySelector(`.${LINK_CLASS}`);
        if (!link) {
            return null;
        }
        link.href = buildSearchUrl(normalizedTitle);
        link.title = `在 Sukebei 搜索：${normalizedTitle}`;
        return ref;
    }

    function getDetailHost() {
        const heading = document.querySelector('h1');
        if (heading && heading.parentElement && heading.parentElement.parentElement) {
            return heading.parentElement.parentElement;
        }

        const fallbackHeading = document.querySelector('h2');
        return fallbackHeading ? fallbackHeading.parentElement : null;
    }

    function scanList(seen) {
        document.querySelectorAll('.ant-list-item').forEach((card) => {
            const titleElement = card.querySelector('.ant-card-meta-title');
            const ref = updateRef(card, titleElement && titleElement.textContent, -25, 25);
            if (ref) {
                seen.add(ref);
            }
        });
    }

    function scanDetail(seen) {
        const titleElement = document.querySelector('h2');
        const ref = updateRef(getDetailHost(), titleElement && titleElement.textContent, 100, 50);
        if (ref) {
            seen.add(ref);
        }
    }

    function removeStaleRefs(seen) {
        document.querySelectorAll(`.${REF_CLASS}`).forEach((ref) => {
            if (!seen.has(ref)) {
                ref.remove();
            }
        });
    }

    function scan() {
        scanTimer = 0;
        const seen = new Set();
        const route = isStudyPage() ? getRoute() : '';

        if (route === 'list') {
            scanList(seen);
        } else if (route === 'detail') {
            scanDetail(seen);
        }

        removeStaleRefs(seen);
    }

    function scheduleScan() {
        if (scanTimer) {
            return;
        }
        scanTimer = window.setTimeout(scan, 100);
    }

    function start() {
        scan();
        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
        window.setInterval(scan, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
