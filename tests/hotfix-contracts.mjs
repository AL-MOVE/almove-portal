import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, backend, proxy, sw, manifest] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../apps-script/Code.js', import.meta.url), 'utf8'),
  readFile(new URL('../api/almove.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../manifest.json', import.meta.url), 'utf8')
]);

assert.match(html, /chamarApi\("getBootstrapPortal", \{\}\)/, 'O arranque deve usar o bootstrap único');
assert.doesNotMatch(html, /const blocos = \[/, 'O arranque não deve voltar aos seis pedidos separados');
assert.equal((html.match(/<button type="button" class="tab-btn/g) || []).length, 4, 'As quatro tabs devem ser botões');
assert.equal((html.match(/<button type="button" class="tab-btn ativo/g) || []).length, 1, 'A tab ativa deve ser um botão');
assert.match(html, /id="tabInicio" class="tab-conteudo"/, 'O portal deve abrir em Início');
assert.match(html, /id="tabHoje" class="tab-conteudo oculto"/, 'Treinos não deve abrir por defeito');
assert.match(html, /const LINK_PERMANENTE_LEGADO = params\.has\("token"\) \|\| params\.has\("portal"\)/, 'Links permanentes devem ser identificados');
assert.match(html, /Este link antigo já não dá acesso/, 'Links permanentes devem encaminhar para o acesso por email');
assert.doesNotMatch(html, /fn: "criarSessaoPortal"/, 'O cliente não deve trocar links permanentes por sessões');
assert.equal((html.match(/<button type="button" class="opcao"/g) || []).length, 40, 'Todas as escalas devem usar botões');
assert.match(html, /setAttribute\("role", "radiogroup"\)/, 'As escalas devem expor radiogroup');
assert.match(html, /setAttribute\("aria-checked", "true"\)/, 'A opção escolhida deve expor aria-checked');
assert.doesNotMatch(html, /Documentos e faturação/, 'O bloco de exemplo não deve ser publicado');
assert.doesNotMatch(html, /aria-label="Sincronizado"/, 'Elementos decorativos não devem ter aria-label inválido');
assert.match(html, /return diasPassosSemana\(\)\.reduce/, 'O total semanal deve ser a soma dos dias mostrados');
assert.match(html, /id="perfilDadosPessoais"/, 'O perfil deve ter a subpasta Os meus dados');
assert.match(html, /id="perfilPlano"/, 'O plano deve abrir numa subpasta própria');
assert.match(html, /guardarPedidoAtualizacaoDadosPortal/, 'Alterações de dados devem ser enviadas para aprovação');
assert.doesNotMatch(html, /data-abrir-perfil="avatar"/, 'O avatar não deve ser apresentado ao cliente');
assert.match(html, /id="perfilMapa"/, 'O Mapa AL MOVE deve estar disponível no perfil');
assert.match(html, /id="perfilPassaporte"/, 'O Passaporte Técnico deve estar disponível no perfil');
assert.match(html, /<option value="rir" selected>RIR<\/option>/, 'RIR deve ser o método de intensidade predefinido');
assert.match(html, /localStorage\.getItem\("ALMOVE_SESSAO_PORTAL"\)/, 'A sessão curta deve sobreviver ao fecho da PWA');
assert.match(html, /bootstrapPortalPromise = SESSAO_PRONTA\.then/, 'O bootstrap deve aguardar pela autenticação antes de mostrar sincronização');
assert.match(html, /VERSAO_CLIENTE_PORTAL = "56"/, 'O cliente deve identificar a versão da atualização');
assert.doesNotMatch(html, /\}, 350\);/, 'A atualização não deve forçar reload antes de o novo service worker ativar');

assert.match(backend, /doms < 0 \|\| doms > 4/, 'O backend deve aceitar DOMS de 0 a 4');
assert.match(backend, /diasSemana\.push\(/, 'O backend deve devolver os sete dias dos passos');
assert.match(backend, /correspondencias\.length > 1/, 'Emails duplicados devem ser bloqueados');
assert.match(backend, /dataTexto > dataISOHojePortal_\(\)/, 'Peso futuro deve ser recusado');
assert.match(backend, /PEDIDOS_ATUALIZACAO_DADOS/, 'Pedidos de dados devem ficar pendentes no CRM');
assert.match(backend, /origemSessoes = 'pack-ativo'/, 'O saldo de sessões deve preferir o pack ativo');
assert.match(backend, /seriesRegistadas: linhas\.length/, 'O servidor deve confirmar quantas séries gravou');
assert.match(backend, /TREINO_NAO_PRESCRITO/, 'O servidor deve rejeitar treinos que não foram prescritos');
assert.match(backend, /DB_EVENTOS_PORTAL/, 'A atividade deve usar um registo canónico de eventos');
assert.match(backend, /DB_PASSAPORTE_TECNICO/, 'O Passaporte Técnico deve ter armazenamento próprio');
assert.match(backend, /FOTO_INVALIDA_OU_DEMASIADO_GRANDE/, 'Fotografias de perfil devem ser validadas no servidor');
assert.match(backend, /const candidatosEmail = \[18, iEmail\]/, 'O email usado pelo login deve ter prioridade no perfil');
assert.doesNotMatch(backend, /criarSessaoPortal:/, 'O backend não deve expor a criação de sessões por token permanente');
assert.match(backend, /Um token permanente copiado de uma URL deixou de dar acesso/, 'Apenas sessões temporárias devem autenticar pedidos');
assert.match(proxy, /json && json\.ok === false/, 'O proxy deve transformar erros da aplicação em erros HTTP');
assert.doesNotMatch(proxy, /'criarSessaoPortal'/, 'O proxy não deve encaminhar a criação de sessões por token permanente');
assert.match(html, /mostrarFalhaBootstrap/, 'A lentidão do serviço não deve ser apresentada como falta de internet');
assert.match(html, /icone = String\(proximo\.tipo/, 'O próximo compromisso deve escolher o ícone correto');
assert.match(html, /botao\.disabled = true/, 'O envio de código deve impedir pedidos repetidos');
assert.match(proxy, /controlador\.abort\(\), 27000/, 'O proxy deve tolerar a latência normal do Apps Script');
assert.match(proxy, /guardarPedidoAtualizacaoDadosPortal/, 'O proxy deve permitir pedidos de alteração de dados');
assert.match(sw, /almove-portal-v56/, 'A cache PWA deve avançar para v56');
assert.doesNotMatch(sw, /\/js\/avatar-studio\.js/, 'O avatar removido não deve ocupar a cache offline');
assert.match(sw, /\/js\/activity-heatmap\.js/, 'O Mapa AL MOVE deve estar disponível offline');
const etapaInstalacao = sw.split("self.addEventListener('activate'")[0];
assert.doesNotMatch(etapaInstalacao, /skipWaiting/, 'A atualização não deve ativar automaticamente durante a instalação');
assert.match(sw, /\/al-move-mark\.png/, 'O service worker deve usar o ícone realmente entregue');
const manifesto = JSON.parse(manifest);
assert.equal(manifesto.display, 'standalone', 'O manifest deve abrir a PWA em modo app');
assert.equal(manifesto.icons[0].src, '/al-move-mark.png', 'O manifest deve usar o ícone entregue');

console.log('Contratos do portal v56 validados.');
