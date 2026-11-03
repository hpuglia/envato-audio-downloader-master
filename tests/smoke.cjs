'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'envato-audio-downloader.user.js'), 'utf8');
const probe = source.replace(
    "    if (document.readyState === 'loading')",
    "    globalThis.__testHooks = { isAudioUrl, absoluteAudioUrl, isAudioCollection, isItemPage, cleanName, filename };\n    if (document.readyState === 'loading')"
);
const location = { href: 'https://elements.envato.com/royalty-free-music/epic', pathname: '/royalty-free-music/epic' };
const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; } };
const sandbox = { location, document, URL, console, GM_getValue() {}, GM_setValue() {}, GM_download() {}, setTimeout, clearTimeout };
vm.runInNewContext(probe, sandbox, { filename: 'envato-audio-downloader.user.js' });
const h = sandbox.__testHooks;

test('reconhece a rota atual da categoria de música', () => assert.equal(h.isAudioCollection(), true));
test('reconhece páginas individuais de músicas', () => {
    location.pathname = '/brazilian-YQNG7N7';
    assert.equal(h.isItemPage(), true);
});
test('aceita URLs HTTP de prévia com query string', () => {
    assert.equal(h.isAudioUrl('https://cdn.example.test/file.MP3?expires=123'), true);
});
test('descarta blob, vídeo e fontes sem extensão', () => {
    for (const url of ['blob:https://elements.envato.com/uuid', 'https://cdn.example.test/file.mp4', 'https://cdn.example.test/stream']) {
        assert.equal(h.isAudioUrl(url), false);
    }
});
test('normaliza nomes de arquivos para Windows', () => {
    assert.equal(h.cleanName('   Música: teste?  / 2026   '), 'Música- teste- - 2026');
});
test('gera nome com a extensão efetiva da URL', () => {
    const target = { textContent: 'Faixa teste\nPlay', querySelector() { return null; } };
    assert.equal(h.filename(target, 'https://cdn.example.test/audio.m4a?sig=1'), 'Faixa teste.m4a');
});

test('a seleção visual salva o seletor escolhido sem janela prompt', () => {
    const saved = {};
    const attributes = {};
    const makeNode = (id = '') => ({
        id, isConnected: true, classList: { toggle() {}, add() {}, remove() {} },
        setAttribute(name, value) { attributes[name] = value; },
        getAttribute() { return null; },
        addEventListener() {}, removeEventListener() {}, appendChild() {},
        dataset: {}, textContent: '', hidden: false
    });
    const gear = makeNode('envato-master-gear');
    const panel = makeNode('envato-master-panel');
    const nodes = { 'envato-master-gear': gear, 'envato-master-panel': panel };
    class FakeElement { constructor(id) { this.id = id; } closest() { return null; } }
    const doc = {
        readyState: 'loading', body: { appendChild(n) { nodes[n.id] = n; } },
        getElementById(id) { return nodes[id] || null; },
        createElement() { return makeNode(); },
        addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; }
    };
    const instrumented = source.replace(
        "    if (document.readyState === 'loading')",
        "    globalThis.__ui = { state, setPanelOpen, handlePanelAction, onConfigSelect, toggleConfiguration };\n    if (document.readyState === 'loading')"
    );
    const sb = { location, document: doc, URL, Element: FakeElement, console, setTimeout, clearTimeout,
        GM_setValue(key, value) { saved[key] = value; }, GM_getValue: () => undefined };
    vm.runInNewContext(instrumented, sb);
    const ui = sb.__ui;
    ui.setPanelOpen(true);
    assert.equal(panel.hidden, false);
    const actionEvent = name => ({ target: { closest: () => ({ dataset: { action: name } }) }, preventDefault() {}, stopPropagation() {} });
    ui.handlePanelAction(actionEvent('pick-title'));
    assert.equal(ui.state.configuration, true);
    assert.equal(panel.hidden, true);
    assert.equal(ui.state.pickerKey, 'title');
    ui.onConfigSelect({ target: new FakeElement('track-title'), preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    assert.equal(saved.envato_sel_title, '#track-title');
    assert.equal(ui.state.configuration, false);
    ui.handlePanelAction(actionEvent('reset'));
    assert.equal(saved.envato_sel_title, '[data-testid="item-title"]');
});