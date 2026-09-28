const form=document.querySelector('#searchForm');
const input=document.querySelector('#query');
const results=document.querySelector('#results');
const cards=document.querySelector('#cards');
const statusEl=document.querySelector('#status');
let catalog=[];

const stop=new Set('me acha um uma uns umas de da do das dos para por com sem ate até r reais real e a o que quero preciso gostaria bom boa melhor barato barata'.split(' '));
const synonymGroups=[
 ['organizador','organizadora','organizacao','organização','armazenamento','guardar','arrumar'],
 ['caixa','cesto','estojo','container','recipiente'],
 ['fone','headphone','earphone','auricular'],
 ['bluetooth','sem fio','wireless'],
 ['aspirador','aspirador de po','vacuum'],
 ['pet','gato','cachorro','animal'],
 ['pelo','pelos','fiapo','fiapos'],
 ['sofa','estofado','tapete','tecido'],
 ['presente','lembranca','lembrança'],
 ['ventilador','ventoinha'],
 ['silencioso','silenciosa','baixo ruido','baixo ruído']
];
function norm(s=''){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function money(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v)}
function budget(q){const m=q.match(/(?:até|ate|r\$|por|máximo|maximo)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);return m?Number(m[1].replace(',','.')):null}
function terms(q){return norm(q).replace(/r\$?\s*\d+[.,]?\d*/g,' ').replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stop.has(w))}
function saf(v){return Number.isFinite(v)?v:0}
function variants(t){const out=new Set([t]);for(const g of synonymGroups){const ng=g.map(norm);if(ng.some(x=>x===t||x.includes(t)||t.includes(x)))ng.forEach(x=>x.split(' ').forEach(y=>out.add(y)))}return [...out]}
function analyze(q){const ts=terms(q);return {ts,max:budget(q),phrase:ts.join(' '),vars:ts.map(variants)}}
function score(p,a){if(a.max&&p.price>a.max)return null;const title=norm(p.title||'');const cat=norm(`${p.category||''} ${p.subcategory||''}`);const desc=norm(p.description||'');const full=`${title} ${cat} ${desc}`;let matched=0,s=0;
 for(let i=0;i<a.ts.length;i++){const t=a.ts[i],vs=a.vars[i];let hit=false,best=0;for(const v of vs){if(title.includes(v)){best=Math.max(best,v===t?12:7);hit=true}else if(cat.includes(v)){best=Math.max(best,v===t?7:4);hit=true}else if(desc.includes(v)){best=Math.max(best,v===t?3:1.5);hit=true}}if(hit){matched++;s+=best}}
 if(a.ts.length){const coverage=matched/a.ts.length;if(coverage<0.66)return null;s+=coverage*18;if(matched===a.ts.length)s+=15}
 if(a.phrase&&title.includes(a.phrase))s+=35;
 // Important intent pair bonuses: prevents "caixa" alone from dominating "caixa organizadora".
 const intentPairs=[['caixa','organiz'],['fone','bluetooth'],['pelo','pet'],['aspirador','carro']];
 for(const [x,y] of intentPairs){if(a.phrase.includes(x)&&a.phrase.includes(y)){if(full.includes(x)&&full.includes(y))s+=22;else return null}}
 s+=Math.min(saf(p.rating),5)*1.4+Math.min(saf(p.discount),80)/40;
 return s;
}
function render(p,label){return `<article class="product"><div class="tag">${label}</div><img src="${p.image}" alt="" loading="lazy"><div class="pc"><h4>${p.title}</h4><div class="meta">⭐ ${p.rating?p.rating.toFixed(1):'—'} · ${p.discount?`${Math.round(p.discount)}% OFF`:'Oferta do catálogo'}</div><div class="price">${money(p.price)}</div>${p.regular>p.price?`<div class="old">de ${money(p.regular)}</div>`:''}<a href="${p.link}" target="_blank" rel="noopener">Ver produto</a></div></article>`}
function search(q){if(!q)return;if(!catalog.length){statusEl.textContent='O catálogo ainda está carregando. Tente novamente em alguns segundos.';results.hidden=false;return}const a=analyze(q);let scored=catalog.map(p=>({p,s:score(p,a)})).filter(x=>x.s!==null).sort((x,y)=>y.s-x.s);const strong=scored.length?scored.filter(x=>x.s>=scored[0].s-22):[];const ranked=(strong.length>=3?strong:scored).slice(0,60).map(x=>x.p);results.hidden=false;if(!ranked.length){statusEl.textContent='Não encontrei uma opção realmente compatível com essa busca neste catálogo. Tente outras palavras ou outro orçamento.';cards.innerHTML='';return}const best=ranked[0];const cheap=[...ranked].sort((a,b)=>a.price-b.price)[0];const value=[...ranked].sort((a,b)=>(b.rating*2+b.discount/25)-(a.rating*2+a.discount/25))[0];const picks=[];for(const x of [[best,'Melhor correspondência'],[cheap,'Menor preço'],[value,'Custo-benefício']])if(!picks.some(y=>y[0].id===x[0].id))picks.push(x);for(const p of ranked)if(picks.length<3&&!picks.some(y=>y[0].id===p.id))picks.push([p,'Outra opção']);statusEl.textContent=`ACHEI ${scored.length} opções compatíveis${a.max?` até ${money(a.max)}`:''}. Estas são as 3 mais relevantes.`;cards.innerHTML=picks.slice(0,3).map(x=>render(...x)).join('');results.scrollIntoView({behavior:'smooth',block:'start'})}
form.addEventListener('submit',e=>{e.preventDefault();search(input.value.trim())});
document.querySelectorAll('.chips button').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.q;search(b.dataset.q)}));
fetch('./products.json').then(r=>r.json()).then(d=>{catalog=d;document.querySelector('#catalogStatus').textContent=`Catálogo carregado: ${catalog.length.toLocaleString('pt-BR')} produtos`}).catch(()=>document.querySelector('#catalogStatus').textContent='Não foi possível carregar o catálogo.');
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
