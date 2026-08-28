// ── Prealertas Tab Controller ──
(function () {
  'use strict';

  let allPrealertas = [];
  const PA_STATUSES = ['Pendiente', 'En bodega Miami', 'En tránsito', 'Aduana', 'Listo para entrega', 'Entregado'];

  function paStatusClass(status) {
    if (status === 'Pendiente') return 'status-pendiente';
    if (status === 'Entregado') return 'status-completed';
    if (status === 'Aduana') return 'status-rechazada';
    return 'status-process'; // En bodega Miami, En tránsito, Listo para entrega
  }

  async function fetchPrealertas() {
    try {
      const res = await fetch('/api/admin/prealertas');
      if (!res.ok) {
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        throw new Error('Server error');
      }
      const data = await res.json();
      if (data.success) {
        allPrealertas = data.prealertas;
        updatePaStats();
        renderPaTable();
      }
    } catch (err) {
      document.getElementById('paTableBody').innerHTML =
        `<tr><td colspan="9" class="text-center" style="color:#f43f5e;">Error cargando datos. Verifica tu conexión.</td></tr>`;
    }
  }

  function updatePaStats() {
    document.getElementById('paStatTotal').textContent = allPrealertas.length;
    document.getElementById('paStatPending').textContent = allPrealertas.filter((p) => p.status === 'Pendiente').length;
    document.getElementById('paStatTransit').textContent = allPrealertas.filter((p) =>
      p.status === 'En bodega Miami' || p.status === 'En tránsito' || p.status === 'Aduana' || p.status === 'Listo para entrega'
    ).length;
    document.getElementById('paStatDelivered').textContent = allPrealertas.filter((p) => p.status === 'Entregado').length;
  }

  function renderPaTable() {
    const searchVal = document.getElementById('paSearchInput').value.toLowerCase().trim();
    const statusVal = document.getElementById('paStatusFilter').value;

    const filtered = allPrealertas.filter((p) => {
      const matchSearch = !searchVal ||
        (p.casillero_codigo && p.casillero_codigo.toLowerCase().includes(searchVal)) ||
        (p.casillero_nombre && p.casillero_nombre.toLowerCase().includes(searchVal)) ||
        (p.tracking && p.tracking.toLowerCase().includes(searchVal)) ||
        (p.tienda && p.tienda.toLowerCase().includes(searchVal));
      const matchStatus = statusVal === 'All' || p.status === statusVal;
      return matchSearch && matchStatus;
    });

    const tbody = document.getElementById('paTableBody');

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:#64748b; padding: 40px;">No se encontraron prealertas.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((p) => `
      <tr data-id="${p.id}">
        <td>#${p.id}</td>
        <td>${window.formatDate(p.created_at)}</td>
        <td>${window.escapeHtml(p.casillero_codigo)} · ${window.escapeHtml(p.casillero_nombre || '—')}</td>
        <td>${window.escapeHtml(p.tracking || '—')}</td>
        <td>${window.escapeHtml(p.tienda || '—')}</td>
        <td>$${Number(p.valor_declarado_usd).toFixed(2)}</td>
        <td>${window.escapeHtml(p.ciudad_entrega || '—')}</td>
        <td>
          <select class="status-select" onchange="window._paUpdateStatus(${p.id}, this.value)">
            ${PA_STATUSES.map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-action-view" onclick="window._paViewDetails(${p.id})">Ver</button>
            <button class="btn btn-action-delete" onclick="window._confirmDelete('prealerta', ${p.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── View Details ──
  window._paViewDetails = function (id) {
    const p = allPrealertas.find((pa) => pa.id === id);
    if (!p) return;

    document.getElementById('modalDetailsTitle').textContent = 'Detalles de la Prealerta';
    document.getElementById('modalDetailsContent').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">ID</div><div class="detail-value">#${p.id}</div></div>
        <div class="detail-item"><div class="detail-label">Fecha</div><div class="detail-value">${window.formatDate(p.created_at)}</div></div>
        <div class="detail-item"><div class="detail-label">Casillero</div><div class="detail-value">${window.escapeHtml(p.casillero_codigo)} · ${window.escapeHtml(p.casillero_nombre || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Estado</div><div class="detail-value"><span class="status-badge ${paStatusClass(p.status)}">${p.status}</span></div></div>
        <div class="detail-item"><div class="detail-label">Tracking</div><div class="detail-value">${window.escapeHtml(p.tracking || 'Sin asignar')}</div></div>
        <div class="detail-item"><div class="detail-label">Tienda</div><div class="detail-value">${window.escapeHtml(p.tienda || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Transportadora</div><div class="detail-value">${window.escapeHtml(p.transportadora || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Valor declarado</div><div class="detail-value">USD $${Number(p.valor_declarado_usd).toFixed(2)}</div></div>
        <div class="detail-item"><div class="detail-label">Peso estimado</div><div class="detail-value">${p.peso_estimado_lb ? p.peso_estimado_lb + ' lb' : 'Sin especificar'}</div></div>
        <div class="detail-item"><div class="detail-label">Ciudad de entrega</div><div class="detail-value">${window.escapeHtml(p.ciudad_entrega || '—')}</div></div>
        <div class="detail-item full"><div class="detail-label">Descripción</div><div class="detail-value">${window.escapeHtml(p.descripcion || 'Sin descripción.')}</div></div>
        ${p.link_soporte ? `<div class="detail-item full"><div class="detail-label">Soporte de compra</div><div class="detail-value"><a href="${window.escapeHtml(p.link_soporte)}" target="_blank" rel="noopener noreferrer">Ver enlace ↗</a></div></div>` : ''}
        ${p.admin_notes ? `<div class="detail-item full"><div class="detail-label">Notas internas</div><div class="detail-message-box">${window.escapeHtml(p.admin_notes)}</div></div>` : ''}
      </div>
    `;
    window.openModal('detailsModal');
  };

  // ── Update Status ──
  window._paUpdateStatus = async function (id, newStatus) {
    try {
      const res = await fetch(`/api/admin/prealertas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        const p = allPrealertas.find((pa) => pa.id === id);
        if (p) p.status = newStatus;
        updatePaStats();
        showToast(`Estado actualizado a "${newStatus}"`, 'success');
      } else {
        showToast('Error al actualizar el estado', 'error');
      }
    } catch (err) {
      showToast('Error de red al actualizar', 'error');
    }
  };

  // ── Delete ──
  window._deleteHandlers.prealerta = async function (id) {
    try {
      const res = await fetch(`/api/admin/prealertas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        allPrealertas = allPrealertas.filter((p) => p.id !== id);
        updatePaStats();
        renderPaTable();
        showToast('Prealerta eliminada correctamente.', 'success');
      } else {
        showToast('Error al eliminar la prealerta.', 'error');
      }
    } catch (err) {
      showToast('Error de red al eliminar.', 'error');
    }
  };

  // ── Search & Filter ──
  document.getElementById('paSearchInput').addEventListener('input', renderPaTable);
  document.getElementById('paStatusFilter').addEventListener('change', renderPaTable);
  document.getElementById('paRefreshBtn').addEventListener('click', fetchPrealertas);

  window._tabModules.prealertas = { init: fetchPrealertas, _loaded: false };
})();
