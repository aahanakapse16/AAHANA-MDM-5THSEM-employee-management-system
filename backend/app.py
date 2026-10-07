from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
import re
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
DB_PATH = os.path.join(BASE_DIR, 'employees.db')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

ID_RE = re.compile(r'^[A-Za-z0-9_-]+$')
PHONE_RE = re.compile(r'^[\d+\-\s()]{7,20}$')
NAME_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ .'-]{2,80}$")


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def ensure_lookup(conn, table, column, value):
    value = str(value).strip()
    conn.execute(f'INSERT OR IGNORE INTO {table} ({column}) VALUES (?)', (value,))
    row = conn.execute(f'SELECT id FROM {table} WHERE {column} = ?', (value,)).fetchone()
    return row['id']


def init_db():
    conn = get_db()
    try:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS designations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id TEXT,
                action TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL
            );
        ''')

        employee_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='employees'"
        ).fetchone()

        if not employee_table:
            create_employees_table(conn)
        else:
            cols = {row['name'] for row in conn.execute('PRAGMA table_info(employees)').fetchall()}
            if 'department_id' not in cols or 'designation_id' not in cols:
                conn.execute('ALTER TABLE employees RENAME TO employees_legacy')
                create_employees_table(conn)
                legacy_cols = {row['name'] for row in conn.execute('PRAGMA table_info(employees_legacy)').fetchall()}
                if {'employee_id', 'name', 'department', 'designation', 'salary', 'contact'}.issubset(legacy_cols):
                    legacy_rows = conn.execute('SELECT * FROM employees_legacy ORDER BY id ASC').fetchall()
                    for row in legacy_rows:
                        dept_id = ensure_lookup(conn, 'departments', 'name', row['department'])
                        desig_id = ensure_lookup(conn, 'designations', 'title', row['designation'])
                        conn.execute('''
                            INSERT OR IGNORE INTO employees
                            (id, employee_id, name, department_id, designation_id, salary, contact, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            row['id'], row['employee_id'], row['name'], dept_id, desig_id,
                            row['salary'], row['contact'], now_iso(), now_iso()
                        ))
                conn.execute('DROP TABLE employees_legacy')

        conn.executescript('''
            CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
            CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
            CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
            CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);
        ''')
        conn.commit()
    finally:
        conn.close()


