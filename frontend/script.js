const API = '/api';
const $ = (id) => document.getElementById(id);
let members = [], coaches = [], assignments = [];
let sqlLogs = [], currentLogFilter = 'all';
let currentRole = 'admin'; // 'admin' or 'user'
let liveSyncInterval = null;

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials = (name='') => name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const dateLabel = (value) => value ? new Date(value).toLocaleDateString() : '—';

async function request(url, options={}) {
  const response = await fetch(API + url, { headers:{'Content-Type':'application/json'}, ...options });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  if (data.sql) {
    updateDockBar({ operation: 'DML', rendered_sql: data.sql, duration_ms: 5, rows_affected: 1 });
  }
  return data;
}

function notify(message, error=false) {
  const n = $('notice');
  n.textContent = message;
  n.classList.toggle('error', error);
  n.hidden = false;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => n.hidden = true, 5000);
}

function setRole(role) {
  currentRole = role;
  const isAdmin = role === 'admin';
  $('role-admin-btn').classList.toggle('active', isAdmin);
  $('role-user-btn').classList.toggle('active', !isAdmin);
  $('role-breadcrumb-badge').textContent = isAdmin ? 'ADMIN MODE' : 'MEMBER PORTAL';
  $('role-breadcrumb-badge').style.background = isAdmin ? '#182820' : '#233d26';
  $('header-switch-role-btn').textContent = isAdmin ? 'Switch to Member Portal ➔' : 'Switch to Admin Dashboard ➔';
  
  if (!isAdmin) {
    nav('user-portal');
  } else {
    nav('dashboard');
  }
}

function nav(view) {
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== `${view}-view`);
  document.querySelectorAll('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const titles = {
    dashboard: ['Dashboard overview', 'OVERVIEW'],
    members: ['Member directory', 'MEMBERS'],
    coaches: ['Coach directory', 'COACHES'],
    assignments: ['Coach assignments', 'ASSIGNMENTS'],
    'admin-live-db': ['Live Database (Admin Only)', 'ADMIN AUDIT'],
    'user-portal': ['Member Self-Service Portal', 'USER PORTAL'],
    'sql-console': ['Live SQL Monitor & Console', 'SQL MONITOR']
  };
  $('page-title').textContent = titles[view][0];
  $('crumb').textContent = titles[view][1];

  if (view === 'sql-console') {
    loadSqlLogs();
    loadSqlTables();
  } else if (view === 'admin-live-db') {
    loadLiveUserUpdates();
  } else if (view === 'user-portal') {
    initUserPortal();
  }
}

async function loadAll() {
  try {
    [members, coaches, assignments] = await Promise.all([
      request('/members'),
      request('/coaches'),
      request('/assignments')
    ]);
    $('db-status').textContent = 'Oracle Database XE connected';
    $('top-sql-text').textContent = 'Oracle XE: Connected';
    renderAll();
    
    const d = await request('/dashboard');
    $('stat-members').textContent = d.TOTAL_MEMBERS;
    $('stat-coaches').textContent = d.TOTAL_COACHES;
    $('stat-assigned').textContent = d.ASSIGNED_MEMBERS;
    $('stat-unassigned').textContent = d.UNASSIGNED_MEMBERS;

    await loadSqlLogs();
    await loadLiveUserUpdates();
    populateUserPortalDropdown();
  } catch(err) {
    $('db-status').textContent = 'Oracle connection unavailable';
    $('top-sql-text').textContent = 'DB: Disconnected';
    notify(err.message + ' Confirm Oracle is running and backend is online.', true);
  }
}

function renderAll() {
  renderRecent();
  renderMembers();
  renderCoaches();
  renderAssignments();
  renderSelects();
  populateUserPortalDropdown();
}

function memberCell(m) {
  return `<div class="member-cell"><span class="member-avatar">${escapeHtml(initials(m.MEMBER_NAME))}</span><span><strong>${escapeHtml(m.MEMBER_NAME)}</strong><small>${escapeHtml(m.CARD_NO)}</small></span></div>`;
}

