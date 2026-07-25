# Quagenticus - Sistema de gestión de requerimientos orientado a Agentes

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


