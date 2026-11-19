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

// Farvede mærker (produkter og status) med samme farver som i ClickUp.
// Teksten bliver mørk på lyse farver og hvid på mørke.
function farveAttr(hex) {
  const farve = /^#[0-9a-f]{3,6}$/i.test(hex) ? hex : '#e9e9e9';
  const h = farve.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  const tekst = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1c2733' : '#ffffff';
  return `data-farve="${farve}" data-tekst="${tekst}"`;
}
function produktMaerker(liste) {
  if (!liste || !liste.length) return '';
  return `<span class="produkter">${liste.map((p) => `<span class="produkt" ${farveAttr(p.farve)}>${esc(p.navn)}</span>`).join('')}</span>`;
}
// Farverne sættes via JavaScript ud fra data-attributterne
function farvMaerker(rod) {
  rod.querySelectorAll('[data-farve]').forEach((el) => {
    el.style.background = el.dataset.farve;
    el.style.color = el.dataset.tekst;
  });
}

function vaelgKunde(k) {
  S.kunde = k; S.manuel = false;
  $('#kundeSoeg').classList.add('skjult'); $('#udenKunde').classList.add('skjult'); $('#manuel').classList.add('skjult');
  const el = $('#kundeValgt');
  el.classList.remove('skjult');
  el.innerHTML = `<div class="kunde"><span><b>${esc(k.navn)}</b><span class="sub">${esc(k.vis || k.domaene || 'Ingen hjemmeside på kundekortet')}</span>${produktMaerker(k.produkter)}</span>
    <span class="handl"><a class="link" href="${esc(k.url)}" target="_blank" rel="noopener">Åbn i ClickUp <svg class="ikon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9 2h5v5M14 2L7 9M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sr">(åbner i ny fane)</span></a><button class="link" type="button" id="skiftKunde">Vælg ny kunde</button></span></div>
    ${LUKKET.test(k.status) ? `<p class="advarsel">Kunden har status "${esc(k.status)}". Tjek at sagen er rigtig.</p>` : ''}`;
  farvMaerker(el);
  $('#skiftKunde').onclick = nulstilKunde;
  udfyldKontakt(); udfyldNord(true); udfyldCc(); opdaterNavn();
  visSager(k);
}
function nulstilKunde() {
  S.kunde = null; S.manuel = false;
  visSager(null);
  $('#kundeValgt').classList.add('skjult'); $('#manuel').classList.add('skjult');
  $('#kundeSoeg').classList.remove('skjult'); $('#udenKunde').classList.remove('skjult');
  $('#kundeInput').focus(); opdaterNavn();
}
function manuelKunde() {
  S.kunde = null; S.manuel = true;
  visSager(null);
  $('#kundeSoeg').classList.add('skjult'); $('#udenKunde').classList.add('skjult'); $('#manuel').classList.remove('skjult');
  $('#manuelNavn').focus(); opdaterNavn();
}
$('#tilbageSoeg').onclick = nulstilKunde;
// Knapperne i "Ingen kunder matcher" og linjen "Opret uden kunde" under feltet (ingen inline onclick pga. sikkerhedspolitikken)
const kundeKnap = (e) => {
  const h = e.target.closest('[data-handl]');
  if (!h) return;
  if (h.dataset.handl === 'opdater') hentKunder(true);
  if (h.dataset.handl === 'manuel') manuelKunde();
};
$('#kundeListe').addEventListener('click', kundeKnap);
$('#udenKunde').addEventListener('click', kundeKnap);

