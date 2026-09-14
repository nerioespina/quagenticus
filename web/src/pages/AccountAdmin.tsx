import { useSearchParams, Navigate } from 'react-router-dom';
import { Tabs } from '../components/ui/misc';
import UsersAdmin from '../components/admin/UsersAdmin';
import { AgentsAdmin, PrioritiesAdmin, StatusesAdmin, TrackersAdmin, TransitionsAdmin } from '../components/admin/WorkflowAdmin';
import { useAuth } from '../lib/auth';

type Tab = 'users' | 'statuses' | 'transitions' | 'trackers' | 'priorities' | 'agents';

export default function AccountAdmin() {
  const user = useAuth((s) => s.user);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'users';
  if (user && !user.is_account_admin) return <Navigate to="/" replace />;
  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-4">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">Administración de la cuenta</h2>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'users', label: 'Usuarios' },
          { id: 'statuses', label: 'Estados' },
          { id: 'transitions', label: 'Flujo de trabajo' },
          { id: 'trackers', label: 'Tipos' },
          { id: 'priorities', label: 'Prioridades' },
          { id: 'agents', label: 'Agentes' },
        ]}
      />
      {tab === 'users' && <UsersAdmin />}
      {tab === 'statuses' && <StatusesAdmin />}
      {tab === 'transitions' && <TransitionsAdmin />}
      {tab === 'trackers' && <TrackersAdmin />}
      {tab === 'priorities' && <PrioritiesAdmin />}
      {tab === 'agents' && <AgentsAdmin />}
    </div>
  );
}
