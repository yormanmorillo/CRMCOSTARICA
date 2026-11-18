export const DEMO_HTML = String.raw`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Simulador de canales · Pulso CRM</title>
<style>
:root{--bg:#eef3f7;--fg:#14232e;--muted:#5d6f7b;--line:#d5dee6;--card:#fff;--accent:#0e7490}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px clamp(14px,3vw,32px)}
h1{margin:0;font-size:20px}header p{margin:2px 0 0;color:var(--muted)}
.btn{border:1px solid var(--line);background:#fff;border-radius:9px;padding:9px 14px;font:inherit;cursor:pointer;text-decoration:none;color:var(--fg);font-weight:600}
.btn.p{background:var(--accent);border-color:var(--accent);color:#fff}
main{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:20px;padding:0 clamp(14px,3vw,32px) 32px;align-items:start}
@media(max-width:900px){main{grid-template-columns:minmax(0,1fr)}}
.tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.tab{flex:1;min-width:90px;border:2px solid var(--line);background:#fff;border-radius:10px;padding:9px 6px;font:inherit;font-weight:700;cursor:pointer}
.tab[aria-pressed=true]{color:#fff;border-color:transparent;background:var(--c)}
.phone{background:#fff;border-radius:22px;border:1px solid var(--line);box-shadow:0 10px 30px rgba(20,35,46,.12);overflow:hidden;display:flex;flex-direction:column;height:560px}
.ph-head{padding:12px 14px;color:#fff;display:flex;align-items:center;gap:10px;font-weight:700;background:var(--c)}
.ph-head i{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.3);display:grid;place-items:center;font-style:normal}
.ph-head small{display:block;font-weight:400;opacity:.85}
.msgs{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--bgc)}
.b{max-width:80%;padding:8px 11px;border-radius:14px;white-space:pre-wrap;word-break:break-word;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.b.me{align-self:flex-end;background:var(--mine);color:var(--minefg)}
.b.eq{align-self:flex-start;background:#fff;color:#14232e}
.b small{display:block;opacity:.65;font-size:11px;margin-top:2px}
.empty{margin:auto;text-align:center;color:var(--muted);padding:20px}
.compose{padding:10px;border-top:1px solid var(--line);display:flex;gap:8px;background:#fff}
.compose textarea{flex:1;border:1px solid var(--line);border-radius:12px;padding:9px 11px;font:inherit;resize:none}
.compose button{border:0;border-radius:12px;padding:0 16px;color:#fff;font-weight:700;background:var(--c);cursor:pointer}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;background:#f7fafc;border-top:1px solid var(--line)}
.meta label{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
.meta input{border:1px solid var(--line);border-radius:8px;padding:7px 9px;font:inherit}
.meta .full{grid-column:1/-1}
.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 4px 14px rgba(20,35,46,.06)}
.panel h2{margin:0 0 4px;font-size:16px}.panel .sub{margin:0 0 12px;color:var(--muted)}
.ev{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--line)}
.ev:first-of-type{border-top:0}
.chip{display:inline-block;border-radius:99px;padding:2px 9px;font-size:12px;font-weight:700;color:#fff;background:var(--c)}
.new{animation:pop .6s}@keyframes pop{from{background:#fff3c4}to{background:transparent}}
.steps{margin:0;padding-left:18px;color:var(--muted)}.steps li{margin:3px 0}
.note{background:#fff8e6;border:1px solid #f3dfa2;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:13px}
.ok{color:#117a42;font-weight:700}.bad{color:#b3261e;font-weight:700}
</style></head><body>
<header><div><h1>Simulador de canales</h1><p>Escribe como si fueras un cliente y mira cómo entra el lead a Pulso, en tiempo real.</p></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn p" href="/#leads" target="_blank" rel="noopener">Abrir Pulso (Leads)</a><a class="btn" href="/#conversaciones" target="_blank" rel="noopener">Conversaciones</a></div></header>
<main>
<section>
  <div class="tabs" id="tabs"></div>
  <div class="phone" id="phone" style="--c:#128c7e">
    <div class="ph-head"><i id="av">C</i><div><span id="pt">Hotel</span><small id="ps">en línea</small></div></div>
    <div class="msgs" id="msgs"></div>
    <div class="meta" id="meta"></div>
    <form class="compose" id="form"><textarea id="txt" rows="2" placeholder="Escribe un mensaje" required></textarea><button type="submit">Enviar</button></form>
  </div>
</section>
<section class="panel">
  <h2>Lo que ve tu equipo en Pulso</h2>
  <p class="sub">Los leads nuevos aparecen solos. Responde desde Pulso (Conversaciones) y la respuesta se verá aquí en el teléfono.</p>
  <div id="feed"></div>
  <div class="note"><b>Cómo mostrarlo:</b>
  <ol class="steps"><li>Deja esta pestaña a un lado y Pulso en otra.</li><li>Elige un canal, escribe como cliente y envía.</li><li>En Pulso aparece el lead con su canal, el mensaje y el avance. Respóndele desde Conversaciones.</li></ol>
  Es una simulación: los números y perfiles son ficticios y no se envía nada a WhatsApp, Instagram ni Facebook. Los canales deben estar activados en Admin → Canales.</div>
  <p id="aviso" style="margin:10px 0 0"></p>
</section>
</main>
<script>
(function(){
var CH={
 whatsapp:{n:'WhatsApp',c:'#128c7e',bg:'#e7ddd3',mine:'#dcf8c6',fg:'#111',who:'Tú (cliente)',sub:'en línea',f:[['nombre','Tu nombre','María Rodríguez'],['tel','Teléfono (empieza con 9)','9111-2233']]},
 instagram:{n:'Instagram',c:'#d6249f',bg:'#fafafa',mine:'#7b3ff2',fg:'#fff',who:'Mensajes directos',sub:'@tu_negocio',f:[['nombre','Tu nombre','Carlos Mora']]},
 facebook:{n:'Facebook',c:'#1877f2',bg:'#fff',mine:'#0084ff',fg:'#fff',who:'Messenger',sub:'Página de tu negocio',f:[['nombre','Tu nombre','Laura Vega']]},
 correo:{n:'Correo',c:'#b8860b',bg:'#fff',mine:'#fff6dd',fg:'#222',who:'Nuevo correo',sub:'Para: info@tunegocio.com',f:[['nombre','Tu nombre','Pedro Solano'],['email','Tu correo','pedro@ejemplo.com'],['asunto','Asunto','Consulta de precios']]}
};
var cur='whatsapp',val={},chat={},conv={};
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
function api(m,u,b){return fetch(u,{method:m,headers:{'content-type':'application/json'},body:b?JSON.stringify(b):undefined,credentials:'same-origin'}).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok)throw new Error(j.error||('Error '+r.status));return j})})}
function tabs(){$('#tabs').innerHTML=Object.keys(CH).map(function(k){return '<button type="button" class="tab" data-k="'+k+'" aria-pressed="'+(k===cur)+'" style="--c:'+CH[k].c+'">'+CH[k].n+'</button>'}).join('')}
function draw(){
  var c=CH[cur],ph=$('#phone');
  ph.style.setProperty('--c',c.c);ph.style.setProperty('--bgc',c.bg);ph.style.setProperty('--mine',c.mine);ph.style.setProperty('--minefg',c.fg);
  $('#pt').textContent=c.who;$('#ps').textContent=c.sub;$('#av').textContent=c.n[0];
  var v=val[cur]=val[cur]||{};
  $('#meta').innerHTML=c.f.map(function(f,i){return '<label class="'+(c.f.length%2&&i===c.f.length-1?'full':'')+'">'+f[1]+'<input data-f="'+f[0]+'" value="'+esc(v[f[0]]==null?f[2]:v[f[0]])+'"></label>'}).join('');
  $('#txt').placeholder=cur==='correo'?'Escribe el correo':'Escribe un mensaje';
  msgs();
}
function msgs(){
  var l=chat[cur]||[];
  $('#msgs').innerHTML=l.length?l.map(function(m){return '<div class="b '+(m.me?'me':'eq')+'">'+esc(m.t)+'<small>'+esc(m.h)+(m.a?' · '+esc(m.a):'')+'</small></div>'}).join(''):'<div class="empty">Escribe el primer mensaje como si fueras un cliente.</div>';
  var e=$('#msgs');e.scrollTop=e.scrollHeight;
}
var hh=function(d){return new Date(d||Date.now()).toLocaleTimeString('es-CR',{hour:'2-digit',minute:'2-digit'})};
document.addEventListener('click',function(e){var t=e.target.closest('.tab');if(t){cur=t.dataset.k;tabs();draw()}});
document.addEventListener('input',function(e){var f=e.target.dataset&&e.target.dataset.f;if(f)(val[cur]=val[cur]||{})[f]=e.target.value});
$('#form').addEventListener('submit',function(e){
  e.preventDefault();var t=$('#txt').value.trim();if(!t)return;
  var v=val[cur]||{},b={canal:cur,texto:t};CH[cur].f.forEach(function(f){b[f[0]]=v[f[0]]==null?f[2]:v[f[0]]});
  $('#aviso').innerHTML='';
  api('POST','/api/demo/mensaje',b).then(function(r){
    (chat[cur]=chat[cur]||[]).push({me:true,t:cur==='correo'&&b.asunto?b.asunto+'\n\n'+t:t,h:hh()});
    $('#txt').value='';msgs();
    var ign=/^ignorado/.test(r.resultado||'');
    $('#aviso').innerHTML=ign?'<span class="bad">No entró: '+esc(r.resultado)+'</span>':'<span class="ok">Entró a Pulso: '+esc(r.resultado)+'</span>';
    if(r.leadChat)conv[cur]=r.leadChat;
    feed();
  }).catch(function(er){$('#aviso').innerHTML='<span class="bad">'+esc(er.message)+'</span>'});
});
$('#txt').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#form').requestSubmit()}});
var seen={};
function feed(){
  api('GET','/api/state').then(function(s){
    var ls=(s.leads||[]).slice(0,8);
    var first=!Object.keys(seen).length;
    $('#feed').innerHTML=ls.length?ls.map(function(l){
      var c=CH[l.canal],nuevo=!first&&!seen[l.id];seen[l.id]=1;
      return '<div class="ev'+(nuevo?' new':'')+'"><span class="chip" style="--c:'+(c?c.c:'#64748b')+'">'+esc(c?c.n:l.canal)+'</span><div><b>'+esc(l.nombre||'Sin nombre')+'</b><div style="color:var(--muted)">'+esc(l.interes||'—')+'</div></div></div>';
    }).join(''):'<p style="color:var(--muted)">Todavía no hay leads.</p>';
  }).catch(function(){});
}
function poll(){
  var c=conv[cur];if(!c)return;
  api('GET','/api/demo/conversacion?canal='+c.canal+'&id='+encodeURIComponent(c.id)).then(function(r){
    var mine=(chat[cur]||[]).filter(function(m){return m.me}),out=(r.mensajes||[]).filter(function(m){return m.direccion==='out'}).map(function(m){return {me:false,t:m.texto,h:hh(m.creado),a:m.autor}});
    var all=[];(r.mensajes||[]).forEach(function(m){all.push({me:m.direccion==='in',t:m.texto,h:hh(m.creado),a:m.direccion==='out'?m.autor:''})});
    if(all.length&&JSON.stringify(all)!==JSON.stringify(chat[cur])){chat[cur]=all;msgs()}
  }).catch(function(){});
}
tabs();draw();feed();setInterval(feed,4000);setInterval(poll,3000);
})();
</script></body></html>`;
