# ✈️ AeroMetrics — Measure. Improve. Master.

AeroMetrics is an advanced aviation-focused test platform that goes beyond scoring to deliver deep performance analytics. It helps users identify weak areas, track progress, and improve through intelligent insights and adaptive practice.

---

## 🚀 Features

### 🧪 Test Engine

* Blueprint-based test generation
* Section-wise configuration
* Difficulty-based question selection
* One-question-per-view exam interface

### 📊 Performance Analytics

* Accuracy, score, and time tracking
* Speed vs accuracy insights
* Chapter-wise mastery tracking
* Weak area detection

### 🧠 Intelligent Insights

* Personalized performance feedback
* Concept gap identification
* Guess vs confident answer detection
* Improvement recommendations

### 🔁 Review System

* Question-level review
* Correct vs incorrect answer comparison
* Detailed explanations
* Time spent per question

### 📥 Question Import System

* JSON / CSV / Excel support
* Bulk question ingestion
* Tag-based filtering
* Validation & error handling

### 🎯 Adaptive Learning (Planned / In Progress)

* Weak chapter prioritization
* Smart revision queue
* Personalized test generation

---

## 🏗️ Tech Stack

### Frontend

* React + Vite + TypeScript
* Tailwind CSS
* TanStack Query

### Backend

* NestJS
* PostgreSQL
* Prisma ORM

### Other

* JWT Authentication
* REST APIs
* Scalable modular architecture

---

## 📦 Project Structure

```
aerometrics/
│
├── frontend/        # React application
├── backend/         # NestJS API
├── prisma/          # Database schema
├── scripts/         # Utility scripts
└── docs/            # Documentation
```

---

## ⚙️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/aerometrics.git
cd aerometrics
```

### 2. Setup Backend

```bash
cd backend
npm install
```

Create `.env`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/aerometrics"
JWT_SECRET="your_secret"
```

Run migrations:

```bash
npx prisma migrate dev
```

Start backend:

```bash
npm run start:dev
```

---

### 3. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 📡 API Overview

### Auth

* `POST /auth/login`
* `POST /auth/register`

### Tests

* `POST /tests/generate`
* `GET /tests/:id`

### Attempts

* `POST /attempts/:id/submit`
* `GET /attempts/:id/review`

### Analytics

* `GET /analytics/overview`
* `GET /analytics/chapters`
* `GET /analytics/wrong-questions`

### Import

* `POST /questions/import`

---

## 📊 Core Metrics

* Accuracy (%)
* Speed (questions/min)
* Weighted Score
* Mastery Score (chapter-level)
* Priority Score (weak areas)
* Confidence-based analysis

---

## 🧠 Future Enhancements

* AI-based recommendations
* Real-time proctoring
* Performance prediction
* Leaderboards & ranking system

---

## 🤝 Contributing

Contributions are welcome!
Feel free to fork the repo and submit a PR.

---

## 📄 License

This project is licensed under the MIT License.

---

## 💡 Tagline

**Measure. Improve. Master.**
