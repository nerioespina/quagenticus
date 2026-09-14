// Centralized labels for enums and domain terms (single place to translate).
export const ROLE_LABELS: Record<string, string> = {
  viewer: 'Lector', contributor: 'Colaborador', maintainer: 'Mantenedor', admin: 'Administrador',
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  folder: 'Carpeta', note: 'Nota', wiki: 'Wiki', requirement: 'Requerimiento', template: 'Plantilla',
};

export const LINK_TYPE_LABELS: Record<string, string> = {
  relates: 'Se relaciona con', duplicates: 'Duplica a', duplicated_by: 'Duplicado por',
  blocks: 'Bloquea a', blocked_by: 'Bloqueado por', precedes: 'Precede a', follows: 'Sigue a',
  parent_of: 'Padre de', child_of: 'Hijo de', specifies: 'Especifica', specified_by: 'Especificado por',
  implements: 'Implementa', implemented_by: 'Implementado por', wikilink: 'Enlaza a', linked_from: 'Enlazado desde',
  mentions: 'Menciona a', mentioned_in: 'Mencionado en',
};

export const ATTRIBUTE_LABELS: Record<string, string> = {
  title: 'el título', body_md: 'la descripción', tracker_id: 'el tipo', priority_id: 'la prioridad',
  category_id: 'la categoría', milestone_id: 'el hito', parent_id: 'el requerimiento padre',
  done_ratio: 'el avance', estimated_hours: 'la estimación', spent_hours: 'las horas invertidas',
  start_date: 'la fecha de inicio', due_date: 'la fecha límite', status_id: 'el estado',
};

export const EVENT_LABELS: Record<string, string> = {
  member_added: 'te asignó a', assigned_lead: 'te nombró responsable de', mentioned: 'te mencionó en',
  commented: 'comentó en', status_changed: 'cambió el estado de', attachment_added: 'adjuntó un archivo en',
  due_soon: 'vence pronto:', due_overdue: 'está vencido:', due_date_changed: 'cambió la fecha límite de',
  agent_claimed: 'tomó', agent_released: 'liberó',
};

export const TERMS = {
  tracker: 'Tipo',
  lead: 'Responsable',
  dor: 'Definition of Ready',
  milestone: 'Hito',
};
