# Employee Management System — Aim 5

A full-stack Employee Management System built for **Aim 5**. It demonstrates complete CRUD operations in an employee administration interface while keeping the required technologies: HTML, CSS, JavaScript, Python Flask, and SQLite.

## What changed in the upgraded version

The original project had a solid CRUD foundation but one main page. This version keeps the required functionality and adds:

- A multi-page employee management interface: Dashboard, Employees, Add/Update Employee, and Reports.
- Live dashboard metrics for headcount, average salary, payroll, and departments.
- Department and salary analytics rendered from real API data.
- Search by ID, name, department, designation, or contact.
- Department filter, sorting, reset filters, and CSV export.
- Edit workflow using a dedicated record page.
- Custom delete confirmation modal instead of the browser `confirm()` dialog.
- Light/dark mode stored in local storage.
- Responsive sidebar and mobile layout.
- Client-side and server-side validation.
- Normalized SQLite structure with `departments`, `designations`, `employees`, and `audit_logs` tables.
- Automatic migration of the original non-normalized `employees` table into the new structure.
- Health endpoint for connection status.
- A separate README for project documentation and submission details.
- A Vite-based Node.js frontend tooling setup.

## Technologies / tools

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Frontend tooling | Node.js + npm + Vite |
| Backend | Python 3 + Flask |
| Database | SQLite |
| API | REST + JSON + GET/POST/PUT/DELETE |
| Cross-origin support | Flask-CORS |

## Project structure

```text
employee-management-system/
├── backend/
│   ├── app.py
│   ├── employees.db
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── employees.html
│   ├── add-employee.html
│   ├── analytics.html
│   ├── README.md
│   ├── style.css
│   ├── script.js
│   └── package.json
└── README.md
```

## Run the project

### 1. Clone the GitHub repository

```bash
git clone https://github.com/<your-username>/employee-management-system.git
cd employee-management-system
```

### 2. Create the Python environment

```bash
cd backend
python -m venv venv
```

Windows:

```bash
venv\Scripts\activate
```

macOS/Linux:

```bash
source venv/bin/activate
```

### 3. Install backend requirements

```bash
pip install -r requirements.txt
```

### 4. Start Flask

```bash
python app.py
```

Open **http://127.0.0.1:5000**.

The Flask server serves the frontend pages and exposes the API.

### 5. Optional: use Node/Vite tooling

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The included `vite.config.js` serves all five HTML pages and proxies `/api` requests to Flask on port 5000, so the frontend remains connected to the real backend during development. The Flask-hosted version at port 5000 remains the simplest way to demonstrate the complete submission.

## Main pages

- `/` — Executive dashboard
- `/employees.html` — Search/filter/edit/delete directory
- `/add-employee.html` — Add or update employee
- `/analytics.html` — Workforce and salary analytics

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/employees` | List/search/filter employees |
| GET | `/api/employees/<employee_id>` | Fetch one employee |
| POST | `/api/employees` | Add employee |
| PUT | `/api/employees/<employee_id>` | Update employee |
| DELETE | `/api/employees/<employee_id>` | Delete employee |
| GET | `/api/departments` | List departments + counts |
| GET | `/api/designations` | List designations |
| GET | `/api/stats` | Dashboard and analytics data |
| GET | `/api/health` | Server/database health check |

## Assignment objectives covered

### Frontend

The interface supports entering and viewing **Name, Employee ID, Department, Designation, Salary, and Contact**.

### Flask REST API

CRUD endpoints use JSON and HTTP methods:

- Add → `POST`
- View/List → `GET`
- Search/filter → `GET` with query parameters
- Update → `PUT`
- Delete → `DELETE`

### SQLite

The upgraded schema separates department and designation lookup values from employee records and adds timestamps + an audit log.

### Validation

Both client and server validate required fields, Employee ID format, name, salary, contact, and duplicate Employee IDs.

### Dynamic rendering

The employee directory, dashboard, and analytics page fetch JSON and render results with JavaScript without full-page reloads.

### Edge cases

- Duplicate Employee ID → HTTP `409`
- Invalid input → HTTP `400`
- Update/delete non-existent employee → HTTP `404`
- Empty search results → friendly empty state

## Easy customization — where to change things

### Change colors / overall look

Edit the `:root` variables at the top of:

```text
frontend/style.css
```

The most important values are:

```css
--brand: #6d5dfc;
--brand-2: #8b7cff;
--bg: #f4f6fb;
--radius: 20px;
```

### Change currency or locale

Edit `APP_CONFIG` near the top of:

```text
frontend/script.js
```

Example:

```js
const APP_CONFIG = {
  currency: 'INR',
  locale: 'en-IN',
};
```

### Change validation rules

Edit `validate_employee()` and the regular expressions near the top of:

```text
backend/app.py
```

### Add another page

Copy any page in `frontend/`, update the sidebar links, and set a new `data-page` value on the `<body>` if the page needs custom JavaScript behavior.

### Change dashboard cards/charts

Edit the markup in `frontend/index.html` or `frontend/analytics.html`, then update the corresponding rendering function in `frontend/script.js`.

## GitHub submission

Push the full project folder to GitHub, including:

```text
backend/
frontend/
README.md
```

Do not commit Python virtual environments or other generated dependency folders.

Suggested commands:

```bash
git init
git add .
git commit -m "Upgrade Employee Management System"
git branch -M main
git remote add origin https://github.com/<your-username>/employee-management-system.git
git push -u origin main
```
