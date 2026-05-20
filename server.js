'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { load: cheerioLoad } = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Settings ────────────────────────────────────────────────
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    const s = {
      passwordHash: bcrypt.hashSync('admin123', 10),
      adminUser: 'admin',
      openRouterKey: '',
      jwtSecret: crypto.randomBytes(32).toString('hex')
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
    console.log('\n⚠️  Premier démarrage — identifiants par défaut : admin / admin123');
    console.log('   Changez le mot de passe dès la première connexion.\n');
    return s;
  }
}

function saveSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

const settings = loadSettings();
const JWT_SECRET = settings.jwtSecret || crypto.randomBytes(32).toString('hex');

// ── Team ────────────────────────────────────────────────────
const TEAM_FILE = path.join(DATA_DIR, 'team.json');

function loadTeam() {
  try {
    return JSON.parse(fs.readFileSync(TEAM_FILE, 'utf8'));
  } catch {
    return { doctors: [], staff: [] };
  }
}

function saveTeam(team) {
  fs.writeFileSync(TEAM_FILE, JSON.stringify(team, null, 2));
}

function regenerateTeamHtml() {
  const team = loadTeam();
  const filePath = path.join(ROOT, 'equipe.html');
  const raw = fs.readFileSync(filePath, 'utf8');
  const $ = cheerioLoad(raw, { decodeEntities: false });

  const doctorsHtml = team.doctors.map(doc => {
    const photo = doc.photo
      ? `<img src="${doc.photo}" alt="${escHtml(doc.name)}">`
      : `<div class="team-placeholder">Photo non disponible</div>`;
    const order = doc.order_number
      ? `<small>Numéro d'inscription à l'ordre : ${escHtml(doc.order_number)}</small>`
      : '';
    const rdv = doc.doctolib_url
      ? `<a href="${doc.doctolib_url}" target="_blank" rel="noopener">Prendre RDV</a>`
      : '';
    return `<article class="team-card reveal">${photo}<div class="team-body"><h3>${escHtml(doc.name)}</h3><p>${escHtml(doc.title || 'Docteur en Chirurgie Dentaire')}</p>${order}${rdv}</div></article>`;
  }).join('\n          ');

  const staffHtml = team.staff.map(m => {
    const photo = m.photo
      ? `<img src="${m.photo}" alt="${escHtml(m.name)}">`
      : `<div class="team-placeholder">Photo non disponible</div>`;
    const spec = m.specialty ? `<small>${escHtml(m.specialty)}</small>` : '';
    return `<article class="team-card reveal">${photo}<div class="team-body"><h3>${escHtml(m.name)}</h3><p>${escHtml(m.role || 'Assistante dentaire')}</p>${spec}</div></article>`;
  }).join('\n          ');

  $('[data-section="team-doctors"]').html('\n          ' + doctorsHtml + '\n        ');
  $('[data-section="team-staff"]').html('\n          ' + staffHtml + '\n        ');

  // Update JSON-LD itemListElement
  const ldScript = $('script[type="application/ld+json"]');
  if (ldScript.length) {
    try {
      const ld = JSON.parse(ldScript.html());
      ld.itemListElement = team.doctors.map((doc, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: doc.name
      }));
      ldScript.html(JSON.stringify(ld, null, 10));
    } catch { /* ignore JSON-LD parse errors */ }
  }

  fs.writeFileSync(filePath, $.html());
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Editable pages / sections ────────────────────────────────
const PAGES = {
  index:   { file: 'index.html',   label: 'Accueil' },
  cabinet: { file: 'cabinet.html', label: 'Le cabinet' },
  soins:   { file: 'soins.html',   label: 'Soins' },
  contact: { file: 'contact.html', label: 'Contact' }
};

function readPageSections(pageName) {
  const info = PAGES[pageName];
  if (!info) return null;
  const $ = cheerioLoad(fs.readFileSync(path.join(ROOT, info.file), 'utf8'));
  const sections = [];
  $('[data-section]').each((_, el) => {
    sections.push({
      key:   $(el).attr('data-section'),
      label: $(el).attr('data-section-label') || $(el).attr('data-section'),
      html:  $(el).html().trim()
    });
  });
  return sections;
}