function renderRecent() {
  const rows = members.slice(0, 5);
  $('recent-members').innerHTML = rows.length ? rows.map(m => `
    <tr>
      <td>${memberCell(m)}</td>
      <td><span class="goal-pill">${escapeHtml(m.FITNESS_GOAL)}</span></td>
      <td>${escapeHtml(m.COACH_NAME || '—')}</td>
      <td><span class="status-pill ${m.COACH_ID ? 'assigned' : 'unassigned'}">${m.COACH_ID ? 'Assigned' : 'Needs coach'}</span></td>
    </tr>
  `).join('') : `<tr><td colspan="4" class="empty-state">No members yet. Add your first member to get started.</td></tr>`;

  const max = Math.max(1, ...coaches.map(c => Number(c.MEMBER_COUNT || 0)));
  $('coach-capacity').innerHTML = coaches.slice(0, 5).map(c => `
    <div class="capacity-item">
      <div class="capacity-title">
        <strong>${escapeHtml(c.COACH_NAME)}</strong>
        <span>${c.MEMBER_COUNT} member${c.MEMBER_COUNT === 1 ? '' : 's'}</span>
      </div>
      <div class="progress">
        <span style="width:${Math.min(100, Number(c.MEMBER_COUNT) / max * 100)}%"></span>
      </div>
    </div>
  `).join('') || '<div class="empty-state">No coaches registered yet.</div>';
}

function renderMembers() {
  const search = $('member-search').value.trim().toLowerCase();
  const goal = $('goal-filter').value;
  const coach = $('member-coach-filter').value;
  
  const filtered = members.filter(m => (
    (!search || [m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, m.COACH_NAME, m.COACH_ID].some(v => String(v ?? '').toLowerCase().includes(search))) &&
    (!goal || m.FITNESS_GOAL === goal) &&
    (!coach || String(m.COACH_ID) === coach)
  ));
  
  $('members-table').innerHTML = filtered.length ? filtered.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.CARD_NO)}</strong></td>
      <td>${memberCell(m)}</td>
      <td><span class="goal-pill">${escapeHtml(m.FITNESS_GOAL)}</span></td>
      <td><span class="coach-name">${escapeHtml(m.COACH_NAME || '—')}</span>${m.COACH_ID ? `<small style="display:block;color:#9aa39c;margin-top:4px">ID ${m.COACH_ID}</small>` : ''}</td>
      <td><span class="status-pill ${m.COACH_ID ? 'assigned' : 'unassigned'}">${m.COACH_ID ? 'Assigned' : 'Unassigned'}</span></td>
      <td>
        <div class="action-group">
          <button class="action-btn" data-action="view-member" data-id="${escapeHtml(m.CARD_NO)}">View</button>
          <button class="action-btn" data-action="edit-member" data-id="${escapeHtml(m.CARD_NO)}">Edit</button>
          <button class="action-btn" data-action="assign-member" data-id="${escapeHtml(m.CARD_NO)}">${m.COACH_ID ? 'Reassign' : 'Assign'}</button>
          <button class="action-btn danger" data-action="delete-member" data-id="${escapeHtml(m.CARD_NO)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No members match your search.</td></tr>';
  $('members-count').textContent = `Showing ${filtered.length} of ${members.length} members`;
}

function renderCoaches() {
  const q = $('coach-search').value.trim().toLowerCase();
  const filtered = coaches.filter(c => [c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION].some(v => String(v ?? '').toLowerCase().includes(q)));
  $('coaches-grid').innerHTML = filtered.length ? filtered.map(c => `
    <article class="coach-card">
      <div class="coach-card-head">
        <div class="coach-avatar">${escapeHtml(initials(c.COACH_NAME))}</div>
        <div><h3>${escapeHtml(c.COACH_NAME)}</h3><span class="coach-id">COACH ID · ${c.COACH_ID}</span></div>
      </div>
      <span class="specialty">${escapeHtml(c.SPECIALIZATION || 'General Fitness')}</span>
      <div class="coach-metrics">
        <div><strong>${c.MEMBER_COUNT}</strong><small>Assigned members</small></div>
        <div style="text-align:right"><strong style="font-size:16px">${c.EXPERIENCE_YEARS}</strong><small>Years experience</small></div>
      </div>
      <div class="action-group">
        <button class="action-btn" data-action="coach-members" data-id="${c.COACH_ID}">View members</button>
        <button class="action-btn" data-action="edit-coach" data-id="${c.COACH_ID}">Edit</button>
        <button class="action-btn danger" data-action="delete-coach" data-id="${c.COACH_ID}">Delete</button>
      </div>
    </article>
  `).join('') : '<div class="panel empty-state">No coaches match your search.</div>';
}

