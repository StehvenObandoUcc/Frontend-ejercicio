/* ===== CONFIG ===== */
const DEFAULT_BACKEND = 'https://backend-clinica-fqky.onrender.com';
const API_KEY = 'decorator-secret-2026';

/* ===== STATE ===== */
const state = {
  backendUrl: localStorage.getItem('backendUrl') || DEFAULT_BACKEND,
  decorators: [],
  components: [],
  selectedComponentId: null,
};

/* ===== DOM REFS ===== */
const $ = (id) => document.getElementById(id);

const els = {
  backendUrl:        $('backendUrl'),
  saveBackendUrl:    $('saveBackendUrl'),
  statusIndicator:   $('statusIndicator'),
  reloadDecorators:  $('reloadDecorators'),
  reloadComponents:  $('reloadComponents'),
  decoratorsList:    $('decoratorsList'),
  componentsList:    $('componentsList'),
  detailView:        $('detailView'),
  simulationOutput:  $('simulationOutput'),
  createTowerForm:   $('createTowerForm'),
  decorateForm:      $('decorateForm'),
  removeForm:        $('removeForm'),
  simulateForm:      $('simulateForm'),
  decorateComponent: $('decorateComponent'),
  decorateType:      $('decorateType'),
  removeComponent:   $('removeComponent'),
  removeType:        $('removeType'),
  simDecoratorChecks:$('simDecoratorChecks'),
  waveTowerSelect:   $('waveTowerSelect'),
  waveEnemyCount:    $('waveEnemyCount'),
  waveStart:         $('waveStart'),
  waveCanvas:        $('waveCanvas'),
  waveLog:           $('waveLog'),
  toast:             $('toast'),
};

els.backendUrl.value = state.backendUrl;

/* ===== TOAST ===== */
let toastTimer = null;
function toast(msg, ok = true) {
  clearTimeout(toastTimer);
  els.toast.textContent = msg;
  els.toast.className = 'toast ' + (ok ? 'ok' : 'err');
  els.toast.hidden = false;
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3500);
}

/* ===== API HELPER ===== */
async function api(path, options = {}) {
  const url = state.backendUrl.replace(/\/+$/, '') + path;
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
      ...(options.headers || {}),
    },
    ...options,
  });
  const ct = resp.headers.get('content-type') || '';
  const text = await resp.text();
  if (!resp.ok) {
    const errMsg = tryParseErrorMessage(text) || `Error ${resp.status}`;
    throw new Error(errMsg);
  }
  if (ct.includes('application/json') && text) {
    return unpack(JSON.parse(text));
  }
  return text || null;
}

function tryParseErrorMessage(text) {
  try {
    const obj = JSON.parse(text);
    return obj.message || obj.error || text;
  } catch {
    return text;
  }
}

/* ===== TABS ===== */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((s) => {
      s.classList.remove('active');
      s.hidden = true;
    });
    btn.classList.add('active');
    const section = $('tab-' + btn.dataset.tab);
    section.classList.add('active');
    section.hidden = false;
  });
});

/* ===== CONNECTION ===== */
els.saveBackendUrl.addEventListener('click', () => {
  state.backendUrl = els.backendUrl.value.trim() || DEFAULT_BACKEND;
  localStorage.setItem('backendUrl', state.backendUrl);
  toast('Backend URL saved');
  refreshAll();
});

async function checkConnection() {
  try {
    await api('/api/v1/decorators');
    els.statusIndicator.textContent = 'Connected';
    els.statusIndicator.style.color = '#6ee7a0';
  } catch {
    els.statusIndicator.textContent = 'Cannot reach backend';
    els.statusIndicator.style.color = '#ff7c9c';
  }
}

/* ===== DECORATORS ===== */
els.reloadDecorators.addEventListener('click', loadDecorators);

async function loadDecorators() {
  try {
    const data = await api('/api/v1/decorators');
    state.decorators = arrayify(data);
    renderDecorators();
    populateDecoratorSelects();
    populateSimulateCheckboxes();
  } catch (err) {
    toast(err.message, false);
  }
}

