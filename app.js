const form = document.querySelector('#searchForm');
const input = document.querySelector('#query');
const results = document.querySelector('#results');
const cards = document.querySelector('#cards');
const statusEl = document.querySelector('#status');

const FUNCTION_URL =
  'https://ysdxoimkoqadxbpnjbde.supabase.co/functions/v1/me-acha-um-ai';

let catalog = [];

function norm(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function money(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(v);
}

function saf(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function termosLocais(q) {
  const stop = new Set(
    'me acha um uma uns umas de da do das dos para por com sem ate até r reais real e a o que quero preciso gostaria bom boa melhor barato barata algo'.split(' ')
  );

  return norm(q)
    .replace(/r\$?\s*\d+[.,]?\d*/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w));
}

async function interpretarBusca(busca) {
  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ busca })
    });

    if (!response.ok) {
      throw new Error('Falha na interpretação');
    }

    return await response.json();
  } catch (error) {
    return {
      ok: false,
      busca_original: busca,
      termos_busca: [busca],
      termos_obrigatorios: [],
      termos_evitar: [],
      orcamento_maximo: null
    };
  }
}

function analisarTermos(dados, buscaOriginal) {
  let termos = [];

  if (
    dados &&
    Array.isArray(dados.termos_busca) &&
    dados.termos_busca.length
  ) {
    termos = dados.termos_busca
      .flatMap(t => termosLocais(t))
      .filter(Boolean);
  }

  if (!termos.length) {
    termos = termosLocais(buscaOriginal);
  }

  return {
    termos: [...new Set(termos)],

    obrigatorios:
      dados && Array.isArray(dados.termos_obrigatorios)
        ? [...new Set(dados.termos_obrigatorios.map(norm))]
        : [],

    evitar:
      dados && Array.isArray(dados.termos_evitar)
        ? [...new Set(dados.termos_evitar.map(norm))]
        : [],

    max:
      dados && Number.isFinite(dados.orcamento_maximo)
        ? dados.orcamento_maximo
        : null
  };
}

function score(p, analise) {
  const price = saf(p.price);

  if (analise.max !== null && price > analise.max) {
    return null;
  }

  const title = norm(p.title || '');
  const category = norm(
    `${p.category || ''} ${p.subcategory || ''}`
  );
  const description = norm(p.description || '');

  const full = `${title} ${category} ${description}`;

  // 1. REJEIÇÃO
  // Se o contexto do produto contiver algo que a busca
  // explicitamente mandou evitar, o produto sai da seleção.
  const proibido = analise.evitar.some(
    termo => termo && full.includes(termo)
  );

  if (proibido) {
    return null;
  }

  // 2. RELEVÂNCIA DOS TERMOS DE BUSCA
  let pontos = 0;
  let encontrados = 0;

  for (const termo of analise.termos) {
    if (!termo) continue;

    if (title.includes(termo)) {
      pontos += 14;
      encontrados++;
    } else if (category.includes(termo)) {
      pontos += 7;
      encontrados++;
    } else if (description.includes(termo)) {
      pontos += 3;
      encontrados++;
    }
  }

  if (!encontrados) {
    return null;
  }

  // 3. CONCEITOS DE FINALIDADE
  // Um produto não basta ter "pet" ou "pelo".
  // Ele precisa apresentar algum conceito desejado.
  let conceitosEncontrados = 0;

  for (const termo of analise.obrigatorios) {
    if (!termo) continue;

    if (title.includes(termo)) {
      pontos += 28;
      conceitosEncontrados++;
    } else if (full.includes(termo)) {
      pontos += 10;
      conceitosEncontrados++;
    }
  }

  if (
    analise.obrigatorios.length &&
    conceitosEncontrados === 0
  ) {
    return null;
  }

  // 4. COMBINAÇÕES DE ALTA INTENÇÃO
  const combinacoes = [
    ['tira', 'pelo'],
    ['removedor', 'pelo'],
    ['removedor', 'fiapo'],
    ['rolo', 'pelo'],
    ['rolinho', 'pelo'],
    ['escova', 'removedor'],
    ['escova', 'tira'],
    ['sofa', 'pelo'],
    ['roupa', 'pelo'],
    ['tecido', 'pelo'],
    ['estofado', 'pelo'],
    ['caixa', 'organiz'],
    ['espremedor', 'eletrico'],
    ['fone', 'bluetooth']
  ];

  let combinacaoForte = false;

  for (const [a, b] of combinacoes) {
    if (full.includes(a) && full.includes(b)) {
      pontos += 35;
      combinacaoForte = true;
    }
  }

  // 5. CONTEXTO DE SUPERFÍCIE
  const contextoSuperficie = [
    'sofa',
    'estofado',
    'roupa',
    'roupas',
    'tecido',
    'tapete',
    'moveis',
    'cama',
    'carro'
  ];

  let superficieEncontrada = false;

  for (const termo of contextoSuperficie) {
    if (full.includes(termo)) {
      pontos += 12;
      superficieEncontrada = true;
    }
  }

  // Para uma busca claramente relacionada a pelos/fiapos,
  // valorizamos muito produto de remoção em superfícies.
  const buscaDeRemocao =
    analise.termos.some(t =>
      ['removedor', 'pelos', 'pelo', 'fiapos', 'fiapo', 'sofa'].includes(t)
    );

  if (
    buscaDeRemocao &&
    !superficieEncontrada &&
    !combinacaoForte
  ) {
    pontos -= 25;
  }

  // 6. COBERTURA
  const cobertura =
    encontrados / Math.max(analise.termos.length, 1);

  pontos += cobertura * 20;

  // Não queremos resultados fracos apenas porque têm uma
  // palavra genérica como "escova".
  if (
    buscaDeRemocao &&
    pontos < 45
  ) {
    return null;
  }

  // 7. QUALIDADE COMERCIAL
  // Só entra depois da relevância.
  pontos +=
    Math.min(saf(p.rating), 5) * 1.2 +
    Math.min(saf(p.discount), 80) / 50;

  return pontos;
}

