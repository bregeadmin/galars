/* wk2 · контактный лист под лупой. Кадры лупы — из <img> миниатюр (src, alt/подпись). */
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches, fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
  function edOn(){ return document.documentElement.classList.contains('ed-on'); }
  function pad(n){ return String(n).padStart(2,'0'); }

  document.querySelectorAll('.wk2').forEach(function(sec){
    var track=sec.querySelector('.wk2-track'), strip=sec.querySelector('.wk2-strip'), num=sec.querySelector('.wk2-num'),
        text=sec.querySelector('.wk2-text'), ctr=sec.querySelector('.wk2-ctr'), cur=-1, textT=null, scrollT=null, building=false;

    function tiles(){ return [].filter.call(strip.querySelectorAll('.wk2-th'),function(t){ return !!t.querySelector('img'); }); }
    function capOf(t){ var c=t.querySelector('.wk2-c, .ph-material'); var s=c?c.textContent.trim():''; return s||t.querySelector('img').alt||''; }

    /* собрать/пересобрать кадры лупы из миниатюр (и после замены фото в режиме правки) */
    function build(){
      building=true; var list=tiles(); track.innerHTML='';
      list.forEach(function(t,i){
        var img=t.querySelector('img'), f=document.createElement('figure'), im=new Image();
        im.src=img.getAttribute('src'); im.alt=capOf(t); im.decoding='async'; if(i>1) im.loading='lazy';
        f.appendChild(im); track.appendChild(f);
      });
      var k=Math.max(0,Math.min(list.length-1,cur<0?0:cur)); building=false; cur=-1; sync(k,true); track.scrollTo({left:k*track.clientWidth,behavior:'instant'});
    }

    /* состояние: номер, подпись, счётчик, рамка в контактном листе */
    function sync(k,instant){
      var list=tiles(); if(!list.length) return; k=(k+list.length)%list.length; if(k===cur) return; cur=k;
      list.forEach(function(x,i){ x.classList.toggle('on',i===k); x.setAttribute('aria-current',i===k?'true':'false'); });
      ctr.textContent=pad(k+1)+' / '+pad(list.length);
      /* номер: старый уезжает вверх, новый въезжает снизу — тот же честный сдвиг, что и у кадра */
      var old=num.querySelector('span'), nw=document.createElement('span'); nw.textContent=pad(k+1);
      if(instant||reduce){ num.innerHTML=''; num.appendChild(nw); }
      else { nw.className='in'; num.appendChild(nw); void nw.offsetWidth; nw.className=''; old.className='out'; setTimeout(function(){ old.remove(); },340); }
      clearTimeout(textT);
      if(instant||reduce){ text.textContent=capOf(list[k]); }
      else { text.classList.add('fade'); textT=setTimeout(function(){ text.textContent=capOf(list[k]); text.classList.remove('fade'); },140); }
      /* миниатюра текущего кадра — в поле зрения ленты */
      var t=list[k], L=t.offsetLeft-strip.offsetLeft, R=L+t.offsetWidth;
      if(L<strip.scrollLeft||R>strip.scrollLeft+strip.clientWidth) strip.scrollTo({left:L-24,behavior:(instant||reduce)?'instant':'smooth'});
    }
    function go(k,instant){
      var list=tiles(); if(!list.length) return; k=(k+list.length)%list.length;
      track.scrollTo({left:k*track.clientWidth,behavior:(instant||reduce)?'instant':'smooth'});
      sync(k,instant);
    }
    /* свайп/перетаскивание лупы: индекс — из положения ленты */
    track.addEventListener('scroll',function(){
      if(building) return; clearTimeout(scrollT);
      scrollT=setTimeout(function(){ sync(Math.round(track.scrollLeft/track.clientWidth)); },60);
    },{passive:true});

    strip.addEventListener('click',function(e){
      if(edOn()) return;                                   /* в режиме правки клик = выбор файла */
      var t=e.target.closest('.wk2-th'); if(!t||!t.querySelector('img')) return;
      go(tiles().indexOf(t));
    });
    sec.querySelector('.wk2-prev').addEventListener('click',function(){ go(cur-1); });
    sec.querySelector('.wk2-next').addEventListener('click',function(){ go(cur+1); });
    sec.addEventListener('keydown',function(e){
      if(!e.target.closest('.wk2-track, .wk2-strip, .wk2-nav')) return;
      if(e.key==='ArrowRight'){ e.preventDefault(); go(cur+1); }
      if(e.key==='ArrowLeft'){ e.preventDefault(); go(cur-1); }
      if(e.key==='Home'){ e.preventDefault(); go(0); }
      if(e.key==='End'){ e.preventDefault(); go(tiles().length-1); }
    });

    /* лента миниатюр едет за рукой: положение курсора по ширине → положение ленты (только мышь, только если лента длиннее окна) */
    if(fine && !reduce){
      var raf=0, px=0;
      strip.addEventListener('pointermove',function(e){
        if(e.pointerType!=='mouse'||edOn()) return; px=e.clientX;
        if(!raf) raf=requestAnimationFrame(function(){
          raf=0; var r=strip.getBoundingClientRect(), over=strip.scrollWidth-strip.clientWidth; if(over<=0) return;
          var x=(px-r.left-40)/(r.width-80); x=Math.max(0,Math.min(1,x));
          strip.scrollLeft=x*over;                            /* без сглаживания: рука ведёт, лента идёт за ней в тот же кадр */
        });
      });
    }

    /* режим правки заменил <img> или превратил слот в фото — пересобираем лупу */
    var mo=null;
    new MutationObserver(function(){ clearTimeout(mo); mo=setTimeout(build,80); })
      .observe(strip,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    addEventListener('resize',function(){ if(cur>=0) track.scrollTo({left:cur*track.clientWidth,behavior:'instant'}); });

    build();
  });
})();
