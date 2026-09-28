const form = document.querySelector('#searchForm');
const input = document.querySelector('#query');
const results = document.querySelector('#results');
const cards = document.querySelector('#cards');
const statusEl = document.querySelector('#status');

const FUNCTION_URL =
  'https://ysdxoimkoqadxbpnjbde.supabase.co/functions/v1/me-acha-um-ai';

let catalog = [];
let todosResultados = [];
let mostrandoTodos = false;

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
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0;
  }

  if (typeof v === 'string') {
    let s = v.trim();

    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }

    s = s.replace(/[^\d.-]/g, '');

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function extrairOrcamento(texto) {
  const t = norm(texto);

  const padroes = [
    /(?:ate|maximo|max|menos de)\s*(?:r\$)?\s*(\d+(?:[.,]\d{1,2})?)/i,
    /r\$\s*(\d+(?:[.,]\d{1,2})?)/i
  ];

  for (const padrao of padroes) {
    const m = t.match(padrao);

    if (m) {
      return Number(m[1].replace(',', '.'));
    }
  }

  return null;
}

const STOPWORDS = new Set(
  [
    'me', 'acha', 'ache', 'achar',
    'um', 'uma', 'uns', 'umas',
    'de', 'da', 'do', 'das', 'dos',
    'para', 'por', 'com', 'sem',
    'ate', 'maximo', 'max',
    'menos', 'que',
    'r', 'reais', 'real',
    'e', 'a', 'o', 'as', 'os',
    'quero', 'queria',
    'preciso', 'gostaria',
    'produto', 'produtos',
    'algo', 'coisa',
    'bom', 'boa',
    'melhor',
    'barato', 'barata'
  ]
);

function tokens(texto) {
  return norm(texto)
    .replace(/r\$?\s*\d+(?:[.,]\d{1,2})?/g, ' ')
    .replace(/\b\d+(?:[.,]\d{1,2})?\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(
      t =>
        t.length >= 3 &&
        !STOPWORDS.has(t)
    );
}

function unicos(lista) {
  return [...new Set(lista.filter(Boolean))];
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
      throw new Error('Falha no interpretador');
    }

    return await response.json();

  } catch (error) {
    return null;
  }
}

function montarConsulta(busca, interpretacao) {
  const termosOriginais = tokens(busca);

  let termosIA = [];
  let frasesIA = [];

  if (
    interpretacao &&
    Array.isArray(interpretacao.termos_busca)
  ) {
    frasesIA = interpretacao.termos_busca
      .map(norm)
      .filter(Boolean);

    termosIA = frasesIA.flatMap(tokens);
  }

  const maxLocal = extrairOrcamento(busca);

  let maxIA = null;

  if (
    interpretacao &&
    interpretacao.orcamento_maximo !== null &&
    interpretacao.orcamento_maximo !== undefined
  ) {
    const valor = num(
      interpretacao.orcamento_maximo
    );

    if (valor > 0) {
      maxIA = valor;
    }
  }

  /*
    Os termos escritos pelo usuário têm prioridade.

    Os termos interpretados pelo Supabase entram como
    complemento, nunca como substitutos obrigatórios.
  */
  return {
    termosOriginais: unicos(termosOriginais),
    termosIA: unicos(termosIA),
    frasesIA: unicos(frasesIA),
    max: maxLocal !== null ? maxLocal : maxIA
  };
}