def create_employees_table(conn):
    conn.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department_id INTEGER NOT NULL,
            designation_id INTEGER NOT NULL,
            salary REAL NOT NULL CHECK (salary >= 0),
            contact TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (department_id) REFERENCES departments(id),
            FOREIGN KEY (designation_id) REFERENCES designations(id)
        )
    ''')


def validate_employee(data):
    errors = []
    required = ['employee_id', 'name', 'department', 'designation', 'salary', 'contact']
    for field in required:
        if field not in data or str(data[field]).strip() == '':
            errors.append(f'{field.replace("_", " ").title()} is required')

    if data.get('employee_id'):
        employee_id = str(data['employee_id']).strip()
        if not ID_RE.fullmatch(employee_id):
            errors.append('Employee ID may contain only letters, numbers, _ or -')
        if len(employee_id) > 30:
            errors.append('Employee ID must be 30 characters or fewer')

    if data.get('name'):
        name = str(data['name']).strip()
        if not NAME_RE.fullmatch(name):
            errors.append('Name should contain letters, spaces, apostrophes, dots or hyphens')

    if data.get('department') and len(str(data['department']).strip()) > 60:
        errors.append('Department must be 60 characters or fewer')
    if data.get('designation') and len(str(data['designation']).strip()) > 80:
        errors.append('Designation must be 80 characters or fewer')

    if 'salary' in data and data.get('salary') is not None:
        try:
            salary = float(data['salary'])
            if salary < 0:
                errors.append('Salary must be a non-negative number')
            if salary > 100_000_000:
                errors.append('Salary is above the supported limit')
        except (ValueError, TypeError):
            errors.append('Salary must be a valid number')

    if data.get('contact'):
        contact = str(data['contact']).strip()
        if not PHONE_RE.fullmatch(contact):
            errors.append('Contact must be a valid phone number')

    return errors


def employee_query(conn, where='', params=()):
    sql = '''
        SELECT e.id, e.employee_id, e.name, d.name AS department,
               g.title AS designation, e.salary, e.contact,
               e.created_at, e.updated_at
        FROM employees e
        JOIN departments d ON d.id = e.department_id
        JOIN designations g ON g.id = e.designation_id
    '''
    if where:
        sql += ' WHERE ' + where
    sql += ' ORDER BY e.id DESC'
    return conn.execute(sql, params).fetchall()


def employee_dict(row):
    return dict(row) if row else None


def log_action(conn, employee_id, action, details):
    conn.execute(
        'INSERT INTO audit_logs (employee_id, action, details, created_at) VALUES (?, ?, ?, ?)',
        (employee_id, action, details, now_iso())
    )


@app.after_request
def add_cache_headers(response):
    if request.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    return response


@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/api/employees', methods=['GET'])
def list_employees():
    search = request.args.get('search', '').strip()
    department = request.args.get('department', '').strip()
    designation = request.args.get('designation', '').strip()
    sort = request.args.get('sort', 'newest').strip().lower()
    conn = get_db()
    try:
        clauses, params = [], []
        if search:
            like = f'%{search}%'
            clauses.append('(e.employee_id LIKE ? OR e.name LIKE ? OR d.name LIKE ? OR g.title LIKE ? OR e.contact LIKE ?)')
            params.extend([like] * 5)
        if department:
            clauses.append('d.name = ?')
            params.append(department)
        if designation:
            clauses.append('g.title = ?')
            params.append(designation)

        order_by = {
            'newest': 'e.id DESC',
            'oldest': 'e.id ASC',
            'name-asc': 'e.name COLLATE NOCASE ASC',
            'name-desc': 'e.name COLLATE NOCASE DESC',
            'salary-high': 'e.salary DESC',
            'salary-low': 'e.salary ASC',
        }.get(sort, 'e.id DESC')

        rows = conn.execute('''
            SELECT e.id, e.employee_id, e.name, d.name AS department,
                   g.title AS designation, e.salary, e.contact,
                   e.created_at, e.updated_at
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE 1=1
              ''' + ((' AND ' + ' AND '.join(clauses)) if clauses else '') + f' ORDER BY {order_by}', tuple(params)).fetchall()
        return jsonify([employee_dict(row) for row in rows])
    finally:
        conn.close()


@app.route('/api/employees/<employee_id>', methods=['GET'])
def get_employee(employee_id):
    conn = get_db()
    try:
        row = conn.execute('''
            SELECT e.id, e.employee_id, e.name, d.name AS department,
                   g.title AS designation, e.salary, e.contact,
                   e.created_at, e.updated_at
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id = ?
        ''', (employee_id,)).fetchone()
        if not row:
            return jsonify({'error': 'Employee not found'}), 404
        return jsonify(employee_dict(row))
    finally:
        conn.close()


@app.route('/api/employees', methods=['POST'])
def add_employee():
    data = request.get_json(silent=True) or {}
    errors = validate_employee(data)
    if errors:
        return jsonify({'error': '; '.join(errors)}), 400

    emp_id = str(data['employee_id']).strip()
    conn = get_db()
    try:
        department_id = ensure_lookup(conn, 'departments', 'name', data['department'])
        designation_id = ensure_lookup(conn, 'designations', 'title', data['designation'])
        timestamp = now_iso()
        conn.execute('''
            INSERT INTO employees
            (employee_id, name, department_id, designation_id, salary, contact, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (emp_id, str(data['name']).strip(), department_id, designation_id,
              float(data['salary']), str(data['contact']).strip(), timestamp, timestamp))
        log_action(conn, emp_id, 'CREATE', f'Created employee {emp_id}')
        conn.commit()
        row = conn.execute('''
            SELECT e.id, e.employee_id, e.name, d.name AS department,
                   g.title AS designation, e.salary, e.contact,
                   e.created_at, e.updated_at
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id = ?
        ''', (emp_id,)).fetchone()
        return jsonify(employee_dict(row)), 201
    except sqlite3.IntegrityError:
        conn.rollback()
        return jsonify({'error': f'Employee ID "{emp_id}" already exists'}), 409
    finally:
        conn.close()


@app.route('/api/employees/<employee_id>', methods=['PUT'])
def update_employee(employee_id):
    data = request.get_json(silent=True) or {}
    data['employee_id'] = data.get('employee_id', employee_id)
    errors = validate_employee(data)
    if errors:
        return jsonify({'error': '; '.join(errors)}), 400

    new_emp_id = str(data['employee_id']).strip()
    conn = get_db()
    try:
        existing = conn.execute('SELECT id FROM employees WHERE employee_id = ?', (employee_id,)).fetchone()
        if not existing:
            return jsonify({'error': 'Employee not found'}), 404
        if new_emp_id != employee_id:
            conflict = conn.execute('SELECT id FROM employees WHERE employee_id = ?', (new_emp_id,)).fetchone()
            if conflict:
                return jsonify({'error': f'Employee ID "{new_emp_id}" already exists'}), 409

        department_id = ensure_lookup(conn, 'departments', 'name', data['department'])
        designation_id = ensure_lookup(conn, 'designations', 'title', data['designation'])
        conn.execute('''
            UPDATE employees
            SET employee_id = ?, name = ?, department_id = ?, designation_id = ?,
                salary = ?, contact = ?, updated_at = ?
            WHERE employee_id = ?
        ''', (new_emp_id, str(data['name']).strip(), department_id, designation_id,
              float(data['salary']), str(data['contact']).strip(), now_iso(), employee_id))
        log_action(conn, new_emp_id, 'UPDATE', f'Updated employee {employee_id}')
        conn.commit()
        row = conn.execute('''
            SELECT e.id, e.employee_id, e.name, d.name AS department,
                   g.title AS designation, e.salary, e.contact,
                   e.created_at, e.updated_at
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id = ?
        ''', (new_emp_id,)).fetchone()
        return jsonify(employee_dict(row))
    finally:
        conn.close()