// ---------- Igangværende supportsager ----------
// Vises kun, hvis kunden har åbne sager. Fejler hentningen, vises der bare ingenting.
let sagerFor = null;
async function visSager(k) {
  const boks = $('#sager');
  boks.classList.add('skjult');
  boks.open = false;
  sagerFor = k ? k.id : null;
  if (!k) return;
  let sager;
  try { sager = await api('/api/sager?kunde=' + encodeURIComponent(k.id)); } catch { return; }
  if (sagerFor !== k.id || !sager.length) return; // kunden er skiftet i mellemtiden, eller ingen sager
  boks.querySelector('summary').textContent = `Igangværende supportsager (${sager.length})`;
  boks.querySelector('ul').innerHTML = sager.map((s) => {
    const a = s.ansvarlig;
    const folk = a
      ? `<span class="ansvarlig" title="${esc(a.navn)}">${avatar(a)}<span class="sr">${esc(a.navn)}</span></span>`
      : '<span class="ansvarlig ingen" title="Ingen ansvarlig">–<span class="sr">Ingen ansvarlig</span></span>';
    return `<li>
      ${folk}
      <a href="${esc(s.url)}" target="_blank" rel="noopener" data-fuld="${esc(s.navn)}">${esc(s.navn)}<span class="sr"> (åbner i ny fane)</span></a>
      <span class="status" ${farveAttr(s.farve)}>${esc(s.status)}</span>
    </li>`;
  }).join('');
  farvMaerker(boks);
  boks.querySelectorAll('.ansvarlig img').forEach((img) => {
    img.onerror = () => { img.parentElement.textContent = img.closest('.ansvarlig').title.split(/\s+/).map((d) => d[0]).slice(0, 2).join('').toUpperCase(); };
  });
  boks.classList.remove('skjult');
}

// Tooltip med hele titlen, kun på de titler der er forkortet med "...".
// Kan først måles, når listen er foldet ud, og skal måles igen, hvis vinduet ændrer bredde.
function markerForkortede() {
  const boks = $('#sager');
  if (!boks.open) return;
  boks.querySelectorAll('li').forEach((li) => {
    const a = li.querySelector('a');
    const forkortet = a.scrollWidth > a.clientWidth + 1;
    li.classList.toggle('forkortet', forkortet);
    if (forkortet) li.dataset.fuld = a.dataset.fuld; else delete li.dataset.fuld;
  });
}
$('#sager').addEventListener('toggle', markerForkortede);
window.addEventListener('resize', markerForkortede);

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
  visMig();
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
// ---------- CC ekstern ----------
// Eksterne e-mails, der skal have kopi. De skrives som en kommentar på supportsagen.
function nyEksternRaekke(vaerdi = '') {
  const raekke = document.createElement('div');
  raekke.className = 'ekstern-raekke';
  raekke.innerHTML = `<input type="email" placeholder="navn@firma.dk" autocomplete="off"><button type="button" class="fjern" aria-label="Fjern e-mail">×</button>`;
  raekke.querySelector('input').value = vaerdi;
  raekke.querySelector('.fjern').onclick = () => {
    if ($('#eksterne').children.length > 1) raekke.remove();
    else raekke.querySelector('input').value = '';
  };
  $('#eksterne').append(raekke);
  return raekke.querySelector('input');
}
function eksterneMails() {
  return [...document.querySelectorAll('#eksterne input')].map((i) => i.value.trim()).filter(Boolean);
}
function nulstilEksterne() { $('#eksterne').innerHTML = ''; nyEksternRaekke(); }
$('#tilfoejEkstern').onclick = () => nyEksternRaekke().focus();
nulstilEksterne();

