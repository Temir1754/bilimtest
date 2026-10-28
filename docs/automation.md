# Автоматические задачи (DECISIONS.md №105)

Работают в GitHub Actions (бесплатно для публичного репозитория) после переноса в `main` («пуш»).
Посмотреть: github.com/Temir1754/bilimtest → вкладка **Actions**.

| Задача | Когда | Что делает |
|---|---|---|
| **Копия базы** (`backup.yml`) | понедельник 02:00 по Алматы | копия всех таблиц (public и school), шифруется паролем, хранится 90 дней |
| **Сайт работает** (`watch.yml`) | каждый час | сайт открывается и база отвечает; не отвечает — письмо владельцу от GitHub; база не «засыпает» |
| **Страницы для Google** (`refresh.yml`) | каждую ночь 01:00 | пересборка на Vercel: новые темы попадают в страницы и sitemap |

## Секреты (один раз, владелец)
GitHub → репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:

| Имя | Откуда взять |
|---|---|
| `SUPABASE_DB_URL` | из файла `.env` — строка `SUPABASE_DB_URL=` (то, что после `=`) |
| `SUPABASE_URL` | из `.env` — `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | из `.env` — `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `BACKUP_PASSWORD` | придумать: не короче 12 знаков. **Записать на бумаге** — без него копию не открыть. Его же вписать в `.env` строкой `BACKUP_PASSWORD=…` |
| `VERCEL_DEPLOY_HOOK` | Vercel → проект bilimtest → **Settings → Git → Deploy Hooks**: имя `nightly`, ветка `main` → Create → скопировать адрес |

## Вернуть базу из копии GitHub
1. Actions → «Копия базы» → нужный запуск → внизу **bilimtest-backup** → скачать и распаковать zip.
2. `npm run unseal -- путь/к/bilimtest-ГГГГ-ММ-ДД.bbak` — появится папка в `backups/`.
3. `npm run restore -- backups/папка --yes`.
