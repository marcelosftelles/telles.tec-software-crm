// App Logic
(function () {
  const { $, $$, brl, parseBRL, diffDays, uid, renderStatus, formatDateBR } = window.Utils;
  const { load, saveAll, exportCSV, importCSV, seedOnce } = window.StorageAPI;

  // State
  let currentView = 'form'; // 'form' | 'list'
  let editingId = null;

  // --- Initialization ---
  function init() {
    // Safety: ensure modal is hidden
    $('#logoModal').classList.add('hide');

    loadTheme();
    loadLogo();
    seedOnce();

    // Initial Render
    renderList();
    updateCounts();

    wire();

    // Fix for input blocking when switching windows
    window.addEventListener('focus', () => {
      // Force re-enable all inputs when window regains focus
      $$('input, select, textarea').forEach(el => {
        if (!el.disabled && el.id !== 'days') {
          el.style.pointerEvents = 'auto';
          el.removeAttribute('readonly');
        }
      });
    });
  }

  // --- Theme Logic ---
  function loadTheme() {
    const saved = localStorage.getItem('telles_theme');
    if (saved === 'light') {
      document.body.classList.add('light-mode');
      $('#themeToggle .icon').textContent = '☀️';
      $('#themeToggle').innerHTML = '<span class="icon">☀️</span> Modo Claro';
    }
  }

  function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('telles_theme', isLight ? 'light' : 'dark');

    const btn = $('#themeToggle');
    if (isLight) {
      btn.innerHTML = '<span class="icon">☀️</span> Modo Claro';
    } else {
      btn.innerHTML = '<span class="icon">🌙</span> Modo Escuro';
    }
  }

  // --- View Navigation ---
  function switchView(viewName, shouldClear = false) {
    currentView = viewName;

    // Update Nav
    $$('.nav-item').forEach(el => el.classList.remove('active'));
    $(`.nav-item[data-view="${viewName}"]`).classList.add('active');

    // Update Views
    $$('.view').forEach(el => el.classList.remove('active'));
    $(`#view-${viewName}`).classList.add('active');

    // Clear form only if explicitly requested (e.g., clicking "Nova OS")
    if (viewName === 'form' && shouldClear) {
      clearForm();
    }

    // Update Header Title
    let title = '';
    if (viewName === 'form') {
      title = editingId ? '✏️ Editar Ordem de Serviço' : 'Nova Ordem de Serviço';
    } else {
      title = 'Histórico de Ordens';
    }
    $('#pageTitle').textContent = title;

    if (viewName === 'list') {
      renderList();
    }
  }

  // --- Form Handling ---
  function clearForm() {
    ['osNumber', 'entryDate', 'exitDate', 'customer', 'contact', 'product', 'defect', 'diagnosis', 'service', 'value', 'status', 'days'].forEach(id => {
      const el = $('#' + id);
      if (el && !el.disabled) el.value = '';
    });
    $('#status').value = 'Em análise';
    $('#days').value = '';
    editingId = null;
    $('#pageTitle').textContent = 'Nova Ordem de Serviço';
  }

  function fillForm(item) {
    editingId = item.id;
    $('#osNumber').value = item.id;
    $('#entryDate').value = item.entryDate || '';
    $('#exitDate').value = item.exitDate || '';
    $('#customer').value = item.customer || '';
    $('#contact').value = item.contact || '';
    $('#product').value = item.product || '';
    $('#defect').value = item.defect || '';
    $('#diagnosis').value = item.diagnosis || '';
    $('#service').value = item.service || '';
    $('#value').value = item.value != null ? item.value.toString().replace('.', ',') : '';
    $('#status').value = item.status || 'Em análise';
    $('#days').value = item.days ?? '';

    switchView('form');
    $('#pageTitle').textContent = '✏️ Editar OS: ' + item.id;
  }

  function saveOS() {
    const id = $('#osNumber').value.trim() || uid();
    const entryDate = $('#entryDate').value;
    const exitDate = $('#exitDate').value;
    const customer = $('#customer').value.trim();
    const contact = $('#contact').value.trim();
    const product = $('#product').value.trim();
    const defect = $('#defect').value.trim();
    const diagnosis = $('#diagnosis').value.trim();
    const service = $('#service').value.trim();
    const value = parseBRL($('#value').value);
    const status = $('#status').value;

    const days = diffDays(entryDate, exitDate);
    $('#days').value = days;

    if (!customer || !product) {
      alert('Preencha Cliente e Produto!');
      return;
    }

    const list = load();
    const idx = list.findIndex(x => x.id === id);
    const item = { id, entryDate, exitDate, customer, contact, product, defect, diagnosis, service, value, status, days, updatedAt: Date.now() };

    if (idx >= 0) {
      // Preserve createdAt from existing
      item.createdAt = list[idx].createdAt;
      list[idx] = item;
    } else {
      list.push({ ...item, createdAt: Date.now() });
    }

    saveAll(list);

    // Update UI
    const wasEditing = idx >= 0;
    editingId = id;
    $('#osNumber').value = id;
    alert('OS Salva com sucesso!');
    updateCounts();

    // If editing an existing OS, redirect to list view to show it
    if (wasEditing) {
      switchView('list');
      // Scroll to the edited OS after a brief delay
      setTimeout(() => {
        const osItem = document.querySelector(`[data-id="${id}"]`)?.closest('.os-item');
        if (osItem) {
          osItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          osItem.classList.add('highlight-flash');
          setTimeout(() => osItem.classList.remove('highlight-flash'), 2000);
        }
      }, 100);
    }
  }

  function deleteOS() {
    if (!editingId) return;
    if (!confirm('Tem certeza que deseja excluir esta OS?')) return;

    const list = load().filter(x => x.id !== editingId);
    saveAll(list);
    clearForm();
    updateCounts();
    alert('OS excluída.');
  }

  // --- List Rendering (Expandable) ---
  function renderList() {
    const list = load();
    const container = $('#osListContainer');
    container.innerHTML = '';

    // Filters
    const q = $('#search').value.toLowerCase();
    const st = $('#filterStatus').value;
    const fs = $('#filterStart').value;
    const fe = $('#filterEnd').value;

    const filtered = list.filter(x => {
      if (st && x.status !== st) return false;
      if (fs && x.entryDate && x.entryDate < fs) return false;
      if (fe && x.entryDate && x.entryDate > fe) return false;
      if (q) {
        const hay = [x.id, x.customer, x.product, x.defect, x.diagnosis, x.service, x.status].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort (Newest first)
    // Sort (Newest first - try createdAt, then entryDate, then ID desc)
    filtered.sort((a, b) => {
      const ca = a.createdAt || new Date(a.entryDate).getTime() || 0;
      const cb = b.createdAt || new Date(b.entryDate).getTime() || 0;
      if (cb !== ca) return cb - ca;
      return b.id.localeCompare(a.id);
    });

    $('#count').textContent = `${filtered.length} registros encontrados`;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted)">Nenhuma OS encontrada.</div>';
      return;
    }

    filtered.forEach(item => {
      const el = document.createElement('div');
      el.className = 'os-item';
      el.innerHTML = `
        <div class="os-summary" onclick="this.parentElement.classList.toggle('expanded')">
          <span style="font-weight:bold; color:var(--primary)">${item.id}</span>
          <span>${item.customer}</span>
          <span>${item.product}</span>
          <span>${renderStatus(item.status)}</span>
          <span class="muted">${formatDateBR(item.entryDate)}</span>
          <span style="font-weight:600">${brl(item.value)}</span>
        </div>
        <div class="os-details">
          <div class="detail-grid">
            <div class="detail-block">
              <h4>Defeito Relatado</h4>
              <p>${item.defect || '<span class="muted">Não informado</span>'}</p>
            </div>
            <div class="detail-block">
              <h4>Diagnóstico Técnico</h4>
              <p>${item.diagnosis || '<span class="muted">Não informado</span>'}</p>
            </div>
            <div class="detail-block">
              <h4>Serviço Realizado</h4>
              <p>${item.service || '<span class="muted">Não informado</span>'}</p>
            </div>
            <div class="detail-block">
              <h4>Detalhes</h4>
              <p><strong>Contato:</strong> ${item.contact || '-'}</p>
              <p><strong>Entrada:</strong> ${formatDateBR(item.entryDate)} | <strong>Saída:</strong> ${formatDateBR(item.exitDate)}</p>
              <p><strong>Dias em serviço:</strong> ${item.days || '-'}</p>
            </div>
          </div>
          <div class="detail-actions">
            <button class="btn ghost small btn-edit-os" data-id="${item.id}">Editar / Imprimir</button>
          </div>
        </div>
      `;
      container.appendChild(el);
    });

    // Wire edit buttons
    $$('.btn-edit-os').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent toggle
        const id = e.target.dataset.id;
        const item = list.find(x => x.id === id);
        if (item) fillForm(item);
      });
    });
  }

  function updateCounts() {
    // Optional: Update dashboard counts if we had one
  }

  // --- Logo Logic ---
  function applyLogo(src) {
    $$('.logo').forEach(el => el.src = src);
    const printLogo = document.querySelector('.print-logo');
    if (printLogo) printLogo.src = src;

    // Apply saved zoom
    const savedZoom = localStorage.getItem('telles_logo_zoom') || '1';

    // Apply zoom to sidebar logo
    $$('.sidebar-logo').forEach(el => {
      el.style.transform = `scale(${savedZoom})`;
    });
  }

  function loadLogo() {
    const saved = localStorage.getItem('telles_logo');
    if (saved) { applyLogo(saved); }

    const savedZoom = localStorage.getItem('telles_logo_zoom');
    if (savedZoom) {
      $('#logoZoom').value = savedZoom;
      $('#logoZoomVal').textContent = parseFloat(savedZoom).toFixed(1) + 'x';
    }
  }

  function wireLogoUpload() {
    // Open Modal
    const input = document.getElementById('logoFile');
    if (!input) return;

    input.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;

      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          // Validation
          if (img.width < 500 || img.height < 500) {
            alert('Aviso: A resolução da logo é baixa (menor que 500px). Pode ficar pixelada.');
          }

          const dataURL = ev.target.result;

          $('#logoPreview').src = dataURL;
          $('#logoModal').classList.remove('hide');
          $('#logoModal').dataset.tempSrc = dataURL;
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(f);

      // Reset input
      input.value = '';
    });

    // Zoom Slider
    $('#logoZoom').addEventListener('input', e => {
      const zoom = e.target.value;
      $('#logoZoomVal').textContent = parseFloat(zoom).toFixed(1) + 'x';
      $('#logoPreview').style.transform = `scale(${zoom})`;
    });

    // Cancel
    $('#btnCancelLogo').addEventListener('click', () => {
      $('#logoModal').classList.add('hide');
    });

    // Confirm
    $('#btnConfirmLogo').addEventListener('click', () => {
      const src = $('#logoModal').dataset.tempSrc;
      const zoom = $('#logoZoom').value;

      if (src) localStorage.setItem('telles_logo', src);
      localStorage.setItem('telles_logo_zoom', zoom);

      if (src) applyLogo(src);
      else loadLogo();

      $('#logoModal').classList.add('hide');
      alert('Logo salva com sucesso!');
    });
  }

  // --- Wiring ---
  function wire() {
    // Nav
    $$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        // Clear form when clicking "Nova OS" button
        const shouldClear = view === 'form';
        switchView(view, shouldClear);
      });
    });

    // Theme
    $('#themeToggle').addEventListener('click', toggleTheme);

    // Form Actions
    $('#btnSave').addEventListener('click', saveOS);
    $('#btnDelete').addEventListener('click', deleteOS);
    $('#btnClear').addEventListener('click', clearForm);
    $('#btnGenOS').addEventListener('click', () => $('#osNumber').value = uid());

    // Print
    $('#btnPrint').addEventListener('click', () => {
      if (!editingId) { alert('Salve a OS antes de imprimir.'); return; }
      const list = load();
      const item = list.find(x => x.id === editingId);
      if (item) window.PrintAPI.printOS(item);
    });

    $('#btnSavePDF').addEventListener('click', () => {
      if (!editingId) { alert('Salve a OS antes de salvar PDF.'); return; }
      const list = load();
      const item = list.find(x => x.id === editingId);
      if (item) window.PrintAPI.savePDF(item);
    });

    // Export/Import
    $('#btnExport').addEventListener('click', exportCSV);
    $('#importCsv').addEventListener('change', e => {
      if (e.target.files[0]) importCSV(e.target.files[0]);
    });

    // Filters
    ['search', 'filterStatus', 'filterStart', 'filterEnd'].forEach(id => {
      $('#' + id).addEventListener('input', renderList);
    });
    $('#btnResetFilters').addEventListener('click', () => {
      $('#search').value = '';
      $('#filterStatus').value = '';
      $('#filterStart').value = '';
      $('#filterEnd').value = '';
      renderList();
    });

    // Logo
    wireLogoUpload();
  }

  // Expose
  window.App = { init, render: renderList };

  // Start
  window.addEventListener('DOMContentLoaded', init);

})();
