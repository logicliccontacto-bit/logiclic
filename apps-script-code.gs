// ── Logiclic: envío de correo con cotización adjunta ──
// Este archivo NO se ejecuta en el servidor Node. Se pega tal cual en script.google.com
// (ver instrucciones de despliegue al final del archivo).

const SHARED_SECRET = 'REEMPLAZA_CON_UN_SECRETO_LARGO_ALEATORIO'; // debe coincidir con APPSCRIPT_SHARED_SECRET en .env

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SHARED_SECRET) {
      return respond({ success: false, error: 'unauthorized' });
    }

    const options = { name: 'Logiclic' };
    if (data.cc && data.cc.length) options.cc = data.cc.join(',');
    if (data.attachment) {
      const bytes = Utilities.base64Decode(data.attachment.base64);
      options.attachments = [Utilities.newBlob(bytes, data.attachment.mimeType, data.attachment.filename)];
    }

    GmailApp.sendEmail(data.to, data.subject, data.bodyText, options);
    return respond({ success: true });
  } catch (err) {
    return respond({ success: false, error: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/*
  PASOS PARA DESPLEGAR (una sola vez, desde la cuenta de Google logiclic.contacto@gmail.com):

  1. Entrar a https://script.google.com con la cuenta logiclic.contacto@gmail.com
  2. Nuevo proyecto → pegar todo este código en "Code.gs" (menos este bloque de comentario, es opcional dejarlo)
  3. Cambiar SHARED_SECRET arriba por un valor propio largo y aleatorio
  4. Implementar → Nueva implementación → tipo "Aplicación web"
     - Ejecutar como: Yo (logiclic.contacto@gmail.com)
     - Quién tiene acceso: Cualquier usuario
  5. Autorizar el permiso de envío de Gmail que Google pedirá la primera vez
  6. Copiar la URL de la implementación (termina en /exec) y el SHARED_SECRET elegido,
     y colocarlos en el servidor como APPSCRIPT_EMAIL_URL y APPSCRIPT_SHARED_SECRET
     (en .env local y en las variables de entorno de Render)
*/
