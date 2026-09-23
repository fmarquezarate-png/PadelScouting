# Brief · La pista realista (portada de Padel Scouting)

**Para:** diseñador/a 3D o de ilustración
**Qué es:** la portada de una app web de scouting de pádel del Club Tennis El Molí. La pista **es el
menú**: cada zona de la pista abre una sección de la app.
**Referencia de estilo:** `referencia-pista-fran.webp`, en esta misma carpeta. Ese es el ambiente que
buscamos. **Ojo:** la referencia trae textos, iconos y una barra superior pintados; la entrega
**no** debe llevar nada de eso (ver punto 3).

---

## 1. Qué hay que entregar

| Archivo | Uso | Tamaño | Formato |
|---|---|---|---|
| `pista-web.webp` + `pista-web.jpg` | Ordenador y tablet horizontal | **2880 × 1620 px** (16:9) | WebP calidad 80 (< 450 KB) y JPG de respaldo |
| `pista-movil.webp` + `pista-movil.jpg` | Móvil en vertical | **1170 × 2080 px** (9:16) | Igual |
| `zonas.json` | Dónde cae cada zona en cada imagen | ver punto 5 | JSON o una tabla en PDF/Excel |
| *(opcional)* `pista-web-frente.png`, `pista-movil-frente.png` | Capa delantera (cristal y valla cercanos) para poner los botones «dentro» de la pista | mismos tamaños | PNG con transparencia |

Son dos encuadres del **mismo** render: no hace falta que sean la misma cámara, pero sí la misma
escena, luz y colores.

## 2. La escena

- **Pista de pádel reglamentaria**: 10 × 20 m, **superficie azul** (familia `#1D4F8C` → `#173E70`),
  líneas blancas nítidas: fondo, laterales, línea de saque a 6,95 m de la red y línea central.
- **Cerramiento**: cristal en los fondos (3 m) y en los primeros tramos laterales; malla negra en el
  resto; postes negros mate.
- **Red** en el centro, con la cinta blanca bien visible.
- **Noche**: focos cálidos (unos 3000 K) en las cuatro esquinas, con halos suaves y charcos de luz
  sobre la pista. El resto, penumbra.
- **Entorno**: vegetación y setos oscuros alrededor, balizas cálidas en el suelo, un banco. Sin gente.
- **Lona del club** en el cristal del fondo lejano, centrada: escudo (`assets/logo.png` del
  repositorio, se adjunta) + «CLUB TENNIS / EL MOLÍ». Es el único texto permitido en la imagen.
- **La puerta**: en el centro de la valla cercana, un hueco o puerta abierta. Delante de ella irá
  el botón **«El rival»**, así que el suelo frente a la puerta tiene que quedar despejado y algo
  iluminado.
- **Nada de marcas de terceros.** Los lemas de la referencia («Play · Improve · Belong», «Same
  game, higher people») son opcionales: si se incluyen, que sean discretos y legibles.

## 3. Lo que NO debe llevar la imagen

- **Ningún texto, icono, botón ni número** sobre la pista (Crónica, Análisis, La liga…): la app los
  pinta encima, porque cambian con los datos (puesto, balance, competición).
- **Ninguna barra de menú**: la app tiene su propia barra arriba.
- La pelota tampoco: la app la anima.

## 4. Encuadre y zonas libres

**Web (16:9):** cámara detrás del fondo cercano, elevada unos **35°**, como en la referencia. La
pista centrada y ancha: la línea de fondo cercana ocupa ~65 % del ancho de la imagen.
- **Arriba**, los primeros 80 px (a 2880 de ancho) quedan tapados por la barra de la app: nada
  importante ahí.
- **Tercio izquierdo** (0–22 % del ancho), más oscuro y tranquilo: ahí va el marcador (nombres,
  puesto #50, forma).
- **Abajo** (últimos 15 %): la puerta y espacio para el botón «El rival» con su rótulo.

**Móvil (9:16):** cámara más alta, unos **60°**, con la pista **en vertical** llenando el ancho
(márgenes laterales de ~6 %). El marcador va **encima** de la imagen, no sobre ella, así que la
pista puede empezar casi arriba. Abajo, igual que en la web: puerta y espacio para «El rival».

## 5. Las 7 zonas (lo más importante para que funcione)

La pista se divide en **3 columnas × 2 mitades**, más la puerta:

| Zona | Mitad | Columna | Sección que abre |
|---|---|---|---|
| `cronica` | lejana (detrás de la red) | izquierda | Crónica |
| `analisis` | lejana | centro | Análisis |
| `registro` | lejana | derecha | Registrar |
| `liga` | cercana | izquierda | La liga |
| `historial` | cercana | centro | Historial |
| `temporada` | cercana | derecha | Nuestra temporada |
| `rival` | fuera, frente a la puerta | — | El rival |

Para cada imagen necesito, **en porcentaje del ancho y del alto** (0–100, origen arriba a la
izquierda):
- las **4 esquinas** de cada zona de la pista, que es lo que el dedo puede tocar;
- el **punto central** donde irá el botón.

Ejemplo del formato:

```json
{
  "web": {
    "cronica":  { "centro": [41.0, 33.5], "esquinas": [[37.5,27.0],[46.0,27.0],[45.2,43.5],[35.8,43.5]] },
    "rival":    { "centro": [50.0, 87.0] }
  },
  "movil": { "...": "igual para las 7 zonas" }
}
```

Si trabajas en 3D (Blender, C4D…), basta con pasar la **cámara** (posición, rotación y distancia focal):
con eso calculo yo las zonas.

## 6. Paleta de la app (para que la imagen case)

| Token | Color | Uso |
|---|---|---|
| Tinta | `#0E1109` | fondo de la app |
| Panel | `#161B12` | tarjetas |
| Hueso | `#EDEBE3` | textos |
| Salvia | `#8FA678` | acentos verdes |
| **Naranja** | `#ED6C05` | acento principal: botones, pelota |
| Ladrillo | `#B4491F` | derrotas |
| Pista | `#1D4F8C` → `#173E70` | superficie |

El naranja de la app tiene que destacar sobre la imagen: evita naranjas intensos en la escena.

## 7. Cómo se comprueba que está bien

1. Sin ningún texto, icono ni botón pintado (salvo la lona del club).
2. Las líneas de la pista se ven nítidas en el móvil.
3. Las 7 zonas del `zonas.json` caen donde toca (las superpongo y te mando captura).
4. Cada WebP pesa menos de 450 KB.
5. En el móvil, «El rival» y su rótulo caben abajo sin cortarse.

Cualquier duda sobre encuadre o zonas, mejor preguntarla antes de renderizar.