function savePageSection(pageName, key, newHtml) {
  const info = PAGES[pageName];
  if (!info) return false;
  const filePath = path.join(ROOT, info.file);
  const $ = cheerioLoad(fs.readFileSync(filePath, 'utf8'), { decodeEntities: false });
  const el = $(`[data-section="${key}"]`);
  if (!el.length) return false;
  el.html(newHtml);
  fs.writeFileSync(filePath, $.html());
  return true;
}

// ── Multer (photo upload) ────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const folder = req.params.memberType === 'doctors' ? 'docteurs' : 'assistantes';
    const dir = path.join(ROOT, 'assets', folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname || '.jpg'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    cb(null, file.mimetype.startsWith('image/'));
  }
});

// ── Express setup ────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT));

// ── Auth middleware ──────────────────────────────────────────
function auth(req, res, next) {
  const token = req.cookies && req.cookies.adminToken;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('adminToken');
    res.status(401).json({ error: 'Session expirée' });
  }
}

// ── Admin HTML routes ────────────────────────────────────────
app.get('/admin', (_req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
app.get('/admin/dashboard', (_req, res) => res.sendFile(path.join(ROOT, 'admin', 'dashboard.html')));

// ── Auth API ─────────────────────────────────────────────────
app.post('/admin/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const s = loadSettings();
  if (!username || !password || username !== s.adminUser || !bcrypt.compareSync(password, s.passwordHash)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }
  const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('adminToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post('/admin/api/logout', (_req, res) => {
  res.clearCookie('adminToken');
  res.json({ ok: true });
});

app.get('/admin/api/me', auth, (req, res) => res.json({ user: req.admin.user }));

// ── Pages API ─────────────────────────────────────────────────
app.get('/admin/api/pages', auth, (_req, res) => {
  res.json(Object.entries(PAGES).map(([key, v]) => ({ key, label: v.label })));
});

app.get('/admin/api/sections/:page', auth, (req, res) => {
  const sections = readPageSections(req.params.page);
  if (!sections) return res.status(404).json({ error: 'Page introuvable' });
  res.json(sections);
});

app.put('/admin/api/sections/:page/:key', auth, (req, res) => {
  const { html } = req.body || {};
  if (typeof html !== 'string') return res.status(400).json({ error: 'Champ html manquant' });
  const ok = savePageSection(req.params.page, req.params.key, html);
  if (!ok) return res.status(404).json({ error: 'Section introuvable' });
  res.json({ ok: true });
});

// ── Team API ──────────────────────────────────────────────────
app.get('/admin/api/team', auth, (_req, res) => res.json(loadTeam()));

app.post('/admin/api/team/member', auth, (req, res) => {
  const team = loadTeam();
  const { memberType, ...member } = req.body || {};
  if (!memberType) return res.status(400).json({ error: 'memberType requis' });

  member.id = (member.name || 'membre')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') + '-' + Date.now();

  if (memberType === 'doctors') team.doctors.push(member);
  else team.staff.push(member);

  saveTeam(team);
  try { regenerateTeamHtml(); } catch (e) { console.error('regenerate error', e); }
  res.json({ ok: true, member });
});

app.put('/admin/api/team/member/:id', auth, (req, res) => {
  const team = loadTeam();
  const { memberType, ...updates } = req.body || {};
  const arr = memberType === 'doctors' ? team.doctors : team.staff;
  const idx = arr.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Membre introuvable' });

  arr[idx] = { ...arr[idx], ...updates };
  saveTeam(team);
  try { regenerateTeamHtml(); } catch (e) { console.error('regenerate error', e); }
  res.json({ ok: true });
});

app.delete('/admin/api/team/member/:id', auth, (req, res) => {
  const team = loadTeam();
  const { memberType } = req.query;
  if (memberType === 'doctors') team.doctors = team.doctors.filter(m => m.id !== req.params.id);
  else team.staff = team.staff.filter(m => m.id !== req.params.id);
  saveTeam(team);
  try { regenerateTeamHtml(); } catch (e) { console.error('regenerate error', e); }
  res.json({ ok: true });
});

app.post('/admin/api/team/photo/:memberType/:id', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const team = loadTeam();
  const arr = req.params.memberType === 'doctors' ? team.doctors : team.staff;
  const member = arr.find(m => m.id === req.params.id);
  if (!member) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Membre introuvable' });
  }
  const folder = req.params.memberType === 'doctors' ? 'docteurs' : 'assistantes';
  member.photo = `assets/${folder}/${req.file.filename}`;
  saveTeam(team);
  try { regenerateTeamHtml(); } catch (e) { console.error('regenerate error', e); }
  res.json({ ok: true, photo: member.photo });
});

