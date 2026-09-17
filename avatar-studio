(function () {
  'use strict';

  const PRESETS = [
    { id:'onda', nome:'Onda', pele:'#f2c6a0', cabelo:'#18273d', camisola:'#19c8b1', fundo:'#0b5cc2', estilo:'curto' },
    { id:'pulso', nome:'Pulso', pele:'#8e5539', cabelo:'#111827', camisola:'#38bdf8', fundo:'#0f766e', estilo:'fade' },
    { id:'norte', nome:'Norte', pele:'#d89b72', cabelo:'#5a382b', camisola:'#a78bfa', fundo:'#075985', estilo:'longo' },
    { id:'ritmo', nome:'Ritmo', pele:'#6f402d', cabelo:'#0f172a', camisola:'#fb7185', fundo:'#115e59', estilo:'caracois' },
    { id:'foco', nome:'Foco', pele:'#f0b98d', cabelo:'#b86b2d', camisola:'#2dd4bf', fundo:'#1e3a8a', estilo:'coque' },
    { id:'atlas', nome:'Atlas', pele:'#b97650', cabelo:'#2b211d', camisola:'#f59e0b', fundo:'#0e7490', estilo:'curto' },
    { id:'terra', nome:'Terra', pele:'#5e3528', cabelo:'#171717', camisola:'#34d399', fundo:'#1d4ed8', estilo:'fade' },
    { id:'zenite', nome:'Zénite', pele:'#e6aa80', cabelo:'#3f2b25', camisola:'#60a5fa', fundo:'#0f766e', estilo:'longo' },
    { id:'brava', nome:'Brava', pele:'#9d6043', cabelo:'#241b18', camisola:'#f472b6', fundo:'#155e75', estilo:'caracois' },
    { id:'vector', nome:'Vector', pele:'#efc5a4', cabelo:'#d4a574', camisola:'#22d3ee', fundo:'#1e40af', estilo:'coque' }
  ];

  const CORES_PELE = ['#f2c6a0','#efc5a4','#e6aa80','#d89b72','#b97650','#9d6043','#8e5539','#6f402d','#5e3528'];
  const CORES_CABELO = ['#0f172a','#171717','#241b18','#3f2b25','#5a382b','#b86b2d','#d4a574'];
  const CORES_CAMISOLA = ['#2dd4bf','#38bdf8','#60a5fa','#a78bfa','#f472b6','#fb7185','#f59e0b','#34d399'];
  const ESTILOS = ['curto','fade','longo','caracois','coque'];

  function cor(valor, alternativa) {
    return /^#[0-9a-f]{6}$/i.test(String(valor || '')) ? String(valor) : alternativa;
  }

  function preset(id) {
    return PRESETS.find(function (item) { return item.id === id; }) || PRESETS[0];
  }

  function normalizar(valor) {
    const base = preset(valor && valor.preset);
    return {
      tipo: valor && valor.tipo === 'foto' ? 'foto' : (valor && valor.tipo === 'personalizado' ? 'personalizado' : 'preset'),
      preset: base.id,
      pele: cor(valor && valor.pele, base.pele),
      cabelo: cor(valor && valor.cabelo, base.cabelo),
      camisola: cor(valor && valor.camisola, base.camisola),
      fundo: cor(valor && valor.fundo, base.fundo),
      estilo: ESTILOS.indexOf(valor && valor.estilo) >= 0 ? valor.estilo : base.estilo,
      fotoData: valor && /^data:image\/(?:jpeg|png|webp);base64,/i.test(valor.fotoData || '') ? valor.fotoData : ''
    };
  }

  function cabeloSvg(estilo, cabelo) {
    if (estilo === 'fade') return '<path d="M28 43c0-15 10-25 24-25s24 10 24 25c-8-9-40-9-48 0Z" fill="'+cabelo+'"/><path d="M29 39h46v7H29z" fill="'+cabelo+'" opacity=".72"/>';
    if (estilo === 'longo') return '<path d="M25 44c0-18 11-29 27-29s27 11 27 29v29H25V44Z" fill="'+cabelo+'"/><path d="M31 39c5-16 36-18 43 1-12-6-29-6-43-1Z" fill="#fff" opacity=".08"/>';
    if (estilo === 'caracois') return '<g fill="'+cabelo+'"><circle cx="31" cy="35" r="12"/><circle cx="43" cy="25" r="13"/><circle cx="57" cy="24" r="13"/><circle cx="70" cy="35" r="12"/></g>';
    if (estilo === 'coque') return '<circle cx="65" cy="18" r="11" fill="'+cabelo+'"/><path d="M27 43c0-17 11-27 25-27s25 10 25 27c-10-8-40-8-50 0Z" fill="'+cabelo+'"/>';
    return '<path d="M28 42c1-17 11-26 24-26s23 9 24 26c-11-7-37-8-48 0Z" fill="'+cabelo+'"/>';
  }

  function svg(configuracao, nome) {
    const avatar = normalizar(configuracao || {});
    const inicial = String(nome || 'A').trim().charAt(0).toUpperCase().replace(/[^A-ZÀ-ÖØ-Ý]/, 'A');
    return '<svg class="avatar-ilustracao" viewBox="0 0 104 104" role="img" aria-label="Avatar '+inicial+'">' +
      '<defs><linearGradient id="avatar-fundo-'+avatar.preset+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+avatar.fundo+'"/><stop offset="1" stop-color="#071827"/></linearGradient></defs>' +
      '<rect width="104" height="104" rx="28" fill="url(#avatar-fundo-'+avatar.preset+')"/>' +
      '<circle cx="82" cy="20" r="22" fill="#2dd4bf" opacity=".13"/>' +
      '<path d="M14 104c2-25 16-37 38-37s36 12 38 37H14Z" fill="'+avatar.camisola+'"/>' +
      cabeloSvg(avatar.estilo, avatar.cabelo) +
      '<ellipse cx="52" cy="46" rx="21" ry="25" fill="'+avatar.pele+'"/>' +
      '<path d="M43 49h2M59 49h2" stroke="#111827" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M45 59c4 3 10 3 14 0" fill="none" stroke="#7c3f36" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M40 73c7 5 17 5 24 0" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>' +
      '</svg>';
  }

  function render(elemento, configuracao, nome) {
    if (!elemento) return;
    const avatar = normalizar(configuracao || {});
    elemento.replaceChildren();
    if (avatar.tipo === 'foto' && avatar.fotoData) {
      const imagem = document.createElement('img');
      imagem.src = avatar.fotoData;
      imagem.alt = 'Fotografia de perfil de ' + String(nome || 'cliente');
      imagem.className = 'avatar-foto';
      elemento.appendChild(imagem);
      return;
    }
    elemento.innerHTML = svg(avatar, nome);
  }

  function processarFoto(ficheiro) {
    return new Promise(function (resolve, reject) {
      if (!ficheiro || !/^image\/(jpeg|png|webp)$/i.test(ficheiro.type || '')) return reject(new Error('Escolhe uma imagem JPEG, PNG ou WebP.'));
      if (ficheiro.size > 6 * 1024 * 1024) return reject(new Error('A imagem não pode ultrapassar 6 MB.'));
      const url = URL.createObjectURL(ficheiro);
      const imagem = new Image();
      imagem.onload = function () {
        try {
          const tamanho = 192;
          const canvas = document.createElement('canvas');
          canvas.width = tamanho;
          canvas.height = tamanho;
          const contexto = canvas.getContext('2d', { alpha:false });
          const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight);
          const x = (imagem.naturalWidth - lado) / 2;
          const y = (imagem.naturalHeight - lado) / 2;
          contexto.fillStyle = '#081522';
          contexto.fillRect(0, 0, tamanho, tamanho);
          contexto.drawImage(imagem, x, y, lado, lado, 0, 0, tamanho, tamanho);
          const dados = canvas.toDataURL('image/webp', .78);
          URL.revokeObjectURL(url);
          if (dados.length > 160000) return reject(new Error('Não foi possível reduzir suficientemente a fotografia.'));
          resolve(dados);
        } catch (erro) { URL.revokeObjectURL(url); reject(erro); }
      };
      imagem.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
      imagem.src = url;
    });
  }

  window.ALMoveAvatar = {
    presets: PRESETS.slice(),
    coresPele: CORES_PELE.slice(),
    coresCabelo: CORES_CABELO.slice(),
    coresCamisola: CORES_CAMISOLA.slice(),
    estilos: ESTILOS.slice(),
    normalizar: normalizar,
    render: render,
    processarFoto: processarFoto
  };
})();

