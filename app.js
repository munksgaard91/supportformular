// Konfiguration
const API = 'https://supportformular.best-one.workers.dev'; // workerens adresse
const GOOGLE_CLIENT_ID = '733090718962-9dda64antqa8ki7j5q3de1nfrv7rod35.apps.googleusercontent.com';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').trim();

let KUNDER = [], FOLK = [];
const S = { kunde: null, manuel: false, type: 'normal', svar: null, nord: null, cc: [] };

function avatar(p) {
  return `<span class="avatar">${p.billede ? `<img src="${esc(p.billede)}" alt="">` : esc(p.initialer || p.navn.slice(0, 2).toUpperCase())}</span>`;
}

// ---------- Generisk søgeliste ----------
function combo({ input, liste, hent, render, vaelg, tom }) {
  let fund = [], aktiv = 0;
  function tegn() {
    fund = hent(input.value);
    aktiv = 0;
    liste.innerHTML = fund.length
      ? fund.map((x, i) => `<div class="valg" role="option" data-i="${i}" aria-selected="${i === 0}">${render(x)}</div>`).join('')
      : `<div class="tom">${tom ? tom(input.value) : 'Ingen resultater'}</div>`;
    liste.classList.add('aaben');
    input.setAttribute('aria-expanded', 'true');
  }
  function luk() { liste.classList.remove('aaben'); input.setAttribute('aria-expanded', 'false'); }
  function marker(i) {
    aktiv = Math.max(0, Math.min(fund.length - 1, i));
    liste.querySelectorAll('.valg').forEach((el, j) => el.setAttribute('aria-selected', j === aktiv));
    liste.querySelector(`[data-i="${aktiv}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  input.addEventListener('input', tegn);
  input.addEventListener('focus', tegn);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); marker(aktiv + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marker(aktiv - 1); }
    else if (e.key === 'Enter' && fund[aktiv]) { e.preventDefault(); vaelg(fund[aktiv]); input.value = ''; luk(); }
    else if (e.key === 'Escape') luk();
  });
  liste.addEventListener('mousedown', (e) => {
    e.preventDefault(); // behold fokus, så knapper i listen kan klikkes
    const el = e.target.closest('.valg');
    if (el) { vaelg(fund[+el.dataset.i]); input.value = ''; luk(); }
  });
  input.addEventListener('blur', () => setTimeout(luk, 120));
  return { luk, tegn };
}

// ---------- Personvælger (enkelt eller flere) ----------
function personVaelger(rod, { flere, placeholder, valgt, onChange }) {
  rod.innerHTML = `<div class="chips"></div><div class="combo"><input type="text" placeholder="${placeholder}" autocomplete="off" role="combobox"><div class="liste" role="listbox"></div></div>`;
  const chips = rod.querySelector('.chips'), input = rod.querySelector('input'), boks = rod.querySelector('.combo');
  let ids = valgt ? [].concat(valgt) : [];
  function opdater() {
    const ps = ids.map((id) => FOLK.find((p) => p.id === id)).filter(Boolean);
    chips.innerHTML = ps.map((p) => `<span class="chip">${avatar(p)}${esc(p.navn)}<button type="button" aria-label="Fjern ${esc(p.navn)}" data-id="${p.id}">×</button></span>`).join('');
    boks.classList.toggle('skjult', !flere && ids.length > 0);
    onChange(flere ? ids : ids[0] || null);
  }
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ids = ids.filter((id) => id !== +b.dataset.id); opdater();
    if (!flere) input.focus();
  });
  combo({
    input, liste: rod.querySelector('.liste'),
    hent: (q) => { q = norm(q); return FOLK.filter((p) => !ids.includes(p.id) && (!q || norm(p.navn).includes(q) || p.email.includes(q))).slice(0, 8); },
    render: (p) => `${avatar(p)}<span>${esc(p.navn)}<br><span class="sub">${esc(p.email)}</span></span>`,
    vaelg: (p) => { ids = flere ? [...ids, p.id] : [p.id]; opdater(); },
  });
  opdater();
  return { saet: (v) => { ids = v ? [].concat(v) : []; opdater(); } };
}

// ---------- Kunde ----------
function soegKunder(q) {
  q = norm(q);
  if (!q) return KUNDER.slice(0, 8);
  const start = [], inde = [];
  for (const k of KUNDER) {
    const n = k.navn.toLowerCase();
    const v = k.vis || k.domaene;
    if (n.startsWith(q) || v.startsWith(q) || k.domaene.startsWith(q)) start.push(k);
    else if (n.includes(q) || v.includes(q) || k.domaene.includes(q)) inde.push(k);
    if (start.length >= 8) break;
  }
  return [...start, ...inde].slice(0, 8);
}

const LUKKET = /nedluk|opsag|opsig|lukket/i;
const kundeCombo = combo({
  input: $('#kundeInput'), liste: $('#kundeListe'),
  hent: soegKunder,
  render: (k) => `<span><b>${esc(k.navn)}</b><br><span class="sub">${esc(k.vis || k.domaene || 'Ingen hjemmeside på kundekortet')}</span></span>${LUKKET.test(k.status) ? `<span class="pille">${esc(k.status)}</span>` : ''}`,
  vaelg: vaelgKunde,
  tom: () => `Ingen kunder matcher. <button type="button" data-handl="opdater">Opdatér listen</button> eller <button type="button" data-handl="manuel">opret uden kunde</button>.`,
});

// Produkter som små farvede mærker, samme farver som i ClickUp
function produktMaerker(liste) {
  if (!liste || !liste.length) return '';
  const tekstfarve = (hex) => {
    const h = String(hex).replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1c2733' : '#ffffff';
  };
  return `<span class="produkter">${liste.map((p) => {
    const farve = /^#[0-9a-f]{3,6}$/i.test(p.farve) ? p.farve : '#e9e9e9';
    return `<span class="produkt" data-farve="${farve}" data-tekst="${tekstfarve(farve)}">${esc(p.navn)}</span>`;
  }).join('')}</span>`;
}
// Farverne sættes via JavaScript ud fra data-attributterne
function farvMaerker(rod) {
  rod.querySelectorAll('.produkt').forEach((el) => {
    el.style.background = el.dataset.farve;
    el.style.color = el.dataset.tekst;
  });
}

function vaelgKunde(k) {
  S.kunde = k; S.manuel = false;
  $('#kundeSoeg').classList.add('skjult'); $('#manuel').classList.add('skjult');
  const el = $('#kundeValgt');
  el.classList.remove('skjult');
  el.innerHTML = `<div class="kunde"><span><b>${esc(k.navn)}</b><span class="sub">${esc(k.vis || k.domaene || 'Ingen hjemmeside på kundekortet')}</span>${produktMaerker(k.produkter)}</span>
    <span class="handl"><a class="link" href="${esc(k.url)}" target="_blank" rel="noopener">Åbn i ClickUp <svg class="ikon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9 2h5v5M14 2L7 9M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">(åbner i ny fane)</span></a><button class="link" type="button" id="skiftKunde">Vælg ny kunde</button></span></div>
    ${LUKKET.test(k.status) ? `<p class="advarsel">Kunden har status "${esc(k.status)}". Tjek at sagen er rigtig.</p>` : ''}`;
  farvMaerker(el);
  $('#skiftKunde').onclick = nulstilKunde;
  udfyldKontakt(); udfyldNord(true); udfyldCc(); opdaterNavn();
}
function nulstilKunde() {
  S.kunde = null; S.manuel = false;
  $('#kundeValgt').classList.add('skjult'); $('#manuel').classList.add('skjult');
  $('#kundeSoeg').classList.remove('skjult');
  $('#kundeInput').focus(); opdaterNavn();
}
function manuelKunde() {
  S.kunde = null; S.manuel = true;
  $('#kundeSoeg').classList.add('skjult'); $('#manuel').classList.remove('skjult');
  $('#manuelUrl').focus(); opdaterNavn();
}
$('#tilbageSoeg').onclick = nulstilKunde;
// Knapperne i "Ingen kunder matcher" (ingen inline onclick pga. sikkerhedspolitikken)
$('#kundeListe').addEventListener('click', (e) => {
  const h = e.target.closest('[data-handl]');
  if (!h) return;
  if (h.dataset.handl === 'opdater') hentKunder(true);
  if (h.dataset.handl === 'manuel') manuelKunde();
});

function udfyldKontakt() {
  const k = S.kunde;
  if (!k) return;
  $('#kNavn').value = k.kontaktperson || '';
  $('#kEmail').value = k.email || '';
  $('#kTlf').value = k.telefon || '';
  $('#kontaktKilde').classList.toggle('skjult', !(k.kontaktperson || k.email));
}

// CC = 2nd Marketing på kundekortet, hvis der er en.
// Fjerner forrige kundes automatisk tilføjede person, men rører ikke dem man selv har valgt.
function udfyldCc() {
  let ids = S.cc.filter((id) => id !== S.ccAuto);
  S.ccAuto = null;
  const m2 = S.kunde && S.kunde.marketing2;
  if (m2 && FOLK.some((p) => p.id === m2) && m2 !== S.nord) {
    if (!ids.includes(m2)) ids = [...ids, m2];
    S.ccAuto = m2;
  }
  ccVaelger.saet(ids);
}

// Nørd = Manager på kundekortet, hvis der er en
function udfyldNord(nyKunde) {
  const m = S.kunde && S.kunde.manager;
  const findes = m && FOLK.some((p) => p.id === m);
  if (findes && (nyKunde || !S.nord)) nordVaelger.saet(m);
  else if (nyKunde && S.nordAuto) nordVaelger.saet(null); // ryd forrige kundes manager
  S.nordAuto = !!(findes && S.nord === m);
  $('#nordKilde').classList.toggle('skjult', !(findes && S.nord === m));
}

function opdaterNavn() {
  const p = $('#navnPreview');
  let e = $('#emne').value.trim().replace(/^\s*(haster|fak)\b\s*[:\-]?\s*/i, '');
  if (e && S.type === 'haster') e = 'HASTER: ' + e;
  if (e && S.type === 'fak') e = 'FAK: ' + e;
  if (e && e !== $('#emne').value.trim()) { p.innerHTML = `Opgaven hedder <b>${esc(e)}</b>`; p.classList.remove('skjult'); }
  else p.classList.add('skjult');
}
$('#emne').addEventListener('input', opdaterNavn);

// ---------- Segmenter ----------
function segment(rod, onChange) {
  rod.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    rod.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    onChange(b.dataset.v);
  });
}
segment($('#type'), (v) => {
  S.type = v;
  $('#deadlineTekst').textContent = {
    normal: 'Deadline om 5 arbejdsdage.',
    haster: 'Deadline om 2 arbejdsdage og får prioritet Urgent.',
    fak: 'Deadline senest fredag i indeværende uge og får prioritet Urgent.',
  }[v];
  opdaterNavn();
});
segment($('#svarTil'), (v) => {
  S.svar = v;
  $('#svarGruppe').classList.toggle('skjult', v === 'ingen');
  $('#kontaktBlok').classList.toggle('skjult', v === 'nord' || v === 'ingen');
  $('#nordBlok').classList.toggle('skjult', v === 'kunden' || v === 'ingen');
  if ((v === 'kunden' || v === 'kundenNord') && S.kunde && !$('#kNavn').value) udfyldKontakt();
  if (v === 'nord' || v === 'kundenNord') udfyldNord(false);
});

// ---------- Data ----------
async function hentKunder(frisk) {
  const input = $('#kundeInput');
  input.placeholder = 'Henter kunder…';
  try {
    KUNDER = await api('/api/kunder' + (frisk ? '?frisk=1' : ''));
    input.placeholder = `Søg blandt ${KUNDER.length} kunder`;
    if (frisk) kundeCombo.tegn();
  } catch (e) {
    input.placeholder = 'Kunne ikke hente kunder. Genindlæs siden.' + (e.kode ? ` (Fejlkode: ${e.kode})` : '');
  }
}

let nordVaelger, ccVaelger;
async function start() {
  hentKunder(false);
  lavPersonVaelgere(); // klar med det samme, også før medarbejderne er hentet
  try { FOLK = await api('/api/medarbejdere'); } catch { FOLK = []; }
  lavPersonVaelgere();
  if (S.kunde) { udfyldNord(true); udfyldCc(); } // hvis kunden blev valgt, før listen var klar
}
function lavPersonVaelgere() {
  const nord = S.nord, cc = S.cc;
  nordVaelger = personVaelger($('#nord'), { flere: false, placeholder: 'Vælg kollega', onChange: (id) => {
    S.nord = id;
    S.nordAuto = !!(id && S.kunde && S.kunde.manager === id);
    $('#nordKilde').classList.toggle('skjult', !(id && S.kunde && S.kunde.manager === id));
  }});
  ccVaelger = personVaelger($('#cc'), { flere: true, placeholder: 'Tilføj kollega', onChange: (ids) => (S.cc = ids) });
  if (nord) nordVaelger.saet(nord);
  if (cc && cc.length) ccVaelger.saet(cc);
}
// ---------- Opret ----------
$('#opret').addEventListener('click', async () => {
  const fejl = $('#fejl'); fejl.textContent = '';
  const tjek = [
    [!S.kunde && !(S.manuel && $('#manuelUrl').value.trim()), 'Vælg en kunde, eller skriv hjemmesiden hvis kunden ikke er på listen.'],
    [!$('#emne').value.trim(), 'Skriv et emne.'],
    [!$('#henvendelse').value.trim(), 'Beskriv hvad opgaven handler om.'],
    [!S.svar, 'Vælg hvem der skal have svar.'],
    [['kunden', 'kundenNord'].includes(S.svar) && !$('#kNavn').value.trim(), 'Skriv kundens navn.'],
    [['kunden', 'kundenNord'].includes(S.svar) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#kEmail').value.trim()), 'Skriv en gyldig e-mail på kunden.'],
    [['nord', 'kundenNord'].includes(S.svar) && !S.nord, 'Vælg hvem nørden er.'],
  ].find(([b]) => b);
  if (tjek) { fejl.textContent = tjek[1]; return; }

  const knap = $('#opret'); knap.disabled = true; knap.textContent = 'Opretter…';
  try {
    const d = await api('/api/opret', {
      method: 'POST',
      body: JSON.stringify({
        kundeId: S.kunde?.id || null,
        hjemmeside: S.manuel ? $('#manuelUrl').value.trim() : null,
        type: S.type,
        emne: $('#emne').value,
        henvendelse: $('#henvendelse').value,
        materialer: $('#materialer').value.trim(),
        svarTil: S.svar,
        kontakt: { navn: $('#kNavn').value, email: $('#kEmail').value, telefon: $('#kTlf').value },
        nord: S.nord, cc: S.cc,
      }),
    });
    visKvittering(d);
  } catch (e) {
    fejl.textContent = visFejl(e) + (e.kode === 'SF-400' ? '' : ' Prøv igen, eller giv supporten besked med fejlkoden, hvis det fortsætter.');
  } finally {
    knap.disabled = false; knap.textContent = 'Opret supportsag';
  }
});

function visKvittering(d) {
  const k = $('#kvittering');
  k.innerHTML = `
    ${$('.logo').outerHTML}
    <h1>Supportsagen er oprettet</h1>
    <div class="billet">
      <div class="navn">${esc(d.navn)}</div>
      <div class="id">#${esc(d.id)}</div>
      <div class="knapper"><button type="button" id="kopier">Kopiér ID</button><a href="${esc(d.url)}" target="_blank" rel="noopener">Åbn i ClickUp</a></div>
      <div class="deadline"><b>Deadline:</b> ${esc(d.deadline)}${d.type === 'haster' ? ' (haster)' : ''}</div>
    </div>
    ${!d.kunde ? `<p class="obs">Sagen er ikke linket til en kunde. Link den manuelt i ClickUp.</p>` : ''}
    ${d.kommentarFejl ? `<p class="obs">Kommentaren på kundens opgave kunne ikke skrives. Sagen er oprettet. (Fejlkode: ${d.kommentarFejl})</p>` : ''}
    <button class="link ny-sag" type="button" id="nySag">Opret en ny supportsag</button>`;
  $('#formular').classList.add('skjult'); k.classList.remove('skjult');
  $('#kopier').onclick = async (e) => { try { await navigator.clipboard.writeText('#' + d.id); e.target.textContent = 'Kopieret'; } catch {} };
  $('#nySag').onclick = nulstilAlt;
  window.scrollTo(0, 0);
}

function nulstilAlt() {
  ['#emne', '#henvendelse', '#materialer', '#kNavn', '#kEmail', '#kTlf', '#manuelUrl'].forEach((s) => ($(s).value = ''));
  document.querySelectorAll('#type button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === 'normal'));
  document.querySelectorAll('#svarTil button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  S.type = 'normal'; S.svar = null;
  $('#deadlineTekst').textContent = 'Deadline om 5 arbejdsdage.';
  $('#svarGruppe').classList.add('skjult'); $('#kontaktBlok').classList.add('skjult'); $('#nordBlok').classList.add('skjult');
  nordVaelger.saet(null); ccVaelger.saet([]);
  nulstilKunde();
  $('#kvittering').classList.add('skjult'); $('#formular').classList.remove('skjult');
}
// ---------- Baggrundsvideo ----------
(function () {
  const v = $('#bgVideo');
  const spar = navigator.connection && navigator.connection.saveData;
  const rolig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!v || spar || rolig) { v && v.remove(); return; }
  const fjern = () => { v.remove(); document.body.classList.remove('har-video'); };
  v.addEventListener('error', fjern, true);
  v.querySelectorAll('source').forEach((src) => src.addEventListener('error', () => {
    if ([...v.querySelectorAll('source')].every((x) => x.dataset.fejl || x === src)) fjern();
    src.dataset.fejl = '1';
  }));
  // Blåt overlay og skygge først, når videoen faktisk kører
  v.addEventListener('playing', () => document.body.classList.add('har-video'), { once: true });
  // Videoen hentes først, når resten af siden er klar, så den ikke forsinker formularen
  const startVideo = () => { v.preload = 'auto'; v.load(); v.play().catch(() => {}); };
  document.readyState === 'complete' ? startVideo() : window.addEventListener('load', startVideo, { once: true });
  // Pause når fanen ikke er synlig, så den ikke bruger strøm i baggrunden
  document.addEventListener('visibilitychange', () => (document.hidden ? v.pause() : v.play().catch(() => {})));
})();

// ---------- Login ----------
const SESSION_KEY = 'supportformular.session';
let startet = false, googleKlar = false;

function session() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return s && s.exp > Date.now() / 1000 + 60 ? s : null;
  } catch { return null; }
}

// Fejl med fejlkode (se FEJLKODER.md)
function fejlMedKode(tekst, kode) {
  const e = new Error(tekst);
  e.kode = kode;
  return e;
}
const visFejl = (e) => e.kode ? `${e.message} (Fejlkode: ${e.kode})` : e.message;

// Kalder workeren og oversætter netværks- og svarfejl til fejlkoder
async function hent(sti, opts) {
  let r;
  try { r = await fetch(API + sti, opts); }
  catch { throw fejlMedKode('Kan ikke få forbindelse til formularens server.', 'SF-501'); }
  let d;
  try { d = await r.json(); }
  catch { throw fejlMedKode('Serveren svarede uventet.', 'SF-502'); }
  if (!r.ok) {
    const e = fejlMedKode(d.fejl || 'Noget gik galt.', d.kode || 'SF-900');
    e.status = r.status;
    throw e;
  }
  return d;
}

async function api(sti, opts = {}) {
  const s = session();
  if (!s) { visLogin(); throw fejlMedKode('Du er logget ud. Log ind igen.', 'SF-105'); }
  try {
    return await hent(sti, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token } });
  } catch (e) {
    if (e.status === 401) { localStorage.removeItem(SESSION_KEY); visLogin(); }
    throw e;
  }
}

function visFormular() {
  const s = session();
  const initialer = s.navn.split(/\s+/).map((d) => d[0]).slice(0, 2).join('').toUpperCase();
  $('#brugerNavn').innerHTML = `<span class="avatar mig">${s.billede ? `<img src="${esc(s.billede)}" alt="" referrerpolicy="no-referrer">` : esc(initialer)}</span>Logget ind som ${esc(s.navn)}`;
  const img = $('#brugerNavn img');
  if (img) img.onerror = () => { img.parentElement.textContent = initialer; };
  $('#login').classList.add('skjult');
  $('#kvittering').classList.add('skjult');
  $('#formular').classList.remove('skjult');
  if (!startet) { startet = true; start(); }
}

function visLogin() {
  $('#formular').classList.add('skjult');
  $('#kvittering').classList.add('skjult');
  $('#login').classList.remove('skjult');
  if (googleKlar) initGoogle();
}

function initGoogle() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: onGoogle,
    auto_select: true,          // logger selv ind, hvis man har gjort det før
    hd: 'best-one.dk',
    use_fedcm_for_prompt: true,
  });
  google.accounts.id.renderButton($('#gBtn'), { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'da' });
  google.accounts.id.prompt();
}

async function onGoogle(svar) {
  $('#loginFejl').textContent = '';
  try {
    const d = await hent('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: svar.credential }) });
    localStorage.setItem(SESSION_KEY, JSON.stringify(d));
    visFormular();
  } catch (e) {
    $('#loginFejl').textContent = visFejl(e);
  }
}

$('#logud').onclick = () => {
  localStorage.removeItem(SESSION_KEY);
  if (googleKlar) google.accounts.id.disableAutoSelect();
  visLogin();
};

function googleFejl() {
  if (googleKlar || session()) return;
  $('#loginFejl').textContent = 'Google-login kunne ikke indlæses. Tjek din internetforbindelse eller adblocker. (Fejlkode: SF-503)';
}
setTimeout(googleFejl, 10000); // hvis Google-scriptet ikke er klar efter 10 sekunder
const gsi = document.createElement('script');
gsi.src = 'https://accounts.google.com/gsi/client';
gsi.async = true;
gsi.onerror = googleFejl;
document.head.append(gsi);

window.onGoogleLibraryLoad = () => {
  googleKlar = true;
  if (!session()) initGoogle();
};

session() ? visFormular() : visLogin();
