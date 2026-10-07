(function () {
  'use strict';
  const anterior = google.script.run;

  function cadeia(ok, fail) {
    return new Proxy({}, { get(_, nome) {
      if (nome === 'withSuccessHandler') return callback => cadeia(callback, fail);
      if (nome === 'withFailureHandler') return callback => cadeia(ok, callback);
      return async (...args) => {
        const suportadas = ['getCRMData', 'getDadosMes', 'getLocaisCRM', 'guardarLocaisCRM', 'getDespesasCRM', 'guardarDespesaCRM', 'terminarDespesaRecorrenteCRM', 'apagarDespesaCRM'];
        if (!suportadas.includes(nome)) return anterior.withSuccessHandler(ok).withFailureHandler(fail)[nome](...args);
        try {
          const configuracao = await ALMOVE_FIREBASE_CONFIG.obter();
          await AlMoveFirebaseAuth.configurar(configuracao);
          const token = await AlMoveFirebaseAuth.token();
          if (!token) throw Error('Entra primeiro na área de gestão.');
          const headers = { Authorization: 'Bearer ' + token };
          let url = '';
          let opcoes = { headers };
          let seletor = dados => dados;

          if (nome === 'getCRMData' || nome === 'getDadosMes') {
            const mes = nome === 'getDadosMes' ? String(args[0] || '') : '';
            url = '/api/dev-crm-dashboard?mes=' + encodeURIComponent(mes) + '&locationId=' + encodeURIComponent(FILTRO_LOCAL_CRM || '');
            seletor = dados => dados.crm;
          } else if (nome === 'getLocaisCRM' || nome === 'guardarLocaisCRM') {
            url = '/api/dev-crm-settings';
            seletor = dados => dados.locais;
            if (nome === 'guardarLocaisCRM') {
              opcoes = { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save-locations', locais: args[0] || {} }) };
            }
          } else {
            url = '/api/dev-crm-expenses';
            if (nome === 'getDespesasCRM') {
              url += '?mes=' + encodeURIComponent(args[0] || '') + '&locationId=' + encodeURIComponent(FILTRO_LOCAL_CRM || '');
            } else {
              const acoes = { guardarDespesaCRM: 'create', terminarDespesaRecorrenteCRM: 'finish', apagarDespesaCRM: 'delete' };
              opcoes = { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(args[0] || {}), action: acoes[nome] }) };
            }
          }

          const resposta = await fetch(url, opcoes);
          const dados = await resposta.json();
          if (!resposta.ok || !dados.ok) throw Error(dados.erro || 'Operação indisponível.');
          if (ok) ok(seletor(dados));
        } catch (erro) {
          if (fail) fail(erro);
        }
      };
    }});
  }

  google.script.run = cadeia(null, null);
})();
