import { useState } from 'react';
import { Page } from '@/components/AppShell';
import { SearchBox, ToolGrid } from '@/components/ToolPicker';

export default function ToolsPage() {
  const [q, setQ] = useState('');
  return (
    <Page title="Alat">
      <div className="space-y-4">
        <SearchBox value={q} onChange={setQ} />
        <div className="-mx-2">
          <ToolGrid query={q} columns="grid-cols-1 sm:grid-cols-2" />
        </div>
      </div>
    </Page>
  );
}
