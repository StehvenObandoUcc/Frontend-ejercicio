# Decorator Towers Frontend

Embedded Java frontend for the decorator tower workshop.

## Run

```bash
mvn -q package
java -cp target/classes com.ucc.frontend.TowerFrontendApp
```

## Environment variables

- `PORT` defaults to `3000`
- `BACKEND_BASE_URL` defaults to `http://localhost:8081`
- `BACKEND_API_KEY` defaults to `decorator-secret-2026`

Open `http://localhost:3000` in the browser.
