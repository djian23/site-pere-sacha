'use strict';
/* ── Admin panel client-side logic ─────────────────────────────── */

const API = '/admin/api';

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// ── Toast ──────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ── Auth check ─────────────────────────────────────────────────────
(async () => {
  try {
    const { user } = await api('GET', '/me');
    document.getElementById('admin-username').textContent = user;
  } catch {
    window.location.href = '/admin';
  }
})();

// ── Logout ─────────────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('POST', '/logout').catch(() => {});
  window.location.href = '/admin';
});

// ── Panel navigation ───────────────────────────────────────────────
const panels = { pages: 'panel-pages', team: 'panel-team', settings: 'panel-settings' };
let activePanel = 'pages';

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.panel;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panels[target]).classList.add('active');
    activePanel = target;
    if (target === 'pages') loadSections(currentPage);
    if (target === 'team') loadTeam(currentTeamType);
    if (target === 'settings') loadSettings();
  });
});

// ─────────────────────────────────────────────────────────────────
// PANEL: PAGES
// ─────────────────────────────────────────────────────────────────
let currentPage = 'index';

document.querySelectorAll('.page-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.page-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentPage = pill.dataset.page;
    loadSections(currentPage);
  });
});

async function loadSections(page) {
  const list = document.getElementById('sections-list');
  list.innerHTML = '<div class="loading-state">Chargement…</div>';
  try {
    const sections = await api('GET', `/sections/${page}`);
    if (!sections.length) {
      list.innerHTML = '<div class="loading-state">Aucune section éditable sur cette page.</div>';
      return;
    }
    list.innerHTML = '';
    sections.forEach(sec => list.appendChild(buildSectionCard(page, sec)));
  } catch (err) {
    list.innerHTML = `<div class="loading-state">Erreur : ${err.message}</div>`;
  }
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSectionCard(page, sec) {
  const card = document.createElement('div');
  card.className = 'section-card';
  const preview = stripHtml(sec.html).slice(0, 120) + (sec.html.length > 120 ? '…' : '');
  card.innerHTML = `
    <div class="section-card-info">
      <strong>${esc(sec.label)}</strong>
      <div class="section-preview">${esc(preview)}</div>
    </div>
    <button class="btn btn-edit">Modifier</button>`;
  card.querySelector('.btn-edit').addEventListener('click', () => openSectionModal(page, sec));
  return card;
}

// Section modal
let currentSection = null;

function openSectionModal(page, sec) {
  currentSection = { page, key: sec.key, label: sec.label };
  document.getElementById('modal-title').textContent = `Modifier : ${sec.label}`;
  document.getElementById('section-editor').value = sec.html;
  resetAiPanel();
  document.getElementById('section-modal').classList.remove('hidden');
}

function closeSectionModal() {
  document.getElementById('section-modal').classList.add('hidden');
  currentSection = null;
}

document.getElementById('section-modal-close').addEventListener('click', closeSectionModal);
document.getElementById('section-cancel-btn').addEventListener('click', closeSectionModal);
document.getElementById('section-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('section-modal')) closeSectionModal();
});

document.getElementById('section-save-btn').addEventListener('click', async () => {
  if (!currentSection) return;
  const html = document.getElementById('section-editor').value;
  const btn = document.getElementById('section-save-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    await api('PUT', `/sections/${currentSection.page}/${currentSection.key}`, { html });
    toast('Section enregistrée', 'success');
    closeSectionModal();
    loadSections(currentSection.page);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
});

// AI improvement
function resetAiPanel() {
  document.getElementById('ai-result-area').classList.add('hidden');
  document.getElementById('ai-loading').classList.add('hidden');
  document.getElementById('ai-error').classList.add('hidden');
}

document.getElementById('ai-improve-btn').addEventListener('click', async () => {
  const text = document.getElementById('section-editor').value;
  if (!text.trim()) return;
  const btn = document.getElementById('ai-improve-btn');
  btn.disabled = true;
  resetAiPanel();
  document.getElementById('ai-loading').classList.remove('hidden');

  try {
    const context = currentSection ? `Section "${currentSection.label}" de la page "${currentSection.page}"` : '';
    const { improved } = await api('POST', '/ai/improve', { text, context });
    document.getElementById('ai-result-text').textContent = improved;
    document.getElementById('ai-result-area').classList.remove('hidden');
  } catch (err) {
    document.getElementById('ai-error').textContent = err.message;
    document.getElementById('ai-error').classList.remove('hidden');
  } finally {
    document.getElementById('ai-loading').classList.add('hidden');
    btn.disabled = false;
  }
});

document.getElementById('ai-apply-btn').addEventListener('click', () => {
  const improved = document.getElementById('ai-result-text').textContent;
  document.getElementById('section-editor').value = improved;
  document.getElementById('ai-result-area').classList.add('hidden');
  toast('Texte IA appliqué — pensez à enregistrer', 'success');
});

// ─────────────────────────────────────────────────────────────────
// PANEL: TEAM
// ─────────────────────────────────────────────────────────────────
let currentTeamType = 'doctors';
let teamData = { doctors: [], staff: [] };

document.querySelectorAll('.team-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTeamType = tab.dataset.type;
    renderTeamGrid();
  });
});