function renderAssignments() {
  $('assignments-table').innerHTML = assignments.length ? assignments.map(a => `
    <tr>
      <td>${memberCell({CARD_NO: a.CARD_NO, MEMBER_NAME: a.MEMBER_NAME})}</td>
      <td><span class="goal-pill">${escapeHtml(a.FITNESS_GOAL)}</span></td>
      <td><strong>${escapeHtml(a.COACH_NAME)}</strong><small style="display:block;color:#9aa39c;margin-top:4px">ID ${a.COACH_ID}</small></td>
      <td>${dateLabel(a.ASSIGNED_ON)}</td>
      <td>
        <div class="action-group">
          <button class="action-btn" data-action="reassign" data-id="${escapeHtml(a.CARD_NO)}">Reassign</button>
          <button class="action-btn danger" data-action="remove-assignment" data-id="${escapeHtml(a.CARD_NO)}">Remove</button>
        </div>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No assignments yet. Create a match above.</td></tr>';
}

function renderSelects() {
  const oldMember = $('assignment-member').value;
  const oldCoach = $('assignment-coach').value;
  const oldFilter = $('member-coach-filter').value;
  const assigned = new Set(assignments.map(a => a.CARD_NO));

  $('assignment-member').innerHTML = '<option value="">Select member</option>' + members.map(m => `
    <option value="${escapeHtml(m.CARD_NO)}">${escapeHtml(m.CARD_NO)} — ${escapeHtml(m.MEMBER_NAME)}${assigned.has(m.CARD_NO) ? ' (assigned)' : ''}</option>
  `).join('');
  
  $('assignment-coach').innerHTML = '<option value="">Select coach</option>' + coaches.map(c => `
    <option value="${c.COACH_ID}">${c.COACH_ID} — ${escapeHtml(c.COACH_NAME)}</option>
  `).join('');
  
  $('member-coach-filter').innerHTML = '<option value="">All coaches</option>' + coaches.map(c => `
    <option value="${c.COACH_ID}">${c.COACH_ID} — ${escapeHtml(c.COACH_NAME)}</option>
  `).join('');

  $('assignment-member').value = oldMember;
  $('assignment-coach').value = oldCoach;
  $('member-coach-filter').value = oldFilter;
}

function openMember(mode='create', m=null) {
  $('member-form').reset();
  $('member-mode').value = mode;
  $('member-card').disabled = mode === 'edit';
  $('member-modal-title').textContent = mode === 'edit' ? 'Edit member' : mode === 'view' ? 'Member details' : 'Add member';
  $('member-card').value = m?.CARD_NO || '';
  $('member-name').value = m?.MEMBER_NAME || '';
  $('member-goal').value = m?.FITNESS_GOAL || '';
  $('member-phone').value = m?.PHONE || '';
  const readOnly = mode === 'view';
  ['member-name', 'member-goal', 'member-phone'].forEach(id => $(id).disabled = readOnly);
  $('member-form').querySelector('[type=submit]').hidden = readOnly;
  $('member-dialog').showModal();
}

function openCoach(mode='create', c=null) {
  $('coach-form').reset();
  $('coach-mode').value = mode;
  $('coach-id').disabled = mode === 'edit';
  $('coach-modal-title').textContent = mode === 'edit' ? 'Edit coach' : 'Add coach';
  $('coach-id').value = c?.COACH_ID || '';
  $('coach-name').value = c?.COACH_NAME || '';
  $('coach-specialization').value = c?.SPECIALIZATION || 'General Fitness';
  $('coach-experience').value = c?.EXPERIENCE_YEARS ?? 0;
  $('coach-contact').value = c?.CONTACT_NO || '';
  $('coach-dialog').showModal();
}

function goAssign(cardNo) {
  nav('assignments');
  $('assignment-member').value = cardNo;
  const existing = assignments.find(a => a.CARD_NO === cardNo);
  if (existing) $('assignment-coach').value = String(existing.COACH_ID);
}

async function runAction(action, id) {
  try {
    if (action === 'view-member') {
      const m = await request('/members/' + encodeURIComponent(id));
      openMember('view', m);
    }
    if (action === 'edit-member') {
      const m = await request('/members/' + encodeURIComponent(id));
      openMember('edit', m);
    }
    if (action === 'assign-member') goAssign(id);
    if (action === 'delete-member' && confirm(`Delete member ${id}? This also removes their assignment in SQL.`)) {
      const res = await request('/members/' + encodeURIComponent(id), { method: 'DELETE' });
      notify('Member deleted from Oracle SQL table.');
      await loadAll();
    }
    if (action === 'edit-coach') {
      const c = await request('/coaches/' + id);
      openCoach('edit', c);
    }
    if (action === 'delete-coach' && confirm(`Delete coach ${id}? Coaches with active assignments cannot be deleted.`)) {
      const res = await request('/coaches/' + id, { method: 'DELETE' });
      notify('Coach deleted.');
      await loadAll();
    }
    if (action === 'remove-assignment' && confirm(`Remove the coach assignment for ${id}? The member will remain registered.`)) {
      const res = await request('/assignments/' + encodeURIComponent(id), { method: 'DELETE' });
      notify('Assignment row removed from COACH_ASSIGNMENT.');
      await loadAll();
    }
    if (action === 'reassign') goAssign(id);
    if (action === 'coach-members') {
      nav('members');
      $('member-coach-filter').value = id;
      renderMembers();
      notify(`Filter: Showing members assigned to coach ${id}.`);
    }
  } catch(err) {
    notify(err.message, true);
  }
}

// --------------------------------------------------------------------------
// ADMIN LIVE DATABASE AUDIT STREAM LOGIC
// --------------------------------------------------------------------------
async function loadLiveUserUpdates() {
  try {
    const data = await request('/admin/live-updates');
    const updates = data.updates || [];
    
    // Update badge with pulse
    const badge = $('admin-live-badge');
    badge.textContent = updates.length;
    if (updates.length > 0) {
      badge.classList.add('pulse');
      setTimeout(() => badge.classList.remove('pulse'), 400);
    }
    
    $('live-total-user-updates').textContent = updates.length;
    $('live-updates-count-footer').textContent = `${updates.length} live audit log entries recorded in Oracle Database`;

    if (updates.length > 0) {
      const latest = updates[0];
      $('live-last-update-time').textContent = latest.UPDATED_AT;
      $('live-last-update-relative').textContent = `Latest: ${latest.MEMBER_NAME} (${latest.FIELD_CHANGED})`;
    } else {
      $('live-last-update-time').textContent = 'No updates yet';
      $('live-last-update-relative').textContent = 'Awaiting user activity';
    }

    const tbody = $('live-user-updates-tbody');
    if (!updates.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No user updates recorded yet. Go to 'User Portal' to update a member profile and watch it appear here live!</td></tr>`;
      return;
    }

    tbody.innerHTML = updates.map(item => `
      <tr>
        <td>
          <strong style="color:#213728;">${escapeHtml(item.UPDATED_AT)}</strong>
          <small style="display:block;color:#85968b;margin-top:2px;">Audit Log #${item.LOG_ID}</small>
        </td>
        <td>
          <div class="member-cell">
            <span class="member-avatar">${escapeHtml(initials(item.MEMBER_NAME))}</span>
            <span>
              <strong>${escapeHtml(item.MEMBER_NAME)}</strong>
              <small>${escapeHtml(item.CARD_NO)}</small>
            </span>
          </div>
        </td>
        <td>
          <span class="status-pill assigned" style="font-weight:700;">${escapeHtml(item.FIELD_CHANGED)}</span>
        </td>
        <td>
          <span class="diff-pill-old">${escapeHtml(item.OLD_VALUE || 'None')}</span>
          <span class="diff-arrow">➔</span>
          <span class="diff-pill-new">${escapeHtml(item.NEW_VALUE || 'None')}</span>
        </td>
        <td>
          <code style="font-family:Consolas,monospace;font-size:10px;background:#0d1812;color:#9de85f;padding:4px 8px;border-radius:6px;display:inline-block;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(item.SQL_STATEMENT || '')}
          </code>
          <button class="action-btn" style="margin-left:6px;" onclick="copySql('${encodeURIComponent(item.SQL_STATEMENT)}')">Copy</button>
        </td>
        <td>
          <span class="status-pill assigned">COMMITTED</span>
        </td>
      </tr>
    `).join('');

  } catch(err) {
    console.error('Failed to load admin live updates:', err);
  }
}

