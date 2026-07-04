# Gradebook

A grade tracker with real user accounts. Log in from any device and your
grades are stored on the server, tied to your account.

## Run it locally

You'll need [Node.js](https://nodejs.org) installed (version 18 or newer).

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser. Sign up with an email
and password (min. 8 characters) and you're in.

Your data is stored in `data/db.json` — passwords are hashed (never stored
in plain text), and a random secret used to sign login sessions is
generated automatically on first run and saved to `data/jwt-secret.txt`.

## Put it on the internet (so it works from any device)

Right now it only runs on your own computer. To get a real URL you can log
into from your phone or laptop, deploy it to a free hosting service that
runs Node apps, for example:

- **[Render](https://render.com)** — connect a GitHub repo or upload this
  folder, set the start command to `npm start`, and it gives you a live URL.
- **[Railway](https://railway.app)** — similar one-click deploy from a repo.
- **[Fly.io](https://fly.io)** — a bit more setup but generous free tier.

Any of these will run `npm install && npm start` automatically. No code
changes needed — just upload the project.

### One thing to change before deploying publicly
Set an environment variable called `JWT_SECRET` to a long random string in
your hosting provider's dashboard. This keeps login sessions valid even if
the server restarts, and keeps the secret out of the deployed files. If you
skip this, the app still works — it'll just generate its own secret file on
the server instead.

## A note on the storage approach

Grades are stored in a single `data/db.json` file rather than a full
database. This is simple and fine for personal use or a small group of
users. If you ever want this to scale to a lot of people, swap the file
storage in `server.js` for a real database (e.g. Postgres) — the API
endpoints themselves wouldn't need to change.