async function loadTeam() {
  try {
    teamData = await api('GET', '/team');
    renderTeamGrid();
  } catch (err) {
    document.getElementById('team-grid').innerHTML = `<p style="color:var(--danger)">${err.message}</p>`;
  }
}

function renderTeamGrid() {
  const grid = document.getElementById('team-grid');
  const members = currentTeamType === 'doctors' ? teamData.doctors : teamData.staff;
  if (!members.length) {
    grid.innerHTML = '<div class="loading-state">Aucun membre dans cette catégorie.</div>';
    return;
  }
  grid.innerHTML = '';
  members.forEach(m => grid.appendChild(buildMemberCard(m)));
}

function buildMemberCard(m) {
  const card = document.createElement('div');
  card.className = 'member-card';
  const photoHtml = m.photo
    ? `<img src="/${m.photo}" alt="${esc(m.name)}" style="width:100%;height:100%;object-fit:cover">`
    : `<div class="no-photo">Photo non disponible</div>`;
  card.innerHTML = `
    <div class="member-card-photo">${photoHtml}</div>
    <div class="member-card-body">
      <strong>${esc(m.name)}</strong>
      <span>${esc(m.title || m.role || '')}</span>
    </div>
    <div class="member-card-actions">
      <button class="btn btn-edit btn-sm" style="flex:1">Modifier</button>
      <button class="btn btn-delete btn-sm" style="flex:1">Supprimer</button>
    </div>`;
  card.querySelector('.btn-edit').addEventListener('click', () => openMemberModal(m, currentTeamType));
  card.querySelector('.btn-delete').addEventListener('click', () => deleteMember(m.id));
  return card;
}

async function deleteMember(id) {
  if (!confirm('Supprimer ce membre de l\'équipe ?')) return;
  try {
    await api('DELETE', `/team/member/${id}?memberType=${currentTeamType}`);
    toast('Membre supprimé', 'success');
    await loadTeam();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// Member modal
let editingMember = null;
let pendingPhotoFile = null;

document.getElementById('add-member-btn').addEventListener('click', () => openMemberModal(null, currentTeamType));

function openMemberModal(member, type) {
  editingMember = member;
  pendingPhotoFile = null;
  const isDoctor = type === 'doctors';

  document.getElementById('member-modal-title').textContent = member ? 'Modifier le membre' : 'Ajouter un membre';
  document.getElementById('member-id').value = member?.id || '';
  document.getElementById('member-type').value = type;

  // Show/hide fields based on type
  document.getElementById('field-title').style.display = isDoctor ? '' : 'none';
  document.getElementById('field-role').style.display = isDoctor ? 'none' : '';
  document.getElementById('field-order').style.display = isDoctor ? '' : 'none';
  document.getElementById('field-doctolib').style.display = isDoctor ? '' : 'none';
  document.getElementById('field-specialty').style.display = '';

  // Fill fields
  document.getElementById('member-name').value = member?.name || '';
  document.getElementById('member-title').value = member?.title || '';
  document.getElementById('member-role').value = member?.role || '';
  document.getElementById('member-specialty').value = member?.specialty || '';
  document.getElementById('member-order').value = member?.order_number || '';
  document.getElementById('member-doctolib').value = member?.doctolib_url || '';

  // Photo
  const preview = document.getElementById('photo-preview');
  const placeholder = document.getElementById('photo-placeholder');
  if (member?.photo) {
    preview.src = '/' + member.photo;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
  document.getElementById('photo-upload-status').classList.add('hidden');
  document.getElementById('member-error').classList.add('hidden');

  document.getElementById('member-modal').classList.remove('hidden');
}

function closeMemberModal() {
  document.getElementById('member-modal').classList.add('hidden');
  editingMember = null;
  pendingPhotoFile = null;
}

document.getElementById('member-modal-close').addEventListener('click', closeMemberModal);
document.getElementById('member-cancel-btn').addEventListener('click', closeMemberModal);
document.getElementById('member-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('member-modal')) closeMemberModal();
});

// Photo upload zone
const photoDropZone = document.getElementById('photo-drop-zone');
const photoInput = document.getElementById('photo-input');

photoDropZone.addEventListener('click', () => photoInput.click());
photoDropZone.addEventListener('dragover', e => { e.preventDefault(); photoDropZone.classList.add('drag-over'); });
photoDropZone.addEventListener('dragleave', () => photoDropZone.classList.remove('drag-over'));
photoDropZone.addEventListener('drop', e => {
  e.preventDefault();
  photoDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setPhotoPreview(file);
});
photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) setPhotoPreview(photoInput.files[0]);
});