// --------------------------------------------------------------------------
// USER PORTAL: SELF-SERVICE PROFILE UPDATES
// --------------------------------------------------------------------------
function populateUserPortalDropdown() {
  const sel = $('portal-member-select');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Choose Member Profile --</option>' + members.map(m => `
    <option value="${escapeHtml(m.CARD_NO)}">${escapeHtml(m.CARD_NO)} — ${escapeHtml(m.MEMBER_NAME)} (${escapeHtml(m.FITNESS_GOAL)})</option>
  `).join('');
  if (currentVal) sel.value = currentVal;
  else if (members.length > 0 && !sel.value) {
    sel.value = members[0].CARD_NO;
    loadUserPortalCard(members[0].CARD_NO);
  }
}

function initUserPortal() {
  populateUserPortalDropdown();
  const cardNo = $('portal-member-select').value;
  if (cardNo) {
    loadUserPortalCard(cardNo);
  }
}

function loadUserPortalCard(cardNo) {
  const m = members.find(x => x.CARD_NO === cardNo);
  if (!m) return;

  $('portal-card-avatar').textContent = initials(m.MEMBER_NAME);
  $('portal-card-name').textContent = m.MEMBER_NAME;
  $('portal-card-number').textContent = `CARD NO: ${m.CARD_NO}`;
  $('portal-card-goal').textContent = m.FITNESS_GOAL;
  $('portal-card-phone').textContent = m.PHONE || 'Not Provided';
  $('portal-card-coach').textContent = m.COACH_NAME ? `${m.COACH_NAME} (ID ${m.COACH_ID})` : 'No Coach Assigned';
  $('portal-card-joined').textContent = dateLabel(m.JOIN_DATE);

  // Fill Form
  $('user-edit-name').value = m.MEMBER_NAME;
  $('user-edit-goal').value = m.FITNESS_GOAL;
  $('user-edit-phone').value = m.PHONE || '';
  $('user-update-success-box').hidden = true;
}

$('portal-member-select').addEventListener('change', (e) => {
  if (e.target.value) {
    loadUserPortalCard(e.target.value);
  }
});

$('user-profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cardNo = $('portal-member-select').value;
  if (!cardNo) {
    notify('Please select a member profile first.', true);
    return;
  }

  const payload = {
    cardNo: cardNo,
    memberName: $('user-edit-name').value.trim(),
    fitnessGoal: $('user-edit-goal').value,
    phone: $('user-edit-phone').value.trim()
  };

  const btn = $('save-user-profile-btn');
  btn.disabled = true;
  btn.textContent = 'Saving to Database...';

  try {
    const res = await request('/user/update-profile', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    notify(res.message);
    $('user-update-success-box').hidden = false;
    $('user-update-timestamp').textContent = `Recorded at ${res.timestamp}`;
    $('user-update-sql-code').textContent = res.sql;

    // Refresh application cache & live audit feed
    await loadAll();
    loadUserPortalCard(cardNo);
    await loadLiveUserUpdates();
  } catch(err) {
    notify(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save & Update My Profile in Database';
  }
});

$('btn-goto-admin-live').addEventListener('click', () => {
  setRole('admin');
  nav('admin-live-db');
});

// --------------------------------------------------------------------------
// LIVE SQL MONITOR, RUNNER & DOCKED BAR LOGIC
// --------------------------------------------------------------------------
function updateDockBar(item) {
  if (!item) return;
  const op = item.operation || 'SQL';
  $('dock-op').textContent = op;
  $('dock-op').className = `dock-op op-${op}`;
  $('dock-code').textContent = item.rendered_sql || item.raw_sql || 'Query executed';
  $('dock-meta').textContent = `${item.rows_affected ?? 0} row(s) • ${item.duration_ms ?? 0}ms`;

  const badge = $('sql-badge');
  badge.classList.add('pulse');
  setTimeout(() => badge.classList.remove('pulse'), 400);
}

async function loadSqlLogs() {
  try {
    const data = await request('/sql/logs');
    sqlLogs = data.logs || [];
    $('sql-badge').textContent = data.total_queries || sqlLogs.length;
    $('sql-total-queries').textContent = data.total_queries || sqlLogs.length;
    $('sql-log-count').textContent = sqlLogs.length;

    const writes = sqlLogs.filter(l => ['INSERT', 'UPDATE', 'DELETE'].includes(l.operation)).length;
    $('sql-total-writes').textContent = writes;

    if (data.engine) {
      $('sql-engine-name').textContent = data.engine;
    }

    if (sqlLogs.length > 0) {
      updateDockBar(sqlLogs[0]);
    }
    renderSqlActivity();
  } catch (err) {
    console.error('Failed to load SQL logs:', err);
  }
}

function renderSqlActivity() {
  let list = sqlLogs;
  if (currentLogFilter === 'changes') {
    list = sqlLogs.filter(l => ['INSERT', 'UPDATE', 'DELETE'].includes(l.operation));
  } else if (currentLogFilter === 'reads') {
    list = sqlLogs.filter(l => l.operation === 'SELECT');
  }

  const container = $('sql-activity-list');
  if (!list.length) {
    container.innerHTML = '<div class="panel empty-state">No SQL statements recorded for this filter.</div>';
    return;
  }

  container.innerHTML = list.map(item => `
    <article class="sql-log-item">
      <div class="sql-log-header">
        <div class="sql-log-meta">
          <span class="op-badge op-${item.operation}">${item.operation}</span>
          <span style="font-weight:700;font-size:11px;color:#394c40;">Table: ${item.table}</span>
          <span class="result-time-pill" style="font-size:9px;">${item.duration_ms} ms</span>
        </div>
        <span class="sql-log-time">${item.timestamp}</span>
      </div>
      <code class="sql-log-code">${escapeHtml(item.rendered_sql)}</code>
      <div class="sql-log-footer">
        <span>Rows affected/returned: <strong>${item.rows_affected}</strong></span>
        <button class="action-btn" onclick="copySql('${encodeURIComponent(item.rendered_sql)}')">Copy SQL</button>
      </div>
    </article>
  `).join('');
}

window.copySql = function(encoded) {
  const sql = decodeURIComponent(encoded);
  navigator.clipboard.writeText(sql).then(() => {
    notify('SQL query copied to clipboard!');
  }).catch(() => {
    notify('Unable to copy SQL.', true);
  });
};

async function loadSqlTables() {
  try {
    const data = await request('/sql/tables');
    const container = $('tables-inspector-grid');
    if (!data.tables || !data.tables.length) return;
    
    container.innerHTML = data.tables.map(t => `
      <article class="table-schema-card">
        <h3>
          <span>${t.name}</span>
          <span class="table-row-count-badge">${t.rows} rows</span>
        </h3>
        <p>${t.description}</p>
        <div style="font-size:10px;font-weight:700;color:#85958a;margin-bottom:6px;">COLUMNS & CONSTRAINTS</div>
        <ul class="col-list">
          ${t.columns.map(col => `<li>${col}</li>`).join('')}
        </ul>
        <button class="btn btn-secondary" style="width:100%;margin-top:14px;font-size:11px;" onclick="loadTableQuery('${t.name}')">
          Query ${t.name} →
        </button>
      </article>
    `).join('');
  } catch(err) {
    console.error('Failed to load table schema:', err);
  }
}

window.loadTableQuery = function(tableName) {
  $('sql-query-input').value = `SELECT * FROM ${tableName}`;
  document.querySelectorAll('.sql-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sqltab === 'playground'));
  document.querySelectorAll('.sql-tab-content').forEach(c => c.hidden = c.id !== 'sqltab-playground');
  runCustomSql();
};

async function runCustomSql() {
  const sql = $('sql-query-input').value.trim();
  if (!sql) {
    notify('Please enter an SQL statement to execute.', true);
    return;
  }
  
  $('run-sql-btn').disabled = true;
  $('run-sql-btn').textContent = 'Executing...';
  
  try {
    const res = await request('/sql/execute', {
      method: 'POST',
      body: JSON.stringify({ sql })
    });
    
    $('query-result-panel').hidden = false;
    $('result-time-pill').textContent = `${res.duration_ms} ms`;
    
    if (res.type === 'SELECT') {
      $('result-stat-text').textContent = `Query Results: ${res.row_count} row(s) returned`;
      const thead = $('custom-query-thead');
      const tbody = $('custom-query-tbody');
      
      if (res.columns && res.columns.length) {
        thead.innerHTML = `<tr>${res.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
      } else {
        thead.innerHTML = '';
      }
      
      if (res.rows && res.rows.length) {
        tbody.innerHTML = res.rows.map(row => `
          <tr>
            ${res.columns.map(col => `<td>${escapeHtml(row[col])}</td>`).join('')}
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="${res.columns.length || 1}" class="empty-state">0 rows returned.</td></tr>`;
      }
    } else {
      $('result-stat-text').textContent = res.message || 'Executed successfully.';
      $('custom-query-thead').innerHTML = '<tr><th>STATUS</th><th>ROWS AFFECTED</th></tr>';
      $('custom-query-tbody').innerHTML = `<tr><td><span class="status-pill assigned">SUCCESS</span></td><td><strong>${res.rows_affected}</strong></td></tr>`;
      loadAll();
    }
    
    notify('SQL statement executed successfully.');
    await loadSqlLogs();
  } catch (err) {
    $('query-result-panel').hidden = false;
    $('result-stat-text').textContent = 'SQL Execution Error';
    $('result-time-pill').textContent = 'Error';
    $('custom-query-thead').innerHTML = '<tr><th>ERROR MESSAGE</th></tr>';
    $('custom-query-tbody').innerHTML = `<tr><td style="color:#b91c1c;font-weight:700;">${escapeHtml(err.message)}</td></tr>`;
    notify(err.message, true);
    await loadSqlLogs();
  } finally {
    $('run-sql-btn').disabled = false;
    $('run-sql-btn').textContent = '▶ Run SQL Statement';
  }
}

