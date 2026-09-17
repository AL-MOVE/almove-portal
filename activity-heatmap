(function () {
  'use strict';

  const SIMBOLOS = { TREINO_PT:'PT', TREINO_AUTONOMO:'A', SESSAO_MINIMA:'M', CHECKIN:'·', RECUPERACAO:'R', DESCANSO_PLANEADO:'D' };

  function nivel(dia, modo) {
    if (modo === 'carga') {
      const carga = Number(dia.carga || 0);
      if (!carga && dia.sessoes) return 2;
      return carga >= 600 ? 4 : carga >= 350 ? 3 : carga >= 150 ? 2 : carga > 0 ? 1 : 0;
    }
    if (modo === 'recuperacao') {
      const valor = Number(dia.recuperacao || 0);
      return valor >= 4.3 ? 4 : valor >= 3.4 ? 3 : valor >= 2.5 ? 2 : valor > 0 ? 1 : 0;
    }
    return Math.min(4, Number(dia.sessoes || 0));
  }

  function descricao(dia) {
    const data = new Date(dia.data + 'T12:00:00');
    const dataTexto = new Intl.DateTimeFormat('pt-PT', { weekday:'long', day:'numeric', month:'long' }).format(data);
    if (!dia.tipos || !dia.tipos.length) return dataTexto + ': sem registo';
    const titulos = Array.isArray(dia.titulos) && dia.titulos.length ? '. ' + dia.titulos.join(', ') : '';
    const carga = dia.carga ? '. Carga ' + dia.carga : '';
    return dataTexto + ': ' + dia.tipos.join(', ') + titulos + carga;
  }

  function render(destino, mapa, opcoes) {
    if (!destino) return;
    destino.replaceChildren();
    const dias = mapa && Array.isArray(mapa.dias) ? mapa.dias : [];
    if (!dias.length) {
      const vazio = document.createElement('p');
      vazio.className = 'mapa-vazio';
      vazio.textContent = 'O mapa ganha forma à medida que registas treinos e check-ins.';
      destino.appendChild(vazio);
      return;
    }
    const modo = opcoes && opcoes.modo || 'consistencia';
    const moldura = document.createElement('div');
    moldura.className = 'mapa-scroll';
    const grelha = document.createElement('div');
    grelha.className = 'mapa-grelha';
    grelha.style.setProperty('--mapa-colunas', String(Math.ceil(dias.length / 7)));
    dias.forEach(function (dia) {
      const botao = document.createElement('button');
      const tipoPrincipal = (dia.tipos || []).find(function (tipo) { return /^(TREINO_|SESSAO_MINIMA)/.test(tipo); }) || (dia.tipos || [])[0] || '';
      botao.type = 'button';
      botao.className = 'mapa-dia nivel-' + nivel(dia, modo) + (tipoPrincipal ? ' tem-registo' : '');
      botao.dataset.data = dia.data;
      botao.dataset.tipo = tipoPrincipal;
      botao.setAttribute('aria-label', descricao(dia));
      botao.title = descricao(dia);
      const simbolo = document.createElement('span');
      simbolo.setAttribute('aria-hidden', 'true');
      simbolo.textContent = SIMBOLOS[tipoPrincipal] || '';
      botao.appendChild(simbolo);
      if (opcoes && typeof opcoes.aoAbrirDia === 'function') botao.addEventListener('click', function () { opcoes.aoAbrirDia(dia); });
      grelha.appendChild(botao);
    });
    moldura.appendChild(grelha);
    destino.appendChild(moldura);
  }

  window.ALMoveHeatmap = { render:render };
})();

