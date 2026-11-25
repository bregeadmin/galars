<?php
/**
 * Приёмник заявок с сайта galars.ru
 *
 * Принимает POST из формы «Связаться» вместе с чертежами, собирает письмо
 * с вложениями и отправляет его через SMTP Яндекса на почту завода.
 * Копию заявки кладёт в папку zayavki/ на случай сбоя почты.
 *
 * Поля из формы: name, contact, company, task, consent, file_1..file_N
 * Ответ: JSON {ok: true} или {ok: false, error: "..."}
 *
 * Совместимо с PHP 5.3 — на хостинге стоит 5.3.29.
 * Без внешних библиотек: MIME и SMTP собраны вручную.
 */

header('Content-Type: application/json; charset=utf-8');

$CFG_FILE = __DIR__ . '/zayavka-config.php';
if (!file_exists($CFG_FILE)) {
    header('HTTP/1.1 500 Internal Server Error', true, 500);
    echo json_encode(array('ok' => false, 'error' => 'config_missing'));
    exit;
}
$CFG = require $CFG_FILE;

// ---------- общие мелочи ----------

/** http_response_code() появился в PHP 5.4, на хостинге 5.3 — ставим статус руками. */
function send_status($code) {
    static $texts = array(
        204 => 'No Content', 400 => 'Bad Request', 403 => 'Forbidden',
        405 => 'Method Not Allowed', 413 => 'Request Entity Too Large',
        422 => 'Unprocessable Entity', 429 => 'Too Many Requests',
        500 => 'Internal Server Error', 502 => 'Bad Gateway',
    );
    $text = isset($texts[$code]) ? $texts[$code] : 'Error';
    header('HTTP/1.1 ' . $code . ' ' . $text, true, $code);
}

function fail($code, $msg) {
    send_status($code);
    echo json_encode(array('ok' => false, 'error' => $msg));
    exit;
}

/** Убирает переводы строк — защита от подстановки чужих заголовков в письмо. */
function one_line($s) {
    return trim(preg_replace('/[\r\n]+/u', ' ', (string)$s));
}

/** Кодирует строку для темы письма и имён файлов (RFC 2047). */
function mime_word($s) {
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}

