// ==UserScript==
// @name         Envato Audio Downloader Master
// @namespace    https://github.com/hpuglia
// @version      2.2.0
// @description  Organiza downloads de prévias de áudio do Envato Elements com associação por faixa, seletores visuais e integração ao botão nativo.
// @author       hpuglia
// @homepageURL  https://github.com/hpuglia/envato-audio-downloader-master
// @supportURL   https://github.com/hpuglia/envato-audio-downloader-master/issues
// @downloadURL  https://raw.githubusercontent.com/hpuglia/envato-audio-downloader-master/main/envato-audio-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/hpuglia/envato-audio-downloader-master/main/envato-audio-downloader.user.js
// @match        https://elements.envato.com/*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    const PREFIX = '[Envato Master]';
    const ID = 'envato-master';
    const ACTIVE_MS = 12000;
    const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)(?:$|[?#])/i;
    const ITEM_PATH = /\/[^/]+-[A-Z0-9]{6,12}\/?$/i;
    const DEFAULT_SELECTORS = Object.freeze({
        card: '[data-testid="audio-card"]',
        preview: '[data-testid="audio-preview"]',
        title: '[data-testid="item-title"]'
    });
    const STORAGE_KEYS = {
        card: 'envato_sel_card',
        preview: 'envato_sel_preview',
        title: 'envato_sel_title'
    };
    const state = {
        configuration: false,
        active: null,
        lastResource: null,
        observed: new Set(),
        toastTimer: null,
        domTimer: null
    };

    function log(...args) { console.debug(PREFIX, ...args); }

    function getSelector(type) {
        try { return GM_getValue(STORAGE_KEYS[type], DEFAULT_SELECTORS[type]); }
        catch (_) { return DEFAULT_SELECTORS[type]; }
    }

    function query(root, selector) {
        if (!root || !selector) return null;
        try { return root.querySelector(selector); } catch (_) { return null; }
    }

    function closest(element, selector) {
        if (!(element instanceof Element) || !selector) return null;
        try { return element.closest(selector); } catch (_) { return null; }
    }

    function isAudioCollection() {
        return /^\/(royalty-free-music|audio|sound-effects)(\/|$)/i.test(location.pathname);
    }

    function isItemPage() { return ITEM_PATH.test(location.pathname); }

    function isAudioUrl(raw) {
        if (!raw) return false;
        try {
            const url = new URL(raw, location.href);
            return /^https?:$/.test(url.protocol) && AUDIO_EXT.test(url.pathname);
        } catch (_) { return false; }
    }

    function absoluteAudioUrl(raw) {
        if (!isAudioUrl(raw)) return null;
        try { return new URL(raw, location.href).href; } catch (_) { return null; }
    }

    function cleanName(text) {
        return String(text || 'envato-preview')
            .replace(/[\\/:*?"<>|\x00-\x1F]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/[. ]+$/g, '')
            .trim().slice(0, 110) || 'envato-preview';
    }

    function getTitle(target) {
        const custom = query(target, getSelector('title'));
        const semantic = query(target, 'h1, h2, h3, [data-testid*="title"], a[href]');
        // Em listas, nunca usa o título global de outra faixa.
        const globalTitle = isItemPage() ? query(document, getSelector('title')) : null;
        const candidate = custom || semantic || globalTitle;
        const value = candidate?.textContent?.trim();
        if (value) return value;
        if (target?.textContent && target !== document.body) {
            const line = target.textContent.split('\n').map(item => item.trim())
                .find(item => item && !/^(preview|play|baixar|download)$/i.test(item));
            if (line) return line;
        }
        return document.querySelector('h1')?.textContent?.trim()
            || document.title.replace(/\s*\|.*$/, '').replace(/\s*-\s*Envato.*$/i, '').trim();
    }

    function filename(target, url) {
        const ext = new URL(url).pathname.match(AUDIO_EXT)?.[1]?.toLowerCase() || 'mp3';
        const title = cleanName(getTitle(target)).replace(/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i, '');
        return `${title}.${ext}`;
    }

    function toast(message) {
        let node = document.getElementById(`${ID}-toast`);
        if (!node && document.body) {
            node = document.createElement('div');
            node.id = `${ID}-toast`;
            node.setAttribute('role', 'status');
            node.setAttribute('aria-live', 'polite');
            document.body.appendChild(node);
        }
        if (!node) return;
        node.textContent = message;
        node.hidden = false;
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => { node.hidden = true; }, 4500);
    }

    function nativePreviewExists() {
        if (!isItemPage()) return false;
        return [...document.querySelectorAll('a, button, [role="button"]')].some(element =>
            /^(download preview|baixar pr[eé]via|descargar vista previa)$/i
                .test(element.textContent?.trim() || element.getAttribute('aria-label') || '')
        );
    }

    function downloadAudio(button, target, url) {
        if (typeof GM_download !== 'function') {
            toast('Tampermonkey não disponibilizou GM_download.');
            return;
        }
        button.disabled = true;
        button.textContent = 'Baixando…';
        const finish = (message, label) => {
            if (!button.isConnected) return;
            button.disabled = false;
            button.textContent = label;
            toast(message);
        };
        try {
            GM_download({
                url,
                name: filename(target, url),
                saveAs: true,
                onload: () => finish('Prévia salva. Confira os direitos de uso.', '↓ Prévia'),
                onerror: error => {
                    log('Falha no download', error);
                    finish('Não foi possível baixar esta prévia.', '↓ Tentar novamente');
                },
                ontimeout: () => finish('O download expirou.', '↓ Tentar novamente')
            });
        } catch (error) {
            log('Erro ao iniciar download', error);
            finish('O navegador bloqueou o download da prévia.', '↓ Tentar novamente');
        }
    }

    function addButton(target, type, rawUrl) {
        const url = absoluteAudioUrl(rawUrl);
        if (!url || !target?.isConnected) return;
        // Nas páginas individuais, o próprio Envato oferece "Download preview".
        if (type === 'preview' && nativePreviewExists()) return;
        let button = query(target, `:scope > .${ID}-download`);
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = `${ID}-download ${ID}-${type}`;
            button.textContent = '↓ Prévia';
            button.title = 'Baixar somente a prévia reproduzida (não concede licença)';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                downloadAudio(button, target, button.dataset.url);
            });
            if (getComputedStyle(target).position === 'static') {
                target.style.position = 'relative';
            }
            target.appendChild(button);
        }
        button.dataset.url = url;
        button.title = `Baixar prévia detectada: ${filename(target, url)}`;
        log('Prévia associada ao', type, getTitle(target));
    }

    function assetLinkIn(element) {
        return [...element.querySelectorAll('a[href]')].some(a => {
            try {
                const href = new URL(a.getAttribute('href'), location.href);
                return href.hostname === location.hostname && ITEM_PATH.test(href.pathname);
            } catch (_) { return false; }
        });
    }

    function findTarget(element) {
        const card = closest(element, getSelector('card'));
        if (card) return { element: card, type: 'card' };
        const preview = closest(element, getSelector('preview'));
        if (preview) return { element: preview, type: 'preview' };
        if (isAudioCollection()) {
            const row = closest(element, 'article, li, [role="listitem"]');
            if (row && assetLinkIn(row)) return { element: row, type: 'card' };
        }
        return null;
    }

    function sourceIn(target) {
        if (!target) return null;
        const media = target.matches?.('audio') ? target : query(target, 'audio');
        return absoluteAudioUrl(media?.currentSrc || media?.src || query(media, 'source[src]')?.src);
    }

    function bindResource(rawUrl) {
        const url = absoluteAudioUrl(rawUrl);
        if (!url) return;
        if (!state.observed.has(url)) {
            state.observed.add(url);
            if (state.observed.size > 160) state.observed.delete(state.observed.values().next().value);
            log('Recurso de prévia observado', new URL(url).pathname);
        }
        state.lastResource = url;
        if (state.active && Date.now() - state.active.at <= ACTIVE_MS) {
            const { element, type } = state.active;
            if (element.isConnected) {
                addButton(element, type, url);
                return;
            }
        }
        // Sem interação recente, só associa à página individual de uma faixa.
        if (isItemPage()) {
            const player = query(document, getSelector('preview')) || query(document, 'audio')?.parentElement;
            if (player) addButton(player, 'preview', url);
        }
    }

    function beginPlayback(target) {
        state.active = { ...target, at: Date.now() };
        const inline = sourceIn(target.element);
        if (inline) bindResource(inline);
        log('Player ativo:', target.type, getTitle(target.element));
    }

    function onPointerDown(event) {
        if (state.configuration || closest(event.target, `#${ID}-gear, .${ID}-download`)) return;
        const target = findTarget(event.target);
        if (target) beginPlayback(target);
    }

    function onPlay(event) {
        const media = event.target;
        if (!(media instanceof HTMLMediaElement)) return;
        const target = findTarget(media) || (isItemPage()
            ? { element: query(document, getSelector('preview')) || media.parentElement, type: 'preview' }
            : null);
        if (target) beginPlayback(target);
        const url = absoluteAudioUrl(media.currentSrc || media.src);
        if (url) bindResource(url);
    }

    function quote(value) {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
        return String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
    }

    function selectorFor(element) {
        if (element.id) return `#${quote(element.id)}`;
        const testId = element.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
        const path = [];
        let current = element;
        for (let depth = 0; current && depth < 5; depth++, current = current.parentElement) {
            let part = current.tagName.toLowerCase();
            if (current.id) {
                path.unshift(`#${quote(current.id)}`);
                break;
            }
            const parent = current.parentElement;
            if (parent) {
                const sameTag = [...parent.children].filter(child => child.tagName === current.tagName);
                if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
            }
            path.unshift(part);
            const selector = path.join(' > ');
            try { if (document.querySelectorAll(selector).length === 1) return selector; } catch (_) { /* ignore */ }
        }
        return path.join(' > ');
    }

    function onConfigSelect(event) {
        if (!state.configuration || closest(event.target, `#${ID}-gear, #${ID}-toast`)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const element = event.target instanceof Element ? event.target : event.target.parentElement;
        const selector = selectorFor(element);
        const answer = prompt(
            `Seletor encontrado:\n${selector}\n\nSalvar como:\n1 = Card da lista\n2 = Player da página\n3 = Título\n\nDigite 1, 2 ou 3:`
        );
        const key = { '1': 'card', '2': 'preview', '3': 'title' }[answer?.trim()];
        if (key) {
            try {
                document.querySelector(selector);
                GM_setValue(STORAGE_KEYS[key], selector);
                toast(`Seletor de ${key} salvo.`);
                log('Seletor salvo:', key, selector);
            } catch (error) { toast('Não foi possível salvar esse seletor.'); log(error); }
        }
        toggleConfiguration(false);
    }

    function toggleConfiguration(force) {
        state.configuration = typeof force === 'boolean' ? force : !state.configuration;
        const gear = document.getElementById(`${ID}-gear`);
        if (gear) {
            gear.textContent = state.configuration ? '×' : '⚙';
            gear.setAttribute('aria-pressed', String(state.configuration));
            gear.classList.toggle('active', state.configuration);
        }
        if (state.configuration) {
            document.addEventListener('click', onConfigSelect, true);
            document.addEventListener('mouseover', highlight, true);
            document.addEventListener('mouseout', unhighlight, true);
            toast('Clique no card, player ou título que deseja configurar.');
        } else {
            document.removeEventListener('click', onConfigSelect, true);
            document.removeEventListener('mouseover', highlight, true);
            document.removeEventListener('mouseout', unhighlight, true);
            document.querySelectorAll(`.${ID}-highlight`).forEach(el => el.classList.remove(`${ID}-highlight`));
        }
    }

    function highlight(event) {
        if (state.configuration && event.target instanceof Element && !closest(event.target, `#${ID}-gear, #${ID}-toast`)) {
            event.target.classList.add(`${ID}-highlight`);
        }
    }
    function unhighlight(event) {
        if (event.target instanceof Element) event.target.classList.remove(`${ID}-highlight`);
    }

    function ensureUi() {
        if (!document.body) return;
        if (!document.getElementById(`${ID}-styles`)) {
            const style = document.createElement('style');
            style.id = `${ID}-styles`;
            style.textContent = `
                #${ID}-gear { position:fixed !important; left:22px !important; bottom:22px !important;
                    width:48px !important; height:48px !important; border:2px solid #7ee83f !important;
                    border-radius:50% !important; background:#121212 !important; color:#7ee83f !important;
                    font-size:24px !important; z-index:2147483647 !important; cursor:pointer !important;
                    display:flex !important; justify-content:center !important; align-items:center !important; }
                #${ID}-gear.active { color:#fff !important; border-color:#ff6060 !important; }
                .${ID}-download { position:absolute !important; right:84px !important; top:50% !important;
                    transform:translateY(-50%) !important; z-index:2147483000 !important;
                    color:#101010 !important; background:#7ee83f !important; border:0 !important;
                    border-radius:6px !important; padding:7px 10px !important; font:600 13px sans-serif !important;
                    cursor:pointer !important; white-space:nowrap !important; }
                .${ID}-download.${ID}-preview { right:15px !important; top:auto !important;
                    bottom:15px !important; transform:none !important; }
                .${ID}-download:disabled { opacity:.65 !important; cursor:progress !important; }
                .${ID}-highlight { outline:3px dashed #ff6060 !important; cursor:crosshair !important; }
                #${ID}-toast { position:fixed !important; left:22px !important; bottom:82px !important;
                    max-width:min(380px,85vw) !important; padding:9px 13px !important;
                    border-radius:7px !important; background:#151515 !important; color:#fff !important;
                    font:13px/1.4 sans-serif !important; box-shadow:0 3px 14px #0008 !important;
                    z-index:2147483647 !important; pointer-events:none !important; }
                #${ID}-toast[hidden] { display:none !important; }
            `;
            (document.head || document.documentElement).appendChild(style);
        }
        if (!document.getElementById(`${ID}-gear`)) {
            const gear = document.createElement('button');
            gear.id = `${ID}-gear`;
            gear.type = 'button';
            gear.textContent = state.configuration ? '×' : '⚙';
            gear.setAttribute('aria-label', 'Configurar seletores do Envato Master');
            gear.setAttribute('aria-pressed', String(state.configuration));
            gear.title = 'Configurar seletores dos cards, players e títulos';
            gear.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                toggleConfiguration();
            });
            document.body.appendChild(gear);
        }
    }

    function start() {
        ensureUi();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('play', onPlay, true);
        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) bindResource(entry.name);
            });
            observer.observe({ type: 'resource', buffered: true });
        } catch (error) { log('PerformanceObserver indisponível', error); }
        // Apenas restaura os controles se a navegação SPA recriar o DOM.
        const domObserver = new MutationObserver(() => {
            if (document.getElementById(`${ID}-gear`) && document.getElementById(`${ID}-styles`)) return;
            if (state.domTimer) return;
            state.domTimer = setTimeout(() => {
                state.domTimer = null;
                ensureUi();
            }, 250);
        });
        domObserver.observe(document.documentElement, { childList: true, subtree: true });
        log('Versão 2.2.0 iniciada:', location.pathname);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();