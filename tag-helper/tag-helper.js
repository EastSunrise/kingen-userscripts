// ==UserScript==
// @name         Tag Helper
// @namespace    https://github.com/EastSunrise/kingen-userscripts
// @version      1.0.1
// @description  Link work tags on supported media websites
// @author       Kingen
// @match        https://www.youtube.com/watch*
// @updateURL    https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/tag-helper/tag-helper.js
// @downloadURL  https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/tag-helper/tag-helper.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const WORK_DETAIL_BASE = 'https://kingen.my/study/work/detail/';
    const CHANNEL_COOKIE = 'TARGET_CHANNELS';
    const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
    const WORK_TAG_LINK_CLASS = 'kingen-tag-helper-work-link';
    const PROCESSED_CLASS = 'kingen-tag-helper-processed';
    const SAVE_BUTTON_CLASS = 'kingen-tag-helper-save-button';
    const MESSAGE_CONTAINER_ID = 'kingen-tag-helper-messages';
    const STYLE_ID = 'kingen-tag-helper-style';
    const SERIAL_NUMBER_REGEX = /([A-Za-z]{3,5})[- ]?(\d{3,4})/g;

    const DESCRIPTION_SELECTORS = [
        '#description-inline-expander .ytd-text-inline-expander .yt-core-attributed-string > span',
        '#description-inline-expander .yt-core-attributed-string > span'
    ];
    const COMMENT_SELECTORS = [
        'ytd-comments ytd-comment-thread-renderer #content-text > span',
        'ytd-comments #content-text > span'
    ];
    const CHANNEL_SELECTORS = [
        '#owner #text.ytd-channel-name a',
        '#owner a[href^="/@"]',
        '#owner a[href*="/channel/"]'
    ];
    const ACTION_CONTAINER_SELECTORS = [
        '#actions-inner #flexible-item-buttons',
        '#actions #actions-inner #flexible-item-buttons'
    ];

    let scanTimer = 0;
    let lastPageKey = '';
    let currentChannel = '';
    let saveButton = null;

    function isSupportedPage() {
        return window.location.hostname === 'www.youtube.com' &&
            window.location.pathname === '/watch' &&
            new URLSearchParams(window.location.search).has('v');
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${WORK_TAG_LINK_CLASS} {
                color: inherit;
                font-weight: bold;
            }

            .${SAVE_BUTTON_CLASS} {
                align-items: center;
                background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, .05));
                border: 0;
                border-radius: 18px;
                color: var(--yt-spec-text-primary, inherit);
                cursor: pointer;
                display: inline-flex;
                font: inherit;
                justify-content: center;
                margin: 0 4px;
                min-height: 36px;
                padding: 0 16px;
            }

            .${SAVE_BUTTON_CLASS}:hover {
                background: var(--yt-spec-badge-chip-background, rgba(0, 0, 0, .12));
            }

            #${MESSAGE_CONTAINER_ID} {
                display: flex;
                flex-direction: column;
                gap: 8px;
                position: fixed;
                right: 24px;
                top: 24px;
                z-index: 2147483647;
            }

            #${MESSAGE_CONTAINER_ID} .kingen-tag-helper-message {
                background: var(--yt-spec-base-background, #fff);
                border: 1px solid var(--yt-spec-10-percent-layer, #ccc);
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
                color: var(--yt-spec-text-primary, #000);
                padding: 10px 14px;
            }
        `;
        document.head.appendChild(style);
    }

    function showMessage(message, timeout = 4000) {
        let container = document.getElementById(MESSAGE_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = MESSAGE_CONTAINER_ID;
            document.body.appendChild(container);
        }

        const item = document.createElement('div');
        item.className = 'kingen-tag-helper-message';
        item.textContent = message;
        container.appendChild(item);

        if (timeout > 0) {
            window.setTimeout(() => item.remove(), timeout);
        }
    }

    function getCookie(name) {
        const prefix = `${name}=`;
        const cookies = document.cookie ? document.cookie.split(';') : [];

        for (const cookie of cookies) {
            const value = cookie.trim();
            if (value.startsWith(prefix)) {
                return value.slice(prefix.length);
            }
        }
        return null;
    }

    function parseChannels(value) {
        if (!value) {
            return [];
        }

        const candidates = [value];
        try {
            candidates.push(decodeURIComponent(value));
        } catch (error) {
            // Keep the original value as the only parse candidate.
        }

        for (const candidate of candidates) {
            try {
                const channels = JSON.parse(candidate);
                if (Array.isArray(channels)) {
                    return channels.filter((channel) => typeof channel === 'string');
                }
            } catch (error) {
                // Try the next representation.
            }
        }
        return [];
    }

    function getSavedChannels() {
        return parseChannels(getCookie(CHANNEL_COOKIE));
    }

    function saveChannels(channels) {
        const uniqueChannels = [...new Set(channels)];
        const expires = new Date(Date.now() + COOKIE_MAX_AGE_SECONDS * 1000).toUTCString();
        document.cookie = `${CHANNEL_COOKIE}=${JSON.stringify(uniqueChannels)}; expires=${expires}; path=/`;
    }

    function getFirstElement(selectors) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }

    function getCurrentChannel() {
        const link = getFirstElement(CHANNEL_SELECTORS);
        const href = link && link.getAttribute('href');
        if (!href) {
            return '';
        }

        try {
            return decodeURIComponent(href);
        } catch (error) {
            return href;
        }
    }

    function getActionContainer() {
        return getFirstElement(ACTION_CONTAINER_SELECTORS);
    }

    function getSerialNumber(match) {
        const alpha = match[1];
        const number = parseInt(match[2], 10);
        return `${alpha}-${number.toString().padStart(3, '0')}`;
    }

    function createWorkLink(match) {
        const serialNumber = getSerialNumber(match);
        const link = document.createElement('a');
        link.className = WORK_TAG_LINK_CLASS;
        link.href = `${WORK_DETAIL_BASE}${encodeURIComponent(serialNumber)}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = `打开作品：${serialNumber}`;
        link.textContent = match[0];
        link.addEventListener('click', () => {
            link.style.color = 'purple';
        });
        return link;
    }

    function linkifyTextNode(textNode) {
        const sourceText = textNode.nodeValue || '';
        SERIAL_NUMBER_REGEX.lastIndex = 0;

        let match;
        let lastIndex = 0;
        let changed = false;
        const fragment = document.createDocumentFragment();

        while ((match = SERIAL_NUMBER_REGEX.exec(sourceText)) !== null) {
            changed = true;
            fragment.append(document.createTextNode(sourceText.slice(lastIndex, match.index)));
            fragment.append(createWorkLink(match));
            lastIndex = match.index + match[0].length;
        }

        if (!changed) {
            return false;
        }

        fragment.append(document.createTextNode(sourceText.slice(lastIndex)));
        textNode.parentNode.replaceChild(fragment, textNode);
        return true;
    }

    function linkifyElement(element) {
        if (!element) {
            return;
        }

        const textSnapshot = element.textContent || '';
        if (element.classList.contains(PROCESSED_CLASS) &&
            element.dataset.tagHelperText === textSnapshot) {
            return;
        }

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.parentElement && !node.parentElement.closest('a')) {
                textNodes.push(node);
            }
        }

        let changed = false;
        textNodes.forEach((textNode) => {
            changed = linkifyTextNode(textNode) || changed;
        });

        if (changed || element.textContent) {
            element.classList.add(PROCESSED_CLASS);
            element.dataset.tagHelperText = element.textContent || '';
        }
    }

    function collectElements(selectors) {
        const elements = new Set();
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => elements.add(element));
        });
        return elements;
    }

    function scanTags() {
        collectElements(DESCRIPTION_SELECTORS).forEach(linkifyElement);
        collectElements(COMMENT_SELECTORS).forEach(linkifyElement);
    }

    function removeSaveButton() {
        if (saveButton && saveButton.isConnected) {
            saveButton.remove();
        }
        saveButton = null;
    }

    function updateSaveButton(button, channel) {
        const saved = getSavedChannels().includes(channel);
        button.dataset.saved = saved ? 'true' : 'false';
        button.textContent = 'Save';
        button.title = saved ? '频道已保存' : '保存频道';
    }

    function ensureSaveButton(container, channel) {
        if (saveButton && saveButton.isConnected && saveButton.parentElement !== container) {
            saveButton.remove();
            saveButton = null;
        }

        if (!saveButton || !saveButton.isConnected) {
            saveButton = container.querySelector(`.${SAVE_BUTTON_CLASS}`);
        }

        if (!saveButton) {
            saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = SAVE_BUTTON_CLASS;
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', () => {
                const channels = getSavedChannels();
                if (channels.includes(channel)) {
                    showMessage('Channel already saved');
                    return;
                }

                channels.push(channel);
                saveChannels(channels);
                updateSaveButton(saveButton, channel);
                showMessage('Channel saved');
                scanTags();
            });
            container.appendChild(saveButton);
        }

        updateSaveButton(saveButton, channel);
    }

    function resetPageState() {
        currentChannel = '';
        removeSaveButton();
    }

    function scan() {
        scanTimer = 0;

        if (!isSupportedPage()) {
            resetPageState();
            return;
        }

        const pageKey = window.location.href;
        if (pageKey !== lastPageKey) {
            lastPageKey = pageKey;
            resetPageState();
        }

        const channel = getCurrentChannel();
        const actionContainer = getActionContainer();
        if (!channel || !actionContainer) {
            removeSaveButton();
            if (!channel) {
                currentChannel = '';
            }
            return;
        }

        if (channel !== currentChannel) {
            currentChannel = channel;
            removeSaveButton();
        }

        ensureSaveButton(actionContainer, channel);
        if (getSavedChannels().includes(channel)) {
            scanTags();
        }
    }

    function scheduleScan() {
        if (scanTimer) {
            return;
        }
        scanTimer = window.setTimeout(scan, 100);
    }

    function start() {
        ensureStyle();
        scan();

        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['href']
        });

        window.addEventListener('yt-navigate-finish', scheduleScan);
        window.addEventListener('popstate', scheduleScan);
        window.setInterval(scan, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {once: true});
    } else {
        start();
    }
})();
