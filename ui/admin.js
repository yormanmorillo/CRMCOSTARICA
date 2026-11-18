
/* ---------- Panel de administración ---------- */
var ADM_SEC=[['negocio','Negocio'],['canales','Canales'],['etapas','Etapas'],['motivos','Motivos de pérdida'],['productos','Productos'],['usuarios','Usuarios'],['archivos','Imágenes'],['perdidos','Leads perdidos'],['licencia','Licencia']];
AD.n=0;AD.arch={origen:'todas',items:[],total:0};AD.pf='';
var TIPOS_ET=[['inicial','Inicial (entran aquí)'],['abierta','En proceso'],['ganada','Ganado'],['perdida','Perdido']];
var admBody=function(h){var b=$('#admBody');if(b)b.innerHTML=h};
var sw=function(id,on,label){return '<label class="sw"><input type="checkbox" data-sw="'+id+'"'+(on?' checked':'')+'><i></i><span>'+label+'</span></label>'};
var li=function(ok,t){return '<li><span class="'+(ok?'ok':'no')+'">'+(ok?'✓':'✗')+'</span> '+t+'</li>'};
var copyRow=function(id,v){return '<div class="copyrow"><input class="in" id="'+id+'" readonly value="'+esc(v)+'"><button class="btn" type="button" data-copy="'+id+'">Copiar</button></div>'};
var recientes=function(r,vacio){return r&&r.length?'<div class="evl">'+r.map(function(e){return '<div><span>'+esc(e.resultado||'')+'</span><small>'+esc(hora(e.creado))+'</small></div>'}).join('')+'</div>':'<p class="muted" style="margin:0">'+vacio+'</p>'};
var colorOpts=function(v){return optHtml(COLS.map(function(c){return [c,COLN[c]]}),v)};
function admSync(){return api('GET','/state').then(function(st){applyState(st,true)})}
function admErr(e){fail(e);admRender()}
function armed(el,txt){if(!el.classList.contains('armed')){el.classList.add('armed');el.dataset.t=el.textContent;el.textContent=txt||'¿Seguro?';setTimeout(function(){if(el.isConnected){el.classList.remove('armed');el.textContent=el.dataset.t}},3500);return false}return true}

