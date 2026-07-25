# Quagenticus - Sistema de gestión de requerimientos orientado a Agentes

> **Documento funcional.** El diseño técnico (arquitectura, modelo de datos, API, MCP) vive en [TECHNICAL-SPEC.md](TECHNICAL-SPEC.md), sobre los principios de [ARCHITECTURE.md](ARCHITECTURE.md).

## Introducción

Este documento describe el sistema de gestión de requerimientos orientado a Agentes.
El propósito de este documento consiste en plasmar el diseño de la solución desde el punto de vista del negocio y también desde un punto de vista técnico.
Actualmente existen diferentes aplicaciones opensource de gestión de requerimientos que funcionan correctamente y son robustas, no obstante, carecen de una funcionalidad crítica: la capacidad de facilitar la colaboración entre agentes para la resolución de requerimientos.
Quagenticus está orientado a facilitar el registro de requerimientos con un formato bastante familiar para los agentes de IA de programación, esto es: Markdown.
El propósito de Quagenticus es mantener las funcionalidades tradicionales de un sistema de gestión de requerimientos, con la capacidad añadida de que la descripción, escrita en markdown, incluya datos como la situación actual, los problemas a resolver y posibles soluciones. Para la integración con agentes, Quagenticus contará con un MCP que permitirá a los agentes:
1. Crear requerimientos.
2. Ingerir requerimientos existentes para su análisis.
3. Colaborar en la resolución de requerimientos.
4. Responder a preguntas sobre los requerimientos.
5. Actualizar el estado del requerimiento.
6. Realizar un análisis de impacto de los cambios propuestos.
7. Desarrollar la solución propuesta.
8. Testing.
9. Despliegue.
10. Cierre del requerimiento.

### Doble naturaleza: gestión de requerimientos y gestión documental

Quagenticus no es únicamente un sistema de gestión de requerimientos. Es también un **gestor de documentos markdown** en la línea de Marknote (KDE): cuadernos, notas, etiquetas, enlaces entre documentos, búsqueda y edición cómoda de markdown.

La razón no es acumular funcionalidades, sino que ambas cosas son el mismo problema. Un requerimiento bien escrito depende de documentación previa: decisiones de arquitectura, glosarios de dominio, especificaciones, actas de reunión. En las herramientas tradicionales esa documentación vive en otro sitio —una wiki aparte, un Confluence, una carpeta de ficheros— y el agente que debe resolver el requerimiento no la alcanza.

En Quagenticus **una nota y un requerimiento son el mismo objeto** con distinto grado de estructura:

| | Nota / Documento | Requerimiento |
|---|---|---|
| Contenido | Markdown libre | Markdown con secciones canónicas |
| Estado y flujo de trabajo | — | Sí |
| Solicitante y miembros | — | Sí |
| Aparece en el tablero | — | Sí |
| Reservable por un agente | No | Sí |
| Versionado, etiquetas, adjuntos, enlaces, búsqueda | Sí | Sí |

Las consecuencias prácticas:

- Una nota puede **promoverse a requerimiento** conservando su identidad, su historial, sus adjuntos y los enlaces que apuntan a ella.
- Un requerimiento puede **enlazar con `[[Decisión de arquitectura: colas]]`** y el agente que lo lea recibe también ese contexto.
- La búsqueda es única: un agente que pregunta "¿cómo funciona la autenticación?" encuentra tanto la documentación como los requerimientos relacionados.
- El editor, el versionado, el sistema de adjuntos y el motor de búsqueda se construyen **una sola vez**.

En síntesis: Quagenticus es un cruce entre Redmine y Marknote, con soporte nativo de markdown como formato de primera clase —no como campo de texto enriquecido— porque es el formato en el que los agentes de IA trabajan de forma natural.

### Principios de diseño

