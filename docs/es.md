# Spoolman

Siga sus bobinas de filamento de impresión 3D en Gladys a través de
[Spoolman](https://github.com/Donkie/Spoolman), el inventario de filamento
autoalojado: peso y longitud restantes de cada bobina, stock de cada
material, consumo de una impresión y consumo registrado a mano. Todo
permanece en su red local: Gladys habla directamente con Spoolman.

Spoolman actualiza Gladys **en directo**: en cuanto Klipper (Moonraker),
OctoPrint o la página web de Spoolman modifica una bobina, sus valores
cambian en Gladys.

Probada con un Spoolman 0.27.0 real (su imagen Docker oficial). Sus
comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.2 o posterior (el formulario del widget lo necesita).
- Un servidor Spoolman accesible desde la máquina de Gladys, en el puerto
  7912 por defecto, o detrás de un proxy inverso.
- Para seguir las impresiones automáticamente: una impresora que comunique
  su consumo a Spoolman, como Klipper con la sección `[spoolman]` de
  Moonraker, u OctoPrint con su complemento Spoolman. Si no, registre el
  consumo con la acción de escena o el widget.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de Spoolman**, introduzca la dirección IP del servidor,
   por ejemplo `192.168.1.50`: la integración usa entonces el puerto 7912.
   Añada el puerto si es otro (`192.168.1.50:8000`). Detrás de un proxy
   inverso, introduzca la dirección completa, subruta incluida
   (`https://example.org/spoolman`).
3. Spoolman no tiene inicio de sesión propio. Si su proxy pide credenciales,
   rellene **Usuario del proxy** y **Contraseña del proxy** (HTTP Basic), o
   una **Cabecera HTTP adicional** escrita `Nombre: valor` (un token).
4. **Un dispositivo de stock por material** (activado por defecto) añade un
   dispositivo por material (PLA, PETG...) con su peso total restante.
5. **Idioma de nombres y mensajes** fija los nombres de las funciones (al
   añadir el dispositivo) y los textos. Francés por defecto.
6. Guarde y use **Probar la conexión**: muestra la versión de Spoolman, el
   número de bobinas en uso y el estado de las actualizaciones en directo.
7. En la pestaña **Descubrir**, añada las bobinas y los stocks que desee
   seguir.

## Dispositivos

**Una bobina** (una por bobina en uso, con el nombre de su fabricante,
filamento y material, y su número de Spoolman:
`Prusament Galaxy Black PLA #1`):

| Función           | Valor                                           |
| ----------------- | ----------------------------------------------- |
| Peso restante (g) | gramos de filamento restantes                   |
| Restante          | porcentaje restante, respecto al peso inicial   |
| Peso usado (g)    | gramos usados desde el registro de la bobina    |
| Longitud restante | metros de filamento restantes                   |
| Último uso        | fecha y hora del último consumo, o «Nunca»      |
| Estado            | «En uso», «Archivada» o «Eliminada en Spoolman» |

La ubicación, el color y el número de la bobina están en los parámetros del
dispositivo. Una bobina cuyo filamento no tiene peso en Spoolman no publica
ni peso restante ni porcentaje: indique el peso del filamento en Spoolman.

**Un stock** (`Stock PLA`): el peso total restante (g) y el número de
bobinas en uso de un material.

Una bobina archivada sale de la pestaña Descubrir; si se añadió a Gladys, su
dispositivo permanece y muestra «Archivada». Elimínelo en Gladys cuando ya
no necesite su historial.

## Widget del panel

**Bobinas de filamento**: tres mosaicos (stock total en kg, número de
bobinas, número de bobinas bajas), la lista de las bobinas que se agotan
antes con su peso restante, ubicación y porcentaje (verde, naranja por
debajo del umbral, rojo por debajo de su mitad), y un botón **Consumo**:
abre un formulario (bobina, cantidad, gramos o metros) y registra el consumo
en Spoolman.

Ajustes: un material (`PLA`) y una ubicación de Spoolman para filtrar la
lista, y el porcentaje por debajo del cual una bobina está baja (20 % por
defecto).

## Disparadores de escena

- **Filamento consumido**: una bobina ha perdido peso en Spoolman (una
  impresión comunicada por la impresora), cuando el consumo lleva 2 minutos
  detenido: una impresión completa da un solo evento. Filtro opcional: la
  bobina. Variables: nombre de la bobina, material, ubicación, gramos
  consumidos, gramos restantes, porcentaje restante. Un consumo registrado
  por la propia integración (acción de escena, widget) no lo dispara.
- **Bobina archivada**: una bobina se ha archivado en Spoolman
  (normalmente: está vacía). Filtro opcional: la bobina. Variables: nombre
  de la bobina, material, ubicación.

Un umbral («menos de 100 g») no necesita un disparador especial: use el
disparador estándar **Cambio de estado del dispositivo** sobre el peso
restante o el porcentaje de una bobina, o sobre el peso restante de un
stock.

## Acciones de escena

**Registrar un consumo de filamento**: resta una cantidad (en gramos o
metros) de una bobina en Spoolman, para una impresora que no lo comunica
(por ejemplo al final de una impresión anunciada por otra integración).
Salidas: gramos restantes, porcentaje restante.

## Ejemplos de escenas

- **Pedir filamento antes de que se acabe**: disparador «Cambio de estado
  del dispositivo», peso restante de `Stock PETG` por debajo de 500 → enviar
  el mensaje «Quedan menos de 500 g de PETG».
- **Bobina casi vacía**: disparador «Cambio de estado del dispositivo», peso
  restante de una bobina por debajo de 100 → mensaje «Bobina casi vacía:
  pida una nueva».
- **Balance de impresión**: disparador **Filamento consumido** → un mensaje
  con sus variables: gramos consumidos, nombre de la bobina, gramos
  restantes.
- **Una impresora sin Spoolman**: disparador «impresión terminada» de su
  integración → acción **Registrar un consumo de filamento** sobre la bobina
  cargada.

## Solución de problemas

- **«Spoolman no responde»**: compruebe la dirección y el puerto (7912 con
  la imagen Docker oficial, 8000 dentro del contenedor), y que la máquina de
  Gladys lo alcance.
- **«Acceso denegado (401)» o «(403)»**: su proxy rechaza las credenciales o
  la cabecera. Spoolman solo responde 403 a una petición procedente de otro
  sitio web (un navegador): la integración no envía ninguna.
- **«No responde como Spoolman»**: la dirección lleva a una página de acceso
  o a otro servicio. Con una subruta, introdúzcala completa.
- **Una bobina no tiene peso restante**: su filamento no tiene peso en
  Spoolman.
- Más detalles en los registros de la integración (`LOG_LEVEL=debug` para
  cada actualización).

## Límites

- Un solo servidor Spoolman.
- Gladys no tiene unidad de gramos: los pesos llevan «(g)» en su nombre.
- Una integración no puede elegir la habitación de un dispositivo:
  asígnela en Gladys. La ubicación de Spoolman está en los parámetros del
  dispositivo y filtra el widget.
- Spoolman reutiliza el número de la última bobina cuando se elimina
  (SQLite): una bobina nueva puede entonces ocupar su dispositivo de Gladys.
- Las actualizaciones en directo necesitan que el WebSocket atraviese su
  proxy; si no, la integración lee Spoolman cada 5 minutos.
- Un cambio de filamento o de fabricante vuelve a leer toda la lista
  (Spoolman no envía actualización de las bobinas afectadas).