// --------------------------------------------------------------------------
// EVENT LISTENERS
// --------------------------------------------------------------------------
document.querySelectorAll('.nav-link').forEach(b => b.addEventListener('click', () => nav(b.dataset.view)));
document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => nav(b.dataset.go)));

$('sql-quick-pill').addEventListener('click', () => nav('sql-console'));
$('dock-view-logs').addEventListener('click', () => nav('sql-console'));

// Role Switchers
$('role-admin-btn').addEventListener('click', () => setRole('admin'));
$('role-user-btn').addEventListener('click', () => setRole('user'));
$('header-switch-role-btn').addEventListener('click', () => setRole(currentRole === 'admin' ? 'user' : 'admin'));

$('refresh-live-db-btn').addEventListener('click', async () => {
  await loadLiveUserUpdates();
  notify('Admin Live Database feed refreshed.');
});

$('clear-live-db-btn').addEventListener('click', async () => {
  if (confirm('Clear all user update audit logs from the database?')) {
    await request('/admin/live-updates/clear', { method: 'POST' });
    await loadLiveUserUpdates();
    notify('Live audit history cleared.');
  }
});

$('quick-add').addEventListener('click', () => openMember());
$('add-member-btn').addEventListener('click', () => openMember());
$('add-coach-btn').addEventListener('click', () => openCoach());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));

