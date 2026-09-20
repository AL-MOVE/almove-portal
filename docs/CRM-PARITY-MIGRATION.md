# Migração CRM — paridade antes de melhorias

## Fonte de verdade atual

Até ao corte final, o CRM atual continua operacional e é a fonte de verdade:

- Interface: `apps-script/Index.html`
- Backend: `apps-script/Code.js`
- Dados: Google Sheets e Drive do projeto AL MOVE

Não se apagam folhas, contratos, clientes ou automações durante esta fase.

## Interface que será preservada

O futuro `coach.almove.pt` replica a estrutura atual antes de receber alterações visuais:

1. Dashboard
2. Agenda
3. Clientes ativos
4. Clientes inativos: pausados e cancelados
5. Renovar mês
6. Recibos
7. Pagamentos
8. Pacotes especiais
9. Check-ins
10. Avaliações físicas
11. Definições

Também preserva a ficha de cliente, sessões PT, planos e treinos, notas, histórico, contratos, exportação CSV, notificações e perfil do professor.

## Dados a espelhar

O documento `clients/{clientId}` mantém o ID estável existente e os campos usados hoje: nome, estado, contacto, NIF, serviço atual, preço personalizado, dia e método de pagamento e notas. Os packs, sessões, planos, treinos, avaliações, check-ins, pedidos e histórico passam para coleções próprias, sempre ligados ao mesmo `clientId`.

O NIF, notas, contratos e dados de saúde nunca vão para o browser sem uma decisão explícita do servidor.

## Sequência segura

1. Criar o modelo Firestore e as regras no ambiente Development.
2. Importar uma cópia de teste, sem escrever de volta nas folhas.
3. Comparar contagens, sessões, pagamentos e totais do dashboard com o CRM atual.
4. Migrar cada secção como leitura, mantendo o visual e ações existentes.
5. Ligar escrita com `requestId`, auditoria e repetição segura.
6. Fazer um período de dupla validação antes de qualquer corte.
7. Só após confirmação, apontar `coach.almove.pt` à base nova.

Nenhuma melhoria de interface entra antes de a função correspondente ter paridade. Melhorias futuras serão deliberadas: filtros, pesquisa, velocidade e permissões, sem remover campos ou passos que já usas.
