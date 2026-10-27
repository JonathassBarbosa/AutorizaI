# GAV Autorizações — Vendas fora da regra

Web app (PWA instalável no celular) para pedir, aprovar e rastrear exceções comerciais da GAV Resorts.

- **Front-end:** pasta `app/` → hospedado no **GitHub Pages**
- **Back-end:** `apps-script/Code.gs` → **Google Apps Script** ligado a uma **planilha Google** (o banco de dados)
- **Push:** **OneSignal** (gratuito), opcional
- **Identidade visual:** manual "GAV MARCAS". Logotipo e rosa dos ventos em vetor (`app/js/marcas-dados.js`), Azul GAV `#0B306B`, off-white `#FEF9E0`, areia `#BF8F64`, Fraunces + Motiva Sans (no site, a Figtree substitui a Motiva Sans, que não é gratuita na web)
- **Animações:** logotipo desenhado na abertura do app; rosa dos ventos abrindo como leque ao entrar e ao processar solicitações

```
gav-autorizacoes-app/
├── app/                 ← o que vai para o GitHub (o site)
├── apps-script/Code.gs  ← o que vai para o Apps Script (a API)
└── dev/                 ← servidor e testes locais (não sobe para lugar nenhum)
```

## Como funciona

| Perfil | O que faz |
|---|---|
| **Master** | Acesso total. Cadastra diretorias, regionais, salas, usuários e tipos de exceção. Vê o **Monitor**. |
| **Superintendente** | Responde pela(s) diretoria(s). Aprova exceções de todas as salas dela. |
| **Regional** | Responde pela(s) regional(is). Aprova exceções das salas dela. |
| **Gerente** | Vinculado a uma sala. Aprova as exceções da sala na alçada de gerente. |
| **Assistente de contratos** | Vinculado a uma sala. **Confere a autorização pelo código** antes de finalizar o contrato e registra o desfecho (venda finalizada ou sem venda, com justificativa). |
| **Consultor** | Vinculado a uma sala. Cria as solicitações e acompanha as respostas. |

**Alçadas:** cada tipo de exceção define o nível mínimo (gerente, regional ou superintendente). Níveis acima também podem aprovar. Se o cargo estiver vago na sala, o pedido sobe automaticamente. Se a sala passar do **limite % de exceções do mês**, as novas exceções sobem um nível.

**% de exceções da sala** = exceções aprovadas (que não terminaram "sem venda") ÷ total de vendas do mês. O total de vendas é lançado no painel inicial (botão **Vendas** de cada sala).

---

## Instalação (uns 30 minutos)

### 1. Planilha

1. Entre na conta Google que vai ser dona do sistema. Recomendo uma conta criada só para isso, por exemplo `sistema.autorizacoes.gav@gmail.com`.
2. Crie uma planilha em branco chamada **GAV Autorizações**.

### 2. Apps Script (a API)

1. Na planilha: **Extensões → Apps Script**.
2. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de `apps-script/Code.gs`.
3. No topo do arquivo, em `CONFIG`, troque:
   - `MASTER_EMAIL` → o **seu** e-mail (vai ser o login do master);
   - `APP_URL` → o endereço do GitHub Pages (passo 4). Dá para ajustar depois.
4. ⚙️ **Configurações do projeto** (engrenagem à esquerda) → **Fuso horário**: `(GMT-03:00) Horário de Brasília`.
5. Volte ao editor, escolha a função **`setup`** na barra de cima e clique em **Executar**.
   - O Google vai pedir autorização: **Revisar permissões → sua conta → Avançado → Acessar (não seguro) → Permitir**. O aviso aparece porque o script é seu e não foi publicado na loja do Google.
6. Abra o **Registro de execução** (embaixo): ali aparece a **senha provisória do master**. Anote.
   - A planilha agora tem as abas `Usuarios`, `Salas`, `Solicitacoes`, `Logs` e outras. **Não renomeie nem reordene as colunas.**

### 3. Publicar a API

1. **Implantar → Nova implantação** → engrenagem → **App da Web**.
2. **Executar como:** *Eu*. **Quem pode acessar:** *Qualquer pessoa*.
   > Isso não deixa a planilha pública. Só permite que o site converse com o script, e todo pedido precisa de login válido.
3. **Implantar** → copie a **URL do app da Web** (termina em `/exec`).
4. Abra `app/config.js` e cole a URL em `API_URL`.

> ⚠️ **Sempre que alterar o Code.gs:** vá em **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar**. Sem isso, a versão antiga continua no ar. A URL não muda.

### 4. GitHub Pages (o site)

1. Crie um repositório **público** no GitHub (ex.: `gav-autorizacoes`).
2. **Add file → Upload files** e envie **o conteúdo da pasta `app/`**: `index.html`, `config.js`, `sw.js`, `manifest.webmanifest` e as pastas `css`, `js` e `img`. O `index.html` precisa ficar na raiz do repositório.
3. **Settings → Pages → Branch: `main` / `(root)` → Save**.
4. Em 1 ou 2 minutos o site sai em `https://SEU-USUARIO.github.io/gav-autorizacoes/`.
5. Volte ao `CONFIG.APP_URL` do Code.gs, coloque esse endereço (com `/` no final) e publique uma **nova versão** (passo 3).

