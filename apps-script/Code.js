/**
 * AL MOVE CRM — Backend v2.1 (com auto-correção de sessões)
 * Google Apps Script
 */

/**
 * ================= CHECK-IN PRÉ-SESSÃO (via Portal do Cliente) =================
 * O cliente preenche, sem login, através do mesmo link/QR do Portal:
 * sono, stress, cansaço, refeições e DOMS (1-5, ou 0-4 no caso do DOMS),
 * mais uma nota livre opcional. Guardado na sua própria aba, para nunca
 * se perder mesmo depois de arquivares meses antigos de packs/sessões.
 */

function obterOuCriarSheetCheckins_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_CHECKINS');
  if (!sheet) {
    sheet = ss.insertSheet('DB_CHECKINS');
    sheet.getRange('A1:I1').setValues([['IdCliente', 'DataHora', 'Sono', 'Stress', 'Cansaço', 'Refeições', 'DOMS', 'Nota', 'RequestId']]);
    sheet.getRange('A1:I1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  if (String(sheet.getRange(1, 9).getValue()) !== 'RequestId') sheet.getRange(1, 9).setValue('RequestId');
  return sheet;
}

/**
 * Chamada pelo Portal.html (público, sem login) quando o cliente submete
 * o check-in. Identifica o cliente pelo mesmo token do portal.
 */
function registarCheckin(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const info = obterClientePorTokenPortal_(data.token);
    if (!info) throw new Error('Link inválido.');

    const sheet = obterOuCriarSheetCheckins_();
    const requestId = String(data.eventId || data.idempotencyKey || '').trim();
    const existentes = sheet.getLastRow() >= 2
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues()
      : [];
    if (requestId && existentes.some(row => String(row[8] || '') === requestId)) {
      return { sucesso: true, repetido: true };
    }

    const hoje = new Date();
    const checkinsHoje = existentes.filter(row =>
      String(row[0]) === String(info.idCliente) && row[1] &&
      new Date(row[1]).toDateString() === hoje.toDateString()
    );
    if (checkinsHoje.length >= 2) {
      return { sucesso: false, limiteAtingido: true, erro: 'Já existem dois check-ins hoje.' };
    }

    const escalas = ['sono', 'stress', 'cansaco', 'refeicoes'];
    escalas.forEach(campo => {
      const valor = Number(data[campo]);
      if (!Number.isFinite(valor) || valor < 1 || valor > 5) throw new Error('Valor inválido em ' + campo + '.');
    });
    const doms = Number(data.doms);
    if (!Number.isFinite(doms) || doms < 0 || doms > 4) throw new Error('Valor inválido em doms.');
    sheet.appendRow([
      info.idCliente, new Date(), Number(data.sono) || 0,
      Number(data.stress) || 0, Number(data.cansaco) || 0,
      Number(data.refeicoes) || 0, Number(data.doms) || 0,
      textoSeguroParaFolhaPortal_(data.nota || '', 500), textoSeguroParaFolhaPortal_(requestId, 120)
    ]);
    registarAlertaCheckin_(info, data, requestId);
    const recuperacao = Math.round(((Number(data.sono) + (6 - Number(data.stress)) + Number(data.cansaco) + Number(data.refeicoes) + (5 - doms)) / 5) * 10) / 10;
    registarEventoPortal_(info, {
      eventId: requestId || ('checkin-' + Utilities.getUuid()),
      tipo: 'CHECKIN',
      subtipo: 'BEM_ESTAR',
      titulo: 'Check-in diário',
      metadados: { sono: Number(data.sono), stress: Number(data.stress), energia: Number(data.cansaco), doms: doms, recuperacao: recuperacao }
    });
    return { sucesso: true, tentativasHoje: checkinsHoje.length + 1 };
  } catch (error) {
    Logger.log('Erro registarCheckin: ' + error.toString());
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Devolve os últimos `limite` check-ins de um cliente, mais recente primeiro.
 */
function getCheckinsRecentes_(idCliente, limite) {
  const sheet = obterOuCriarSheetCheckins_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange('A2:H' + lastRow).getValues();
  const doCliente = [];
  data.forEach(row => {
    if (String(row[0]) === String(idCliente) && row[1]) {
      doCliente.push({
        dataHora: new Date(row[1]),
        sono: Number(row[2]) || 0,
        stress: Number(row[3]) || 0,
        cansaco: Number(row[4]) || 0,
        refeicoes: Number(row[5]) || 0,
        doms: Number(row[6]) || 0,
        nota: String(row[7] || '')
      });
    }
  });
  doCliente.sort((a, b) => b.dataHora - a.dataHora);
  return doCliente.slice(0, limite || 5);
}

/**
 * Verifica se já existe um check-in de hoje para o cliente (para o Portal
 * decidir se mostra o formulário ou o resumo do que já foi preenchido).
 */
/**
 * Últimos check-ins de um cliente, formatados para o ecrã "Início" do
 * Portal (lista curta, mais recente primeiro).
 */
function getUltimosCheckinsPortal_(idCliente, limite) {
  const recentes = getCheckinsRecentes_(idCliente, limite || 5);
  return recentes.map(c => ({
    data: formatarDataPorExtenso_(c.dataHora),
    sono: c.sono, stress: c.stress, cansaco: c.cansaco, refeicoes: c.refeicoes, doms: c.doms
  }));
}

function getCheckinDeHoje_(idCliente) {
  const recentes = getCheckinsRecentes_(idCliente, 1);
  if (recentes.length === 0) return null;
  const ultimo = recentes[0];
  const hoje = new Date();
  const mesmoDia = ultimo.dataHora.getFullYear() === hoje.getFullYear() &&
    ultimo.dataHora.getMonth() === hoje.getMonth() &&
    ultimo.dataHora.getDate() === hoje.getDate();
  return mesmoDia ? ultimo : null;
}

/**
 * ================= TESTE DE PRONTIDÃO (via Portal do Cliente) =================
 * O teste acompanha o tempo de reação pessoal ao longo do tempo. Não é um
 * diagnóstico clínico nem altera cargas automaticamente.
 */
function obterOuCriarSheetTestesProntidao_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_TESTES_PRONTIDAO');
  if (!sheet) {
    sheet = ss.insertSheet('DB_TESTES_PRONTIDAO');
    sheet.getRange('A1:J1').setValues([[
      'IdCliente', 'DataHora', 'MedianaMs', 'TentativasValidas', 'TemposMs',
      'Dispositivo', 'EventId', 'ReferenciaMs', 'DesvioPercentual', 'Estado'
    ]]);
    sheet.getRange('A1:J1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function medianaNumeros_(numeros) {
  const ordenados = numeros.slice().sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2
    ? ordenados[meio]
    : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

function getTestesProntidaoRecentes_(idCliente, limite) {
  const sheet = obterOuCriarSheetTestesProntidao_();
  if (sheet.getLastRow() < 2) return [];
  const testes = sheet.getRange('A2:J' + sheet.getLastRow()).getValues()
    .filter(row => String(row[0]) === String(idCliente) && row[1])
    .map(row => ({
      dataHora: new Date(row[1]),
      medianaMs: Math.round(Number(row[2]) || 0),
      tentativas: Math.round(Number(row[3]) || 0),
      referenciaMs: Math.round(Number(row[7]) || 0),
      desvioPercentual: Math.round(Number(row[8]) || 0),
      estado: String(row[9] || 'a-criar-referencia'),
      eventId: String(row[6] || '')
    }));
  testes.sort((a, b) => b.dataHora - a.dataHora);
  return testes.slice(0, limite || 10);
}

function getTesteProntidaoHoje_(idCliente) {
  const testes = getTestesProntidaoRecentes_(idCliente, 1);
  if (!testes.length) return null;
  const teste = testes[0];
  const hoje = new Date();
  const mesmoDia = teste.dataHora.getFullYear() === hoje.getFullYear() &&
    teste.dataHora.getMonth() === hoje.getMonth() &&
    teste.dataHora.getDate() === hoje.getDate();
  return mesmoDia ? teste : null;
}

function registarTesteProntidao(data) {
  try {
    const info = obterClientePorTokenPortal_(data.token);
    if (!info) throw new Error('Link inválido.');

    const tempos = (Array.isArray(data.temposMs) ? data.temposMs : [])
      .map(valor => Math.round(Number(valor) || 0))
      .filter(valor => valor >= 120 && valor <= 1500)
      .slice(0, 5);
    if (tempos.length < 3) throw new Error('São necessárias pelo menos três tentativas válidas.');

    const sheet = obterOuCriarSheetTestesProntidao_();
    const eventId = String(data.eventId || '').trim();
    if (eventId && sheet.getLastRow() >= 2) {
      const existentes = sheet.getRange('A2:J' + sheet.getLastRow()).getValues();
      const repetido = existentes.find(row => String(row[0]) === String(info.idCliente) && String(row[6] || '') === eventId);
      if (repetido) {
        return {
          medianaMs: Math.round(Number(repetido[2]) || 0),
          tentativas: Math.round(Number(repetido[3]) || 0),
          referenciaMs: Math.round(Number(repetido[7]) || 0),
          desvioPercentual: Math.round(Number(repetido[8]) || 0),
          estado: String(repetido[9] || 'a-criar-referencia'),
          sincronizado: true
        };
      }
    }

    const medianaMs = medianaNumeros_(tempos);
    const historico = getTestesProntidaoRecentes_(info.idCliente, 10);
    const referencias = historico.map(teste => teste.medianaMs).filter(Boolean);
    const temReferencia = referencias.length >= 8;
    const referenciaMs = temReferencia ? medianaNumeros_(referencias) : 0;
    const desvioPercentual = temReferencia
      ? Math.round(((medianaMs - referenciaMs) / referenciaMs) * 100)
      : 0;
    const estado = !temReferencia
      ? 'a-criar-referencia'
      : (desvioPercentual >= 20 ? 'abaixo-do-habitual' : (desvioPercentual <= -15 ? 'acima-do-habitual' : 'dentro-do-habitual'));

    sheet.appendRow([
      info.idCliente, new Date(), medianaMs, tempos.length, tempos.join(','),
      String(data.dispositivo || '').slice(0, 180), eventId, referenciaMs, desvioPercentual, estado
    ]);

    return { medianaMs, tentativas: tempos.length, referenciaMs, desvioPercentual, estado, sincronizado: true };
  } catch (error) {
    Logger.log('Erro registarTesteProntidao: ' + error.toString());
    throw error;
  }
}

/**
 * ================= PASSOS / HÁBITOS (via Portal do Cliente) =================
 * Um registo por cliente e por dia. A submissão é persistente no Sheets,
 * para que o cliente não perca o estado ao atualizar a página ou trocar de
 * dispositivo.
 */
function obterOuCriarSheetPassos_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_PASSOS');
  if (!sheet) {
    sheet = ss.insertSheet('DB_PASSOS');
    sheet.getRange('A1:E1').setValues([['IdCliente', 'Data', 'Passos', 'SubmetidoEm', 'AtualizadoEm']]);
    sheet.getRange('A1:E1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function dataISOHojePortal_() {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function dataISOPortal_(data) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(data), tz, 'yyyy-MM-dd');
}

function getResumoPassosPortal_(idCliente) {
  const sheet = obterOuCriarSheetPassos_();
  const lastRow = sheet.getLastRow();
  const porDia = {};
  if (lastRow >= 2) {
    sheet.getRange('A2:E' + lastRow).getValues().forEach(row => {
      if (row[0] && String(row[0]) === String(idCliente) && row[1]) {
        porDia[dataISOPortal_(row[1])] = { passos: Math.max(0, Number(row[2]) || 0), submetido: !!row[3] };
      }
    });
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7)); // segunda-feira
  let passosSemana = 0;
  const diasSemana = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    const dataISO = dataISOPortal_(dia);
    const registo = porDia[dataISO];
    passosSemana += registo ? registo.passos : 0;
    diasSemana.push({ dataISO: dataISO, passos: registo ? registo.passos : 0, submetido: !!(registo && registo.submetido) });
  }
  const hojeISO = dataISOHojePortal_();
  return {
    hojeISO: hojeISO,
    passosHoje: porDia[hojeISO] ? porDia[hojeISO].passos : 0,
    passosHojeSubmetidos: porDia[hojeISO] ? porDia[hojeISO].submetido : false,
    passosSemana: passosSemana,
    diasSemana: diasSemana,
    porDia: porDia
  };
}

function guardarPassosPortal(data) {
  try {
    const info = obterClientePorTokenPortal_(data.token);
    if (!info) throw new Error('Link inválido.');
    if (String(data.dataISO || '') !== dataISOHojePortal_()) throw new Error('Só podes registar os passos do dia de hoje.');
    const passos = Math.max(0, Math.min(100000, Math.round(Number(data.passos) || 0)));
    const sheet = obterOuCriarSheetPassos_();
    const lastRow = sheet.getLastRow();
    const agora = new Date();
    let linhaExistente = 0;
    if (lastRow >= 2) {
      const dados = sheet.getRange('A2:B' + lastRow).getValues();
      for (let i = 0; i < dados.length; i++) {
        if (String(dados[i][0]) === String(info.idCliente) && dados[i][1] && dataISOPortal_(dados[i][1]) === data.dataISO) {
          linhaExistente = i + 2;
          break;
        }
      }
    }
    const dataRegisto = new Date(data.dataISO + 'T12:00:00');
    if (linhaExistente) {
      sheet.getRange(linhaExistente, 2, 1, 4).setValues([[dataRegisto, passos, agora, agora]]);
    } else {
      sheet.appendRow([info.idCliente, dataRegisto, passos, agora, agora]);
    }
    return getResumoPassosPortal_(info.idCliente);
  } catch (error) {
    Logger.log('Erro guardarPassosPortal: ' + error.toString());
    throw error;
  }
}

function getEstadoPortalHoje(token) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('Link inválido.');
  const checkin = getCheckinDeHoje_(info.idCliente);
  return {
    jaFezCheckinHoje: !!checkin,
    checkinHoje: checkin ? {
      sono: checkin.sono,
      stress: checkin.stress,
      cansaco: checkin.cansaco,
      refeicoes: checkin.refeicoes,
      doms: checkin.doms,
      nota: checkin.nota
    } : null,
    passosPortal: getResumoPassosPortal_(info.idCliente),
    testeProntidaoHoje: getTesteProntidaoHoje_(info.idCliente)
  };
}

function calcularRelatorioMensal_(idCliente, inicioMes) {
  const inicio = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 1);
  const fim = new Date(inicioMes.getFullYear(), inicioMes.getMonth() + 1, 1);
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const treinos = {};
  const melhorAntes = {};
  const prs = {};
  let volume = 0;

  const execucoes = obterOuCriarSheetExecucoes_();
  if (execucoes.getLastRow() >= 2) {
    execucoes.getRange('A2:J' + execucoes.getLastRow()).getValues().forEach(row => {
      if (!row[0] || String(row[0]) !== String(idCliente) || !row[3]) return;
      const data = new Date(row[3]);
      const exercicio = String(row[4] || '');
      const carga = Math.max(0, Number(row[7]) || 0);
      const reps = Math.max(0, Number(row[6]) || 0);

      if (data < inicio) {
        if (exercicio && carga > (melhorAntes[exercicio] || 0)) melhorAntes[exercicio] = carga;
        return;
      }
      if (data >= fim) return;

      treinos[formatarDataISO_(data) + '|' + String(row[1] || '') + '|' + String(row[2] || '')] = true;
      volume += carga * reps;
      if (exercicio && carga > (melhorAntes[exercicio] || 0)) {
        prs[exercicio] = { exercicio: exercicio, carga: carga, reps: reps };
        melhorAntes[exercicio] = carga;
      }
    });
  }

  let passosTotal = 0;
  let diasMeta = 0;
  const passosSheet = obterOuCriarSheetPassos_();
  if (passosSheet.getLastRow() >= 2) {
    passosSheet.getRange('A2:C' + passosSheet.getLastRow()).getValues().forEach(row => {
      const data = row[1] ? new Date(row[1]) : null;
      if (String(row[0]) !== String(idCliente) || !data || data < inicio || data >= fim) return;
      const passos = Math.max(0, Number(row[2]) || 0);
      passosTotal += passos;
      if (passos >= 8000) diasMeta++;
    });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessoesSheet = ss.getSheetByName('DB_SESSOES');
  let sessoesPrevistas = 0;
  let sessoesRealizadas = 0;
  if (sessoesSheet && sessoesSheet.getLastRow() >= 2) {
    sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues().forEach(row => {
      const data = row[3] ? new Date(row[3]) : null;
      if (String(row[0]) !== String(idCliente) || !data || data < inicio || data >= fim || String(row[4]) === 'Cancelada') return;
      sessoesPrevistas++;
      if (String(row[4]) === 'Confirmada') sessoesRealizadas++;
    });
  }

  const totalTreinos = Object.keys(treinos).length;
  const objetivosCumpridos = sessoesPrevistas ? sessoesRealizadas : totalTreinos;
  const objetivosPlaneados = sessoesPrevistas || totalTreinos;
  const consistencia = objetivosPlaneados ? Math.min(100, Math.round((objetivosCumpridos / objetivosPlaneados) * 100)) : 0;
  const listaPrs = Object.keys(prs).map(chave => prs[chave]);

  return {
    mes: meses[inicio.getMonth()] + ' ' + inicio.getFullYear(),
    treinos: totalTreinos,
    volume: Math.round(volume),
    passosTotal: passosTotal,
    diasMeta: diasMeta,
    sessoesRealizadas: sessoesRealizadas,
    sessoesPrevistas: sessoesPrevistas,
    objetivosCumpridos: objetivosCumpridos,
    objetivosPlaneados: objetivosPlaneados,
    consistencia: consistencia,
    prs: listaPrs,
    destaque: listaPrs.length ? listaPrs[0] : null
  };
}

/** Relatório do último mês concluído, mostrado no Portal e enviado pelo CRM. */
function getRelatorioMensalPortal_(idCliente) {
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
  const atual = calcularRelatorioMensal_(idCliente, inicioMes);
  const anteriorResumo = calcularRelatorioMensal_(idCliente, anterior);
  atual.evolucaoTreinos = atual.treinos - anteriorResumo.treinos;
  atual.evolucaoVolume = anteriorResumo.volume ? Math.round(((atual.volume - anteriorResumo.volume) / anteriorResumo.volume) * 100) : 0;
  return atual;
}

function obterEmailCliente_(idCliente) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CLIENTES');
  const dados = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i][24]) === String(idCliente)) {
      return { nome: String(dados[i][0] || ''), email: String(dados[i][18] || '').trim() };
    }
  }
  return null;
}

function escaparHtmlRelatorio_(texto) {
  return String(texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function enviarRelatorioMensalPorEmail(data) {
  const cliente = obterEmailCliente_(data.idCliente);
  if (!cliente) throw new Error('Cliente não encontrado.');
  if (!cliente.email) throw new Error('Este cliente não tem email guardado. Adiciona-o em “Editar dados”.');
  const relatorio = getRelatorioMensalPortal_(data.idCliente);
  const destaque = relatorio.destaque ? ('<p style="margin:18px 0 0;color:#cbd5e1"><strong style="color:#2dd4bf">Destaque do mês</strong><br>' + escaparHtmlRelatorio_(relatorio.destaque.exercicio) + ' — ' + relatorio.destaque.carga + ' kg × ' + relatorio.destaque.reps + '</p>') : '';
  const html = '<div style="max-width:560px;margin:0 auto;padding:28px;background:#07121e;color:#fff;font-family:Arial,sans-serif;border-radius:20px">' +
    '<p style="margin:0 0 8px;color:#2dd4bf;font-size:12px;font-weight:700;letter-spacing:1px">AL MOVE · RELATÓRIO MENSAL</p>' +
    '<h1 style="margin:0 0 8px;font-size:28px">' + escaparHtmlRelatorio_(relatorio.mes) + '</h1>' +
    '<p style="margin:0 0 22px;color:#cbd5e1">Olá, ' + escaparHtmlRelatorio_(cliente.nome) + '. Aqui está o teu progresso.</p>' +
    '<div style="padding:20px;border-radius:16px;background:linear-gradient(135deg,#00a99d,#0b5cc2);text-align:center"><div style="font-size:38px;font-weight:800">' + relatorio.consistencia + '%</div><div style="font-size:12px;font-weight:700;letter-spacing:1px">CONSISTÊNCIA</div><p style="margin:8px 0 0">' + relatorio.objetivosCumpridos + ' de ' + relatorio.objetivosPlaneados + ' objetivos cumpridos</p></div>' +
    '<table style="width:100%;margin-top:18px;border-spacing:8px"><tr><td style="padding:16px;background:#101f2c;border-radius:12px"><strong style="font-size:22px">' + relatorio.treinos + '</strong><br><span style="color:#94a3b8;font-size:12px">Treinos</span></td><td style="padding:16px;background:#101f2c;border-radius:12px"><strong style="font-size:22px">' + relatorio.volume.toLocaleString('pt-PT') + ' kg</strong><br><span style="color:#94a3b8;font-size:12px">Volume</span></td></tr><tr><td style="padding:16px;background:#101f2c;border-radius:12px"><strong style="font-size:22px">' + relatorio.passosTotal.toLocaleString('pt-PT') + '</strong><br><span style="color:#94a3b8;font-size:12px">Passos</span></td><td style="padding:16px;background:#101f2c;border-radius:12px"><strong style="font-size:22px">' + relatorio.prs.length + '</strong><br><span style="color:#94a3b8;font-size:12px">PRs</span></td></tr></table>' + destaque + '</div>';
  MailApp.sendEmail({ to: cliente.email, subject: 'O teu relatório mensal AL MOVE — ' + relatorio.mes, htmlBody: html, body: 'O teu relatório mensal está disponível.' });
  return { sucesso: true, email: cliente.email, mes: relatorio.mes };
}

const NOME_SHEET_MODOS_CLIENTE = 'DB_MODOS_CLIENTE';

function obterOuCriarSheetModosCliente_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NOME_SHEET_MODOS_CLIENTE);
  if (!sheet) {
    sheet = ss.insertSheet(NOME_SHEET_MODOS_CLIENTE);
    sheet.getRange('A1:F1').setValues([['IdCliente', 'Modo', 'DataInicio', 'DataFim', 'AtualizadoEm', 'Ativo']]);
    sheet.getRange('A1:F1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function obterModoEspecialCliente_(idCliente) {
  const sheet = obterOuCriarSheetModosCliente_();
  if (sheet.getLastRow() < 2) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const linhas = sheet.getRange('A2:F' + sheet.getLastRow()).getValues();
  for (let i = linhas.length - 1; i >= 0; i--) {
    const row = linhas[i];
    if (String(row[0]) !== String(idCliente) || row[5] !== true) continue;
    const inicio = row[2] ? new Date(row[2]) : null;
    const fim = row[3] ? new Date(row[3]) : null;
    if (!inicio || !fim) continue;
    inicio.setHours(0, 0, 0, 0);
    fim.setHours(23, 59, 59, 999);
    return {
      modo: String(row[1] || ''),
      dataInicio: Utilities.formatDate(inicio, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      dataFim: Utilities.formatDate(fim, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      ativoAgora: hoje >= inicio && hoje <= fim,
      agendado: hoje < inicio
    };
  }
  return null;
}

function guardarModoEspecialCliente(data) {
  const modo = String(data.modo || '');
  if (modo !== 'Férias' && modo !== 'Deload') throw new Error('Modo inválido.');
  const inicio = new Date(String(data.dataInicio || '') + 'T12:00:00');
  const fim = new Date(String(data.dataFim || '') + 'T12:00:00');
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || fim < inicio) throw new Error('Indica um período válido.');
  const sheet = obterOuCriarSheetModosCliente_();
  const linhas = sheet.getLastRow() >= 2 ? sheet.getRange('A2:F' + sheet.getLastRow()).getValues() : [];
  let linha = 0;
  for (let i = 0; i < linhas.length; i++) if (String(linhas[i][0]) === String(data.idCliente) && linhas[i][5] === true) linha = i + 2;
  const valores = [[String(data.idCliente), modo, inicio, fim, new Date(), true]];
  if (linha) sheet.getRange(linha, 1, 1, 6).setValues(valores);
  else sheet.appendRow(valores[0]);
  return { sucesso: true, modoEspecial: obterModoEspecialCliente_(data.idCliente) };
}

function removerModoEspecialCliente(data) {
  const sheet = obterOuCriarSheetModosCliente_();
  if (sheet.getLastRow() >= 2) {
    const linhas = sheet.getRange('A2:F' + sheet.getLastRow()).getValues();
    for (let i = linhas.length - 1; i >= 0; i--) {
      if (String(linhas[i][0]) === String(data.idCliente) && linhas[i][5] === true) sheet.getRange(i + 2, 6).setValue(false);
    }
  }
  return { sucesso: true, modoEspecial: null };
}

/**
 * Usada pela secção "Check-ins" da app — quantos clientes ativos já
 * preencheram hoje, quais faltam, e os valores de quem já preencheu.
 */
function getCheckinsResumoHoje() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
    const clientesAtivos = [];
    clientesData.forEach(row => {
      if (row[0] && row[24] && String(row[1] || 'Ativo') === 'Ativo') clientesAtivos.push({ id: String(row[24]), nome: String(row[0]) });
    });

    // Uma única leitura da folha inteira, indexada pelo ID. A versão antiga
    // relia DB_CHECKINS uma vez por cliente ativo.
    const checkinsSheet = obterOuCriarSheetCheckins_();
    const linhas = checkinsSheet.getLastRow() >= 2 ? checkinsSheet.getRange(2, 1, checkinsSheet.getLastRow() - 1, 8).getValues() : [];
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ultimoPorId = {};
    linhas.forEach(row => {
      if (!row[0] || !row[1]) return;
      const dataHora = new Date(row[1]);
      const dia = new Date(dataHora); dia.setHours(0, 0, 0, 0);
      if (dia.getTime() !== hoje.getTime()) return;
      const id = String(row[0]);
      if (!ultimoPorId[id] || dataHora > ultimoPorId[id].dataHora) {
        ultimoPorId[id] = { dataHora: dataHora, sono: row[2], stress: row[3], cansaco: row[4], refeicoes: row[5], doms: row[6], nota: row[7] };
      }
    });
    const comCheckinRaw = [], semCheckin = [];
    clientesAtivos.forEach(cliente => {
      const checkin = ultimoPorId[cliente.id];
      if (checkin) comCheckinRaw.push(Object.assign({ nome: cliente.nome, idCliente: cliente.id }, checkin));
      else semCheckin.push(cliente.nome);
    });
    comCheckinRaw.sort((a, b) => b.dataHora - a.dataHora);

    const comCheckin = comCheckinRaw.map(c => ({
      nome: c.nome,
      dataHora: formatarDataHoraPorExtenso_(c.dataHora),
      sono: c.sono, stress: c.stress, cansaco: c.cansaco, refeicoes: c.refeicoes, doms: c.doms, nota: c.nota
    }));

    return {
      totalAtivos: clientesAtivos.length,
      totalComCheckin: comCheckin.length,
      comCheckin: comCheckin,
      semCheckin: semCheckin
    };
  } catch (error) {
    Logger.log('Erro getCheckinsResumoHoje: ' + error.toString());
    return { totalAtivos: 0, totalComCheckin: 0, comCheckin: [], semCheckin: [], error: error.toString() };
  }
}

/**
 * Usada pela secção "Check-ins" da app — histórico completo de um
 * cliente, mais recente primeiro.
 */
function getHistoricoCheckinsCliente(idCliente) {
  try {
    const lista = getCheckinsRecentes_(idCliente, 1000);
    return lista.map(c => ({
      dataHora: formatarDataHoraPorExtenso_(c.dataHora),
      sono: c.sono, stress: c.stress, cansaco: c.cansaco, refeicoes: c.refeicoes, doms: c.doms, nota: c.nota
    }));
  } catch (error) {
    Logger.log('Erro getHistoricoCheckinsCliente: ' + error.toString());
    return [];
  }
}

/**
 * ================= PLANO DE TREINO (estruturado, visível no Portal) =================
 * Um plano atual por cliente, exercício a exercício. Sem histórico por
 * pedido do André — sempre que ele atualiza, o plano anterior é substituído
 * por completo. A data da última atualização fica guardada, para se poder
 * sinalizar quando se aproximam as 8 semanas de vida útil do plano.
 */

/**
 * ================= PLANOS DE TREINO NOMEADOS (biblioteca + página dedicada) =================
 * Substitui por completo o antigo "plano único". Um cliente pode ter vários
 * planos nomeados (PUSH, PULL, LEGS...), cada um com a sua lista de
 * exercícios (série, reps min/max, RIR opcional), escolhidos a partir da
 * biblioteca DB_EXERCICIOS. Página própria na app, fora da ficha do cliente.
 */

function obterOuCriarSheetPlanosTreino_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_PLANOS_TREINO');
  if (!sheet) {
    sheet = ss.insertSheet('DB_PLANOS_TREINO');
    sheet.getRange('A1:Q1').setValues([['IdCliente', 'NomePlano', 'NomeTreino', 'Ordem', 'Exercicio', 'Series', 'RepsMin', 'RepsMax', 'RIR', 'Notas', 'DataAtualizacao', 'DataValidade', 'Visibilidade', 'TipoPrescricao', 'DescansoSegundos', 'Aquecimento', 'GrupoSuperserie']]);
    sheet.getRange('A1:O1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  // Compatibilidade com planos criados antes do modo PT.
  if (String(sheet.getRange(1, 13).getValue()) !== 'Visibilidade') sheet.getRange(1, 13).setValue('Visibilidade');
  if (String(sheet.getRange(1, 14).getValue()) !== 'TipoPrescricao') sheet.getRange(1, 14).setValue('TipoPrescricao');
  if (String(sheet.getRange(1, 15).getValue()) !== 'DescansoSegundos') sheet.getRange(1, 15).setValue('DescansoSegundos');
  if (String(sheet.getRange(1, 16).getValue()) !== 'Aquecimento') sheet.getRange(1, 16).setValue('Aquecimento');
  if (String(sheet.getRange(1, 17).getValue()) !== 'GrupoSuperserie') sheet.getRange(1, 17).setValue('GrupoSuperserie');
  return sheet;
}

/**
 * Devolve a biblioteca DB_EXERCICIOS completa, de uma vez só — usada para
 * carregar tudo no browser quando a página do editor de plano abre, para a
 * pesquisa deixar de precisar de ir ao servidor a cada tecla (isso era o
 * que tornava a pesquisa lenta).
 */
function getBibliotecaExercicios() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DB_EXERCICIOS');
    if (!sheet) return { exercicios: [], aviso: 'Ainda não importaste a aba DB_EXERCICIOS.' };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { exercicios: [], aviso: 'A aba DB_EXERCICIOS está vazia.' };

    const data = sheet.getRange('A2:F' + lastRow).getValues();
    const exercicios = data
      .filter(row => row[1] && String(row[1]).trim())
      .map(row => ({
        id: String(row[0] || ''),
        nome: String(row[1] || ''),
        padraoMovimento: String(row[2] || ''),
        grupoMuscular: String(row[3] || ''),
        equipamento: String(row[4] || '')
      }));

    return { exercicios: exercicios };
  } catch (error) {
    Logger.log('Erro getBibliotecaExercicios: ' + error.toString());
    return { exercicios: [], error: error.toString() };
  }
}


/**
 * Lista dos PLANOS de um cliente (nível de topo — ex: "T1-Tonificação").
 * Cada plano agrupa vários treinos (ex: PUSH, PULL).
 */
function getListaPlanosCliente(idCliente) {
  try {
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { planos: [] };

    const data = sheet.getRange('A2:Q' + lastRow).getValues();
    const doCliente = data.filter(row => row[0] && String(row[0]) === String(idCliente) && row[1]);

    const porPlano = {};
    doCliente.forEach(row => {
      const nomePlano = String(row[1]);
      const nomeTreino = String(row[2]);
      if (!porPlano[nomePlano]) porPlano[nomePlano] = { nome: nomePlano, treinosSet: {}, dataAtualizacao: row[10], dataValidade: row[11], visibilidade: normalizarVisibilidadePlano_(row[12]) };
      porPlano[nomePlano].treinosSet[nomeTreino] = true;
      if (row[10] && (!porPlano[nomePlano].dataAtualizacao || new Date(row[10]) > new Date(porPlano[nomePlano].dataAtualizacao))) {
        porPlano[nomePlano].dataAtualizacao = row[10];
      }
      if (row[11] && !porPlano[nomePlano].dataValidade) porPlano[nomePlano].dataValidade = row[11];
    });

    const hoje = new Date();
    const planos = Object.keys(porPlano).map(nome => {
      const dataValidadeRaw = porPlano[nome].dataValidade;
      let validoAte = '';
      let diasRestantes = null;
      if (dataValidadeRaw) {
        const dataValidade = new Date(dataValidadeRaw);
        validoAte = formatarDataPorExtenso_(dataValidade);
        diasRestantes = Math.ceil((dataValidade - hoje) / (24 * 60 * 60 * 1000));
      }
      return {
        nome: nome,
        numTreinos: Object.keys(porPlano[nome].treinosSet).length,
        atualizadoEm: porPlano[nome].dataAtualizacao ? formatarDataPorExtenso_(new Date(porPlano[nome].dataAtualizacao)) : '',
        validoAte: validoAte,
        diasRestantes: diasRestantes,
        visibilidade: porPlano[nome].visibilidade
      };
    });

    return { planos: planos };
  } catch (error) {
    Logger.log('Erro getListaPlanosCliente: ' + error.toString());
    return { planos: [], error: error.toString() };
  }
}

/**
 * Lista dos TREINOS dentro de um plano (ex: PUSH, PULL, LEGS).
 */
function getTreinosDoPlano(idCliente, nomePlano) {
  try {
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { treinos: [] };

    const data = sheet.getRange('A2:O' + lastRow).getValues();
    const doPlano = data.filter(row =>
      row[0] && String(row[0]) === String(idCliente) && String(row[1]) === String(nomePlano) && row[2]
    );

    const porTreino = {};
    doPlano.forEach(row => {
      const nomeTreino = String(row[2]);
      if (!porTreino[nomeTreino]) porTreino[nomeTreino] = { nome: nomeTreino, numExercicios: 0, dataAtualizacao: row[10], visibilidade: normalizarVisibilidadePlano_(row[12]) };
      porTreino[nomeTreino].numExercicios++;
      if (row[10] && (!porTreino[nomeTreino].dataAtualizacao || new Date(row[10]) > new Date(porTreino[nomeTreino].dataAtualizacao))) {
        porTreino[nomeTreino].dataAtualizacao = row[10];
      }
    });

    const treinos = Object.keys(porTreino).map(nome => ({
      nome: nome,
      numExercicios: porTreino[nome].numExercicios,
      atualizadoEm: porTreino[nome].dataAtualizacao ? formatarDataPorExtenso_(new Date(porTreino[nome].dataAtualizacao)) : '',
      visibilidade: porTreino[nome].visibilidade
    }));

    return { treinos: treinos };
  } catch (error) {
    Logger.log('Erro getTreinosDoPlano: ' + error.toString());
    return { treinos: [], error: error.toString() };
  }
}

/**
 * Detalhe completo de um treino (exercícios, ordem, séries/reps/RIR/notas)
 * — para abrir no ecrã de edição.
 */
function getTreinoDetalhe(idCliente, nomePlano, nomeTreino) {
  try {
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { exercicios: [] };

    const data = sheet.getRange('A2:Q' + lastRow).getValues();
    const doTreino = data.filter(row =>
      row[0] && String(row[0]) === String(idCliente) &&
      String(row[1]) === String(nomePlano) && String(row[2]) === String(nomeTreino)
    );
    doTreino.sort((a, b) => Number(a[3]) - Number(b[3]));

    const exercicios = doTreino.map(row => ({
      exercicio: String(row[4] || ''),
      series: String(row[5] || ''),
      repsMin: String(row[6] || ''),
      repsMax: String(row[7] || ''),
      rir: String(row[8] || ''),
      notas: String(row[9] || ''),
      tipoPrescricao: String(row[13] || 'REPS').toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS',
      descansoSegundos: String(row[14] || '60'),
      aquecimento: row[15] === true || String(row[15]).toLowerCase() === 'true',
      grupoSuperserie: String(row[16] || '').trim().toUpperCase()
    }));

    return { exercicios: exercicios, visibilidade: doTreino.length ? normalizarVisibilidadePlano_(doTreino[0][12]) : 'CLIENTE' };
  } catch (error) {
    Logger.log('Erro getTreinoDetalhe: ' + error.toString());
    return { exercicios: [], error: error.toString() };
  }
}

/**
 * Cria/substitui por completo um treino dentro de um plano. Se
 * `nomeTreinoOriginal` vier preenchido e for diferente de `nomeTreino`,
 * trata-se de uma renomeação — apaga as linhas do nome antigo primeiro.
 */
function guardarTreinoCliente(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    if (!data.idCliente) throw new Error('Cliente em falta');
    if (!data.nomePlano || !String(data.nomePlano).trim()) throw new Error('O nome do plano é obrigatório');
    if (!data.nomeTreino || !String(data.nomeTreino).trim()) throw new Error('O nome do treino é obrigatório');

    const exercicios = data.exercicios || [];
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    const agora = new Date();
    const nomeTreinoParaRemover = data.nomeTreinoOriginal || data.nomeTreino;

    // Mantemos sempre uma lista, mesmo quando esta é a primeira linha da
    // folha. O código abaixo precisa dela para descobrir o plano existente.
    // Antes, a variável só existia dentro do `if`, o que fazia falhar a
    // criação do primeiro treino com "todasAtuais is not defined".
    const todasAtuais = lastRow >= 2 ? sheet.getRange('A2:Q' + lastRow).getValues() : [];
    let linhasParaSubstituir = [];
    let dataValidadeHerdada = '';
    if (lastRow >= 2) {
      linhasParaSubstituir = todasAtuais.map((row, indice) => ({ row: row, linha: indice + 2 })).filter(item =>
        item.row[0] && (
          String(item.row[0]) === String(data.idCliente) &&
          String(item.row[1]) === String(data.nomePlano) &&
          String(item.row[2]) === String(nomeTreinoParaRemover)
        )
      );
      // Se já existir outro treino no mesmo plano, herda a validade dele
      // (a validade é do plano todo, não de cada treino individualmente).
      const outroTreinoDoMesmoPlano = todasAtuais.find(row =>
        row[0] && String(row[0]) === String(data.idCliente) && String(row[1]) === String(data.nomePlano) && row[11]
      );
      if (outroTreinoDoMesmoPlano) dataValidadeHerdada = outroTreinoDoMesmoPlano[11];
    }

    const dataValidadeFinal = data.dataValidade || dataValidadeHerdada || '';
    // Ao acrescentar um treino a um plano já existente, mantém a visibilidade
    // desse plano. Assim um plano PT nunca fica parcialmente exposto no Portal.
    const planoExistente = lastRow >= 2 ? todasAtuais.find(row =>
      row[0] && String(row[0]) === String(data.idCliente) && String(row[1]) === String(data.nomePlano)
    ) : null;
    const visibilidadeHerdada = linhasParaSubstituir.length
      ? normalizarVisibilidadePlano_(linhasParaSubstituir[0].row[12])
      : (planoExistente ? normalizarVisibilidadePlano_(planoExistente[12]) : 'CLIENTE');
    const visibilidadeFinal = data.visibilidade === undefined ? visibilidadeHerdada : normalizarVisibilidadePlano_(data.visibilidade);

    const novasLinhas = exercicios
      .filter(ex => ex.exercicio && String(ex.exercicio).trim())
      .map((ex, idx) => [
        data.idCliente,
        String(data.nomePlano).trim(),
        String(data.nomeTreino).trim(),
        idx + 1,
        String(ex.exercicio).trim(),
        String(ex.series || '').trim(),
        String(ex.repsMin || '').trim(),
        String(ex.repsMax || '').trim(),
        String(ex.rir || '').trim(),
        String(ex.notas || '').trim(),
        agora,
        dataValidadeFinal ? new Date(dataValidadeFinal) : '',
        visibilidadeFinal,
        String(ex.tipoPrescricao || 'REPS').toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS',
        String(ex.descansoSegundos || '60').trim(),
        ex.aquecimento === true || String(ex.aquecimento).toLowerCase() === 'true',
        String(ex.grupoSuperserie || '').trim().toUpperCase().slice(0, 1)
      ]);

    // Primeiro acrescenta a nova versão num único setValues. Só depois limpa
    // as linhas antigas deste treino. Assim uma falha nunca toca nos planos
    // dos outros clientes e, se a limpeza falhar, fica duplicado (recuperável),
    // não apagado.
    if (novasLinhas.length > 0) {
      const linhasNecessarias = sheet.getLastRow() + novasLinhas.length;
      if (sheet.getMaxRows() < linhasNecessarias) {
        sheet.insertRowsAfter(sheet.getMaxRows(), linhasNecessarias - sheet.getMaxRows());
      }
      sheet.getRange(sheet.getLastRow() + 1, 1, novasLinhas.length, 17).setValues(novasLinhas);
    }
    linhasParaSubstituir.forEach(item => sheet.getRange(item.linha, 1, 1, 17).clearContent());

    Logger.log('Treino "' + data.nomeTreino + '" (plano "' + data.nomePlano + '") guardado para ' + data.idCliente + ' (' + exercicios.length + ' exercícios)');
    return getTreinosDoPlano(data.idCliente, data.nomePlano);
  } catch (error) {
    Logger.log('Erro guardarTreinoCliente: ' + error.toString());
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function apagarTreinoCliente(data) {
  try {
    if (!data.idCliente || !data.nomePlano || !data.nomeTreino) throw new Error('Dados em falta');
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return getTreinosDoPlano(data.idCliente, data.nomePlano);

    const linhas = sheet.getRange('A2:O' + lastRow).getValues();
    linhas.forEach((row, indice) => {
      if (row[0] && String(row[0]) === String(data.idCliente) &&
          String(row[1]) === String(data.nomePlano) && String(row[2]) === String(data.nomeTreino)) {
        sheet.getRange(indice + 2, 1, 1, 15).clearContent();
      }
    });

    Logger.log('Treino "' + data.nomeTreino + '" apagado (plano "' + data.nomePlano + '") para ' + data.idCliente);
    return getTreinosDoPlano(data.idCliente, data.nomePlano);
  } catch (error) {
    Logger.log('Erro apagarTreinoCliente: ' + error.toString());
    throw error;
  }
}

function apagarPlanoCompleto(data) {
  try {
    if (!data.idCliente || !data.nomePlano) throw new Error('Dados em falta');
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return getListaPlanosCliente(data.idCliente);

    const linhas = sheet.getRange('A2:O' + lastRow).getValues();
    linhas.forEach((row, indice) => {
      if (row[0] && String(row[0]) === String(data.idCliente) && String(row[1]) === String(data.nomePlano)) {
        sheet.getRange(indice + 2, 1, 1, 15).clearContent();
      }
    });

    Logger.log('Plano "' + data.nomePlano + '" apagado por completo para ' + data.idCliente);
    return getListaPlanosCliente(data.idCliente);
  } catch (error) {
    Logger.log('Erro apagarPlanoCompleto: ' + error.toString());
    throw error;
  }
}

/**
 * Atualiza só a data de validade de um plano, em todas as linhas de todos
 * os treinos que o compõem — sem mexer nos exercícios.
 */
function renovarValidadePlano(data) {
  try {
    if (!data.idCliente || !data.nomePlano || !data.dataValidade) throw new Error('Dados em falta');
    const sheet = obterOuCriarSheetPlanosTreino_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return getListaPlanosCliente(data.idCliente);

    const novaData = new Date(data.dataValidade);
    for (let i = 0; i < lastRow - 1; i++) {
      const linha = i + 2;
      const idCel = sheet.getRange(linha, 1).getValue();
      const nomePlanoCel = sheet.getRange(linha, 2).getValue();
      if (idCel && String(idCel) === String(data.idCliente) && String(nomePlanoCel) === String(data.nomePlano)) {
        sheet.getRange(linha, 12).setValue(novaData);
      }
    }

    Logger.log('Validade do plano "' + data.nomePlano + '" renovada para ' + data.idCliente);
    return getListaPlanosCliente(data.idCliente);
  } catch (error) {
    Logger.log('Erro renovarValidadePlano: ' + error.toString());
    throw error;
  }
}

/**
 * ================= EXECUÇÃO DE TREINOS (registo real, feito pelo cliente) =================
 * Guardado num ficheiro Google Sheets À PARTE do principal, por causa do
 * volume esperado (série a série, vários clientes, várias vezes por
 * semana) — decisão tomada para não pesar a sheet principal do CRM.
 * O ID desse ficheiro fica guardado nas Script Properties, criado
 * automaticamente na primeira vez que for preciso.
 */

const PROP_SHEET_EXECUCOES_ID = 'SHEET_EXECUCOES_ID';

function obterSpreadsheetExecucoes_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_SHEET_EXECUCOES_ID);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // O ficheiro pode ter sido apagado manualmente — cria-se outro.
    }
  }
  const novoSpreadsheet = SpreadsheetApp.create('AL MOVE — Execução de Treinos');
  props.setProperty(PROP_SHEET_EXECUCOES_ID, novoSpreadsheet.getId());
  Logger.log('Criado novo ficheiro de execuções: ' + novoSpreadsheet.getUrl());
  return novoSpreadsheet;
}

function obterOuCriarSheetExecucoes_() {
  const ss = obterSpreadsheetExecucoes_();
  let sheet = ss.getSheetByName('EXECUCOES');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName('EXECUCOES');
    sheet.getRange('A1:O1').setValues([['IdCliente', 'NomePlano', 'NomeTreino', 'Data', 'Exercicio', 'NumeroSerie', 'Reps', 'Carga', 'Notas', 'Timestamp', 'Velocidade', 'RequestId', 'TipoSessao', 'RegistadoPor', 'IdSessao']]);
    sheet.getRange('A1:O1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  if (String(sheet.getRange(1, 11).getValue()) !== 'Velocidade') sheet.getRange(1, 11).setValue('Velocidade');
  if (String(sheet.getRange(1, 12).getValue()) !== 'RequestId') sheet.getRange(1, 12).setValue('RequestId');
  if (String(sheet.getRange(1, 13).getValue()) !== 'TipoSessao') sheet.getRange(1, 13).setValue('TipoSessao');
  if (String(sheet.getRange(1, 14).getValue()) !== 'RegistadoPor') sheet.getRange(1, 14).setValue('RegistadoPor');
  if (String(sheet.getRange(1, 15).getValue()) !== 'IdSessao') sheet.getRange(1, 15).setValue('IdSessao');
  return sheet;
}

/** Uma linha por sessão PT. As séries continuam em EXECUCOES, que é o
 * histórico único de esforço do aluno; esta folha guarda o contexto da sessão. */
function obterOuCriarSheetSessoesPT_() {
  const ss = obterSpreadsheetExecucoes_();
  let sheet = ss.getSheetByName('SESSOES_PT');
  if (!sheet) {
    sheet = ss.insertSheet('SESSOES_PT');
    sheet.getRange('A1:L1').setValues([['IdSessao', 'IdCliente', 'NomePlano', 'NomeTreino', 'Data', 'HoraInicio', 'HoraFim', 'DuracaoMin', 'Estado', 'NotaGeral', 'CriadoEm', 'AtualizadoEm']]);
    sheet.getRange('A1:L1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function normalizarEstadoSessaoPT_(valor) {
  const estado = String(valor || '').trim().toUpperCase();
  if (estado === 'PLANEADA' || estado === 'CANCELADA') return estado;
  return 'REALIZADA';
}

function calcularDuracaoSessaoPT_(inicio, fim, duracaoIndicada) {
  const indicada = Number(duracaoIndicada);
  if (Number.isFinite(indicada) && indicada > 0) return Math.round(indicada);
  const converter = valor => {
    const partes = String(valor || '').split(':');
    if (partes.length !== 2) return null;
    const h = Number(partes[0]), m = Number(partes[1]);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const a = converter(inicio), b = converter(fim);
  if (a === null || b === null) return 0;
  return b >= a ? b - a : (24 * 60 - a + b);
}

/** Torna um plano privado para PT ou disponível no Portal do aluno. */
function definirVisibilidadePlano(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const idCliente = String(data && data.idCliente || '').trim();
    const nomePlano = String(data && data.nomePlano || '').trim();
    if (!idCliente || !nomePlano) throw new Error('Plano não identificado.');
    const sheet = obterOuCriarSheetPlanosTreino_();
    const visibilidade = normalizarVisibilidadePlano_(data.visibilidade);
    if (sheet.getLastRow() >= 2) {
      const linhas = sheet.getRange('A2:B' + sheet.getLastRow()).getValues();
      linhas.forEach((row, i) => {
        if (String(row[0] || '') === idCliente && String(row[1] || '') === nomePlano) sheet.getRange(i + 2, 13).setValue(visibilidade);
      });
    }
    return getListaPlanosCliente(idCliente);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function normalizarVisibilidadePlano_(valor) {
  return String(valor || '').trim().toUpperCase() === 'PT' ? 'PT' : 'CLIENTE';
}

/**
 * Catálogo de planos já criados para poder reutilizar uma estrutura que
 * funciona. Só expõe metadados de trabalho ao CRM; exercícios e notas são
 * carregados apenas no momento de copiar o plano escolhido.
 */
function getPlanosParaReplicar(filtros) {
  try {
    filtros = filtros || {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const planosSheet = obterOuCriarSheetPlanosTreino_();
    const clientes = clientesSheet && clientesSheet.getLastRow() >= 4
      ? clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues()
      : [];
    const nomesPorId = {};
    clientes.forEach(row => {
      const id = String(row[24] || '').trim();
      if (id) nomesPorId[id] = { nome: String(row[0] || ''), estado: String(row[1] || 'Ativo') };
    });

    const ultimaLinha = planosSheet.getLastRow();
    if (ultimaLinha < 2) return { planos: [] };
    const linhas = planosSheet.getRange('A2:L' + ultimaLinha).getValues();
    const porPlano = {};
    linhas.forEach(row => {
      const idCliente = String(row[0] || '').trim();
      const nomePlano = String(row[1] || '').trim();
      const nomeTreino = String(row[2] || '').trim();
      if (!idCliente || !nomePlano || !nomeTreino || !nomesPorId[idCliente]) return;
      const chave = idCliente + '\u0000' + nomePlano;
      if (!porPlano[chave]) {
        porPlano[chave] = {
          idCliente: idCliente,
          cliente: nomesPorId[idCliente].nome,
          estadoCliente: nomesPorId[idCliente].estado,
          nomePlano: nomePlano,
          treinos: {},
          exercicios: 0,
          atualizadoEm: row[10] || '',
          dataValidade: row[11] || ''
        };
      }
      const plano = porPlano[chave];
      plano.treinos[nomeTreino] = true;
      plano.exercicios++;
      if (row[10] && (!plano.atualizadoEm || new Date(row[10]) > new Date(plano.atualizadoEm))) plano.atualizadoEm = row[10];
      if (row[11] && !plano.dataValidade) plano.dataValidade = row[11];
    });

    const termo = normalizarNomeCliente_(filtros.termo || '');
    const apenasAtivos = filtros.apenasAtivos !== false;
    const planos = Object.keys(porPlano).map(chave => {
      const p = porPlano[chave];
      return {
        idCliente: p.idCliente,
        cliente: p.cliente,
        estadoCliente: p.estadoCliente,
        nomePlano: p.nomePlano,
        numTreinos: Object.keys(p.treinos).length,
        numExercicios: p.exercicios,
        atualizadoEm: p.atualizadoEm ? formatarDataPorExtenso_(new Date(p.atualizadoEm)) : '',
        dataValidade: p.dataValidade ? formatarDataPorExtenso_(new Date(p.dataValidade)) : ''
      };
    }).filter(p => {
      if (apenasAtivos && p.estadoCliente !== 'Ativo') return false;
      if (!termo) return true;
      return normalizarNomeCliente_(p.cliente + ' ' + p.nomePlano).indexOf(termo) !== -1;
    }).sort((a, b) => (a.cliente + a.nomePlano).localeCompare(b.cliente + b.nomePlano, 'pt-PT'));

    return { planos: planos };
  } catch (error) {
    Logger.log('Erro getPlanosParaReplicar: ' + error.toString());
    return { planos: [], error: error.toString() };
  }
}

/**
 * Cria uma cópia independente de um plano. Copiam-se sessões, exercícios e
 * prescrições, nunca execuções, cargas reais, check-ins ou notas do aluno de
 * origem. O plano de destino começa como uma versão própria.
 */
function replicarPlanoParaCliente(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    data = data || {};
    const origemId = String(data.origemIdCliente || '').trim();
    const origemPlano = String(data.origemNomePlano || '').trim();
    const destinoId = String(data.destinoIdCliente || '').trim();
    const destinoPlano = String(data.destinoNomePlano || '').trim();
    if (!origemId || !origemPlano || !destinoId || !destinoPlano) throw new Error('Escolhe o plano de origem e indica o nome do novo plano.');
    if (origemId === destinoId && origemPlano === destinoPlano) throw new Error('Para copiar no mesmo aluno, dá um nome novo ao plano.');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientes = clientesSheet && clientesSheet.getLastRow() >= 4
      ? clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues()
      : [];
    const destinoExiste = clientes.some(row => String(row[24] || '').trim() === destinoId && String(row[0] || '').trim());
    if (!destinoExiste) throw new Error('O cliente de destino não existe.');

    const sheet = obterOuCriarSheetPlanosTreino_();
    const ultimaLinha = sheet.getLastRow();
    const todas = ultimaLinha >= 2 ? sheet.getRange('A2:O' + ultimaLinha).getValues() : [];
    const origem = todas.filter(row => String(row[0] || '') === origemId && String(row[1] || '') === origemPlano && String(row[2] || '').trim());
    if (!origem.length) throw new Error('O plano de origem já não tem treinos para copiar.');
    const destinoJaExiste = todas.some(row => String(row[0] || '') === destinoId && String(row[1] || '') === destinoPlano && String(row[2] || '').trim());
    if (destinoJaExiste) throw new Error('Este aluno já tem um plano com esse nome. Escolhe outro nome para não substituir nada por engano.');

    const agora = new Date();
    const dataValidade = data.dataValidade ? new Date(data.dataValidade) : '';
    if (data.dataValidade && isNaN(dataValidade.getTime())) throw new Error('A data de validade não é válida.');
    const novasLinhas = origem.map(row => [
      destinoId, destinoPlano, String(row[2] || ''), Number(row[3]) || 1,
      String(row[4] || ''), String(row[5] || ''), String(row[6] || ''),
      String(row[7] || ''), String(row[8] || ''), String(row[9] || ''),
      agora, dataValidade || (row[11] || ''), normalizarVisibilidadePlano_(row[12]),
      String(row[13] || 'REPS').toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS', String(row[14] || '60')
    ]);
    const linhaInicial = sheet.getLastRow() + 1;
    const linhasNecessarias = sheet.getLastRow() + novasLinhas.length;
    if (sheet.getMaxRows() < linhasNecessarias) sheet.insertRowsAfter(sheet.getMaxRows(), linhasNecessarias - sheet.getMaxRows());
    sheet.getRange(linhaInicial, 1, novasLinhas.length, 15).setValues(novasLinhas);

    Logger.log('Plano "' + origemPlano + '" copiado de ' + origemId + ' para ' + destinoId + ' como "' + destinoPlano + '".');
    return { sucesso: true, nomePlano: destinoPlano, planos: getListaPlanosCliente(destinoId).planos };
  } catch (error) {
    Logger.log('Erro replicarPlanoParaCliente: ' + error.toString());
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function obterOuCriarSheetPosTreino_() {
  const ss = obterSpreadsheetExecucoes_();
  let sheet = ss.getSheetByName('POS_TREINO');
  if (!sheet) {
    sheet = ss.insertSheet('POS_TREINO');
    sheet.getRange('A1:H1').setValues([['IdCliente', 'NomePlano', 'NomeTreino', 'Data', 'Energia', 'Esforco', 'Dificuldade', 'RequestId']]);
    sheet.getRange('A1:H1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  if (String(sheet.getRange(1, 8).getValue()) !== 'RequestId') sheet.getRange(1, 8).setValue('RequestId');
  return sheet;
}

/**
 * Regista o feedback pós-treino (energia, esforço, dificuldade 1-5),
 * associado ao treino que acabou de terminar.
 */
function registarPosTreino(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const info = obterClientePorTokenPortal_(data.token);
    if (!info) throw new Error('Link inválido.');

    const sheet = obterOuCriarSheetPosTreino_();
    const requestId = String(data.eventId || data.idempotencyKey || '').trim();
    if (requestId && sheet.getLastRow() >= 2 && sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues().some(row => String(row[0] || '') === requestId)) {
      return { sucesso: true, repetido: true };
    }
    sheet.appendRow([
      info.idCliente,
      textoSeguroParaFolhaPortal_(data.nomePlano || '', 160),
      textoSeguroParaFolhaPortal_(data.nomeTreino || '', 160),
      new Date(),
      Number(data.energia) || '',
      Number(data.esforco) || '',
      Number(data.dificuldade) || '',
      textoSeguroParaFolhaPortal_(requestId, 120)
    ]);

    Logger.log('Pós-treino registado: ' + info.idCliente + ' — ' + data.nomeTreino);
    return { sucesso: true };
  } catch (error) {
    Logger.log('Erro registarPosTreino: ' + error.toString());
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Estado de cada treino dentro de um plano — quando foi feito pela última
 * vez, para o cliente ver "PUSH feito há 2 dias, PULL e LEGS por fazer" e
 * para o André perceber se houve repetição fora de ordem.
 */
function getStatusTreinosPlano(idCliente, nomePlano) {
  try {
    const treinos = getTreinosDoPlano(idCliente, nomePlano).treinos || [];
    const sheet = obterOuCriarSheetExecucoes_();
    const lastRow = sheet.getLastRow();
    const ultimaVezPorTreino = {};

    if (lastRow >= 2) {
      const data = sheet.getRange('A2:J' + lastRow).getValues();
      data.forEach(row => {
        if (!row[0] || String(row[0]) !== String(idCliente) || String(row[1]) !== String(nomePlano)) return;
        const nomeTreino = String(row[2]);
        const dataTreino = new Date(row[3]);
        if (!ultimaVezPorTreino[nomeTreino] || dataTreino > ultimaVezPorTreino[nomeTreino]) {
          ultimaVezPorTreino[nomeTreino] = dataTreino;
        }
      });
    }

    const hoje = new Date();
    const status = treinos.map(t => {
      const ultimaVez = ultimaVezPorTreino[t.nome] || null;
      const diasDesde = ultimaVez ? Math.floor((hoje - ultimaVez) / (24 * 60 * 60 * 1000)) : null;
      return {
        nome: t.nome,
        numExercicios: t.numExercicios,
        feitoAntes: !!ultimaVez,
        diasDesde: diasDesde,
        dataRealizacao: ultimaVez ? ultimaVez.toISOString() : ''
      };
    });

    // Ordena: nunca feitos primeiro, depois os feitos há mais tempo
    status.sort((a, b) => {
      if (!a.feitoAntes && b.feitoAntes) return -1;
      if (a.feitoAntes && !b.feitoAntes) return 1;
      if (!a.feitoAntes && !b.feitoAntes) return 0;
      return b.diasDesde - a.diasDesde;
    });

    return { treinos: status };
  } catch (error) {
    Logger.log('Erro getStatusTreinosPlano: ' + error.toString());
    return { treinos: [], error: error.toString() };
  }
}

/**
 * Segunda-feira da semana de uma data (semana começa à segunda, como é
 * costume em Portugal).
 */
function getSegundaFeiraDaSemana_(data) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const dia = d.getDay() || 7; // 1=Seg .. 7=Dom
  d.setDate(d.getDate() - dia + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Tira de dias da semana atual (Segunda a Domingo) — em que dias o cliente
 * já treinou (qualquer treino, do plano ativo ou não), mais a contagem da
 * semana comparada com o nº de treinos do plano ativo (meta simples: um
 * treino de cada por semana).
 */
/**
 * Detalhe de um dia específico — check-in desse dia, treino(s) feito(s)
 * (com séries/reps/carga) e pós-treino. Usada quando o cliente clica num
 * dia da tira semanal no Portal.
 */
function getDetalheDia(token, dataISO) {
  try {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');

    const dataAlvo = new Date(dataISO + 'T00:00:00');

    // Check-in desse dia
    const checkinsCliente = getCheckinsRecentes_(info.idCliente, 60);
    const checkinDoDia = checkinsCliente.find(c => formatarDataISO_(c.dataHora) === dataISO);

    // Execuções desse dia, agrupadas por treino
    const sheetExec = obterOuCriarSheetExecucoes_();
    const lastRowExec = sheetExec.getLastRow();
    const treinosDoDia = {};
    if (lastRowExec >= 2) {
      const dataExec = sheetExec.getRange('A2:J' + lastRowExec).getValues();
      dataExec.forEach(row => {
        if (!row[0] || String(row[0]) !== String(info.idCliente) || !row[3]) return;
        if (formatarDataISO_(new Date(row[3])) !== dataISO) return;
        const chave = row[1] + ' — ' + row[2];
        if (!treinosDoDia[chave]) treinosDoDia[chave] = { nomePlano: row[1], nomeTreino: row[2], exercicios: {} };
        const nomeEx = String(row[4]);
        if (!treinosDoDia[chave].exercicios[nomeEx]) treinosDoDia[chave].exercicios[nomeEx] = [];
        treinosDoDia[chave].exercicios[nomeEx].push({ reps: row[6], carga: row[7] });
      });
    }
    const treinosFormatados = Object.values(treinosDoDia).map(t => ({
      nomePlano: t.nomePlano,
      nomeTreino: t.nomeTreino,
      exercicios: Object.keys(t.exercicios).map(nome => ({
        nome: nome,
        resumo: t.exercicios[nome].map(s => (s.reps || '?') + 'x' + (s.carga || '?') + 'kg').join(', ')
      }))
    }));

    // Pós-treino desse dia
    const sheetPos = obterOuCriarSheetPosTreino_();
    const lastRowPos = sheetPos.getLastRow();
    let posTreino = null;
    if (lastRowPos >= 2) {
      const dataPos = sheetPos.getRange('A2:G' + lastRowPos).getValues();
      const linhaPos = dataPos.find(row => row[0] && String(row[0]) === String(info.idCliente) && row[3] && formatarDataISO_(new Date(row[3])) === dataISO);
      if (linhaPos) posTreino = { energia: linhaPos[4], esforco: linhaPos[5], dificuldade: linhaPos[6] };
    }

    return {
      data: formatarDataPorExtenso_(dataAlvo),
      checkin: checkinDoDia ? {
        sono: checkinDoDia.sono, stress: checkinDoDia.stress, cansaco: checkinDoDia.cansaco,
        refeicoes: checkinDoDia.refeicoes, doms: checkinDoDia.doms, nota: checkinDoDia.nota
      } : null,
      treinos: treinosFormatados,
      posTreino: posTreino
    };
  } catch (error) {
    Logger.log('Erro getDetalheDia: ' + error.toString());
    return { data: '', checkin: null, treinos: [], posTreino: null, error: error.toString() };
  }
}

function getResumoSemanal(idCliente, nomePlanoAtivo) {
  try {
    const sheet = obterOuCriarSheetExecucoes_();
    const lastRow = sheet.getLastRow();
    const hoje = new Date();
    const segunda = getSegundaFeiraDaSemana_(hoje);
    const diasSemana = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(segunda.getTime() + i * 24 * 60 * 60 * 1000);
      diasSemana.push(d);
    }

    const diasComTreino = {};
    if (lastRow >= 2) {
      const data = sheet.getRange('A2:J' + lastRow).getValues();
      const domingoFimDia = new Date(segunda.getTime() + 7 * 24 * 60 * 60 * 1000);
      data.forEach(row => {
        if (!row[0] || String(row[0]) !== String(idCliente) || !row[3]) return;
        const dataTreino = new Date(row[3]);
        if (dataTreino >= segunda && dataTreino < domingoFimDia) {
          const chave = formatarDataISO_(dataTreino);
          diasComTreino[chave] = true;
        }
      });
    }

    const nomesDias = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    const dias = diasSemana.map((d, idx) => ({
      letra: nomesDias[idx],
      diaMes: d.getDate(),
      dataISO: formatarDataISO_(d),
      hoje: formatarDataISO_(d) === formatarDataISO_(hoje),
      futuro: d > hoje,
      treinou: !!diasComTreino[formatarDataISO_(d)]
    }));

    const totalSemana = Object.keys(diasComTreino).length;
    const meta = nomePlanoAtivo ? (getTreinosDoPlano(idCliente, nomePlanoAtivo).treinos || []).length : 0;

    return { dias: dias, totalSemana: totalSemana, meta: meta };
  } catch (error) {
    Logger.log('Erro getResumoSemanal: ' + error.toString());
    return { dias: [], totalSemana: 0, meta: 0, error: error.toString() };
  }
}

/**
 * Últimas vezes que o cliente fez um exercício específico — para mostrar
 * "última vez: 3x10 @ 40kg" no ecrã de execução. Agrupa por dia (cada
 * execução tem várias séries).
 */
function getHistoricoExercicio(token, nomeExercicio, limite) {
  try {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');

    const sheet = obterOuCriarSheetExecucoes_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { sessoes: [] };

    const data = sheet.getRange('A2:J' + lastRow).getValues();
    const porDia = {};
    data.forEach(row => {
      if (!row[0] || String(row[0]) !== String(info.idCliente) || String(row[4]) !== String(nomeExercicio)) return;
      const chaveDia = formatarDataISO_(new Date(row[3]));
      if (!porDia[chaveDia]) porDia[chaveDia] = { data: new Date(row[3]), series: [] };
      porDia[chaveDia].series.push({ reps: row[6], carga: row[7] });
    });

    const sessoes = Object.values(porDia)
      .sort((a, b) => b.data - a.data)
      .slice(0, limite || 2)
      .map(s => {
        // Melhor performance da sessão: a série com maior carga (a igualdade, mais reps)
        let melhor = s.series[0];
        s.series.forEach(sr => {
          const cargaAtual = Number(melhor.carga) || 0;
          const cargaNova = Number(sr.carga) || 0;
          if (cargaNova > cargaAtual || (cargaNova === cargaAtual && (Number(sr.reps) || 0) > (Number(melhor.reps) || 0))) {
            melhor = sr;
          }
        });
        return {
          data: formatarDataPorExtenso_(s.data),
          resumo: (melhor.reps || '?') + 'x' + (melhor.carga || '?') + 'kg'
        };
      });

    return { sessoes: sessoes };
  } catch (error) {
    Logger.log('Erro getHistoricoExercicio: ' + error.toString());
    return { sessoes: [], error: error.toString() };
  }
}

function registarExecucaoTreino(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const info = obterClientePorTokenPortal_(data.token);
    if (!info) throw new Error('Link inválido.');
    if (!data.nomePlano || !data.nomeTreino) throw new Error('Treino não identificado.');

    // A sessão só pode conter o treino realmente prescrito ao cliente. O
    // browser é uma interface não confiável e não decide nomes, exercícios ou
    // quantidade máxima de séries.
    const prescricao = getTreinoDetalhe(info.idCliente, String(data.nomePlano), String(data.nomeTreino));
    if (!prescricao || prescricao.error || !Array.isArray(prescricao.exercicios) || !prescricao.exercicios.length || prescricao.visibilidade === 'PT') {
      throw new Error('TREINO_NAO_PRESCRITO');
    }
    const prescritosPorNome = {};
    prescricao.exercicios.forEach(ex => { prescritosPorNome[String(ex.exercicio || '').trim()] = ex; });
    const recebidos = Array.isArray(data.exercicios) ? data.exercicios.slice(0, prescricao.exercicios.length) : [];
    const exercicios = recebidos.map(ex => {
      const nome = String(ex && ex.exercicio || '').trim();
      const prescrito = prescritosPorNome[nome];
      if (!prescrito) throw new Error('EXERCICIO_NAO_PRESCRITO');
      const maxSeries = Math.max(1, Math.min(20, Number(prescrito.series) || 1));
      return {
        exercicio: nome,
        notas: textoSeguroParaFolhaPortal_(ex.notas || '', 500),
        series: (Array.isArray(ex.series) ? ex.series : []).slice(0, maxSeries)
      };
    });
    if (!exercicios.length) throw new Error('TREINO_SEM_SERIES');
    const sheet = obterOuCriarSheetExecucoes_();
    const requestId = String(data.eventId || data.idempotencyKey || '').trim();
    const idSessao = String(data.idSessao || requestId || Utilities.getUuid());
    if (requestId && sheet.getLastRow() >= 2) {
      const pedidos = sheet.getRange(2, 12, sheet.getLastRow() - 1, 1).getValues();
      if (pedidos.some(row => String(row[0] || '') === requestId)) {
        return { sucesso: true, repetido: true, idSessao: idSessao, seriesRegistadas: 0, repeticaoForaDeOrdem: false, outrosPorFazer: [] };
      }
    }
    const agora = new Date();
    const hojeData = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    // Verifica se há repetição fora de ordem (outros treinos do plano ainda por fazer)
    const statusAntes = getStatusTreinosPlano(info.idCliente, data.nomePlano).treinos || [];
    const outrosPorFazer = statusAntes.filter(t => t.nome !== data.nomeTreino && !t.feitoAntes);
    const repeticaoForaDeOrdem = outrosPorFazer.length > 0 &&
      (statusAntes.find(t => t.nome === data.nomeTreino) || {}).feitoAntes;

    const linhas = [];
    exercicios.forEach(ex => {
      const series = Array.isArray(ex.series) ? ex.series.slice(0, 20) : [];
      series.forEach((s, idx) => {
        linhas.push([
          info.idCliente,
          textoSeguroParaFolhaPortal_(data.nomePlano, 160),
          textoSeguroParaFolhaPortal_(data.nomeTreino, 160),
          hojeData,
          textoSeguroParaFolhaPortal_(ex.exercicio, 160),
          idx + 1,
          textoSeguroParaFolhaPortal_(s.reps || '', 30),
          textoSeguroParaFolhaPortal_(s.carga || '', 30),
          textoSeguroParaFolhaPortal_((idx === 0 ? ex.notas : '') + (idx === 0 && repeticaoForaDeOrdem ? ' [repetição — ainda faltava: ' + outrosPorFazer.map(t => t.nome).join(', ') + ']' : ''), 650),
          agora,
          textoSeguroParaFolhaPortal_(s.velocidade || '', 40),
          textoSeguroParaFolhaPortal_(requestId, 120),
          'AUTONOMO',
          'CLIENTE',
          idSessao
        ]);
      });
    });

    if (linhas.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, 15).setValues(linhas);
    }

    const inicioSessao = data.startedAt ? new Date(data.startedAt) : null;
    const duracaoMin = inicioSessao && !isNaN(inicioSessao.getTime())
      ? Math.max(1, Math.min(360, Math.round((Date.now() - inicioSessao.getTime()) / 60000)))
      : '';
    registarEventoPortal_(info, {
      eventId: requestId || idSessao,
      tipo: 'TREINO_AUTONOMO',
      subtipo: 'PLANO',
      duracaoMin: duracaoMin,
      referenciaId: idSessao,
      titulo: data.nomeTreino,
      metadados: { plano: data.nomePlano, seriesRegistadas: linhas.length }
    });

    Logger.log('Execução registada: ' + info.idCliente + ' — ' + data.nomePlano + '/' + data.nomeTreino + (repeticaoForaDeOrdem ? ' (REPETIÇÃO fora de ordem)' : ''));
    return { sucesso: true, idSessao: idSessao, seriesRegistadas: linhas.length, guardadoEm: agora.toISOString(), repeticaoForaDeOrdem: repeticaoForaDeOrdem, outrosPorFazer: outrosPorFazer.map(t => t.nome) };
  } catch (error) {
    Logger.log('Erro registarExecucaoTreino: ' + error.toString());
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function obterReferenciasExerciciosPT_(idCliente) {
  const sheet = obterOuCriarSheetExecucoes_();
  if (sheet.getLastRow() < 2) return {};
  const linhas = sheet.getRange('A2:O' + sheet.getLastRow()).getValues()
    .filter(row => String(row[0] || '') === String(idCliente) && row[4]);
  linhas.sort((a, b) => new Date(b[9] || b[3]) - new Date(a[9] || a[3]));
  const porExercicio = {};
  linhas.forEach(row => {
    const nome = String(row[4]);
    const chave = String(row[14] || row[11] || row[9]);
    if (!porExercicio[nome]) porExercicio[nome] = { chave: chave, data: new Date(row[3]), series: [] };
    if (porExercicio[nome].chave === chave) porExercicio[nome].series.push({ reps: String(row[6] || ''), carga: String(row[7] || ''), velocidade: String(row[10] || '') });
  });
  Object.keys(porExercicio).forEach(nome => {
    const ref = porExercicio[nome];
    const resumoSeries = ref.series.map(s => (s.reps || '—') + (s.carga ? ' · ' + s.carga + ' kg' : '')).join(' | ');
    ref.resumo = resumoSeries || 'Sem registo anterior';
    ref.data = formatarData(ref.data);
    delete ref.chave;
  });
  return porExercicio;
}

/** Dados de uma prescrição para o Modo PT do CRM. Inclui planos privados e
 * a última referência real do aluno, sem preencher valores automaticamente. */
function getTreinosParaSessaoPT(idCliente) {
  const planos = getListaPlanosCliente(idCliente).planos || [];
  const referencias = obterReferenciasExerciciosPT_(idCliente);
  return {
    planos: planos.map(plano => ({
      nome: plano.nome,
      visibilidade: plano.visibilidade,
      treinos: (getTreinosDoPlano(idCliente, plano.nome).treinos || []).map(treino => ({
        nome: treino.nome,
        exercicios: (getTreinoDetalhe(idCliente, plano.nome, treino.nome).exercicios || []).map(ex => Object.assign({}, ex, { referencia: referencias[String(ex.exercicio)] || null }))
      }))
    }))
  };
}

function guardarContextoSessaoPT_(dados) {
  const sheet = obterOuCriarSheetSessoesPT_();
  const agora = new Date();
  const valores = [dados.idSessao, dados.idCliente, dados.nomePlano, dados.nomeTreino, dados.data, dados.horaInicio, dados.horaFim, dados.duracaoMin, dados.estado, dados.notaGeral, agora, agora];
  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    const indice = ids.findIndex(row => String(row[0] || '') === String(dados.idSessao));
    if (indice >= 0) {
      const criadoEm = sheet.getRange(indice + 2, 11).getValue() || agora;
      valores[10] = criadoEm;
      sheet.getRange(indice + 2, 1, 1, 12).setValues([valores]);
      return;
    }
  }
  sheet.appendRow(valores);
}

/** Registo presencial feito pelo treinador na mesma folha de execuções do Portal. */
function registarSessaoPT(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const idCliente = String(data && data.idCliente || '').trim();
    const nomePlano = String(data && data.nomePlano || '').trim();
    const nomeTreino = String(data && data.nomeTreino || '').trim();
    if (!idCliente || !nomePlano || !nomeTreino) throw new Error('Escolhe o plano e o treino da sessão PT.');
    const prescricao = getTreinoDetalhe(idCliente, nomePlano, nomeTreino);
    if (!prescricao.exercicios || !prescricao.exercicios.length) throw new Error('Esse treino já não existe ou não tem exercícios.');
    const idSessao = String(data.idSessao || Utilities.getUuid());
    const estado = normalizarEstadoSessaoPT_(data.estado);
    const agora = new Date();
    const dataSessao = data.data ? new Date(data.data + 'T12:00:00') : new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    if (isNaN(dataSessao.getTime())) throw new Error('Data da sessão inválida.');
    const sheet = obterOuCriarSheetExecucoes_();
    const jaTemSeries = sheet.getLastRow() >= 2 && sheet.getRange(2, 15, sheet.getLastRow() - 1, 1).getValues().some(row => String(row[0] || '') === idSessao);
    const linhas = [];
    (data.exercicios || []).forEach(ex => {
      if (!ex || !String(ex.exercicio || '').trim()) return;
      (ex.series || []).forEach((serie, indice) => linhas.push([
        idCliente, nomePlano, nomeTreino, dataSessao, String(ex.exercicio).trim(), indice + 1,
        serie.reps || '', serie.carga || '', indice === 0 ? String(ex.notas || '') : '', agora,
        String(serie.velocidade || ''), idSessao, 'PT', 'TREINADOR', idSessao
      ]));
    });
    if (estado === 'REALIZADA' && !linhas.length && !jaTemSeries) throw new Error('Regista pelo menos uma série antes de guardar uma sessão realizada.');
    if (linhas.length && !jaTemSeries) sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, 15).setValues(linhas);
    const duracaoMin = calcularDuracaoSessaoPT_(data.horaInicio, data.horaFim, data.duracaoMin);
    guardarContextoSessaoPT_({
      idSessao: idSessao, idCliente: idCliente, nomePlano: nomePlano, nomeTreino: nomeTreino,
      data: dataSessao, horaInicio: String(data.horaInicio || ''), horaFim: String(data.horaFim || ''),
      duracaoMin: duracaoMin, estado: estado, notaGeral: String(data.notaGeral || '').trim()
    });
    return { sucesso: true, idSessao: idSessao, seriesRegistadas: jaTemSeries ? 0 : linhas.length, estado: estado, duracaoMin: duracaoMin };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Linha temporal única: sessões PT, autónomas e sessões planeadas/canceladas. */
function getHistoricoAtividadeCliente(idCliente, limite) {
  const itens = {};
  const sessoes = obterOuCriarSheetSessoesPT_();
  if (sessoes.getLastRow() >= 2) {
    sessoes.getRange('A2:L' + sessoes.getLastRow()).getValues().forEach(row => {
      if (String(row[1] || '') !== String(idCliente) || !row[0]) return;
      itens[String(row[0])] = {
        idSessao: String(row[0]), dataRaw: new Date(row[4]), data: formatarData(row[4]), plano: String(row[2] || ''), treino: String(row[3] || ''),
        tipo: 'PT', estado: normalizarEstadoSessaoPT_(row[8]), duracaoMin: Number(row[7]) || 0,
        notaGeral: String(row[9] || ''), numSeries: 0, numExercicios: 0
      };
    });
  }
  const execucoes = obterOuCriarSheetExecucoes_();
  if (execucoes.getLastRow() >= 2) {
    execucoes.getRange('A2:O' + execucoes.getLastRow()).getValues().forEach(row => {
      if (String(row[0] || '') !== String(idCliente) || !row[3]) return;
      const id = String(row[14] || row[11] || ('legado-' + row[9] + '-' + row[2]));
      if (!itens[id]) itens[id] = {
        idSessao: id, dataRaw: new Date(row[3]), data: formatarData(row[3]), plano: String(row[1] || ''), treino: String(row[2] || ''),
        tipo: String(row[12] || 'AUTONOMO'), estado: 'REALIZADA', duracaoMin: 0, notaGeral: '', numSeries: 0, numExercicios: 0, _exercicios: {}
      };
      const item = itens[id];
      item.numSeries++;
      item._exercicios = item._exercicios || {};
      item._exercicios[String(row[4] || '')] = true;
    });
  }
  return { sessoes: Object.values(itens).map(item => {
    item.numExercicios = Object.keys(item._exercicios || {}).filter(Boolean).length || item.numExercicios;
    delete item._exercicios;
    item.origem = item.tipo === 'PT' ? 'PT presencial' : 'Treino autónomo';
    return item;
  }).sort((a, b) => b.dataRaw - a.dataRaw).slice(0, Math.max(1, Math.min(50, Number(limite) || 12))) };
}

function getDetalheSessaoAtividadeCliente(data) {
  const idCliente = String(data && data.idCliente || '').trim();
  const idSessao = String(data && data.idSessao || '').trim();
  if (!idCliente || !idSessao) throw new Error('Sessão não identificada.');
  const linhas = obterOuCriarSheetExecucoes_().getLastRow() >= 2
    ? obterOuCriarSheetExecucoes_().getRange('A2:O' + obterOuCriarSheetExecucoes_().getLastRow()).getValues() : [];
  const porExercicio = {};
  linhas.forEach(row => {
    const id = String(row[14] || row[11] || ('legado-' + row[9] + '-' + row[2]));
    if (String(row[0] || '') !== idCliente || id !== idSessao) return;
    const nome = String(row[4] || 'Exercício');
    if (!porExercicio[nome]) porExercicio[nome] = { nome: nome, series: [], nota: String(row[8] || '') };
    porExercicio[nome].series.push({ reps: String(row[6] || ''), carga: String(row[7] || ''), velocidade: String(row[10] || '') });
  });
  return { exercicios: Object.values(porExercicio) };
}

function getUltimaSessaoPTCliente(idCliente) {
  const historico = getHistoricoAtividadeCliente(idCliente, 50).sessoes;
  const ultima = historico.find(sessao => sessao.tipo === 'PT' && sessao.estado === 'REALIZADA' && sessao.numSeries > 0);
  if (!ultima) return { sessao: null };
  return { sessao: Object.assign({}, ultima, getDetalheSessaoAtividadeCliente({ idCliente: idCliente, idSessao: ultima.idSessao })) };
}

/**
 * Usada no perfil do cliente (lado do André) — mostra o progresso do plano
 * mais recente: qual foi o último treino feito e o que ainda falta.
 */
function getProgressoPlanoRecente(idCliente, planosPreCarregados) {
  try {
    // No detalhe do CRM os planos já podem ter sido lidos nesta execução.
    // Reutilizá-los evita uma segunda leitura completa da mesma folha.
    const planos = planosPreCarregados || getListaPlanosCliente(idCliente).planos || [];
    if (planos.length === 0) return null;
    // O plano mais recentemente atualizado é considerado o "atual"
    const planoAtual = planos.slice().sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0];
    const status = getStatusTreinosPlano(idCliente, planoAtual.nome).treinos || [];
    return { nomePlano: planoAtual.nome, treinos: status };
  } catch (error) {
    Logger.log('Erro getProgressoPlanoRecente: ' + error.toString());
    return null;
  }
}

const API_FUNCOES_PORTAL = {
  pedirCodigoAcessoPortal: function (token) {
    return pedirCodigoAcessoPortal_(token);
  },
  validarCodigoAcessoPortal: function (token, corpoPost) {
    return validarCodigoAcessoPortal_(token, corpoPost && corpoPost.codigo);
  },
  terminarSessaoPortal: function (token) {
    return terminarSessaoPortal_(token);
  },
  guardarPedidoPrivacidadePortal: function (token, corpoPost) {
    return guardarPedidoPrivacidadePortal_(token, corpoPost && corpoPost.tipo);
  },
  guardarPedidoAtualizacaoDadosPortal: function (token, corpoPost) {
    return guardarPedidoAtualizacaoDadosPortal_(token, corpoPost || {});
  },
  getBootstrapPortal: function (token) {
    return getBootstrapPortal_(token);
  },
  getProgressoBootstrapPortal: function (token) {
    exigirAcessoSensivelPortal_(token);
    return getProgressoBootstrapPortal_(token);
  },
  getEstadoPortalHoje: function (token) {
    return getEstadoPortalHoje(token);
  },
  registarCheckin: function (token, corpoPost) {
    return registarCheckin(Object.assign({}, corpoPost, { token: token }));
  },
  getAvaliacaoFisicaPortal: function (token) {
    exigirAcessoSensivelPortal_(token);
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getAvaliacaoFisicaPortal_(info.idCliente);
  },
  getHistoricoAvaliacoesFisicasPortal: function (token) {
    exigirAcessoSensivelPortal_(token);
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getHistoricoAvaliacoesFisicasPortal_(info.idCliente);
  },
  getPesosDiariosPortal: function (token) {
    exigirAcessoSensivelPortal_(token);
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getPesosDiariosPortal_(info.idCliente);
  },
  guardarPesoDiarioPortal: function (token, corpoPost) {
    exigirAcessoSensivelPortal_(token);
    return guardarPesoDiarioPortal(Object.assign({}, corpoPost, { token: token }));
  },
  getPedidoAvaliacaoPortal: function (token) {
    exigirAcessoSensivelPortal_(token);
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getPedidoAvaliacaoPortal_(info.idCliente);
  },
  guardarPedidoAvaliacaoPortal: function (token, corpoPost) {
    exigirAcessoSensivelPortal_(token);
    return guardarPedidoAvaliacaoPortal(Object.assign({}, corpoPost, { token: token }));
  },
  getAgendaPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getAgendaPortal_(info.idCliente);
  },
  registarTesteProntidao: function (token, corpoPost) {
    return registarTesteProntidao(Object.assign({}, corpoPost, { token: token }));
  },
  getPlanoAtivoPortal: function (token) {
    return getPlanoAtivoPortalApi_(token);
  },
    getResumoInicioPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    const resumo = getResumoInicioPortal_(info.idCliente);
    resumo.primeiroNome = String(info.nome || '').trim().split(' ')[0] || '';
    return resumo;
  },
  getResumoConquistasPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getResumoConquistasPortal_(info.idCliente);
  },
    getMetricasAtividadePortal: function (token) {
    exigirAcessoSensivelPortal_(token);
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getMetricasAtividadePortal_(info.idCliente);
  },
  getNotificacoesPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getNotificacoesPortal_(info.idCliente);
  },
  marcarNotificacoesLidasPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return marcarNotificacoesLidasPortal_(info.idCliente);
  },
  guardarMetricasAtividadePortal: function (token, corpoPost) {
    exigirAcessoSensivelPortal_(token);
    return guardarMetricasAtividadePortal(Object.assign({}, corpoPost, { token: token }));
  },
  getResumoPassosPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getResumoPassosPortal_(info.idCliente);
  },
  guardarPassosPortal: function (token, corpoPost) {
    return guardarPassosPortal(Object.assign({}, corpoPost, { token: token }));
  },
  getResumoOpcoesPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getResumoOpcoesPortal_(info.idCliente);
  },
  getDadosPessoaisPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getDadosPessoaisPortal_(info.idCliente);
  },
  getMapaAtividadePortal: function (token, corpoPost) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getMapaAtividadePortal_(info.idCliente, corpoPost.semanas || 12);
  },
  getPassaporteTecnicoPortal: function (token) {
    const info = obterClientePorTokenPortal_(token);
    if (!info) throw new Error('Link inválido.');
    return getPassaporteTecnicoPortal_(info.idCliente);
  },
  getHistoricoExercicio: function (token, corpoPost) {
    return getHistoricoExercicio(token, corpoPost.nomeExercicio, corpoPost.limite || 3);
  },
  registarExecucaoTreino: function (token, corpoPost) {
    return registarExecucaoTreino(Object.assign({}, corpoPost, { token: token }));
  },
  registarPosTreino: function (token, corpoPost) {
    return registarPosTreino(Object.assign({}, corpoPost, { token: token }));
  },
  registarSessaoMinimaPortal: function (token, corpoPost) {
    return registarSessaoMinimaPortal_(token, corpoPost);
  }
};

/**
 * Carrega num só pedido tudo o que o cliente precisa ao abrir o portal.
 * Cada bloco é isolado: uma falha na agenda, por exemplo, não apaga o nome,
 * o check-in nem as conquistas.
 */
function getBootstrapPortal_(token) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('Link inválido.');
  const erros = [];
  const seguro = (nome, executar, padrao) => {
    try { return executar(); }
    catch (erro) {
      erros.push({ bloco: nome, mensagem: erro && erro.message ? erro.message : String(erro) });
      Logger.log('Bootstrap Portal · ' + nome + ': ' + (erro && erro.stack ? erro.stack : erro));
      return padrao;
    }
  };

  const inicio = seguro('inicio', () => getResumoInicioPortal_(info.idCliente), {
    diasSemana: [], treinosFeitosSemana: 0, treinosNoPlanoSemana: 0, streakSemanas: 0
  });
  inicio.primeiroNome = String(info.nome || '').trim().split(' ')[0] || '';

  return {
    geradoEm: new Date().toISOString(),
    inicio: inicio,
    conquistas: seguro('conquistas', () => getResumoConquistasPortal_(info.idCliente), {}),
    opcoes: seguro('opcoes', () => getResumoOpcoesPortal_(info.idCliente), { nome: info.nome || '' }),
    agenda: seguro('agenda', () => getAgendaPortal_(info.idCliente), []),
    notificacoes: seguro('notificacoes', () => getNotificacoesPortal_(info.idCliente), []),
    estadoHoje: seguro('estadoHoje', () => getEstadoPortalHoje(token), {}),
    erros: erros
  };
}

function registarAlertaCheckin_(info, dados, requestId) {
  const sinais = [];
  if (Number(dados.doms) >= 4) sinais.push('dor muscular elevada');
  if (Number(dados.stress) >= 5) sinais.push('stress muito elevado');
  if (Number(dados.cansaco) <= 2) sinais.push('energia baixa');
  if (!sinais.length) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('ALERTAS_ACOMPANHAMENTO');
  if (!sheet) {
    sheet = ss.insertSheet('ALERTAS_ACOMPANHAMENTO');
    sheet.appendRow(['DATA_HORA', 'ID_CLIENTE', 'CLIENTE', 'SINAIS', 'NOTA', 'REQUEST_ID', 'RESOLVIDO']);
    sheet.setFrozenRows(1);
  }
  if (requestId && sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, 6, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
    if (ids.includes(requestId)) return;
  }
  sheet.appendRow([new Date(), info.idCliente, textoSeguroParaFolhaPortal_(info.nome, 120), sinais.join(', '), textoSeguroParaFolhaPortal_(dados.nota || '', 500), textoSeguroParaFolhaPortal_(requestId || '', 120), false]);
}

/** Dados mais pesados, pedidos apenas quando o cliente abre o Perfil. */
function getProgressoBootstrapPortal_(token) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('Link inválido.');
  const erros = [];
  const seguro = (nome, executar, padrao) => {
    try { return executar(); }
    catch (erro) {
      erros.push({ bloco: nome, mensagem: erro && erro.message ? erro.message : String(erro) });
      Logger.log('Progresso Portal · ' + nome + ': ' + (erro && erro.stack ? erro.stack : erro));
      return padrao;
    }
  };
  return {
    geradoEm: new Date().toISOString(),
    metricas: seguro('metricas', () => getMetricasAtividadePortal_(info.idCliente), {}),
    avaliacao: seguro('avaliacao', () => getAvaliacaoFisicaPortal_(info.idCliente), {}),
    historicoAvaliacoes: seguro('historicoAvaliacoes', () => getHistoricoAvaliacoesFisicasPortal_(info.idCliente), []),
    pesosDiarios: seguro('pesosDiarios', () => getPesosDiariosPortal_(info.idCliente), []),
    pedidoAvaliacao: seguro('pedidoAvaliacao', () => getPedidoAvaliacaoPortal_(info.idCliente), null),
    mapaAtividade: seguro('mapaAtividade', () => getMapaAtividadePortal_(info.idCliente, 12), { dias: [], semanas: 12 }),
    passaporteTecnico: seguro('passaporteTecnico', () => getPassaporteTecnicoPortal_(info.idCliente), { exercicios: [] }),
    erros: erros
  };
}

const DURACAO_SESSAO_PORTAL_SEGUNDOS_ = 6 * 60 * 60;
const DURACAO_CODIGO_PORTAL_SEGUNDOS_ = 10 * 60;
const DURACAO_ACESSO_SENSIVEL_SEGUNDOS_ = 30 * 60;
const MAX_TENTATIVAS_CODIGO_PORTAL_ = 5;
const BLOQUEIO_CODIGO_PORTAL_SEGUNDOS_ = 15 * 60;

function chaveSeguraPortal_(prefixo, valor) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(valor || ''));
  const hex = digest.map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
  return prefixo + hex.slice(0, 48);
}

/**
 * CacheService acelera as leituras, mas não é armazenamento durável e pode
 * expulsar sessões antes do prazo. Esta pequena camada usa ScriptProperties
 * como fonte de verdade e o cache apenas como aceleração. Para 50 clientes a
 * superfície continua pequena e pode ser migrada depois para Firebase Auth.
 */
function guardarTemporarioPortal_(chave, valor, duracaoSegundos) {
  const registo = JSON.stringify({
    valor: valor,
    expiraEmMs: Date.now() + Math.max(1, Number(duracaoSegundos) || 1) * 1000
  });
  PropertiesService.getScriptProperties().setProperty(chave, registo);
  CacheService.getScriptCache().put(chave, registo, Math.min(21600, Math.max(1, Number(duracaoSegundos) || 1)));
}

function lerTemporarioPortal_(chave) {
  const cache = CacheService.getScriptCache();
  const propriedades = PropertiesService.getScriptProperties();
  const bruto = cache.get(chave) || propriedades.getProperty(chave);
  if (!bruto) return null;
  try {
    const registo = JSON.parse(bruto);
    if (!registo.expiraEmMs || Number(registo.expiraEmMs) <= Date.now()) {
      cache.remove(chave);
      propriedades.deleteProperty(chave);
      return null;
    }
    if (!cache.get(chave)) cache.put(chave, bruto, Math.min(21600, Math.max(1, Math.floor((Number(registo.expiraEmMs) - Date.now()) / 1000))));
    return registo.valor;
  } catch (erro) {
    cache.remove(chave);
    propriedades.deleteProperty(chave);
    return null;
  }
}

function removerTemporarioPortal_(chave) {
  CacheService.getScriptCache().remove(chave);
  PropertiesService.getScriptProperties().deleteProperty(chave);
}

function mascararEmailPortal_(email) {
  const partes = String(email || '').split('@');
  if (partes.length !== 2) return '';
  const nome = partes[0];
  return nome.slice(0, Math.min(2, nome.length)) + '•••@' + partes[1];
}

function escaparHtml_(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function registarAcessoPortal_(info, evento, detalhe) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('ACESSOS_PORTAL');
    if (!sheet) {
      sheet = ss.insertSheet('ACESSOS_PORTAL');
      sheet.getRange(1, 1, 1, 5).setValues([['DATA_HORA', 'ID_CLIENTE', 'CLIENTE', 'EVENTO', 'DETALHE']]);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), info.idCliente || '', textoSeguroParaFolhaPortal_(info.nome || '', 120), textoSeguroParaFolhaPortal_(evento || '', 100), textoSeguroParaFolhaPortal_(detalhe || '', 500)]);
  } catch (erro) {
    Logger.log('Não foi possível registar o acesso ao portal: ' + erro.toString());
  }
}

function criarSessaoParaInfo_(info, dados, evento) {
  const sessao = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_PORTAL_SEGUNDOS_ * 1000);
  const sessaoDados = Object.assign({}, info, {
    eSessao: true,
    tokenPortalOriginal: String(info.tokenPortalOriginal || ''),
    expiraEm: expiraEm.toISOString()
  });
  guardarTemporarioPortal_(chaveSeguraPortal_('sessao_portal_', sessao), sessaoDados, DURACAO_SESSAO_PORTAL_SEGUNDOS_);
  registarAcessoPortal_(info, evento || 'SESSAO_INICIADA', String((dados && dados.dispositivo) || 'Portal web').slice(0, 180));
  return { sessao: sessao, expiraEm: expiraEm.toISOString(), primeiroNome: String(info.nome || '').split(' ')[0] };
}

function obterClientePorEmailPortal_(email) {
  const emailLimpo = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CLIENTES');
  if (!sheet || sheet.getLastRow() < 4) return null;
  const clientes = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  const correspondencias = clientes.map((row, indice) => ({ row: row, linha: indice + 4 }))
    .filter(item => String(item.row[18] || '').trim().toLowerCase() === emailLimpo)
    .filter(item => String(item.row[1] || 'Ativo').trim().toLowerCase() !== 'cancelado');
  if (!correspondencias.length) return null;
  if (correspondencias.length > 1) {
    Logger.log('Login bloqueado: email duplicado em clientes ativos (' + emailLimpo + ').');
    return { duplicado: true, email: emailLimpo };
  }

  const item = correspondencias[0];
  const row = item.row;
  // Um cliente novo pode ainda não ter TOKEN_PORTAL na coluna X. O email
  // validado identifica o cliente e permite criar o token na primeira entrada.
  let tokenPortal = String(row[23] || '').trim();
  const tokenRevogado = tokenPortal && PropertiesService.getScriptProperties()
    .getProperty(chaveSeguraPortal_('token_revogado_', tokenPortal));
  if (!tokenPortal || tokenRevogado) {
    tokenPortal = Utilities.getUuid();
    sheet.getRange(item.linha, 24).setValue(tokenPortal); // X = TOKEN_PORTAL
    SpreadsheetApp.flush();
  }
  return { idCliente: String(row[24] || ''), nome: String(row[0] || ''), email: emailLimpo, tokenPortalOriginal: tokenPortal, eSessao: false };
}

function terminarSessaoPortal_(sessao) {
  const info = obterClientePorTokenPortal_(sessao);
  removerTemporarioPortal_(chaveSeguraPortal_('sessao_portal_', sessao));
  removerTemporarioPortal_(chaveSeguraPortal_('acesso_sensivel_', sessao));
  removerTemporarioPortal_(chaveSeguraPortal_('codigo_portal_', sessao));
  removerTemporarioPortal_(chaveSeguraPortal_('codigo_tentativas_', sessao));
  if (info) registarAcessoPortal_(info, 'SESSAO_TERMINADA', 'Terminado pelo cliente');
  return { sucesso: true };
}

function guardarPedidoPrivacidadePortal_(sessao, tipo) {
  const info = obterClientePorTokenPortal_(sessao);
  if (!info || !info.eSessao) throw new Error('SESSAO_INVALIDA');
  const tipoLimpo = String(tipo || '').toUpperCase();
  if (!['EXPORTACAO', 'ELIMINACAO'].includes(tipoLimpo)) throw new Error('TIPO_DE_PEDIDO_INVALIDO');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PEDIDOS_PRIVACIDADE');
  if (!sheet) {
    sheet = ss.insertSheet('PEDIDOS_PRIVACIDADE');
    sheet.appendRow(['DATA_HORA', 'ID_CLIENTE', 'CLIENTE', 'EMAIL', 'PEDIDO', 'ESTADO']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([new Date(), info.idCliente, info.nome, info.email || '', tipoLimpo, 'PENDENTE']);
  const destino = Session.getEffectiveUser().getEmail();
  if (destino) {
    MailApp.sendEmail(destino, 'AL MOVE — pedido de ' + tipoLimpo.toLowerCase(),
      'Cliente: ' + info.nome + '\nID: ' + info.idCliente + '\nEmail: ' + (info.email || '—') + '\nPedido: ' + tipoLimpo);
  }
  registarAcessoPortal_(info, 'PEDIDO_PRIVACIDADE_' + tipoLimpo, 'Pedido registado');
  return { guardado: true, tipo: tipoLimpo };
}

function textoSeguroParaFolhaPortal_(valor, limite) {
  const texto = String(valor == null ? '' : valor).trim().slice(0, limite || 500);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

/**
 * Registo canónico de atividade do Portal. O resto do CRM pode continuar a
 * usar as folhas existentes; novas experiências leem esta interface estável.
 */
function obterSheetEventosPortal_(criarSeFaltar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_EVENTOS_PORTAL');
  const cabecalhos = ['EventId', 'IdCliente', 'Tipo', 'Subtipo', 'OcorreuEm', 'Origem', 'Estado', 'DuracaoMin', 'RPE', 'Carga', 'ReferenciaId', 'Titulo', 'MetadadosJson', 'CriadoEm'];
  if (!sheet && criarSeFaltar) {
    sheet = ss.insertSheet('DB_EVENTOS_PORTAL');
    sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function registarEventoPortal_(info, evento) {
  if (!info || !info.idCliente || !evento || !evento.tipo) return null;
  const sheet = obterSheetEventosPortal_(true);
  const eventId = String(evento.eventId || Utilities.getUuid()).trim().slice(0, 120);
  if (sheet.getLastRow() >= 2) {
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
    if (ids.indexOf(eventId) !== -1) return { eventId: eventId, repetido: true };
  }
  const duracao = evento.duracaoMin === '' || evento.duracaoMin == null ? '' : Math.max(0, Math.min(1440, Number(evento.duracaoMin) || 0));
  const rpe = evento.rpe === '' || evento.rpe == null ? '' : Math.max(0, Math.min(10, Number(evento.rpe) || 0));
  const carga = duracao !== '' && rpe !== '' ? Math.round(duracao * rpe) : '';
  const metadados = evento.metadados && typeof evento.metadados === 'object' ? JSON.stringify(evento.metadados).slice(0, 1500) : '';
  sheet.appendRow([
    textoSeguroParaFolhaPortal_(eventId, 120), info.idCliente,
    textoSeguroParaFolhaPortal_(String(evento.tipo).toUpperCase(), 50), textoSeguroParaFolhaPortal_(evento.subtipo || '', 80),
    evento.ocorreuEm instanceof Date ? evento.ocorreuEm : new Date(evento.ocorreuEm || Date.now()),
    textoSeguroParaFolhaPortal_(evento.origem || 'PORTAL', 30), textoSeguroParaFolhaPortal_(evento.estado || 'CONCLUIDO', 30),
    duracao, rpe, carga, textoSeguroParaFolhaPortal_(evento.referenciaId || '', 120),
    textoSeguroParaFolhaPortal_(evento.titulo || '', 160), textoSeguroParaFolhaPortal_(metadados, 1500), new Date()
  ]);
  return { eventId: eventId, repetido: false };
}

function dataISOEventoPortal_(valor) {
  const data = valor instanceof Date ? valor : new Date(valor);
  return isNaN(data.getTime()) ? '' : Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function getMapaAtividadePortal_(idCliente, semanas) {
  const totalSemanas = Math.max(4, Math.min(52, Number(semanas) || 12));
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const inicio = new Date(hoje);
  // O mapa começa sempre numa segunda-feira para manter as colunas semanais
  // alinhadas em telemóvel, tablet e desktop.
  const diaSemana = inicio.getDay() || 7;
  inicio.setDate(inicio.getDate() - (diaSemana - 1) - (totalSemanas - 1) * 7);
  const porData = {};
  function adicionar(dataISO, evento) {
    if (!dataISO || dataISO < Utilities.formatDate(inicio, Session.getScriptTimeZone(), 'yyyy-MM-dd')) return;
    if (!porData[dataISO]) porData[dataISO] = { data: dataISO, tipos: [], sessoes: 0, duracaoMin: 0, carga: 0, rpe: null, recuperacao: null, titulos: [] };
    const dia = porData[dataISO];
    const tipo = String(evento.tipo || 'TREINO').toUpperCase();
    if (dia.tipos.indexOf(tipo) === -1) dia.tipos.push(tipo);
    const contaComoSessao = /^(TREINO_|SESSAO_MINIMA)/.test(tipo);
    dia.sessoes += contaComoSessao ? Number(evento.sessoes == null ? 1 : evento.sessoes) : 0;
    dia.duracaoMin += Number(evento.duracaoMin || 0);
    dia.carga += Number(evento.carga || 0);
    if (evento.rpe !== '' && evento.rpe != null && isFinite(Number(evento.rpe))) dia.rpe = Math.max(Number(dia.rpe || 0), Number(evento.rpe));
    if (evento.recuperacao !== '' && evento.recuperacao != null && isFinite(Number(evento.recuperacao))) dia.recuperacao = Number(evento.recuperacao);
    if (evento.titulo && dia.titulos.indexOf(String(evento.titulo)) === -1) dia.titulos.push(String(evento.titulo).slice(0, 80));
  }

  const referenciasCanonicas = {};
  const eventos = obterSheetEventosPortal_(false);
  if (eventos && eventos.getLastRow() >= 2) {
    eventos.getRange(2, 1, eventos.getLastRow() - 1, 14).getValues().forEach(row => {
      if (String(row[1]) !== String(idCliente)) return;
      if (row[0]) referenciasCanonicas[String(row[0])] = true;
      if (row[10]) referenciasCanonicas[String(row[10])] = true;
      let metadados = {};
      try { metadados = row[12] ? JSON.parse(String(row[12])) : {}; } catch (erro) {}
      adicionar(dataISOEventoPortal_(row[4]), { tipo: row[2], duracaoMin: row[7], rpe: row[8], carga: row[9], titulo: row[11], recuperacao: metadados.recuperacao });
    });
  }

  // Compatibilidade: preenche o mapa com sessões existentes ainda não
  // migradas para DB_EVENTOS_PORTAL, deduplicadas por IdSessao/data.
  const execucoes = obterOuCriarSheetExecucoes_();
  const vistos = {};
  if (execucoes.getLastRow() >= 2) {
    execucoes.getRange(2, 1, execucoes.getLastRow() - 1, 15).getValues().forEach(row => {
      if (String(row[0]) !== String(idCliente)) return;
      const dataISO = dataISOEventoPortal_(row[3]);
      const chave = String(row[14] || row[11] || (dataISO + '|' + row[2]));
      if (vistos[chave] || referenciasCanonicas[chave] || referenciasCanonicas[String(row[11] || '')]) return;
      vistos[chave] = true;
      adicionar(dataISO, { tipo: String(row[12] || 'AUTONOMO').toUpperCase() === 'PT' ? 'TREINO_PT' : 'TREINO_AUTONOMO', titulo: row[2] });
    });
  }

  const dias = [];
  for (let data = new Date(inicio); data <= hoje; data.setDate(data.getDate() + 1)) {
    const iso = Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    dias.push(porData[iso] || { data: iso, tipos: [], sessoes: 0, duracaoMin: 0, carga: 0, rpe: null, recuperacao: null, titulos: [] });
  }
  return { semanas: totalSemanas, inicio: dias.length ? dias[0].data : '', fim: dias.length ? dias[dias.length - 1].data : '', dias: dias };
}

function obterSheetPassaporteTecnicoPortal_(criarSeFaltar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_PASSAPORTE_TECNICO');
  const cabecalhos = ['IdCliente','Exercicio','Estado','Setup','Amplitude','Controlo','Respiracao','ValidadoEm','Nota','AtualizadoEm'];
  if (!sheet && criarSeFaltar) {
    sheet = ss.insertSheet('DB_PASSAPORTE_TECNICO');
    sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Passaporte técnico do cliente. A prescrição continua a ser a fonte de
 * verdade dos exercícios; a folha guarda apenas a avaliação técnica do PT.
 */
function getPassaporteTecnicoPortal_(idCliente) {
  const prescritos = {};
  const planos = (getListaPlanosCliente(idCliente).planos || []).filter(plano => plano.visibilidade !== 'PT');
  planos.forEach(plano => {
    const treinos = getTreinosDoPlano(idCliente, plano.nome).treinos || [];
    treinos.forEach(treino => {
      const detalhe = getTreinoDetalhe(idCliente, plano.nome, treino.nome);
      (detalhe.exercicios || []).forEach(exercicio => {
        const nome = String(exercicio.exercicio || '').trim();
        if (nome) prescritos[nome.toLowerCase()] = nome;
      });
    });
  });

  const avaliados = {};
  const sheet = obterSheetPassaporteTecnicoPortal_(false);
  if (sheet && sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues().forEach(row => {
      if (String(row[0]) !== String(idCliente) || !String(row[1] || '').trim()) return;
      avaliados[String(row[1]).trim().toLowerCase()] = {
        exercicio: String(row[1]).trim(), estado: String(row[2] || 'EM_PRATICA').toUpperCase(),
        setup: Math.max(0, Math.min(3, Number(row[3]) || 0)), amplitude: Math.max(0, Math.min(3, Number(row[4]) || 0)),
        controlo: Math.max(0, Math.min(3, Number(row[5]) || 0)), respiracao: Math.max(0, Math.min(3, Number(row[6]) || 0)),
        validadoEm: dataISOEventoPortal_(row[7]), nota: String(row[8] || '').slice(0, 300)
      };
    });
  }

  const chaves = Object.keys(prescritos);
  Object.keys(avaliados).forEach(chave => { if (chaves.indexOf(chave) === -1) chaves.push(chave); });
  const exercicios = chaves.slice(0, 60).map(chave => {
    const item = avaliados[chave] || { exercicio: prescritos[chave], estado:'EM_PRATICA', setup:0, amplitude:0, controlo:0, respiracao:0, validadoEm:'', nota:'' };
    item.pontuacao = item.setup + item.amplitude + item.controlo + item.respiracao;
    item.percentagem = Math.round(item.pontuacao / 12 * 100);
    return item;
  });
  const dominados = exercicios.filter(item => item.estado === 'DOMINADO' || item.percentagem >= 85).length;
  return { exercicios: exercicios, total: exercicios.length, dominados: dominados };
}

function registarSessaoMinimaPortal_(token, dados) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('SESSAO_INVALIDA');
  const temPlanoPrescrito = (getListaPlanosCliente(info.idCliente).planos || []).some(plano => plano.visibilidade !== 'PT');
  if (!temPlanoPrescrito) throw new Error('SESSAO_MINIMA_SEM_PLANO_PRESCRITO');
  const minutos = [12, 20].indexOf(Number(dados.minutos)) !== -1 ? Number(dados.minutos) : 12;
  const rpe = Math.max(1, Math.min(10, Number(dados.rpe) || 4));
  return Object.assign({ sucesso: true }, registarEventoPortal_(info, {
    eventId: dados.eventId,
    tipo: 'SESSAO_MINIMA',
    subtipo: minutos + '_MIN',
    duracaoMin: minutos,
    rpe: rpe,
    titulo: minutos + ' min · sessão adaptada',
    metadados: { motivo: String(dados.motivo || '').slice(0, 120) }
  }));
}

const AVATARES_PORTAL_IDS_ = ['onda','pulso','norte','ritmo','foco','atlas','terra','zenite','brava','vector'];
const AVATARES_PORTAL_ESTILOS_ = ['curto','fade','longo','caracois','coque'];

function obterSheetAvataresPortal_(criarSeFaltar) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_AVATARES_PORTAL');
  if (!sheet && criarSeFaltar) {
    sheet = ss.insertSheet('DB_AVATARES_PORTAL');
    sheet.getRange(1, 1, 1, 9).setValues([['IdCliente','Tipo','Preset','Pele','Cabelo','Camisola','Fundo','Estilo','FileId']]).setFontWeight('bold');
    sheet.getRange(1, 10).setValue('AtualizadoEm');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function obterPastaAvataresPortal_() {
  const nome = 'AL MOVE - Avatares clientes';
  const existentes = DriveApp.getFoldersByName(nome);
  return existentes.hasNext() ? existentes.next() : DriveApp.createFolder(nome);
}

function normalizarCorAvatarPortal_(valor, alternativa) {
  const texto = String(valor || '');
  return /^#[0-9a-f]{6}$/i.test(texto) ? texto.toLowerCase() : alternativa;
}

function getAvatarPortal_(idCliente) {
  const sheet = obterSheetAvataresPortal_(false);
  if (!sheet || sheet.getLastRow() < 2) return { tipo:'preset', preset:'onda' };
  const linhas = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  const row = linhas.slice().reverse().find(linha => String(linha[0]) === String(idCliente));
  if (!row) return { tipo:'preset', preset:'onda' };
  const resposta = {
    tipo: String(row[1] || 'preset'), preset: String(row[2] || 'onda'), pele: String(row[3] || ''),
    cabelo: String(row[4] || ''), camisola: String(row[5] || ''), fundo: String(row[6] || ''), estilo: String(row[7] || '')
  };
  if (resposta.tipo === 'foto' && row[8]) {
    try {
      const blob = DriveApp.getFileById(String(row[8])).getBlob();
      resposta.fotoData = 'data:' + (blob.getContentType() || 'image/webp') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (erro) {
      Logger.log('Avatar sem ficheiro disponível: ' + erro.toString());
      resposta.tipo = 'preset';
    }
  }
  return resposta;
}

function guardarAvatarPortal_(token, dados) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('SESSAO_INVALIDA');
  const tipo = ['preset','personalizado','foto'].indexOf(String(dados.tipo)) >= 0 ? String(dados.tipo) : 'preset';
  const preset = AVATARES_PORTAL_IDS_.indexOf(String(dados.preset)) >= 0 ? String(dados.preset) : 'onda';
  const estilo = AVATARES_PORTAL_ESTILOS_.indexOf(String(dados.estilo)) >= 0 ? String(dados.estilo) : 'curto';
  const sheet = obterSheetAvataresPortal_(true);
  const linhas = sheet.getLastRow() >= 2 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues() : [];
  const indice = linhas.findIndex(linha => String(linha[0]) === String(info.idCliente));
  const anterior = indice >= 0 ? linhas[indice] : null;
  let fileId = anterior ? String(anterior[8] || '') : '';

  if (tipo === 'foto') {
    const correspondencia = String(dados.fotoData || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!correspondencia || correspondencia[2].length > 160000) throw new Error('FOTO_INVALIDA_OU_DEMASIADO_GRANDE');
    const bytes = Utilities.base64Decode(correspondencia[2]);
    if (bytes.length > 120000) throw new Error('FOTO_DEMASIADO_GRANDE');
    const mime = 'image/' + correspondencia[1].toLowerCase();
    const extensao = correspondencia[1].toLowerCase() === 'jpeg' ? 'jpg' : correspondencia[1].toLowerCase();
    const blob = Utilities.newBlob(bytes, mime, 'avatar-' + info.idCliente + '.' + extensao);
    const ficheiro = obterPastaAvataresPortal_().createFile(blob);
    if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (erro) {} }
    fileId = ficheiro.getId();
  } else if (fileId) {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (erro) {}
    fileId = '';
  }

  const registo = [
    info.idCliente, tipo, preset,
    normalizarCorAvatarPortal_(dados.pele, '#f2c6a0'), normalizarCorAvatarPortal_(dados.cabelo, '#18273d'),
    normalizarCorAvatarPortal_(dados.camisola, '#19c8b1'), normalizarCorAvatarPortal_(dados.fundo, '#0b5cc2'),
    estilo, fileId, new Date()
  ];
  if (indice >= 0) sheet.getRange(indice + 2, 1, 1, registo.length).setValues([registo]);
  else sheet.appendRow(registo);
  registarAcessoPortal_(info, 'AVATAR_ATUALIZADO', tipo === 'foto' ? 'Fotografia reduzida no dispositivo' : tipo);
  return getAvatarPortal_(info.idCliente);
}

function guardarPedidoAtualizacaoDadosPortal_(sessao, dados) {
  const info = obterClientePorTokenPortal_(sessao);
  if (!info || !info.eSessao) throw new Error('SESSAO_INVALIDA');

  const nome = String(dados.nome || '').trim();
  const contacto = String(dados.contacto || '').trim();
  const email = String(dados.email || '').trim().toLowerCase();
  const dataNascimento = String(dados.dataNascimento || '').trim();
  const genero = String(dados.genero || '').trim();
  const morada = String(dados.morada || '').trim();
  const nota = String(dados.nota || '').trim();
  const requestId = String(dados.eventId || '').trim().slice(0, 120);

  if (nome.length < 2 || nome.length > 120) throw new Error('NOME_INVALIDO');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error('EMAIL_INVALIDO');
  if (contacto.length > 30 || morada.length > 240 || nota.length > 500) throw new Error('DADOS_DEMASIADO_LONGOS');
  if (dataNascimento && !/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) throw new Error('DATA_NASCIMENTO_INVALIDA');
  if (genero && ['Feminino', 'Masculino', 'Outro'].indexOf(genero) === -1) throw new Error('GENERO_INVALIDO');

  const cache = CacheService.getScriptCache();
  const limiteKey = chaveSeguraPortal_('pedido_dados_', info.idCliente);
  if (cache.get(limiteKey)) throw new Error('AGUARDA_ANTES_DE_REENVIAR');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('PEDIDOS_ATUALIZACAO_DADOS');
    if (!sheet) {
      sheet = ss.insertSheet('PEDIDOS_ATUALIZACAO_DADOS');
      sheet.appendRow(['DATA_HORA', 'ID_CLIENTE', 'CLIENTE_ATUAL', 'EMAIL_ATUAL', 'NOME_PEDIDO', 'CONTACTO_PEDIDO', 'EMAIL_PEDIDO', 'DATA_NASCIMENTO_PEDIDO', 'GENERO_PEDIDO', 'MORADA_PEDIDO', 'NOTA', 'ESTADO', 'REQUEST_ID']);
      sheet.setFrozenRows(1);
    }
    if (requestId && sheet.getLastRow() >= 2) {
      const ids = sheet.getRange(2, 13, sheet.getLastRow() - 1, 1).getDisplayValues().flat();
      if (ids.indexOf(requestId) !== -1) return { guardado:true, repetido:true, estado:'PENDENTE' };
    }
    sheet.appendRow([
      new Date(), info.idCliente, textoSeguroParaFolhaPortal_(info.nome, 120), textoSeguroParaFolhaPortal_(info.email, 160),
      textoSeguroParaFolhaPortal_(nome, 120), textoSeguroParaFolhaPortal_(contacto, 30), textoSeguroParaFolhaPortal_(email, 160),
      textoSeguroParaFolhaPortal_(dataNascimento, 10), textoSeguroParaFolhaPortal_(genero, 20), textoSeguroParaFolhaPortal_(morada, 240),
      textoSeguroParaFolhaPortal_(nota, 500), 'PENDENTE', textoSeguroParaFolhaPortal_(requestId, 120)
    ]);
    cache.put(limiteKey, '1', 60);

    let emailEnviado = false;
    const destino = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
    if (destino) {
      try {
        MailApp.sendEmail({
          to: destino,
          subject: 'AL MOVE — pedido de alteração de dados: ' + nome,
          body: [
            'Cliente: ' + info.nome,
            'ID: ' + info.idCliente,
            '',
            'Nome pedido: ' + nome,
            'Contacto pedido: ' + (contacto || '—'),
            'Email pedido: ' + email,
            'Data de nascimento: ' + (dataNascimento || '—'),
            'Género: ' + (genero || '—'),
            'Morada: ' + (morada || '—'),
            'Notas: ' + (nota || '—'),
            '',
            'Confirma os dados antes de os aplicares na ficha do cliente.'
          ].join('\n')
        });
        emailEnviado = true;
      } catch (erroEmail) {
        Logger.log('Pedido de dados guardado, mas o email falhou: ' + erroEmail.toString());
      }
    }
    registarAcessoPortal_(info, 'PEDIDO_ATUALIZACAO_DADOS', 'Pedido pendente de confirmação');
    return { guardado:true, estado:'PENDENTE', emailEnviado:emailEnviado };
  } finally {
    lock.releaseLock();
  }
}

function pedirCodigoAcessoPortal_(sessao) {
  const info = obterClientePorTokenPortal_(sessao);
  if (!info || !info.eSessao) throw new Error('SESSAO_INVALIDA');
  if (!info.email) throw new Error('EMAIL_EM_FALTA');
  const cache = CacheService.getScriptCache();
  const limiteKey = chaveSeguraPortal_('codigo_limite_', info.idCliente);
  if (cache.get(limiteKey)) throw new Error('AGUARDA_ANTES_DE_REENVIAR');
  const bloqueio = lerTemporarioPortal_(chaveSeguraPortal_('codigo_bloqueio_', sessao));
  if (bloqueio) throw new Error('CODIGO_TEMPORARIAMENTE_BLOQUEADO');
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  guardarTemporarioPortal_(chaveSeguraPortal_('codigo_portal_', sessao), chaveSeguraPortal_('hash_', codigo), DURACAO_CODIGO_PORTAL_SEGUNDOS_);
  removerTemporarioPortal_(chaveSeguraPortal_('codigo_tentativas_', sessao));
  cache.put(limiteKey, '1', 60);
  MailApp.sendEmail({
    to: info.email,
    subject: 'AL MOVE — código de acesso',
    body: 'O teu código temporário é ' + codigo + '. É válido durante 10 minutos.\n\nSe não pediste este código, ignora este email.'
  });
  registarAcessoPortal_(info, 'CODIGO_ENVIADO', mascararEmailPortal_(info.email));
  return { enviado: true, email: mascararEmailPortal_(info.email), validoDuranteMinutos: 10 };
}

function validarCodigoAcessoPortal_(sessao, codigo) {
  const info = obterClientePorTokenPortal_(sessao);
  if (!info || !info.eSessao) throw new Error('SESSAO_INVALIDA');
  const codigoLimpo = String(codigo || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(codigoLimpo)) throw new Error('CODIGO_INVALIDO');
  if (lerTemporarioPortal_(chaveSeguraPortal_('codigo_bloqueio_', sessao))) throw new Error('CODIGO_TEMPORARIAMENTE_BLOQUEADO');
  const chaveCodigo = chaveSeguraPortal_('codigo_portal_', sessao);
  const esperado = lerTemporarioPortal_(chaveCodigo);
  if (!esperado || esperado !== chaveSeguraPortal_('hash_', codigoLimpo)) {
    const chaveTentativas = chaveSeguraPortal_('codigo_tentativas_', sessao);
    const tentativas = Number(lerTemporarioPortal_(chaveTentativas) || 0) + 1;
    if (tentativas >= MAX_TENTATIVAS_CODIGO_PORTAL_) {
      removerTemporarioPortal_(chaveCodigo);
      removerTemporarioPortal_(chaveTentativas);
      guardarTemporarioPortal_(chaveSeguraPortal_('codigo_bloqueio_', sessao), '1', BLOQUEIO_CODIGO_PORTAL_SEGUNDOS_);
      registarAcessoPortal_(info, 'CODIGO_BLOQUEADO', 'Cinco tentativas incorretas');
      throw new Error('CODIGO_TEMPORARIAMENTE_BLOQUEADO');
    }
    guardarTemporarioPortal_(chaveTentativas, tentativas, DURACAO_CODIGO_PORTAL_SEGUNDOS_);
    registarAcessoPortal_(info, 'CODIGO_REJEITADO', 'Código incorreto ou expirado');
    throw new Error('CODIGO_INVALIDO_OU_EXPIRADO');
  }
  removerTemporarioPortal_(chaveCodigo);
  removerTemporarioPortal_(chaveSeguraPortal_('codigo_tentativas_', sessao));
  guardarTemporarioPortal_(chaveSeguraPortal_('acesso_sensivel_', sessao), '1', DURACAO_ACESSO_SENSIVEL_SEGUNDOS_);
  registarAcessoPortal_(info, 'ACESSO_SENSIVEL_VALIDADO', 'Válido durante 30 minutos');
  return { validado: true, validoDuranteMinutos: 30 };
}

function exigirAcessoSensivelPortal_(sessao) {
  // A sessão autenticada pelo Firebase já identifica o cliente e substitui o
  // antigo código por email no uso diário. Mantemos a validação da sessão e a
  // autorização por cliente em todas as operações sensíveis.
  const info = obterClientePorTokenPortal_(sessao);
  if (!info || !info.eSessao) throw new Error('SESSAO_INVALIDA');
  return info;
}

function verificarLimitePortal_(token, nomeFuncao) {
  const cache = CacheService.getScriptCache();
  const janela = Math.floor(Date.now() / 60000);
  const chave = chaveSeguraPortal_('limite_' + janela + '_' + nomeFuncao + '_', token);
  const atual = Number(cache.get(chave) || 0) + 1;
  const limite = /^(get|marcar)/.test(nomeFuncao) ? 120 : 20;
  if (atual > limite) throw new Error('LIMITE_DE_PEDIDOS_ATINGIDO');
  cache.put(chave, String(atual), 90);
}

function responderApiJSON_(corpo) {
  return ContentService
    .createTextOutput(JSON.stringify(corpo))
    .setMimeType(ContentService.MimeType.JSON);
}

function validarEstruturaPedidoPortal_(valor, profundidade) {
  const nivel = Number(profundidade || 0);
  if (nivel > 5) throw new Error('Pedido demasiado complexo');
  if (typeof valor === 'string' && valor.length > 2000) throw new Error('Campo demasiado longo');
  if (Array.isArray(valor)) {
    if (valor.length > 200) throw new Error('Demasiados elementos no pedido');
    valor.forEach(item => validarEstruturaPedidoPortal_(item, nivel + 1));
  } else if (valor && typeof valor === 'object') {
    const chaves = Object.keys(valor);
    if (chaves.length > 60) throw new Error('Demasiados campos no pedido');
    chaves.forEach(chave => {
      if (['__proto__', 'prototype', 'constructor'].includes(chave)) throw new Error('Campo inválido');
      validarEstruturaPedidoPortal_(valor[chave], nivel + 1);
    });
  }
}

const FUNCOES_LEITURA_PORTAL_ = new Set([
  'getBootstrapPortal', 'getProgressoBootstrapPortal', 'getEstadoPortalHoje',
  'getAvaliacaoFisicaPortal', 'getHistoricoAvaliacoesFisicasPortal', 'getPesosDiariosPortal',
  'getPedidoAvaliacaoPortal', 'getAgendaPortal', 'getPlanoAtivoPortal',
  'getResumoInicioPortal', 'getResumoConquistasPortal', 'getMetricasAtividadePortal',
  'getNotificacoesPortal', 'getResumoPassosPortal', 'getResumoOpcoesPortal', 'getDadosPessoaisPortal',
  'getMapaAtividadePortal', 'getPassaporteTecnicoPortal', 'getHistoricoExercicio'
]);
const FUNCOES_PUBLICAS_PORTAL_ = new Set();

function tratarPedidoApi_(e) {
  try {
    const conteudoPost = (e.postData && e.postData.contents) ? String(e.postData.contents) : '';
    if (conteudoPost.length > 180000) return responderApiJSON_({ ok: false, erro: 'Pedido demasiado grande' });
    const corpoPost = conteudoPost
      ? JSON.parse(conteudoPost)
      : ((e.parameter && e.parameter.data) ? JSON.parse(String(e.parameter.data).slice(0, 8000)) : {});
    const nomeFuncao = (e.parameter && e.parameter.fn) || corpoPost.fn;
    const token = (e.parameter && e.parameter.token) || corpoPost.token;

    if (!/^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(String(nomeFuncao || ''))) {
      return responderApiJSON_({ ok: false, erro: 'Função inválida' });
    }
    const limiteToken = String(token || '').indexOf('fb1.') === 0 ? 1200 : 200;
    if (String(token || '').length > limiteToken) return responderApiJSON_({ ok: false, erro: 'Token inválido' });
    if (conteudoPost.length > 50000) throw new Error('Pedido demasiado grande');
    validarEstruturaPedidoPortal_(corpoPost, 0);

    const funcao = API_FUNCOES_PORTAL[nomeFuncao];
    if (!funcao) return responderApiJSON_({ ok: false, erro: 'Função desconhecida: ' + nomeFuncao });
    if (!token && !FUNCOES_PUBLICAS_PORTAL_.has(nomeFuncao)) return responderApiJSON_({ ok: false, erro: 'Falta o token do cliente' });
    const eLeituraGet = !conteudoPost;
    if (eLeituraGet && !FUNCOES_LEITURA_PORTAL_.has(nomeFuncao)) {
      return responderApiJSON_({ ok: false, erro: 'Esta operação exige POST' });
    }
    verificarLimitePortal_(token || corpoPost.email || corpoPost.codigo || 'publico', nomeFuncao);

    const dados = funcao(token, corpoPost);
    if (!FUNCOES_LEITURA_PORTAL_.has(nomeFuncao) && !/^(pedirCodigo|validarCodigo|terminarSessao)/.test(nomeFuncao)) {
      const info = obterClientePorTokenPortal_(token);
      if (info) registarAcessoPortal_(info, 'ALTERACAO_' + nomeFuncao.toUpperCase(), 'Operação guardada no portal');
    }
    return responderApiJSON_({ ok: true, dados: dados });
  } catch (erro) {
    return responderApiJSON_({ ok: false, erro: erro.message || String(erro) });
  }
}

function doPost(e) {
  return tratarPedidoApi_(e);
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.api) {
      return tratarPedidoApi_(e);
    }

    // Se o link tiver ?assinar=TOKEN, mostra a página pública de assinatura
    // em vez do CRM — usada para o cliente aceitar o contrato digitalmente.
    if (e && e.parameter && e.parameter.assinar) {
      return servirPaginaAssinatura_(e.parameter.assinar);
    }

    // Os links permanentes do portal foram retirados. Mantemos uma página de
    // transição para que favoritos antigos conduzam ao acesso por email.
    if (e && e.parameter && e.parameter.portal) {
      return HtmlService.createHtmlOutput(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<script>location.replace("https://portal.almove.pt/");</script>' +
        '<p>Abre <a href="https://portal.almove.pt/">portal.almove.pt</a> e entra com o teu email.</p>'
      ).setTitle('AL MOVE');
    }

    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('AL MOVE — CRM')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (error) {
    return HtmlService.createHtmlOutput(
      '<h1>Erro ao carregar app</h1><p>' + error.toString() + '</p>'
    );
  }
}

/**
 * ================= PORTAL DO CLIENTE (só leitura, sem login) =================
 * Link único e estável por cliente, gerado uma vez e guardado na coluna X
 * (TOKEN_PORTAL) — independente do token de assinatura do contrato, para
 * não partir se o contrato for apagado/gerado de novo. Mostra ao cliente,
 * sem ele instalar nada nem ter conta: sessões deste mês, estado do pack,
 * marcos/sequência, e o contrato assinado.
 */

function obterOuCriarTokenPortal_(idCliente) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();

  for (let i = 0; i < clientesData.length; i++) {
    if (String(clientesData[i][24]) === String(idCliente)) {
      const tokenExistente = clientesData[i][23] ? String(clientesData[i][23]).trim() : '';
      if (tokenExistente) return tokenExistente;
      const novoToken = Utilities.getUuid();
      sheet.getRange(i + 4, 24).setValue(novoToken); // coluna X = TOKEN_PORTAL
      return novoToken;
    }
  }
  throw new Error('Cliente não encontrado');
}

/**
 * Chamada pelo frontend (botão "Copiar link do portal" no perfil do
 * cliente) — devolve o URL completo, criando o token se ainda não existir.
 */
const URL_PORTAL_CLIENTE_PUBLICO_ = 'https://portal.almove.pt/?portal=';

function pedirLinkConviteFirebasePortal_(info) {
  const segredo = PropertiesService.getScriptProperties().getProperty('PORTAL_APPS_SCRIPT_HMAC_SECRET');
  if (!segredo || String(segredo).length < 32) throw new Error('CONFIGURACAO_FIREBASE_EM_FALTA');
  const email = String(info.email || '').trim().toLowerCase();
  const clientId = String(info.idCliente || '').trim();
  const timestamp = Date.now();
  const texto = clientId + '\n' + email + '\n' + timestamp;
  const assinatura = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, segredo)).replace(/=+$/g, '');
  const resposta = UrlFetchApp.fetch('https://portal.almove.pt/api/invite', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ clientId: clientId, email: email, timestamp: timestamp, assinatura: assinatura }),
    muteHttpExceptions: true
  });
  if (resposta.getResponseCode() !== 200) throw new Error('NAO_FOI_POSSIVEL_GERAR_CONVITE');
  const dados = JSON.parse(resposta.getContentText() || '{}');
  if (!dados.ok || !/^https:\/\//.test(String(dados.link || ''))) throw new Error('NAO_FOI_POSSIVEL_GERAR_CONVITE');
  return String(dados.link);
}

/** Confirma a ligação CRM → Vercel → Firebase sem enviar email nem alterar contas. */
function diagnosticarConviteFirebasePortal_() {
  const segredo = PropertiesService.getScriptProperties().getProperty('PORTAL_APPS_SCRIPT_HMAC_SECRET');
  if (!segredo || String(segredo).length < 32) throw new Error('CONFIGURACAO_FIREBASE_EM_FALTA');
  const email = 'diagnostico@almove.invalid';
  const clientId = 'diagnostico';
  const timestamp = Date.now();
  const texto = clientId + '\n' + email + '\n' + timestamp;
  const assinatura = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(texto, segredo)).replace(/=+$/g, '');
  const resposta = UrlFetchApp.fetch('https://portal.almove.pt/api/invite', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ clientId: clientId, email: email, timestamp: timestamp, assinatura: assinatura, operacao: 'verificar' }),
    muteHttpExceptions: true
  });
  const dados = JSON.parse(resposta.getContentText() || '{}');
  if (resposta.getResponseCode() !== 200 || !dados.ok || !dados.firebase) throw new Error('LIGACAO_FIREBASE_INDISPONIVEL');
  return { ok: true, firebase: true };
}

function enviarConvitePortalCliente(idCliente) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CLIENTES');
  if (!sheet || sheet.getLastRow() < 4) throw new Error('Cliente não encontrado');
  const clientes = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  for (let i = 0; i < clientes.length; i++) {
    const row = clientes[i];
    if (String(row[24] || '') !== String(idCliente)) continue;
    const info = obterClientePorEmailPortal_(row[18]);
    if (!info) throw new Error('Este cliente não tem um email válido associado ao Portal.');
    if (info.duplicado) throw new Error('Este email está associado a mais do que um cliente ativo. Corrige o email antes de enviar o convite.');
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('LIMITE_DIARIO_EMAIL_ATINGIDO');
    const cache = CacheService.getScriptCache();
    const chaveLimite = chaveSeguraPortal_('convite_firebase_', info.email);
    if (cache.get(chaveLimite)) throw new Error('AGUARDA_UM_MINUTO_PARA_REENVIAR');
    const link = pedirLinkConviteFirebasePortal_(info);
    cache.put(chaveLimite, '1', 60);
    const nome = escaparHtml_(String(info.nome || '').split(' ')[0]);
    MailApp.sendEmail({
      to: info.email,
      name: 'AL MOVE',
      subject: 'AL MOVE — cria o teu acesso ao portal',
      body: 'Olá ' + String(info.nome || '').split(' ')[0] + ',\n\nO teu acesso ao Portal AL MOVE está pronto. Abre este link seguro para escolheres a tua palavra-passe:\n' + link + '\n\nDepois entra em https://portal.almove.pt/ com este email e a palavra-passe que escolheste.\n\nSe não esperavas este convite, ignora este email.',
      htmlBody: '<div style="font-family:Arial,sans-serif;color:#0b1b2e;line-height:1.6;max-width:520px">' +
        '<h2 style="margin:0 0 12px">O teu Portal AL MOVE está pronto</h2>' +
        '<p>Olá ' + nome + ',</p>' +
        '<p>Escolhe a tua palavra-passe para acompanhar treinos, agenda e progresso.</p>' +
        '<p style="margin:24px 0"><a href="' + link + '" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#079bbf;color:#fff;text-decoration:none;font-weight:700">Definir palavra-passe</a></p>' +
        '<p>Depois entra em <a href="https://portal.almove.pt/">portal.almove.pt</a> com este email e a palavra-passe que escolheste.</p>' +
        '<p style="font-size:12px;color:#718096">Se não esperavas este convite, ignora este email.</p></div>'
    });
    registarAcessoPortal_(info, 'CONVITE_FIREBASE_ENVIADO', 'Link seguro para definir palavra-passe enviado');
    return { enviado: true, email: info.email };
  }
  throw new Error('Cliente não encontrado');
}

function obterLinkPortalCliente(idCliente) {
  return 'https://portal.almove.pt/';
}

function revogarERegenerarTokenPortal(idCliente) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const dados = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    for (let i = 0; i < dados.length; i++) {
      if (String(dados[i][24]) !== String(idCliente)) continue;
      const tokenAntigo = String(dados[i][23] || '').trim();
      const novoToken = Utilities.getUuid();
      sheet.getRange(i + 4, 24).setValue(novoToken);
      if (tokenAntigo) PropertiesService.getScriptProperties().setProperty(chaveSeguraPortal_('token_revogado_', tokenAntigo), new Date().toISOString());
      const info = { idCliente: String(idCliente), nome: String(dados[i][0] || '') };
      registarAcessoPortal_(info, 'LINK_REGENERADO', tokenAntigo ? 'O link anterior foi revogado.' : 'Primeiro link criado.');
      return { link: 'https://portal.almove.pt/', criadoEm: new Date().toISOString(), acesso: 'Envia um convite por email para iniciar sessão.' };
    }
    throw new Error('Cliente não encontrado');
  } finally {
    lock.releaseLock();
  }
}

function getHistoricoAcessosPortal(idCliente, limite) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ACESSOS_PORTAL');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
  return dados.filter(linha => String(linha[1]) === String(idCliente)).slice(-Math.max(1, Math.min(Number(limite) || 20, 100))).reverse().map(linha => ({
    dataHora: linha[0], evento: linha[3], detalhe: linha[4]
  }));
}

function obterClientePorTokenPortal_(token) {
  const tokenLimpo = String(token || '').trim();
  if (!tokenLimpo) return null;
  const clienteFirebase = obterClientePorAssertacaoFirebasePortal_(tokenLimpo);
  if (clienteFirebase) return clienteFirebase;
  const sessaoGuardada = lerTemporarioPortal_(chaveSeguraPortal_('sessao_portal_', tokenLimpo));
  if (sessaoGuardada) {
    try {
      const sessao = typeof sessaoGuardada === 'string' ? JSON.parse(sessaoGuardada) : sessaoGuardada;
      if (sessao.tokenPortalOriginal && PropertiesService.getScriptProperties().getProperty(chaveSeguraPortal_('token_revogado_', sessao.tokenPortalOriginal))) return null;
      if (!sessao.expiraEm || new Date(sessao.expiraEm).getTime() > Date.now()) return sessao;
    } catch (erro) {
      Logger.log('Sessão do portal inválida: ' + erro.toString());
    }
    return null;
  }
  // Só sessões criadas a partir do link temporário de email podem autenticar
  // pedidos. Um token permanente copiado de uma URL deixou de dar acesso.
  return null;
}

/**
 * A Vercel valida o ID token Firebase e envia para aqui apenas uma assertacao
 * de cinco minutos, assinada com PORTAL_APPS_SCRIPT_HMAC_SECRET. Assim o Apps
 * Script nao precisa de chaves de servico Firebase nem aceita tokens do browser.
 */
function obterClientePorAssertacaoFirebasePortal_(token) {
  const partes = String(token || '').match(/^fb1\.([A-Za-z0-9_-]{20,1000})\.([A-Za-z0-9_-]{20,100})$/);
  if (!partes) return null;
  const segredo = PropertiesService.getScriptProperties().getProperty('PORTAL_APPS_SCRIPT_HMAC_SECRET');
  if (!segredo || String(segredo).length < 32) return null;
  const corpo = partes[1];
  const assinaturaRecebida = partes[2];
  const assinaturaEsperada = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(corpo, segredo)
  ).replace(/=+$/g, '');
  if (assinaturaRecebida !== assinaturaEsperada) return null;

  try {
    const dados = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(corpo)).getDataAsString('UTF-8'));
    const agora = Math.floor(Date.now() / 1000);
    const email = String(dados.email || '').trim().toLowerCase();
    if (
      dados.v !== 1 ||
      !dados.exp || Number(dados.exp) < agora ||
      !dados.iat || Number(dados.iat) > agora + 60 ||
      !/^[A-Za-z0-9_-]{6,128}$/.test(String(dados.uid || '')) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) return null;
    // No piloto o email Firebase confirmado identifica o cliente. A função
    // recusa duplicados e clientes cancelados; assim uma conta só entra se o
    // email existir uma única vez no CRM.
    const cliente = obterClientePorEmailPortal_(email);
    if (!cliente || cliente.duplicado || !cliente.idCliente) return null;
    return Object.assign({}, cliente, {
      tokenPortalOriginal: 'firebase:' + String(dados.uid),
      eSessao: true,
      autenticacao: 'firebase'
    });
  } catch (erro) {
    Logger.log('Assertacao Firebase inválida: ' + erro.toString());
  }
  return null;
}

function servirPortalCliente_(token) {
  const info = obterClientePorTokenPortal_(token);
  const template = HtmlService.createTemplateFromFile('Portal');

  if (!info) {
    template.encontrado = false;
    template.nomeCliente = '';
    template.logoBase64 = LOGO_AL_MOVE_BASE64;
  } else {
    const dadosMes = getResumoMensalParaPortal_(info.idCliente);
    const marcos = getResumoMarcosAutoTreino_(info.idCliente);

    template.encontrado = true;
    template.nomeCliente = info.nome;
    template.logoBase64 = LOGO_AL_MOVE_BASE64;
    template.mesFormatado = dadosMes.mesFormatado;
    template.temPack = dadosMes.temPack;
    template.frequencia = dadosMes.frequencia;
    template.sessoesConfirmadas = dadosMes.sessoesConfirmadas;
    template.sessoesTotal = dadosMes.sessoesTotal;
    template.estadoPagamento = dadosMes.estadoPagamento;
    template.totalSessoesConfirmadas = marcos.totalTreinos;
    template.marcoAtingido = marcos.marcoAtingido;
    template.streakSemanas = marcos.streakSemanas;
    template.proximoMarco = marcos.proximoMarco || '';
    template.contratoUrl = info.contratoFileId ? ('https://drive.google.com/file/d/' + info.contratoFileId + '/view') : '';
    template.assinaturaAceiteEm = info.assinaturaAceiteEmRaw ? formatarDataHoraPorExtenso_(info.assinaturaAceiteEmRaw) : '';
    template.token = token;

    const checkinHoje = getCheckinDeHoje_(info.idCliente);
    template.jaFezCheckinHoje = !!checkinHoje;
    template.checkinHoje = checkinHoje || {};
    template.testeProntidaoHoje = getTesteProntidaoHoje_(info.idCliente);

    // O Portal nunca recebe planos exclusivos de PT. Planos históricos sem
    // coluna de visibilidade mantêm-se disponíveis, por compatibilidade.
    const listaPlanos = (getListaPlanosCliente(info.idCliente).planos || []).filter(p => p.visibilidade !== 'PT');
    template.temPlanos = listaPlanos.length > 0;
    template.planosCliente = listaPlanos.map(p => {
      const treinos = getTreinosDoPlano(info.idCliente, p.nome).treinos || [];
      const statusTreinos = getStatusTreinosPlano(info.idCliente, p.nome).treinos || [];
      const statusPorNome = {};
      statusTreinos.forEach(s => { statusPorNome[s.nome] = s; });
      const treinosComExercicios = treinos.map(t => {
        const detalhe = getTreinoDetalhe(info.idCliente, p.nome, t.nome);
        const status = statusPorNome[t.nome] || { feitoAntes: false, diasDesde: null };
        return { nome: t.nome, exercicios: detalhe.exercicios, feitoAntes: status.feitoAntes, diasDesde: status.diasDesde, dataRealizacao: status.dataRealizacao || '' };
      });
      return { nome: p.nome, atualizadoEm: p.atualizadoEm, validoAte: p.validoAte, expirado: p.diasRestantes !== null && p.diasRestantes < 0, treinos: treinosComExercicios };
    });
    // O plano mais recentemente atualizado é o "atual" para efeitos do ecrã "Hoje"
    template.planoAtivoNome = listaPlanos.length > 0
      ? listaPlanos.slice().sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0].nome
      : '';
    template.resumoSemanal = getResumoSemanal(info.idCliente, template.planoAtivoNome);
    template.ultimosCheckins = getUltimosCheckinsPortal_(info.idCliente, 5);
    template.passosPortal = getResumoPassosPortal_(info.idCliente);
    template.relatorioMensal = getRelatorioMensalPortal_(info.idCliente);
    template.modoEspecial = obterModoEspecialCliente_(info.idCliente);
  }

  return template.evaluate()
    .setTitle('O meu progresso — AL MOVE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getResumoMensalParaPortal_(idCliente) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mesAtual = getMesAnoAtual();
  const precos = getPrecosServicos();

  const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
  const packsData = packsSheet.getRange('A2:H' + packsSheet.getLastRow()).getValues();

  let packDoMs = null;
  for (let i = 0; i < packsData.length; i++) {
    const row = packsData[i];
    if (String(row[0]) === String(idCliente) && normalizarMesAno(row[1]) === mesAtual) {
      packDoMs = row;
      break;
    }
  }

  if (!packDoMs) {
    return { mesFormatado: formatarMesAno(mesAtual), temPack: false, frequencia: '', sessoesConfirmadas: 0, sessoesTotal: 0, estadoPagamento: '' };
  }

  const sessoesSheet = ss.getSheetByName('DB_SESSOES');
  const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
  const sessoesConfirmadas = sessoesData.filter(s =>
    String(s[0]) === String(idCliente) && normalizarMesAno(s[1]) === mesAtual && String(s[4]) === 'Confirmada'
  ).length;

  return {
    mesFormatado: formatarMesAno(mesAtual),
    temPack: true,
    frequencia: String(packDoMs[2] || ''),
    sessoesConfirmadas: sessoesConfirmadas,
    sessoesTotal: Number(packDoMs[3]) || 0,
    estadoPagamento: String(packDoMs[7] || 'Pendente')
  };
}

function getResumoMarcosParaPortal_(idCliente) {
  const datas = (getDatasConfirmadasPorCliente_()[idCliente] || []);
  return {
    totalSessoesConfirmadas: datas.length,
    marcoAtingido: calcularMaiorMarcoAtingido_(datas.length),
    streakSemanas: calcularStreakSemanas_(datas),
    proximoMarco: proximoMarco_(datas.length)
  };
}

/**
 * Datas (uma por dia) em que o cliente registou pelo menos uma execução de
 * treino por conta própria, através do Portal — nunca inclui sessões PT
 * presenciais (essas são sempre confirmadas manualmente pelo André).
 */
function getDatasExecucaoPorCliente_(idCliente) {
  const sheet = obterOuCriarSheetExecucoes_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange('A2:J' + lastRow).getValues();
  const diasSet = {};
  data.forEach(row => {
    if (!row[0] || String(row[0]) !== String(idCliente) || !row[3]) return;
    const chave = formatarDataISO_(new Date(row[3]));
    if (!diasSet[chave]) diasSet[chave] = new Date(row[3]);
  });

  return Object.values(diasSet).sort((a, b) => a - b);
}

/**
 * Marcos e sequência baseados nos treinos que o próprio cliente regista
 * (auto-treino), usados nas "Conquistas" do Portal — separado de propósito
 * das sessões PT presenciais, que continuam só sob o controlo do André.
 */
function getResumoMarcosAutoTreino_(idCliente) {
  const datas = getDatasExecucaoPorCliente_(idCliente);
  return {
    totalTreinos: datas.length,
    marcoAtingido: calcularMaiorMarcoAtingido_(datas.length),
    streakSemanas: calcularStreakSemanas_(datas),
    proximoMarco: proximoMarco_(datas.length)
  };
}

/**
 * ================= ASSINATURA DIGITAL DO CONTRATO =================
 * Serve a página pública (Assinar.html) para um token específico, e as
 * funções de apoio: encontrar o cliente pelo token, e registar o "Autorizo".
 */

function servirPaginaAssinatura_(token) {
  const info = obterInfoAssinaturaPorToken_(token);
  if (!info) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:40px;text-align:center;color:#666;">Link inválido ou já não é válido. Pede ao teu Personal Trainer para enviar um novo.</p>');
  }
  
  const template = HtmlService.createTemplateFromFile('Assinar');
  template.nomeCliente = info.nomeCliente;
  template.token = token;
  template.jaAceite = !!info.aceiteEm;
  template.aceiteEm = info.aceiteEm || '';
  template.temContrato = !!info.temContrato;
  template.logoBase64 = LOGO_AL_MOVE_BASE64;
  
  return template.evaluate()
    .setTitle('Assinar Contrato — AL MOVE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function obterInfoAssinaturaPorToken_(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  
  for (let i = 0; i < clientesData.length; i++) {
    const row = clientesData[i];
    if (row[19] && String(row[19]).trim() === String(token).trim()) {
      const contratoFileId = row[16] ? String(row[16]).trim() : '';
      return {
        idCliente: String(row[24]),
        nomeCliente: String(row[0]),
      // O ficheiro no Drive é privado. O PDF é entregue em anexo no email de
      // assinatura, para que um link Drive copiado não exponha o contrato.
      temContrato: !!contratoFileId,
        aceiteEm: row[20] ? formatarDataHoraPorExtenso_(row[20]) : ''
      };
    }
  }
  return null;
}

/**
 * Chamada pela página pública Assinar.html quando o cliente clica em
 * "Autorizo". Regista a data/hora na coluna U do cliente correspondente.
 */
function registarAceiteDigital(token) {
  try {
    const info = obterInfoAssinaturaPorToken_(token);
    if (!info) throw new Error('Link inválido.');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:T' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      if (clientesData[i][19] && String(clientesData[i][19]).trim() === String(token).trim()) {
        const agora = new Date();
        sheet.getRange(i + 4, 21).setValue(agora); // coluna U = ASSINATURA_ACEITE_EM
        Logger.log('Contrato aceite digitalmente por: ' + clientesData[i][0]);
        
        const aceiteFormatado = formatarDataHoraPorExtenso_(agora);
        
        // Envia um email de confirmação para o próprio cliente, para que
        // o registo da aceitação não fique só do lado do Prestador.
        const nomeCliente = String(clientesData[i][0]);
        const emailCliente = clientesData[i][18] ? String(clientesData[i][18]).trim() : '';
        if (emailCliente) {
          try {
            const perfilPT = getPerfilPT();
            MailApp.sendEmail({
              to: emailCliente,
              subject: 'Confirmação de aceitação do contrato — AL MOVE',
              body: 'Olá ' + nomeCliente + ',\n\n' +
                'Confirmamos que aceitaste o teu contrato de prestação de serviços de Personal Training com a AL MOVE, em ' + aceiteFormatado + '.\n\n' +
                'Guarda este email como comprovativo da tua aceitação.\n\n' +
                'Cumprimentos,\n' + perfilPT.nome
            });
          } catch (eEmail) {
            Logger.log('Aviso: não foi possível enviar email de confirmação ao cliente: ' + eEmail.toString());
          }
        }
        
        return { sucesso: true, aceiteEm: aceiteFormatado };
      }
    }
    
    throw new Error('Cliente não encontrado.');
  } catch (error) {
    Logger.log('Erro ao registar aceite digital: ' + error.toString());
    throw error;
  }
}

/**
 * Envia o contrato por email, com o PDF em anexo e o link de assinatura
 * digital no corpo da mensagem.
 */
function enviarContratoPorEmail(data) {
  try {
    if (!data.idCliente) throw new Error('Cliente não especificado');
    
    const detalhe = getClienteDetalhe(data.idCliente);
    if (detalhe.error) throw new Error(detalhe.error);
    const cliente = detalhe.cliente;
    
    if (!cliente.email) throw new Error('Este cliente não tem email guardado. Adiciona um em "Editar dados" primeiro.');
    if (!cliente.contratoUrl) throw new Error('Ainda não geraste um contrato para este cliente.');
    
    const fileId = obterContratoFileId_(data.idCliente);
    if (!fileId) throw new Error('Contrato não encontrado.');
    
    const pdfBlob = DriveApp.getFileById(fileId).getBlob();
    const perfilPT = getPerfilPT();
    
    let corpo = 'Olá ' + cliente.nome + ',\n\n';
    corpo += 'Obrigado por te juntares à AL MOVE! Em anexo está o teu contrato de prestação de serviços de Personal Training.\n\n';
    if (cliente.linkAssinatura) {
      corpo += 'Para confirmares que leste e aceitas o contrato, usa este link:\n' + cliente.linkAssinatura + '\n\n';
    }
    corpo += 'Qualquer dúvida, estou disponível.\n\nCumprimentos,\n' + perfilPT.nome;
    
    MailApp.sendEmail({
      to: cliente.email,
      subject: 'O teu contrato de Personal Training — AL MOVE',
      body: corpo,
      attachments: [pdfBlob]
    });
    
    Logger.log('Contrato enviado por email para: ' + cliente.email);
    return { sucesso: true };
  } catch (error) {
    Logger.log('Erro ao enviar contrato por email: ' + error.toString());
    throw error;
  }
}

function obterContratoFileId_(idCliente) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  for (let i = 0; i < clientesData.length; i++) {
    if (String(clientesData[i][24]) === String(idCliente)) {
      return clientesData[i][16] ? String(clientesData[i][16]).trim() : '';
    }
  }
  return '';
}

/**
 * NOVO: calcula o total de sessões a partir da string de frequência (ex: "2x45" -> 8)
 * Usado para auto-corrigir packs cujo SESSOES_TOTAL ficou a 0 (ex: adicionados à mão na sheet)
 */
function calcularSessoesTotalPorFrequencia_(frequencia) {
  if (!frequencia) return 0;
  const match = String(frequencia).match(/^(\d+)x/i);
  if (!match) return 0;
  const vezesPorSemana = parseInt(match[1], 10);
  return isNaN(vezesPorSemana) ? 0 : vezesPorSemana * 4;
}

/**
 * NOVO: extrai a duração em minutos de cada sessão, a partir da frequência (ex: "2x45" -> 45)
 * Usado para calcular horas totais de PT.
 */
function extrairDuracaoMinutos_(frequencia) {
  if (!frequencia) return 0;
  const match = String(frequencia).match(/x(\d+)/i);
  if (!match) return 0;
  const duracao = parseInt(match[1], 10);
  return isNaN(duracao) ? 0 : duracao;
}

/**
 * ================= NAVEGAÇÃO POR MÊS =================
 * getDadosMes(mesAno) devolve os dados para qualquer mês:
 * - Mês atual real -> dados normais (tudo editável, como sempre)
 * - Mês passado -> consulta só de leitura, dados reais que aconteceram
 * - Mês futuro -> previsão baseada na última frequência conhecida de cada
 *   cliente Ativo (nunca cria nem representa dados reais)
 */

function getDadosMes(mesAnoAlvo) {
  try {
    const mesReal = getMesAnoAtual();
    
    if (!mesAnoAlvo || mesAnoAlvo === mesReal) {
      const dados = getCRMData();
      dados.somenteLeitura = false;
      dados.previsao = false;
      dados.mesVisualizado = mesReal;
      return dados;
    }
    
    if (mesAnoAlvo < mesReal) {
      return getDadosMesPassado_(mesAnoAlvo);
    }
    
    return getPrevisaoMesFuturo_(mesAnoAlvo);
    
  } catch (error) {
    Logger.log('Erro getDadosMes: ' + error.toString());
    return { error: error.toString(), clientes: [], packsResumo: [], dashboard: {} };
  }
}

function getDadosMesPassado_(mesAno) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const clientesSheet = ss.getSheetByName('CLIENTES');
  const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
  const clientes = [];
  for (let i = 0; i < clientesData.length; i++) {
    const row = clientesData[i];
    if (row[0]) {
      clientes.push({
        id: String(row[24]),
        nome: String(row[0]),
        estado: String(row[1] || 'Ativo'),
        contacto: String(row[2] || ''),
        precoPersonalizado: row[11] ? Number(row[11]) : null
      });
    }
  }
  
  const precos = getPrecosServicos();
  
  // Procura packs desse mês, tanto em ATIVOS (caso seja o mês anterior, ainda lá)
  // como em HISTORICO (caso já tenha sido arquivado)
  const packsAtivosSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
  const packsAtivosData = packsAtivosSheet.getRange('A2:H' + packsAtivosSheet.getLastRow()).getValues();
  const packsHistoricoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
  const packsHistoricoData = packsHistoricoSheet.getRange('A2:G' + packsHistoricoSheet.getLastRow()).getValues();
  
  const sessoesSheet = ss.getSheetByName('DB_SESSOES');
  const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
  
  const packsResumo = [];
  
  packsAtivosData.forEach(row => {
    if (row[0] && normalizarMesAno(row[1]) === mesAno) {
      const idClienteStr = String(row[0]);
      const clienteDoPack = clientes.find(c => c.id === idClienteStr);
      if (!clienteDoPack) return;
      const frequencia = String(row[2] || '');
      const precoFinal = clienteDoPack.precoPersonalizado ? clienteDoPack.precoPersonalizado : (precos[frequencia] || 0);
      const sessoesConfirmadasReal = sessoesData.filter(s =>
        String(s[0]) === idClienteStr && normalizarMesAno(s[1]) === mesAno && String(s[4]) === 'Confirmada'
      ).length;
      packsResumo.push({
        idCliente: idClienteStr,
        frequencia: frequencia,
        sessoesTotal: Number(row[3]) || 0,
        sessoesConfirmadas: sessoesConfirmadasReal,
        duracaoMinutos: extrairDuracaoMinutos_(frequencia),
        estadoPagamento: String(row[7] || 'Pendente'),
        preco: precoFinal
      });
    }
  });
  
  packsHistoricoData.forEach(row => {
    if (row[0] && normalizarMesAno(row[1]) === mesAno) {
      const idClienteStr = String(row[0]);
      const clienteDoPack = clientes.find(c => c.id === idClienteStr);
      if (!clienteDoPack) return;
      const frequencia = String(row[2] || '');
      const precoFinal = clienteDoPack.precoPersonalizado ? clienteDoPack.precoPersonalizado : (precos[frequencia] || 0);
      const sessoesConfirmadasReal = sessoesData.filter(s =>
        String(s[0]) === idClienteStr && normalizarMesAno(s[1]) === mesAno && String(s[4]) === 'Confirmada'
      ).length;
      packsResumo.push({
        idCliente: idClienteStr,
        frequencia: frequencia,
        sessoesTotal: Number(row[3]) || 0,
        sessoesConfirmadas: sessoesConfirmadasReal,
        duracaoMinutos: extrairDuracaoMinutos_(frequencia),
        estadoPagamento: String(row[6] || 'Pendente'),
        preco: precoFinal
      });
    }
  });
  
  let totalSessoes = 0, totalConfirmadas = 0, totalRecebido = 0, totalPendente = 0;
  let totalMinutosContratados = 0, totalMinutosConfirmados = 0;
  
  packsResumo.forEach(p => {
    totalSessoes += p.sessoesTotal;
    totalConfirmadas += p.sessoesConfirmadas;
    if (p.estadoPagamento === 'Pago') totalRecebido += p.preco; else totalPendente += p.preco;
    totalMinutosContratados += p.sessoesTotal * p.duracaoMinutos;
    totalMinutosConfirmados += p.sessoesConfirmadas * p.duracaoMinutos;
  });

  // Pacotes especiais são vendas de app/plano remoto. Não acrescentam sessões
  // presenciais, mas entram como receita no mês em que começam.
  const receitaPacotesEspeciais = getTotalPacotesEspeciaisNoMes_(mesAno);
  totalRecebido += receitaPacotesEspeciais;
  
  const taxaConclusao = totalSessoes > 0 ? Math.round((totalConfirmadas / totalSessoes) * 100) : 0;
  
  return {
    clientes: clientes,
    packsResumo: packsResumo,
    mesAtual: mesAno,
    mesAtualFormatado: formatarMesAno(mesAno),
    mesVisualizado: mesAno,
    somenteLeitura: true,
    previsao: false,
    dashboard: {
      clientesAtivos: clientes.filter(c => c.estado === 'Ativo').length,
      totalClientes: clientes.filter(c => c.estado !== 'Cancelado').length,
      sessoesConfirmadas: totalConfirmadas,
      sessoesTotal: totalSessoes,
      horasContratadas: (totalMinutosContratados / 60).toFixed(1),
      horasConfirmadas: (totalMinutosConfirmados / 60).toFixed(1),
      taxaConclusao: taxaConclusao,
      packsAtivos: packsResumo.length,
      recebido: totalRecebido.toFixed(2),
      pendente: totalPendente.toFixed(2),
      receitaPotencial: (totalRecebido + totalPendente).toFixed(2),
      receitaPacotesEspeciais: receitaPacotesEspeciais.toFixed(2)
    }
  };
}

function getPrevisaoMesFuturo_(mesAno) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const clientesSheet = ss.getSheetByName('CLIENTES');
  const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
  const clientes = [];
  for (let i = 0; i < clientesData.length; i++) {
    const row = clientesData[i];
    if (row[0]) {
      clientes.push({
        id: String(row[24]),
        nome: String(row[0]),
        estado: String(row[1] || 'Ativo'),
        contacto: String(row[2] || ''),
        precoPersonalizado: row[11] ? Number(row[11]) : null
      });
    }
  }
  
  const precos = getPrecosServicos();
  
  const packsAtivosSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
  const packsAtivosData = packsAtivosSheet.getRange('A2:H' + packsAtivosSheet.getLastRow()).getValues();
  const packsHistoricoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
  const packsHistoricoData = packsHistoricoSheet.getRange('A2:G' + packsHistoricoSheet.getLastRow()).getValues();
  
  const packsResumo = [];
  
  clientes.filter(c => c.estado === 'Ativo').forEach(cliente => {
    // Procura o pack mais recente deste cliente (ativos + histórico) para prever a frequência
    let melhorFrequencia = null;
    let melhorMes = '';
    
    packsAtivosData.forEach(row => {
      if (String(row[0]) === cliente.id) {
        const mesPack = normalizarMesAno(row[1]);
        if (mesPack > melhorMes) { melhorMes = mesPack; melhorFrequencia = String(row[2] || ''); }
      }
    });
    packsHistoricoData.forEach(row => {
      if (String(row[0]) === cliente.id) {
        const mesPack = normalizarMesAno(row[1]);
        if (mesPack > melhorMes) { melhorMes = mesPack; melhorFrequencia = String(row[2] || ''); }
      }
    });
    
    if (melhorFrequencia) {
      const sessoesTotal = calcularSessoesTotalPorFrequencia_(melhorFrequencia);
      const precoFinal = cliente.precoPersonalizado ? cliente.precoPersonalizado : (precos[melhorFrequencia] || 0);
      packsResumo.push({
        idCliente: cliente.id,
        frequencia: melhorFrequencia,
        sessoesTotal: sessoesTotal,
        sessoesConfirmadas: 0,
        duracaoMinutos: extrairDuracaoMinutos_(melhorFrequencia),
        estadoPagamento: 'Pendente',
        preco: precoFinal
      });
    }
  });
  
  let totalSessoes = 0, totalMinutosContratados = 0, totalPendente = 0;
  packsResumo.forEach(p => {
    totalSessoes += p.sessoesTotal;
    totalMinutosContratados += p.sessoesTotal * p.duracaoMinutos;
    totalPendente += p.preco;
  });
  
  return {
    clientes: clientes,
    packsResumo: packsResumo,
    mesAtual: mesAno,
    mesAtualFormatado: formatarMesAno(mesAno),
    mesVisualizado: mesAno,
    somenteLeitura: true,
    previsao: true,
    dashboard: {
      clientesAtivos: clientes.filter(c => c.estado === 'Ativo').length,
      totalClientes: clientes.filter(c => c.estado !== 'Cancelado').length,
      sessoesConfirmadas: 0,
      sessoesTotal: totalSessoes,
      horasContratadas: (totalMinutosContratados / 60).toFixed(1),
      horasConfirmadas: '0.0',
      taxaConclusao: 0,
      packsAtivos: packsResumo.length,
      recebido: '0.00',
      pendente: totalPendente.toFixed(2),
      receitaPotencial: totalPendente.toFixed(2)
    }
  };
}

function getCRMData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Esta função é usada para desenhar o CRM. Uma leitura nunca pode
    // arquivar, cancelar ou alterar dados: manutenção corre explicitamente
    // por trigger/ação administrativa, nunca ao abrir um painel.
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
    const clientes = [];
    
    for (let i = 0; i < clientesData.length; i++) {
      const row = clientesData[i];
      if (row[0]) {
        clientes.push({
          id: String(row[24] || ''),
          nome: String(row[0]),
          estado: String(row[1] || 'Ativo'),
          contacto: String(row[2] || ''),
          precoPersonalizado: row[11] ? Number(row[11]) : null,
          nif: row[15] ? String(row[15]).trim() : '',
          diaPagamento: row[21] ? Number(row[21]) : null,
          metodoPagamento: row[22] ? String(row[22]).trim() : ''
        });
      }
    }
    
    const mesAtual = getMesAnoAtual();
    
    // Preços dos serviços (aba SERVIÇOS)
    const precos = getPrecosServicos();
    
    // Packs ativos deste mês - versão resumida (só o essencial)
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsData = packsSheet.getRange('A2:H' + packsSheet.getLastRow()).getValues();
    const packsResumo = [];

    // Sessões deste mês, para calcular confirmadas reais (nunca confia só no contador guardado)
    const sessoesSheetResumo = ss.getSheetByName('DB_SESSOES');
    const sessoesDataResumo = sessoesSheetResumo.getRange('A2:F' + sessoesSheetResumo.getLastRow()).getValues();
    
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (row[0] && normalizarMesAno(row[1]) === mesAtual) {
        const idClienteStr = String(row[0]);
        const clienteDoPack = clientes.find(c => c.id === idClienteStr);
        
        // Cancelados e pausados nunca contam para nenhuma estatística, mesmo que
        // por alguma razão ainda tenham um pack registado no mês corrente
        if (!clienteDoPack || clienteDoPack.estado !== 'Ativo') continue;
        
        const frequencia = String(row[2] || '');
        const precoFinal = clienteDoPack.precoPersonalizado ? clienteDoPack.precoPersonalizado : (precos[frequencia] || 0);

        let sessoesTotal = Number(row[3]) || 0;
        if (sessoesTotal === 0 && frequencia) {
          sessoesTotal = calcularSessoesTotalPorFrequencia_(frequencia);
        }

        const sessoesConfirmadasReal = sessoesDataResumo.filter(s =>
          String(s[0]) === idClienteStr && normalizarMesAno(s[1]) === mesAtual && String(s[4]) === 'Confirmada'
        ).length;

        const duracaoMinutos = extrairDuracaoMinutos_(frequencia);

        packsResumo.push({
          idCliente: idClienteStr,
          frequencia: frequencia,
          sessoesTotal: sessoesTotal,
          sessoesConfirmadas: sessoesConfirmadasReal,
          duracaoMinutos: duracaoMinutos,
          estadoPagamento: String(row[7] || 'Pendente'),
          preco: precoFinal
        });
      }
    }
    
    // Totais para o dashboard
    let totalSessoes = 0;
    let totalConfirmadas = 0;
    let totalRecebido = 0;
    let totalPendente = 0;
    let totalMinutosContratados = 0;
    let totalMinutosConfirmados = 0;
    
    packsResumo.forEach(p => {
      totalSessoes += p.sessoesTotal;
      totalConfirmadas += p.sessoesConfirmadas;
      if (p.estadoPagamento === 'Pago') totalRecebido += p.preco;
      else totalPendente += p.preco;
      totalMinutosContratados += p.sessoesTotal * p.duracaoMinutos;
      totalMinutosConfirmados += p.sessoesConfirmadas * p.duracaoMinutos;
    });

    const receitaPacotesEspeciais = getTotalPacotesEspeciaisNoMes_(mesAtual);
    totalRecebido += receitaPacotesEspeciais;
    
    const taxaConclusao = totalSessoes > 0 ? Math.round((totalConfirmadas / totalSessoes) * 100) : 0;
    const clientesEmAtraso = calcularAtrasos_(clientes, mesAtual);
    
    return {
      clientes: clientes,
      packsResumo: packsResumo,
      mesAtual: mesAtual,
      mesAtualFormatado: formatarMesAno(mesAtual),
      avisoRenovacao: getAvisoRenovacaoPendente_(),
      clientesEmAtraso: clientesEmAtraso,
      dashboard: {
        clientesAtivos: clientes.filter(c => c.estado === 'Ativo').length,
        totalClientes: clientes.filter(c => c.estado !== 'Cancelado').length,
        sessoesConfirmadas: totalConfirmadas,
        sessoesTotal: totalSessoes,
        horasContratadas: (totalMinutosContratados / 60).toFixed(1),
        horasConfirmadas: (totalMinutosConfirmados / 60).toFixed(1),
        taxaConclusao: taxaConclusao,
        packsAtivos: packsResumo.length,
        recebido: totalRecebido.toFixed(2),
        pendente: totalPendente.toFixed(2),
        receitaPotencial: (totalRecebido + totalPendente).toFixed(2),
        receitaPacotesEspeciais: receitaPacotesEspeciais.toFixed(2),
        clientesEmAtraso: clientesEmAtraso.length
      }
    };
    
  } catch (error) {
    return {
      error: error.toString(),
      clientes: [],
      packsResumo: [],
      clientesEmAtraso: [],
      dashboard: { clientesAtivos: 0, totalClientes: 0, sessoesConfirmadas: 0, sessoesTotal: 0, taxaConclusao: 0, packsAtivos: 0, recebido: '0.00', pendente: '0.00', clientesEmAtraso: 0 }
    };
  }
}

/**
 * Centro de Comando do CRM. É deliberadamente uma chamada separada do
 * dashboard principal: o CRM abre rápido e este briefing operacional é
 * preenchido logo a seguir, sem atrasar a entrada na aplicação.
 */
function getCentroComandoCRM() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const tz = Session.getScriptTimeZone();
    const chaveHoje = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');

    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getLastRow() >= 4
      ? clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues()
      : [];
    const ativos = {};
    const contratosPendentes = [];
    clientesData.forEach(row => {
      if (!row[0] || String(row[1] || 'Ativo') !== 'Ativo') return;
      const id = String(row[24] || '');
      if (!id) return;
      ativos[id] = { idCliente: id, nome: String(row[0]), servico: String(row[3] || '') };
      const temContrato = !!row[16];
      const temTokenAssinatura = !!row[19];
      const aceite = !!row[20];
      if (temContrato && temTokenAssinatura && !aceite) contratosPendentes.push(ativos[id]);
    });

    const idsCheckinHoje = {};
    const checkinsSheet = ss.getSheetByName('DB_CHECKINS');
    if (checkinsSheet && checkinsSheet.getLastRow() >= 2) {
      const checkinsData = checkinsSheet.getRange('A2:B' + checkinsSheet.getLastRow()).getValues();
      checkinsData.forEach(row => {
        const id = String(row[0] || '');
        if (!ativos[id] || !row[1]) return;
        const data = new Date(row[1]);
        if (!isNaN(data.getTime()) && Utilities.formatDate(data, tz, 'yyyy-MM-dd') === chaveHoje) idsCheckinHoje[id] = true;
      });
    }
    const semCheckin = Object.keys(ativos).filter(id => !idsCheckinHoje[id]).map(id => ativos[id]);

    const ultimoTreino = {};
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    if (sessoesSheet && sessoesSheet.getLastRow() >= 2) {
      const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
      sessoesData.forEach(row => {
        const id = String(row[0] || '');
        if (!ativos[id] || String(row[4] || '') !== 'Confirmada' || !row[3]) return;
        const data = new Date(row[3]);
        if (!isNaN(data.getTime()) && (!ultimoTreino[id] || data > ultimoTreino[id])) ultimoTreino[id] = data;
      });
    }
    const semAtividade = Object.keys(ultimoTreino).map(id => {
      const dias = Math.floor((hoje - ultimoTreino[id]) / 86400000);
      return { idCliente: id, nome: ativos[id].nome, diasSemTreino: dias };
    }).filter(item => item.diasSemTreino >= 14)
      .sort((a, b) => b.diasSemTreino - a.diasSemTreino);

    const planosPorChave = {};
    const planosSheet = ss.getSheetByName('DB_PLANOS_TREINO');
    if (planosSheet && planosSheet.getLastRow() >= 2) {
      const planosData = planosSheet.getRange('A2:L' + planosSheet.getLastRow()).getValues();
      planosData.forEach(row => {
        const id = String(row[0] || '');
        const nomePlano = String(row[1] || '');
        if (!ativos[id] || !nomePlano || !row[11]) return;
        const validade = new Date(row[11]);
        if (isNaN(validade.getTime())) return;
        const chave = id + '|' + nomePlano;
        if (!planosPorChave[chave] || validade < planosPorChave[chave].validade) {
          planosPorChave[chave] = { idCliente: id, nome: ativos[id].nome, plano: nomePlano, validade: validade };
        }
      });
    }
    const planosAExpirar = Object.keys(planosPorChave).map(chave => {
      const item = planosPorChave[chave];
      item.diasRestantes = Math.ceil((item.validade - hoje) / 86400000);
      return item;
    }).filter(item => item.diasRestantes <= 7)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    return {
      resumo: {
        clientesAtivos: Object.keys(ativos).length,
        checkinsHoje: Object.keys(idsCheckinHoje).length,
        semCheckin: semCheckin.length,
        planosAExpirar: planosAExpirar.length,
        contratosPendentes: contratosPendentes.length,
        semAtividade: semAtividade.length
      },
      semCheckin: semCheckin.slice(0, 12),
      planosAExpirar: planosAExpirar.slice(0, 12),
      contratosPendentes: contratosPendentes.slice(0, 12),
      semAtividade: semAtividade.slice(0, 12),
      geradoEm: Utilities.formatDate(new Date(), tz, 'HH:mm')
    };
  } catch (error) {
    Logger.log('Erro no Centro de Comando: ' + error.toString());
    return { error: error.toString(), resumo: {}, semCheckin: [], planosAExpirar: [], contratosPendentes: [], semAtividade: [] };
  }
}

/** Alertas operacionais para o sino do topo. Só reúne informação já
 * existente no CRM; não envia notificações externas nem altera dados. */
function getNotificacoesCMR() {
  try {
    const crm = getCRMData();
    const comando = getCentroComandoCRM();
    const itens = [];
    const atrasos = crm.clientesEmAtraso || [];
    if (atrasos.length) {
      itens.push({
        tipo: 'pendente', acao: 'pagamentos', quantidade: atrasos.length,
        titulo: atrasos.length + (atrasos.length === 1 ? ' pagamento em atraso' : ' pagamentos em atraso'),
        detalhe: atrasos.slice(0, 2).map(item => item.nome).join(' · ')
      });
    }
    const planos = comando.planosAExpirar || [];
    if (planos.length) {
      itens.push({
        tipo: 'alerta', acao: 'clientes', quantidade: planos.length,
        titulo: planos.length + (planos.length === 1 ? ' plano a expirar' : ' planos a expirar'),
        detalhe: planos.slice(0, 2).map(item => item.nome + ' · ' + item.diasRestantes + 'd').join(' · ')
      });
    }
    const contratos = comando.contratosPendentes || [];
    if (contratos.length) {
      itens.push({
        tipo: 'alerta', acao: 'clientes', quantidade: contratos.length,
        titulo: contratos.length + (contratos.length === 1 ? ' contrato por aceitar' : ' contratos por aceitar'),
        detalhe: contratos.slice(0, 2).map(item => item.nome).join(' · ')
      });
    }
    const semAtividade = comando.semAtividade || [];
    if (semAtividade.length) {
      itens.push({
        tipo: 'info', acao: 'clientes', quantidade: semAtividade.length,
        titulo: semAtividade.length + (semAtividade.length === 1 ? ' cliente sem acompanhamento' : ' clientes sem acompanhamento'),
        detalhe: semAtividade.slice(0, 2).map(item => item.nome + ' · ' + item.diasSemTreino + ' dias').join(' · ')
      });
    }
    return {
      total: itens.reduce((soma, item) => soma + item.quantidade, 0),
      itens: itens,
      geradoEm: comando.geradoEm || ''
    };
  } catch (error) {
    Logger.log('Erro getNotificacoesCMR: ' + error.toString());
    return { total: 0, itens: [], error: error.toString() };
  }
}

/** Histórico curto e privado de acompanhamento do PT, por cliente. */
function obterOuCriarSheetNotasCRM_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_NOTAS_CRM');
  if (!sheet) {
    sheet = ss.insertSheet('DB_NOTAS_CRM');
    sheet.getRange('A1:D1').setValues([['IdCliente', 'DataHora', 'Tipo', 'Nota']]);
    sheet.getRange('A1:D1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getHistoricoClienteCRM(idCliente) {
  try {
    const sheet = obterOuCriarSheetNotasCRM_();
    if (sheet.getLastRow() < 2) return [];
    const dados = sheet.getRange('A2:D' + sheet.getLastRow()).getValues();
    return dados.filter(row => String(row[0]) === String(idCliente) && row[1] && row[3])
      .map(row => ({
        dataHora: formatarDataHoraPorExtenso_(row[1]),
        timestamp: new Date(row[1]).getTime(),
        tipo: String(row[2] || 'Nota'),
        nota: String(row[3] || '')
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
  } catch (error) {
    Logger.log('Erro histórico CRM: ' + error.toString());
    return [];
  }
}

function registarNotaClienteCRM(data) {
  try {
    if (!data || !data.idCliente) throw new Error('Cliente em falta.');
    const nota = String(data.nota || '').trim();
    if (!nota) throw new Error('Escreve uma nota antes de guardar.');
    if (nota.length > 1500) throw new Error('A nota é demasiado longa (máximo: 1500 caracteres).');
    const tiposValidos = ['Nota', 'Contacto', 'Saúde', 'Decisão'];
    const tipo = tiposValidos.indexOf(String(data.tipo)) >= 0 ? String(data.tipo) : 'Nota';
    obterOuCriarSheetNotasCRM_().appendRow([String(data.idCliente), new Date(), tipo, nota]);
    return getHistoricoClienteCRM(data.idCliente);
  } catch (error) {
    Logger.log('Erro registar nota CRM: ' + error.toString());
    throw error;
  }
}

/**
 * Calcula, para cada cliente Ativo com Dia de Pagamento definido, se está em
 * atraso (1 mês) ou em atraso reincidente (2+ meses). Nunca bloqueia nada —
 * só serve para ficar visível no Dashboard e na secção Pagamentos.
 */
function calcularAtrasos_(clientes, mesAtual) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mesAnterior = getMesAnterior(mesAtual);
  const precos = getPrecosServicos();

  const packsAtivosSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
  const packsAtivosData = packsAtivosSheet.getRange('A2:H' + packsAtivosSheet.getLastRow()).getValues();
  const packsHistoricoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
  const packsHistoricoData = packsHistoricoSheet.getRange('A2:G' + packsHistoricoSheet.getLastRow()).getValues();

  const packsPorCliente = {};
  function registar(row, isHistorico) {
    if (!row[0]) return;
    const mesAnoPack = normalizarMesAno(row[1]);
    if (mesAnoPack !== mesAtual && mesAnoPack !== mesAnterior) return;
    const idCliente = String(row[0]);
    const frequencia = String(row[2] || '');
    const cliente = clientes.find(c => c.id === idCliente);
    const precoFinal = (cliente && cliente.precoPersonalizado) ? cliente.precoPersonalizado : (precos[frequencia] || 0);
    const estadoPagamento = isHistorico ? String(row[6] || 'Pendente') : String(row[7] || 'Pendente');
    if (!packsPorCliente[idCliente]) packsPorCliente[idCliente] = {};
    packsPorCliente[idCliente][mesAnoPack] = { estadoPagamento: estadoPagamento, preco: precoFinal };
  }
  packsAtivosData.forEach(row => registar(row, false));
  packsHistoricoData.forEach(row => registar(row, true));

  const hoje = new Date();
  const resultado = [];

  clientes.forEach(c => {
    if (c.estado !== 'Ativo' || !c.diaPagamento) return;
    const packsCliente = packsPorCliente[c.id] || {};
    const packAtual = packsCliente[mesAtual];
    const packAnterior = packsCliente[mesAnterior];

    const dataPagamentoEsteMs = new Date(hoje.getFullYear(), hoje.getMonth(), Number(c.diaPagamento));
    const passouDiaEsteMs = hoje > dataPagamentoEsteMs;

    let mesesEmAtraso = 0;
    let valorEmAtraso = 0;

    if (packAnterior && packAnterior.estadoPagamento === 'Pendente') {
      mesesEmAtraso++;
      valorEmAtraso += packAnterior.preco;
    }
    if (packAtual && packAtual.estadoPagamento === 'Pendente' && passouDiaEsteMs) {
      mesesEmAtraso++;
      valorEmAtraso += packAtual.preco;
    }

    if (mesesEmAtraso > 0) {
      resultado.push({
        idCliente: c.id,
        nome: c.nome,
        diaPagamento: c.diaPagamento,
        metodoPagamento: c.metodoPagamento || '',
        mesesEmAtraso: mesesEmAtraso,
        valorEmAtraso: Number(valorEmAtraso.toFixed(2))
      });
    }
  });

  resultado.sort((a, b) => b.mesesEmAtraso - a.mesesEmAtraso);
  return resultado;
}

/**
 * Usada pela secção "Pagamentos" da app — devolve a lista de clientes em
 * atraso já calculada, mais o total em dívida.
 */
function getPagamentosResumo() {
  try {
    const crm = getCRMData();
    const clientesEmAtraso = crm.clientesEmAtraso || [];
    const totalEmAtraso = clientesEmAtraso.reduce((soma, c) => soma + c.valorEmAtraso, 0);
    return {
      clientesEmAtraso: clientesEmAtraso,
      totalEmAtraso: totalEmAtraso.toFixed(2)
    };
  } catch (error) {
    Logger.log('Erro getPagamentosResumo: ' + error.toString());
    return { clientesEmAtraso: [], totalEmAtraso: '0.00', error: error.toString() };
  }
}

/**
 * ================= MARCOS E SEQUÊNCIAS =================
 * Usa o histórico de DB_SESSOES (nunca é apagado, mesmo depois de arquivar
 * os packs) para calcular, por cliente: total de sessões confirmadas ao
 * longo de toda a relação, e há quantas semanas seguidas treina sem falhar
 * uma semana inteira.
 */
/**
 * Marcos de 4 em 4 sessões (4, 8, 12, 16...), em vez de uma lista fixa —
 * qualquer múltiplo de 4 conta como marco.
 */
const INTERVALO_MARCO = 4;

function ehMarco_(contagem) {
  return contagem > 0 && contagem % INTERVALO_MARCO === 0;
}

function proximoMarco_(totalConfirmadas) {
  return (Math.floor(totalConfirmadas / INTERVALO_MARCO) + 1) * INTERVALO_MARCO;
}

function getSemanaAno_(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function getMondayDaSemana_(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dia = d.getDay() || 7;
  d.setDate(d.getDate() - dia + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Sequência de semanas seguidas com pelo menos 1 sessão confirmada,
 * contando para trás a partir da semana mais recente com sessão. Se a
 * semana mais recente com sessão for anterior à semana passada, a
 * sequência considera-se quebrada (devolve 0).
 */
function calcularStreakSemanas_(datasConfirmadasOrdenadas) {
  if (!datasConfirmadasOrdenadas || datasConfirmadasOrdenadas.length === 0) return 0;

  const semanasSet = {};
  datasConfirmadasOrdenadas.forEach(d => { semanasSet[getSemanaAno_(d)] = true; });

  const hoje = new Date();
  const semanaAtualKey = getSemanaAno_(hoje);
  const semanaAnteriorKey = getSemanaAno_(new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000));

  const maisRecente = datasConfirmadasOrdenadas[datasConfirmadasOrdenadas.length - 1];
  const semanaMaisRecenteKey = getSemanaAno_(maisRecente);

  if (semanaMaisRecenteKey !== semanaAtualKey && semanaMaisRecenteKey !== semanaAnteriorKey) {
    return 0;
  }

  let cursor = getMondayDaSemana_(maisRecente);
  let streak = 0;
  while (semanasSet[getSemanaAno_(cursor)]) {
    streak++;
    cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return streak;
}

/**
 * Se alguma das datas confirmadas, pela ordem em que aconteceram, fez o
 * cliente cruzar um marco de sessões (4, 8, 12...) nos últimos 7 dias,
 * devolve esse marco. Caso contrário devolve null.
 */
function calcularMarcoRecente_(datasConfirmadasOrdenadas) {
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  let marcoRecente = null;
  datasConfirmadasOrdenadas.forEach((d, idx) => {
    const contagem = idx + 1;
    if (ehMarco_(contagem) && d >= seteDiasAtras) {
      marcoRecente = contagem;
    }
  });
  return marcoRecente;
}

function calcularMaiorMarcoAtingido_(totalConfirmadas) {
  return Math.floor(totalConfirmadas / INTERVALO_MARCO) * INTERVALO_MARCO;
}

/**
 * Devolve, por idCliente, o array de datas (Date) das sessões confirmadas
 * ao longo de todo o histórico, ordenadas cronologicamente.
 */
function getDatasConfirmadasPorCliente_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sessoesSheet = ss.getSheetByName('DB_SESSOES');
  const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
  const porCliente = {};
  sessoesData.forEach(row => {
    if (!row[0] || String(row[4]) !== 'Confirmada' || !row[3]) return;
    const id = String(row[0]);
    if (!porCliente[id]) porCliente[id] = [];
    porCliente[id].push(new Date(row[3]));
  });
  Object.keys(porCliente).forEach(id => porCliente[id].sort((a, b) => a - b));
  return porCliente;
}

/**
 * Usada pela secção "Marcos" da app — devolve os clientes ativos que ou
 * acabaram de cruzar um marco de sessões nos últimos 7 dias, ou estão numa
 * sequência de 4+ semanas seguidas a treinar.
 */
function getMarcosResumo() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
    const clientesAtivos = [];
    clientesData.forEach(row => {
      if (row[0] && row[24] && String(row[1] || 'Ativo') === 'Ativo') clientesAtivos.push({ id: String(row[24]), nome: String(row[0]) });
    });

    const datasPorCliente = getDatasConfirmadasPorCliente_();

    const resultado = [];
    clientesAtivos.forEach(cliente => {
      const datas = datasPorCliente[cliente.id] || [];
      if (datas.length === 0) return;
      const streak = calcularStreakSemanas_(datas);
      const marcoRecente = calcularMarcoRecente_(datas);
      if (marcoRecente || streak >= 4) {
        resultado.push({
          idCliente: cliente.id,
          nome: cliente.nome,
          totalSessoes: datas.length,
          streakSemanas: streak,
          marcoRecente: marcoRecente
        });
      }
    });

    resultado.sort((a, b) => (b.marcoRecente || 0) - (a.marcoRecente || 0) || b.streakSemanas - a.streakSemanas);
    return { marcos: resultado };
  } catch (error) {
    Logger.log('Erro getMarcosResumo: ' + error.toString());
    return { marcos: [], error: error.toString() };
  }
}

/**
 * ================= PACOTES ESPECIAIS (app + plano remoto) =================
 * Linha de produto separada dos clientes de PT presencial normais: sem
 * frequência semanal, sem confirmação de sessões, sem contrato nem
 * sistema de pagamentos formal — só uma lista leve com plano/preço/estado.
 * Vive na sua própria aba da sheet, criada automaticamente se não existir.
 */
const PLANOS_ESPECIAIS = [
  { chave: 'BASIC', nome: 'BASIC', descricao: 'APP + Plano de Treino', sessoesPT: 0, preco: 15.00 },
  { chave: 'STANDARD', nome: 'STANDARD', descricao: 'APP + Plano de TR+AV', sessoesPT: 0, preco: 30.00 },
  { chave: 'PLUS1', nome: 'PLUS 1', descricao: 'APP + TR + AV + 1PT', sessoesPT: 1, preco: 60.00 },
  { chave: 'PLUS2', nome: 'PLUS 2', descricao: 'APP + TR + AV + 2PT', sessoesPT: 2, preco: 90.00 },
  { chave: 'PLUSMAX', nome: 'PLUS MAX', descricao: 'APP + TR + AV + 4PT', sessoesPT: 4, preco: 149.00 }
];

const CABECALHOS_PACOTES_ESPECIAIS_ = ['Nome', 'Plano', 'Preço', 'Data Início', 'Estado', 'Contacto', 'Notas', 'NIF', 'Data Fim'];
const CABECALHOS_CATALOGO_PACOTES_ = ['Chave', 'Nome', 'Descrição', 'Preço', 'Ativo'];

function adicionarUmMesData_(data) {
  const resultado = new Date(data);
  resultado.setHours(12, 0, 0, 0);
  resultado.setMonth(resultado.getMonth() + 1);
  return resultado;
}

/**
 * Resumo mensal de bem-estar por cliente. Mantém os valores originais dos
 * check-ins e calcula apenas médias de visualização — não altera nem
 * interpreta clinicamente os dados do cliente.
 */
function getResumoCheckinsMensal(idCliente, mesAno) {
  try {
    const tz = Session.getScriptTimeZone();
    const mes = /^\d{4}-\d{2}$/.test(String(mesAno || ''))
      ? String(mesAno)
      : Utilities.formatDate(new Date(), tz, 'yyyy-MM');
    const lista = getCheckinsRecentes_(idCliente, 1000).filter(item =>
      Utilities.formatDate(item.dataHora, tz, 'yyyy-MM') === mes
    ).sort((a, b) => a.dataHora - b.dataHora);

    const campos = ['sono', 'stress', 'cansaco', 'refeicoes', 'doms'];
    const medias = {};
    campos.forEach(campo => {
      medias[campo] = lista.length
        ? Number((lista.reduce((soma, item) => soma + (Number(item[campo]) || 0), 0) / lista.length).toFixed(1))
        : null;
    });

    return {
      mes: mes,
      total: lista.length,
      medias: medias,
      dias: lista.map(item => ({
        data: Utilities.formatDate(item.dataHora, tz, 'yyyy-MM-dd'),
        rotulo: Utilities.formatDate(item.dataHora, tz, 'dd/MM'),
        sono: item.sono,
        stress: item.stress,
        cansaco: item.cansaco,
        refeicoes: item.refeicoes,
        doms: item.doms,
        nota: item.nota
      }))
    };
  } catch (error) {
    Logger.log('Erro getResumoCheckinsMensal: ' + error.toString());
    return { mes: mesAno || '', total: 0, medias: {}, dias: [], error: error.toString() };
  }
}

function obterOuCriarCatalogoPacotesEspeciais_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('CATALOGO_PACOTES_ESPECIAIS');
  if (!sheet) sheet = ss.insertSheet('CATALOGO_PACOTES_ESPECIAIS');
  sheet.getRange(1, 1, 1, CABECALHOS_CATALOGO_PACOTES_.length).setValues([CABECALHOS_CATALOGO_PACOTES_]);
  sheet.getRange('A1:E1').setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, PLANOS_ESPECIAIS.length, 5).setValues(PLANOS_ESPECIAIS.map(plano => [
      plano.chave, plano.nome, plano.descricao, plano.preco, 'Sim'
    ]));
  }
  return sheet;
}

function obterPlanosEspeciais_(incluirInativos) {
  const sheet = obterOuCriarCatalogoPacotesEspeciais_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
    .map((linha, indice) => ({
      linha: indice + 2,
      chave: String(linha[0] || ''),
      nome: String(linha[1] || linha[0] || ''),
      descricao: String(linha[2] || ''),
      preco: Number(linha[3]) || 0,
      ativo: String(linha[4] || 'Sim').toLowerCase() !== 'não'
    }))
    .filter(plano => plano.chave && (incluirInativos || plano.ativo));
}

function obterOuCriarSheetPacotesEspeciais_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('PACOTES_ESPECIAIS');
  if (!sheet) {
    sheet = ss.insertSheet('PACOTES_ESPECIAIS');
  }
  // Migração segura das instalações anteriores: nunca mexe nas linhas já
  // registadas, apenas acrescenta as duas colunas de identificação/duração.
  sheet.getRange(1, 1, 1, CABECALHOS_PACOTES_ESPECIAIS_.length).setValues([CABECALHOS_PACOTES_ESPECIAIS_]);
  sheet.getRange('A1:I1').setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function getPacotesEspeciais() {
  try {
    const sheet = obterOuCriarSheetPacotesEspeciais_();
    const lastRow = sheet.getLastRow();
    const clientes = [];
    const planos = obterPlanosEspeciais_(false);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (lastRow >= 2) {
      const data = sheet.getRange('A2:I' + lastRow).getValues();
      data.forEach((row, idx) => {
        if (!row[0]) return;
        const inicio = row[3] ? new Date(row[3]) : new Date();
        const fim = row[8] ? new Date(row[8]) : adicionarUmMesData_(inicio);
        fim.setHours(0, 0, 0, 0);
        const estado = String(row[4] || 'Ativo');
        clientes.push({
          linha: idx + 2,
          nome: String(row[0]),
          plano: String(row[1] || ''),
          preco: Number(row[2]) || 0,
          dataInicio: row[3] ? formatarDataISO_(row[3]) : '',
          dataFim: formatarDataISO_(fim),
          estado: estado,
          contacto: String(row[5] || ''),
          notas: String(row[6] || ''),
          nif: String(row[7] || ''),
          historico: estado !== 'Ativo' || fim < hoje
        });
      });
    }
    return { clientes: clientes, planos: planos, catalogo: obterPlanosEspeciais_(true) };
  } catch (error) {
    Logger.log('Erro getPacotesEspeciais: ' + error.toString());
    return { clientes: [], planos: PLANOS_ESPECIAIS, catalogo: PLANOS_ESPECIAIS, error: error.toString() };
  }
}

function criarPacoteEspecial(data) {
  try {
    if (!data.nome) throw new Error('O nome é obrigatório');
    if (!data.plano) throw new Error('Escolhe um plano');
    const planoInfo = obterPlanosEspeciais_(false).find(p => p.chave === data.plano);
    if (!planoInfo) throw new Error('Plano inválido');
    const dataInicio = data.dataInicio ? new Date(data.dataInicio + 'T12:00:00') : new Date();
    const dataFim = data.dataFim ? new Date(data.dataFim + 'T12:00:00') : adicionarUmMesData_(dataInicio);
    if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime()) || dataFim <= dataInicio) throw new Error('A data de fim tem de ser posterior à data de início.');

    const sheet = obterOuCriarSheetPacotesEspeciais_();
    sheet.appendRow([
      String(data.nome).trim(),
      planoInfo.chave,
      planoInfo.preco,
      dataInicio,
      'Ativo',
      data.contacto ? String(data.contacto).trim() : '',
      data.notas ? String(data.notas).trim() : '',
      data.nif ? String(data.nif).trim() : '',
      dataFim
    ]);

    Logger.log('Pacote especial criado: ' + data.nome + ' (' + planoInfo.chave + ')');
    return getPacotesEspeciais();
  } catch (error) {
    Logger.log('Erro criarPacoteEspecial: ' + error.toString());
    throw error;
  }
}

function alterarEstadoPacoteEspecial(data) {
  try {
    const sheet = obterOuCriarSheetPacotesEspeciais_();
    sheet.getRange(Number(data.linha), 5).setValue(data.estado); // coluna E = Estado
    Logger.log('Estado do pacote especial alterado: linha ' + data.linha + ' -> ' + data.estado);
    return getPacotesEspeciais();
  } catch (error) {
    Logger.log('Erro alterarEstadoPacoteEspecial: ' + error.toString());
    throw error;
  }
}

function editarPacoteEspecial(data) {
  try {
    const sheet = obterOuCriarSheetPacotesEspeciais_();
    const linha = Number(data.linha);
    if (data.nome !== undefined) sheet.getRange(linha, 1).setValue(String(data.nome));
    if (data.contacto !== undefined) sheet.getRange(linha, 6).setValue(String(data.contacto));
    if (data.notas !== undefined) sheet.getRange(linha, 7).setValue(String(data.notas));
    if (data.plano !== undefined) {
      const planoInfo = obterPlanosEspeciais_(false).find(p => p.chave === data.plano);
      if (planoInfo) {
        sheet.getRange(linha, 2).setValue(planoInfo.chave);
        sheet.getRange(linha, 3).setValue(planoInfo.preco);
      }
    }
    if (data.preco !== undefined) sheet.getRange(linha, 3).setValue(Number(data.preco) || 0);
    if (data.nif !== undefined) sheet.getRange(linha, 8).setValue(String(data.nif));
    if (data.dataInicio !== undefined) sheet.getRange(linha, 4).setValue(new Date(data.dataInicio + 'T12:00:00'));
    if (data.dataFim !== undefined) sheet.getRange(linha, 9).setValue(new Date(data.dataFim + 'T12:00:00'));
    Logger.log('Pacote especial editado: linha ' + linha);
    return getPacotesEspeciais();
  } catch (error) {
    Logger.log('Erro editarPacoteEspecial: ' + error.toString());
    throw error;
  }
}

function criarCliente(data) {
  const lock = LockService.getScriptLock();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    lock.waitLock(30000);
    const linha = sheet.getLastRow() + 1;
    const nome = String(data.nome || '').trim();
    if (!nome) throw new Error('O nome do cliente é obrigatório.');
    const existentes = sheet.getLastRow() >= 4 ? sheet.getRange('A4:Y' + sheet.getLastRow()).getValues() : [];
    const idCliente = gerarProximoIdCliente_(existentes);
    sheet.getRange(linha, 1, 1, 11).setValues([[
      nome,
      data.estado || 'Ativo',
      data.contacto || '',
      data.servicoAtual || '',
      '',
      '',
      0,
      0,
      0,
      '',
      data.notas || ''
    ]]);
    if (data.nif !== undefined && data.nif !== null) {
      sheet.getRange(linha, 16).setValue(String(data.nif).trim()); // coluna P = NIF
    }
    sheet.getRange(linha, 25).setValue(idCliente); // Y = ID_CLIENTE estável
    
    Logger.log('Cliente criado: ' + idCliente + ' — ' + nome);
    return { crm: getCRMData(), idCriado: idCliente };
  } catch (error) {
    Logger.log('Erro criar cliente: ' + error.toString());
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function definirPrecoPersonalizado(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        const valor = data.preco === '' || data.preco === null ? '' : Number(data.preco);
        sheet.getRange(i + 4, 12).setValue(valor); // coluna L
        break;
      }
    }
    
    Logger.log('Preço personalizado definido: ' + data.idCliente + ' -> ' + data.preco);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro definir preço: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: lista pagamentos já confirmados este mês cujo recibo ainda não foi
 * marcado como emitido (não emite recibo nenhum — só ajuda a não esquecer).
 */
function getRecibosPendentes() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsData = packsSheet.getRange('A2:K' + packsSheet.getLastRow()).getValues();
    const mesAtual = getMesAnoAtual();
    const precos = getPrecosServicos();
    
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
    const precoPersonalizadoPorCliente = {};
    const nomePorCliente = {};
    clientesData.forEach(row => {
      if (row[0] && row[24]) {
        if (row[11]) precoPersonalizadoPorCliente[String(row[24])] = Number(row[11]);
        nomePorCliente[String(row[24])] = String(row[0]);
      }
    });
    
    const lista = [];
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (row[0] && normalizarMesAno(row[1]) === mesAtual) {
        const estadoPagamento = String(row[7] || 'Pendente');
        const reciboEmitido = !!row[10]; // coluna K
        if (estadoPagamento === 'Pago' && !reciboEmitido) {
          const idClienteStr = String(row[0]);
          const frequencia = String(row[2] || '');
          const preco = precoPersonalizadoPorCliente[idClienteStr] || precos[frequencia] || 0;
          lista.push({
            idCliente: idClienteStr,
            nome: nomePorCliente[idClienteStr] || idClienteStr,
            frequencia: frequencia,
            preco: preco,
            dataPagamento: row[6] ? formatarData(row[6]) : ''
          });
        }
      }
    }
    
    return { lista: lista, mesAtual: mesAtual, mesAtualFormatado: formatarMesAno(mesAtual) };
  } catch (error) {
    Logger.log('Erro getRecibosPendentes: ' + error.toString());
    return { error: error.toString(), lista: [] };
  }
}

/**
 * NOVO: marca o recibo de um pagamento como emitido (só um registo interno,
 * não interage com o Portal das Finanças).
 */
function marcarReciboEmitido(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const mesAno = getMesAnoAtual();
    const packsData = packsSheet.getRange('A2:K' + packsSheet.getLastRow()).getValues();
    
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (String(row[0]) === String(data.idCliente) && normalizarMesAno(row[1]) === mesAno) {
        packsSheet.getRange(i + 2, 11).setValue(true); // coluna K = RECIBO_EMITIDO
        break;
      }
    }
    
    Logger.log('Recibo marcado como emitido: ' + data.idCliente);
    return getRecibosPendentes();
  } catch (error) {
    Logger.log('Erro marcar recibo: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: verifica se algum cliente tem um cancelamento agendado para o mês
 * atual (coluna O = CANCELAR_MES) e, se tiver, aplica o cancelamento agora
 * (estado -> Cancelado) e limpa o agendamento. Chamada sempre que os dados
 * do mês atual são lidos, para a transição acontecer sozinha assim que o
 * mês chega, sem precisares de fazer nada.
 */
function aplicarCancelamentosAgendados_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const mesAtual = getMesAnoAtual();
    const clientesData = sheet.getRange('A4:O' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      const row = clientesData[i];
      if (!row[0]) continue;
      const estado = String(row[1] || 'Ativo');
      const cancelarMes = row[14] ? normalizarMesAno(row[14]) : '';
      if (estado === 'Ativo' && cancelarMes === mesAtual) {
        sheet.getRange(i + 4, 2).setValue('Cancelado'); // coluna B = ESTADO
        sheet.getRange(i + 4, 15).setValue(''); // coluna O = CANCELAR_MES
        Logger.log('Cancelamento agendado aplicado: ' + row[0]);
      }
    }
  } catch (error) {
    Logger.log('Erro ao aplicar cancelamentos agendados: ' + error.toString());
  }
}

/**
 * NOVO: agenda o cancelamento de um cliente para o mês seguinte ao atual.
 * O cliente continua Ativo (e a contar normalmente) durante o mês atual;
 * assim que o mês seguinte começar, torna-se Cancelado sozinho.
 */
function cancelarProximoMes(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    const proximoMes = calcularMesComDelta_(getMesAnoAtual(), 1);
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        sheet.getRange(i + 4, 15).setValue(proximoMes); // coluna O = CANCELAR_MES
        break;
      }
    }
    
    Logger.log('Cancelamento agendado para ' + proximoMes + ': ' + data.idCliente);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro ao agendar cancelamento: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: remove um cancelamento agendado, antes de ele acontecer.
 */
function cancelarAgendamentoCancelamento(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        sheet.getRange(i + 4, 15).setValue(''); // coluna O = CANCELAR_MES
        break;
      }
    }
    
    Logger.log('Agendamento de cancelamento removido: ' + data.idCliente);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro ao remover agendamento: ' + error.toString());
    throw error;
  }
}

function getClientesParaRenovar() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mesAtual = getMesAnoAtual();
    const mesAnterior = getMesAnterior(mesAtual);
    
    // Clientes ativos, e quem está suspenso especificamente para este mês
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:N' + clientesSheet.getLastRow()).getValues();
    const clientesAtivos = {};
    const suspensosEsteMes = {};
    for (let i = 0; i < clientesData.length; i++) {
      if (clientesData[i][0] && String(clientesData[i][1]) === 'Ativo') {
        clientesAtivos[String(clientesData[i][0])] = true;
      }
      if (clientesData[i][0] && normalizarMesAno(clientesData[i][13]) === mesAtual) {
        suspensosEsteMes[String(clientesData[i][0])] = true;
      }
    }
    
    // Packs do mês anterior (pode estar em ATIVOS ou já em HISTORICO)
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsData = packsSheet.getRange('A2:H' + packsSheet.getLastRow()).getValues();
    const frequenciaPorCliente = {};
    const jaTemPackEsteMs = {};
    
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (!row[0]) continue;
      const mesAnoPack = normalizarMesAno(row[1]);
      if (mesAnoPack === mesAnterior) {
        frequenciaPorCliente[String(row[0])] = String(row[2] || '');
      }
      if (mesAnoPack === mesAtual) {
        jaTemPackEsteMs[String(row[0])] = true;
      }
    }
    
    // Também procura no histórico, caso o mês anterior já tenha sido arquivado
    const historicoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
    const historicoData = historicoSheet.getRange('A2:C' + historicoSheet.getLastRow()).getValues();
    for (let i = 0; i < historicoData.length; i++) {
      const row = historicoData[i];
      if (!row[0]) continue;
      const mesAnoPack = normalizarMesAno(row[1]);
      if (mesAnoPack === mesAnterior && !frequenciaPorCliente[String(row[0])]) {
        frequenciaPorCliente[String(row[0])] = String(row[2] || '');
      }
    }
    
    const lista = [];
    Object.keys(frequenciaPorCliente).forEach(idCliente => {
      if (clientesAtivos[idCliente] && !jaTemPackEsteMs[idCliente] && !suspensosEsteMes[idCliente]) {
        lista.push({
          idCliente: idCliente,
          nome: idCliente,
          frequenciaAnterior: frequenciaPorCliente[idCliente]
        });
      }
    });
    
    return { lista: lista, mesAtual: mesAtual, mesAtualFormatado: formatarMesAno(mesAtual) };
  } catch (error) {
    Logger.log('Erro getClientesParaRenovar: ' + error.toString());
    return { error: error.toString(), lista: [] };
  }
}

function renovarPacksEmBloco(data) {
  try {
    const itens = data.itens || [];
    let criados = 0;
    
    itens.forEach(item => {
      criarPackInterno_({
        idCliente: item.idCliente,
        frequencia: item.frequencia,
        estadoPagamento: 'Pendente'
      });
      criados++;
    });
    
    Logger.log('Renovação em bloco: ' + criados + ' packs criados');
    return getCRMData();
  } catch (error) {
    Logger.log('Erro renovarPacksEmBloco: ' + error.toString());
    throw error;
  }
}

function editarPack(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    
    const mesAno = getMesAnoAtual();
    const novaFrequencia = data.frequencia;
    const novoTotal = parseInt(novaFrequencia.split('x')[0]) * 4;
    
    const packsData = packsSheet.getRange('A2:J' + packsSheet.getLastRow()).getValues();
    let linhaPack = -1;
    let totalAntigo = 0;
    
    for (let i = 0; i < packsData.length; i++) {
      if (String(packsData[i][0]) === String(data.idCliente) && normalizarMesAno(packsData[i][1]) === mesAno) {
        linhaPack = i + 2;
        totalAntigo = Number(packsData[i][3]) || 0;
        break;
      }
    }
    
    if (linhaPack === -1) {
      throw new Error('Pack não encontrado');
    }
    
    // Atualiza frequência e total na aba de packs
    packsSheet.getRange(linhaPack, 3).setValue(novaFrequencia); // FREQUENCIA
    packsSheet.getRange(linhaPack, 4).setValue(novoTotal); // SESSOES_TOTAL
    
    // Ajusta as sessões
    const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
    const sessoesDoCliente = [];
    for (let i = 0; i < sessoesData.length; i++) {
      if (String(sessoesData[i][0]) === String(data.idCliente) && normalizarMesAno(sessoesData[i][1]) === mesAno) {
        sessoesDoCliente.push({ linha: i + 2, numSessao: Number(sessoesData[i][2]), estado: String(sessoesData[i][4]) });
      }
    }
    
    if (novoTotal > sessoesDoCliente.length) {
      // Acrescenta sessões em falta
      const maxAtual = sessoesDoCliente.length;
      for (let j = maxAtual + 1; j <= novoTotal; j++) {
        sessoesSheet.appendRow([data.idCliente, mesAno, j, '', 'Pendente', '']);
      }
    } else if (novoTotal < sessoesDoCliente.length) {
      // Remove só as sessões Pendentes a mais, do fim para o início, nunca remove Confirmadas
      const pendentesOrdenadas = sessoesDoCliente
        .filter(s => s.estado !== 'Confirmada')
        .sort((a, b) => b.numSessao - a.numSessao);
      
      const totalConfirmadas = sessoesDoCliente.filter(s => s.estado === 'Confirmada').length;
      const aRemover = Math.max(0, sessoesDoCliente.length - Math.max(novoTotal, totalConfirmadas));
      
      const linhasParaApagar = pendentesOrdenadas.slice(0, aRemover).map(s => s.linha).sort((a, b) => b - a);
      linhasParaApagar.forEach(linha => sessoesSheet.deleteRow(linha));
    }
    
    Logger.log('Pack editado: ' + data.idCliente + ' -> ' + novaFrequencia);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro editar pack: ' + error.toString());
    throw error;
  }
}

/**
 * ATUALIZADO: agora auto-corrige o total de sessões se estiver a 0
 * (ex: pack adicionado diretamente na sheet, sem passar pela app)
 */
function gerarSessoesEmFalta(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    
    const mesAno = getMesAnoAtual();
    const packsData = packsSheet.getRange('A2:J' + packsSheet.getLastRow()).getValues();
    
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (String(row[0]) === String(data.idCliente) && normalizarMesAno(row[1]) === mesAno) {
        let sessoesTotal = Number(row[3]) || 0;

        // Auto-corrige se o total estiver a 0 mas houver frequência definida
        if (sessoesTotal === 0 && row[2]) {
          sessoesTotal = calcularSessoesTotalPorFrequencia_(row[2]);
          if (sessoesTotal > 0) {
            packsSheet.getRange(i + 2, 4).setValue(sessoesTotal); // coluna D = SESSOES_TOTAL
            Logger.log('Total de sessões auto-corrigido para ' + data.idCliente + ': ' + sessoesTotal);
          }
        }

        const sessoesExistentes = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
        const sessoesDoCliente = sessoesExistentes.filter(s => String(s[0]) === String(data.idCliente) && normalizarMesAno(s[1]) === mesAno);
        
        if (sessoesDoCliente.length === 0) {
          for (let j = 1; j <= sessoesTotal; j++) {
            sessoesSheet.appendRow([data.idCliente, mesAno, j, '', 'Pendente', '']);
          }
        }
        break;
      }
    }
    
    Logger.log('Sessões em falta geradas');
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro gerar sessões: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: arquiva um cliente — sai da lista principal (CLIENTES) e a linha
 * inteira é copiada para uma aba separada (CLIENTES_ARQUIVO), com a data
 * em que foi arquivado. O histórico de packs e sessões NÃO é tocado —
 * fica exatamente onde está, na sheet, para sempre. Isto é reversível:
 * para trazer o cliente de volta basta copiar a linha de CLIENTES_ARQUIVO
 * de volta para CLIENTES, à mão.
 */
function arquivarCliente(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const idAlvo = String(data.idCliente);
    
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
    
    let linhaEncontrada = -1;
    let dadosLinha = null;
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === idAlvo) {
        linhaEncontrada = i + 4;
        dadosLinha = clientesData[i];
        break;
      }
    }
    
    if (linhaEncontrada === -1) {
      throw new Error('Cliente não encontrado');
    }
    
    // Garante que a aba de arquivo existe, criando-a com cabeçalho se for a primeira vez
    let arquivoSheet = ss.getSheetByName('CLIENTES_ARQUIVO');
    if (!arquivoSheet) {
      arquivoSheet = ss.insertSheet('CLIENTES_ARQUIVO');
      arquivoSheet.appendRow([
        'NOME', 'ESTADO', 'CONTACTO', 'SERVICO_ATUAL', 'INICIO_PACK', 'VALIDADE_ATE',
        'SESSOES_INCL', 'SESSOES_REALIZ', 'SESSOES_RESTAM', 'PROXIMA_SESSAO', 'NOTAS',
        'PRECO_PERSONALIZADO', 'LINHA_DO_PACK_AUTO', 'SUSPENSO_MES', 'CANCELAR_MES',
        'NIF', 'CONTRATO_FILE_ID', 'MORADA', 'EMAIL', 'TOKEN_ASSINATURA',
        'ASSINATURA_ACEITE_EM', 'DIA_PAGAMENTO', 'METODO_PAGAMENTO', 'TOKEN_PORTAL', 'ID_CLIENTE', 'DATA_ARQUIVO'
      ]);
    }
    
    const linhaComData = dadosLinha.slice();
    linhaComData.push(new Date());
    arquivoSheet.appendRow(linhaComData);
    
    clientesSheet.deleteRow(linhaEncontrada);
    
    Logger.log('Cliente arquivado: ' + idAlvo);
    return getCRMData();
  } catch (error) {
    Logger.log('Erro ao arquivar cliente: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: suspende a renovação do cliente para o mês seguinte ao atual —
 * o "Renovar mês" (e a futura renovação automática) vai ignorá-lo nesse
 * mês específico. O cliente continua Ativo, continua nas estatísticas,
 * só não recebe pack novo nesse mês. No mês a seguir volta ao normal
 * sozinho, sem precisares de fazer nada.
 */
function suspenderProximoMes(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    const proximoMes = calcularMesComDelta_(getMesAnoAtual(), 1);
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        sheet.getRange(i + 4, 14).setValue(proximoMes); // coluna N = SUSPENSO_MES
        break;
      }
    }
    
    Logger.log('Cliente suspenso para ' + proximoMes + ': ' + data.idCliente);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro ao suspender cliente: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: cancela uma suspensão já marcada (o cliente volta a renovar
 * normalmente no mês em causa).
 */
function cancelarSuspensao(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        sheet.getRange(i + 4, 14).setValue(''); // coluna N = SUSPENSO_MES
        break;
      }
    }
    
    Logger.log('Suspensão cancelada: ' + data.idCliente);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro ao cancelar suspensão: ' + error.toString());
    throw error;
  }
}

/**
 * Utilitário: soma/subtrai meses a uma string "YYYY-MM".
 */
function calcularMesComDelta_(mesAno, delta) {
  const arr = mesAno.split('-');
  let ano = parseInt(arr[0], 10);
  let mes = parseInt(arr[1], 10) + delta;
  while (mes > 12) { mes -= 12; ano++; }
  while (mes < 1) { mes += 12; ano--; }
  return ano + '-' + String(mes).padStart(2, '0');
}

function definirEstadoCliente(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        sheet.getRange(i + 4, 2).setValue(data.novoEstado); // coluna B = ESTADO
        
        // Ao reativar, limpa qualquer suspensão/cancelamento agendado que
        // tenha ficado pendente de antes — sem isto, um agendamento antigo
        // podia disparar sozinho mais tarde, sem o utilizador perceber
        // porquê o cliente foi cancelado.
        if (data.novoEstado === 'Ativo') {
          sheet.getRange(i + 4, 14).setValue(''); // coluna N = SUSPENSO_MES
          sheet.getRange(i + 4, 15).setValue(''); // coluna O = CANCELAR_MES
        }
        
        break;
      }
    }
    
    Logger.log('Estado do cliente alterado: ' + data.idCliente + ' -> ' + data.novoEstado);
    return getCRMData();
  } catch (error) {
    Logger.log('Erro ao alterar estado do cliente: ' + error.toString());
    throw error;
  }
}

/**
 * Edita os dados de um cliente. O nome é agora um campo normal: o ID_CLIENTE
 * estável (coluna Y) é a única chave usada nas restantes tabelas.
 */
function editarDadosCliente(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    let linha = -1;
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        linha = i + 4;
        break;
      }
    }
    
    if (linha === -1) {
      throw new Error('Cliente não encontrado');
    }

    if (data.nome !== undefined && data.nome !== null) {
      const nome = String(data.nome).trim();
      if (!nome) throw new Error('O nome do cliente é obrigatório.');
      sheet.getRange(linha, 1).setValue(nome);
    }
    
    if (data.contacto !== undefined && data.contacto !== null) {
      sheet.getRange(linha, 3).setValue(String(data.contacto)); // coluna C = CONTACTO
    }
    
    if (data.servicoAtual !== undefined && data.servicoAtual !== null) {
      sheet.getRange(linha, 4).setValue(String(data.servicoAtual)); // coluna D = SERVIÇO ATUAL
    }
    
    if (data.nif !== undefined && data.nif !== null) {
      sheet.getRange(linha, 16).setValue(String(data.nif)); // coluna P = NIF
    }
    
    if (data.morada !== undefined && data.morada !== null) {
      sheet.getRange(linha, 18).setValue(String(data.morada)); // coluna R = MORADA
    }
    
    if (data.email !== undefined && data.email !== null) {
      sheet.getRange(linha, 19).setValue(String(data.email)); // coluna S = EMAIL
    }
    
    if (data.diaPagamento !== undefined && data.diaPagamento !== null) {
      sheet.getRange(linha, 22).setValue(data.diaPagamento ? Number(data.diaPagamento) : ''); // coluna V = DIA_PAGAMENTO
    }
    
    if (data.metodoPagamento !== undefined && data.metodoPagamento !== null) {
      sheet.getRange(linha, 23).setValue(String(data.metodoPagamento)); // coluna W = METODO_PAGAMENTO
    }
    
    Logger.log('Dados do cliente editados: ' + data.idCliente);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro editar dados cliente: ' + error.toString());
    throw error;
  }
}

/**
 * ================= CONTACTOS GOOGLE (IMPORTAÇÃO ASSISTIDA) =================
 *
 * Só lê resultados da People API quando o utilizador pede uma pesquisa. Nunca
 * cria/edita contactos Google; só grava no CMR depois da confirmação explícita.
 */
function procurarContactosGoogle(nomeCliente) {
  const consulta = String(nomeCliente || '').trim();
  if (consulta.length < 2) throw new Error('Indica um nome com pelo menos 2 caracteres.');
  if (typeof People === 'undefined' || !People.People) {
    throw new Error('A ligação aos Contactos Google ainda não foi ativada. Adiciona o serviço People API e volta a autorizar a app.');
  }
  try {
    // A People API recomenda esta pesquisa vazia para atualizar o respetivo cache.
    try { People.People.searchContacts({ query: '', readMask: 'names', pageSize: 1 }); } catch (e) {}
    const palavras = palavrasAgenda_(consulta);
    const consultas = [consulta];
    if (palavras.length >= 2) consultas.push(palavras[0] + ' ' + palavras[palavras.length - 1]);
    if (palavras[0] && palavras[0].length >= 2) consultas.push(palavras[0]);
    const pessoasBrutas = [];
    const consultasFeitas = {};
    consultas.forEach(texto => {
      const chave = normalizarNomeAgenda_(texto);
      if (!chave || consultasFeitas[chave]) return;
      consultasFeitas[chave] = true;
      const resposta = People.People.searchContacts({
        query: texto,
        readMask: 'names,phoneNumbers,emailAddresses',
        pageSize: 20
      });
      (resposta.results || []).forEach(item => pessoasBrutas.push(item.person || {}));
    });
    const vistos = {};
    const resultados = pessoasBrutas.map(pessoa => {
      const nome = pessoa.names && pessoa.names[0] ? String(pessoa.names[0].displayName || '') : '';
      const email = pessoa.emailAddresses && pessoa.emailAddresses[0] ? String(pessoa.emailAddresses[0].value || '') : '';
      const numeros = (pessoa.phoneNumbers || []).map(numero => ({
        valor: String(numero.value || '').trim(),
        tipo: String(numero.type || numero.formattedType || 'Outro')
      })).filter(numero => numero.valor);
      return { nome: nome, email: email, numeros: numeros };
    }).filter(pessoa => {
      const chave = normalizarNomeAgenda_(pessoa.nome) + '|' + pessoa.numeros.map(numero => numero.valor).join('|');
      if (!pessoa.nome || !pessoa.numeros.length || vistos[chave]) return false;
      vistos[chave] = true;
      return true;
    });
    // Primeiro e último nome são suficientes. Os resultados mais próximos
    // aparecem primeiro, sem assumir que o nome do CMR é idêntico ao contacto.
    const tokensConsulta = palavrasAgenda_(consulta);
    resultados.sort((a, b) => {
      const pontos = pessoa => {
        const tokens = palavrasAgenda_(pessoa.nome);
        return tokensConsulta.reduce((soma, token) => soma + (tokens.indexOf(token) >= 0 ? 1 : 0), 0);
      };
      return pontos(b) - pontos(a) || a.nome.localeCompare(b.nome);
    });
    return { consulta: consulta, resultados: resultados.slice(0, 20) };
  } catch (erro) {
    Logger.log('Erro procurarContactosGoogle: ' + erro.toString());
    throw new Error('Não foi possível pesquisar os Contactos Google. Confirma a autorização da People API.');
  }
}

function guardarProdutoEspecial(data) {
  const nome = String(data && data.nome || '').trim();
  const descricao = String(data && data.descricao || '').trim();
  const preco = Number(data && data.preco);
  if (!nome) throw new Error('Indica o nome do produto ou serviço.');
  if (!isFinite(preco) || preco < 0) throw new Error('Indica um preço válido.');
  const sheet = obterOuCriarCatalogoPacotesEspeciais_();
  if (data && data.linha) {
    sheet.getRange(Number(data.linha), 2, 1, 3).setValues([[nome, descricao, preco]]);
  } else {
    const base = normalizarNomeAgenda_(nome).replace(/\s+/g, '-').toUpperCase().slice(0, 28) || 'SERVICO';
    const existentes = obterPlanosEspeciais_(true).map(item => item.chave);
    let chave = base, numero = 2;
    while (existentes.indexOf(chave) !== -1) chave = base + '-' + numero++;
    sheet.appendRow([chave, nome, descricao, preco, 'Sim']);
  }
  return getPacotesEspeciais();
}

function getTotalPacotesEspeciaisNoMes_(mesAno) {
  const sheet = obterOuCriarSheetPacotesEspeciais_();
  if (sheet.getLastRow() < 2) return 0;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues().reduce((total, linha) => {
    const inicio = linha[3] ? formatarDataISO_(linha[3]).slice(0, 7) : '';
    const estado = String(linha[4] || 'Ativo');
    return inicio === mesAno && estado !== 'Cancelado' ? total + (Number(linha[2]) || 0) : total;
  }, 0);
}

/** Executa uma leitura mínima para autorizar a People API, sem guardar dados. */
function autorizarContactosGoogle() {
  if (typeof People === 'undefined' || !People.People) {
    throw new Error('People API não está ativa no projeto. Faz push do manifesto e atualiza o editor.');
  }
  People.People.searchContacts({ query: '', readMask: 'names', pageSize: 1 });
  return { sucesso: true };
}

function guardarContactoImportadoGoogle(data) {
  const idCliente = String(data && data.idCliente || '').trim();
  const contacto = String(data && data.contacto || '').trim();
  if (!idCliente || !contacto) throw new Error('Falta o cliente ou o número a importar.');
  const apenasDigitos = contacto.replace(/\D/g, '');
  if (apenasDigitos.length < 7 || apenasDigitos.length > 15) throw new Error('O número selecionado não parece válido.');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  const dados = sheet.getLastRow() >= 4 ? sheet.getRange('A4:C' + sheet.getLastRow()).getValues() : [];
  const indice = dados.findIndex(linha => String(linha[0]) === idCliente);
  if (indice < 0) throw new Error('Cliente não encontrado.');
  const atual = String(dados[indice][2] || '').trim();
  if (atual && atual !== contacto && !data.confirmarSubstituicao) {
    throw new Error('Este cliente já tem o contacto "' + atual + '". Confirma a substituição antes de guardar.');
  }
  sheet.getRange(indice + 4, 3).setValue(contacto);
  return { sucesso: true, contacto: contacto, anterior: atual };
}

function criarPackInterno_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
  const sessoesSheet = ss.getSheetByName('DB_SESSOES');
  
  const hoje = new Date();
  const mesAno = getMesAnoAtual();
  const frequenciaArray = data.frequencia.split('x');
  const vezesPorSemana = parseInt(frequenciaArray[0]);
  const sessoesTotal = vezesPorSemana * 4;
  
  packsSheet.appendRow([
    data.idCliente,
    mesAno,
    data.frequencia,
    sessoesTotal,
    0,
    hoje,
    data.dataPagamento ? new Date(data.dataPagamento) : '',
    data.estadoPagamento || 'Pendente',
    getMesInicio(mesAno),
    getMesFim(mesAno)
  ]);
  
  if (data.estadoPagamento === 'Pago') {
    for (let i = 1; i <= sessoesTotal; i++) {
      sessoesSheet.appendRow([data.idCliente, mesAno, i, '', 'Pendente', '']);
    }
  }
}

function criarPack(data) {
  try {
    criarPackInterno_(data);
    Logger.log('Pack criado: ' + data.frequencia);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro criar pack: ' + error.toString());
    throw error;
  }
}

function confirmarSessao(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    
    const mesAno = getMesAnoAtual();
    const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
    
    for (let i = 0; i < sessoesData.length; i++) {
      const row = sessoesData[i];
      if (row[0] == data.idCliente && normalizarMesAno(row[1]) === mesAno && row[2] == data.numSessao) {
        const estadoAtual = String(row[4] || 'Pendente');
        if (estadoAtual === 'Confirmada') {
          // Já estava confirmada -> desconfirma (toggle off)
          sessoesSheet.getRange(i + 2, 4).setValue('');
          sessoesSheet.getRange(i + 2, 5).setValue('Pendente');
        } else {
          // Estava pendente -> confirma (toggle on), usando a data escolhida pelo utilizador (ou hoje, se não vier nenhuma)
          const dataTreino = data.dataConfirmada ? new Date(data.dataConfirmada + 'T00:00:00') : new Date();
          sessoesSheet.getRange(i + 2, 4).setValue(dataTreino);
          sessoesSheet.getRange(i + 2, 5).setValue('Confirmada');
        }
        break;
      }
    }
    
    Logger.log('Sessão alternada (confirmada/desconfirmada)');
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro confirmar: ' + error.toString());
    throw error;
  }
}

/**
 * NOVO: atualiza só a data de uma sessão já confirmada, sem a desconfirmar.
 * Usado quando o utilizador quer corrigir a data de um treino já registado.
 */
function atualizarDataSessaoConfirmada(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    
    const mesAno = getMesAnoAtual();
    const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
    
    for (let i = 0; i < sessoesData.length; i++) {
      const row = sessoesData[i];
      if (row[0] == data.idCliente && normalizarMesAno(row[1]) === mesAno && row[2] == data.numSessao) {
        if (String(row[4]) === 'Confirmada' && data.dataConfirmada) {
          const novaData = new Date(data.dataConfirmada + 'T00:00:00');
          sessoesSheet.getRange(i + 2, 4).setValue(novaData);
        }
        break;
      }
    }
    
    Logger.log('Data da sessão atualizada');
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro atualizar data sessão: ' + error.toString());
    throw error;
  }
}

function pagarPack(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    
    const hoje = new Date();
    const mesAno = getMesAnoAtual();
    const packsData = packsSheet.getRange('A2:J' + packsSheet.getLastRow()).getValues();
    
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (row[0] == data.idCliente && normalizarMesAno(row[1]) === mesAno) {
        packsSheet.getRange(i + 2, 7).setValue(hoje);
        packsSheet.getRange(i + 2, 8).setValue('Pago');
        
        const sessoesExistentes = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
        const sessoesDoCliente = sessoesExistentes.filter(s => s[0] == data.idCliente && normalizarMesAno(s[1]) === mesAno);
        
        if (sessoesDoCliente.length === 0) {
          const sessoesTotal = parseInt(row[3]);
          for (let j = 1; j <= sessoesTotal; j++) {
            sessoesSheet.appendRow([
              data.idCliente,
              mesAno,
              j,
              '',
              'Pendente',
              ''
            ]);
          }
        }
        
        break;
      }
    }
    
    Logger.log('Pack pago');
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro pagar: ' + error.toString());
    throw error;
  }
}

/**
 * ATUALIZADO: agora auto-corrige o total de sessões (packAtivo.sessoesTotal) se estiver a 0
 * mas houver uma frequência válida, e grava a correção de volta na sheet.
 */
function getClienteDetalhe(idCliente) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Cliente
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues();
    let cliente = null;
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(idCliente)) {
        const contratoFileId = clientesData[i][16] ? String(clientesData[i][16]).trim() : '';
        const tokenAssinatura = clientesData[i][19] ? String(clientesData[i][19]).trim() : '';
        const assinaturaAceiteEmRaw = clientesData[i][20];
        cliente = {
          id: String(clientesData[i][24]),
          nome: String(clientesData[i][0] || ''),
          estado: String(clientesData[i][1] || 'Ativo'),
          contacto: String(clientesData[i][2] || ''),
          servicoAtual: String(clientesData[i][3] || ''),
          notas: String(clientesData[i][10] || ''),
          precoPersonalizado: clientesData[i][11] ? Number(clientesData[i][11]) : null,
          suspensoMes: clientesData[i][13] ? normalizarMesAno(clientesData[i][13]) : '',
          cancelarMes: clientesData[i][14] ? normalizarMesAno(clientesData[i][14]) : '',
          nif: clientesData[i][15] ? String(clientesData[i][15]).trim() : '',
          contratoUrl: contratoFileId ? ('https://drive.google.com/file/d/' + contratoFileId + '/view') : '',
          morada: clientesData[i][17] ? String(clientesData[i][17]).trim() : '',
          email: clientesData[i][18] ? String(clientesData[i][18]).trim() : '',
          linkAssinatura: tokenAssinatura ? obterLinkAssinatura_(tokenAssinatura) : '',
          assinaturaAceiteEm: assinaturaAceiteEmRaw ? formatarDataHoraPorExtenso_(assinaturaAceiteEmRaw) : '',
          diaPagamento: clientesData[i][21] ? Number(clientesData[i][21]) : null,
          metodoPagamento: clientesData[i][22] ? String(clientesData[i][22]).trim() : ''
        };
        break;
      }
    }
    
    if (!cliente) {
      return { error: 'Cliente não encontrado' };
    }
    
    const mesAno = getMesAnoAtual();

    // Uma única leitura de sessões serve tanto o histórico de marcos como
    // as sessões do mês. Antes, a mesma folha era lida duas vezes.
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
    const sessoes = [];
    const datasConfirmadasCliente = [];
    for (let i = 0; i < sessoesData.length; i++) {
      const linha = sessoesData[i];
      if (String(linha[0]) !== String(idCliente)) continue;
      if (String(linha[4]) === 'Confirmada' && linha[3]) {
        datasConfirmadasCliente.push(new Date(linha[3]));
      }
      if (normalizarMesAno(linha[1]) === mesAno) {
        sessoes.push({
          idCliente: String(linha[0]),
          mesAno: normalizarMesAno(linha[1]),
          numSessao: Number(linha[2]) || 0,
          dataConfirmada: linha[3] ? formatarDataISO_(linha[3]) : '',
          estado: String(linha[4] || 'Pendente')
        });
      }
    }
    datasConfirmadasCliente.sort((a, b) => a - b);
    cliente.totalSessoesConfirmadas = datasConfirmadasCliente.length;
    cliente.marcoAtingido = calcularMaiorMarcoAtingido_(datasConfirmadasCliente.length);
    cliente.streakSemanas = calcularStreakSemanas_(datasConfirmadasCliente);
    cliente.proximoMarco = proximoMarco_(datasConfirmadasCliente.length);

    // Último check-in de pré-sessão (feito pelo cliente via Portal)
    const checkinsRecentes = getCheckinsRecentes_(idCliente, 1);
    cliente.ultimoCheckin = checkinsRecentes.length > 0 ? {
      dataHora: formatarDataHoraPorExtenso_(checkinsRecentes[0].dataHora),
      sono: checkinsRecentes[0].sono,
      stress: checkinsRecentes[0].stress,
      cansaco: checkinsRecentes[0].cansaco,
      refeicoes: checkinsRecentes[0].refeicoes,
      doms: checkinsRecentes[0].doms,
      nota: checkinsRecentes[0].nota
    } : null;

    const planosCliente = getListaPlanosCliente(idCliente).planos || [];
    cliente.numPlanosTreino = planosCliente.length;
    cliente.progressoPlano = getProgressoPlanoRecente(idCliente, planosCliente);
    cliente.modoEspecial = obterModoEspecialCliente_(idCliente);

    const sessoesConfirmadasReal = sessoes.filter(s => s.estado === 'Confirmada').length;
    
    // Pack ativo
    const precos = getPrecosServicos();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsData = packsSheet.getRange('A2:J' + packsSheet.getLastRow()).getValues();
    let packAtivo = null;
    for (let i = 0; i < packsData.length; i++) {
      if (String(packsData[i][0]) === String(idCliente) && normalizarMesAno(packsData[i][1]) === mesAno) {
        const frequencia = String(packsData[i][2] || '');
        const precoFinal = cliente.precoPersonalizado ? cliente.precoPersonalizado : (precos[frequencia] || 0);

        let sessoesTotal = Number(packsData[i][3]) || 0;
        if (sessoesTotal === 0 && frequencia) {
          sessoesTotal = calcularSessoesTotalPorFrequencia_(frequencia);
        }

        packAtivo = {
          idCliente: String(packsData[i][0]),
          mesAno: normalizarMesAno(packsData[i][1]),
          frequencia: frequencia,
          sessoesTotal: sessoesTotal,
          sessoesConfirmadas: sessoesConfirmadasReal,
          estadoPagamento: String(packsData[i][7] || 'Pendente'),
          preco: precoFinal
        };
        break;
      }
    }
    
    // Histórico (só contar, não devolver tudo)
    const packsHistoricoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
    const packsHistoricoData = packsHistoricoSheet.getRange('A2:A' + packsHistoricoSheet.getLastRow()).getValues();
    let totalPacksAntigos = 0;
    for (let i = 0; i < packsHistoricoData.length; i++) {
      if (String(packsHistoricoData[i][0]) === String(idCliente)) {
        totalPacksAntigos++;
      }
    }
    
    return {
      cliente: cliente,
      packAtivo: packAtivo,
      sessoes: sessoes,
      totalPacksAntigos: totalPacksAntigos
    };
  } catch (error) {
    Logger.log('Erro detalhe: ' + error.toString());
    return { error: error.toString() };
  }
}

/*
 * AL MOVE — Ponte CMR <-> Tracker
 *
 * O Tracker escreve os resumos nesta folha sem tocar em DB_SESSOES,
 * que continua reservada à agenda e aos packs do CMR.
 */
const CMR_TRACKER_SHEET = 'DB_TRACKER_SESSOES';

function getResumoTrackerCliente(idCliente, limite) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CMR_TRACKER_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const indice = nome => headers.findIndex(h => String(h).trim().toLowerCase() === nome.toLowerCase());
  const col = {
    sessionId: indice('Tracker_Session_ID'), chave: indice('CMR_Client_Key'), nome: indice('Cliente'),
    data: indice('Data'), plano: indice('Plano'), duracao: indice('Duracao_Min'),
    volume: indice('Volume_Kg'), rpe: indice('RPE_Final'), dor: indice('Dor_Final'), notas: indice('Observacoes')
  };
  if (col.chave < 0 || col.data < 0) return [];

  const chave = String(idCliente || '').trim().toLocaleLowerCase('pt-PT');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return rows
    .filter(row => String(row[col.chave] || '').trim().toLocaleLowerCase('pt-PT') === chave)
    .sort((a, b) => new Date(b[col.data]) - new Date(a[col.data]))
    .slice(0, Math.max(1, Math.min(10, Number(limite) || 5)))
    .map(row => ({
      sessionId: col.sessionId >= 0 ? String(row[col.sessionId] || '') : '',
      data: row[col.data] ? formatarData(row[col.data]) : '',
      plano: col.plano >= 0 ? String(row[col.plano] || '') : '',
      duracaoMin: col.duracao >= 0 ? Number(row[col.duracao]) || 0 : 0,
      volumeKg: col.volume >= 0 ? Number(row[col.volume]) || 0 : 0,
      rpe: col.rpe >= 0 ? String(row[col.rpe] || '') : '',
      dor: col.dor >= 0 ? String(row[col.dor] || '') : '',
      observacoes: col.notas >= 0 ? String(row[col.notas] || '') : ''
    }));
}

/**
 * ================= AGENDA SEMANAL (GOOGLE CALENDAR — SÓ LEITURA) =================
 *
 * O CMR nunca cria, altera ou apaga eventos do Google Calendar. Este bloco apenas
 * espelha a semana para sinalizar sessões de PT que ainda faltam marcar. A leitura
 * é feita em dois calendários dedicados, para não misturar agenda pessoal/PNT GYM.
 */
const AL_MOVE_CALENDARIOS = {
  PT_ID: 'f2f04fa155f4b2fc6d5689327a98d141402777dde8602a98a7f9fe13907510a2@group.calendar.google.com',
  AVALIACOES_ID: '5980bd62bd116248208664152de1d203a3d20df1cf3d147bd1b9c91cc20dc3dc@group.calendar.google.com',
  FUSO_HORARIO: 'Europe/Lisbon',
  CACHE_SEGUNDOS: 60
};

function normalizarNomeAgenda_(valor) {
  return String(valor || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function palavrasAgenda_(valor) {
  const normalizado = normalizarNomeAgenda_(valor);
  return normalizado ? normalizado.split(/\s+/).filter(Boolean) : [];
}

function contemSequenciaAgenda_(texto, sequencia) {
  if (!sequencia || !sequencia.length || sequencia.length > texto.length) return false;
  for (let i = 0; i <= texto.length - sequencia.length; i++) {
    let igual = true;
    for (let j = 0; j < sequencia.length; j++) {
      if (texto[i + j] !== sequencia[j]) { igual = false; break; }
    }
    if (igual) return true;
  }
  return false;
}

function obterOuCriarSheetAliasesAgenda_(ss) {
  let sheet = ss.getSheetByName('DB_AGENDA_ALIASES');
  if (!sheet) {
    sheet = ss.insertSheet('DB_AGENDA_ALIASES');
    sheet.getRange('A1:D1').setValues([['Titulo_Evento', 'Id_Cliente', 'Cliente', 'Atualizado_Em']]);
    sheet.getRange('A1:D1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function obterOuCriarSheetIgnoradosAgenda_(ss) {
  let sheet = ss.getSheetByName('DB_AGENDA_IGNORADOS');
  if (!sheet) {
    sheet = ss.insertSheet('DB_AGENDA_IGNORADOS');
    sheet.getRange('A1:C1').setValues([['Titulo_Evento', 'Motivo', 'Atualizado_Em']]);
    sheet.getRange('A1:C1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function obterIgnoradosAgenda_(ss) {
  const sheet = obterOuCriarSheetIgnoradosAgenda_(ss);
  if (sheet.getLastRow() < 2) return {};
  const ignorados = {};
  sheet.getRange('A2:C' + sheet.getLastRow()).getValues().forEach(linha => {
    const chave = normalizarNomeAgenda_(linha[0]);
    if (chave) ignorados[chave] = String(linha[1] || 'Ignorado manualmente');
  });
  return ignorados;
}

function eventoIgnoradoAutomaticamenteAgenda_(titulo) {
  const texto = normalizarNomeAgenda_(titulo);
  return texto === 'ferias' || texto === 'ferias andre' || texto === 'ferias al move';
}

function ignorarEventoAgenda(data) {
  const titulo = String(data && data.titulo || '').trim();
  if (!titulo) throw new Error('Não foi possível identificar o evento a ignorar.');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = obterOuCriarSheetIgnoradosAgenda_(ss);
  const chave = normalizarNomeAgenda_(titulo);
  const dados = sheet.getLastRow() >= 2 ? sheet.getRange('A2:A' + sheet.getLastRow()).getValues() : [];
  const indice = dados.findIndex(linha => normalizarNomeAgenda_(linha[0]) === chave);
  const valores = [[titulo, String(data && data.motivo || 'Fora da minha carteira de PT'), new Date()]];
  if (indice >= 0) sheet.getRange(indice + 2, 1, 1, 3).setValues(valores);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, 3).setValues(valores);
  return { sucesso: true };
}

function obterAliasesAgenda_(ss, clientes) {
  const sheet = obterOuCriarSheetAliasesAgenda_(ss);
  if (sheet.getLastRow() < 2) return {};
  const ativosPorId = {};
  clientes.forEach(cliente => { ativosPorId[cliente.id] = cliente; });
  const aliases = {};
  sheet.getRange('A2:D' + sheet.getLastRow()).getValues().forEach(linha => {
    const chave = normalizarNomeAgenda_(linha[0]);
    const cliente = ativosPorId[String(linha[1] || '')];
    if (chave && cliente) aliases[chave] = cliente;
  });
  return aliases;
}

/** Guarda uma decisão humana para um título que o CMR não conseguiu associar. */
function guardarAliasAgenda(data) {
  const titulo = String(data && data.titulo || '').trim();
  const idCliente = String(data && data.idCliente || '').trim();
  if (!titulo || !idCliente) throw new Error('Escolhe um cliente antes de associar o evento.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientes = clientesSheet && clientesSheet.getLastRow() >= 4
      ? clientesSheet.getRange('A4:Y' + clientesSheet.getLastRow()).getValues()
        .filter(linha => linha[0] && linha[24] && String(linha[1] || 'Ativo') === 'Ativo')
        .map(linha => ({ id: String(linha[24]), nome: String(linha[0]) }))
      : [];
    const cliente = clientes.find(item => item.id === idCliente);
    if (!cliente) throw new Error('Esse cliente já não está ativo no CMR.');

    const sheet = obterOuCriarSheetAliasesAgenda_(ss);
    const chave = normalizarNomeAgenda_(titulo);
    const dados = sheet.getLastRow() >= 2 ? sheet.getRange('A2:B' + sheet.getLastRow()).getValues() : [];
    const indice = dados.findIndex(linha => normalizarNomeAgenda_(linha[0]) === chave);
    const valores = [[titulo, cliente.id, cliente.nome, new Date()]];
    if (indice >= 0) sheet.getRange(indice + 2, 1, 1, 4).setValues(valores);
    else sheet.getRange(sheet.getLastRow() + 1, 1, 1, 4).setValues(valores);
    return { sucesso: true, cliente: cliente.nome };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Só associa um evento quando há uma única hipótese segura. Nome completo ou
 * primeiro+último nome têm prioridade; só o primeiro nome é aceite se for único.
 * Eventos ambíguos ficam na lista "por confirmar" e nunca contam sessões.
 */
function reconhecerClienteNoEvento_(titulo, clientes, aliasesPorTitulo) {
  const tituloPalavras = palavrasAgenda_(titulo);
  if (!tituloPalavras.length) return { cliente: null, motivo: 'Título vazio' };
  const alias = aliasesPorTitulo && aliasesPorTitulo[normalizarNomeAgenda_(titulo)];
  if (alias) return { cliente: alias, motivo: '' };

  const fortes = clientes.filter(cliente => {
    const nome = palavrasAgenda_(cliente.nome);
    if (contemSequenciaAgenda_(tituloPalavras, nome)) return true;
    return nome.length >= 2 && contemSequenciaAgenda_(tituloPalavras, [nome[0], nome[nome.length - 1]]);
  });
  if (fortes.length === 1) return { cliente: fortes[0], motivo: '' };
  if (fortes.length > 1) return { cliente: null, motivo: 'Nome ambíguo' };

  const primeiros = clientes.filter(cliente => {
    const palavras = palavrasAgenda_(cliente.nome);
    return palavras[0] && tituloPalavras.indexOf(palavras[0]) !== -1;
  });
  if (primeiros.length === 1) return { cliente: primeiros[0], motivo: '' };
  return { cliente: null, motivo: primeiros.length ? 'Primeiro nome ambíguo' : 'Cliente não encontrado no CMR' };
}

function inicioSemanaAgenda_(offsetSemanas) {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  const dia = data.getDay();
  data.setDate(data.getDate() + (dia === 0 ? -6 : 1 - dia) + (Number(offsetSemanas) || 0) * 7);
  return data;
}

function obterCalendarioAgenda_(id, etiqueta) {
  const calendario = CalendarApp.getCalendarById(id);
  if (!calendario) {
    throw new Error('Não foi possível abrir o calendário de ' + etiqueta + '. Confirma que esta conta tem acesso ao calendário partilhado.');
  }
  return calendario;
}

function eventosAgenda_(calendario, inicio, fim, tipo, clientes, aliasesPorTitulo, ignoradosPorTitulo) {
  return calendario.getEvents(inicio, fim).map(evento => {
    const titulo = String(evento.getTitle() || 'Sem título');
    const chave = normalizarNomeAgenda_(titulo);
    const ignorado = tipo === 'PT' && (eventoIgnoradoAutomaticamenteAgenda_(titulo) || !!(ignoradosPorTitulo && ignoradosPorTitulo[chave]));
    // Avaliações são apenas informação de agenda. Nunca são procuradas na
    // lista de clientes PT, mesmo que partilhem o primeiro nome.
    const reconhecimento = tipo === 'AVALIACAO' || ignorado
      ? { cliente: null, motivo: tipo === 'AVALIACAO' ? 'Avaliação física' : 'Fora do controlo de PT' }
      : reconhecerClienteNoEvento_(titulo, clientes, aliasesPorTitulo);
    const inicioEvento = evento.getStartTime();
    const fimEvento = evento.getEndTime();
    return {
      id: evento.getId(),
      tipo: tipo,
      titulo: titulo,
      clienteId: reconhecimento.cliente ? reconhecimento.cliente.id : '',
      clienteNome: reconhecimento.cliente ? reconhecimento.cliente.nome : '',
      reconhecido: !!reconhecimento.cliente,
      ignorado: ignorado,
      motivoNaoReconhecido: reconhecimento.motivo || '',
      dia: Utilities.formatDate(inicioEvento, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'yyyy-MM-dd'),
      horaInicio: evento.isAllDayEvent() ? 'Todo o dia' : Utilities.formatDate(inicioEvento, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'HH:mm'),
      horaFim: evento.isAllDayEvent() ? '' : Utilities.formatDate(fimEvento, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'HH:mm'),
      inicioMs: inicioEvento.getTime(),
      diaSemana: Utilities.formatDate(inicioEvento, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'EEEE')
    };
  });
}

function getAgendaSemanalCMR(offsetSemanas, forcarAtualizacao) {
  try {
    const offset = Math.max(-52, Math.min(52, Number(offsetSemanas) || 0));
    const inicio = inicioSemanaAgenda_(offset);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 7);
    const semanaId = Utilities.formatDate(inicio, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'yyyyMMdd');
    const cache = CacheService.getScriptCache();
    const cacheKey = 'agenda-cmr-v1-' + semanaId;
    if (forcarAtualizacao) cache.remove(cacheKey);
    const emCache = cache.get(cacheKey);
    if (emCache) return JSON.parse(emCache);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientesSheet = ss.getSheetByName('CLIENTES');
    if (!clientesSheet) throw new Error('A aba CLIENTES não foi encontrada.');
    const ultimaLinhaClientes = clientesSheet.getLastRow();
    const clientes = ultimaLinhaClientes >= 4
      ? clientesSheet.getRange('A4:Y' + ultimaLinhaClientes).getValues()
        .filter(linha => linha[0] && linha[24] && String(linha[1] || 'Ativo') === 'Ativo')
        .map(linha => ({ id: String(linha[24]), nome: String(linha[0]) }))
      : [];

    const mesReferencia = Utilities.formatDate(inicio, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'yyyy-MM');
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsPorCliente = {};
    if (packsSheet && packsSheet.getLastRow() >= 2) {
      packsSheet.getRange('A2:H' + packsSheet.getLastRow()).getValues().forEach(linha => {
        const idCliente = String(linha[0] || '');
        if (!idCliente || normalizarMesAno(linha[1]) !== mesReferencia) return;
        packsPorCliente[idCliente] = {
          frequencia: String(linha[2] || ''),
          estadoPagamento: String(linha[7] || 'Pendente')
        };
      });
    }

    const aliasesPorTitulo = obterAliasesAgenda_(ss, clientes);
    const ignoradosPorTitulo = obterIgnoradosAgenda_(ss);
    const calendarioPT = obterCalendarioAgenda_(AL_MOVE_CALENDARIOS.PT_ID, 'PT');
    const calendarioAvaliacoes = obterCalendarioAgenda_(AL_MOVE_CALENDARIOS.AVALIACOES_ID, 'Avaliações Físicas');
    const eventosPT = eventosAgenda_(calendarioPT, inicio, fim, 'PT', clientes, aliasesPorTitulo, ignoradosPorTitulo);
    const eventosAvaliacoes = eventosAgenda_(calendarioAvaliacoes, inicio, fim, 'AVALIACAO', clientes, aliasesPorTitulo, ignoradosPorTitulo);
    const eventos = eventosPT.concat(eventosAvaliacoes).sort((a, b) => a.inicioMs - b.inicioMs);
    const porCliente = {};
    eventosPT.forEach(evento => {
      if (evento.clienteId) porCliente[evento.clienteId] = (porCliente[evento.clienteId] || 0) + 1;
    });

    const clientesResumo = clientes.map(cliente => {
      const pack = packsPorCliente[cliente.id] || null;
      const match = pack && pack.frequencia.match(/^(\d+)x/i);
      const esperado = match ? Number(match[1]) : 0;
      const marcadas = porCliente[cliente.id] || 0;
      return {
        id: cliente.id,
        nome: cliente.nome,
        frequencia: pack ? pack.frequencia : '',
        esperado: esperado,
        marcadas: marcadas,
        emFalta: esperado ? Math.max(0, esperado - marcadas) : 0,
        semFrequencia: !esperado,
        pagamentoPendente: !!pack && String(pack.estadoPagamento).toLowerCase() !== 'pago'
      };
    }).sort((a, b) => (b.emFalta - a.emFalta) || a.nome.localeCompare(b.nome));

    const clientesComFrequencia = clientesResumo.filter(cliente => !cliente.semFrequencia);
    const resultado = {
      semanaInicio: Utilities.formatDate(inicio, AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'yyyy-MM-dd'),
      semanaFim: Utilities.formatDate(new Date(fim.getTime() - 1), AL_MOVE_CALENDARIOS.FUSO_HORARIO, 'yyyy-MM-dd'),
      tituloSemana: Utilities.formatDate(inicio, AL_MOVE_CALENDARIOS.FUSO_HORARIO, "d 'de' MMMM") + ' — ' + Utilities.formatDate(new Date(fim.getTime() - 1), AL_MOVE_CALENDARIOS.FUSO_HORARIO, "d 'de' MMMM"),
      mesReferencia: mesReferencia,
      clientes: clientesResumo,
      eventos: eventos,
      // Avaliações físicas são informativas e não precisam de estar ligadas a
      // um cliente para serem válidas. Só PT sem correspondência pede correção.
      porConfirmar: eventos.filter(evento => evento.tipo === 'PT' && !evento.reconhecido && !evento.ignorado),
      resumo: {
        esperadas: clientesComFrequencia.reduce((soma, cliente) => soma + cliente.esperado, 0),
        marcadas: eventosPT.filter(evento => evento.reconhecido).length,
        emFalta: clientesComFrequencia.reduce((soma, cliente) => soma + cliente.emFalta, 0),
        avaliacoes: eventosAvaliacoes.length,
        porConfirmar: eventosPT.filter(evento => !evento.reconhecido && !evento.ignorado).length,
        semFrequencia: clientesResumo.filter(cliente => cliente.semFrequencia).length
      }
    };
    cache.put(cacheKey, JSON.stringify(resultado), AL_MOVE_CALENDARIOS.CACHE_SEGUNDOS);
    return resultado;
  } catch (erro) {
    Logger.log('Erro getAgendaSemanalCMR: ' + erro.toString());
    throw new Error('Não foi possível ler a Agenda: ' + erro.message);
  }
}

function formatarData(data) {
  try {
    if (!data) return '';
    if (typeof data === 'string') return data;
    const d = new Date(data);
    if (isNaN(d.getTime())) return '';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return dia + '/' + mes + '/' + ano;
  } catch (e) {
    return '';
  }
}

/**
 * NOVO: formata uma data em ISO (yyyy-mm-dd), usado para enviar ao frontend
 * de forma que o <input type="date"> a consiga ler diretamente.
 */
function formatarDataISO_(data) {
  try {
    if (!data) return '';
    const d = (data instanceof Date) ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return ano + '-' + mes + '-' + dia;
  } catch (e) {
    return '';
  }
}

/**
 * ================= CONTRATO DE PRESTAÇÃO DE SERVIÇOS =================
 * Gera um contrato em PDF, formatado por código (sem precisar de nenhum
 * modelo à parte), com o logo AL MOVE, e preenchido com os dados do
 * cliente + os campos extra que só fazem sentido no momento do contrato
 * (NIF, duração em meses, dia de pagamento, local).
 * Guarda o PDF numa pasta dedicada do Drive e devolve o link.
 */

/**
 * ================= MEU PERFIL (Personal Trainer) =================
 * Dados sobre ti (não sobre clientes) — usados nos contratos. Textos
 * pequenos (nome, NIF, morada...) vão nas Propriedades do Script. As
 * imagens (assinatura, foto de perfil) vão para uma pasta no Drive — as
 * Propriedades têm um limite de 9KB por valor, pequeno de mais para
 * qualquer imagem real, por isso só guardamos lá a referência ao ficheiro.
 */

const PROP_PERFIL_PT_DADOS = 'PERFIL_PT_DADOS';
const PROP_PERFIL_ASSINATURA_FILE_ID = 'PERFIL_ASSINATURA_FILE_ID';
const PROP_PERFIL_FOTO_FILE_ID = 'PERFIL_FOTO_FILE_ID';
const NOME_PASTA_PERFIL = 'AL MOVE - Perfil';

function obterOuCriarPastaPerfil_() {
  const pastas = DriveApp.getFoldersByName(NOME_PASTA_PERFIL);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(NOME_PASTA_PERFIL);
}

/**
 * Guarda (ou substitui) uma imagem do perfil no Drive, apagando a anterior
 * se existir. Se dataUri vier vazio, só apaga a imagem atual (equivale a
 * "remover").
 */
function guardarImagemPerfil_(dataUri, nomeFicheiro, propKeyFileId) {
  const props = PropertiesService.getScriptProperties();
  const idAntigo = props.getProperty(propKeyFileId);
  if (idAntigo) {
    try { DriveApp.getFileById(idAntigo).setTrashed(true); } catch (e) { /* já não existe, ignora */ }
  }
  
  if (!dataUri) {
    props.deleteProperty(propKeyFileId);
    return;
  }
  
  const match = String(dataUri).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!match) return;
  
  const bytes = Utilities.base64Decode(match[2]);
  const blob = Utilities.newBlob(bytes, match[1], nomeFicheiro);
  const pasta = obterOuCriarPastaPerfil_();
  const file = pasta.createFile(blob);
  props.setProperty(propKeyFileId, file.getId());
}

/**
 * Lê uma imagem do perfil de volta do Drive, já como data URI pronta a
 * usar num <img> ou a inserir num documento.
 */
function obterImagemPerfilBase64_(propKeyFileId) {
  const fileId = PropertiesService.getScriptProperties().getProperty(propKeyFileId);
  if (!fileId) return '';
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    Logger.log('Erro ao ler imagem de perfil: ' + e.toString());
    return '';
  }
}

function getPerfilPT() {
  try {
    const valor = PropertiesService.getScriptProperties().getProperty(PROP_PERFIL_PT_DADOS);
    const dados = valor ? JSON.parse(valor) : {};
    return {
      nome: dados.nome || 'André',
      nif: dados.nif || '',
      morada: dados.morada || '',
      contacto: dados.contacto || '',
      horasAvisoCancelamento: dados.horasAvisoCancelamento || 12,
      diasAvisoDenuncia: dados.diasAvisoDenuncia || 30,
      fidelizacaoMeses: dados.fidelizacaoMeses || 3,
      // Seguro de responsabilidade civil profissional (Cláusula 11.ª do contrato) —
      // dados fixos do André, iguais em todos os contratos, preenchidos uma vez aqui.
      seguroCompanhia: dados.seguroCompanhia || '',
      seguroApolice: dados.seguroApolice || '',
      seguroCapital: dados.seguroCapital || '',
      seguroRiscos: dados.seguroRiscos || '',
      // Resolução Alternativa de Litígios e tribunal competente (Cláusula 14.ª)
      ralEntidade: dados.ralEntidade || '',
      ralWebsite: dados.ralWebsite || '',
      comarca: dados.comarca || '',
      prazoRespostaReclamacoesDias: dados.prazoRespostaReclamacoesDias || 10,
      assinatura: obterImagemPerfilBase64_(PROP_PERFIL_ASSINATURA_FILE_ID),
      fotoPerfil: obterImagemPerfilBase64_(PROP_PERFIL_FOTO_FILE_ID)
    };
  } catch (e) {
    Logger.log('Erro getPerfilPT: ' + e.toString());
    return {
      nome: 'André', nif: '', morada: '', contacto: '', horasAvisoCancelamento: 12, diasAvisoDenuncia: 30, fidelizacaoMeses: 3,
      seguroCompanhia: '', seguroApolice: '', seguroCapital: '', seguroRiscos: '',
      ralEntidade: '', ralWebsite: '', comarca: '', prazoRespostaReclamacoesDias: 10,
      assinatura: '', fotoPerfil: ''
    };
  }
}

function guardarPerfilPT(data) {
  try {
    if (!data.nome) throw new Error('O nome é obrigatório');
    const dados = {
      nome: String(data.nome).trim(),
      nif: data.nif ? String(data.nif).trim() : '',
      morada: data.morada ? String(data.morada).trim() : '',
      contacto: data.contacto ? String(data.contacto).trim() : '',
      horasAvisoCancelamento: data.horasAvisoCancelamento ? Number(data.horasAvisoCancelamento) : 12,
      diasAvisoDenuncia: data.diasAvisoDenuncia ? Number(data.diasAvisoDenuncia) : 30,
      fidelizacaoMeses: data.fidelizacaoMeses ? Number(data.fidelizacaoMeses) : 3,
      seguroCompanhia: data.seguroCompanhia ? String(data.seguroCompanhia).trim() : '',
      seguroApolice: data.seguroApolice ? String(data.seguroApolice).trim() : '',
      seguroCapital: data.seguroCapital ? String(data.seguroCapital).trim() : '',
      seguroRiscos: data.seguroRiscos ? String(data.seguroRiscos).trim() : '',
      ralEntidade: data.ralEntidade ? String(data.ralEntidade).trim() : '',
      ralWebsite: data.ralWebsite ? String(data.ralWebsite).trim() : '',
      comarca: data.comarca ? String(data.comarca).trim() : '',
      prazoRespostaReclamacoesDias: data.prazoRespostaReclamacoesDias ? Number(data.prazoRespostaReclamacoesDias) : 10
    };
    PropertiesService.getScriptProperties().setProperty(PROP_PERFIL_PT_DADOS, JSON.stringify(dados));
    
    guardarImagemPerfil_(data.assinatura, 'assinatura', PROP_PERFIL_ASSINATURA_FILE_ID);
    guardarImagemPerfil_(data.fotoPerfil, 'foto-perfil', PROP_PERFIL_FOTO_FILE_ID);
    
    Logger.log('Perfil do PT atualizado: ' + dados.nome);
    return getPerfilPT();
  } catch (error) {
    Logger.log('Erro guardarPerfilPT: ' + error.toString());
    throw error;
  }
}
const LOGO_AL_MOVE_BASE64 = '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';
const NOME_PASTA_CONTRATOS = 'AL MOVE - Contratos';

function gerarContratoPDF(data) {
  try {
    if (!data.idCliente) throw new Error('Cliente não especificado');
    if (!data.nif) throw new Error('O NIF é obrigatório');
    if (!data.duracaoMeses) throw new Error('A duração (em meses) é obrigatória');
    if (!data.diaPagamento) throw new Error('O dia de pagamento é obrigatório');
    if (!data.local) throw new Error('O local é obrigatório');
    if (!data.dataInicio) throw new Error('A data de início é obrigatória');

    const detalhe = getClienteDetalhe(data.idCliente);
    if (detalhe.error) throw new Error(detalhe.error);
    const cliente = detalhe.cliente;
    const pack = detalhe.packAtivo;
    const perfilPT = getPerfilPT();

    const frequenciaTexto = pack ? String(pack.frequencia) : '';
    const partesFreq = frequenciaTexto.split('x');
    const vezesSemana = partesFreq[0] || '-';
    const duracaoSessao = partesFreq[1] || '-';
    const numSessoes = pack ? pack.sessoesTotal : '-';
    const precoMensal = pack ? Number(pack.preco).toFixed(2) : (cliente.precoPersonalizado ? Number(cliente.precoPersonalizado).toFixed(2) : '0.00');

    // Data de término = data de início + duração em meses
    const dataInicioObj = new Date(data.dataInicio + 'T00:00:00');
    const dataTerminoObj = new Date(dataInicioObj);
    dataTerminoObj.setMonth(dataTerminoObj.getMonth() + parseInt(data.duracaoMeses, 10));

    const nomeDoc = 'Contrato PT - ' + cliente.nome + ' - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const doc = DocumentApp.create(nomeDoc);
    const body = doc.getBody();
    body.setMarginTop(50).setMarginBottom(50).setMarginLeft(60).setMarginRight(60);

    // Logo no topo, centrado
    try {
      const logoBytes = Utilities.base64Decode(LOGO_AL_MOVE_BASE64);
      const logoBlob = Utilities.newBlob(logoBytes, 'image/png', 'logo.png');
      const imagemParagrafo = body.appendParagraph('');
      const imagem = imagemParagrafo.appendInlineImage(logoBlob);
      const larguraOriginal = imagem.getWidth();
      const alturaOriginal = imagem.getHeight();
      const larguraFinal = 90;
      imagem.setWidth(larguraFinal);
      imagem.setHeight(Math.round(alturaOriginal * (larguraFinal / larguraOriginal)));
      imagemParagrafo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    } catch (eLogo) {
      Logger.log('Aviso: não foi possível inserir o logo: ' + eLogo.toString());
    }

    const titulo = body.appendParagraph('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PERSONAL TRAINING');
    titulo.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titulo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    titulo.setSpacingBefore(10).setSpacingAfter(20);

    function secao(numero, tituloTexto) {
      const p = body.appendParagraph(numero + '. ' + tituloTexto);
      p.setBold(true).setFontSize(12).setSpacingBefore(14).setSpacingAfter(4);
    }
    function texto(t) {
      body.appendParagraph(t).setFontSize(11).setSpacingAfter(4);
    }
    function subtitulo(t) {
      const p = body.appendParagraph(t);
      p.setBold(true).setFontSize(11).setSpacingBefore(10).setSpacingAfter(4);
    }

    // ===== Identificação das partes =====
    subtitulo('PRESTADOR DE SERVIÇOS');
    texto('Nome: ' + perfilPT.nome);
    if (perfilPT.nif) texto('NIF: ' + perfilPT.nif);
    if (perfilPT.morada) texto('Morada: ' + perfilPT.morada);
    if (perfilPT.contacto) texto('Contacto: ' + perfilPT.contacto);

    subtitulo('CLIENTE');
    texto('Nome completo: ' + cliente.nome);
    texto('NIF: ' + data.nif);
    if (cliente.morada) texto('Morada: ' + cliente.morada);
    if (cliente.email) texto('Email: ' + cliente.email);
    if (cliente.contacto) texto('Contacto: ' + cliente.contacto);

    if (perfilPT.contacto || perfilPT.morada || cliente.email || cliente.contacto) {
      const domicilio = body.appendParagraph('Os contactos e endereços eletrónicos indicados pelas partes são válidos como meio de comunicação e notificação para todos os efeitos do presente contrato.');
      domicilio.setFontSize(9).setForegroundColor('#666666').setSpacingBefore(8).setSpacingAfter(12).setItalic(true);
    }

    const intro = body.appendParagraph('É celebrado o presente Contrato de Prestação de Serviços de Personal Training, que se rege pelas cláusulas seguintes.');
    intro.setFontSize(11).setSpacingBefore(12).setSpacingAfter(16);

    const precoTotal = pack ? (Number(pack.preco) * Number(data.duracaoMeses)).toFixed(2) : '0.00';
    const modalidadePagamento = data.modalidadePagamento || 'mensal';
    const semanasSuspensao = data.periodoSuspensao ? String(data.periodoSuspensao).trim() : '';

    // ===== 1. Objeto =====
    secao('1', 'Objeto');
    texto('O Prestador obriga-se a prestar ao Cliente serviços de personal training, de forma personalizada, profissional e independente, tendo em conta os objetivos, necessidades e condições de saúde do Cliente identificados na avaliação inicial e ao longo da vigência do contrato.');
    texto('Os serviços incluem: avaliação física inicial; definição conjunta de objetivos; elaboração e adaptação periódica de planos de treino; acompanhamento presencial com supervisão direta; correção técnica dos exercícios; acompanhamento da evolução através de reavaliações periódicas; e acesso às ferramentas digitais do Prestador para marcações, planos e comunicação (Cláusula 9.ª).');
    texto('Serviço/Plano contratado: ' + vezesSemana + 'x por semana, ' + duracaoSessao + ' minutos por sessão.' + (data.outrosServicos ? ' Outros serviços incluídos: ' + data.outrosServicos + '.' : ' Sem outros serviços adicionais incluídos.'));
    texto('O presente contrato não inclui serviços de nutrição, fisioterapia, medicina desportiva ou qualquer outra prestação de saúde regulamentada, que devem ser procurados junto de profissionais habilitados.');

    // ===== 2. Condições específicas =====
    secao('2', 'Condições específicas do serviço');
    texto('Data de início: ' + formatarDataPorExtenso_(dataInicioObj));
    texto('Fim do período de fidelização: ' + formatarDataPorExtenso_(dataTerminoObj));
    texto('Frequência prevista: ' + vezesSemana + ' vez(es) por semana.');
    texto('Número de sessões incluídas: ' + numSessoes + '.');
    texto('Duração de cada sessão: ' + duracaoSessao + ' minutos.');
    texto('As sessões não utilizadas caducam no final do mês a que respeitam, não sendo acumuláveis nem reembolsáveis, salvo acordo escrito em contrário ou nos casos previstos nas Cláusulas 4.ª e 8.ª.');

    // ===== 3. Local e horários =====
    secao('3', 'Local e horários');
    texto('As sessões decorrerão em ' + data.local + ', ou noutro local previamente acordado entre as Partes.');
    texto('O Prestador atua de forma autónoma e independente, não mantendo qualquer relação de subordinação com o estabelecimento ou espaço onde as sessões sejam realizadas. Os direitos e obrigações inerentes à utilização do espaço são da responsabilidade da Parte que assegurou o respetivo acesso.');
    texto('Os horários são definidos por acordo entre as Partes, tendo em conta a disponibilidade do Prestador, podendo ser alterados mediante acordo mútuo comunicado com antecedência razoável.');

    // ===== 4. Marcação e cancelamento =====
    secao('4', 'Marcação, cancelamento, faltas e atrasos');
    texto('As sessões devem ser marcadas com antecedência mínima de ' + perfilPT.horasAvisoCancelamento + ' horas, preferencialmente através da plataforma digital do Prestador.');
    texto('O Cliente pode cancelar ou alterar uma sessão marcada sem perda da mesma, desde que o faça com uma antecedência mínima de ' + perfilPT.horasAvisoCancelamento + ' horas em relação à hora de início prevista. Fora deste prazo, ou em caso de falta sem comunicação prévia, a sessão é considerada utilizada, salvo motivo atendível devidamente comprovado ou acordo diverso aceite pelo Prestador.');
    texto('O atraso do Cliente não prolonga a duração da sessão além do horário previamente acordado.');
    texto('Quando o cancelamento seja efetuado pelo Prestador, este compromete-se a avisar com a maior antecedência possível e a disponibilizar sessão de substituição ou o correspondente ajuste de validade, sem que tal implique perda de qualquer sessão por parte do Cliente.');

    // ===== 5. Preço e pagamento =====
    secao('5', 'Preço e pagamento');
    texto('O preço total dos serviços contratados é de ' + precoTotal + ' € (' + data.duracaoMeses + ' mensalidade(s) de ' + precoMensal + ' €), acrescido de IVA à taxa legal em vigor, quando aplicável.');
    texto('Modalidade de pagamento: ' + modalidadePagamento + '. Valor de cada prestação mensal: ' + precoMensal + ' €. As prestações vencem-se no dia ' + data.diaPagamento + ' de cada mês.');
    texto('O Prestador obriga-se a emitir, após cada pagamento, o competente documento fiscal, nos termos da legislação fiscal aplicável.');
    texto('O não pagamento de qualquer prestação na data de vencimento constitui o Cliente em mora, nos termos do artigo 805.º do Código Civil, sendo devidos juros de mora à taxa legal em vigor (artigo 806.º). Em caso de mora, o Prestador pode suspender a prestação dos serviços, nos termos do artigo 428.º n.º 1 do Código Civil. Se o atraso se prolongar por mais de 10 dias após interpelação escrita, o Prestador pode resolver o contrato por incumprimento, com direito a indemnização pelos danos sofridos, sem prejuízo do disposto na Cláusula 12.ª');

    // ===== 6. Responsabilidades do Prestador =====
    secao('6', 'Responsabilidades do Prestador');
    texto('O Prestador obriga-se a prestar os serviços com diligência, profissionalismo, zelo e competência técnica, respeitando as boas práticas da atividade e adaptando os treinos à condição física, objetivos e limitações do Cliente.');
    texto('O Prestador não garante a obtenção de resultados específicos (perda de peso, ganho de massa muscular, melhoria de performance), porquanto estes dependem de fatores externos ao seu controlo, nomeadamente a adesão do Cliente, os hábitos alimentares e de descanso, a predisposição genética e o estado de saúde geral.');
    texto('A responsabilidade do Prestador por danos patrimoniais emergentes de incumprimento ou cumprimento defeituoso do presente contrato fica limitada ao montante total dos valores pagos pelo Cliente nos 12 meses imediatamente anteriores ao facto gerador do dano, salvo em caso de dolo ou culpa grave. Esta limitação não abrange, em caso algum, os danos causados à vida, à integridade física ou à saúde do Cliente.');

    // ===== 7. Responsabilidades do Cliente =====
    secao('7', 'Responsabilidades do Cliente');
    texto('O Cliente obriga-se a prestar informações verdadeiras, completas e atualizadas sobre o seu estado de saúde, condição física, historial clínico e qualquer outra circunstância relevante para a prestação segura do serviço, e a comunicar de imediato qualquer dor, lesão ou alteração relevante do seu estado de saúde.');
    texto('O Cliente obriga-se a cumprir as instruções de segurança transmitidas pelo Prestador. O serviço não substitui acompanhamento médico, fisioterapêutico, nutricional ou de outro profissional de saúde quando este seja necessário.');
    texto('O Cliente é responsável pelos danos causados a terceiros, ao espaço de treino ou ao equipamento utilizado, sempre que resultem de comportamento culposo da sua parte ou de incumprimento das instruções de segurança, bem como pelos danos que o Prestador venha a sofrer em consequência direta de informações falsas ou desatualizadas que lhe tenha prestado.');

    // ===== 8. Suspensão, férias e força maior =====
    secao('8', 'Suspensão, férias, indisponibilidade e força maior');
    texto('As Partes podem acordar, por escrito, a suspensão temporária dos serviços' + (semanasSuspensao ? ', por um período máximo de ' + semanasSuspensao + ' semanas consecutivas' : '') + ', designadamente por motivo de férias ou ausência prolongada. Durante a suspensão não se vencem prestações, ficando o prazo do contrato automaticamente prorrogado pelo período de suspensão.');
    texto('Em caso de indisponibilidade temporária do Prestador não imputável ao Cliente, o Prestador reagendará as sessões afetadas ou fará o correspondente ajuste de validade, sem qualquer encargo adicional para o Cliente.');
    texto('Em caso de força maior (encerramento administrativo, epidemia, catástrofe natural ou doença prolongada do Prestador, entre outros), as obrigações de ambas as Partes ficam suspensas pelo período do impedimento, prorrogando-se o contrato por período equivalente. Se o impedimento persistir por mais de 30 dias consecutivos, qualquer das Partes pode denunciar o contrato mediante aviso prévio escrito de 5 dias, ficando apenas obrigada ao pagamento dos serviços já prestados.');

    // ===== 9. Plataformas digitais =====
    secao('9', 'Plataformas digitais');
    texto('O Prestador pode recorrer a plataformas e ferramentas digitais para marcação de sessões, disponibilização de planos de treino, registo de progressos e comunicação com o Cliente. O acesso do Cliente pode depender de registo próprio nessas plataformas, de acordo com as instruções do Prestador. O Prestador não é responsável por falhas ou indisponibilidades de plataformas de terceiros fora do seu controlo.');

    // ===== 10. Proteção de dados =====
    secao('10', 'Proteção de dados pessoais');
    texto('O Prestador é o responsável pelo tratamento dos dados pessoais do Cliente recolhidos no âmbito e para execução do presente contrato, nomeadamente dados de identificação, contacto, faturação, marcações e registos de treino e, quando comunicados pelo Cliente, dados relativos à saúde.');
    texto('Os dados são tratados de acordo com a legislação aplicável em matéria de proteção de dados (RGPD), sendo conservados apenas pelo período necessário às finalidades que justificaram a sua recolha. O Cliente tem direito de acesso, retificação, apagamento, limitação, portabilidade e oposição, e pode apresentar reclamação à CNPD.' + (perfilPT.contacto ? ' Contacto para assuntos de proteção de dados: ' + perfilPT.contacto + '.' : ''));

    // ===== 11. Seguro de responsabilidade civil =====
    secao('11', 'Seguro de responsabilidade civil profissional');
    if (perfilPT.seguroCompanhia || perfilPT.seguroApolice) {
      texto('O Prestador declara que dispõe de seguro de responsabilidade civil profissional relativo ao exercício da atividade de personal training, celebrado com a companhia ' + (perfilPT.seguroCompanhia || '[____]') + (perfilPT.seguroApolice ? ', apólice n.º ' + perfilPT.seguroApolice : '') + (perfilPT.seguroCapital ? ', com capital seguro de ' + perfilPT.seguroCapital + ' €' : '') + (perfilPT.seguroRiscos ? ', cobrindo os riscos de ' + perfilPT.seguroRiscos : '') + '.');
    } else {
      texto('O Prestador declara que dispõe de seguro de responsabilidade civil profissional relativo ao exercício da atividade de personal training.');
    }
    texto('A eventual cessação ou alteração do seguro não limita a responsabilidade do Prestador perante o Cliente, a qual se mantém nos termos legais e contratuais aplicáveis.');

    // ===== 12. Duração, fidelização e cessação =====
    secao('12', 'Duração, fidelização e cessação');
    texto('O presente contrato entra em vigor em ' + formatarDataPorExtenso_(dataInicioObj) + '. As Partes acordam um período inicial de fidelização de ' + data.duracaoMeses + ' meses, terminando este em ' + formatarDataPorExtenso_(dataTerminoObj) + '.');
    texto('Decorrido o período de fidelização, o contrato passa a vigorar por tempo indeterminado, podendo qualquer das Partes fazer cessar o contrato, a qualquer momento e sem necessidade de justa causa, mediante comunicação escrita com uma antecedência mínima de ' + perfilPT.diasAvisoDenuncia + ' dias. Esta cessação não implica o pagamento de qualquer multa, penalização ou compensação por parte do Cliente, sem prejuízo da liquidação de valores em dívida.');
    texto('Considera-se incumprimento relevante o não pagamento de duas ou mais prestações consecutivas ou interpoladas, o incumprimento reiterado das instruções de segurança, ou a prestação dolosa de informações falsas com impacto na execução do contrato. Verificado um incumprimento relevante, a Parte não incumpridora deve notificar a outra por escrito, concedendo um prazo não inferior a 10 dias para o sanar, podendo resolver o contrato com efeitos imediatos caso não seja sanado.');

    // ===== 13. Direito de livre resolução =====
    secao('13', 'Direito de livre resolução');
    texto('Nos casos em que o presente contrato seja celebrado à distância ou fora do estabelecimento comercial do Prestador, o Cliente dispõe do direito de livre resolução, no prazo de 14 dias a contar da data de celebração, sem necessidade de indicar motivo, nos termos da legislação de defesa do consumidor aplicável.');

    // ===== 14. Reclamações e resolução de litígios =====
    secao('14', 'Reclamações e resolução de litígios');
    texto('O Cliente pode apresentar reclamações ao Prestador através dos contactos indicados neste contrato. O Prestador compromete-se a responder no prazo de ' + perfilPT.prazoRespostaReclamacoesDias + ' dias úteis.');
    texto('Em caso de litígio, o Cliente pode recorrer a entidade de Resolução Alternativa de Litígios (RAL) competente' + (perfilPT.ralEntidade ? ': ' + perfilPT.ralEntidade : '') + (perfilPT.ralWebsite ? ' (' + perfilPT.ralWebsite + ')' : '') + '. Mais informação em www.consumidor.gov.pt. Sem prejuízo do recurso a meios alternativos, é competente o tribunal da comarca de ' + (perfilPT.comarca || '[____]') + ', salvo disposição legal imperativa em sentido diferente.');

    // ===== 15. Disposições finais =====
    secao('15', 'Disposições finais');
    texto('Qualquer alteração ao presente contrato deve ser efetuada por escrito e assinada por ambas as Partes. A nulidade de qualquer cláusula não afeta a validade das restantes. O contrato rege-se pela lei portuguesa.');

    body.appendParagraph('').setSpacingBefore(16);
    body.appendParagraph('Local: ' + data.local + '.').setFontSize(11);
    body.appendParagraph('Data: ' + formatarDataPorExtenso_(new Date())).setFontSize(11);

    // ===== Assinaturas =====
    subtitulo('ASSINATURAS');
    texto('As Partes declaram ter lido e compreendido o presente contrato e aceitam as suas condições.');

    body.appendParagraph('').setSpacingBefore(20);
    body.appendParagraph('O Prestador de Serviços (' + perfilPT.nome + ')').setFontSize(11).setBold(true);

    if (perfilPT.assinatura) {
      try {
        const partesAssinatura = String(perfilPT.assinatura).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (partesAssinatura) {
          const mimeAssinatura = partesAssinatura[1];
          const bytesAssinatura = Utilities.base64Decode(partesAssinatura[2]);
          const blobAssinatura = Utilities.newBlob(bytesAssinatura, mimeAssinatura, 'assinatura');
          const paragrafoAssinatura = body.appendParagraph('');
          paragrafoAssinatura.setSpacingBefore(10).setSpacingAfter(2);
          const imgAssinatura = paragrafoAssinatura.appendInlineImage(blobAssinatura);
          const larguraOrigAssinatura = imgAssinatura.getWidth();
          const alturaOrigAssinatura = imgAssinatura.getHeight();
          const larguraFinalAssinatura = 130;
          imgAssinatura.setWidth(larguraFinalAssinatura);
          imgAssinatura.setHeight(Math.round(alturaOrigAssinatura * (larguraFinalAssinatura / larguraOrigAssinatura)));
        }
      } catch (eAssinatura) {
        Logger.log('Aviso: não foi possível inserir a assinatura: ' + eAssinatura.toString());
      }
    }

    body.appendParagraph('Assinatura: ___________________________').setSpacingBefore(perfilPT.assinatura ? 4 : 30).setSpacingAfter(20);

    body.appendParagraph('O Cliente').setFontSize(11).setBold(true);
    body.appendParagraph('Nome: ' + cliente.nome).setFontSize(11);
    body.appendParagraph('Assinatura: ___________________________').setSpacingBefore(30);

    doc.saveAndClose();

    const pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
    pdfBlob.setName('Contrato - ' + cliente.nome + '.pdf');

    const pastaContratos = obterOuCriarPastaContratos_();
    const pdfFile = pastaContratos.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);

    // Remove o documento intermédio, fica só o PDF final
    DriveApp.getFileById(doc.getId()).setTrashed(true);

    // Guarda o ID do ficheiro no perfil do cliente, para o botão "Ver contrato"
    guardarContratoIdCliente_(data.idCliente, pdfFile.getId());

    Logger.log('Contrato gerado: ' + pdfFile.getName());

    return { sucesso: true, url: pdfFile.getUrl(), nome: pdfFile.getName(), crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };

  } catch (error) {
    Logger.log('Erro ao gerar contrato: ' + error.toString());
    throw error;
  }
}

/**
 * Formata uma data por extenso em português (ex: "26 de agosto de 2026"),
 * sem depender do idioma configurado no projeto Apps Script — que já nos
 * deu o bug do mês em inglês.
 */
function formatarDataPorExtenso_(data) {
  const nomesMeses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return data.getDate() + ' de ' + nomesMeses[data.getMonth()] + ' de ' + data.getFullYear();
}

/**
 * Como formatarDataPorExtenso_, mas inclui a hora — usado para mostrar
 * quando um contrato foi digitalmente aceite.
 */
function formatarDataHoraPorExtenso_(dataOuTexto) {
  try {
    const data = (dataOuTexto instanceof Date) ? dataOuTexto : new Date(dataOuTexto);
    if (isNaN(data.getTime())) return '';
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');
    return formatarDataPorExtenso_(data) + ' às ' + hora + ':' + minuto;
  } catch (e) {
    return '';
  }
}

/**
 * Constrói o link público de assinatura a partir de um token — aponta
 * para esta mesma app, mas com um parâmetro que a faz mostrar a página
 * de assinatura em vez do CRM.
 */
function obterLinkAssinatura_(token) {
  try {
    return ScriptApp.getService().getUrl() + '?assinar=' + token;
  } catch (e) {
    return '';
  }
}

/**
 * Guarda o ID do ficheiro do contrato na coluna Q do cliente (para o botão
 * "Ver contrato"), e gera um token único novo para o link de assinatura
 * digital (coluna T), limpando qualquer aceitação anterior (coluna U) —
 * um contrato novo precisa de ser aceite de novo.
 */
function guardarContratoIdCliente_(idCliente, fileId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  
  for (let i = 0; i < clientesData.length; i++) {
    if (String(clientesData[i][24]) === String(idCliente)) {
      sheet.getRange(i + 4, 17).setValue(fileId); // coluna Q = CONTRATO_FILE_ID
      sheet.getRange(i + 4, 20).setValue(Utilities.getUuid()); // coluna T = TOKEN_ASSINATURA
      sheet.getRange(i + 4, 21).setValue(''); // coluna U = ASSINATURA_ACEITE_EM
      break;
    }
  }
}

/**
 * NOVO: apaga o contrato atual de um cliente (envia para o lixo do Drive
 * e limpa o registo), para caso se tenha enganado nalgum campo e queira
 * gerar um novo.
 */
function apagarContratoCliente(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('CLIENTES');
    const clientesData = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
    
    for (let i = 0; i < clientesData.length; i++) {
      if (String(clientesData[i][24]) === String(data.idCliente)) {
        const fileId = clientesData[i][16];
        if (fileId) {
          try {
            DriveApp.getFileById(fileId).setTrashed(true);
          } catch (eFile) {
            Logger.log('Aviso: não foi possível apagar o ficheiro (pode já ter sido removido): ' + eFile.toString());
          }
        }
        sheet.getRange(i + 4, 17).setValue(''); // coluna Q = CONTRATO_FILE_ID
        sheet.getRange(i + 4, 20).setValue(''); // coluna T = TOKEN_ASSINATURA
        sheet.getRange(i + 4, 21).setValue(''); // coluna U = ASSINATURA_ACEITE_EM
        break;
      }
    }
    
    Logger.log('Contrato apagado: ' + data.idCliente);
    return { crm: getCRMData(), detalhe: getClienteDetalhe(data.idCliente) };
  } catch (error) {
    Logger.log('Erro ao apagar contrato: ' + error.toString());
    throw error;
  }
}

function obterOuCriarPastaContratos_() {
  const pastas = DriveApp.getFoldersByName(NOME_PASTA_CONTRATOS);
  const pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(NOME_PASTA_CONTRATOS);
  pasta.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  return pasta;
}

/**
 * Auditoria exclusivamente de leitura para preparar a migração para
 * Firestore. Não expõe nomes, contactos, NIFs nem altera folhas: devolve
 * apenas contagens e problemas de integridade que temos de resolver antes
 * de importar uma cópia para Development.
 */
function auditarProntidaoMigracaoCRM() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const clientesSheet = ss.getSheetByName('CLIENTES');
  if (!clientesSheet) throw new Error('Folha CLIENTES não encontrada.');
  const ultimaLinha = clientesSheet.getLastRow();
  const linhas = ultimaLinha >= 4 ? clientesSheet.getRange('A4:Y' + ultimaLinha).getValues() : [];
  const ids = {};
  let clientes = 0;
  let semId = 0;
  let duplicados = 0;
  linhas.forEach(function(linha) {
    if (!linha[0]) return;
    clientes += 1;
    const id = String(linha[24] || '').trim();
    if (!id) { semId += 1; return; }
    if (ids[id]) duplicados += 1;
    ids[id] = true;
  });
  const contarLinhas = function(nome, primeiraLinha) {
    const folha = ss.getSheetByName(nome);
    return folha ? Math.max(0, folha.getLastRow() - primeiraLinha + 1) : null;
  };
  const contarLinhasComCampos = function(nome, primeiraLinha, campos) {
    const folha = ss.getSheetByName(nome);
    if (!folha || folha.getLastRow() < primeiraLinha) return 0;
    const linhas = folha.getRange(primeiraLinha, 1, folha.getLastRow() - primeiraLinha + 1, Math.max.apply(null, campos) + 1).getValues();
    return linhas.filter(function(linha) {
      return campos.every(function(indice) { return Boolean(linha[indice]); });
    }).length;
  };
  const resumo = {
    versao: 1,
    geradoEm: new Date().toISOString(),
    clientes: { total: clientes, semId: semId, idsDuplicados: duplicados },
    registos: {
      packsAtivos: contarLinhas('DB_PACKS_ATIVOS', 2),
      packsHistorico: contarLinhas('DB_PACKS_HISTORICO', 2),
      sessoes: contarLinhas('DB_SESSOES', 2),
      checkins: contarLinhas('DB_CHECKINS', 2),
      avaliacoes: contarLinhas('DB_AVALIACOES_FISICAS', 2),
      notas: contarLinhasComCampos('DB_NOTAS_CRM', 2, [0, 1]),
      planos: contarLinhasComCampos('DB_PLANOS_TREINO', 2, [0, 1]),
      catalogoPacotesEspeciais: contarLinhas('CATALOGO_PACOTES_ESPECIAIS', 2),
      pacotesEspeciais: contarLinhas('PACOTES_ESPECIAIS', 2)
    },
    prontoParaCopiaTeste: semId === 0 && duplicados === 0
  };
  Logger.log('Auditoria de migração CRM: ' + JSON.stringify(resumo));
  return resumo;
}

/**
 * Revoga links públicos dos contratos já existentes. Executar manualmente
 * pelo administrador depois de confirmar que os clientes receberam o PDF por
 * email. Não gera ou envia contratos; apenas remove a partilha por link.
 */
function protegerContratosExistentes_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CLIENTES');
  if (!sheet || sheet.getLastRow() < 4) return { protegidos: 0, indisponiveis: 0 };
  const clientes = sheet.getRange('A4:Y' + sheet.getLastRow()).getValues();
  let protegidos = 0;
  let indisponiveis = 0;
  clientes.forEach(row => {
    const fileId = String(row[16] || '').trim();
    if (!fileId) return;
    try {
      DriveApp.getFileById(fileId).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      protegidos += 1;
    } catch (erro) {
      indisponiveis += 1;
      Logger.log('Não foi possível proteger contrato ' + fileId + ': ' + erro.toString());
    }
  });
  const resultado = { protegidos: protegidos, indisponiveis: indisponiveis };
  Logger.log('Proteção de contratos concluída: ' + JSON.stringify(resultado));
  return resultado;
}

/** Execução manual no editor Apps Script para revogar links públicos antigos. */
function protegerContratosExistentes() {
  return protegerContratosExistentes_();
}

function getPrecosServicos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const servicosSheet = ss.getSheetByName('SERVIÇOS');
    if (!servicosSheet) return {};
    
    const servicosData = servicosSheet.getRange('A4:E' + servicosSheet.getLastRow()).getValues();
    const precos = {};
    
    for (let i = 0; i < servicosData.length; i++) {
      const row = servicosData[i];
      if (row[0]) {
        // "PT - 1x30 min" -> extrair "1x30"
        const match = String(row[0]).match(/(\d+x\d+)/);
        if (match) {
          const chave = match[1];
          precos[chave] = Number(row[4]) || 0;
        }
      }
    }
    
    return precos;
  } catch (e) {
    Logger.log('Erro getPrecosServicos: ' + e.toString());
    return {};
  }
}

function normalizarMesAno(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const ano = valor.getFullYear();
    return ano + '-' + mes;
  }
  return String(valor).trim();
}

function getMesAnoAtual() {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = hoje.getFullYear();
  return ano + '-' + mes;
}

function getMesInicio(mesAno) {
  const arr = mesAno.split('-');
  return new Date(parseInt(arr[0]), parseInt(arr[1]) - 1, 1);
}

function getMesFim(mesAno) {
  const arr = mesAno.split('-');
  return new Date(parseInt(arr[0]), parseInt(arr[1]), 0);
}

function formatarMesAno(mesAno) {
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const arr = mesAno.split('-');
  const ano = arr[0];
  const mesIndex = parseInt(arr[1]) - 1;
  return nomes[mesIndex] + ' ' + ano;
}

function getMesAnterior(mesAno) {
  const arr = mesAno.split('-');
  let ano = parseInt(arr[0]);
  let mes = parseInt(arr[1]) - 1;
  if (mes < 1) {
    mes = 12;
    ano--;
  }
  return ano + '-' + String(mes).padStart(2, '0');
}

function arquivarMesesAntigos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const historicoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
    
    const mesAtual = getMesAnoAtual();
    const mesAnterior = getMesAnterior(mesAtual);
    const mesesParaManter = [mesAtual, mesAnterior];
    
    const packsData = packsSheet.getRange('A2:J' + packsSheet.getLastRow()).getValues();
    const linhasParaArquivar = [];
    
    for (let i = 0; i < packsData.length; i++) {
      const row = packsData[i];
      if (!row[0]) continue;
      const mesAnoPack = normalizarMesAno(row[1]);
      if (mesesParaManter.indexOf(mesAnoPack) === -1) {
        linhasParaArquivar.push({ linha: i + 2, dados: row });
      }
    }
    
    if (linhasParaArquivar.length === 0) return 0;
    
    linhasParaArquivar.forEach(item => {
      const row = item.dados;
      historicoSheet.appendRow([
        row[0],
        normalizarMesAno(row[1]),
        row[2],
        row[3],
        row[4],
        row[5],
        row[7],
        row[8],
        row[9]
      ]);
    });
    
    const linhasParaApagar = linhasParaArquivar.map(item => item.linha).sort((a, b) => b - a);
    linhasParaApagar.forEach(linha => packsSheet.deleteRow(linha));
    
    Logger.log('Arquivados ' + linhasParaArquivar.length + ' packs antigos');
    return linhasParaArquivar.length;
  } catch (error) {
    Logger.log('Erro ao arquivar meses antigos: ' + error.toString());
    return 0;
  }
}

/**
 * ================= RENOVAÇÃO AUTOMÁTICA MENSAL =================
 * No dia 1 de cada mês, cria automaticamente packs novos (sempre como
 * "Pendente") para todos os clientes Ativos que tinham pack no mês
 * anterior, usando a mesma frequência — exatamente como o "Renovar mês"
 * manual, mas sem precisares de abrir a app. Respeita suspensões (um
 * cliente suspenso para este mês é ignorado, tal como no fluxo manual).
 * Fica sempre um aviso no Dashboard a dizer o que foi feito, e é enviado
 * também um email-resumo, para nunca passar despercebido.
 */

const PROP_AVISO_RENOVACAO = 'RENOVACAO_AUTO_PENDENTE';

/**
 * IMPORTANTE: corre esta função UMA VEZ, manualmente, no editor do Apps
 * Script (tal como fizeste para o backup) para ligar a renovação
 * automática. Cria o trigger que corre sozinho no dia 1 de cada mês,
 * às 4h da manhã.
 */
function configurarRenovacaoAutomatica() {
  removerTriggerRenovacao_();
  
  ScriptApp.newTrigger('renovarMesAutomaticamente')
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();
  
  Logger.log('Renovação automática mensal configurada (dia 1 de cada mês, às 4h).');
}

/**
 * Remove qualquer trigger de renovação já existente, para nunca ficar
 * duplicado se configurarRenovacaoAutomatica() for corrida mais do que
 * uma vez.
 */
function removerTriggerRenovacao_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'renovarMesAutomaticamente') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Faz a renovação em si. Chamada automaticamente pelo trigger no dia 1,
 * mas também pode ser corrida manualmente a qualquer momento (ex: para
 * testar, ou para forçar uma renovação extra).
 */
function renovarMesAutomaticamente() {
  try {
    const resultado = getClientesParaRenovar();
    const itens = resultado.lista || [];
    
    if (itens.length === 0) {
      Logger.log('Renovação automática: nada para renovar este mês.');
      return;
    }
    
    const nomes = [];
    itens.forEach(item => {
      criarPackInterno_({
        idCliente: item.idCliente,
        frequencia: item.frequenciaAnterior,
        estadoPagamento: 'Pendente'
      });
      nomes.push(item.idCliente);
    });
    
    // Guarda o aviso para mostrar no Dashboard na próxima vez que a app abrir
    const aviso = {
      data: new Date().toISOString(),
      mes: resultado.mesAtualFormatado || resultado.mesAtual,
      total: nomes.length,
      nomes: nomes
    };
    PropertiesService.getScriptProperties().setProperty(PROP_AVISO_RENOVACAO, JSON.stringify(aviso));
    
    Logger.log('Renovação automática: ' + nomes.length + ' packs criados.');
    
    // Email-resumo, para nunca passar despercebido mesmo sem abrir a app
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        MailApp.sendEmail(
          email,
          'AL MOVE — Renovação automática de ' + aviso.mes,
          nomes.length + ' pack(s) renovados automaticamente, todos como Pendente:\n\n' +
          nomes.map(n => '- ' + n).join('\n') +
          '\n\nRevê se algum destes clientes mudou de frequência ou não vai continuar, e ajusta na app.'
        );
      }
    } catch (e2) {
      Logger.log('Não foi possível enviar email de renovação: ' + e2.toString());
    }
    
  } catch (error) {
    Logger.log('ERRO na renovação automática: ' + error.toString());
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        MailApp.sendEmail(email, 'AL MOVE — Falha na renovação automática',
          'A renovação automática mensal falhou.\n\nErro: ' + error.toString());
      }
    } catch (e2) {
      Logger.log('Não foi possível enviar email de aviso: ' + e2.toString());
    }
  }
}

/**
 * O frontend consulta isto ao carregar, para saber se há um aviso de
 * renovação automática por mostrar.
 */
function getAvisoRenovacaoPendente_() {
  try {
    const valor = PropertiesService.getScriptProperties().getProperty(PROP_AVISO_RENOVACAO);
    return valor ? JSON.parse(valor) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Chamada pelo frontend depois de mostrar o aviso, para não voltar a
 * aparecer.
 */
function dispensarAvisoRenovacao() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(PROP_AVISO_RENOVACAO);
  } catch (e) {
    Logger.log('Erro ao dispensar aviso: ' + e.toString());
  }
  return true;
}

/**
 * ================= BACKUP AUTOMÁTICO SEMANAL =================
 * Cria uma cópia da spreadsheet inteira, uma vez por semana, numa pasta
 * dedicada do Google Drive ("AL MOVE - Backups"). Mantém as últimas 12
 * cópias (cerca de 3 meses) e apaga as mais antigas automaticamente.
 */

const NOME_PASTA_BACKUPS = 'AL MOVE - Backups';
const NUMERO_BACKUPS_A_MANTER = 12;

/**
 * IMPORTANTE: corre esta função UMA VEZ, manualmente, no editor do Apps
 * Script — seleciona "configurarBackupAutomatico" na lista de funções (no
 * topo, ao lado do botão "Executar") e clica em Executar. Vai pedir
 * autorização (Drive + email) — aceita. Isto liga o backup automático
 * semanal, que corre sozinho todas as segundas-feiras às 3h da manhã,
 * sem precisares de fazer mais nada.
 */
/**
 * ================= AUDITORIA DE INTEGRIDADE DE DADOS =================
 * Corre semanalmente (terça às 5h, para não coincidir com o backup de
 * segunda às 3h nem com a renovação do dia 1 às 4h). Vasculha as sheets à
 * procura de inconsistências que hoje passam despercebidas e só te avisa
 * por email se encontrar mesmo alguma coisa — sem ruído se estiver tudo bem.
 */
/**
 * ================= RESUMO DIÁRIO POR EMAIL =================
 * Corre todos os dias às 21h. Só envia email se tiver mesmo alguma coisa
 * para reportar — em dias parados (fins de semana, dias sem atividade),
 * fica em silêncio, para nunca gastares atenção com um email vazio.
 */
function configurarRelatorioDiario() {
  removerTriggerRelatorioDiario_();

  ScriptApp.newTrigger('enviarRelatorioDiario')
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .create();

  Logger.log('Resumo diário configurado (todos os dias às 21h).');

  // Envia já um resumo de hoje, para confirmares que está tudo a funcionar
  enviarRelatorioDiario();
}

function removerTriggerRelatorioDiario_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'enviarRelatorioDiario') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function mesmoDia_(data1, data2) {
  return data1.getFullYear() === data2.getFullYear() &&
    data1.getMonth() === data2.getMonth() &&
    data1.getDate() === data2.getDate();
}

function enviarRelatorioDiario() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hoje = new Date();
    const secoes = [];

    // 1. Sessões confirmadas hoje
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
    const sessoesHoje = sessoesData.filter(row => row[3] && String(row[4]) === 'Confirmada' && mesmoDia_(new Date(row[3]), hoje));
    if (sessoesHoje.length > 0) {
      const linhas = sessoesHoje.map(row => '- ' + row[0]);
      secoes.push('SESSÕES CONFIRMADAS HOJE (' + sessoesHoje.length + ')\n' + linhas.join('\n'));
    }

    // 2. Check-ins preenchidos hoje (reaproveita a lógica da secção Check-ins)
    const resumoCheckins = getCheckinsResumoHoje();
    if (resumoCheckins.totalComCheckin > 0) {
      const linhas = resumoCheckins.comCheckin.map(c =>
        '- ' + c.nome + ': sono ' + c.sono + '/5, stress ' + c.stress + '/5, energia ' + c.cansaco + '/5, refeições ' + c.refeicoes + '/5, DOMS ' + c.doms + '/4' + (c.nota ? ' — "' + c.nota + '"' : '')
      );
      secoes.push('CHECK-INS PREENCHIDOS HOJE (' + resumoCheckins.totalComCheckin + ' de ' + resumoCheckins.totalAtivos + ' clientes ativos)\n' + linhas.join('\n'));
    }

    // 3. Pagamentos marcados como "Pago" hoje
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsData = packsSheet.getRange('A2:J' + packsSheet.getLastRow()).getValues();
    const pagamentosHoje = packsData.filter(row => row[0] && row[6] && String(row[7]) === 'Pago' && mesmoDia_(new Date(row[6]), hoje));
    if (pagamentosHoje.length > 0) {
      const linhas = pagamentosHoje.map(row => '- ' + row[0] + ' (' + row[2] + ')');
      secoes.push('PAGAMENTOS MARCADOS HOJE (' + pagamentosHoje.length + ')\n' + linhas.join('\n'));
    }

    // 4. Contratos assinados digitalmente hoje
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:U' + clientesSheet.getLastRow()).getValues();
    const contratosHoje = clientesData.filter(row => row[0] && row[20] && mesmoDia_(new Date(row[20]), hoje));
    if (contratosHoje.length > 0) {
      const linhas = contratosHoje.map(row => '- ' + row[0]);
      secoes.push('CONTRATOS ASSINADOS HOJE (' + contratosHoje.length + ')\n' + linhas.join('\n'));
    }

    // 5. Marcos de sessões atingidos hoje
    const datasPorCliente = getDatasConfirmadasPorCliente_();
    const marcosHoje = [];
    Object.keys(datasPorCliente).forEach(id => {
      datasPorCliente[id].forEach((d, idx) => {
        const contagem = idx + 1;
        if (ehMarco_(contagem) && mesmoDia_(d, hoje)) {
          marcosHoje.push(id + ' atingiu ' + contagem + ' sessões');
        }
      });
    });
    if (marcosHoje.length > 0) {
      secoes.push('MARCOS ATINGIDOS HOJE\n' + marcosHoje.map(m => '- ' + m).join('\n'));
    }

    if (secoes.length === 0) {
      Logger.log('Resumo diário: sem atividade hoje, email não enviado.');
      return;
    }

    const corpo = 'Resumo de hoje — AL MOVE\n\n' + secoes.join('\n\n') +
      '\n\nEsta secção fica em silêncio nos dias sem atividade — só recebes email quando há mesmo alguma coisa a reportar.';
    const email = Session.getActiveUser().getEmail();
    if (email) {
      MailApp.sendEmail(email, 'AL MOVE — Resumo de hoje (' + formatarDataPorExtenso_(hoje) + ')', corpo);
    }
    Logger.log('Resumo diário enviado.');
  } catch (error) {
    Logger.log('ERRO no resumo diário: ' + error.toString());
  }
}

function configurarAuditoriaAutomatica() {
  removerTriggerAuditoria_();

  ScriptApp.newTrigger('auditarIntegridadeDados')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(5)
    .create();

  Logger.log('Auditoria automática semanal configurada (todas as terças às 5h).');

  // Corre já uma auditoria imediata, para confirmares que está tudo a funcionar
  auditarIntegridadeDados();
}

function removerTriggerAuditoria_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'auditarIntegridadeDados') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function auditarIntegridadeDados() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const problemas = [];

    // --- Ler CLIENTES ---
    const clientesSheet = ss.getSheetByName('CLIENTES');
    const clientesData = clientesSheet.getRange('A4:X' + clientesSheet.getLastRow()).getValues();
    const nomesVistos = {};
    const idsClientesValidos = {};
    const mesAtual = getMesAnoAtual();
    const mesAnterior = getMesAnterior(mesAtual);

    clientesData.forEach((row, idx) => {
      if (!row[0]) return;
      const nome = String(row[0]);
      idsClientesValidos[nome] = true;

      // 5. Nomes duplicados
      if (nomesVistos[nome]) {
        problemas.push('Nome de cliente duplicado: "' + nome + '" aparece mais do que uma vez na aba CLIENTES (linhas ' + nomesVistos[nome] + ' e ' + (idx + 4) + '). O nome é o identificador único do sistema — isto pode causar dados cruzados entre os dois.');
      } else {
        nomesVistos[nome] = idx + 4;
      }

      // 4. Contrato sem token de assinatura
      const contratoFileId = row[16] ? String(row[16]).trim() : '';
      const tokenAssinatura = row[19] ? String(row[19]).trim() : '';
      if (contratoFileId && !tokenAssinatura) {
        problemas.push('Cliente "' + nome + '" tem contrato gerado mas sem link de assinatura válido (token em falta).');
      }

      // 6. Dia de pagamento fora do intervalo válido
      const diaPagamento = row[21];
      if (diaPagamento !== '' && diaPagamento !== null && (Number(diaPagamento) < 1 || Number(diaPagamento) > 31)) {
        problemas.push('Cliente "' + nome + '" tem um dia de pagamento inválido (' + diaPagamento + ') — devia estar entre 1 e 31.');
      }
    });

    // 1. Clientes ativos sem pack no mês atual nem no anterior
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    const packsData = packsSheet.getRange('A2:H' + packsSheet.getLastRow()).getValues();
    const historicoSheet = ss.getSheetByName('DB_PACKS_HISTORICO');
    const historicoData = historicoSheet.getRange('A2:G' + historicoSheet.getLastRow()).getValues();

    const clientesComPackRecente = {};
    packsData.forEach(row => {
      if (!row[0]) return;
      const mesAnoPack = normalizarMesAno(row[1]);
      if (mesAnoPack === mesAtual || mesAnoPack === mesAnterior) clientesComPackRecente[String(row[0])] = true;
    });
    historicoData.forEach(row => {
      if (!row[0]) return;
      const mesAnoPack = normalizarMesAno(row[1]);
      if (mesAnoPack === mesAtual || mesAnoPack === mesAnterior) clientesComPackRecente[String(row[0])] = true;
    });

    clientesData.forEach(row => {
      if (!row[0] || String(row[1] || 'Ativo') !== 'Ativo') return;
      const nome = String(row[0]);
      if (!clientesComPackRecente[nome]) {
        problemas.push('Cliente "' + nome + '" está Ativo mas não tem pack nem em ' + mesAtual + ' nem em ' + mesAnterior + ' — pode ter escapado à renovação.');
      }
    });

    // 2. Packs órfãos (apontam para cliente que já não existe)
    function verificarPacksOrfaos(data, nomeAba) {
      const idsVistos = {};
      data.forEach(row => {
        if (!row[0]) return;
        const idCliente = String(row[0]);
        if (idsVistos[idCliente]) return; // só reporta uma vez por cliente por aba
        if (!idsClientesValidos[idCliente]) {
          problemas.push('Pack órfão em ' + nomeAba + ': aponta para "' + idCliente + '", que já não existe na aba CLIENTES.');
          idsVistos[idCliente] = true;
        }
      });
    }
    verificarPacksOrfaos(packsData, 'DB_PACKS_ATIVOS');
    verificarPacksOrfaos(historicoData, 'DB_PACKS_HISTORICO');

    // 3. Sessões órfãs
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    const sessoesData = sessoesSheet.getRange('A2:F' + sessoesSheet.getLastRow()).getValues();
    const idsSessoesVistos = {};
    sessoesData.forEach(row => {
      if (!row[0]) return;
      const idCliente = String(row[0]);
      if (idsSessoesVistos[idCliente]) return;
      if (!idsClientesValidos[idCliente]) {
        problemas.push('Sessões órfãs em DB_SESSOES: apontam para "' + idCliente + '", que já não existe na aba CLIENTES.');
        idsSessoesVistos[idCliente] = true;
      }
    });

    Logger.log('Auditoria concluída: ' + problemas.length + ' problema(s) encontrado(s).');

    if (problemas.length > 0) {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        const corpo = 'A auditoria semanal da AL MOVE CRM encontrou ' + problemas.length + ' inconsistência(s):\n\n' +
          problemas.map((p, i) => (i + 1) + '. ' + p).join('\n\n') +
          '\n\nNenhuma destas coisas bloqueia a app — são só sinais para reveres quando tiveres um momento.';
        MailApp.sendEmail(email, 'AL MOVE — Auditoria encontrou ' + problemas.length + ' inconsistência(s)', corpo);
      }
    }

    return { problemas: problemas, total: problemas.length };
  } catch (error) {
    Logger.log('ERRO na auditoria de integridade: ' + error.toString());
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        MailApp.sendEmail(email, 'AL MOVE — Falha na auditoria automática',
          'A auditoria semanal da AL MOVE CRM falhou hoje.\n\nErro: ' + error.toString());
      }
    } catch (e2) {
      Logger.log('Não foi possível enviar email de aviso: ' + e2.toString());
    }
    return { problemas: [], total: 0, error: error.toString() };
  }
}

function configurarBackupAutomatico() {
  // Remove triggers antigos de backup, para nunca ficar duplicado
  removerTriggerBackup_();
  
  ScriptApp.newTrigger('criarBackupSemanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(3)
    .create();
  
  Logger.log('Backup automático semanal configurado (todas as segundas às 3h).');
  
  // Faz já um backup imediato, para confirmares que está tudo a funcionar
  criarBackupSemanal();
}

/**
 * Remove qualquer trigger de backup já existente, para nunca ficar
 * duplicado se configurarBackupAutomatico() for corrida mais do que uma vez.
 */
function removerTriggerBackup_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'criarBackupSemanal') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/**
 * Cria a cópia de backup da spreadsheet atual. É chamada automaticamente
 * pelo trigger semanal, mas também podes correr manualmente a qualquer
 * momento para forçar um backup extra (ex: antes de uma alteração grande).
 */
function criarBackupSemanal() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ficheiroOriginal = DriveApp.getFileById(ss.getId());
    const pastaBackups = obterOuCriarPastaBackups_();
    
    const hoje = new Date();
    const dataFormatada = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');
    
    const nomeBackup = 'AL MOVE - Backup - ' + dataFormatada;
    ficheiroOriginal.makeCopy(nomeBackup, pastaBackups);
    
    Logger.log('Backup criado: ' + nomeBackup);
    
    limparBackupsAntigos_(pastaBackups);
    
  } catch (error) {
    Logger.log('ERRO ao criar backup: ' + error.toString());
    // Avisa por email se o backup falhar, para nunca passar despercebido
    try {
      const email = Session.getActiveUser().getEmail();
      if (email) {
        MailApp.sendEmail(email, 'AL MOVE — Falha no backup automático',
          'O backup semanal da AL MOVE CRM falhou hoje.\n\nErro: ' + error.toString());
      }
    } catch (e2) {
      Logger.log('Não foi possível enviar email de aviso: ' + e2.toString());
    }
  }
}

/**
 * Procura a pasta "AL MOVE - Backups" no Drive; cria-a se ainda não existir.
 */
function obterOuCriarPastaBackups_() {
  const pastas = DriveApp.getFoldersByName(NOME_PASTA_BACKUPS);
  if (pastas.hasNext()) {
    return pastas.next();
  }
  return DriveApp.createFolder(NOME_PASTA_BACKUPS);
}

/**
 * Mantém só as últimas N cópias de backup, apagando as mais antigas
 * (evita acumular ficheiros para sempre no Drive).
 */
function limparBackupsAntigos_(pasta) {
  const ficheiros = pasta.getFilesByType(MimeType.GOOGLE_SHEETS);
  const lista = [];
  
  while (ficheiros.hasNext()) {
    const f = ficheiros.next();
    lista.push({ ficheiro: f, data: f.getDateCreated() });
  }
  
  lista.sort((a, b) => b.data - a.data); // mais recente primeiro
  
  for (let i = NUMERO_BACKUPS_A_MANTER; i < lista.length; i++) {
    lista[i].ficheiro.setTrashed(true);
  }
}

/* ========================================================================
   CAMADA DE SEGURANÇA DE DADOS — IDs ESTÁVEIS E MIGRAÇÃO (v2)
   ======================================================================== */

const COLUNA_ID_CLIENTE = 25; // Y; A continua a ser o nome visível.
const ID_CLIENTE_INICIAL = 240001;

function normalizarNomeCliente_(valor) {
  return String(valor || '').trim().toLocaleLowerCase('pt-PT')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

function gerarProximoIdCliente_(linhasClientes) {
  let maior = ID_CLIENTE_INICIAL - 1;
  (linhasClientes || []).forEach(linha => {
    const valor = String(linha[COLUNA_ID_CLIENTE - 1] || '').trim();
    if (/^\d{6,}$/.test(valor)) maior = Math.max(maior, Number(valor));
  });
  return String(maior + 1);
}

function encontrarLinhaCabecalho_(sheet) {
  const limite = Math.min(5, sheet.getLastRow());
  if (!limite) return 0;
  const linhas = sheet.getRange(1, 1, limite, Math.max(1, sheet.getLastColumn())).getDisplayValues();
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].some(c => String(c || '').trim())) return i + 1;
  }
  return 0;
}

function colunaReferenciaCliente_(cabecalhos) {
  for (let i = 0; i < cabecalhos.length; i++) {
    const chave = String(cabecalhos[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (chave === 'idcliente' || chave === 'clientid' || chave === 'cmrclientkey') return i + 1;
  }
  return 0;
}

function auditarMigracaoIdsClientes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  if (!sheet) throw new Error('A folha CLIENTES não existe.');
  const linhas = sheet.getLastRow() >= 4 ? sheet.getRange(4, 1, sheet.getLastRow() - 3, COLUNA_ID_CLIENTE).getValues() : [];
  const porNome = {};
  const duplicados = [];
  const semNome = [];
  const semId = [];
  linhas.forEach((linha, i) => {
    const nome = String(linha[0] || '').trim();
    if (!nome) { if (linha.some(v => String(v || '').trim())) semNome.push(i + 4); return; }
    const chave = normalizarNomeCliente_(nome);
    if (porNome[chave]) duplicados.push({ nome: nome, linhas: [porNome[chave], i + 4] });
    else porNome[chave] = i + 4;
    if (!String(linha[COLUNA_ID_CLIENTE - 1] || '').trim()) semId.push({ nome: nome, linha: i + 4 });
  });
  const resultado = {
    podeMigrar: duplicados.length === 0 && semNome.length === 0,
    totalClientes: Object.keys(porNome).length,
    porAtribuir: semId.length,
    duplicados: duplicados,
    semNome: semNome,
    aviso: duplicados.length ? 'Existem nomes repetidos: a migração foi bloqueada para não adivinhar a quem pertencem os dados antigos.' : ''
  };
  Logger.log(JSON.stringify(resultado));
  return resultado;
}

function criarBackupPreMigracaoIds_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pasta = obterOuCriarPastaBackups_();
  const instante = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm.ss');
  const copia = DriveApp.getFileById(ss.getId()).makeCopy('AL MOVE — Backup antes da migração de IDs — ' + instante, pasta);
  return { id: copia.getId(), url: copia.getUrl(), nome: copia.getName() };
}

function migrarColunaDeReferenciaCliente_(sheet, porNome, idsValidos) {
  const linhaCabecalho = encontrarLinhaCabecalho_(sheet);
  if (!linhaCabecalho || sheet.getLastRow() <= linhaCabecalho) return { folha: sheet.getName(), alterados: 0, desconhecidos: [] };
  const cabecalhos = sheet.getRange(linhaCabecalho, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const coluna = colunaReferenciaCliente_(cabecalhos);
  if (!coluna) return { folha: sheet.getName(), alterados: 0, desconhecidos: [] };
  const num = sheet.getLastRow() - linhaCabecalho;
  const intervalo = sheet.getRange(linhaCabecalho + 1, coluna, num, 1);
  const valores = intervalo.getValues();
  let alterados = 0;
  const desconhecidos = [];
  valores.forEach((linha, i) => {
    const atual = String(linha[0] || '').trim();
    if (!atual || idsValidos[atual]) return;
    const id = porNome[normalizarNomeCliente_(atual)];
    if (id) { linha[0] = id; alterados++; }
    else desconhecidos.push({ linha: linhaCabecalho + 1 + i, valor: atual });
  });
  if (alterados) intervalo.setValues(valores);
  return { folha: sheet.getName(), alterados: alterados, desconhecidos: desconhecidos.slice(0, 30) };
}

/**
 * Executar uma única vez, pelo editor Apps Script, antes de usar a versão v2.
 * Cria uma cópia no Drive, atribui IDs 240001+, e substitui referências pelo ID.
 * Se houver nomes duplicados, falha antes de escrever qualquer dado.
 */
function migrarClientesParaIdsEstaveis() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const auditoria = auditarMigracaoIdsClientes();
    if (!auditoria.podeMigrar) throw new Error(auditoria.aviso || 'A auditoria bloqueou a migração.');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientes = ss.getSheetByName('CLIENTES');
    if (!clientes) throw new Error('A folha CLIENTES não existe.');
    clientes.getRange(3, COLUNA_ID_CLIENTE).setValue('ID_CLIENTE');
    const quantidade = Math.max(0, clientes.getLastRow() - 3);
    const linhas = quantidade ? clientes.getRange(4, 1, quantidade, COLUNA_ID_CLIENTE).getValues() : [];
    const backup = criarBackupPreMigracaoIds_();
    const porNome = {}, idsValidos = {};
    let proximo = gerarProximoIdCliente_(linhas);
    let atribuidos = 0;
    linhas.forEach(linha => {
      const nome = String(linha[0] || '').trim();
      if (!nome) return;
      let id = String(linha[COLUNA_ID_CLIENTE - 1] || '').trim();
      if (!id) { id = proximo; proximo = String(Number(proximo) + 1); linha[COLUNA_ID_CLIENTE - 1] = id; atribuidos++; }
      porNome[normalizarNomeCliente_(nome)] = id;
      idsValidos[id] = true;
    });
    if (quantidade) clientes.getRange(4, COLUNA_ID_CLIENTE, quantidade, 1).setValues(linhas.map(l => [l[COLUNA_ID_CLIENTE - 1]]));

    const relatorio = [];
    ss.getSheets().forEach(sheet => {
      if (sheet.getName() !== 'CLIENTES') relatorio.push(migrarColunaDeReferenciaCliente_(sheet, porNome, idsValidos));
    });
    const idExecucoes = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_EXECUCOES_ID);
    if (idExecucoes) {
      const execucoes = SpreadsheetApp.openById(idExecucoes);
      execucoes.getSheets().forEach(sheet => relatorio.push(migrarColunaDeReferenciaCliente_(sheet, porNome, idsValidos)));
    }
    PropertiesService.getScriptProperties().setProperty('ALMOVE_IDS_ESTAVEIS_V2', 'true');
    return { sucesso: true, backup: backup, atribuidos: atribuidos, proximoId: proximo, referencias: relatorio };
  } finally {
    lock.releaseLock();
  }
}

/** Manutenção administrativa explícita; nunca é chamada por getCRMData(). */
function executarManutencaoCRM() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    arquivarMesesAntigos();
    aplicarCancelamentosAgendados_();
    return { sucesso: true, executadoEm: new Date() };
  } finally {
    lock.releaseLock();
  }
}
function getPlanoAtivoPortalApi_(token) {
  const info = obterClientePorTokenPortal_(token);
  if (!info) throw new Error('Link inválido.');

  const listaPlanos = (getListaPlanosCliente(info.idCliente).planos || [])
    .filter(p => p.visibilidade !== 'PT');

  const planosCliente = listaPlanos.map(p => {
    const treinos = getTreinosDoPlano(info.idCliente, p.nome).treinos || [];
    const statusTreinos = getStatusTreinosPlano(info.idCliente, p.nome).treinos || [];
    const statusPorNome = {};
    statusTreinos.forEach(s => { statusPorNome[s.nome] = s; });
    const treinosComExercicios = treinos.map(t => {
      const detalhe = getTreinoDetalhe(info.idCliente, p.nome, t.nome);
      const status = statusPorNome[t.nome] || { feitoAntes: false, diasDesde: null };
      return {
        nome: t.nome,
        exercicios: detalhe.exercicios,
        feitoAntes: status.feitoAntes,
        diasDesde: status.diasDesde,
        dataRealizacao: status.dataRealizacao || ''
      };
    });
    return {
      nome: p.nome,
      atualizadoEm: p.atualizadoEm,
      validoAte: p.validoAte,
      expirado: p.diasRestantes !== null && p.diasRestantes < 0,
      treinos: treinosComExercicios
    };
  });

  const planoAtivoNome = listaPlanos.length > 0
    ? listaPlanos.slice().sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0].nome
    : '';

  return {
    temPlanos: listaPlanos.length > 0,
    planosCliente: planosCliente,
    planoAtivoNome: planoAtivoNome
  };
}
function getResumoInicioPortal_(idCliente) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioSemana = getMondayDaSemana_(hoje);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(inicioSemana.getDate() + 7);

  const diasComTreinoSet = {};   // 'YYYY-MM-DD' -> true, dentro da semana atual
  const diasComTreinoTodos = []; // todas as datas (Date), para calcular o streak

  const execucoes = obterOuCriarSheetExecucoes_();
  if (execucoes.getLastRow() >= 2) {
    execucoes.getRange('A2:D' + execucoes.getLastRow()).getValues().forEach(row => {
      if (!row[0] || String(row[0]) !== String(idCliente) || !row[3]) return;
      const data = new Date(row[3]);
      data.setHours(0, 0, 0, 0);
      diasComTreinoTodos.push(data);
      if (data >= inicioSemana && data < fimSemana) {
        diasComTreinoSet[dataISOPortal_(data)] = true;
      }
    });
  }

  const diasSemana = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(inicioSemana);
    dia.setDate(inicioSemana.getDate() + i);
    diasSemana.push({
      dataISO: dataISOPortal_(dia),
      diaMes: dia.getDate(),
      feito: !!diasComTreinoSet[dataISOPortal_(dia)],
      hoje: dataISOPortal_(dia) === dataISOPortal_(hoje)
    });
  }

  const treinosFeitosSemana = Object.keys(diasComTreinoSet).length;

  // Quantos treinos diferentes tem o plano ativo (para "1 de 3 treinos").
  let treinosNoPlanoSemana = 0;
  try {
    const listaPlanos = (getListaPlanosCliente(idCliente).planos || []).filter(p => p.visibilidade !== 'PT');
    if (listaPlanos.length > 0) {
      const planoAtivo = listaPlanos.slice().sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0))[0];
      treinosNoPlanoSemana = (getTreinosDoPlano(idCliente, planoAtivo.nome).treinos || []).length;
    }
  } catch (e) {
    treinosNoPlanoSemana = 0;
  }

  const datasOrdenadas = diasComTreinoTodos.sort((a, b) => a - b);

  return {
    diasSemana: diasSemana,
    treinosFeitosSemana: treinosFeitosSemana,
    treinosNoPlanoSemana: treinosNoPlanoSemana,
    streakSemanas: calcularStreakSemanas_(datasOrdenadas)
  };
}
function TESTE_conquistas() {
  const resultado = getResumoConquistasPortal_(240017);
  Logger.log(JSON.stringify(resultado));
}
function getResumoConquistasPortal_(idCliente) {
  const datasComTreino = [];
 
  const execucoes = obterOuCriarSheetExecucoes_();
  if (execucoes.getLastRow() >= 2) {
    execucoes.getRange('A2:D' + execucoes.getLastRow()).getValues().forEach(row => {
      if (!row[0] || String(row[0]) !== String(idCliente) || !row[3]) return;
      const data = new Date(row[3]);
      data.setHours(0, 0, 0, 0);
      datasComTreino.push(data);
    });
  }
 
  const datasOrdenadas = datasComTreino.sort((a, b) => a - b);
  const streakAtual = calcularStreakSemanas_(datasOrdenadas);
  const melhorStreak = calcularMelhorStreakSemanas_(datasOrdenadas);
 
  // Conta treinos concluídos por dia único (evita contar duas vezes
  // exercícios diferentes do mesmo treino/dia como dois "treinos").
  const diasUnicos = {};
  datasOrdenadas.forEach(d => { diasUnicos[dataISOPortal_(d)] = true; });
 
  return {
    totalTreinosConcluidos: Object.keys(diasUnicos).length,
    streakSemanas: streakAtual,
    melhorStreakSemanas: Math.max(melhorStreak, streakAtual)
  };
}

function calcularMelhorStreakSemanas_(datasOrdenadas) {
  if (!datasOrdenadas || !datasOrdenadas.length) return 0;

  const semanasComTreino = {};
  datasOrdenadas.forEach(d => {
    const segunda = getMondayDaSemana_(d);
    semanasComTreino[dataISOPortal_(segunda)] = true;
  });

  const chavesOrdenadas = Object.keys(semanasComTreino).sort();
  let melhor = 0;
  let atual = 0;
  let semanaAnterior = null;

  chavesOrdenadas.forEach(chave => {
    const segunda = new Date(chave);
    if (semanaAnterior) {
      const diffDias = Math.round((segunda - semanaAnterior) / (1000 * 60 * 60 * 24));
      atual = (diffDias === 7) ? atual + 1 : 1;
    } else {
      atual = 1;
    }
    melhor = Math.max(melhor, atual);
    semanaAnterior = segunda;
  });

  return melhor;
}
function TESTE_opcoes() {
  const resultado = getResumoOpcoesPortal_('240017');
  Logger.log(JSON.stringify(resultado));
}
// Substitui integralmente a função getResumoOpcoesPortal_ existente.
// Lê as colunas da folha CLIENTES pelo texto do cabeçalho, para não depender
// da sua posição. Mantém a API e o formato que o frontend já consome.
function getResumoOpcoesPortalCompleto_(idCliente) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('CLIENTES');
  if (!sheet) throw new Error('Folha CLIENTES não encontrada.');

  const ultimaLinha = sheet.getLastRow();
  const ultimaColuna = sheet.getLastColumn();
  if (ultimaLinha < 2 || ultimaColuna < 1) {
    throw new Error('A folha CLIENTES não tem dados suficientes.');
  }

  const normalizarCabecalho = (valor) => String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  // O cabeçalho está habitualmente na linha 1. Procuramos nas primeiras
  // três linhas para tolerar uma linha de título ou uma linha vazia acima.
  const linhasParaProcurar = Math.min(3, ultimaLinha);
  const primeirasLinhas = sheet
    .getRange(1, 1, linhasParaProcurar, ultimaColuna)
    .getValues();
  const camposObrigatorios = ['nome', 'estado', 'servicoatual', 'idcliente'];

  let linhaCabecalho = -1;
  let cabecalho = [];
  let melhorPontuacao = -1;
  primeirasLinhas.forEach((linha, indice) => {
    const colunas = linha.map(normalizarCabecalho);
    const pontuacao = camposObrigatorios.filter((campo) => colunas.indexOf(campo) !== -1).length;
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      linhaCabecalho = indice + 1;
      cabecalho = colunas;
    }
  });

  const indiceColuna = (nome) => cabecalho.indexOf(normalizarCabecalho(nome));
  const iNome = indiceColuna('Nome');
  const iEstado = indiceColuna('Estado');
  const iServico = indiceColuna('Serviço atual');
  const iValidade = indiceColuna('Validade até');
  const iSessoesRestam = indiceColuna('Sessões restam');
  const iIdCliente = indiceColuna('ID_CLIENTE');
  const iContacto = indiceColuna('Contacto');
  const iEmail = indiceColuna('Email');
  const iMorada = indiceColuna('Morada');
  const iDataNascimento = indiceColuna('Data nascimento');
  const iGenero = indiceColuna('Género');

  const emFalta = [];
  if (iNome === -1) emFalta.push('Nome');
  if (iEstado === -1) emFalta.push('Estado');
  if (iServico === -1) emFalta.push('Serviço atual');
  if (iIdCliente === -1) emFalta.push('ID_CLIENTE');
  if (emFalta.length) {
    throw new Error('Cabeçalhos não encontrados em CLIENTES: ' + emFalta.join(', '));
  }

  const primeiraLinhaDados = linhaCabecalho + 1;
  const dados = sheet
    .getRange(primeiraLinhaDados, 1, ultimaLinha - linhaCabecalho, ultimaColuna)
    .getValues();
  const linhaCliente = dados.find((linha) => String(linha[iIdCliente]).trim() === String(idCliente).trim());
  if (!linhaCliente) throw new Error('Cliente não encontrado.');

  const validadeAteRaw = iValidade === -1 ? null : linhaCliente[iValidade];
  let validadeAte = '';
  if (validadeAteRaw instanceof Date && validadeAteRaw.getFullYear() > 1950) {
    validadeAte = Utilities.formatDate(
      validadeAteRaw,
      Session.getScriptTimeZone(),
      'dd/MM/yyyy'
    );
  }

  // Alguns registos antigos foram gravados antes da organização atual da
  // folha. Nesses casos, o serviço está uma coluna antes do cabeçalho e o
  // valor das sessões duas colunas depois. Usamos este ajuste só quando o
  // valor anterior é claramente um serviço PT, mantendo o layout normal
  // como prioridade para todos os registos atuais.
  const temValor = (valor) =>
    valor !== '' && valor !== null && valor !== undefined;
  const servicoNaColunaAtual = linhaCliente[iServico];
  const servicoLegado = iServico > 0 ? linhaCliente[iServico - 1] : '';
  const usaLayoutLegado =
    !temValor(servicoNaColunaAtual) &&
    /^PT\s*-/i.test(String(servicoLegado || '').trim());
  const servicoAtual = usaLayoutLegado
    ? String(servicoLegado).trim()
    : String(servicoNaColunaAtual || '').trim();

  const sessoesRestamNaColunaAtual = iSessoesRestam === -1 ? null : linhaCliente[iSessoesRestam];
  const sessoesRestamLegado = iSessoesRestam === -1 ? null : linhaCliente[iSessoesRestam + 2];
  const sessoesRestam = temValor(sessoesRestamNaColunaAtual)
    ? sessoesRestamNaColunaAtual
    : (usaLayoutLegado ? sessoesRestamLegado : null);
  const sessoesRestantes =
    sessoesRestam === '' || sessoesRestam === null || sessoesRestam === undefined
      ? null
      : sessoesRestam;
  let sessoesPTFeitas = 0;
  let sessoesPTTotal = null;
  let origemSessoes = 'ficha-cliente';
  try {
    const mesAtual = getMesAnoAtual();
    const sessoesSheet = ss.getSheetByName('DB_SESSOES');
    if (sessoesSheet && sessoesSheet.getLastRow() >= 2) {
      const sessoesMes = sessoesSheet.getRange(2, 1, sessoesSheet.getLastRow() - 1, Math.min(6, sessoesSheet.getLastColumn())).getValues()
        .filter(linha => String(linha[0]) === String(idCliente) && normalizarMesAno(linha[1]) === mesAtual);
      sessoesPTFeitas = sessoesMes.filter(linha => String(linha[4] || '').toLowerCase() === 'confirmada').length;
    }
    const packsSheet = ss.getSheetByName('DB_PACKS_ATIVOS');
    if (packsSheet && packsSheet.getLastRow() >= 2) {
      const packs = packsSheet.getRange(2, 1, packsSheet.getLastRow() - 1, Math.min(10, packsSheet.getLastColumn())).getValues();
      const packAtual = packs.find(linha => String(linha[0]) === String(idCliente) && normalizarMesAno(linha[1]) === mesAtual);
      if (packAtual) {
        sessoesPTTotal = Number(packAtual[3]) || calcularSessoesTotalPorFrequencia_(String(packAtual[2] || '')) || null;
        origemSessoes = 'pack-ativo';
      }
    }
  } catch (erro) {
    Logger.log('Não foi possível calcular o saldo do pack ativo: ' + erro.toString());
  }
  const restantesNumero = Number(String(sessoesRestantes === null ? '' : sessoesRestantes).replace(',', '.'));
  const restantesNormalizados = /^0\.[1-9]\d*$/.test(String(sessoesRestantes || ''))
    ? Number(String(sessoesRestantes).split('.')[1])
    : (isFinite(restantesNumero) ? Math.max(0, Math.round(restantesNumero)) : null);
  const restantesFinais = sessoesPTTotal === null
    ? restantesNormalizados
    : Math.max(0, sessoesPTTotal - sessoesPTFeitas);
  const perfilPT = getPerfilPT();
  const lerCampoOpcional = (indice, indiceLegado) => {
    if (indice !== -1 && temValor(linhaCliente[indice])) return String(linhaCliente[indice]).trim();
    return indiceLegado >= 0 && temValor(linhaCliente[indiceLegado]) ? String(linhaCliente[indiceLegado]).trim() : '';
  };
  const emailValido = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || '').trim());
  // Em folhas antigas o cabeçalho "Email" pode estar deslocado. Nunca se
  // devolve um serviço (por exemplo "PT - 1x30 min") como se fosse email.
  const candidatosEmail = [18, iEmail]
    .concat(linhaCliente.map((_, indice) => indice))
    .filter((indice, posicao, lista) => indice >= 0 && lista.indexOf(indice) === posicao)
    .map(indice => String(linhaCliente[indice] || '').trim());
  const email = candidatosEmail.find(emailValido) || '';
  const nascimentoRaw = iDataNascimento === -1 ? '' : linhaCliente[iDataNascimento];
  const dataNascimento = nascimentoRaw instanceof Date
    ? Utilities.formatDate(nascimentoRaw, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(nascimentoRaw || '').trim();

  return {
    nome: String(linhaCliente[iNome] || '').trim(),
    estado: String(linhaCliente[iEstado] || '').trim(),
    contacto: lerCampoOpcional(iContacto, 2),
    email: email,
    morada: lerCampoOpcional(iMorada, 17),
    dataNascimento: dataNascimento,
    genero: lerCampoOpcional(iGenero, -1),
    servicoAtual: servicoAtual,
    validadeAte: validadeAte,
    sessoesRestantes: restantesFinais,
    sessoesPTFeitas: sessoesPTFeitas,
    sessoesPTTotal: sessoesPTTotal === null && restantesFinais !== null ? sessoesPTFeitas + restantesFinais : sessoesPTTotal,
    origemSessoes: origemSessoes,
    contactoPTNome: perfilPT.nome || 'André',
    contactoPTNumero: perfilPT.contacto || ''
  };
}

// Temporária: executar no editor do Apps Script e consultar o Registo de execução.
function TESTE_opcoes_v2() {
  const resultado = getResumoOpcoesPortal_('240017');
  Logger.log(JSON.stringify(resultado));
}

function TESTE_opcoes_v2() {
  const resultado = getResumoOpcoesPortal_('240017');
  Logger.log(JSON.stringify(resultado));
}
function TESTE_diagnosticoOpcoes() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('CLIENTES');

  const dados = sheet.getDataRange().getDisplayValues();

  Logger.log('LINHA 1: ' + JSON.stringify(dados[0]));
  Logger.log('LINHA 2: ' + JSON.stringify(dados[1]));
  Logger.log('LINHA 3: ' + JSON.stringify(dados[2]));

  dados.forEach((linha, indiceLinha) => {
    linha.forEach((valor, indiceColuna) => {
      if (String(valor).trim() === '240017') {
        Logger.log(
          'ID 240017 encontrado: linha ' + (indiceLinha + 1) +
          ', coluna ' + (indiceColuna + 1)
        );
        Logger.log(
          'DADOS DA LEONOR: ' + JSON.stringify(linha)
        );
      }
    });
  });
}
function obterSheetMetricasAtividade_() {
  const ss = SpreadsheetApp.getActive();
  const nome = 'DB_METRICAS_ATIVIDADE';
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(['IdCliente', 'PesoKg', 'AlturaCm', 'Genero', 'PassadaCaminhadaCm', 'PassadaCorridaCm', 'VelocidadeCaminhada', 'VelocidadeCorrida', 'AtualizadoEm']);
  }
  return sh;
}

function numeroMetricaPortal_(valor, minimo, maximo) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const numero = Number(String(valor).replace(',', '.'));
  if (!isFinite(numero) || numero < minimo || numero > maximo) throw new Error('Valor de métrica inválido.');
  return numero;
}

function getMetricasAtividadePortal_(idCliente) {
  const sh = obterSheetMetricasAtividade_();
  const valores = sh.getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][0]) === String(idCliente)) {
      return {
        pesoKg: valores[i][1] || '', alturaCm: valores[i][2] || '', genero: valores[i][3] || '',
        passadaCaminhadaCm: valores[i][4] || '', passadaCorridaCm: valores[i][5] || '',
        velocidadeCaminhada: valores[i][6] || 4.8, velocidadeCorrida: valores[i][7] || 8
      };
    }
  }
  return {};
}

function guardarMetricasAtividadePortal(dados) {
  const info = obterClientePorTokenPortal_(dados.token);
  if (!info) throw new Error('Link inválido.');
  const genero = ['feminino', 'masculino', 'outro'].indexOf(String(dados.genero || '')) >= 0 ? String(dados.genero) : '';
  const registo = [
    info.idCliente,
    numeroMetricaPortal_(dados.pesoKg, 30, 300),
    numeroMetricaPortal_(dados.alturaCm, 120, 230),
    genero,
    numeroMetricaPortal_(dados.passadaCaminhadaCm, 30, 200),
    numeroMetricaPortal_(dados.passadaCorridaCm, 50, 300),
    numeroMetricaPortal_(dados.velocidadeCaminhada || 4.8, 2, 8),
    numeroMetricaPortal_(dados.velocidadeCorrida || 8, 5, 20),
    new Date()
  ];
  const sh = obterSheetMetricasAtividade_();
  const valores = sh.getDataRange().getValues();
  let linha = 0;
  for (let i = valores.length - 1; i >= 1; i--) if (String(valores[i][0]) === String(info.idCliente)) { linha = i + 1; break; }
  if (linha) sh.getRange(linha, 1, 1, registo.length).setValues([registo]);
  else sh.appendRow(registo);
  return getMetricasAtividadePortal_(info.idCliente);
}
function obterSheetNotificacoesPortal_() {
  const ss = SpreadsheetApp.getActive();
  const nome = 'DB_NOTIFICACOES_PORTAL';
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(['IdCliente', 'Titulo', 'Mensagem', 'Lida', 'CriadoEm']);
  }
  return sh;
}

/* Usa esta função onde marcares uma sessão PT, avaliação física ou alerta. */
function criarNotificacaoPortal_(idCliente, titulo, mensagem) {
  obterSheetNotificacoesPortal_().appendRow([
    idCliente,
    String(titulo || 'Atualização AL MOVE'),
    String(mensagem || ''),
    false,
    new Date()
  ]);
}

function getNotificacoesPortal_(idCliente) {
  const valores = obterSheetNotificacoesPortal_().getDataRange().getValues();
  return valores.slice(1)
    .filter(linha => String(linha[0]) === String(idCliente) && linha[3] !== true)
    .sort((a, b) => new Date(b[4]).getTime() - new Date(a[4]).getTime())
    .slice(0, 8)
    .map(linha => ({ titulo: linha[1] || 'Atualização AL MOVE', mensagem: linha[2] || '' }));
}

/** Resumo seguro para o arranque. Não inclui contacto, email, morada ou nascimento. */
function getResumoOpcoesPortal_(idCliente) {
  const dados = getResumoOpcoesPortalCompleto_(idCliente);
  return {
    nome: dados.nome,
    estado: dados.estado,
    servicoAtual: dados.servicoAtual,
    validadeAte: dados.validadeAte,
    sessoesRestantes: dados.sessoesRestantes,
    sessoesPTFeitas: dados.sessoesPTFeitas,
    sessoesPTTotal: dados.sessoesPTTotal,
    origemSessoes: dados.origemSessoes,
    contactoPTNome: dados.contactoPTNome,
    contactoPTNumero: dados.contactoPTNumero
  };
}

/** Dados pessoais pedidos apenas quando o cliente abre “Os meus dados”. */
function getDadosPessoaisPortal_(idCliente) {
  const dados = getResumoOpcoesPortalCompleto_(idCliente);
  return {
    nome: dados.nome,
    contacto: dados.contacto,
    email: dados.email,
    morada: dados.morada,
    dataNascimento: dados.dataNascimento,
    genero: dados.genero
  };
}

function marcarNotificacoesLidasPortal_(idCliente) {
  const sheet = obterSheetNotificacoesPortal_();
  if (sheet.getLastRow() < 2) return { sucesso: true, lidas: 0 };
  const valores = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const linhas = [];
  valores.forEach((linha, indice) => {
    if (String(linha[0]) === String(idCliente) && linha[3] !== true) linhas.push(indice + 2);
  });
  linhas.forEach(linha => sheet.getRange(linha, 4).setValue(true));
  return { sucesso: true, lidas: linhas.length };
}
function obterSheetAvaliacoesFisicas_() {
  const ss = SpreadsheetApp.getActive();
  const nome = 'DB_AVALIACOES_FISICAS';
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(['IdCliente', 'PesoKg', 'AlturaCm', 'MassaGordaPercent', 'CinturaCm', 'AbdomenCm', 'BracoDireitoCm', 'BracoEsquerdoCm', 'PernaDireitaCm', 'PernaEsquerdaCm', 'AtualizadoEm']);
  }
  return sh;
}

function numeroAvaliacaoPortal_(valor, minimo, maximo) {
  if (valor === '' || valor === null || valor === undefined) return '';
  const numero = Number(String(valor).replace(',', '.'));
  if (!isFinite(numero) || numero < minimo || numero > maximo) throw new Error('Valor de avaliação inválido.');
  return numero;
}

function getAvaliacaoFisicaPortal_(idCliente) {
  const valores = obterSheetAvaliacoesFisicas_().getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][0]) === String(idCliente)) {
      return {
        pesoKg: valores[i][1] || '', alturaCm: valores[i][2] || '', massaGordaPercent: valores[i][3] || '',
        cinturaCm: valores[i][4] || '', abdomenCm: valores[i][5] || '', bracoDireitoCm: valores[i][6] || '',
        bracoEsquerdoCm: valores[i][7] || '', pernaDireitaCm: valores[i][8] || '', pernaEsquerdaCm: valores[i][9] || '',
        atualizadoEm: valores[i][10] instanceof Date ? valores[i][10].toISOString() : valores[i][10] || ''
      };
    }
  }
  return {};
}

function getHistoricoAvaliacoesFisicasPortal_(idCliente) {
  const valores = obterSheetAvaliacoesFisicas_().getDataRange().getValues();
  return valores.slice(1)
    .filter(linha => String(linha[0]).trim() === String(idCliente).trim() && linha[10])
    .map(linha => ({
      pesoKg: linha[1] || '', alturaCm: linha[2] || '', massaGordaPercent: linha[3] || '',
      cinturaCm: linha[4] || '', abdomenCm: linha[5] || '', bracoDireitoCm: linha[6] || '',
      bracoEsquerdoCm: linha[7] || '', pernaDireitaCm: linha[8] || '', pernaEsquerdaCm: linha[9] || '',
      atualizadoEm: linha[10] instanceof Date ? linha[10].toISOString() : String(linha[10])
    }))
    .sort((a, b) => new Date(a.atualizadoEm).getTime() - new Date(b.atualizadoEm).getTime());
}

function guardarAvaliacaoFisicaCRM(dados) {
  const idCliente = String(dados && dados.idCliente || '').trim();
  if (!idCliente || !clientesPorIdParaAvaliacoes_()[idCliente]) throw new Error('Cliente inválido.');
  const registo = [
    idCliente,
    numeroAvaliacaoPortal_(dados.pesoKg, 30, 300), numeroAvaliacaoPortal_(dados.alturaCm, 120, 230),
    numeroAvaliacaoPortal_(dados.massaGordaPercent, 1, 80), numeroAvaliacaoPortal_(dados.cinturaCm, 30, 250),
    numeroAvaliacaoPortal_(dados.abdomenCm, 30, 250), numeroAvaliacaoPortal_(dados.bracoDireitoCm, 15, 100),
    numeroAvaliacaoPortal_(dados.bracoEsquerdoCm, 15, 100), numeroAvaliacaoPortal_(dados.pernaDireitaCm, 25, 150),
    numeroAvaliacaoPortal_(dados.pernaEsquerdaCm, 25, 150), new Date()
  ];
  obterSheetAvaliacoesFisicas_().appendRow(registo);
  return {
    sucesso: true,
    avaliacao: getAvaliacaoFisicaPortal_(idCliente),
    historico: getHistoricoAvaliacoesFisicasPortal_(idCliente)
  };
}

function getHistoricoAvaliacoesFisicasCRM(idCliente) {
  idCliente = String(idCliente || '').trim();
  if (!idCliente) throw new Error('Cliente inválido.');
  return getHistoricoAvaliacoesFisicasPortal_(idCliente);
}

function obterSheetPesosDiarios_() {
  const ss = SpreadsheetApp.getActive();
  const nome = 'DB_PESOS_DIARIOS';
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(['IdCliente', 'Data', 'PesoKg', 'RegistadoEm']);
  }
  return sh;
}

function getPesosDiariosPortal_(idCliente) {
  const valores = obterSheetPesosDiarios_().getDataRange().getValues();
  return valores.slice(1)
    .filter(linha => String(linha[0]).trim() === String(idCliente).trim() && linha[1] && linha[2] !== '')
    .map(linha => ({
      data: linha[1] instanceof Date ? Utilities.formatDate(linha[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(linha[1]).slice(0, 10),
      pesoKg: Number(linha[2]),
      registadoEm: linha[3] instanceof Date ? linha[3].toISOString() : String(linha[3] || '')
    }))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

function guardarPesoDiarioPortal(dados) {
  const info = obterClientePorTokenPortal_(dados.token);
  if (!info) throw new Error('Link inválido.');
  const dataTexto = String(dados.data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTexto)) throw new Error('Indica uma data válida.');
  if (dataTexto > dataISOHojePortal_()) throw new Error('Não podes registar peso numa data futura.');
  const peso = numeroAvaliacaoPortal_(dados.pesoKg, 30, 300);
  if (peso === '') throw new Error('Indica o peso.');
  const sh = obterSheetPesosDiarios_();
  const valores = sh.getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    const mesmaData = valores[i][1] instanceof Date ? Utilities.formatDate(valores[i][1], Session.getScriptTimeZone(), 'yyyy-MM-dd') === dataTexto : String(valores[i][1]).slice(0, 10) === dataTexto;
    if (String(valores[i][0]).trim() === String(info.idCliente).trim() && mesmaData) {
      sh.getRange(i + 1, 3, 1, 2).setValues([[peso, new Date()]]);
      return getPesosDiariosPortal_(info.idCliente);
    }
  }
  sh.appendRow([info.idCliente, dataTexto, peso, new Date()]);
  return getPesosDiariosPortal_(info.idCliente);
}

function obterSheetPedidosAvaliacao_() {
  const ss = SpreadsheetApp.getActive();
  const nome = 'DB_PEDIDOS_AVALIACAO';
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(['IdCliente', 'Periodo', 'DiasDisponiveis', 'HoraPreferida', 'HoraAlternativa', 'Objetivo', 'Nota', 'Estado', 'CriadoEm']);
  }
  return sh;
}

function getPedidoAvaliacaoPortal_(idCliente) {
  const valores = obterSheetPedidosAvaliacao_().getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][0]).trim() === String(idCliente).trim()) {
      return {
        periodo: valores[i][1] || '', diasDisponiveis: valores[i][2] || '', horaPreferida: valores[i][3] || '',
        horaAlternativa: valores[i][4] || '', objetivo: valores[i][5] || '', nota: valores[i][6] || '',
        estado: valores[i][7] || 'Pendente', criadoEm: valores[i][8] instanceof Date ? valores[i][8].toISOString() : String(valores[i][8] || ''),
        dataMarcada: valores[i][9] instanceof Date ? valores[i][9].toISOString() : String(valores[i][9] || ''), local: String(valores[i][10] || '')
      };
    }
  }
  return null;
}

/** A mensagem chega ao email do proprietário do CRM e fica guardada na aba de pedidos. */
function enviarEmailNovoPedidoAvaliacao_(cliente, pedido) {
  const destino = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail();
  if (!destino) {
    Logger.log('Pedido de avaliação guardado sem email: a conta do CRM não devolveu endereço de destino.');
    return false;
  }
  const linhas = [
    'Novo pedido de avaliação física — AL MOVE', '',
    'Cliente: ' + String(cliente.nome || 'Cliente'),
    'Período preferido: ' + String(pedido.periodo || 'A combinar'),
    'Dias disponíveis: ' + String(pedido.diasDisponiveis || 'A combinar'),
    'Hora ideal: ' + String(pedido.horaPreferida || 'A combinar'),
    'Hora alternativa: ' + String(pedido.horaAlternativa || 'A combinar')
  ];
  if (pedido.nota) linhas.push('Notas: ' + String(pedido.nota));
  linhas.push('', 'Abre Avaliações físicas no CRM para confirmar a data e hora.');
  MailApp.sendEmail(destino, 'AL MOVE — novo pedido de avaliação: ' + String(cliente.nome || 'cliente'), linhas.join('\n'));
  return true;
}

function guardarPedidoAvaliacaoPortal(dados) {
  const info = obterClientePorTokenPortal_(dados.token);
  if (!info) throw new Error('Link inválido.');
  const dias = Array.isArray(dados.diasDisponiveis) ? dados.diasDisponiveis.map(String).filter(Boolean) : [];
  if (!dias.length) throw new Error('Indica pelo menos um dia disponível.');
  const proxima = getHistoricoAvaliacoesFisicasPortal_(info.idCliente).slice(-1)[0];
  if (proxima && proxima.atualizadoEm) {
    const limite = new Date(proxima.atualizadoEm);
    limite.setDate(limite.getDate() + 56);
    if (limite.getTime() > Date.now()) throw new Error('A próxima avaliação ainda não está disponível.');
  }
  const existente = getPedidoAvaliacaoPortal_(info.idCliente);
  if (existente && ['pendente', 'confirmado'].indexOf(String(existente.estado).toLowerCase()) >= 0) return existente;
  const registo = [
    info.idCliente, String(dados.periodo || ''), dias.join(', '), String(dados.horaPreferida || ''),
    String(dados.horaAlternativa || ''), textoSeguroParaFolhaPortal_(dados.objetivo || '', 160), textoSeguroParaFolhaPortal_(dados.nota || '', 500), 'Pendente', new Date()
  ];
  obterSheetPedidosAvaliacao_().appendRow(registo);
  const pedido = getPedidoAvaliacaoPortal_(info.idCliente);
  try { enviarEmailNovoPedidoAvaliacao_(info, pedido); } catch (erro) { Logger.log('Pedido guardado, mas o email não foi enviado: ' + erro.toString()); }
  return pedido;
}

function garantirColunasPedidosAvaliacao_(sheet) {
  const cabecalhos = ['IdCliente', 'Periodo', 'DiasDisponiveis', 'HoraPreferida', 'HoraAlternativa', 'Objetivo', 'Nota', 'Estado', 'CriadoEm', 'DataMarcada', 'Local', 'ConfirmadoEm'];
  const atuais = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  if (atuais.length < cabecalhos.length || cabecalhos.some((nome, indice) => atuais[indice] !== nome)) sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
  return cabecalhos;
}

function clientesPorIdParaAvaliacoes_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CLIENTES');
  if (!sheet || sheet.getLastRow() < 4) return {};
  const clientes = {};
  sheet.getRange(4, 1, sheet.getLastRow() - 3, 25).getValues().forEach(linha => {
    const id = String(linha[24] || '').trim();
    if (id) clientes[id] = { nome: String(linha[0] || ''), contacto: String(linha[2] || '') };
  });
  return clientes;
}

function getPedidosAvaliacaoCRM() {
  const sheet = obterSheetPedidosAvaliacao_();
  garantirColunasPedidosAvaliacao_(sheet);
  const clientes = clientesPorIdParaAvaliacoes_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues()
    .map((linha, indice) => ({
      linha: indice + 2, idCliente: String(linha[0] || ''), nome: (clientes[String(linha[0] || '')] || {}).nome || 'Cliente sem nome',
      contacto: (clientes[String(linha[0] || '')] || {}).contacto || '', periodo: String(linha[1] || ''), diasDisponiveis: String(linha[2] || ''),
      horaPreferida: String(linha[3] || ''), horaAlternativa: String(linha[4] || ''), objetivo: String(linha[5] || ''), nota: String(linha[6] || ''),
      estado: String(linha[7] || 'Pendente'), criadoEm: linha[8] instanceof Date ? linha[8].toISOString() : String(linha[8] || ''),
      dataMarcada: linha[9] instanceof Date ? linha[9].toISOString() : String(linha[9] || ''), local: String(linha[10] || '')
    }))
    .sort((a, b) => (a.estado === 'Pendente' ? 0 : 1) - (b.estado === 'Pendente' ? 0 : 1) || new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
}

function agendarPedidoAvaliacaoCRM(dados) {
  const linha = Number(dados && dados.linha);
  const dataMarcada = new Date(String(dados && dados.dataMarcada || ''));
  if (!linha || isNaN(dataMarcada.getTime())) throw new Error('Indica uma data e hora válidas.');
  const pedidos = obterSheetPedidosAvaliacao_();
  garantirColunasPedidosAvaliacao_(pedidos);
  const idCliente = String(pedidos.getRange(linha, 1).getValue() || '').trim();
  if (!idCliente) throw new Error('Pedido de avaliação inválido.');
  const estadoAtual = String(pedidos.getRange(linha, 8).getValue() || 'Pendente');
  if (estadoAtual.toLowerCase() !== 'pendente') throw new Error('Este pedido já foi tratado.');
  const local = String(dados.local || 'AL MOVE').trim() || 'AL MOVE';
  obterSheetAgendaPortal_().appendRow([idCliente, dataMarcada, 'Avaliação física', local, 'Marcada']);
  pedidos.getRange(linha, 8, 1, 5).setValues([['Confirmado', pedidos.getRange(linha, 9).getValue(), dataMarcada, local, new Date()]]);
  criarNotificacaoPortal_(idCliente, 'Avaliação física marcada', 'A tua avaliação foi marcada para ' + Utilities.formatDate(dataMarcada, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '.');
  return { sucesso: true, pedidos: getPedidosAvaliacaoCRM() };
}

function agendarAvaliacaoFisicaCRM(dados) {
  const idCliente = String(dados && dados.idCliente || '').trim();
  const dataMarcada = new Date(String(dados && dados.dataMarcada || ''));
  if (!idCliente || !clientesPorIdParaAvaliacoes_()[idCliente]) throw new Error('Escolhe um cliente válido.');
  if (isNaN(dataMarcada.getTime())) throw new Error('Indica uma data e hora válidas.');
  const local = String(dados && dados.local || 'AL MOVE').trim() || 'AL MOVE';
  obterSheetAgendaPortal_().appendRow([idCliente, dataMarcada, 'Avaliação física', local, 'Marcada']);
  criarNotificacaoPortal_(idCliente, 'Avaliação física marcada', 'A tua avaliação foi marcada para ' + Utilities.formatDate(dataMarcada, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '.');
  return { sucesso: true, agenda: { idCliente: idCliente, dataMarcada: dataMarcada.toISOString(), local: local } };
}

function recusarPedidoAvaliacaoCRM(dados) {
  const linha = Number(dados && dados.linha);
  if (!linha) throw new Error('Pedido de avaliação inválido.');
  const pedidos = obterSheetPedidosAvaliacao_();
  garantirColunasPedidosAvaliacao_(pedidos);
  if (String(pedidos.getRange(linha, 8).getValue() || '').toLowerCase() !== 'pendente') throw new Error('Este pedido já foi tratado.');
  pedidos.getRange(linha, 8).setValue('Recusado');
  return { sucesso: true, pedidos: getPedidosAvaliacaoCRM() };
}
function obterSheetAgendaPortal_() {
  const ss = SpreadsheetApp.getActive();
  const nome = 'DB_AGENDA_PORTAL';
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.appendRow(['IdCliente', 'DataHora', 'Titulo', 'Local', 'Estado']);
  }
  return sh;
}

function dataAgendaPortal_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  if (valor === null || valor === '') return null;

  const texto = String(valor).trim();
  const pt = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (pt) {
    return new Date(
      Number(pt[3]), Number(pt[2]) - 1, Number(pt[1]),
      Number(pt[4] || 0), Number(pt[5] || 0), 0
    );
  }

  const data = new Date(texto);
  return isNaN(data.getTime()) ? null : data;
}

function clientesAtivosAgendaPortal_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CLIENTES');
  if (!sheet || sheet.getLastRow() < 4) return [];
  return sheet.getRange('A4:Y' + sheet.getLastRow()).getValues()
    .filter(linha => linha[0] && linha[24] && String(linha[1] || 'Ativo') === 'Ativo')
    .map(linha => ({
      id: String(linha[24]).trim(), nome: String(linha[0]).trim(), email: String(linha[18] || '').trim()
    }));
}

/** Junta os compromissos criados pelo CRM aos calendários PT e Avaliações.
 * A agenda do cliente só recebe eventos associados com segurança ao seu ID. */
function listarCompromissosAgendaPortal_(inicio, fim, idCliente) {
  const clienteAlvo = String(idCliente || '').trim();
  const resultado = [];
  const adicionados = {};
  const adicionar = item => {
    if (!item || !item.data || isNaN(item.data.getTime())) return;
    if (clienteAlvo && String(item.idCliente) !== clienteAlvo) return;
    const chave = [item.origem || 'manual', item.id || '', item.data.getTime(), item.titulo || ''].join('|');
    if (adicionados[chave]) return;
    adicionados[chave] = true;
    resultado.push({
      idCliente: String(item.idCliente), id: String(item.id || ''), origem: item.origem || 'manual',
      tipo: item.tipo || 'PT', data: item.data, dataHora: item.data.toISOString(),
      titulo: item.titulo || 'Sessão AL MOVE', local: item.local || '', estado: item.estado || 'Marcada'
    });
  };

  const valoresManuais = obterSheetAgendaPortal_().getDataRange().getValues();
  valoresManuais.slice(1).forEach(linha => {
    const data = dataAgendaPortal_(linha[1]);
    if (!data || data < inicio || data >= fim || String(linha[4] || '').toLowerCase() === 'cancelada') return;
    adicionar({ idCliente: linha[0], id: 'manual-' + linha[0] + '-' + data.getTime() + '-' + linha[2], origem: 'manual', tipo: /avalia/i.test(String(linha[2])) ? 'AVALIACAO' : 'PT', data: data, titulo: linha[2], local: linha[3], estado: linha[4] });
  });

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const clientes = clientesAtivosAgendaPortal_();
    const aliases = obterAliasesAgenda_(ss, clientes);
    const ignorados = obterIgnoradosAgenda_(ss);
    [
      { id: AL_MOVE_CALENDARIOS.PT_ID, tipo: 'PT', etiqueta: 'PT presencial' },
      { id: AL_MOVE_CALENDARIOS.AVALIACOES_ID, tipo: 'AVALIACAO', etiqueta: 'Avaliação física' }
    ].forEach(config => {
      const calendario = CalendarApp.getCalendarById(config.id);
      if (!calendario) return;
      calendario.getEvents(inicio, fim).forEach(evento => {
        const tituloOriginal = String(evento.getTitle() || '');
        const ignorado = config.tipo === 'PT' && (eventoIgnoradoAutomaticamenteAgenda_(tituloOriginal) || !!ignorados[normalizarNomeAgenda_(tituloOriginal)]);
        if (ignorado) return;
        const reconhecimento = reconhecerClienteNoEvento_(tituloOriginal, clientes, aliases);
        if (!reconhecimento.cliente) return;
        adicionar({
          idCliente: reconhecimento.cliente.id, id: evento.getId(), origem: 'calendar', tipo: config.tipo,
          data: evento.getStartTime(), titulo: config.tipo === 'PT' ? 'PT presencial' : 'Avaliação física',
          local: evento.getLocation() || '', estado: 'Marcada'
        });
      });
    });
  } catch (erro) {
    // A agenda manual continua disponível se um calendário perder acesso.
    Logger.log('Agenda Portal: não foi possível ler um calendário: ' + erro.toString());
  }

  return resultado.sort((a, b) => a.data.getTime() - b.data.getTime());
}

function getAgendaPortal_(idCliente) {
  try { garantirTriggersNotificacoesPortal_(); } catch (erro) { Logger.log('Não foi possível confirmar os lembretes automáticos: ' + erro.toString()); }
  const agora = new Date();
  const fim = new Date(agora);
  fim.setMonth(fim.getMonth() + 3);
  return listarCompromissosAgendaPortal_(agora, fim, idCliente).slice(0, 8)
    .map(item => ({ dataHora: item.dataHora, titulo: item.titulo, local: item.local, estado: item.estado, tipo: item.tipo }));
}

function obterOuCriarSheetNotificacoesEnviadas_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DB_NOTIFICACOES_ENVIADAS');
  if (!sheet) {
    sheet = ss.insertSheet('DB_NOTIFICACOES_ENVIADAS');
    sheet.getRange('A1:E1').setValues([['Chave', 'IdCliente', 'Tipo', 'EnviadoEm', 'Canal']]);
    sheet.getRange('A1:E1').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatarDataHoraNotificacao_(data) {
  return Utilities.formatDate(new Date(data), Session.getScriptTimeZone(), "dd/MM/yyyy 'às' HH:mm");
}

/** Cria o aviso no portal e envia email quando existe endereço. A chave impede duplicados. */
function enviarNotificacaoPortal_(cliente, tipo, titulo, mensagem, chave) {
  const enviados = obterOuCriarSheetNotificacoesEnviadas_();
  const chaves = enviados.getLastRow() >= 2 ? enviados.getRange(2, 1, enviados.getLastRow() - 1, 1).getDisplayValues().flat() : [];
  if (chaves.indexOf(chave) >= 0) return false;
  criarNotificacaoPortal_(cliente.id, titulo, mensagem);
  let canal = 'Portal';
  if (cliente.email) {
    MailApp.sendEmail({ to: cliente.email, subject: 'AL MOVE — ' + titulo, body: mensagem + '\n\nConsulta o teu portal AL MOVE para mais detalhes.' });
    canal = 'Portal + email';
  }
  enviados.appendRow([chave, cliente.id, tipo, new Date(), canal]);
  return true;
}

function enviarLembretesAgendaAmanha() {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0); inicio.setDate(inicio.getDate() + 1);
  const fim = new Date(inicio); fim.setDate(fim.getDate() + 1);
  const porId = {};
  clientesAtivosAgendaPortal_().forEach(cliente => { porId[cliente.id] = cliente; });
  let enviados = 0;
  listarCompromissosAgendaPortal_(inicio, fim).forEach(item => {
    const cliente = porId[item.idCliente];
    if (!cliente) return;
    const titulo = item.tipo === 'AVALIACAO' ? 'Avaliação amanhã' : 'PT amanhã';
    const mensagem = 'Lembrete: tens ' + item.titulo.toLowerCase() + ' amanhã, ' + formatarDataHoraNotificacao_(item.data) + (item.local ? ' em ' + item.local : '') + '.';
    if (enviarNotificacaoPortal_(cliente, 'amanha', titulo, mensagem, 'amanha|' + item.origem + '|' + item.id + '|' + Utilities.formatDate(item.data, Session.getScriptTimeZone(), 'yyyy-MM-dd'))) enviados++;
  });
  return { enviados: enviados };
}

function enviarLembretesAgendaProximos() {
  const inicio = new Date(Date.now() + 15 * 60 * 1000);
  const fim = new Date(Date.now() + 45 * 60 * 1000);
  const porId = {};
  clientesAtivosAgendaPortal_().forEach(cliente => { porId[cliente.id] = cliente; });
  let enviados = 0;
  listarCompromissosAgendaPortal_(inicio, fim).forEach(item => {
    const cliente = porId[item.idCliente];
    if (!cliente) return;
    const titulo = item.tipo === 'AVALIACAO' ? 'Avaliação em breve' : 'PT em breve';
    const mensagem = 'O teu ' + item.titulo.toLowerCase() + ' começa às ' + Utilities.formatDate(item.data, Session.getScriptTimeZone(), 'HH:mm') + (item.local ? ' em ' + item.local : '') + '.';
    if (enviarNotificacaoPortal_(cliente, '30min', titulo, mensagem, '30min|' + item.origem + '|' + item.id + '|' + item.data.getTime())) enviados++;
  });
  return { enviados: enviados };
}

function enviarAlertasAcompanhamentoPortal() {
  const hoje = new Date();
  const limiteTreino = new Date(hoje); limiteTreino.setDate(limiteTreino.getDate() - 7);
  let enviados = 0;
  clientesAtivosAgendaPortal_().forEach(cliente => {
    if (!getCheckinDeHoje_(cliente.id)) {
      if (enviarNotificacaoPortal_(cliente, 'checkin', 'Check-in pendente', 'Ainda não recebemos o teu check-in de hoje. Quando puderes, preenche-o no portal para o acompanhamento ficar atualizado.', 'checkin|' + cliente.id + '|' + Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yyyy-MM-dd'))) enviados++;
    }
    if (hoje.getDay() === 1) {
      const datas = getDatasExecucaoPorCliente_(cliente.id);
      const ultima = datas.length ? datas[datas.length - 1] : null;
      if (!ultima || ultima.getTime() < limiteTreino.getTime()) {
        if (enviarNotificacaoPortal_(cliente, 'treino', 'Retomar o treino', 'Não vemos um treino registado há pelo menos uma semana. Se precisares de ajustar o plano, fala com o teu treinador.', 'treino-semanal|' + cliente.id + '|' + Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yyyy-ww'))) enviados++;
      }
    }
  });
  return { enviados: enviados };
}

function removerTriggersNotificacoesPortal_() {
  ['enviarLembretesAgendaAmanha', 'enviarLembretesAgendaProximos', 'enviarAlertasAcompanhamentoPortal'].forEach(nome => {
    ScriptApp.getProjectTriggers().forEach(trigger => { if (trigger.getHandlerFunction() === nome) ScriptApp.deleteTrigger(trigger); });
  });
}

/** Garante que o primeiro acesso à Agenda também liga os lembretes, sem duplicar triggers. */
function garantirTriggersNotificacoesPortal_() {
  const existentes = {};
  ScriptApp.getProjectTriggers().forEach(trigger => { existentes[trigger.getHandlerFunction()] = true; });
  if (!existentes.enviarLembretesAgendaAmanha) ScriptApp.newTrigger('enviarLembretesAgendaAmanha').timeBased().everyDays(1).atHour(9).create();
  if (!existentes.enviarLembretesAgendaProximos) ScriptApp.newTrigger('enviarLembretesAgendaProximos').timeBased().everyMinutes(15).create();
  if (!existentes.enviarAlertasAcompanhamentoPortal) ScriptApp.newTrigger('enviarAlertasAcompanhamentoPortal').timeBased().everyDays(1).atHour(18).create();
}

/** Executa uma vez para ligar os lembretes automáticos por email e no portal. */
function configurarNotificacoesPortal() {
  removerTriggersNotificacoesPortal_();
  ScriptApp.newTrigger('enviarLembretesAgendaAmanha').timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger('enviarLembretesAgendaProximos').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('enviarAlertasAcompanhamentoPortal').timeBased().everyDays(1).atHour(18).create();
  return { sucesso: true, mensagens: ['Lembrete de amanhã às 09h', 'Lembrete 15–45 minutos antes', 'Check-in diário e alerta semanal de treino'] };
}

/** Leitura de controlo exclusiva da cópia para Firebase Development. */
function validarAssertacaoMigracaoDevelopment_(token) {
  const partes = String(token || '').match(/^fb1\.([A-Za-z0-9_-]{20,1000})\.([A-Za-z0-9_-]{20,100})$/);
  if (!partes) return false;
  const segredo = PropertiesService.getScriptProperties().getProperty('PORTAL_APPS_SCRIPT_HMAC_SECRET');
  if (!segredo || String(segredo).length < 32) return false;
  const assinatura = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[1], segredo)).replace(/=+$/g, '');
  if (assinatura !== partes[2]) return false;
  try {
    const dados = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[1])).getDataAsString('UTF-8'));
    const agora = Math.floor(Date.now() / 1000);
    return dados.v === 1 && dados.scope === 'crm-migration-development' && Number(dados.exp) >= agora && Number(dados.iat) <= agora + 60;
  } catch (erro) { return false; }
}

function lerRegistosTreinoMigracaoDevelopment_(nome, colunas) {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_EXECUCOES_ID);
  if (!id) return [];
  try {
    const folha = SpreadsheetApp.openById(id).getSheetByName(nome);
    if (!folha || folha.getLastRow() < 2) return [];
    return folha.getRange(2, 1, folha.getLastRow() - 1, colunas).getValues();
  } catch (erro) {
    Logger.log('Não foi possível ler ' + nome + ' para migração: ' + erro.toString());
    return [];
  }
}

function getResumoMigracaoDevelopment_(token) {
  if (!validarAssertacaoMigracaoDevelopment_(token)) throw new Error('ACESSO_MIGRACAO_RECUSADO');
  const resumo = auditarProntidaoMigracaoCRM();
  resumo.registos.sessoesPt = lerRegistosTreinoMigracaoDevelopment_('SESSOES_PT', 12).filter(l => l[0] && l[1]).length;
  resumo.registos.execucoesTreino = lerRegistosTreinoMigracaoDevelopment_('EXECUCOES', 15).filter(l => l[0] && l[3]).length;
  resumo.registos.posTreino = lerRegistosTreinoMigracaoDevelopment_('POS_TREINO', 8).filter(l => l[0] && l[3]).length;
  return resumo;
}

API_FUNCOES_PORTAL.getResumoMigracaoDevelopment = function (token) { return getResumoMigracaoDevelopment_(token); };
FUNCOES_LEITURA_PORTAL_.add('getResumoMigracaoDevelopment');

function formatarDataHoraISOMigracao_(valor) {
  try {
    if (!valor) return '';
    const data = valor instanceof Date ? valor : new Date(valor);
    return isNaN(data.getTime()) ? '' : data.toISOString();
  } catch (erro) {
    return '';
  }
}

/** Snapshot integral, só de leitura, para a cópia isolada em Development. */
function exportarSnapshotMigracaoDevelopment_(token) {
  if (!validarAssertacaoMigracaoDevelopment_(token)) throw new Error('ACESSO_MIGRACAO_RECUSADO');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ler = function(nome, primeiraLinha, colunas) {
    const sheet = ss.getSheetByName(nome);
    if (!sheet || sheet.getLastRow() < primeiraLinha) return [];
    return sheet.getRange(primeiraLinha, 1, sheet.getLastRow() - primeiraLinha + 1, colunas).getValues();
  };
  const clientesBrutos = ler('CLIENTES', 4, 25);
  const sessoesBrutas = ler('DB_SESSOES', 2, 6);
  const precos = getPrecosServicos();
  const confirmadas = {};
  const sessoes = sessoesBrutas.filter(l => l[0] && l[1] && l[2]).map((l, indice) => {
    const idCliente = String(l[0]); const mesAno = normalizarMesAno(l[1]);
    if (String(l[4] || 'Pendente') === 'Confirmada') confirmadas[idCliente + '|' + mesAno] = (confirmadas[idCliente + '|' + mesAno] || 0) + 1;
    return { fonteLinha: indice + 2, idCliente: idCliente, mesAno: mesAno, numSessao: Number(l[2]) || 0, dataConfirmada: formatarDataISO_(l[3]), estado: String(l[4] || 'Pendente') };
  });
  const clientes = clientesBrutos.filter(l => l[0] && l[24]).map((l, indice) => ({
    fonteLinha: indice + 4, id: String(l[24]), nome: String(l[0]), estado: String(l[1] || 'Ativo'), contacto: String(l[2] || ''), servicoAtual: String(l[3] || ''), notas: String(l[10] || ''), precoPersonalizado: l[11] === '' ? null : Number(l[11]), suspensoMes: l[13] ? normalizarMesAno(l[13]) : '', cancelarMes: l[14] ? normalizarMesAno(l[14]) : '', nif: String(l[15] || ''), contratoFileId: String(l[16] || ''), morada: String(l[17] || ''), email: String(l[18] || ''), assinaturaAceiteEm: l[20] ? formatarDataISO_(l[20]) : '', diaPagamento: l[21] === '' ? null : Number(l[21]), metodoPagamento: String(l[22] || '')
  }));
  const porCliente = {}; clientes.forEach(c => { porCliente[c.id] = c; });
  const packs = ler('DB_PACKS_ATIVOS', 2, 10).filter(l => l[0] && l[1]).map((l, indice) => {
    const idCliente = String(l[0]); const mesAno = normalizarMesAno(l[1]); const frequencia = String(l[2] || ''); const cliente = porCliente[idCliente] || {};
    return { fonteLinha: indice + 2, idCliente: idCliente, mesAno: mesAno, frequencia: frequencia, sessoesTotal: Number(l[3]) || calcularSessoesTotalPorFrequencia_(frequencia), sessoesConfirmadas: confirmadas[idCliente + '|' + mesAno] || 0, duracaoMinutos: extrairDuracaoMinutos_(frequencia), estadoPagamento: String(l[7] || 'Pendente'), preco: cliente.precoPersonalizado || Number(precos[frequencia]) || 0 };
  });
  const packsHistorico = ler('DB_PACKS_HISTORICO', 2, 7).filter(l => l[0] && l[1]).map((l, indice) => {
    const idCliente = String(l[0]); const mesAno = normalizarMesAno(l[1]); const frequencia = String(l[2] || ''); const cliente = porCliente[idCliente] || {};
    return { fonteLinha: indice + 2, idCliente: idCliente, mesAno: mesAno, frequencia: frequencia, sessoesTotal: Number(l[3]) || calcularSessoesTotalPorFrequencia_(frequencia), sessoesConfirmadas: confirmadas[idCliente + '|' + mesAno] || 0, duracaoMinutos: extrairDuracaoMinutos_(frequencia), estadoPagamento: String(l[6] || 'Pendente'), preco: cliente.precoPersonalizado || Number(precos[frequencia]) || 0 };
  });
  const checkins = ler('DB_CHECKINS', 2, 8).filter(l => l[0] && l[1]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), dataHora: formatarDataISO_(l[1]), sono: Number(l[2]), stress: Number(l[3]), cansaco: Number(l[4]), refeicoes: Number(l[5]), doms: Number(l[6]), nota: String(l[7] || '') }));
  const avaliacoes = ler('DB_AVALIACOES_FISICAS', 2, 11).filter(l => l[0]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), pesoKg: l[1], alturaCm: l[2], massaGordaPercent: l[3], cinturaCm: l[4], abdomenCm: l[5], bracoDireitoCm: l[6], bracoEsquerdoCm: l[7], pernaDireitaCm: l[8], pernaEsquerdaCm: l[9], atualizadoEm: formatarDataISO_(l[10]) }));
  const notas = ler('DB_NOTAS_CRM', 2, 4).filter(l => l[0] && l[1]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), dataHora: formatarDataISO_(l[1]), tipo: String(l[2] || 'Nota'), nota: String(l[3] || '') }));
  const planos = ler('DB_PLANOS_TREINO', 2, 17).filter(l => l[0] && l[1]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), nomePlano: String(l[1]), nomeTreino: String(l[2] || ''), ordem: Number(l[3]) || 0, exercicio: String(l[4] || ''), series: Number(l[5]) || 0, repsMin: Number(l[6]) || 0, repsMax: Number(l[7]) || 0, rir: l[8] === '' ? null : Number(l[8]), notas: String(l[9] || ''), atualizadoEm: formatarDataISO_(l[10]), validade: formatarDataISO_(l[11]), visibilidade: String(l[12] || ''), tipoPrescricao: String(l[13] || ''), descansoSegundos: Number(l[14]) || 0, aquecimento: String(l[15] || ''), grupoSuperserie: String(l[16] || '') }));
  const sessoesPt = lerRegistosTreinoMigracaoDevelopment_('SESSOES_PT', 12).filter(l => l[0] && l[1]).map((l, indice) => ({ fonteLinha: indice + 2, idSessao: String(l[0]), idCliente: String(l[1]), nomePlano: String(l[2] || ''), nomeTreino: String(l[3] || ''), data: formatarDataISO_(l[4]), horaInicio: String(l[5] || ''), horaFim: String(l[6] || ''), duracaoMin: Number(l[7]) || 0, estado: String(l[8] || 'REALIZADA'), notaGeral: String(l[9] || ''), criadoEm: formatarDataISO_(l[10]), atualizadoEm: formatarDataISO_(l[11]) }));
  const execucoesTreino = lerRegistosTreinoMigracaoDevelopment_('EXECUCOES', 15).filter(l => l[0] && l[3]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), nomePlano: String(l[1] || ''), nomeTreino: String(l[2] || ''), data: formatarDataISO_(l[3]), exercicio: String(l[4] || ''), numeroSerie: Number(l[5]) || 0, reps: String(l[6] || ''), carga: String(l[7] || ''), notas: String(l[8] || ''), timestamp: formatarDataISO_(l[9]), velocidade: String(l[10] || ''), requestId: String(l[11] || ''), tipoSessao: String(l[12] || ''), registadoPor: String(l[13] || ''), idSessao: String(l[14] || '') }));
  const posTreino = lerRegistosTreinoMigracaoDevelopment_('POS_TREINO', 8).filter(l => l[0] && l[3]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), nomePlano: String(l[1] || ''), nomeTreino: String(l[2] || ''), data: formatarDataISO_(l[3]), energia: Number(l[4]) || 0, esforco: Number(l[5]) || 0, dificuldade: Number(l[6]) || 0, requestId: String(l[7] || '') }));
  const catalogoPacotesEspeciais = ler('CATALOGO_PACOTES_ESPECIAIS', 2, 5).filter(l => l[0]).map((l, indice) => ({ fonteLinha: indice + 2, chave: String(l[0]), nome: String(l[1] || l[0]), descricao: String(l[2] || ''), preco: Number(l[3]) || 0, ativo: String(l[4] || 'Sim').toLowerCase() !== 'não' }));
  const pacotesEspeciais = ler('PACOTES_ESPECIAIS', 2, 9).filter(l => l[0]).map((l, indice) => ({ fonteLinha: indice + 2, nome: String(l[0]), plano: String(l[1] || ''), preco: Number(l[2]) || 0, dataInicio: formatarDataISO_(l[3]), estado: String(l[4] || 'Ativo'), contacto: String(l[5] || ''), notas: String(l[6] || ''), nif: String(l[7] || ''), dataFim: formatarDataISO_(l[8]) }));
  const pedidosAvaliacao = ler('DB_PEDIDOS_AVALIACAO', 2, 12).filter(l => l[0]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), periodo: String(l[1] || ''), diasDisponiveis: String(l[2] || ''), horaPreferida: String(l[3] || ''), horaAlternativa: String(l[4] || ''), objetivo: String(l[5] || ''), nota: String(l[6] || ''), estado: String(l[7] || 'Pendente'), criadoEm: formatarDataHoraISOMigracao_(l[8]), dataMarcada: formatarDataHoraISOMigracao_(l[9]), local: String(l[10] || ''), confirmadoEm: formatarDataHoraISOMigracao_(l[11]) }));
  const agendaPortal = ler('DB_AGENDA_PORTAL', 2, 5).filter(l => l[0] && l[1]).map((l, indice) => ({ fonteLinha: indice + 2, idCliente: String(l[0]), dataHora: formatarDataHoraISOMigracao_(l[1]), titulo: String(l[2] || ''), local: String(l[3] || ''), estado: String(l[4] || 'Marcada') }));
  return { versao: 1, geradoEm: new Date().toISOString(), clientes: clientes, packs: packs, packsHistorico: packsHistorico, sessoes: sessoes, checkins: checkins, avaliacoes: avaliacoes, notas: notas, planos: planos, sessoesPt: sessoesPt, execucoesTreino: execucoesTreino, posTreino: posTreino, catalogoPacotesEspeciais: catalogoPacotesEspeciais, pacotesEspeciais: pacotesEspeciais, pedidosAvaliacao: pedidosAvaliacao, agendaPortal: agendaPortal };
}
API_FUNCOES_PORTAL.exportarSnapshotMigracaoDevelopment = function (token) { return exportarSnapshotMigracaoDevelopment_(token); };
FUNCOES_LEITURA_PORTAL_.add('exportarSnapshotMigracaoDevelopment');
