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

## Chat UI: channel badges and identity colors

Both chat screens render the channel snapshot the API returns on every message
(`channel`, `botName`, `operatorEmail`) — see the backend
[README](../backend/README.md#message-channel-snapshot):

- **`/chat` (user)** — own messages carry `отправлено из веб-чата` or
  `отправлено из Telegram · <bot>`; bot replies carry `доставлено в веб-чат` or
  `доставлено в Telegram · <bot>`. A console reply is signed with the operator
  email, a plugin reply with `Бот`.
- **`/mock-bot` (operator)** — incoming messages show the source (`из веб-чата`
  / `из Telegram · <bot>`, including pressed buttons), replies show the operator
  email plus the delivery badge, and the conversation list marks the channel of
  the last message with a chip (`веб-чат` / `Telegram`).
- **Legacy rows** (`channel = null`) render without a badge.

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

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
