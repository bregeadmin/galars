/* Механика секции «Что делаем»: тон половины, образец, карточка строки, поворот к руке. Всё только в ответ на действие человека. */
(function(){
  /* оптика покрытий: hi/m/lo — тон, sp — блик, hz — горизонт отражения, br — штрих, gr — зерно */
  var M={
    ni:  {hi:'#EBE6DA',m:'#B7B2A7',lo:'#6A665F',sp:.55,hz:.28,br:.05,gr:.10},
    nip: {hi:'#DED9CF',m:'#A8A49B',lo:'#63605A',sp:.40,hz:.16,br:.10,gr:.14},
    cr:  {hi:'#F4F6F8',m:'#B7BCC2',lo:'#454B53',sp:.72,hz:.60,br:0,  gr:.04},
    zn:  {hi:'#D6DCE2',m:'#A3ABB4',lo:'#5E6670',sp:.30,hz:.12,br:.12,gr:.16},
    cd:  {hi:'#D4D4CE',m:'#A4A49E',lo:'#61615E',sp:.26,hz:.10,br:.10,gr:.16},
    ag:  {hi:'#FFFFFF',m:'#E2E2DD',lo:'#9C9C96',sp:.42,hz:.14,br:.07,gr:.12},
    cu:  {hi:'#F3B78C',m:'#C1713F',lo:'#66361B',sp:.52,hz:.22,br:.05,gr:.10},
    sn:  {hi:'#E8E8E6',m:'#C3C4C5',lo:'#787A7C',sp:.34,hz:.10,br:.06,gr:.12},
    an:  {hi:'#E4E6E6',m:'#B9BDBF',lo:'#777C7F',sp:.20,hz:.05,br:.18,gr:.22},
    anh: {hi:'#8B8D87',m:'#5A5D5A',lo:'#2C2F2C',sp:.12,hz:.04,br:.14,gr:.24},
    ep:  {hi:'#F5F5F3',m:'#CBCBC8',lo:'#585856',sp:.62,hz:.46,br:.03,gr:.05},
    ph:  {hi:'#7C7C78',m:'#4F4F4C',lo:'#262624',sp:.08,hz:.03,br:.20,gr:.30},
    ox:  {hi:'#4C525A',m:'#23272C',lo:'#0C0E11',sp:.22,hz:.10,br:.04,gr:.10},
    ti:  {hi:'#C6C8CA',m:'#8C9095',lo:'#494D52',sp:.45,hz:.20,br:.08,gr:.12},
    tin: {hi:'#F8DF8E',m:'#D5A94B',lo:'#74561C',sp:.62,hz:.32,br:.04,gr:.08},
    tio: {hi:'#ECEBE3',m:'#CACCC6',lo:'#8A8FA0',sp:.36,hz:.14,br:.06,gr:.10},
    ss:  {hi:'#EEEFEF',m:'#BABCBE',lo:'#5B5E61',sp:.56,hz:.36,br:.08,gr:.08},
    cuv: {hi:'#F4BA90',m:'#C87746',lo:'#6C3D21',sp:.56,hz:.26,br:.04,gr:.10},
    cu3n:{hi:'#8F8691',m:'#5E5661',lo:'#2E2A31',sp:.20,hz:.08,br:.06,gr:.18},
    cu2o:{hi:'#BA664D',m:'#8A3F2E',lo:'#421E15',sp:.18,hz:.06,br:.06,gr:.20}
  };
  var RM=matchMedia('(prefers-reduced-motion: reduce)');
  function apply(el,o){ el.style.setProperty('--hi',o.hi); el.style.setProperty('--m',o.m); el.style.setProperty('--lo',o.lo);
    el.style.setProperty('--sp',o.sp); el.style.setProperty('--hz',o.hz); el.style.setProperty('--br',o.br); }

  function bind(half,tblId,plId,capId,bigId,stId,unit){
    var tbl=document.getElementById(tblId), pl=document.getElementById(plId), cap=document.getElementById(capId), big=document.getElementById(bigId), st=document.getElementById(stId);
    var bigV=big.querySelector('.v'), bigU=big.querySelector('i');
    var rows=tbl.querySelectorAll('.tr'), z1=pl.querySelector('.z1'), z2=pl.querySelector('.z2'), lvl=pl.querySelector('.lvl');
    var busy=false;
    rows.forEach(function(r){ apply(r.querySelector('.sw'),M[r.dataset.c]); });
    function settle(){
      z2.removeEventListener('transitionend',settle);
      apply(z1,M[z2.dataset.c]); z1.dataset.c=z2.dataset.c;
      z2.classList.add('snap'); z2.classList.remove('up'); void z2.offsetWidth; z2.classList.remove('snap');
      pl.classList.remove('moving'); pl.style.setProperty('--gr',M[z1.dataset.c].gr); busy=false;
    }
    function caption(a,instant){
      cap.textContent=a.dataset.name;
      var sym=a.querySelector('.i').textContent;
      if(unit==='мкм'){ bigV.textContent=a.dataset.th||'—'; bigU.textContent=a.dataset.th?'мкм':'по каталогу'; }
      else { bigV.textContent=sym; bigU.textContent='плёнка'; }
      st.textContent=sym.replace(/^(\d+)$/,'№ $1');
      if(instant||RM.matches) return;
      big.classList.remove('in'); void big.offsetWidth; big.classList.add('in');
    }
    function pick(a,instant){
      if(a.classList.contains('on')) return;
      rows.forEach(function(r){ var on=r===a; r.classList.toggle('on',on); r.setAttribute('aria-pressed',on?'true':'false'); });
      var o=M[a.dataset.c];
      half.style.setProperty('--tone',o.m);          /* тон ванны — на всю половину */
      caption(a,instant);
      if(instant){ apply(z1,o); z1.dataset.c=a.dataset.c; pl.style.setProperty('--gr',o.gr); return; }
      if(busy) settle();
      busy=true; apply(z2,o); z2.dataset.c=a.dataset.c;
      lvl.style.transition='none'; pl.classList.remove('moving'); void lvl.offsetWidth; lvl.style.transition='';
      z2.classList.add('up'); pl.classList.add('moving'); pl.style.setProperty('--gr',(o.gr+parseFloat(getComputedStyle(pl).getPropertyValue('--gr')))/2);
      z2.addEventListener('transitionend',settle);
      if(RM.matches) settle();
    }
    rows.forEach(function(a){
      a.addEventListener('pointerenter',function(e){ if(e.pointerType==='mouse') pick(a); });
      a.addEventListener('focus',function(){ pick(a); });
      a.addEventListener('click',function(){ pick(a); });
    });
    pick(rows[0],true);
  }
  bind(document.getElementById('band-g'),'tbl-g','pl-g','pc-g','big-g','st-g','мкм');
  bind(document.getElementById('band-v'),'tbl-v','pl-v','pc-v','big-v','st-v','');

  /* пластина поворачивается к руке; блик идёт за курсором. Только hover-устройства, только в ответ на движение */
  if(matchMedia('(hover:hover) and (pointer:fine)').matches && !RM.matches){
    document.querySelectorAll('.bench').forEach(function(b){
      var hang=b.querySelector('.hang'), pl=b.querySelector('.pl'), gl=b.querySelector('.gl'), raf=0, ev=null;
      function frame(){
        raf=0; var r=b.getBoundingClientRect(), p=pl.getBoundingClientRect();
        var nx=(ev.clientX-r.left)/r.width-.5, ny=(ev.clientY-r.top)/r.height-.5;
        hang.style.setProperty('--ry',(nx*7).toFixed(2)+'deg');
        hang.style.setProperty('--rx',(-ny*5).toFixed(2)+'deg');
        gl.style.setProperty('--mx',((ev.clientX-p.left)/p.width*100).toFixed(1)+'%');
        gl.style.setProperty('--my',((ev.clientY-p.top)/p.height*100).toFixed(1)+'%');
      }
      b.addEventListener('mousemove',function(e){ ev=e; b.classList.add('live'); if(!raf) raf=requestAnimationFrame(frame); });
      b.addEventListener('mouseleave',function(){ b.classList.remove('live'); hang.style.setProperty('--rx','0deg'); hang.style.setProperty('--ry','0deg'); });
    });
  }
})();