function client_ip() {
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

/** Длина строки в символах. Если mbstring не подключён — считаем байты. */
function str_len_u($s) {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

/** Обрезка строки. Без mbstring режем по байтам и чистим хвост. */
function str_cut_u($s, $n) {
    if (function_exists('mb_substr')) return mb_substr($s, 0, $n, 'UTF-8');
    $cut = substr($s, 0, $n);
    return preg_replace('/[\x80-\xBF]+$/', '', $cut);
}

// ---------- проверки запроса ----------

if (!isset($_SERVER['REQUEST_METHOD'])) fail(400, 'bad_request');

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowed = isset($CFG['allowed_origins']) ? $CFG['allowed_origins'] : array();

// Своя же страница разрешена всегда, независимо от того, что в настройках и
// по какой схеме открыт сайт. Иначе заявка с http://galars.ru или с адреса,
// который забыли внести в allowed_origins, упиралась бы в 403.
if (isset($_SERVER['HTTP_HOST']) && $_SERVER['HTTP_HOST'] !== '') {
    $self_host = $_SERVER['HTTP_HOST'];
    $allowed[] = 'https://' . $self_host;
    $allowed[] = 'http://' . $self_host;
}
if ($origin !== '' && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Accept, Content-Type');
    send_status(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'method_not_allowed');

// Чужой источник — отказ. Пустой Origin бывает при отправке со своей же страницы.
if ($origin !== '' && !in_array($origin, $allowed, true)) fail(403, 'origin_not_allowed');

// Форма ушла, но сервер обрезал тело по post_max_size — $_POST будет пуст.
if (empty($_POST) && empty($_FILES) &&
    isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 0) {
    fail(413, 'too_large');
}

// ---------- ловушка для ботов ----------

// Форма это поле не отправляет. Если оно пришло заполненным — это бот,
// который постит прямо на адрес приёмника. Отвечаем «успехом», чтобы не учился.
if (!empty($_POST['website'])) {
    echo json_encode(array('ok' => true));
    exit;
}

// ---------- не чаще N заявок в час с одного адреса ----------

$storage = isset($CFG['storage']) ? $CFG['storage'] : (__DIR__ . '/../zayavki');
if (!is_dir($storage)) @mkdir($storage, 0750, true);
// Папка не должна отдаваться вебом и не должна выполнять скрипты.
if (!file_exists($storage . '/.htaccess')) {
    // Apache 2.4 и 2.2 закрывают папку разными директивами, а php_flag
    // есть только при mod_php: без обёрток любая строка роняет сервер в 500.
    $deny = "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
          . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n"
          . "<IfModule mod_php5.c>\n  php_flag engine off\n</IfModule>\n"
          . "<IfModule mod_php7.c>\n  php_flag engine off\n</IfModule>\n";
    @file_put_contents($storage . '/.htaccess', $deny);
}

// Считаем только ПРИНЯТЫЕ заявки. Если считать и отбитые по ошибке в полях,
// человек, трижды забывший галочку согласия, окажется заблокирован на час.
$limit = isset($CFG['rate_limit_per_hour']) ? (int)$CFG['rate_limit_per_hour'] : 10;
$rate_file = $storage . '/.rate-' . md5(client_ip()) . '.txt';
$rate_fresh = array();
if ($limit > 0) {
    $hits = array();
    if (is_file($rate_file)) {
        $raw = @file_get_contents($rate_file);
        if ($raw !== false && $raw !== '') $hits = explode(',', trim($raw));
    }
    $now = time();
    foreach ($hits as $t) { if ($now - (int)$t < 3600) $rate_fresh[] = (int)$t; }
    if (count($rate_fresh) >= $limit) fail(429, 'too_many_requests');
}

// ---------- поля ----------

$name    = one_line(isset($_POST['name'])    ? $_POST['name']    : '');
$contact = one_line(isset($_POST['contact']) ? $_POST['contact'] : '');
$company = one_line(isset($_POST['company']) ? $_POST['company'] : '');
$task    = trim(isset($_POST['task'])        ? (string)$_POST['task'] : '');
$consent = isset($_POST['consent']) && $_POST['consent'] !== '';

if ($name === '' || str_len_u($name) > 200)       fail(422, 'bad_name');
if ($contact === '' || str_len_u($contact) > 200) fail(422, 'bad_contact');
if ($task === '' || str_len_u($task) > 20000)     fail(422, 'bad_task');
if (str_len_u($company) > 300)                    fail(422, 'bad_company');
if (!$consent)                                             fail(422, 'no_consent');

// ---------- файлы ----------

$ALLOWED = array(
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png'  => 'image/png',
    'webp' => 'image/webp',
    'pdf'  => 'application/pdf',
);
$max_total = isset($CFG['max_total_bytes']) ? (int)$CFG['max_total_bytes'] : 25 * 1024 * 1024;

$files = array();   // array(name, type, path)
$total = 0;

foreach ($_FILES as $field => $f) {
    if (strpos($field, 'file_') !== 0) continue;
    if (!isset($f['error']) || $f['error'] !== UPLOAD_ERR_OK) {
        if (isset($f['error']) && ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE)) {
            fail(413, 'file_too_large');
        }
        continue;
    }
    if (!is_uploaded_file($f['tmp_name'])) continue;

    $orig = (string)$f['name'];
    $ext  = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if (!isset($ALLOWED[$ext])) fail(422, 'bad_file_type');

    // Проверяем не только расширение, но и само содержимое.
    if ($ext === 'pdf') {
        $head = @file_get_contents($f['tmp_name'], false, null, 0, 5);
        if ($head !== '%PDF-') fail(422, 'bad_file_content');
    } else {
        $info = @getimagesize($f['tmp_name']);
        if ($info === false) fail(422, 'bad_file_content');
    }

    $total += (int)$f['size'];
    if ($total > $max_total) fail(413, 'too_large');

    // Имя файла чистим: оставляем буквы, цифры, точку, дефис и подчёркивание.
    $safe = preg_replace('/[^\p{L}\p{N}\.\-_ ]+/u', '_', $orig);
    $safe = str_cut_u(one_line($safe), 120);
    if ($safe === '') $safe = 'file.' . $ext;

    $files[] = array('name' => $safe, 'type' => $ALLOWED[$ext], 'path' => $f['tmp_name']);
}

// Заявка прошла проверки — вот теперь засчитываем её в лимит частоты.
if ($limit > 0) {
    $rate_fresh[] = time();
    @file_put_contents($rate_file, implode(',', $rate_fresh), LOCK_EX);
}

// ---------- копия заявки на диск ----------

$stamp  = date('Y-m-d_His');
$ticket = $stamp . '_' . substr(md5(uniqid('', true)), 0, 6);
$dir    = $storage . '/' . $ticket;
@mkdir($dir, 0750, true);

$card = "Заявка с сайта galars.ru\n"
      . "Время:        " . date('d.m.Y H:i:s') . "\n"
      . "Номер:        " . $ticket . "\n"
      . "Имя:          " . $name . "\n"
      . "Контакт:      " . $contact . "\n"
      . "Организация:  " . ($company !== '' ? $company : '—') . "\n"
      . "Согласие:     дано\n"
      . "IP:           " . client_ip() . "\n\n"
      . "Задача:\n" . $task . "\n";

@file_put_contents($dir . '/zayavka.txt', $card);

$saved = array();
foreach ($files as $i => $f) {
    $dest = $dir . '/' . ($i + 1) . '_' . $f['name'];
    if (@move_uploaded_file($f['path'], $dest)) {
        $saved[] = array('name' => $f['name'], 'type' => $f['type'], 'path' => $dest);
    }
}
$files = $saved;

// ---------- письмо ----------

$subject = 'Заявка с сайта — ' . ($company !== '' ? $company : $name);

$body = $card;
if (count($files) > 0) {
    $body .= "\nВложено файлов: " . count($files) . "\n";
    foreach ($files as $f) $body .= "  • " . $f['name'] . "\n";
} else {
    $body .= "\nФайлов не приложено.\n";
}

$boundary = '----galars_' . md5(uniqid('', true));

$headers  = 'From: ' . mime_word($CFG['from_name']) . ' <' . $CFG['from'] . ">\r\n";
$headers .= 'To: ' . implode(', ', $CFG['to']) . "\r\n";
$headers .= 'Subject: ' . mime_word($subject) . "\r\n";
// Отвечать можно прямо из письма — адрес посетителя подставлен,
// но только если он похож на почту. Иначе это телефон, и Reply-To не нужен.
if (filter_var($contact, FILTER_VALIDATE_EMAIL)) {
    $headers .= 'Reply-To: ' . mime_word($name) . ' <' . $contact . ">\r\n";
}
$headers .= 'Date: ' . date('r') . "\r\n";
$headers .= 'Message-ID: <' . $ticket . '@galars.ru>' . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= 'Content-Type: multipart/mixed; boundary="' . $boundary . '"' . "\r\n";

$msg  = "--" . $boundary . "\r\n";
$msg .= "Content-Type: text/plain; charset=UTF-8\r\n";
$msg .= "Content-Transfer-Encoding: base64\r\n\r\n";
$msg .= chunk_split(base64_encode($body)) . "\r\n";

foreach ($files as $f) {
    $data = @file_get_contents($f['path']);
    if ($data === false) continue;
    $msg .= "--" . $boundary . "\r\n";
    $msg .= 'Content-Type: ' . $f['type'] . '; name="' . mime_word($f['name']) . '"' . "\r\n";
    $msg .= "Content-Transfer-Encoding: base64\r\n";
    $msg .= 'Content-Disposition: attachment; filename="' . mime_word($f['name']) . '"' . "\r\n\r\n";
    $msg .= chunk_split(base64_encode($data)) . "\r\n";
}
$msg .= "--" . $boundary . "--\r\n";

// ---------- отправка через SMTP ----------

function smtp_send($cfg, $headers, $body, $recipients) {
    $fp = @fsockopen($cfg['smtp_host'], (int)$cfg['smtp_port'], $errno, $errstr, 20);
    if (!$fp) return 'connect: ' . $errstr;
    stream_set_timeout($fp, 30);

    $read = function () use ($fp) {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') break;
        }
        return $out;
    };
    $say = function ($cmd) use ($fp, $read) {
        fwrite($fp, $cmd . "\r\n");
        return $read();
    };
    $code = function ($resp) { return (int)substr($resp, 0, 3); };

    if ($code($read()) !== 220) { fclose($fp); return 'greeting'; }
    if ($code($say('EHLO galars.ru')) !== 250) { fclose($fp); return 'ehlo'; }
    if ($code($say('AUTH LOGIN')) !== 334) { fclose($fp); return 'auth'; }
    if ($code($say(base64_encode($cfg['smtp_user']))) !== 334) { fclose($fp); return 'user'; }
    if ($code($say(base64_encode($cfg['smtp_pass']))) !== 235) { fclose($fp); return 'pass'; }
    if ($code($say('MAIL FROM:<' . $cfg['from'] . '>')) !== 250) { fclose($fp); return 'from'; }
    foreach ($recipients as $rcpt) {
        $c = $code($say('RCPT TO:<' . $rcpt . '>'));
        if ($c !== 250 && $c !== 251) { fclose($fp); return 'rcpt ' . $rcpt; }
    }
    if ($code($say('DATA')) !== 354) { fclose($fp); return 'data'; }

    // Точка в начале строки удваивается — иначе письмо оборвётся.
    $payload = $headers . "\r\n" . $body;
    $payload = preg_replace('/^\./m', '..', $payload);
    fwrite($fp, $payload . "\r\n.\r\n");
    if ($code($read()) !== 250) { fclose($fp); return 'send'; }

    $say('QUIT');
    fclose($fp);
    return true;
}

$result = smtp_send($CFG, $headers, $msg, $CFG['to']);

// ---------- ответ ----------

$log = date('c') . "\t" . $ticket . "\t" . client_ip() . "\t"
     . ($result === true ? 'sent' : 'ERROR ' . $result) . "\t"
     . count($files) . " файл(ов)\n";
@file_put_contents($storage . '/journal.log', $log, FILE_APPEND | LOCK_EX);

if ($result !== true) {
    // Заявка на диске лежит — не потеряна, но почта не ушла.
    fail(502, 'mail_failed');
}

echo json_encode(array('ok' => true, 'ticket' => $ticket));
