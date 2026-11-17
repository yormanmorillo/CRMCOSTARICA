(function(){
'use strict';
var ETAPAS=[['nuevo','Nuevo'],['contactado','Contactado'],['cotizado','Cotización enviada'],['negociacion','Negociación'],['ganado','Ganado'],['perdido','Perdido']];
var CANALES=[['whatsapp','WhatsApp'],['web','Página web'],['instagram','Instagram'],['facebook','Facebook'],['otro','Otro']];
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
var etapaLabel=function(c){var x=ETAPAS.filter(function(z){return z[0]===c})[0];return x?x[1]:c};
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
function api(method,path,data){
  var o={method:method,headers:{},credentials:'same-origin'};
  if(data!==undefined){o.headers['content-type']='application/json';o.body=JSON.stringify(data)}
  return fetch('/api'+path,o).catch(function(){throw new Error('No hay conexión con el servidor')}).then(function(r){
    if(r.status===401){location.href='/login';throw new Error('Tu sesión venció. Entra de nuevo.')}
    return r.json().catch(function(){return {}}).then(function(j){
      if(!r.ok)throw new Error(j.error||('Error '+r.status));
      return j;
    });
  });
}
function fail(e){toast(e&&e.message?e.message:'Algo salió mal')}

var S={leads:[],tasks:[],settings:{negocio:'Pulso CRM',avisoDias:5},me:{nombre:'',rol:'vendedor'},chatwoot:{configurado:false}};
var lead=function(id){return S.leads.filter(function(l){return l.id===id})[0]};
function put(l){var i=S.leads.findIndex(function(x){return x.id===l.id});if(i>-1)S.leads[i]=l;else S.leads.unshift(l)}
var activo=function(l){return l.etapa!=='ganado'&&l.etapa!=='perdido'};
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
  return S.leads.filter(function(l){return l.etapa!=='perdido'&&l.llegada&&l.llegada>=t&&!l.avisado&&diff(avisoFecha(l),t)<=win})
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
var etapaChip=function(e){return '<span class="st st-'+esc(e)+'">'+esc(etapaLabel(e))+'</span>'};
var lastAtt=function(l){var f=l.atenciones.map(function(a){return a.fecha}).sort();return f.length?f[f.length-1]:''};
var autoTag=function(l){return l.auto?'<span class="tag" title="Se creó sola cuando el cliente escribió">Automático</span>':''};

/* ---------- Estado de interfaz ---------- */
var view='panel',openId=null,syncing=false,loaded=false,sig='';
var F={q:'',canal:'',tipo:'',etapa:'',vista:'lista'};
var C={y:parse(today()).getFullYear(),m:parse(today()).getMonth(),sel:today()};
var chatSig='';

function toast(msg){var el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){el.hidden=true},3800)}
function lockScroll(){document.body.style.overflow=$$('.ov').some(function(o){return !o.hidden})?'hidden':''}
function showOv(id){$('#'+id).hidden=false;lockScroll()}
function closeOv(id){$('#'+id).hidden=true;if(id==='drawerOv'){openId=null;chatSig='';renderAll()}lockScroll()}
function applyBrand(){
  $('#brandName').textContent=S.settings.negocio||'Pulso CRM';
  document.title=(S.settings.negocio||'Pulso CRM');
  $('#who').textContent=S.me.nombre||'';
}

