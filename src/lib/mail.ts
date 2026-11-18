import { HttpError } from './util';
import { leerCfg, listo, esDemoCorreo } from './correo';

export type Adjunto = { filename: string; content: string; contentType?: string };

/** Envía un correo con el buzón conectado en Canales; si no hay, usa SMTP_URL (+ SMTP_FROM). Las direcciones de demostración no se envían. */
export async function enviarMail(para: string, asunto: string, cuerpo: string, o: { responder?: string; adjuntos?: Adjunto[] } = {}) {
  if (esDemoCorreo(para)) return;
  const cfg = await leerCfg();
  const nm = await import('nodemailer');
  let t: any, from: any;
  if (listo(cfg)) {
    t = nm.createTransport({ host: cfg.smtpHost || cfg.imapHost.replace(/^imap\./, 'smtp.'), port: cfg.smtpPort, secure: cfg.smtpSecure, auth: { user: cfg.usuario, pass: cfg.pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    from = cfg.nombre ? { name: cfg.nombre, address: cfg.usuario } : cfg.usuario;
  } else if (process.env.SMTP_URL) {
    t = nm.createTransport(process.env.SMTP_URL);
    from = process.env.SMTP_FROM || undefined;
  } else {
    throw new HttpError(503, 'No hay correo configurado para enviar (Admin, Canales, Correo).');
  }
  try {
    await t.sendMail({ from, to: para, subject: asunto, text: cuerpo, replyTo: o.responder || undefined, attachments: o.adjuntos });
  } catch (e: any) {
    throw new HttpError(502, 'No se pudo enviar el correo: ' + String(e?.message || e).slice(0, 200));
  }
}
