# Деплой

## Прод: Vercel

<https://games-table-bay.vercel.app>, репозиторий `mrWD/games-table`. Пуш в `main` —
Vercel собирает и выкладывает сам, ничего запускать руками не нужно.

Суффикс `-bay` не опечатка: короткий домен `games-table.vercel.app` занят чужим проектом.
Если менять адрес — искать его в `README.md`, `CLAUDE.md` и в этом файле.

`.github/workflows/deploy.yml` вопреки названию **ничего не деплоит** — это проверка
сборки на пуш в `main`. Деплой целиком на стороне Vercel.

### Переменные окружения

Одна: `RAWG_API_KEY` в **Settings → Environment Variables**. Больше ключ нигде не нужен —
ни в репозитории, ни в бандле.

Если ключа нет, прокси отдаёт 503, клиент молча переключается на Steam, и **консольные
игры пропадают из поиска**. Это не гипотеза: Steam не знает ни одной игры Nintendo.
Симптом на скрытой странице `/#/insights` — ноль у RAWG в разделе «Which source answered».

## Проверить, что задеплоена текущая версия

Хеш бандла на проде должен совпадать с локальным:

```bash
curl -s https://games-table-bay.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
```

**Не опрашивать прод в цикле.** Частые запросы включают Vercel Security Checkpoint, и
прод начинает отдавать 403 на всё, включая `manifest.webmanifest` — выглядит как поломка
приложения, но проходит само. Проверять лучше через браузер, а не циклом `curl`.

Service worker отдаёт прошлую сборку, поэтому перед проверкой в браузере:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
for (const k of await caches.keys()) await caches.delete(k)
location.reload()
```

Ещё одни грабли на проверке: переход по адресу, который отличается **только хэшем**, не
перезагружает страницу. Приложение остаётся с прежним состоянием в памяти, и подложенный
в `localStorage` набор данных не подхватывается — нужен явный `location.reload()`.

## Локальная проверка прокси без деплоя

```bash
echo 'RAWG_API_KEY=<ключ>' > .env.local            # файл в .gitignore
node --env-file=.env.local scripts/dev-api.mjs     # прокси на :3001
npm run dev                                        # Vite сам проксирует /api на него
```

Проксирование `/api` в `vite.config.ts` обязательно: без него dev-сервер отдаёт
`api/games.js` как статический файл, и клиент пытается разобрать исходник как JSON.

Что стоит прогнать (каждая строка ловила настоящий дефект):

```bash
curl -s "localhost:3001/api/games?source=rawg&path=games&search=zelda" | head -c 200
curl -s "localhost:3001/api/games?source=rawg&path=genres" | head -c 200   # слаги жанров
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3001/api/games?source=rawg&path=users/me"
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
     "localhost:3001/api/games?source=rawg&path=games&search=x"            # 403
curl -s "localhost:3001/api/games?source=rawg&path=games/3498" | grep -c "key="  # 0 — ключ не течёт
```

## Альтернативные хостинги

Статика плюс одна функция, поэтому переносится на Netlify или Cloudflare Pages. Требование
одно: функция обязана отвечать по пути `/api/games` — клиент ходит только туда и, не найдя
её, молча уйдёт на Steam вместе с потерей консольных игр.

## Правила безопасности

`RAWG_API_KEY` не должен попадать в репозиторий, в клиентский бандл и в переписку. Только
переменные окружения хостинга и локальный `.env.local` из `.gitignore`.

Если ключ засветился — перевыпустить в кабинете RAWG и обновить переменную в Vercel.
