import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// 1. CONEXIÓN A MONGODB
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB conectado  ✓💜  '))
.catch(err => console.log('Error en MongoDB:', err.message));

const app = express();
app.use(cors());
app.use(express.json());

// 2. CONFIGURACIÓN BREVO API DIRECTA
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const brevoHeaders = {
  'api-key': process.env.BREVO_API_KEY,
  'Content-Type': 'application/json'
};
console.log('Servicio de correos listo  ✓💜  ');

// 3. MODELO DE TICKET
const esquemaTicket = new mongoose.Schema({
  nombre: String,
  apellido: String,
  title: String,
  description: String,
  tipo: String,
  categoria: String,
  respuestaIA: String,
  email: String,
  fecha: { type: Date, default: Date.now }
});
const Ticket = mongoose.model('Ticket', esquemaTicket);

// 4. FUNCIÓN PARA CLASIFICAR CON GROQ
async function clasificarConIA(datos) {
  const instruccion = `Eres DamARMAgent, asistente oficial de soporte de DamARM.
  Analiza este mensaje y responde SOLO con un JSON válido, sin texto extra:
  Datos:
  Nombre: ${datos.nombre} ${datos.apellido}
  Asunto: ${datos.title}
  Mensaje: ${datos.description}

  Reglas:
  - Si es urgente, falla el sistema, hay queja o problema grave → tipo = "Urgente"
  - Si es consulta general o información → tipo = "Normal"
  - Categoría: elige una: "Ventas", "Soporte", "Reclamo", "Información"
  - Respuesta: mensaje amable de máximo 2 líneas para el cliente.

  Formato de respuesta:
  {"tipo":"Urgente|Normal","categoria":"...","respuesta":"..."}`;

  try {
    const respuesta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: instruccion }],
        temperature: 0.1
      })
    });

    const datosIA = await respuesta.json();
    let contenido = datosIA.choices[0].message.content;
    contenido = contenido.replace(/```json|```/g, '').trim();
    return JSON.parse(contenido);

  } catch (error) {
    console.error('Error con Groq:', error.message);
    return { tipo: 'Normal', categoria: 'Soporte', respuesta: 'Gracias por contactarnos, te responderemos pronto.' };
  }
}

// 5. ENVIAR CORREO AL ADMIN (solo urgentes) → DISEÑO MORADO
async function avisarAdmin(ticket) {
  try {
    const fecha = new Date().toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      dateStyle: 'full',
      timeStyle: 'short'
    });

    const cuerpoCorreo = {
      sender: { name: 'DamARMAgent', email: process.env.EMAIL_USER },
      to: [{ email: process.env.EMAIL_TO }],
      subject: `🚨  URGENTE: ${ticket.title}`,
      htmlContent: `
        <div style="font-family:Arial, sans-serif;max-width:600px;margin:auto;padding:20px;border:2px solid #663399;border-radius:12px;background:#ffffff;box-shadow:0 4px 12px rgba(102,51,153,0.1);">
          <div style="background:#663399;color:white;padding:18px;border-radius:8px;text-align:center;margin-bottom:20px;">
            <h2 style="margin:0;font-size:22px;">🚨 URGENTE - DamARM 💜</h2>
          </div>
          <p style="margin:10px 0;"><strong> Fecha y hora:</strong> ${fecha}</p>
          <hr style="border:none;border-bottom:1px solid #e9d5ff;margin:16px 0;">
          <p style="margin:10px 0;"><strong> Cliente:</strong> ${ticket.nombre} ${ticket.apellido}</p>
          <p style="margin:10px 0;"><strong> Correo:</strong> ${ticket.email}</p>
          <p style="margin:10px 0;"><strong> Asunto:</strong> ${ticket.title}</p>
          <p style="margin:10px 0;"><strong> Mensaje:</strong></p>
          <div style="background:#f3e8ff;padding:14px;border-radius:8px;border-left:4px solid #663399;">${ticket.description}</div>
          <p style="margin-top:18px;"><strong> Categoría:</strong> ${ticket.categoria}</p>
        </div>`
    };

    await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify(cuerpoCorreo)
    });
    console.log('Correo al admin enviado ✓💜');
  } catch (error) {
    console.log('Error al enviar a admin:', error.message);
  }
}