/* ---------- Panel ---------- */
function itemLead(l,extra){
  return '<div class="item" data-open="'+l.id+'" tabindex="0" role="button"><span class="av">'+esc(ini(l.nombre))+'</span><div class="im"><b>'+esc(l.nombre)+'</b><small>'+esc(leadSub(l))+'</small></div>'+extra+'</div>';
}
function renderPanel(){
  var t=today();
  var act=S.leads.filter(activo);
  var esperando=S.leads.filter(function(l){return l.esperando&&activo(l)}).sort(function(a,b){return a.ultimoMsg.at<b.ultimoMsg.at?-1:1});
  var sin=S.leads.filter(function(l){return l.etapa==='nuevo'&&!l.atenciones.length&&!l.esperando}).sort(function(a,b){return a.creado<b.creado?-1:1});
  var avisos=reminders(7);
  var ahora=avisos.filter(function(l){return diff(avisoFecha(l),t)<=0}).length;
  var tareas=S.tasks.filter(function(k){return !k.hecha&&k.fecha<=t}).sort(function(a,b){return (a.fecha+(a.hora||''))<(b.fecha+(b.hora||''))?-1:1});
  var atras=tareas.filter(function(k){return k.fecha<t}).length;
  var nuevosHoy=S.leads.filter(function(l){return l.creado===t}).length;

  var kpis='<div class="kpis">'+
    '<div class="kpi"><div class="l">Leads activos</div><div class="n">'+act.length+'</div><div class="h">'+nuevosHoy+' entraron hoy</div></div>'+
    '<div class="kpi"><div class="l">Mensajes sin responder</div><div class="n '+(esperando.length?'hot':'')+'">'+esperando.length+'</div><div class="h">Escribieron y nadie contestó</div></div>'+
    '<div class="kpi"><div class="l">Por atender pronto</div><div class="n '+(ahora?'hot':'')+'">'+avisos.length+'</div><div class="h">'+ahora+' para hoy o vencidos</div></div>'+
    '<div class="kpi"><div class="l">Tareas de hoy</div><div class="n '+(atras?'hot':'')+'">'+tareas.length+'</div><div class="h">'+atras+' atrasadas</div></div></div>';

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

  var cnt=function(f){return S.leads.filter(f).length};
  var maxE=Math.max.apply(null,[1].concat(ETAPAS.map(function(e){return cnt(function(l){return l.etapa===e[0]})})));
  var embudo=ETAPAS.map(function(e){var n=cnt(function(l){return l.etapa===e[0]});return '<div class="bar-row"><span>'+e[1]+'</span><div class="bar"><i style="width:'+(n/maxE*100)+'%"></i></div><span class="v">'+n+'</span></div>'}).join('');
  var maxC=Math.max.apply(null,[1].concat(CANALES.map(function(c){return cnt(function(l){return l.canal===c[0]})})));
  var colorCanal={whatsapp:'wa',instagram:'ig',facebook:'fb',web:'web',otro:'web'};
  var canales=CANALES.map(function(c){var n=cnt(function(l){return l.canal===c[0]});return '<div class="bar-row"><span>'+c[1]+'</span><div class="bar"><i style="width:'+(n/maxC*100)+'%;background:var(--'+colorCanal[c[0]]+')"></i></div><span class="v">'+n+'</span></div>'}).join('');
  var nCr=cnt(function(l){return l.tipo==='cr'}),nEx=cnt(function(l){return l.tipo==='ext'}),tot=Math.max(1,nCr+nEx);

  var vacio=S.leads.length?'':'<div class="card" style="margin-bottom:16px"><h2>Todavía no hay leads</h2><p class="sub">Cuando alguien escriba por WhatsApp, Instagram, Facebook o la web, aparecerá aquí solo. También puedes crear uno con el botón “Nuevo lead”.'+(S.chatwoot.configurado?'':' Para recibirlos automáticamente, conecta Chatwoot en Ajustes.')+'</p></div>';

  $('#v-panel').innerHTML=vacio+kpis+
    '<div class="grid2"><div class="stack">'+
      '<div class="card"><h2>Conversaciones por responder</h2><p class="sub">El último mensaje es del cliente.</p>'+esHtml+'</div>'+
      '<div class="card"><h2>Por atender pronto</h2><p class="sub">Clientes cuya fecha de aviso llega en los próximos 7 días.</p>'+avHtml+'</div>'+
      '<div class="card"><h2>Leads sin primera atención</h2><p class="sub">Entraron por algún canal y nadie los ha contactado.</p>'+sinHtml+'</div>'+
    '</div><div class="stack">'+
      '<div class="card"><h2>Tareas de hoy y atrasadas</h2><p class="sub">Marca el círculo cuando termines.</p>'+tkHtml+'</div>'+
      '<div class="card"><h2>Resumen</h2><p class="sub">Etapa de los '+S.leads.length+' leads</p><div class="bars">'+embudo+'</div>'+
        '<p class="sub" style="margin-top:18px">Canal de entrada</p><div class="bars">'+canales+'</div>'+
        '<p class="sub" style="margin-top:18px">Costarricenses y extranjeros</p><div class="split"><i style="width:'+(nCr/tot*100)+'%;background:var(--accent)"></i><i style="width:'+(nEx/tot*100)+'%;background:var(--vio)"></i></div>'+
        '<div class="legend"><span style="--c:var(--accent)">Costarricenses '+nCr+'</span><span style="--c:var(--vio)">Extranjeros '+nEx+'</span></div></div>'+
    '</div></div>';
}
function updateBadge(){
  var due=reminders(7).filter(function(l){return diff(avisoFecha(l),today())<=0}).length+S.leads.filter(function(l){return l.esperando&&activo(l)}).length;
  var b=$('#bdg');b.hidden=!due;b.textContent=due;
}

