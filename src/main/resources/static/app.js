const state = {
  backendUrl: localStorage.getItem('backendUrl') || 'http://localhost:8081',
  decorators: [],
  components: [],
  selectedComponentId: null,
};

const els = {
  backendUrl: document.getElementById('backendUrl'),
  saveBackendUrl: document.getElementById('saveBackendUrl'),
  reloadDecorators: document.getElementById('reloadDecorators'),
  reloadComponents: document.getElementById('reloadComponents'),
  reloadSelected: document.getElementById('reloadSelected'),
  decoratorsList: document.getElementById('decoratorsList'),
  componentsList: document.getElementById('componentsList'),
  detailView: document.getElementById('detailView'),
  simulationOutput: document.getElementById('simulationOutput'),
  createTowerForm: document.getElementById('createTowerForm'),
  decorateForm: document.getElementById('decorateForm'),
  removeForm: document.getElementById('removeForm'),
  simulateForm: document.getElementById('simulateForm'),
  decorateComponent: document.getElementById('decorateComponent'),
  removeComponent: document.getElementById('removeComponent'),
  decorateType: document.getElementById('decorateType'),
};

els.backendUrl.value = state.backendUrl;

els.saveBackendUrl.addEventListener('click', () => {
  state.backendUrl = els.backendUrl.value.trim() || 'http://localhost:8081';
  localStorage.setItem('backendUrl', state.backendUrl);
  refreshAll();
});

els.reloadDecorators.addEventListener('click', loadDecorators);
els.reloadComponents.addEventListener('click', loadComponents);
els.reloadSelected.addEventListener('click', () => state.selectedComponentId && loadComponentDetail(state.selectedComponentId));

els.createTowerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api('/api/components', {
    method: 'POST',
    body: JSON.stringify({
      name: form.get('name'),
      description: form.get('description'),
      basePrice: Number(form.get('basePrice')),
    }),
  });
  event.currentTarget.reset();
  await refreshAll();
});

els.decorateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const componentId = form.get('componentId');
  const decoratorType = form.get('decoratorType');
  if (!componentId || !decoratorType) return;
  await api(`/api/components/${encodeURIComponent(componentId)}/decorators`, {
    method: 'POST',
    body: JSON.stringify({ decoratorType }),
  });
  await refreshAll(componentId);
});

els.removeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const componentId = form.get('componentId');
  const decoratorType = form.get('decoratorType');
  if (!componentId || !decoratorType) return;
  await api(`/api/components/${encodeURIComponent(componentId)}/decorators/${encodeURIComponent(decoratorType)}`, {
    method: 'DELETE',
  });
  await refreshAll(componentId);
});

els.simulateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const decorators = String(form.get('decorators') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((type) => ({ type }));

  const result = await api('/api/components/simulate', {
    method: 'POST',
    body: JSON.stringify({
      name: form.get('name'),
      description: form.get('description'),
      basePrice: Number(form.get('basePrice')),
      decoratorTypes: decorators.map((item) => item.type),
    }),
  });

  els.simulationOutput.textContent = pretty(result);
});

async function refreshAll(componentId = state.selectedComponentId) {
  await Promise.all([loadDecorators(), loadComponents(componentId)]);
}

async function loadDecorators() {
  const data = await api('/api/decorators');
  state.decorators = arrayify(data);
  renderDecorators();
  populateDecoratorSelect();
}

async function loadComponents(selectId = state.selectedComponentId) {
  const data = await api('/api/components');
  state.components = arrayify(data);
  renderComponents();
  populateComponentSelects();

  if (selectId) {
    state.selectedComponentId = selectId;
    await loadComponentDetail(selectId);
  } else if (state.components[0]?.id) {
    state.selectedComponentId = state.components[0].id;
    await loadComponentDetail(state.selectedComponentId);
  }
}

async function loadComponentDetail(componentId) {
  const data = await api(`/api/components/${encodeURIComponent(componentId)}`);
  state.selectedComponentId = componentId;
  renderDetail(unpack(data));
  syncSelection(componentId);
}

function renderDecorators() {
  if (!state.decorators.length) {
    els.decoratorsList.innerHTML = '<div class="card">No decorators loaded yet.</div>';
    return;
  }

  els.decoratorsList.innerHTML = state.decorators.map((decorator) => {
    const title = decorator.type || decorator.name || decorator.code || 'Decorator';
    const cost = money(decorator.additionalCost ?? decorator.cost ?? decorator.price ?? decorator.value);
    const description = decorator.description || decorator.details || 'Available decorator';
    return `<article class="card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><div class="meta-row"><span class="pill">${escapeHtml(cost)}</span></div></article>`;
  }).join('');
}

