# KaufamnBot

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.27.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Chat UI: badges, quotes and identity colors

Both chat screens render the channel snapshot the API returns on every message
(`channel`, `botName`, `operatorEmail`) — see the backend
[README](../backend/README.md#message-channel-snapshot). Delivery badges are
derived from the `deliveredTo` list the API reports on every message:

- **`/chat` (user)** — own messages carry `отправлено из веб-чата` or
  `отправлено из Telegram · <bot>`; bot replies show `доставлено в Telegram`
  only when the reply actually reached Telegram (`deliveredTo` includes
  `TELEGRAM`) and no delivery badge for web-only replies. A console reply is
  signed with the operator email, a plugin reply with `Бот`.
- **`/mock-bot` (operator)** — incoming messages show the source (`из веб-чата`
  / `из Telegram · <bot>`, including pressed buttons), replies show the operator
  email plus the delivery badge (`доставлено в веб` or
  `доставлено в веб + Telegram · <bot>` when the bot name is known), and the
  conversation list marks the channel of the last message with a chip
  (`веб-чат` / `Telegram`).
- **Legacy rows** (`channel = null`) render without a badge.

### Replies with a quote

In `/mock-bot` every incoming user message has a **«Ответить»** button (text
and button-press messages alike). Picking a target shows a quote preview above
the composer with an **«Отменить»** link; the next reply is sent with
`replyToMessageId` in the POST body, and the target resets after a successful
send or when another conversation is opened.

Both screens render the quoted sender and text in a small block above the
reply content (`replyTo` on the message payload — history and SSE).

Messages are also **color-coded by identity**:
[`src/app/utils/message-identity.ts`](src/app/utils/message-identity.ts) derives
a stable key (`bot:<name>` or `operator:<email>`, no key for anonymous legacy
paths), hashes it and maps it onto one of eight palette slots
(`msg-identity-0` … `msg-identity-7`). Different bots or operators normally get
different bubbles (two keys can share a slot — the badge text still
disambiguates them), and the same identity keeps its color on both screens.
The palette lives in the global [`src/styles.css`](src/styles.css) as custom
properties (`--msg-deep` for solid user/reply bubbles, `--msg-tint` +
`--msg-accent` border for the other side), because component `styles` cannot
reference imported constants under AOT.

Jest specs for both components cover badge text, operator signatures, identity
classes and legacy messages (`npm test`); `npm run build` verifies the
production bundle.

## Taxi admin console (`/taxi`)

The taxi domain has an operator UI at [`/taxi`](src/app/app.routes.ts): the
[`TaxiAdminLayoutComponent`](src/app/taxi-admin/taxi-admin-layout.component.ts)
shell is guarded once with `requireAdminGuard` in `app.routes.ts` (the
children inherit it), renders a seven-item sidebar with `routerLinkActive`
highlighting and a nested `<router-outlet>`. Every page is a lazy child route
(`taxi/cities|services|departure-slots|passenger-options|drivers|prices|orders`,
`/taxi` redirects to `/taxi/cities`), and ADMIN users get a «Такси» link in
the navbar.

The pages share one template — a table, a signal-based form (`[ngModel]` +
`(ngModelChange)`, selects use `[selected]`) and delete-with-confirmation,
with `400`/`409` errors surfaced through the shared `ApiError` helper:

- **Cities** — route points with kilometrage (drives the price auto-calc);
- **Services** — extra services with a surcharge and the «car feature» flag;
- **Departure slots** / **Passenger options** — dictionary rows for the
  wizard steps;
- **Drivers** — driver cards with nested cars (plate, seats, feature
  checkboxes); the card header carries «Изменить» (activates the bottom edit
  form and scrolls to it) and «Удалить» (delete with confirmation);
- **Prices** — the symmetric city-pair matrix with manual pair editing and a
  «Рассчитать автоматически» button;
- **Orders** — the order table with passenger, route, prices and the assigned
  car, a status filter (empty value = the backend default of active
  NEW+CONFIRMED orders) and a status select.

The user-facing half of the domain is the chat wizard plugin — see
[`../backend/README.md`](../backend/README.md#taxi-ordering).
[`TaxiService`](src/app/taxi-admin/taxi.service.ts) wraps the generated
OpenAPI SDK for every page; Jest specs cover the layout (sidebar, guard,
navbar link) and the key pages (`npm test`), `npm run build` verifies the
bundle.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