// ---------- Opret ----------
$('#opret').addEventListener('click', async () => {
  const fejl = $('#fejl'); fejl.textContent = '';
  const tjek = [
    [!S.kunde && !S.manuel, 'Vælg en kunde, eller tryk "Opret uden kunde".'],
    [S.manuel && !$('#manuelNavn').value.trim(), 'Skriv virksomhedsnavnet.'],
    [S.manuel && !$('#manuelUrl').value.trim(), 'Skriv hjemmeside-linket.'],
    [!$('#emne').value.trim(), 'Skriv et emne.'],
    [!henvendelseMarkdown(), 'Beskriv hvad opgaven handler om.'],
    [!S.svar, 'Vælg hvem der skal have svar.'],
    [['kunden', 'kundenNord'].includes(S.svar) && !$('#kNavn').value.trim(), 'Skriv kundens navn.'],
    [['kunden', 'kundenNord'].includes(S.svar) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#kEmail').value.trim()), 'Skriv en gyldig e-mail på kunden.'],
    [['nord', 'kundenNord'].includes(S.svar) && !S.nord, 'Vælg hvem nørden er.'],
    [S.svar !== 'ingen' && eksterneMails().some((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)), `Tjek e-mailen under CC ekstern: ${eksterneMails().find((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) || ''}`],
  ].find(([b]) => b);
  if (tjek) { fejl.textContent = tjek[1]; return; }

  const knap = $('#opret'); knap.disabled = true; knap.textContent = 'Opretter…';
  try {
    const d = await api('/api/opret', {
      method: 'POST',
      body: JSON.stringify({
        kundeId: S.kunde?.id || null,
        hjemmeside: S.manuel ? $('#manuelUrl').value.trim() : null,
        firmanavn: S.manuel ? $('#manuelNavn').value.trim() : null,
        type: S.type,
        emne: $('#emne').value,
        henvendelse: henvendelseMarkdown(),
        materialer: $('#materialer').value.trim(),
        svarTil: S.svar,
        kontakt: { navn: $('#kNavn').value, email: $('#kEmail').value, telefon: $('#kTlf').value },
        nord: S.nord, cc: S.cc,
        eksterne: S.svar === 'ingen' ? [] : eksterneMails(),
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
    ${d.eksternFejl ? `<p class="obs">Kommentaren med eksterne CC kunne ikke skrives på sagen. Skriv dem på i hånden. (Fejlkode: ${d.eksternFejl})</p>` : ''}
    ${d.kommentarFejl ? `<p class="obs">Kommentaren på kundens opgave kunne ikke skrives. Sagen er oprettet. (Fejlkode: ${d.kommentarFejl})</p>` : ''}
    <button class="link ny-sag" type="button" id="nySag">Opret en ny supportsag</button>`;
  $('#formular').classList.add('skjult'); k.classList.remove('skjult');
  $('#kopier').onclick = async (e) => { try { await navigator.clipboard.writeText('#' + d.id); e.target.textContent = 'Kopieret'; } catch {} };
  $('#nySag').onclick = nulstilAlt;
  window.scrollTo(0, 0);
}

function nulstilAlt() {
  ['#emne', '#materialer', '#kNavn', '#kEmail', '#kTlf', '#manuelNavn', '#manuelUrl'].forEach((s) => ($(s).value = ''));
  rydEditor();
  nulstilEksterne();
  document.querySelectorAll('#type button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === 'normal'));
  document.querySelectorAll('#svarTil button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  S.type = 'normal'; S.svar = null;
  $('#deadlineTekst').textContent = 'Deadline om 5 arbejdsdage.';
  $('#svarGruppe').classList.add('skjult'); $('#kontaktBlok').classList.add('skjult'); $('#nordBlok').classList.add('skjult');
  nordVaelger.saet(null); ccVaelger.saet([]);
  nulstilKunde();
  $('#kvittering').classList.add('skjult'); $('#formular').classList.remove('skjult');
}
// ---------- Formatering i "Hvad handler opgaven om?" ----------
// Feltet viser teksten formateret (som i Google Docs). Ved oprettelse laves den om til
// markdown, som ClickUp viser med de samme overskrifter, fed, kursiv, lister og links.
const editor = $('#henvendelse');

function tilMarkdown(rod) {
  // ~~ escapes kun som par, s\u00e5 en enkelt ~ (fx "ca. ~30") ikke f\u00e5r en backslash foran
  const esc = (t) => t.replace(/\u00a0/g, ' ').replace(/([*_`\\])/g, '\\$1').replace(/~~/g, '\\~\\~');
  function inline(node) {
    let ud = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { ud += esc(n.textContent); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      const indre = inline(n);
      if (tag === 'br') ud += '\n';
      else if ((tag === 'b' || tag === 'strong') && indre.trim()) ud += `**${indre}**`;
      else if ((tag === 'i' || tag === 'em') && indre.trim()) ud += `*${indre}*`;
      else if ((tag === 's' || tag === 'strike' || tag === 'del') && indre.trim()) ud += `~~${indre}~~`;
      else if (tag === 'a' && n.getAttribute('href')) ud += `[${indre || n.getAttribute('href')}](${n.getAttribute('href')})`;
      else if (['div', 'p', 'h1', 'h2', 'ul', 'ol', 'blockquote'].includes(tag)) ud += '\n' + blok({ childNodes: [n] }).trim() + '\n';
      else ud += indre;
    });
    return ud;
  }
  function blok(node) {
    const dele = [];
    let loes = '';
    const toemLoes = () => { if (loes.trim()) dele.push(loes.trim()); loes = ''; };
    node.childNodes.forEach((n) => {
      const tag = n.nodeType === 1 ? n.tagName.toLowerCase() : '';
      if (tag === 'h1' || tag === 'h2') { toemLoes(); const t = inline(n).trim(); if (t) dele.push((tag === 'h1' ? '# ' : '## ') + t.replace(/\n+/g, ' ')); }
      else if (tag === 'ul' || tag === 'ol') {
        toemLoes();
        const punkter = [...n.children].filter((li) => li.tagName === 'LI')
          .map((li, i) => (tag === 'ol' ? `${i + 1}. ` : '- ') + inline(li).trim().replace(/\n+/g, ' '))
          .filter((l) => l.replace(/^(\d+\.|-)\s/, '').trim());
        if (punkter.length) dele.push(punkter.join('\n'));
      }
      else if (tag === 'div' || tag === 'p') { toemLoes(); const t = blok(n).trim(); if (t) dele.push(t); }
      // Citat: hver linje får "> " foran. ClickUp viser ikke citater i citater, så de lægges sammen til ét.
      else if (tag === 'blockquote') {
        toemLoes();
        const t = blok(n).trim().split('\n').map((l) => l.replace(/^(>\s?)+/, '')).join('\n');
        if (t) dele.push(t.split('\n').map((l) => (l.trim() ? '> ' + l : '>')).join('\n'));
      }
      else loes += n.nodeType === 3 ? esc(n.textContent) : inline({ childNodes: [n] });
    });
    toemLoes();
    return dele.join('\n\n');
  }
  let md = blok(rod).replace(/\n{3,}/g, '\n\n').trim();
  // Citater lige efter hinanden (browseren laver ét pr. linje) samles til ét citat
  let foer;
  do { foer = md; md = md.replace(/^(>.*)\n\n(?=>)/m, '$1\n>\n'); } while (md !== foer);
  return md;
}

// ---------- Indsæt fra Gmail ----------
// Bygger indsat HTML om, så kun det ClickUp kan vise kommer med: afsnit, overskrifter, fed,
// kursiv, gennemstregning, lister, links og citater. Farver, skrifttyper, understregning,
// billeder og tabeller bliver til almindelig tekst.
// Gmails citerede svar (blockquote) og videresendte mails (div.gmail_quote) bliver til citater.
function renHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'); // inert: scripts køres ikke, billeder hentes ikke
  const SKRALD = /^(STYLE|SCRIPT|META|LINK|TITLE|HEAD|IMG|PICTURE|VIDEO|AUDIO|SVG|OBJECT|EMBED|IFRAME|NOSCRIPT|TEMPLATE|BUTTON|INPUT|SELECT|TEXTAREA|HR)$/;
  const BLOK = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|NAV|TABLE|TBODY|THEAD|TFOOT|TR|TD|TH|CAPTION|PRE|ADDRESS|CENTER|DL|DT|DD|FIGURE|FIGCAPTION|FORM|FIELDSET)$/;
  const ud = document.createElement('div');
  const aabne = new WeakSet(); // afsnit der stadig kan få mere tekst
  const format = new WeakMap(); // formatering -> [nøgle, inderste element], så nabotekst med samme formatering samles

  // Det afsnit tekst skal ind i. Lister og overskrifter tager selv teksten.
  const afsnit = (maal) => {
    if (/^(LI|H1|H2)$/.test(maal.tagName)) return maal;
    const sidste = maal.lastChild;
    if (sidste && aabne.has(sidste)) return sidste;
    const p = document.createElement('p');
    aabne.add(p);
    maal.append(p);
    return p;
  };
  const luk = (maal) => { if (maal.lastChild) aabne.delete(maal.lastChild); };

  function tekst(t, maal, f) {
    t = t.replace(/[ \t\r\n]+/g, ' ');
    if (!t) return;
    const beholder = f.a || afsnit(maal);
    const noegle = (f.b ? 'b' : '') + (f.i ? 'i' : '') + (f.s ? 's' : '');
    const sidste = beholder.lastChild;
    if (sidste && format.has(sidste) && format.get(sidste)[0] === noegle) { format.get(sidste)[1].append(t); return; }
    if (!noegle) { beholder.append(t); return; }
    let ydre = null, inderste = null;
    for (const tag of ['b', 'i', 's']) {
      if (!f[tag]) continue;
      const w = document.createElement(tag);
      if (inderste) inderste.append(w); else ydre = w;
      inderste = w;
    }
    inderste.append(t);
    format.set(ydre, [noegle, inderste]);
    beholder.append(ydre);
  }

  const boern = (el, maal, f) => el.childNodes.forEach((c) => gaa(c, maal, f));

  function gaa(node, maal, fmt) {
    if (node.nodeType === 3) return tekst(node.data, maal, fmt);
    if (node.nodeType !== 1) return;
    const el = node, tag = el.tagName;
    if (SKRALD.test(tag) || /display\s*:\s*none/i.test(el.getAttribute('style') || '')) return;

    // Formatering fra tags og fra style (Gmail og Google Docs bruger begge dele)
    const st = el.getAttribute('style') || '';
    const f = { ...fmt };
    if (tag === 'B' || tag === 'STRONG' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(st)) f.b = true;
    if (/font-weight\s*:\s*(normal|[1-5]00)/i.test(st)) f.b = false;
    if (tag === 'I' || tag === 'EM' || /font-style\s*:\s*italic/i.test(st)) f.i = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/i.test(st)) f.s = true;

    if (tag === 'BR') {
      const p = f.a || afsnit(maal);
      p.append(document.createElement('br'));
      return;
    }
    if (tag === 'A') {
      const href = (el.getAttribute('href') || '').trim();
      if (/^(https?:|mailto:)/i.test(href) && !fmt.a) {
        const a = document.createElement('a');
        a.href = href;
        afsnit(maal).append(a);
        boern(el, maal, { ...f, a });
        if (!a.textContent.trim()) a.remove();
        return;
      }
      return boern(el, maal, f);
    }
    // Citat: Gmails citerede svar og videresendte mails
    const videresendt = tag === 'DIV' && el.classList.contains('gmail_quote') && !el.querySelector('blockquote');
    if (tag === 'BLOCKQUOTE' || videresendt) {
      const bq = document.createElement('blockquote');
      maal.append(bq);
      boern(el, bq, { ...f, a: null });
      if (!bq.textContent.trim()) bq.remove();
      return;
    }
    if (/^H[1-6]$/.test(tag)) {
      const h = document.createElement(tag === 'H1' ? 'h1' : 'h2');
      maal.append(h);
      boern(el, h, { ...f, a: null, b: false });
      if (!h.textContent.trim()) h.remove();
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      const liste = document.createElement(tag.toLowerCase());
      maal.append(liste);
      el.childNodes.forEach((c) => {
        if (c.nodeType === 3 && !c.data.trim()) return;
        const li = document.createElement('li');
        liste.append(li);
        if (c.nodeType === 1 && c.tagName === 'LI') boern(c, li, { ...f, a: null });
        else gaa(c, li, { ...f, a: null });
        if (!li.textContent.trim()) li.remove();
      });
      if (!liste.children.length) liste.remove();
      return;
    }
    if (BLOK.test(tag) || tag === 'LI') {
      // Blokke foldes ud til afsnit. Inde i et listepunkt eller en overskrift bliver de til linjeskift.
      if (/^(LI|H1|H2)$/.test(maal.tagName)) {
        if (maal.textContent.trim()) maal.append(document.createElement('br'));
        return boern(el, maal, f);
      }
      luk(maal);
      boern(el, maal, { ...f, a: null });
      luk(maal);
      return;
    }
    boern(el, maal, f); // span, font, u osv.: kun indholdet
  }

  boern(doc.body, ud, {});
  // Tomme afsnit i starten og slutningen fjernes
  const tom = (n) => n && n.nodeName === 'P' && !n.textContent.trim();
  while (tom(ud.firstChild)) ud.firstChild.remove();
  while (tom(ud.lastChild)) ud.lastChild.remove();
  return ud.innerHTML;
}