function renderDecorators() {
  if (!state.decorators.length) {
    els.decoratorsList.innerHTML = '<div class="card">No decorators loaded yet.</div>';
    return;
  }
  els.decoratorsList.innerHTML = state.decorators.map((d) => {
    const title = d.type || d.name || 'Decorator';
    const cost = money(d.additionalCost ?? d.cost ?? d.price);
    const desc = d.description || 'Available decorator';
    const multi = d.canBeAppliedMultipleTimes ? 'Stackable' : 'Once only';
    return `<article class="card">
      <h3>${esc(title)}</h3>
      <p>${esc(desc)}</p>
      <div class="meta-row">
        <span class="pill">${esc(cost)}</span>
        <span class="pill ${d.canBeAppliedMultipleTimes ? 'success' : 'danger'}">${multi}</span>
      </div>
    </article>`;
  }).join('');
}

function populateDecoratorSelects() {
  const opts = state.decorators.map((d) => {
    const val = d.type || d.name;
    const label = `${val} (${money(d.additionalCost ?? d.cost)})`;
    return `<option value="${esc(val)}">${esc(label)}</option>`;
  }).join('');
  els.decorateType.innerHTML = opts;
  els.removeType.innerHTML = opts;
}

function populateSimulateCheckboxes() {
  els.simDecoratorChecks.innerHTML = state.decorators.map((d) => {
    const val = d.type || d.name;
    return `<label><input type="checkbox" name="simDec" value="${esc(val)}"> ${esc(val)} (${money(d.additionalCost ?? d.cost)})</label>`;
  }).join('');
}

/* ===== TOWERS (COMPONENTS) ===== */
els.reloadComponents.addEventListener('click', () => loadComponents());

els.createTowerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try {
    await api('/api/v1/components', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        description: fd.get('description'),
        basePrice: Number(fd.get('basePrice')),
      }),
    });
    e.currentTarget.reset();
    toast('Tower created');
    await refreshAll();
  } catch (err) {
    toast(err.message, false);
  }
});

els.decorateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const id = fd.get('componentId');
  const type = fd.get('decoratorType');
  if (!id || !type) return;
  try {
    await api(`/api/v1/components/${enc(id)}/decorators`, {
      method: 'POST',
      body: JSON.stringify({ decoratorType: type }),
    });
    toast(`Applied ${type}`);
    await refreshAll(id);
  } catch (err) {
    toast(err.message, false);
  }
});

els.removeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const id = fd.get('componentId');
  const type = fd.get('decoratorType');
  if (!id || !type) return;
  try {
    await api(`/api/v1/components/${enc(id)}/decorators/${enc(type)}`, {
      method: 'DELETE',
    });
    toast(`Removed ${type}`);
    await refreshAll(id);
  } catch (err) {
    toast(err.message, false);
  }
});

async function loadComponents(selectId = state.selectedComponentId) {
  try {
    const data = await api('/api/v1/components');
    state.components = arrayify(data);
    renderComponents();
    populateComponentSelects();
    populateWaveTowerSelect();
    if (selectId) {
      state.selectedComponentId = selectId;
      await loadComponentDetail(selectId);
    } else if (state.components.length) {
      state.selectedComponentId = state.components[0].id;
      await loadComponentDetail(state.selectedComponentId);
    }
  } catch (err) {
    toast(err.message, false);
  }
}

async function loadComponentDetail(id) {
  try {
    const data = await api(`/api/v1/components/${enc(id)}`);
    state.selectedComponentId = id;
    renderDetail(data);
    syncSelection(id);
  } catch (err) {
    toast(err.message, false);
  }
}

async function deleteTower(id) {
  try {
    await api(`/api/v1/components/${enc(id)}`, { method: 'DELETE' });
    toast('Tower deleted');
    if (state.selectedComponentId === id) state.selectedComponentId = null;
    await refreshAll();
  } catch (err) {
    toast(err.message, false);
  }
}

