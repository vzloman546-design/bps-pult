# Release test report — БПС Пульт 2.7.0

Дата проверки: 2026-08-03

## Что вошло в релиз

- прикрепление документов к материалам базы знаний при создании и редактировании;
- поиск по имени прикреплённого документа;
- открытие/скачивание документа из карточки материала и удаление из формы;
- ограничения: до 5 документов на материал, до 10 МБ на файл и до 30 МБ суммарно;
- безопасный набор MIME-типов и проверка соответствия размера фактическим base64-данным;
- экспорт документов в отдельные файлы `.bpsbackup` и восстановление после проверки архива;
- миграция схемы данных 5 → 6 без удаления старых записей;
- Web Push сохранён и не объединён с механизмом синхронизации данных.

## Автоматические проверки

Пройдены:

- `node --check app.js`
- `node --check stability-logic.js`
- `node --check event-logic.js`
- `node --check event-ui.js`
- `node --check knowledge-logic.js`
- `node --check knowledge-ui.js`
- `node --check sw.js`
- `node tests/event-logic.test.js`
- `node tests/knowledge-logic.test.js`
- `node tests/knowledge-attachments-ui.test.js`
- `node tests/stability-logic.test.js`
- `node tests/service-worker.test.js`
- `node tests/app-contract.test.js`
- `node tests/productivity-logic.test.js`
- `node tests/draft-autosave.test.js`
- `node tests/form-save-guard.test.js`

Результат: все проверки пройдены; логика базы знаний — 17 сценариев, stability/backup — 16 групп сценариев.

## QR-синхронизация

Функция не включена в эту сборку. В репозитории есть только отдельный opt-in Worker для Web Push, а API аккаунта и синхронизации рабочей базы отсутствует. Использовать push-endpoint для передачи базы нельзя: это изменило бы границы приватности и могло бы нарушить уведомления.

Сайт `https://ohmytracker.ru/` из среды проверки не открылся из-за таймаута, поэтому точный flow референса подтвердить не удалось. Для реализации QR-синхронизации нужен отдельный согласованный backend/API или предоставленный владельцем endpoint с контрактом pairing, авторизации, merge/replace и отзыва устройства.

## Не выполнено автоматически

- проверка на реальном iPhone;
- визуальный аудит ширин 320/375/390/430 px и светлой/тёмной темы;
- публикация на GitHub Pages.