function setPhotoPreview(file) {
  pendingPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('photo-preview');
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    document.getElementById('photo-placeholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

// Save member
document.getElementById('member-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('member-name').value.trim();
  if (!name) {
    document.getElementById('member-error').textContent = 'Le nom est requis.';
    document.getElementById('member-error').classList.remove('hidden');
    return;
  }

  const type = document.getElementById('member-type').value;
  const id = document.getElementById('member-id').value;
  const isDoctor = type === 'doctors';

  const payload = {
    memberType: type,
    name,
    ...(isDoctor ? {
      title: document.getElementById('member-title').value.trim() || 'Docteur en Chirurgie Dentaire',
      order_number: document.getElementById('member-order').value.trim(),
      doctolib_url: document.getElementById('member-doctolib').value.trim()
    } : {
      role: document.getElementById('member-role').value.trim() || 'Assistante dentaire'
    }),
    specialty: document.getElementById('member-specialty').value.trim()
  };

  const saveBtn = document.getElementById('member-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Enregistrement…';
  document.getElementById('member-error').classList.add('hidden');

  try {
    let savedId = id;
    if (id) {
      await api('PUT', `/team/member/${id}`, payload);
    } else {
      const result = await api('POST', '/team/member', payload);
      savedId = result.member.id;
    }

    // Upload photo if pending
    if (pendingPhotoFile && savedId) {
      const statusEl = document.getElementById('photo-upload-status');
      statusEl.textContent = 'Envoi de la photo…';
      statusEl.className = 'photo-status uploading';
      statusEl.classList.remove('hidden');

      const formData = new FormData();
      formData.append('photo', pendingPhotoFile);
      const res = await fetch(`${API}/team/photo/${type}/${savedId}`, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur upload photo');
      }
      statusEl.textContent = 'Photo enregistrée';
      statusEl.className = 'photo-status done';
    }

    toast(id ? 'Membre modifié' : 'Membre ajouté', 'success');
    closeMemberModal();
    await loadTeam();
  } catch (err) {
    document.getElementById('member-error').textContent = err.message;
    document.getElementById('member-error').classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Enregistrer';
  }
});

// ─────────────────────────────────────────────────────────────────
// PANEL: SETTINGS
// ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await api('GET', '/settings');
    const statusEl = document.getElementById('openrouter-status');
    if (s.openRouterKeySet) {
      statusEl.textContent = `Clé configurée (se termine par ${s.openRouterKeyPreview.slice(-4)})`;
      statusEl.className = 'key-status set';
    } else {
      statusEl.textContent = 'Aucune clé configurée — l\'amélioration IA est désactivée.';
      statusEl.className = 'key-status unset';
    }
    statusEl.classList.remove('hidden');
  } catch { /* ignore */ }
}

document.getElementById('openrouter-form').addEventListener('submit', async e => {
  e.preventDefault();
  const key = document.getElementById('openrouter-key').value.trim();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    await api('PUT', '/settings', { openRouterKey: key });
    toast('Clé API enregistrée', 'success');
    document.getElementById('openrouter-key').value = '';
    await loadSettings();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer la clé';
  }
});

document.getElementById('password-form').addEventListener('submit', async e => {
  e.preventDefault();
  const current = document.getElementById('current-pw').value;
  const next = document.getElementById('new-pw').value;
  const confirm = document.getElementById('confirm-pw').value;
  const msgEl = document.getElementById('pw-msg');
  msgEl.classList.add('hidden');

  if (next !== confirm) {
    msgEl.textContent = 'Les mots de passe ne correspondent pas.';
    msgEl.className = 'form-msg error';
    msgEl.classList.remove('hidden');
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    await api('PUT', '/settings/password', { currentPassword: current, newPassword: next });
    msgEl.textContent = 'Mot de passe changé avec succès.';
    msgEl.className = 'form-msg success';
    msgEl.classList.remove('hidden');
    e.target.reset();
    toast('Mot de passe changé', 'success');
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'form-msg error';
    msgEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Changer le mot de passe';
  }
});

// ── Utilities ───────────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Init
loadSections('index');