function renderComponents() {
  if (!state.components.length) {
    els.componentsList.innerHTML = '<div class="card">No towers created yet.</div>';
    return;
  }
  els.componentsList.innerHTML = state.components.map((c) => {
    const active = c.id === state.selectedComponentId ? 'active' : '';
    const title = c.name || `Tower ${c.id}`;
    const base = money(c.basePrice ?? c.price);
    const total = money(c.totalPrice ?? c.finalPrice);
    const decs = Array.isArray(c.appliedDecoratorTypes) ? c.appliedDecoratorTypes : [];
    return `
      <article class="card ${active}" data-id="${esc(String(c.id))}">
        <h3>${esc(title)}</h3>
        <p>${esc(c.description || 'No description')}</p>
        <div class="meta-row">
          <span class="pill">Base ${esc(base)}</span>
          <span class="pill">Total ${esc(total)}</span>
          <span class="pill">${decs.length} decorators</span>
        </div>
        <button class="delete-btn" data-delete="${esc(String(c.id))}">Delete</button>
      </article>`;
  }).join('');

  els.componentsList.querySelectorAll('.card[data-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      loadComponentDetail(card.dataset.id);
    });
  });
  els.componentsList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTower(btn.dataset.delete);
    });
  });
}

function renderDetail(component) {
  if (!component) {
    els.detailView.className = 'detail empty';
    els.detailView.textContent = 'No component selected.';
    return;
  }
  const decs = Array.isArray(component.appliedDecoratorTypes) ? component.appliedDecoratorTypes : [];
  const breakdown = component.priceBreakdown || component.breakdown;
  const base = money(component.basePrice ?? component.price);
  const total = money(component.totalPrice ?? component.finalPrice);

  let breakdownHtml = '';
  if (breakdown) {
    const items = breakdown.decoratorCosts || breakdown.items || [];
    breakdownHtml = `
      <table class="breakdown-table">
        <thead><tr><th>Item</th><th>Cost</th></tr></thead>
        <tbody>
          <tr><td>Base price</td><td>${esc(money(breakdown.basePrice))}</td></tr>
          ${items.map((i) => `<tr><td>${esc(i.type || i.name)}</td><td>+ ${esc(money(i.cost ?? i.additionalCost))}</td></tr>`).join('')}
          <tr class="total-row"><td>Total</td><td>${esc(money(breakdown.finalPrice ?? breakdown.total))}</td></tr>
        </tbody>
      </table>`;
  }

  els.detailView.className = 'detail';
  els.detailView.innerHTML = `
    <h3>${esc(component.name || 'Tower')}</h3>
    <p>${esc(component.description || 'No description')}</p>
    <div class="meta-row">
      <span class="pill">Base ${esc(base)}</span>
      <span class="pill">Total ${esc(total)}</span>
      <span class="pill">ID ${esc(String(component.id ?? 'n/a'))}</span>
    </div>
    <h4>Applied decorators</h4>
    <div class="meta-row">${decs.length ? decs.map((d) => `<span class="pill success">${esc(d)}</span>`).join('') : '<span class="hint">None</span>'}</div>
    <h4>Price breakdown</h4>
    ${breakdownHtml || '<p class="hint">No breakdown available.</p>'}
  `;
}

function populateComponentSelects() {
  const opts = state.components.map((c) =>
    `<option value="${esc(String(c.id))}">${esc(c.name || 'Tower ' + c.id)}</option>`
  ).join('');
  els.decorateComponent.innerHTML = opts;
  els.removeComponent.innerHTML = opts;
}

function populateWaveTowerSelect() {
  els.waveTowerSelect.innerHTML = state.components.map((c) =>
    `<option value="${esc(String(c.id))}">${esc(c.name || 'Tower ' + c.id)}</option>`
  ).join('');
}

function syncSelection(id) {
  els.decorateComponent.value = id;
  els.removeComponent.value = id;
  [...els.componentsList.querySelectorAll('.card[data-id]')].forEach((card) => {
    card.classList.toggle('active', card.dataset.id === String(id));
  });
}

