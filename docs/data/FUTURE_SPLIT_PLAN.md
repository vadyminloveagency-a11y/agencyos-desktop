# Future Physical Data Split Plan

Сейчас все живые данные находятся в `data.json`. Физически разделить данные можно, но это нужно делать осторожно.

## Почему нельзя просто разложить `data.json` по папкам сразу

Код сейчас ожидает один общий объект:

- `readDb()` читает весь `data.json`;
- `writeDb()` сохраняет весь `data.json`;
- многие функции одновременно используют `profiles`, `users`, `assignmentHistory`, `agencyBonusLedger`.

Если просто разнести файлы, можно сломать вход, письма, таблицу или назначения.

## Безопасный порядок

1. Зафиксировать карту данных в `docs/data`.
2. Добавить тесты на главные правила.
3. Вынести доступ к данным в отдельный слой, например `server/data-store/`.
4. Сделать миграцию, которая читает старый `data.json` и создает новые файлы.
5. Сначала писать и в старый, и в новый формат.
6. Проверить все экраны.
7. Только потом переключить CRM на новые файлы.

## Возможная будущая структура живых данных

```text
runtime-data/
  auth/
    users.json
    sessions.json
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
  inbox/
    17838562.json
  sent/
    17838562.json
  media/
    17838562.json
  admin-panel/
    agency-bonus-ledger.json
    cell-colors.json
    cell-comments.json
  dashboard/
    men-17838562.json
  settings/
    translator.json
    salary.json
```

Эта структура пока план, не текущее хранение.

Более подробная схема анкеты описана в `profiles-assignments/PER_PROFILE_STORAGE.md`.
Схема хранения баланса админ-панели описана в `admin-panel/BALANCE_STORAGE.md`.
