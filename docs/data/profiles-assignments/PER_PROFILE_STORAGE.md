# Per Profile Storage

Цель: каждая анкета должна быть отдельным контейнером данных. Данные одной анкеты не должны случайно смешиваться с другой анкетой.

## Рекомендуемая будущая структура

```text
runtime-data/
  profiles/
    index.json
    17838562/
      profile.json
      credentials.json
      assignments.json
      men.json
      notes.json
      inbox.json
      sent.json
      dialogs.json
      media.json
      dashboard.json
      sync-state.json
    17838479/
      profile.json
      credentials.json
      assignments.json
      men.json
      notes.json
      inbox.json
      sent.json
      dialogs.json
      media.json
      dashboard.json
      sync-state.json
```

## Что лежит в каждом файле анкеты

### `profile.json`

Основная карточка анкеты:

- `id`;
- `name`;
- `photoUrl`;
- `active`;
- `createdAt`;
- `updatedAt`;
- технические поля Dream.

### `credentials.json`

Доступы анкеты:

- зашифрованный login Dream;
- зашифрованный password Dream;
- base URL, если нужен;
- дата последнего обновления.

Пароль нельзя хранить обычным текстом. Даже если файл отдельный, значения должны оставаться зашифрованными через `.credential-key`.

### `assignments.json`

Кому анкета принадлежала и когда:

- текущий админ/оператор, если есть;
- история назначений;
- даты снятия;
- кто назначил/снял.

Это важно для админ-панели и зарплат: если анкета была у человека 10 дней, эти 10 дней должны остаться в истории.

### `men.json`

Все мужчины этой анкеты:

- ID мужчины;
- имя;
- фото;
- профиль;
- online/favorite/ignored;
- статусы;
- служебные Dream поля.

### `notes.json`

Заметки отдельно от списка мужчин:

- заметки по мужчине;
- типы/статусы;
- pinned/favorite, если решим отделить это от `men.json`;
- история изменений заметок, если понадобится.

### `inbox.json`

Входящие письма:

- список писем;
- unread/unanswered/readByMan;
- ссылки на Dream;
- дата сохранения;
- ключи для защиты от дублей.

### `sent.json`

Исходящие письма:

- отправленные письма;
- дата отправки;
- ID мужчины;
- текст;
- вложения;
- статус отправки.

### `dialogs.json`

Полные диалоги по мужчинам:

```json
{
  "3848203": {
    "manId": "3848203",
    "letters": []
  }
}
```

Это лучше, чем держать огромный диалог внутри каждого письма Inbox.

### `media.json`

Фото и видео анкеты:

- Dream gallery photos;
- Dream video gallery;
- `galleryId`;
- `videoGalleryId`;
- thumb/url/title/type;
- дата последнего refresh.

### `dashboard.json`

Состояние рабочего экрана:

- фильтры;
- выбранные мужчины;
- локальные настройки вида;
- быстрые рабочие отметки.

### `sync-state.json`

Техническое состояние синхронизации:

- когда последний раз грузили Inbox;
- когда последний раз грузили Sent;
- какие страницы уже сканировались;
- last known keys;
- ошибки синка.

## Главное правило

Любая операция с письмами, мужчинами, заметками или медиа должна получать `profileId` и работать только внутри папки этой анкеты.

Например:

```text
send letter -> runtime-data/profiles/17838562/sent.json
save inbox -> runtime-data/profiles/17838562/inbox.json
save note -> runtime-data/profiles/17838562/notes.json
refresh media -> runtime-data/profiles/17838562/media.json
```

Так письмо одной анкеты не попадет в другую.

## Что остается общим

Не все данные нужно класть внутрь анкеты.

Общие данные:

- пользователи CRM;
- сессии;
- роли;
- глобальные настройки переводчика;
- глобальная таблица балансов;
- общие правила зарплаты.

Связь с анкетой делается через `profileId`.