function render(p, label) {
  return `
    <article class="product">
      <div class="tag">${label}</div>

      <img
        src="${p.image}"
        alt=""
        loading="lazy"
      >

      <div class="pc">
        <h4>${p.title}</h4>

        <div class="meta">
          ⭐ ${saf(p.rating) ? saf(p.rating).toFixed(1) : '—'}
          ·
          ${
            saf(p.discount)
              ? `${Math.round(saf(p.discount))}% OFF`
              : 'Oferta do catálogo'
          }
        </div>

        <div class="price">
          ${money(saf(p.price))}
        </div>

        ${
          saf(p.regular) > saf(p.price)
            ? `<div class="old">de ${money(saf(p.regular))}</div>`
            : ''
        }

        <a
          href="${p.link}"
          target="_blank"
          rel="noopener"
        >
          Ver produto
        </a>
      </div>
    </article>
  `;
}

async function search(q) {
  if (!q) return;

  results.hidden = false;
  cards.innerHTML = '';

  if (!catalog.length) {
    statusEl.textContent =
      'O catálogo ainda está carregando. Tente novamente em alguns segundos.';
    return;
  }

  statusEl.textContent =
    '🔎 Entendendo o que você procura...';

  const interpretacao = await interpretarBusca(q);

  statusEl.textContent =
    '⚡ Comparando produtos compatíveis...';

  const analise = analisarTermos(
    interpretacao,
    q
  );

  const scored = catalog
    .map(p => ({
      p,
      s: score(p, analise)
    }))
    .filter(x => x.s !== null)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) {
    statusEl.textContent =
      'Não encontrei uma opção realmente compatível com essa busca neste catálogo.';
    cards.innerHTML = '';
    return;
  }

  // Apenas candidatos próximos da melhor correspondência
  // podem disputar preço e custo-benefício.
  const melhorPontuacao = scored[0].s;

  let candidatos = scored.filter(
    x => x.s >= melhorPontuacao * 0.72
  );

  if (candidatos.length < 3) {
    candidatos = scored.slice(
      0,
      Math.min(20, scored.length)
    );
  }

  const best = candidatos[0];

  const cheap = [...candidatos].sort(
    (a, b) => saf(a.p.price) - saf(b.p.price)
  )[0];

  const value = [...candidatos].sort((a, b) => {
    const qualidadeA =
      a.s +
      saf(a.p.rating) * 5 +
      saf(a.p.discount) / 5;

    const qualidadeB =
      b.s +
      saf(b.p.rating) * 5 +
      saf(b.p.discount) / 5;

    return qualidadeB - qualidadeA;
  })[0];

  const picks = [];

  function adicionar(item, label) {
    if (
      item &&
      item.p &&
      !picks.some(x => x.p.id === item.p.id)
    ) {
      picks.push({
        p: item.p,
        label
      });
    }
  }

  adicionar(best, 'Melhor correspondência');
  adicionar(cheap, 'Menor preço');
  adicionar(value, 'Custo-benefício');

  for (const item of candidatos) {
    if (picks.length >= 3) break;
    adicionar(item, 'Outra opção');
  }

  statusEl.textContent =
    `ACHEI ${scored.length} opções realmente compatíveis` +
    (
      analise.max !== null
        ? ` até ${money(analise.max)}`
        : ''
    ) +
    '. Estas são as melhores encontradas.';

  cards.innerHTML = picks
    .slice(0, 3)
    .map(x => render(x.p, x.label))
    .join('');

  results.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

form.addEventListener('submit', e => {
  e.preventDefault();
  search(input.value.trim());
});

document
  .querySelectorAll('.chips button')
  .forEach(button => {
    button.addEventListener('click', () => {
      input.value = button.dataset.q;
      search(button.dataset.q);
    });
  });

fetch('./products.json')
  .then(r => r.json())
  .then(d => {
    catalog = d;

    document.querySelector(
      '#catalogStatus'
    ).textContent =
      `Catálogo carregado: ${catalog.length.toLocaleString('pt-BR')} produtos`;
  })
  .catch(() => {
    document.querySelector(
      '#catalogStatus'
    ).textContent =
      'Não foi possível carregar o catálogo.';
  });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js')
  );
}