function renderAdmin(){
  var v=$('#v-admin');
  if(S.me.rol!=='admin'){v.innerHTML='<div class="card"><h2>Solo para administradores</h2></div>';return}
  if(!$('#admBody')){
    v.innerHTML='<div class="adm"><nav class="adm-nav" aria-label="Secciones de administración">'+ADM_SEC.map(function(x){return '<button data-action="adm-sec" data-sec="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</nav><div class="adm-body" id="admBody"></div></div>';
  }
  admRender();
}
function admRender(){
  $$('.adm-nav button').forEach(function(b){b.setAttribute('aria-current',String(b.dataset.sec===AD.sec))});
  var tk=++AD.n,f=SEC[AD.sec]||SEC.negocio;
  admBody('<p class="muted">Cargando…</p>');
  Promise.resolve(f(function(h){if(tk===AD.n&&view==='admin')admBody(h)},function(){return tk===AD.n&&view==='admin'})).catch(function(e){if(tk===AD.n)admBody('<div class="card"><p class="hint">'+esc(e.message||'Error')+'</p></div>')});
}
var SEC={};
window.renderAdmin=renderAdmin;

SEC.negocio=function(out){
  out('<div class="card"><h2>Tu negocio</h2><p class="sub">Estos datos se usan en toda la aplicación.</p><div class="fg">'+
    '<label class="fl full">Nombre del negocio<input class="in" data-s="negocio" value="'+esc(S.settings.negocio)+'"></label>'+
    '<label class="fl full">Días de aviso por defecto para leads nuevos<input class="in" data-s="avisoDias" type="number" min="0" max="90" value="'+esc(S.settings.avisoDias)+'"></label></div></div>'+
    '<div class="card"><h2>Resumen</h2><dl class="kv"><dt>Leads</dt><dd>'+S.leads.length+'</dd><dt>Etapas</dt><dd>'+S.etapas.length+'</dd><dt>Productos activos</dt><dd>'+S.productos.length+'</dd><dt>Usuarios</dt><dd>'+S.usuarios.length+'</dd></dl></div>');
};

SEC.canales=function(out,ok){
  return Promise.all([api('GET','/whatsapp/estado'),api('GET','/meta/estado'),api('GET','/canales/web'),api('GET','/chatwoot/estado')]).then(function(R){
    if(!ok())return;
    var wa=R[0],mt=R[1],web=R[2],cw=R[3],c=wa.configurado,m=mt.configurado,k=cw.configurado;
    var snip='<form id="contacto">\n  <input name="nombre" placeholder="Nombre" required>\n  <input name="tel" placeholder="Teléfono">\n  <input name="email" type="email" placeholder="Correo">\n  <textarea name="mensaje" placeholder="¿En qué te ayudamos?"></textarea>\n  <button>Enviar</button>\n</form>\n<scr'+'ipt>\ndocument.getElementById("contacto").addEventListener("submit",function(e){\n  e.preventDefault();\n  var d=Object.fromEntries(new FormData(e.target));\n  d.token="'+web.token+'";\n  fetch("'+web.url+'",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)})\n    .then(function(){e.target.reset();alert("¡Gracias! Te contactaremos pronto.")});\n});\n<\/scr'+'ipt>';
    out(
    '<div class="card"><h2>Canales de entrada</h2><p class="sub">Enciende solo los que usas. Las llamadas no tienen conexión: se agregan a mano con “Nuevo lead” y el canal “Llamada”.</p></div>'+
    '<div class="chan"><header><h3>WhatsApp (conexión directa con Meta)</h3>'+sw('whatsappActivo',S.whatsapp.activo,'Activo')+'</header>'+
      '<ul class="chk">'+li(c.token,'Token de acceso (WHATSAPP_TOKEN)')+li(c.phoneId,'Id del número (WHATSAPP_PHONE_ID)')+li(c.secreto,'Clave secreta de la app (META_APP_SECRET)')+li(c.verifyToken,'Clave de verificación (META_VERIFY_TOKEN)')+'</ul>'+
      '<div><button class="btn" type="button" data-action="wa-probar"'+(c.token&&c.phoneId?'':' disabled')+'>Probar la conexión</button> <span id="waProbe" class="muted"></span></div>'+
      '<p class="sub" style="margin:0">En Meta, Webhook de WhatsApp: pega esta dirección y la clave de verificación, y suscribe el campo <b>messages</b>.</p>'+copyRow('waUrl',wa.webhookUrl)+(wa.verifyToken?copyRow('waVer',wa.verifyToken):'')+
      '<p class="sub" style="margin:4px 0 0">Últimos avisos</p>'+recientes(wa.recientes,'Todavía no ha llegado ningún aviso.')+'</div>'+
    '<div class="chan"><header><h3>Instagram y Facebook Messenger</h3>'+sw('metaActivo',S.meta.activo,'Activo')+'</header>'+
      '<ul class="chk">'+li(m.pageToken,'Token de la página (META_PAGE_TOKEN)')+li(m.pageId,'Id de la página (META_PAGE_ID)')+li(m.secreto,'Clave secreta de la app (META_APP_SECRET)')+li(m.verifyToken,'Clave de verificación (META_VERIFY_TOKEN)')+'</ul>'+
      '<p class="sub" style="margin:0">Usa la misma app de Meta que WhatsApp. En el Webhook de <b>Page</b> e <b>Instagram</b> pega la misma dirección y suscribe <b>messages</b>. Los mensajes crean el lead solos y se responden desde Conversaciones.</p>'+copyRow('mtUrl',mt.webhookUrl)+
      '<p class="sub" style="margin:4px 0 0">Últimos avisos</p>'+recientes(mt.recientes,'Todavía no ha llegado ningún aviso.')+'</div>'+
    '<div class="chan"><header><h3>Formulario de tu página web</h3>'+sw('webActivo',web.activo,'Activo')+'</header>'+
      '<p class="sub" style="margin:0">Cada vez que alguien llene el formulario de tu sitio, se crea un lead con el canal “Página web”. Pega este código en tu página (cambia los campos a tu gusto).</p>'+
      '<label class="fl">Dirección de recepción'+copyRow('webUrl',web.url)+'</label><label class="fl">Clave del formulario'+copyRow('webTok',web.token)+'</label>'+
      '<pre class="code" id="webSnip">'+esc(snip)+'</pre><div class="btns"><button class="btn" type="button" data-action="copy-snip">Copiar código</button><button class="btn" type="button" data-action="web-regen">Generar clave nueva</button></div></div>'+
    '<div class="chan"><header><h3>Chatwoot (opcional)</h3>'+sw('chatwootActivo',S.chatwoot.activo,'Activo')+'</header>'+
      '<p class="sub" style="margin:0">Si prefieres atender con Chatwoot, enciende este interruptor y Pulso volverá a recibir sus mensajes. Apagado, Chatwoot se ignora por completo.</p>'+
      (S.chatwoot.activo?'<ul class="chk">'+li(k.cuenta,'Número de cuenta (CHATWOOT_ACCOUNT_ID)')+li(k.token,'Token de acceso (CHATWOOT_API_TOKEN)')+li(k.webhookToken,'Clave del webhook (WEBHOOK_TOKEN)')+'</ul>'+(cw.webhookUrl?copyRow('whUrl',cw.webhookUrl):'<p class="hint">Falta definir WEBHOOK_TOKEN para generar la dirección.</p>')+'<p class="sub" style="margin:4px 0 0">Últimos avisos</p>'+recientes(cw.recientes,'Todavía no ha llegado ningún aviso.'):'')+'</div>');
    window.__snip=snip;
  });
};

SEC.etapas=function(out,ok){
  return api('GET','/etapas').then(function(r){
    if(!ok())return;
    var n=r.etapas.length;
    out('<div class="card"><h2>Etapas del embudo</h2><p class="sub">Cambia nombres, colores y orden. El tipo define el comportamiento: los leads nuevos entran en la etapa <b>inicial</b>; <b>ganado</b> y <b>perdido</b> cierran el lead (al perder se pide el motivo).</p>'+
      r.etapas.map(function(e,i){return '<div class="rowline r-et"><input class="in" data-adm="et" data-k="'+esc(e.clave)+'" data-fld="nombre" value="'+esc(e.nombre)+'" aria-label="Nombre de la etapa"><select class="in" data-adm="et" data-k="'+esc(e.clave)+'" data-fld="color" aria-label="Color">'+colorOpts(e.color)+'</select><select class="in" data-adm="et" data-k="'+esc(e.clave)+'" data-fld="tipo" aria-label="Tipo">'+optHtml(TIPOS_ET,e.tipo)+'</select><div class="btns"><span class="muted" style="align-self:center;font-size:12px">'+pl(e.leads,'lead','leads')+'</span><button class="btn sm" data-action="et-mover" data-k="'+esc(e.clave)+'" data-dir="up" aria-label="Subir"'+(i?'':' disabled')+'>↑</button><button class="btn sm" data-action="et-mover" data-k="'+esc(e.clave)+'" data-dir="down" aria-label="Bajar"'+(i<n-1?'':' disabled')+'>↓</button><button class="btn sm danger" data-action="et-del" data-k="'+esc(e.clave)+'"'+(e.leads?' disabled title="Mueve sus leads a otra etapa primero"':'')+'>Eliminar</button></div></div>'}).join('')+'</div>'+
      '<div class="card"><h2>Agregar etapa</h2><form class="fg" data-form="et-add"><label class="fl">Nombre<input class="in" name="nombre" required maxlength="40" placeholder="Ej: Reserva confirmada"></label><label class="fl">Color<select class="in" name="color">'+colorOpts('accent')+'</select></label><label class="fl full">Tipo<select class="in" name="tipo">'+optHtml(TIPOS_ET,'abierta')+'</select></label><button class="btn primary full" type="submit">Agregar al final</button></form></div>');
  });
};

SEC.motivos=function(out,ok){
  return api('GET','/motivos').then(function(r){
    if(!ok())return;
    var n=r.motivos.length;
    out('<div class="card"><h2>Motivos de pérdida</h2><p class="sub">Se muestran cuando un lead pasa a una etapa de tipo “perdido”. Los que ya se usaron no se pueden borrar, pero sí ocultar.</p>'+
      r.motivos.map(function(m,i){return '<div class="rowline r-mo"><input class="in" data-adm="mo" data-k="'+m.id+'" data-fld="nombre" value="'+esc(m.nombre)+'" aria-label="Motivo"><div class="btns"><span class="muted" style="align-self:center;font-size:12px">'+pl(m.leads,'lead','leads')+'</span><button class="btn sm" data-action="mo-toggle" data-k="'+m.id+'" data-on="'+(m.activo?'1':'')+'">'+(m.activo?'Activo':'Oculto')+'</button><button class="btn sm" data-action="mo-mover" data-k="'+m.id+'" data-dir="up"'+(i?'':' disabled')+' aria-label="Subir">↑</button><button class="btn sm" data-action="mo-mover" data-k="'+m.id+'" data-dir="down"'+(i<n-1?'':' disabled')+' aria-label="Bajar">↓</button><button class="btn sm danger" data-action="mo-del" data-k="'+m.id+'"'+(m.leads?' disabled title="Ya se usó en leads"':'')+'>Eliminar</button></div></div>'}).join('')+'</div>'+
      '<div class="card"><h2>Agregar motivo</h2><form class="fg" data-form="mo-add"><label class="fl full">Motivo<input class="in" name="nombre" required maxlength="80" placeholder="Ej: No tenía presupuesto"></label><button class="btn primary full" type="submit">Agregar</button></form></div>');
  });
};

SEC.productos=function(out,ok){
  return api('GET','/productos').then(function(r){
    if(!ok())return;
    out('<div class="card"><h2>Catálogo de productos</h2><p class="sub">Lo que vendes. Se agregan a cada lead desde su ficha; el lead guarda el precio con que se agregó.</p>'+
      (r.productos.length?r.productos.map(function(p){return '<div class="rowline r-pr"><input class="in" data-adm="pr" data-k="'+p.id+'" data-fld="nombre" value="'+esc(p.nombre)+'" aria-label="Nombre"><input class="in" type="number" min="0" step="any" data-adm="pr" data-k="'+p.id+'" data-fld="precio" value="'+p.precio+'" aria-label="Precio"><select class="in" data-adm="pr" data-k="'+p.id+'" data-fld="moneda" aria-label="Moneda"><option value="CRC"'+(p.moneda==='CRC'?' selected':'')+'>₡</option><option value="USD"'+(p.moneda==='USD'?' selected':'')+'>$</option></select><div class="btns"><button class="btn sm" data-action="pr-toggle" data-k="'+p.id+'" data-on="'+(p.activo?'1':'')+'">'+(p.activo?'Activo':'Oculto')+'</button><button class="btn sm danger" data-action="pr-del" data-k="'+p.id+'">Eliminar</button></div></div>'}).join(''):'<p class="muted">Todavía no hay productos. Agrega el primero abajo.</p>')+'</div>'+
      '<div class="card"><h2>Agregar producto</h2><form class="fg" data-form="pr-add"><label class="fl full">Nombre<input class="in" name="nombre" required maxlength="120" placeholder="Ej: Paquete 3 noches"></label><label class="fl full">Descripción (opcional)<input class="in" name="descripcion" maxlength="300"></label><label class="fl">Precio<input class="in" name="precio" type="number" min="0" step="any" value="0"></label><label class="fl">Moneda<select class="in" name="moneda"><option value="CRC">Colones (₡)</option><option value="USD">Dólares ($)</option></select></label><button class="btn primary full" type="submit">Agregar producto</button></form></div>');
  });
};

SEC.usuarios=function(out,ok){
  return Promise.all([api('GET','/usuarios'),api('GET','/licencia')]).then(function(R){
    if(!ok())return;
    var us=R[0].usuarios,L=R[1].licencia,lim=L.usuarios||0;
    out('<div class="card"><h2>Usuarios</h2><p class="sub">'+us.length+(lim?' de '+lim+' permitidos por tu licencia':' usuarios (sin límite)')+'.</p>'+
      us.map(function(u){return '<div class="rowline r-us"><input class="in" data-adm="us" data-k="'+u.id+'" data-fld="nombre" value="'+esc(u.nombre)+'" aria-label="Nombre"><span class="muted" style="overflow:hidden;text-overflow:ellipsis">'+esc(u.email)+'</span><select class="in" data-adm="us" data-k="'+u.id+'" data-fld="rol" aria-label="Rol"><option value="vendedor"'+(u.rol==='vendedor'?' selected':'')+'>Vendedor</option><option value="admin"'+(u.rol==='admin'?' selected':'')+'>Administrador</option></select>'+(u.id===S.me.id?'<span class="muted" style="font-size:12px">Tú</span>':'<button class="btn sm danger" data-action="us-del" data-k="'+u.id+'">Eliminar</button>')+'</div>'+
        '<details style="padding:0 0 8px"><summary class="muted" style="cursor:pointer;font-size:12px">Cambiar contraseña de '+esc(u.nombre)+'</summary><form class="copyrow" data-form="us-pass" data-k="'+u.id+'" style="margin-top:6px"><input class="in" name="password" type="password" minlength="8" required placeholder="Nueva contraseña (mínimo 8)" autocomplete="new-password"><button class="btn" type="submit">Cambiar</button></form></details>'}).join('')+'</div>'+
      '<div class="card"><h2>Agregar usuario</h2><form class="fg" data-form="user"><label class="fl">Nombre<input class="in" name="nombre" required></label><label class="fl">Correo<input class="in" name="email" type="email" required></label><label class="fl">Contraseña (mínimo 8)<input class="in" name="password" type="password" minlength="8" required autocomplete="new-password"></label><label class="fl">Rol<select class="in" name="rol"><option value="vendedor">Vendedor</option><option value="admin">Administrador</option></select></label><button class="btn primary full" type="submit">Agregar usuario</button></form></div>');
  });
};

function archCard(a){
  return '<div class="g"><button class="th" data-action="ar-ver" data-url="'+esc(a.url)+'" data-n="'+esc(a.nombre||'Imagen')+'" aria-label="Ver imagen"><img loading="lazy" src="'+esc(a.url)+'" alt="'+esc(a.nombre||'Imagen')+'"></button><div class="cap"><b>'+esc(a.lead_nombre||'Lead')+'</b><small class="muted">'+(a.origen==='chat'?'Del chat':'Adjunta')+' · '+esc(hora(a.creado))+'</small><div class="btns" style="margin-top:6px"><button class="btn sm" data-open="'+esc(a.lead_id)+'">Ver lead</button><button class="btn sm danger" data-action="ar-del" data-id="'+esc(a.id)+'" data-o="'+a.origen+'">Borrar</button></div></div></div>';
}
SEC.archivos=function(out,ok){
  AD.arch.items=[];
  return api('GET','/admin/archivos?origen='+AD.arch.origen+'&limit=48&offset=0').then(function(r){
    if(!ok())return;
    AD.arch.items=r.items;AD.arch.total=r.total;
    out(archHtml());
  });
};
function archHtml(){
  var A=AD.arch;
  return '<div class="card"><h2>Imágenes cargadas <span class="muted" style="font-size:13px;font-weight:500">'+A.total+'</span></h2><p class="sub">Fotos que subiste a los leads y las que los clientes enviaron por chat.</p>'+
    '<label class="fl" style="max-width:260px;margin-bottom:12px">Mostrar<select class="in" data-adm="arch-f"><option value="todas"'+(A.origen==='todas'?' selected':'')+'>Todas</option><option value="lead"'+(A.origen==='lead'?' selected':'')+'>Adjuntas a leads</option><option value="chat"'+(A.origen==='chat'?' selected':'')+'>Recibidas por chat</option></select></label>'+
    (A.items.length?'<div class="gal" id="gal">'+A.items.map(archCard).join('')+'</div>'+(A.items.length<A.total?'<p style="text-align:center;margin:14px 0 0"><button class="btn" data-action="ar-mas">Cargar más</button></p>':''):'<p class="muted">No hay imágenes todavía.</p>')+'</div>';
}

SEC.perdidos=function(out){
  var perd=S.leads.filter(esPerdido).sort(function(a,b){return (a.perdidoEn||'')<(b.perdidoEn||'')?1:-1});
  var by={};perd.forEach(function(l){var k=l.motivo||'Sin motivo';(by[k]=by[k]||[]).push(l)});
  var keys=Object.keys(by).sort(function(a,b){return by[b].length-by[a].length});
  var max=Math.max.apply(null,[1].concat(keys.map(function(k){return by[k].length})));
  var list=perd.filter(function(l){return !AD.pf||(l.motivo||'Sin motivo')===AD.pf});
  out('<div class="card"><h2>Leads perdidos</h2><p class="sub">'+(perd.length?pl(perd.length,'lead no se concretó','leads no se concretaron')+(money(sumValor(perd))?' · valor perdido: '+esc(money(sumValor(perd))):''):'Todavía no hay leads perdidos. Cuando pases uno a “Perdido”, el sistema te pedirá el motivo.')+'</p>'+
    (keys.length?'<div class="bars">'+keys.map(function(k){var v=money(sumValor(by[k]));return '<div class="bar-row"><span>'+esc(k)+'</span><div class="bar"><i style="width:'+(by[k].length/max*100)+'%;background:var(--crit)"></i></div><span class="v">'+by[k].length+(v?' · '+esc(v):'')+'</span></div>'}).join('')+'</div>':'')+'</div>'+
    (perd.length?'<div class="card"><label class="fl" style="max-width:300px;margin-bottom:12px">Filtrar por motivo<select class="in" data-adm="pf"><option value="">Todos</option>'+keys.map(function(k){return '<option'+(k===AD.pf?' selected':'')+'>'+esc(k)+'</option>'}).join('')+'</select></label><div class="tblwrap"><table class="tbl"><thead><tr><th>Lead</th><th>Motivo</th><th>Detalle</th><th>Valor</th><th>Perdido</th><th>Asignado</th></tr></thead><tbody>'+list.map(function(l){return '<tr data-open="'+l.id+'"><td><b>'+esc(l.nombre)+'</b><br><small class="muted">'+esc(canalLabel(l.canal))+'</small></td><td>'+esc(l.motivo||'—')+'</td><td>'+esc(l.motivoNota||'')+'</td><td>'+esc(money(l.valor,'—'))+'</td><td>'+(l.perdidoEn?esc(hora(l.perdidoEn)):'—')+'</td><td>'+esc(l.asignadoNombre||'—')+'</td></tr>'}).join('')+'</tbody></table></div></div>':''));
};

SEC.licencia=function(out,ok){
  return api('GET','/licencia').then(function(r){
    if(!ok())return;
    var L=r.licencia,est={sin_sistema:'Sin control de licencia',valida:'Activa',vencida:'Vencida',invalida:'No válida',prueba:'Prueba gratuita',prueba_vencida:'Prueba terminada'}[L.estado]||L.estado;
    out('<div class="card"><h2>Licencia de uso</h2><dl class="kv"><dt>Estado</dt><dd><span class="pill '+(L.estado==='valida'||L.estado==='prueba'||L.estado==='sin_sistema'?'p-ok':'p-crit')+'">'+esc(est)+'</span></dd>'+
      (L.cliente?'<dt>Licenciado a</dt><dd>'+esc(L.cliente)+'</dd>':'')+(L.vence?'<dt>Vence</dt><dd>'+esc(L.vence)+(L.diasRestantes!=null?' ('+relDays(L.diasRestantes).replace(/^en /,'en ')+')':'')+'</dd>':(L.estado==='valida'?'<dt>Vence</dt><dd>Nunca (licencia permanente)</dd>':''))+
      '<dt>Usuarios</dt><dd>'+r.usuariosActuales+(L.usuarios?' de '+L.usuarios:' (sin límite)')+'</dd></dl><p class="sub" style="margin:12px 0 0">'+esc(L.mensaje||'')+'</p></div>'+
      '<div class="card"><h2>Ingresar licencia</h2><p class="sub">Pega aquí la licencia que te entregó tu proveedor (empieza con PULSO1.). Se activa al instante.</p><form data-form="lic"><textarea class="in" name="licencia" rows="4" required placeholder="PULSO1...." style="font-family:monospace;font-size:12px"></textarea><button class="btn primary" type="submit" style="margin-top:10px">Activar licencia</button></form></div>');
  });
};

/* acciones, cambios y formularios del panel */
window.adminAct=function(a,el,id){
  var k=el.dataset.k;
  switch(a){
    case 'adm-go':AD.sec=el.dataset.sec||'negocio';if(view==='admin')renderAdmin();else location.hash='#admin';break;
    case 'adm-sec':AD.sec=el.dataset.sec;admRender();break;
    case 'wa-probar':{var pr=$('#waProbe');pr.textContent='Probando…';api('POST','/whatsapp/probar').then(function(r){pr.textContent='Conectado: '+(r.numero||'número sin nombre')+(r.nombre?' ('+r.nombre+')':'')}).catch(function(e){pr.textContent=e.message});break}
    case 'copy-snip':copyText(window.__snip||'',el);break;
    case 'web-regen':if(armed(el,'Toca otra vez: la clave anterior dejará de funcionar'))api('POST','/canales/web/token').then(function(){toast('Clave nueva generada');admRender()}).catch(fail);break;
    case 'et-mover':api('POST','/etapas/mover',{clave:k,dir:el.dataset.dir}).then(admSync).then(admRender).catch(admErr);break;
    case 'et-del':if(armed(el,'¿Eliminar?'))api('DELETE','/etapas/'+encodeURIComponent(k)).then(admSync).then(admRender).catch(admErr);break;
    case 'mo-mover':api('PATCH','/motivos/'+k,{dir:el.dataset.dir}).then(admSync).then(admRender).catch(admErr);break;
    case 'mo-toggle':api('PATCH','/motivos/'+k,{activo:!el.dataset.on}).then(admSync).then(admRender).catch(admErr);break;
    case 'mo-del':if(armed(el,'¿Eliminar?'))api('DELETE','/motivos/'+k).then(admSync).then(admRender).catch(admErr);break;
    case 'pr-toggle':api('PATCH','/productos/'+k,{activo:!el.dataset.on}).then(admSync).then(admRender).catch(admErr);break;
    case 'pr-del':if(armed(el,'¿Eliminar?'))api('DELETE','/productos/'+k).then(admSync).then(admRender).catch(admErr);break;
    case 'us-del':if(armed(el,'¿Eliminar?'))api('DELETE','/usuarios/'+k).then(admSync).then(admRender).catch(admErr);break;
    case 'ar-ver':$('#lbImg').src=el.dataset.url;$('#lbImg').alt=el.dataset.n;$('#lbCap').textContent=el.dataset.n;showOv('lbOv');break;
    case 'ar-del':if(armed(el,'¿Borrar?'))api('DELETE',(el.dataset.o==='chat'?'/medios/':'/archivos/')+id).then(function(){AD.arch.items=AD.arch.items.filter(function(x){return x.id!==id});AD.arch.total--;admBody(archHtml());return admSync()}).catch(fail);break;
    case 'ar-mas':api('GET','/admin/archivos?origen='+AD.arch.origen+'&limit=48&offset='+AD.arch.items.length).then(function(r){AD.arch.items=AD.arch.items.concat(r.items);AD.arch.total=r.total;admBody(archHtml())}).catch(fail);break;
  }
};
window.adminChange=function(el){
  var d=el.dataset||{};
  if(d.sw){
    var b={};b[d.sw]=el.checked;
    api('PATCH','/ajustes',b).then(admSync).then(function(){toast(el.checked?'Canal activado':'Canal desactivado');admRender()}).catch(admErr);
    return true;
  }
  if(d.adm==='arch-f'){AD.arch.origen=el.value;admRender();return true}
  if(d.adm==='pf'){AD.pf=el.value;admRender();return true}
  if(d.adm){
    var p={};p[d.fld]=el.value;
    var path={et:'/etapas/'+encodeURIComponent(d.k||''),mo:'/motivos/'+d.k,pr:'/productos/'+d.k,us:'/usuarios/'+d.k}[d.adm];
    api('PATCH',path,p).then(admSync).then(function(){toast('Guardado');if(d.fld!=='nombre'||d.adm==='pr')admRender()}).catch(admErr);
    return true;
  }
  return false;
};
window.adminSubmit=function(f,kind,fd,g,done){
  var run=function(pr,msg){pr.then(admSync).then(function(){f.reset&&f.reset();toast(msg);admRender()}).catch(function(e){fail(e)}).then(done);return true};
  if(kind==='et-add')return run(api('POST','/etapas',{nombre:g('nombre'),color:g('color'),tipo:g('tipo')}),'Etapa agregada');
  if(kind==='mo-add')return run(api('POST','/motivos',{nombre:g('nombre')}),'Motivo agregado');
  if(kind==='pr-add')return run(api('POST','/productos',{nombre:g('nombre'),descripcion:g('descripcion'),precio:g('precio'),moneda:g('moneda')}),'Producto agregado');
  if(kind==='user')return run(api('POST','/usuarios',{nombre:g('nombre'),email:g('email'),password:String(fd.get('password')||''),rol:g('rol')}),'Usuario agregado');
  if(kind==='us-pass')return run(api('PATCH','/usuarios/'+f.dataset.k,{password:String(fd.get('password')||'')}),'Contraseña cambiada');
  if(kind==='lic')return run(api('POST','/licencia',{licencia:g('licencia')}),'Licencia guardada');
  return false;
};
