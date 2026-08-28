// ── Solicitudes de Casillero Tab Controller ──
(function () {
  'use strict';

  let allCrRequests = [];
  let pendingRejectId = null;

  function crStatusClass(status) {
    if (status === 'Pendiente') return 'status-pendiente';
    if (status === 'Aprobada') return 'status-aprobada';
    if (status === 'Rechazada') return 'status-rechazada';
    return '';
  }

  async function fetchCrRequests() {
    try {
      const res = await fetch('/api/admin/casillero-requests');
      if (!res.ok) {
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        throw new Error('Server error');
      }
      const data = await res.json();
      if (data.success) {
        allCrRequests = data.requests;
        updateCrStats();
        renderCrTable();
      }
    } catch (err) {
      document.getElementById('crTableBody').innerHTML =
        `<tr><td colspan="8" class="text-center" style="color:#f43f5e;">Error cargando datos. Verifica tu conexión.</td></tr>`;
    }
  }

  function updateCrStats() {
    document.getElementById('crStatTotal').textContent = allCrRequests.length;
    document.getElementById('crStatPending').textContent = allCrRequests.filter((r) => r.status === 'Pendiente').length;
    document.getElementById('crStatApproved').textContent = allCrRequests.filter((r) => r.status === 'Aprobada').length;
    document.getElementById('crStatRejected').textContent = allCrRequests.filter((r) => r.status === 'Rechazada').length;
  }

  function renderCrTable() {
    const searchVal = document.getElementById('crSearchInput').value.toLowerCase().trim();
    const statusVal = document.getElementById('crStatusFilter').value;

    const filtered = allCrRequests.filter((r) => {
      const matchSearch = !searchVal ||
        (r.nombre_completo && r.nombre_completo.toLowerCase().includes(searchVal)) ||
        (r.numero_documento && r.numero_documento.toLowerCase().includes(searchVal)) ||
        (r.email && r.email.toLowerCase().includes(searchVal));
      const matchStatus = statusVal === 'All' || r.status === statusVal;
      return matchSearch && matchStatus;
    });

    const tbody = document.getElementById('crTableBody');

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:#64748b; padding: 40px;">No se encontraron solicitudes.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((r) => `
      <tr data-id="${r.id}">
        <td>#${r.id}</td>
        <td>${window.formatDate(r.created_at)}</td>
        <td>${window.escapeHtml(r.nombre_completo || '—')}</td>
        <td>${window.escapeHtml(r.numero_documento || '—')}</td>
        <td>${window.escapeHtml(r.email || '—')}</td>
        <td>${window.escapeHtml(r.ciudad || '—')}</td>
        <td><span class="status-badge ${crStatusClass(r.status)}">${r.status}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-action-view" onclick="window._crViewDetails(${r.id})">Ver</button>
            ${r.status === 'Pendiente' ? `
              <button class="btn btn-action-approve" onclick="window._crApprove(${r.id})">✓ Aprobar</button>
              <button class="btn btn-action-reject" onclick="window._crConfirmReject(${r.id})">✕ Rechazar</button>
            ` : ''}
            <button class="btn btn-action-delete" onclick="window._confirmDelete('casillero-request', ${r.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── View Details ──
  window._crViewDetails = function (id) {
    const r = allCrRequests.find((req) => req.id === id);
    if (!r) return;

    document.getElementById('modalDetailsTitle').textContent = 'Detalles de la Solicitud de Casillero';
    document.getElementById('modalDetailsContent').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">ID</div><div class="detail-value">#${r.id}</div></div>
        <div class="detail-item"><div class="detail-label">Fecha</div><div class="detail-value">${window.formatDate(r.created_at)}</div></div>
        <div class="detail-item"><div class="detail-label">Nombre</div><div class="detail-value">${window.escapeHtml(r.nombre_completo || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Tipo de documento</div><div class="detail-value">${window.escapeHtml(r.tipo_documento || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Número de documento</div><div class="detail-value">${window.escapeHtml(r.numero_documento || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Correo</div><div class="detail-value">${window.escapeHtml(r.email || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Teléfono</div><div class="detail-value">${window.escapeHtml(r.telefono || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Ciudad</div><div class="detail-value">${window.escapeHtml(r.ciudad || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Estado</div><div class="detail-value"><span class="status-badge ${crStatusClass(r.status)}">${r.status}</span></div></div>
        <div class="detail-item"><div class="detail-label">Revisado por</div><div class="detail-value">${window.escapeHtml(r.reviewed_by || '—')}</div></div>
        <div class="detail-item full"><div class="detail-label">Tipo de importación</div><div class="detail-value">${window.escapeHtml(r.tipo_importacion || 'Sin especificar')}</div></div>
        ${r.rejection_reason ? `<div class="detail-item full"><div class="detail-label">Motivo de rechazo</div><div class="detail-message-box">${window.escapeHtml(r.rejection_reason)}</div></div>` : ''}
      </div>
    `;
    window.openModal('detailsModal');
  };

  // ── Approve ──
  window._crApprove = async function (id) {
    try {
      const res = await fetch(`/api/admin/casillero-requests/${id}/approve`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        showToast(`Solicitud aprobada. Código asignado: ${data.codigo}`, 'success');
        await fetchCrRequests();
        if (window._tabModules.casilleros) window._tabModules.casilleros._loaded = false;
      } else {
        showToast(data.error || 'Error al aprobar la solicitud.', 'error');
      }
    } catch (err) {
      showToast('Error de red al aprobar.', 'error');
    }
  };

  // ── Reject ──
  window._crConfirmReject = function (id) {
    pendingRejectId = id;
    document.getElementById('rejectReasonInput').value = '';
    window.openModal('rejectModal');
  };

  document.getElementById('confirmRejectBtn').addEventListener('click', async function () {
    if (!pendingRejectId) return;
    const id = pendingRejectId;
    const rejection_reason = document.getElementById('rejectReasonInput').value.trim();
    pendingRejectId = null;
    window.closeModal('rejectModal');

    try {
      const res = await fetch(`/api/admin/casillero-requests/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_reason })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Solicitud rechazada.', 'success');
        await fetchCrRequests();
      } else {
        showToast(data.error || 'Error al rechazar la solicitud.', 'error');
      }
    } catch (err) {
      showToast('Error de red al rechazar.', 'error');
    }
  });

  // ── Delete ──
  window._deleteHandlers['casillero-request'] = async function (id) {
    try {
      const res = await fetch(`/api/admin/casillero-requests/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        allCrRequests = allCrRequests.filter((r) => r.id !== id);
        updateCrStats();
        renderCrTable();
        showToast('Solicitud eliminada correctamente.', 'success');
      } else {
        showToast('Error al eliminar la solicitud.', 'error');
      }
    } catch (err) {
      showToast('Error de red al eliminar.', 'error');
    }
  };

  // ── Search & Filter ──
  document.getElementById('crSearchInput').addEventListener('input', renderCrTable);
  document.getElementById('crStatusFilter').addEventListener('change', renderCrTable);
  document.getElementById('crRefreshBtn').addEventListener('click', fetchCrRequests);

  window._tabModules['casillero-requests'] = { init: fetchCrRequests, _loaded: false };
})();
