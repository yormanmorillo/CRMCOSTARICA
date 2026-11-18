(function(){
'use strict';
var ETAPAS=[];
var CANALES=[['whatsapp','WhatsApp'],['web','Página web'],['instagram','Instagram'],['facebook','Facebook'],['correo','Correo'],['llamada','Llamada'],['otro','Otro']];
var PROVINCIAS=['San José','Alajuela','Cartago','Heredia','Guanacaste','Puntarenas','Limón'];
var PAISES=['Estados Unidos','Canadá','México','Panamá','Nicaragua','Colombia','España','Francia','Alemania','Reino Unido','Países Bajos','Italia','Suiza'];

var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var pad=function(n){return String(n).padStart(2,'0')};
var iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
var parse=function(s){var p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2])};
var today=function(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'})};
var addDays=function(s,n){var d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
var diff=function(a,b){return Math.round((parse(a)-parse(b))/86400000)};
var pl=function(n,a,b){return n+' '+(n===1?a:b)};
var fmt=function(s){var d=parse(s),o={day:'numeric',month:'short'};if(d.getFullYear()!==parse(today()).getFullYear())o.year='numeric';return d.toLocaleDateString('es-CR',o).replace(/\./g,'')};
var relDays=function(n){if(n===0)return 'hoy';if(n===1)return 'mañana';if(n===-1)return 'ayer';return n>1?'en '+n+' días':'hace '+(-n)+' días'};
var ini=function(n){return (n||'?').trim().split(/\s+/).slice(0,2).map(function(w){return w[0]}).join('').toUpperCase()};
var canalLabel=function(c){var x=CANALES.filter(function(z){return z[0]===c})[0];return x?x[1]:c};
var etp=function(c){return ETAPAS.filter(function(z){return z.clave===c})[0]};
var etapaLabel=function(c){var x=etp(c);return x?x.nombre:c};
var tipoE=function(c){var x=etp(c);return x?x.tipo:'abierta'};
var colorE=function(c){var x=etp(c);return 'var(--'+(x?x.color:'muted')+')'};
var CRC=function(n){return '₡'+Math.round(n).toLocaleString('es-CR')};
var USD=function(n){return '$'+n.toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:2})};
function money(v,vacio){
  var p=[];if(v&&v.CRC)p.push(CRC(v.CRC));if(v&&v.USD)p.push(USD(v.USD));
  return p.length?p.join(' + '):(vacio==null?'':vacio);
}
function sumValor(list){var t={CRC:0,USD:0};list.forEach(function(l){if(l.valor){t.CRC+=l.valor.CRC||0;t.USD+=l.valor.USD||0}});return t}
var COLS=['accent','fb','warn','vio','ok','muted','ig','crit','wa'];
var COLN={accent:'Verde',fb:'Azul',warn:'Ámbar',vio:'Morado',ok:'Verde oscuro',muted:'Gris',ig:'Rosa',crit:'Rojo',wa:'WhatsApp'};
function ago(isoStr){
  var m=Math.max(0,Math.round((Date.now()-new Date(isoStr).getTime())/60000));
  if(m<1)return 'hace un momento';
  if(m<60)return 'hace '+m+' min';
  var h=Math.round(m/60);
  if(h<24)return 'hace '+h+' h';
  return 'hace '+pl(Math.round(h/24),'día','días');
}
function hora(isoStr){
  var d=new Date(isoStr);
  return d.toLocaleDateString('es-CR',{day:'numeric',month:'short'}).replace(/\./g,'')+' '+d.toLocaleTimeString('es-CR',{hour:'2-digit',minute:'2-digit'});
}

/* ---------- Conexión con el servidor ---------- */
var can=function(p){return S.me.rol==='admin'||((S.me.permisos||[]).indexOf(p)>=0)};
function postTarea(d){
  return api('POST','/tareas',d).catch(function(e){
    if(e&&e.data&&e.data.fueraDeHorario&&confirm(e.message+'\n\n¿Programarla de todos modos?'))return api('POST','/tareas',Object.assign({forzar:true},d));
    throw e;
  });
}
function api(method,path,data){
  var o={method:method,headers:{},credentials:'same-origin'};
  if(data!==undefined){o.headers['content-type']='application/json';o.body=JSON.stringify(data)}
  return fetch('/api'+path,o).catch(function(){throw new Error('No hay conexión con el servidor')}).then(function(r){
    if(r.status===401){location.href='/login';throw new Error('Tu sesión venció. Entra de nuevo.')}
    return r.json().catch(function(){return {}}).then(function(j){
      if(!r.ok){var er=new Error(j.error||('Error '+r.status));er.data=j;er.status=r.status;throw er}
      return j;
    });
  });
}
function fail(e){toast(e&&e.message?e.message:'Algo salió mal')}

var S={leads:[],tasks:[],etapas:[],motivos:[],productos:[],usuarios:[],settings:{negocio:'Pulso CRM',avisoDias:5},me:{nombre:'',rol:'vendedor'},licencia:{estado:'sin_sistema',puedeEscribir:true},chatwoot:{configurado:false,activo:false},whatsapp:{configurado:false,activo:true},meta:{configurado:false,activo:true},web:{activo:true},categorias:[],correo:{configurado:false,activo:true}};
var lead=function(id){return S.leads.filter(function(l){return l.id===id})[0]};
function put(l){var i=S.leads.findIndex(function(x){return x.id===l.id});if(i>-1)S.leads[i]=l;else S.leads.unshift(l)}
var activo=function(l){var t=tipoE(l.etapa);return t!=='ganada'&&t!=='perdida'&&t!=='pausada'};
var esPausa=function(l){return tipoE(l.etapa)==='pausada'};
var esPerdido=function(l){return tipoE(l.etapa)==='perdida'};
var esInicial=function(l){return tipoE(l.etapa)==='inicial'};
var nombreUsr=function(id){var u=S.usuarios.filter(function(x){return x.id===id})[0];return u?u.nombre:''};
var avisoFecha=function(l){return l.llegada?addDays(l.llegada,-(parseInt(l.avisoDias,10)||0)):''};
function remInfo(l){
  var d=diff(avisoFecha(l),today());
  if(d<0)return {cls:'p-crit',text:'Aviso vencido hace '+pl(-d,'día','días')};
  if(d===0)return {cls:'p-crit',text:'Avisar hoy'};
  if(d===1)return {cls:'p-warn',text:'Avisar mañana'};
  return {cls:'p-neutral',text:'Avisar en '+d+' días'};
}
function reminders(win){
  var t=today();
  return S.leads.filter(function(l){return !esPerdido(l)&&l.llegada&&l.llegada>=t&&!l.avisado&&diff(avisoFecha(l),t)<=win})
    .sort(function(a,b){return avisoFecha(a)<avisoFecha(b)?-1:avisoFecha(a)>avisoFecha(b)?1:0});
}
function waHref(l){
  var d=(l.tel||'').replace(/\D/g,'');if(!d)return '';
  if(d.length===8)d='506'+d;
  return 'https://wa.me/'+d;
}
var leadSub=function(l){return l.tipo==='cr'?('Costarricense'+(l.provincia?' · '+l.provincia:'')):('Extranjero'+(l.pais?' · '+l.pais:''))};
var canalChip=function(c){return '<span class="chip ch-'+esc(c)+'"><i></i>'+esc(canalLabel(c))+'</span>'};
var tipoTag=function(l){return '<span class="tag">'+esc(l.tipo==='cr'?'Costarricense':('Extranjero'+(l.pais?' · '+l.pais:'')))+'</span>'};
var etapaChip=function(e){return '<span class="st" style="--c:'+colorE(e)+'">'+esc(etapaLabel(e))+'</span>'};
var tagsHtml=function(l,n){return (l.etiquetas||[]).slice(0,n||99).map(function(t){return '<span class="tagp">'+esc(t)+'</span>'}).join('')};
var lastAtt=function(l){var f=l.atenciones.map(function(a){return a.fecha}).sort();return f.length?f[f.length-1]:''};
var autoTag=function(l){return l.auto?'<span class="tag" title="Se creó sola cuando el cliente escribió">Automático</span>':''};

/* ---------- Estado de interfaz ---------- */
var view='panel',openId=null,syncing=false,loaded=false,sig='';
var F={q:'',canal:'',tipo:'',etapa:'',asig:'',vista:'lista'};
var X={id:null,notas:[],productos:[],actividad:[],etapas:[]};
var AD={sec:'negocio'};
var C={y:parse(today()).getFullYear(),m:parse(today()).getMonth(),sel:today()};
var ibId=null,IB={f:'todas',q:'',c:'',orden:'reciente',mios:false};
var CH={dr:{box:'chatBox',hint:'replyHint',btn:'replyBtn',ta:'replyText'},ib:{box:'ibBox',hint:'ibHint',btn:'ibBtn',ta:'ibText'}};

function temaActual(){var t=document.documentElement.dataset.theme;if(t==='dark'||t==='light')return t;return window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
function pintarTema(){var b=$('#themeBtn');if(!b)return;var d=temaActual()==='dark';b.textContent=d?'☀ Modo luz':'☾ Modo noche';b.classList.add('themebtn')}
function cambiarTema(){var n=temaActual()==='dark'?'light':'dark';document.documentElement.dataset.theme=n;try{localStorage.setItem('pulso-tema',n)}catch(e){}pintarTema()}
function toast(msg){var el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){el.hidden=true},3800)}
function lockScroll(){document.body.style.overflow=$$('.ov').some(function(o){return !o.hidden})?'hidden':''}
function showOv(id){$('#'+id).hidden=false;lockScroll()}
function closeOv(id){$('#'+id).hidden=true;if(id==='drawerOv'){openId=null;X.id=null;renderAll()}if(id==='modalOv'&&openId&&lead(openId)){renderDrHead();renderDrData()}lockScroll()}
function applyBrand(){
  $('#brandName').textContent=S.settings.negocio||'Pulso CRM';
  document.title=(S.settings.negocio||'Pulso CRM');
  $('#who').textContent=S.me.nombre||'';
  $('#adminBtn').hidden=S.me.rol!=='admin';
}