/* ---------- Leads ---------- */
function filtered(){
  var q=F.q.trim().toLowerCase();
  return S.leads.filter(function(l){
    return (!F.tipo||l.tipo===F.tipo)&&(!F.canal||l.canal===F.canal)&&(!F.etapa||l.etapa===F.etapa)&&
      (!q||[l.nombre,l.tel,l.email,l.pais,l.provincia,l.interes].join(' ').toLowerCase().indexOf(q)>-1);
  }).sort(function(a,b){return a.creado<b.creado?1:a.creado>b.creado?-1:0});
}
function avisoCell(l){
  if(l.etapa==='perdido')return '<span class="muted">—</span>';
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
    box.innerHTML='<div class="list"><div class="lhead"><span></span><span>Lead</span><div class="cells"><span>Canal</span><span>Tipo</span><span>Etapa</span><span>Aviso</span><span>Atención</span></div></div>'+
      list.map(function(l){
        return '<button class="lrow" data-open="'+l.id+'"><span class="av">'+esc(ini(l.nombre))+'</span><span class="who"><b>'+esc(l.nombre)+'</b><small>'+esc(l.tel||l.email||'Sin contacto')+'</small></span><span class="cells"><span>'+canalChip(l.canal)+' '+autoTag(l)+'</span><span>'+tipoTag(l)+'</span><span>'+etapaChip(l.etapa)+'</span><span>'+avisoCell(l)+'</span><span>'+attCell(l)+'</span></span></button>';
      }).join('')+'</div>';
  }else{
    box.innerHTML='<div class="board">'+ETAPAS.map(function(e){
      var items=list.filter(function(l){return l.etapa===e[0]});
      return '<div class="col" data-stage="'+e[0]+'"><h3>'+e[1]+' <span>'+items.length+'</span></h3>'+items.map(function(l){
        return '<div class="kc" draggable="true" data-open="'+l.id+'" data-id="'+l.id+'" tabindex="0" role="button"><b>'+esc(l.nombre)+'</b><div class="r">'+canalChip(l.canal)+tipoTag(l)+'</div><div>'+(l.esperando&&activo(l)?'<span class="pill p-crit">Esperando respuesta</span>':avisoCell(l))+'</div></div>';
      }).join('')+'</div>';
    }).join('')+'</div>';
  }
}

