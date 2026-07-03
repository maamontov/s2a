# s2a — sprites to atlas

Локальное desktop-приложение для генерации sprite atlas. Принимает отдельные изображения и папки с любой глубиной вложенности, упаковывает их в PNG и экспортирует метаданные.

Поддерживаемые форматы:

- Pixi.js / Phaser — TexturePacker-совместимый JSON;
- Godot 4 — `SpriteFrames` resource (`.tres`), по одной именованной анимации на спрайт;
- Generic JSON — простой независимый от движка формат.

## Desktop-приложение

Для разработки нужны Node.js 20+, Rust и системные зависимости Tauri 2 для вашей ОС. Установите JavaScript-зависимости и запустите приложение:

```bash
npm install
npm run app:dev
```

Создание нативного приложения и установщика:

```bash
npm run app:build
```

Результат появится в `src-tauri/target/release/bundle`. Отдельный сервер готовому приложению не требуется. Все изображения обрабатываются локально и никуда не загружаются.

Актуальные системные зависимости для Windows, macOS и Linux перечислены в [документации Tauri](https://v2.tauri.app/start/prerequisites/).

После загрузки репозитория на GitHub установщики можно собрать без локального окружения: откройте **Actions → Build desktop apps → Run workflow**. Готовые Windows, macOS и Linux-пакеты (`.deb`, `.rpm`, `.AppImage`) появятся в Artifacts запуска.

## Запуск в браузере

```bash
npm run dev
```

Vite выведет локальный адрес после запуска.

## Использование экспорта

Скачайте `atlas.png`, затем метаданные выбранного формата. Для Godot положите `atlas.png` и `atlas.tres` рядом в корень проекта или поправьте `res://atlas.png` в `.tres`. Каждый исходный путь становится именем отдельной анимации в `SpriteFrames` без расширения файла.

## Проверка

```bash
npm test
npm run build:web
```
