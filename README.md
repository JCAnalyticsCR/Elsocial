# el Social — maqueta de branding page

Propuesta visual de sitio para **el Social**, bar y restaurante de San José con sedes en
Sabana y Morazán. Es una **maqueta de diseño 100 % front-end**, preparada por JC Analytic
como parte de una cotización.

> **Esto no es el sitio oficial de el Social.** Es una demostración de diseño. Las reseñas son
> de muestra, los teléfonos y el correo son de relleno, y el formulario de reserva no envía
> datos a ningún lado. Si busca el negocio real, escríbales directamente.

## Qué hay dentro

| Ruta | Qué es |
| --- | --- |
| `index.html` | La página completa: una sola plantilla, sin framework. |
| `assets/css/` | `style.css` con los tokens de marca y los componentes, más hojas de refinamiento (`brand-details`, `brand-motion`, `desktop-editorial`, `image-context`, `mobile-premium`). Sin dependencias. |
| `assets/js/` | Microinteracciones en JS vanilla: `main.js` (header pegajoso, scrollspy, menú móvil, pestañas, visor de galería, validación del formulario, relevo de fotografías del hero) y los módulos de movimiento y de vista de escritorio. |
| `assets/images/` | Fotografía y piezas de campaña reales de el Social, más las cartas. |
| `serve.mjs` | Servidor estático de cero dependencias para verla en local. |
| `audit/` | Revisión de cada imagen: qué muestra y dónde se usa. |
| `test_*.mjs` | Tres suites automatizadas (ver abajo). |

No hay backend, base de datos, autenticación ni integraciones. Todo corre en el navegador.

## Verla en local

```bash
node serve.mjs
```

Queda en <http://localhost:8000>. Acepta un puerto como argumento (`node serve.mjs 3000`) o por
la variable `PORT`. Requiere Node 18 o superior; no hay nada que instalar.

## Pruebas

Tres suites, todas contra un servidor efímero propio y un Chrome sin interfaz:

```bash
node test_e2e.mjs
node test_adversarial.mjs
node test_adversarial_preview_2.mjs
```

Buscan Chrome en la ruta por defecto de Windows. En otro sistema operativo hay que indicarla:

```bash
CHROME_BIN=/usr/bin/google-chrome node test_e2e.mjs
```

Cubren tokens de marca, integridad de cada imagen en disco y por HTTP, accesibilidad,
desbordes horizontales en nueve anchos de pantalla, resistencia del formulario a XSS y
cero errores de consola en tiempo de ejecución.

## Contenido de marca

Las fotografías, los afiches de campaña y las cartas son material real de el Social. Los datos
que aparecen en la página y que salen de sus propias piezas:

- Sede Morazán: costado este del Parque Morazán (afiche del Tablazo).
- 1897, el año de la esquina (afiche propio).
- Sábados hasta las 5 a.m. (campaña «Sabadito alegre»).
- Precios de cocteles y birras, tomados de las cartas.

## Pendiente de confirmar con el cliente

- Dirección exacta de la sede Sabana.
- Cuál fotografía de fachada corresponde a cada sede.
- Horarios completos de cada sede.
- Teléfonos, WhatsApp y correo reales.
- Vigencia de los precios de las cartas.

Las reseñas y los datos de contacto actuales son de muestra y deben reemplazarse antes de
cualquier publicación real.