1. **El markdown es la fuente de verdad.** No hay una representación interna "real" distinta del texto que el usuario ve. Lo que se guarda es lo que se muestra y lo que el agente lee.
2. **Todo objeto es un documento.** Notas, wikis, plantillas y requerimientos comparten modelo, editor, historial y permisos.
3. **Los agentes son ciudadanos de primera clase, pero no autónomos.** Tienen identidad propia, permisos propios y su actividad queda registrada por separado. Siempre hay un humano responsable detrás.
4. **Nada se pierde.** Todo cambio queda versionado y toda acción queda en el historial, con la identidad de quién la hizo: persona, agente o sistema.
5. **La estructura ayuda, no obliga.** Las secciones canónicas guían la redacción, pero un encabezado no reconocido nunca se descarta.
6. **Self-hosted por defecto.** Los requerimientos de una organización contienen su estrategia técnica; deben poder vivir en su propia infraestructura.

## Conceptos básicos

### Requerimiento
 Un requerimiento o ticket, es un documento que representa la solicitud de un usuario para resolver un problema, realizar una tarea o efectuar una consulta. 

#### Descripción
La descripción de un requerimiento se estructura en varias secciones:
1. **Situación actual**: Descripción del estado actual de las cosas. Aquí el usuario explica el contexto.
2. **Problemas a resolver**: Descripción de los problemas que se pretenden resolver. Aquí el usuario explica lo que no funciona o podría funcionar mejor.
3. **Soluciones propuestas**: Descripción de las soluciones que se proponen para resolver los problemas. Aquí el usuario explica lo que querría que hiciera el sistema.
4. **Criterios de aceptación**: Criterios de aceptación del requerimiento. Aquí el usuario explica qué condiciones deben cumplirse para considerar resuelto el requerimiento.
5. **Consideraciones**: Consideraciones adicionales que el usuario considere relevantes para la resolución del requerimiento.

El requerimiento debe estar siempre escrito en markdown, permitiendo a los agentes de IA trabajar con él de forma natural.

