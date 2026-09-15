/* Загрузчик режима правки. Обычные посетители его не получают:
   редактор подгружается только если в адресе есть ?edit. */
(function () {
  if (!/[?&]edit(?:=|&|$)/.test(location.search)) return;
  var base = document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/edit-boot\.js.*$/, '') : '';
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'edit.css';
  document.head.appendChild(css);
  var js = document.createElement('script'); js.src = base + 'edit.js'; js.defer = true;
  document.head.appendChild(js);
})();
