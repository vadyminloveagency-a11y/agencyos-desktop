Dream Local CRM — локальный сайт для мужчин из Dream Singles

Как запустить:

1. Установи Node.js с сайта nodejs.org
2. Распакуй папку dream_local_crm
3. Открой CMD / PowerShell в этой папке
4. Выполни:

   npm install
   npm start

5. Открой в браузере:

   http://localhost:3000

Куда расширение должно отправлять данные:

   http://localhost:3000/api/men

Формат данных такой же, как сейчас:

{
  "men": [
    {
      "name": "John",
      "age": "55",
      "id": "123456",
      "lettersCount": 10,
      "firstLetterDate": "16.06.2026",
      "lastLetterDate": "18.06.2026",
      "inboxLink": "...",
      "profileLink": "..."
    }
  ]
}

Важно:
- firstLetterDate не перезаписывается, если уже есть.
- lastLetterDate обновляется только на более новую дату.
- данные хранятся в файле data.json рядом с server.js.
- нажатие на звездочку переносит мужчину в верхний список «Важные мужчины»;
  выбор сохраняется в data.json и не пропадает после перезапуска или смены браузера.