// 6. ENVIAR RESPUESTA AL CLIENTE → DISEÑO MORADO
async function responderCliente(ticket) {
  try {
    const cuerpoCorreo = {
      sender: { name: 'DamARMAgent', email: process.env.EMAIL_USER },
      to: [{ email: ticket.email }],
      subject: `Respuesta a: ${ticket.title}`,
      htmlContent: `
        <div style="font-family:Arial, sans-serif;max-width:600px;margin:auto;padding:20px;border:2px solid #663399;border-radius:12px;background:#ffffff;box-shadow:0 4px 12px rgba(102,51,153,0.1);">
          <div style="background:#663399;color:white;padding:18px;border-radius:8px;text-align:center;margin-bottom:20px;">
            <h2 style="margin:0;font-size:22px;">DamARMAgent 💜</h2>
          </div>
          <p style="margin:10px 0;font-size:16px;">Hola <strong>${ticket.nombre}</strong>, gracias por contactarnos.</p>
          <div style="background:#f3e8ff;padding:14px;border-radius:8px;border-left:4px solid #663399;margin:16px 0;">${ticket.respuestaIA}</div>
          <p style="font-size:13px;color:#7c3aed;margin-top:20px;">Este es un mensaje automático. Pronto te contactaremos personalmente.</p>
          <p style="font-size:12px;color:#666;">Equipo de Soporte DamARM</p>
        </div>`
    };

    await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: brevoHeaders,
      body: JSON.stringify(cuerpoCorreo)
    });
    console.log('Correo al cliente enviado ✓💜');
  } catch (error) {
    console.log('Error al responder al cliente:', error.message);
  }
}

// 7. CREAR TARJETA EN TRELLO
async function crearTarjetaTrello(ticket, tipo) {
  try {
    const fecha = new Date().toLocaleString('es-EC', {
      timeZone: 'America/Guayaquil',
      dateStyle: 'full',
      timeStyle: 'short'
    });

    const lista = tipo === 'Urgente'
      ? process.env.TRELLO_LIST_ID_URGENTE
      : process.env.TRELLO_LIST_ID_NORMAL;

    const url = `https://api.trello.com/1/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}&idList=${lista}&name=${encodeURIComponent(tipo + ': ' + ticket.title)}&desc=${encodeURIComponent(`Cliente: ${ticket.nombre} ${ticket.apellido}\nCorreo: ${ticket.email}\nFecha: ${fecha}\n\nMensaje:\n${ticket.description}\n\nCategoría: ${ticket.categoria}`)}`;

    await fetch(url, { method: 'POST' });
    console.log('Tarjeta en Trello creada ✓💜');
  } catch (error) {
    console.log('Error en Trello:', error.message);
  }
}

// 8. RUTA PRINCIPAL PARA RECIBIR TICKETS
app.post('/api/tickets', async (req, res) => {
  console.log('Ticket recibido:', req.body);

  const datosIA = await clasificarConIA(req.body);

  const nuevoTicket = new Ticket({
    nombre: req.body.nombre,
    apellido: req.body.apellido,
    title: req.body.title,
    description: req.body.description,
    email: req.body.email,
    tipo: datosIA.tipo,
    categoria: datosIA.categoria,
    respuestaIA: datosIA.respuesta
  });
  await nuevoTicket.save();
  console.log('Ticket guardado en MongoDB ✓💜');

  await crearTarjetaTrello(nuevoTicket, datosIA.tipo);

  if (datosIA.tipo === 'Urgente') {
    await avisarAdmin(nuevoTicket);
    await responderCliente(nuevoTicket);
  }

  res.status(200).json({ exito: true, mensaje: 'Ticket registrado correctamente' });
});

// 9. RUTA PARA VER TODOS LOS TICKETS
app.get('/api/tickets', async (req, res) => {
  try {
    const lista = await Ticket.find().sort({ fecha: -1 });
    res.json(lista);
  } catch (error) {
    res.status(500).json({ error: 'No se pudieron cargar los tickets' });
  }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send(' DamARMAgent funcionando correctamente ✓💜');
});

// 10. INICIAR SERVIDOR
const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => console.log(`Servidor corriendo en http://localhost:${PUERTO}`));