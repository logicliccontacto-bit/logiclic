(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function pStatusClass(status) {
    if (status === 'Pendiente') return 'pstatus-pendiente';
    if (status === 'Entregado') return 'pstatus-entregado';
    if (status === 'Aduana') return 'pstatus-aduana';
    return 'pstatus-transito'; // En bodega Miami, En tránsito, Listo para entrega
  }

  function showToast(message, type) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1000;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `padding:12px 24px;border-radius:8px;color:#fff;font-weight:600;font-size:14px;
      box-shadow:0 4px 15px rgba(0,0,0,0.3);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);
      transition:all 0.3s ease;background:${type === 'error' ? 'rgba(244,63,94,0.85)' : 'rgba(16,185,129,0.85)'};`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/client/me');
      if (!res.ok) {
        window.location.href = 'client-login.html';
        return null;
      }
      const data = await res.json();
      if (!data.success) {
        window.location.href = 'client-login.html';
        return null;
      }
      return data.casillero;
    } catch (err) {
      window.location.href = 'client-login.html';
      return null;
    }
  }

  function renderSummary(c) {
    document.getElementById('portalCodigo').textContent = c.codigo;
    document.getElementById('summaryCodigo').textContent = c.codigo;
    document.getElementById('summaryNombre').textContent = c.nombre_completo;
    document.getElementById('summaryCiudad').textContent = c.ciudad;
    document.getElementById('summaryEstado').textContent = c.is_active ? 'Activo' : 'Inactivo';
  }

  async function fetchPrealertas() {
    const tbody = document.getElementById('paquetesTableBody');
    try {
      const res = await fetch('/api/client/prealertas');
      const data = await res.json();
      if (!data.success) {
        tbody.innerHTML = '<tr><td colspan="5" class="portal-empty">Error cargando tus paquetes.</td></tr>';
        return;
      }
      if (data.prealertas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="portal-empty">Aún no tienes paquetes registrados.</td></tr>';
        return;
      }
      tbody.innerHTML = data.prealertas.map((p) => `
        <tr>
          <td>${formatDate(p.created_at)}</td>
          <td>${escapeHtml(p.tracking || 'Sin asignar')}</td>
          <td>${escapeHtml(p.tienda)}</td>
          <td>$${Number(p.valor_declarado_usd).toFixed(2)}</td>
          <td><span class="portal-status-badge ${pStatusClass(p.status)}">${escapeHtml(p.status)}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="portal-empty">Error de red. Verifica tu conexión.</td></tr>';
    }
  }

  window.enviarPrealerta = function () {
    const tienda = document.getElementById('paTienda').value.trim();
    const transportadora = document.getElementById('paTransportadora').value;
    const valor_declarado_usd = document.getElementById('paValor').value;
    const peso_estimado_lb = document.getElementById('paPeso').value;
    const tracking = document.getElementById('paTracking').value.trim();
    const ciudad_entrega = document.getElementById('paCiudad').value.trim();
    const descripcion = document.getElementById('paDescripcion').value.trim();
    const link_soporte = document.getElementById('paLink').value.trim();
    const resultDiv = document.getElementById('prealertaResult');

    if (!tienda || !transportadora || !valor_declarado_usd || !ciudad_entrega) {
      resultDiv.innerHTML = '<p style="color:#f43f5e;font-size:0.85rem">Completa tienda, transportadora, valor declarado y ciudad de entrega.</p>';
      return;
    }

    const btn = document.querySelector('#prealertaForm .btn-primary');
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Registrando...';

    fetch('/api/client/prealertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tienda, transportadora,
        valor_declarado_usd: parseFloat(valor_declarado_usd),
        peso_estimado_lb: peso_estimado_lb ? parseFloat(peso_estimado_lb) : null,
        tracking: tracking || null,
        ciudad_entrega,
        descripcion: descripcion || null,
        link_soporte: link_soporte || null
      })
    })
      .then((res) => res.json())
      .then((data) => {
        btn.disabled = false;
        btn.textContent = originalText;
        if (data.success) {
          document.getElementById('prealertaForm').reset();
          resultDiv.innerHTML = '<p style="color:#4ade80;font-size:0.9rem;font-weight:600">✓ Prealerta registrada correctamente.</p>';
          showToast('Prealerta registrada correctamente.', 'success');
          fetchPrealertas();
        } else {
          resultDiv.innerHTML = '<p style="color:#f43f5e;font-size:0.85rem">' + escapeHtml(data.error || 'Error al registrar la prealerta.') + '</p>';
          showToast(data.error || 'Error al registrar la prealerta.', 'error');
        }
      })
      .catch(() => {
        btn.disabled = false;
        btn.textContent = originalText;
        resultDiv.innerHTML = '<p style="color:#f43f5e;font-size:0.85rem">Error de red. Inténtalo de nuevo.</p>';
        showToast('Error de red. Inténtalo de nuevo.', 'error');
      });
  };

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    try {
      await fetch('/api/client/logout', { method: 'POST' });
    } catch (e) { /* ignore */ }
    window.location.href = 'client-login.html';
  });

  async function init() {
    const casillero = await checkSession();
    if (!casillero) return;
    renderSummary(casillero);
    await fetchPrealertas();
  }

  init();
})();