function renderComponents() {
  if (!state.components.length) {
    els.componentsList.innerHTML = '<div class="card">No towers created yet.</div>';
    return;
  }

  els.componentsList.innerHTML = state.components.map((component) => {
    const active = component.id === state.selectedComponentId ? 'active' : '';
    const title = component.name || `Tower ${component.id}`;
    const base = money(component.basePrice ?? component.price ?? component.base);
    const total = money(component.totalPrice ?? component.finalPrice ?? component.priceFinal);
    const count = Array.isArray(component.decorators) ? component.decorators.length : (component.decoratorCount ?? 0);
    return `
      <article class="card ${active}" data-id="${escapeHtml(String(component.id ?? ''))}">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(component.description || 'No description')}</p>
        <div class="meta-row">
          <span class="pill">Base ${escapeHtml(base)}</span>
          <span class="pill">Total ${escapeHtml(total)}</span>
          <span class="pill">${count} decorators</span>
        </div>
      </article>
    `;
  }).join('');

  els.componentsList.querySelectorAll('.card[data-id]').forEach((card) => {
    card.addEventListener('click', () => loadComponentDetail(card.dataset.id));
  });
}

function renderDetail(component) {
  if (!component) {
    els.detailView.className = 'detail empty';
    els.detailView.textContent = 'No component selected.';
    return;
  }

  const decorators = arrayify(component.decorators || component.appliedDecorators || component.modules);
  const breakdown = component.breakdown || component.priceBreakdown;
  const base = money(component.basePrice ?? component.price ?? component.base);
  const total = money(component.totalPrice ?? component.finalPrice ?? component.priceFinal);

  els.detailView.className = 'detail';
  els.detailView.innerHTML = `
    <h3>${escapeHtml(component.name || `Tower ${component.id}`)}</h3>
    <p>${escapeHtml(component.description || 'No description')}</p>
    <div class="meta-row">
      <span class="pill">Base ${escapeHtml(base)}</span>
      <span class="pill">Total ${escapeHtml(total)}</span>
      <span class="pill">ID ${escapeHtml(String(component.id ?? 'n/a'))}</span>
    </div>
    <h4>Decorators</h4>
    <p>${decorators.length ? decorators.map(formatDecorator).join(', ') : 'No decorators applied.'}</p>
    <h4>Breakdown</h4>
    <pre class="output">${escapeHtml(pretty(breakdown ?? component))}</pre>
  `;
}

function populateComponentSelects() {
  const options = state.components.map((component) => `<option value="${escapeHtml(String(component.id))}">${escapeHtml(component.name || `Tower ${component.id}`)}</option>`).join('');
  els.decorateComponent.innerHTML = options;
  els.removeComponent.innerHTML = options;
}

function populateDecoratorSelect() {
  const options = state.decorators.map((decorator) => {
    const value = decorator.type || decorator.name || decorator.code;
    const label = `${value}${decorator.additionalCost != null ? ` - ${money(decorator.additionalCost)}` : ''}`;
    return `<option value="${escapeHtml(String(value))}">${escapeHtml(label)}</option>`;
  }).join('');
  els.decorateType.innerHTML = options;
}

function syncSelection(componentId) {
  els.decorateComponent.value = componentId;
  els.removeComponent.value = componentId;
  [...els.componentsList.querySelectorAll('.card[data-id]')].forEach((card) => {
    card.classList.toggle('active', card.dataset.id === String(componentId));
  });
}

async function api(path, options = {}) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('backend', state.backendUrl);

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || `Request failed with status ${response.status}`);
  }

  if (contentType.includes('application/json')) {
    return bodyText ? unpack(JSON.parse(bodyText)) : null;
  }

  return bodyText;
}

function unpack(value) {
  if (value && typeof value === 'object' && 'data' in value && 'success' in value) {
    return value.data;
  }
  return value;
}

function arrayify(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.content)) return value.content;
  return [];
}

function money(value) {
  if (value == null || value === '') return 'N/A';
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : String(value);
}

function formatDecorator(decorator) {
  if (typeof decorator === 'string') return decorator;
  return decorator.type || decorator.name || decorator.code || 'Decorator';
}

function pretty(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

refreshAll().catch((error) => {
  els.simulationOutput.textContent = error.message;
});
