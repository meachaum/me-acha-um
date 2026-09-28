const form=document.querySelector('#searchForm');
const input=document.querySelector('#query');
const results=document.querySelector('#results');
const cards=document.querySelector('#cards');
const statusEl=document.querySelector('#status');
let catalog=[];

const stop=new Set('me acha um uma uns umas de da do das dos para por com sem ate até r reais real e a o que quero preciso gostaria bom boa melhor'.split(' '));
function norm(s=''){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function money(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v)}
function budget(q){const m=q.match(/(?:até|ate|r\$|por|máximo|maximo)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);return m?Number(m[1].replace(',','.')):null}
function terms(q){return norm(q).replace(/r\$?\s*\d+[.,]?\d*/g,' ').replace(/[^a-z0-9ç ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!stop.has(w))}
function score(p,ts,max){if(max&&p.price>max)return -999;const hay=norm(`${p.title} ${p.category} ${p.subcategory}`);let s=0;for(const t of ts){if(norm(p.title).includes(t))s+=7;if(hay.includes(t))s+=3}if(ts.length&&!ts.some(t=>hay.includes(t)))return -999;s+=Math.min(p.rating,5)*1.2+saf(p.discount)/30;return s}
function saf(v){return Number.isFinite(v)?v:0}
function render(p,label){return `<article class="product"><div class="tag">${label}</div><img src="${p.image}" alt="" loading="lazy"><div class="pc"><h4>${p.title}</h4><div class="meta">⭐ ${p.rating? p.rating.toFixed(1):'—'} · ${p.discount?`${Math.round(p.discount)}% OFF`:'Oferta do catálogo'}</div><div class="price">${money(p.price)}</div>${p.regular>p.price?`<div class="old">de ${money(p.regular)}</div>`:''}<a href="${p.link}" target="_blank" rel="noopener">Ver produto</a></div></article>`}
function search(q){if(!catalog.length){statusEl.textContent='O catálogo ainda está carregando. Tente novamente em alguns segundos.';results.hidden=false;return}const ts=terms(q),max=budget(q);let ranked=catalog.map(p=>({p,s:score(p,ts,max)})).filter(x=>x.s>-900).sort((a,b)=>b.s-a.s).slice(0,60).map(x=>x.p);results.hidden=false;if(!ranked.length){statusEl.textContent='Não encontrei uma boa opção para essa busca neste catálogo. Tente outras palavras ou outro orçamento.';cards.innerHTML='';return}const best=ranked[0];const cheap=[...ranked].sort((a,b)=>a.price-b.price)[0];const value=[...ranked].sort((a,b)=>(b.rating*2+b.discount/20)-(a.rating*2+a.discount/20))[0];const picks=[];for(const x of [[best,'Melhor correspondência'],[cheap,'Menor preço'],[value,'Custo-benefício']])if(!picks.some(y=>y[0].id===x[0].id))picks.push(x);for(const p of ranked)if(picks.length<3&&!picks.some(y=>y[0].id===p.id))picks.push([p,'Outra opção']);statusEl.textContent=`ACHEI ${ranked.length} opções${max?` até ${money(max)}`:''}. Estas são as 3 que mais combinam com sua busca.`;cards.innerHTML=picks.slice(0,3).map(x=>render(...x)).join('');results.scrollIntoView({behavior:'smooth',block:'start'})}
form.addEventListener('submit',e=>{e.preventDefault();search(input.value.trim())});
document.querySelectorAll('.chips button').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.q;search(b.dataset.q)}));
fetch('./products.json').then(r=>r.json()).then(d=>{catalog=d;document.querySelector('#catalogStatus').textContent=`Catálogo carregado: ${catalog.length.toLocaleString('pt-BR')} produtos`}).catch(()=>document.querySelector('#catalogStatus').textContent='Não foi possível carregar o catálogo.');
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
