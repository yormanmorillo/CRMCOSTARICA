/* ---------- Contactos, compartir lead y conexión del calendario ---------- */
var CT={q:'',d:null,t:0};
function renderContactos(){
  var box=$('#v-contactos');
  box.innerHTML='<div class="rp-head"><div><h2 style="font-size:22px">Contactos</h2><p class="sub" style="margin:2px 0 0">Tu libreta de personas. Se llena sola con cada lead y se conserva aunque el lead se elimine.</p></div>'+
    (can('ver_todos')?'<a class="btn" href="/api/contactos.csv" download>Exportar a Excel (CSV)</a>':'')+'</div>'+
    '<div class="toolbar" style="margin-top:12px"><input class="in grow" id="ctQ" type="search" placeholder="Buscar por nombre, teléfono, correo o empresa" value="'+esc(CT.q)+'"></div><div id="ctBody"><p class="sub">Cargando…</p></div>';
  cargarContactos();
}
function cargarContactos(){
  api('GET','/contactos?limit=150&q='+encodeURIComponent(CT.q)).then(function(r){CT.d=r;pintarContactos()}).catch(function(e){var b=$('#ctBody');if(b)b.innerHTML='<p class="sub">'+esc(e.message)+'</p>'});
}
function pintarContactos(){
  var b=$('#ctBody');if(!b||!CT.d)return;var r=CT.d;
  if(!r.contactos.length){b.innerHTML='<div class="card"><p class="empty">'+(CT.q?'Nada coincide con esa búsqueda.':'Todavía no hay contactos. Aparecen solos cuando entra un lead.')+'</p></div>';return}
  b.innerHTML='<div class="card"><p class="sub" style="margin:0 0 6px">'+pl(r.total,'contacto','contactos')+(r.total>r.contactos.length?' (mostrando '+r.contactos.length+')':'')+'</p><div class="tblwrap"><table class="tbl stack"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Empresa</th><th>Leads</th><th>Último movimiento</th></tr></thead><tbody>'+
   r.contactos.map(function(c){return '<tr data-action="ct-open" data-id="'+c.id+'" style="cursor:pointer"><td><b>'+esc(c.nombre||'Sin nombre')+'</b><br>'+(c.canales||[]).map(canalChip).join(' ')+'</td><td data-l="Teléfono">'+esc(c.tel||'—')+'</td><td data-l="Correo">'+esc(c.email||'—')+'</td><td data-l="Empresa">'+esc(c.empresa||'—')+'</td><td data-l="Leads">'+c.leads+(c.abiertos?' ('+c.abiertos+' abiertos)':'')+'</td><td data-l="Último">'+(c.ultimo?esc(hora(c.ultimo)):'—')+'</td></tr>'}).join('')+'</tbody></table></div></div>';
}
function abrirContacto(id){
  api('GET','/contactos/'+id).then(function(r){
    var c=r.contacto;
    $('#modal').innerHTML='<div class="mh"><h2>'+esc(c.nombre||'Contacto')+'</h2><button class="btn sm" type="button" data-action="close-modal">Cerrar</button></div>'+
     '<form data-form="contacto" data-id="'+c.id+'" class="fg">'+
     '<label class="fl">Nombre<input class="in" name="nombre" required maxlength="120" value="'+esc(c.nombre)+'"></label>'+
     '<label class="fl">Teléfono<input class="in" name="tel" maxlength="40" value="'+esc(c.tel)+'"></label>'+
     '<label class="fl">Correo<input class="in" type="email" name="email" maxlength="200" value="'+esc(c.email)+'"></label>'+
     '<label class="fl">Empresa<input class="in" name="empresa" maxlength="120" value="'+esc(c.empresa)+'"></label>'+
     '<label class="fl full">Notas del contacto<textarea class="in" name="notas" rows="3" maxlength="2000" placeholder="Preferencias, datos importantes…">'+esc(c.notas)+'</textarea></label>'+
     '<div class="full"><button class="btn primary" type="submit">Guardar cambios</button></div></form>'+
     '<div><h3 style="font-size:15px;margin:4px 0 8px">Leads de este contacto ('+r.leads.length+')</h3>'+(r.leads.length?r.leads.map(function(l){return '<button type="button" class="lrow" style="grid-template-columns:minmax(0,1fr) auto;border-radius:8px" data-action="ct-lead" data-id="'+l.id+'"><span class="who"><b>'+esc(l.nombre||'Sin nombre')+'</b><small>'+esc(hora(l.creado))+(l.asignado?' · '+esc(l.asignado):'')+'</small></span><span class="st" style="--c:var(--'+esc(l.etapaColor)+')"><i></i>'+esc(l.etapaNombre)+'</span></button>'}).join(''):'<p class="sub">Este contacto ya no tiene leads.</p>')+'</div>'+
     (S.me.rol==='admin'&&!r.leads.length?'<button class="btn danger" type="button" data-action="ct-del" data-id="'+c.id+'">Eliminar contacto</button>':'');
    showOv('modalOv');
  }).catch(fail);
}

