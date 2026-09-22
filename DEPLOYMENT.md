# SpeakML Deployment

SpeakML runs as three services:

1. `model/` - FastAPI ML service on port `8000`.
2. `speakml-backend/` - Node.js API and Prisma service on port `4000`.
3. `frontend/` - React/Vite static site.

## Local run

Open three terminals from the repository root:

```powershell
cd model
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn api_server:app --host 0.0.0.0 --port 8000
```

```powershell
cd speakml-backend
npm ci
Copy-Item .env.example .env
# Set DATABASE_URL to a real MySQL or MariaDB database.
npx prisma generate
npx prisma migrate deploy
npm run dev
```

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL shown in the frontend terminal. The frontend uses
`VITE_API_URL` to find the backend.

## Production requirements

- Deploy the Python and Node services so they can reach each other over the
  network.
- Set the backend `ML_MODE=http` and `ML_SERVICE_URL` to the deployed Python
  service URL.
- Set the frontend `VITE_API_URL` to the deployed Node API URL, then rebuild
  the frontend. Vite variables are compiled into the static bundle.
- Set a production `DATABASE_URL` and run `npx prisma migrate deploy`.
- Use persistent storage for `STORAGE_PATH`, or replace local storage with an
  object-storage implementation. Uploaded datasets and generated artifacts
  are otherwise lost when a container is recreated.
- Do not commit `.env` files or credentials.

## Health checks

```text
GET <backend-url>/api/v1/health
GET <python-url>/health
```