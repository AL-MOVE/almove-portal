import { obterAssertacaoFirebaseInterna } from '../../api/_firebase.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgPYkfxZiDgi9-2l8wu0RBKmiG_g_p66VRh-Hp6QOvtMofgiJSdeV19Bxe_mSGuB1I/exec';

function texto(valor, maximo = 200) { return String(valor || '').trim().slice(0, maximo); }
function numero(valor, minimo, maximo, padrao = 0) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) && resultado >= minimo && resultado <= maximo ? resultado : padrao;
}
function dataIso(valor) {
  const resultado = texto(valor, 32);
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(resultado) ? resultado : '';
}

export function normalizarPlanosOrigem(snapshot, clienteId) {
  const alvo = texto(clienteId, 128);
  return (Array.isArray(snapshot?.planos) ? snapshot.planos : [])
    .filter(item => texto(item?.idCliente, 128) === alvo && texto(item?.nomePlano))
    .map(item => ({
      fonteLinha: numero(item?.fonteLinha, 2, 1000000),
      idCliente: alvo,
      nomePlano: texto(item?.nomePlano),
      nomeTreino: texto(item?.nomeTreino),
      ordem: numero(item?.ordem, 0, 200),
      exercicio: texto(item?.exercicio),
      series: numero(item?.series, 0, 20),
      repsMin: numero(item?.repsMin, 0, 100),
      repsMax: numero(item?.repsMax, 0, 100),
      rir: item?.rir === '' || item?.rir == null ? null : numero(item.rir, 0, 10),
      notas: texto(item?.notas, 1500),
      atualizadoEm: dataIso(item?.atualizadoEm),
      validade: dataIso(item?.validade),
      visibilidade: texto(item?.visibilidade, 16).toUpperCase() === 'PT' ? 'PT' : 'CLIENTE',
      tipoPrescricao: texto(item?.tipoPrescricao, 16).toUpperCase() === 'TEMPO' ? 'TEMPO' : 'REPS',
      descansoSegundos: numero(item?.descansoSegundos, 0, 3600, 60),
      aquecimento: item?.aquecimento === true || String(item?.aquecimento).toLowerCase() === 'true',
      grupoSuperserie: texto(item?.grupoSuperserie, 20).toUpperCase()
    }))
    .filter(item => item.fonteLinha && item.nomeTreino && item.exercicio);
}

export async function obterPlanosOrigem(req, clienteId) {
  const { assertacao } = await obterAssertacaoFirebaseInterna(req, 'crm-migration-development');
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 27000);
  try {
    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST', redirect: 'follow', signal: controlador.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' },
      body: JSON.stringify({ fn: 'exportarSnapshotMigracaoDevelopment', token: assertacao })
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !corpo?.ok || !corpo?.dados) throw new Error('ORIGEM_PLANOS_INDISPONIVEL');
    return { linhas: normalizarPlanosOrigem(corpo.dados, clienteId), snapshotAt: texto(corpo.dados.geradoEm, 64) };
  } catch (erro) {
    if (erro?.name === 'AbortError') throw new Error('ORIGEM_PLANOS_TIMEOUT');
    throw erro;
  } finally { clearTimeout(timeout); }
}
