// ==UserScript==
// @name         Envato Audio Downloader Master
// @namespace    https://github.com/hpuglia
// @version      2.3.0
// @description  Prévias de áudio com downloads organizados, painel compacto, seletores visuais e integração com o player do Envato Elements.
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
        domTimer: null,
        panelOpen: false,
        pickerKey: null,
        uiStatus: 'Aguardando reprodução',
        uiTone: 'idle'
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

    function setUiStatus(message, tone = 'idle') {
        state.uiStatus = message;
        state.uiTone = tone;
        const status = document.getElementById(`${ID}-status`);
        const indicator = document.getElementById(`${ID}-indicator`);
        if (status) status.textContent = message;
        if (indicator) indicator.dataset.tone = tone;
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
        setUiStatus('Download em andamento', 'busy');
        const finish = (message, label) => {
            if (button.isConnected) {
                button.disabled = false;
                button.textContent = label;
            }
            toast(message);
            setUiStatus(label === '↓ Prévia' ? 'Prévia salva' : 'Download não concluído', label === '↓ Prévia' ? 'success' : 'error');
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
            setUiStatus('Prévia detectada', 'ready');
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
        if (state.configuration || closest(event.target, `#${ID}-gear, #${ID}-panel, .${ID}-download`)) return;
        if (state.panelOpen) setPanelOpen(false);
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

    function setPanelOpen(open) {
        state.panelOpen = Boolean(open) && !state.configuration;
        const panel = document.getElementById(`${ID}-panel`);
        const gear = document.getElementById(`${ID}-gear`);
        if (panel) panel.hidden = !state.panelOpen;
        if (gear) {
            gear.setAttribute('aria-expanded', String(state.panelOpen));
            gear.classList.toggle('open', state.panelOpen);
        }
    }

    function onConfigSelect(event) {
        if (!state.configuration || closest(event.target, `#${ID}-gear, #${ID}-toast, #${ID}-panel, .${ID}-download`)) return;
        const element = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (!element) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const selector = selectorFor(element);
        const key = state.pickerKey;
        if (key && STORAGE_KEYS[key]) {
            try {
                document.querySelector(selector);
                GM_setValue(STORAGE_KEYS[key], selector);
                log('Seletor salvo:', key, selector);
                toggleConfiguration(false);
                toast(`Seletor de ${{ card: 'card', preview: 'player', title: 'título' }[key]} salvo.`);
            } catch (error) {
                toggleConfiguration(false);
                toast('Não foi possível salvar esse seletor.');
                log(error);
            }
        } else toggleConfiguration(false);
    }

    function toggleConfiguration(enable, key = null) {
        state.configuration = Boolean(enable);
        state.pickerKey = state.configuration ? key : null;
        const gear = document.getElementById(`${ID}-gear`);
        if (gear) {
            gear.textContent = state.configuration ? '×' : '⚙';
            gear.setAttribute('aria-pressed', String(state.configuration));
            gear.classList.toggle('active', state.configuration);
            gear.setAttribute('aria-label', state.configuration ? 'Cancelar seleção' : 'Abrir painel Envato Master');
        }
        if (state.configuration) {
            setPanelOpen(false);
            document.addEventListener('click', onConfigSelect, true);
            document.addEventListener('mouseover', highlight, true);
            document.addEventListener('mouseout', unhighlight, true);
            toast(`Selecione ${{ card: 'um card de áudio', preview: 'o player', title: 'o título de uma faixa' }[key] || 'um elemento'}. Esc para cancelar.`);
        } else {
            document.removeEventListener('click', onConfigSelect, true);
            document.removeEventListener('mouseover', highlight, true);
            document.removeEventListener('mouseout', unhighlight, true);
            document.querySelectorAll(`.${ID}-highlight`).forEach(el => el.classList.remove(`${ID}-highlight`));
        }
    }

    function highlight(event) {
        if (state.configuration && event.target instanceof Element &&
            !closest(event.target, `#${ID}-gear, #${ID}-toast, #${ID}-panel, .${ID}-download`)) {
            event.target.classList.add(`${ID}-highlight`);
        }
    }
    function unhighlight(event) {
        if (event.target instanceof Element) event.target.classList.remove(`${ID}-highlight`);
    }

    function handlePanelAction(event) {
        const action = event.target.closest?.('button[data-action]')?.dataset.action;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'close') setPanelOpen(false);
        else if (action === 'reset') {
            for (const key of Object.keys(STORAGE_KEYS)) {
                try { GM_setValue(STORAGE_KEYS[key], DEFAULT_SELECTORS[key]); }
                catch (error) { log('Falha ao restaurar seletor:', key, error); toast('Erro ao restaurar seletores.'); return; }
            }
            toast('Seletores restaurados para o padrão.');
        } else if (action.startsWith('pick-')) {
            const key = action.slice(5);
            if (STORAGE_KEYS[key]) toggleConfiguration(true, key);
        }
    }

    function ensureUi() {
        if (!document.body) return;
        if (!document.getElementById(`${ID}-styles`)) {
            const style = document.createElement('style');
            style.id = `${ID}-styles`;
            style.textContent = `
                #${ID}-gear, #${ID}-panel, #${ID}-toast, .${ID}-download { box-sizing:border-box !important; }
                #${ID}-gear { position:fixed !important; left:20px !important; bottom:20px !important;
                    width:48px !important; height:48px !important; border:1px solid #718b94 !important;
                    border-radius:15px !important; background:linear-gradient(145deg,#26383d,#122128) !important;
                    color:#b8f5d1 !important; font:24px/1 system-ui,sans-serif !important;
                    box-shadow:0 7px 23px #0005, inset 0 1px #ffffff1f !important;
                    z-index:2147483647 !important; cursor:pointer !important; display:flex !important;
                    justify-content:center !important; align-items:center !important;
                    transition:background .15s,transform .15s,border-color .15s !important; }
                #${ID}-gear:hover, #${ID}-gear.open { background:#29474b !important; border-color:#76c7a8 !important; }
                #${ID}-gear:active { transform:scale(.96) !important; }
                #${ID}-gear.active { color:#fff !important; border-color:#ee8989 !important; background:#69373d !important; }
                #${ID}-gear:focus-visible, #${ID}-panel button:focus-visible, .${ID}-download:focus-visible {
                    outline:2px solid #a9e5ff !important; outline-offset:3px !important; }
                #${ID}-panel { position:fixed !important; left:20px !important; bottom:80px !important;
                    width:min(338px,calc(100vw - 32px)) !important; max-height:calc(100vh - 108px) !important;
                    overflow-y:auto !important; padding:0 !important; border:1px solid #465d62 !important;
                    border-radius:17px !important; background:#172328 !important; color:#eaf4f3 !important;
                    box-shadow:0 18px 60px #0009,0 2px 10px #0005 !important;
                    z-index:2147483646 !important; font:13px/1.45 system-ui,-apple-system,sans-serif !important; }
                #${ID}-panel[hidden] { display:none !important; }
                #${ID}-panel * { box-sizing:border-box !important; font-family:inherit !important; }
                #${ID}-panel .${ID}-head { display:flex !important; align-items:center !important;
                    justify-content:space-between !important; gap:12px !important;
                    padding:16px 16px 13px !important; border-bottom:1px solid #34484e !important; }
                #${ID}-panel .${ID}-brand { display:flex !important; align-items:center !important; gap:10px !important; }
                #${ID}-panel .${ID}-logo { display:grid !important; place-items:center !important;
                    width:35px !important; height:35px !important; border-radius:11px !important;
                    background:#315047 !important; color:#b9f6d5 !important; font-size:20px !important; }
                #${ID}-panel .${ID}-title { color:#f4fbf8 !important; font-size:14px !important;
                    font-weight:750 !important; letter-spacing:.1px !important; }
                #${ID}-panel .${ID}-version { color:#9ab3b6 !important; font-size:11px !important; margin-top:1px !important; }
                #${ID}-panel button { cursor:pointer !important; }
                #${ID}-panel .${ID}-close { border:0 !important; background:#2c3e43 !important; color:#d2e4e4 !important;
                    width:30px !important; height:30px !important; border-radius:9px !important; font-size:20px !important; }
                #${ID}-panel .${ID}-body { padding:14px 16px 16px !important; }
                #${ID}-panel .${ID}-status { display:flex !important; align-items:center !important;
                    gap:9px !important; background:#23363b !important; border:1px solid #385157 !important;
                    border-radius:11px !important; padding:10px 11px !important; margin-bottom:15px !important; }
                #${ID}-indicator { width:8px !important; height:8px !important; border-radius:50% !important;
                    flex:0 0 8px !important; background:#8ea1a5 !important; }
                #${ID}-indicator[data-tone=ready], #${ID}-indicator[data-tone=success] { background:#72dfaa !important; }
                #${ID}-indicator[data-tone=busy] { background:#f7c77d !important; }
                #${ID}-indicator[data-tone=error] { background:#fa8c8c !important; }
                #${ID}-panel .${ID}-section { font-size:11px !important; font-weight:700 !important;
                    color:#a3b8b9 !important; letter-spacing:.07em !important; text-transform:uppercase !important;
                    margin-bottom:8px !important; }
                #${ID}-panel .${ID}-actions { display:grid !important; gap:7px !important; }
                #${ID}-panel .${ID}-action { display:flex !important; justify-content:space-between !important;
                    align-items:center !important; width:100% !important; text-align:left !important;
                    border:1px solid #3d5358 !important; border-radius:10px !important; padding:10px 11px !important;
                    color:#ecf5f2 !important; background:#26393e !important; font-size:12px !important; font-weight:600 !important; }
                #${ID}-panel .${ID}-action:hover { background:#325047 !important; border-color:#6cae94 !important; }
                #${ID}-panel .${ID}-action span:last-child { color:#a2beb9 !important; font-size:12px !important; }
                #${ID}-panel .${ID}-foot { margin-top:15px !important; padding-top:12px !important;
                    border-top:1px solid #35494f !important; color:#9cafb0 !important; font-size:11px !important; }
                #${ID}-panel .${ID}-reset { border:0 !important; padding:5px 0 !important;
                    background:transparent !important; color:#b8ebd1 !important; font-size:11px !important; }
                #${ID}-panel .${ID}-reset:hover { text-decoration:underline !important; }
                .${ID}-download { position:absolute !important; right:84px !important; top:50% !important;
                    transform:translateY(-50%) !important; z-index:2147483000 !important;
                    border:1px solid #a2eec5 !important; border-radius:9px !important; padding:8px 12px !important;
                    color:#10352a !important; background:linear-gradient(180deg,#b4f4d1,#7fe0af) !important;
                    font:700 12px/1.2 system-ui,sans-serif !important; letter-spacing:.1px !important;
                    cursor:pointer !important; white-space:nowrap !important;
                    box-shadow:0 2px 8px #0003 !important; transition:filter .15s,box-shadow .15s !important; }
                .${ID}-download:hover { filter:brightness(1.06) !important; box-shadow:0 3px 12px #0004 !important; }
                .${ID}-download.${ID}-preview { right:15px !important; top:auto !important;
                    bottom:15px !important; transform:none !important; }
                .${ID}-download:disabled { opacity:.65 !important; cursor:progress !important; }
                .${ID}-highlight { outline:3px dashed #f0b474 !important; outline-offset:2px !important;
                    background-color:#eda94b15 !important; cursor:crosshair !important; }
                #${ID}-toast { position:fixed !important; left:20px !important; bottom:80px !important;
                    max-width:min(380px,calc(100vw - 32px)) !important; padding:11px 14px !important;
                    border-radius:11px !important; border:1px solid #496266 !important;
                    background:#1b3036 !important; color:#edf8f3 !important;
                    font:12px/1.5 system-ui,sans-serif !important; box-shadow:0 8px 24px #0007 !important;
                    z-index:2147483647 !important; pointer-events:none !important; }
                #${ID}-toast[hidden] { display:none !important; }
                @media(max-width:520px) { #${ID}-gear { left:12px !important; bottom:12px !important; }
                    #${ID}-panel { left:12px !important; bottom:70px !important; }
                    #${ID}-toast { left:12px !important; bottom:70px !important; } }
                @media(prefers-reduced-motion:reduce) { #${ID}-gear,.${ID}-download { transition:none !important; } }
            `;
            (document.head || document.documentElement).appendChild(style);
        }
        if (!document.getElementById(`${ID}-gear`)) {
            const gear = document.createElement('button');
            gear.id = `${ID}-gear`;
            gear.type = 'button';
            gear.textContent = state.configuration ? '×' : '⚙';
            gear.setAttribute('aria-label', 'Abrir painel Envato Master');
            gear.setAttribute('aria-haspopup', 'true');
            gear.setAttribute('aria-expanded', String(state.panelOpen));
            gear.setAttribute('aria-controls', `${ID}-panel`);
            gear.setAttribute('aria-pressed', String(state.configuration));
            gear.title = 'Envato Master: abrir configurações';
            gear.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (state.configuration) toggleConfiguration(false);
                else setPanelOpen(!state.panelOpen);
            });
            document.body.appendChild(gear);
        }
        if (!document.getElementById(`${ID}-panel`)) {
            const panel = document.createElement('section');
            panel.id = `${ID}-panel`;
            panel.setAttribute('aria-label', 'Configurações do Envato Master');
            panel.hidden = !state.panelOpen;
            panel.innerHTML = `
                <div class="${ID}-head">
                    <div class="${ID}-brand"><span class="${ID}-logo" aria-hidden="true">♫</span>
                        <div><div class="${ID}-title">Envato Audio Master</div>
                            <div class="${ID}-version">Prévia de áudio · v2.3.0</div></div></div>
                    <button class="${ID}-close" type="button" data-action="close" aria-label="Fechar painel">×</button>
                </div>
                <div class="${ID}-body">
                    <div class="${ID}-status" role="status" aria-live="polite">
                        <span id="${ID}-indicator" data-tone="${state.uiTone}"></span>
                        <span id="${ID}-status"></span>
                    </div>
                    <div class="${ID}-section">Selecionar elementos da página</div>
                    <div class="${ID}-actions">
                        <button class="${ID}-action" type="button" data-action="pick-card"><span>Card de áudio</span><span>Selecionar ↗</span></button>
                        <button class="${ID}-action" type="button" data-action="pick-preview"><span>Player individual</span><span>Selecionar ↗</span></button>
                        <button class="${ID}-action" type="button" data-action="pick-title"><span>Título da faixa</span><span>Selecionar ↗</span></button>
                    </div>
                    <div class="${ID}-foot">
                        Apenas prévias públicas ou autorizadas. O download não concede licença.<br>
                        <button type="button" class="${ID}-reset" data-action="reset">Restaurar seletores padrão</button>
                    </div>
                </div>`;
            panel.addEventListener('click', handlePanelAction);
            document.body.appendChild(panel);
            setUiStatus(state.uiStatus, state.uiTone);
        }
    }

    function start() {
        ensureUi();
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('play', onPlay, true);
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (state.configuration) { toggleConfiguration(false); toast('Seleção cancelada.'); }
            else if (state.panelOpen) setPanelOpen(false);
        }, true);
        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) bindResource(entry.name);
            });
            observer.observe({ type: 'resource', buffered: true });
        } catch (error) { log('PerformanceObserver indisponível', error); }
        // Apenas restaura os controles se a navegação SPA recriar o DOM.
        const domObserver = new MutationObserver(() => {
            if (document.getElementById(`${ID}-gear`) && document.getElementById(`${ID}-styles`) && document.getElementById(`${ID}-panel`)) return;
            if (state.domTimer) return;
            state.domTimer = setTimeout(() => {
                state.domTimer = null;
                ensureUi();
            }, 250);
        });
        domObserver.observe(document.documentElement, { childList: true, subtree: true });
        log('Versão 2.3.0 iniciada:', location.pathname);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();