@app.route('/api/employees/<employee_id>', methods=['DELETE'])
def delete_employee(employee_id):
    conn = get_db()
    try:
        existing = conn.execute('SELECT id FROM employees WHERE employee_id = ?', (employee_id,)).fetchone()
        if not existing:
            return jsonify({'error': 'Employee not found'}), 404
        conn.execute('DELETE FROM employees WHERE employee_id = ?', (employee_id,))
        log_action(conn, employee_id, 'DELETE', f'Deleted employee {employee_id}')
        conn.commit()
        return jsonify({'message': f'Employee {employee_id} deleted successfully'})
    finally:
        conn.close()


@app.route('/api/departments', methods=['GET'])
def list_departments():
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT d.id, d.name, COUNT(e.id) AS employee_count
            FROM departments d
            LEFT JOIN employees e ON e.department_id = d.id
            GROUP BY d.id
            ORDER BY d.name COLLATE NOCASE
        ''').fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route('/api/designations', methods=['GET'])
def list_designations():
    conn = get_db()
    try:
        rows = conn.execute('SELECT id, title FROM designations ORDER BY title COLLATE NOCASE').fetchall()
        return jsonify([dict(row) for row in rows])
    finally:
        conn.close()


@app.route('/api/stats', methods=['GET'])
def stats():
    conn = get_db()
    try:
        summary = conn.execute('''
            SELECT COUNT(*) AS total,
                   COALESCE(AVG(salary), 0) AS avg_salary,
                   COALESCE(SUM(salary), 0) AS payroll,
                   COALESCE(MIN(salary), 0) AS min_salary,
                   COALESCE(MAX(salary), 0) AS max_salary
            FROM employees
        ''').fetchone()
        departments = conn.execute('''
            SELECT d.name, COUNT(e.id) AS count, COALESCE(SUM(e.salary), 0) AS payroll
            FROM departments d
            LEFT JOIN employees e ON e.department_id = d.id
            GROUP BY d.id
            HAVING COUNT(e.id) > 0
            ORDER BY count DESC, d.name ASC
        ''').fetchall()
        salary_bands = conn.execute('''
            SELECT band, COUNT(*) AS count FROM (
                SELECT CASE
                    WHEN salary < 50000 THEN 'Below 50K'
                    WHEN salary < 100000 THEN '50K – 99K'
                    WHEN salary < 200000 THEN '100K – 199K'
                    ELSE '200K+'
                END AS band
                FROM employees
            ) GROUP BY band
            ORDER BY CASE band
                WHEN 'Below 50K' THEN 1
                WHEN '50K – 99K' THEN 2
                WHEN '100K – 199K' THEN 3
                ELSE 4 END
        ''').fetchall()
        recent = conn.execute('''
            SELECT e.employee_id, e.name, d.name AS department, g.title AS designation, e.salary, e.created_at
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            ORDER BY e.created_at DESC, e.id DESC LIMIT 6
        ''').fetchall()
        activity = conn.execute('''
            SELECT employee_id, action, details, created_at
            FROM audit_logs ORDER BY id DESC LIMIT 8
        ''').fetchall()
        return jsonify({
            'summary': dict(summary),
            'departments': [dict(row) for row in departments],
            'salary_bands': [dict(row) for row in salary_bands],
            'recent': [dict(row) for row in recent],
            'activity': [dict(row) for row in activity],
        })
    finally:
        conn.close()


@app.route('/api/health', methods=['GET'])
def health():
    conn = get_db()
    try:
        employee_count = conn.execute('SELECT COUNT(*) FROM employees').fetchone()[0]
        return jsonify({'status': 'ok', 'database': 'connected', 'employees': employee_count})
    finally:
        conn.close()


if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='127.0.0.1', port=5000)
else:
    init_db()

