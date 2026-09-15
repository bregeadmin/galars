(function(){
  var f=document.getElementById('film'),pos=document.getElementById('pos'),down=false,sx=0,sl=0,moved=0;
  function upd(){var max=f.scrollWidth-f.clientWidth;var w=Math.max(8,f.clientWidth/f.scrollWidth*100);pos.style.width=w+'%';pos.style.left=(max?f.scrollLeft/max*(100-w):0)+'%';}
  f.addEventListener('scroll',upd,{passive:true});window.addEventListener('resize',upd);upd();
  /* перетаскивание мышью: захват указателя только после сдвига на 6px, чтобы клики (в т.ч. в режиме правки) оставались кликами */
  var armed=false,pid=null;
  f.addEventListener('dragstart',function(e){e.preventDefault();}); // не давать браузеру «таскать» картинку вместо ленты
  f.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse'||document.documentElement.classList.contains('ed-on'))return;armed=true;down=false;moved=0;sx=e.clientX;sl=f.scrollLeft;pid=e.pointerId;});
  f.addEventListener('pointermove',function(e){if(!armed)return;var dx=e.clientX-sx;moved=Math.max(moved,Math.abs(dx));if(!down){if(moved<6)return;down=true;f.classList.add('drag');try{f.setPointerCapture(pid);}catch(x){}}f.scrollLeft=sl-dx;});
  function up(){armed=false;if(!down)return;down=false;f.classList.remove('drag');}
  f.addEventListener('pointerup',up);f.addEventListener('pointercancel',up);f.addEventListener('lostpointercapture',up);
  f.addEventListener('click',function(e){if(moved>6){e.preventDefault();e.stopPropagation();}},true);
  var spools=[].slice.call(f.querySelectorAll('.spool')),dirs=[].slice.call(document.querySelectorAll('.dir'));
  function cur(){var x=f.scrollLeft+f.clientWidth*0.35;var k=0;spools.forEach(function(sp,i){if(sp.offsetLeft-f.offsetLeft<=x)k=i;});dirs.forEach(function(d,i){d.classList.toggle('on',i===k);});}
  f.addEventListener('scroll',cur,{passive:true});cur();
  dirs.forEach(function(d){d.addEventListener('click',function(){var sp=spools[+d.dataset.to];f.scrollTo({left:sp.offsetLeft-f.offsetLeft-parseFloat(getComputedStyle(f).paddingLeft),behavior:'smooth'});});});
  var step=function(){var fr=f.querySelector('.fr');return fr?fr.getBoundingClientRect().width+10:600;};
  document.getElementById('prev').onclick=function(){f.scrollBy({left:-step(),behavior:'smooth'});};
  document.getElementById('next').onclick=function(){f.scrollBy({left:step(),behavior:'smooth'});};
})();
