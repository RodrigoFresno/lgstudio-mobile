# lgStudio Mobile — versão web instalável

Esta pasta contém a versão para navegador do lgStudio, preparada para publicação no **GitHub Pages** e uso no iPhone/iPad e Android. Não precisa de Electron, instalador Windows ou servidor próprio.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (público ou privado conforme seu plano/configuração).
2. Envie **todo o conteúdo desta pasta** para a raiz do repositório. O arquivo `package.json` deve ficar na raiz, não dentro de uma subpasta.
3. Na página do repositório, abra **Settings → Pages**.
4. Em **Build and deployment → Source**, selecione **GitHub Actions**.
5. Abra a aba **Actions** e aguarde o workflow “Publicar lgStudio no GitHub Pages” terminar com sucesso.
6. O endereço aparecerá em **Settings → Pages**. Abra esse link no Safari do iPhone.

A cada novo `push` na branch `main`, o GitHub recompila e publica automaticamente. Se o repositório usar outra branch, ajuste `branches: [main]` em `.github/workflows/deploy.yml`.

## Instalar na tela inicial do iPhone

1. Abra o endereço publicado no **Safari** (é o caminho mais confiável para instalar PWA no iPhone).
2. Toque em **Compartilhar**.
3. Escolha **Adicionar à Tela de Início**.
4. Confirme em **Adicionar**. Abra pelo novo ícone: o app inicia em modo independente, sem a barra normal do navegador.

No Android/Chrome, use o menu ⋮ → **Instalar app** ou **Adicionar à tela inicial**.

## Executar e compilar localmente

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Para validar a compilação antes de enviar:

```bash
npm run build
```

O resultado da compilação fica na pasta `dist/` (gerada automaticamente e não precisa ser enviada ao GitHub).

## Sobre a versão mobile

- Interface adaptada para telas estreitas e controles maiores para toque.
- Painel principal em gaveta inferior rolável; controles avançados ficam acessíveis no painel superior.
- Seletor de imagem usa o seletor nativo do iOS/Android, permitindo escolher fotos/arquivos da biblioteca.
- Exportação PNG mantém as opções de resolução disponíveis. No iPhone, o Safari pode abrir a imagem ou mostrar a folha de compartilhamento em vez de baixar diretamente; use **Compartilhar → Salvar em Fotos/Arquivos**.
- Manifesto PWA e cache de recursos para permitir reabrir a interface após a primeira visita online. A renderização WebGL/WebGPU depende do suporte do navegador e do aparelho; WebGL é a alternativa de compatibilidade.

## Observações importantes

- A publicação exige HTTPS; o GitHub Pages fornece HTTPS.
- O primeiro acesso precisa de internet para carregar o app e baixar os recursos.
- O modo offline não substitui a primeira instalação e nem garante que todos os recursos externos estejam disponíveis sem conexão.
- O GitHub Pages hospeda a aplicação, mas não guarda automaticamente as imagens exportadas: salve cada PNG no aparelho.

## Créditos e licença

O código-base e os shaders mantêm os créditos e termos do projeto original. Consulte `LICENSE`.


## Atualização mobile v2

- O painel inferior pode ser recolhido parcialmente arrastando a alça para baixo e levantado um pouco para cima.
- A prévia foi reposicionada e dimensionada para permanecer visível acima dos controles em telas estreitas.
- Ícones PWA e Apple Touch foram atualizados com o novo botão Liquid Glass.
- O cache offline foi versionado como `lgstudio-mobile-v2` para evitar manter arquivos antigos após a publicação.

Para atualizar o GitHub Pages, envie os arquivos desta pasta para a raiz do repositório, substituindo os anteriores, e aguarde o workflow terminar. No iPhone, feche o app instalado e abra o endereço no Safari uma vez para receber a nova versão; se o ícone antigo continuar, remova o atalho antigo da Tela de Início e adicione-o novamente pelo menu Compartilhar.
