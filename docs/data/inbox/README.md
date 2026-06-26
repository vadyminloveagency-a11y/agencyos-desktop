# Inbox Data

Раздел отвечает за входящие письма мужчин, диалоги, статусы и синхронизацию Inbox.

## Где хранится сейчас

В `data.json` внутри конкретной анкеты:

- `profiles[profileId].workspaceInbox` - сохраненные письма и диалоги.

Типичные поля письма:

- `key` - уникальный ключ письма.
- `id` - ID мужчины.
- `direction` - `incoming` или другая сторона диалога.
- `name`, `photoUrl`, `profileLink`, `messageLink`.
- `dateText`, `snippet`, `bodyText`, `subject`.
- `unread`, `unanswered`, `readByMan`.
- `conversation` - загруженный диалог.
- `attachments` - вложения письма.
- `savedAt`, `readAt`, `readError`.

## Правила Inbox

- Клик по мужчине может подгружать письма/диалог.
- Повторная синхронизация не должна бесконечно грузить старые письма, если правило остановки включено.
- Изменения Inbox не должны менять Admin Panel, назначения анкет или пароли.

## Что нельзя трогать без отдельной задачи

- `assignmentHistory`;
- `users[].profileIds`;
- `agencyBonusLedger`;
- отправку рассылки;
- правила вложений Dream gallery.

## Проверка после изменений

- список Inbox загружается;
- клик по мужчине открывает/обновляет диалог;
- старые письма не дублируются;
- статусы `unread`, `unanswered`, `readByMan` сохраняются.

