/* ---------- Reportes ---------- */
var RP={desde:'',hasta:'',rango:'30',d:null,n:0};
var RP_RANGOS=[['7','7 días'],['30','30 días'],['mes','Este mes'],['mesant','Mes pasado'],['90','90 días'],['anio','Este año'],['otro','Otro']];
function rpFechas(r){
  var h=today(),y=parse(h).getFullYear(),m=parse(h).getMonth();
  if(r==='7')return [addDays(h,-6),h];
  if(r==='30')return [addDays(h,-29),h];
  if(r==='90')return [addDays(h,-89),h];
  if(r==='mes')return [iso(new Date(y,m,1)),h];
  if(r==='mesant')return [iso(new Date(y,m-1,1)),iso(new Date(y,m,0))];
  if(r==='anio')return [iso(new Date(y,0,1)),h];
  return [RP.desde||addDays(h,-29),RP.hasta||h];
}
function renderReportes(){
  var v=$('#v-reportes');if(!v)return;
  if(!can('reportes')){v.innerHTML='<div class="card"><p class="muted">Tu rol no tiene acceso a los reportes.</p></div>';return}
  if(!RP.desde){var f=rpFechas(RP.rango);RP.desde=f[0];RP.hasta=f[1]}
  if(!v.dataset.ok){
    v.dataset.ok='1';
    v.innerHTML='<div class="rp-head"><div><h1 style="font-size:22px">Reportes</h1><p class="muted" style="margin:2px 0 0">Cómo va tu negocio, explicado en simple.</p></div><div class="rp-tools"><div class="chips-row" id="rpRangos"></div><span class="rp-custom" id="rpCustom"></span><button class="btn" data-action="rp-print" type="button">Imprimir</button></div></div><div id="rpBody"><p class="muted">Cargando…</p></div>';
  }
  pintarRangos();
  var tk=++RP.n;
  api('GET','/reportes?desde='+RP.desde+'&hasta='+RP.hasta).then(function(d){if(tk===RP.n){RP.d=d;pintarReporte()}}).catch(function(e){var b=$('#rpBody');if(b)b.innerHTML='<div class="card"><p class="hint">'+esc(e.message)+'</p></div>'});
}
function pintarRangos(){
  $('#rpRangos').innerHTML=RP_RANGOS.map(function(r){return '<button class="fchip" type="button" data-action="rp-rango" data-r="'+r[0]+'" aria-pressed="'+(RP.rango===r[0])+'">'+r[1]+'</button>'}).join('');
  $('#rpCustom').innerHTML=RP.rango==='otro'?'<input class="in" type="date" data-rp="desde" value="'+RP.desde+'" aria-label="Desde"> <input class="in" type="date" data-rp="hasta" value="'+RP.hasta+'" aria-label="Hasta">':'';
}
var rpMoney=function(o){var k=Object.keys(o||{}).filter(function(m){return o[m]>0});return k.length?k.map(function(m){return m==='USD'?USD(o[m]):CRC(o[m])}).join(' + '):'—'};
function rpKpi(t,v,sub,c){return '<div class="kpi" style="--kc:'+c+'"><small>'+esc(t)+'</small><b>'+v+'</b>'+(sub?'<span>'+sub+'</span>':'')+'</div>'}
function rpBars(rows,opt){
  opt=opt||{};var max=Math.max.apply(null,[1].concat(rows.map(function(r){return r.v})));
  return '<div class="hb">'+rows.map(function(r){
    return '<div class="hb-r"><span class="hb-l" title="'+esc(r.l)+'">'+esc(r.l)+'</span><div class="hb-t"><i style="width:'+Math.max(r.v?2:0,r.v/max*100)+'%;background:'+(r.c||'var(--accent)')+'"></i>'+(r.v2!=null?'<i class="hb-2" style="width:'+(r.v2/max*100)+'%;background:var(--ok)"></i>':'')+'</div><span class="hb-v">'+(r.t!=null?r.t:r.v)+'</span></div>';
  }).join('')+'</div>';
}
function rpTrend(serie,agr){
  if(!serie.length)return '';
  var W=900,H=230,L=34,B=28,T=10,R=8,max=Math.max.apply(null,[1].concat(serie.map(function(s){return Math.max(s.n,s.g)})));
  max=Math.ceil(max/ (max>8?2:1))*(max>8?2:1);
  var pw=(W-L-R)/serie.length,bw=Math.min(28,pw*.6),y=function(v){return T+(H-T-B)*(1-v/max)};
  var g='';for(var i=0;i<=4;i++){var gv=Math.round(max*i/4);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(gv)+'" y2="'+y(gv)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-6)+'" y="'+(y(gv)+4)+'" text-anchor="end" font-size="11" fill="var(--muted)">'+gv+'</text>'}
  var step=Math.ceil(serie.length/10),bars='',line='',pts=[];
  serie.forEach(function(s,i){
    var x=L+pw*i+pw/2;
    bars+='<rect x="'+(x-bw/2)+'" y="'+y(s.n)+'" width="'+bw+'" height="'+Math.max(0,y(0)-y(s.n))+'" rx="3" fill="var(--accent)" opacity=".85"><title>'+esc(fmt(s.k))+': '+pl(s.n,'lead nuevo','leads nuevos')+', '+pl(s.g,'ganado','ganados')+'</title></rect>';
    pts.push([x,y(s.g)]);
    if(i%step===0)bars+='<text x="'+x+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" fill="var(--muted)">'+esc(fmt(s.k))+'</text>';
  });
  line='<polyline fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linejoin="round" points="'+pts.map(function(p){return p.join(',')}).join(' ')+'"/>'+pts.map(function(p,i){return serie[i].g?'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.5" fill="var(--ok)"/>':''}).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Leads nuevos y ganados por '+(agr==='semana'?'semana':'día')+'" style="width:100%;height:auto">'+g+bars+line+'</svg>';
}
function rpInsights(d){
  var k=d.kpis,out=[];
  if(!k.nuevos&&!k.ganados&&!k.perdidos)return [];
  out.push('Entraron <b>'+pl(k.nuevos,'lead nuevo','leads nuevos')+'</b> y se ganaron <b>'+k.ganados+'</b>'+(k.perdidos?'; se perdieron '+k.perdidos:'')+'.');
  if(k.conversion!=null)out.push('De cada 10 leads que se cierran, <b>'+Math.round(k.conversion/10)+'</b> terminan en venta ('+k.conversion+'%).');
  var c=d.porCanal[0];if(c&&k.nuevos)out.push('El canal que más leads trae es <b>'+esc(canalLabel(c.canal))+'</b> ('+Math.round(c.nuevos/k.nuevos*100)+'% del total).');
  var mc=d.porCanal.filter(function(x){return x.ganados>0}).sort(function(a,b){return b.ganados/b.nuevos-a.ganados/a.nuevos})[0];
  if(mc&&mc.canal!==(c&&c.canal))out.push('El canal que mejor convierte es <b>'+esc(canalLabel(mc.canal))+'</b> ('+Math.round(mc.ganados/mc.nuevos*100)+'% de sus leads se ganan).');
  if(d.motivos[0]&&k.perdidos)out.push('La razón más común para perder un lead es <b>'+esc(d.motivos[0].motivo)+'</b> ('+d.motivos[0].n+' de '+k.perdidos+').');
  if(k.diasCierre!=null)out.push('Cerrar una venta toma en promedio <b>'+pl(Math.round(k.diasCierre),'día','días')+'</b>.');
  return out;
}
function pintarReporte(){
  var d=RP.d,el=$('#rpBody');if(!d||!el)return;
  var k=d.kpis,vacio=!k.nuevos&&!k.ganados&&!k.perdidos&&!k.abiertos;
  var colC={whatsapp:'var(--wa)',instagram:'var(--ig)',facebook:'var(--fb)',web:'var(--web)',llamada:'var(--vio)',correo:'var(--warn)',otro:'var(--muted)'};
  var ins=rpInsights(d);
  var h='<p class="rp-rango muted">Del '+esc(fmt(d.desde))+' al '+esc(fmt(d.hasta))+'</p>';
  if(vacio){el.innerHTML=h+'<div class="card"><h2>Todavía no hay datos en estas fechas</h2><p class="sub">Cuando entren leads aparecerán aquí. Prueba con otro rango, o usa el simulador para ver cómo se llena.</p></div>';return}
  h+='<div class="kpis">'+
    rpKpi('Leads nuevos',k.nuevos,'en el período','var(--accent)')+
    rpKpi('Ventas ganadas',k.ganados,esc(rpMoney(k.ventas)),'var(--ok)')+
    rpKpi('Conversión',k.conversion==null?'—':k.conversion+'%','ganados entre los cerrados','var(--s-cal,#7a52d0)')+
    rpKpi('En proceso ahora',k.abiertos,esc(rpMoney(k.pipeline))+' por cerrar','var(--warn)')+
    rpKpi('Perdidos',k.perdidos,'en el período','var(--crit)')+
    rpKpi('Días para cerrar',k.diasCierre==null?'—':Math.round(k.diasCierre),'promedio de una venta','var(--s-chat,#14946a)')+'</div>';
  if(ins.length)h+='<div class="card rp-ins"><h2>Lo más importante</h2><ul>'+ins.map(function(t){return '<li>'+t+'</li>'}).join('')+'</ul></div>';
  h+='<div class="card"><h2>Leads nuevos y ventas por '+(d.agrupa==='semana'?'semana':'día')+'</h2><p class="sub"><span class="lg" style="--c:var(--accent)"></span> Leads nuevos &nbsp; <span class="lg ln" style="--c:var(--ok)"></span> Ventas ganadas</p>'+rpTrend(d.serie,d.agrupa)+'</div>';
  var emb=d.embudo,base=emb.length?Math.max(1,emb[0].llegaron):1;
  h+='<div class="rp-grid"><div class="card"><h2>Embudo de ventas</h2><p class="sub">Cuántos leads llegaron a cada etapa. Muestra dónde se caen.</p>'+
    rpBars(emb.map(function(e,i){var p=Math.round(e.llegaron/base*100),prev=i?emb[i-1].llegaron:0,perd=i&&prev?Math.round((1-e.llegaron/prev)*100):0;return {l:e.nombre,v:e.llegaron,c:colorE(e.clave),t:e.llegaron+' · '+p+'%'+(i&&perd>0?' <small class="muted">(−'+perd+'%)</small>':'')}}))+'</div>'+
    '<div class="card"><h2>De dónde vienen los leads</h2><p class="sub">Barra azul: leads; verde: los que se ganaron.</p>'+
    rpBars(d.porCanal.map(function(c){return {l:canalLabel(c.canal),v:c.nuevos,v2:c.ganados,c:colC[c.canal],t:c.nuevos+(c.ganados?' · '+Math.round(c.ganados/c.nuevos*100)+'% ganados':'')}}))+'</div></div>';
  h+='<div class="rp-grid"><div class="card"><h2>Por qué se pierden</h2><p class="sub">Motivos de los leads perdidos.</p>'+(d.motivos.length?rpBars(d.motivos.map(function(m){return {l:m.motivo,v:m.n,c:'var(--crit)'}})):'<p class="muted">No hubo leads perdidos en este período.</p>')+'</div>'+
    '<div class="card"><h2>Vendedores</h2><p class="sub">Leads asignados a cada persona.</p><div class="tblwrap"><table class="tbl stack"><thead><tr><th>Persona</th><th>Leads</th><th>Ganados</th><th>Conversión</th><th>Ventas</th></tr></thead><tbody>'+d.vendedores.map(function(v){var c=v.ganados+v.perdidos;return '<tr><td><b>'+esc(v.nombre)+'</b></td><td data-l="Leads">'+v.leads+'</td><td data-l="Ganados">'+v.ganados+'</td><td data-l="Conversión">'+(c?Math.round(v.ganados/c*100)+'%':'—')+'</td><td data-l="Ventas">'+esc(rpMoney(v.ventas))+'</td></tr>'}).join('')+'</tbody></table></div></div></div>';
  h+='<div class="rp-grid"><div class="card"><h2>Lo que más se vende</h2><p class="sub">Productos de los leads ganados.</p>'+(d.productos.length?'<div class="tblwrap"><table class="tbl stack"><thead><tr><th>Producto</th><th>Categoría</th><th>Cant.</th><th>Total</th></tr></thead><tbody>'+d.productos.map(function(p){return '<tr><td><b>'+esc(p.nombre)+'</b></td><td data-l="Categoría">'+esc(p.categoria)+'</td><td data-l="Cantidad">'+p.cantidad+'</td><td data-l="Total">'+esc(p.moneda==='USD'?USD(p.total):CRC(p.total))+'</td></tr>'}).join('')+'</tbody></table></div>':'<p class="muted">Todavía no hay ventas con productos. Agrega productos a tus leads ganados para ver esto.</p>')+'</div>'+
    '<div class="card"><h2>Ventas por categoría</h2><p class="sub">Qué tipo de producto deja más dinero.</p>'+(d.categorias.length?rpBars(d.categorias.map(function(c){return {l:c.categoria+(d.categorias.some(function(x){return x.categoria===c.categoria&&x.moneda!==c.moneda})?' ('+c.moneda+')':''),v:c.total,t:c.moneda==='USD'?USD(c.total):CRC(c.total)}})):'<p class="muted">Sin datos todavía.</p>')+'</div></div>';
  el.innerHTML=h;
}
window.renderReportes=renderReportes;
