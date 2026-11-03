# Envato Audio Downloader Master

Userscript para Tampermonkey, versão **2.1**, destinado a auxiliar a identificação e o download de recursos de áudio disponíveis durante a navegação no Envato Elements.

> **Importante:** o script não garante acesso aos arquivos originais nem concede licença de uso. Utilize-o apenas para conteúdos que você tem direito de baixar e usar, respeitando as condições do Envato Elements.

## Recursos existentes

- Observa URLs de recursos de áudio carregados na página por meio de `PerformanceObserver`.
- Acrescenta um botão **Baixar** em elementos detectados, quando os seletores configurados encontram o player ou card correspondente.
- Permite escolher visualmente os seletores de **card**, **player** e **título** pela engrenagem no canto inferior esquerdo.
- Armazena os seletores escolhidos com `GM_setValue` / `GM_getValue`.
- Exibe mensagens de depuração no console do navegador.

## Instalação

1. Instale a extensão Tampermonkey no navegador.
2. Abra o arquivo [`envato-audio-downloader.user.js`](envato-audio-downloader.user.js) e copie seu conteúdo para um novo script no Tampermonkey (ou importe o arquivo).
3. Ative o script e abra `https://elements.envato.com/`.

Após publicar no GitHub, você também poderá instalar pela versão *raw* do arquivo:

`https://raw.githubusercontent.com/hpuglia/envato-audio-downloader-master/main/envato-audio-downloader.user.js`

> O endereço acima só funcionará depois que os arquivos forem publicados no repositório e a branch principal for `main`.

## Configuração visual

Clique na engrenagem na parte inferior esquerda, posicione o cursor sobre um elemento da página e clique nele. Escolha `1` para card de áudio, `2` para player fixo ou `3` para título. O seletor é salvo no Tampermonkey.

## Observações

- Os seletores padrão podem deixar de funcionar se o site alterar seu HTML.
- A detecção é baseada no nome/URL do recurso e pode não encontrar todo áudio reproduzido pelo site.
- O script utiliza `@connect *` e `GM_download`, que dependem das permissões do gerenciador de scripts.
- Este repositório contém o código original da versão 2.1, sem modificações funcionais.