/* ---------- Panel ---------- */
function itemLead(l,extra){
  return '<div class="item" data-open="'+l.id+'" tabindex="0" role="button"><span class="av">'+esc(ini(l.nombre))+'</span><div class="im"><b>'+esc(l.nombre)+'</b><small>'+esc(leadSub(l))+'</small></div>'+extra+'</div>';
}
function renderPanel(){
  var t=today();
  var act=S.leads.filter(activo);
  var esperando=S.leads.filter(function(l){return l.esperando&&activo(l)}).sort(function(a,b){return a.ultimoMsg.at<b.ultimoMsg.at?-1:1});
  var sin=S.leads.filter(function(l){return esInicial(l)&&!l.atenciones.length&&!l.esperando}).sort(function(a,b){return a.creado<b.creado?-1:1});
  var avisos=reminders(7);
  var ahora=avisos.filter(function(l){return diff(avisoFecha(l),t)<=0}).length;
  var tareas=S.tasks.filter(function(k){return !k.hecha&&k.fecha<=t}).sort(function(a,b){return (a.fecha+(a.hora||''))<(b.fecha+(b.hora||''))?-1:1});
  var atras=tareas.filter(function(k){return k.fecha<t}).length;
  var nuevosHoy=S.leads.filter(function(l){return l.creado===t}).length;

  var kpis='<div class="kpis">'+
    '<div class="kpi"><div class="l">Leads activos</div><div class="n">'+act.length+'</div><div class="h">'+nuevosHoy+' entraron hoy</div></div>'+
    '<div class="kpi"><div class="l">Mensajes sin responder</div><div class="n '+(esperando.length?'hot':'')+'">'+esperando.length+'</div><div class="h">Escribieron y nadie contestó</div></div>'+
    '<div class="kpi"><div class="l">Por atender pronto</div><div class="n '+(ahora?'hot':'')+'">'+avisos.length+'</div><div class="h">'+ahora+' para hoy o vencidos</div></div>'+
    '<div class="kpi"><div class="l">Tareas de hoy</div><div class="n '+(atras?'hot':'')+'">'+tareas.length+'</div><div class="h">'+atras+' atrasadas</div></div>'+
    '<div class="kpi"><div class="l">Valor en seguimiento</div><div class="n" style="font-size:'+(money(sumValor(act)).length>14?'20px':'28px')+'">'+esc(money(sumValor(act),'₡0'))+'</div><div class="h">Productos agregados a leads activos</div></div></div>';

  var esHtml=esperando.length?esperando.map(function(l){
    return itemLead(l,'<div class="ir"><span class="pill p-crit">Esperando '+ago(l.ultimoMsg.at).replace('hace ','hace ')+'</span>'+canalChip(l.canal)+'</div>');
  }).join(''):'<div class="empty">No hay mensajes pendientes de respuesta.</div>';

  var avHtml=avisos.length?avisos.map(function(l){
    var r=remInfo(l),w=waHref(l);
    return itemLead(l,'<div class="ir"><span class="pill '+r.cls+'">'+r.text+'</span><small>Llega '+relDays(diff(l.llegada,t))+' · '+fmt(l.llegada)+'</small><div class="mini"><button class="btn sm" data-action="avisado" data-id="'+l.id+'">Ya avisé</button>'+(w?'<a class="btn sm" href="'+w+'" target="_blank" rel="noopener">WhatsApp</a>':'')+'</div></div>');
  }).join(''):'<div class="empty">No hay avisos para los próximos 7 días.</div>';

  var sinHtml=sin.length?sin.map(function(l){
    var d=diff(t,l.creado);
    return itemLead(l,'<div class="ir"><span class="pill '+(d>0?'p-warn':'p-neutral')+'">'+(d===0?'Entró hoy':'Entró hace '+pl(d,'día','días'))+'</span>'+canalChip(l.canal)+'</div>');
  }).join(''):'<div class="empty">Todos los leads nuevos ya fueron atendidos.</div>';

  var tkHtml=tareas.length?tareas.map(function(k){
    var l=k.leadId?lead(k.leadId):null,late=k.fecha<t;
    return '<div class="item" style="cursor:default"><button class="ck" data-action="task-toggle" data-id="'+k.id+'" aria-pressed="false" aria-label="Marcar tarea como hecha"></button><div class="im" '+(l?'data-open="'+l.id+'" style="cursor:pointer"':'')+'><b>'+esc(k.titulo)+'</b><small>'+(l?esc(l.nombre)+' · ':'')+fmt(k.fecha)+(k.hora?' · '+esc(k.hora):'')+'</small></div>'+(late?'<span class="pill p-crit">Atrasada</span>':'<span class="pill p-warn">Hoy</span>')+'</div>';
  }).join(''):'<div class="empty">No tienes tareas pendientes para hoy.</div>';

  var lim=addDays(t,14);
  var prox=S.tasks.filter(function(k){return !k.hecha&&k.fecha>t&&k.fecha<=lim}).sort(function(a,b){return (a.fecha+(a.hora||''))<(b.fecha+(b.hora||''))?-1:1});
  var proxHtml='',ult='';
  prox.forEach(function(k){
    if(k.fecha!==ult){ult=k.fecha;var dd=parse(k.fecha);proxHtml+='<div class="tkgrp">'+relDays(diff(k.fecha,t))+' · '+esc(dd.toLocaleDateString('es-CR',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,''))+'</div>'}
    var l=k.leadId?lead(k.leadId):null;
    proxHtml+='<div class="item" style="cursor:default"><button class="ck" data-action="task-toggle" data-id="'+k.id+'" aria-pressed="false" aria-label="Marcar tarea como hecha"></button><div class="im" '+(l?'data-open="'+l.id+'" style="cursor:pointer"':'')+'><b>'+esc(k.titulo)+'</b><small>'+(l?esc(l.nombre)+' · ':'')+(k.hora?esc(k.hora):'Sin hora')+'</small></div></div>';
  });
  if(!proxHtml)proxHtml='<div class="empty">No hay tareas programadas para los próximos 14 días.</div>';
  var cnt=function(f){return S.leads.filter(f).length};
  var maxE=Math.max.apply(null,[1].concat(ETAPAS.map(function(e){return cnt(function(l){return l.etapa===e.clave})})));
  var embudo=ETAPAS.map(function(e){var n=cnt(function(l){return l.etapa===e.clave});return '<div class="bar-row"><span>'+esc(e.nombre)+'</span><div class="bar"><i style="width:'+(n/maxE*100)+'%;background:var(--'+e.color+')"></i></div><span class="v">'+n+'</span></div>'}).join('');
  var maxC=Math.max.apply(null,[1].concat(CANALES.map(function(c){return cnt(function(l){return l.canal===c[0]})})));
  var colorCanal={whatsapp:'wa',instagram:'ig',facebook:'fb',correo:'warn',web:'web',llamada:'vio',otro:'web'};
  var canales=CANALES.map(function(c){var n=cnt(function(l){return l.canal===c[0]});return '<div class="bar-row"><span>'+c[1]+'</span><div class="bar"><i style="width:'+(n/maxC*100)+'%;background:var(--'+colorCanal[c[0]]+')"></i></div><span class="v">'+n+'</span></div>'}).join('');
  var perd=S.leads.filter(esPerdido),pm={};
  perd.forEach(function(l){var k=l.motivo||'Sin motivo';pm[k]=(pm[k]||0)+1});
  var pk=Object.keys(pm).sort(function(a,b){return pm[b]-pm[a]}),pmax=Math.max.apply(null,[1].concat(pk.map(function(k){return pm[k]})));
  var perdidos=pk.length?'<div class="bars">'+pk.map(function(k){return '<div class="bar-row"><span>'+esc(k)+'</span><div class="bar"><i style="width:'+(pm[k]/pmax*100)+'%;background:var(--crit)"></i></div><span class="v">'+pm[k]+'</span></div>'}).join('')+'</div>':'<p class="muted" style="margin:0">Aún no hay leads perdidos.</p>';
  var nCr=cnt(function(l){return l.tipo==='cr'}),nEx=cnt(function(l){return l.tipo==='ext'}),tot=Math.max(1,nCr+nEx);

  var vacio=S.leads.length?'':'<div class="card" style="margin-bottom:16px"><h2>Todavía no hay leads</h2><p class="sub">Cuando alguien escriba por WhatsApp, Instagram, Facebook o la web, aparecerá aquí solo. También puedes crear uno con el botón “Nuevo lead”.'+(S.whatsapp.configurado||S.chatwoot.configurado?'':' Para recibirlos automáticamente, conecta WhatsApp en Admin, Canales.')+'</p></div>';

  $('#v-panel').innerHTML=vacio+kpis+
    '<div class="grid2"><div class="stack">'+
      '<div class="card"><h2>Conversaciones por responder</h2><p class="sub">El último mensaje es del cliente.</p>'+esHtml+'</div>'+
      '<div class="card"><h2>Por atender pronto</h2><p class="sub">Clientes cuya fecha de aviso llega en los próximos 7 días.</p>'+avHtml+'</div>'+
      '<div class="card"><h2>Leads sin primera atención</h2><p class="sub">Entraron por algún canal y nadie los ha contactado.</p>'+sinHtml+'</div>'+
    '</div><div class="stack">'+
      '<div class="card"><h2>Tareas de hoy y atrasadas</h2><p class="sub">Marca el círculo cuando termines.</p>'+tkHtml+'</div>'+
      '<div class="card"><h2>Tareas de los próximos días</h2><p class="sub">'+pl(prox.length,'tarea','tareas')+' en los próximos 14 días. <a href="#calendario">Ver calendario</a></p>'+proxHtml+'</div>'+
      '<div class="card"><h2>Por qué se pierden</h2><p class="sub">'+pl(perd.length,'lead perdido','leads perdidos')+(S.me.rol==='admin'&&perd.length?' · <a href="#admin" data-action="adm-go" data-sec="perdidos">ver detalle</a>':'')+'</p>'+perdidos+'</div>'+
      '<div class="card"><h2>Resumen</h2><p class="sub">Etapa de los '+S.leads.length+' leads</p><div class="bars">'+embudo+'</div>'+
        '<p class="sub" style="margin-top:18px">Canal de entrada</p><div class="bars">'+canales+'</div>'+
        '<p class="sub" style="margin-top:18px">Costarricenses y extranjeros</p><div class="split"><i style="width:'+(nCr/tot*100)+'%;background:var(--accent)"></i><i style="width:'+(nEx/tot*100)+'%;background:var(--vio)"></i></div>'+
        '<div class="legend"><span style="--c:var(--accent)">Costarricenses '+nCr+'</span><span style="--c:var(--vio)">Extranjeros '+nEx+'</span></div></div>'+
    '</div></div>';
}
function updateBadge(){
  var due=reminders(7).filter(function(l){return diff(avisoFecha(l),today())<=0}).length;
  var b=$('#bdg');b.hidden=!due;b.textContent=due;
}

