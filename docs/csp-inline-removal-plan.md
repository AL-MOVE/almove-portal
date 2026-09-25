# Remoção progressiva de JavaScript inline

**Âmbito:** Portal do Cliente, App Coach e CRM Development.  
**Objetivo:** retirar JavaScript inline sem alterar desenho, autenticação, rotas nem fluxos de operação. A consequência final é uma Content Security Policy mais restrita, que reduz o impacto de uma eventual regressão de XSS.

## Ponto de partida

| Superfície | Scripts inline | Volume aproximado | Handlers inline | Estilos inline |
| --- | ---: | ---: | ---: | ---: |
| Portal do Cliente (`index.html`) | 1 | 230 KB | 5 | 17 |
| App Coach (`coach-firebase.html`) | 20 | 307 KB | 195 | 548 |
| Login CRM (`dev-crm.html`) | 1 | 3 KB | 0 | 0 |
| Migração CRM (`dev-migration.html`) | 1 | 6 KB | 0 | 0 |

A política atual usa `script-src 'self' 'unsafe-inline'` e `style-src 'self' 'unsafe-inline'`. O maior esforço não é mover ficheiros: são os handlers gerados dinamicamente no Coach, porque também dependem de `unsafe-inline`.

## Princípios de implementação

- Migrar sem reescrever a lógica de negócio. Os ficheiros externos continuam a ser scripts clássicos e preservam a ordem atual de execução e as funções globais temporariamente necessárias.
- Um passo por deploy Development, com teste de autenticação, carregamento, criação e edição antes do passo seguinte.
- Substituir handlers por delegação de eventos com `data-action` e atributos `data-*`; nunca reconstruir JavaScript dentro de HTML dinâmico.
- Separar CSS para poder endurecer `style-src` numa fase própria.
- Cada fase tem reversão simples por commit. Nenhuma alteração segue para Produção sem validação explícita do utilizador.

## Fase 0: rede de segurança

1. Manter os testes atuais de contratos CRM, sintaxe Coach, PWA e encoding de saídas dinâmicas.
2. Adicionar um verificador que mede scripts, handlers e estilos inline por ficheiro. O valor deve descer em cada fase, nunca subir.
3. Registar a CSP esperada por rota e verificar cabeçalhos no preview Development.

**Aceitação:** a contagem-base fica documentada, os testes passam e o rollback é apenas um `git revert` do commit da fase.

## Fase 1: piloto sem risco no CRM

1. Extrair o CSS e o JavaScript de `dev-crm.html` para `/css/dev-crm.css` e `/js/dev-crm-login.js`.
2. Fazer o mesmo em `dev-migration.html`.
3. Aplicar a estas duas rotas uma CSP estrita própria: `script-src 'self'` e `style-src 'self'`.
4. Confirmar login, recuperação de palavra-passe, sessão existente, migração e retorno ao Coach.

**Porque começa aqui:** estas páginas não têm handlers inline nem estilos inline e possuem poucas dependências. Validam o método inteiro antes de tocar na operação diária do Coach.

## Fase 2: extrair blocos da App Coach sem alterar interações

1. Criar `/js/coach/` e mover os 20 blocos atuais para ficheiros numerados, mantendo a mesma sequência de carregamento.
2. Manter os `<script src>` no fim do documento sem `defer`, para preservar o momento de execução atual.
3. Extrair a folha de estilos principal para `/css/coach.css` sem alterar seletores ou valores.
4. Adicionar teste que confirma que não existem blocos `<script>` com código em `coach-firebase.html`.

**Aceitação:** login Coach, dados de dashboard, clientes, planos, avaliações, check-ins, packs, recibos, sessões PT e logout continuam funcionais. Os handlers inline podem permanecer apenas nesta fase.

## Fase 3: remover handlers inline da App Coach

1. Criar um único delegador em `/js/coach/events.js` para `click`, `change` e `error`.
2. Substituir cada `onclick` e `onchange` por `data-action`, `data-id`, `data-index` e outros valores tipados necessários.
3. Começar pelas áreas de baixo risco: filtros, navegação e listas. Depois migrar clientes, planos, sessões PT, pagamentos e avaliações.
4. Para imagens, trocar `onerror` por um listener externo que aplique a classe de fallback.
5. Nunca colocar texto de cliente em atributos que executem código; IDs e valores seguem o encoding já existente.

**Aceitação:** o contador de handlers chega a zero, as ações por teclado e por toque funcionam e a proteção de encoding continua a passar.

## Fase 4: Portal do Cliente

1. Extrair o script principal de `index.html` para `/js/portal.js` e o CSS para `/css/portal.css`.
2. Substituir os poucos handlers restantes pelo mesmo modelo de `data-action` e delegação.
3. Confirmar login, instalação PWA, treino, agenda, perfil e recuperação offline.

**Aceitação:** zero JavaScript inline e zero handlers inline no Portal.

## Fase 5: endurecimento da CSP

1. Depois de cada página deixar de ter script inline, definir `script-src 'self'` nessa rota.
2. Quando os estilos forem todos externos, definir `style-src 'self'` nessa rota.
3. Enquanto existirem atributos `style`, manter apenas `style-src-attr 'unsafe-inline'` como transição e documentar a respetiva contagem. Esta exceção não autoriza scripts.
4. Remover todas as exceções apenas depois da validação em dispositivos móveis e desktop.

**Política de destino:**

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: https:;
connect-src 'self' https://script.google.com https://script.googleusercontent.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com;
```

Os restantes controlos atuais, incluindo `frame-ancestors 'none'`, `object-src 'none'`, HSTS e `no-store` nas APIs, mantêm-se.

## Critérios antes de Produção

- Testes automatizados completos e `npm audit --omit=dev` sem vulnerabilidades.
- Teste manual com conta de coach e conta de cliente de teste, sem dados reais de clientes.
- Confirmação da instalação e atualização PWA em Android e iOS.
- Inspeção dos cabeçalhos CSP no preview Development.
- Acesso ao CRM, gestão de cliente e todas as ações críticas testados antes e depois da alteração.

## Reversão

Cada fase é um commit isolado. Se uma ação deixar de funcionar, reverter apenas o commit da fase e repor a CSP anterior dessa rota. Não há migração de dados, alteração de permissões nem incompatibilidade de versões para desfazer.