$('member-search').addEventListener('input', renderMembers);
$('goal-filter').addEventListener('change', renderMembers);
$('member-coach-filter').addEventListener('change', renderMembers);
$('coach-search').addEventListener('input', renderCoaches);

document.body.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (b) runAction(b.dataset.action, b.dataset.id);
});

// SQL Tabs
document.querySelectorAll('.sql-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sql-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.sqltab;
    document.querySelectorAll('.sql-tab-content').forEach(content => {
      content.hidden = content.id !== `sqltab-${target}`;
    });
  });
});

// SQL Presets
$('sql-preset-select').addEventListener('change', (e) => {
  if (e.target.value) {
    $('sql-query-input').value = e.target.value;
  }
});

// Run SQL Button
$('run-sql-btn').addEventListener('click', runCustomSql);

// Refresh & Clear SQL Logs
$('refresh-sql-btn').addEventListener('click', async () => {
  await loadSqlLogs();
  notify('SQL execution logs refreshed.');
});

$('clear-sql-btn').addEventListener('click', async () => {
  await request('/sql/clear', { method: 'POST' });
  await loadSqlLogs();
  notify('SQL log history cleared.');
});

// Filter Activity Logs
document.querySelectorAll('[data-filter]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(el => el.classList.remove('active'));
    b.classList.add('active');
    currentLogFilter = b.dataset.filter;
    renderSqlActivity();
  });
});