> O repositório público só contém o site. Senhas, CPFs e dados ficam na planilha, que é privada.

### 5. Primeiro acesso

1. Abra o site, entre com `MASTER_EMAIL` e a senha provisória, e crie sua senha.
2. **Usuários:** cadastre primeiro os superintendentes e os regionais.
3. **Estrutura:** crie a diretoria (escolha o superintendente), as regionais (escolha o regional) e as salas (defina o limite %).
4. **Usuários:** cadastre gerentes, assistentes de contratos e consultores, cada um com sua sala.
   - A cada usuário criado aparece a **senha provisória** e o botão **Copiar mensagem**, que já vem com endereço, e-mail e senha para enviar pelo WhatsApp.
5. **Tipos de exceção:** revise os 5 tipos padrão, ajuste a alçada e os campos que o consultor precisa preencher.

### 6. Push no celular (OneSignal, opcional mas recomendado)

Sem o OneSignal, os avisos aparecem só no sino dentro do app. Com ele, chegam como notificação no celular mesmo com o app fechado.

1. Crie uma conta gratuita em [onesignal.com](https://onesignal.com) → **New App** → plataforma **Web**.
2. **Typical Site** → **Site URL:** o endereço do GitHub Pages. Ícone: `app/img/icon-192.png`.
3. Na tela de configuração avançada:
   - **Service worker path:** `sw.js` (o próprio app já inclui o worker do OneSignal);
   - **Service worker scope:** o caminho do repositório, ex.: `/gav-autorizacoes/`.
4. Em **Settings → Keys & IDs**, copie o **App ID** e crie uma **REST API Key**.
5. No Apps Script: ⚙️ **Configurações do projeto → Propriedades do script → Adicionar**:
   - `ONESIGNAL_APP_ID` = App ID
   - `ONESIGNAL_REST_KEY` = REST API Key
6. Cada pessoa ativa o push em **Meu perfil → Notificações push → Ativar**.
   - **iPhone:** o push só funciona com o app instalado. No Safari: **Compartilhar → Adicionar à Tela de Início**, depois abrir pelo ícone (iOS 16.4 ou mais recente).
   - **Android:** no Chrome, menu **⋮ → Instalar app**.

---

## Monitor (perfil master)

Em **Monitor**, atualizado a cada 4 segundos:

- **Operações, erros, tempo médio da API e usuários ativos** dos últimos 15 minutos.
- **Último erro em destaque**, com o local exato. Exemplos:
  - `Code.gs › responderSolicitacao_() › linha 512` (erro no servidor)
  - `detalhe.js › montar() › linha 88, coluna 12` (erro no navegador de alguém)
- **Eventos ao vivo:** clique em qualquer linha para ver usuário, ação, dados enviados (senhas mascaradas), stack trace e navegador.
- **Saúde:** versão da API, status do push e quantidade de linhas em cada aba.
- **Testar erro:** gera um erro proposital para você ver o monitor funcionando.

Erros "esperados", como senha errada ou campo obrigatório vazio, aparecem como **WARN** (amarelo). Falhas de código aparecem como **ERROR** (vermelho).

## Manutenção automática

O `setup` cria uma rotina diária (3h da manhã) que:

- mantém só as últimas 5.000 linhas da aba `Logs`;
- remove sessões vencidas;
- faz **backup** da planilha na pasta **"Backups - GAV Autorizações"** do Drive, mantendo as 14 cópias mais recentes.

Se esquecer a senha do master: no Apps Script, rode a função **`redefinirSenhaMaster`** e veja a nova senha provisória no registro de execução.

## Segurança

- As senhas são guardadas com hash e salt, nunca em texto.
- O login gera um token de sessão de 12 horas. Usuário desativado perde o acesso na hora.
- Depois de 5 senhas erradas, o e-mail fica bloqueado por 15 minutos.
- Permissões e alçadas são validadas **no servidor**: mexer no navegador não dá acesso a nada.
- Todo texto exibido no app é escapado (proteção contra XSS).
- A aba `Auditoria` registra quem criou, aprovou, negou, cancelou ou finalizou cada solicitação.
- **LGPD:** a planilha tem CPF de clientes. Compartilhe-a só com quem administra o sistema.

## Testar no computador (opcional)

Com o Node.js instalado:

```bash
node dev/teste-api.js
```

Roda 11 cenários automáticos sobre o `Code.gs` real: permissões, alçadas, limite %, desfecho e monitor.

```bash
node dev/server.js
```

Abre o sistema completo em `http://localhost:8080`, com uma planilha simulada em `dev/dados-dev.json`. A senha provisória do master (`master@gav.dev`) aparece no terminal. Para dados de demonstração: `node dev/popular-dev.js <senha-do-master>`. Para recomeçar do zero: `node dev/server.js --reset`.

## Limites a conhecer

- Cada ação leva de 1 a 2 segundos (é o tempo do Apps Script). O app mostra carregamento.
- O Apps Script, numa conta Gmail, suporta folgadamente algumas centenas de usuários. Se um dia ficar pequeno, basta trocar o back-end (por exemplo, Supabase) sem refazer o front: ele só conversa com a URL da API.
