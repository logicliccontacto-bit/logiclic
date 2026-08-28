// ── Dashboard Controller ──
// ── Shared registries used by dashboard-casillero-requests.js and dashboard-casilleros.js ──
window._tabModules = {};      // tabName -> { init(), _loaded }
window._deleteHandlers = {};  // type -> async function(id)
window._pendingDelete = null; // { type, id }

(function () {
  'use strict';

  let allRequests = [];

  // ── Utils (shared with the other tab modules via window) ──
  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-CO', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  window.formatDate = formatDate;

  function statusClass(status) {
    if (status === 'Pendiente') return 'status-pendiente';
    if (status === 'En proceso') return 'status-process';
    if (status === 'Completado') return 'status-completed';
    return '';
  }

  function showLoader() {
    document.getElementById('pageLoader').style.opacity = '1';
    document.getElementById('pageLoader').style.pointerEvents = 'all';
  }

  function hideLoader() {
    const loader = document.getElementById('pageLoader');
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    setTimeout(() => { loader.style.display = 'none'; }, 300);
  }

  // ── Session Check ──
  async function checkSession() {
    try {
      const res = await fetch('/api/admin/check-session');
      if (!res.ok) {
        window.location.href = 'login.html';
        return;
      }
      const data = await res.json();
      if (!data.success) {
        window.location.href = 'login.html';
        return;
      }
      document.getElementById('adminUsername').textContent = data.username;
    } catch (err) {
      window.location.href = 'login.html';
    }
  }

  // ── Logout ──
  document.getElementById('logoutBtn').addEventListener('click', async function () {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    window.location.href = 'login.html';
  });

  // ── Fetch & Render Requests ──
  async function fetchRequests() {
    try {
      const res = await fetch('/api/admin/requests');
      if (!res.ok) {
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        throw new Error('Server error');
      }
      const data = await res.json();
      if (data.success) {
        allRequests = data.requests;
        updateStats();
        renderTable();
      }
    } catch (err) {
      document.getElementById('tableBody').innerHTML =
        `<tr><td colspan="7" class="text-center" style="color:#f43f5e;">Error cargando datos. Verifica tu conexión.</td></tr>`;
    }
  }

  // ── Stats Update ──
  function updateStats() {
    const total = allRequests.length;
    const pending = allRequests.filter(r => r.status === 'Pendiente').length;
    const inProcess = allRequests.filter(r => r.status === 'En proceso').length;
    const completed = allRequests.filter(r => r.status === 'Completado').length;

    animateCount('statTotal', total);
    animateCount('statPending', pending);
    animateCount('statInProcess', inProcess);
    animateCount('statCompleted', completed);
  }

  function animateCount(elId, target) {
    const el = document.getElementById(elId);
    const start = parseInt(el.textContent) || 0;
    const duration = 500;
    const startTime = performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Render Table ──
  function renderTable() {
    const searchVal = document.getElementById('searchInput').value.toLowerCase().trim();
    const statusVal = document.getElementById('statusFilter').value;

    const filtered = allRequests.filter(r => {
      const matchSearch = !searchVal ||
        (r.name && r.name.toLowerCase().includes(searchVal)) ||
        (r.email && r.email.toLowerCase().includes(searchVal)) ||
        (r.phone && r.phone.toLowerCase().includes(searchVal)) ||
        (r.service && r.service.toLowerCase().includes(searchVal));

      const matchStatus = statusVal === 'All' || r.status === statusVal;
      return matchSearch && matchStatus;
    });

    const tbody = document.getElementById('tableBody');

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#64748b; padding: 40px;">No se encontraron solicitudes.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr data-id="${r.id}">
        <td>#${r.id}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>${escapeHtml(r.name || '—')}</td>
        <td>${escapeHtml(r.email || '—')}</td>
        <td>${escapeHtml(r.service || '—')}</td>
        <td>
          <select class="status-select" data-id="${r.id}" onchange="window._updateStatus(${r.id}, this.value)">
            <option value="Pendiente" ${r.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="En proceso" ${r.status === 'En proceso' ? 'selected' : ''}>En proceso</option>
            <option value="Completado" ${r.status === 'Completado' ? 'selected' : ''}>Completado</option>
          </select>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-action-view" onclick="window._viewDetails(${r.id})">Ver</button>
            <button class="btn btn-action-delete" onclick="window._confirmDelete('contacto', ${r.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  window.escapeHtml = escapeHtml;

  // ── Status Update ──
  window._updateStatus = async function (id, newStatus) {
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        const req = allRequests.find(r => r.id === id);
        if (req) req.status = newStatus;
        updateStats();
        showToast(`Estado actualizado a "${newStatus}"`, 'success');
      } else {
        showToast('Error al actualizar el estado', 'error');
      }
    } catch (err) {
      showToast('Error de red al actualizar', 'error');
    }
  };

  // ── View Details Modal ──
  window._viewDetails = function (id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    document.getElementById('modalDetailsTitle').textContent = 'Detalles de la Solicitud';
    document.getElementById('modalDetailsContent').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">ID</div>
          <div class="detail-value">#${r.id}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Fecha</div>
          <div class="detail-value">${formatDate(r.created_at)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Nombre</div>
          <div class="detail-value">${escapeHtml(r.name || '—')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Correo</div>
          <div class="detail-value">${escapeHtml(r.email || '—')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Teléfono</div>
          <div class="detail-value">${escapeHtml(r.phone || '—')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Servicio</div>
          <div class="detail-value">${escapeHtml(r.service || '—')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Estado</div>
          <div class="detail-value">
            <span class="status-badge ${statusClass(r.status)}">${r.status}</span>
          </div>
        </div>
        <div class="detail-item full">
          <div class="detail-label">Mensaje</div>
          <div class="detail-message-box">${escapeHtml(r.message || 'Sin mensaje.')}</div>
        </div>
      </div>
    `;
    openModal('detailsModal');
  };

  // ── Delete Modal (shared dispatcher lives at the bottom of this file) ──
  window._confirmDelete = function (type, id) {
    window._pendingDelete = { type, id };
    openModal('deleteModal');
  };

  window._deleteHandlers.contacto = async function (id) {
    try {
      const res = await fetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        allRequests = allRequests.filter(r => r.id !== id);
        updateStats();
        renderTable();
        showToast('Solicitud eliminada correctamente.', 'success');
      } else {
        showToast('Error al eliminar la solicitud.', 'error');
      }
    } catch (err) {
      showToast('Error de red al eliminar.', 'error');
    }
  };

  // ── Modal Helpers ──
  window.openModal = function (id) {
    document.getElementById(id).classList.add('open');
  };
  window.closeModal = function (id) {
    document.getElementById(id).classList.remove('open');
  };

  // Close modals on backdrop click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // ── CSV Export ──
  document.getElementById('exportBtn').addEventListener('click', function () {
    if (!allRequests.length) {
      showToast('No hay datos para exportar.', 'error');
      return;
    }

    const headers = ['ID', 'Fecha', 'Nombre', 'Email', 'Teléfono', 'Servicio', 'Estado', 'Mensaje'];
    const rows = allRequests.map(r => [
      r.id,
      formatDate(r.created_at),
      r.name || '',
      r.email || '',
      r.phone || '',
      r.service || '',
      r.status || '',
      (r.message || '').replace(/\n/g, ' ')
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logiclic_solicitudes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('CSV exportado correctamente.', 'success');
  });

  // ── Search & Filter Listeners ──
  document.getElementById('searchInput').addEventListener('input', renderTable);
  document.getElementById('statusFilter').addEventListener('change', renderTable);
  document.getElementById('refreshBtn').addEventListener('click', fetchRequests);

  // ── Toast Notifications ──
  window.showToast = showToast;
  function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = `
        position: fixed; bottom: 24px; right: 24px;
        display: flex; flex-direction: column; gap: 10px;
        z-index: 9999; pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      background: ${type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'};
      border: 1px solid ${type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'};
      color: ${type === 'success' ? '#10b981' : '#f43f5e'};
      padding: 12px 20px;
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-size: 13.5px;
      font-weight: 600;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      transform: translateX(20px);
      opacity: 0;
      transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: all;
      max-width: 320px;
    `;
    toast.textContent = `${type === 'success' ? '✓' : '✕'} ${message}`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  window._tabModules.contactos = { init: fetchRequests, _loaded: false };

  // ── Delete Modal: shared dispatcher across all tabs ──
  document.getElementById('confirmDeleteBtn').addEventListener('click', async function () {
    const pending = window._pendingDelete;
    if (!pending) return;
    window._pendingDelete = null;
    closeModal('deleteModal');
    const handler = window._deleteHandlers[pending.type];
    if (handler) await handler(pending.id);
  });

  // ── Tabs ──
  const VALID_TABS = ['contactos', 'casillero-requests', 'casilleros'];

  function switchTab(tabName) {
    if (!VALID_TABS.includes(tabName)) tabName = 'contactos';
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tabName));
    history.replaceState(null, '', '#' + tabName);

    const mod = window._tabModules[tabName];
    if (mod && !mod._loaded) {
      mod._loaded = true;
      mod.init();
    }
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Init ──
  async function init() {
    await checkSession();
    const initialTab = location.hash.replace('#', '');
    switchTab(VALID_TABS.includes(initialTab) ? initialTab : 'contactos');
    hideLoader();
  }

  init();
})();