const henvendelseMarkdown = () => tilMarkdown(editor);
function rydEditor() { editor.innerHTML = ''; editor.classList.add('tom'); editor.style.height = ''; } // højden nulstilles, hvis feltet er trukket større

(function () {
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch {}
  const stil = $('#tekststil');
  const vaerk = document.querySelector('.vaerktoej');
  const kmd = (c, v) => { editor.focus(); document.execCommand(c, false, v); opdater(); };

  function opdater() {
    editor.classList.toggle('tom', !editor.textContent.trim() && !editor.querySelector('li,img'));
    let blokTag = '';
    try { blokTag = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch {}
    stil.value = blokTag === 'h1' ? '1' : blokTag === 'h2' ? '2' : '0';
    const tilstand = { fed: 'bold', kursiv: 'italic', gennem: 'strikeThrough', punkt: 'insertUnorderedList', tal: 'insertOrderedList' };
    vaerk.querySelectorAll('[data-fmt]').forEach((b) => {
      const k = tilstand[b.dataset.fmt];
      let aktiv = false;
      try { aktiv = k ? document.queryCommandState(k) : false; } catch {}
      if (b.dataset.fmt === 'citat') aktiv = !!citatVedMarkoer();
      b.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
    });
  }

  // ---------- Citat ----------
  // Det citat markøren står i (eller null)
  function citatVedMarkoer() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    const bq = n && n.closest ? n.closest('blockquote') : null;
    return bq && editor.contains(bq) ? bq : null;
  }
  // Fjerner citatet, men beholder teksten
  function fjernCitat(bq) {
    const harBlokke = [...bq.children].some((c) => /^(P|DIV|H1|H2|UL|OL|BLOCKQUOTE)$/.test(c.tagName));
    if (!harBlokke) { kmd('formatBlock', 'p'); return; } // citat lavet med knappen: tekst direkte i citatet
    const sidste = bq.lastChild;
    bq.replaceWith(...bq.childNodes); // indsat citat (fx fra Gmail): afsnittene flyttes ud
    const sel = window.getSelection();
    if (sidste) { sel.selectAllChildren(sidste); sel.collapseToEnd(); }
    opdater();
  }
  function citat() {
    editor.focus();
    const bq = citatVedMarkoer();
    if (bq) fjernCitat(bq);
    else kmd('formatBlock', 'blockquote');
  }

  function link() {
    const sel = window.getSelection();
    const gemt = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const valgt = sel.toString();
    let url = window.prompt('Indsæt link', 'https://');
    if (!url || url === 'https://') return editor.focus();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    editor.focus();
    if (gemt) { sel.removeAllRanges(); sel.addRange(gemt); }
    if (valgt) document.execCommand('createLink', false, url);
    else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url.replace(/^https?:\/\//, ''))}</a>&nbsp;`);
    opdater();
  }

  const handling = {
    fed: () => kmd('bold'),
    kursiv: () => kmd('italic'),
    gennem: () => kmd('strikeThrough'),
    citat,
    punkt: () => kmd('insertUnorderedList'),
    tal: () => kmd('insertOrderedList'),
    link,
  };
  vaerk.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  vaerk.addEventListener('click', (e) => { const b = e.target.closest('[data-fmt]'); if (b) handling[b.dataset.fmt](); });
  stil.addEventListener('change', () => kmd('formatBlock', stil.value === '1' ? 'h1' : stil.value === '2' ? 'h2' : 'p'));

  editor.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const t = e.key.toLowerCase();
    if (mod && t === 'k') { e.preventDefault(); link(); }
    if (mod && t === 'u') e.preventDefault(); // understregning kan ClickUp ikke vise
    if (mod && e.shiftKey && t === 'x') { e.preventDefault(); kmd('strikeThrough'); }
    // Enter på en tom linje i et citat afslutter citatet (som i Gmail og Google Docs)
    if (e.key === 'Enter' && !e.shiftKey) {
      const bq = citatVedMarkoer();
      const sel = window.getSelection();
      if (bq && sel.isCollapsed) {
        let n = sel.anchorNode;
        if (n.nodeType === 3) n = n.parentNode;
        const linje = n.closest('p,div,li,blockquote');
        if (linje && !linje.textContent.trim() && !linje.closest('li')) {
          e.preventDefault();
          if (linje === bq) { kmd('formatBlock', 'p'); return; }
          const p = document.createElement('p');
          p.append(document.createElement('br'));
          linje.remove();
          bq.after(p);
          if (!bq.textContent.trim()) bq.remove();
          sel.selectAllChildren(p); sel.collapseToStart();
          opdater();
          return;
        }
      }
    }
    // Enter efter en overskrift giver almindelig brødtekst på næste linje
    if (e.key === 'Enter' && !e.shiftKey) {
      let tag = '';
      try { tag = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch {}
      if (tag === 'h1' || tag === 'h2') setTimeout(() => { document.execCommand('formatBlock', false, 'p'); opdater(); }, 0);
    }
  });
  // Indsæt: formatering fra fx Gmail beholdes, men kun den slags ClickUp kan vise.
  // Uden HTML på udklipsholderen indsættes ren tekst.
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const data = e.clipboardData || window.clipboardData;
    const html = data.getData('text/html');
    const ren = html ? renHtml(html) : '';
    if (ren) document.execCommand('insertHTML', false, ren);
    else document.execCommand('insertText', false, data.getData('text/plain'));
    opdater();
  });
  ['input', 'keyup', 'mouseup', 'focus'].forEach((h) => editor.addEventListener(h, opdater));
  document.addEventListener('selectionchange', () => { if (document.activeElement === editor) opdater(); });
})();

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

// Profilbilledet øverst: fra Google, ellers fra ClickUp (når medarbejderne er hentet), ellers initialer
function visMig() {
  const s = session();
  if (!s) return;
  const initialer = s.navn.split(/\s+/).map((d) => d[0]).slice(0, 2).join('').toUpperCase();
  const cu = (FOLK.find((p) => String(p.email || '').toLowerCase() === String(s.email || '').toLowerCase()) || {}).billede;
  const billeder = [s.billede, cu].filter(Boolean);
  $('#brugerNavn').innerHTML = `<span class="avatar mig">${esc(initialer)}</span>Logget ind som ${esc(s.navn)}`;
  const boks = $('#brugerNavn .avatar');
  const proev = (i) => {
    if (i >= billeder.length) return;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    img.onload = () => { boks.textContent = ''; boks.appendChild(img); };
    img.onerror = () => proev(i + 1);
    img.src = billeder[i];
  };
  proev(0);
}

function visFormular() {
  visMig();
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