// Member Form Submit (Admin)
$('member-form').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = $('member-mode').value;
  const payload = {
    cardNo: $('member-card').value.trim(),
    memberName: $('member-name').value.trim(),
    fitnessGoal: $('member-goal').value,
    phone: $('member-phone').value.trim()
  };
  try {
    const res = await request(mode === 'edit' ? '/members/' + encodeURIComponent(payload.cardNo) : '/members', {
      method: mode === 'edit' ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    $('member-dialog').close();
    notify(mode === 'edit' ? 'Member updated in SQL database.' : 'Member inserted into MEMBER table.');
    await loadAll();
  } catch(err) {
    notify(err.message, true);
  }
});

// Coach Form Submit (Admin)
$('coach-form').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = $('coach-mode').value;
  const payload = {
    coachId: Number($('coach-id').value),
    coachName: $('coach-name').value.trim(),
    specialization: $('coach-specialization').value.trim() || 'General Fitness',
    experienceYears: Number($('coach-experience').value),
    contactNo: $('coach-contact').value.trim()
  };
  try {
    const res = await request(mode === 'edit' ? '/coaches/' + payload.coachId : '/coaches', {
      method: mode === 'edit' ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    $('coach-dialog').close();
    notify(mode === 'edit' ? 'Coach updated in COACH table.' : 'Coach inserted into COACH table.');
    await loadAll();
  } catch(err) {
    notify(err.message, true);
  }
});

