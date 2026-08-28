// ── Casilleros Tab Controller ──
(function () {
  'use strict';

  let allCasilleros = [];
  let pendingEditId = null;

  async function fetchCasilleros() {
    try {
      const res = await fetch('/api/admin/casilleros');
      if (!res.ok) {
        if (res.status === 401) { window.location.href = 'login.html'; return; }
        throw new Error('Server error');
      }
      const data = await res.json();
      if (data.success) {
        allCasilleros = data.casilleros;
        updateClStats();
        renderClTable();
      }
    } catch (err) {
      document.getElementById('clTableBody').innerHTML =
        `<tr><td colspan="8" class="text-center" style="color:#f43f5e;">Error cargando datos. Verifica tu conexión.</td></tr>`;
    }
  }

  function updateClStats() {
    document.getElementById('clStatTotal').textContent = allCasilleros.length;
    document.getElementById('clStatActive').textContent = allCasilleros.filter((c) => c.is_active).length;
    document.getElementById('clStatInactive').textContent = allCasilleros.filter((c) => !c.is_active).length;
  }

  function renderClTable() {
    const searchVal = document.getElementById('clSearchInput').value.toLowerCase().trim();
    const statusVal = document.getElementById('clStatusFilter').value;

    const filtered = allCasilleros.filter((c) => {
      const matchSearch = !searchVal ||
        (c.nombre_completo && c.nombre_completo.toLowerCase().includes(searchVal)) ||
        (c.codigo && c.codigo.toLowerCase().includes(searchVal)) ||
        (c.numero_documento && c.numero_documento.toLowerCase().includes(searchVal));
      const matchStatus = statusVal === 'All' ||
        (statusVal === 'Active' && c.is_active) ||
        (statusVal === 'Inactive' && !c.is_active);
      return matchSearch && matchStatus;
    });

    const tbody = document.getElementById('clTableBody');

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color:#64748b; padding: 40px;">No se encontraron casilleros.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((c) => `
      <tr data-id="${c.id}">
        <td>${window.escapeHtml(c.codigo)}</td>
        <td>${window.formatDate(c.created_at)}</td>
        <td>${window.escapeHtml(c.nombre_completo || '—')}</td>
        <td>${window.escapeHtml(c.numero_documento || '—')}</td>
        <td>${window.escapeHtml(c.email || '—')}</td>
        <td>${window.escapeHtml(c.ciudad || '—')}</td>
        <td><span class="status-badge ${c.is_active ? 'status-active' : 'status-inactive'}">${c.is_active ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-action-view" onclick="window._clViewDetails(${c.id})">Ver</button>
            <button class="btn btn-action-view" onclick="window._clEdit(${c.id})">Editar</button>
            <button class="btn ${c.is_active ? 'btn-action-reject' : 'btn-action-approve'}" onclick="window._clToggleActive(${c.id})">${c.is_active ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-action-delete" onclick="window._confirmDelete('casillero', ${c.id})">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── View Details ──
  window._clViewDetails = function (id) {
    const c = allCasilleros.find((cl) => cl.id === id);
    if (!c) return;

    document.getElementById('modalDetailsTitle').textContent = 'Detalles del Casillero';
    document.getElementById('modalDetailsContent').innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Código</div><div class="detail-value">${window.escapeHtml(c.codigo)}</div></div>
        <div class="detail-item"><div class="detail-label">Fecha de creación</div><div class="detail-value">${window.formatDate(c.created_at)}</div></div>
        <div class="detail-item"><div class="detail-label">Nombre</div><div class="detail-value">${window.escapeHtml(c.nombre_completo || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Tipo de documento</div><div class="detail-value">${window.escapeHtml(c.tipo_documento || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Número de documento</div><div class="detail-value">${window.escapeHtml(c.numero_documento || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Correo</div><div class="detail-value">${window.escapeHtml(c.email || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Teléfono</div><div class="detail-value">${window.escapeHtml(c.telefono || '—')}</div></div>
        <div class="detail-item"><div class="detail-label">Ciudad</div><div class="detail-value">${window.escapeHtml(c.ciudad || '—')}</div></div>
        <div class="detail-item full"><div class="detail-label">Estado</div><div class="detail-value"><span class="status-badge ${c.is_active ? 'status-active' : 'status-inactive'}">${c.is_active ? 'Activo' : 'Inactivo'}</span></div></div>
      </div>
    `;
    window.openModal('detailsModal');
  };

  // ── Edit ──
  window._clEdit = function (id) {
    const c = allCasilleros.find((cl) => cl.id === id);
    if (!c) return;
    pendingEditId = id;
    document.getElementById('editNombre').value = c.nombre_completo || '';
    document.getElementById('editTelefono').value = c.telefono || '';
    document.getElementById('editCiudad').value = c.ciudad || '';
    document.getElementById('editEmail').value = c.email || '';
    window.openModal('editCasilleroModal');
  };

  document.getElementById('confirmEditBtn').addEventListener('click', async function () {
    if (!pendingEditId) return;
    const id = pendingEditId;
    const nombre_completo = document.getElementById('editNombre').value.trim();
    const telefono = document.getElementById('editTelefono').value.trim();
    const ciudad = document.getElementById('editCiudad').value.trim();
    const email = document.getElementById('editEmail').value.trim();

    try {
      const res = await fetch(`/api/admin/casilleros/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_completo, telefono, ciudad, email })
      });
      const data = await res.json();
      if (data.success) {
        window.closeModal('editCasilleroModal');
        pendingEditId = null;
        showToast('Casillero actualizado correctamente.', 'success');
        await fetchCasilleros();
      } else {
        showToast(data.error || 'Error al actualizar el casillero.', 'error');
      }
    } catch (err) {
      showToast('Error de red al actualizar.', 'error');
    }
  });

  // ── Toggle Active ──
  window._clToggleActive = async function (id) {
    const c = allCasilleros.find((cl) => cl.id === id);
    if (!c) return;
    try {
      const res = await fetch(`/api/admin/casilleros/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !c.is_active })
      });
      const data = await res.json();
      if (data.success) {
        c.is_active = !c.is_active;
        updateClStats();
        renderClTable();
        showToast(`Casillero ${c.is_active ? 'activado' : 'desactivado'} correctamente.`, 'success');
      } else {
        showToast('Error al actualizar el estado.', 'error');
      }
    } catch (err) {
      showToast('Error de red al actualizar.', 'error');
    }
  };

  // ── Delete ──
  window._deleteHandlers.casillero = async function (id) {
    try {
      const res = await fetch(`/api/admin/casilleros/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        allCasilleros = allCasilleros.filter((c) => c.id !== id);
        updateClStats();
        renderClTable();
        showToast('Casillero eliminado correctamente.', 'success');
      } else {
        showToast('Error al eliminar el casillero.', 'error');
      }
    } catch (err) {
      showToast('Error de red al eliminar.', 'error');
    }
  };

  // ── Search & Filter ──
  document.getElementById('clSearchInput').addEventListener('input', renderClTable);
  document.getElementById('clStatusFilter').addEventListener('change', renderClTable);
  document.getElementById('clRefreshBtn').addEventListener('click', fetchCasilleros);

  window._tabModules.casilleros = { init: fetchCasilleros, _loaded: false };
})();
