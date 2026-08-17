// Snippet único de embed entregue à equipe de design: um iframe apontando para
// o formulário hospedado em /f/[embedId] + auto-ajuste de altura via postMessage.
// Qualquer edição do formulário no admin propaga sem re-colar código na landing.

export function buildIframeSnippet(embedId: string, appUrl: string): string {
  const base = (appUrl || '').replace(/\/$/, '')
  const src = `${base}/f/${embedId}`
  let origin = base
  try {
    origin = new URL(base).origin
  } catch {
    // appUrl vazio/inválido em dev: mantém como está
  }
  return `<div id="mm-simulado-${embedId}"></div>
<script>
(function(){
  var c=document.getElementById('mm-simulado-${embedId}');
  var f=document.createElement('iframe');
  f.src='${src}';
  f.title='Cadastro — simulado gratuito';
  f.loading='lazy';
  f.style.cssText='width:100%;max-width:440px;height:560px;border:0;display:block';
  c.appendChild(f);
  window.addEventListener('message',function(e){
    if(e.origin!=='${origin}')return;
    var m=e.data||{};
    if(m.mmEmbedId==='${embedId}'&&m.mmEmbedHeight){f.style.height=m.mmEmbedHeight+'px'}
  });
})();
</script>`
}
