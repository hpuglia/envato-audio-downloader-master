// ==UserScript==
// @name         Envato Audio Downloader Master
// @namespace    https://tampermonkey.net/
// @version      2.1
// @description  Download de áudios do Envato Elements com seletor visual e logs de depuração.
// @match        https://elements.envato.com/*
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    console.log('[Envato Master] Script iniciado na página:', location.href);

    const STATE = {
        lastUrl: null,
        activeTarget: null,
        targetType: null,
        configMode: false
    };

    const SELECTORS = {
        get card() { return GM_getValue('envato_sel_card', '[data-testid="audio-card"]'); },
        get preview() { return GM_getValue('envato_sel_preview', '[data-testid="audio-preview"]'); },
        get title() { return GM_getValue('envato_sel_title', '[data-testid="item-title"]'); }
    };

    const AUDIO_REGEX = /\.(m4a|mp3|mp4|wav|ogg|aac|flac|webm)(\?|#|$)/i;
    const detectedUrls = new Set();

    // 1. INJEÇÃO DA INTERFACE (Engrenagem e Estilos Diretos no Body)
    function injectUI() {
        if (!document.body) return;

        // Injeta CSS global do script
        if (!document.getElementById('envato-master-styles')) {
            const style = document.createElement('style');
            style.id = 'envato-master-styles';
            style.textContent = `
                #envato-master-gear {
                    position: fixed !important; bottom: 25px !important; left: 25px !important;
                    width: 50px !important; height: 50px !important; background: #111 !important;
                    color: #7ee83f !important; font-size: 24px !important; border: 2px solid #7ee83f !important;
                    border-radius: 50% !important; cursor: pointer !important; z-index: 2147483647 !important;
                    display: flex !important; align-items: center !important; justify-content: center !important;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.7) !important; transition: transform 0.2s !important;
                }
                #envato-master-gear:hover { transform: scale(1.1) !important; background: #222 !important; }
                #envato-master-gear.active { background: #ff4444 !important; border-color: #fff !important; color: #fff !important; }

                .envato-master-dl-btn {
                    position: absolute; right: 86px; top: 50%; transform: translateY(-50%);
                    z-index: 999999; background: #7ee83f !important; color: #111 !important;
                    border: none !important; border-radius: 6px !important; padding: 6px 14px !important;
                    font-size: 14px !important; font-weight: bold !important; cursor: pointer !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
                }
                .envato-master-dl-btn.is-preview { right: 20px; bottom: 20px; top: auto; transform: none; }
                .envato-master-dl-btn:hover { filter: brightness(1.1); }

                .envato-master-highlight {
                    outline: 3px dashed #ff4444 !important;
                    background: rgba(255, 68, 68, 0.25) !important;
                    cursor: crosshair !important;
                }
            `;
            document.head.appendChild(style);
        }

        // Injeta o Botão de Configuração (Engrenagem) caso tenha sumido
        if (!document.getElementById('envato-master-gear')) {
            const gear = document.createElement('button');
            gear.id = 'envato-master-gear';
            gear.innerHTML = '⚙️';
            gear.title = 'Configurar Seletores (Envato Master)';
            gear.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleConfigMode();
            };
            document.body.appendChild(gear);
            console.log('[Envato Master] Botão de engrenagem injetado com sucesso.');
        }
    }

    // 2. MODO DE CONFIGURAÇÃO VISUAL
    function generateSelector(el) {
        if (el.hasAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        if (el.id) return `#${el.id}`;
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(/\s+/).filter(c => c && !c.includes('envato-master'));
            if (classes.length > 0) return `.${classes.join('.')}`;
        }
        return el.tagName.toLowerCase();
    }

    function handleMouseOver(e) {
        if (!STATE.configMode) return;
        e.target.classList.add('envato-master-highlight');
    }

    function handleMouseOut(e) {
        if (!STATE.configMode) return;
        e.target.classList.remove('envato-master-highlight');
    }

    function handleClickConfig(e) {
        if (!STATE.configMode) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        e.target.classList.remove('envato-master-highlight');
        const selector = generateSelector(e.target);

        const opt = prompt(
            `Elemento Selecionado:\n${selector}\n\nOnde salvar?\n` +
            `1 = Card da Lista de Áudios\n` +
            `2 = Player Fixo da Página (Página Individual)\n` +
            `3 = Título do Áudio\n\nDigite 1, 2 ou 3:`
        );

        if (opt === '1') { GM_setValue('envato_sel_card', selector); alert('✅ Card salvo!'); }
        else if (opt === '2') { GM_setValue('envato_sel_preview', selector); alert('✅ Player salvo!'); }
        else if (opt === '3') { GM_setValue('envato_sel_title', selector); alert('✅ Título salvo!'); }

        toggleConfigMode(false);
    }

    function toggleConfigMode(force) {
        STATE.configMode = force !== undefined ? force : !STATE.configMode;
        const gear = document.getElementById('envato-master-gear');

        if (STATE.configMode) {
            if (gear) { gear.classList.add('active'); gear.textContent = '❌'; }
            document.addEventListener('mouseover', handleMouseOver, true);
            document.addEventListener('mouseout', handleMouseOut, true);
            document.addEventListener('click', handleClickConfig, true);
            console.log('[Envato Master] Modo de configuração ATIVADO.');
        } else {
            if (gear) { gear.classList.remove('active'); gear.textContent = '⚙️'; }
            document.querySelectorAll('.envato-master-highlight').forEach(el => el.classList.remove('envato-master-highlight'));
            document.removeEventListener('mouseover', handleMouseOver, true);
            document.removeEventListener('mouseout', handleMouseOut, true);
            document.removeEventListener('click', handleClickConfig, true);
            console.log('[Envato Master] Modo de configuração DESATIVADO.');
        }
    }

    // 3. CAPTURA DE ÁUDIO E DOWNLOAD
    function sanitize(name) {
        return String(name || 'audio-envato').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100);
    }

    function getFilename(target, type, url) {
        const ext = (url.match(AUDIO_REGEX) || [])[1]?.toLowerCase() || 'mp3';
        let title = '';

        if (type === 'card' && target) {
            const lines = (target.innerText || '').split('\n').map(l => l.trim()).filter(l => l && !/preview|baixar/i.test(l));
            title = lines[0] || 'card-audio';
        } else {
            try {
                const titleEl = document.querySelector(SELECTORS.title);
                if (titleEl) title = titleEl.innerText;
            } catch(e){}
            if (!title) title = document.title.replace(/\|.*$/g, '').replace(/Envato Elements/ig, '').trim();
        }
        return `${sanitize(title)}.${ext}`;
    }

    function injectButton(target, type, url) {
        if (!target) return;
        const existing = target.querySelector('.envato-master-dl-btn');
        if (existing) {
            if (existing.dataset.url === url) return;
            existing.remove();
        }

        const btn = document.createElement('button');
        btn.className = `envato-master-dl-btn ${type === 'preview' ? 'is-preview' : ''}`;
        btn.innerHTML = '⬇ Baixar';
        btn.dataset.url = url;

        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.innerHTML = '⏳...';
            GM_download({
                url: url,
                name: getFilename(target, type, url),
                saveAs: true,
                onload: () => { btn.innerHTML = '✅ OK'; setTimeout(() => btn.innerHTML = '⬇ Baixar', 2000); },
                onerror: () => { btn.innerHTML = '❌ Erro'; setTimeout(() => btn.innerHTML = '⬇ Baixar', 2000); }
            });
        };

        if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
        target.appendChild(btn);
        console.log('[Envato Master] Botão de download injetado no elemento:', target);
    }

    document.addEventListener('mousedown', (e) => {
        if (STATE.configMode) return;
        const target = e.target;
        if (!(target instanceof Element)) return;

        try {
            const card = target.closest(SELECTORS.card);
            if (card) { STATE.activeTarget = card; STATE.targetType = 'card'; return; }

            const preview = target.closest(SELECTORS.preview);
            if (preview) { STATE.activeTarget = preview; STATE.targetType = 'preview'; }
        } catch(e){}
    }, true);

    function handleResource(url) {
        if (!url || !AUDIO_REGEX.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return;
        try { url = new URL(url, location.href).href; } catch(e) { return; }

        if (!detectedUrls.has(url)) {
            detectedUrls.add(url);
            console.log('[Envato Master] Áudio detectado na rede:', url);
        }

        STATE.lastUrl = url;

        let injected = false;
        try {
            const pagePlayer = document.querySelector(SELECTORS.preview);
            if (pagePlayer) {
                injectButton(pagePlayer, 'preview', url);
                injected = true;
            }
        } catch(e) {}

        if (!injected && STATE.activeTarget && document.contains(STATE.activeTarget)) {
            injectButton(STATE.activeTarget, STATE.targetType, url);
        }
    }

    // 4. INICIALIZAÇÃO E LOOP DE VIGILÂNCIA SPA
    function init() {
        injectUI();
        try {
            const obs = new PerformanceObserver((list) => {
                list.getEntries().forEach(entry => handleResource(entry.name));
            });
            obs.observe({ type: 'resource', buffered: true });
        } catch(e) {}
    }

    // Executa imediatamente e garante re-checagem contínua caso o React recrie o DOM
    init();
    setInterval(injectUI, 1000);

})();