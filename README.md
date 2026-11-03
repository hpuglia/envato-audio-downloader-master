# Envato Audio Downloader Master

Userscript para Tampermonkey que ajuda a identificar e salvar **prévias de áudio** acessíveis no Envato Elements. Versão **2.3.0**.

> **Aviso:** baixar uma prévia não substitui a licença. O Envato oferece o botão oficial **Download preview** nas páginas individuais; prefira esse botão quando disponível. Arquivos originais, assinaturas e licenças não são desbloqueados por este script.

## Recursos

- Identifica URLs diretas de áudio carregadas pelo navegador (`mp3`, `m4a`, `wav`, `ogg`, `aac`, `flac` e `opus`).
- Associa o recurso detectado ao **card ou player recentemente utilizado**, evitando aplicar a última URL observada indiscriminadamente a todos os áudios.
- Evita criar um botão duplicado quando a página de um item já oferece o botão nativo **Download preview**.
- Inclui um **painel compacto de configuração**, com indicador de estado, seleção visual de card/player/título e botão para restaurar seletores.
- Recria a engrenagem quando o React modifica a página, sem executar um `setInterval` a cada segundo.
- Trata falhas de download e gera nomes de arquivos legíveis.
- Inclui endereços `@downloadURL` e `@updateURL` para atualizações automáticas do Tampermonkey pelo GitHub Raw.

## Instalação

1. Instale a extensão [Tampermonkey](https://www.tampermonkey.net/) no navegador.
2. [Abra o userscript no GitHub Raw](https://raw.githubusercontent.com/hpuglia/envato-audio-downloader-master/main/envato-audio-downloader.user.js) e instale-o usando o Tampermonkey.
3. Abra a [categoria de músicas do Envato Elements](https://elements.envato.com/royalty-free-music).

## Como usar

Em páginas com cards de áudio, reproduza uma prévia. Se o navegador expuser uma URL de áudio com extensão reconhecida, surgirá um botão **↓ Prévia** associado ao card. Ao clicar nele, o Tampermonkey solicita o local de salvamento.

Em páginas individuais, use preferencialmente o botão **Download preview** disponibilizado pelo próprio Envato.

### Configuração visual

Clique na engrenagem no canto inferior esquerdo para abrir o painel. Escolha **Card de áudio**, **Player individual** ou **Título da faixa**, depois clique no elemento correspondente na página. Para cancelar, pressione **Esc** ou clique novamente na engrenagem.

O painel informa se uma prévia foi detectada ou se um download foi concluído. Use **Restaurar seletores padrão** caso queira desfazer as configurações personalizadas. As escolhas ficam guardadas no armazenamento do Tampermonkey.

## Limitações e diagnósticos

- **Não foi possível verificar os atributos internos do player do Envato em execução**; os seletores padrão são tentativas compatíveis com a versão anterior, não seletores confirmados na estrutura atual.
- URLs baseadas em `blob:`, streaming segmentado ou fontes sem extensão de áudio não são baixadas pelo mecanismo alternativo.
- A reprodução de áudio pode ocorrer sem um recurso novo (por exemplo, devido ao cache), e a interface pode ser diferente em páginas de resultados e páginas individuais.
- Para depuração, abra **F12 → Console** e filtre por `[Envato Master]`.
- A diretiva `@connect *` permite que o Tampermonkey solicite downloads de CDNs variáveis. O script não faz buscas para descobrir ou desbloquear recursos privados.

## Atualizações

O Tampermonkey verifica o campo `@updateURL` do arquivo publicado na branch `main`. Você também pode abrir o link Raw e instalar a nova versão manualmente.

## Histórico

- **2.3.0** — novo painel visual e responsivo, sem janela de prompt, status de detecção/download, seletores com cancelamento por Esc, restauração de padrões, melhorias de acessibilidade e botões de prévia estilizados. A captura/download de áudio da 2.2.0 foi preservada.
- **2.2.0** — associação por card/player, prioridade para botão oficial de prévia, observação de DOM sem loop fixo, mensagens de erro, configuração e atualização automática.
- **2.1** — detecção via `PerformanceObserver`, download com `GM_download` e seleção visual.