/* ===== SIMULATE ===== */
els.simulateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const checked = [...document.querySelectorAll('#simDecoratorChecks input:checked')].map((cb) => cb.value);
  try {
    const result = await api('/api/v1/components/simulate', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        description: fd.get('description'),
        basePrice: Number(fd.get('basePrice')),
        decoratorTypes: checked,
      }),
    });
    els.simulationOutput.textContent = pretty(result);
    toast('Simulation complete');
  } catch (err) {
    els.simulationOutput.textContent = err.message;
    toast(err.message, false);
  }
});

/* ===== WAVE SIMULATION (canvas animation) ===== */
let waveAnimationId = null;

els.waveStart.addEventListener('click', startWave);

function startWave() {
  const towerId = els.waveTowerSelect.value;
  const tower = state.components.find((c) => String(c.id) === towerId);
  if (!tower) { toast('Select a tower first', false); return; }

  const enemyCount = Math.min(30, Math.max(1, Number(els.waveEnemyCount.value) || 8));
  const decs = Array.isArray(tower.appliedDecoratorTypes) ? tower.appliedDecoratorTypes : [];
  const baseDmg = Number(tower.basePrice ?? 10);
  const totalDmg = Number(tower.totalPrice ?? tower.finalPrice ?? baseDmg);

  // Decorator effects
  const hasInsurance    = decs.includes('INSURANCE');
  const hasGiftWrap     = decs.includes('GIFT_WRAP');
  const hasPriority     = decs.includes('PRIORITY_SUPPORT');
  const hasExpress      = decs.includes('EXPRESS_DELIVERY');

  const fireRate   = hasPriority ? 18 : 35;           // frames between shots
  const bulletSpd  = hasExpress ? 7 : 4;
  const dmgPerHit  = totalDmg * (hasGiftWrap ? 1.5 : 1);
  const towerShield = hasInsurance ? 3 : 0;

  const canvas = els.waveCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const W = canvas.width;
  const H = canvas.height;

  const towerX = 80;
  const towerY = H / 2;

  // Create enemies
  const enemies = [];
  for (let i = 0; i < enemyCount; i++) {
    enemies.push({
      x: W + 40 + i * 60,
      y: H * 0.25 + Math.random() * H * 0.5,
      hp: baseDmg * 2 + Math.random() * baseDmg,
      maxHp: 0,
      spd: 0.5 + Math.random() * 0.8,
      alive: true,
      radius: 14,
    });
    enemies[i].maxHp = enemies[i].hp;
  }

  const bullets = [];
  let frame = 0;
  let kills = 0;
  let shieldHp = towerShield;
  let log = `Wave: ${enemyCount} enemies | Tower: ${tower.name} [${decs.join(', ') || 'no upgrades'}]\n`;
  log += `Damage/hit: ${dmgPerHit.toFixed(1)} | Fire rate: every ${fireRate}f | Bullet speed: ${bulletSpd}\n`;
  if (hasInsurance) log += `Shield: ${towerShield} hits\n`;
  log += '---\n';

  if (waveAnimationId) cancelAnimationFrame(waveAnimationId);

  function tick() {
    frame++;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Draw tower
    ctx.fillStyle = '#75d1ff';
    ctx.beginPath();
    ctx.moveTo(towerX, towerY - 25);
    ctx.lineTo(towerX + 30, towerY);
    ctx.lineTo(towerX, towerY + 25);
    ctx.lineTo(towerX - 15, towerY);
    ctx.closePath();
    ctx.fill();

    if (shieldHp > 0) {
      ctx.strokeStyle = '#6ee7a0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(towerX + 5, towerY, 35, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Find nearest alive enemy
    let nearest = null;
    let nearDist = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - towerX, e.y - towerY);
      if (d < nearDist) { nearDist = d; nearest = e; }
    }

    // Fire
    if (nearest && frame % fireRate === 0) {
      const angle = Math.atan2(nearest.y - towerY, nearest.x - towerX);
      bullets.push({ x: towerX + 30, y: towerY, vx: Math.cos(angle) * bulletSpd, vy: Math.sin(angle) * bulletSpd });
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      if (b.x > W + 20 || b.x < -20 || b.y > H + 20 || b.y < -20) { bullets.splice(i, 1); continue; }

      // Check hit
      for (const e of enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.radius + 4) {
          e.hp -= dmgPerHit;
          bullets.splice(i, 1);
          if (e.hp <= 0) {
            e.alive = false;
            kills++;
            log += `[frame ${frame}] Enemy destroyed (${kills}/${enemyCount})\n`;
          }
          break;
        }
      }
    }

    // Draw bullets
    ctx.fillStyle = hasGiftWrap ? '#ffd700' : '#ff7c9c';
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Update & draw enemies
    let anyAlive = false;
    for (const e of enemies) {
      if (!e.alive) continue;
      anyAlive = true;
      e.x -= e.spd;

      // Enemy reaches tower
      if (e.x <= towerX + 30) {
        if (shieldHp > 0) {
          shieldHp--;
          e.alive = false;
          kills++;
          log += `[frame ${frame}] Shield absorbed enemy (shield left: ${shieldHp})\n`;
          continue;
        } else {
          log += `[frame ${frame}] ENEMY REACHED THE TOWER - Wave failed!\n`;
          els.waveLog.textContent = log;
          drawEndScreen(ctx, W, H, false, kills, enemyCount);
          return;
        }
      }

      // Draw enemy
      const hpRatio = e.hp / e.maxHp;
      ctx.fillStyle = `hsl(${hpRatio * 120}, 70%, 50%)`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();

      // HP bar
      ctx.fillStyle = '#333';
      ctx.fillRect(e.x - 15, e.y - e.radius - 8, 30, 4);
      ctx.fillStyle = '#6ee7a0';
      ctx.fillRect(e.x - 15, e.y - e.radius - 8, 30 * hpRatio, 4);
    }

    // HUD
    ctx.fillStyle = '#edf2ff';
    ctx.font = '14px monospace';
    ctx.fillText(`Frame: ${frame}  Kills: ${kills}/${enemyCount}  Shield: ${shieldHp}`, 10, 20);

    if (!anyAlive) {
      log += `\nAll enemies destroyed in ${frame} frames! Wave complete.\n`;
      els.waveLog.textContent = log;
      drawEndScreen(ctx, W, H, true, kills, enemyCount);
      return;
    }

    waveAnimationId = requestAnimationFrame(tick);
  }

  els.waveLog.textContent = log;
  tick();
}

