<?php
/**
 * Проверка хостинга перед заливкой сайта.
 * Положить в корень сайта, открыть в браузере: https://galars.ru/proverka.php
 * ПОСЛЕ ПРОВЕРКИ ФАЙЛ УДАЛИТЬ.
 */
header('Content-Type: text/html; charset=utf-8');

function yn($ok) { return $ok ? 'ДА' : 'НЕТ'; }

$rows = array();
$rows[] = array('Версия PHP', PHP_VERSION, version_compare(PHP_VERSION, '5.3.0', '>='));
$rows[] = array('upload_max_filesize', ini_get('upload_max_filesize'), true);
$rows[] = array('post_max_size', ini_get('post_max_size'), true);
$rows[] = array('memory_limit', ini_get('memory_limit'), true);
$rows[] = array('max_execution_time', ini_get('max_execution_time') . ' сек', true);
$rows[] = array('file_uploads разрешены', yn(ini_get('file_uploads')), (bool)ini_get('file_uploads'));
$rows[] = array('mbstring (русский текст)', yn(function_exists('mb_strlen')), true);
$rows[] = array('openssl (шифрование)', yn(extension_loaded('openssl')), extension_loaded('openssl'));
$rows[] = array('getimagesize (проверка картинок)', yn(function_exists('getimagesize')), function_exists('getimagesize'));
$rows[] = array('fsockopen (выход в сеть)', yn(function_exists('fsockopen')), function_exists('fsockopen'));

// Самое важное: пускает ли хостинг наружу на почтовый сервер Яндекса.
$smtp = 'не проверялось';
$smtp_ok = false;
if (function_exists('fsockopen') && extension_loaded('openssl')) {
    $errno = 0; $errstr = '';
    $fp = @fsockopen('ssl://smtp.yandex.ru', 465, $errno, $errstr, 10);
    if ($fp) {
        $greeting = @fgets($fp, 512);
        @fclose($fp);
        $smtp = 'соединение есть — ' . trim((string)$greeting);
        $smtp_ok = true;
    } else {
        $smtp = 'НЕ ПУСКАЕТ (' . $errno . ' ' . $errstr . ')';
    }
}
$rows[] = array('Связь с smtp.yandex.ru:465', $smtp, $smtp_ok);

// Может ли скрипт писать на диск рядом с собой.
$w = @file_put_contents(__DIR__ . '/.probe-write', 'x');
$can_write = ($w !== false);
if ($can_write) { @unlink(__DIR__ . '/.probe-write'); }
$rows[] = array('Запись файлов на сервере', yn($can_write), $can_write);

$rows[] = array('Адрес сайта по версии сервера',
    (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '?'), true);
$rows[] = array('Схема',
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http',
    !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
?><!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Проверка хостинга</title>
<style>
 body{font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#C6BBAF;color:#2B2B2B;margin:0;padding:32px}
 .box{max-width:720px;margin:0 auto;background:#DBD3CA;border-radius:14px;padding:24px 28px}
 h1{font-size:20px;margin:0 0 4px}
 p.note{margin:0 0 20px;color:#5A5A5A;font-size:14px}
 table{width:100%;border-collapse:collapse}
 td{padding:9px 0;border-bottom:1px solid rgba(0,0,0,.08);vertical-align:top}
 td.k{color:#5A5A5A}
 td.v{text-align:right;font-weight:600;word-break:break-word}
 .bad{color:#9B2C2C}
 .warn{margin:20px 0 0;padding:12px 14px;background:rgba(155,44,44,.1);border-radius:10px;font-size:14px}
</style></head><body><div class="box">
<h1>Проверка хостинга</h1>
<p class="note">Что умеет сервер. Показать Артёму и удалить этот файл.</p>
<table>
<?php foreach ($rows as $r): ?>
  <tr><td class="k"><?php echo htmlspecialchars($r[0], ENT_QUOTES, 'UTF-8'); ?></td>
      <td class="v<?php echo $r[2] ? '' : ' bad'; ?>"><?php echo htmlspecialchars($r[1], ENT_QUOTES, 'UTF-8'); ?></td></tr>
<?php endforeach; ?>
</table>
<p class="warn">Этот файл нужен один раз. После того как показали результат — удалить с сервера.</p>
</div></body></html>