/* ---------- Calendario ---------- */
function eventsByDay(){
  var ev={};
  var add=function(d,o){(ev[d]=ev[d]||[]).push(o)};
  S.tasks.forEach(function(k){var l=k.leadId?lead(k.leadId):null;add(k.fecha,{type:'task',id:k.id,label:(k.hora?k.hora+' ':'')+k.titulo,sub:l?l.nombre:'',leadId:k.leadId,done:k.hecha})});
  S.leads.forEach(function(l){
    if(l.etapa==='perdido'||!l.llegada)return;
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
  var opts='<option value="">Sin lead</option>'+S.leads.filter(function(l){return l.etapa!=='perdido'}).map(function(l){return '<option value="'+l.id+'">'+esc(l.nombre)+'</option>'}).join('');
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
}
function setView(v){
  if(['panel','leads','calendario'].indexOf(v)<0)v='panel';
  view=v;
  ['panel','leads','calendario'].forEach(function(x){$('#v-'+x).hidden=x!==v});
  $$('.tabs button').forEach(function(b){if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  renderAll();
}
function refresh(){
  renderAll();
  if(openId&&lead(openId)){renderDrHead();renderDrAtt();renderDrTasks();updateRemInfo()}
}

/* ---------- Ficha del lead ---------- */
function optHtml(arr,v){return arr.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===v?' selected':'')+'>'+esc(x[1])+'</option>'}).join('')}
function openLead(id){
  var l=lead(id);if(!l)return;
  openId=id;chatSig='';
  var chat=l.tieneChat?
    '<section><h3>Conversación</h3><div class="chat" id="chatBox"><p class="muted" style="margin:0">Cargando mensajes…</p></div>'+
      '<form class="reply" data-form="reply"><textarea class="in" id="replyText" name="texto" rows="2" placeholder="Escribe tu respuesta" aria-label="Respuesta" required></textarea><button class="btn primary" type="submit" id="replyBtn">Enviar</button></form>'+
      '<small id="replyHint" style="display:block;margin-top:6px"></small></section>':'';
  $('#drBody').innerHTML=chat+
    '<section><h3>Datos del lead</h3><div id="drData"></div></section>'+
    '<section><h3>Llegada y recordatorio</h3><div id="drRem"></div></section>'+
    '<section><h3>Atenciones</h3>'+
      '<form class="fg" data-form="att">'+
        '<label class="fl">Día de atención<input class="in" id="attFecha" name="fecha" type="date" required value="'+today()+'"></label>'+
        '<label class="fl">Por dónde<select class="in" id="attCanal" name="canal">'+optHtml(CANALES.concat([['llamada','Llamada'],['presencial','En persona']]),l.canal)+'</select></label>'+
        '<label class="fl full">Qué se habló<textarea class="in" id="attNota" name="nota" rows="2" required placeholder="Ej: Pidió cotización para 4 personas"></textarea></label>'+
        '<button class="btn primary full" type="submit">Registrar atención</button></form>'+
      '<div id="drAtt"></div></section>'+
    '<section><h3>Tareas de este lead</h3>'+
      '<form class="fg" data-form="task-lead">'+
        '<label class="fl full">Tarea<input class="in" id="tkTitulo" name="titulo" required placeholder="Ej: Llamar para confirmar"></label>'+
        '<label class="fl">Fecha<input class="in" id="tkFecha" name="fecha" type="date" required value="'+addDays(today(),1)+'"></label>'+
        '<label class="fl">Hora (opcional)<input class="in" id="tkHora" name="hora" type="time"></label>'+
        '<button class="btn full" type="submit">Agregar al calendario</button></form>'+
      '<div id="drTasks"></div></section>'+
    '<section><h3>Archivos adjuntos</h3>'+
      '<label class="drop" id="dropZone"><input type="file" id="fileIn" accept="image/*" multiple><b style="color:var(--fg)">Agregar imágenes</b><span>Toca para elegir o arrastra las fotos aquí</span></label>'+
      '<div id="drFiles"></div></section>'+
    '<section><button class="btn danger" type="button" data-action="del-lead">Eliminar este lead</button></section>';
  renderDrHead();renderDrData();renderDrRem();renderDrAtt();renderDrTasks();renderDrFiles();
  showOv('drawerOv');
  $('#drBody').scrollTop=0;
  var cb=$('#drHead .btn');if(cb)cb.focus();
  if(l.tieneChat)loadChat(true);
}
function renderDrHead(){
  var l=lead(openId);if(!l)return;
  var w=waHref(l);
  $('#drHead').innerHTML='<div class="dr-top"><span class="av lg">'+esc(ini(l.nombre))+'</span><div class="id"><h2 id="drTitle">'+esc(l.nombre||'Sin nombre')+'</h2><div class="chips">'+canalChip(l.canal)+tipoTag(l)+autoTag(l)+'</div></div><button class="btn sm" data-action="close-drawer">Cerrar</button></div>'+
    '<div class="dr-meta"><label class="fl">Etapa<select class="in" data-f="etapa">'+optHtml(ETAPAS,l.etapa)+'</select></label>'+(w?'<a class="btn" href="'+w+'" target="_blank" rel="noopener">Abrir WhatsApp</a>':'')+'</div>';
}
function renderDrData(){
  var l=lead(openId);if(!l)return;
  var cr=l.tipo==='cr';
  $('#drData').innerHTML='<div class="fg">'+
    '<label class="fl full">Nombre<input class="in" data-f="nombre" value="'+esc(l.nombre)+'"></label>'+
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

/* ---------- Conversación (Chatwoot) ---------- */
function renderChat(msgs,conf){
  var box=$('#chatBox');if(!box)return;
  var s=JSON.stringify(msgs.map(function(m){return m.id}))+conf;
  if(s===chatSig)return;
  chatSig=s;
  var atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60||!box.dataset.init;
  box.innerHTML=msgs.length?msgs.map(function(m){
    var adj=(m.adjuntos||[]).map(function(a){
      if(!/^https?:\/\//.test(a.url))return '';
      return a.type==='image'?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener"><img src="'+esc(a.url)+'" alt="'+esc(a.name||'Imagen')+'" loading="lazy"></a>':'<a href="'+esc(a.url)+'" target="_blank" rel="noopener">'+esc(a.name||'Abrir archivo adjunto')+'</a>';
    }).join('');
    return '<div class="msg '+(m.direccion==='in'?'in':'out')+'">'+(m.texto?esc(m.texto):'')+adj+'<small>'+(m.direccion==='out'&&m.autor?esc(m.autor)+' · ':'')+hora(m.creado)+'</small></div>';
  }).join(''):'<p class="muted" style="margin:0">Todavía no hay mensajes guardados de esta conversación.</p>';
  box.dataset.init='1';
  if(atBottom)box.scrollTop=box.scrollHeight;
  var hint=$('#replyHint'),btn=$('#replyBtn'),ta=$('#replyText');
  if(!conf){
    if(hint)hint.textContent='Para responder desde aquí, conecta Chatwoot en Ajustes. Mientras tanto puedes responder desde Chatwoot.';
    if(btn)btn.disabled=true;if(ta)ta.disabled=true;
  }else if(hint){
    hint.textContent='La respuesta sale por el mismo canal del cliente. En WhatsApp, solo se puede responder dentro de las 24 horas siguientes a su último mensaje.';
    if(btn)btn.disabled=false;if(ta)ta.disabled=false;
  }
}
function loadChat(){
  var id=openId;if(!id)return Promise.resolve();
  return api('GET','/leads/'+id+'/mensajes').then(function(r){if(openId===id)renderChat(r.mensajes,r.configurado)}).catch(function(){
    var box=$('#chatBox');if(box&&!box.dataset.init)box.innerHTML='<p class="muted" style="margin:0">No se pudieron cargar los mensajes.</p>';
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
    '<label class="fl">Canal de entrada<select class="in" id="nCanal" name="canal">'+optHtml(CANALES,'whatsapp')+'</select></label>'+
    '<div class="fl"><span>Tipo de cliente</span><div class="seg wide" role="radiogroup" aria-label="Tipo de cliente"><label class="segopt"><input type="radio" name="tipo" value="cr" checked><span>Costarricense</span></label><label class="segopt"><input type="radio" name="tipo" value="ext"><span>Extranjero</span></label></div></div>'+
    '<label class="fl full">Nombre completo<input class="in" id="nNombre" name="nombre" required autocomplete="off"></label>'+
    '<label class="fl">Teléfono / WhatsApp<input class="in" id="nTel" name="tel" inputmode="tel" placeholder="+506 8888 8888"></label>'+
    '<label class="fl">Correo<input class="in" id="nEmail" name="email" type="email"></label>'+
    '<div class="grp" data-for="cr"><label class="fl">Cédula<input class="in" id="nCedula" name="cedula" placeholder="1-2345-6789"></label><label class="fl">Provincia<select class="in" id="nProv" name="provincia"><option value="">Sin indicar</option>'+PROVINCIAS.map(function(p){return '<option>'+p+'</option>'}).join('')+'</select></label></div>'+
    '<div class="grp" data-for="ext" hidden><label class="fl">País<input class="in" id="nPais" name="pais" list="paisesN"><datalist id="paisesN">'+PAISES.map(function(p){return '<option value="'+p+'">'}).join('')+'</datalist></label><label class="fl">Pasaporte (opcional)<input class="in" id="nPas" name="pasaporte"></label></div>'+
    '<label class="fl full">Qué consulta<textarea class="in" id="nInteres" name="interes" rows="2" placeholder="Ej: Precio y disponibilidad para 4 personas"></textarea></label>'+
    '<label class="fl">Fecha de llegada (si la dice)<input class="in" id="nLlegada" name="llegada" type="date" data-llegada></label>'+
    '<label class="fl">O llega en… (días)<input class="in" id="nDias" type="number" min="0" max="365" data-dias placeholder="Ej: 20"></label>'+
    '<label class="fl full">Avisarle con cuántos días de anticipación<input class="in" id="nAviso" name="avisoDias" type="number" min="0" max="90" value="'+S.settings.avisoDias+'"></label>'+
    '<button class="btn primary full" type="submit">Guardar lead</button></div></form>';
  showOv('modalOv');$('#nNombre').focus();
}
function copyText(text,btn){
  var done=function(){var o=btn.textContent;btn.textContent='Copiado';setTimeout(function(){btn.textContent=o},1500)};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){toast('Selecciona el texto y cópialo a mano')})}
  else toast('Selecciona el texto y cópialo a mano');
}
function openSettings(){
  var admin=S.me.rol==='admin';
  var h='<div class="mh"><h2>Ajustes</h2><button class="btn sm" type="button" data-action="close-modal">Cerrar</button></div>';
  if(!admin){
    h+='<p class="hint">Tu usuario es <b>'+esc(S.me.nombre)+'</b>. Solo el administrador puede cambiar los ajustes y conectar Chatwoot.</p>';
    $('#modal').innerHTML=h;showOv('modalOv');return;
  }
  h+='<div class="fg"><label class="fl full">Nombre del negocio<input class="in" id="sNombre" data-s="negocio" value="'+esc(S.settings.negocio)+'"></label>'+
  '<label class="fl full">Días de aviso por defecto para leads nuevos<input class="in" id="sAviso" data-s="avisoDias" type="number" min="0" max="90" value="'+esc(S.settings.avisoDias)+'"></label></div>'+
  '<div class="sec"><h3>Conexión con Chatwoot</h3><div id="cwBox"><p class="muted" style="margin:0">Revisando…</p></div></div>'+
  '<div class="sec"><h3>Usuarios</h3><div id="usrBox"><p class="muted" style="margin:0">Cargando…</p></div>'+
  '<form class="fg" data-form="user"><label class="fl">Nombre<input class="in" id="uNombre" name="nombre" required></label><label class="fl">Correo<input class="in" id="uEmail" name="email" type="email" required></label>'+
  '<label class="fl">Contraseña (mínimo 8)<input class="in" id="uPass" name="password" type="password" minlength="8" required autocomplete="new-password"></label>'+
  '<label class="fl">Rol<select class="in" id="uRol" name="rol"><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select></label>'+
  '<button class="btn full" type="submit">Agregar usuario</button></form></div>';
  $('#modal').innerHTML=h;showOv('modalOv');
  api('GET','/chatwoot/estado').then(function(r){
    var c=r.configurado,li=function(ok,t){return '<li><span class="'+(ok?'ok':'no')+'">'+(ok?'✓':'✗')+'</span> '+t+'</li>'};
    var box=$('#cwBox');if(!box)return;
    box.innerHTML='<ul class="chk">'+li(c.cuenta,'Número de cuenta (CHATWOOT_ACCOUNT_ID)')+li(c.token,'Token de acceso (CHATWOOT_API_TOKEN)')+li(c.webhookToken,'Clave del webhook (WEBHOOK_TOKEN)')+li(c.firma,'Firma del webhook (opcional, CHATWOOT_WEBHOOK_SECRET)')+'</ul>'+
      '<p class="sub" style="margin:12px 0 6px">Dirección que debes pegar en Chatwoot (Ajustes, Integraciones, Webhooks), con los eventos “Conversación creada” y “Mensaje creado”:</p>'+
      (r.webhookUrl?'<div class="copyrow"><input class="in" id="whUrl" readonly value="'+esc(r.webhookUrl)+'"><button class="btn" type="button" data-copy="whUrl">Copiar</button></div>':'<p class="hint">Falta definir WEBHOOK_TOKEN en Vercel para generar la dirección.</p>')+
      '<p class="sub" style="margin:14px 0 6px">Últimos avisos recibidos</p>'+
      (r.recientes.length?'<div class="evl">'+r.recientes.map(function(e){return '<div><span>'+esc(e.resultado||'')+'</span><small>'+esc(hora(e.creado))+'</small></div>'}).join('')+'</div>':'<p class="muted" style="margin:0">Todavía no ha llegado ningún aviso de Chatwoot.</p>');
  }).catch(function(e){var b=$('#cwBox');if(b)b.innerHTML='<p class="hint">'+esc(e.message)+'</p>'});
  loadUsers();
}
function loadUsers(){
  api('GET','/usuarios').then(function(r){
    var b=$('#usrBox');if(!b)return;
    b.innerHTML='<div class="evl" style="max-height:none">'+r.usuarios.map(function(u){return '<div><span>'+esc(u.nombre)+' · '+esc(u.email)+'</span><small>'+(u.rol==='admin'?'Administrador':'Vendedor')+'</small></div>'}).join('')+'</div>';
  }).catch(function(){});
}

/* ---------- Acciones ---------- */
function act(a,el){
  var id=el.dataset.id;
  switch(a){
    case 'nav':location.hash='#'+el.dataset.view;break;
    case 'new-lead':openNew();break;
    case 'settings':openSettings();break;
    case 'logout':api('POST','/auth/logout').then(function(){location.href='/login'}).catch(function(){location.href='/login'});break;
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
  }
}
document.addEventListener('click',function(e){
  var cp=e.target.closest('[data-copy]');
  if(cp){var inp=document.getElementById(cp.dataset.copy);if(inp){inp.select();copyText(inp.value,cp)}return}
  var a=e.target.closest('[data-action]');
  if(a){act(a.dataset.action,a);return}
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
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&e.target.id==='replyText'){e.preventDefault();$('#replyBtn').click();return}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[data-open][role="button"]')){e.preventDefault();openLead(e.target.dataset.open)}
});
document.addEventListener('input',function(e){
  var el=e.target;
  if(el.id==='fq'){F.q=el.value;renderLeads();return}
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
  if(el.id==='fcanal'){F.canal=el.value;renderLeads();return}
  if(el.id==='fetapa'){F.etapa=el.value;renderLeads();return}
  if(el.id==='fileIn'){addFiles(el.files);el.value='';return}
  if(el.name==='tipo'&&el.closest('#newForm')){
    $$('#newForm [data-for]').forEach(function(g){g.hidden=g.dataset.for!==el.value});return;
  }
  if(el.dataset&&el.dataset.s){
    var body={};body[el.dataset.s==='avisoDias'?'avisoDias':'negocio']=el.value;
    api('PATCH','/ajustes',body).then(function(r){S.settings=r.settings;applyBrand();toast('Ajuste guardado')}).catch(fail);
    return;
  }
  if(el.hasAttribute&&el.hasAttribute('data-llegada')&&!syncing){
    var sc=el.closest('[data-dias-scope]'),di=sc&&sc.querySelector('[data-dias]');if(di)di.value='';
  }
  var f=el.dataset&&el.dataset.f;
  if(f&&openId){
    var id=openId,v=el.value;
    if(f==='avisoDias')v=Math.max(0,parseInt(v,10)||0);
    var patch={};patch[f]=v;
    api('PATCH','/leads/'+id,patch).then(function(r){
      put(r.lead);
      if(openId===id){
        if(f==='tipo')renderDrData();
        if(f==='etapa'||f==='nombre'||f==='canal'||f==='tipo'||f==='pais')renderDrHead();
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
    api('POST','/leads',{nombre:g('nombre'),tel:g('tel'),email:g('email'),canal:g('canal'),tipo:g('tipo')||'cr',cedula:g('cedula'),provincia:g('provincia'),pais:g('pais'),pasaporte:g('pasaporte'),interes:g('interes'),llegada:g('llegada'),avisoDias:g('avisoDias')})
      .then(function(r){put(r.lead);closeOv('modalOv');renderAll();openLead(r.lead.id);toast('Lead guardado')}).catch(fail).then(done);
  }
  if(kind==='att'){
    var id=openId;
    api('POST','/leads/'+id+'/atenciones',{fecha:g('fecha'),canal:g('canal'),nota:g('nota')}).then(function(r){
      var moved=lead(id)&&lead(id).etapa==='nuevo'&&r.lead.etapa!=='nuevo';
      put(r.lead);f.reset();$('#attFecha').value=today();
      if(openId===id){renderDrHead();renderDrAtt()}
      renderAll();toast(moved?'Atención registrada. El lead pasó a Contactado.':'Atención registrada');
    }).catch(fail).then(done);
  }
  if(kind==='task-lead'){
    api('POST','/tareas',{leadId:openId,titulo:g('titulo'),fecha:g('fecha'),hora:g('hora')}).then(function(r){
      S.tasks.push(r.tarea);f.reset();$('#tkFecha').value=addDays(today(),1);refresh();toast('Tarea agregada al calendario');
    }).catch(fail).then(done);
  }
  if(kind==='task-cal'){
    api('POST','/tareas',{leadId:g('leadId'),titulo:g('titulo'),fecha:g('fecha'),hora:g('hora')}).then(function(r){
      S.tasks.push(r.tarea);C.sel=r.tarea.fecha;var d=parse(C.sel);C.y=d.getFullYear();C.m=d.getMonth();refresh();toast('Tarea agregada');
    }).catch(fail).then(done);
  }
  if(kind==='reply'){
    var lid=openId,texto=g('texto');
    api('POST','/leads/'+lid+'/mensajes',{texto:texto}).then(function(){
      f.reset();chatSig='';
      return Promise.all([loadChat(),api('GET','/state').then(applyState)]);
    }).then(function(){toast('Mensaje enviado')}).catch(fail).then(done);
  }
  if(kind==='user'){
    api('POST','/usuarios',{nombre:g('nombre'),email:g('email'),password:String(fd.get('password')||''),rol:g('rol')}).then(function(){f.reset();loadUsers();toast('Usuario agregado')}).catch(fail).then(done);
  }
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
    if(l&&l.etapa!==col.dataset.stage){
      api('PATCH','/leads/'+id,{etapa:col.dataset.stage}).then(function(r){put(r.lead);refresh();toast(r.lead.nombre+' pasó a '+etapaLabel(r.lead.etapa))}).catch(fail);
    }
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
  var s=JSON.stringify([st.leads,st.tasks,st.settings,st.chatwoot]);
  var changed=s!==sig;
  sig=s;
  S=st;
  applyBrand();
  var first=!loaded;loaded=true;
  if(nuevos.length){
    toast(nuevos.length===1?'Lead nuevo desde '+canalLabel(nuevos[0].canal)+': '+nuevos[0].nombre:pl(nuevos.length,'lead nuevo','leads nuevos')+' desde Chatwoot');
  }
  if(first||changed){
    var typing=view==='calendario'&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#calDay');
    if(first)setView(location.hash.slice(1)||'panel');
    else if(!typing)renderAll();
    else updateBadge();
    if(openId&&lead(openId)){
      var ae=document.activeElement;
      if(!(ae&&ae.closest&&ae.closest('#drHead')))renderDrHead();
      renderDrAtt();renderDrTasks();updateRemInfo();
    }
  }
}
function poll(){
  if(document.hidden||!loaded)return;
  api('GET','/state').then(function(st){applyState(st,true)}).catch(function(){});
  if(openId&&lead(openId)&&lead(openId).tieneChat)loadChat();
}
function boot(){
  $('#fcanal').innerHTML='<option value="">Todos los canales</option>'+optHtml(CANALES,'');
  $('#fetapa').innerHTML='<option value="">Todas las etapas</option>'+optHtml(ETAPAS,'');
  api('GET','/state').then(function(st){applyState(st,false)}).catch(function(e){
    $('#v-panel').innerHTML='<div class="card"><h2>No se pudo cargar</h2><p class="sub">'+esc(e.message)+'</p><button class="btn" onclick="location.reload()">Reintentar</button></div>';
  });
  setInterval(poll,15000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)poll()});
}
boot();
})();
