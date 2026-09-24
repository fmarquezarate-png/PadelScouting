# Correos de la cuenta (Supabase)

Estos ajustes están en el panel de Supabase y no se pueden cambiar desde el código.
Proyecto: `etfsdoufdzibqlgpcdtx`.

## 1 · Adónde vuelve el enlace (lo que hacía que «se rompiera»)

Supabase tenía de fábrica **Site URL = `http://localhost:3000`**: tras confirmar, mandaba al
usuario a una dirección que solo existe en el ordenador de un programador.

Authentication → **URL Configuration**:

- **Site URL**: `https://padel-scouting.vercel.app`
- **Redirect URLs** → *Add URL*: `https://padel-scouting.vercel.app/**`

La app ya pide volver a la web (`redirect_to`), pero Supabase solo lo respeta si la dirección
está en *Redirect URLs*. Si no, usa la Site URL.

## 2 · El correo de confirmación en castellano

Authentication → **Emails** → **Confirm signup**:

- **Subject**: `Confirma tu cuenta de Padel Scouting 🎾`
- **Body**: pega el contenido de `confirmar-cuenta.html` (en modo *Source* si el editor lo ofrece).

## 3 · Opcional · que no lo firme «Supabase»

El remitente sigue siendo `Supabase Auth <noreply@mail.app.supabase.io>` y el servicio gratuito
envía pocos correos por hora. Para usar un remitente propio (p. ej. `Padel Scouting`) hay que
conectar un servidor de correo (Authentication → Emails → SMTP Settings), por ejemplo Resend,
que tiene plan gratuito. Se puede hacer más adelante.
