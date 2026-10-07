const API_BASE = '/api';
const APP_CONFIG = {
  currency: 'INR',
  locale: 'en-IN',};

const $ = (id) => document.getElementById(id);

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'NA';
}

function formatCurrency(value) {
  return new Intl.NumberFormat(APP_CONFIG.locale, { style: 'currency', currency: APP_CONFIG.currency, maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(APP_CONFIG.locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function relativeTime(value) {
  if (!value) return '';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function showToast(message, type = 'success') {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.className = 'toast', 3200);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function setupGlobalUI() {
  const themeToggle = $('theme-toggle');
  const storedTheme = localStorage.getItem('ems-theme');
  if (storedTheme === 'dark') document.body.classList.add('dark');
  themeToggle?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('ems-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  });

  $('mobile-menu')?.addEventListener('click', () => $('sidebar')?.classList.toggle('open'));

  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => $('sidebar')?.classList.remove('open')));
}

async function initDashboard() {
  try {
    const health = await api('/health');
    $('status-dot')?.classList.add('online');
    if ($('status-text')) $('status-text').textContent = `API online • ${health.employees} records`;
  } catch (error) {
    if ($('status-text')) $('status-text').textContent = 'API unavailable';
    showToast('Could not connect to Flask API', 'error');
  }

  try {
    const data = await api('/stats');
    $('metric-total').textContent = data.summary.total;
    $('metric-avg').textContent = formatCurrency(data.summary.avg_salary);
    $('metric-payroll').textContent = formatCurrency(data.summary.payroll);
    $('metric-depts').textContent = data.departments.length;

    const maxDept = Math.max(...data.departments.map(d => d.count), 1);
    $('department-bars').innerHTML = data.departments.length ? data.departments.map(d => `
      <div class="bar-row"><span class="bar-label" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${(d.count / maxDept) * 100}%"></span></span><span class="bar-value">${d.count}</span></div>
    `).join('') : '<div class="loading-state">No department data yet.</div>';

    $('activity-list').innerHTML = data.activity.length ? data.activity.map(item => `
      <div class="activity-item"><div class="activity-avatar">${item.action === 'DELETE' ? '−' : item.action === 'UPDATE' ? '↻' : '+'}</div><div class="activity-copy"><strong>${escapeHtml(item.details)}</strong><span>${escapeHtml(item.action)} • ${escapeHtml(item.employee_id || 'System')}</span></div><span class="activity-time">${relativeTime(item.created_at)}</span></div>
    `).join('') : '<div class="loading-state">No activity logged yet.</div>';

    $('recent-table').innerHTML = data.recent.length ? data.recent.map(emp => `
      <tr><td><div class="employee-cell"><div class="employee-avatar">${initials(emp.name)}</div><div class="employee-name"><strong>${escapeHtml(emp.name)}</strong><span>${escapeHtml(emp.employee_id)}</span></div></div></td><td>${escapeHtml(emp.department)}</td><td><span class="pill">${escapeHtml(emp.designation)}</span></td><td>${formatCurrency(emp.salary)}</td><td>${formatDate(emp.created_at)}</td></tr>
    `).join('') : '<tr><td colspan="5"><div class="loading-state">No employee records yet.</div></td></tr>';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

let employeesCache = [];
let deleteTarget = null;

async function loadLookups() {
  const [departments, designations] = await Promise.all([api('/departments'), api('/designations')]);
  const deptSelect = $('department-filter');
  if (deptSelect) {
    deptSelect.innerHTML = '<option value="">All departments</option>' + departments.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)} (${d.employee_count})</option>`).join('');
  }
  const deptList = $('department-options');
  if (deptList) deptList.innerHTML = departments.map(d => `<option value="${escapeHtml(d.name)}"></option>`).join('');
  const desigList = $('designation-options');
  if (desigList) desigList.innerHTML = designations.map(d => `<option value="${escapeHtml(d.title)}"></option>`).join('');
}

async function loadEmployees() {
  const search = $('employee-search')?.value.trim() || '';
  const department = $('department-filter')?.value || '';
  const sort = $('sort-filter')?.value || 'newest';
  const params = new URLSearchParams({ search, department, sort });
  try {
    const data = await api(`/employees?${params.toString()}`);
    employeesCache = data;
    renderEmployees(data);
  } catch (error) {
    showToast(error.message, 'error');
    renderEmployees([]);
  }
}

function renderEmployees(employees) {
  const tbody = $('employees-tbody');
  const empty = $('employee-empty');
  if (!tbody) return;
  $('results-label').textContent = `${employees.length} record${employees.length === 1 ? '' : 's'}`;
  if (!employees.length) {
    tbody.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  tbody.innerHTML = employees.map(emp => `
    <tr>
      <td><div class="employee-cell"><div class="employee-avatar">${initials(emp.name)}</div><div class="employee-name"><strong>${escapeHtml(emp.name)}</strong><span>Updated ${formatDate(emp.updated_at)}</span></div></div></td>
      <td><code>${escapeHtml(emp.employee_id)}</code></td>
      <td><span class="pill">${escapeHtml(emp.department)}</span></td>
      <td>${escapeHtml(emp.designation)}</td>
      <td><strong>${formatCurrency(emp.salary)}</strong></td>
      <td>${escapeHtml(emp.contact)}</td>
      <td><div class="action-group"><button class="table-btn" data-action="edit" data-id="${escapeHtml(emp.employee_id)}">Edit</button><button class="table-btn danger" data-action="delete" data-id="${escapeHtml(emp.employee_id)}">Delete</button></div></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => location.href = `add-employee.html?edit=${encodeURIComponent(btn.dataset.id)}`));
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => openDeleteModal(btn.dataset.id)));
}

function openDeleteModal(employeeId) {
  deleteTarget = employeeId;
  const emp = employeesCache.find(item => item.employee_id === employeeId);
  if ($('delete-text')) $('delete-text').textContent = `You are about to remove ${emp?.name || employeeId} (${employeeId}) from the employee directory. This action cannot be undone.`;
  $('delete-modal')?.classList.remove('hidden');
}

function closeDeleteModal() { deleteTarget = null; $('delete-modal')?.classList.add('hidden'); }

async function confirmDelete() {
  if (!deleteTarget) return;
  const id = deleteTarget;
  try {
    await api(`/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
    closeDeleteModal();
    showToast(`Employee ${id} deleted successfully`);
    await loadEmployees();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function exportCsv() {
  if (!employeesCache.length) { showToast('There are no records to export', 'error'); return; }
  const headers = ['Employee ID', 'Name', 'Department', 'Designation', 'Salary', 'Contact', 'Created At'];
  const rows = employeesCache.map(e => [e.employee_id, e.name, e.department, e.designation, e.salary, e.contact, e.created_at]);
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `employees-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  showToast('CSV export created');
}

function initEmployees() {
  loadLookups().catch(error => showToast(error.message, 'error'));
  loadEmployees();
  $('employee-search')?.addEventListener('input', debounce(loadEmployees, 250));
  $('department-filter')?.addEventListener('change', loadEmployees);
  $('sort-filter')?.addEventListener('change', loadEmployees);
  $('clear-filters')?.addEventListener('click', () => { $('employee-search').value = ''; $('department-filter').value = ''; $('sort-filter').value = 'newest'; loadEmployees(); });
  $('export-csv')?.addEventListener('click', exportCsv);
  $('delete-confirm')?.addEventListener('click', confirmDelete);
  $('delete-cancel')?.addEventListener('click', closeDeleteModal);
  $('delete-modal')?.addEventListener('click', event => { if (event.target.id === 'delete-modal') closeDeleteModal(); });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

async function initForm() {
  const form = $('employee-form');
  if (!form) return;
  try { await loadLookups(); } catch (error) { showToast(error.message, 'error'); }

  const params = new URLSearchParams(location.search);
  const editId = params.get('edit');
  if (editId) {
    try {
      const emp = await api(`/employees/${encodeURIComponent(editId)}`);
      setFormEmployee(emp);
      $('page-form-title').textContent = 'Update Employee';
      $('form-heading').textContent = 'Edit an existing employee profile';
      $('submit-btn').textContent = 'Save changes';
      $('edit-mode').value = 'true';
      $('original-id').value = emp.employee_id;
      $('employee_id').focus();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  $('cancel-btn')?.addEventListener('click', () => {
    if ($('edit-mode').value === 'true') location.href = 'employees.html';
    else form.reset();
  });
  form.addEventListener('submit', submitEmployeeForm);
}

function setFormEmployee(emp) {
  $('employee_id').value = emp.employee_id;
  $('name').value = emp.name;
  $('department').value = emp.department;
  $('designation').value = emp.designation;
  $('salary').value = emp.salary;
  $('contact').value = emp.contact;
}

function clientValidation(payload) {
  if (Object.values(payload).some(value => String(value).trim() === '')) return 'Please complete every required field.';
  if (!/^[A-Za-z0-9_-]+$/.test(payload.employee_id)) return 'Employee ID may contain only letters, numbers, _ or -.';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ .\'-]{2,80}$/.test(payload.name)) return 'Please enter a valid employee name.';
  if (Number.isNaN(Number(payload.salary)) || Number(payload.salary) < 0) return 'Salary must be a valid non-negative number.';
  if (!/^[\d+\-\s()]{7,20}$/.test(payload.contact)) return 'Please enter a valid contact number.';
  return null;
}

async function submitEmployeeForm(event) {
  event.preventDefault();
  const payload = {
    employee_id: $('employee_id').value.trim(),
    name: $('name').value.trim(),
    department: $('department').value.trim(),
    designation: $('designation').value.trim(),
    salary: Number($('salary').value),
    contact: $('contact').value.trim(),
  };
  const validationError = clientValidation(payload);
  if (validationError) { $('form-status').textContent = validationError; $('form-status').className = 'form-status error'; showToast(validationError, 'error'); return; }

  const isEdit = $('edit-mode').value === 'true';
  const originalId = $('original-id').value || payload.employee_id;
  try {
    await api(isEdit ? `/employees/${encodeURIComponent(originalId)}` : '/employees', { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    $('form-status').textContent = isEdit ? 'Changes saved successfully.' : 'Employee created successfully.';
    $('form-status').className = 'form-status success';
    showToast(isEdit ? 'Employee updated successfully' : 'Employee added successfully');
    setTimeout(() => location.href = 'employees.html', 650);
  } catch (error) {
    $('form-status').textContent = error.message;
    $('form-status').className = 'form-status error';
    showToast(error.message, 'error');
  }
}

function setDonutGradient(items) {
  const donut = $('donut-chart');
  if (!donut || !items.length) return;
  const total = items.reduce((sum, x) => sum + x.count, 0);

  const palette = [
    '#4f8fc9',
    '#72b5e3',
    '#9fd3f3',
    '#b9dcf0',
    '#cfe8f5',
    '#8fc5e8',
    '#639fce'
  ];

  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += (item.count / total) * 100;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });

  donut.style.background = `conic-gradient(${stops.join(',')})`;
  $('donut-total').textContent = total;
  $('donut-legend').innerHTML = items.map((item, index) =>
    `<div class="legend-item">
      <span class="legend-left">
        <span class="legend-dot" style="background:${palette[index % palette.length]}"></span>
        <span class="legend-name">${escapeHtml(item.name)}</span>
      </span>
      <span class="legend-count">${item.count}</span>
    </div>`
  ).join('');
}

function initAnalytics() {
  const render = async () => {
    try {
      const data = await api('/stats');
      $('min-salary').textContent = formatCurrency(data.summary.min_salary);
      $('max-salary').textContent = formatCurrency(data.summary.max_salary);
      $('analytics-avg').textContent = formatCurrency(data.summary.avg_salary);
      $('analytics-payroll').textContent = formatCurrency(data.summary.payroll);
      setDonutGradient(data.departments);
      const maxBand = Math.max(...data.salary_bands.map(x => x.count), 1);
      $('salary-bars').innerHTML = data.salary_bands.length ? data.salary_bands.map(item => `<div class="salary-row"><span>${escapeHtml(item.band)}</span><span class="bar-track"><span class="bar-fill" style="width:${(item.count / maxBand) * 100}%"></span></span><strong>${item.count}</strong></div>`).join('') : '<div class="loading-state">No salary data.</div>';
      const total = Number(data.summary.total) || 1;
      $('dept-summary').innerHTML = data.departments.length ? data.departments.map(d => `<tr><td><strong>${escapeHtml(d.name)}</strong></td><td>${d.count}</td><td>${((d.count / total) * 100).toFixed(1)}%</td><td>${formatCurrency(d.payroll)}</td><td>${formatCurrency(d.payroll / d.count)}</td></tr>`).join('') : '<tr><td colspan="5"><div class="loading-state">No department data.</div></td></tr>';
    } catch (error) { showToast(error.message, 'error'); }
  };
  render();
  $('refresh-analytics')?.addEventListener('click', render);
}

setupGlobalUI();
const page = document.body.dataset.page;
if (page === 'dashboard') initDashboard();
if (page === 'employees') initEmployees();
if (page === 'add') initForm();
if (page === 'analytics') initAnalytics();
