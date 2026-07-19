/**
 * 🤖 Robot de correo para Platita
 * Lee los avisos del Banco de Chile que llegan a tu Gmail y se los entrega a la app.
 * Se instala en script.google.com y corre solo dentro de TU cuenta de Google:
 * nadie más ve tus correos ni tus datos.
 *
 * Formatos que entiende:
 *  - "Cargo en Cuenta"            → compra con tarjeta  → gasto
 *  - "Transferencia a Terceros"   → transferencia hecha → gasto
 *  - "Devolución en tu Cuenta"    → devolución          → ingreso
 *  - transferencias recibidas     → abono               → ingreso
 */

var DIAS = 30; // cuántos días hacia atrás revisar

function doGet() {
  var movs = leerMovimientos();
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, movs: movs }))
    .setMimeType(ContentService.MimeType.JSON);
}

function leerMovimientos() {
  var threads = GmailApp.search('from:(bancochile.cl) newer_than:' + DIAS + 'd');
  var movs = [];
  threads.forEach(function (th) {
    th.getMessages().forEach(function (msg) {
      try {
        var mov = parsear(msg.getSubject(), msg.getPlainBody(), msg.getDate());
        if (mov) { mov.id = msg.getId(); movs.push(mov); }
      } catch (e) {}
    });
  });
  return movs;
}

var MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
              agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

function parsear(asunto, cuerpo, fechaMsg) {
  var b = String(asunto + ' ' + cuerpo).replace(/\s+/g, ' ');
  var m;

  // Devolución: "tu devolución por $6.120 desde PAYU *FLIXBUS , el 14/07/2026, a las 18: 45"
  m = b.match(/devoluci\S+ por \$ ?([\d.,]+) desde (.+?)\s*,?\s*el (\d{1,2})\/(\d{1,2})\/(\d{4}),? ?(?:a las )?(\d{1,2}): ?(\d{2})/i);
  if (m) return mov('ingreso', m[1], 'Devolución ' + m[2], fdm(m[5], m[4], m[3], m[6], m[7]), 'devolucion');

  // Compra: "compra por $950 con cargo a Cuenta ****0303 en UNIMARC 4 PONIENT el 18/07/2026 19:11"
  m = b.match(/compra por \$ ?([\d.,]+) con cargo a .*? en (.+?) el (\d{1,2})\/(\d{1,2})\/(\d{4}),? ?(?:a las )?(\d{1,2}): ?(\d{2})/i);
  if (m) return mov('gasto', m[1], m[2], fdm(m[5], m[4], m[3], m[6], m[7]));

  // Transferencia a terceros: comprobante con destinatario, monto y "domingo 19 de julio de 2026 11:06"
  if (/transferencia a terceros/i.test(b)) {
    var monto = b.match(/Monto:? \$ ?([\d.,]+)/i);
    if (monto) {
      var nom = b.match(/Nombre y Apellido:? (.+?) Rut/i);
      var f = b.match(/(\d{1,2}) de ([a-záéíóúñ]+) de (\d{4}),? ?(?:a las )?(\d{1,2}):(\d{2})/i);
      var fecha = (f && MESES[f[2].toLowerCase()])
        ? fdm(f[3], MESES[f[2].toLowerCase()], f[1], f[4], f[5])
        : fdate(fechaMsg);
      return mov('gasto', monto[1], 'Transf. ' + (nom ? nom[1] : 'a terceros'), fecha);
    }
  }

  // Transferencia recibida (aviso de abono)
  if (/has recibido una transferencia|te han transferido|abono por transferencia/i.test(b)) {
    var mt = b.match(/\$ ?([\d.,]+)/);
    if (mt) return mov('ingreso', mt[1], 'Transferencia recibida', fdate(fechaMsg), 'extra');
  }

  return null; // otros correos del banco (avisos, publicidad) se ignoran
}

function mov(tipo, montoTxt, detalle, fecha, cat) {
  var monto = parseInt(String(montoTxt).split(',')[0].replace(/\D/g, ''), 10) || 0;
  if (monto <= 0) return null;
  return { tipo: tipo, monto: monto, detalle: String(detalle).trim().slice(0, 60), fecha: fecha, cat: cat || '' };
}

function pad(n) { return ('0' + n).slice(-2); }
function fdm(y, mo, d, h, mi) { return y + '-' + pad(+mo) + '-' + pad(+d) + ' ' + pad(+h) + ':' + pad(+mi); }
function fdate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
