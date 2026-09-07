// Envío de correo delegado a un Google Apps Script desplegado desde logiclic.contacto@gmail.com
// (evita manejar contraseñas de aplicación de Gmail dentro del servidor).
const APPSCRIPT_EMAIL_URL = process.env.APPSCRIPT_EMAIL_URL;
const APPSCRIPT_SHARED_SECRET = process.env.APPSCRIPT_SHARED_SECRET;
const LOGICLIC_CC_EMAILS = ['carlosandres.leguizamonq@gmail.com', 'angiehurtado1108@gmail.com'];

async function sendQuotationEmail({ to, name, filename, mimetype, buffer }) {
  if (!APPSCRIPT_EMAIL_URL || !APPSCRIPT_SHARED_SECRET) {
    throw new Error('APPSCRIPT_EMAIL_URL/APPSCRIPT_SHARED_SECRET no configurados');
  }

  const payload = {
    secret: APPSCRIPT_SHARED_SECRET,
    to,
    cc: LOGICLIC_CC_EMAILS,
    subject: `Tu cotización Logiclic${name ? ' - ' + name : ''}`,
    bodyText: `Hola ${name || ''},\n\nAdjuntamos la cotización solicitada. Recuerda que las tarifas pueden variar sujetas a cambios en la TRM.\n\nSaludos,\nEquipo Logiclic`,
    attachment: {
      filename,
      mimeType: mimetype,
      base64: buffer.toString('base64')
    }
  };

  const res = await fetch(APPSCRIPT_EMAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const rawText = await res.text();
  let data = null;
  try { data = JSON.parse(rawText); } catch (e) { /* handled below */ }

  if (!res.ok || !data || data.success !== true) {
    const detail = data && data.error ? data.error : `HTTP ${res.status}, respuesta: ${rawText.slice(0, 300)}`;
    throw new Error(`Fallo al enviar correo (${detail})`);
  }
}

module.exports = { sendQuotationEmail };
