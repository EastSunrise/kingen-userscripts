// ==UserScript==
// @name         PotPlayer WebVideo Bridge
// @namespace    https://github.com/EastSunrise/kingen-userscripts
// @version      1.3.1
// @description  为每个 Video.js 或 HTML5 视频实例提供 PotPlayer 单视频/播放列表入口
// @include      http://127.*/*
// @include      https://127.*/*
// @include      http://192.*/*
// @include      https://192.*/*
// @updateURL    https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/potplayer/potplayer.js
// @downloadURL  https://raw.githubusercontent.com/EastSunrise/kingen-userscripts/master/potplayer/potplayer.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'rtmp:', 'rtsp:']);
    const BUTTON_CLASS = 'kingen-potplayer-badge';
    const BUTTON_STYLE = [
        'position:absolute',
        'right:8px',
        'top:8px',
        'z-index:2147483647',
        'display:inline-flex',
        'align-items:center',
        'gap:4px',
        'padding:5px 8px',
        'border:1px solid rgba(255,255,255,.35)',
        'border-radius:4px',
        'background:#1677ff',
        'color:#fff',
        'font:12px/1.2 sans-serif',
        'text-decoration:none',
        'box-shadow:0 1px 4px rgba(0,0,0,.35)',
        'cursor:pointer',
        'white-space:nowrap'
    ].join(';');

    const groupStates = new Map();
    let scanTimer = 0;
    let observer = null;

    function isSupportedHost() {
        const parts = window.location.hostname.split('.');
        if (parts.length !== 4 || (parts[0] !== '127' && parts[0] !== '192')) {
            return false;
        }
        return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
    }

    function toAbsoluteUrl(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return '';
        }
        try {
            return new URL(value.trim(), window.location.href).href;
        } catch (error) {
            return '';
        }
    }

    function isOpenableUrl(value) {
        const url = toAbsoluteUrl(value);
        if (!url) {
            return false;
        }
        try {
            return OPENABLE_PROTOCOLS.has(new URL(url).protocol);
        } catch (error) {
            return false;
        }
    }

    function firstOpenableUrl(values) {
        for (const value of values) {
            if (typeof value === 'string' && isOpenableUrl(value)) {
                return toAbsoluteUrl(value);
            }
        }
        return '';
    }

    function getPlayerHost(video) {
        if (!video || typeof video.closest !== 'function') {
            return null;
        }
        return video.closest('video-js') ||
            video.closest('[data-vjs-player]') ||
            video.closest('.video-js-container');
    }

    function getPlayerFromHost(host) {
        if (!host) {
            return null;
        }

        const directPlayer = host.player;
        if (directPlayer && typeof directPlayer.playlist === 'function') {
            return directPlayer;
        }

        const media = typeof host.querySelector === 'function' ? host.querySelector('video') : null;
        const mediaPlayer = media && media.player;
        if (mediaPlayer && typeof mediaPlayer.playlist === 'function') {
            return mediaPlayer;
        }
        return null;
    }

    function getVideoJsHosts() {
        const hosts = [];
        const seenPlayers = new Set();
        const addHost = (host) => {
            const player = getPlayerFromHost(host);
            if (!player || seenPlayers.has(player)) {
                return;
            }
            seenPlayers.add(player);
            hosts.push(host);
        };

        document.querySelectorAll('video-js').forEach(addHost);
        document.querySelectorAll('[data-vjs-player], .video-js-container').forEach((host) => {
            if (typeof host.querySelector === 'function' && host.querySelector('video-js')) {
                return;
            }
            addHost(host);
        });
        return hosts;
    }

    function getPlaylist(player) {
        try {
            const playlist = player.playlist();
            return Array.isArray(playlist) ? playlist : [];
        } catch (error) {
            return [];
        }
    }

    function getCurrentIndex(player, playlistLength) {
        let index = 0;
        try {
            if (player.playlist && typeof player.playlist.currentIndex === 'function') {
                index = Number(player.playlist.currentIndex());
            }
        } catch (error) {
            index = 0;
        }
        if (!Number.isInteger(index) || index < 0 || index >= playlistLength) {
            return 0;
        }
        return index;
    }

    function getSourceValues(source) {
        if (typeof source === 'string') {
            return [source];
        }
        if (!source || typeof source !== 'object') {
            return [];
        }
        return [source.src, source.url, source.source].filter((value) => typeof value === 'string');
    }

    function getPlaylistVideoUrl(item) {
        const values = [];
        if (item && Array.isArray(item.sources)) {
            item.sources.forEach((source) => values.push(...getSourceValues(source)));
        }
        if (item) {
            values.push(item.src, item.url, item.video);
        }
        return firstOpenableUrl(values);
    }

    function getVideoTitle(url, item, index) {
        const title = item && (item.title || item.name);
        if (typeof title === 'string' && title.trim()) {
            return title.trim();
        }
        try {
            const parsed = new URL(url);
            const filename = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
            if (filename) {
                return filename;
            }
        } catch (error) {
            // Keep the deterministic fallback below.
        }
        return `Video ${index + 1}`;
    }

    function getVideoJsGroup(host) {
        const player = getPlayerFromHost(host);
        if (!player) {
            return null;
        }

        const playlist = getPlaylist(player);
        if (!playlist.length) {
            return null;
        }

        const currentIndex = getCurrentIndex(player, playlist.length);
        const items = [];
        const originalIndexes = [];

        playlist.forEach((playlistItem, index) => {
            const video = getPlaylistVideoUrl(playlistItem);
            if (!video) {
                return;
            }
            items.push({
                video,
                title: getVideoTitle(video, playlistItem, index)
            });
            originalIndexes.push(index);
        });

        if (!items.length) {
            return null;
        }

        const startIndex = Math.max(0, originalIndexes.indexOf(currentIndex));
        return {
            key: host,
            buttonHost: host,
            player,
            items,
            startIndex
        };
    }

    function getPlainVideoItem(video, index) {
        const videoUrl = firstOpenableUrl([
            video.currentSrc,
            video.src,
            typeof video.getAttribute === 'function' ? video.getAttribute('src') : ''
        ]);
        if (!videoUrl) {
            return null;
        }

        const title = video.getAttribute && (video.getAttribute('title') || video.getAttribute('aria-label'));
        return {
            video: videoUrl,
            title: title || getVideoTitle(videoUrl, null, index)
        };
    }

    function getFallbackButtonHost(video) {
        if (video.parentElement) {
            return video.parentElement;
        }
        return video;
    }

    function collectGroups() {
        const groups = [];
        const videoJsHosts = getVideoJsHosts();
        const videoJsGroups = videoJsHosts
            .map((host) => getVideoJsGroup(host))
            .filter(Boolean);
        const activePlayerHosts = new Set(videoJsGroups.map((group) => group.buttonHost));

        videoJsGroups.forEach((group) => groups.push(group));

        document.querySelectorAll('video').forEach((video, index) => {
            const host = getPlayerHost(video);
            if (host && activePlayerHosts.has(host)) {
                return;
            }
            const item = getPlainVideoItem(video, index);
            if (!item) {
                return;
            }
            groups.push({
                key: video,
                buttonHost: getFallbackButtonHost(video),
                player: null,
                items: [item],
                startIndex: 0
            });
        });

        return groups;
    }

    function encodeBase64Url(value) {
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function getPlaylistTitle() {
        const title = typeof document.title === 'string' ? document.title.trim() : '';
        return title || window.location.hostname || 'PotPlayer';
    }

    function buildPlaylistUrl(items, startIndex) {
        const payload = JSON.stringify({
            playlistTitle: getPlaylistTitle(),
            items,
            startIndex
        });
        return `potplayer://playlist?items=${encodeURIComponent(encodeBase64Url(payload))}`;
    }

    function ensureButtonHostStyle(host) {
        if (!host || !host.style) {
            return;
        }
        const computed = window.getComputedStyle(host);
        if (computed && computed.position === 'static') {
            host.style.position = 'relative';
        }
    }

    function createButton(host) {
        if (!host || typeof host.appendChild !== 'function') {
            return null;
        }
        ensureButtonHostStyle(host);
        const button = document.createElement('a');
        button.className = BUTTON_CLASS;
        button.textContent = 'PotPlayer';
        button.target = '_blank';
        button.rel = 'noopener';
        button.style.cssText = BUTTON_STYLE;
        host.appendChild(button);
        return button;
    }

    function updateGroup(group) {
        let state = groupStates.get(group.key);
        if (!state || !state.button || !state.button.isConnected) {
            state = {
                button: createButton(group.buttonHost),
                host: group.buttonHost
            };
            if (!state.button) {
                return;
            }
            groupStates.set(group.key, state);
        }

        const button = state.button;
        button.href = buildPlaylistUrl(group.items, group.startIndex);
        button.textContent = group.items.length === 1
            ? 'PotPlayer'
            : `PotPlayer(${group.items.length})`;
        button.title = group.items.length === 1
            ? '使用 PotPlayer 打开当前视频'
            : '使用一个 PotPlayer 窗口打开此 Video.js 实例的播放列表';
        button.dataset.playerItemCount = String(group.items.length);
        button.dataset.playerStartIndex = String(group.startIndex);
    }

    function removeGroup(key) {
        const state = groupStates.get(key);
        if (state && state.button && typeof state.button.remove === 'function') {
            state.button.remove();
        }
        groupStates.delete(key);
    }

    function scan() {
        scanTimer = 0;
        const seen = new Set();
        collectGroups().forEach((group) => {
            seen.add(group.key);
            updateGroup(group);
        });

        Array.from(groupStates.keys()).forEach((key) => {
            if (!seen.has(key) || !key.isConnected) {
                removeGroup(key);
            }
        });
    }

    function scheduleScan() {
        if (scanTimer) {
            return;
        }
        scanTimer = window.setTimeout(scan, 100);
    }

    function start() {
        if (!isSupportedHost()) {
            return;
        }
        scan();
        observer = new MutationObserver(scheduleScan);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'class', 'style', 'data-vjs-player']
        });
        window.setInterval(scan, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