// ── AI improvement (OpenRouter) ──────────────────────────────
app.post('/admin/api/ai/improve', auth, async (req, res) => {
  const { text, context } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Texte manquant' });

  const s = loadSettings();
  if (!s.openRouterKey) {
    return res.status(400).json({ error: 'Clé API OpenRouter non configurée. Ajoutez-la dans Paramètres.' });
  }

  const systemPrompt = `Tu es un expert en rédaction web SEO et référencement géolocalisé pour un cabinet dentaire en France.
Améliore le texte fourni en respectant ces critères :
1. SEO : intègre naturellement des mots-clés pertinents (dentiste Serris, chirurgien-dentiste Val d'Europe, cabinet dentaire Marne-la-Vallée, centre dentaire 77700, urgence dentaire Serris).
2. GEO : mentionne la localisation (Serris, Val d'Europe, Marne-la-Vallée, Seine-et-Marne, proche Disneyland Paris) de façon naturelle.
3. Ton : professionnel, bienveillant, rassurant — adapté à des patients.
4. Longueur : similaire à l'original.
5. Structure : conserve la même structure (paragraphes, listes si présentes).
Réponds UNIQUEMENT avec le texte amélioré, sans introduction ni explication.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${s.openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://selarl-abitbol-neuman-et-associes.chirurgiens-dentistes.fr/',
        'X-Title': "Centre Dentaire Val d'Europe"
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Contexte : ${context || "Section du site du Centre Dentaire du Val d'Europe"}\n\nTexte à améliorer :\n${text}`
          }
        ],
        temperature: 0.65,
        max_tokens: 1200
      })
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(502).json({ error: `Erreur OpenRouter (${response.status})`, details: body });
    }

    const data = await response.json();
    const improved = data.choices?.[0]?.message?.content?.trim();
    if (!improved) return res.status(502).json({ error: 'Réponse vide de l\'IA' });
    res.json({ improved });
  } catch (err) {
    res.status(500).json({ error: 'Erreur connexion OpenRouter', details: err.message });
  }
});

// ── Settings API ──────────────────────────────────────────────
app.get('/admin/api/settings', auth, (_req, res) => {
  const s = loadSettings();
  res.json({
    adminUser: s.adminUser,
    openRouterKeySet: !!s.openRouterKey,
    openRouterKeyPreview: s.openRouterKey ? '••••' + s.openRouterKey.slice(-4) : ''
  });
});

app.put('/admin/api/settings', auth, (req, res) => {
  const s = loadSettings();
  const { openRouterKey } = req.body || {};
  if (typeof openRouterKey === 'string') s.openRouterKey = openRouterKey.trim();
  saveSettings(s);
  res.json({ ok: true });
});

app.put('/admin/api/settings/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const s = loadSettings();
  if (!bcrypt.compareSync(currentPassword || '', s.passwordHash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  }
  s.passwordHash = bcrypt.hashSync(newPassword, 10);
  saveSettings(s);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🦷  Centre Dentaire du Val d'Europe`);
  console.log(`    Serveur  → http://localhost:${PORT}`);
  console.log(`    Admin    → http://localhost:${PORT}/admin\n`);
});
