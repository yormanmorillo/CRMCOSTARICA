/* ---------- Ayuda (tickets de soporte) ---------- */
var AY={d:null};
var AY_EST={abierto:['Abierto','p-warn'],en_curso:['En curso','p-neutral'],resuelto:['Resuelto','p-ok']};
var AY_PRI={baja:'Baja',media:'Media',alta:'Alta',urgente:'Urgente'};
function renderAyuda(){
  var box=$('#v-ayuda');
  box.innerHTML='<div class="card"><h2>Ayuda</h2><p class="sub">¿Algo no funciona o tienes una duda? Cuéntanos y le llegará al equipo de soporte por correo.</p></div><div id="ayBody"><p class="sub" style="padding:12px">Cargando…</p></div>';
  api('GET','/tickets').then(function(r){AY.d=r;pintarAyuda()}).catch(function(e){$('#ayBody').innerHTML='<p class="sub">'+esc(e.message)+'</p>'});
}
function pintarAyuda(){
  var r=AY.d,adm=S.me.rol==='admin';
  var form='<div class="card"><h3>Nuevo ticket</h3>'+(r.soporte?'':'<p class="sub" style="color:var(--warn)">Todavía no hay un correo de soporte configurado'+(adm?' (Admin, Negocio).':'; avísale al administrador.')+' El ticket se guarda igual y se puede reenviar después.</p>')+
   '<form data-form="ticket"><label class="fl">¿Qué pasó? (título corto)<input class="in" name="asunto" required maxlength="150" placeholder="Ej: No me carga el calendario"></label>'+
   '<div class="row2"><label class="fl">¿Dónde pasó?<select class="in" name="modulo">'+r.modulos.map(function(m){return '<option>'+esc(m)+'</option>'}).join('')+'</select></label>'+
   '<label class="fl">¿Qué tan urgente es?<select class="in" name="prioridad"><option value="baja">Baja: una duda</option><option value="media" selected>Media: molesta pero puedo trabajar</option><option value="alta">Alta: no puedo hacer mi trabajo</option><option value="urgente">Urgente: se cayó todo</option></select></label></div>'+
   '<label class="fl">Cuéntanos los pasos y qué esperabas<textarea class="in" name="descripcion" rows="4" placeholder="1) Entré a… 2) Toqué… 3) Salió este mensaje…"></textarea></label>'+
   '<button class="btn primary" type="submit">Enviar ticket</button></form></div>';
  var lista='<div class="card"><h3>'+(adm?'Todos los tickets':'Mis tickets')+'</h3>'+(r.tickets.length?r.tickets.map(function(t){
    var e=AY_EST[t.estado]||[t.estado,'p-neutral'];
    return '<div class="tk"><div class="tk-h"><b>#'+t.numero+' · '+esc(t.asunto)+'</b><span class="pill '+e[1]+'">'+e[0]+'</span></div>'+
      '<div class="sub">'+esc(t.modulo||'')+' · '+esc(AY_PRI[t.prioridad]||t.prioridad)+(adm?' · '+esc(t.usuario):'')+' · '+esc(hora(t.creado))+'</div>'+
      (t.descripcion?'<p class="tk-d">'+esc(t.descripcion)+'</p>':'')+
      '<div class="tk-f">'+(t.enviado?'<span class="sub">✓ Enviado al correo de soporte</span>':'<span class="sub" style="color:var(--crit)">No se pudo enviar'+(t.error?': '+esc(t.error):'')+'</span> <button class="btn" type="button" data-action="tk-reenviar" data-id="'+t.id+'">Reintentar envío</button>')+
      (adm?' <select class="in tk-sel" data-tk="'+t.id+'" aria-label="Estado del ticket"><option value="abierto"'+(t.estado==='abierto'?' selected':'')+'>Abierto</option><option value="en_curso"'+(t.estado==='en_curso'?' selected':'')+'>En curso</option><option value="resuelto"'+(t.estado==='resuelto'?' selected':'')+'>Resuelto</option></select>':'')+'</div></div>'
  }).join(''):'<p class="sub">Aún no hay tickets. Si algo falla, crea uno arriba.</p>')+'</div>';
  var guia='<div class="card"><h3>Guía rápida: ¿cómo entra un lead?</h3><ul class="pasos" style="list-style:none;padding:0"><li>💬 <b>WhatsApp, Instagram y Facebook:</b> entran solos cuando el cliente te escribe. Los verás en <b>Conversaciones</b>.</li><li>✉️ <b>Correo:</b> los correos de clientes que llegan al buzón conectado crean el lead solos.</li><li>🌐 <b>Página web:</b> cada formulario enviado crea un lead.</li><li>📞 <b>Llamada o visita:</b> toca <b>+ Nuevo lead</b> arriba a la izquierda, llena el nombre y el canal, y guarda.</li><li>➡️ Luego abre el lead, atiéndelo y arrastra su tarjeta a la siguiente etapa. Programa tu seguimiento en <b>Calendario</b>.</li></ul></div>';
  $('#ayBody').innerHTML=guia+form+lista;
}
window.ayudaAct=function(a,el){
  if(a==='tk-reenviar'){el.disabled=true;api('POST','/tickets/'+el.dataset.id+'/reenviar').then(function(r){toast(r.enviado?'Ticket enviado':(r.aviso||'No se pudo enviar'));renderAyuda()}).catch(fail)}
};
window.ayudaChange=function(el){
  if(!el.dataset.tk)return false;
  api('PATCH','/tickets/'+el.dataset.tk,{estado:el.value}).then(function(){toast('Estado actualizado')}).catch(fail);
  return true;
};
window.ayudaEnviar=function(g,f,done){
  api('POST','/tickets',{asunto:g('asunto'),modulo:g('modulo'),prioridad:g('prioridad'),descripcion:g('descripcion'),pagina:location.hash||view}).then(function(r){
    toast(r.enviado?'Ticket enviado. Gracias por avisar.':'Ticket guardado, pero no se pudo enviar el correo: '+(r.aviso||''));renderAyuda();
  }).catch(fail).then(done);
};