El encabezado principal del requerimiento (el que en markdown se denota con un #) es el título del requerimiento. Debe ser conciso y claro, y debe reflejar el propósito del requerimiento.

Cada una de las secciones debe estar escrita en markdown, y debe ser lo suficientemente detallada para que los agentes de IA puedan entender el propósito del requerimiento y trabajar con él de forma natural.

Quagenticus podría facilitar distintos textarea para que el usuario escriba cada sección. No obstante, el usuario podría también pegar el markdown directamente en un solo textarea. En este caso, Quagenticus debería ser capaz de entender la estructura del requerimiento y separar las secciones de forma adecuada.

Aunque la información sea guardada en campos separados, el requerimiento se mostrará siempre como un bloque de markdown, con el formato descrito anteriormente. La edición del markdown directamente en el bloque también debería ser posible, aunque las secciones podrían mostrarse como elementos separados que el usuario podría editar individualmente, conservando el formato.

Existirá un MCP para que Agentes de IA puedan ingerir, analizar y desarrollar soluciones a los requerimientos. En un principio, Quagenticus estará orientado a la autogestión de requerimientos por parte de estos agentes. Por lo tanto, Quagenticus podría ofrecer una lista de requerimientos pendiente de resolución.

El trabajo de estos agentes como claude code, copilot o cualquier otro agente de IA debería quedar registrado en el historial del requerimiento. Además, estos agentes son human driven, por lo que Quagenticus debería ser capaz de ofrecer estos requerimientos a los agentes a medida que van quedando disponibles, o que el usuario le pida a un agente que tome un requerimiento específico para resolver. Por lo tanto, Quagenticus podría ofrecer una lista de requerimientos pendiente de resolución.

#### Estado

El estado indica en qué punto del ciclo de vida se encuentra un requerimiento. A diferencia de un gestor de tickets convencional, el conjunto de estados de Quagenticus distingue explícitamente el momento en el que un requerimiento **está listo para ser trabajado por un agente**, porque de esa distinción depende toda la automatización.

| Estado | Significado | Quién suele moverlo |
|--------|-------------|---------------------|
| **Nuevo** | Recién registrado. Nadie lo ha revisado todavía. | Solicitante |
| **Triado** | Revisado, priorizado y asignado a un espacio y, si procede, a un hito. | Responsable del espacio |
| **Listo** | Cumple la *Definition of Ready*: las secciones obligatorias están completas, los criterios de aceptación son verificables y no hay bloqueantes abiertos. **Es el único estado desde el que un agente puede reclamarlo.** | Sistema (al verificarse) o responsable |
| **En análisis** | Se está estudiando el impacto de los cambios propuestos. | Agente o persona |
| **En desarrollo** | Implementación en curso. | Agente o persona |
| **Requiere información** | Bloqueado a la espera de una respuesta del solicitante. Un agente que no puede continuar sin aclarar algo deja aquí su pregunta en lugar de asumir. | Agente o persona |
| **Bloqueado** | Detenido por una dependencia externa o por otro requerimiento sin cerrar. | Cualquiera |
| **En revisión** | Hay cambios propuestos pendientes de revisión humana. | Agente o persona |
| **En pruebas** | Validación funcional o QA. | Persona o agente |
| **Resuelto** | Implementado y verificado. Pendiente de aceptación por parte del solicitante. **Es el estado más avanzado al que puede llegar un agente por sí solo.** | Agente o persona |
| **Desplegado** | En producción. | Persona o agente con permiso de despliegue |
| **Cerrado** | Aceptado por el solicitante. Fin del ciclo. | Solicitante o responsable — **nunca un agente** |
| **Rechazado** | No se llevará a cabo. Requiere justificación. | Responsable del espacio |

Reglas del ciclo de vida:

- **Las transiciones son un grafo configurable, no una lista libre.** Cada tipo de requerimiento (*tracker*) define qué transiciones son legales, qué roles pueden ejecutarlas y si exigen comentario, responsable asignado o verificación de la *Definition of Ready*.
- **Un agente no cierra un requerimiento.** Puede llevarlo hasta *Resuelto*; la aceptación es una decisión del solicitante. Esto es coherente con el carácter *human driven* de los agentes.
- **Reabrir deja rastro.** Pasar de un estado cerrado a uno abierto incrementa un contador visible: un requerimiento reabierto tres veces está mal especificado, y el dato debe ser evidente.
- **Los estados tienen claves estables** (`new`, `triaged`, `ready`, …) independientes de su nombre visible, porque forman parte del contrato que consume el MCP. Renombrar "Listo" a "Preparado" no rompe a ningún agente.

##### Definition of Ready

Que un requerimiento esté en *Listo* no es una opinión: es el resultado de una verificación automática que el sistema recalcula en cada edición y que se muestra como un indicador con su desglose. Comprueba que:

1. Las secciones obligatorias existen y superan una longitud mínima.
2. Los criterios de aceptación están expresados como lista de tareas verificable (`- [ ] ...`), no como prosa.
3. No hay requerimientos bloqueantes abiertos.
4. Los agentes están habilitados en ese espacio y para ese tipo de requerimiento.

El indicador es útil también para las personas: expone la calidad de la especificación antes de que nadie empiece a trabajar. Un requerimiento que no supera la verificación es un requerimiento que un desarrollador humano tampoco podría abordar sin volver a preguntar.

#### Otros atributos

| Atributo | Descripción |
|----------|-------------|
| **Referencia** | Identificador legible y estable del tipo `QG-123`, formado por la clave del espacio y un contador. Es lo que las personas y los agentes citan en conversaciones, commits y otros documentos. |
| **Tipo** (*tracker*) | Error, funcionalidad, tarea, soporte… Determina las secciones obligatorias, el flujo de estados y si es elegible para agentes. |
| **Categoría** | Clasificación funcional dentro del espacio: *Backend*, *Interfaz*, *Infraestructura*, *Documentación*… Es un atributo propio del requerimiento, de valor único, definido por el administrador del espacio. |
| **Prioridad** | Baja, normal, alta, urgente, inmediata. Atributo propio del requerimiento, de valor único. Ordena la cola de trabajo de los agentes. |
| **Solicitante** | Persona que registra el requerimiento. Es quien acepta o rechaza el resultado. |
| **Miembros** | Personas y agentes que trabajan en el requerimiento. **Son varios**, no uno solo. Opcionalmente uno de ellos es el *responsable principal*. |
| **Etiquetas** | Marcadores de color, múltiples y transversales a documentos y requerimientos. Independientes de la categoría y de la prioridad. |
| **Hito** | Agrupación por versión o entrega. |
| **Fechas** | Inicio, vencimiento. |
| **Estimación e imputación** | Horas estimadas y horas dedicadas, imputables también por agentes. |
| **Posición en el tablero** | Orden manual dentro de su columna. Independiente de la prioridad: permite subir al tope lo que hay que hacer ahora. |
| **Relaciones** | Bloquea, bloqueado por, duplica, precede, especifica, implementa, relacionado con. |
| **Seguidores** | Personas o agentes que reciben notificaciones sin ser miembros. |

#### Miembros

En Redmine un ticket tiene un único asignado. En Quagenticus, como en Trello, **un requerimiento tiene varios miembros**: las personas y agentes que efectivamente trabajan en él. Una tarea puede llevarla una persona de backend y otra de frontend, o una persona supervisando a un agente.

Los miembros aparecen como avatares en la tarjeta del tablero y en la cabecera del requerimiento. Añadir o quitar miembros es una acción de un clic, sin pasar por un formulario.

Opcionalmente, uno de los miembros puede marcarse como **responsable principal**. No es obligatorio, pero existe por una razón concreta: sin nadie señalado, la responsabilidad se diluye y las notificaciones de vencimiento no tienen destinatario claro. El filtro "asignados a mí" incluye tanto los requerimientos donde soy responsable principal como aquellos en los que solo soy miembro, distinguiéndolos visualmente.

Cuando un agente reclama un requerimiento se añade a sí mismo como miembro. Al liberarlo, se retira. Su paso queda en el historial aunque ya no figure en la lista.

#### Etiquetas, categorías y prioridades

Son tres cosas distintas y conviene no confundirlas, porque cada una responde a una pregunta diferente:

| | Pregunta que responde | Cardinalidad | Ámbito |
|---|---|---|---|
| **Categoría** | ¿A qué parte del sistema pertenece? | Una sola | Definida por espacio |
| **Prioridad** | ¿Cuánto corre? | Una sola | Definida por cuenta |
| **Etiqueta** | ¿Qué más conviene saber de un vistazo? | Varias | Cuenta o espacio |

Las **etiquetas** son marcadores de color al estilo de Trello: un nombre corto y un color, configurables según haga falta. `bloqueante`, `deuda técnica`, `necesita diseño`, `cliente Acme`, `quick win`. Sirven para lo que no encaja en un campo estructurado y debe verse sin abrir la tarjeta.

Características:

- **Múltiples por requerimiento**, sin límite.
- **Transversales**: la misma etiqueta se aplica a notas y a requerimientos, de modo que `deuda técnica` agrupa tanto los tickets como los documentos de análisis.
- **Configurables**: nombre, color y ámbito los define el administrador. No hay un conjunto fijo impuesto.
- **Filtrables** en tablero, listado y búsqueda, y visibles como franjas de color en la tarjeta.
- **Accesibles**: el color nunca es el único portador de información. Las etiquetas muestran su nombre, y existe un modo de alto contraste con patrones además del color, porque una parte de los usuarios no distingue rojo de verde.

### Documento

Un documento es una unidad de contenido en markdown que vive dentro de un espacio y puede anidarse formando un árbol de carpetas, igual que un cuaderno de notas.

Un requerimiento **es** un documento —uno que además tiene estado, miembros, flujo de trabajo y presencia en el tablero—, por lo que todo lo que sigue aplica también a los requerimientos.

#### Tipos de documento

| Tipo | Uso |
|------|-----|
| **Carpeta** | Contenedor de organización. Puede tener contenido propio. |
| **Nota** | Contenido libre: apuntes, actas, borradores, investigación. |
| **Wiki** | Documentación de referencia del espacio. |
| **Plantilla** | Esqueleto reutilizable para crear notas o requerimientos. |
| **Requerimiento** | Documento con workflow. |

#### Capacidades comunes

- **Edición markdown** con vista dividida (fuente y previsualización), resaltado de sintaxis, tablas, listas de tareas, bloques de código, diagramas y fórmulas.
- **Historial de versiones** completo, con diferencias entre revisiones y restauración. Cada versión registra si la escribió una persona, un agente o el sistema.
- **Enlaces entre documentos** con la notación `[[Título]]`, y referencias directas a requerimientos escribiendo `QG-123`. Ambos generan **backlinks**: cada documento muestra qué otros documentos lo mencionan.
- **Etiquetas** compartidas entre notas y requerimientos.
- **Adjuntos e imágenes**: pegar una imagen en el editor la sube y la inserta automáticamente.
- **Búsqueda** de texto completo sobre todo el contenido, filtrable por tipo, espacio, etiqueta y estado.
- **Favoritos y recientes** para navegación rápida.
- **Importación y exportación**: importar una carpeta de ficheros `.md` conservando su estructura; exportar a markdown, HTML o PDF.
- **Plantillas** para crear documentos y requerimientos preformateados.

#### Promoción de una nota a requerimiento

El flujo natural de trabajo empieza informalmente. Alguien toma una nota durante una reunión, un agente redacta un hallazgo mientras investiga otra cosa, un usuario apunta una idea. Cuando esa nota merece convertirse en trabajo, se **promueve**: se le asigna un tipo, una prioridad y un solicitante, y pasa a tener estado y ciclo de vida.

Lo que **no** ocurre en una promoción: no se crea un objeto nuevo, no se copia el contenido, no se pierde el historial y no se rompen los enlaces que ya apuntaban a la nota. El documento sigue siendo el mismo; simplemente ha adquirido estructura.

### Espacio

Un espacio agrupa documentos y requerimientos. Es simultáneamente lo que en Redmine sería un *proyecto* y lo que en Marknote sería un *cuaderno* —una ambigüedad deliberada, porque en Quagenticus son la misma cosa.

Cada espacio define:

- Una **clave** corta (`QG`, `OPS`) que prefija las referencias de sus requerimientos.
- Qué **módulos** están activos: documentos, requerimientos, agentes.
- Sus **miembros** y el rol de cada uno.
- Sus **hitos**.

El módulo de agentes está **desactivado por defecto**. Habilitar agentes en un espacio es una decisión consciente de su administrador, no un estado inicial.

### Tablero

Un tablero muestra los requerimientos como tarjetas repartidas en columnas, al estilo de Trello. Es la vista principal de trabajo diario, complementaria al listado tabular.

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Listo     4  │ │ En curso  2/3│ │ En revisión 1│ │ Resuelto   3 │
├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤
│ ▐▐▐          │ │ ▐            │ │ ▐▐           │ │              │
│ QG-142       │ │ QG-118       │ │ QG-97        │ │ QG-88        │
│ Exportar a   │ │ Migrar cola  │ │ Corregir     │ │ Añadir …     │
│ PDF          │ │ de eventos   │ │ paginación   │ │              │
│ ⬆ Alta  ◔100 │ │ ⬆ Alta       │ │ ▪ Normal     │ │ ▪ Normal     │
│ 🖼️ 🤖         │ │ 🖼️ 🖼️ 🤖      │ │ 🖼️           │ │ 🖼️ 🤖         │
│ 💬3 📎1 ☑4/6  │ │ 💬7    ⏱️ 42m │ │ 💬2          │ │ 💬5          │
├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤
│ QG-151       │ │ QG-133       │ │              │ │ QG-79        │
│ …            │ │ …            │ │              │ │ …            │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
  ▐▐▐ etiquetas de color   ⬆ prioridad   ◔ Definition of Ready
  🖼️ miembros   🤖 agente activo   ⏱️ tiempo restante de reserva
```

#### Columnas

Las columnas se derivan de los **estados**. Un tablero no inventa un flujo paralelo: mover una tarjeta de columna **es** transicionar el requerimiento, con las mismas validaciones. Si una transición no es legal, el arrastre se rechaza y se explica por qué.

Como el catálogo de estados es más granular de lo que conviene ver en un tablero, una columna puede **agrupar varios estados**. Por ejemplo, una columna *En curso* que reúna *En análisis* y *En desarrollo*. Al soltar una tarjeta en una columna agrupada, el sistema aplica la primera transición legal disponible, o pregunta si hay varias.

Cada columna puede tener un **límite de trabajo en curso** (WIP). Superarlo no bloquea, pero marca la columna visualmente: es un aviso, no una barrera.

#### Orden manual

Dentro de cada columna, las tarjetas se ordenan por una **posición manual** que se cambia arrastrando. Esto es lo que permite subir al tope lo que hay que hacer ahora.

La posición es **independiente de la prioridad**, y esa independencia es deliberada. La prioridad describe la importancia intrínseca del requerimiento; la posición describe la decisión del equipo sobre el orden de trabajo de esta semana. Un requerimiento de prioridad normal puede estar arriba porque desbloquea a otra persona, sin que eso obligue a mentir sobre su prioridad. Fusionar ambos conceptos es lo que lleva a que todo acabe siendo "urgente".

Reglas:

- El orden manual se conserva al cambiar de columna. Si algo estaba arriba en *Listo*, aparece arriba en *En curso*. La posición expresa una decisión sobre el orden de trabajo, y esa decisión no caduca al avanzar de estado.
- El orden es **único por requerimiento**, no por tablero. Reordenar en el tablero general reordena también en el tablero del espacio. Hay una sola respuesta a "¿qué va primero?".
- Cuando un agente transiciona un requerimiento, la tarjeta se mueve de columna conservando su posición. Nunca salta al tope por el mero hecho de haber tenido actividad.
- El orden por defecto de una tarjeta recién creada es el final de su columna.

#### Tablero de espacio y tablero general

| | Tablero de espacio | Tablero general |
|---|---|---|
| Alcance | Un espacio | Todos los espacios visibles para el usuario |
| Columnas | Estados del espacio | Estados comunes; los específicos se agrupan en *Otros* |
| Uso | Trabajo del equipo | Vista personal transversal: "qué tengo entre manos" |
| Referencia | `QG-142` | `QG-142` con distintivo del espacio |

El tablero general resuelve el problema de quien participa en varios espacios y no quiere abrir cuatro pestañas. Su agrupación por defecto no es el espacio sino el estado, precisamente para responder "¿qué tengo en revisión, esté donde esté?".

#### Configuración y filtros

Un tablero es una configuración guardada y compartible: qué columnas, qué estados agrupa cada una, qué filtros aplica y cómo agrupa las filas.

- **Filtros**: espacio, tipo, categoría, prioridad, etiquetas, miembros, hito, vencimiento, preparación para agentes.
- **Carriles** (*swimlanes*) opcionales: agrupar horizontalmente por hito, categoría, responsable o etiqueta.
- **Vistas guardadas**: "Mi semana", "Bloqueados", "Listos para agente", compartibles con el equipo.
- **Tablero de agentes**: variante con las columnas orientadas al ciclo del agente, mostrando reservas activas con su cuenta atrás.

Toda vista de tablero tiene su equivalente en el listado tabular y en la API, con los mismos filtros. El tablero es una forma de mirar los datos, no un subsistema aparte.

### Roles y permisos

| Rol | Puede |
|-----|-------|
| **Observador** | Leer documentos y requerimientos |
| **Colaborador** | Además: comentar, crear y editar documentos, crear requerimientos, transicionar los propios |
| **Mantenedor** | Además: editar y transicionar requerimientos de terceros, archivar, gestionar hitos |
| **Administrador** | Además: gestionar miembros, tipos, flujos de estado y habilitar agentes |

Los agentes se rigen por la misma matriz: un agente es miembro de un espacio con un rol. Su permiso efectivo es la intersección de ese rol con los permisos concedidos a su credencial. Ninguna de las dos vías puede ampliar a la otra.

## Agentes

### Identidad

Un agente es una identidad de primera clase en el sistema, no una API key anónima. Tiene nombre, tipo (`claude-code`, `copilot`, propio), capacidades declaradas, pertenencia a espacios y —obligatoriamente— un **usuario humano responsable**.

Toda escritura realizada por un agente queda registrada como tal: nunca se atribuye a la persona responsable. En el historial de un requerimiento se distingue con claridad qué escribió una persona y qué escribió un agente, y en qué sesión.

### Cómo llega el trabajo a un agente

Dos caminos, ambos human driven:

1. **Asignación explícita.** Un usuario le pide a su agente que tome `QG-142`. El agente lo reclama por referencia.
2. **Cola de disponibles.** El agente pide "el siguiente requerimiento disponible" y el sistema le entrega el de mayor prioridad entre los que cumplen la *Definition of Ready*, están en estado *Listo*, no tienen bloqueantes abiertos y pertenecen a espacios donde ese agente es miembro.

En ambos casos existe también una vista de cola para las personas: qué hay disponible, con qué prioridad y con qué nivel de preparación.

### Reserva con caducidad

Cuando un agente toma un requerimiento no lo bloquea indefinidamente: adquiere una **reserva con vencimiento** que debe ir renovando mientras trabaja. Si el agente se detiene, falla o simplemente desaparece, la reserva expira y el requerimiento vuelve solo a la cola, con la incidencia anotada en su historial.

Esto resuelve el problema práctico de los agentes: son procesos que pueden interrumpirse a mitad de trabajo, y un sistema que asuma lo contrario acumula tickets atascados. Dos agentes concurrentes nunca reciben el mismo requerimiento.

### Actividad registrada

El agente reporta su avance mediante eventos tipados que se integran en la misma línea de tiempo que los comentarios humanos:

| Evento | Contenido |
|--------|-----------|
| `analysis` | Análisis del requerimiento |
| `impact` | Análisis de impacto de los cambios propuestos |
| `plan` | Plan de implementación |
| `patch` | Cambios realizados, con referencia al commit o PR |
| `test_run` | Resultado de la ejecución de pruebas |
| `deploy` | Despliegue realizado |
| `question` | Pregunta al solicitante (pasa el requerimiento a *Requiere información*) |
| `error` | Fallo encontrado que impide continuar |

Al cerrar la sesión se registran métricas: tokens consumidos, coste y duración. Con ello el sistema puede responder preguntas que hoy nadie puede responder: cuánto cuesta resolver un requerimiento, qué tipos de requerimiento resuelven bien los agentes y cuáles acaban reabiertos.

### Límites deliberados

- Un agente **no puede cerrar** un requerimiento. Llega hasta *Resuelto*; la aceptación es humana.
- Un agente **no puede administrar** espacios, roles, flujos ni otros agentes.
- Un agente **no puede ampliar sus propios permisos**, ni aunque el contenido de un documento se lo indique. El contenido de los documentos es texto no confiable y el sistema lo trata como tal.
- Los agentes están **desactivados por defecto** en cada espacio.

## Fuera de alcance

- La lógica interna de los agentes. Quagenticus expone el MCP y el modelo de datos; cómo razona o implementa cada agente es problema suyo.
- La edición colaborativa simultánea en tiempo real sobre el mismo documento. Se resuelve con bloqueo blando y control de versiones.
- El alojamiento de código. Quagenticus enlaza con repositorios y PR; no los reemplaza.

