# External Services Data

Раздел описывает данные, которые приходят из внешних сервисов.

## Dream Singles

Используется для:

- входа в анкету;
- Inbox/Sent;
- отправки писем;
- фото/видео gallery;
- статусов мужчин online/favorite/ignored.

Данные попадают в:

- `profiles[].workspaceInbox`;
- `profiles[].workspaceMediaGallery`;
- `profiles[].men`;
- рабочее состояние расширения.

## Agency Bonuses

Используется для:

- финансовых строк;
- админ-панели;
- статистики и зарплат.

Данные попадают в:

- `agencyBonusLedger`.

## Google / DeepL

Используются для:

- переводов;
- кеша переводов.

Данные попадают в:

- `translator`;
- `translationCache`.

## Правила

- Внешние сервисы могут менять только свой раздел данных.
- Dream письма не должны менять Agency ledger.
- Agency bonuses не должны менять Inbox/Sent.
- Переводчик не должен менять письма, кроме текста перевода по явному действию.

