(function (root) {
  'use strict';

  function normalize(value) {
    return String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-PT');
  }

  function cleanItems(items) {
    return (Array.isArray(items) ? items : []).map(function (item) {
      return typeof item === 'string'
        ? { nome: item, padraoMovimento: '', grupoMuscular: '', equipamento: '' }
        : (item || {});
    }).filter(function (item) { return normalize(item.nome); });
  }

  function find(items, name) {
    const target = normalize(name);
    return cleanItems(items).find(function (item) { return normalize(item.nome) === target; }) || null;
  }

  function search(items, query, limit) {
    const target = normalize(query);
    if (target.length < 2) return [];
    return cleanItems(items).map(function (item) {
      const name = normalize(item.nome);
      const haystack = normalize([item.nome, item.padraoMovimento, item.grupoMuscular, item.equipamento].join(' '));
      const score = name === target ? 100 : name.startsWith(target) ? 50 : name.includes(target) ? 30 : haystack.includes(target) ? 10 : 0;
      return { item: item, score: score };
    }).filter(function (entry) { return entry.score; })
      .sort(function (a, b) { return b.score - a.score || a.item.nome.localeCompare(b.item.nome, 'pt-PT'); })
      .slice(0, Number(limit || 8))
      .map(function (entry) { return entry.item; });
  }

  function suggest(items, currentName, originalName, limit) {
    const source = find(items, currentName) || find(items, originalName);
    if (!source) return [];
    return cleanItems(items).filter(function (candidate) {
      return normalize(candidate.nome) !== normalize(currentName);
    }).map(function (candidate) {
      let score = 0;
      if (source.padraoMovimento && normalize(candidate.padraoMovimento) === normalize(source.padraoMovimento)) score += 5;
      if (source.grupoMuscular && normalize(candidate.grupoMuscular) === normalize(source.grupoMuscular)) score += 3;
      if (source.equipamento && normalize(candidate.equipamento) === normalize(source.equipamento)) score += 1;
      return { item: candidate, score: score };
    }).filter(function (entry) { return entry.score >= 3; })
      .sort(function (a, b) { return b.score - a.score || a.item.nome.localeCompare(b.item.nome, 'pt-PT'); })
      .slice(0, Number(limit || 5))
      .map(function (entry) { return entry.item; });
  }

  root.AlMoveCoachExerciseTools = { normalize: normalize, cleanItems: cleanItems, find: find, search: search, suggest: suggest };
})(typeof window !== 'undefined' ? window : globalThis);
