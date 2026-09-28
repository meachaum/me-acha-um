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
    .toLowerCase()
    .trim();
}

function money(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(v) || 0);
}

function num(v) {
  if (typeof v === 'number') return v;

  if (typeof v === 'string') {
    const limpo = v
      .replace(/[^\d,.-]/g, '')
      .replace(',', '.');

    const n = Number(limpo);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function termosLocais(q) {
  const stop = new Set(
    'me acha um uma uns umas de da do das dos para por com sem ate até r reais real e a o que quero preciso gostaria bom boa melhor barato barata algo coisa'.split(' ')
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
  const frases =
    dados && Array.isArray(dados.termos_busca)
      ? [...new Set(
          dados.termos_busca
            .map(norm)
            .filter(Boolean)
        )]
      : [];

  let termos = frases
    .flatMap(t => termosLocais(t))
    .filter(Boolean);

  if (!termos.length) {
    termos = termosLocais(buscaOriginal);
  }

  let max = null;

  if (
    dados &&
    dados.orcamento_maximo !== null &&
    dados.orcamento_maximo !== undefined
  ) {
    const valor = num(dados.orcamento_maximo);

    if (valor > 0) {
      max = valor;
    }
  }

  return {
    buscaOriginal: norm(buscaOriginal),

    frases,

    termos: [...new Set(termos)],

    obrigatorios:
      dados && Array.isArray(dados.termos_obrigatorios)
        ? [...new Set(
            dados.termos_obrigatorios
              .map(norm)
              .filter(Boolean)
          )]
        : [],

    evitar:
      dados && Array.isArray(dados.termos_evitar)
        ? [...new Set(
            dados.termos_evitar
              .map(norm)
              .filter(Boolean)
          )]
        : [],

    max
  };
}

function score(p, analise) {
  const price = num(p.price);

  // ORÇAMENTO É REGRA ABSOLUTA
  if (
    analise.max !== null &&
    price > analise.max
  ) {
    return null;
  }

  const title = norm(p.title || '');

  const category = norm(
    `${p.category || ''} ${p.subcategory || ''}`
  );

  const description = norm(
    p.description || ''
  );

  const full =
    `${title} ${category} ${description}`;

  // TERMOS PROIBIDOS
  if (
    analise.evitar.some(
      termo =>
        termo &&
        (
          title.includes(termo) ||
          category.includes(termo)
        )
    )
  ) {
    return null;
  }

  let pontos = 0;
  let encontrados = 0;

  // FRASES ESPECÍFICAS VINDAS DO INTERPRETADOR
  for (const frase of analise.frases) {
    if (!frase) continue;

    if (title.includes(frase)) {
      pontos += 70;
    } else if (category.includes(frase)) {
      pontos += 35;
    } else if (description.includes(frase)) {
      pontos += 15;
    }
  }

  // PALAVRAS INDIVIDUAIS
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

  // CONCEITOS DE FINALIDADE
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

  // COMBINAÇÕES IMPORTANTES
  const combinacoes = [
    ['tira', 'pelo'],
    ['removedor', 'pelo'],
    ['removedor', 'fiapo'],
    ['rolo', 'pelo'],
    ['rolinho', 'pelo'],
    ['sofa', 'pelo'],
    ['roupa', 'pelo'],
    ['tecido', 'pelo'],
    ['estofado', 'pelo'],

    ['caixa', 'organiz'],
    ['organiz', 'brinquedo'],

    ['espremedor', 'laranja'],
    ['espremedor', 'fruta'],
    ['espremedor', 'eletrico'],

    ['fone', 'bluetooth']
  ];

  for (const [a, b] of combinacoes) {
    if (
      full.includes(a) &&
      full.includes(b)
    ) {
      pontos += 40;
    }
  }

  // FINALIDADE: PREPARAR SUCO
  const querFazerSuco =
    analise.buscaOriginal.includes('fazer suco') ||
    analise.frases.some(f =>
      f.includes('espremedor')
    );

  if (querFazerSuco) {
    if (title.includes('espremedor')) {
      pontos += 100;
    }

    if (
      title.includes('laranja') ||
      title.includes('frutas')
    ) {
      pontos += 25;
    }

    // Produto que apenas armazena/serve suco
    // não deve vencer equipamento que prepara o suco.
    const acessoriosSuco = [
      'garrafa',
      'garrafinha',
      'copo',
      'jarra',
      'canudo',
      'tampa'
    ];

    if (
      acessoriosSuco.some(t =>
        title.includes(t)
      ) &&
      !title.includes('espremedor')
    ) {
      pontos -= 90;
    }
  }

  // CONTEXTO DE REMOÇÃO DE PELOS
  const buscaDeRemocao =
    analise.buscaOriginal.includes('pelo') &&
    (
      analise.buscaOriginal.includes('sofa') ||
      analise.buscaOriginal.includes('roupa') ||
      analise.buscaOriginal.includes('estofado')
    );

  if (buscaDeRemocao) {
    const superficie = [
      'sofa',
      'estofado',
      'roupa',
      'roupas',
      'tecido',
      'tapete',
      'moveis'
    ];

    if (
      superficie.some(t =>
        full.includes(t)
      )
    ) {
      pontos += 35;
    }
  }

  // ORGANIZAÇÃO DE BRINQUEDOS
  const querOrganizarBrinquedos =
    analise.buscaOriginal.includes('brinquedo') &&
    (
      analise.buscaOriginal.includes('organiz') ||
      analise.buscaOriginal.includes('guardar')
    );

  if (querOrganizarBrinquedos) {
    if (
      title.includes('brinquedo') ||
      description.includes('brinquedo')
    ) {
      pontos += 55;
    }

    if (
      title.includes('caixa') ||
      title.includes('cesto') ||
      title.includes('organizador')
    ) {
      pontos += 30;
    }
  }

  // COBERTURA
  const cobertura =
    encontrados /
    Math.max(analise.termos.length, 1);

  pontos += cobertura * 20;

  // QUALIDADE COMERCIAL É DESEMPATE,
  // NÃO O PRINCIPAL CRITÉRIO.
  pontos +=
    Math.min(num(p.rating), 5) * 1.2 +
    Math.min(num(p.discount), 80) / 50;

  return pontos;
}

function render(p, label) {
  return `
    <article class="product">

      <div class="tag">
        ${label}
      </div>

      <img
        src="${p.image}"
        alt=""
        loading="lazy"
      >

      <div class="pc">

        <h4>
          ${p.title}
        </h4>

        <div class="meta">
          ⭐ ${
            num(p.rating)
              ? num(p.rating).toFixed(1)
              : '—'
          }
          ·
          ${
            num(p.discount)
              ? `${Math.round(num(p.discount))}% OFF`
              : 'Oferta do catálogo'
          }
        </div>

        <div class="price">
          ${money(num(p.price))}
        </div>

        ${
          num(p.regular) > num(p.price)
            ? `<div class="old">
                 de ${money(num(p.regular))}
               </div>`
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

  const interpretacao =
    await interpretarBusca(q);

  statusEl.textContent =
    '⚡ Comparando produtos compatíveis...';

  const analise =
    analisarTermos(
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

  // SEGUNDA TRAVA DE ORÇAMENTO
  // Mesmo que algo falhe anteriormente,
  // nenhum item acima do limite chega à tela.
  if (analise.max !== null) {
    scored = scored.filter(
      x => num(x.p.price) <= analise.max
    );
  }

  if (!scored.length) {
    statusEl.textContent =
      analise.max !== null
        ? `Não encontrei uma opção realmente compatível até ${money(analise.max)}.`
        : 'Não encontrei uma opção realmente compatível com essa busca.';

    cards.innerHTML = '';
    return;
  }

  const melhorPontuacao =
    scored[0].s;

  let candidatos =
    scored.filter(
      x =>
        x.s >=
        melhorPontuacao * 0.72
    );

  

  const best =
    candidatos[0];

  const cheap =
    [...candidatos].sort(
      (a, b) =>
        num(a.p.price) -
        num(b.p.price)
    )[0];

  const value =
    [...candidatos].sort(
      (a, b) => {
        const qa =
          a.s +
          num(a.p.rating) * 5 +
          num(a.p.discount) / 5;

        const qb =
          b.s +
          num(b.p.rating) * 5 +
          num(b.p.discount) / 5;

        return qb - qa;
      }
    )[0];

  const picks = [];

  function adicionar(
    item,
    label
  ) {
    if (
      item &&
      item.p &&
      !picks.some(
        x => x.p.id === item.p.id
      )
    ) {
      picks.push({
        p: item.p,
        label
      });
    }
  }

  adicionar(
    best,
    'Melhor correspondência'
  );

  adicionar(
    cheap,
    'Menor preço'
  );

  adicionar(
    value,
    'Custo-benefício'
  );

  for (const item of candidatos) {
    if (picks.length >= 3) break;

    adicionar(
      item,
      'Outra opção'
    );
  }

  statusEl.textContent =
    `ACHEI ${scored.length} opções compatíveis` +
    (
      analise.max !== null
        ? ` até ${money(analise.max)}`
        : ''
    ) +
    '. Estas são as melhores encontradas.';

  cards.innerHTML =
    picks
      .slice(0, 3)
      .map(x =>
        render(
          x.p,
          x.label
        )
      )
      .join('');

  results.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

form.addEventListener(
  'submit',
  e => {
    e.preventDefault();
    search(
      input.value.trim()
    );
  }
);

document
  .querySelectorAll('.chips button')
  .forEach(button => {

    button.addEventListener(
      'click',
      () => {

        input.value =
          button.dataset.q;

        search(
          button.dataset.q
        );
      }
    );

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
  window.addEventListener(
    'load',
    () =>
      navigator.serviceWorker.register(
        './sw.js'
      )
  );
}
