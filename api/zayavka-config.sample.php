<?php
// Настройки приёмника заявок. Скопировать в zayavka-config.php и заполнить.
// Файл zayavka-config.php НЕ класть в репозиторий — в нём пароль.

return array(

  // Куда слать заявки. Можно несколько через запятую.
  'to' => array('info@galars.ru'),

  // Ящик-отправитель на Яндексе и пароль приложения для него.
  // Пароль приложения создаётся в настройках Яндекс ID, обычный пароль не подойдёт.
  'smtp_host' => 'ssl://smtp.yandex.ru',
  'smtp_port' => 465,
  'smtp_user' => 'site@galars.ru',
  'smtp_pass' => '',
  'from'      => 'site@galars.ru',
  'from_name' => 'Сайт ГАЛАРС',

  // Предел на суммарный размер вложений, байт. Должен быть не больше,
  // чем upload_max_filesize и post_max_size на хостинге.
  'max_total_bytes' => 25 * 1024 * 1024,

  // Папка для копий заявок. Создаётся сама, закрыта от веба .htaccess.
  'storage' => __DIR__ . '/../zayavki',

  // Откуда разрешено отправлять форму. Пусто = только со своего домена.
  'allowed_origins' => array(
    'https://galars.ru',
    'https://www.galars.ru',
  ),

  // Не больше стольких заявок с одного адреса за час.
  'rate_limit_per_hour' => 10,
);
