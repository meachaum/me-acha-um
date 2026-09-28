const form = document.querySelector('#searchForm');
const input = document.querySelector('#query');
const results = document.querySelector('#results');
const cards = document.querySelector('#cards');
const statusEl = document.querySelector('#status');

const FUNCTION_URL =
  'https://ysdxoimkoqadxbpnjbde.supabase.co/functions/v1/me-acha-um-ai';

let catalog = [];

function norm(s = '') {
  return s
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
  return Number.isFinite(v) ? v : 0;
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
    max:
      dados && Number.isFinite(dados.orcamento_maximo)
        ? dados.orcamento_maximo
        : null
  };
}

function score(p, analise) {
  if (analise.max && p.price > analise.max) {
    return null;
  }

  const title = norm(p.title || '');
  const category = norm(
    `${p.category || ''} ${p.subcategory || ''}`
  );
  const description = norm(p.description || '');
  const full = `${title} ${category} ${description}`;

  let pontos = 0;
  let encontrados = 0;

  for (const termo of analise.termos) {
    if (title.includes(termo)) {
      pontos += 12;
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

  const cobertura =
    encontrados / Math.max(analise.termos.length, 1);

  pontos += cobertura * 25;

  if (cobertura >= 0.5) {
    pontos += 12;
  }

  pontos +=
    Math.min(saf(p.rating), 5) * 1.4 +
    Math.min(saf(p.discount), 80) / 40;

  // Bônus quando aparecem conceitos importantes juntos.
  const pares = [
    ['removedor', 'pelo'],
    ['escova', 'pelo'],
    ['rolo', 'pelo'],
    ['caixa', 'organiz'],
    ['espremedor', 'eletrico'],
    ['fone', 'bluetooth']
  ];

  for (const [a, b] of pares) {
    if (full.includes(a) && full.includes(b)) {
      pontos += 18;
    }
  }

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
          ⭐ ${p.rating ? p.rating.toFixed(1) : '—'}
          ·
          ${
            p.discount
              ? `${Math.round(p.discount)}% OFF`
              : 'Oferta do catálogo'
          }
        </div>

        <div class="price">
          ${money(p.price)}
        </div>

        ${
          p.regular > p.price
            ? `<div class="old">de ${money(p.regular)}</div>`
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
    '⚡ Procurando as melhores opções...';

  const analise = analisarTermos(
    interpretacao,
    q
  );

  let scored = catalog
    .map(p => ({
      p,
      s: score(p, analise)
    }))
    .filter(x => x.s !== null)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) {
    statusEl.textContent =
      'Não encontrei uma opção realmente compatível com essa busca neste catálogo. Tente outras palavras ou outro orçamento.';
    cards.innerHTML = '';
    return;
  }

  const melhorPontuacao = scored[0].s;

  const fortes = scored.filter(
    x => x.s >= melhorPontuacao - 18
  );

  const ranked = (
    fortes.length >= 3 ? fortes : scored
  )
    .slice(0, 60)
    .map(x => x.p);

  const best = ranked[0];

  const cheap = [...ranked].sort(
    (a, b) => a.price - b.price
  )[0];

  const value = [...ranked].sort(
    (a, b) =>
      (b.rating * 2 + b.discount / 25) -
      (a.rating * 2 + a.discount / 25)
  )[0];

  const picks = [];

  for (const item of [
    [best, 'Melhor correspondência'],
    [cheap, 'Menor preço'],
    [value, 'Custo-benefício']
  ]) {
    if (
      item[0] &&
      !picks.some(x => x[0].id === item[0].id)
    ) {
      picks.push(item);
    }
  }

  for (const p of ranked) {
    if (
      picks.length < 3 &&
      !picks.some(x => x[0].id === p.id)
    ) {
      picks.push([p, 'Outra opção']);
    }
  }

  statusEl.textContent =
    `ACHEI ${scored.length} opções compatíveis` +
    (
      analise.max
        ? ` até ${money(analise.max)}`
        : ''
    ) +
    '. Estas são as 3 mais relevantes.';

  cards.innerHTML = picks
    .slice(0, 3)
    .map(x => render(...x))
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