function calcularScore(produto, consulta) {
  const preco = num(produto.price);

  if (
    consulta.max !== null &&
    preco > consulta.max
  ) {
    return null;
  }

  const titulo = norm(produto.title || '');
  const categoria = norm(
    `${produto.category || ''} ${produto.subcategory || ''}`
  );
  const descricao = norm(
    produto.description || ''
  );

  const textoCompleto =
    `${titulo} ${categoria} ${descricao}`;

  let score = 0;

  let originaisNoTitulo = 0;
  let originaisEncontrados = 0;

  /*
    PALAVRAS QUE A PESSOA ESCREVEU.

    Elas são o sinal mais importante da busca simples.
  */
  for (const termo of consulta.termosOriginais) {
    if (titulo.includes(termo)) {
      score += 35;
      originaisNoTitulo++;
      originaisEncontrados++;
    } else if (categoria.includes(termo)) {
      score += 18;
      originaisEncontrados++;
    } else if (descricao.includes(termo)) {
      score += 6;
      originaisEncontrados++;
    }
  }

  /*
    Se nenhuma palavra útil escrita pelo usuário
    aparece no produto, ele não entra pela busca direta.
  */
  if (
    consulta.termosOriginais.length &&
    originaisEncontrados === 0
  ) {
    /*
      Ainda permitimos que a interpretação inteligente
      encontre algo quando o usuário descreveu uma necessidade
      sem citar diretamente o produto.
    */
    let encontrouIA = false;

    for (const termo of consulta.termosIA) {
      if (
        titulo.includes(termo) ||
        categoria.includes(termo)
      ) {
        encontrouIA = true;
        break;
      }
    }

    if (!encontrouIA) {
      return null;
    }
  }

  /*
    Quanto maior a cobertura das palavras originais,
    mais relevante é o produto.
  */
  if (consulta.termosOriginais.length) {
    const cobertura =
      originaisEncontrados /
      consulta.termosOriginais.length;

    score += cobertura * 80;

    if (
      originaisNoTitulo ===
      consulta.termosOriginais.length
    ) {
      score += 100;
    }
  }

  /*
    FRASES INTERPRETADAS.

    Servem como bônus, principalmente para buscas
    mais humanas, mas não dominam a busca simples.
  */
  for (const frase of consulta.frasesIA) {
    if (titulo.includes(frase)) {
      score += 45;
    } else if (categoria.includes(frase)) {
      score += 20;
    } else if (descricao.includes(frase)) {
      score += 6;
    }
  }

  for (const termo of consulta.termosIA) {
    if (titulo.includes(termo)) {
      score += 8;
    } else if (categoria.includes(termo)) {
      score += 4;
    }
  }

  /*
    Avaliação e desconto servem apenas como desempate.
    Eles nunca devem fazer um produto irrelevante vencer.
  */
  score +=
    Math.min(num(produto.rating), 5) * 1.2 +
    Math.min(num(produto.discount), 80) / 40;

  return score;
}

function renderProduto(produto, label = '') {
  return `
    <article class="product">

      ${
        label
          ? `<div class="tag">${label}</div>`
          : ''
      }

      <img
        src="${produto.image}"
        alt=""
        loading="lazy"
      >

      <div class="pc">

        <h4>${produto.title}</h4>

        <div class="meta">
          ⭐ ${
            num(produto.rating)
              ? num(produto.rating).toFixed(1)
              : '—'
          }
          ·
          ${
            num(produto.discount)
              ? `${Math.round(num(produto.discount))}% OFF`
              : 'Oferta do catálogo'
          }
        </div>

        <div class="price">
          ${money(num(produto.price))}
        </div>

        ${
          num(produto.regular) >
          num(produto.price)
            ? `
              <div class="old">
                de ${money(num(produto.regular))}
              </div>
            `
            : ''
        }

        <a
          href="${produto.link}"
          target="_blank"
          rel="noopener"
        >
          Ver produto
        </a>

      </div>
    </article>
  `;
}

function renderPrincipais(resultados) {
  const principais =
    resultados.slice(0, 3);

  const labels = [
    'Melhor correspondência',
    '2ª melhor opção',
    '3ª melhor opção'
  ];

  cards.innerHTML =
    principais
      .map(
        (item, i) =>
          renderProduto(
            item.p,
            labels[i]
          )
      )
      .join('');

  if (resultados.length > 3) {
    cards.insertAdjacentHTML(
      'afterend',
      `
        <div id="moreArea" style="
          text-align:center;
          margin:24px 0;
        ">
          <button
            id="showAll"
            type="button"
            style="
              border:0;
              border-radius:12px;
              padding:14px 24px;
              font-weight:800;
              cursor:pointer;
            "
          >
            Ver todas as opções (${resultados.length})
          </button>
        </div>
      `
    );

    document
      .querySelector('#showAll')
      .addEventListener(
        'click',
        mostrarTodos
      );
  }
}