/* Compartir un lead por correo */
function abrirCompartir(id){
  var l=lead(id);if(!l)return;
  $('#modal').innerHTML='<div class="mh"><h2>Compartir lead</h2><button class="btn sm" type="button" data-action="close-modal">Cancelar</button></div>'+
   '<form data-form="compartir" data-id="'+id+'"><p class="sub" style="margin:0 0 12px">Se envía por correo un resumen de <b>'+esc(l.nombre)+'</b>: datos, productos y últimas atenciones.</p>'+
   '<label class="fl">Compañero de la empresa<select class="in" name="usuarioId"><option value="">— Elegir —</option>'+S.usuarios.filter(function(u){return u.id!==S.me.id}).map(function(u){return '<option value="'+u.id+'">'+esc(u.nombre)+'</option>'}).join('')+'</select></label>'+
   '<label class="fl" style="margin-top:10px">…o escribe otro correo<input class="in" type="email" name="email" maxlength="200" placeholder="nombre@empresa.com"></label>'+
   '<label class="fl" style="margin-top:10px">Mensaje (opcional)<textarea class="in" name="nota" rows="3" maxlength="1000" placeholder="Ej: Este cliente pidió que lo llamen mañana."></textarea></label>'+
   '<button class="btn primary" type="submit" style="margin-top:12px;width:100%">Enviar por correo</button></form>';
  showOv('modalOv');
}

/* Conectar el calendario con Google, Outlook o Apple */
function abrirCalConectar(){
  $('#modal').innerHTML='<div class="mh"><h2>Conectar mi calendario</h2><button class="btn sm" type="button" data-action="close-modal">Cerrar</button></div><p class="sub">Cargando…</p>';
  showOv('modalOv');
  api('GET','/calendario/enlace').then(function(r){
    window.__calUrl=r.url;
    $('#modal').innerHTML='<div class="mh"><h2>Conectar mi calendario</h2><button class="btn sm" type="button" data-action="close-modal">Cerrar</button></div>'+
     '<div><h3 style="font-size:15px;margin:0 0 6px">1. Suscribirte (se actualiza solo)</h3><p class="sub" style="margin:0 0 8px">Copia este enlace privado y agrégalo a tu calendario. Tus tareas y llegadas aparecerán allí.</p>'+
     '<div class="copyrow"><input class="in" id="calUrl" readonly value="'+esc(r.url)+'"><button class="btn" type="button" data-action="cal-copy">Copiar</button></div>'+
     '<ul class="pasos" style="margin-top:10px;font-size:13px"><li><b>Google Calendar:</b> “Otros calendarios” → <b>+</b> → <b>Desde URL</b> → pega el enlace.</li><li><b>Outlook:</b> Agregar calendario → <b>Suscribirse desde la web</b> → pega el enlace.</li><li><b>Apple (iPhone/Mac):</b> Calendario → Archivo → <b>Nueva suscripción</b> → pega el enlace.</li></ul>'+
     '<p class="sub" style="margin:8px 0 0">Es de solo lectura: lo que crees en el CRM aparece en tu calendario. Google puede tardar unas horas en refrescarlo. <b>No compartas este enlace</b>; si se filtra, genera uno nuevo.</p>'+
     '<p style="margin:8px 0 0"><button class="btn sm danger" type="button" data-action="cal-regen">Generar enlace nuevo</button></p></div>'+
     '<div><h3 style="font-size:15px;margin:0 0 6px">2. Descargar el archivo</h3><p style="margin:0"><a class="btn" href="/api/calendario.ics" download="calendario.ics">Descargar .ics</a></p></div>'+
     '<form data-form="cal-enviar"><h3 style="font-size:15px;margin:0 0 6px">3. Enviarlo por correo</h3><div class="copyrow"><input class="in" type="email" name="para" required placeholder="correo@ejemplo.com"><button class="btn primary" type="submit">Enviar</button></div></form>';
  }).catch(fail);
}
