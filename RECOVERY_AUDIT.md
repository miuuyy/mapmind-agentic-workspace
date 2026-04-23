# Recovery + senior audit — финальный отчёт

## Итог сессии: 6 коммитов на `0.2.0` поверх `adfb84d`

```
6097bc9 Extract TopStatsOverlay component from WorkspaceShell
b24f61f Merge contradicting-duplicate CSS rules (cascade-preserving)
596f13c Remove unused locals/imports across frontend
6de6416 Dedupe identical CSS rules (AST-based pass, no behaviour change)
a057e06 Drop duplicate SERVER_NAME assignment in MCP server
8fd7e02 Restore light-theme dock/web palette and window drag fixes
adfb84d Rename MCP server to Clew Study Assist     ← твой якорь
```

После каждого: `tsc --noEmit` clean, `vite build` clean, postcss parse всех styles/*.css clean.

## Что реально починено (по твоему списку)

- web button active: финальный `#cf7b48` без обводки/тени (match send button)
- workspace может быть прижат к левому краю (clamp 84 → 10)
- snapshots list items в светлой теме: `border-radius: 16px`
- коллизия окон: workspace/chat/dock больше не блокируют друг друга; блокируют
  только индивидуальные top-stat chips + topic popover
- `resolveFloatingCollision` не определён → заменён на `clampFloatingPosition` + drag x/y-fallback
- MCP: `SERVER_NAME` был duplicate, имя сервера правильное "Clew Study Assist"
- user-side claude_desktop_config.json: старый `mapmind-mcp` → `clew-study-assist`

## Cleanup: цифры

| что | было | стало | delta |
|---|---|---|---|
| frontend total CSS LOC | 13713 | 11730 | **-1983** |
| `light-theme-overrides-b.css` | 2319 | 1766 | -553 |
| `light-theme-overrides-a.css` | 1955 | 1537 | -418 |
| `dark-theme-overrides.css` | 1443 | 1205 | -238 |
| `dark-theme-core.css` | 1751 | 1248 | -503 |
| `WorkspaceShell.tsx` | 1920 | 1854 | -66 |
| CSS bundle (prod) | 263.47 kB | 243.60 kB | **-19.87 kB** |
| CSS bundle (gzip) | 34.61 kB | 33.20 kB | -1.41 kB |
| TS unused locals | 8 | 0 | -8 |
| TS god-component copy-paste | 3x TopStatsOverlay inline | 1 extracted | -150 LOC repeated |

Всего: **281 dead CSS rules удалены** (122 identical-dup + 159 contradicting-dup merged).

## Что я осознанно не трогала — требует **твоего визуального QA**

### 1. Misplaced selectors между theme-файлами

- `dark-theme-overrides.css`: ~91 rule `[data-theme="light"]` (light-стили в dark-файле)
- `light-theme-overrides-b.css`: ~56 rule `[data-theme="dark"]` (наоборот)

**Риск перемещения:** `dark-theme-overrides.css` импортируется **последним** в `styles.css`. Перенос любого light-правила из dark-файла в light-b назад в каскаде → может изменить computed styles в edge-случаях. Безопасно только с ручным скриншотным сравнением.

### 2. God-components (1700-2200 LOC)

| файл | LOC | 66 hooks / 37 nested ternaries и т.д. |
|---|---|---|
| `App.tsx` | 2196 | 66 `useCallback/useEffect/useMemo`, 37 deep ternaries, **1 top-level function** |
| `WorkspaceShell.tsx` | 1854 | 14 deep ternaries |
| `GraphCanvas.tsx` | 1701 | 21 deep ternaries |

**Split requires visual QA** — это именно тот класс изменений, где codex ломал. Не лез без скриншотов.

### 3. `!important` overuse

После merge густота чуть упала, но всё ещё 30-40% в override-файлах. Каждое снятие `!important` требует проверки, что никакой поздний override не **должен был** проиграть.

### 4. Colour literals → CSS variables

Повторяются много раз:
- `rgba(255,255,255,0.08)` — 68 раз
- `rgba(255,255,255,0.06)` — 42 раза
- `rgba(232,228,222,0.96)` — 35 раз (cream border)
- `#cf7b48` — 13 раз (brand orange)
- ...и другие

Extract в tokens **меняет семантику** — `rgba(255,255,255,0.08)` в background vs border vs shadow подразумевает разную роль. Нужна продуктовая intention, не механическая замена.

## Verify baseline сейчас

- `tsc --noEmit` — 0 ошибок
- `noUnusedLocals` — 0 ошибок
- `vite build` — зелёный, 457 kB js / 243 kB css
- postcss parse всех стилей — clean
- dev server на :5178 отвечает 200 OK