function mostrarTodos() {
  mostrandoTodos = true;

  const area =
    document.querySelector('#moreArea');

  if (area) {
    area.remove();
  }

  cards.innerHTML =
    todosResultados
      .map((item, i) =>
        renderProduto(
          item.p,
          i < 3
            ? [
                'Melhor correspondência',
                '2ª melhor opção',
                '3ª melhor opção'
              ][i]
            : ''
        )
      )
      .join('');

  statusEl.textContent =
    `Mostrando ${todosResultados.length} opções encontradas.`;
}

async function search(q) {
  if (!q) return;

  results.hidden = false;
  cards.innerHTML = '';

  const areaAntiga =
    document.querySelector('#moreArea');

  if (areaAntiga) {
    areaAntiga.remove();
  }

  todosResultados = [];
  mostrandoTodos = false;

  if (!catalog.length) {
    statusEl.textContent =
      'O catálogo ainda está carregando. Tente novamente em alguns segundos.';
    return;
  }

  statusEl.textContent =
    '🔎 Procurando no catálogo...';

  /*
    A interpretação inteligente acontece em paralelo
    à busca. Se falhar, a busca simples continua funcionando.
  */
  const interpretacao =
    await interpretarBusca(q);

  const consulta =
    montarConsulta(
      q,
      interpretacao
    );

  let encontrados = catalog
    .map(p => ({
      p,
      s: calcularScore(
        p,
        consulta
      )
    }))
    .filter(
      item => item.s !== null
    )
    .sort(
      (a, b) => b.s - a.s
    );

  /*
    Segunda trava de orçamento.
  */
  if (consulta.max !== null) {
    encontrados =
      encontrados.filter(
        item =>
          num(item.p.price) <=
          consulta.max
      );
  }

  if (!encontrados.length) {
    statusEl.textContent =
      consulta.max !== null
        ? `Não encontrei produtos compatíveis até ${money(consulta.max)}.`
        : 'Não encontrei produtos compatíveis com essa busca.';

    return;
  }

  /*
    Os três principais precisam estar próximos
    da relevância do melhor resultado.

    "Ver todas" continua contendo os demais.
  */
  const melhorScore =
    encontrados[0].s;

  const principaisFortes =
    encontrados.filter(
      item =>
        item.s >=
        melhorScore * 0.70
    );

  let principais;

  if (principaisFortes.length >= 3) {
    principais =
      principaisFortes.slice(0, 3);
  } else {
    principais =
      encontrados.slice(
        0,
        Math.min(
          3,
          encontrados.length
        )
      );
  }

  /*
    Mantemos todos os encontrados para o botão
    "Ver todas as opções", mas colocamos os três
    escolhidos primeiro.
  */
  const idsPrincipais =
    new Set(
      principais.map(
        x => x.p.id
      )
    );

  todosResultados = [
    ...principais,
    ...encontrados.filter(
      x =>
        !idsPrincipais.has(
          x.p.id
        )
    )
  ];

  const quantidadePrincipal =
    Math.min(
      3,
      todosResultados.length
    );

  statusEl.textContent =
    quantidadePrincipal === 1
      ? `ACHEI! Esta foi a opção mais relevante${
          consulta.max !== null
            ? ` até ${money(consulta.max)}`
            : ''
        }.`
      : `ACHEI! Estas são as ${quantidadePrincipal} opções mais relevantes${
          consulta.max !== null
            ? ` até ${money(consulta.max)}`
            : ''
        }.`;

  renderPrincipais(
    todosResultados
  );

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
