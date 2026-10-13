#Download dependencies
python3.11 -m venv .venv && source .venv/bin/activate && pip install -r legacy/requirements.txt

Architecture:
rehab-ai/
├── legacy/streamlit_app.py        # your current main.py, kept as reference until feature parity
├── backend/
│   ├── app/
│   │   ├── main.py                # app creation, router registration
│   │   ├── core/config.py         # Settings read from env vars (pydantic-settings)
│   │   ├── api/                   # HTTP only: deps.py, health.py, exercises.py, analysis.py
│   │   ├── schemas/               # Pydantic request/response models
│   │   ├── services/              # PURE logic, no FastAPI or DB imports
│   │   │   ├── joints.py          # joint registry (replaces JOINTS_DICT)
│   │   │   ├── angles.py
│   │   │   ├── pose.py            # video -> landmarks -> angles (MediaPipe wrapper)
│   │   │   ├── dtw.py
│   │   │   ├── matching.py        # online matcher for real-time
│   │   │   └── scoring.py
│   │   └── db/                    # base.py, models.py, session.py, repositories.py
│   ├── alembic/ + alembic.ini
│   ├── tests/{unit,fixtures}/
│   ├── requirements.txt, requirements-dev.txt
│   └── Dockerfile
├── frontend/                      # Vite + React + TS (src/, package.json, Dockerfile)
├── docker-compose.yml
├── .env.example, .gitignore, .dockerignore
└── README.md