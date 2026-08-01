// ==UserScript==
// @name         DPlayer Enhancer
// @namespace    https://github.com/EastSunrise/kingen-userscripts
// @version      1.3.0
// @description  Add five-second skip buttons to DPlayer controls
// @author       Kingen
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/dplayer/dplayer.js
// @updateURL    https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/dplayer/dplayer.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        skipSeconds: 5
    };
    const PLAYER_MARKER_CLASS = 'has-skip-btn';
    const BUTTON_CLASS = 'dplayer-skip-btn';
    const REWIND_CLASS = 'dplayer-skip-rewind';
    const FORWARD_CLASS = 'dplayer-skip-forward';

    let scanTimer = 0;

    function createButton(type, title) {
        const button = document.createElement('div');
        button.className = `dplayer-icon ${BUTTON_CLASS}`;
        button.classList.add(type === 'rewind' ? REWIND_CLASS : FORWARD_CLASS);
        button.title = title;
        button.setAttribute('aria-label', title);

        const buttonInner = document.createElement('div');
        buttonInner.className = 'dplayer-icon-content';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('fill', 'currentColor');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', type === 'rewind'
            ? 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z'
            : 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z');

        svg.appendChild(path);
        buttonInner.appendChild(svg);
        button.appendChild(buttonInner);

        button.addEventListener('mouseenter', () => {
            button.classList.add('dplayer-icon-hover');
        });
        button.addEventListener('mouseleave', () => {
            button.classList.remove('dplayer-icon-hover');
            button.classList.remove('dplayer-icon-active');
        });
        button.addEventListener('mousedown', () => {
            button.classList.add('dplayer-icon-active');
        });
        button.addEventListener('mouseup', () => {
            button.classList.remove('dplayer-icon-active');
        });

        return button;
    }

    function seek(video, offset) {
        if (!video || video.readyState < 2 || !Number.isFinite(video.currentTime)) {
            return;
        }

        const targetTime = video.currentTime + offset;
        if (offset < 0) {
            video.currentTime = Math.max(0, targetTime);
            return;
        }

        video.currentTime = Number.isFinite(video.duration)
            ? Math.min(video.duration, targetTime)
            : targetTime;
    }

    function removeOwnedButtons(dplayer) {
        dplayer.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => {
            button.remove();
        });
    }

    function hasCompleteButtonSet(dplayer, rightButtons, settingButton) {
        const rewindButtons = dplayer.querySelectorAll(`.${REWIND_CLASS}`);
        const forwardButtons = dplayer.querySelectorAll(`.${FORWARD_CLASS}`);
        return rewindButtons.length === 1 &&
            forwardButtons.length === 1 &&
            rewindButtons[0].parentElement === rightButtons &&
            forwardButtons[0].parentElement === rightButtons &&
            rightButtons.contains(rewindButtons[0]) &&
            rightButtons.contains(forwardButtons[0]) &&
            rightButtons.contains(settingButton);
    }

    function createSkipButtons(dplayer, video, rightButtons, settingButton) {
        const rewindButton = createButton('rewind', `后退 ${CONFIG.skipSeconds} 秒`);
        const forwardButton = createButton('forward', `前进 ${CONFIG.skipSeconds} 秒`);

        rewindButton.addEventListener('click', () => {
            seek(video, -CONFIG.skipSeconds);
        });
        forwardButton.addEventListener('click', () => {
            seek(video, CONFIG.skipSeconds);
        });

        try {
            rightButtons.insertBefore(rewindButton, settingButton);
            rightButtons.insertBefore(forwardButton, settingButton);
        } catch (error) {
            rewindButton.remove();
            forwardButton.remove();
            return false;
        }

        if (!hasCompleteButtonSet(dplayer, rightButtons, settingButton)) {
            rewindButton.remove();
            forwardButton.remove();
            return false;
        }

        return true;
    }

    function enhanceDPlayer(dplayer) {
        const controller = dplayer.querySelector('.dplayer-controller');
        const rightButtons = controller && controller.querySelector('.dplayer-icons-right');
        const settingButton = controller && controller.querySelector('.dplayer-setting');

        if (dplayer.classList.contains(PLAYER_MARKER_CLASS)) {
            if (rightButtons && settingButton && hasCompleteButtonSet(dplayer, rightButtons, settingButton)) {
                return true;
            }
            dplayer.classList.remove(PLAYER_MARKER_CLASS);
            removeOwnedButtons(dplayer);
        }

        if (rightButtons && settingButton && hasCompleteButtonSet(dplayer, rightButtons, settingButton)) {
            dplayer.classList.add(PLAYER_MARKER_CLASS);
            return true;
        }

        const video = dplayer.querySelector('.dplayer-video');
        if (!video || !rightButtons || !settingButton) {
            return false;
        }

        removeOwnedButtons(dplayer);
        if (!createSkipButtons(dplayer, video, rightButtons, settingButton)) {
            return false;
        }

        dplayer.classList.add(PLAYER_MARKER_CLASS);
        return true;
    }

    function scan() {
        scanTimer = 0;
        document.querySelectorAll('.dplayer').forEach(enhanceDPlayer);
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
            attributes: true,
            attributeFilter: ['class']
        });

        window.setInterval(scan, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