function drawEndScreen(ctx, W, H, won, kills, total) {
  ctx.fillStyle = won ? 'rgba(110,231,160,0.15)' : 'rgba(255,124,156,0.15)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = won ? '#6ee7a0' : '#ff7c9c';
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(won ? 'WAVE CLEARED!' : 'WAVE FAILED!', W / 2, H / 2 - 10);
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText(`Kills: ${kills}/${total}`, W / 2, H / 2 + 20);
  ctx.textAlign = 'start';
}

/* ===== REFRESH ===== */
async function refreshAll(selectId = state.selectedComponentId) {
  await Promise.all([loadDecorators(), loadComponents(selectId)]);
}

/* ===== UTILS ===== */
function unpack(v) {
  if (v && typeof v === 'object' && 'data' in v && 'success' in v) return v.data;
  return v;
}

function arrayify(v) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.items)) return v.items;
  if (Array.isArray(v?.data)) return v.data;
  if (Array.isArray(v?.content)) return v.content;
  return [];
}

function money(v) {
  if (v == null || v === '') return 'N/A';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(v);
}

function pretty(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function esc(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function enc(v) { return encodeURIComponent(v); }

/* ===== BOOT ===== */
checkConnection();
refreshAll().catch((err) => {
  els.statusIndicator.textContent = 'Cannot reach backend';
  els.statusIndicator.style.color = '#ff7c9c';
});
