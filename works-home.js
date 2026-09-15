/* wkh · одна лупа на два контактных листа. Кадры лупы — из <img> обеих лент по порядку (01, затем 02). */
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
  function edOn(){ return document.documentElement.classList.contains('ed-on'); }
  function pad(n){ return String(n).padStart(2,'0'); }

  document.querySelectorAll('.wkh').forEach(function(sec){
    var track=sec.querySelector('.wkh-track'), rows=[].slice.call(sec.querySelectorAll('.wkh-row')), cap=sec.querySelector('.wkh-cap'),
        big=sec.querySelector('.wkh-big'), dir=sec.querySelector('.wkh-dir'), text=sec.querySelector('.wkh-text'), ctr=sec.querySelector('.wkh-ctr'),
        cur=-1, capT=null, scrollT=null, mo=null, building=false;

    function tiles(){ return [].filter.call(sec.querySelectorAll('.wkh-th'),function(t){ return !!t.querySelector('img'); }); }
    function rowOf(t){ return t.closest('.wkh-row'); }
    function inRow(t){ var r=rowOf(t), list=[].filter.call(r.querySelectorAll('.wkh-th'),function(x){ return !!x.querySelector('img'); }); return {i:list.indexOf(t),n:list.length,row:r}; }
    function capOf(t){ var c=t.querySelector('.wkh-c, .ph-material'); var s=c?c.textContent.trim():''; return s||t.querySelector('img').alt||''; }

    function build(){
      building=true; var list=tiles(); track.innerHTML='';
      list.forEach(function(t,i){ var im=new Image(); im.src=t.querySelector('img').getAttribute('src'); im.alt=capOf(t); im.decoding='async'; if(i>1) im.loading='lazy';
        var f=document.createElement('figure'); f.appendChild(im); track.appendChild(f); });
      rows.forEach(function(r){ var n=r.querySelectorAll('.wkh-th img').length, k=r.querySelector('.wkh-lab .k'); if(k) k.textContent=n+' фото'; });
      var k=Math.max(0,Math.min(list.length-1,cur<0?0:cur)); building=false; cur=-1; sync(k,true); track.scrollTo({left:k*track.clientWidth,behavior:'instant'});
    }
    function sync(k,instant){
      var list=tiles(); if(!list.length) return; k=(k+list.length)%list.length; if(k===cur) return; cur=k;
      var t=list[k], p=inRow(t);
      list.forEach(function(x,i){ x.classList.toggle('on',i===k); x.setAttribute('aria-current',i===k?'true':'false'); });
      rows.forEach(function(r){ r.classList.toggle('on',r===p.row); });
      ctr.textContent=pad(p.i+1)+' / '+pad(p.n);
      var old=big.querySelector('span'), nw=document.createElement('span'); nw.textContent=pad(p.i+1);
      if(instant||reduce||old.textContent===nw.textContent){ big.innerHTML=''; big.appendChild(nw); }
      else { nw.className='in'; big.appendChild(nw); void nw.offsetWidth; nw.className=''; old.className='out'; setTimeout(function(){ old.remove(); },340); }
      var setText=function(){ dir.innerHTML='<b>'+p.row.dataset.i+'</b>'+p.row.querySelector('h3').textContent; text.textContent=capOf(t); cap.classList.remove('fade'); };
      clearTimeout(capT);
      if(instant||reduce) setText(); else { cap.classList.add('fade'); capT=setTimeout(setText,140); }
      var strip=p.row.querySelector('.wkh-strip'), L=t.offsetLeft-strip.offsetLeft, R=L+t.offsetWidth;
      if(L<strip.scrollLeft||R>strip.scrollLeft+strip.clientWidth) strip.scrollTo({left:L-24,behavior:(instant||reduce)?'instant':'smooth'});
    }
    function go(k,instant){
      var list=tiles(); if(!list.length) return; k=(k+list.length)%list.length;
      track.scrollTo({left:k*track.clientWidth,behavior:(instant||reduce)?'instant':'smooth'}); sync(k,instant);
    }
    track.addEventListener('scroll',function(){ if(building) return; clearTimeout(scrollT); scrollT=setTimeout(function(){ sync(Math.round(track.scrollLeft/track.clientWidth)); },60); },{passive:true});

    sec.addEventListener('click',function(e){
      if(edOn()) return;
      var t=e.target.closest('.wkh-th'); if(!t||!t.querySelector('img')) return; go(tiles().indexOf(t));
    });
    sec.querySelector('.wkh-prev').addEventListener('click',function(){ go(cur-1); });
    sec.querySelector('.wkh-next').addEventListener('click',function(){ go(cur+1); });
    sec.addEventListener('keydown',function(e){
      if(!e.target.closest('.wkh-track, .wkh-strip, .wkh-nav')) return;
      if(e.key==='ArrowRight'){ e.preventDefault(); go(cur+1); }
      if(e.key==='ArrowLeft'){ e.preventDefault(); go(cur-1); }
      if(e.key==='Home'){ e.preventDefault(); go(0); }
      if(e.key==='End'){ e.preventDefault(); go(tiles().length-1); }
    });

    /* ленты едут за рукой */
    if(fine && !reduce){
      sec.querySelectorAll('.wkh-strip').forEach(function(strip){
        var raf=0, px=0;
        strip.addEventListener('pointermove',function(e){
          if(e.pointerType!=='mouse'||edOn()) return; px=e.clientX;
          if(!raf) raf=requestAnimationFrame(function(){ raf=0; var r=strip.getBoundingClientRect(), over=strip.scrollWidth-strip.clientWidth; if(over<=0) return;
            var x=Math.max(0,Math.min(1,(px-r.left-40)/(r.width-80))); strip.scrollLeft=x*over; });
        });
      });
    }

    new MutationObserver(function(){ clearTimeout(mo); mo=setTimeout(build,80); }).observe(sec.querySelector('.wkh-sheets'),{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    addEventListener('resize',function(){ if(cur>=0) track.scrollTo({left:cur*track.clientWidth,behavior:'instant'}); });
    build();
  });
})();