// Assignment Form Submit (Admin)
$('assignment-form').addEventListener('submit', async e => {
  e.preventDefault();
  const cardNo = $('assignment-member').value;
  const coachId = Number($('assignment-coach').value);
  const existing = assignments.some(a => a.CARD_NO === cardNo);
  try {
    const res = await request(existing ? '/assignments/' + encodeURIComponent(cardNo) : '/assignments', {
      method: existing ? 'PUT' : 'POST',
      body: JSON.stringify({ cardNo, coachId })
    });
    notify(existing ? 'COACH_ASSIGNMENT updated (reassigned).' : 'Inserted into COACH_ASSIGNMENT table.');
    await loadAll();
    nav('assignments');
  } catch(err) {
    notify(err.message, true);
  }
});

// Live Polling every 3.5 seconds for Admin Live Database
if (!liveSyncInterval) {
  liveSyncInterval = setInterval(() => {
    // Poll updates quietly in background
    fetch(API + '/admin/live-updates')
      .then(r => r.json())
      .then(d => {
        if (d && d.updates) {
          const badge = $('admin-live-badge');
          if (badge) {
            const oldCnt = parseInt(badge.textContent || '0');
            if (d.updates.length > oldCnt) {
              badge.classList.add('pulse');
              setTimeout(() => badge.classList.remove('pulse'), 400);
            }
            badge.textContent = d.updates.length;
          }
          if (document.getElementById('admin-live-db-view') && !document.getElementById('admin-live-db-view').hidden) {
            loadLiveUserUpdates();
          }
        }
      })
      .catch(() => {});
  }, 3500);
}

$('today').textContent = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
loadAll();