/* ---------- Leads ---------- */
function filtered(){
  var q=F.q.trim().toLowerCase();
  return S.leads.filter(function(l){
    return (!F.tipo||l.tipo===F.tipo)&&(!F.canal||l.canal===F.canal)&&(!F.etapa||l.etapa===F.etapa)&&(!F.asig||(F.asig==='_none'?!l.asignado:l.asignado===F.asig))&&
      (!q||[l.nombre,l.tel,l.email,l.pais,l.provincia,l.interes,l.empresa,(l.etiquetas||[]).join(' ')].join(' ').toLowerCase().indexOf(q)>-1);
  }).sort(function(a,b){return a.creado<b.creado?1:a.creado>b.creado?-1:0});
}
function avisoCell(l){
  if(esPerdido(l))return '<span class="muted">—</span>';
  if(!l.llegada)return '<span class="muted">Sin fecha de llegada</span>';
  if(l.avisado)return '<span class="pill p-ok">Cliente avisado</span>';
  var r=remInfo(l);return '<span class="pill '+r.cls+'">'+r.text+'</span>';
}
function attCell(l){
  if(l.esperando&&activo(l))return '<span class="pill p-crit">Esperando respuesta</span>';
  var f=lastAtt(l);return f?'<span class="muted">Atendido '+relDays(diff(f,today()))+'</span>':'<span class="pill p-warn">Sin atender</span>';
}
function renderLeads(){
  $$('[data-action="f-tipo"]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.t===F.tipo))});
  $$('[data-action="f-vista"]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.v===F.vista))});
  var list=filtered();
  $('#leadCount').textContent=pl(list.length,'lead','leads')+(list.length!==S.leads.length?' de '+S.leads.length:'');
  var box=$('#leadList');
  if(!list.length){box.innerHTML='<div class="card empty">'+(S.leads.length?'Ningún lead coincide con los filtros.':'Todavía no hay leads.')+'</div>';return}
  if(F.vista==='lista'){
    box.innerHTML='<div class="list"><div class="lhead"><span></span><span>Lead</span><div class="cells"><span>Canal</span><span>Etapa</span><span>Aviso</span><span>Atención</span><span>Valor</span><span>Asignado</span></div></div>'+
      list.map(function(l){
        return '<button class="lrow" data-open="'+l.id+'"><span class="av">'+esc(ini(l.nombre))+'</span><span class="who"><b>'+(l.destacado?'<span style="color:var(--warn)">★</span> ':'')+esc(l.nombre)+'</b><small>'+esc((l.empresa?l.empresa+' · ':'')+(l.tel||l.email||'Sin contacto'))+' · '+esc(l.tipo==='cr'?'CR':(l.pais||'Extranjero'))+'</small></span><span class="cells"><span>'+canalChip(l.canal)+'</span><span>'+etapaChip(l.etapa)+'</span><span>'+avisoCell(l)+'</span><span>'+attCell(l)+'</span><span>'+esc(money(l.valor,'—'))+'</span><span>'+(l.asignadoNombre?'<span class="av sm" title="'+esc(l.asignadoNombre)+'">'+esc(ini(l.asignadoNombre))+'</span>':'<span class="muted">—</span>')+'</span></span></button>';
      }).join('')+'</div>';
  }else{
    box.innerHTML='<div class="board">'+ETAPAS.map(function(e){
      var items=list.filter(function(l){return l.etapa===e.clave});
      var v=money(sumValor(items));
      return '<div class="col" data-stage="'+esc(e.clave)+'" style="--c:var(--'+esc(e.color)+')"><h3><span>'+esc(e.nombre)+' <span class="cnt">'+items.length+'</span>'+(v?'<span class="sum">'+esc(v)+'</span>':'')+'</span></h3>'+items.map(kcard).join('')+'</div>';
    }).join('')+'</div>';
  }
}
function kcard(l){
  var t=today(),dias=l.etapaEn?Math.max(0,Math.round((Date.now()-new Date(l.etapaEn).getTime())/86400000)):0;
  var aviso=esPerdido(l)?(l.motivo?'<span class="pill p-neutral">'+esc(l.motivo)+'</span>':''):(l.esperando&&activo(l)?'<span class="pill p-crit">Esperando respuesta</span>':(l.llegada&&!l.avisado?'<span class="pill '+remInfo(l).cls+'">'+esc(remInfo(l).text)+'</span>':''));
  return '<div class="kc'+(l.destacado?' star':'')+'" draggable="true" data-open="'+l.id+'" data-id="'+l.id+'" tabindex="0" role="button">'+
    '<div class="top"><b>'+(l.destacado?'<span style="color:var(--warn)">★</span> ':'')+esc(l.nombre||'Sin nombre')+'</b>'+(l.asignadoNombre?'<span class="av sm" title="Asignado a '+esc(l.asignadoNombre)+'">'+esc(ini(l.asignadoNombre))+'</span>':'')+'</div>'+
    ((l.empresa||l.tel)?'<div class="sub2">'+esc([l.empresa,l.tel].filter(Boolean).join(' · '))+'</div>':'')+
    '<div class="r">'+canalChip(l.canal)+tipoTag(l)+'</div>'+
    '<div class="meta">'+(money(l.valor)?'<span><b>'+esc(money(l.valor))+'</b>'+(l.nProductos?' · '+pl(l.nProductos,'producto','productos'):'')+'</span>':'')+
      (l.llegada?'<span>Llega '+fmt(l.llegada)+'</span>':'')+
      '<span>'+(dias===0?'Hoy en esta etapa':pl(dias,'día','días')+' en etapa')+'</span></div>'+
    (l.interes?'<div class="sub2" title="'+esc(l.interes)+'">“'+esc(l.interes)+'”</div>':'')+
    ((l.etiquetas||[]).length?'<div class="r">'+tagsHtml(l,3)+((l.etiquetas.length>3)?'<span class="tagp">+'+(l.etiquetas.length-3)+'</span>':'')+'</div>':'')+
    miniRoad(l)+
    (aviso?'<div class="foot">'+aviso+'</div>':'')+'</div>';
}
function miniRoad(l){
  var p=roadPasos(l),n=p.length,i=0;p.forEach(function(e,k){if(e.clave===l.etapa)i=k});
  var pct=tipoE(l.etapa)==='ganada'?100:(n>1?Math.round(i/(n-1)*100):0);
  return '<div class="kbar" title="Avance: '+pct+'%"><i style="width:'+pct+'%;background:'+(esPerdido(l)?'var(--crit)':(tipoE(l.etapa)==='ganada'?'var(--ok)':'var(--accent)'))+'"></i></div>';
}

/* ---------- Calendario ---------- */
function eventsByDay(){
  var ev={};
  var add=function(d,o){(ev[d]=ev[d]||[]).push(o)};
  S.tasks.forEach(function(k){var l=k.leadId?lead(k.leadId):null;add(k.fecha,{type:'task',id:k.id,label:(k.hora?k.hora+' ':'')+k.titulo,sub:l?l.nombre:'',leadId:k.leadId,done:k.hecha})});
  S.leads.forEach(function(l){
    if(esPerdido(l)||!l.llegada)return;
    add(l.llegada,{type:'arr',id:l.id,label:'Llega '+l.nombre,leadId:l.id});
    if(!l.avisado)add(avisoFecha(l),{type:'rem',id:l.id,label:'Avisar: '+l.nombre,leadId:l.id});
  });
  return ev;
}
function renderCal(){
  var ev=eventsByDay(),t=today();
  var first=new Date(C.y,C.m,1),startDow=(first.getDay()+6)%7,days=new Date(C.y,C.m+1,0).getDate();
  var total=Math.ceil((startDow+days)/7)*7;
  $('#calTitle').textContent=first.toLocaleDateString('es-CR',{month:'long',year:'numeric'});
  var h=['lun','mar','mié','jue','vie','sáb','dom'].map(function(d){return '<div class="dow">'+d+'</div>'}).join('');
  for(var i=0;i<total;i++){
    var d=new Date(C.y,C.m,1-startDow+i),s=iso(d),list=ev[s]||[];
    var cls='day'+(d.getMonth()!==C.m?' out':'')+(s===t?' today':'')+(s===C.sel?' sel':'');
    h+='<button class="'+cls+'" data-action="cal-sel" data-date="'+s+'" aria-label="'+esc(d.toLocaleDateString('es-CR',{weekday:'long',day:'numeric',month:'long'}))+(list.length?', '+pl(list.length,'evento','eventos'):'')+'"><span class="n">'+d.getDate()+'</span>'+
      list.slice(0,2).map(function(e){return '<span class="evt e-'+e.type+(e.done?' fin':'')+'">'+esc(e.label)+'</span>'}).join('')+
      (list.length>2?'<span class="more">+'+(list.length-2)+' más</span>':'')+
      '<span class="dots">'+list.slice(0,4).map(function(e){return '<i class="e-'+e.type+'"></i>'}).join('')+'</span></button>';
  }
  $('#calGrid').innerHTML=h;
  renderCalDay(ev);
}
function renderCalDay(ev){
  ev=ev||eventsByDay();
  var list=ev[C.sel]||[];
  var title=parse(C.sel).toLocaleDateString('es-CR',{weekday:'long',day:'numeric',month:'long'});
  var names={task:'Tarea',arr:'Llegada',rem:'Aviso'};
  var body=list.length?list.map(function(e){
    if(e.type==='task'){
      return '<div class="dayitem'+(e.done?' done':'')+'"><button class="ck" data-action="task-toggle" data-id="'+e.id+'" aria-pressed="'+!!e.done+'" aria-label="Marcar tarea"></button><div class="im" '+(e.leadId?'data-open="'+e.leadId+'" style="cursor:pointer"':'')+'><span class="t e-task">Tarea</span><b style="display:block">'+esc(e.label)+'</b>'+(e.sub?'<small>'+esc(e.sub)+'</small>':'')+'</div><button class="x" data-action="task-del" data-id="'+e.id+'" aria-label="Eliminar tarea">Quitar</button></div>';
    }
    return '<div class="dayitem" data-open="'+e.leadId+'" style="cursor:pointer"><div class="im"><span class="t e-'+e.type+'">'+names[e.type]+'</span><b style="display:block">'+esc(e.label)+'</b></div></div>';
  }).join(''):'<div class="empty">Nada programado este día.</div>';
  var opts='<option value="">Sin lead</option>'+S.leads.filter(function(l){return !esPerdido(l)}).map(function(l){return '<option value="'+l.id+'">'+esc(l.nombre)+'</option>'}).join('');
  $('#calDay').innerHTML='<h2 style="text-transform:capitalize">'+esc(title)+'</h2><p class="sub">'+(C.sel===today()?'Hoy':'Día seleccionado')+'</p>'+body+
    '<form class="addform" data-form="task-cal"><h3 style="font-size:14px">Nueva tarea</h3>'+
    '<label class="fl">Qué hay que hacer<input class="in" id="ctTitulo" name="titulo" required placeholder="Llamar para confirmar"></label>'+
    '<div class="fg"><label class="fl">Fecha<input class="in" id="ctFecha" name="fecha" type="date" required value="'+C.sel+'"></label><label class="fl">Hora (opcional)<input class="in" id="ctHora" name="hora" type="time"></label></div>'+
    '<label class="fl">Lead<select class="in" id="ctLead" name="leadId">'+opts+'</select></label>'+
    '<button class="btn primary" type="submit">Agregar al calendario</button></form>';
}

/* ---------- Render general ---------- */
function renderAll(){
  if(!loaded)return;
  updateBadge();
  if(view==='panel')renderPanel();
  if(view==='leads')renderLeads();
  if(view==='calendario')renderCal();
  if(view==='conversaciones')renderInbox();
  if(view==='admin'&&window.renderAdmin)renderAdmin();
}
function setView(v){
  var vistas=['panel','leads','calendario','conversaciones','admin'];
  if(vistas.indexOf(v)<0||(v==='admin'&&S.me.rol!=='admin'))v='panel';
  view=v;document.body.dataset.view=v;
  vistas.forEach(function(x){$('#v-'+x).hidden=x!==v});
  $$('.snav button').forEach(function(b){if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  renderAll();
}
/* ---------- Pestaña Conversaciones: la bandeja de Pulso CRM ---------- */
function ajustarPestanaChat(){
  var n=S.leads.filter(function(l){return l.tieneChat&&l.esperando&&activo(l)}).length;
  var b=$('#bdgChat');b.hidden=!n;b.textContent=n;
}
function convs(){
  var q=IB.q.trim().toLowerCase();
  return S.leads.filter(function(l){return l.tieneChat}).filter(function(l){
    if(IB.f==='sin'&&!(l.esperando&&activo(l)))return false;
    if(IB.f==='resp'&&l.esperando)return false;
    if(IB.c&&l.canal!==IB.c)return false;
    if(IB.mios&&l.asignado!==S.me.id)return false;
    if(q&&(l.nombre+' '+l.tel+' '+(l.ultimoMsg?l.ultimoMsg.txt:'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort(function(a,b){
    var x=a.ultimoMsg?a.ultimoMsg.at:'',y=b.ultimoMsg?b.ultimoMsg.at:'';
    if(IB.orden==='antiguo')return x<y?-1:x>y?1:0;
    if(IB.orden==='espera'){var ea=a.esperando&&activo(a),eb=b.esperando&&activo(b);if(ea!==eb)return ea?-1:1;if(ea)return x<y?-1:x>y?1:0}
    return x<y?1:x>y?-1:0;
  });
}
function pintarFiltrosChat(){
  var cs=S.leads.filter(function(l){return l.tieneChat}),cnt={};
  cs.forEach(function(l){cnt[l.canal]=(cnt[l.canal]||0)+1});
  var colorC={whatsapp:'wa',instagram:'ig',facebook:'fb',correo:'warn',web:'web',llamada:'vio',otro:'web'};
  var ks=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a]});
  var h='<button class="fchip" type="button" data-action="ib-canal" data-c="" aria-pressed="'+(!IB.c)+'">Todos <b>'+cs.length+'</b></button>'+ks.map(function(k){return '<button class="fchip" type="button" data-action="ib-canal" data-c="'+esc(k)+'" aria-pressed="'+(IB.c===k)+'" style="--c:var(--'+(colorC[k]||'web')+')"><i></i>'+esc(canalLabel(k))+' <b>'+cnt[k]+'</b></button>'}).join('');
  var box=$('#ibCanales');if(box&&box.dataset.sig!==h){box.dataset.sig=h;box.innerHTML=h}
  var o=$('#ibOrden');if(o&&o.value!==IB.orden)o.value=IB.orden;
  var m=$('#ibMios');if(m)m.setAttribute('aria-pressed',String(IB.mios));
  var lim=$('#ibLimpiar');if(lim)lim.hidden=!(IB.f!=='todas'||IB.c||IB.mios||IB.q||IB.orden!=='reciente');
}
function renderInboxList(){
  var el=$('#ibList');if(!el)return;
  var total=S.leads.filter(function(l){return l.tieneChat}).length;
  var n=S.leads.filter(function(l){return l.tieneChat&&l.esperando&&activo(l)}).length;
  var sb=$('#ibSin');sb.hidden=!n;sb.textContent=n;
  $$('[data-action="ib-filtro"]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.f===IB.f))});
  pintarFiltrosChat();
  var list=convs(),top=el.scrollTop;
  if(!list.length){
    el.innerHTML=total?'<div class="ib-empty">No hay conversaciones con esos filtros.</div>':
      (S.whatsapp.configurado||S.meta.configurado||(S.chatwoot.configurado&&S.chatwoot.activo)?
        '<div class="ib-empty"><b>Todavía no hay conversaciones</b>Cuando un cliente escriba por WhatsApp, Instagram o Facebook, su mensaje aparecerá aquí y su lead se creará solo.</div>':
        '<div class="ib-empty"><b>Falta conectar un canal</b>'+(S.me.rol==='admin'?'Abre Admin, Canales y sigue los pasos para recibir aquí los mensajes de tus clientes.':'Pídele al administrador que conecte los canales en Admin.')+'</div>');
    return;
  }
  el.innerHTML=list.map(function(l){
    var u=l.ultimoMsg,wait=l.esperando&&activo(l);
    return '<button class="ib-it'+(wait?' wait':'')+'" data-action="ib-open" data-id="'+l.id+'"'+(l.id===ibId?' aria-current="true"':'')+'><span class="av">'+esc(ini(l.nombre))+'</span><div class="im"><div class="l1"><b>'+esc(l.nombre||'Sin nombre')+'</b><span class="tm">'+(u?esc(ago(u.at)):'')+'</span></div><div class="pv">'+(u?(u.dir==='out'?'Tú: ':'')+esc(u.txt||'Mensaje'):'Sin mensajes todavía')+'</div><div class="l3">'+canalChip(l.canal)+(wait?'<span class="ib-dot" title="Sin responder"></span><small>Sin responder</small>':'')+'</div></div></button>';
  }).join('');
  el.scrollTop=top;
}
function openThread(id){
  var l=lead(id);if(!l)return;
  ibId=id;
  var th=$('#ibThread');delete th.dataset.vacio;
  $('#inbox').classList.add('abierto');
  th.innerHTML='<div class="ib-head"><button class="btn sm ib-back" data-action="ib-back" aria-label="Volver a la lista de conversaciones">‹ Chats</button><span class="av">'+esc(ini(l.nombre))+'</span><div class="id"><b>'+esc(l.nombre||'Sin nombre')+'</b><small>'+esc((l.tel?l.tel+' · ':'')+canalLabel(l.canal))+'</small></div><button class="btn sm" data-open="'+l.id+'">Ver ficha</button></div>'+
    '<div class="chat" id="ibBox"><p class="muted" style="margin:0">Cargando mensajes…</p></div>'+
    '<form class="reply" data-form="reply" data-target="ib"><textarea class="in" id="ibText" name="texto" rows="2" placeholder="Escribe tu respuesta" aria-label="Respuesta" required></textarea><button class="btn primary" type="submit" id="ibBtn">Enviar</button></form><small class="ib-hint" id="ibHint"></small>';
  renderInboxList();
  loadChat('ib');
}
function renderInbox(){
  if(ibId&&!lead(ibId))ibId=null;
  renderInboxList();
  var th=$('#ibThread');
  if(ibId)return;
  var c=convs();
  if(window.innerWidth>860&&c.length){openThread((c.filter(function(l){return l.esperando})[0]||c[0]).id);return}
  $('#inbox').classList.remove('abierto');
  if(!th.dataset.vacio){th.dataset.vacio='1';th.innerHTML='<div class="ib-empty"><b>Elige una conversación</b>Aquí verás los mensajes del cliente y podrás responderle sin salir de Pulso CRM.</div>'}
}
function refresh(){
  renderAll();
  if(openId&&lead(openId)){renderDrHead();renderDrAtt();renderDrTasks();renderDrProd();updateRemInfo()}
}

/* ---------- Ficha del lead ---------- */
function optHtml(arr,v){return arr.map(function(x){return '<option value="'+esc(x[0])+'"'+(x[0]===v?' selected':'')+'>'+esc(x[1])+'</option>'}).join('')}
var etapaOpts=function(v){return ETAPAS.map(function(e){return [e.clave,e.nombre]})};
function openLead(id){
  var l=lead(id);if(!l)return;
  openId=id;X={id:id,notas:[],productos:[],actividad:[],etapas:[]};
  var chat=l.tieneChat?
    '<section id="sec-chat"><h3>Conversación</h3><div class="chat" id="chatBox"><p class="muted" style="margin:0">Cargando mensajes…</p></div>'+
      '<form class="reply" data-form="reply"><textarea class="in" id="replyText" name="texto" rows="2" placeholder="Escribe tu respuesta" aria-label="Respuesta" required></textarea><button class="btn primary" type="submit" id="replyBtn">Enviar</button></form>'+
      '<small id="replyHint" style="display:block;margin-top:6px"></small></section>':'';
  $('#drBody').innerHTML=
    '<section id="sec-road"><h3>Avance del lead</h3><div id="drRoad"></div></section>'+
    '<div class="acts" id="drActs"><button class="btn sm" data-action="dr-go" data-t="sec-prod" data-f="prodSel">+ Producto</button><button class="btn sm" data-action="dr-go" data-t="sec-task" data-f="tkTitulo">Tarea</button><button class="btn sm" data-action="dr-go" data-t="sec-att" data-f="attNota" data-canal="llamada">Registrar llamada</button><button class="btn sm" data-action="dr-go" data-t="sec-nota" data-f="notaText">Nota</button>'+
      (l.tieneChat?'<button class="btn sm" data-action="dr-go" data-t="sec-chat" data-f="replyText">Mensaje</button>':'')+
      '<button class="btn sm" data-action="dr-go" data-t="sec-datos" data-f="tagIn">Etiquetas</button></div>'+
    '<div class="dcol">'+chat+
    '<section id="sec-datos"><h3>Datos del lead</h3><div id="drData"></div><div id="drTags" style="margin-top:12px"></div></section>'+
    '<section id="sec-rem"><h3>Llegada y recordatorio</h3><div id="drRem"></div></section>'+
    '<section id="sec-files"><h3>Archivos adjuntos</h3>'+
      '<label class="drop" id="dropZone"><input type="file" id="fileIn" accept="image/*" multiple><b style="color:var(--fg)">Agregar imágenes</b><span>Toca para elegir o arrastra las fotos aquí</span></label>'+
      '<div id="drFiles"></div></section>'+
    '</div><div class="dcol"><section id="sec-prod"><h3>Productos</h3><div id="drProd"></div></section>'+
    '<section id="sec-att"><h3>Atenciones</h3>'+
      '<form class="fg" data-form="att">'+
        '<label class="fl">Día de atención<input class="in" id="attFecha" name="fecha" type="date" required value="'+today()+'"></label>'+
        '<label class="fl">Por dónde<select class="in" id="attCanal" name="canal">'+optHtml(CANALES.concat([['presencial','En persona']]),l.canal)+'</select></label>'+
        '<label class="fl full">Qué se habló<textarea class="in" id="attNota" name="nota" rows="2" required placeholder="Ej: Pidió cotización para 4 personas"></textarea></label>'+
        '<button class="btn primary full" type="submit">Registrar atención</button></form>'+
      '<div id="drAtt"></div></section>'+
    '<section id="sec-nota"><h3>Notas internas</h3>'+
      '<form data-form="nota"><label class="fl">Solo las ve tu equipo<textarea class="in" id="notaText" name="texto" rows="2" required placeholder="Ej: Prefiere que lo llamen en la tarde"></textarea></label><button class="btn" type="submit" style="margin-top:8px">Guardar nota</button></form>'+
      '<div id="drNotas"></div></section>'+
    '<section id="sec-task"><h3>Tareas de este lead</h3>'+
      '<form class="fg" data-form="task-lead">'+
        '<label class="fl full">Tarea<input class="in" id="tkTitulo" name="titulo" required placeholder="Ej: Llamar para confirmar"></label>'+
        '<label class="fl">Fecha<input class="in" id="tkFecha" name="fecha" type="date" required value="'+addDays(today(),1)+'"></label>'+
        '<label class="fl">Hora (opcional)<input class="in" id="tkHora" name="hora" type="time"></label>'+
        '<button class="btn full" type="submit">Agregar al calendario</button></form>'+
      '<div id="drTasks"></div></section>'+
    '<section id="sec-act"><h3>Línea de tiempo</h3><div id="drAct"></div></section>'+
    '</div>'+
    (can('eliminar_leads')?'<section id="sec-del"><button class="btn danger" type="button" data-action="del-lead">Eliminar este lead</button></section>':'');
  renderDrHead();renderDrData();renderDrTags();renderDrProd();renderDrRem();renderDrAtt();renderDrNotas();renderDrTasks();renderDrFiles();renderDrAct();renderDrRoad();
  showOv('drawerOv');
  $('#drBody').scrollTop=0;
  var cb=$('#drHead .btn');if(cb)cb.focus();
  if(l.tieneChat)loadChat('dr');
  loadExtra(id);
}
function loadExtra(id){
  return api('GET','/leads/'+id+'/extra').then(function(r){
    if(openId!==id)return;
    X={id:id,notas:r.notas||[],productos:r.productos||[],actividad:r.actividad||[],etapas:r.etapas||[]};
    var ae=document.activeElement;
    if(!(ae&&ae.closest&&ae.closest('#drProdList')))renderDrProd();
    renderDrNotas();renderDrAct();renderDrRoad();
  }).catch(function(){});
}
function renderDrHead(){
  var l=lead(openId);if(!l)return;
  var w=waHref(l),perd=esPerdido(l),gan=tipoE(l.etapa)==='ganada';
  var banner=perd?'<div class="banner" style="margin:0 20px 12px"><span><b>'+esc(etapaLabel(l.etapa))+'</b>'+(l.motivo?': '+esc(l.motivo):' (sin motivo registrado)')+(l.motivoNota?' — '+esc(l.motivoNota):'')+'</span>'+(S.motivos.length?'<button class="btn sm" data-action="motivo-edit">'+(l.motivo?'Cambiar motivo':'Elegir motivo')+'</button>':'')+'</div>':
    (gan?'<div class="banner ok" style="margin:0 20px 12px"><span><b>'+esc(etapaLabel(l.etapa))+'</b>'+(money(l.valor)?' · '+esc(money(l.valor)):'')+'</span></div>':(esPausa(l)?'<div class="banner" style="margin:0 20px 12px"><span><b>'+esc(etapaLabel(l.etapa))+'</b>: el lead está en pausa; no genera avisos hasta que lo muevas de etapa.</span></div>':''));
  $('#drHead').innerHTML='<div class="dr-top"><span class="av lg">'+esc(ini(l.nombre))+'</span><div class="id"><h2 id="drTitle">'+esc(l.nombre||'Sin nombre')+'</h2><div class="chips">'+canalChip(l.canal)+tipoTag(l)+autoTag(l)+(l.empresa?'<span class="tag">'+esc(l.empresa)+'</span>':'')+'</div></div>'+
      '<button class="starbtn'+(l.destacado?' on':'')+'" data-action="star" aria-pressed="'+l.destacado+'" aria-label="'+(l.destacado?'Quitar de destacados':'Destacar lead')+'" title="Destacar">'+(l.destacado?'★':'☆')+'</button>'+
      '<button class="btn sm" data-action="close-drawer">Cerrar</button></div>'+
    banner+
    '<div class="dr-meta"><label class="fl">Etapa<select class="in" data-f="etapa">'+optHtml(etapaOpts(),l.etapa)+'</select></label>'+
    '<label class="fl">Asignado a<select class="in" data-f="asignado"><option value="">Sin asignar</option>'+optHtml(S.usuarios.map(function(u){return [u.id,u.nombre]}),l.asignado)+'</select></label>'+(w?'<a class="btn" href="'+w+'" target="_blank" rel="noopener">Abrir WhatsApp</a>':'')+'</div>';
}
function renderDrTags(){
  var l=lead(openId),el=$('#drTags');if(!l||!el)return;
  el.innerHTML='<span class="muted" style="font-size:12px">Etiquetas</span><div class="r" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">'+((l.etiquetas||[]).map(function(t,i){return '<span class="tagp x">'+esc(t)+'<button type="button" data-action="tag-del" data-i="'+i+'" aria-label="Quitar etiqueta '+esc(t)+'">✕</button></span>'}).join('')||'<span class="muted" style="font-size:13px">Sin etiquetas</span>')+'</div>'+
    '<form data-form="tag" style="display:flex;gap:8px"><input class="in" id="tagIn" name="tag" maxlength="30" placeholder="Ej: grupo, VIP, luna de miel" aria-label="Nueva etiqueta"><button class="btn" type="submit">Agregar</button></form>';
}
function renderDrProd(){
  var l=lead(openId),el=$('#drProd');if(!l||!el)return;
  var items=X.productos||[],tot={};
  items.forEach(function(it){tot[it.moneda]=(tot[it.moneda]||0)+it.cantidad*it.precio});
  var fm=function(m,n){return m==='USD'?USD(n):CRC(n)};
  var lista=items.length?'<div class="pitems" id="drProdList">'+items.map(function(it){
    return '<div class="prod"><div class="nm"><b>'+esc(it.nombre)+'</b><small class="muted">'+it.moneda+' · subtotal '+esc(fm(it.moneda,it.cantidad*it.precio))+'</small></div>'+
      '<input class="in" type="number" min="0.01" step="any" value="'+it.cantidad+'" data-lpq="'+it.id+'" aria-label="Cantidad de '+esc(it.nombre)+'">'+
      '<input class="in" type="number" min="0" step="any" value="'+it.precio+'" data-lpp="'+it.id+'" aria-label="Precio de '+esc(it.nombre)+'">'+
      '<button class="x" data-action="prod-del" data-id="'+it.id+'" aria-label="Quitar '+esc(it.nombre)+'">Quitar</button></div>';
  }).join('')+'<div class="total">'+Object.keys(tot).map(function(m){return '<span>Total '+esc(fm(m,tot[m]))+'</span>'}).join('')+'</div></div>':'<p class="muted" style="margin:0 0 12px">Todavía no hay productos en este lead.</p>';
  var optP=function(p){return '<option value="'+p.id+'">'+esc(p.nombre+' · '+(p.moneda==='USD'?USD(p.precio):CRC(p.precio)))+'</option>'};
  var CATS=S.categorias||[];
  var cat=CATS.map(function(c){var ps=S.productos.filter(function(p){return p.categoriaId===c.id});return ps.length?'<optgroup label="'+esc(c.nombre)+'">'+ps.map(optP).join('')+'</optgroup>':''}).join('');
  var sinCat=S.productos.filter(function(p){return !CATS.some(function(c){return c.id===p.categoriaId})});
  cat+=sinCat.length?(CATS.length?'<optgroup label="Sin categoría">':'')+sinCat.map(optP).join('')+(CATS.length?'</optgroup>':''):'';
  var ayuda=S.productos.length?'':'<div class="prodhelp"><span>Todavía no hay productos en el catálogo. Puedes escribir uno a mano abajo'+(S.me.rol==='admin'?', o crear tu catálogo para elegirlo con un clic.':'. Pídele al administrador que cree el catálogo.')+'</span>'+(S.me.rol==='admin'?'<button class="btn sm" type="button" data-action="adm-go" data-sec="productos">Crear productos</button>':'')+'</div>';
  el.innerHTML=lista+ayuda+'<form class="fg" data-form="prod">'+
    '<label class="fl full">Producto del catálogo<select class="in" id="prodSel" name="productoId"><option value="">Otro (escribe el nombre abajo)</option>'+cat+'</select></label>'+
    '<label class="fl">Cantidad<input class="in" name="cantidad" type="number" min="0.01" step="any" value="1"></label>'+
    '<label class="fl">Precio (si lo cambias)<input class="in" name="precio" type="number" min="0" step="any" placeholder="Usa el del catálogo"></label>'+
    '<label class="fl">Si es otro: nombre<input class="in" name="nombre" maxlength="120"></label>'+
    '<label class="fl">Moneda<select class="in" name="moneda"><option value="CRC">Colones (₡)</option><option value="USD">Dólares ($)</option></select></label>'+
    '<button class="btn full" type="submit">Agregar al lead</button></form>'+
    '';
}
function renderDrNotas(){
  var el=$('#drNotas');if(!el)return;
  el.innerHTML=(X.notas||[]).map(function(n){
    return '<div class="nota"><div class="m"><span>'+esc(n.usuario||'Alguien')+' · '+esc(hora(n.creado))+'</span>'+((S.me.rol==='admin'||n.usuario_id===S.me.id)?'<button class="x" data-action="nota-del" data-id="'+n.id+'" aria-label="Borrar nota">Borrar</button>':'')+'</div><p>'+esc(n.texto)+'</p></div>';
  }).join('');
}
var ACT_T={creado:'Creado',etapa:'Etapa',ganado:'Ganado',perdido:'Perdido',nota:'Nota',producto:'Producto',atencion:'Atención',asignado:'Asignación',mensaje:'Mensaje'};
function roadPasos(l){
  var perd=esPerdido(l);
  var pasos=ETAPAS.filter(function(e){return e.tipo!=='perdida'&&e.tipo!=='pausada'&&!(perd&&e.tipo==='ganada')});
  if(perd){var pe=ETAPAS.filter(function(e){return e.clave===l.etapa})[0];if(pe)pasos.push(pe)}
  return pasos;
}
function roadInfo(l){
  var pasos=roadPasos(l),h=X.etapas||[],now=Date.now();
  if(!h.length&&l.etapaEn)h=[{etapa:l.etapa,entrada:l.etapaEn}];
  var info={};
  h.forEach(function(r,i){
    var ini=new Date(r.entrada).getTime(),fin=h[i+1]?new Date(h[i+1].entrada).getTime():now;
    var o=info[r.etapa]=info[r.etapa]||{entrada:r.entrada,ms:0};
    o.ms+=Math.max(0,fin-ini);
  });
  var cur=0;pasos.forEach(function(e,i){if(e.clave===l.etapa)cur=i});
  // En pausa: el avance queda en la última etapa del embudo que visitó.
  if(esPausa(l))h.forEach(function(r){pasos.forEach(function(e,i){if(e.clave===r.etapa&&i>cur)cur=i})});
  return {pasos:pasos,info:info,cur:cur};
}
function renderDrRoad(){
  var el=$('#drRoad');if(!el)return;
  var l=lead(openId);if(!l)return;
  var R=roadInfo(l),n=R.pasos.length,perd=esPerdido(l),gan=tipoE(l.etapa)==='ganada';
  var pct=gan?100:(n>1?Math.round(R.cur/(n-1)*100):0);
  if(perd)pct=Math.round(R.cur/Math.max(1,n-1)*100);
  var dias=function(ms){var d=Math.round(ms/86400000);return d<1?'menos de 1 día':pl(d,'día','días')};
  var pasos=R.pasos.map(function(e,i){
    var st=i<R.cur?'done':(i===R.cur?'cur':'next'),o=R.info[e.clave],lost=e.tipo==='perdida';
    var sub=o?(fmt(String(o.entrada).slice(0,10))+(st==='cur'&&!gan&&!lost?' · '+dias(o.ms):(st==='done'?' · '+dias(o.ms):''))):(st==='done'?'Sin registro':'Pendiente');
    var can=st!=='cur';
    return '<li class="rp '+st+(lost?' lost':'')+'" style="--c:var(--'+esc(e.color)+')"><button type="button" '+(can?'data-action="road-go" data-e="'+esc(e.clave)+'" title="Mover el lead a '+esc(e.nombre)+'"':'disabled aria-current="step"')+'><span class="dot">'+(st==='done'?'✓':(lost?'✕':(gan&&st==='cur'?'★':(i+1))))+'</span><b>'+esc(e.nombre)+'</b><small>'+esc(sub)+'</small></button></li>';
  }).join('');
  var tk=S.tasks.filter(function(k){return k.leadId===l.id&&!k.hecha}).sort(function(a,b){return (a.fecha||'')<(b.fecha||'')?-1:1})[0];
  var cur=R.pasos[R.cur],oc=cur&&R.info[cur.clave];
  var res=[];
  if(l.llegada)res.push('Llegada: <b>'+esc(fmt(l.llegada))+'</b>');
  if(tk)res.push('Próxima tarea: <b>'+esc(tk.titulo)+'</b> · '+esc(fmt(tk.fecha)));
  else if(!perd&&!gan)res.push('<span style="color:var(--warn)">Sin tarea pendiente: agenda el siguiente paso</span>');
  el.innerHTML='<div class="road-top"><div class="road-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><i style="width:'+pct+'%;background:'+(perd?'var(--crit)':(gan?'var(--ok)':'var(--accent)'))+'"></i></div><b>'+pct+'%</b></div>'+
    '<ol class="road">'+pasos+'</ol>'+
    '<div class="road-foot">'+(oc&&!gan?'<span>Lleva <b>'+esc(dias(oc.ms))+'</b> en «'+esc(cur.nombre)+'»</span>':'')+res.map(function(x){return '<span>'+x+'</span>'}).join('')+'</div>';
}
function renderDrAct(){
  var el=$('#drAct');if(!el)return;
  var a=X.actividad||[];
  el.innerHTML=a.length?'<div class="tl">'+a.map(function(e){return '<div class="e"><div class="m"><b>'+esc(ACT_T[e.tipo]||e.tipo||'Evento')+'</b><small>'+esc(hora(e.creado))+(e.usuario?' · '+esc(e.usuario):'')+'</small></div><p>'+esc(e.texto)+'</p></div>'}).join('')+'</div>':'<p class="muted" style="margin:0">Todavía no hay movimientos.</p>';
}
function renderDrData(){
  var l=lead(openId);if(!l)return;
  var cr=l.tipo==='cr';
  $('#drData').innerHTML='<div class="fg">'+
    '<label class="fl full">Nombre<input class="in" data-f="nombre" value="'+esc(l.nombre)+'"></label>'+
    '<label class="fl full">Empresa (opcional)<input class="in" data-f="empresa" value="'+esc(l.empresa)+'"></label>'+
    '<label class="fl">Teléfono / WhatsApp<input class="in" data-f="tel" inputmode="tel" value="'+esc(l.tel)+'"></label>'+
    '<label class="fl">Correo<input class="in" data-f="email" type="email" value="'+esc(l.email)+'"></label>'+
    '<label class="fl">Canal de entrada<select class="in" data-f="canal">'+optHtml(CANALES,l.canal)+'</select></label>'+
    '<label class="fl">Tipo de cliente<select class="in" data-f="tipo">'+optHtml([['cr','Costarricense'],['ext','Extranjero']],l.tipo)+'</select></label>'+
    (cr?'<label class="fl">Cédula<input class="in" data-f="cedula" value="'+esc(l.cedula)+'" placeholder="1-2345-6789"></label><label class="fl">Provincia<select class="in" data-f="provincia"><option value="">Sin indicar</option>'+PROVINCIAS.map(function(p){return '<option'+(p===l.provincia?' selected':'')+'>'+p+'</option>'}).join('')+'</select></label>':
         '<label class="fl">País<input class="in" data-f="pais" list="paises" value="'+esc(l.pais)+'"><datalist id="paises">'+PAISES.map(function(p){return '<option value="'+p+'">'}).join('')+'</datalist></label><label class="fl">Pasaporte<input class="in" data-f="pasaporte" value="'+esc(l.pasaporte)+'"></label>')+
    '<label class="fl full">Interés o consulta<textarea class="in" rows="3" data-f="interes">'+esc(l.interes)+'</textarea></label></div>'+
    (l.auto?'<p class="hint" style="margin-top:12px">Este lead se creó solo cuando el cliente escribió. Revisa si el tipo de cliente (costarricense o extranjero) quedó bien y corrígelo si hace falta.</p>':'');
}
function renderDrRem(){
  var l=lead(openId);if(!l)return;
  $('#drRem').innerHTML='<div class="fg" data-dias-scope>'+
    '<label class="fl">Fecha de llegada o cita<input class="in" type="date" data-f="llegada" data-llegada value="'+esc(l.llegada)+'"></label>'+
    '<label class="fl">O dice que llega en… (días)<input class="in" type="number" min="0" max="365" data-dias placeholder="Ej: 20"></label>'+
    '<label class="fl">Avisarle con cuántos días de anticipación<input class="in" type="number" min="0" max="90" data-f="avisoDias" value="'+esc(l.avisoDias)+'"></label>'+
    '<div class="fl"><span>Estado del aviso</span><button class="btn" type="button" data-action="toggle-avisado" id="btnAvisado"></button></div>'+
    '<p class="hint full" id="remInfo"></p></div>';
  updateRemInfo();
}
function updateRemInfo(){
  var l=lead(openId),el=$('#remInfo');if(!l||!el)return;
  var b=$('#btnAvisado');if(b)b.textContent=l.avisado?'Reactivar aviso':'Marcar como avisado';
  if(!l.llegada){el.textContent='Sin fecha de llegada, así que no se creará ningún recordatorio.';return}
  var t=today(),af=avisoFecha(l),d=diff(af,t);
  var cuando=d<0?'ya pasó hace '+pl(-d,'día','días'):d===0?'es hoy':'será '+relDays(d);
  el.textContent='Llega '+relDays(diff(l.llegada,t))+' ('+fmt(l.llegada)+'). Debes avisarle el '+fmt(af)+', que '+cuando+'.'+(l.avisado?' Ya está marcado como avisado.':'');
}
function renderDrAtt(){
  var l=lead(openId),el=$('#drAtt');if(!l||!el)return;
  var a=l.atenciones.slice().sort(function(x,y){return x.fecha<y.fecha?1:x.fecha>y.fecha?-1:0});
  el.innerHTML=a.length?'<div class="tl">'+a.map(function(e){
    return '<div class="e"><div class="m"><b>'+fmt(e.fecha)+'</b><small>'+relDays(diff(e.fecha,today()))+'</small>'+(['llamada','presencial'].indexOf(e.canal)>-1?'<span class="tag">'+(e.canal==='llamada'?'Llamada':'En persona')+'</span>':(e.canal?canalChip(e.canal):''))+(e.auto?'<span class="tag">Automática</span>':'')+'<button class="x" data-action="att-del" data-id="'+e.id+'" aria-label="Eliminar atención">Quitar</button></div><p>'+esc(e.nota)+'</p></div>';
  }).join('')+'</div>':'<p class="muted" style="margin:12px 0 0">Todavía no hay atenciones registradas.</p>';
}
function renderDrTasks(){
  var el=$('#drTasks');if(!el||!openId)return;
  var ts=S.tasks.filter(function(k){return k.leadId===openId}).sort(function(a,b){return a.fecha<b.fecha?-1:1});
  el.innerHTML=ts.length?ts.map(function(k){
    return '<div class="dayitem'+(k.hecha?' done':'')+'"><button class="ck" data-action="task-toggle" data-id="'+k.id+'" aria-pressed="'+!!k.hecha+'" aria-label="Marcar tarea"></button><div class="im"><b>'+esc(k.titulo)+'</b><small>'+fmt(k.fecha)+(k.hora?' · '+esc(k.hora):'')+'</small></div><button class="x" data-action="task-del" data-id="'+k.id+'" aria-label="Eliminar tarea">Quitar</button></div>';
  }).join(''):'<p class="muted" style="margin:12px 0 0">Sin tareas para este lead.</p>';
}
function renderDrFiles(){
  var l=lead(openId),el=$('#drFiles');if(!l||!el)return;
  el.innerHTML=l.archivos.length?'<div class="files">'+l.archivos.map(function(f){
    return '<div class="f"><button class="th" data-action="lb" data-id="'+f.id+'" aria-label="Ver '+esc(f.nombre)+'"><img loading="lazy" src="/api/archivos/'+f.id+'" alt="'+esc(f.nombre)+'"></button><button class="x" data-action="file-del" data-id="'+f.id+'" aria-label="Quitar imagen">✕</button><small>'+esc(f.nombre)+'</small></div>';
  }).join('')+'</div>':'<p class="muted" style="margin:12px 0 0">Aún no hay archivos adjuntos.</p>';
}

/* ---------- Conversación (mensajes de WhatsApp u otros canales) ---------- */
var urlOk=function(u){return /^https?:\/\//.test(u)||/^\/api\/medios\/[a-f0-9]+$/.test(u)};
function adjHtml(a){
  if(a&&a.borrado)return '<small class="muted"><i>Archivo eliminado para ahorrar espacio</i></small>';
  if(!a||!urlOk(a.url))return '';
  var u=esc(a.url),n=esc(a.name||'');
  if(a.type==='image')return '<a href="'+u+'" target="_blank" rel="noopener"><img src="'+u+'" alt="'+(n||'Imagen')+'" loading="lazy"></a>';
  if(a.type==='audio')return '<audio controls preload="none" src="'+u+'"></audio>';
  if(a.type==='video')return '<video controls preload="none" src="'+u+'"></video>';
  return '<a class="fl-adj" href="'+u+'" target="_blank" rel="noopener">'+(n||'Abrir archivo adjunto')+'</a>';
}
function estadoHtml(m){
  if(m.direccion!=='out'||!m.estado)return '';
  if(/^fallo/.test(m.estado))return '<span class="est mal">No se entregó: '+esc(m.estado.replace(/^fallo:\s*/,''))+'</span>';
  var t={enviado:'Enviado',entregado:'Entregado',leido:'Leído'}[m.estado];
  return t?'<span class="est">'+t+'</span>':'';
}
function renderChat(t,r){
  var ids=CH[t],box=$('#'+ids.box);if(!box)return;
  var msgs=r.mensajes||[],v=r.ventana,cerrada=!!(v&&!v.abierta);
  var s=JSON.stringify([msgs.map(function(m){return m.id+(m.estado||'')}),r.configurado,cerrada]);
  if(s===box.dataset.sig)return;
  box.dataset.sig=s;
  var atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60||!box.dataset.init;
  box.innerHTML=msgs.length?msgs.map(function(m){
    return '<div class="msg '+(m.direccion==='in'?'in':'out')+'">'+(m.asunto?'<b class="asu">✉ '+esc(m.asunto)+'</b>':'')+(m.texto?esc(m.texto):'')+(m.adjuntos||[]).map(adjHtml).join('')+'<small>'+(m.direccion==='out'&&m.autor?esc(m.autor)+' · ':'')+hora(m.creado)+'</small>'+estadoHtml(m)+'</div>';
  }).join(''):'<p class="muted" style="margin:0">Todavía no hay mensajes guardados de esta conversación.</p>';
  box.dataset.init='1';
  if(atBottom)box.scrollTop=box.scrollHeight;
  var hint=$('#'+ids.hint),btn=$('#'+ids.btn),ta=$('#'+ids.ta);
  var dis=false,txt;
  var social=r.canal==='whatsapp'||r.canal==='instagram'||r.canal==='facebook',nomC=canalLabel(r.canal);
  if(!r.configurado){dis=true;txt=social||r.canal==='correo'?nomC+' no está conectado del todo. Un administrador debe terminar la conexión en Admin, Canales.':'Para responder desde aquí, enciende y conecta Chatwoot en Admin, Canales.'}
  else if(cerrada){dis=true;txt='Pasaron más de 24 horas desde el último mensaje del cliente. '+nomC+' solo permite responder libremente dentro de ese tiempo; podrás responder cuando el cliente escriba de nuevo.'}
  else if(social&&v&&v.hasta)txt='Puedes responder hasta '+hora(v.hasta)+' ('+nomC+' da 24 horas desde el último mensaje del cliente). Ctrl+Enter envía.';
  else txt='La respuesta sale por el mismo canal del cliente.';
  if(hint)hint.textContent=txt;
  if(btn)btn.disabled=dis;
  if(ta)ta.disabled=dis;
}
var chatLead=function(t){return t==='ib'?ibId:openId};
function loadChat(t){
  t=t||'dr';
  var id=chatLead(t);if(!id)return Promise.resolve();
  return api('GET','/leads/'+id+'/mensajes').then(function(r){if(chatLead(t)===id)renderChat(t,r)}).catch(function(){
    var box=$('#'+CH[t].box);if(box&&!box.dataset.init)box.innerHTML='<p class="muted" style="margin:0">No se pudieron cargar los mensajes.</p>';
  });
}

/* ---------- Imágenes ---------- */
function readImage(file){
  return new Promise(function(res,rej){
    var fr=new FileReader();
    fr.onerror=rej;
    fr.onload=function(){
      var img=new Image();
      img.onerror=rej;
      img.onload=function(){
        var k=Math.min(1,1100/Math.max(img.width,img.height)),w=Math.round(img.width*k),h=Math.round(img.height*k);
        var c=document.createElement('canvas');c.width=w;c.height=h;
        var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
        res(c.toDataURL('image/jpeg',0.78));
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function addFiles(files){
  var id=openId;if(!id||!lead(id))return;
  var imgs=Array.prototype.slice.call(files).filter(function(f){return /^image\//.test(f.type)});
  if(!imgs.length){toast('Por ahora solo se pueden adjuntar imágenes.');return}
  var ok=0;
  imgs.reduce(function(p,f){
    return p.then(function(){
      return readImage(f).then(function(d){return api('POST','/leads/'+id+'/archivos',{nombre:f.name,data:d})}).then(function(r){
        var l=lead(id);if(l){l.archivos.push(r.archivo);ok++;if(openId===id)renderDrFiles()}
      }).catch(function(e){fail(e)});
    });
  },Promise.resolve()).then(function(){if(ok)toast(pl(ok,'imagen agregada','imágenes agregadas'))});
}

/* ---------- Modales ---------- */
function openNew(){
  $('#modal').innerHTML='<div class="mh"><h2>Nuevo lead</h2><button class="btn sm" type="button" data-action="close-modal">Cerrar</button></div>'+
  '<form data-form="new" id="newForm" data-dias-scope><div class="fg">'+
    '<label class="fl">Canal de entrada<select class="in" id="nCanal" name="canal">'+optHtml(CANALES,'llamada')+'</select><small class="muted">Las llamadas se agregan a mano: elige “Llamada”. Los demás canales entran solos.</small></label>'+
    '<div class="fl"><span>Tipo de cliente</span><div class="seg wide" role="radiogroup" aria-label="Tipo de cliente"><label class="segopt"><input type="radio" name="tipo" value="cr" checked><span>Costarricense</span></label><label class="segopt"><input type="radio" name="tipo" value="ext"><span>Extranjero</span></label></div></div>'+
    '<label class="fl full">Nombre completo<input class="in" id="nNombre" name="nombre" required autocomplete="off"></label>'+
    '<label class="fl full">Empresa (opcional)<input class="in" id="nEmpresa" name="empresa" autocomplete="off"></label>'+
    '<label class="fl">Teléfono / WhatsApp<input class="in" id="nTel" name="tel" inputmode="tel" placeholder="+506 8888 8888"></label>'+
    '<label class="fl">Correo<input class="in" id="nEmail" name="email" type="email"></label>'+
    '<div class="grp" data-for="cr"><label class="fl">Cédula<input class="in" id="nCedula" name="cedula" placeholder="1-2345-6789"></label><label class="fl">Provincia<select class="in" id="nProv" name="provincia"><option value="">Sin indicar</option>'+PROVINCIAS.map(function(p){return '<option>'+p+'</option>'}).join('')+'</select></label></div>'+
    '<div class="grp" data-for="ext" hidden><label class="fl">País<input class="in" id="nPais" name="pais" list="paisesN"><datalist id="paisesN">'+PAISES.map(function(p){return '<option value="'+p+'">'}).join('')+'</datalist></label><label class="fl">Pasaporte (opcional)<input class="in" id="nPas" name="pasaporte"></label></div>'+
    (S.productos.length?'<label class="fl">Producto de interés (opcional)<select class="in" name="productoId"><option value="">Ninguno</option>'+S.productos.map(function(p){return '<option value="'+p.id+'">'+esc(p.nombre)+'</option>'}).join('')+'</select></label><label class="fl">Cantidad<input class="in" name="cantidad" type="number" min="1" step="any" value="1"></label>':'')+
    '<label class="fl full">Qué consulta<textarea class="in" id="nInteres" name="interes" rows="2" placeholder="Ej: Precio y disponibilidad para 4 personas"></textarea></label>'+
    '<label class="fl">Fecha de llegada (si la dice)<input class="in" id="nLlegada" name="llegada" type="date" data-llegada></label>'+
    '<label class="fl">O llega en… (días)<input class="in" id="nDias" type="number" min="0" max="365" data-dias placeholder="Ej: 20"></label>'+
    '<label class="fl full">Avisarle con cuántos días de anticipación<input class="in" id="nAviso" name="avisoDias" type="number" min="0" max="90" value="'+S.settings.avisoDias+'"></label>'+
    '<button class="btn primary full" type="submit">Guardar lead</button></div></form>';
  showOv('modalOv');$('#nNombre').focus();
}
function moveEtapa(id,clave){
  var l=lead(id);if(!l||l.etapa===clave)return Promise.resolve();
  if(tipoE(clave)==='perdida'&&S.motivos.length){askMotivo(id,clave,false);return Promise.resolve()}
  return api('PATCH','/leads/'+id,{etapa:clave}).then(function(r){put(r.lead);if(openId===id){renderDrHead();loadExtra(id)}renderAll();toast(r.lead.nombre+' pasó a '+etapaLabel(r.lead.etapa))}).catch(function(e){fail(e);if(openId===id)renderDrHead();renderAll()});
}
function askMotivo(id,clave,fix){
  var l=lead(id);if(!l)return;
  var cur=fix?l.motivoId:'';
  $('#modal').innerHTML='<div class="mh"><h2>'+(fix?'Motivo de pérdida':'¿Por qué no se concretó?')+'</h2><button class="btn sm" type="button" data-action="close-modal">Cancelar</button></div>'+
    '<form data-form="motivo" data-id="'+id+'" data-etapa="'+esc(clave||'')+'" data-fix="'+(fix?'1':'')+'">'+
    '<p class="sub" style="margin:0 0 12px">'+esc(l.nombre)+'. Guárdalo para ver después por qué se pierden los leads.</p>'+
    '<div class="motivos">'+S.motivos.map(function(m){return '<label><input type="radio" name="motivoId" value="'+m.id+'" required'+(m.id===cur?' checked':'')+'><span>'+esc(m.nombre)+'</span></label>'}).join('')+'</div>'+
    '<label class="fl" style="margin-top:12px">Detalle (opcional)<textarea class="in" name="nota" rows="2" maxlength="500" placeholder="Ej: Pedía un descuento que no podemos dar">'+esc(fix?l.motivoNota:'')+'</textarea></label>'+
    '<button class="btn primary" type="submit" style="margin-top:12px;width:100%">'+(fix?'Guardar motivo':'Marcar como '+esc(etapaLabel(clave)))+'</button></form>';
  showOv('modalOv');
}
function copyText(text,btn){
  var done=function(){var o=btn.textContent;btn.textContent='Copiado';setTimeout(function(){btn.textContent=o},1500)};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){toast('Selecciona el texto y cópialo a mano')})}
  else toast('Selecciona el texto y cópialo a mano');
}
/* ---------- Acciones ---------- */
function act(a,el){
  var id=el.dataset.id;
  switch(a){
    case 'nav':location.hash='#'+el.dataset.view;break;
    case 'new-lead':openNew();break;
    case 'theme':cambiarTema();break;
    case 'logout':api('POST','/auth/logout').then(function(){location.href='/login'}).catch(function(){location.href='/login'});break;
    case 'ib-open':openThread(id);break;
    case 'ib-back':$('#inbox').classList.remove('abierto');ibId=null;$('#ibThread').dataset.vacio='';renderInboxList();break;
    case 'ib-filtro':IB.f=el.dataset.f;renderInboxList();break;
    case 'ib-canal':IB.c=el.dataset.c;renderInboxList();break;
    case 'ib-mios':IB.mios=!IB.mios;renderInboxList();break;
    case 'ib-limpiar':IB.f='todas';IB.c='';IB.mios=false;IB.q='';IB.orden='reciente';{var qi=$('#ibq');if(qi)qi.value=''}renderInboxList();break;
    case 'road-go':moveEtapa(openId,el.dataset.e);break;
    case 'star':{var ls=lead(openId);if(ls)api('PATCH','/leads/'+openId,{destacado:!ls.destacado}).then(function(r){put(r.lead);renderDrHead();renderAll()}).catch(fail);break}
    case 'dr-go':{var tg=document.getElementById(el.dataset.t);if(tg){tg.scrollIntoView({block:'start',behavior:'smooth'});if(el.dataset.canal){var ac=$('#attCanal');if(ac)ac.value=el.dataset.canal}var ff=document.getElementById(el.dataset.f);if(ff)setTimeout(function(){ff.focus({preventScroll:true})},250)}break}
    case 'tag-del':{var lt=lead(openId);if(lt){var nt=lt.etiquetas.filter(function(_,i){return i!==parseInt(el.dataset.i,10)});api('PATCH','/leads/'+openId,{etiquetas:nt}).then(function(r){put(r.lead);renderDrTags();renderAll()}).catch(fail)}break}
    case 'prod-del':api('DELETE','/lead-productos/'+id).then(function(r){put(r.lead);renderDrHead();loadExtra(openId);renderAll()}).catch(fail);break;
    case 'nota-del':api('DELETE','/notas/'+id).then(function(){return loadExtra(openId)}).catch(fail);break;
    case 'motivo-edit':askMotivo(openId,'',true);break;
    case 'close-drawer':closeOv('drawerOv');break;
    case 'close-modal':closeOv('modalOv');break;
    case 'close-lb':closeOv('lbOv');break;
    case 'avisado':api('PATCH','/leads/'+id,{avisado:true}).then(function(r){put(r.lead);refresh();toast('Marcado como avisado: '+r.lead.nombre)}).catch(fail);break;
    case 'toggle-avisado':{var l2=lead(openId);if(l2)api('PATCH','/leads/'+openId,{avisado:!l2.avisado}).then(function(r){put(r.lead);refresh()}).catch(fail);break}
    case 'task-toggle':{var k=S.tasks.filter(function(x){return x.id===id})[0];if(k)api('PATCH','/tareas/'+id,{hecha:!k.hecha}).then(function(r){Object.assign(k,r.tarea);refresh()}).catch(fail);break}
    case 'task-del':api('DELETE','/tareas/'+id).then(function(){S.tasks=S.tasks.filter(function(x){return x.id!==id});refresh()}).catch(fail);break;
    case 'att-del':api('DELETE','/atenciones/'+id).then(function(r){put(r.lead);refresh()}).catch(fail);break;
    case 'file-del':{var l4=lead(openId);if(l4)api('DELETE','/archivos/'+id).then(function(){l4.archivos=l4.archivos.filter(function(x){return x.id!==id});renderDrFiles()}).catch(fail);break}
    case 'lb':{var l5=lead(openId),f=l5&&l5.archivos.filter(function(x){return x.id===id})[0];if(f){$('#lbImg').src='/api/archivos/'+f.id;$('#lbImg').alt=f.nombre;$('#lbCap').textContent=f.nombre;showOv('lbOv')}break}
    case 'del-lead':
      if(!el.classList.contains('armed')){el.classList.add('armed');el.textContent='Toca otra vez para eliminar';break}
      var did=openId;
      api('DELETE','/leads/'+did).then(function(){
        S.tasks=S.tasks.filter(function(x){return x.leadId!==did});
        S.leads=S.leads.filter(function(x){return x.id!==did});
        closeOv('drawerOv');toast('Lead eliminado');
      }).catch(fail);break;
    case 'f-tipo':F.tipo=el.dataset.t;renderLeads();break;
    case 'f-vista':F.vista=el.dataset.v;renderLeads();break;
    case 'cal-prev':C.m--;if(C.m<0){C.m=11;C.y--}renderCal();break;
    case 'cal-next':C.m++;if(C.m>11){C.m=0;C.y++}renderCal();break;
    case 'cal-today':{var n=parse(today());C.y=n.getFullYear();C.m=n.getMonth();C.sel=today();renderCal();break}
    case 'cal-sel':{C.sel=el.dataset.date;var d=parse(C.sel);C.y=d.getFullYear();C.m=d.getMonth();renderCal();break}
    default:if(a==='adm-go'&&openId)closeOv('drawerOv');if(window.adminAct)window.adminAct(a,el,id);
  }
}
document.addEventListener('click',function(e){
  var cp=e.target.closest('[data-copy]');
  if(cp){var inp=document.getElementById(cp.dataset.copy);if(inp){inp.select();copyText(inp.value,cp)}return}
  var a=e.target.closest('[data-action]');
  if(a){if(a.tagName==='A')e.preventDefault();act(a.dataset.action,a);return}
  var o=e.target.closest('[data-open]');
  if(o){openLead(o.dataset.open);return}
  if(e.target.classList&&e.target.classList.contains('ov'))closeOv(e.target.id);
});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    var ids=['lbOv','modalOv','drawerOv'];
    for(var i=0;i<ids.length;i++){if(!$('#'+ids[i]).hidden){closeOv(ids[i]);break}}
    return;
  }
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&(e.target.id==='replyText'||e.target.id==='ibText')){e.preventDefault();$(e.target.id==='ibText'?'#ibBtn':'#replyBtn').click();return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-open][role="button"]')){e.preventDefault();openLead(e.target.dataset.open)}
});
document.addEventListener('input',function(e){
  var el=e.target;
  if(el.id==='fq'){F.q=el.value;renderLeads();return}
  if(el.id==='ibq'){IB.q=el.value;renderInboxList();return}
  if(el.hasAttribute&&el.hasAttribute('data-dias')){
    var sc=el.closest('[data-dias-scope]'),inp=sc&&sc.querySelector('[data-llegada]');
    if(inp){
      var n=parseInt(el.value,10);
      inp.value=isNaN(n)?'':addDays(today(),Math.max(0,n));
      if(inp.dataset.f){syncing=true;inp.dispatchEvent(new Event('change',{bubbles:true}));syncing=false}
    }
  }
});
document.addEventListener('change',function(e){
  var el=e.target;
  if(el.id==='ibOrden'){IB.orden=el.value;renderInboxList();return}
  if(el.id==='fcanal'){F.canal=el.value;renderLeads();return}
  if(el.id==='fetapa'){F.etapa=el.value;renderLeads();return}
  if(el.id==='fasig'){F.asig=el.value;renderLeads();return}
  if(window.adminChange&&window.adminChange(el))return;
  if(el.dataset&&(el.dataset.lpq||el.dataset.lpp)){
    var lid=el.dataset.lpq||el.dataset.lpp,pt={};pt[el.dataset.lpq?'cantidad':'precio']=el.value;
    api('PATCH','/lead-productos/'+lid,pt).then(function(r){put(r.lead);renderAll();loadExtra(openId)}).catch(function(er){fail(er);loadExtra(openId)});return;
  }
  if(el.id==='fileIn'){addFiles(el.files);el.value='';return}
  if(el.name==='tipo'&&el.closest('#newForm')){
    $$('#newForm [data-for]').forEach(function(g){g.hidden=g.dataset.for!==el.value});return;
  }
  if(el.dataset&&el.dataset.s){
    var body={};body[el.dataset.s]=el.value;
    api('PATCH','/ajustes',body).then(function(r){S.settings=r.settings;applyBrand();toast('Ajuste guardado')}).catch(fail);
    return;
  }
  if(el.hasAttribute&&el.hasAttribute('data-llegada')&&!syncing){
    var sc=el.closest('[data-dias-scope]'),di=sc&&sc.querySelector('[data-dias]');if(di)di.value='';
  }
  var f=el.dataset&&el.dataset.f;
  if(f&&openId){
    var id=openId,v=el.value;
    if(f==='etapa'){moveEtapa(id,v);return}
    if(f==='avisoDias')v=Math.max(0,parseInt(v,10)||0);
    var patch={};patch[f]=v;
    api('PATCH','/leads/'+id,patch).then(function(r){
      put(r.lead);
      if(openId===id){
        if(f==='tipo')renderDrData();
        if(f==='nombre'||f==='canal'||f==='tipo'||f==='pais'||f==='empresa'||f==='asignado')renderDrHead();
        if(f==='asignado')loadExtra(id);
        updateRemInfo();
      }
      renderAll();
    }).catch(function(err){fail(err);var l=lead(id);if(l&&openId===id){renderDrData();renderDrRem();renderDrHead()}});
  }
});
document.addEventListener('submit',function(e){
  e.preventDefault();
  var f=e.target,kind=f.dataset.form;if(!kind)return;
  var fd=new FormData(f),g=function(k){return String(fd.get(k)||'').trim()};
  var btn=f.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
  var done=function(){if(btn)btn.disabled=false};
  if(kind==='new'){
    api('POST','/leads',{nombre:g('nombre'),tel:g('tel'),email:g('email'),canal:g('canal'),tipo:g('tipo')||'cr',cedula:g('cedula'),provincia:g('provincia'),pais:g('pais'),pasaporte:g('pasaporte'),empresa:g('empresa'),interes:g('interes'),llegada:g('llegada'),avisoDias:g('avisoDias')})
      .then(function(r){
        if(!g('productoId'))return r;
        return api('POST','/leads/'+r.lead.id+'/productos',{productoId:g('productoId'),cantidad:g('cantidad')||1}).then(function(r2){return r2}).catch(function(){return r});
      }).then(function(r){put(r.lead);closeOv('modalOv');renderAll();openLead(r.lead.id);toast('Lead guardado')}).catch(fail).then(done);
  }
  if(kind==='att'){
    var id=openId;
    api('POST','/leads/'+id+'/atenciones',{fecha:g('fecha'),canal:g('canal'),nota:g('nota')}).then(function(r){
      var moved=lead(id)&&esInicial(lead(id))&&!esInicial(r.lead);
      put(r.lead);f.reset();$('#attFecha').value=today();
      if(openId===id){renderDrHead();renderDrAtt()}
      renderAll();loadExtra(id);toast(moved?'Atención registrada. El lead pasó a '+etapaLabel(r.lead.etapa)+'.':'Atención registrada');
    }).catch(fail).then(done);
  }
  if(kind==='task-lead'){
    postTarea({leadId:openId,titulo:g('titulo'),fecha:g('fecha'),hora:g('hora')}).then(function(r){
      S.tasks.push(r.tarea);f.reset();$('#tkFecha').value=addDays(today(),1);refresh();toast('Tarea agregada al calendario');
    }).catch(fail).then(done);
  }
  if(kind==='task-cal'){
    postTarea({leadId:g('leadId'),titulo:g('titulo'),fecha:g('fecha'),hora:g('hora')}).then(function(r){
      S.tasks.push(r.tarea);C.sel=r.tarea.fecha;var d=parse(C.sel);C.y=d.getFullYear();C.m=d.getMonth();refresh();toast('Tarea agregada');
    }).catch(fail).then(done);
  }
  if(kind==='reply'){
    var tg=f.dataset.target==='ib'?'ib':'dr',lid=chatLead(tg),texto=g('texto');
    api('POST','/leads/'+lid+'/mensajes',{texto:texto}).then(function(){
      f.reset();var bx=$('#'+CH[tg].box);if(bx)bx.dataset.sig='';
      return Promise.all([loadChat(tg),api('GET','/state').then(function(st){applyState(st);if(view==='conversaciones')renderInboxList()})]);
    }).then(function(){toast('Mensaje enviado')}).catch(fail).then(done);
  }
  if(kind==='tag'){
    var lt2=lead(openId),tv=g('tag');
    if(!lt2||!tv){done();return}
    var ets=(lt2.etiquetas||[]).slice();if(ets.map(function(x){return x.toLowerCase()}).indexOf(tv.toLowerCase())<0)ets.push(tv);
    api('PATCH','/leads/'+openId,{etiquetas:ets}).then(function(r){put(r.lead);renderDrTags();renderAll();$('#tagIn').focus()}).catch(fail).then(done);
  }
  if(kind==='nota'){
    var nid=openId;
    api('POST','/leads/'+nid+'/notas',{texto:g('texto')}).then(function(){f.reset();return loadExtra(nid)}).then(function(){toast('Nota guardada')}).catch(fail).then(done);
  }
  if(kind==='prod'){
    var pid=openId,body2={productoId:g('productoId'),cantidad:g('cantidad'),nombre:g('nombre'),moneda:g('moneda')};
    if(g('precio')!=='')body2.precio=g('precio');
    api('POST','/leads/'+pid+'/productos',body2).then(function(r){put(r.lead);renderDrHead();renderAll();return loadExtra(pid)}).then(function(){toast('Producto agregado')}).catch(fail).then(done);
  }
  if(kind==='motivo'){
    var mid=f.dataset.id,body3={motivoId:g('motivoId'),motivoNota:g('nota')};
    if(!f.dataset.fix)body3.etapa=f.dataset.etapa;
    api('PATCH','/leads/'+mid,body3).then(function(r){put(r.lead);closeOv('modalOv');if(openId===mid){renderDrHead();loadExtra(mid)}renderAll();toast(f.dataset.fix?'Motivo guardado':r.lead.nombre+' pasó a '+etapaLabel(r.lead.etapa))}).catch(fail).then(done);
  }
  if(window.adminSubmit&&window.adminSubmit(f,kind,fd,g,done))return;
});
document.addEventListener('dragstart',function(e){
  var c=e.target.closest&&e.target.closest('.kc');
  if(c&&e.dataTransfer){e.dataTransfer.setData('text/plain',c.dataset.id);e.dataTransfer.effectAllowed='move'}
});
document.addEventListener('dragover',function(e){
  var col=e.target.closest&&e.target.closest('.col');
  if(col){e.preventDefault();col.classList.add('over')}
  var dz=e.target.closest&&e.target.closest('#dropZone');
  if(dz){e.preventDefault();dz.classList.add('over')}
});
document.addEventListener('dragleave',function(e){
  var col=e.target.closest&&e.target.closest('.col');if(col)col.classList.remove('over');
  var dz=e.target.closest&&e.target.closest('#dropZone');if(dz)dz.classList.remove('over');
});
document.addEventListener('drop',function(e){
  var col=e.target.closest&&e.target.closest('.col');
  if(col){
    e.preventDefault();col.classList.remove('over');
    var id=e.dataTransfer.getData('text/plain'),l=lead(id);
    if(l&&l.etapa!==col.dataset.stage)moveEtapa(id,col.dataset.stage);
    return;
  }
  var dz=e.target.closest&&e.target.closest('#dropZone');
  if(dz){e.preventDefault();dz.classList.remove('over');addFiles(e.dataTransfer.files)}
});
window.addEventListener('hashchange',function(){setView(location.hash.slice(1))});

/* ---------- Carga y actualización automática ---------- */
function applyState(st,quiet){
  var known={};S.leads.forEach(function(l){known[l.id]=1});
  var nuevos=loaded&&quiet?st.leads.filter(function(l){return !known[l.id]&&l.auto}):[];
  var s=JSON.stringify([st.leads,st.tasks,st.settings,st.chatwoot,st.whatsapp,st.meta,st.web,st.etapas,st.motivos,st.productos,st.categorias,st.me,st.usuarios,st.licencia]);
  var changed=s!==sig;
  sig=s;
  S=st;ETAPAS=st.etapas||[];
  applyBrand();fillFilters();renderLic();
  ajustarPestanaChat();
  var first=!loaded;loaded=true;
  if(nuevos.length){
    toast(nuevos.length===1?'Lead nuevo desde '+canalLabel(nuevos[0].canal)+': '+nuevos[0].nombre:pl(nuevos.length,'lead nuevo','leads nuevos')+' desde tus canales');
  }
  if(first||changed){
    var typing=view==='calendario'&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#calDay');
    if(first)setView(location.hash.slice(1)||'panel');
    else if(!typing&&view!=='admin')renderAll();
    else updateBadge();
    if(openId&&lead(openId)){
      var ae=document.activeElement;
      if(!(ae&&ae.closest&&ae.closest('#drHead')))renderDrHead();
      renderDrAtt();renderDrTasks();updateRemInfo();loadExtra(openId);
    }
  }
}
function fillFilters(){
  var e=$('#fetapa'),a=$('#fasig'),c=$('#fcanal');
  var ve=e.value,va=a.value,vc=c.value;
  c.innerHTML='<option value="">Todos los canales</option>'+optHtml(CANALES,'');c.value=vc;
  e.innerHTML='<option value="">Todas las etapas</option>'+optHtml(etapaOpts(),'');e.value=ETAPAS.some(function(x){return x.clave===ve})?ve:'';F.etapa=e.value;
  a.innerHTML='<option value="">Todos los asignados</option><option value="_none">Sin asignar</option>'+optHtml(S.usuarios.map(function(u){return [u.id,u.nombre]}),'');a.value=va;F.asig=a.value;
}
function renderLic(){
  var L=S.licencia||{},b=$('#licBar'),txt='',mal=false,adm=S.me.rol==='admin';
  if(L.estado==='prueba')txt='Prueba gratuita: te quedan '+pl(L.diasRestantes,'día','días')+'.';
  else if(L.estado==='prueba_vencida'||L.estado==='vencida'||L.estado==='invalida'){txt=L.mensaje||'La licencia no está activa. El sistema está en solo lectura.';mal=true}
  else if(L.estado==='valida'&&L.diasRestantes!=null&&L.diasRestantes<=15)txt='Tu licencia vence en '+pl(L.diasRestantes,'día','días')+'.';
  b.hidden=!txt;b.className='lic'+(mal?' mal':'');
  b.innerHTML=esc(txt)+(txt&&adm?' <button type="button" data-action="adm-go" data-sec="licencia">Ingresar licencia</button>':'');
}
function poll(){
  if(document.hidden||!loaded)return;
  api('GET','/state').then(function(st){applyState(st,true);if(view==='conversaciones')renderInboxList()}).catch(function(){});
  if(openId&&lead(openId)&&lead(openId).tieneChat)loadChat('dr');
  if(view==='conversaciones'&&ibId)loadChat('ib');
}
function boot(){
  api('GET','/state').then(function(st){applyState(st,false)}).catch(function(e){
    $('#v-panel').innerHTML='<div class="card"><h2>No se pudo cargar</h2><p class="sub">'+esc(e.message)+'</p><button class="btn" onclick="location.reload()">Reintentar</button></div>';
  });
  setInterval(poll,15000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)poll()});
}
